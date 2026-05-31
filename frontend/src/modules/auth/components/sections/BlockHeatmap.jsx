import { BLOCKS } from '../../../../shared/blocks.js'
import { occupancyColor } from '../../heatmap.js'
import { useReveal } from '../../hooks/useReveal.js'
import { useTranslation } from '../../../../shared/i18n/index.js'

// blocks: [{ block, occupancy_pct }] (public stats'tan). Hücreler BLOCKS'tan üretilir (hardcode yok);
// eşleşmeyen blok → null pct (nötr render).
export function BlockHeatmap({ blocks = [], reduced }) {
  const [ref, vis] = useReveal(reduced)
  const { t } = useTranslation()
  const byName = Object.fromEntries(blocks.map(b => [b.block, b.occupancy_pct]))
  return (
    <section id="heat" ref={ref} className={`blk reveal ${vis ? 'in' : ''}`}>
      <div className="lp-wrap">
        <div className="kicker">{t('login.sections.heat_kicker', 'Yeni')}</div>
        <h3>{t('login.sections.heat_title', '19 blok doluluk haritası')}</h3>
        <div className="heat">
          {BLOCKS.map(b => {
            const pct = byName[b.block] ?? null
            const c = occupancyColor(pct)
            const status = pct == null
              ? t('login.sections.heat_nodata', 'veri yok')
              : `%${pct} ${t('login.sections.heat_full', 'dolu')}`
            return (
              <div className="hb" key={b.block} data-testid="heat-cell"
                style={{ background: `linear-gradient(180deg,${c}22,${c}44)`, borderColor: c + '66' }}
                title={`${b.block} ${t('login.sections.heat_block', 'bloğu')} · ${status}`}>
                {b.block}<small>{pct == null ? '—' : `%${pct}`}</small>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
