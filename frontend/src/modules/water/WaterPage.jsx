import { useState, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'

const toastOk = (m) => useToastStore.getState().addToast(m, 'success')
const toastErr = (m) => useToastStore.getState().addToast(m, 'error')
const errMsg = (e, f) => e?.response?.data?.error || f

const UNITS = [['adet', 'Adet'], ['koli', 'Koli'], ['palet', 'Palet']]
const todayStr = () => new Date().toLocaleDateString('sv-SE')
const nf = (n) => new Intl.NumberFormat('tr-TR').format(n || 0)
const multiplier = (p, unit) => unit === 'palet' ? (p.units_per_case * p.cases_per_pallet) : unit === 'koli' ? p.units_per_case : 1
const humanQty = (p, base) => {
  const label = p?.unit_label || 'adet'
  let rest = Math.max(0, Math.round(base || 0))
  if (rest === 0) return `0 ${label}`
  const parts = []
  const perCase = Math.max(1, Number(p?.units_per_case || 1))
  const casesPerPallet = Math.max(1, Number(p?.cases_per_pallet || 1))
  const perPallet = perCase * casesPerPallet
  if (perCase > 1 && casesPerPallet > 1 && rest >= perPallet) {
    const palet = Math.floor(rest / perPallet); parts.push(`${palet} palet`); rest -= palet * perPallet
  }
  if (perCase > 1 && rest >= perCase) {
    const koli = Math.floor(rest / perCase); parts.push(`${koli} koli`); rest -= koli * perCase
  }
  if (rest > 0) parts.push(`${rest} ${label}`)
  return parts.join(' ')
}
const defaultUnitForProduct = (p) => (p?.units_per_case || 1) > 1 ? 'koli' : 'adet'
const availableUnitsForProduct = (p) => {
  const units = ['adet']
  if ((p?.units_per_case || 1) > 1) units.push('koli')
  if ((p?.units_per_case || 1) > 1 && (p?.cases_per_pallet || 1) > 1) units.push('palet')
  return units
}
const unitOptionsForProduct = (p) => UNITS.filter(([unit]) => availableUnitsForProduct(p).includes(unit))
const coerceUnitForProduct = (unit, p) => {
  const units = availableUnitsForProduct(p)
  return units.includes(unit) ? unit : units[units.length - 1] || 'adet'
}
const parseQty = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const n = Number(String(v ?? '').replace(',', '.').trim())
  return Number.isFinite(n) ? n : 0
}

const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const pad2 = (n) => String(n).padStart(2, '0')
const monthBounds = (y, m) => {
  const last = new Date(y, m, 0).getDate()
  return { from: `${y}-${pad2(m)}-01`, to: `${y}-${pad2(m)}-${pad2(last)}`, label: `${MONTHS_TR[m - 1]} ${y}` }
}
const cellKey = (zoneId, productId) => `${zoneId}:${productId}`

const BRAND_TINT = [
  { bg: 'rgba(29,158,117,.12)', fg: '#0f6e56' },   // teal
  { bg: 'rgba(55,138,221,.12)', fg: '#185fa5' },   // blue
  { bg: 'rgba(239,159,39,.14)', fg: '#854f0b' },   // amber
  { bg: 'rgba(212,90,48,.12)', fg: '#993c1d' },    // coral
  { bg: 'rgba(127,119,221,.12)', fg: '#534ab7' },  // purple
]

// ─────────────────────────── ANA SAYFA (tek ekran pano) ───────────────────────────
export default function WaterPage() {
  const now = new Date()
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 })
  const [modal, setModal] = useState(null) // 'settings' | 'text' | null
  const { from, to, label } = monthBounds(ym.y, ym.m)

  const { data: summary } = useQuery({
    queryKey: ['water-summary', from, to],
    queryFn: () => api.get('/water/summary', { params: { from, to } }).then(r => r.data),
  })

  const shiftMonth = (delta) => setYm(({ y, m }) => {
    const idx = (y * 12 + (m - 1)) + delta
    return { y: Math.floor(idx / 12), m: (idx % 12) + 1 }
  })
  const t = summary?.totals

  return (
    <div className="fade-up">
      <div className="sect"><div className="sect-title">SU TAKİP</div><div className="sect-line" /></div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '9px', padding: '3px 4px' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => shiftMonth(-1)} style={{ padding: '4px 8px' }}>‹</button>
          <span style={{ fontFamily: 'var(--mono)', fontSize: '13px', minWidth: '120px', textAlign: 'center', fontWeight: 600 }}>{label}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => shiftMonth(1)} style={{ padding: '4px 8px' }}>›</button>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setModal('text')}>📝 Metinden</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setModal('settings')}>⚙ Ayarlar</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        {[
          ['Ay Dağıtım', t?.period_out, 'var(--accent)'],
          ['Gelen (Tır)', t?.period_in, 'var(--green)'],
          ['Kalan Stok', t?.balance, 'var(--teal)'],
          ['Boş İade', t?.period_return, 'var(--text)'],
        ].map(([lbl, val, color]) => (
          <div key={lbl} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 16px' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px' }}>{lbl}</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: '24px', color, marginTop: '2px' }}>{nf(val)}</div>
          </div>
        ))}
      </div>

      <WaterBoard from={from} to={to} label={label} lowItems={(summary?.stock || []).filter(s => s.low)} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', marginTop: '16px' }}>
        <GelenTirPanel from={from} to={to} label={label} />
        <BosIadePanel from={from} to={to} deposit={summary?.deposit || []} />
      </div>

      {modal === 'settings' && <SettingsModal onClose={() => setModal(null)} />}
      {modal === 'text' && <TextModal onClose={() => setModal(null)} />}
    </div>
  )
}

