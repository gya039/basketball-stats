export default function CourtLayout({
  titansLogo,
  renderCourtPlayers,
}) {
  return (
    <div className="live-main-layout">
      <div className="side-team-column left">{renderCourtPlayers('home')}</div>

      <div className="court-stage">
        <div className="court-logo-watermark">
          <img src={titansLogo} alt="Titans logo" />
        </div>
        <div className="center-court-visual" />
      </div>

      <div className="side-team-column right">{renderCourtPlayers('away')}</div>
    </div>
  )
}