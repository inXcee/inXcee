import { useReveal } from '../../hooks/useReveal.js'

// Canlı Filyos hava/deniz. weather prop LoginPage'deki open-meteo state'inden gelir.
export function FilyosEnv({ weather, reduced }) {
  const [ref, vis] = useReveal(reduced)
  const w = weather || {}
  const items = [
    ['🌡️', w.temp != null ? `${w.temp}°` : '—°', `Sıcaklık · ${w.desc || '—'}`],
    ['💨', w.windKn != null ? `${w.windKn} kn` : '—', `Rüzgâr · ${w.windDir || '—'}`],
    ['🌊', w.wave != null ? `${w.wave} m` : '—', 'Dalga yüksekliği'],
    ['🌅', w.sunrise || '—', 'Gün doğumu'],
  ]
  return (
    <section id="env" ref={ref} className={`blk reveal ${vis ? 'in' : ''}`}>
      <div className="lp-wrap">
        <div className="kicker">Canlı · open-meteo</div>
        <h3>Filyos anlık ortam</h3>
        <div className="env">
          {items.map(([em, v, l]) => (
            <div className="ev" key={l}><span className="em">{em}</span><div><div className="v">{v}</div><div className="l">{l}</div></div></div>
          ))}
        </div>
      </div>
    </section>
  )
}
