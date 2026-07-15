import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { humanQty } from '../logic/waterUnits.js'
import { dayShort, nf, shiftIsoDay, todayStr } from '../logic/waterUi.js'
import WaterModal from './WaterModal.jsx'

export default function ZoneHistoryModal({ zone, from, to, label, onClose }) {
  const [range, setRange] = useState('month')
  // Tüm geçmişi tek çek; 7-gün / ay / tüm görünümleri + ay karşılaştırmasını client'ta türet
  const { data: allRows = [], isLoading } = useQuery({
    queryKey: ['water-zone-history', zone.zone_id],
    queryFn: () => api.get('/water/movements', { params: { type: 'out', zone_id: zone.zone_id, limit: 1000 } }).then(r => r.data),
  })

  const today = todayStr()
  const weekStart = shiftIsoDay(today, -6) // son 7 gün (bugün dahil)
  const month = from.slice(0, 7)
  const prevMonth = shiftIsoDay(from, -1).slice(0, 7)

  const rows = useMemo(() => {
    if (range === 'week') return allRows.filter(r => r.move_date >= weekStart && r.move_date <= today)
    if (range === 'month') return allRows.filter(r => r.move_date >= from && r.move_date <= to)
    return allRows
  }, [allRows, range, from, to, weekStart, today])

  // Ay karşılaştırması + beklenen tüketim sapması (tüm geçmişten)
  const compare = useMemo(() => {
    let thisM = 0, prevM = 0
    allRows.forEach(r => {
      const m = (r.move_date || '').slice(0, 7)
      if (m === month) thisM += r.qty_base || 0
      else if (m === prevMonth) prevM += r.qty_base || 0
    })
    const expected = zone.expected_monthly || 0
    const momDelta = prevM > 0 ? Math.round(((thisM - prevM) / prevM) * 100) : null
    const expDelta = expected > 0 ? Math.round(((thisM - expected) / expected) * 100) : null
    const overExpected = expected > 0 && Math.abs(thisM - expected) / expected > 0.25
    return { thisM, prevM, expected, momDelta, expDelta, overExpected }
  }, [allRows, month, prevMonth, zone.expected_monthly])

  const stats = useMemo(() => {
    const byDay = new Map()
    const byProduct = new Map()
    let total = 0
    rows.forEach(r => {
      total += r.qty_base || 0
      const day = byDay.get(r.move_date) || { date: r.move_date, total: 0, rows: [], products: new Map() }
      day.total += r.qty_base || 0
      day.rows.push(r)
      const dayProduct = day.products.get(r.product_id) || { product: r, total: 0 }
      dayProduct.total += r.qty_base || 0
      day.products.set(r.product_id, dayProduct)
      byDay.set(r.move_date, day)

      const product = byProduct.get(r.product_id) || { product: r, total: 0, count: 0 }
      product.total += r.qty_base || 0
      product.count += 1
      byProduct.set(r.product_id, product)
    })
    const days = [...byDay.values()].sort((a, b) => b.date.localeCompare(a.date))
    const products = [...byProduct.values()].sort((a, b) => b.total - a.total)
    const activeDays = days.length
    return {
      total, days, products, activeDays, recordCount: rows.length,
      dailyAvg: activeDays ? Math.round(total / activeDays) : 0,
      lastDate: days[0]?.date || null,
    }
  }, [rows])

  const rangeLabel = range === 'week' ? 'Son 7 gün' : range === 'month' ? label : 'Tüm geçmiş'

  return (
    <WaterModal title={`${zone.zone_name} — DAĞITIM GEÇMİŞİ`} onClose={onClose} width="1040px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '2px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '2px' }}>
            {[
              ['week', 'Son 7 gün'],
              ['month', `Seçili ay: ${label}`],
              ['all', 'Tüm geçmiş'],
            ].map(([id, text]) => (
              <button
                key={id}
                type="button"
                onClick={() => setRange(id)}
                style={{
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  background: range === id ? 'var(--accent)' : 'transparent',
                  color: range === id ? '#000' : 'var(--text3)',
                  fontWeight: 700,
                }}
              >
                {text}
              </button>
            ))}
          </div>
          <div style={{ color: 'var(--text3)', fontSize: '11px' }}>Görüntülenen dönem: {rangeLabel}</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))', gap: '10px' }}>
          {[
            ['Toplam dağıtım', nf(stats.total), 'var(--accent)'],
            ['Günlük ortalama', nf(stats.dailyAvg), 'var(--teal)'],
            ['Dağıtım günü', nf(stats.activeDays), 'var(--text)'],
            ['Son dağıtım', stats.lastDate || '—', 'var(--text2)'],
            ['Ürün çeşidi', nf(stats.products.length), 'var(--green)'],
          ].map(([name, value, color]) => (
            <div key={name} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px' }}>
              <div style={{ fontSize: '9px', color: 'var(--text3)', letterSpacing: '.5px' }}>{name}</div>
              <div style={{ fontFamily: name === 'Son dağıtım' ? 'var(--mono)' : 'var(--display)', fontSize: name === 'Son dağıtım' ? '15px' : '22px', color, marginTop: name === 'Son dağıtım' ? '4px' : 0 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Ay karşılaştırması + beklenen tüketim sapması */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px' }}>
            <div style={{ fontSize: '9px', color: 'var(--text3)', letterSpacing: '.5px' }}>BU AY / ÖNCEKİ AY</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '3px' }}>
              <span style={{ fontFamily: 'var(--display)', fontSize: '20px' }}>{nf(compare.thisM)}</span>
              <span style={{ color: 'var(--text3)', fontSize: '12px' }}>← {nf(compare.prevM)}</span>
              {compare.momDelta != null && (
                <span style={{ fontSize: '12px', fontWeight: 700, color: compare.momDelta > 0 ? 'var(--accent)' : compare.momDelta < 0 ? 'var(--green)' : 'var(--text3)' }}>
                  {compare.momDelta > 0 ? '▲' : compare.momDelta < 0 ? '▼' : ''}%{Math.abs(compare.momDelta)}
                </span>
              )}
            </div>
          </div>
          <div style={{ flex: '1 1 220px', background: compare.overExpected ? 'color-mix(in srgb, var(--red) 10%, var(--surface2))' : 'var(--surface2)', border: `1px solid ${compare.overExpected ? 'var(--red)' : 'var(--border)'}`, borderRadius: '8px', padding: '10px 12px' }}>
            <div style={{ fontSize: '9px', color: 'var(--text3)', letterSpacing: '.5px' }}>BEKLENEN AYLIK TÜKETİM</div>
            {compare.expected > 0 ? (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '3px' }}>
                <span style={{ fontFamily: 'var(--display)', fontSize: '20px' }}>{nf(compare.expected)}</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: compare.overExpected ? 'var(--red)' : 'var(--green)' }}>
                  {compare.expDelta > 0 ? '▲' : compare.expDelta < 0 ? '▼' : ''}%{Math.abs(compare.expDelta)}
                </span>
                {compare.overExpected && <span style={{ fontSize: '11px', color: 'var(--red)', fontWeight: 600 }}>⚠ sapma</span>}
              </div>
            ) : (
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '5px' }}>Tanımsız — ⚙ Ayarlar’dan bölgeye ekleyin</div>
            )}
          </div>
        </div>

        {isLoading ? (
          <div style={{ padding: '18px', color: 'var(--text3)' }}>Geçmiş yükleniyor…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: '18px', color: 'var(--text3)', border: '1px dashed var(--border)', borderRadius: '8px', textAlign: 'center' }}>Bu dönem için dağıtım kaydı yok.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(280px, .75fr)', gap: '14px' }}>
            <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'auto', maxHeight: '52vh' }}>
              <table className="data-table" style={{ fontSize: '11px' }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: '92px' }}>Gün</th>
                    <th>Verilen ürünler</th>
                    <th style={{ textAlign: 'right', minWidth: '98px' }}>Gün toplamı</th>
                    <th style={{ minWidth: '130px' }}>İrsaliye bağlantısı</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.days.map(day => {
                    const linked = [...new Set(day.rows.flatMap(r => String(r.source_waybills || '').split(',').map(x => x.trim()).filter(Boolean)))]
                    return (
                      <tr key={day.date}>
                        <td>
                          <div style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{day.date}</div>
                          <div style={{ color: 'var(--text3)', fontSize: '9px' }}>{dayShort(day.date)}</div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                            {[...day.products.values()].sort((a, b) => b.total - a.total).map(p => (
                              <span key={p.product.product_id} style={{ border: '1px solid var(--border)', background: 'var(--surface2)', borderRadius: '999px', padding: '3px 7px', whiteSpace: 'nowrap' }}>
                                {p.product.product_name}: <b>{humanQty(p.product, p.total)}</b>
                              </span>
                            ))}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)' }}>{nf(day.total)}</td>
                        <td style={{ color: linked.length ? 'var(--text2)' : 'var(--text3)', fontSize: '10px' }}>{linked.length ? linked.join(' · ') : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', marginBottom: '8px' }}>ÜRÜN TOPLAMI</div>
                <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'auto', maxHeight: '210px' }}>
                  <table className="data-table" style={{ fontSize: '11px' }}>
                    <tbody>
                      {stats.products.map(p => (
                        <tr key={p.product.product_id}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{p.product.brand_name ? `${p.product.brand_name} · ` : ''}{p.product.product_name}</div>
                            <div style={{ color: 'var(--text3)', fontSize: '9px' }}>{p.count} kayıt</div>
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{humanQty(p.product, p.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', marginBottom: '8px' }}>SON KAYITLAR</div>
                <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'auto', maxHeight: '240px' }}>
                  <table className="data-table" style={{ fontSize: '11px' }}>
                    <tbody>
                      {rows.slice(0, 12).map(r => (
                        <tr key={r.id}>
                          <td style={{ fontFamily: 'var(--mono)' }}>{r.move_date}</td>
                          <td>{r.product_name}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{r.qty_human || humanQty(r, r.qty_base)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </WaterModal>
  )
}
