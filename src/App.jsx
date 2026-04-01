import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { supabase } from './lib/supabase'
import titansLogo from './assets/titans-logo.png'
import titansJerseyBack from './assets/titans-jersey-back.png'
import LiveScoreboard from './components/LiveScoreboard'
import CourtLayout from './components/CourtLayout'
import SelectedPlayerDock from './components/SelectedPlayerDock'
import BottomDrawer from './components/BottomDrawer'
import MatchDetailView from './components/MatchDetailView'

const STORAGE_KEYS = {
  homeTeam: 'basketball_home_team_v11',
  savedMatches: 'basketball_saved_matches_v11',
  currentMatch: 'basketball_current_match_v11',
  homeCoachName: 'basketball_home_coach_name_v11',
}

const HOME_TEAM_COLOR = '#7b1e2b'
const HOME_TEAM_SECONDARY_COLOR = '#c8a24a'
const DEFAULT_AWAY_COLOR = '#ef4444'
const DEFAULT_AWAY_SECONDARY_COLOR = '#fca5a5'
const DEFAULT_HOME_COACH_NAME = ''
const DEFAULT_AWAY_COACH_NAME = ''
const COACH_FOUL_LIMIT = 3
const COURT_WIDTH_UNITS = 280
const COURT_HEIGHT_UNITS = 150
const BASKET_X_FROM_BASELINE = 15.75
const BASKET_Y_UNITS = 75
const THREE_POINT_RADIUS_UNITS = 67.5
const THREE_POINT_SIDE_OFFSET_UNITS = 9
const COURT_LEFT_BASKET = { x: 6.5, y: 50 }
const COURT_RIGHT_BASKET = { x: 93.5, y: 50 }
const FOUL_TYPE_CONFIG = {
  personal: {
    label: 'Personal',
    description: 'Counts as a team foul. Can award 0-3 free throws depending on the play.',
    freeThrows: [0, 1, 2, 3],
  },
  offensive: {
    label: 'Offensive',
    description: 'Counts as a team foul. No free throws awarded.',
    freeThrows: [0],
  },
  unsportsmanlike: {
    label: 'Unsportsmanlike',
    description: 'Counts as a team foul. Awards 1-2 free throws and the other team keeps the ball.',
    freeThrows: [1, 2],
  },
  disqualifying: {
    label: 'Disqualifying',
    description: 'Counts as a team foul. Awards 1-2 free throws.',
    freeThrows: [1, 2],
  },
  technical: {
    label: 'Technical',
    description:
      'Player technicals count as team fouls. Coach or bench technicals go on the coach and do not count as team fouls.',
    freeThrows: [1, 2, 3],
  },
}

const TURNOVER_CATEGORY_CONFIG = {
  passing: {
    label: 'Passing',
    description: 'Bad pass, intercepted pass, or a pass thrown away.',
    asksSteal: true,
  },
  ballHandling: {
    label: 'Ball Handling',
    description: 'Lost ball, dribble control issue, or stripped while handling.',
    asksSteal: true,
  },
  violation: {
    label: 'Violation',
    description: 'Travelling, double dribble, time violations, backcourt, or out of bounds.',
    asksSteal: false,
  },
  offensiveFoul: {
    label: 'Offensive Foul',
    description: 'Player control foul resulting in a turnover.',
    asksSteal: false,
  },
}

const TURNOVER_VIOLATION_OPTIONS = [
  { id: 'travel', label: 'Travel' },
  { id: 'doubleDribble', label: 'Double Dribble' },
  { id: 'threeSeconds', label: '3 Seconds' },
  { id: 'fiveSeconds', label: '5 Seconds' },
  { id: 'eightSeconds', label: '8 Seconds' },
  { id: 'twentyFourSeconds', label: '24 Seconds' },
  { id: 'backcourt', label: 'Backcourt' },
  { id: 'outOfBounds', label: 'Out Of Bounds' },
  { id: 'otherViolation', label: 'Other Violation' },
]

function createEmptyFoulModal() {
  return {
    open: false,
    step: 'type',
    foulerTeamKey: '',
    foulerId: '',
    chargedEntity: 'player',
    actorScope: 'all',
    foulType: '',
    fouledPlayerId: '',
    freeThrowCount: 0,
    freeThrowShooterId: '',
  }
}

function getCoachFoulerId(teamKey) {
  return `${teamKey}_coach_foul`
}

function getCoachDisplayName(name) {
  return name?.trim() || 'Coach not set'
}

function getAllowedFoulTypes(chargedEntity) {
  if (chargedEntity === 'coach' || chargedEntity === 'bench') {
    return ['technical']
  }

  return ['personal', 'offensive', 'unsportsmanlike', 'disqualifying', 'technical']
}

function foulRequiresFouledPlayer(foulType, chargedEntity) {
  if (chargedEntity !== 'player') return false
  return ['personal', 'unsportsmanlike', 'disqualifying'].includes(foulType)
}

function foulCountsAsTeamFoul(foulType, chargedEntity) {
  if (chargedEntity === 'coach' || chargedEntity === 'bench') return false
  if (foulType === 'technical' && chargedEntity !== 'player') return false
  return true
}

function getCoachFoulCount(events, teamKey) {
  return events.filter(
    (evt) =>
      evt.type === 'foul' &&
      evt.teamKey === teamKey &&
      (evt.chargedEntity === 'coach' || evt.chargedEntity === 'bench')
  ).length
}

function getPlayerFoulTypeCount(events, teamKey, playerId, foulType) {
  return events.filter(
    (evt) =>
      evt.type === 'foul' &&
      evt.teamKey === teamKey &&
      evt.foulerId === playerId &&
      evt.chargedEntity === 'player' &&
      evt.foulType === foulType
  ).length
}

function getFoulActorLabel(match, teamKey, evt) {
  const team = match[teamKey]

  if (evt.chargedEntity === 'coach') {
    return `${team.name} coach`
  }

  if (evt.chargedEntity === 'bench') {
    return `${team.name} bench (charged to coach)`
  }

  const player = findPlayerById(team.players, evt.foulerId)
  return formatPlayer(player)
}

function createPlayer(name, number) {
  return {
    id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim(),
    number: number.trim(),
  }
}

function createEvent(base) {
  return {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    ...base,
  }
}

function formatPlayer(player) {
  if (!player) return ''
  return `${player.name} (#${player.number})`
}

function getDisplayName(player) {
  if (!player) return ''
  const parts = player.name.trim().split(' ').filter(Boolean)
  if (parts.length <= 1) return player.name
  return `${parts[0]} ${parts[parts.length - 1]}`
}

function getLastName(player) {
  if (!player?.name) return ''
  const parts = player.name.trim().split(/\s+/).filter(Boolean)
  return parts[parts.length - 1] || player.name
}

function getAttackingSide(teamKey, quarter) {
  const homeSide = quarter >= 3 ? 'left' : 'right'
  if (teamKey === 'home') return homeSide
  return homeSide === 'left' ? 'right' : 'left'
}

function getBasketTarget(teamKey, quarter) {
  return getAttackingSide(teamKey, quarter) === 'left'
    ? COURT_LEFT_BASKET
    : COURT_RIGHT_BASKET
}

function toCourtUnits(location) {
  return {
    x: (location.x / 100) * COURT_WIDTH_UNITS,
    y: (location.y / 100) * COURT_HEIGHT_UNITS,
  }
}

function getHoopPosition(teamKey, quarter) {
  const side = getAttackingSide(teamKey, quarter)

  return {
    side,
    x: side === 'left' ? BASKET_X_FROM_BASELINE : COURT_WIDTH_UNITS - BASKET_X_FROM_BASELINE,
    y: BASKET_Y_UNITS,
  }
}

function isThreePointAttempt(location, teamKey, quarter) {
  if (!location) return false

  const point = toCourtUnits(location)
  const hoop = getHoopPosition(teamKey, quarter)
  const dyAbs = Math.abs(point.y - hoop.y)
  const cornerYOffset = COURT_HEIGHT_UNITS / 2 - THREE_POINT_SIDE_OFFSET_UNITS
  const arcJoinDx = Math.sqrt(
    Math.max(0, THREE_POINT_RADIUS_UNITS ** 2 - cornerYOffset ** 2)
  )

  const isTowardCenterCourt =
    hoop.side === 'left' ? point.x >= hoop.x : point.x <= hoop.x

  if (!isTowardCenterCourt) {
    return false
  }

  if (dyAbs >= cornerYOffset) {
    const cornerLineX =
      hoop.side === 'left' ? hoop.x + arcJoinDx : hoop.x - arcJoinDx

    return hoop.side === 'left' ? point.x >= cornerLineX : point.x <= cornerLineX
  }

  const distanceFromHoop = Math.hypot(point.x - hoop.x, point.y - hoop.y)
  return distanceFromHoop >= THREE_POINT_RADIUS_UNITS
}

function getSuggestedTeamKeyFromLocation(location, quarter) {
  if (!location) return 'home'

  if (location.x <= 50) {
    return getAttackingSide('home', quarter) === 'left' ? 'home' : 'away'
  }

  return getAttackingSide('home', quarter) === 'right' ? 'home' : 'away'
}

function getSuggestedShotTypeFromLocation(location, teamKey, quarter) {
  if (!location) return '2PT'

  return isThreePointAttempt(location, teamKey, quarter) ? '3PT' : '2PT'
}

function findPlayerById(players, id) {
  return players.find((p) => p.id === id)
}

function getInitialOnCourt(players) {
  return players.slice(0, 5).map((p) => p.id)
}

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10)
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

function loadJSON(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch (err) {
    console.error(`Failed to parse ${key}`, err)
    return fallback
  }
}

function toggleSelection(list, id, max = 5) {
  if (list.includes(id)) return list.filter((x) => x !== id)
  if (list.length >= max) return list
  return [...list, id]
}

function getEmptyStatLine() {
  return {
    pts: 0,
    fgm: 0,
    fga: 0,
    tpm: 0,
    tpa: 0,
    ftm: 0,
    fta: 0,
    oreb: 0,
    dreb: 0,
    reb: 0,
    ast: 0,
    stl: 0,
    blk: 0,
    tov: 0,
    foul: 0,
  }
}

function pct(made, att) {
  if (!att) return '0%'
  return `${Math.round((made / att) * 100)}%`
}

function getPlayerStatsFromEvents(players, events) {
  const stats = {}

  players.forEach((p) => {
    stats[p.id] = getEmptyStatLine()
  })

  for (const evt of events) {
    if (evt.type === 'shot') {
      const shooterId = evt.shooterId
      if (!stats[shooterId]) stats[shooterId] = getEmptyStatLine()
      const s = stats[shooterId]

      if (evt.shotType === '2PT') {
        s.fga += 1
        if (evt.result === 'made') {
          s.fgm += 1
          s.pts += 2
        }
      }

      if (evt.shotType === '3PT') {
        s.fga += 1
        s.tpa += 1
        if (evt.result === 'made') {
          s.fgm += 1
          s.tpm += 1
          s.pts += 3
        }
      }

      if (evt.shotType === 'FT') {
        s.fta += 1
        if (evt.result === 'made') {
          s.ftm += 1
          s.pts += 1
        }
      }

      if (evt.assistPlayerId) {
        if (!stats[evt.assistPlayerId]) stats[evt.assistPlayerId] = getEmptyStatLine()
        stats[evt.assistPlayerId].ast += 1
      }

      if (evt.blockerId) {
        if (!stats[evt.blockerId]) stats[evt.blockerId] = getEmptyStatLine()
        stats[evt.blockerId].blk += 1
      }
    }

    if (evt.type === 'rebound') {
      if (evt.playerId) {
        if (!stats[evt.playerId]) stats[evt.playerId] = getEmptyStatLine()
        if (evt.reboundType === 'oreb') stats[evt.playerId].oreb += 1
        if (evt.reboundType === 'dreb') stats[evt.playerId].dreb += 1
        stats[evt.playerId].reb += 1
      }
    }

    if (evt.type === 'turnover') {
      if (!stats[evt.playerId]) stats[evt.playerId] = getEmptyStatLine()
      stats[evt.playerId].tov += 1

      if (evt.forcedByPlayerId) {
        if (!stats[evt.forcedByPlayerId]) stats[evt.forcedByPlayerId] = getEmptyStatLine()
        stats[evt.forcedByPlayerId].stl += 1
      }
    }

    if (evt.type === 'foul') {
      if (!stats[evt.foulerId]) stats[evt.foulerId] = getEmptyStatLine()
      stats[evt.foulerId].foul += 1
    }
  }

  return stats
}

function getOnCourtStats(playerId, events) {
  const stats = getEmptyStatLine()

  for (const evt of events) {
    if (!evt.lineupSnapshot || !evt.lineupSnapshot.includes(playerId)) continue

    if (evt.type === 'shot' && evt.shooterId === playerId) {
      if (evt.shotType === '2PT') {
        stats.fga += 1
        if (evt.result === 'made') {
          stats.fgm += 1
          stats.pts += 2
        }
      }
      if (evt.shotType === '3PT') {
        stats.fga += 1
        stats.tpa += 1
        if (evt.result === 'made') {
          stats.fgm += 1
          stats.tpm += 1
          stats.pts += 3
        }
      }
      if (evt.shotType === 'FT') {
        stats.fta += 1
        if (evt.result === 'made') {
          stats.ftm += 1
          stats.pts += 1
        }
      }
    }

    if (evt.type === 'shot' && evt.assistPlayerId === playerId) {
      stats.ast += 1
    }

    if (evt.type === 'shot' && evt.blockerId === playerId) {
      stats.blk += 1
    }

    if (evt.type === 'rebound' && evt.playerId === playerId) {
      if (evt.reboundType === 'oreb') stats.oreb += 1
      if (evt.reboundType === 'dreb') stats.dreb += 1
      stats.reb += 1
    }

    if (evt.type === 'turnover' && evt.playerId === playerId) {
      stats.tov += 1
    }

    if (evt.type === 'turnover' && evt.forcedByPlayerId === playerId) {
      stats.stl += 1
    }

    if (evt.type === 'foul' && evt.foulerId === playerId) {
      stats.foul += 1
    }
  }

  return stats
}

function getTeamTotals(players, events) {
  const stats = getPlayerStatsFromEvents(players, events)

  return players.reduce(
    (acc, player) => {
      const s = stats[player.id] || getEmptyStatLine()
      acc.points += s.pts
      acc.rebounds += s.reb
      acc.assists += s.ast
      acc.steals += s.stl
      acc.blocks += s.blk
      acc.turnovers += s.tov
      acc.fouls += s.foul
      return acc
    },
    {
      points: 0,
      rebounds: 0,
      assists: 0,
      steals: 0,
      blocks: 0,
      turnovers: 0,
      fouls: 0,
    }
  )
}

function addStatLine(target, source) {
  target.pts += source.pts
  target.reb += source.reb
  target.ast += source.ast
  target.stl += source.stl
  target.blk += source.blk
  target.tov += source.tov
  target.foul += source.foul
}

function getLeaderBy(players, key) {
  if (!players.length) return null
  return [...players].sort((a, b) => {
    if (b[key] !== a[key]) return b[key] - a[key]
    return a.name.localeCompare(b.name)
  })[0]
}

function getSeasonSummary(matches) {
  if (!matches.length) {
    return {
      totals: {
        games: 0,
        wins: 0,
        losses: 0,
        points: 0,
        rebounds: 0,
        assists: 0,
      },
      players: [],
      leaders: {},
    }
  }

  const playerTotals = new Map()
  const totals = {
    games: matches.length,
    wins: 0,
    losses: 0,
    points: 0,
    rebounds: 0,
    assists: 0,
  }

  matches.forEach((match) => {
    const statsMap = getPlayerStatsFromEvents(match.home.players, match.events)

    totals.points += match.finalScore?.home || 0
    totals.wins += (match.finalScore?.home || 0) > (match.finalScore?.away || 0) ? 1 : 0
    totals.losses += (match.finalScore?.home || 0) < (match.finalScore?.away || 0) ? 1 : 0

    match.home.players.forEach((player) => {
      const line = statsMap[player.id] || getEmptyStatLine()
      totals.rebounds += line.reb
      totals.assists += line.ast

      if (!playerTotals.has(player.id)) {
        playerTotals.set(player.id, {
          id: player.id,
          name: player.name,
          number: player.number,
          games: 0,
          pts: 0,
          reb: 0,
          ast: 0,
          stl: 0,
          blk: 0,
          tov: 0,
          foul: 0,
          mvpScore: 0,
        })
      }

      const aggregate = playerTotals.get(player.id)
      aggregate.games += 1
      addStatLine(aggregate, line)
    })
  })

  const players = [...playerTotals.values()].map((player) => ({
    ...player,
    mvpScore: Math.round((player.pts + player.reb * 1.2 + player.ast * 1.5 + player.stl * 3 + player.blk * 3 - player.tov) * 10) / 10,
  }))

  return {
    totals,
    players,
    leaders: {
      pts: getLeaderBy(players, 'pts'),
      reb: getLeaderBy(players, 'reb'),
      ast: getLeaderBy(players, 'ast'),
      stl: getLeaderBy(players, 'stl'),
      blk: getLeaderBy(players, 'blk'),
      mvpScore: getLeaderBy(players, 'mvpScore'),
    },
  }
}

function getQuarterScore(events, quarter) {
  return events.reduce(
    (acc, evt) => {
      if (evt.quarter !== quarter) return acc
      if (evt.type === 'shot' && evt.result === 'made') {
        acc[evt.teamKey] += evt.points
      }
      return acc
    },
    { home: 0, away: 0 }
  )
}

function getAllQuarterScores(events) {
  return {
    1: getQuarterScore(events, 1),
    2: getQuarterScore(events, 2),
    3: getQuarterScore(events, 3),
    4: getQuarterScore(events, 4),
  }
}

function getTeamFoulsByQuarter(events, quarter) {
  return events.reduce(
    (acc, evt) => {
      if (evt.type === 'foul' && evt.quarter === quarter && evt.countsAsTeamFoul !== false) {
        acc[evt.teamKey] += 1
      }
      return acc
    },
    { home: 0, away: 0 }
  )
}

function getRunningScoreUntil(events, eventId) {
  const score = { home: 0, away: 0 }
  for (const evt of events) {
    if (evt.type === 'shot' && evt.result === 'made') {
      score[evt.teamKey] += evt.points
    }
    if (evt.id === eventId) break
  }
  return score
}

function getFixableScoringEvents(events) {
  return events.filter(
    (evt) =>
      evt.type === 'shot' &&
      evt.result === 'made' &&
      (evt.shotType === '2PT' || evt.shotType === '3PT') &&
      !evt.assistPlayerId
  )
}

function getEventsByQuarter(events) {
  return {
    1: events.filter((e) => e.quarter === 1),
    2: events.filter((e) => e.quarter === 2),
    3: events.filter((e) => e.quarter === 3),
    4: events.filter((e) => e.quarter === 4),
  }
}

