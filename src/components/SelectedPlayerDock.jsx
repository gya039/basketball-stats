function getJerseyLastName(player) {
  if (!player?.name) return ''
  const parts = player.name.trim().split(/\s+/).filter(Boolean)
  return (parts[parts.length - 1] || '').toUpperCase()
}

export default function SelectedPlayerDock({
  currentMatch,
  selectedTeam,
  selectedTeamColor,
  selectedTeamSecondaryColor,
  selectedPlayer,
  selectedStats,
  titansJerseyBack,
  openSubModal,
  setShotModal,
  openReboundModal,
  setFoulModal,
  setTurnoverModal,
}) {
  return (
    <div className="selected-player-dock">
      <div
        className="selected-main-card"
        style={{
          borderColor: `${selectedTeamColor}55`,
          boxShadow: `inset 0 0 0 1px ${selectedTeamColor}22`,
        }}
      >
        <div
          className="selected-team-badge"
          style={{ background: selectedTeamColor }}
        >
          {selectedTeam === 'home' ? currentMatch.home.name : currentMatch.away.name}
        </div>

        <div className="selected-player-header">
          {selectedPlayer && (
            <div
              className="selected-jersey-card"
              style={{
                '--jersey-mask': `url(${titansJerseyBack})`,
                '--jersey-primary': selectedTeamColor,
                '--jersey-secondary': selectedTeamSecondaryColor,
              }}
            >
              <div className="selected-jersey-fill" aria-hidden="true" />
              <div className="selected-jersey-name-overlay">
                {getJerseyLastName(selectedPlayer)}
              </div>
              <div className="selected-jersey-number-overlay">
                {selectedPlayer.number}
              </div>
            </div>
          )}

          <div className="selected-player-info">
            <div className="selected-player-meta-row">
              <div className="selected-player-name-wrap">
                <div className="selected-player-name">
                  {selectedPlayer ? selectedPlayer.name : 'Select a player'}
                </div>

                {selectedPlayer && (
                  <div className="selected-player-subline">
                    #{selectedPlayer.number} -{' '}
                    {selectedTeam === 'home' ? currentMatch.home.name : currentMatch.away.name}
                  </div>
                )}
              </div>

              {selectedPlayer && (
                <div className="selected-stat-grid">
                  <span>{selectedStats.pts} PTS</span>
                  <span>{selectedStats.reb} REB</span>
                  <span>{selectedStats.ast} AST</span>
                  <span>{selectedStats.foul} PF</span>
                </div>
              )}
            </div>

            <div className="selected-tools-row">
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
