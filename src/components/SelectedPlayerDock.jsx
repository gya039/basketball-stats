export default function SelectedPlayerDock({
  currentMatch,
  selectedTeam,
  selectedPlayer,
  selectedStats,
  titansJerseyBack,
  fixableScoringEvents,
  openFixAssistModal,
  openSubModal,
  setShotModal,
  openReboundModal,
  setFoulModal,
  setTurnoverModal,
}) {
  return (
    <div className="selected-player-dock">
      <div className="selected-main-card">
        <div className="selected-team-badge">
          {selectedTeam === 'home' ? currentMatch.home.name : currentMatch.away.name}
        </div>

        <div className="selected-player-header">
          {selectedPlayer && (
            <div className="selected-jersey-card">
              <img src={titansJerseyBack} alt="Titans jersey back" />
              <div className="selected-jersey-name-overlay">
                {selectedPlayer.name.toUpperCase()}
              </div>
              <div className="selected-jersey-number-overlay">
                {selectedPlayer.number}
              </div>
            </div>
          )}

          <div className="selected-player-name-wrap">
            <div className="selected-player-name">
              {selectedPlayer ? selectedPlayer.name : 'Select a player'}
            </div>

            {selectedPlayer && (
              <>
                <div className="selected-player-subline">
                  #{selectedPlayer.number} -{' '}
                  {selectedTeam === 'home' ? currentMatch.home.name : currentMatch.away.name}
                </div>

                <div className="selected-stat-line">
                  <span>{selectedStats.pts} PTS</span>
                  <span>{selectedStats.reb} REB</span>
                  <span>{selectedStats.ast} AST</span>
                  <span>{selectedStats.foul} PF</span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="selected-tools-row">
          <button
            className="tiny-override-btn"
            onClick={openFixAssistModal}
            disabled={fixableScoringEvents.length === 0}
          >
            Fix Assist
          </button>

          {selectedPlayer && (
            <button
              className="tiny-override-btn"
              onClick={() => openSubModal(selectedTeam, selectedPlayer.id)}
            >
              Sub Player
            </button>
          )}
        </div>
      </div>

      <div className="action-dock-grid">
        <button
          className="dock-action shot"
          onClick={() => setShotModal({ open: true, shotType: '', result: '' })}
          disabled={!selectedPlayer}
        >
          Shot
        </button>

        <button
          className="dock-action rebound"
          onClick={openReboundModal}
          disabled={!selectedPlayer}
        >
          Rebound
        </button>

        <button
          className="dock-action foul"
          onClick={() =>
            setFoulModal({
              open: true,
              foulerTeamKey: selectedTeam,
              foulerId: selectedPlayer?.id || '',
            })
          }
          disabled={!selectedPlayer}
        >
          Foul
        </button>

        <button
          className="dock-action turnover"
          onClick={() =>
            setTurnoverModal({
              open: true,
              teamKey: selectedTeam,
              playerId: selectedPlayer?.id || '',
            })
          }
          disabled={!selectedPlayer}
        >
          Turnover
        </button>
      </div>
    </div>
  )
}
