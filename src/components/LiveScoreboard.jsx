export default function LiveScoreboard({
  currentMatch,
  currentQuarterScore,
  currentQuarterFouls,
  homeTotals,
  awayTotals,
  panelView,
  bottomPanelOpen,
  setPanelView,
  setBottomPanelOpen,
  changeQuarter,
  setQuarterSummaryOpen,
  openFixAssistModal,
  fixAssistDisabled,
  goToMenu,
  endMatch,
}) {
  return (
    <div className="live-topbar">
      <div className="score-team-block home">
        <div className="score-team-name">{currentMatch.home.name}</div>
        <div className="score-big">{currentQuarterScore.home}</div>
        <div className="score-sub">{homeTotals.points} total</div>
        <div className="score-sub">
          Team fouls Q{currentMatch.quarter}: {currentQuarterFouls.home}
        </div>
      </div>

      <div className="score-center-block">
        <div className="quarter-controls">
          <button className="quarter-btn" onClick={() => changeQuarter(-1)}>
            ‹
          </button>
          <div className="quarter-label">Q{currentMatch.quarter}</div>
          <button className="quarter-btn" onClick={() => changeQuarter(1)}>
            ›
          </button>
        </div>

        {currentMatch.quarter < 4 && (
          <button className="quarter-over-btn" onClick={() => setQuarterSummaryOpen(true)}>
            Quarter Over
          </button>
        )}

        <div className="center-actions">
          <button className="mini-panel-btn" onClick={goToMenu}>
            Back to Menu
          </button>

          <button
            className="mini-panel-btn"
            onClick={openFixAssistModal}
            disabled={fixAssistDisabled}
          >
            Fix Assist
          </button>

          <button
            className={`mini-panel-btn ${panelView === 'log' && bottomPanelOpen ? 'active' : ''}`}
            onClick={() => {
              setPanelView('log')
              setBottomPanelOpen(true)
            }}
          >
            Live Log
          </button>

          <button
            className={`mini-panel-btn ${panelView === 'box' && bottomPanelOpen ? 'active' : ''}`}
            onClick={() => {
              setPanelView('box')
              setBottomPanelOpen(true)
            }}
          >
            Box Score
          </button>
        </div>

        <button className="end-btn" onClick={endMatch}>
          End Match
        </button>
      </div>

      <div className="score-team-block away">
        <div className="score-team-name">{currentMatch.away.name}</div>
        <div className="score-big">{currentQuarterScore.away}</div>
        <div className="score-sub">{awayTotals.points} total</div>
        <div className="score-sub">
          Team fouls Q{currentMatch.quarter}: {currentQuarterFouls.away}
        </div>
      </div>
    </div>
  )
}
