import { SECURITY } from '../../loginData.js'
import { useReveal } from '../../hooks/useReveal.js'

export function SecurityBand({ reduced }) {
  const [ref, vis] = useReveal(reduced)
  return (
    <section id="sec" ref={ref} className={`blk reveal ${vis ? 'in' : ''}`}>
      <div className="lp-wrap">
        <div className="kicker">Sistem & Güvenlik</div>
        <h3>Kurumsal güvence</h3>
        <div className="secband">
          {SECURITY.map(s => (
            <div className="sec" key={s.title}><span className="em">{s.icon}</span><div><b>{s.title}</b><span>{s.desc}</span></div></div>
          ))}
        </div>
      </div>
    </section>
  )
}
