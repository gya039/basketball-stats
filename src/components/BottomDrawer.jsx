function getAttackingSide(teamKey, quarter) {
  const homeSide = quarter >= 3 ? 'left' : 'right'
  if (teamKey === 'home') return homeSide
  return homeSide === 'left' ? 'right' : 'left'
}

function getFoldedShotX(teamKey, quarter, x) {
  return getAttackingSide(teamKey, quarter) === 'left' ? 100 - x : x
}

function getHalfCourtShotX(teamKey, quarter, x) {
  const foldedX = getFoldedShotX(teamKey, quarter, x)
  return Math.max(0, Math.min(100, (foldedX - 50) * 2))
}

function getShotMapData(events, teamKey, playerId = null) {
  const shotEvents = events.filter(
    (evt) =>
      evt.type === 'shot' &&
      evt.teamKey === teamKey &&
      (!playerId || evt.shooterId === playerId || evt.playerId === playerId) &&
      evt.shotType !== 'FT' &&
      evt.shotLocation &&
      typeof evt.shotLocation.x === 'number' &&
      typeof evt.shotLocation.y === 'number'
  )

  return shotEvents.map((evt) => ({
    id: evt.id,
    x: getHalfCourtShotX(teamKey, evt.quarter, evt.shotLocation.x),
    y: evt.shotLocation.y,
    result: evt.result,
    shotType: evt.shotType,
    quarter: evt.quarter,
  }))
}

function getMadeHeatColor(intensity) {
  if (intensity >= 0.86) return 'rgba(220, 38, 38, 0.94)'
  if (intensity >= 0.66) return 'rgba(234, 88, 12, 0.9)'
  if (intensity >= 0.46) return 'rgba(245, 158, 11, 0.84)'
  if (intensity >= 0.24) return 'rgba(250, 204, 21, 0.7)'
  return 'rgba(254, 240, 138, 0.52)'
}

function getMissHeatColor(intensity) {
  if (intensity >= 0.86) return 'rgba(37, 99, 235, 0.94)'
  if (intensity >= 0.66) return 'rgba(6, 182, 212, 0.9)'
  if (intensity >= 0.46) return 'rgba(16, 185, 129, 0.84)'
  if (intensity >= 0.24) return 'rgba(74, 222, 128, 0.72)'
  return 'rgba(167, 243, 208, 0.54)'
}

function getHeatCellStyle(cell) {
  const opacity = Math.min(0.24 + cell.volumeIntensity * 0.76, 0.96)

  if (cell.made > 0 && cell.missed > 0) {
    const madeColor = getMadeHeatColor(cell.madeIntensity)
    const missColor = getMissHeatColor(cell.missedIntensity)
    return {
      background: `linear-gradient(135deg, ${missColor} 0%, ${missColor} 46%, ${madeColor} 54%, ${madeColor} 100%)`,
      opacity,
    }
  }

  if (cell.made > 0) {
    return {
      background: getMadeHeatColor(cell.madeIntensity),
      opacity,
    }
  }

  return {
    background: getMissHeatColor(cell.missedIntensity),
    opacity,
  }
}

function buildHeatGrid(shots, columns = 24, rows = 14) {
  const buckets = new Map()

  shots.forEach((shot) => {
    const column = Math.max(0, Math.min(columns - 1, Math.floor((shot.x / 100) * columns)))
    const row = Math.max(0, Math.min(rows - 1, Math.floor((shot.y / 100) * rows)))
    const key = `${column}-${row}`

    if (!buckets.has(key)) {
      buckets.set(key, {
        column,
        row,
        total: 0,
        made: 0,
        missed: 0,
      })
    }

    const bucket = buckets.get(key)
    bucket.total += 1
    if (shot.result === 'made') {
      bucket.made += 1
    } else {
      bucket.missed += 1
    }
  })

  const cells = [...buckets.values()]
  const maxTotal = cells.reduce((best, cell) => Math.max(best, cell.total), 0)
  const maxMade = cells.reduce((best, cell) => Math.max(best, cell.made), 0)
  const maxMissed = cells.reduce((best, cell) => Math.max(best, cell.missed), 0)

  return cells.map((cell) => ({
    ...cell,
    volumeIntensity: maxTotal > 0 ? cell.total / maxTotal : 0,
    madeIntensity: maxMade > 0 ? cell.made / maxMade : 0,
    missedIntensity: maxMissed > 0 ? cell.missed / maxMissed : 0,
    x: (cell.column / columns) * 100,
    y: (cell.row / rows) * 100,
    width: 100 / columns,
    height: 100 / rows,
  }))
}

