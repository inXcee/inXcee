import { MODULES } from '../../loginData.js'
import { useReveal } from '../../hooks/useReveal.js'

// stats'tan modül rozeti türet (hardcode değil — gerçek veriden).
function badgeFor(name, stats) {
  if (!stats) return null
  if (name === 'Oda & Yatak') return { ok: true, text: `%${stats.occupancy_pct} dolu` }
  if (name === 'Arıza & Bakım') return { ok: stats.open_faults === 0, text: `${stats.open_faults} açık` }
  return null
}

export function ModuleCarousel({ stats, reduced }) {
  const [ref, vis] = useReveal(reduced)
  return (
    <section id="modules" ref={ref} className={`blk reveal ${vis ? 'in' : ''}`}>
      <div className="lp-wrap">
        <div className="kicker">Filo</div>
        <h3>10 entegre modül — canlı durum</h3>
        <div className="track" role="list">
          {MODULES.map(m => {
            const b = badgeFor(m.name, stats)
            return (
              <div className="mcard" role="listitem" key={m.name}>
                <div className="mc-top"><span className="em">{m.icon}</span>
                  {b && <span className={`liveb ${b.ok ? 'ok' : ''}`}>{b.text}</span>}
                </div>
                <h4>{m.name}</h4><div className="spec">{m.spec}</div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
