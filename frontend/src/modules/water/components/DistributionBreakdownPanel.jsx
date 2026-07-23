import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { useToastStore } from '../../../shared/store/toastStore.js'
import { nf } from '../logic/waterUi.js'
import {
  buildBreakdown,
  dayLines,
  exportBreakdownExcel,
  filterZones,
} from '../logic/distributionBreakdown.js'
import WaterCollapsiblePanel from './WaterCollapsiblePanel.jsx'

const toastOk = message => useToastStore.getState().addToast(message, 'success')
const toastErr = message => useToastStore.getState().addToast(message, 'error')

const sharePct = value => (value == null ? '' : `%${String(value).replace('.', ',')}`)
const cellText = value => (value ? nf(value) : '·')

// Panelin tamamı tek istekten beslenir: matrix (yer/ürün/gün matrisi) + days (gün
// kırılımı, not/kaydeden). Backend'de yeni endpoint yok.
const SECTIONS = 'matrix,days'

export default function DistributionBreakdownPanel({ from, to, label }) {
  const [open, setOpen] = useState(false)
  const [openZones, setOpenZones] = useState(() => new Set())
  const [openDays, setOpenDays] = useState(() => new Set())
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState('')

  const query = useQuery({
    queryKey: ['water-distribution-breakdown', from, to],
    queryFn: () => api.get('/water/report/accounting', { params: { from, to, sections: SECTIONS } }).then(r => r.data),
    enabled: open, // panel kapalıyken veri çekilmez
  })

  const report = query.data
  const breakdown = useMemo(() => buildBreakdown(report || {}), [report])
  const zones = useMemo(() => filterZones(breakdown.zones, search), [breakdown.zones, search])
  const hasData = breakdown.zones.length > 0

  const toggleZone = (zoneId) => setOpenZones((current) => {
    const next = new Set(current)
    if (next.has(zoneId)) next.delete(zoneId)
    else next.add(zoneId)
    return next
  })
  const toggleDay = (key) => setOpenDays((current) => {
    const next = new Set(current)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })
  const expandAll = () => setOpenZones(new Set(zones.map(zone => zone.zone_id)))
  const collapseAll = () => { setOpenZones(new Set()); setOpenDays(new Set()) }

  const downloadExcel = async () => {
    setBusy('excel')
    try {
      await exportBreakdownExcel({ breakdown, report, from, to })
      toastOk('Dağıtım dökümü Excel indirildi 📊')
    } catch { toastErr('Excel oluşturulamadı') } finally { setBusy('') }
  }

  // PDF, panelin içeriğiyle birebir olan rapor bölümlerini basar (yeni çizim kodu yok).
  const downloadPdf = async () => {
    setBusy('pdf')
    try {
      const response = await api.get('/water/report/accounting.pdf', {
        params: { from, to, sections: 'matrix,zones' },
        responseType: 'blob',
      })
      const anchor = document.createElement('a')
      anchor.href = URL.createObjectURL(response.data)
      anchor.download = `su-dagitim-dokumu-${from}_${to}.pdf`
      anchor.click()
      URL.revokeObjectURL(anchor.href)
      toastOk('Dağıtım dökümü PDF indirildi 🧾')
    } catch { toastErr('PDF oluşturulamadı') } finally { setBusy('') }
  }

  return (
    <WaterCollapsiblePanel
      id="water-distribution-breakdown"
      open={open}
      onToggle={() => setOpen(value => !value)}
      title={`DAĞITIM DÖKÜMÜ — ${label}`}
      subtitle="Tüm dağıtım yerleri tek listede; tıklayınca gün gün hangi üründen ne verildiği açılır"
      className="panel"
      style={{ marginTop: '16px', borderTop: '3px solid var(--accent)' }}
      beforeToggle={open && hasData ? (
        <>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy === 'excel'} onClick={downloadExcel}>
            {busy === 'excel' ? 'Hazırlanıyor…' : '⬇ Excel'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy === 'pdf'} onClick={downloadPdf}>
            {busy === 'pdf' ? 'Hazırlanıyor…' : '⬇ PDF'}
          </button>
        </>
      ) : null}
    >
      <div style={{ padding: '4px 16px 16px' }}>
        {query.isPending && <div style={{ color: 'var(--text3)', fontSize: '12px', padding: '12px 0' }}>Döküm hazırlanıyor…</div>}
        {query.isError && <div style={{ color: 'var(--red)', fontSize: '12px', padding: '12px 0' }}>Döküm alınamadı.</div>}

        {!query.isPending && !query.isError && !hasData && (
          <div style={{ color: 'var(--text3)', fontSize: '12px', padding: '12px 0' }}>Bu aralıkta dağıtım kaydı yok.</div>
        )}

        {hasData && (
          <>
            {/* Özet şerit — muhasebenin önce baktığı toplamlar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px', marginBottom: '12px' }}>
              {[
                ['TOPLAM DAĞITIM', nf(breakdown.totals.grandTotal)],
                ['DAĞITIM YERİ', breakdown.totals.zoneCount],
                ['HAREKETLİ GÜN', breakdown.totals.activeDayCount],
                ['ÜRÜN', breakdown.totals.productCount],
              ].map(([caption, value]) => (
                <div key={caption} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '8px 12px' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px' }}>{caption}</div>
                  <div style={{ fontFamily: 'var(--display)', fontSize: '20px', color: 'var(--text)' }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Ürün toplamları — her zaman görünür */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
              {breakdown.products.map(product => (
                <div
                  key={product.product_id}
                  style={{
                    border: '1px solid var(--border)', borderRadius: '8px', padding: '5px 10px',
                    background: 'var(--surface)', fontSize: '11px',
                  }}
                >
                  <span style={{ color: 'var(--text2)' }}>{product.label}</span>
                  <strong style={{ marginLeft: '8px' }}>{nf(product.total)}</strong>
                  <span style={{ color: 'var(--text3)', marginLeft: '6px' }}>{sharePct(product.share)}</span>
                </div>
              ))}
            </div>

            {/* Kontroller */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px' }}>
              <input
                className="input input-sm"
                placeholder="Dağıtım yeri ara…"
                value={search}
                onChange={event => setSearch(event.target.value)}
                style={{ maxWidth: '220px' }}
              />
              <button type="button" className="btn btn-ghost btn-sm" onClick={expandAll}>Tümünü aç</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={collapseAll}>Tümünü kapat</button>
              <span style={{ color: 'var(--text3)', fontSize: '11px', marginLeft: 'auto' }}>
                {zones.length} yer gösteriliyor
              </span>
            </div>

            {!zones.length && (
              <div style={{ color: 'var(--text3)', fontSize: '12px', padding: '8px 0' }}>Aramaya uyan dağıtım yeri yok.</div>
            )}

            {/* 1. seviye: dağıtım yerleri */}
            {zones.map((zone, index) => {
              const zoneOpen = openZones.has(zone.zone_id)
              return (
                <div key={zone.zone_id} style={{ border: '1px solid var(--border)', borderRadius: '10px', marginBottom: '6px', overflow: 'hidden' }}>
                  <button
                    type="button"
                    onClick={() => toggleZone(zone.zone_id)}
                    aria-expanded={zoneOpen}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px',
                      background: zoneOpen ? 'var(--surface2, var(--surface))' : 'transparent',
                      border: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--text)',
                    }}
                  >
                    <span style={{ color: 'var(--text3)', fontSize: '11px', width: '18px' }}>{index + 1}</span>
                    <span style={{ color: 'var(--accent)', width: '12px' }}>{zoneOpen ? '▾' : '▸'}</span>
                    <strong style={{ fontSize: '13px', minWidth: 0, flex: '1 1 auto' }}>{zone.zone_name}</strong>
                    <span style={{ fontSize: '11px', color: 'var(--text3)' }}>{zone.activeDays} gün</span>
                    <span style={{ fontSize: '11px', color: 'var(--text3)', maxWidth: '190px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      en çok: {zone.topProduct}
                    </span>
                    <strong style={{ fontFamily: 'var(--mono)', fontSize: '13px' }}>{nf(zone.total)}</strong>
                    <span style={{ fontSize: '11px', color: 'var(--text3)', width: '48px', textAlign: 'right' }}>{sharePct(zone.share)}</span>
                  </button>

                  {zoneOpen && (
                    <div style={{ padding: '0 12px 10px', overflowX: 'auto' }}>
                      <table className="table" style={{ width: '100%', fontSize: '11px' }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: 'left', width: '110px' }}>GÜN</th>
                            {zone.columns.map(column => (
                              <th key={column.label} style={{ textAlign: 'center' }}>{column.label}</th>
                            ))}
                            <th style={{ textAlign: 'right', width: '76px' }}>TOPLAM</th>
                          </tr>
                        </thead>
                        <tbody>
                          {zone.days.map(day => {
                            const dayKey = `${zone.zone_id}:${day.key}`
                            const dayOpen = openDays.has(dayKey)
                            const lines = dayOpen ? dayLines(report, zone.zone_id, day.key) : []
                            return [
                              <tr
                                key={dayKey}
                                onClick={() => toggleDay(dayKey)}
                                style={{ cursor: 'pointer', background: dayOpen ? 'var(--surface)' : undefined }}
                              >
                                <td style={{ whiteSpace: 'nowrap' }}>
                                  <span style={{ color: 'var(--accent)', marginRight: '5px' }}>{dayOpen ? '▾' : '▸'}</span>
                                  {day.label}
                                </td>
                                {day.cells.map((value, cellIndex) => (
                                  <td key={cellIndex} style={{ textAlign: 'center', color: value ? 'var(--text)' : 'var(--text3)' }}>
                                    {cellText(value)}
                                  </td>
                                ))}
                                <td style={{ textAlign: 'right', fontWeight: 600 }}>{nf(day.total)}</td>
                              </tr>,
                              dayOpen && (
                                <tr key={`${dayKey}-detail`}>
                                  <td colSpan={zone.columns.length + 2} style={{ background: 'var(--surface)', padding: '6px 10px 8px' }}>
                                    {lines.length ? lines.map((line, lineIndex) => (
                                      <div key={lineIndex} style={{ padding: '3px 0', borderBottom: lineIndex < lines.length - 1 ? '1px dashed var(--border)' : 'none' }}>
                                        <span style={{ color: 'var(--text2)' }}>└ {line.label}</span>
                                        <strong style={{ marginLeft: '8px', fontFamily: 'var(--mono)' }}>{nf(line.qty_base)}</strong>
                                        {line.qty_human && <span style={{ color: 'var(--text3)', marginLeft: '6px' }}>({line.qty_human})</span>}
                                        {(line.note || line.created_by_name) && (
                                          <div style={{ color: 'var(--text3)', fontSize: '10px', marginLeft: '14px' }}>
                                            {line.note && <span>not: {line.note}</span>}
                                            {line.note && line.created_by_name && <span> · </span>}
                                            {line.created_by_name && <span>giren: {line.created_by_name}</span>}
                                          </div>
                                        )}
                                      </div>
                                    )) : (
                                      <span style={{ color: 'var(--text3)', fontSize: '10px' }}>
                                        Bu aralık için gün detayı üretilmedi (çok sayıda hareketli gün).
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ),
                            ]
                          })}
                          <tr style={{ background: 'var(--amber-soft, #FEF3C7)', fontWeight: 600 }}>
                            <td>TOPLAM</td>
                            {zone.columns.map(column => (
                              <td key={column.label} style={{ textAlign: 'center' }}>{nf(column.total)}</td>
                            ))}
                            <td style={{ textAlign: 'right' }}>{nf(zone.total)}</td>
                          </tr>
                        </tbody>
                      </table>
                      {zone.hidden.length > 0 && (
                        <div style={{ color: 'var(--text3)', fontSize: '10px', marginTop: '4px' }}>
                          Diğer: {zone.hidden.map(product => product.label).join(', ')}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', marginTop: '4px',
              background: 'var(--amber-soft, #FEF3C7)', borderRadius: '10px', fontWeight: 600, fontSize: '13px',
            }}
            >
              <span style={{ flex: '1 1 auto' }}>GENEL TOPLAM</span>
              <span style={{ fontFamily: 'var(--mono)' }}>{nf(breakdown.totals.grandTotal)}</span>
              <span style={{ color: 'var(--text3)', fontSize: '11px', width: '48px', textAlign: 'right' }}>%100</span>
            </div>
          </>
        )}
      </div>
    </WaterCollapsiblePanel>
  )
}