function renderShotMap(teamName, shots) {
  const heatCells = buildHeatGrid(shots)
  const hasShots = shots.length > 0

  return (
    <div className="boxscore-team shot-map-panel">
      <h3 className="shot-map-title">{teamName}</h3>
      <div className="shot-map-wrap">
        <div className="shot-map-court folded-half-court">
          <div className="shot-map-half right" />
          <div className="shot-map-center-circle" />

          {heatCells.map((cell) => (
            <div
              key={`heat-${cell.column}-${cell.row}`}
              className="shot-heat-cell"
              style={{
                left: `${cell.x}%`,
                top: `${cell.y}%`,
                width: `${cell.width}%`,
                height: `${cell.height}%`,
                ...getHeatCellStyle(cell),
              }}
              title={`${cell.total} shots (${cell.made} made, ${cell.missed} missed)`}
            />
          ))}

          {!hasShots && (
            <div className="shot-map-empty-state">
              <strong>No tracked shots yet</strong>
              <span>Shot locations will appear here after court taps or holds are recorded for this player.</span>
            </div>
          )}
        </div>
      </div>

      {hasShots && (
        <div className="shot-map-legend">
          <span><i className="legend-dot miss" /> Miss-heavy areas</span>
          <span><i className="legend-dot mixed" /> Mixed results</span>
          <span><i className="legend-dot make" /> Make-heavy areas</span>
          <span><i className="legend-dot fold" /> Attacking half view</span>
        </div>
      )}
    </div>
  )
}

export default function BottomDrawer({
  bottomPanelOpen,
  setBottomPanelOpen,
  panelView,
  shotMapPlayerFilter,
  groupedLog,
  currentMatch,
  undoEvent,
  getRunningScoreUntil,
  describeEvent,
  homeStats,
  awayStats,
  getEmptyStatLine,
  pct,
}) {
  if (!bottomPanelOpen) return null

  const homeShotMap = getShotMapData(
    currentMatch.events,
    'home',
    shotMapPlayerFilter?.teamKey === 'home' ? shotMapPlayerFilter.playerId : null
  )
  const awayShotMap = getShotMapData(
    currentMatch.events,
    'away',
    shotMapPlayerFilter?.teamKey === 'away' ? shotMapPlayerFilter.playerId : null
  )
  const drawerTitle =
    panelView === 'log'
      ? 'Live Log'
      : panelView === 'box'
        ? 'Box Score'
        : shotMapPlayerFilter
          ? `${shotMapPlayerFilter.playerName} Heat Map`
          : 'Shot Map'

  return (
    <div className="bottom-drawer-overlay" onClick={() => setBottomPanelOpen(false)}>
      <div
        className={`bottom-panel-court drawer-panel open ${panelView === 'shots' ? 'shot-map-drawer' : ''} ${
          panelView === 'shots' && shotMapPlayerFilter ? 'player-heatmap-drawer' : ''
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-header">
          <div className="drawer-title">{drawerTitle}</div>
          <button className="drawer-toggle-btn" onClick={() => setBottomPanelOpen(false)}>
            Close
          </button>
        </div>

        {panelView === 'log' && (
          <div className="log-panel">
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
                          <div className="log-desc">{describeEvent(evt, currentMatch)}</div>
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

        {panelView === 'box' && (
          <div className="boxscore-panel">
            <div className="boxscore-team">
              <h3>{currentMatch.home.name}</h3>
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

                {currentMatch.home.players.map((player) => {
                  const s = homeStats[player.id] || getEmptyStatLine()
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

            <div className="boxscore-team">
              <h3>{currentMatch.away.name}</h3>
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

                {currentMatch.away.players.map((player) => {
                  const s = awayStats[player.id] || getEmptyStatLine()
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
        )}

        {panelView === 'shots' && (
          <div className={`boxscore-panel ${shotMapPlayerFilter ? '' : 'shot-map-pair-grid'}`}>
            {shotMapPlayerFilter ? (
              renderShotMap(
                `${shotMapPlayerFilter.teamName} - ${shotMapPlayerFilter.playerName}`,
                shotMapPlayerFilter.teamKey === 'home' ? homeShotMap : awayShotMap
              )
            ) : (
              <>
                {renderShotMap(currentMatch.home.name, homeShotMap)}
                {renderShotMap(currentMatch.away.name, awayShotMap)}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
