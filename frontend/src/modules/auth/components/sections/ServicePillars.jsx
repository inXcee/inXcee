import { PILLARS } from '../../loginData.js'
import { useReveal } from '../../hooks/useReveal.js'
import { useTranslation } from '../../../../shared/i18n/index.js'

// Üç ana operasyon ekseni. Scroll-reveal ile görünür olur.
export function ServicePillars({ reduced }) {
  const [ref, vis] = useReveal(reduced)
  const { t } = useTranslation()
  return (
    <section ref={ref} className={`blk reveal ${vis ? 'in' : ''}`}>
      <div className="lp-wrap">
        <div className="kicker">{t('login.sections.pillars_kicker', 'Operasyon alanları')}</div>
        <h3>{t('login.sections.pillars_title', 'Üç ana eksende tam kontrol')}</h3>
        <div className="pillars">
          {PILLARS.map(p => (
            <div className="pillar" key={p.k}>
              <div className="gl" /><div className="ic">{p.icon}</div>
              <h4>{t(`login.pillars.${p.k}.title`, p.title)}</h4><p>{t(`login.pillars.${p.k}.desc`, p.desc)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
