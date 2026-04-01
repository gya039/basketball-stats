export default function CourtLayout({
  titansLogo,
  renderCourtPlayers,
  onCourtPointerDown,
  onCourtPointerUp,
  onCourtPointerLeave,
  onCourtPointerCancel,
  courtShotLocation,
  courtShotMode,
  courtShotStep,
}) {
  function suppressLongPress(event) {
    event.preventDefault()
  }

  return (
    <div className="live-main-layout">
      <div className="side-team-column left">{renderCourtPlayers('home')}</div>

      <div
        className={`court-stage ${courtShotMode ? `court-shot-mode-${courtShotMode}` : ''} ${
          courtShotStep === 'awaitSelection' ? 'court-awaiting-selection' : ''
        }`}
        onContextMenu={(e) => e.preventDefault()}
        onSelectStart={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
        onTouchStartCapture={suppressLongPress}
        onTouchMoveCapture={suppressLongPress}
        onPointerDown={(e) => {
          e.preventDefault()
          onCourtPointerDown(e)
        }}
        onPointerUp={(e) => {
          e.preventDefault()
          onCourtPointerUp(e)
        }}
        onPointerLeave={(e) => {
          e.preventDefault()
          onCourtPointerLeave(e)
        }}
        onPointerCancel={(e) => {
          e.preventDefault()
          onCourtPointerCancel(e)
        }}
      >
        <div className="court-logo-watermark">
          <img
            src={titansLogo}
            alt="Titans logo"
            draggable="false"
            onContextMenu={(e) => e.preventDefault()}
            onDragStart={(e) => e.preventDefault()}
          />
        </div>
        <div className="center-court-visual" />
        {courtShotStep === 'awaitSelection' && (
          <div
            className={`court-shot-dim-overlay ${
              courtShotMode === 'made' ? 'made' : 'missed'
            }`}
            aria-hidden="true"
          />
        )}
        {courtShotLocation && (
          <div
            className={`court-shot-marker ${courtShotMode}`}
            style={{
              left: `${courtShotLocation.x}%`,
              top: `${courtShotLocation.y}%`,
            }}
          />
        )}
      </div>

      <div className="side-team-column right">{renderCourtPlayers('away')}</div>
    </div>
  )
}
