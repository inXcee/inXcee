// Sistem akış şeridi. JSX ile render (innerHTML YOK — XSS riski yok), marquee için iki kez tekrar.
export function LandingTicker({ items }) {
  const doubled = [...items, ...items]
  return (
    <div className="tickerbar" aria-label="Sistem akışı">
      <div className="ticker">
        {doubled.map(([key, label, val], i) => (
          <span className="tk-item" key={i}><b>{label}</b> {val}<span className="d">●</span></span>
        ))}
      </div>
    </div>
  )
}
