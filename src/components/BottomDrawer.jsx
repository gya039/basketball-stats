export default function BottomDrawer({
  bottomPanelOpen,
  setBottomPanelOpen,
  panelView,
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

  return (
    <div className="bottom-drawer-overlay" onClick={() => setBottomPanelOpen(false)}>
      <div className="bottom-panel-court drawer-panel open" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <div className="drawer-title">{panelView === 'log' ? 'Live Log' : 'Box Score'}</div>
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
                      <div key={evt.id} className={`log-row log-row-${evt.type}`}>
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
      </div>
    </div>
  )
}
