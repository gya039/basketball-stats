import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { supabase } from './lib/supabase'
import titansLogo from './assets/titans-logo.png'
import titansJerseyBack from './assets/titans-jersey-back.jpeg'
import LiveScoreboard from './components/LiveScoreboard'
import CourtLayout from './components/CourtLayout'
import SelectedPlayerDock from './components/SelectedPlayerDock'
import BottomDrawer from './components/BottomDrawer'
import MatchDetailView from './components/MatchDetailView'

const STORAGE_KEYS = {
  homeTeam: 'basketball_home_team_v11',
  savedMatches: 'basketball_saved_matches_v11',
  currentMatch: 'basketball_current_match_v11',
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
      if (evt.type === 'foul' && evt.quarter === quarter) {
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

function describeEvent(evt, match) {
  if (evt.type === 'shot') {
    const team = match[evt.teamKey]
    const oppTeam = evt.teamKey === 'home' ? match.away : match.home
    const shooter = findPlayerById(team.players, evt.shooterId)
    const assister = evt.assistPlayerId ? findPlayerById(team.players, evt.assistPlayerId) : null
    const blocker = evt.blockerId ? findPlayerById(oppTeam.players, evt.blockerId) : null

    if (evt.result === 'made') {
      if (evt.shotType === 'FT') {
        return `${formatPlayer(shooter)} made FT ${evt.freeThrowNumber || 1} of ${evt.freeThrowTotal || 1}`
      }

      return `${formatPlayer(shooter)} made ${evt.shotType}${assister ? ` — AST ${formatPlayer(assister)}` : ''}`
    }

    if (evt.shotType === 'FT') {
      return `${formatPlayer(shooter)} missed FT ${evt.freeThrowNumber || 1} of ${evt.freeThrowTotal || 1}`
    }

    return `${formatPlayer(shooter)} missed ${evt.shotType}${blocker ? ` — BLK ${formatPlayer(blocker)}` : ''}`
  }

  if (evt.type === 'rebound') {
    const team = match[evt.teamKey]
    const player = evt.playerId ? findPlayerById(team.players, evt.playerId) : null

    if (!player) return `${team.name} team rebound`
    return `${formatPlayer(player)} ${evt.reboundType === 'oreb' ? 'offensive' : 'defensive'} rebound`
  }

  if (evt.type === 'foul') {
    const foulingTeam = match[evt.teamKey]
    const fouledTeam = evt.teamKey === 'home' ? match.away : match.home
    const fouler = findPlayerById(foulingTeam.players, evt.foulerId)
    const fouled = findPlayerById(fouledTeam.players, evt.fouledPlayerId)
    return `${formatPlayer(fouler)} foul — ${formatPlayer(fouled)} fouled`
  }

  if (evt.type === 'turnover') {
    const team = match[evt.teamKey]
    const oppTeam = evt.teamKey === 'home' ? match.away : match.home
    const player = findPlayerById(team.players, evt.playerId)
    const stealer = evt.forcedByPlayerId ? findPlayerById(oppTeam.players, evt.forcedByPlayerId) : null

    return `${formatPlayer(player)} turnover${stealer ? ` — STL ${formatPlayer(stealer)}` : ''}`
  }

  if (evt.type === 'substitution') {
    const team = match[evt.teamKey]
    const outPlayer = findPlayerById(team.players, evt.playerOutId)
    const inPlayer = findPlayerById(team.players, evt.playerInId)
    return `${formatPlayer(outPlayer)} out — ${formatPlayer(inPlayer)} in`
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
      players: row.home_players || [],
      onCourt: row.home_on_court || [],
    },
    away: {
      name: row.away_team_name,
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

  const [homeTeam, setHomeTeam] = useState({
    name: 'Loading team...',
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
  })

  const [foulModal, setFoulModal] = useState({
    open: false,
    foulerTeamKey: '',
    foulerId: '',
  })

  const [reboundModal, setReboundModal] = useState({
    open: false,
    relatedShotEventId: '',
    mode: 'choice',
    reboundType: '',
    pickerTeamKey: '',
  })

  const [turnoverModal, setTurnoverModal] = useState({
    open: false,
    teamKey: '',
    playerId: '',
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

  const [quarterSummaryOpen, setQuarterSummaryOpen] = useState(false)

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

    setCurrentMatchId(liveMatchRow.id)
    setCurrentMatch(liveMatch)
    setSelectedTeam('home')
    setSelectedPlayerId(liveMatch.home?.onCourt?.[0] || '')
    setScreen('live')
  }

  useEffect(() => {
    async function loadAppData() {
      const { data: teamRows, error: teamError } = await supabase
        .from('teams')
        .select('id, name, created_at')
        .order('created_at', { ascending: false })
        .limit(1)

      if (teamError) {
        console.error('Failed to load team from Supabase:', teamError)
        setHasLoaded(true)
        return
      }

      const teamRow = teamRows?.[0]

      if (!teamRow) {
        console.error('No team found in Supabase.')
        setHasLoaded(true)
        return
      }

      const { data: playerRows, error: playersError } = await supabase
        .from('players')
        .select('id, name, number')
        .eq('team_id', teamRow.id)
        .order('number', { ascending: true })

      if (playersError) {
        console.error('Failed to load players from Supabase:', playersError)
        setHasLoaded(true)
        return
      }

      setHomeTeamId(teamRow.id)
      setHomeTeam({
        name: teamRow.name,
        players: playerRows || [],
      })
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

      const { error: matchError } = await supabase
        .from('matches')
        .update({
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
        })
        .eq('id', currentMatchId)

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
    return getPlayerStatsFromEvents(currentMatch.home.players, homeEvents)
  }, [currentMatch, homeEvents])

  const awayStats = useMemo(() => {
    if (!currentMatch) return {}
    return getPlayerStatsFromEvents(currentMatch.away.players, awayEvents)
  }, [currentMatch, awayEvents])

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

  function resetNewMatchForm() {
    setNewMatch({
      opponentName: '',
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

    const match = {
      id: Date.now().toString(),
      date: newMatch.date || new Date().toISOString().slice(0, 10),
      venue: newMatch.venue || '',
      quarter: 1,
      home: {
        name: homeTeam.name.trim() || 'Home Team',
        players: [...homeTeam.players],
        onCourt: [...startingFive.home],
      },
      away: {
        name: newMatch.opponentName.trim() || 'Opponent',
        players: [...newMatch.opponentPlayers],
        onCourt: [...startingFive.away],
      },
      events: [],
    }

    const { data: insertedMatch, error } = await supabase
      .from('matches')
      .insert({
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
      })
      .select('id')
      .single()

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
    if (!currentMatch) return
    setCurrentMatch((prev) => ({
      ...prev,
      quarter: Math.max(1, Math.min(4, prev.quarter + delta)),
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

  function submitShot() {
    if (!currentMatch || !selectedPlayerId) return
    const { shotType, result } = shotModal
    if (!shotType) return
    if (shotType !== 'FT' && !result) return

    const teamKey = selectedTeam
    const team = currentMatch[teamKey]
    const lineupSnapshot = [...team.onCourt]

    if (shotType === 'FT') {
      closeShotModal()
      setFreeThrowFlow({
        open: true,
        step: 'count',
        total: 1,
        current: 1,
        teamKey,
        shooterId: selectedPlayerId,
      })
      return
    }

    if (result === 'made' && (shotType === '2PT' || shotType === '3PT')) {
      setAssistModal({
        open: true,
        teamKey,
        shooterId: selectedPlayerId,
        shotType,
      })
      closeShotModal()
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
      shooterId: selectedPlayerId,
      assistPlayerId: null,
      blockerId: null,
      points,
      lineupSnapshot,
    })

    const updatedMatch = {
      ...currentMatch,
      events: [...currentMatch.events, shotEvent],
    }

    setCurrentMatch(updatedMatch)
    if (result === 'missed') {
  flashPlayer(selectedPlayerId, 'player-missed')
}
    closeShotModal()

    if (result === 'missed' && (shotType === '2PT' || shotType === '3PT')) {
      setReboundModal({
        open: true,
        relatedShotEventId: shotEvent.id,
        mode: 'choice',
        reboundType: '',
        pickerTeamKey: '',
      })
    }
  }

  function completeMadeBasket(assistPlayerId = null) {
    if (!currentMatch || !assistModal.open) return

    const { teamKey, shooterId, shotType } = assistModal
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
    })
  }

  function closeFoulModal() {
    setFoulModal({
      open: false,
      foulerTeamKey: '',
      foulerId: '',
    })
  }

  function submitFoul(fouledPlayerId) {
    if (!currentMatch || !foulModal.open) return

    const { foulerTeamKey, foulerId } = foulModal
    const team = currentMatch[foulerTeamKey]

    const foulEvent = createEvent({
      quarter: currentMatch.quarter,
      teamKey: foulerTeamKey,
      type: 'foul',
      foulerId,
      fouledPlayerId,
      lineupSnapshot: [...team.onCourt],
    })

    const updatedMatch = {
      ...currentMatch,
      events: [...currentMatch.events, foulEvent],
    }

    setCurrentMatch(updatedMatch)
    flashPlayer(foulerId, 'player-foul-flash')
    closeFoulModal()

    const teamEvents = updatedMatch.events.filter((e) => e.teamKey === foulerTeamKey)
    const teamStats = getPlayerStatsFromEvents(team.players, teamEvents)
    const fouls = teamStats[foulerId]?.foul || 0

    if (fouls === 4) {
      const player = findPlayerById(team.players, foulerId)
      alert(`${formatPlayer(player)} is on 4 fouls.`)
    }

    if (fouls >= 5) {
      const player = findPlayerById(team.players, foulerId)
      alert(`${formatPlayer(player)} has fouled out and must be substituted.`)

      if (team.onCourt.includes(foulerId)) {
        setSubModal({
          open: true,
          teamKey: foulerTeamKey,
          outgoingPlayerId: foulerId,
        })
      }
    }
  }

  function openReboundModal() {
    setReboundModal({
      open: true,
      relatedShotEventId: '',
      mode: 'choice',
      reboundType: '',
      pickerTeamKey: '',
    })
  }

  function closeReboundModal() {
    setReboundModal({
      open: false,
      relatedShotEventId: '',
      mode: 'choice',
      reboundType: '',
      pickerTeamKey: '',
    })
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
      teamKey: '',
      playerId: '',
    })
  }

  function submitTurnover(forcedByPlayerId = null) {
    if (!currentMatch || !turnoverModal.open) return

    const { teamKey, playerId } = turnoverModal
    const team = currentMatch[teamKey]

    const evt = createEvent({
      quarter: currentMatch.quarter,
      teamKey,
      type: 'turnover',
      playerId,
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

    return team.onCourt.map((playerId) => {
      const player = findPlayerById(team.players, playerId)
      if (!player) return null

      const s = getOnCourtStats(playerId, teamEvents)
      const selected = selectedTeam === teamKey && selectedPlayerId === player.id
      const foulClass =
        s.foul >= 5 ? 'fouled-out' : s.foul === 4 ? 'danger-foul' : s.foul === 3 ? 'warn-foul' : ''

      return (
        <button
          key={player.id}
          className={`side-player ${teamKey} ${selected ? 'selected' : ''} ${foulClass} ${playerFlashMap[player.id] || ''}`}
          onClick={() => {
            setSelectedTeam(teamKey)
            setSelectedPlayerId(player.id)
          }}
        >
          <div className="side-player-number">#{player.number}</div>
          <div className="side-player-name">{getDisplayName(player)}</div>
          {s.foul >= 3 && (
            <div className={`foul-badge foul-count-${s.foul}`}>{s.foul} PF</div>
          )}
          <div className="side-player-mini">
            <span>{s.pts} PTS</span>
            <span>{s.reb} REB</span>
            <span>{s.ast} AST</span>
            <span>{s.foul} PF</span>
          </div>
        </button>
      )
    })
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

  const turnoverStealOptions =
    turnoverModal.open && currentMatch ? getOnCourtOpponents(turnoverModal.teamKey) : []

  const reboundPickerOptions =
    reboundModal.open && reboundModal.mode === 'player' && currentMatch
      ? getOnCourtPlayers(reboundModal.pickerTeamKey)
      : []
  const recentSavedMatch = savedMatches[0] || null
  const previewPlayers = homeTeam.players.slice(0, 5)
  const extraPlayersCount = Math.max(homeTeam.players.length - previewPlayers.length, 0)

  return (
    <div className="app">
      {screen === 'home' && (
        <div className="page home-page">
          <div className="home-top-grid">
            <div className="hero-card">
            <div className="hero-icon">🏀</div>
            <h1>Basketball Ops for the Titans.</h1>
            <p>Track your roster, run live games courtside, and keep every result looking professional.</p>
            </div>

            <div className="info-card home-roster-card">
              <div className="info-title">Current Home Team</div>
              <div className="info-main">{homeTeam.name}</div>
              <div className="info-sub">{homeTeam.players.length} players saved</div>

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

          {liveMatches.length > 0 && (
            <div className="card">
              <div className="section-title">Shared Live Matches</div>
              <div className="matches-list">
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
                      {currentMatchId === match.id && (
                        <button className="danger-outline-btn" onClick={discardCurrentMatch}>
                          Discard
                        </button>
                      )}
                    </div>
                  </div>
                ))}
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

        </div>
      )}

      {screen === 'manageHome' && (
        <div className="page">
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
        <div className="page">
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
              <div className="preload-sub">{homeTeam.players.length} saved players loaded</div>
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
        <div className="page">
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
        <div className="live-court-page">
          <div className="court-background">
            <div className="court-overlay-lines" />
          </div>

          <LiveScoreboard
            currentMatch={currentMatch}
            currentQuarterScore={currentQuarterScore}
            currentQuarterFouls={currentQuarterFouls}
            homeTotals={homeTotals}
            awayTotals={awayTotals}
            panelView={panelView}
            bottomPanelOpen={bottomPanelOpen}
            setPanelView={setPanelView}
            setBottomPanelOpen={setBottomPanelOpen}
            changeQuarter={changeQuarter}
            setQuarterSummaryOpen={setQuarterSummaryOpen}
            goToMenu={() => setScreen('home')}
            endMatch={endMatch}
          />

          <CourtLayout
            titansLogo={titansLogo}
            renderCourtPlayers={(teamKey) => renderCourtPlayers(teamKey)}
          />

          <SelectedPlayerDock
            currentMatch={currentMatch}
            selectedTeam={selectedTeam}
            selectedPlayer={selectedPlayer}
            selectedStats={selectedStats}
            titansJerseyBack={titansJerseyBack}
            fixableScoringEvents={fixableScoringEvents}
            openFixAssistModal={openFixAssistModal}
            openSubModal={openSubModal}
            setShotModal={setShotModal}
            openReboundModal={openReboundModal}
            setFoulModal={setFoulModal}
            setTurnoverModal={setTurnoverModal}
          />

          <BottomDrawer
            bottomPanelOpen={bottomPanelOpen}
            setBottomPanelOpen={setBottomPanelOpen}
            panelView={panelView}
            groupedLog={groupedLog}
            currentMatch={currentMatch}
            undoEvent={undoEvent}
            getRunningScoreUntil={getRunningScoreUntil}
            describeEvent={describeEvent}
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
        <div className="page matches-page">
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
          onClick={() => setAssistModal({ open: false, teamKey: '', shooterId: '', shotType: '' })}
        >
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <h3>Assist?</h3>
              <button
                className="modal-close"
                onClick={() => setAssistModal({ open: false, teamKey: '', shooterId: '', shotType: '' })}
              >
                ✕
              </button>
            </div>

            <div className="modal-subtext">
              {assistScorer
                ? `${formatPlayer(assistScorer)} made ${assistModal.shotType}. Who assisted?`
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

      {foulModal.open && (
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
              <h3>Turnover</h3>
              <button className="modal-close" onClick={closeTurnoverModal}>
                ✕
              </button>
            </div>

            <div className="modal-subtext">Was it a steal?</div>

            <div className="bench-list">
              {turnoverStealOptions.map((player) => (
                <button
                  key={player.id}
                  className="bench-item"
                  onClick={() => submitTurnover(player.id)}
                >
                  <div className="avatar">#{player.number}</div>
                  <div className="bench-name">{formatPlayer(player)}</div>
                </button>
              ))}

              <button className="bench-item no-assist-btn" onClick={() => submitTurnover(null)}>
                <div className="avatar">—</div>
                <div className="bench-name">No Steal</div>
              </button>
            </div>
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
