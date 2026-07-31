import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { useToastStore } from '../../../shared/store/toastStore.js'
import { dayShort, nf } from '../logic/waterUi.js'
import {
  buildHighlights, buildProductMatrix, exportProductDistributionExcel, filterZones,
} from '../logic/productDistribution.js'
import WaterModal from './WaterModal.jsx'

const toastErr = message => useToastStore.getState().addToast(message, 'error')

const cell = value => (value ? nf(value) : '·')

// Ürüne tıklayınca açılır: bu ürün hangi gün, hangi dağıtım yerine, kaç adet
// gitti. Aynı veriden iki yön sunulur — gün→yer (o gün nereye) ve yer→gün
// (o yere hangi günler) — üstte de gün × yer matrisi.
export default function ProductDistributionModal({ product, from, to, label, onClose }) {
  const [range, setRange] = useState('month') // 'month' | 'all'
  const [view, setView] = useState('days')    // 'days' | 'zones' | 'grid'
  const [search, setSearch] = useState('')
  const [openZones, setOpenZones] = useState(() => new Set())
  const [busy, setBusy] = useState(false)

  const periodParams = range === 'month' ? { from, to } : {}
  const query = useQuery({
    queryKey: ['water-product-distribution', product.product_id ?? product.id, range, from, to],
    queryFn: () => api
      .get(`/water/products/${product.product_id ?? product.id}/distribution`, { params: periodParams })
      .then(response => response.data),
  })

  const report = query.data
  const totals = report?.totals || {}
  const zones = useMemo(() => filterZones(report?.zones || [], search), [report, search])
  const matrix = useMemo(() => buildProductMatrix(report || {}), [report])
  const highlights = useMemo(() => buildHighlights(report || {}), [report])
  const hasData = (report?.days?.length || 0) > 0

  const toggleZone = (key) => setOpenZones(current => {
    const next = new Set(current)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  async function downloadExcel() {
    if (!report) return
    setBusy(true)
    try {
      await exportProductDistributionExcel(report)
    } catch {
      toastErr('Excel oluşturulamadı')
    } finally {
      setBusy(false)
    }
  }

  const title = [product.brand_name, product.name || product.product_name].filter(Boolean).join(' · ')

  return (
    <WaterModal title={`${title} — DAĞITIM DÖKÜMÜ`} onClose={onClose} width="1080px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={tabStrip}>
            {[['month', `Seçili ay: ${label}`], ['all', 'Tüm geçmiş']].map(([id, text]) => (
              <button key={id} type="button" onClick={() => setRange(id)} style={tabButton(range === id)}>
                {text}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={tabStrip}>
              {[['days', 'Gün → Yer'], ['zones', 'Yer → Gün'], ['grid', 'Gün × Yer']].map(([id, text]) => (
                <button key={id} type="button" onClick={() => setView(id)} style={tabButton(view === id)}>
                  {text}
                </button>
              ))}
            </div>
            <button type="button" onClick={downloadExcel} disabled={busy || !hasData} className="btn-secondary"
              style={{ fontSize: '11px', padding: '6px 10px' }}>
              {busy ? '…' : '⬇ Excel'}
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))', gap: '10px' }}>
          {[
            ['Toplam dağıtım', totals.total_human || nf(totals.total_base || 0), 'var(--accent)'],
            ['Günlük ortalama', totals.daily_avg_human || nf(totals.daily_avg_base || 0), 'var(--teal)'],
            ['Dağıtım günü', nf(totals.day_count || 0), 'var(--text)'],
            ['Dağıtım yeri', nf(totals.zone_count || 0), 'var(--green)'],
            ['Son dağıtım', totals.last_date || '—', 'var(--text2)'],
          ].map(([name, value, color]) => (
            <div key={name} style={kpiCard}>
              <div style={kpiLabel}>{name}</div>
              <div style={{
                fontFamily: name === 'Son dağıtım' ? 'var(--mono)' : 'var(--display)',
                fontSize: name === 'Son dağıtım' ? '15px' : '20px',
                color, marginTop: name === 'Son dağıtım' ? '4px' : 0,
              }}>{value}</div>
            </div>
          ))}
        </div>

        {(highlights.busiestDay || highlights.topZone) && (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {highlights.busiestDay && (
              <div style={{ ...kpiCard, flex: '1 1 220px' }}>
                <div style={kpiLabel}>EN YOĞUN GÜN</div>
                <div style={{ marginTop: '3px' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{highlights.busiestDay.date}</span>
                  <span style={{ color: 'var(--text3)', fontSize: '11px' }}> · {dayShort(highlights.busiestDay.date)}</span>
                  <b style={{ marginLeft: '8px', color: 'var(--accent)' }}>{highlights.busiestDay.total_human || nf(highlights.busiestDay.total_base)}</b>
                </div>
              </div>
            )}
            {highlights.topZone && (
              <div style={{ ...kpiCard, flex: '1 1 220px' }}>
                <div style={kpiLabel}>EN ÇOK ALAN YER</div>
                <div style={{ marginTop: '3px' }}>
                  <b>{highlights.topZone.zone_name}</b>
                  <span style={{ color: 'var(--text3)', fontSize: '11px' }}> · %{String(highlights.topZone.share_pct).replace('.', ',')}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {query.isLoading ? (
          <div style={{ padding: '18px', color: 'var(--text3)' }}>Dağıtım dökümü yükleniyor…</div>
        ) : query.isError ? (
          <div style={{ padding: '18px', color: 'var(--red)', border: '1px solid var(--red)', borderRadius: '8px' }}>
            Dağıtım dökümü alınamadı.
          </div>
        ) : !hasData ? (
          <div style={emptyBox}>Bu dönemde bu üründen dağıtım yapılmamış.</div>
        ) : view === 'days' ? (
          <div style={scrollBox}>
            <table className="data-table" style={{ fontSize: '11px' }}>
              <thead>
                <tr>
                  <th style={{ minWidth: '96px' }}>Gün</th>
                  <th>Dağıtılan yerler</th>
                  <th style={{ textAlign: 'right', minWidth: '104px' }}>Gün toplamı</th>
                </tr>
              </thead>
              <tbody>
                {report.days.map(day => (
                  <tr key={day.date}>
                    <td>
                      <div style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{day.date}</div>
                      <div style={{ color: 'var(--text3)', fontSize: '9px' }}>{dayShort(day.date)}</div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                        {day.zones.map(zone => (
                          <span key={`${day.date}-${zone.zone_id ?? 'none'}`} style={chip}>
                            {zone.zone_name}: <b>{zone.qty_human || nf(zone.qty_base)}</b>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)' }}>
                      {day.total_human || nf(day.total_base)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : view === 'zones' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <input className="form-input" value={search} onChange={event => setSearch(event.target.value)}
              placeholder="Dağıtım yeri ara…" style={{ fontSize: '12px', height: '32px' }} />
            <div style={scrollBox}>
              <table className="data-table" style={{ fontSize: '11px' }}>
                <thead>
                  <tr>
                    <th>Dağıtım yeri</th>
                    <th style={{ textAlign: 'right', minWidth: '104px' }}>Toplam</th>
                    <th style={{ textAlign: 'right', minWidth: '58px' }}>Pay</th>
                    <th style={{ textAlign: 'right', minWidth: '54px' }}>Gün</th>
                    <th style={{ minWidth: '92px' }}>Son</th>
                  </tr>
                </thead>
                <tbody>
                  {zones.map(zone => {
                    const key = String(zone.zone_id ?? 'none')
                    const open = openZones.has(key)
                    return [
                      <tr key={key} onClick={() => toggleZone(key)} style={{ cursor: 'pointer' }}>
                        <td style={{ fontWeight: 600 }}>{open ? '▾' : '▸'} {zone.zone_name}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>
                          {zone.total_human || nf(zone.total_base)}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--text3)' }}>%{String(zone.share_pct).replace('.', ',')}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{zone.day_count}</td>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: '10px' }}>{zone.last_date}</td>
                      </tr>,
                      open && (
                        <tr key={`${key}-days`}>
                          <td colSpan={5} style={{ background: 'var(--surface2)', padding: '8px 12px' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                              {zone.days.map(day => (
                                <span key={`${key}-${day.date}`} style={chip}>
                                  <span style={{ fontFamily: 'var(--mono)' }}>{day.date}</span>: <b>{day.qty_human || nf(day.qty_base)}</b>
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ),
                    ]
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {matrix.hiddenCount > 0 && (
              <div style={{ fontSize: '10px', color: 'var(--text3)' }}>
                En çok dağıtım yapılan {matrix.columns.length - 1} yer sütun olarak gösteriliyor; kalan {matrix.hiddenCount} yer “Diğer” sütununda toplandı (Excel’de hepsi ayrı).
              </div>
            )}
            <div style={scrollBox}>
              <table className="data-table" style={{ fontSize: '11px' }}>
                <thead>
                  <tr>
                    <th style={{ position: 'sticky', left: 0, background: 'var(--surface)', minWidth: '96px' }}>Gün</th>
                    {matrix.columns.map(column => (
                      <th key={column.key} style={{ textAlign: 'right', minWidth: '84px' }} title={column.zone_name}>
                        {column.zone_name}
                      </th>
                    ))}
                    <th style={{ textAlign: 'right', minWidth: '84px', background: 'var(--surface2)' }}>TOPLAM</th>
                  </tr>
                </thead>
                <tbody>
                  {matrix.rows.map(row => (
                    <tr key={row.date}>
                      <td style={{ position: 'sticky', left: 0, background: 'var(--surface)', fontFamily: 'var(--mono)', fontWeight: 700 }}>
                        {row.date}
                      </td>
                      {row.cells.map((value, index) => (
                        <td key={matrix.columns[index].key} style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: value ? 'var(--text)' : 'var(--text3)' }}>
                          {cell(value)}
                        </td>
                      ))}
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, background: 'var(--surface2)', color: 'var(--accent)' }}>
                        {nf(row.total_base)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </WaterModal>
  )
}

const tabStrip = {
  display: 'flex', gap: '2px', background: 'var(--surface2)',
  border: '1px solid var(--border)', borderRadius: '8px', padding: '2px',
}
const tabButton = active => ({
  border: 'none', borderRadius: '6px', padding: '6px 10px', fontSize: '11px', cursor: 'pointer',
  background: active ? 'var(--accent)' : 'transparent',
  color: active ? '#000' : 'var(--text3)', fontWeight: 700,
})
const kpiCard = {
  background: 'var(--surface2)', border: '1px solid var(--border)',
  borderRadius: '8px', padding: '10px 12px',
}
const kpiLabel = { fontSize: '9px', color: 'var(--text3)', letterSpacing: '.5px' }
const chip = {
  border: '1px solid var(--border)', background: 'var(--surface2)',
  borderRadius: '999px', padding: '3px 7px', whiteSpace: 'nowrap',
}
const scrollBox = { border: '1px solid var(--border)', borderRadius: '8px', overflow: 'auto', maxHeight: '52vh' }
const emptyBox = {
  padding: '18px', color: 'var(--text3)', border: '1px dashed var(--border)',
  borderRadius: '8px', textAlign: 'center',
}