function getShotDisplayLabel(evt) {
  if (evt.shotType === 'FT') return 'FT'
  if (evt.isDunk) return 'DUNK'
  return evt.shotType
}

function getShotValueLabel(evt) {
  if (evt.isDunk) return 'DUNK'
  if (evt.shotType === '2PT') return '2 POINTS'
  if (evt.shotType === '3PT') return '3 POINTS'
  return evt.shotType
}

function getEventPlayerLabel(player) {
  if (!player) return '"UNKNOWN"'
  return `"${getDisplayName(player)}"`
}

function describeEvent(evt, match) {
  if (evt.type === 'shot') {
    const team = match[evt.teamKey]
    const oppTeam = evt.teamKey === 'home' ? match.away : match.home
    const shooter = findPlayerById(team.players, evt.shooterId)
    const assister = evt.assistPlayerId ? findPlayerById(team.players, evt.assistPlayerId) : null
    const blocker = evt.blockerId ? findPlayerById(oppTeam.players, evt.blockerId) : null

    if (evt.result === 'made') {
      if (evt.shotType === 'FT') {
        return `SCORE - ${getEventPlayerLabel(shooter)} FREE THROW ${evt.freeThrowNumber || 1}/${evt.freeThrowTotal || 1}`
      }

      return `SCORE - ${getEventPlayerLabel(shooter)} ${getShotValueLabel(evt)}${assister ? ` - AST ${getEventPlayerLabel(assister)}` : ''}`
    }

    if (evt.shotType === 'FT') {
      return `MISS - ${getEventPlayerLabel(shooter)} FREE THROW ${evt.freeThrowNumber || 1}/${evt.freeThrowTotal || 1}`
    }

    return `MISS - ${getEventPlayerLabel(shooter)} ${getShotValueLabel(evt)}${blocker ? ` - BLOCK ${getEventPlayerLabel(blocker)}` : ''}`
  }

  if (evt.type === 'rebound') {
    const team = match[evt.teamKey]
    const player = evt.playerId ? findPlayerById(team.players, evt.playerId) : null

    if (!player) return `REBOUND - "${team.name.toUpperCase()}" TEAM`
    return `REBOUND - ${getEventPlayerLabel(player)} ${evt.reboundType === 'oreb' ? 'OFFENSIVE' : 'DEFENSIVE'}`
  }

  if (evt.type === 'foul') {
    const foulingTeam = match[evt.teamKey]
    const fouledTeam = evt.teamKey === 'home' ? match.away : match.home
    const fouler = findPlayerById(foulingTeam.players, evt.foulerId)
    const fouled = findPlayerById(fouledTeam.players, evt.fouledPlayerId)
    return `FOUL - ${getEventPlayerLabel(fouler)}${fouled ? ` - ON ${getEventPlayerLabel(fouled)}` : ''}`
  }

  if (evt.type === 'turnover') {
    const team = match[evt.teamKey]
    const oppTeam = evt.teamKey === 'home' ? match.away : match.home
    const player = findPlayerById(team.players, evt.playerId)
    const stealer = evt.forcedByPlayerId ? findPlayerById(oppTeam.players, evt.forcedByPlayerId) : null

    return stealer ? `STEAL - ${getEventPlayerLabel(stealer)} - TURNOVER ${getEventPlayerLabel(player)}` : `TURNOVER - ${getEventPlayerLabel(player)}`
  }

  if (evt.type === 'substitution') {
    const team = match[evt.teamKey]
    const outPlayer = findPlayerById(team.players, evt.playerOutId)
    const inPlayer = findPlayerById(team.players, evt.playerInId)
    return `SUB - ${getEventPlayerLabel(outPlayer)} OUT - ${getEventPlayerLabel(inPlayer)} IN`
  }

  return 'Event'
}

function describeMatchEvent(evt, match) {
  if (evt.type === 'shot') {
    const team = match[evt.teamKey]
    const oppTeam = evt.teamKey === 'home' ? match.away : match.home
    const shooter = findPlayerById(team.players, evt.shooterId)
    const assister = evt.assistPlayerId ? findPlayerById(team.players, evt.assistPlayerId) : null
    const blocker = evt.blockerId ? findPlayerById(oppTeam.players, evt.blockerId) : null

    if (evt.result === 'made') {
      if (evt.shotType === 'FT') {
        return `SCORE - ${getEventPlayerLabel(shooter)} FREE THROW ${evt.freeThrowNumber || 1}/${evt.freeThrowTotal || 1}`
      }

      return `SCORE - ${getEventPlayerLabel(shooter)} ${getShotValueLabel(evt)}${assister ? ` - AST ${getEventPlayerLabel(assister)}` : ''}`
    }

    if (evt.shotType === 'FT') {
      return `MISS - ${getEventPlayerLabel(shooter)} FREE THROW ${evt.freeThrowNumber || 1}/${evt.freeThrowTotal || 1}`
    }

    return `MISS - ${getEventPlayerLabel(shooter)} ${getShotValueLabel(evt)}${blocker ? ` - BLOCK ${getEventPlayerLabel(blocker)}` : ''}`
  }

  if (evt.type === 'rebound') {
    const team = match[evt.teamKey]
    const player = evt.playerId ? findPlayerById(team.players, evt.playerId) : null

    if (!player) return `REBOUND - "${team.name.toUpperCase()}" TEAM`
    return `REBOUND - ${getEventPlayerLabel(player)} ${evt.reboundType === 'oreb' ? 'OFFENSIVE' : 'DEFENSIVE'}`
  }

  if (evt.type === 'foul') {
    const fouledTeam = evt.teamKey === 'home' ? match.away : match.home
    const fouled = findPlayerById(fouledTeam.players, evt.fouledPlayerId)
    const foulTypeLabel = FOUL_TYPE_CONFIG[evt.foulType]?.label || 'Foul'
    const actorLabel = getFoulActorLabel(match, evt.teamKey, evt)
    const shotsLabel =
      evt.freeThrowsAwarded > 0
        ? `, ${evt.freeThrowsAwarded} FT${evt.freeThrowsAwarded > 1 ? 's' : ''} awarded`
        : ''
    const possessionLabel = evt.retainsPossession ? ', possession retained' : ''

    if (fouled) {
      return `FOUL - ${actorLabel.toUpperCase()} - ${foulTypeLabel.toUpperCase()} - ON ${getEventPlayerLabel(fouled)}${shotsLabel}${possessionLabel}`
    }

    return `FOUL - ${actorLabel.toUpperCase()} - ${foulTypeLabel.toUpperCase()}${shotsLabel}${possessionLabel}`
  }

  if (evt.type === 'turnover') {
    const team = match[evt.teamKey]
    const oppTeam = evt.teamKey === 'home' ? match.away : match.home
    const player = findPlayerById(team.players, evt.playerId)
    const stealer = evt.forcedByPlayerId ? findPlayerById(oppTeam.players, evt.forcedByPlayerId) : null

    return stealer ? `STEAL - ${getEventPlayerLabel(stealer)} - TURNOVER ${getEventPlayerLabel(player)}` : `TURNOVER - ${getEventPlayerLabel(player)}`
  }

  if (evt.type === 'substitution') {
    const team = match[evt.teamKey]
    const outPlayer = findPlayerById(team.players, evt.playerOutId)
    const inPlayer = findPlayerById(team.players, evt.playerInId)
    return `SUB - ${getEventPlayerLabel(outPlayer)} OUT - ${getEventPlayerLabel(inPlayer)} IN`
  }

  return 'Event'
}

function getSelectedPlayerStats(selectedPlayer, statsMap) {
  if (!selectedPlayer) return getEmptyStatLine()
  return statsMap[selectedPlayer.id] || getEmptyStatLine()
}

function getStatsForTeamPlayer(match, teamKey, playerId) {
  if (!match || !playerId) return getEmptyStatLine()

  const team = match[teamKey]
  const teamEvents = match.events.filter((e) => e.teamKey === teamKey)
  const statsMap = getPlayerStatsFromEvents(team.players, teamEvents)

  return statsMap[playerId] || getEmptyStatLine()
}

function mapSupabaseMatchRow(row, events = []) {
  const homeColor = row.home_players?.[0]?.teamColor || HOME_TEAM_COLOR
  const homeSecondaryColor =
    row.home_players?.[0]?.teamSecondaryColor || HOME_TEAM_SECONDARY_COLOR
  const awayColor = row.away_players?.[0]?.teamColor || DEFAULT_AWAY_COLOR
  const awaySecondaryColor =
    row.away_players?.[0]?.teamSecondaryColor || DEFAULT_AWAY_SECONDARY_COLOR

  return {
    id: row.id,
    date: row.date || '',
    venue: row.venue || '',
    quarter: row.quarter || 4,
    savedAt: row.updated_at || row.created_at || new Date().toISOString(),
    finalScore: {
      home: row.final_score_home || 0,
      away: row.final_score_away || 0,
    },
    quarterScores: row.quarter_scores || {
      1: { home: 0, away: 0 },
      2: { home: 0, away: 0 },
      3: { home: 0, away: 0 },
      4: { home: 0, away: 0 },
    },
    home: {
      name: row.home_team_name,
      coachName: row.home_coach_name || DEFAULT_HOME_COACH_NAME,
      color: homeColor,
      secondaryColor: homeSecondaryColor,
      players: row.home_players || [],
      onCourt: row.home_on_court || [],
    },
    away: {
      name: row.away_team_name,
      coachName: row.away_coach_name || DEFAULT_AWAY_COACH_NAME,
      color: awayColor,
      secondaryColor: awaySecondaryColor,
      players: row.away_players || [],
      onCourt: row.away_on_court || [],
    },
    events,
  }
}

