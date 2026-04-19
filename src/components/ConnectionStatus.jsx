import './ConnectionStatus.css'

export default function ConnectionStatus({ status }) {
  // status: 'live' | 'offline' | 'syncing'

  const icons = {
    live: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.55a11 11 0 0 1 14.08 0" />
        <path d="M1.42 9a16 16 0 0 1 21.16 0" />
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
        <circle cx="12" cy="20" r="1" fill="currentColor" />
      </svg>
    ),
    offline: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="1" y1="1" x2="23" y2="23" />
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
        <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
        <circle cx="12" cy="20" r="1" fill="currentColor" />
      </svg>
    ),
    syncing: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="conn-spin">
        <path d="M21.5 2v6h-6" />
        <path d="M2.5 12a10 10 0 0 1 17.8-6.3L21.5 8" />
        <path d="M2.5 22v-6h6" />
        <path d="M21.5 12a10 10 0 0 1-17.8 6.3L2.5 16" />
      </svg>
    ),
  }

  const labels = {
    live: 'Live',
    offline: 'Offline',
    syncing: 'Syncing',
  }

  return (
    <div className={`conn-status conn-status--${status}`} aria-label={`Connection: ${labels[status]}`}>
      <span className="conn-status__icon">{icons[status]}</span>
      <span className="conn-status__label">{labels[status]}</span>
    </div>
  )
}
