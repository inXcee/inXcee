import { BLOCKS } from '../../../../shared/blocks.js'
import { occupancyColor } from '../../heatmap.js'
import { useReveal } from '../../hooks/useReveal.js'

// blocks: [{ block, occupancy_pct }] (public stats'tan). Hücreler BLOCKS'tan üretilir (hardcode yok);
// eşleşmeyen blok → null pct (nötr render).
export function BlockHeatmap({ blocks = [], reduced }) {
  const [ref, vis] = useReveal(reduced)
  const byName = Object.fromEntries(blocks.map(b => [b.block, b.occupancy_pct]))
  return (
    <section id="heat" ref={ref} className={`blk reveal ${vis ? 'in' : ''}`}>
      <div className="lp-wrap">
        <div className="kicker">Yeni</div>
        <h3>19 blok doluluk haritası</h3>
        <div className="heat">
          {BLOCKS.map(b => {
            const pct = byName[b.block] ?? null
            const c = occupancyColor(pct)
            return (
              <div className="hb" key={b.block} data-testid="heat-cell"
                style={{ background: `linear-gradient(180deg,${c}22,${c}44)`, borderColor: c + '66' }}
                title={`${b.block} bloğu · ${pct == null ? 'veri yok' : `%${pct} dolu`}`}>
                {b.block}<small>{pct == null ? '—' : `%${pct}`}</small>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