export default function App() {
  const [screen, setScreen] = useState('home')
  const [hasLoaded, setHasLoaded] = useState(false)
  const [selectedSavedMatch, setSelectedSavedMatch] = useState(null)
  const [liveMatches, setLiveMatches] = useState([])
  const skipNextLiveSyncRef = useRef(false)
  const pullRefreshStartRef = useRef(null)
  const pullRefreshDistanceRef = useRef(0)
  const courtHoldTimeoutRef = useRef(null)
  const courtPressRef = useRef(null)

  const [homeTeam, setHomeTeam] = useState({
    name: 'Loading team...',
    coachName: DEFAULT_HOME_COACH_NAME,
    color: HOME_TEAM_COLOR,
    secondaryColor: HOME_TEAM_SECONDARY_COLOR,
    players: [],
  })
  const [homeTeamId, setHomeTeamId] = useState(null)

  const [playerFlashMap, setPlayerFlashMap] = useState({})
  const [savedMatches, setSavedMatches] = useState([])
  const [currentMatchId, setCurrentMatchId] = useState(null)
  const [bottomPanelOpen, setBottomPanelOpen] = useState(false)
  const [homePlayerName, setHomePlayerName] = useState('')
  const [homePlayerNumber, setHomePlayerNumber] = useState('')

  const [newMatch, setNewMatch] = useState({
    opponentName: '',
    opponentCoachName: '',
    opponentPlayers: [
      createPlayer('Opponent 1', '1'),
      createPlayer('Opponent 2', '2'),
      createPlayer('Opponent 3', '3'),
      createPlayer('Opponent 4', '4'),
      createPlayer('Opponent 5', '5'),
      createPlayer('Opponent 6', '6'),
      createPlayer('Opponent 7', '7'),
    ],
    date: getTodayDateString(),
    venue: '',
    opponentColor: DEFAULT_AWAY_COLOR,
    opponentSecondaryColor: DEFAULT_AWAY_SECONDARY_COLOR,
  })

  const [startingFive, setStartingFive] = useState({
    home: [],
    away: [],
  })

  const [opponentPlayerName, setOpponentPlayerName] = useState('')
  const [opponentPlayerNumber, setOpponentPlayerNumber] = useState('')

  const [currentMatch, setCurrentMatch] = useState(null)
  const [selectedTeam, setSelectedTeam] = useState('home')
  const [selectedPlayerId, setSelectedPlayerId] = useState('')
  const [panelView, setPanelView] = useState('log')
  const [shotMapPlayerFilter, setShotMapPlayerFilter] = useState(null)

  const [subModal, setSubModal] = useState({
    open: false,
    teamKey: '',
    outgoingPlayerId: '',
  })

  const [shotModal, setShotModal] = useState({
    open: false,
    shotType: '',
    result: '',
  })

  const [assistModal, setAssistModal] = useState({
    open: false,
    teamKey: '',
    shooterId: '',
    shotType: '',
    isDunk: false,
    shotLocation: null,
  })

  const [foulModal, setFoulModal] = useState(createEmptyFoulModal)

  const [reboundModal, setReboundModal] = useState({
    open: false,
    relatedShotEventId: '',
    mode: 'choice',
    reboundType: '',
    pickerTeamKey: '',
    playerId: '',
  })

  const [turnoverModal, setTurnoverModal] = useState({
    open: false,
    step: 'category',
    teamKey: '',
    playerId: '',
    category: '',
    violationType: '',
  })

  const [fixAssistModal, setFixAssistModal] = useState({
    open: false,
    scoringEventId: '',
  })

  const [freeThrowFlow, setFreeThrowFlow] = useState({
    open: false,
    step: 'count',
    total: 1,
    current: 1,
    teamKey: '',
    shooterId: '',
  })
  const [courtShotFlow, setCourtShotFlow] = useState({
    open: false,
    step: 'shooter',
    mode: 'missed',
    shooterTeamKey: '',
    shooterId: '',
    shotType: '',
    isDunk: false,
    location: null,
    suggestedTeamKey: 'home',
    suggestedShotType: '2PT',
  })
  const [courtReboundPrompt, setCourtReboundPrompt] = useState({
    open: false,
    relatedShotEventId: '',
  })
  const [blockPrompt, setBlockPrompt] = useState({
    open: false,
    step: 'ask',
    relatedShotEventId: '',
    shotTeamKey: '',
    promptForRebound: false,
  })
  const [pendingActionSelection, setPendingActionSelection] = useState({
    open: false,
    action: '',
  })
  const [coachBenchModal, setCoachBenchModal] = useState({
    open: false,
    teamKey: '',
  })

  const [quarterSummaryOpen, setQuarterSummaryOpen] = useState(false)
  const [quarterSummaryView, setQuarterSummaryView] = useState('summary')
  const [pullRefreshLabel, setPullRefreshLabel] = useState('')
  const [isRefreshingMenuData, setIsRefreshingMenuData] = useState(false)
  const [isExportingData, setIsExportingData] = useState(false)

  async function loadHomeTeamFromSupabase() {
    const { data: teamRows, error: teamError } = await supabase
      .from('teams')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)

    if (teamError) {
      console.error('Failed to load team from Supabase:', teamError)
      return null
    }

    const teamRow = teamRows?.[0]

    if (!teamRow) {
      console.error('No team found in Supabase.')
      return null
    }

    const { data: playerRows, error: playersError } = await supabase
      .from('players')
      .select('id, name, number')
      .eq('team_id', teamRow.id)
      .order('number', { ascending: true })

    if (playersError) {
      console.error('Failed to load players from Supabase:', playersError)
      return null
    }

    setHomeTeamId(teamRow.id)
    setHomeTeam({
      name: teamRow.name,
      coachName: teamRow.coach_name || loadJSON(STORAGE_KEYS.homeCoachName, DEFAULT_HOME_COACH_NAME),
      color: teamRow.primary_color || HOME_TEAM_COLOR,
      secondaryColor: teamRow.secondary_color || HOME_TEAM_SECONDARY_COLOR,
      players: playerRows || [],
    })

    return teamRow
  }

  async function loadSavedMatchesFromSupabase() {
    const { data: matchRows, error: matchesError } = await supabase
      .from('matches')
      .select('*')
      .eq('status', 'completed')
      .order('updated_at', { ascending: false })

    if (matchesError) {
      console.error('Failed to load saved matches from Supabase:', matchesError)
      return
    }

    const completedMatches = matchRows || []

    if (completedMatches.length === 0) {
      setSavedMatches([])
      return
    }

    const matchIds = completedMatches.map((match) => match.id)

    const { data: eventRows, error: eventsError } = await supabase
      .from('match_events')
      .select('match_id, event_data, created_at')
      .in('match_id', matchIds)
      .order('created_at', { ascending: true })

    if (eventsError) {
      console.error('Failed to load saved match events from Supabase:', eventsError)
      return
    }

    const eventsByMatchId = (eventRows || []).reduce((acc, row) => {
      if (!acc[row.match_id]) acc[row.match_id] = []
      acc[row.match_id].push(row.event_data)
      return acc
    }, {})

    setSavedMatches(
      completedMatches.map((row) => mapSupabaseMatchRow(row, eventsByMatchId[row.id] || []))
    )
  }

  async function loadLiveMatchesFromSupabase() {
    const { data: liveMatchRows, error: liveMatchError } = await supabase
      .from('matches')
      .select('*')
      .eq('status', 'live')
      .order('updated_at', { ascending: false })

    if (liveMatchError) {
      console.error('Failed to load live matches from Supabase:', liveMatchError)
      return
    }

    setLiveMatches(liveMatchRows || [])
  }

  async function resumeLiveMatch(matchId, options = {}) {
    const { remote = false, silent = false } = options

    const { data: liveMatchRow, error: liveMatchError } = await supabase
      .from('matches')
      .select('*')
      .eq('id', matchId)
      .single()

    if (liveMatchError) {
      console.error('Failed to load selected live match:', liveMatchError)
      if (!silent) alert('Failed to load live match.')
      return
    }

    const { data: liveEventRows, error: liveEventsError } = await supabase
      .from('match_events')
      .select('event_data, created_at')
      .eq('match_id', matchId)
      .order('created_at', { ascending: true })

    if (liveEventsError) {
      console.error('Failed to load selected live match events:', liveEventsError)
      if (!silent) alert('Failed to load live match events.')
      return
    }

    const liveEvents = (liveEventRows || []).map((row) => row.event_data)
    const liveMatch = mapSupabaseMatchRow(liveMatchRow, liveEvents)

    if (remote) {
      skipNextLiveSyncRef.current = true
    }

    setBottomPanelOpen(false)
    setCurrentMatchId(liveMatchRow.id)
    setCurrentMatch(liveMatch)
    setSelectedTeam('home')
    setSelectedPlayerId(liveMatch.home?.onCourt?.[0] || '')
    setScreen('live')
  }

  async function refreshSharedMenuData() {
    setIsRefreshingMenuData(true)
    setPullRefreshLabel('Refreshing...')

    try {
      await Promise.all([
        loadHomeTeamFromSupabase(),
        loadLiveMatchesFromSupabase(),
        loadSavedMatchesFromSupabase(),
      ])
    } finally {
      window.setTimeout(() => {
        setIsRefreshingMenuData(false)
        setPullRefreshLabel('')
      }, 250)
    }
  }

  async function exportClubData() {
    setIsExportingData(true)

    try {
      const [{ data: teams, error: teamsError }, { data: players, error: playersError }, { data: matches, error: matchesError }, { data: matchEvents, error: eventsError }] =
        await Promise.all([
          supabase.from('teams').select('*').order('created_at', { ascending: true }),
          supabase.from('players').select('*').order('created_at', { ascending: true }),
          supabase.from('matches').select('*').order('created_at', { ascending: true }),
          supabase.from('match_events').select('*').order('created_at', { ascending: true }),
        ])

      if (teamsError || playersError || matchesError || eventsError) {
        console.error('Failed to export club data:', teamsError || playersError || matchesError || eventsError)
        alert('Failed to export club data.')
        return
      }

      const exportPayload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        club: {
          teamName: homeTeam.name,
          coachName: homeTeam.coachName || '',
        },
        counts: {
          teams: teams?.length || 0,
          players: players?.length || 0,
          matches: matches?.length || 0,
          matchEvents: matchEvents?.length || 0,
        },
        tables: {
          teams: teams || [],
          players: players || [],
          matches: matches || [],
          match_events: matchEvents || [],
        },
      }

      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
        type: 'application/json',
      })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `basketball-club-backup-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } finally {
      setIsExportingData(false)
    }
  }

  function exportSeasonStatsCsv() {
    const players = seasonSummary.players

    if (!players.length) {
      alert('No completed match stats available to export yet.')
      return
    }

    const rows = [
      ['Number', 'Player', 'Games', 'Points', 'Rebounds', 'Assists', 'Steals', 'Blocks', 'Turnovers', 'Fouls', 'MVP Score'],
      ...players
        .slice()
        .sort((a, b) => b.pts - a.pts || a.name.localeCompare(b.name))
        .map((player) => [
          player.number,
          player.name,
          player.games,
          player.pts,
          player.reb,
          player.ast,
          player.stl,
          player.blk,
          player.tov,
          player.foul,
          player.mvpScore,
        ]),
    ]

    const csv = rows
      .map((row) =>
        row
          .map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`)
          .join(',')
      )
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `basketball-season-stats-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  }

  useEffect(() => {
    async function loadAppData() {
      const teamRow = await loadHomeTeamFromSupabase()

      if (!teamRow) {
        setHasLoaded(true)
        return
      }

      await loadLiveMatchesFromSupabase()
      await loadSavedMatchesFromSupabase()

      setHasLoaded(true)
    }

    loadAppData()
  }, [])

  useEffect(() => {
    if (!hasLoaded || !currentMatch || !currentMatchId) return

    if (skipNextLiveSyncRef.current) {
      skipNextLiveSyncRef.current = false
      return
    }

    async function syncLiveMatch() {
      const liveHomeEvents = currentMatch.events.filter((e) => e.teamKey === 'home')
      const liveAwayEvents = currentMatch.events.filter((e) => e.teamKey === 'away')
      const liveScore = {
        home: getTeamTotals(currentMatch.home.players, liveHomeEvents).points,
        away: getTeamTotals(currentMatch.away.players, liveAwayEvents).points,
      }

      const baseUpdatePayload = {
        home_team_id: homeTeamId,
        home_team_name: currentMatch.home.name,
        away_team_name: currentMatch.away.name,
        date: currentMatch.date || '',
        venue: currentMatch.venue || '',
        quarter: currentMatch.quarter,
        status: 'live',
        final_score_home: liveScore.home,
        final_score_away: liveScore.away,
        quarter_scores: getAllQuarterScores(currentMatch.events),
        home_players: currentMatch.home.players,
        away_players: currentMatch.away.players,
        home_on_court: currentMatch.home.onCourt,
        away_on_court: currentMatch.away.onCourt,
        updated_at: new Date().toISOString(),
      }

      let { error: matchError } = await supabase
        .from('matches')
        .update({
          ...baseUpdatePayload,
          home_coach_name: currentMatch.home.coachName || '',
          away_coach_name: currentMatch.away.coachName || '',
        })
        .eq('id', currentMatchId)

      if (matchError) {
        const retry = await supabase.from('matches').update(baseUpdatePayload).eq('id', currentMatchId)
        matchError = retry.error
      }

      if (matchError) {
        console.error('Failed to sync live match:', matchError)
        return
      }

      const { error: deleteEventsError } = await supabase
        .from('match_events')
        .delete()
        .eq('match_id', currentMatchId)

      if (deleteEventsError) {
        console.error('Failed to clear live match events:', deleteEventsError)
        return
      }

      if (currentMatch.events.length > 0) {
        const eventRows = currentMatch.events.map((evt) => ({
          match_id: currentMatchId,
          event_data: evt,
        }))

        const { error: insertEventsError } = await supabase
          .from('match_events')
          .insert(eventRows)

        if (insertEventsError) {
          console.error('Failed to sync live match events:', insertEventsError)
        }
      }
    }

    syncLiveMatch()
  }, [currentMatch, currentMatchId, hasLoaded, homeTeamId])

  function handleMenuTouchStart(e) {
    if (screen === 'live' || screen === 'summary' || selectedSavedMatch || isRefreshingMenuData) return
    if (window.scrollY > 4) return

    const touch = e.touches?.[0]
    if (!touch || touch.clientY > 110) return

    pullRefreshStartRef.current = touch.clientY
    pullRefreshDistanceRef.current = 0
  }

  function handleMenuTouchMove(e) {
    if (pullRefreshStartRef.current == null) return

    const touch = e.touches?.[0]
    if (!touch) return

    const distance = Math.max(0, touch.clientY - pullRefreshStartRef.current)
    pullRefreshDistanceRef.current = distance

    if (distance > 90) {
      setPullRefreshLabel('Release to refresh')
    } else if (distance > 38) {
      setPullRefreshLabel('Pull to refresh')
    } else {
      setPullRefreshLabel('')
    }
  }

  async function handleMenuTouchEnd() {
    const shouldRefresh = pullRefreshDistanceRef.current > 90

    pullRefreshStartRef.current = null
    pullRefreshDistanceRef.current = 0

    if (shouldRefresh) {
      await refreshSharedMenuData()
      return
    }

    setPullRefreshLabel('')
  }

  const pageGestureProps = {
    onTouchStart: handleMenuTouchStart,
    onTouchMove: handleMenuTouchMove,
    onTouchEnd: handleMenuTouchEnd,
  }

  useEffect(() => {
    if (!hasLoaded) return

    const matchesChannel = supabase
      .channel('matches-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches' },
        async (payload) => {
          await loadLiveMatchesFromSupabase()
          await loadSavedMatchesFromSupabase()

          const changedMatchId = payload.new?.id || payload.old?.id

          if (
            changedMatchId &&
            currentMatchId &&
            changedMatchId === currentMatchId &&
            screen === 'live'
          ) {
            await resumeLiveMatch(currentMatchId, { remote: true, silent: true })
          }
        }
      )
      .subscribe()

    const eventsChannel = supabase
      .channel('match-events-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'match_events' },
        async (payload) => {
          const changedMatchId = payload.new?.match_id || payload.old?.match_id

          if (changedMatchId && currentMatchId && changedMatchId === currentMatchId && screen === 'live') {
            await resumeLiveMatch(currentMatchId, { remote: true, silent: true })
          }

          await loadLiveMatchesFromSupabase()
          await loadSavedMatchesFromSupabase()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(matchesChannel)
      supabase.removeChannel(eventsChannel)
    }
  }, [hasLoaded, currentMatchId, screen])

  const allEvents = currentMatch?.events || []

  const homeEvents = useMemo(() => allEvents.filter((e) => e.teamKey === 'home'), [allEvents])
  const awayEvents = useMemo(() => allEvents.filter((e) => e.teamKey === 'away'), [allEvents])

  const homeStats = useMemo(() => {
    if (!currentMatch) return {}
    return getPlayerStatsFromEvents(currentMatch.home.players, allEvents)
  }, [currentMatch, allEvents])

  const awayStats = useMemo(() => {
    if (!currentMatch) return {}
    return getPlayerStatsFromEvents(currentMatch.away.players, allEvents)
  }, [currentMatch, allEvents])

  const homeTotals = useMemo(() => {
    if (!currentMatch) return getTeamTotals(homeTeam.players, [])
    return getTeamTotals(currentMatch.home.players, homeEvents)
  }, [currentMatch, homeEvents, homeTeam.players])

  const awayTotals = useMemo(() => {
    if (!currentMatch) return null
    return getTeamTotals(currentMatch.away.players, awayEvents)
  }, [currentMatch, awayEvents])

  const currentQuarterScore = useMemo(() => {
    if (!currentMatch) return { home: 0, away: 0 }
    return getQuarterScore(allEvents, currentMatch.quarter)
  }, [currentMatch, allEvents])

  const currentQuarterFouls = useMemo(() => {
    if (!currentMatch) return { home: 0, away: 0 }
    return getTeamFoulsByQuarter(allEvents, currentMatch.quarter)
  }, [currentMatch, allEvents])

  const groupedLog = useMemo(() => getEventsByQuarter(allEvents), [allEvents])
  const fixableScoringEvents = useMemo(() => getFixableScoringEvents(allEvents), [allEvents])
  const quarterScores = useMemo(() => getAllQuarterScores(allEvents), [allEvents])
  const isHalftimeSummary = currentMatch?.quarter === 2
  const quarterSummaryTitle = isHalftimeSummary ? 'Half-Time Summary' : `Quarter ${currentMatch?.quarter} Summary`
  const halftimeEvents = useMemo(
    () => allEvents.filter((evt) => evt.quarter === 1 || evt.quarter === 2),
    [allEvents]
  )
  const halftimeHomeEvents = useMemo(
    () => halftimeEvents.filter((evt) => evt.teamKey === 'home'),
    [halftimeEvents]
  )
  const halftimeAwayEvents = useMemo(
    () => halftimeEvents.filter((evt) => evt.teamKey === 'away'),
    [halftimeEvents]
  )
  const halftimeTotals = useMemo(() => {
    if (!currentMatch) {
      return {
        home: getEmptyStatLine(),
        away: getEmptyStatLine(),
      }
    }

    return {
      home: getTeamTotals(currentMatch.home.players, halftimeHomeEvents),
      away: getTeamTotals(currentMatch.away.players, halftimeAwayEvents),
    }
  }, [currentMatch, halftimeAwayEvents, halftimeHomeEvents])
  const halftimeScore = useMemo(
    () => ({
      home: quarterScores[1].home + quarterScores[2].home,
      away: quarterScores[1].away + quarterScores[2].away,
    }),
    [quarterScores]
  )

  function resetNewMatchForm() {
    setNewMatch({
      opponentName: '',
      opponentCoachName: '',
      opponentPlayers: [
        createPlayer('Opponent 1', '1'),
        createPlayer('Opponent 2', '2'),
        createPlayer('Opponent 3', '3'),
        createPlayer('Opponent 4', '4'),
        createPlayer('Opponent 5', '5'),
      createPlayer('Opponent 6', '6'),
      createPlayer('Opponent 7', '7'),
    ],
      date: getTodayDateString(),
      venue: '',
      opponentColor: DEFAULT_AWAY_COLOR,
      opponentSecondaryColor: DEFAULT_AWAY_SECONDARY_COLOR,
    })
    setStartingFive({ home: [], away: [] })
  }

  function flashPlayer(playerId, flashClass) {
  if (!playerId) return

  setPlayerFlashMap((prev) => ({
    ...prev,
    [playerId]: flashClass,
  }))

  setTimeout(() => {
    setPlayerFlashMap((prev) => {
      const next = { ...prev }
      delete next[playerId]
      return next
    })
  }, 450)
}
  async function addHomePlayer() {
    const name = homePlayerName.trim()
    const number = homePlayerNumber.trim()

    if (!name || !number) {
      alert('Enter both player name and jersey number.')
      return
    }

    if (homeTeam.players.some((p) => p.number === number)) {
      alert('That jersey number already exists on the home team.')
      return
    }

    if (!homeTeamId) {
      alert('Home team is still loading.')
      return
    }

    const { data, error } = await supabase
      .from('players')
      .insert({
        team_id: homeTeamId,
        name,
        number,
      })
      .select('id, name, number')
      .single()

    if (error) {
      console.error('Failed to add player:', error)
      alert('Failed to add player.')
      return
    }

    setHomeTeam((prev) => ({
      ...prev,
      players: [...prev.players, data],
    }))
    setHomePlayerName('')
    setHomePlayerNumber('')
  }

  async function removeHomePlayer(playerId) {
    const { error } = await supabase.from('players').delete().eq('id', playerId)

    if (error) {
      console.error('Failed to remove player:', error)
      alert('Failed to remove player.')
      return
    }

    setHomeTeam((prev) => ({
      ...prev,
      players: prev.players.filter((p) => p.id !== playerId),
    }))
    setStartingFive((prev) => ({
      ...prev,
      home: prev.home.filter((id) => id !== playerId),
    }))
  }

  function addOpponentPlayer() {
    const name = opponentPlayerName.trim()
    const number = opponentPlayerNumber.trim()

    if (!name || !number) {
      alert('Enter both opponent player name and jersey number.')
      return
    }

    if (newMatch.opponentPlayers.some((p) => p.number === number)) {
      alert('That jersey number already exists on the opponent team.')
      return
    }

    setNewMatch((prev) => ({
      ...prev,
      opponentPlayers: [...prev.opponentPlayers, createPlayer(name, number)],
    }))
    setOpponentPlayerName('')
    setOpponentPlayerNumber('')
  }

  function removeOpponentPlayer(playerId) {
    setNewMatch((prev) => ({
      ...prev,
      opponentPlayers: prev.opponentPlayers.filter((p) => p.id !== playerId),
    }))
    setStartingFive((prev) => ({
      ...prev,
      away: prev.away.filter((id) => id !== playerId),
    }))
  }

  function newMatchFromHome() {
    resetNewMatchForm()
    setScreen('newMatch')
  }

  function goToStartingFiveSetup() {
    const opponentName = newMatch.opponentName.trim() || 'Opponent'
    const today = getTodayDateString()

    if (homeTeam.players.length < 5) {
      alert('Home team must have at least 5 players.')
      return
    }

    if (newMatch.opponentPlayers.length < 5) {
      alert('Opponent team must have at least 5 players.')
      return
    }

    if (newMatch.date && newMatch.date < today) {
      alert('Match date cannot be in the past.')
      return
    }

    setNewMatch((prev) => ({
      ...prev,
      opponentName,
    }))

    setStartingFive({
      home: getInitialOnCourt(homeTeam.players),
      away: getInitialOnCourt(newMatch.opponentPlayers),
    })

    setScreen('startingFive')
  }

  async function startMatch() {
    if (startingFive.home.length !== 5) {
      alert('Select exactly 5 starters for the home team.')
      return
    }

    if (startingFive.away.length !== 5) {
      alert('Select exactly 5 starters for the away team.')
      return
    }

    const homePlayersForMatch = homeTeam.players.map((player) => ({
      ...player,
      teamColor: homeTeam.color || HOME_TEAM_COLOR,
      teamSecondaryColor: homeTeam.secondaryColor || HOME_TEAM_SECONDARY_COLOR,
    }))
    const awayPlayersForMatch = newMatch.opponentPlayers.map((player) => ({
      ...player,
      teamColor: newMatch.opponentColor || DEFAULT_AWAY_COLOR,
      teamSecondaryColor:
        newMatch.opponentSecondaryColor || DEFAULT_AWAY_SECONDARY_COLOR,
    }))

    const match = {
      id: Date.now().toString(),
      date: newMatch.date || new Date().toISOString().slice(0, 10),
      venue: newMatch.venue || '',
      quarter: 1,
      home: {
        name: homeTeam.name.trim() || 'Home Team',
        coachName: homeTeam.coachName?.trim() || DEFAULT_HOME_COACH_NAME,
        color: homeTeam.color || HOME_TEAM_COLOR,
        secondaryColor: homeTeam.secondaryColor || HOME_TEAM_SECONDARY_COLOR,
        players: homePlayersForMatch,
        onCourt: [...startingFive.home],
      },
      away: {
        name: newMatch.opponentName.trim() || 'Opponent',
        coachName: newMatch.opponentCoachName.trim() || DEFAULT_AWAY_COACH_NAME,
        color: newMatch.opponentColor || DEFAULT_AWAY_COLOR,
        secondaryColor:
          newMatch.opponentSecondaryColor || DEFAULT_AWAY_SECONDARY_COLOR,
        players: awayPlayersForMatch,
        onCourt: [...startingFive.away],
      },
      events: [],
    }

    const baseInsertPayload = {
      home_team_id: homeTeamId,
      home_team_name: match.home.name,
      away_team_name: match.away.name,
      date: match.date,
      venue: match.venue,
      quarter: match.quarter,
      status: 'live',
      final_score_home: 0,
      final_score_away: 0,
      quarter_scores: {
        1: { home: 0, away: 0 },
        2: { home: 0, away: 0 },
        3: { home: 0, away: 0 },
        4: { home: 0, away: 0 },
      },
      home_players: match.home.players,
      away_players: match.away.players,
      home_on_court: match.home.onCourt,
      away_on_court: match.away.onCourt,
    }

    let { data: insertedMatch, error } = await supabase
      .from('matches')
      .insert({
        ...baseInsertPayload,
        home_coach_name: match.home.coachName,
        away_coach_name: match.away.coachName,
      })
      .select('id')
      .single()

    if (error) {
      const retry = await supabase.from('matches').insert(baseInsertPayload).select('id').single()
      insertedMatch = retry.data
      error = retry.error
    }

    if (error) {
      console.error('Failed to create live match:', error)
      alert('Failed to start match.')
      return
    }

    setCurrentMatch(match)
    setCurrentMatchId(insertedMatch.id)
    setLiveMatches((prev) => [{ ...insertedMatch, updated_at: new Date().toISOString() }, ...prev])
    setSelectedTeam('home')
    setSelectedPlayerId(match.home.onCourt[0] || '')
    setScreen('live')
  }

  function changeQuarter(delta) {
    if (!currentMatch || delta === 0) return
    alert('Use Quarter Over to move to the next quarter.')
  }

  function advanceQuarterFromSummary() {
    if (!currentMatch || currentMatch.quarter >= 4) return
    setCurrentMatch((prev) => ({
      ...prev,
      quarter: prev.quarter + 1,
    }))
  }

  function getAssistOptions(teamKey, shooterId) {
    if (!currentMatch) return []
    const team = currentMatch[teamKey]
    return team.onCourt
      .filter((id) => id !== shooterId)
      .map((id) => findPlayerById(team.players, id))
      .filter(Boolean)
  }

  function getOnCourtOpponents(teamKey) {
    if (!currentMatch) return []
    const oppKey = teamKey === 'home' ? 'away' : 'home'
    const oppTeam = currentMatch[oppKey]
    return oppTeam.onCourt
      .map((id) => findPlayerById(oppTeam.players, id))
      .filter(Boolean)
  }

  function getOnCourtPlayers(teamKey) {
    if (!currentMatch) return []
    const team = currentMatch[teamKey]
    return team.onCourt
      .map((id) => findPlayerById(team.players, id))
      .filter(Boolean)
  }

  function closeShotModal() {
    setShotModal({
      open: false,
      shotType: '',
      result: '',
    })
  }

  function closeCourtShotFlow() {
    setCourtShotFlow({
      open: false,
      step: 'idle',
      mode: 'missed',
      shooterTeamKey: '',
      shooterId: '',
      shotType: '',
      isDunk: false,
      location: null,
      suggestedTeamKey: 'home',
      suggestedShotType: '2PT',
    })
  }

  function closeCourtReboundPrompt() {
    setCourtReboundPrompt({
      open: false,
      relatedShotEventId: '',
    })
  }

  function closeBlockPrompt() {
    setBlockPrompt({
      open: false,
      step: 'ask',
      relatedShotEventId: '',
      shotTeamKey: '',
      promptForRebound: false,
    })
  }

  function closePendingActionSelection() {
    setPendingActionSelection({
      open: false,
      action: '',
    })
  }

  function openCoachBenchModal(teamKey) {
    setCoachBenchModal({
      open: true,
      teamKey,
    })
  }

  function closeCoachBenchModal() {
    setCoachBenchModal({
      open: false,
      teamKey: '',
    })
  }

  function beginActionSelection(action) {
    closeCourtShotFlow()
    setPendingActionSelection({
      open: true,
      action,
    })
  }

  function openCourtShotFlow(mode, location) {
    if (!currentMatch) return

    const suggestedTeamKey = getSuggestedTeamKeyFromLocation(location, currentMatch.quarter)
    const suggestedShotType = getSuggestedShotTypeFromLocation(
      location,
      suggestedTeamKey,
      currentMatch.quarter
    )

    setCourtShotFlow({
      open: true,
      step: mode === 'made' ? 'shotType' : 'awaitSelection',
      mode,
      shooterTeamKey: '',
      shooterId: '',
      shotType: mode === 'made' ? suggestedShotType : '',
      isDunk: false,
      location,
      suggestedTeamKey,
      suggestedShotType,
    })
  }

  function chooseCourtShotType(shotType) {
    const normalizedShotType = shotType === 'DUNK' ? '2PT' : shotType
    const isDunk = shotType === 'DUNK'

    if (courtShotFlow.mode === 'missed' && courtShotFlow.shooterId && courtShotFlow.shooterTeamKey) {
      recordShot({
        teamKey: courtShotFlow.shooterTeamKey,
        shooterId: courtShotFlow.shooterId,
        shotType: normalizedShotType,
        result: 'missed',
        shotLocation: courtShotFlow.location,
        promptForRebound: true,
        isDunk: false,
      })
      closeCourtShotFlow()
      return
    }

    setCourtShotFlow((prev) => ({
      ...prev,
      shotType: normalizedShotType,
      isDunk,
      step: 'awaitSelection',
    }))
  }

  function chooseCourtShotShooter(teamKey, shooterId) {
    if (!courtShotFlow.open) return
    if (courtShotFlow.step === 'awaitSelection' && teamKey !== courtShotFlow.suggestedTeamKey) return

    if (courtShotFlow.mode === 'missed' && !courtShotFlow.shotType) {
      setCourtShotFlow((prev) => ({
        ...prev,
        shooterTeamKey: teamKey,
        shooterId,
        shotType: prev.suggestedShotType,
        step: 'shotType',
      }))
      return
    }

    recordShot({
      teamKey,
      shooterId,
      shotType: courtShotFlow.shotType,
      result: courtShotFlow.mode === 'made' ? 'made' : 'missed',
      shotLocation: courtShotFlow.location,
      promptForRebound: courtShotFlow.mode === 'missed',
      isDunk: courtShotFlow.mode === 'made' ? courtShotFlow.isDunk : false,
    })
    closeCourtShotFlow()
  }

  function handlePendingActionPlayer(teamKey, playerId) {
    if (!pendingActionSelection.open) return

    setSelectedTeam(teamKey)
    setSelectedPlayerId(playerId)

    if (pendingActionSelection.action === 'shot') {
      closePendingActionSelection()
      setShotModal({ open: true, shotType: '', result: '' })
      return
    }

    if (pendingActionSelection.action === 'foul') {
      closePendingActionSelection()
      openTeamFoulModal(teamKey, playerId)
      return
    }

    if (pendingActionSelection.action === 'turnover') {
      closePendingActionSelection()
      setTurnoverModal({
        open: true,
        step: 'category',
        teamKey,
        playerId,
        category: '',
        violationType: '',
      })
      return
    }

    if (pendingActionSelection.action === 'rebound') {
      closePendingActionSelection()
      setReboundModal({
        open: true,
        relatedShotEventId: '',
        mode: 'choice',
        reboundType: '',
        pickerTeamKey: teamKey,
        playerId,
      })
    }
  }

  function closeFreeThrowFlow() {
    setFreeThrowFlow({
      open: false,
      step: 'count',
      total: 1,
      current: 1,
      teamKey: '',
      shooterId: '',
    })
  }

  function chooseFreeThrowCount(total) {
    setFreeThrowFlow((prev) => ({
      ...prev,
      total,
      current: 1,
      step: 'attempt',
    }))
  }

  function submitFreeThrowAttempt(result) {
    if (!currentMatch || !freeThrowFlow.open) return

    const { teamKey, shooterId, total, current } = freeThrowFlow
    const team = currentMatch[teamKey]
    const lineupSnapshot = [...team.onCourt]

    const ftEvent = createEvent({
      quarter: currentMatch.quarter,
      teamKey,
      type: 'shot',
      shotType: 'FT',
      result,
      shooterId,
      assistPlayerId: null,
      blockerId: null,
      points: result === 'made' ? 1 : 0,
      lineupSnapshot,
      freeThrowNumber: current,
      freeThrowTotal: total,
    })

    const updatedMatch = {
      ...currentMatch,
      events: [...currentMatch.events, ftEvent],
    }

    setCurrentMatch(updatedMatch)
    flashPlayer(shooterId, result === 'made' ? 'player-made' : 'player-missed')

    if (current < total) {
      setFreeThrowFlow((prev) => ({
        ...prev,
        current: prev.current + 1,
      }))
    } else {
      closeFreeThrowFlow()
    }
  }

  function continueMissedShotFlow(shotEventId, promptForRebound = false, mode = 'auto') {
    if (!shotEventId) return

    if (mode === 'none') {
      return
    }

    if (mode === 'prompt' && promptForRebound) {
      setCourtReboundPrompt({
        open: true,
        relatedShotEventId: shotEventId,
      })
      return
    }

    setReboundModal({
      open: true,
      relatedShotEventId: shotEventId,
      mode: 'choice',
      reboundType: '',
      pickerTeamKey: '',
      playerId: '',
    })
  }

  function chooseMissOutcome(outcome) {
    if (!blockPrompt.open) return

    if (outcome === 'none') {
      closeBlockPrompt()
      return
    }

    if (outcome === 'rebound') {
      const relatedShotEventId = blockPrompt.relatedShotEventId
      closeBlockPrompt()
      continueMissedShotFlow(relatedShotEventId, false, 'choice')
      return
    }

    setBlockPrompt((prev) => ({
      ...prev,
      step: 'picker',
    }))
  }

  function chooseBlocker(playerId) {
    if (!currentMatch || !blockPrompt.relatedShotEventId || !playerId) return

    const updatedMatch = {
      ...currentMatch,
      events: currentMatch.events.map((evt) =>
        evt.id === blockPrompt.relatedShotEventId
          ? {
              ...evt,
              blockerId: playerId,
            }
          : evt
      ),
    }

    const relatedShotEventId = blockPrompt.relatedShotEventId

    setCurrentMatch(updatedMatch)
    flashPlayer(playerId, 'player-made')
    closeBlockPrompt()
    continueMissedShotFlow(relatedShotEventId, false, 'none')
  }

  function recordShot({
    teamKey,
    shooterId,
    shotType,
    result,
    shotLocation = null,
    promptForRebound = false,
    isDunk = false,
  }) {
    if (!currentMatch || !teamKey || !shooterId || !shotType) return

    const team = currentMatch[teamKey]
    const lineupSnapshot = [...team.onCourt]

    if (shotType === 'FT') {
      setFreeThrowFlow({
        open: true,
        step: 'count',
        total: 1,
        current: 1,
        teamKey,
        shooterId,
      })
      return
    }

    if (result === 'made' && (shotType === '2PT' || shotType === '3PT')) {
      setAssistModal({
        open: true,
        teamKey,
        shooterId,
        shotType,
        isDunk,
        shotLocation,
      })
      return
    }

    const points =
      result === 'made'
        ? shotType === '2PT'
          ? 2
          : shotType === '3PT'
            ? 3
            : 1
        : 0

    const shotEvent = createEvent({
      quarter: currentMatch.quarter,
      teamKey,
      type: 'shot',
      shotType,
      result,
      shooterId,
      assistPlayerId: null,
      blockerId: null,
      points,
      lineupSnapshot,
      shotLocation,
      isDunk,
    })

    const updatedMatch = {
      ...currentMatch,
      events: [...currentMatch.events, shotEvent],
    }

    setCurrentMatch(updatedMatch)

    if (result === 'missed') {
      flashPlayer(shooterId, 'player-missed')
      setBlockPrompt({
        open: true,
        step: 'ask',
        relatedShotEventId: shotEvent.id,
        shotTeamKey: teamKey,
        promptForRebound,
      })
      return
    }

    flashPlayer(shooterId, 'player-made')
  }

  function submitShot() {
    if (!currentMatch || !selectedPlayerId) return
    const { shotType, result } = shotModal
    if (!shotType) return
    if (shotType !== 'FT' && !result) return
    closeShotModal()
    recordShot({
      teamKey: selectedTeam,
      shooterId: selectedPlayerId,
      shotType,
      result,
      shotLocation: null,
    })
  }

  function completeMadeBasket(assistPlayerId = null) {
    if (!currentMatch || !assistModal.open) return

    const { teamKey, shooterId, shotType, isDunk, shotLocation } = assistModal
    const team = currentMatch[teamKey]
    const lineupSnapshot = [...team.onCourt]

    const shotEvent = createEvent({
      quarter: currentMatch.quarter,
      teamKey,
      type: 'shot',
      shotType,
      result: 'made',
      shooterId,
      assistPlayerId,
      blockerId: null,
      points: shotType === '2PT' ? 2 : 3,
      lineupSnapshot,
      shotLocation,
      isDunk,
    })

    setCurrentMatch({
      ...currentMatch,
      events: [...currentMatch.events, shotEvent],
    })

  flashPlayer(shooterId, 'player-made')
  if (assistPlayerId) {
  flashPlayer(assistPlayerId, 'player-sub-in')
}

    setAssistModal({
      open: false,
      teamKey: '',
      shooterId: '',
      shotType: '',
      isDunk: false,
      shotLocation: null,
    })
  }

  function closeFoulModal() {
    setFoulModal(createEmptyFoulModal())
  }

  function openTeamFoulModal(teamKey, playerId = '') {
    setFoulModal({
      open: true,
      step: playerId ? 'type' : 'fouler',
      foulerTeamKey: teamKey,
      foulerId: playerId,
      chargedEntity: 'player',
      actorScope: 'all',
      foulType: '',
      fouledPlayerId: '',
      freeThrowCount: 0,
      freeThrowShooterId: '',
    })
  }

  function openCoachBenchTechnical(teamKey, chargedEntity) {
    setFoulModal({
      open: true,
      step: 'shots',
      foulerTeamKey: teamKey,
      foulerId: getCoachFoulerId(teamKey),
      chargedEntity,
      actorScope: 'staff',
      foulType: 'technical',
      fouledPlayerId: '',
      freeThrowCount: 0,
      freeThrowShooterId: '',
    })
  }

  function openStaffFoulModal(teamKey) {
    setFoulModal({
      open: true,
      step: 'actor',
      foulerTeamKey: teamKey,
      foulerId: '',
      chargedEntity: 'player',
      actorScope: 'staff',
      foulType: 'technical',
      fouledPlayerId: '',
      freeThrowCount: 0,
      freeThrowShooterId: '',
    })
  }

  function setFoulType(foulType) {
    setFoulModal((prev) => {
      const freeThrowOptions = FOUL_TYPE_CONFIG[foulType]?.freeThrows || [0]
      const noFreeThrowsOnly = freeThrowOptions.length === 1 && freeThrowOptions[0] === 0
      const hasFouler = Boolean(prev.foulerId)
      const nextStep = noFreeThrowsOnly
        ? hasFouler
          ? foulRequiresFouledPlayer(foulType, 'player')
            ? 'target'
            : 'complete'
          : 'fouler'
        : foulType === 'technical'
          ? 'actor'
          : hasFouler
            ? foulRequiresFouledPlayer(foulType, 'player')
              ? 'target'
              : 'shots'
            : 'fouler'

      const nextState = {
        ...prev,
        foulType,
        chargedEntity: foulType === 'technical' ? prev.chargedEntity : 'player',
        actorScope: foulType === 'technical' ? prev.actorScope : 'all',
        fouledPlayerId: '',
        freeThrowCount: 0,
        freeThrowShooterId: '',
        step: nextStep,
      }

      if (foulType !== 'technical' && !hasFouler) {
        nextState.foulerId = ''
      }

      if (noFreeThrowsOnly && hasFouler && !foulRequiresFouledPlayer(foulType, 'player')) {
        window.setTimeout(() => finalizeFoul({ ...nextState, open: true, freeThrowCount: 0 }), 0)
      }

      return nextState
    })
  }

  function chooseTechnicalActor(chargedEntity) {
    setFoulModal((prev) => ({
      ...prev,
      chargedEntity,
      foulerId: chargedEntity === 'player' ? '' : getCoachFoulerId(prev.foulerTeamKey),
      step: chargedEntity === 'player' ? 'fouler' : 'shots',
    }))
  }

  function chooseFouler(playerId) {
    const freeThrowOptions = FOUL_TYPE_CONFIG[foulModal.foulType]?.freeThrows || [0]
    const noFreeThrowsOnly = freeThrowOptions.length === 1 && freeThrowOptions[0] === 0
    const needsTarget = foulRequiresFouledPlayer(foulModal.foulType, 'player')
    const nextState = {
      ...foulModal,
      chargedEntity: 'player',
      foulerId: playerId,
      step: noFreeThrowsOnly ? (needsTarget ? 'target' : 'complete') : needsTarget ? 'target' : 'shots',
    }

    setFoulModal(nextState)

    if (noFreeThrowsOnly && !needsTarget) {
      window.setTimeout(() => finalizeFoul({ ...nextState, open: true, freeThrowCount: 0 }), 0)
    }
  }

  function chooseFoulTarget(playerId) {
    const freeThrowOptions = FOUL_TYPE_CONFIG[foulModal.foulType]?.freeThrows || [0]
    const noFreeThrowsOnly = freeThrowOptions.length === 1 && freeThrowOptions[0] === 0
    const nextState = {
      ...foulModal,
      fouledPlayerId: playerId,
      step: noFreeThrowsOnly ? 'complete' : 'shots',
    }

    setFoulModal(nextState)

    if (noFreeThrowsOnly) {
      window.setTimeout(() => finalizeFoul({ ...nextState, open: true, freeThrowCount: 0 }), 0)
    }
  }

  function startFreeThrowSeries(teamKey, shooterId, total) {
    setFreeThrowFlow({
      open: true,
      step: 'attempt',
      total,
      current: 1,
      teamKey,
      shooterId,
    })
  }

  function finalizeFoul(override = {}) {
    if (!currentMatch || !foulModal.open) return

    const activeFoul = { ...foulModal, ...override }
    const {
      foulerTeamKey,
      foulerId,
      chargedEntity,
      foulType,
      fouledPlayerId,
      freeThrowCount,
      freeThrowShooterId,
    } = activeFoul

    if (!foulerTeamKey || !foulerId || !foulType) return

    const team = currentMatch[foulerTeamKey]
    const shootingTeamKey = foulerTeamKey === 'home' ? 'away' : 'home'
    const countsAsTeamFoul = foulCountsAsTeamFoul(foulType, chargedEntity)

    const foulEvent = createEvent({
      quarter: currentMatch.quarter,
      teamKey: foulerTeamKey,
      type: 'foul',
      foulType,
      foulerId,
      chargedEntity,
      fouledPlayerId: fouledPlayerId || null,
      freeThrowsAwarded: freeThrowCount,
      freeThrowShooterId: freeThrowCount > 0 ? freeThrowShooterId : null,
      countsAsTeamFoul,
      retainsPossession: foulType === 'unsportsmanlike',
      lineupSnapshot: [...team.onCourt],
    })

    const updatedMatch = {
      ...currentMatch,
      events: [...currentMatch.events, foulEvent],
    }

    setCurrentMatch(updatedMatch)
    if (chargedEntity === 'player') {
      flashPlayer(foulerId, 'player-foul-flash')
    }
    closeFoulModal()

    if (freeThrowCount > 0 && freeThrowShooterId) {
      startFreeThrowSeries(shootingTeamKey, freeThrowShooterId, freeThrowCount)
    }

    if (chargedEntity === 'player') {
      const teamEvents = updatedMatch.events.filter((e) => e.teamKey === foulerTeamKey)
      const teamStats = getPlayerStatsFromEvents(team.players, teamEvents)
      const fouls = teamStats[foulerId]?.foul || 0
      const unsportsmanlikeFouls = getPlayerFoulTypeCount(teamEvents, foulerTeamKey, foulerId, 'unsportsmanlike')
      const disqualifyingFouls = getPlayerFoulTypeCount(teamEvents, foulerTeamKey, foulerId, 'disqualifying')
      const player = findPlayerById(team.players, foulerId)

      if (fouls === 4) {
        alert(`${formatPlayer(player)} is on 4 fouls.`)
      }

      const mustBeEjected = fouls >= 5 || disqualifyingFouls >= 1 || unsportsmanlikeFouls >= 2

      if (mustBeEjected) {
        let message = `${formatPlayer(player)} has fouled out and must be substituted.`

        if (disqualifyingFouls >= 1) {
          message = `${formatPlayer(player)} has been disqualified and must be ejected and substituted.`
        } else if (unsportsmanlikeFouls >= 2) {
          message = `${formatPlayer(player)} has 2 unsportsmanlike fouls and must be ejected and substituted.`
        }

        alert(message)

        if (team.onCourt.includes(foulerId)) {
          setSubModal({
            open: true,
            teamKey: foulerTeamKey,
            outgoingPlayerId: foulerId,
          })
        }
      }

      return
    }

    const coachFouls = getCoachFoulCount(updatedMatch.events, foulerTeamKey)
    if (coachFouls === COACH_FOUL_LIMIT - 1) {
      alert(`${getCoachDisplayName(updatedMatch[foulerTeamKey].coachName)} is on ${coachFouls} technical fouls.`)
    }
    if (coachFouls >= COACH_FOUL_LIMIT) {
      alert(`${getCoachDisplayName(updatedMatch[foulerTeamKey].coachName)} has been ejected on ${coachFouls} technical fouls.`)
    }
  }

  function chooseFoulShots(count) {
    setFoulModal((prev) => {
      const nextState = {
        ...prev,
        freeThrowCount: count,
        freeThrowShooterId: '',
        step: count > 0 ? 'shooter' : 'shots',
      }

      if (count === 0) {
        window.setTimeout(() => finalizeFoul({ ...nextState, open: true }), 0)
      }

      return nextState
    })
  }

  function chooseFoulShooter(playerId) {
    const nextFoul = {
      ...foulModal,
      freeThrowShooterId: playerId,
    }
    setFoulModal(nextFoul)
    finalizeFoul(nextFoul)
  }

  function openReboundModal() {
    setReboundModal({
      open: true,
      relatedShotEventId: '',
      mode: 'choice',
      reboundType: '',
      pickerTeamKey: '',
      playerId: '',
    })
  }

  function closeReboundModal() {
    setReboundModal({
      open: false,
      relatedShotEventId: '',
      mode: 'choice',
      reboundType: '',
      pickerTeamKey: '',
      playerId: '',
    })
  }

  function answerCourtReboundPrompt(hasRebound) {
    if (!hasRebound) {
      closeCourtReboundPrompt()
      return
    }

    setReboundModal({
      open: true,
      relatedShotEventId: courtReboundPrompt.relatedShotEventId,
      mode: 'choice',
      reboundType: '',
      pickerTeamKey: '',
      playerId: '',
    })
    closeCourtReboundPrompt()
  }

  function chooseReboundType(reboundType) {
    if (!currentMatch) return

    if (reboundType === 'none') {
      closeReboundModal()
      return
    }

    if (reboundType === 'team') {
      const relatedShot = currentMatch.events.find((e) => e.id === reboundModal.relatedShotEventId)
      const fallbackTeamKey = relatedShot ? relatedShot.teamKey : selectedTeam
      submitRebound('team', fallbackTeamKey, null)
      return
    }

    const relatedShot = currentMatch.events.find((e) => e.id === reboundModal.relatedShotEventId)
    if (!relatedShot && reboundModal.playerId) {
      submitRebound(reboundType, reboundModal.pickerTeamKey, reboundModal.playerId)
      return
    }

    if (!relatedShot) return

    if (reboundType === 'oreb') {
      setReboundModal((prev) => ({
        ...prev,
        mode: 'player',
        reboundType: 'oreb',
        pickerTeamKey: relatedShot.teamKey,
      }))
      return
    }

    if (reboundType === 'dreb') {
      setReboundModal((prev) => ({
        ...prev,
        mode: 'player',
        reboundType: 'dreb',
        pickerTeamKey: relatedShot.teamKey === 'home' ? 'away' : 'home',
      }))
    }
  }

  function submitRebound(reboundType, teamKey = '', playerId = null) {
    if (!currentMatch) return

    const team = currentMatch[teamKey]
    const evt = createEvent({
      quarter: currentMatch.quarter,
      teamKey,
      type: 'rebound',
      reboundType,
      playerId,
      relatedShotEventId: reboundModal.relatedShotEventId || null,
      lineupSnapshot: [...team.onCourt],
    })

    setCurrentMatch({
      ...currentMatch,
      events: [...currentMatch.events, evt],
    })

    closeReboundModal()
  }

  function closeTurnoverModal() {
    setTurnoverModal({
      open: false,
      step: 'category',
      teamKey: '',
      playerId: '',
      category: '',
      violationType: '',
    })
  }

  function chooseTurnoverCategory(category) {
    const config = TURNOVER_CATEGORY_CONFIG[category]
    if (!config) return

    if (category === 'violation') {
      setTurnoverModal((prev) => ({
        ...prev,
        category,
        step: 'violationType',
      }))
      return
    }

    if (config.asksSteal) {
      setTurnoverModal((prev) => ({
        ...prev,
        category,
        step: 'steal',
      }))
      return
    }

    submitTurnover({
      category,
      violationType: '',
      forcedByPlayerId: null,
    })
  }

  function chooseTurnoverViolationType(violationType) {
    submitTurnover({
      category: 'violation',
      violationType,
      forcedByPlayerId: null,
    })
  }

  function submitTurnover({ category, violationType = '', forcedByPlayerId = null }) {
    if (!currentMatch || !turnoverModal.open) return

    const { teamKey, playerId } = turnoverModal
    const team = currentMatch[teamKey]

    const evt = createEvent({
      quarter: currentMatch.quarter,
      teamKey,
      type: 'turnover',
      playerId,
      turnoverCategory: category,
      turnoverViolationType: violationType,
      forcedByPlayerId,
      lineupSnapshot: [...team.onCourt],
    })

    setCurrentMatch({
      ...currentMatch,
      events: [...currentMatch.events, evt],
    })

    closeTurnoverModal()
  }

  function openFixAssistModal() {
    setFixAssistModal({
      open: true,
      scoringEventId: '',
    })
  }

  function assignAssistToShotEvent(eventId, assistPlayerId) {
    if (!currentMatch) return

    setCurrentMatch({
      ...currentMatch,
      events: currentMatch.events.map((evt) =>
        evt.id === eventId ? { ...evt, assistPlayerId } : evt
      ),
    })

    setFixAssistModal({
      open: false,
      scoringEventId: '',
    })
  }

  function undoEvent(eventId) {
    if (!currentMatch) return
    setCurrentMatch({
      ...currentMatch,
      events: currentMatch.events.filter((evt) => evt.id !== eventId),
    })
  }

  function openSubModal(teamKey, outgoingPlayerId) {
    setSubModal({
      open: true,
      teamKey,
      outgoingPlayerId,
    })
  }

  function closeSubModal() {
    setSubModal({
      open: false,
      teamKey: '',
      outgoingPlayerId: '',
    })
  }

  function makeSubstitution(incomingPlayerId) {
    if (!currentMatch || !subModal.open) return

    const { teamKey, outgoingPlayerId } = subModal
    const team = currentMatch[teamKey]
    const lineupBefore = [...team.onCourt]
    const updatedOnCourt = team.onCourt.map((id) =>
      id === outgoingPlayerId ? incomingPlayerId : id
    )

    const subEvent = createEvent({
      quarter: currentMatch.quarter,
      teamKey,
      type: 'substitution',
      playerOutId: outgoingPlayerId,
      playerInId: incomingPlayerId,
      lineupBefore,
      lineupAfter: [...updatedOnCourt],
    })

    setCurrentMatch({
      ...currentMatch,
      [teamKey]: {
        ...team,
        onCourt: updatedOnCourt,
      },
      events: [...currentMatch.events, subEvent],
    })

    flashPlayer(incomingPlayerId, 'player-sub-in')
    flashPlayer(outgoingPlayerId, 'player-missed')

    if (selectedTeam === teamKey && selectedPlayerId === outgoingPlayerId) {
      setSelectedPlayerId(incomingPlayerId)
    }

    closeSubModal()
  }

  function getBenchPlayers(teamKey) {
    if (!currentMatch) return []
    const team = currentMatch[teamKey]
    return team.players.filter((player) => !team.onCourt.includes(player.id))
  }

  function endMatch() {
    if (!currentMatch) return
    if (currentMatch.quarter < 4) {
      alert('You can only end the match in Q4.')
      return
    }
    setScreen('summary')
  }

  async function saveMatch() {
    if (!currentMatch) return

    const finalScore = {
      home: getTeamTotals(currentMatch.home.players, homeEvents).points,
      away: getTeamTotals(currentMatch.away.players, awayEvents).points,
    }

    const matchToSave = {
      ...currentMatch,
      savedAt: new Date().toISOString(),
      finalScore,
      quarterScores: getAllQuarterScores(currentMatch.events),
    }

    if (!currentMatchId) {
      alert('Current live match is missing.')
      return
    }

    const { data: updatedMatch, error: matchError } = await supabase
      .from('matches')
      .update({
        home_team_id: homeTeamId,
        home_team_name: currentMatch.home.name,
        away_team_name: currentMatch.away.name,
        date: currentMatch.date || '',
        venue: currentMatch.venue || '',
        quarter: currentMatch.quarter,
        status: 'completed',
        final_score_home: finalScore.home,
        final_score_away: finalScore.away,
        quarter_scores: matchToSave.quarterScores,
        home_players: currentMatch.home.players,
        away_players: currentMatch.away.players,
        home_on_court: currentMatch.home.onCourt,
        away_on_court: currentMatch.away.onCourt,
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .eq('id', currentMatchId)
      .single()

    if (matchError) {
      console.error('Failed to save match to Supabase:', matchError)
      alert('Failed to save match.')
      return
    }

    setSavedMatches((prev) => [
      mapSupabaseMatchRow(updatedMatch, currentMatch.events),
      ...prev,
    ])
    setLiveMatches((prev) => prev.filter((match) => match.id !== currentMatchId))
    setCurrentMatch(null)
    setCurrentMatchId(null)
    setSelectedPlayerId('')
    setScreen('home')
    resetNewMatchForm()
  }

  async function discardCurrentMatch() {
    const ok = window.confirm('Discard the current unfinished match?')
    if (!ok) return

    if (currentMatchId) {
      const { error } = await supabase.from('matches').delete().eq('id', currentMatchId)

      if (error) {
        console.error('Failed to discard current match:', error)
        alert('Failed to discard current match.')
        return
      }
    }

    setCurrentMatch(null)
    setLiveMatches((prev) => prev.filter((match) => match.id !== currentMatchId))
    setCurrentMatchId(null)
    setSelectedPlayerId('')
    setScreen('home')
  }

  async function discardLiveMatch(matchId, matchupLabel = 'this live match') {
    const ok = window.confirm(`Discard ${matchupLabel}? This cannot be undone.`)
    if (!ok) return

    const { error } = await supabase.from('matches').delete().eq('id', matchId)

    if (error) {
      console.error('Failed to discard selected live match:', error)
      alert('Failed to discard live match.')
      return
    }

    setLiveMatches((prev) => prev.filter((match) => match.id !== matchId))

    if (currentMatchId === matchId) {
      setCurrentMatch(null)
      setCurrentMatchId(null)
      setSelectedTeam('home')
      setSelectedPlayerId('')
      setScreen('home')
      setBottomPanelOpen(false)
    }
  }

  async function clearSavedMatches() {
    const ok = window.confirm('Delete all saved matches?')
    if (!ok) return

    const { error } = await supabase.from('matches').delete().eq('status', 'completed')

    if (error) {
      console.error('Failed to clear saved matches:', error)
      alert('Failed to clear saved matches.')
      return
    }

    setSavedMatches([])
  }

  function renderStarterPicker(teamName, players, selectedIds, teamKey) {
    return (
      <div className="starter-card">
        <div className="starter-top">
          <div>
            <div className="starter-title">{teamName}</div>
            <div className="starter-sub">{selectedIds.length}/5 selected</div>
          </div>
        </div>

        <div className="starter-list">
          {players.map((player) => {
            const selected = selectedIds.includes(player.id)

            return (
              <button
                key={player.id}
                className={`starter-item ${selected ? 'selected' : ''}`}
                onClick={() =>
                  setStartingFive((prev) => ({
                    ...prev,
                    [teamKey]: toggleSelection(prev[teamKey], player.id, 5),
                  }))
                }
              >
                <div className="avatar">#{player.number}</div>
                <div className="starter-name">{formatPlayer(player)}</div>
                <div className="starter-check">{selected ? '✓' : ''}</div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  function renderCourtPlayers(teamKey) {
    if (!currentMatch) return null

    const team = currentMatch[teamKey]
    const teamEvents = currentMatch.events.filter((e) => e.teamKey === teamKey)
    const teamColor =
      team.color || team.players?.[0]?.teamColor || (teamKey === 'home' ? HOME_TEAM_COLOR : DEFAULT_AWAY_COLOR)
    const benchPlayers = team.players.filter((player) => !team.onCourt.includes(player.id))
    const benchCount = benchPlayers.length
    const benchPreview = benchPlayers.slice(0, 2).map((player) => getDisplayName(player)).join(', ')

    return (
      <>
        <div className={`side-staff-controls ${teamKey}`}>
          <button
            className={`side-staff-btn ${teamKey} ${coachFoulCounts[teamKey] >= COACH_FOUL_LIMIT ? 'danger-foul' : coachFoulCounts[teamKey] === COACH_FOUL_LIMIT - 1 ? 'warn-foul' : ''}`}
            style={{ '--team-color': teamColor }}
            onClick={() => {
              if (pendingActionSelection.open && pendingActionSelection.action === 'foul') {
                closePendingActionSelection()
                openStaffFoulModal(teamKey)
                return
              }
              openCoachBenchModal(teamKey)
            }}
          >
            <span className="side-staff-kicker">{team.name}</span>
            <strong>Coach / Bench</strong>
            <small>{getCoachDisplayName(team.coachName)}</small>
            <small>
              {benchCount > 0 ? `${benchCount} bench players` : 'No bench players'}
            </small>
            <em>{coachFoulCounts[teamKey]}/{COACH_FOUL_LIMIT} technicals</em>
          </button>
        </div>

        {team.onCourt.map((playerId) => {
          const player = findPlayerById(team.players, playerId)
          if (!player) return null

          const s = getOnCourtStats(playerId, teamEvents)
          const selected = selectedTeam === teamKey && selectedPlayerId === player.id
          const foulClass =
            s.foul >= 5 ? 'fouled-out' : s.foul === 4 ? 'danger-foul' : s.foul === 3 ? 'warn-foul' : ''

          return (
            <button
              key={player.id}
              className={`side-player ${teamKey} ${selected ? 'selected' : ''} ${foulClass} ${playerFlashMap[player.id] || ''} ${
                courtShotFlow.open &&
                courtShotFlow.step === 'awaitSelection' &&
                courtShotFlow.suggestedTeamKey === teamKey
                  ? 'suggested-shot-team'
                  : ''
              } ${
                courtShotFlow.open &&
                courtShotFlow.step === 'awaitSelection' &&
                courtShotFlow.suggestedTeamKey !== teamKey
                  ? 'non-shot-team'
                  : ''
              }`}
              style={{ '--team-color': teamColor }}
              onClick={() => {
                if (courtShotFlow.open && courtShotFlow.step === 'awaitSelection') {
                  chooseCourtShotShooter(teamKey, player.id)
                  return
                }
                if (pendingActionSelection.open) {
                  handlePendingActionPlayer(teamKey, player.id)
                  return
                }
                setSelectedTeam(teamKey)
                setSelectedPlayerId(player.id)
              }}
            >
              <div className="side-player-topline">
                <div className="side-player-number">#{player.number}</div>
                <div className="side-player-name">{getLastName(player)}</div>
              </div>
              {s.foul >= 3 && <div className={`foul-badge foul-count-${s.foul}`}>{s.foul} PF</div>}
              <div className="side-player-statline">
                <span>{s.pts} PTS</span>
                <span>{s.reb} REB</span>
                <span>{s.ast} AST</span>
              </div>
            </button>
          )
        })}
      </>
    )
  }

  function handleCourtPointerDown(event) {
    if (!currentMatch) return

    const targetRect = event.currentTarget.getBoundingClientRect()
    const clientX = event.clientX ?? event.nativeEvent?.clientX
    const clientY = event.clientY ?? event.nativeEvent?.clientY
    if (clientX == null || clientY == null) return

    const location = {
      x: Math.max(0, Math.min(100, ((clientX - targetRect.left) / targetRect.width) * 100)),
      y: Math.max(0, Math.min(100, ((clientY - targetRect.top) / targetRect.height) * 100)),
    }

    courtPressRef.current = { location, fired: false }
    if (courtHoldTimeoutRef.current) {
      clearTimeout(courtHoldTimeoutRef.current)
    }

    courtHoldTimeoutRef.current = window.setTimeout(() => {
      if (!courtPressRef.current) return
      courtPressRef.current.fired = true
      openCourtShotFlow('made', location)
    }, 750)
  }

  function handleCourtPointerUp() {
    if (!courtPressRef.current) return

    if (courtHoldTimeoutRef.current) {
      clearTimeout(courtHoldTimeoutRef.current)
      courtHoldTimeoutRef.current = null
    }

    const press = courtPressRef.current
    courtPressRef.current = null

    if (!press.fired) {
      openCourtShotFlow('missed', press.location)
    }
  }

  function handleCourtPointerCancel() {
    if (courtHoldTimeoutRef.current) {
      clearTimeout(courtHoldTimeoutRef.current)
      courtHoldTimeoutRef.current = null
    }
    courtPressRef.current = null
  }

  function renderSummaryBoxScore(teamName, players, statsMap) {
    return (
      <div className="card">
        <div className="section-title">{teamName} Box Score</div>
        <div className="boxscore-table wide-boxscore">
          <div className="boxscore-head">#</div>
          <div className="boxscore-head">Name</div>
          <div className="boxscore-head">PTS</div>
          <div className="boxscore-head">FG</div>
          <div className="boxscore-head">FG%</div>
          <div className="boxscore-head">3PT</div>
          <div className="boxscore-head">3P%</div>
          <div className="boxscore-head">FT</div>
          <div className="boxscore-head">FT%</div>
          <div className="boxscore-head">REB</div>
          <div className="boxscore-head">AST</div>
          <div className="boxscore-head">STL</div>
          <div className="boxscore-head">BLK</div>
          <div className="boxscore-head">TOV</div>
          <div className="boxscore-head">PF</div>

          {players.map((player) => {
            const s = statsMap[player.id] || getEmptyStatLine()
            return (
              <div className="boxscore-row" key={player.id}>
                <div>{player.number}</div>
                <div>{player.name}</div>
                <div>{s.pts}</div>
                <div>{s.fgm}/{s.fga}</div>
                <div>{pct(s.fgm, s.fga)}</div>
                <div>{s.tpm}/{s.tpa}</div>
                <div>{pct(s.tpm, s.tpa)}</div>
                <div>{s.ftm}/{s.fta}</div>
                <div>{pct(s.ftm, s.fta)}</div>
                <div>{s.reb}</div>
                <div>{s.ast}</div>
                <div>{s.stl}</div>
                <div>{s.blk}</div>
                <div>{s.tov}</div>
                <div>{s.foul}</div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const selectedTeamPlayers = currentMatch
    ? selectedTeam === 'home'
      ? currentMatch.home.players
      : currentMatch.away.players
    : []

  const selectedPlayer =
    selectedPlayerId && currentMatch
      ? findPlayerById(selectedTeamPlayers, selectedPlayerId)
      : null

  const selectedStats = selectedPlayer
    ? getSelectedPlayerStats(selectedPlayer, selectedTeam === 'home' ? homeStats : awayStats)
    : getEmptyStatLine()

  const subBenchPlayers =
    subModal.open && currentMatch ? getBenchPlayers(subModal.teamKey) : []

  const subTeamName =
    subModal.open && currentMatch ? currentMatch[subModal.teamKey].name : ''

  const outgoingPlayer =
    subModal.open && currentMatch
      ? findPlayerById(currentMatch[subModal.teamKey].players, subModal.outgoingPlayerId)
      : null

  const outgoingPlayerStats =
    subModal.open && currentMatch && outgoingPlayer
      ? getStatsForTeamPlayer(currentMatch, subModal.teamKey, outgoingPlayer.id)
      : getEmptyStatLine()

  const assistScorer =
    assistModal.open && currentMatch
      ? findPlayerById(currentMatch[assistModal.teamKey].players, assistModal.shooterId)
      : null

  const assistOptions =
    assistModal.open && currentMatch
      ? getAssistOptions(assistModal.teamKey, assistModal.shooterId)
      : []

  const foulOptions =
    foulModal.open && currentMatch ? getOnCourtOpponents(foulModal.foulerTeamKey) : []
  const foulFoulerOptions =
    foulModal.open && currentMatch ? getOnCourtPlayers(foulModal.foulerTeamKey) : []
  const foulTypeOptions = getAllowedFoulTypes(foulModal.chargedEntity).map((type) => ({
    id: type,
    ...FOUL_TYPE_CONFIG[type],
  }))
  const foulShotOptions = foulModal.foulType
    ? FOUL_TYPE_CONFIG[foulModal.foulType]?.freeThrows || [0]
    : [0]
  const foulShooterOptions =
    foulModal.open && currentMatch ? getOnCourtOpponents(foulModal.foulerTeamKey) : []
  const coachFoulCounts = currentMatch
    ? {
        home: getCoachFoulCount(allEvents, 'home'),
        away: getCoachFoulCount(allEvents, 'away'),
      }
    : { home: 0, away: 0 }
  const halftimeTeamFouls = useMemo(
    () => ({
      home: getTeamFoulsByQuarter(allEvents, 1).home + getTeamFoulsByQuarter(allEvents, 2).home,
      away: getTeamFoulsByQuarter(allEvents, 1).away + getTeamFoulsByQuarter(allEvents, 2).away,
    }),
    [allEvents]
  )

  const turnoverStealOptions =
    turnoverModal.open && currentMatch ? getOnCourtOpponents(turnoverModal.teamKey) : []
  const turnoverCategoryOptions = Object.entries(TURNOVER_CATEGORY_CONFIG).map(([id, config]) => ({
    id,
    ...config,
  }))
  const blockPickerOptions =
    blockPrompt.open && currentMatch
      ? getOnCourtPlayers(blockPrompt.shotTeamKey === 'home' ? 'away' : 'home')
      : []
  const blockPromptShot =
    blockPrompt.open && currentMatch
      ? currentMatch.events.find((evt) => evt.id === blockPrompt.relatedShotEventId)
      : null

  const reboundPickerOptions =
    reboundModal.open && reboundModal.mode === 'player' && currentMatch
      ? getOnCourtPlayers(reboundModal.pickerTeamKey)
      : []
  const coachBenchTeam = coachBenchModal.open && currentMatch ? currentMatch[coachBenchModal.teamKey] : null
  const coachBenchPlayers =
    coachBenchTeam?.players?.filter((player) => !coachBenchTeam.onCourt.includes(player.id)) || []
  const recentSavedMatch = savedMatches[0] || null
  const seasonSummary = useMemo(() => getSeasonSummary(savedMatches), [savedMatches])
  const previewPlayers = homeTeam.players.slice(0, 5)
  const extraPlayersCount = Math.max(homeTeam.players.length - previewPlayers.length, 0)
  const seasonLeaderCards = [
    { key: 'pts', label: 'Top Scorer', statLabel: 'PTS', leader: seasonSummary.leaders.pts, valueKey: 'pts' },
    { key: 'reb', label: 'Top Rebounder', statLabel: 'REB', leader: seasonSummary.leaders.reb, valueKey: 'reb' },
    { key: 'ast', label: 'Top Playmaker', statLabel: 'AST', leader: seasonSummary.leaders.ast, valueKey: 'ast' },
    { key: 'stl', label: 'Top Steals', statLabel: 'STL', leader: seasonSummary.leaders.stl, valueKey: 'stl' },
    { key: 'blk', label: 'Top Rim Protector', statLabel: 'BLK', leader: seasonSummary.leaders.blk, valueKey: 'blk' },
    { key: 'mvp', label: 'Season MVP', statLabel: 'MVP', leader: seasonSummary.leaders.mvpScore, valueKey: 'mvpScore' },
  ]
  const selectedTeamColor = currentMatch
    ? currentMatch[selectedTeam]?.color ||
      currentMatch[selectedTeam]?.players?.[0]?.teamColor ||
      (selectedTeam === 'home' ? HOME_TEAM_COLOR : DEFAULT_AWAY_COLOR)
    : HOME_TEAM_COLOR
  const liveHomeTeamColor = currentMatch
    ? currentMatch.home?.color || currentMatch.home?.players?.[0]?.teamColor || HOME_TEAM_COLOR
    : HOME_TEAM_COLOR
  const liveAwayTeamColor = currentMatch
    ? currentMatch.away?.color || currentMatch.away?.players?.[0]?.teamColor || DEFAULT_AWAY_COLOR
    : DEFAULT_AWAY_COLOR
  const homeAttackingSide = currentMatch ? getAttackingSide('home', currentMatch.quarter) : 'right'
  const awayAttackingSide = currentMatch ? getAttackingSide('away', currentMatch.quarter) : 'left'
  const selectedTeamSecondaryColor = currentMatch
    ? currentMatch[selectedTeam]?.secondaryColor ||
      currentMatch[selectedTeam]?.players?.[0]?.teamSecondaryColor ||
      (selectedTeam === 'home'
        ? HOME_TEAM_SECONDARY_COLOR
        : DEFAULT_AWAY_SECONDARY_COLOR)
    : HOME_TEAM_SECONDARY_COLOR

  useEffect(() => {
    if (quarterSummaryOpen) {
      setQuarterSummaryView('summary')
    }
  }, [quarterSummaryOpen])

  function openPlayerHeatMap(teamKey, player) {
    if (!currentMatch || !player) return
    const teamName = teamKey === 'home' ? currentMatch.home.name : currentMatch.away.name
    setShotMapPlayerFilter({
      teamKey,
      teamName,
      playerId: player.id,
      playerName: getDisplayName(player),
    })
    setPanelView('shots')
    setBottomPanelOpen(true)
  }

  return (
    <div className={`app ${screen === 'live' ? 'live-mode' : ''}`}>
      {(pullRefreshLabel || isRefreshingMenuData) && screen !== 'live' && (
        <div className={`pull-refresh-indicator ${isRefreshingMenuData ? 'active' : ''}`}>
          {pullRefreshLabel}
        </div>
      )}

      {screen === 'home' && (
        <div className="page home-page" {...pageGestureProps}>
          <div className="home-top-grid">
            <div className="hero-card">
            <div className="hero-icon">🏀</div>
            <h1>Basketball Ops for the Titans.</h1>
            <p>Track your roster, run live games courtside, and keep every result looking professional.</p>
            </div>

            <div className="info-card home-roster-card">
              <div className="info-title">Current Home Team</div>
              <div className="info-main">{homeTeam.name}</div>
              <div className="info-sub">
                {homeTeam.players.length} players saved · {getCoachDisplayName(homeTeam.coachName)}
              </div>

              <div className="home-roster-preview">
                {previewPlayers.map((player) => (
                  <div key={player.id} className="home-player-pill">
                    <span>#{player.number}</span>
                    <strong>{getDisplayName(player)}</strong>
                  </div>
                ))}
                {extraPlayersCount > 0 && (
                  <div className="home-player-pill more">
                    <span>+</span>
                    <strong>{extraPlayersCount} more</strong>
                  </div>
                )}
              </div>
            </div>
          </div>

          {currentMatch && liveMatches.length === 0 && (
            <div className="card resume-card">
              <div>
                <div className="section-title">Unfinished Match Found</div>
                <div className="resume-text">
                  {currentMatch.home.name} vs {currentMatch.away.name} · Q{currentMatch.quarter}
                </div>
              </div>
              <div className="resume-actions">
                <button className="primary-btn" onClick={() => setScreen('live')}>
                  Resume Match
                </button>
                <button className="danger-outline-btn" onClick={discardCurrentMatch}>
                  Discard
                </button>
              </div>
            </div>
          )}

          <div className="menu-grid">
            <button className="menu-card" onClick={newMatchFromHome}>
              <div className="menu-title">New Match</div>
              <div className="menu-sub">Start a game with your saved home roster</div>
            </button>

            <button className="menu-card" onClick={() => setScreen('manageHome')}>
              <div className="menu-title">Manage Home Team</div>
              <div className="menu-sub">Edit team name, jersey numbers, and roster</div>
            </button>

            <button className="menu-card" onClick={() => setScreen('matches')}>
              <div className="menu-title">Previous Matches</div>
              <div className="menu-sub">See saved match summaries</div>
            </button>
          </div>

          {liveMatches.length > 0 && (
            <div className="card home-live-strip">
              <div className="section-title">Shared Live Matches</div>
              <div className="matches-list live-matches-row">
                {liveMatches.map((match) => (
                  <div className="match-history-card" key={match.id}>
                    <div className="match-history-meta">
                      <span>{match.date || 'No date'}</span>
                      <span>{match.venue || 'No venue'}</span>
                    </div>
                    <div className="history-top history-top-rich">
                      <div className="history-matchup-block">
                        <div className="history-team">
                          {match.home_team_name} vs {match.away_team_name}
                        </div>
                        <div className="history-sub history-sub-rich">
                          {currentMatchId === match.id && <span>Current device</span>}
                          <span>Quarter {match.quarter}</span>
                          <span>Live</span>
                        </div>
                      </div>
                      <div className="history-score-block">
                        <div className="history-score">
                          {match.final_score_home} - {match.final_score_away}
                        </div>
                        <div className="history-score-label">Live</div>
                      </div>
                    </div>
                    <div className="resume-actions">
                      <button
                        className="primary-btn"
                        onClick={() => resumeLiveMatch(match.id)}
                      >
                        Resume Match
                      </button>
                      <button
                        className="danger-outline-btn"
                        onClick={() =>
                          discardLiveMatch(
                            match.id,
                            `${match.home_team_name} vs ${match.away_team_name}`
                          )
                        }
                      >
                        Discard
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card season-summary-card">
            <div className="season-summary-header">
              <div>
                <div className="section-title">Club Snapshot</div>
                <div className="season-summary-title">Season leaders and backup tools</div>
              </div>

              <div className="export-actions">
                <button className="primary-btn export-btn" onClick={exportClubData} disabled={isExportingData}>
                  {isExportingData ? 'Exporting...' : 'Export Club Data'}
                </button>
                <button className="mini-panel-btn export-btn export-btn-secondary" onClick={exportSeasonStatsCsv}>
                  Export Season CSV
                </button>
              </div>
            </div>

            <div className="season-totals-grid">
              <div className="season-total-card">
                <span>Games</span>
                <strong>{seasonSummary.totals.games}</strong>
              </div>
              <div className="season-total-card">
                <span>Record</span>
                <strong>
                  {seasonSummary.totals.wins}-{seasonSummary.totals.losses}
                </strong>
              </div>
              <div className="season-total-card">
                <span>Total Points</span>
                <strong>{seasonSummary.totals.points}</strong>
              </div>
              <div className="season-total-card">
                <span>Total Assists</span>
                <strong>{seasonSummary.totals.assists}</strong>
              </div>
            </div>

            <div className="season-leaders-grid">
              {seasonLeaderCards.map((item) => (
                <div key={item.key} className="season-leader-card">
                  <div className="season-leader-label">{item.label}</div>
                  {item.leader ? (
                    <>
                      <div className="season-leader-name">
                        {getDisplayName(item.leader)} <span>#{item.leader.number}</span>
                      </div>
                      <div className="season-leader-value">
                        {item.leader[item.valueKey]}
                        <span>{item.statLabel}</span>
                      </div>
                      <div className="season-leader-sub">{item.leader.games} games tracked</div>
                    </>
                  ) : (
                    <div className="season-leader-empty">Save some completed matches to unlock season leaders.</div>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {screen === 'manageHome' && (
        <div className="page" {...pageGestureProps}>
          <div className="topbar">
            <button className="back-btn" onClick={() => setScreen('home')}>
              ← Back
            </button>
            <h2>Manage Home Team</h2>
          </div>

          <div className="card">
            <label className="field-label">Team Name</label>
            <input
              className="text-input"
              value={homeTeam.name}
              onChange={async (e) => {
                const nextName = e.target.value

                setHomeTeam((prev) => ({
                  ...prev,
                  name: nextName,
                }))

                if (!homeTeamId) return

                const { error } = await supabase
                  .from('teams')
                  .update({ name: nextName })
                  .eq('id', homeTeamId)

                if (error) {
                  console.error('Failed to update team name:', error)
                }
              }}
              placeholder="Enter home team name"
            />

            <label className="field-label">Coach Name</label>
            <input
              className="text-input"
              value={homeTeam.coachName}
              onChange={async (e) => {
                const nextCoachName = e.target.value

                setHomeTeam((prev) => ({
                  ...prev,
                  coachName: nextCoachName,
                }))
                saveJSON(STORAGE_KEYS.homeCoachName, nextCoachName)

                if (!homeTeamId) return

                const { error } = await supabase
                  .from('teams')
                  .update({ coach_name: nextCoachName })
                  .eq('id', homeTeamId)

                if (error) {
                  console.warn('Coach name column not available in Supabase yet:', error)
                }
              }}
              placeholder="Enter home coach name"
            />

            <div className="grid-two team-colors-grid">
              <div>
                <label className="field-label">Primary Colour</label>
                <input
                  className="team-color-input"
                  type="color"
                  value={homeTeam.color}
                  onChange={async (e) => {
                    const nextColor = e.target.value

                    setHomeTeam((prev) => ({
                      ...prev,
                      color: nextColor,
                    }))

                    if (!homeTeamId) return

                    const { error } = await supabase
                      .from('teams')
                      .update({ primary_color: nextColor })
                      .eq('id', homeTeamId)

                    if (error) {
                      console.error('Failed to update home primary colour:', error)
                    }
                  }}
                />
              </div>

              <div>
                <label className="field-label">Secondary Colour</label>
                <input
                  className="team-color-input"
                  type="color"
                  value={homeTeam.secondaryColor}
                  onChange={async (e) => {
                    const nextColor = e.target.value

                    setHomeTeam((prev) => ({
                      ...prev,
                      secondaryColor: nextColor,
                    }))

                    if (!homeTeamId) return

                    const { error } = await supabase
                      .from('teams')
                      .update({ secondary_color: nextColor })
                      .eq('id', homeTeamId)

                    if (error) {
                      console.error('Failed to update home secondary colour:', error)
                    }
                  }}
                />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="section-title">Home Roster</div>

            <div className="triple-row">
              <input
                className="text-input"
                value={homePlayerName}
                onChange={(e) => setHomePlayerName(e.target.value)}
                placeholder="Player name"
              />
              <input
                className="text-input jersey-input"
                value={homePlayerNumber}
                onChange={(e) => setHomePlayerNumber(e.target.value)}
                placeholder="Jersey #"
              />
              <button className="primary-btn" onClick={addHomePlayer}>
                Add
              </button>
            </div>

            <div className="list">
              {homeTeam.players.map((player) => (
                <div className="list-item" key={player.id}>
                  <div className="avatar">#{player.number}</div>
                  <div className="list-name">{formatPlayer(player)}</div>
                  <button className="danger-btn" onClick={() => removeHomePlayer(player.id)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {screen === 'newMatch' && (
        <div className="page" {...pageGestureProps}>
          <div className="topbar">
            <button className="back-btn" onClick={() => setScreen('home')}>
              ← Back
            </button>
            <h2>New Match</h2>
          </div>

          <div className="card">
            <div className="section-title">Home Team</div>
            <div className="preload-box">
              <div className="preload-name">{homeTeam.name}</div>
              <div className="preload-sub">
                Coach {getCoachDisplayName(homeTeam.coachName)} · {homeTeam.players.length} saved players loaded
              </div>
            </div>
          </div>

          <div className="card">
            <div className="section-title">Opponent Details</div>

            <label className="field-label">Opponent Team Name</label>
            <input
              className="text-input"
              value={newMatch.opponentName}
              onChange={(e) =>
                setNewMatch((prev) => ({
                  ...prev,
                  opponentName: e.target.value,
                }))
              }
              placeholder="Enter opponent team name"
            />

            <label className="field-label">Opponent Coach Name</label>
            <input
              className="text-input"
              value={newMatch.opponentCoachName}
              onChange={(e) =>
                setNewMatch((prev) => ({
                  ...prev,
                  opponentCoachName: e.target.value,
                }))
              }
              placeholder="Enter opponent coach name"
            />

            <div className="grid-two">
              <div>
                <label className="field-label">Date</label>
                <input
                  className="text-input"
                  type="date"
                  min={getTodayDateString()}
                  value={newMatch.date}
                  onChange={(e) =>
                    setNewMatch((prev) => ({
                      ...prev,
                      date: e.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label className="field-label">Venue</label>
                <input
                  className="text-input"
                  value={newMatch.venue}
                  onChange={(e) =>
                    setNewMatch((prev) => ({
                      ...prev,
                      venue: e.target.value,
                    }))
                  }
                  placeholder="Optional venue"
                />
              </div>
            </div>

            <div className="grid-two team-colors-grid">
              <div>
                <label className="field-label">Opponent Team Colour</label>
                <input
                  className="team-color-input"
                  type="color"
                  value={newMatch.opponentColor}
                  onChange={(e) =>
                    setNewMatch((prev) => ({
                      ...prev,
                      opponentColor: e.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label className="field-label">Opponent Secondary Colour</label>
                <input
                  className="team-color-input"
                  type="color"
                  value={newMatch.opponentSecondaryColor}
                  onChange={(e) =>
                    setNewMatch((prev) => ({
                      ...prev,
                      opponentSecondaryColor: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="section-title">Opponent Roster</div>

            <div className="triple-row">
              <input
                className="text-input"
                value={opponentPlayerName}
                onChange={(e) => setOpponentPlayerName(e.target.value)}
                placeholder="Opponent player name"
              />
              <input
                className="text-input jersey-input"
                value={opponentPlayerNumber}
                onChange={(e) => setOpponentPlayerNumber(e.target.value)}
                placeholder="Jersey #"
              />
              <button className="primary-btn" onClick={addOpponentPlayer}>
                Add
              </button>
            </div>

            <div className="list">
              {newMatch.opponentPlayers.map((player) => (
                <div className="list-item" key={player.id}>
                  <div className="avatar">#{player.number}</div>
                  <div className="list-name">{formatPlayer(player)}</div>
                  <button className="danger-btn" onClick={() => removeOpponentPlayer(player.id)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <button className="start-btn" onClick={goToStartingFiveSetup}>
              Choose Starting 5
            </button>
          </div>
        </div>
      )}

      {screen === 'startingFive' && (
        <div className="page" {...pageGestureProps}>
          <div className="topbar">
            <button className="back-btn" onClick={() => setScreen('newMatch')}>
              ← Back
            </button>
            <h2>Select Starting 5</h2>
          </div>

          <div className="starter-grid">
            {renderStarterPicker(homeTeam.name, homeTeam.players, startingFive.home, 'home')}
            {renderStarterPicker(
              newMatch.opponentName || 'Opponent',
              newMatch.opponentPlayers,
              startingFive.away,
              'away'
            )}
          </div>

          <div className="card start-confirm-card">
            <div className="start-confirm-text">
              Home: {startingFive.home.length}/5 starters · Away: {startingFive.away.length}/5 starters
            </div>
            <button className="primary-btn" onClick={startMatch}>
              Start Match
            </button>
          </div>
        </div>
      )}

      {screen === 'live' && currentMatch && (
        <div
          className={`live-court-page ${
            courtShotFlow.open || pendingActionSelection.open ? 'shot-capture-mode' : ''
          } ${pendingActionSelection.open && pendingActionSelection.action === 'foul' ? 'foul-pick-mode' : ''}`}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="court-background">
            <div className="court-overlay-lines" />
          </div>

          <LiveScoreboard
            currentMatch={currentMatch}
            currentQuarterScore={currentQuarterScore}
            currentQuarterFouls={currentQuarterFouls}
            homeTotals={homeTotals}
            awayTotals={awayTotals}
            homeTeamColor={liveHomeTeamColor}
            awayTeamColor={liveAwayTeamColor}
            homeAttackingSide={homeAttackingSide}
            awayAttackingSide={awayAttackingSide}
            panelView={panelView}
            bottomPanelOpen={bottomPanelOpen}
            setPanelView={setPanelView}
            setBottomPanelOpen={setBottomPanelOpen}
            clearShotMapPlayerFilter={() => setShotMapPlayerFilter(null)}
            setQuarterSummaryOpen={setQuarterSummaryOpen}
            openFixAssistModal={openFixAssistModal}
            fixAssistDisabled={fixableScoringEvents.length === 0}
            endMatchDisabled={currentMatch.quarter < 4}
            goToMenu={() => {
              setBottomPanelOpen(false)
              setScreen('home')
            }}
            endMatch={endMatch}
          />

          <CourtLayout
            titansLogo={titansLogo}
            renderCourtPlayers={(teamKey) => renderCourtPlayers(teamKey)}
            onCourtPointerDown={handleCourtPointerDown}
            onCourtPointerUp={handleCourtPointerUp}
            onCourtPointerLeave={handleCourtPointerCancel}
            onCourtPointerCancel={handleCourtPointerCancel}
            courtShotLocation={courtShotFlow.open ? courtShotFlow.location : null}
            courtShotMode={courtShotFlow.open ? courtShotFlow.mode : ''}
            courtShotStep={
              pendingActionSelection.open
                ? 'awaitSelection'
                : courtShotFlow.open
                  ? courtShotFlow.step
                  : 'idle'
            }
          />

          <SelectedPlayerDock
            currentMatch={currentMatch}
            selectedTeam={selectedTeam}
            selectedTeamColor={selectedTeamColor}
            selectedTeamSecondaryColor={selectedTeamSecondaryColor}
            selectedPlayer={selectedPlayer}
            selectedStats={selectedStats}
            titansJerseyBack={titansJerseyBack}
            openSubModal={openSubModal}
            beginActionSelection={beginActionSelection}
            openPlayerHeatMap={openPlayerHeatMap}
          />

          <BottomDrawer
            bottomPanelOpen={bottomPanelOpen}
            setBottomPanelOpen={setBottomPanelOpen}
            panelView={panelView}
            shotMapPlayerFilter={shotMapPlayerFilter}
            groupedLog={groupedLog}
            currentMatch={currentMatch}
            undoEvent={undoEvent}
            getRunningScoreUntil={getRunningScoreUntil}
            describeEvent={describeMatchEvent}
            homeStats={homeStats}
            awayStats={awayStats}
            getEmptyStatLine={getEmptyStatLine}
            pct={pct}
          />
        </div>
      )}

      {screen === 'summary' && currentMatch && (
        <div className="page">
          <div className="topbar">
            <button className="back-btn" onClick={() => setScreen('live')}>
              ← Back
            </button>
            <h2>Match Summary</h2>
          </div>

          <div className="summary-score">
            <div className="summary-score-card">
              <div className="summary-team">{currentMatch.home.name}</div>
              <div className="summary-big">{homeTotals.points}</div>
            </div>
            <div className="summary-score-card">
              <div className="summary-team">{currentMatch.away.name}</div>
              <div className="summary-big">{awayTotals.points}</div>
            </div>
          </div>

          <div className="meta-card">
            <div>Date: {currentMatch.date}</div>
            <div>Venue: {currentMatch.venue || 'Not set'}</div>
            <div>Quarter reached: Q{currentMatch.quarter}</div>
          </div>

          <div className="card">
            <div className="section-title">Score By Quarter</div>
            <div className="quarter-summary-table">
              <div className="quarter-summary-head">Team</div>
              <div className="quarter-summary-head">Q1</div>
              <div className="quarter-summary-head">Q2</div>
              <div className="quarter-summary-head">Q3</div>
              <div className="quarter-summary-head">Q4</div>
              <div className="quarter-summary-head">Total</div>

              <div className="quarter-summary-row team-name-cell">{currentMatch.home.name}</div>
              <div className="quarter-summary-row">{quarterScores[1].home}</div>
              <div className="quarter-summary-row">{quarterScores[2].home}</div>
              <div className="quarter-summary-row">{quarterScores[3].home}</div>
              <div className="quarter-summary-row">{quarterScores[4].home}</div>
              <div className="quarter-summary-row total-cell">{homeTotals.points}</div>

              <div className="quarter-summary-row team-name-cell">{currentMatch.away.name}</div>
              <div className="quarter-summary-row">{quarterScores[1].away}</div>
              <div className="quarter-summary-row">{quarterScores[2].away}</div>
              <div className="quarter-summary-row">{quarterScores[3].away}</div>
              <div className="quarter-summary-row">{quarterScores[4].away}</div>
              <div className="quarter-summary-row total-cell">{awayTotals.points}</div>
            </div>
          </div>

          {renderSummaryBoxScore(currentMatch.home.name, currentMatch.home.players, homeStats)}
          {renderSummaryBoxScore(currentMatch.away.name, currentMatch.away.players, awayStats)}

          <div className="summary-actions">
            <button className="primary-btn" onClick={saveMatch}>
              Save Match & Return Home
            </button>
          </div>
        </div>
      )}

      {screen === 'matchDetail' && selectedSavedMatch && (
        <MatchDetailView
          match={selectedSavedMatch}
          onBack={() => {
            setSelectedSavedMatch(null)
            setScreen('matches')
          }}
        />
      )}

      {screen === 'matches' && (
        <div className="page matches-page" {...pageGestureProps}>
          <div className="topbar">
            <button className="back-btn" onClick={() => setScreen('home')}>
              ← Back
            </button>
            <h2>Previous Matches</h2>
          </div>

          {savedMatches.length === 0 ? (
            <div className="card empty-state matches-empty-state">
              <div className="section-title">No Archive Yet</div>
              <div className="info-main">Your saved games will live here.</div>
              <div className="info-sub">
                Finish a match and save it to build a clean game-by-game archive.
              </div>
            </div>
          ) : (
            <>
              <div className="matches-hero-card">
                <div>
                  <div className="matches-kicker">Game Archive</div>
                  <div className="matches-hero-title">Every result, lineup, and recap in one place.</div>
                  <div className="matches-hero-sub">
                    Open any saved game to review the final score, quarter breakdown, player box
                    score, and full event timeline.
                  </div>
                </div>

                <div className="matches-hero-stats">
                  <div className="matches-stat">
                    <span>Saved games</span>
                    <strong>{savedMatches.length}</strong>
                  </div>
                  <div className="matches-stat">
                    <span>Home team</span>
                    <strong>{homeTeam.name}</strong>
                  </div>
                </div>
              </div>

              <div className="matches-list">
                {savedMatches.map((match) => (
                  <button
                    className="match-history-card match-history-btn"
                    key={match.id}
                    onClick={() => {
                      setSelectedSavedMatch(match)
                      setScreen('matchDetail')
                    }}
                  >
                    <div className="match-history-meta">
                      <span>{match.date || 'No date'}</span>
                      <span>{match.venue || 'No venue'}</span>
                    </div>
                    <div className="history-top history-top-rich">
                      <div className="history-matchup-block">
                        <div className="history-team">
                          {match.home.name} vs {match.away.name}
                        </div>
                        <div className="history-sub history-sub-rich">
                          <span>{match.home.name}</span>
                          <span>{match.away.name}</span>
                        </div>
                      </div>
                      <div className="history-score-block">
                        <div className="history-score">
                          {match.finalScore.home} - {match.finalScore.away}
                        </div>
                        <div className="history-score-label">Final</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <button className="danger-outline-btn matches-danger-btn" onClick={clearSavedMatches}>
                Clear Saved Matches
              </button>
            </>
          )}
        </div>
      )}

      {subModal.open && (
        <div className="modal-overlay" onClick={closeSubModal}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <h3>Substitution</h3>
              <button className="modal-close" onClick={closeSubModal}>
                ✕
              </button>
            </div>

            <div className="modal-subtext">
              {outgoingPlayer
                ? `Sub out ${formatPlayer(outgoingPlayer)} from ${subTeamName}`
                : 'Choose a bench player'}
            </div>

            {outgoingPlayer && (
              <div className="sub-player-preview">
                <div className="sub-player-preview-name">{formatPlayer(outgoingPlayer)}</div>
                <div className="sub-player-preview-stats">
                  <span>{outgoingPlayerStats.pts} PTS</span>
                  <span>{outgoingPlayerStats.reb} REB</span>
                  <span>{outgoingPlayerStats.ast} AST</span>
                  <span>{outgoingPlayerStats.foul} PF</span>
                </div>
              </div>
            )}

            {subBenchPlayers.length === 0 ? (
              <div className="empty-bench">No bench players available.</div>
            ) : (
              <div className="bench-list">
                {subBenchPlayers.map((player) => {
                  const s = getStatsForTeamPlayer(currentMatch, subModal.teamKey, player.id)

                  return (
                    <button
                      key={player.id}
                      className="bench-item bench-item-rich"
                      onClick={() => makeSubstitution(player.id)}
                    >
                      <div className="avatar">#{player.number}</div>

                      <div className="bench-item-body">
                        <div className="bench-name">{formatPlayer(player)}</div>
                        <div className="bench-stats">
                          <span>{s.pts} PTS</span>
                          <span>{s.reb} REB</span>
                          <span>{s.ast} AST</span>
                          <span>{s.foul} PF</span>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {shotModal.open && (
        <div className="modal-overlay" onClick={closeShotModal}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <h3>Shot</h3>
              <button className="modal-close" onClick={closeShotModal}>
                ✕
              </button>
            </div>

            <div className="modal-subtext">
              {shotModal.shotType === 'FT'
                ? 'Free throws selected. Continue to free throw setup.'
                : 'Choose shot type and result.'}
            </div>

            <div className="picker-group">
              <div className="picker-title">Shot Type</div>
              <div className="pill-row">
                {['2PT', '3PT', 'FT'].map((type) => (
                  <button
                    key={type}
                    className={`pill-btn ${shotModal.shotType === type ? 'active' : ''}`}
                    onClick={() => setShotModal((prev) => ({ ...prev, shotType: type }))}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {shotModal.shotType !== 'FT' && (
              <div className="picker-group">
                <div className="picker-title">Result</div>
                <div className="pill-row">
                  {['made', 'missed'].map((result) => (
                    <button
                      key={result}
                      className={`pill-btn ${shotModal.result === result ? 'active' : ''}`}
                      onClick={() => setShotModal((prev) => ({ ...prev, result }))}
                    >
                      {result}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button className="start-btn" onClick={submitShot}>
              {shotModal.shotType === 'FT' ? 'Continue to Free Throws' : 'Save Shot'}
            </button>
          </div>
        </div>
      )}

      {courtShotFlow.open && (
        <>
          {courtShotFlow.step === 'shotType' && (
            <div className="modal-overlay" onClick={closeCourtShotFlow}>
              <div className="modal-card compact-shot-type-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-top">
                  <h3>{courtShotFlow.mode === 'made' ? 'Made Shot Type' : 'Missed Shot Type'}</h3>
                  <button className="modal-close" onClick={closeCourtShotFlow}>
                    x
                  </button>
                </div>

                <div className="pill-row big-shot-type-row">
                  {(courtShotFlow.mode === 'made' ? ['DUNK', '2PT', '3PT'] : ['2PT', '3PT']).map((type) => (
                    <button
                      key={type}
                      className={`pill-btn big-shot-type-btn ${
                        (type === 'DUNK' ? courtShotFlow.isDunk : courtShotFlow.shotType === type && !courtShotFlow.isDunk)
                          ? 'active'
                          : ''
                      }`}
                      onClick={() => chooseCourtShotType(type)}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {courtShotFlow.step === 'awaitSelection' && (
            <div className="court-shot-hint">
              {courtShotFlow.mode === 'made'
                ? `Shot tagged as ${courtShotFlow.isDunk ? 'DUNK' : courtShotFlow.shotType}. Likely ${currentMatch?.[courtShotFlow.suggestedTeamKey || 'home']?.name || 'team'} attack. Tap the player who scored.`
                : courtShotFlow.shotType
                  ? `Miss tagged as ${courtShotFlow.shotType}. Tap the player who missed.`
                  : `Likely ${currentMatch?.[courtShotFlow.suggestedTeamKey || 'home']?.name || 'team'} attack. Tap the player who missed, then choose 2PT or 3PT.`}
              <button className="mini-panel-btn court-shot-cancel" onClick={closeCourtShotFlow}>
                Cancel
              </button>
            </div>
          )}
        </>
      )}

      {pendingActionSelection.open && (
        <div className="court-shot-hint">
          {pendingActionSelection.action === 'shot' && 'Tap the player who took the shot.'}
          {pendingActionSelection.action === 'rebound' && 'Tap the player who got the rebound.'}
          {pendingActionSelection.action === 'foul' &&
            'Tap the player who committed the foul, or use Coach/Bench for a technical.'}
          {pendingActionSelection.action === 'turnover' && 'Tap the player who turned it over.'}
          <button className="mini-panel-btn court-shot-cancel" onClick={closePendingActionSelection}>
            Cancel
          </button>
        </div>
      )}

      {courtReboundPrompt.open && (
        <div className="modal-overlay" onClick={closeCourtReboundPrompt}>
          <div className="modal-card compact-shot-type-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <h3>Rebound?</h3>
              <button className="modal-close" onClick={closeCourtReboundPrompt}>
                x
              </button>
            </div>

            <div className="modal-subtext">
              Was there a rebound after that miss?
            </div>

            <div className="pill-row">
              <button className="pill-btn" onClick={() => answerCourtReboundPrompt(true)}>
                Yes
              </button>
              <button className="pill-btn" onClick={() => answerCourtReboundPrompt(false)}>
                No
              </button>
            </div>
          </div>
        </div>
      )}

      {blockPrompt.open && (
        <div className="modal-overlay" onClick={closeBlockPrompt}>
          <div className="modal-card compact-shot-type-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <h3>
                {blockPrompt.step === 'ask'
                  ? `${blockPromptShot?.shotType || 'Shot'} Miss`
                  : 'Who Got The Block?'}
              </h3>
              <button className="modal-close" onClick={closeBlockPrompt}>
                x
              </button>
            </div>

            {blockPrompt.step === 'ask' ? (
              <>
                <div className="modal-subtext">Choose what happened on the miss.</div>
                <div className="pill-row big-shot-type-row miss-outcome-row">
                  <button className="pill-btn big-shot-type-btn miss-outcome-btn" onClick={() => chooseMissOutcome('block')}>
                    Blocked
                  </button>
                  <button className="pill-btn big-shot-type-btn miss-outcome-btn" onClick={() => chooseMissOutcome('rebound')}>
                    Rebound
                  </button>
                  <button className="pill-btn big-shot-type-btn miss-outcome-btn" onClick={() => chooseMissOutcome('none')}>
                    Dead Ball
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="modal-subtext">Choose the defender who got the block.</div>
                <div className="bench-list">
                  {blockPickerOptions.map((player) => (
                    <button
                      key={player.id}
                      className="bench-item"
                      onClick={() => chooseBlocker(player.id)}
                    >
                      <div className="avatar">#{player.number}</div>
                      <div className="bench-name">{formatPlayer(player)}</div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {freeThrowFlow.open && (
        <div className="modal-overlay" onClick={closeFreeThrowFlow}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <h3>Free Throws</h3>
              <button className="modal-close" onClick={closeFreeThrowFlow}>
                ✕
              </button>
            </div>

            {freeThrowFlow.step === 'count' ? (
              <>
                <div className="modal-subtext">How many free throws?</div>
                <div className="pill-row ft-step-actions">
                  {[1, 2, 3].map((count) => (
                    <button
                      key={count}
                      className="pill-btn"
                      onClick={() => chooseFreeThrowCount(count)}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="modal-subtext">
                  Free Throw {freeThrowFlow.current} of {freeThrowFlow.total}
                </div>

                <button className="start-btn" onClick={() => submitFreeThrowAttempt('made')}>
                  FT {freeThrowFlow.current} of {freeThrowFlow.total} — Made
                </button>
                <button
                  className="start-btn danger-shot-btn"
                  onClick={() => submitFreeThrowAttempt('missed')}
                >
                  FT {freeThrowFlow.current} of {freeThrowFlow.total} — Missed
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {assistModal.open && (
        <div
          className="modal-overlay"
          onClick={() =>
            setAssistModal({ open: false, teamKey: '', shooterId: '', shotType: '', isDunk: false, shotLocation: null })
          }
        >
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <h3>Assist?</h3>
              <button
                className="modal-close"
                onClick={() =>
                  setAssistModal({ open: false, teamKey: '', shooterId: '', shotType: '', isDunk: false, shotLocation: null })
                }
              >
                ✕
              </button>
            </div>

            <div className="modal-subtext">
              {assistScorer
                ? `${formatPlayer(assistScorer)} made ${assistModal.isDunk ? 'DUNK' : assistModal.shotType}. Who assisted?`
                : 'Choose an assisting player'}
            </div>

            <div className="bench-list">
              {assistOptions.map((player) => (
                <button
                  key={player.id}
                  className="bench-item"
                  onClick={() => completeMadeBasket(player.id)}
                >
                  <div className="avatar">#{player.number}</div>
                  <div className="bench-name">{formatPlayer(player)}</div>
                </button>
              ))}

              <button className="bench-item no-assist-btn" onClick={() => completeMadeBasket(null)}>
                <div className="avatar">—</div>
                <div className="bench-name">No Assist</div>
              </button>
            </div>
          </div>
        </div>
      )}

      {coachBenchModal.open && coachBenchTeam && (
        <div className="modal-overlay" onClick={closeCoachBenchModal}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <h3>{coachBenchTeam.name} Coach / Bench</h3>
              <button className="modal-close" onClick={closeCoachBenchModal}>
                x
              </button>
            </div>

            <div className="modal-subtext">
              Coach: {getCoachDisplayName(coachBenchTeam.coachName)}
            </div>

            {coachBenchPlayers.length === 0 ? (
              <div className="empty-bench">No bench players available.</div>
            ) : (
              <div className="bench-list">
                {coachBenchPlayers.map((player) => (
                  <div key={player.id} className="bench-item bench-item-rich static-bench-item">
                    <div className="avatar">#{player.number}</div>
                    <div className="bench-item-body">
                      <div className="bench-name">{formatPlayer(player)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {foulModal.open && (
        <div className="modal-overlay" onClick={closeFoulModal}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <h3>
                {foulModal.step === 'type' && 'Foul Type'}
                {foulModal.step === 'actor' && 'Who Committed It?'}
                {foulModal.step === 'fouler' && 'Who Fouled?'}
                {foulModal.step === 'target' && 'Who Got Fouled?'}
                {foulModal.step === 'shots' && 'Free Throws Awarded'}
                {foulModal.step === 'shooter' && 'Who Shoots the Free Throws?'}
              </h3>
              <button className="modal-close" onClick={closeFoulModal}>
                x
              </button>
            </div>

            {foulModal.step === 'type' && (
              <>
                <div className="modal-subtext">
                  Choose the foul type first, then choose who committed it.
                </div>
                <div className="foul-type-list">
                  {foulTypeOptions.map((option) => (
                    <button
                      key={option.id}
                      className="foul-type-btn"
                      onClick={() => setFoulType(option.id)}
                    >
                      <div className="foul-type-name">{option.label}</div>
                      <div className="foul-type-desc">{option.description}</div>
                    </button>
                  ))}
                </div>
              </>
            )}

            {foulModal.step === 'actor' && (
              <>
                <div className="modal-subtext">
                  {foulModal.foulType === 'technical'
                    ? 'Was this a player technical, coach technical, or bench technical?'
                    : 'Who committed the foul?'}
                </div>
                <div className="pill-row ft-step-actions">
                  {(foulModal.actorScope === 'staff' ? ['coach', 'bench'] : ['player', 'coach', 'bench']).map((entity) => (
                    <button
                      key={entity}
                      className="pill-btn"
                      onClick={() => chooseTechnicalActor(entity)}
                    >
                      {entity === 'player' ? 'Player' : entity === 'coach' ? 'Coach' : 'Bench'}
                    </button>
                  ))}
                </div>
              </>
            )}

            {foulModal.step === 'fouler' && (
              <>
                <div className="modal-subtext">Choose the player who committed the foul.</div>
                <div className="bench-list">
                  {foulFoulerOptions.map((player) => (
                    <button
                      key={player.id}
                      className="bench-item"
                      onClick={() => chooseFouler(player.id)}
                    >
                      <div className="avatar">#{player.number}</div>
                      <div className="bench-name">{formatPlayer(player)}</div>
                    </button>
                  ))}
                </div>
              </>
            )}

            {foulModal.step === 'target' && (
              <>
                <div className="modal-subtext">Choose the player who was fouled.</div>
                <div className="bench-list">
                  {foulOptions.map((player) => (
                    <button
                      key={player.id}
                      className="bench-item"
                      onClick={() => chooseFoulTarget(player.id)}
                    >
                      <div className="avatar">#{player.number}</div>
                      <div className="bench-name">{formatPlayer(player)}</div>
                    </button>
                  ))}
                </div>
              </>
            )}

            {foulModal.step === 'shots' && (
              <>
                <div className="modal-subtext">
                  {FOUL_TYPE_CONFIG[foulModal.foulType]?.label || 'Foul'}: how many free throws were awarded?
                </div>
                <div className="pill-row ft-step-actions">
                  {foulShotOptions.map((count) => (
                    <button
                      key={count}
                      className="pill-btn"
                      onClick={() => chooseFoulShots(count)}
                    >
                      {count === 0 ? 'No Free Throws' : `${count} FT${count > 1 ? 's' : ''}`}
                    </button>
                  ))}
                </div>
              </>
            )}

            {foulModal.step === 'shooter' && (
              <>
                <div className="modal-subtext">
                  Choose the player taking {foulModal.freeThrowCount} free throw
                  {foulModal.freeThrowCount > 1 ? 's' : ''}.
                </div>
                <div className="bench-list">
                  {foulShooterOptions.map((player) => (
                    <button
                      key={player.id}
                      className="bench-item"
                      onClick={() => chooseFoulShooter(player.id)}
                    >
                      <div className="avatar">#{player.number}</div>
                      <div className="bench-name">{formatPlayer(player)}</div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {false && foulModal.open && (
        <div className="modal-overlay" onClick={closeFoulModal}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <h3>Who got fouled?</h3>
              <button className="modal-close" onClick={closeFoulModal}>
                ✕
              </button>
            </div>

            <div className="bench-list">
              {foulOptions.map((player) => (
                <button
                  key={player.id}
                  className="bench-item"
                  onClick={() => submitFoul(player.id)}
                >
                  <div className="avatar">#{player.number}</div>
                  <div className="bench-name">{formatPlayer(player)}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {reboundModal.open && (
        <div className="modal-overlay" onClick={closeReboundModal}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <h3>Rebound</h3>
              <button className="modal-close" onClick={closeReboundModal}>
                ✕
              </button>
            </div>

            {reboundModal.mode === 'choice' ? (
              <>
                <div className="modal-subtext">What happened after the miss?</div>

                <div className="bench-list">
                  <button className="bench-item" onClick={() => chooseReboundType('oreb')}>
                    <div className="avatar">O</div>
                    <div className="bench-name">Offensive Rebound</div>
                  </button>

                  <button className="bench-item" onClick={() => chooseReboundType('dreb')}>
                    <div className="avatar">D</div>
                    <div className="bench-name">Defensive Rebound</div>
                  </button>

                  <button className="bench-item" onClick={() => chooseReboundType('team')}>
                    <div className="avatar">T</div>
                    <div className="bench-name">Team Rebound</div>
                  </button>

                  <button className="bench-item no-assist-btn" onClick={() => chooseReboundType('none')}>
                    <div className="avatar">—</div>
                    <div className="bench-name">No Rebound</div>
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="modal-subtext">
                  {reboundModal.reboundType === 'oreb'
                    ? 'Choose the player who got the offensive rebound.'
                    : 'Choose the player who got the defensive rebound.'}
                </div>

                <div className="bench-list">
                  {reboundPickerOptions.map((player) => (
                    <button
                      key={player.id}
                      className="bench-item"
                      onClick={() =>
                        submitRebound(reboundModal.reboundType, reboundModal.pickerTeamKey, player.id)
                      }
                    >
                      <div className="avatar">#{player.number}</div>
                      <div className="bench-name">{formatPlayer(player)}</div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {turnoverModal.open && (
        <div className="modal-overlay" onClick={closeTurnoverModal}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <h3>
                {turnoverModal.step === 'category' && 'Turnover Type'}
                {turnoverModal.step === 'violationType' && 'Violation Detail'}
                {turnoverModal.step === 'steal' && 'Was There a Steal?'}
              </h3>
              <button className="modal-close" onClick={closeTurnoverModal}>
                ✕
              </button>
            </div>

            {turnoverModal.step === 'category' && (
              <>
                <div className="modal-subtext">Choose the turnover category.</div>
                <div className="turnover-type-grid">
                  {turnoverCategoryOptions.map((option) => (
                    <button
                      key={option.id}
                      className="turnover-type-btn"
                      onClick={() => chooseTurnoverCategory(option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {turnoverModal.step === 'violationType' && (
              <>
                <div className="modal-subtext">What kind of violation was it?</div>
                <div className="bench-list">
                  {TURNOVER_VIOLATION_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      className="bench-item"
                      onClick={() => chooseTurnoverViolationType(option.id)}
                    >
                      <div className="avatar">V</div>
                      <div className="bench-name">{option.label}</div>
                    </button>
                  ))}
                </div>
              </>
            )}

            {turnoverModal.step === 'steal' && (
              <div className="modal-subtext">Was the turnover forced as a steal?</div>
            )}

            {turnoverModal.step === 'steal' && <div className="bench-list">
              {turnoverStealOptions.map((player) => (
                <button
                  key={player.id}
                  className="bench-item"
                  onClick={() =>
                    submitTurnover({
                      category: turnoverModal.category,
                      violationType: '',
                      forcedByPlayerId: player.id,
                    })
                  }
                >
                  <div className="avatar">#{player.number}</div>
                  <div className="bench-name">{formatPlayer(player)}</div>
                </button>
              ))}

              <button
                className="bench-item no-assist-btn"
                onClick={() =>
                  submitTurnover({
                    category: turnoverModal.category,
                    violationType: '',
                    forcedByPlayerId: null,
                  })
                }
              >
                <div className="avatar">—</div>
                <div className="bench-name">No Steal</div>
              </button>
            </div>}
          </div>
        </div>
      )}

      {fixAssistModal.open && (
        <div
          className="modal-overlay"
          onClick={() => setFixAssistModal({ open: false, scoringEventId: '' })}
        >
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <h3>Fix Assist</h3>
              <button
                className="modal-close"
                onClick={() => setFixAssistModal({ open: false, scoringEventId: '' })}
              >
                ✕
              </button>
            </div>

            {!fixAssistModal.scoringEventId ? (
              <>
                <div className="modal-subtext">Pick a made basket with no assist.</div>
                <div className="bench-list">
                  {fixableScoringEvents.length === 0 ? (
                    <div className="empty-bench">No fixable baskets.</div>
                  ) : (
                    fixableScoringEvents.map((evt) => {
                      const team = currentMatch[evt.teamKey]
                      const player = findPlayerById(team.players, evt.shooterId)

                      return (
                        <button
                          key={evt.id}
                          className="bench-item"
                          onClick={() => setFixAssistModal({ open: true, scoringEventId: evt.id })}
                        >
                          <div className="avatar">{evt.quarter}</div>
                          <div className="bench-name">
                            Q{evt.quarter} — {formatPlayer(player)} made {evt.shotType}
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>
              </>
            ) : (
              <>
                {(() => {
                  const evt = currentMatch.events.find((e) => e.id === fixAssistModal.scoringEventId)
                  if (!evt) return <div className="empty-bench">Scoring event not found.</div>

                  const team = currentMatch[evt.teamKey]
                  const options = evt.lineupSnapshot
                    .filter((id) => id !== evt.shooterId)
                    .map((id) => findPlayerById(team.players, id))
                    .filter(Boolean)

                  return (
                    <>
                      <div className="modal-subtext">Choose the assister for this basket.</div>
                      <div className="bench-list">
                        {options.map((player) => (
                          <button
                            key={player.id}
                            className="bench-item"
                            onClick={() => assignAssistToShotEvent(evt.id, player.id)}
                          >
                            <div className="avatar">#{player.number}</div>
                            <div className="bench-name">{formatPlayer(player)}</div>
                          </button>
                        ))}
                      </div>
                    </>
                  )
                })()}
              </>
            )}
          </div>
        </div>
      )}

      {quarterSummaryOpen && currentMatch && (
        <div className="modal-overlay" onClick={() => setQuarterSummaryOpen(false)}>
          <div className="modal-card quarter-summary-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <h3>
                {quarterSummaryView === 'summary'
                  ? quarterSummaryTitle
                  : quarterSummaryView === 'log'
                    ? 'Live Log'
                    : 'Box Score'}
              </h3>
              <button className="modal-close" onClick={() => setQuarterSummaryOpen(false)}>
                x
              </button>
            </div>

            {quarterSummaryView === 'summary' && (
              <div className="quarter-summary-content">
                <div className="quarter-summary-team">
                  <div className="summary-team-name">{currentMatch.home.name}</div>
                  <div className="summary-score">
                    {isHalftimeSummary ? halftimeScore.home : currentQuarterScore.home}
                  </div>
                  <div className="summary-label">Points</div>
                  <div className="summary-stats-grid">
                    <div>
                      <span className="stat-label">Fouls:</span>{' '}
                      {isHalftimeSummary ? halftimeTeamFouls.home : currentQuarterFouls.home}
                    </div>
                    <div>
                      <span className="stat-label">Reb:</span>{' '}
                      {isHalftimeSummary ? halftimeTotals.home.rebounds : homeTotals.rebounds}
                    </div>
                    <div>
                      <span className="stat-label">Ast:</span>{' '}
                      {isHalftimeSummary ? halftimeTotals.home.assists : homeTotals.assists}
                    </div>
                  </div>
                </div>

                <div className="quarter-summary-divider" />

                <div className="quarter-summary-team">
                  <div className="summary-team-name">{currentMatch.away.name}</div>
                  <div className="summary-score">
                    {isHalftimeSummary ? halftimeScore.away : currentQuarterScore.away}
                  </div>
                  <div className="summary-label">Points</div>
                  <div className="summary-stats-grid">
                    <div>
                      <span className="stat-label">Fouls:</span>{' '}
                      {isHalftimeSummary ? halftimeTeamFouls.away : currentQuarterFouls.away}
                    </div>
                    <div>
                      <span className="stat-label">Reb:</span>{' '}
                      {isHalftimeSummary ? halftimeTotals.away.rebounds : awayTotals.rebounds}
                    </div>
                    <div>
                      <span className="stat-label">Ast:</span>{' '}
                      {isHalftimeSummary ? halftimeTotals.away.assists : awayTotals.assists}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {quarterSummaryView === 'log' && (
              <div className="quarter-summary-panel-body log-panel">
                {Array.from({ length: currentMatch.quarter }, (_, i) => currentMatch.quarter - i).map((q) => (
                  <div key={q} className="log-quarter">
                    <div className="log-quarter-title">Q{q}</div>

                    {groupedLog[q].length === 0 ? (
                      <div className="log-empty">No events</div>
                    ) : (
                      [...groupedLog[q]].reverse().map((evt) => {
                        const running = getRunningScoreUntil(currentMatch.events, evt.id)

                        return (
                          <div
                            key={evt.id}
                            className={`log-row ${
                              evt.type === 'shot'
                                ? `log-row-shot-${evt.result === 'made' ? 'made' : 'missed'}`
                                : `log-row-${evt.type}`
                            }`}
                          >
                            <div className="log-main">
                              <div className="log-desc">{describeMatchEvent(evt, currentMatch)}</div>
                              <div className="log-score-mini">
                                Score: {running.home}-{running.away}
                              </div>
                            </div>
                            <button className="undo-row-btn" onClick={() => undoEvent(evt.id)}>
                              Undo
                            </button>
                          </div>
                        )
                      })
                    )}
                  </div>
                ))}
              </div>
            )}

            {quarterSummaryView === 'box' && (
              <div className="quarter-summary-panel-body quarter-summary-box-panel">
                {renderSummaryBoxScore(currentMatch.home.name, currentMatch.home.players, homeStats)}
                {renderSummaryBoxScore(currentMatch.away.name, currentMatch.away.players, awayStats)}
              </div>
            )}

            <div className="quarter-summary-actions">
              {quarterSummaryView === 'summary' ? (
                <>
                  <button className="danger-outline-btn" onClick={() => setQuarterSummaryOpen(false)}>
                    Back to Game
                  </button>
                  <button
                    className="mini-panel-btn"
                    onClick={() => setQuarterSummaryView('log')}
                  >
                    Live Log
                  </button>
                  <button
                    className="mini-panel-btn"
                    onClick={() => setQuarterSummaryView('box')}
                  >
                    Box Score
                  </button>
                  {currentMatch.quarter < 4 && (
                    <button
                      className="primary-btn"
                      onClick={() => {
                        advanceQuarterFromSummary()
                        setQuarterSummaryOpen(false)
                      }}
                    >
                      {isHalftimeSummary ? 'Start Q3' : `Start Q${currentMatch.quarter + 1}`}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button className="mini-panel-btn" onClick={() => setQuarterSummaryView('summary')}>
                    Back to Summary
                  </button>
                  <button className="danger-outline-btn" onClick={() => setQuarterSummaryOpen(false)}>
                    Back to Game
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {false && quarterSummaryOpen && currentMatch && (
        <div className="modal-overlay" onClick={() => setQuarterSummaryOpen(false)}>
          <div className="modal-card quarter-summary-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <h3>Quarter {currentMatch.quarter} Summary</h3>
              <button className="modal-close" onClick={() => setQuarterSummaryOpen(false)}>
                ✕
              </button>
            </div>

            <div className="quarter-summary-content">
              <div className="quarter-summary-team">
                <div className="summary-team-name">{currentMatch.home.name}</div>
                <div className="summary-score">{currentQuarterScore.home}</div>
                <div className="summary-label">Points</div>
                <div className="summary-stats-grid">
                  <div><span className="stat-label">Fouls:</span> {currentQuarterFouls.home}</div>
                  <div><span className="stat-label">Reb:</span> {homeTotals.rebounds}</div>
                  <div><span className="stat-label">Ast:</span> {homeTotals.assists}</div>
                </div>
              </div>

              <div className="quarter-summary-divider" />

              <div className="quarter-summary-team">
                <div className="summary-team-name">{currentMatch.away.name}</div>
                <div className="summary-score">{currentQuarterScore.away}</div>
                <div className="summary-label">Points</div>
                <div className="summary-stats-grid">
                  <div><span className="stat-label">Fouls:</span> {currentQuarterFouls.away}</div>
                  <div><span className="stat-label">Reb:</span> {awayTotals.rebounds}</div>
                  <div><span className="stat-label">Ast:</span> {awayTotals.assists}</div>
                </div>
              </div>
            </div>

            <div className="quarter-summary-actions">
              <button className="danger-outline-btn" onClick={() => setQuarterSummaryOpen(false)}>
                Back to Game
              </button>
              {currentMatch.quarter < 4 && (
                <button
                  className="primary-btn"
                  onClick={() => {
                    changeQuarter(1)
                    setQuarterSummaryOpen(false)
                  }}
                >
                  Start Q{currentMatch.quarter + 1}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}



