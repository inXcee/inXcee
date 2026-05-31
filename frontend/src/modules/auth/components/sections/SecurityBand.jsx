import { SECURITY } from '../../loginData.js'
import { useReveal } from '../../hooks/useReveal.js'
import { useTranslation } from '../../../../shared/i18n/index.js'

export function SecurityBand({ reduced }) {
  const [ref, vis] = useReveal(reduced)
  const { t } = useTranslation()
  return (
    <section id="sec" ref={ref} className={`blk reveal ${vis ? 'in' : ''}`}>
      <div className="lp-wrap">
        <div className="kicker">{t('login.sections.sec_kicker', 'Sistem & Güvenlik')}</div>
        <h3>{t('login.sections.sec_title', 'Kurumsal güvence')}</h3>
        <div className="secband">
          {SECURITY.map(s => (
            <div className="sec" key={s.k}><span className="em">{s.icon}</span><div><b>{t(`login.security.${s.k}.title`, s.title)}</b><span>{t(`login.security.${s.k}.desc`, s.desc)}</span></div></div>
          ))}
        </div>
      </div>
    </section>
  )
}
