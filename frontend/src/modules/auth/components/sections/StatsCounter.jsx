import { useReveal } from '../../hooks/useReveal.js'
import { useCountUp } from '../../hooks/useCountUp.js'
import { useTranslation } from '../../../../shared/i18n/index.js'

function Stat({ to, suffix = '', label, active, reduced }) {
  const v = useCountUp(to, active, 1200, reduced)
  return <div className="stat"><div className="v">{v}{suffix}</div><div className="l">{label}</div></div>
}

// Görünürlük (useReveal) count-up'a `active` olarak beslenir — viewport'a girince sayar.
export function StatsCounter({ stats, reduced }) {
  const [ref, vis] = useReveal(reduced)
  const { t } = useTranslation()
  const s = stats || {}
  return (
    <section id="stats" ref={ref} className={`blk reveal ${vis ? 'in' : ''}`}>
      <div className="lp-wrap">
        <div className="kicker">{t('login.sections.stats_kicker', 'Sayılarla AVS')}</div>
        <h3>{t('login.sections.stats_title', 'Kampüs bir bakışta')}</h3>
        <div className="stats">
          <Stat to={s.occupancy_pct ?? 0} suffix="%" label={t('login.sections.stat_occupancy', 'Doluluk oranı')} active={vis} reduced={reduced} />
          <Stat to={s.beds_occupied ?? 0} label={`${t('login.sections.stat_beds', 'Dolu yatak')} / ${s.beds_total ?? '—'}`} active={vis} reduced={reduced} />
          <Stat to={19} label={t('login.sections.stat_blocks', 'Aktif blok')} active={vis} reduced={reduced} />
          <Stat to={s.active_staff ?? 0} label={t('login.sections.stat_staff', 'Aktif personel')} active={vis} reduced={reduced} />
        </div>
      </div>
    </section>
  )
}
