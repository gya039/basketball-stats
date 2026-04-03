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
        <svg
          className="court-lines-svg"
          viewBox="0 0 280 150"
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          <g stroke="rgba(255,255,255,0.3)" strokeWidth="1.4" fill="none">
            {/* Center line */}
            <line x1="140" y1="0" x2="140" y2="150" />

            {/* LEFT — 3PT corner lines (horizontal, 9 units from each sideline) */}
            <line x1="0" y1="9"   x2="29.9" y2="9"   />
            <line x1="0" y1="141" x2="29.9" y2="141" />
            {/* 3PT arc: small arc, CW → sweeps right through (83.25,75) → D facing center */}
            <path d="M 29.9 9 A 67.5 67.5 0 0 1 29.9 141" />

            {/* LEFT — lane rectangle */}
            <line x1="0"  y1="50.5" x2="58" y2="50.5" />
            <line x1="0"  y1="99.5" x2="58" y2="99.5" />
            <line x1="58" y1="50.5" x2="58" y2="99.5" />
            {/* FT circle outer solid (faces center court) */}
            <path d="M 58 57 A 18 18 0 0 1 58 93" />
            {/* FT circle inner dashed (faces basket) */}
            <path d="M 58 57 A 18 18 0 0 0 58 93" strokeDasharray="5 3" />
            {/* Restricted arc */}
            <path d="M 15.75 62.5 A 12.5 12.5 0 0 1 15.75 87.5" />

            {/* RIGHT — 3PT corner lines */}
            <line x1="280" y1="9"   x2="250.1" y2="9"   />
            <line x1="280" y1="141" x2="250.1" y2="141" />
            {/* 3PT arc: small arc, CCW → sweeps left through (196.75,75) → D facing center */}
            <path d="M 250.1 9 A 67.5 67.5 0 0 0 250.1 141" />

            {/* RIGHT — lane rectangle */}
            <line x1="280" y1="50.5" x2="222" y2="50.5" />
            <line x1="280" y1="99.5" x2="222" y2="99.5" />
            <line x1="222" y1="50.5" x2="222" y2="99.5" />
            {/* FT circle outer solid */}
            <path d="M 222 57 A 18 18 0 0 0 222 93" />
            {/* FT circle inner dashed */}
            <path d="M 222 57 A 18 18 0 0 1 222 93" strokeDasharray="5 3" />
            {/* Restricted arc */}
            <path d="M 264.25 62.5 A 12.5 12.5 0 0 0 264.25 87.5" />
          </g>
        </svg>

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