// ─────────────────────────── ANA PANO — INDEX matris + günlük giriş ───────────────────────────
function WaterBoard({ from, to, label, lowItems }) {
  const qc = useQueryClient()
  const [day, setDay] = useState(() => {
    const t = todayStr()
    return (t >= from && t <= to) ? t : from
  })
  const [cells, setCells] = useState({})
  const [exporting, setExporting] = useState(false)
  const inputRefs = useRef({})

  const { data: pivot, isLoading } = useQuery({
    queryKey: ['water-pivot', from, to],
    queryFn: () => api.get('/water/pivot', { params: { from, to } }).then(r => r.data),
  })
  const { data: dayRows = [] } = useQuery({
    queryKey: ['water-day', day],
    queryFn: () => api.get('/water/movements', { params: { type: 'out', from: day, to: day } }).then(r => r.data),
  })

  const columnsById = useMemo(() => new Map((pivot?.columns || []).map(c => [c.product_id, c])), [pivot])
  const brandColor = useMemo(() => {
    const map = new Map()
    ;(pivot?.brands || []).forEach((b, i) => map.set(b.brand_id == null ? 'null' : String(b.brand_id), BRAND_TINT[i % BRAND_TINT.length]))
    return map
  }, [pivot])
  const orderedCols = useMemo(
    () => (pivot?.brands || []).flatMap(b => b.product_ids.map(pid => columnsById.get(pid)).filter(Boolean)),
    [pivot, columnsById],
  )
  const zones = pivot?.rows || []

  // O gün zaten girilmiş dağıtım (mükerrer girişi görmek için)
  const dayMap = useMemo(() => {
    const m = {}
    dayRows.forEach(r => { const k = cellKey(r.zone_id, r.product_id); m[k] = (m[k] || 0) + (r.qty_base || 0) })
    return m
  }, [dayRows])

  // Taslak (yazılan) miktarlar — matris girişi her zaman base birim (adet/şişe) = Excel ham sayısı
  const draft = useMemo(() => {
    const byCell = {}, byZone = {}, byProduct = {}
    let total = 0
    Object.entries(cells).forEach(([k, raw]) => {
      const q = parseQty(raw)
      if (!(q > 0)) return
      const [z, p] = k.split(':')
      byCell[k] = q; byZone[z] = (byZone[z] || 0) + q; byProduct[p] = (byProduct[p] || 0) + q; total += q
    })
    return { byCell, byZone, byProduct, total, count: Object.keys(byCell).length }
  }, [cells])

  const saveBatch = useMutation({
    mutationFn: (lines) => api.post('/water/distribute/batch', { move_date: day, lines }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['water-pivot'] })
      qc.invalidateQueries({ queryKey: ['water-summary'] })
      qc.invalidateQueries({ queryKey: ['water-day'] })
      toastOk(`${r.data.count} dağıtım kaydedildi (${day})`)
      setCells({})
    },
    onError: (e) => toastErr(errMsg(e, 'Kaydedilemedi')),
  })

  const updateCell = (zoneId, productId, value) => setCells(prev => {
    const next = { ...prev }; const k = cellKey(zoneId, productId)
    if (value === '' || parseQty(value) === 0) delete next[k]; else next[k] = value
    return next
  })

  const handlePaste = (e, zoneIdx, prodIdx) => {
    const text = e.clipboardData?.getData('text')
    if (!text || (!text.includes('\t') && !text.includes('\n'))) return
    e.preventDefault()
    const rows = text.trimEnd().split(/\r?\n/).map(r => r.split('\t'))
    setCells(prev => {
      const next = { ...prev }
      rows.forEach((cols, ro) => {
        const zone = zones[zoneIdx + ro]; if (!zone) return
        cols.forEach((raw, co) => {
          const col = orderedCols[prodIdx + co]; if (!col) return
          const val = raw.trim().replace(',', '.'); const k = cellKey(zone.zone_id, col.product_id)
          if (val === '' || parseQty(val) === 0) delete next[k]; else next[k] = val
        })
      })
      return next
    })
    toastOk(`${rows.length} satır yapıştırıldı`)
  }

  const save = () => {
    const lines = Object.entries(draft.byCell).map(([k, q]) => {
      const [zone_id, product_id] = k.split(':')
      return { zone_id: +zone_id, product_id: +product_id, input_qty: q, input_unit: 'adet' }
    })
    if (lines.length === 0) return toastErr('Önce hücrelere miktar girin')
    saveBatch.mutate(lines)
  }

  const exportExcel = async () => {
    if (!pivot) return
    setExporting(true)
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('INDEX')
      const border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
      const cols = orderedCols
      const totalCols = 1 + cols.length + 1
      ws.mergeCells(1, 1, 1, totalCols)
      ws.getCell(1, 1).value = `INDEX — ${label}`
      ws.getCell(1, 1).font = { bold: true, size: 13 }
      ws.mergeCells(2, 1, 3, 1); ws.getCell(2, 1).value = 'FİRMA'
      let cIdx = 2
      ;(pivot.brands || []).forEach(b => {
        const span = b.product_ids.length; if (span < 1) return
        ws.mergeCells(2, cIdx, 2, cIdx + span - 1); ws.getCell(2, cIdx).value = b.brand_name; cIdx += span
      })
      ws.mergeCells(2, totalCols, 3, totalCols); ws.getCell(2, totalCols).value = 'TOPLAM'
      cols.forEach((c, i) => { ws.getCell(3, 2 + i).value = c.name })
      for (let r = 2; r <= 3; r++) ws.getRow(r).eachCell(c => {
        c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }
        c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = border
      })
      let rowNo = 4
      zones.forEach(row => {
        ws.getCell(rowNo, 1).value = row.zone_name
        cols.forEach((c, i) => { ws.getCell(rowNo, 2 + i).value = (row.cells[c.product_id]?.base) || null })
        ws.getCell(rowNo, totalCols).value = row.total_base || null
        ws.getRow(rowNo).eachCell({ includeEmpty: true }, c => { c.border = border })
        ws.getCell(rowNo, totalCols).font = { bold: true }; rowNo++
      })
      ws.getCell(rowNo, 1).value = 'GENEL TOPLAM'
      cols.forEach((c, i) => { ws.getCell(rowNo, 2 + i).value = pivot.colTotals[c.product_id]?.base || 0 })
      ws.getCell(rowNo, totalCols).value = pivot.grandTotal
      ws.getRow(rowNo).eachCell({ includeEmpty: true }, c => {
        c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE68A' } }; c.border = border
      })
      ws.getColumn(1).width = 26
      for (let i = 0; i < cols.length; i++) ws.getColumn(2 + i).width = 11
      ws.getColumn(totalCols).width = 12
      const buf = await wb.xlsx.writeBuffer()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      a.download = `su-index-${from}_${to}.xlsx`; a.click(); URL.revokeObjectURL(a.href)
    } catch { toastErr('Excel oluşturulamadı') } finally { setExporting(false) }
  }

  return (
    <div className="panel" data-testid="water-board">
      <div className="panel-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <div className="panel-title">INDEX — FİRMA DAĞITIM MATRİSİ</div>
          <div className="panel-subtitle">{zones.length} firma · GENEL TOPLAM {nf(pivot?.grandTotal)}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Gün girişi:</span>
          <input type="date" className="form-input" min={from} max={to} value={day} onChange={e => setDay(e.target.value)} style={{ width: 'auto', fontSize: '12px' }} />
          <button className="btn btn-ghost btn-sm" onClick={exportExcel} disabled={exporting || !pivot}>⬇ {exporting ? '…' : 'Excel'}</button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saveBatch.isPending || draft.count === 0}>
            {saveBatch.isPending ? 'Kaydediliyor…' : draft.count ? `${draft.count} Hücreyi Kaydet` : 'Kaydet'}
          </button>
        </div>
      </div>
      <div className="panel-body" style={{ padding: 0 }}>
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', padding: '10px 14px', fontSize: '11px', color: 'var(--text3)', borderBottom: '1px solid var(--border)' }}>
          {(pivot?.brands || []).map(b => {
            const c = brandColor.get(b.brand_id == null ? 'null' : String(b.brand_id))
            return <span key={b.brand_id ?? 'none'} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: c?.bg, border: `1px solid ${c?.fg}` }} />{b.brand_name}
            </span>
          })}
          <span style={{ color: 'var(--text3)' }}>Üst sayı = ay toplamı · alt kutu = <b>{day}</b> günü girişi (adet)</span>
        </div>

        {lowItems.length > 0 && (
          <div style={{ padding: '8px 14px', fontSize: '11px', color: 'var(--red)', borderBottom: '1px solid var(--border)', background: 'rgba(239,68,68,.06)' }}>
            ⚠ Düşük stok: {lowItems.map(p => `${p.name} (${p.balance_human})`).join(' · ')}
          </div>
        )}

        {isLoading ? <div style={{ padding: '20px', color: 'var(--text3)' }}>Yükleniyor…</div> : !orderedCols.length ? (
          <div style={{ padding: '20px', color: 'var(--text3)' }}>Ürün tanımı yok — ⚙ Ayarlar’dan ekleyin.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ fontSize: '11px', minWidth: Math.max(700, 200 + orderedCols.length * 76) }}>
              <thead>
                <tr>
                  <th rowSpan={2} style={{ position: 'sticky', left: 0, zIndex: 3, background: 'var(--surface)', textAlign: 'left', minWidth: '150px' }}>FİRMA</th>
                  {(pivot.brands || []).map(b => {
                    if (!b.product_ids.length) return null
                    const c = brandColor.get(b.brand_id == null ? 'null' : String(b.brand_id))
                    return <th key={b.brand_id ?? 'none'} colSpan={b.product_ids.length} style={{ textAlign: 'center', background: c?.bg, color: c?.fg, fontWeight: 700 }}>{b.brand_name}</th>
                  })}
                  <th rowSpan={2} style={{ textAlign: 'right', minWidth: '64px', background: 'var(--surface2)' }}>TOPLAM</th>
                </tr>
                <tr>
                  {orderedCols.map(c => (
                    <th key={c.product_id} style={{ textAlign: 'right', minWidth: '64px' }} title={`${c.brand_name} · ${c.name}`}>{c.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {zones.map((row, zoneIdx) => {
                  const rowDraft = draft.byZone[row.zone_id] || 0
                  return (
                    <tr key={row.zone_id}>
                      <td style={{ position: 'sticky', left: 0, zIndex: 1, background: 'var(--surface)', fontWeight: 600, whiteSpace: 'nowrap' }}>{row.zone_name}</td>
                      {orderedCols.map((c, prodIdx) => {
                        const key = cellKey(row.zone_id, c.product_id)
                        const monthBase = row.cells[c.product_id]?.base || 0
                        const dayBase = dayMap[key] || 0
                        const active = parseQty(cells[key]) > 0
                        return (
                          <td key={c.product_id} style={{ textAlign: 'right', verticalAlign: 'top', background: active ? 'rgba(34,197,94,.08)' : undefined }}>
                            <div style={{ fontFamily: 'var(--mono)', color: monthBase ? 'var(--text)' : 'var(--text3)' }}>{monthBase ? nf(monthBase) : '·'}</div>
                            <input
                              ref={el => { if (el) inputRefs.current[key] = el }}
                              type="number" min="0" step="any" inputMode="numeric"
                              className="form-input" value={cells[key] || ''}
                              onChange={e => updateCell(row.zone_id, c.product_id, e.target.value)}
                              onPaste={e => handlePaste(e, zoneIdx, prodIdx)}
                              placeholder="0"
                              style={{ width: '52px', height: '26px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: '11px', padding: '2px 5px', marginTop: '3px' }}
                            />
                            {dayBase > 0 && <div style={{ fontSize: '9px', color: 'var(--teal)', marginTop: '2px' }}>bugün {nf(dayBase)}</div>}
                          </td>
                        )
                      })}
                      <td style={{ textAlign: 'right', verticalAlign: 'top', fontFamily: 'var(--mono)', fontWeight: 700, background: 'var(--surface2)' }}>
                        <div style={{ color: row.total_base ? 'var(--teal)' : 'var(--text3)' }}>{row.total_base ? nf(row.total_base) : '·'}</div>
                        {rowDraft > 0 && <div style={{ fontSize: '10px', color: 'var(--green)' }}>+{nf(rowDraft)}</div>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border)' }}>
                  <td style={{ position: 'sticky', left: 0, zIndex: 1, background: 'var(--surface2)', fontWeight: 700 }}>GENEL TOPLAM</td>
                  {orderedCols.map(c => {
                    const colBase = pivot.colTotals[c.product_id]?.base || 0
                    const colDraft = draft.byProduct[c.product_id] || 0
                    return (
                      <td key={c.product_id} style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, background: 'var(--surface2)' }}>
                        {nf(colBase)}{colDraft > 0 && <div style={{ fontSize: '10px', color: 'var(--green)' }}>+{nf(colDraft)}</div>}
                      </td>
                    )
                  })}
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)', background: 'var(--surface2)' }}>
                    {nf(pivot.grandTotal)}{draft.total > 0 && <div style={{ fontSize: '10px', color: 'var(--green)' }}>+{nf(draft.total)}</div>}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────── GELEN TIR (aylık giriş) ───────────────────────────
function GelenTirPanel({ from, to, label }) {
  const qc = useQueryClient()
  const { data: products = [] } = useQuery({ queryKey: ['water-products'], queryFn: () => api.get('/water/products').then(r => r.data) })
  const { data: intakes = [] } = useQuery({ queryKey: ['water-intake', from, to], queryFn: () => api.get('/water/movements', { params: { type: 'in', from, to } }).then(r => r.data) })

  const byProduct = useMemo(() => {
    const m = new Map()
    intakes.forEach(r => {
      const cur = m.get(r.product_id) || { name: r.product_name, brand: r.brand_name, p: r, base: 0 }
      cur.base += r.qty_base || 0; m.set(r.product_id, cur)
    })
    return [...m.values()].sort((a, b) => b.base - a.base)
  }, [intakes])

  const [form, setForm] = useState({ product_id: '', input_qty: '', input_unit: 'palet', move_date: todayStr() })
  const selected = products.find(p => String(p.id) === String(form.product_id))

  const save = useMutation({
    mutationFn: (payload) => api.post('/water/intake', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['water-intake'] }); qc.invalidateQueries({ queryKey: ['water-summary'] })
      toastOk('Gelen tır kaydedildi'); setForm(f => ({ ...f, input_qty: '' }))
    },
    onError: (e) => toastErr(errMsg(e, 'Kaydedilemedi')),
  })
  const submit = () => {
    if (!form.product_id) return toastErr('Ürün seçin')
    if (!(Number(form.input_qty) > 0)) return toastErr('Miktar girin')
    save.mutate({ product_id: +form.product_id, input_qty: Number(form.input_qty), input_unit: form.input_unit, move_date: form.move_date })
  }

  return (
    <div className="panel">
      <div className="panel-header"><div className="panel-title">GELEN TIR — {label}</div></div>
      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr .9fr auto', gap: '6px', alignItems: 'end' }}>
          <select className="form-select" value={form.product_id} onChange={e => {
            const p = products.find(x => String(x.id) === e.target.value)
            setForm(f => ({ ...f, product_id: e.target.value, input_unit: defaultUnitForProduct(p) }))
          }}>
            <option value="">Ürün…</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.brand_name ? `${p.brand_name} · ` : ''}{p.name}</option>)}
          </select>
          <input type="number" min="0" step="any" className="form-input" placeholder="Miktar" value={form.input_qty} onChange={e => setForm(f => ({ ...f, input_qty: e.target.value }))} />
          <select className="form-select" value={form.input_unit} onChange={e => setForm(f => ({ ...f, input_unit: e.target.value }))}>
            {unitOptionsForProduct(selected).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button className="btn btn-primary btn-sm" onClick={submit} disabled={save.isPending}>Ekle</button>
        </div>
        <table className="data-table" style={{ fontSize: '12px' }}>
          <tbody>
            {byProduct.map(r => (
              <tr key={r.name + (r.brand || '')}>
                <td style={{ color: 'var(--text2)' }}>{r.brand ? `${r.brand} · ` : ''}{r.name}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{nf(r.base)} <span style={{ color: 'var(--text3)', fontSize: '10px' }}>({humanQty(r.p, r.base)})</span></td>
              </tr>
            ))}
            {byProduct.length === 0 && <tr><td style={{ textAlign: 'center', color: 'var(--text3)', padding: '12px' }}>Bu ay gelen tır kaydı yok</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─────────────────────────── BOŞ İADE (depozito) ───────────────────────────
function BosIadePanel({ from, to, deposit }) {
  const qc = useQueryClient()
  const { data: products = [] } = useQuery({ queryKey: ['water-products'], queryFn: () => api.get('/water/products').then(r => r.data) })
  const returnable = useMemo(() => products.filter(p => p.is_returnable), [products])
  const { data: returns = [] } = useQuery({ queryKey: ['water-returns', from, to], queryFn: () => api.get('/water/returns', { params: { from, to } }).then(r => r.data) })

  const [form, setForm] = useState({ product_id: '', input_qty: '', input_unit: 'adet', move_date: todayStr() })
  const selected = returnable.find(p => String(p.id) === String(form.product_id))

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['water-returns'] }); qc.invalidateQueries({ queryKey: ['water-summary'] })
  }
  const save = useMutation({
    mutationFn: (payload) => api.post('/water/returns', payload),
    onSuccess: () => { invalidate(); toastOk('İade kaydedildi'); setForm(f => ({ ...f, input_qty: '' })) },
    onError: (e) => toastErr(errMsg(e, 'Kaydedilemedi')),
  })
  const del = useMutation({ mutationFn: (id) => api.delete(`/water/returns/${id}`), onSuccess: () => { invalidate(); toastOk('Silindi') }, onError: (e) => toastErr(errMsg(e, 'Silinemedi')) })
  const submit = () => {
    if (!form.product_id) return toastErr('İade edilebilir ürün seçin')
    if (!(Number(form.input_qty) > 0)) return toastErr('Miktar girin')
    save.mutate({ product_id: +form.product_id, input_qty: Number(form.input_qty), input_unit: form.input_unit, move_date: form.move_date })
  }

  return (
    <div className="panel">
      <div className="panel-header"><div className="panel-title">BOŞ İADE — DEPOZİTO</div></div>
      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {deposit.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
            {deposit.map(d => (
              <div key={d.product_id} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 10px' }}>
                <div style={{ fontSize: '9px', color: 'var(--text3)' }}>{d.brand_name ? `${d.brand_name} · ` : ''}{d.name}</div>
                <div style={{ fontFamily: 'var(--display)', fontSize: '19px', color: d.outstanding > 0 ? 'var(--accent)' : 'var(--teal)' }}>{nf(d.outstanding)}</div>
                <div style={{ fontSize: '9px', color: 'var(--text3)' }}>dolaşımda · ay iade {nf(d.period_return)}</div>
              </div>
            ))}
          </div>
        )}
        {returnable.length === 0 ? (
          <div style={{ fontSize: '11px', color: 'var(--text3)' }}>İade edilebilir ürün yok — ⚙ Ayarlar’dan bir ürünü “iade edilebilir” işaretleyin.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr .9fr auto', gap: '6px', alignItems: 'end' }}>
            <select className="form-select" value={form.product_id} onChange={e => {
              const p = returnable.find(x => String(x.id) === e.target.value)
              setForm(f => ({ ...f, product_id: e.target.value, input_unit: defaultUnitForProduct(p) }))
            }}>
              <option value="">Ürün…</option>
              {returnable.map(p => <option key={p.id} value={p.id}>{p.brand_name ? `${p.brand_name} · ` : ''}{p.name}</option>)}
            </select>
            <input type="number" min="0" step="any" className="form-input" placeholder="Miktar" value={form.input_qty} onChange={e => setForm(f => ({ ...f, input_qty: e.target.value }))} />
            <select className="form-select" value={form.input_unit} onChange={e => setForm(f => ({ ...f, input_unit: e.target.value }))}>
              {unitOptionsForProduct(selected).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button className="btn btn-primary btn-sm" onClick={submit} disabled={save.isPending}>Ekle</button>
          </div>
        )}
        <table className="data-table" style={{ fontSize: '11px' }}>
          <tbody>
            {returns.slice(0, 8).map(r => (
              <tr key={r.id}>
                <td style={{ fontFamily: 'var(--mono)' }}>{r.move_date}</td>
                <td>{r.brand_name ? `${r.brand_name} · ` : ''}{r.product_name}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{r.input_qty} {r.input_unit}</td>
                <td style={{ textAlign: 'right' }}><button onClick={async () => { if (await confirmDialog({ title: 'İade Sil', body: 'Silinsin mi?', danger: true })) del.mutate(r.id) }} style={{ border: 'none', background: 'transparent', color: 'var(--text3)', cursor: 'pointer' }}>✕</button></td>
              </tr>
            ))}
            {returns.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text3)', padding: '10px' }}>Bu ay iade kaydı yok</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─────────────────────────── MODAL kabuğu ───────────────────────────
function Modal({ title, onClose, width = '860px', children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '5vh 16px', overflowY: 'auto' }} onClick={onClose}>
      <div className="panel" style={{ width, maxWidth: '100%', margin: 0 }} onClick={e => e.stopPropagation()}>
        <div style={{ height: '2px', background: 'var(--accent)' }} />
        <div className="panel-header">
          <div className="panel-title">{title}</div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕ Kapat</button>
        </div>
        <div className="panel-body">{children}</div>
      </div>
    </div>
  )
}

function SettingsModal({ onClose }) {
  const [tab, setTab] = useState('firmalar')
  return (
    <Modal title="AYARLAR" onClose={onClose} width="900px">
      <div style={{ display: 'flex', gap: '2px', marginBottom: '14px', background: 'var(--surface2)', borderRadius: '8px', padding: '2px', border: '1px solid var(--border)', width: 'fit-content' }}>
        {[['firmalar', '📍 Firmalar'], ['urunler', '💧 Ürünler & Marka']].map(([id, l]) => (
          <button key={id} onClick={() => setTab(id)} style={{ border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', cursor: 'pointer', background: tab === id ? 'var(--accent)' : 'transparent', color: tab === id ? '#000' : 'var(--text3)' }}>{l}</button>
        ))}
      </div>
      {tab === 'firmalar' ? <ZonesTab /> : <ProductsTab />}
    </Modal>
  )
}

function TextModal({ onClose }) {
  const qc = useQueryClient()
  const { data: products = [] } = useQuery({ queryKey: ['water-products'], queryFn: () => api.get('/water/products').then(r => r.data) })
  const { data: zones = [] } = useQuery({ queryKey: ['water-zones'], queryFn: () => api.get('/water/zones').then(r => r.data) })
  const onSaved = () => { qc.invalidateQueries({ queryKey: ['water-pivot'] }); qc.invalidateQueries({ queryKey: ['water-summary'] }); qc.invalidateQueries({ queryKey: ['water-day'] }) }
  return (
    <Modal title="METİNDEN DAĞITIM" onClose={onClose} width="720px">
      <TextDistribute products={products} zones={zones} onSaved={onSaved} />
    </Modal>
  )
}

// Metinden dağıtım: yapıştır → çözümle → önizle/düzelt → kaydet
function TextDistribute({ products, zones, onSaved }) {
  const [text, setText] = useState('')
  const [moveDate, setMoveDate] = useState(todayStr())
  const [items, setItems] = useState(null)

  const parse = useMutation({
    mutationFn: () => api.post('/water/distribute/parse', { text }).then(r => r.data),
    onSuccess: (d) => {
      if (!d.items.length) { toastErr('Metinden satır çıkarılamadı'); return }
      setItems(d.items.map((it, i) => ({ ...it, _id: i })))
    },
    onError: (e) => toastErr(errMsg(e, 'Çözümlenemedi')),
  })
  const saveBatch = useMutation({
    mutationFn: (lines) => api.post('/water/distribute/batch', { move_date: moveDate, lines }),
    onSuccess: (r) => { onSaved(); toastOk(`${r.data.count} dağıtım kaydedildi`); setItems(null); setText('') },
    onError: (e) => toastErr(errMsg(e, 'Kaydedilemedi')),
  })

  const upd = (id, patch) => setItems(items.map(it => it._id === id ? { ...it, ...patch } : it))
  const validCount = items?.filter(it => it.zone_id && it.product_id && Number(it.input_qty) > 0).length || 0

  const save = () => {
    const lines = items.filter(it => it.zone_id && it.product_id && Number(it.input_qty) > 0)
      .map(it => ({ zone_id: +it.zone_id, product_id: +it.product_id, input_qty: Number(it.input_qty), input_unit: it.input_unit }))
    if (!lines.length) return toastErr('Kaydedilecek geçerli satır yok')
    saveBatch.mutate(lines)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {!items ? (
        <>
          <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
            Her satıra bir firma yaz. Örnek:<br />
            <code style={{ fontSize: '10px' }}>OTC Kamp Alanı 5 koli 0.5, 10 damacana</code><br />
            <code style={{ fontSize: '10px' }}>Heliport 2 palet 0.33</code>
          </div>
          <textarea className="form-input" rows={7} value={text} onChange={e => setText(e.target.value)} placeholder="Dağıtım raporunu buraya yapıştır…" style={{ resize: 'vertical', fontFamily: 'var(--mono)', fontSize: '12px' }} />
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <label className="form-label" style={{ margin: 0 }}>Tarih:</label>
            <input type="date" className="form-input" value={moveDate} onChange={e => setMoveDate(e.target.value)} style={{ width: 'auto' }} />
            <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => parse.mutate()} disabled={!text.trim() || parse.isPending}>{parse.isPending ? 'Çözümleniyor…' : '🔍 Çözümle'}</button>
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: '11px', color: 'var(--text2)' }}>{validCount}/{items.length} satır hazır. Eksikleri (kırmızı) düzeltip kaydet.</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ fontSize: '11px' }}>
              <thead><tr><th>Firma</th><th>Ürün</th><th>Miktar</th><th>Birim</th><th></th></tr></thead>
              <tbody>
                {items.map(it => {
                  const bad = !it.zone_id || !it.product_id || !(Number(it.input_qty) > 0)
                  const selectedProduct = products.find(p => String(p.id) === String(it.product_id))
                  return (
                    <tr key={it._id} style={{ background: bad ? 'rgba(239,68,68,.06)' : undefined }}>
                      <td><select className="form-select" style={{ fontSize: '11px', minWidth: '130px' }} value={it.zone_id || ''} onChange={e => upd(it._id, { zone_id: e.target.value })}>
                        <option value="">— seç —</option>{zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}</select></td>
                      <td><select className="form-select" style={{ fontSize: '11px', minWidth: '130px' }} value={it.product_id || ''} onChange={e => {
                        const p = products.find(x => String(x.id) === e.target.value)
                        upd(it._id, { product_id: e.target.value, input_unit: defaultUnitForProduct(p) })
                      }}>
                        <option value="">— seç —</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></td>
                      <td><input type="number" min="0" step="any" className="form-input" style={{ fontSize: '11px', width: '70px' }} value={it.input_qty ?? ''} onChange={e => upd(it._id, { input_qty: e.target.value })} /></td>
                      <td><select className="form-select" style={{ fontSize: '11px' }} value={it.input_unit} onChange={e => upd(it._id, { input_unit: e.target.value })}>{unitOptionsForProduct(selectedProduct).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
                      <td style={{ textAlign: 'right' }}><button onClick={() => setItems(items.filter(x => x._id !== it._id))} style={{ border: 'none', background: 'transparent', color: 'var(--text3)', cursor: 'pointer' }}>✕</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setItems(null)}>← Geri</button>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Tarih: {moveDate}</span>
              <button className="btn btn-primary" onClick={save} disabled={saveBatch.isPending || validCount === 0}>{saveBatch.isPending ? 'Kaydediliyor…' : `${validCount} Dağıtımı Kaydet`}</button>
            </span>
          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────── FİRMALAR (bölge yönetimi) ───────────────────────────
function ZonesTab() {
  const qc = useQueryClient()
  const [form, setForm] = useState({ name: '', code: '', note: '' })
  const { data: zones = [] } = useQuery({ queryKey: ['water-zones'], queryFn: () => api.get('/water/zones').then(r => r.data) })
  const create = useMutation({ mutationFn: (p) => api.post('/water/zones', p), onSuccess: () => { qc.invalidateQueries({ queryKey: ['water-zones'] }); qc.invalidateQueries({ queryKey: ['water-pivot'] }); setForm({ name: '', code: '', note: '' }); toastOk('Firma eklendi') }, onError: (e) => toastErr(errMsg(e, 'Eklenemedi')) })
  const del = useMutation({ mutationFn: (id) => api.delete(`/water/zones/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['water-zones'] }); qc.invalidateQueries({ queryKey: ['water-pivot'] }); toastOk('Silindi') }, onError: (e) => toastErr(errMsg(e, 'Silinemedi')) })
  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '14px' }}>
        <div style={{ flex: 1, minWidth: '160px' }}><label className="form-label">Firma adı</label><input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ör. OTC Kamp Alanı" /></div>
        <div style={{ width: '110px' }}><label className="form-label">Kod</label><input className="form-input" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} /></div>
        <div style={{ flex: 1, minWidth: '140px' }}><label className="form-label">Not</label><input className="form-input" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} /></div>
        <button className="btn btn-primary" disabled={!form.name.trim() || create.isPending} onClick={() => create.mutate({ ...form, name: form.name.trim() })}>Ekle</button>
      </div>
      <div style={{ maxHeight: '46vh', overflowY: 'auto' }}>
        <table className="data-table" style={{ fontSize: '12px' }}>
          <thead><tr><th>Ad</th><th>Kod</th><th>Not</th><th></th></tr></thead>
          <tbody>
            {zones.map(z => (
              <tr key={z.id}>
                <td style={{ fontWeight: 600 }}>{z.name}</td>
                <td style={{ fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{z.code || '—'}</td>
                <td style={{ color: 'var(--text3)' }}>{z.note || '—'}</td>
                <td style={{ textAlign: 'right' }}><button onClick={async () => { if (await confirmDialog({ title: 'Firmayı Sil', body: `"${z.name}" silinsin mi?`, danger: true })) del.mutate(z.id) }} className="btn btn-danger btn-sm">Sil</button></td>
              </tr>
            ))}
            {zones.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text3)', padding: '16px' }}>Firma yok</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─────────────────────────── ÜRÜNLER + MARKA ───────────────────────────
function ProductsTab() {
  const qc = useQueryClient()
  const blank = { id: null, name: '', unit_label: 'şişe', units_per_case: '12', cases_per_pallet: '70', min_qty: '', min_unit: 'koli', brand_id: '', is_returnable: false }
  const [form, setForm] = useState(blank)
  const { data: products = [] } = useQuery({ queryKey: ['water-products-all'], queryFn: () => api.get('/water/products', { params: { all: 1 } }).then(r => r.data) })
  const { data: brands = [] } = useQuery({ queryKey: ['water-brands'], queryFn: () => api.get('/water/brands').then(r => r.data) })

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['water-products-all'] }); qc.invalidateQueries({ queryKey: ['water-products'] }); qc.invalidateQueries({ queryKey: ['water-summary'] }); qc.invalidateQueries({ queryKey: ['water-pivot'] }); qc.invalidateQueries({ queryKey: ['water-deposit'] }) }
  const payload = () => {
    const upc = +form.units_per_case || 1, cpp = +form.cases_per_pallet || 1
    const minUnit = coerceUnitForProduct(form.min_unit, { units_per_case: upc, cases_per_pallet: cpp })
    const mult = minUnit === 'palet' ? upc * cpp : minUnit === 'koli' ? upc : 1
    return { name: form.name.trim(), unit_label: form.unit_label, units_per_case: upc, cases_per_pallet: cpp, min_level: Math.round((+form.min_qty || 0) * mult), brand_id: form.brand_id || null, is_returnable: form.is_returnable }
  }
  const create = useMutation({ mutationFn: () => api.post('/water/products', payload()), onSuccess: () => { invalidate(); setForm(blank); toastOk('Ürün eklendi') }, onError: (e) => toastErr(errMsg(e, 'Eklenemedi')) })
  const update = useMutation({ mutationFn: () => api.put(`/water/products/${form.id}`, payload()), onSuccess: () => { invalidate(); setForm(blank); toastOk('Ürün güncellendi') }, onError: (e) => toastErr(errMsg(e, 'Güncellenemedi')) })
  const del = useMutation({ mutationFn: (id) => api.delete(`/water/products/${id}`), onSuccess: () => { invalidate(); toastOk('Silindi') }, onError: (e) => toastErr(errMsg(e, 'Silinemedi')) })

  const editProduct = (p) => setForm({ id: p.id, name: p.name, unit_label: p.unit_label, units_per_case: String(p.units_per_case), cases_per_pallet: String(p.cases_per_pallet), min_qty: p.min_level ? String(p.min_level) : '', min_unit: 'adet', brand_id: p.brand_id ? String(p.brand_id) : '', is_returnable: !!p.is_returnable })
  const packageMode = (+form.units_per_case || 1) <= 1 ? 'single' : (+form.cases_per_pallet || 1) <= 1 ? 'case' : 'pallet'
  const formPackage = { units_per_case: +form.units_per_case || 1, cases_per_pallet: +form.cases_per_pallet || 1 }
  const formUnitOptions = unitOptionsForProduct(formPackage)
  const updatePackageNumber = (field, value) => setForm(f => {
    const next = { ...f, [field]: value }
    const nextPackage = { units_per_case: +next.units_per_case || 1, cases_per_pallet: +next.cases_per_pallet || 1 }
    return { ...next, min_unit: coerceUnitForProduct(next.min_unit, nextPackage) }
  })
  const setPackageMode = (mode) => {
    if (mode === 'single') setForm(f => ({ ...f, units_per_case: '1', cases_per_pallet: '1', min_unit: 'adet' }))
    else if (mode === 'case') setForm(f => ({ ...f, units_per_case: f.units_per_case === '1' ? '12' : f.units_per_case, cases_per_pallet: '1', min_unit: f.min_unit === 'palet' ? 'koli' : f.min_unit }))
    else setForm(f => ({ ...f, units_per_case: f.units_per_case === '1' ? '12' : f.units_per_case, cases_per_pallet: f.cases_per_pallet === '1' ? '70' : f.cases_per_pallet }))
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '6px' }}>
        <div style={{ flex: 1, minWidth: '150px' }}><label className="form-label">{form.id ? 'Ürün düzenle' : 'Ürün adı'}</label><input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ör. 0.5 L Şişe Su" /></div>
        <div style={{ width: '80px' }}><label className="form-label">Birim</label><input className="form-input" value={form.unit_label} onChange={e => setForm(f => ({ ...f, unit_label: e.target.value }))} /></div>
        <div style={{ minWidth: '200px' }}><label className="form-label">Paket tipi</label><div style={{ display: 'flex', gap: '2px', background: 'var(--surface2)', borderRadius: '7px', padding: '2px', border: '1px solid var(--border)' }}>
          {[['single', 'Tekil'], ['case', 'Koli'], ['pallet', 'Koli+Palet']].map(([id, label]) => (
            <button key={id} type="button" onClick={() => setPackageMode(id)} style={{ border: 'none', borderRadius: '5px', padding: '6px 9px', fontSize: '10px', cursor: 'pointer', background: packageMode === id ? 'var(--accent)' : 'transparent', color: packageMode === id ? '#000' : 'var(--text3)' }}>{label}</button>
          ))}
        </div></div>
        <div style={{ width: '78px' }}><label className="form-label">Koli/adet</label><input type="number" min="1" className="form-input" value={form.units_per_case} onChange={e => updatePackageNumber('units_per_case', e.target.value)} /></div>
        <div style={{ width: '78px' }}><label className="form-label">Palet/koli</label><input type="number" min="1" className="form-input" value={form.cases_per_pallet} onChange={e => updatePackageNumber('cases_per_pallet', e.target.value)} /></div>
        <div style={{ width: '76px' }}><label className="form-label">Min. stok</label><input type="number" min="0" className="form-input" value={form.min_qty} onChange={e => setForm(f => ({ ...f, min_qty: e.target.value }))} /></div>
        <div style={{ width: '76px' }}><label className="form-label">Min. birim</label><select className="form-select" value={coerceUnitForProduct(form.min_unit, formPackage)} onChange={e => setForm(f => ({ ...f, min_unit: e.target.value }))}>{formUnitOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div style={{ minWidth: '130px' }}><label className="form-label">Marka</label><select className="form-select" value={form.brand_id} onChange={e => setForm(f => ({ ...f, brand_id: e.target.value }))}>
          <option value="">Markasız</option>{brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select></div>
        <label style={{ display: 'flex', gap: '5px', alignItems: 'center', fontSize: '11px', color: 'var(--text2)', cursor: 'pointer', paddingBottom: '9px' }} title="Boş kap iade takibi (depozito)">
          <input type="checkbox" checked={form.is_returnable} onChange={e => setForm(f => ({ ...f, is_returnable: e.target.checked }))} /> İade edilebilir
        </label>
        {form.id && <button className="btn btn-ghost btn-sm" onClick={() => setForm(blank)}>+ Yeni</button>}
        <button className="btn btn-primary" disabled={!form.name.trim() || create.isPending || update.isPending} onClick={() => form.id ? update.mutate() : create.mutate()}>{form.id ? 'Güncelle' : 'Ekle'}</button>
      </div>
      <div style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: '12px' }}>Tekil = sadece adet; Koli = adet+koli; Koli+Palet = adet+koli+palet. “İade edilebilir” = damacana/tahta palet gibi boş dönüşü takip edilen kaplar.</div>

      <div style={{ maxHeight: '40vh', overflowY: 'auto' }}>
        <table className="data-table" style={{ fontSize: '12px' }}>
          <thead><tr><th>Ad</th><th>Marka</th><th>Birimler</th><th style={{ textAlign: 'right' }}>1 Koli</th><th style={{ textAlign: 'right' }}>1 Palet</th><th style={{ textAlign: 'right' }}>Min.</th><th></th></tr></thead>
          <tbody>
            {products.map(p => (
              <tr key={p.id} style={{ opacity: p.is_active ? 1 : 0.5 }}>
                <td style={{ fontWeight: 600 }}>{p.name} {p.is_returnable ? <span title="İade edilebilir" style={{ fontSize: '10px', color: 'var(--teal)' }}>♻️</span> : null}</td>
                <td style={{ color: 'var(--text3)' }}>{p.brand_name || '—'}</td>
                <td style={{ color: 'var(--text3)' }}>{unitOptionsForProduct(p).map(([, label]) => label).join(' / ')}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{p.units_per_case > 1 ? `${p.units_per_case} ${p.unit_label}` : '—'}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{p.units_per_case > 1 && p.cases_per_pallet > 1 ? `${p.units_per_case * p.cases_per_pallet} ${p.unit_label}` : '—'}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: p.min_level ? 'var(--text)' : 'var(--text3)' }}>{p.min_level ? `${nf(p.min_level)}` : '—'}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button onClick={() => editProduct(p)} className="btn btn-ghost btn-sm">Düzenle</button>
                  <button onClick={async () => { if (await confirmDialog({ title: 'Ürünü Sil', body: `"${p.name}" silinsin mi? (hareketi varsa silinemez)`, danger: true })) del.mutate(p.id) }} className="btn btn-danger btn-sm">Sil</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <BrandManager brands={brands} onChange={() => { qc.invalidateQueries({ queryKey: ['water-brands'] }); invalidate() }} />
    </div>
  )
}

function BrandManager({ brands, onChange }) {
  const [name, setName] = useState('')
  const create = useMutation({ mutationFn: (n) => api.post('/water/brands', { name: n }), onSuccess: () => { onChange(); setName(''); toastOk('Marka eklendi') }, onError: (e) => toastErr(errMsg(e, 'Eklenemedi')) })
  const del = useMutation({ mutationFn: (id) => api.delete(`/water/brands/${id}`), onSuccess: () => { onChange(); toastOk('Silindi') }, onError: (e) => toastErr(errMsg(e, 'Silinemedi')) })
  return (
    <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
      <div className="panel-title" style={{ marginBottom: '10px' }}>MARKALAR (TEDARİKÇİ)</div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '10px' }}>
        <div style={{ flex: 1, minWidth: '160px' }}><label className="form-label">Yeni marka</label><input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Ör. MİLA SU" onKeyDown={e => { if (e.key === 'Enter' && name.trim()) create.mutate(name.trim()) }} /></div>
        <button className="btn btn-primary" disabled={!name.trim() || create.isPending} onClick={() => create.mutate(name.trim())}>Ekle</button>
      </div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {brands.map(b => (
          <span key={b.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '999px', padding: '4px 10px', fontSize: '11px' }}>
            {b.name}
            <button onClick={async () => { if (await confirmDialog({ title: 'Markayı Sil', body: `"${b.name}" silinsin mi? (bağlı ürün varsa silinemez)`, danger: true })) del.mutate(b.id) }} style={{ border: 'none', background: 'transparent', color: 'var(--text3)', cursor: 'pointer', fontSize: '12px', lineHeight: 1 }}>✕</button>
          </span>
        ))}
        {brands.length === 0 && <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Marka yok</span>}
      </div>
    </div>
  )
}
