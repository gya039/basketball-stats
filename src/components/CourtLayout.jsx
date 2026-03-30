export default function CourtLayout({
  titansLogo,
  renderCourtPlayers,
  onCourtPointerDown,
  onCourtPointerUp,
  onCourtPointerLeave,
  onCourtPointerCancel,
  courtShotLocation,
  courtShotMode,
}) {
  return (
    <div className="live-main-layout">
      <div className="side-team-column left">{renderCourtPlayers('home')}</div>

      <div
        className={`court-stage ${courtShotMode ? `court-shot-mode-${courtShotMode}` : ''}`}
        onPointerDown={onCourtPointerDown}
        onPointerUp={onCourtPointerUp}
        onPointerLeave={onCourtPointerLeave}
        onPointerCancel={onCourtPointerCancel}
      >
        <div className="court-logo-watermark">
          <img src={titansLogo} alt="Titans logo" />
        </div>
        <div className="center-court-visual" />
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
