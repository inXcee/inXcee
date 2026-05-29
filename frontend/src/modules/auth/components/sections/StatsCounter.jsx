import { useReveal } from '../../hooks/useReveal.js'
import { useCountUp } from '../../hooks/useCountUp.js'

function Stat({ to, suffix = '', label, active, reduced }) {
  const v = useCountUp(to, active, 1200, reduced)
  return <div className="stat"><div className="v">{v}{suffix}</div><div className="l">{label}</div></div>
}

// Görünürlük (useReveal) count-up'a `active` olarak beslenir — viewport'a girince sayar.
export function StatsCounter({ stats, reduced }) {
  const [ref, vis] = useReveal(reduced)
  const s = stats || {}
  return (
    <section id="stats" ref={ref} className={`blk reveal ${vis ? 'in' : ''}`}>
      <div className="lp-wrap">
        <div className="kicker">Sayılarla AVS</div>
        <h3>Kampüs bir bakışta</h3>
        <div className="stats">
          <Stat to={s.occupancy_pct ?? 0} suffix="%" label="Doluluk oranı" active={vis} reduced={reduced} />
          <Stat to={s.beds_occupied ?? 0} label={`Dolu yatak / ${s.beds_total ?? '—'}`} active={vis} reduced={reduced} />
          <Stat to={19} label="Aktif blok" active={vis} reduced={reduced} />
          <Stat to={s.active_staff ?? 0} label="Aktif personel" active={vis} reduced={reduced} />
        </div>
      </div>
    </section>
  )
}
