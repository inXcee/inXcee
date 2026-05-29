import { PILLARS } from '../../loginData.js'
import { useReveal } from '../../hooks/useReveal.js'

// Üç ana operasyon ekseni. Scroll-reveal ile görünür olur.
export function ServicePillars({ reduced }) {
  const [ref, vis] = useReveal(reduced)
  return (
    <section ref={ref} className={`blk reveal ${vis ? 'in' : ''}`}>
      <div className="lp-wrap">
        <div className="kicker">Operasyon alanları</div>
        <h3>Üç ana eksende tam kontrol</h3>
        <div className="pillars">
          {PILLARS.map(p => (
            <div className="pillar" key={p.title}>
              <div className="gl" /><div className="ic">{p.icon}</div>
              <h4>{p.title}</h4><p>{p.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
