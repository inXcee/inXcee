import { MODULES } from '../../loginData.js'
import { useReveal } from '../../hooks/useReveal.js'
import { useTranslation } from '../../../../shared/i18n/index.js'

// stats'tan modül rozeti türet (hardcode değil — gerçek veriden). k bazlı (isim çevrilince bozulmasın).
function badgeFor(k, stats, t) {
  if (!stats) return null
  if (k === 'room') return { ok: true, text: `%${stats.occupancy_pct} ${t('login.badges.full', 'dolu')}` }
  if (k === 'fault') return { ok: stats.open_faults === 0, text: `${stats.open_faults} ${t('login.badges.open', 'açık')}` }
  return null
}

export function ModuleCarousel({ stats, reduced }) {
  const [ref, vis] = useReveal(reduced)
  const { t } = useTranslation()
  return (
    <section id="modules" ref={ref} className={`blk reveal ${vis ? 'in' : ''}`}>
      <div className="lp-wrap">
        <div className="kicker">{t('login.sections.modules_kicker', 'Filo')}</div>
        <h3>{t('login.sections.modules_title', '10 entegre modül — canlı durum')}</h3>
        <div className="track" role="list">
          {MODULES.map(m => {
            const b = badgeFor(m.k, stats, t)
            return (
              <div className="mcard" role="listitem" key={m.k}>
                <div className="mc-top"><span className="em">{m.icon}</span>
                  {b && <span className={`liveb ${b.ok ? 'ok' : ''}`}>{b.text}</span>}
                </div>
                <h4>{t(`login.modules.${m.k}.name`, m.name)}</h4><div className="spec">{t(`login.modules.${m.k}.spec`, m.spec)}</div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
