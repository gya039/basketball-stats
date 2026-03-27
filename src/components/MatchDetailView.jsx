function pct(made, att) {
  if (!att) return '0%'
  return `${Math.round((made / att) * 100)}%`
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

function findPlayerById(players, id) {
  return players.find((p) => p.id === id)
}

function formatPlayer(player) {
  if (!player) return ''
  return `${player.name} (#${player.number})`
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

    if (evt.type === 'rebound' && evt.playerId) {
      if (!stats[evt.playerId]) stats[evt.playerId] = getEmptyStatLine()
      if (evt.reboundType === 'oreb') stats[evt.playerId].oreb += 1
      if (evt.reboundType === 'dreb') stats[evt.playerId].dreb += 1
      stats[evt.playerId].reb += 1
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

function getEventsByQuarter(events) {
  return {
    1: events.filter((e) => e.quarter === 1),
    2: events.filter((e) => e.quarter === 2),
    3: events.filter((e) => e.quarter === 3),
    4: events.filter((e) => e.quarter === 4),
  }
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
      return `${formatPlayer(shooter)} made ${evt.shotType}${assister ? ` - AST ${formatPlayer(assister)}` : ''}`
    }

    if (evt.shotType === 'FT') {
      return `${formatPlayer(shooter)} missed FT ${evt.freeThrowNumber || 1} of ${evt.freeThrowTotal || 1}`
    }

    return `${formatPlayer(shooter)} missed ${evt.shotType}${blocker ? ` - BLK ${formatPlayer(blocker)}` : ''}`
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
    return `${formatPlayer(fouler)} foul - ${formatPlayer(fouled)} fouled`
  }

  if (evt.type === 'turnover') {
    const team = match[evt.teamKey]
    const oppTeam = evt.teamKey === 'home' ? match.away : match.home
    const player = findPlayerById(team.players, evt.playerId)
    const stealer = evt.forcedByPlayerId ? findPlayerById(oppTeam.players, evt.forcedByPlayerId) : null
    return `${formatPlayer(player)} turnover${stealer ? ` - STL ${formatPlayer(stealer)}` : ''}`
  }

  if (evt.type === 'substitution') {
    const team = match[evt.teamKey]
    const outPlayer = findPlayerById(team.players, evt.playerOutId)
    const inPlayer = findPlayerById(team.players, evt.playerInId)
    return `${formatPlayer(outPlayer)} out - ${formatPlayer(inPlayer)} in`
  }

  return 'Event'
}

function getTeamTotals(players, statsMap) {
  return players.reduce(
    (acc, player) => {
      const stats = statsMap[player.id] || getEmptyStatLine()
      acc.points += stats.pts
      acc.rebounds += stats.reb
      acc.assists += stats.ast
      acc.steals += stats.stl
      acc.blocks += stats.blk
      acc.turnovers += stats.tov
      return acc
    },
    {
      points: 0,
      rebounds: 0,
      assists: 0,
      steals: 0,
      blocks: 0,
      turnovers: 0,
    }
  )
}

function getTeamLeader(players, statsMap, statKey) {
  return players.reduce((best, player) => {
    const value = statsMap[player.id]?.[statKey] || 0
    if (!best || value > best.value) {
      return { player, value }
    }
    return best
  }, null)
}

function renderLeader(label, leader) {
  if (!leader || !leader.player) {
    return (
      <div className="match-detail-leader">
        <span>{label}</span>
        <strong>No leader</strong>
      </div>
    )
  }

  return (
    <div className="match-detail-leader">
      <span>{label}</span>
      <strong>
        {leader.player.name} ({leader.value})
      </strong>
    </div>
  )
}

function renderBoxScore(teamName, players, statsMap, totals) {
  const scoringLeader = getTeamLeader(players, statsMap, 'pts')
  const reboundLeader = getTeamLeader(players, statsMap, 'reb')
  const assistLeader = getTeamLeader(players, statsMap, 'ast')

  return (
    <div className="card match-detail-card">
      <div className="match-detail-section-head">
        <div>
          <div className="section-title">Box Score</div>
          <div className="match-detail-team-heading">{teamName}</div>
        </div>

        <div className="match-detail-inline-stats">
          <span>{totals.points} PTS</span>
          <span>{totals.rebounds} REB</span>
          <span>{totals.assists} AST</span>
        </div>
      </div>

      <div className="match-detail-leader-row">
        {renderLeader('Top scorer', scoringLeader)}
        {renderLeader('Top rebounder', reboundLeader)}
        {renderLeader('Top playmaker', assistLeader)}
      </div>

      <div className="match-detail-table-wrap">
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
    </div>
  )
}

export default function MatchDetailView({ match, onBack }) {
  const events = match.events || []
  const groupedLog = getEventsByQuarter(events)
  const homeEvents = events.filter((e) => e.teamKey === 'home')
  const awayEvents = events.filter((e) => e.teamKey === 'away')

  const homeStats = getPlayerStatsFromEvents(match.home.players, homeEvents)
  const awayStats = getPlayerStatsFromEvents(match.away.players, awayEvents)

  const homeTotals = getTeamTotals(match.home.players, homeStats)
  const awayTotals = getTeamTotals(match.away.players, awayStats)

  const quarterScores = match.quarterScores || {
    1: { home: 0, away: 0 },
    2: { home: 0, away: 0 },
    3: { home: 0, away: 0 },
    4: { home: 0, away: 0 },
  }

  const homeWon = match.finalScore.home > match.finalScore.away
  const awayWon = match.finalScore.away > match.finalScore.home
  const resultLabel = homeWon
    ? `${match.home.name} won`
    : awayWon
      ? `${match.away.name} won`
      : 'Match tied'
  const margin = Math.abs(match.finalScore.home - match.finalScore.away)
  const totalPoints = match.finalScore.home + match.finalScore.away
  const savedAtLabel = match.savedAt ? new Date(match.savedAt).toLocaleString() : 'Unknown'

  return (
    <div className="page match-detail-page">
      <div className="topbar match-detail-topbar">
        <button className="back-btn" onClick={onBack}>
          Back
        </button>
        <div className="match-detail-topbar-copy">
          <div className="section-title">Saved Match</div>
          <h2>Match Detail</h2>
        </div>
      </div>

      <div className="match-detail-hero">
        <div className="match-detail-hero-copy">
          <div className="match-detail-kicker">Final Recap</div>
          <h1>
            {match.home.name} vs {match.away.name}
          </h1>
          <p>
            A polished postgame view with the final score, quarter breakdown, team leaders, and
            full event timeline.
          </p>

          <div className="match-detail-meta-pills">
            <span>{match.date || 'No date set'}</span>
            <span>{match.venue || 'Venue not set'}</span>
            <span>Saved {savedAtLabel}</span>
          </div>
        </div>

        <div className="match-detail-scoreboard">
          <div className="match-detail-team-score home">
            <div className="match-detail-team-label">{match.home.name}</div>
            <div className="match-detail-score">{match.finalScore.home}</div>
          </div>

          <div className="match-detail-score-center">
            <div className="match-detail-result-pill">{resultLabel}</div>
            <div className="match-detail-score-separator">Final</div>
            <div className="match-detail-score-note">
              {margin === 0 ? 'Dead even at the buzzer' : `${margin}-point margin`}
            </div>
          </div>

          <div className="match-detail-team-score away">
            <div className="match-detail-team-label">{match.away.name}</div>
            <div className="match-detail-score">{match.finalScore.away}</div>
          </div>
        </div>
      </div>

      <div className="match-detail-insights">
        <div className="card match-detail-insight-card">
          <div className="section-title">Outcome</div>
          <div className="match-detail-insight-value">{resultLabel}</div>
          <div className="info-sub">
            {margin === 0 ? 'No team separated itself on the scoreboard.' : `Won by ${margin}.`}
          </div>
        </div>

        <div className="card match-detail-insight-card">
          <div className="section-title">Game Total</div>
          <div className="match-detail-insight-value">{totalPoints}</div>
          <div className="info-sub">Combined points scored.</div>
        </div>

        <div className="card match-detail-insight-card">
          <div className="section-title">Event Count</div>
          <div className="match-detail-insight-value">{events.length}</div>
          <div className="info-sub">Tracked possessions and actions.</div>
        </div>

        <div className="card match-detail-insight-card">
          <div className="section-title">Team Edge</div>
          <div className="match-detail-insight-value">
            {homeTotals.assists === awayTotals.assists
              ? 'Level'
              : homeTotals.assists > awayTotals.assists
                ? `${match.home.name} AST`
                : `${match.away.name} AST`}
          </div>
          <div className="info-sub">
            Assists: {homeTotals.assists} to {awayTotals.assists}
          </div>
        </div>
      </div>

      <div className="card match-detail-card">
        <div className="match-detail-section-head">
          <div>
            <div className="section-title">Quarter Breakdown</div>
            <div className="match-detail-section-subtitle">Score by quarter and final totals</div>
          </div>
        </div>

        <div className="match-detail-table-wrap">
          <div className="quarter-summary-table">
            <div className="quarter-summary-head">Team</div>
            <div className="quarter-summary-head">Q1</div>
            <div className="quarter-summary-head">Q2</div>
            <div className="quarter-summary-head">Q3</div>
            <div className="quarter-summary-head">Q4</div>
            <div className="quarter-summary-head">Total</div>

            <div className="quarter-summary-row team-name-cell">{match.home.name}</div>
            <div className="quarter-summary-row">{quarterScores[1].home}</div>
            <div className="quarter-summary-row">{quarterScores[2].home}</div>
            <div className="quarter-summary-row">{quarterScores[3].home}</div>
            <div className="quarter-summary-row">{quarterScores[4].home}</div>
            <div className="quarter-summary-row total-cell">{match.finalScore.home}</div>

            <div className="quarter-summary-row team-name-cell">{match.away.name}</div>
            <div className="quarter-summary-row">{quarterScores[1].away}</div>
            <div className="quarter-summary-row">{quarterScores[2].away}</div>
            <div className="quarter-summary-row">{quarterScores[3].away}</div>
            <div className="quarter-summary-row">{quarterScores[4].away}</div>
            <div className="quarter-summary-row total-cell">{match.finalScore.away}</div>
          </div>
        </div>
      </div>

      <div className="match-detail-box-grid">
        {renderBoxScore(match.home.name, match.home.players, homeStats, homeTotals)}
        {renderBoxScore(match.away.name, match.away.players, awayStats, awayTotals)}
      </div>

      <div className="card match-detail-card">
        <div className="match-detail-section-head">
          <div>
            <div className="section-title">Event Timeline</div>
            <div className="match-detail-section-subtitle">Every logged action, grouped by quarter</div>
          </div>
          <div className="match-detail-inline-stats">
            <span>{events.length} events</span>
          </div>
        </div>

        <div className="log-panel match-detail-log-panel">
          {[4, 3, 2, 1].map((q) => (
            <div key={q} className="log-quarter match-detail-log-quarter">
              <div className="match-detail-quarter-header">
                <div className="log-quarter-title">Q{q}</div>
                <div className="match-detail-quarter-count">{groupedLog[q].length} events</div>
              </div>

              {groupedLog[q].length === 0 ? (
                <div className="log-empty">No events</div>
              ) : (
                [...groupedLog[q]].reverse().map((evt) => {
                  const running = getRunningScoreUntil(events, evt.id)
                  return (
                    <div key={evt.id} className={`log-row log-row-${evt.type}`}>
                      <div className="log-main">
                        <div className="log-desc">{describeEvent(evt, match)}</div>
                        <div className="log-score-mini">
                          Score: {running.home}-{running.away}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
