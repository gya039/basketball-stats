export default function LiveScoreboard({
  currentMatch,
  currentQuarterScore,
  currentQuarterFouls,
  homeTotals,
  awayTotals,
  homeTeamColor,
  awayTeamColor,
  homeAttackingSide,
  awayAttackingSide,
  panelView,
  bottomPanelOpen,
  setPanelView,
  setBottomPanelOpen,
  clearShotMapPlayerFilter,
  setQuarterSummaryOpen,
  openFixAssistModal,
  fixAssistDisabled,
  endMatchDisabled,
  goToMenu,
  endMatch,
}) {
  return (
    <div className="live-topbar">
      <div
        className="score-team-block home"
        style={{ '--score-accent': homeTeamColor }}
      >
        <div className="score-team-head">
          <div>
            <div className="score-team-label">Home</div>
            <div className="score-team-name">{currentMatch.home.name}</div>
          </div>
          <div className="score-team-kicker">Attacking {homeAttackingSide}</div>
        </div>
        <div className="score-big-row">
          <div className="score-big">{currentQuarterScore.home}</div>
          <div className="score-quarter-note">Quarter Score</div>
        </div>
        <div className="score-meta-row">
          <div className="score-sub score-sub-total">Total: {homeTotals.points}</div>
          <div className="score-sub">Q{currentMatch.quarter} fouls {currentQuarterFouls.home}</div>
        </div>
      </div>

      <div className="score-center-block">
        <div className="score-center-topline">
          <div className="score-center-head">Courtside Control</div>
          <div className="score-live-chip">Live</div>
        </div>

        <div className="quarter-controls">
          <div className="quarter-label">Q{currentMatch.quarter}</div>
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
              clearShotMapPlayerFilter()
              setPanelView('log')
              setBottomPanelOpen(true)
            }}
          >
            Live Log
          </button>

          <button
            className={`mini-panel-btn ${panelView === 'box' && bottomPanelOpen ? 'active' : ''}`}
            onClick={() => {
              clearShotMapPlayerFilter()
              setPanelView('box')
              setBottomPanelOpen(true)
            }}
          >
            Box Score
          </button>

          <button
            className={`mini-panel-btn ${panelView === 'shots' && bottomPanelOpen ? 'active' : ''}`}
            onClick={() => {
              clearShotMapPlayerFilter()
              setPanelView('shots')
              setBottomPanelOpen(true)
            }}
          >
            Shot Map
          </button>
        </div>

        <div className="score-center-footer">
          <button className="end-btn" onClick={endMatch} disabled={endMatchDisabled}>
            End Match
          </button>
        </div>
      </div>

      <div
        className="score-team-block away"
        style={{ '--score-accent': awayTeamColor }}
      >
        <div className="score-team-head">
          <div>
            <div className="score-team-label">Away</div>
            <div className="score-team-name">{currentMatch.away.name}</div>
          </div>
          <div className="score-team-kicker">Attacking {awayAttackingSide}</div>
        </div>
        <div className="score-big-row">
          <div className="score-big">{currentQuarterScore.away}</div>
          <div className="score-quarter-note">Quarter Score</div>
        </div>
        <div className="score-meta-row">
          <div className="score-sub score-sub-total">Total: {awayTotals.points}</div>
          <div className="score-sub">Q{currentMatch.quarter} fouls {currentQuarterFouls.away}</div>
        </div>
      </div>
    </div>
  )
}
