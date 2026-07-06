import { useReveal } from '../../hooks/useReveal.js'
import { useTranslation } from '../../../../shared/i18n/index.js'
import { WMO, COMPASS } from '../../loginData.js'

// Canlı Filyos hava/deniz. weather prop LoginPage'deki open-meteo state'inden gelir.
// LoginPage ham kod/indeks verir (descCode, windDirIdx) → çeviri burada yapılır (locale değişince reaktif).
export function FilyosEnv({ weather, reduced }) {
  const [ref, vis] = useReveal(reduced)
  const { t } = useTranslation()
  const w = weather || {}
  const desc = w.descCode != null ? t(`login.weather.${w.descCode}`, WMO[w.descCode] || '—') : '—'
  const windDir = w.windDirIdx != null ? t(`login.compass.${w.windDirIdx}`, COMPASS[w.windDirIdx] || '—') : '—'
  const items = [
    ['🌡️', w.temp != null ? `${w.temp}°` : '—°', `${t('login.sections.env_temp', 'Sıcaklık')} · ${desc}`],
    ['💨', w.windKn != null ? `${w.windKn} kn` : '—', `${t('login.sections.env_wind', 'Rüzgâr')} · ${windDir}`],
    ['🌊', w.wave != null ? `${w.wave} m` : '—', t('login.sections.env_wave', 'Dalga yüksekliği')],
    ['🌅', w.sunrise || '—', t('login.sections.env_sunrise', 'Gün doğumu')],
  ]
  return (
    <section id="env" ref={ref} className={`blk reveal ${vis ? 'in' : ''}`}>
      <div className="lp-wrap">
        <div className="kicker">{t('login.sections.env_kicker', 'Canlı · open-meteo')}</div>
        <h3>{t('login.sections.env_title', 'Filyos anlık ortam')}</h3>
        <div className="env">
          {items.map(([em, v, l]) => (
            <div className="ev" key={l}><span className="em">{em}</span><div><div className="v">{v}</div><div className="l">{l}</div></div></div>
          ))}
        </div>
      </div>
    </section>
  )
}
