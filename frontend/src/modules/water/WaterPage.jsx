import { useState, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import api from '../../shared/api/client.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'

const toastOk = (m) => useToastStore.getState().addToast(m, 'success')
const toastErr = (m) => useToastStore.getState().addToast(m, 'error')
const errMsg = (e, f) => e?.response?.data?.error || f

const UNITS = [['adet', 'Adet'], ['koli', 'Koli'], ['palet', 'Palet']]
const todayStr = () => new Date().toLocaleDateString('sv-SE')
const monthStartStr = () => todayStr().slice(0, 8) + '01'
const fmtDate = (s) => s.length === 7 ? s : (() => { const d = new Date(s + 'T00:00:00'); return `${d.getDate()}/${d.getMonth() + 1}` })()
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
    const palet = Math.floor(rest / perPallet)
    parts.push(`${palet} palet`)
    rest -= palet * perPallet
  }
  if (perCase > 1 && rest >= perCase) {
    const koli = Math.floor(rest / perCase)
    parts.push(`${koli} koli`)
    rest -= koli * perCase
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
const gridKey = (zoneId, productId) => `${zoneId}:${productId}`
const parseQty = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const n = Number(String(v ?? '').replace(',', '.').trim())
  return Number.isFinite(n) ? n : 0
}
const dateObj = (s) => {
  const d = new Date(`${s}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}
const addDaysStr = (s, days) => {
  const d = dateObj(s) || dateObj(todayStr())
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('sv-SE')
}
const dayDiff = (from, to) => {
  const a = dateObj(from), b = dateObj(to)
  if (!a || !b) return 0
  return Math.floor((b - a) / 86400000)
}
const dateRange = (from, to, max = 31) => {
  const start = dateObj(from), end = dateObj(to)
  if (!start || !end || start > end) return []
  const out = []
  const d = new Date(start)
  while (d <= end && out.length < max) {
    out.push(d.toLocaleDateString('sv-SE'))
    d.setDate(d.getDate() + 1)
  }
  return out
}
const dayLabel = (s) => {
  const d = dateObj(s)
  return d ? d.toLocaleDateString('tr-TR', { weekday: 'short', day: '2-digit', month: '2-digit' }) : s
}

const TABS = [
  ['ozet', '📊 Özet'],
  ['index', '📋 INDEX'],
  ['giris', '📥 Giriş (İrsaliye)'],
  ['dagitim', '🚚 Dağıtım'],
  ['iade', '♻️ Boş İade'],
  ['bolgeler', '📍 Bölgeler'],
  ['urunler', '💧 Ürünler'],
]

export default function WaterPage() {
  const [tab, setTab] = useState('ozet')
  return (
    <div className="fade-up">
      <div className="sect"><div className="sect-title">SU TAKİP</div><div className="sect-line" /></div>
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{
              padding: '6px 14px', borderRadius: '8px', border: '1px solid var(--border)', cursor: 'pointer',
              fontSize: '12px', fontFamily: 'var(--mono)',
              background: tab === id ? 'var(--accent)' : 'var(--surface2)',
              color: tab === id ? '#000' : 'var(--text3)',
            }}>{label}</button>
        ))}
      </div>
      {tab === 'ozet' && <OzetTab />}
      {tab === 'index' && <IndexTab />}
      {tab === 'giris' && <IntakeTab />}
      {tab === 'dagitim' && <DistributeTab />}
      {tab === 'iade' && <ReturnsTab />}
      {tab === 'bolgeler' && <ZonesTab />}
      {tab === 'urunler' && <ProductsTab />}
    </div>
  )
}

// ─────────────────────────── ÖZET ───────────────────────────
function OzetTab() {
  const monthStart = monthStartStr()
  const [from, setFrom] = useState(monthStart)
  const [to, setTo] = useState(todayStr())
  const [group, setGroup] = useState('day')
  const [exporting, setExporting] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['water-summary', from, to, group],
    queryFn: () => api.get('/water/summary', { params: { from, to, group } }).then(r => r.data),
  })

  const chartData = useMemo(() => (data?.daily || []).map(d => ({
    date: fmtDate(d.move_date), Giriş: d.in_base, Dağıtım: d.out_base,
  })), [data])

  const zoneMatrix = useMemo(() => {
    const zones = {}
    ;(data?.zones || []).forEach(z => {
      if (!zones[z.zone_id]) zones[z.zone_id] = { name: z.zone_name, items: [] }
      zones[z.zone_id].items.push(z)
    })
    return Object.values(zones)
  }, [data])

  const lowItems = (data?.stock || []).filter(s => s.low)

  const exportExcel = async () => {
    setExporting(true)
    try {
      const [movements, ExcelJS] = await Promise.all([
        api.get('/water/movements', { params: { from, to } }).then(r => r.data),
        import('exceljs').then(m => m.default),
      ])
      const wb = new ExcelJS.Workbook()
      const border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
      const head = (ws, cols) => {
        ws.getRow(1).values = cols
        ws.getRow(1).eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }; c.border = border })
      }
      const s1 = wb.addWorksheet('Stok')
      head(s1, ['Ürün', 'Giriş', 'Dağıtım', 'Kalan', 'Min. Eşik', 'Durum'])
      ;(data?.stock || []).forEach(p => s1.addRow([p.name, p.total_in, p.total_out, p.balance, p.min_level || '', p.low ? 'DÜŞÜK' : 'OK']))
      s1.columns.forEach((c, i) => c.width = i === 0 ? 26 : 12)

      const s2 = wb.addWorksheet('Bölge Dağıtım')
      head(s2, ['Bölge', 'Ürün', 'Miktar (adet)', 'Paket'])
      ;(data?.zones || []).forEach(z => s2.addRow([z.zone_name, z.product_name, z.total_out, z.out_human]))
      s2.columns.forEach((c, i) => c.width = i < 2 ? 22 : 14)

      const s3 = wb.addWorksheet('Hareketler')
      head(s3, ['Tarih', 'Tip', 'Ürün', 'Bölge', 'Girilen', 'Adet', 'İrsaliye', 'Not'])
      movements.forEach(m => s3.addRow([m.move_date, m.type === 'in' ? 'Giriş' : 'Dağıtım', m.product_name, m.zone_name || '', `${m.input_qty} ${m.input_unit}`, m.qty_base, m.waybill_no || '', m.note || '']))
      s3.columns.forEach((c, i) => c.width = [12, 8, 24, 20, 12, 8, 14, 20][i])

      const buf = await wb.xlsx.writeBuffer()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      a.download = `su-takip-${from}_${to}.xlsx`
      a.click(); URL.revokeObjectURL(a.href)
    } catch { toastErr('Excel oluşturulamadı') } finally { setExporting(false) }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px' }}>
        <label style={{ fontSize: '11px', color: 'var(--text3)' }}>Aralık:</label>
        <input type="date" className="form-input" value={from} onChange={e => setFrom(e.target.value)} style={{ width: 'auto', fontSize: '12px' }} />
        <span style={{ color: 'var(--text3)' }}>—</span>
        <input type="date" className="form-input" value={to} onChange={e => setTo(e.target.value)} style={{ width: 'auto', fontSize: '12px' }} />
        <div style={{ display: 'flex', gap: '2px', background: 'var(--surface2)', borderRadius: '7px', padding: '2px', border: '1px solid var(--border)' }}>
          {[['day', 'Gün'], ['month', 'Ay']].map(([id, l]) => (
            <button key={id} onClick={() => setGroup(id)} style={{ border: 'none', borderRadius: '5px', padding: '4px 10px', fontSize: '10px', cursor: 'pointer', background: group === id ? 'var(--accent)' : 'transparent', color: group === id ? '#000' : 'var(--text3)' }}>{l}</button>
          ))}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={exportExcel} disabled={exporting} style={{ marginLeft: 'auto', fontSize: '10px' }}>
          ⬇ {exporting ? 'Hazırlanıyor…' : 'Excel İndir'}
        </button>
      </div>

      {isLoading ? <div style={{ color: 'var(--text3)', padding: '20px' }}>Yükleniyor…</div> : (
        <>
          {lowItems.length > 0 && (
            <div style={{ marginBottom: '16px', padding: '10px 14px', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.35)', borderRadius: '10px' }}>
              <div style={{ fontSize: '12px', color: 'var(--red)', fontWeight: 700, marginBottom: '4px' }}>⚠ DÜŞÜK STOK ({lowItems.length})</div>
              <div style={{ fontSize: '11px', color: 'var(--text2)' }}>
                {lowItems.map(p => `${p.name}: ${p.balance_human} (eşik ${p.min_human})`).join(' · ')}
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            {[
              ['Dönem Giriş', data?.totals.period_in, 'var(--green)'],
              ['Dönem Dağıtım', data?.totals.period_out, 'var(--accent)'],
              ['Kalan Stok (toplam)', data?.totals.balance, 'var(--teal)'],
              ['Düşük Stok Ürün', data?.totals.low_count, lowItems.length ? 'var(--red)' : 'var(--text2)'],
            ].map(([label, val, color]) => (
              <div key={label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 18px' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px' }}>{label}</div>
                <div style={{ fontFamily: 'var(--display)', fontSize: '26px', color, marginTop: '4px' }}>{nf(val)}</div>
              </div>
            ))}
          </div>

          {chartData.length > 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '10px' }}>{group === 'month' ? 'AYLIK' : 'GÜNLÜK'} GİRİŞ / DAĞITIM (adet)</div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v) => nf(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Giriş" fill="#22c55e" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Dağıtım" fill="#f0a500" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="panel" style={{ marginBottom: '16px' }}>
            <div className="panel-header"><div className="panel-title">ÜRÜN STOK DURUMU</div></div>
            <div className="panel-body" style={{ padding: 0, overflowX: 'auto' }}>
              <table className="data-table" style={{ fontSize: '12px' }}>
                <thead><tr>
                  <th>Ürün</th>
                  <th style={{ textAlign: 'right', color: 'var(--green)' }}>Giriş</th>
                  <th style={{ textAlign: 'right', color: 'var(--accent)' }}>Dağıtım</th>
                  <th style={{ textAlign: 'right', color: 'var(--teal)' }}>Kalan</th>
                  <th>Kalan (paket)</th>
                  <th>Eşik</th>
                </tr></thead>
                <tbody>
                  {(data?.stock || []).map(p => (
                    <tr key={p.product_id} style={{ background: p.low ? 'rgba(239,68,68,.06)' : undefined }}>
                      <td style={{ fontWeight: 600 }}>{p.low && <span title="Düşük stok">⚠ </span>}{p.name}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{nf(p.total_in)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{nf(p.total_out)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: p.balance < 0 ? 'var(--red)' : p.low ? 'var(--red)' : 'var(--teal)' }}>{nf(p.balance)}</td>
                      <td style={{ fontSize: '11px', color: 'var(--text3)' }}>{p.balance_human}</td>
                      <td style={{ fontSize: '10px', color: 'var(--text3)' }}>{p.min_human || '—'}</td>
                    </tr>
                  ))}
                  {(data?.stock || []).length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text3)', padding: '16px' }}>Kayıt yok</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header"><div className="panel-title">BÖLGE BAZLI DAĞITIM</div></div>
            <div className="panel-body">
              {zoneMatrix.length === 0 ? <div style={{ color: 'var(--text3)', fontSize: '12px' }}>Bu aralıkta dağıtım yok</div> : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px' }}>
                  {zoneMatrix.map(z => (
                    <div key={z.name} style={{ background: 'var(--surface2)', borderRadius: '8px', padding: '10px 12px', border: '1px solid var(--border)' }}>
                      <div style={{ fontFamily: 'var(--display)', fontSize: '13px', marginBottom: '6px' }}>📍 {z.name}</div>
                      {z.items.map(it => (
                        <div key={it.product_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '2px 0' }}>
                          <span style={{ color: 'var(--text2)' }}>{it.product_name}</span>
                          <span style={{ fontFamily: 'var(--mono)' }}>{it.out_human}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────── INDEX (firma × marka/ürün pivot) ───────────────────────────
function IndexTab() {
  const [from, setFrom] = useState(monthStartStr())
  const [to, setTo] = useState(todayStr())
  const [onlyFilled, setOnlyFilled] = useState(false)
  const [exporting, setExporting] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['water-pivot', from, to],
    queryFn: () => api.get('/water/pivot', { params: { from, to } }).then(r => r.data),
  })

  const columnsById = useMemo(() => new Map((data?.columns || []).map(c => [c.product_id, c])), [data])
  const orderedCols = useMemo(
    () => (data?.brands || []).flatMap(b => b.product_ids.map(pid => columnsById.get(pid)).filter(Boolean)),
    [data, columnsById],
  )
  const rows = useMemo(() => {
    const all = data?.rows || []
    return onlyFilled ? all.filter(r => r.total_base > 0) : all
  }, [data, onlyFilled])

  const exportExcel = async () => {
    if (!data) return
    setExporting(true)
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('INDEX')
      const border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
      const cols = orderedCols
      const totalCols = 1 + cols.length + 1 // firma + ürünler + TOPLAM

      ws.mergeCells(1, 1, 1, totalCols)
      ws.getCell(1, 1).value = `INDEX — Firma Dağıtım Matrisi (${from} … ${to})`
      ws.getCell(1, 1).font = { bold: true, size: 13 }

      // Marka grup başlığı (satır 2) + ürün başlığı (satır 3)
      ws.mergeCells(2, 1, 3, 1); ws.getCell(2, 1).value = 'FİRMA'
      let cIdx = 2
      ;(data.brands || []).forEach(b => {
        const span = b.product_ids.length
        if (span < 1) return
        ws.mergeCells(2, cIdx, 2, cIdx + span - 1)
        ws.getCell(2, cIdx).value = b.brand_name
        cIdx += span
      })
      ws.mergeCells(2, totalCols, 3, totalCols); ws.getCell(2, totalCols).value = 'TOPLAM'
      cols.forEach((c, i) => { ws.getCell(3, 2 + i).value = c.name })

      for (let r = 2; r <= 3; r++) ws.getRow(r).eachCell(c => {
        c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }
        c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
        c.border = border
      })

      let rowNo = 4
      rows.forEach(row => {
        ws.getCell(rowNo, 1).value = row.zone_name
        cols.forEach((c, i) => {
          const base = row.cells[c.product_id]?.base || 0
          ws.getCell(rowNo, 2 + i).value = base || null
        })
        ws.getCell(rowNo, totalCols).value = row.total_base || null
        ws.getRow(rowNo).eachCell({ includeEmpty: true }, c => { c.border = border })
        ws.getCell(rowNo, totalCols).font = { bold: true }
        rowNo++
      })

      // Sütun toplamları
      ws.getCell(rowNo, 1).value = 'GENEL TOPLAM'
      cols.forEach((c, i) => { ws.getCell(rowNo, 2 + i).value = data.colTotals[c.product_id]?.base || 0 })
      ws.getCell(rowNo, totalCols).value = data.grandTotal
      ws.getRow(rowNo).eachCell({ includeEmpty: true }, c => {
        c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE68A' } }; c.border = border
      })

      ws.getColumn(1).width = 26
      for (let i = 0; i < cols.length; i++) ws.getColumn(2 + i).width = 12
      ws.getColumn(totalCols).width = 12

      const buf = await wb.xlsx.writeBuffer()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      a.download = `su-index-${from}_${to}.xlsx`
      a.click(); URL.revokeObjectURL(a.href)
    } catch { toastErr('Excel oluşturulamadı') } finally { setExporting(false) }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px' }}>
        <label style={{ fontSize: '11px', color: 'var(--text3)' }}>Aralık:</label>
        <input type="date" className="form-input" value={from} onChange={e => setFrom(e.target.value)} style={{ width: 'auto', fontSize: '12px' }} />
        <span style={{ color: 'var(--text3)' }}>—</span>
        <input type="date" className="form-input" value={to} onChange={e => setTo(e.target.value)} style={{ width: 'auto', fontSize: '12px' }} />
        <label style={{ display: 'flex', gap: '5px', alignItems: 'center', fontSize: '11px', color: 'var(--text3)', cursor: 'pointer' }}>
          <input type="checkbox" checked={onlyFilled} onChange={e => setOnlyFilled(e.target.checked)} /> Sadece dolu firmalar
        </label>
        <button className="btn btn-ghost btn-sm" onClick={exportExcel} disabled={exporting || !data} style={{ marginLeft: 'auto', fontSize: '10px' }}>
          ⬇ {exporting ? 'Hazırlanıyor…' : 'INDEX Excel'}
        </button>
      </div>

      {isLoading ? <div style={{ color: 'var(--text3)', padding: '20px' }}>Yükleniyor…</div> : !orderedCols.length ? (
        <div style={{ color: 'var(--text3)', padding: '20px' }}>Ürün tanımı yok.</div>
      ) : (
        <div className="panel">
          <div className="panel-header">
            <div><div className="panel-title">INDEX — FİRMA DAĞITIM MATRİSİ</div><div className="panel-subtitle">{rows.length} firma · GENEL TOPLAM {nf(data.grandTotal)}</div></div>
          </div>
          <div className="panel-body" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="data-table" style={{ fontSize: '11px', minWidth: Math.max(640, 220 + orderedCols.length * 74) }}>
              <thead>
                <tr>
                  <th rowSpan={2} style={{ position: 'sticky', left: 0, zIndex: 3, background: 'var(--surface)', minWidth: '180px', textAlign: 'left' }}>FİRMA</th>
                  {(data.brands || []).map(b => b.product_ids.length > 0 && (
                    <th key={b.brand_id ?? 'none'} colSpan={b.product_ids.length} style={{ textAlign: 'center', borderBottom: '1px solid var(--border)', color: 'var(--accent)' }}>{b.brand_name}</th>
                  ))}
                  <th rowSpan={2} style={{ textAlign: 'right', minWidth: '74px', background: 'var(--surface2)' }}>TOPLAM</th>
                </tr>
                <tr>
                  {orderedCols.map(c => (
                    <th key={c.product_id} style={{ textAlign: 'right', minWidth: '64px', verticalAlign: 'bottom' }} title={c.brand_name + ' · ' + c.name}>{c.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.zone_id}>
                    <td style={{ position: 'sticky', left: 0, zIndex: 1, background: 'var(--surface)', fontWeight: 600, minWidth: '180px' }}>{row.zone_name}</td>
                    {orderedCols.map(c => {
                      const cell = row.cells[c.product_id]
                      return (
                        <td key={c.product_id} style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: cell ? 'var(--text)' : 'var(--text3)' }} title={cell?.human || ''}>
                          {cell ? nf(cell.base) : '·'}
                        </td>
                      )
                    })}
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: row.total_base ? 'var(--teal)' : 'var(--text3)', background: 'var(--surface2)' }}>{row.total_base ? nf(row.total_base) : '·'}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={orderedCols.length + 2} style={{ textAlign: 'center', color: 'var(--text3)', padding: '16px' }}>Bu aralıkta dağıtım yok</td></tr>}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ position: 'sticky', left: 0, zIndex: 1, background: 'var(--surface2)', fontWeight: 700 }}>GENEL TOPLAM</td>
                  {orderedCols.map(c => (
                    <td key={c.product_id} style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, background: 'var(--surface2)' }} title={data.colTotals[c.product_id]?.human || ''}>{nf(data.colTotals[c.product_id]?.base || 0)}</td>
                  ))}
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)', background: 'var(--surface2)' }}>{nf(data.grandTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────── BOŞ İADE (depozito defteri) ───────────────────────────
function ReturnsTab() {
  const qc = useQueryClient()
  const [from, setFrom] = useState(monthStartStr())
  const [to, setTo] = useState(todayStr())
  const { data: products = [] } = useQuery({ queryKey: ['water-products'], queryFn: () => api.get('/water/products').then(r => r.data) })
  const returnable = useMemo(() => products.filter(p => p.is_returnable), [products])
  const { data: deposit = [] } = useQuery({ queryKey: ['water-deposit', from, to], queryFn: () => api.get('/water/deposit', { params: { from, to } }).then(r => r.data) })
  const { data: returns = [] } = useQuery({ queryKey: ['water-returns', from, to], queryFn: () => api.get('/water/returns', { params: { from, to } }).then(r => r.data) })

  const [form, setForm] = useState({ product_id: '', input_qty: '', input_unit: 'adet', move_date: todayStr(), note: '' })
  const selectedProduct = returnable.find(p => String(p.id) === String(form.product_id))

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['water-deposit'] })
    qc.invalidateQueries({ queryKey: ['water-returns'] })
    qc.invalidateQueries({ queryKey: ['water-summary'] })
  }
  const save = useMutation({
    mutationFn: (payload) => api.post('/water/returns', payload),
    onSuccess: () => { invalidate(); toastOk('İade kaydedildi'); setForm(f => ({ ...f, input_qty: '', note: '' })) },
    onError: (e) => toastErr(errMsg(e, 'Kaydedilemedi')),
  })
  const del = useMutation({
    mutationFn: (id) => api.delete(`/water/returns/${id}`),
    onSuccess: () => { invalidate(); toastOk('Silindi') }, onError: (e) => toastErr(errMsg(e, 'Silinemedi')),
  })

  const submit = () => {
    if (!form.product_id) return toastErr('İade edilebilir ürün seçin')
    if (!(Number(form.input_qty) > 0)) return toastErr('Miktar girin')
    save.mutate({ product_id: +form.product_id, input_qty: Number(form.input_qty), input_unit: form.input_unit, move_date: form.move_date, note: form.note })
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px' }}>
        <label style={{ fontSize: '11px', color: 'var(--text3)' }}>Aralık:</label>
        <input type="date" className="form-input" value={from} onChange={e => setFrom(e.target.value)} style={{ width: 'auto', fontSize: '12px' }} />
        <span style={{ color: 'var(--text3)' }}>—</span>
        <input type="date" className="form-input" value={to} onChange={e => setTo(e.target.value)} style={{ width: 'auto', fontSize: '12px' }} />
      </div>

      {deposit.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px', marginBottom: '16px' }}>
          {deposit.map(d => (
            <div key={d.product_id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '.5px' }}>{d.brand_name ? `${d.brand_name} · ` : ''}{d.name}</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: '24px', color: d.outstanding > 0 ? 'var(--accent)' : 'var(--teal)', marginTop: '2px' }}>{nf(d.outstanding)}</div>
              <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '2px' }}>dolaşımda ({d.unit_label})</div>
              <div style={{ fontSize: '10px', color: 'var(--text2)', marginTop: '6px', display: 'flex', justifyContent: 'space-between' }}>
                <span>Giriş: {nf(d.total_in)}</span><span>İade: {nf(d.total_return)}</span>
              </div>
              <div style={{ fontSize: '10px', color: 'var(--green)', marginTop: '2px' }}>Dönem iade: {nf(d.period_return)}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px,360px) 1fr', gap: '16px', alignItems: 'start' }}>
        <div className="panel">
          <div className="panel-header"><div className="panel-title">BOŞ KAP / PALET İADESİ</div></div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {returnable.length === 0 ? (
              <div style={{ fontSize: '11px', color: 'var(--text3)' }}>İade edilebilir ürün yok. Ürünler sekmesinden bir ürünü "iade edilebilir" işaretleyin (ör. damacana, tahta palet).</div>
            ) : (<>
              <div><label className="form-label">Ürün</label>
                <select className="form-select" value={form.product_id} onChange={e => {
                  const p = returnable.find(x => String(x.id) === e.target.value)
                  setForm(f => ({ ...f, product_id: e.target.value, input_unit: defaultUnitForProduct(p) }))
                }}>
                  <option value="">Seçin…</option>
                  {returnable.map(p => <option key={p.id} value={p.id}>{p.brand_name ? `${p.brand_name} · ` : ''}{p.name}</option>)}
                </select></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div><label className="form-label">Miktar</label><input type="number" min="0" step="any" className="form-input" value={form.input_qty} onChange={e => setForm(f => ({ ...f, input_qty: e.target.value }))} /></div>
                <div><label className="form-label">Birim</label><select className="form-select" value={form.input_unit} onChange={e => setForm(f => ({ ...f, input_unit: e.target.value }))}>{unitOptionsForProduct(selectedProduct).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
              </div>
              <div><label className="form-label">Tarih</label><input type="date" className="form-input" value={form.move_date} onChange={e => setForm(f => ({ ...f, move_date: e.target.value }))} /></div>
              <div><label className="form-label">Not</label><input className="form-input" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Teslim eden, plaka, açıklama…" /></div>
              <button className="btn btn-primary" onClick={submit} disabled={save.isPending}>{save.isPending ? 'Kaydediliyor…' : 'İadeyi Kaydet'}</button>
            </>)}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header"><div className="panel-title">İADE DEFTERİ</div><div className="panel-subtitle">{returns.length}</div></div>
          <div className="panel-body" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="data-table" style={{ fontSize: '11px' }}>
              <thead><tr><th>Tarih</th><th>Marka</th><th>Ürün</th><th>Miktar</th><th>Not</th><th></th></tr></thead>
              <tbody>
                {returns.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontFamily: 'var(--mono)' }}>{r.move_date}</td>
                    <td style={{ color: 'var(--text3)' }}>{r.brand_name || '—'}</td>
                    <td>{r.product_name}</td>
                    <td style={{ fontFamily: 'var(--mono)' }}>{r.input_qty} {r.input_unit} <span style={{ color: 'var(--text3)', fontSize: '9px' }}>({r.qty_human})</span></td>
                    <td style={{ color: 'var(--text3)' }}>{r.note || '—'}</td>
                    <td style={{ textAlign: 'right' }}><button onClick={async () => { if (await confirmDialog({ title: 'İade Kaydını Sil', body: 'Silinsin mi?', danger: true })) del.mutate(r.id) }} style={{ border: 'none', background: 'transparent', color: 'var(--text3)', cursor: 'pointer' }}>✕</button></td>
                  </tr>
                ))}
                {returns.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text3)', padding: '16px' }}>Kayıt yok</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────── GİRİŞ (tek + toplu irsaliye) ───────────────────────────
function IntakeTab() {
  const qc = useQueryClient()
  const [mode, setMode] = useState('batch') // 'single' | 'batch'
  const { data: products = [] } = useQuery({ queryKey: ['water-products'], queryFn: () => api.get('/water/products').then(r => r.data) })
  const { data: movements = [] } = useQuery({ queryKey: ['water-movements', 'in'], queryFn: () => api.get('/water/movements', { params: { type: 'in' } }).then(r => r.data) })

  const [meta, setMeta] = useState({ move_date: todayStr(), waybill_no: '', note: '' })
  const emptyRow = () => ({ product_id: products[0]?.id?.toString() || '', input_qty: '', input_unit: 'palet' })
  const [rows, setRows] = useState([{ product_id: '', input_qty: '', input_unit: 'palet' }])

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['water-movements', 'in'] }); qc.invalidateQueries({ queryKey: ['water-summary'] }) }

  const saveBatch = useMutation({
    mutationFn: (payload) => api.post('/water/intake/batch', payload),
    onSuccess: (r) => { invalidate(); toastOk(`${r.data.count} satır kaydedildi`); setRows([emptyRow()]); setMeta(m => ({ ...m, waybill_no: '', note: '' })) },
    onError: (e) => toastErr(errMsg(e, 'Kaydedilemedi')),
  })
  const del = useMutation({
    mutationFn: (id) => api.delete(`/water/movements/${id}`),
    onSuccess: () => { invalidate(); toastOk('Silindi') }, onError: (e) => toastErr(errMsg(e, 'Silinemedi')),
  })

  const submitBatch = () => {
    const lines = rows.filter(r => r.product_id && Number(r.input_qty) > 0)
      .map(r => ({ product_id: +r.product_id, input_qty: Number(r.input_qty), input_unit: r.input_unit }))
    if (lines.length === 0) return toastErr('En az bir ürün satırı girin')
    saveBatch.mutate({ move_date: meta.move_date, waybill_no: meta.waybill_no, note: meta.note, lines })
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '2px', marginBottom: '12px', background: 'var(--surface2)', borderRadius: '8px', padding: '2px', border: '1px solid var(--border)', width: 'fit-content' }}>
        {[['batch', '📋 Toplu İrsaliye'], ['single', 'Tek Kalem']].map(([id, l]) => (
          <button key={id} onClick={() => setMode(id)} style={{ border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', cursor: 'pointer', background: mode === id ? 'var(--accent)' : 'transparent', color: mode === id ? '#000' : 'var(--text3)' }}>{l}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: mode === 'batch' ? '1fr' : 'minmax(280px,360px) 1fr', gap: '16px', alignItems: 'start' }}>
        {mode === 'batch' ? (
          <div className="panel">
            <div className="panel-header"><div className="panel-title">TOPLU GİRİŞ (TEK İRSALİYE)</div></div>
            <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: '8px' }}>
                <div><label className="form-label">Tarih</label><input type="date" className="form-input" value={meta.move_date} onChange={e => setMeta(m => ({ ...m, move_date: e.target.value }))} /></div>
                <div><label className="form-label">İrsaliye No</label><input className="form-input" value={meta.waybill_no} onChange={e => setMeta(m => ({ ...m, waybill_no: e.target.value }))} placeholder="IRS-2026-…" /></div>
                <div><label className="form-label">Not</label><input className="form-input" value={meta.note} onChange={e => setMeta(m => ({ ...m, note: e.target.value }))} /></div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {rows.map((r, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '6px' }}>
                    <select className="form-select" value={r.product_id} onChange={e => {
                      const p = products.find(x => String(x.id) === e.target.value)
                      setRows(rs => rs.map((x, j) => j === i ? { ...x, product_id: e.target.value, input_unit: defaultUnitForProduct(p) } : x))
                    }}>
                      <option value="">Ürün seçin…</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <input type="number" min="0" step="any" className="form-input" placeholder="Miktar" value={r.input_qty} onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, input_qty: e.target.value } : x))} />
                    <select className="form-select" value={r.input_unit} onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, input_unit: e.target.value } : x))}>
                      {unitOptionsForProduct(products.find(p => String(p.id) === String(r.product_id))).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <button onClick={() => setRows(rs => rs.length > 1 ? rs.filter((_, j) => j !== i) : rs)} style={{ border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--surface2)', color: 'var(--text3)', cursor: 'pointer', width: '32px' }}>✕</button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setRows(rs => [...rs, emptyRow()])}>+ Satır Ekle</button>
                <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={submitBatch} disabled={saveBatch.isPending}>{saveBatch.isPending ? 'Kaydediliyor…' : 'İrsaliyeyi Kaydet'}</button>
              </div>
            </div>
          </div>
        ) : (
          <SingleMovementForm kind="in" products={products} onSaved={invalidate} />
        )}

        <div className="panel" style={{ gridColumn: mode === 'batch' ? '1' : undefined }}>
          <div className="panel-header"><div className="panel-title">SON GİRİŞLER</div><div className="panel-subtitle">{movements.length}</div></div>
          <div className="panel-body" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="data-table" style={{ fontSize: '11px' }}>
              <thead><tr><th>Tarih</th><th>Ürün</th><th>Miktar</th><th>Kalan</th><th>İrsaliye</th><th></th></tr></thead>
              <tbody>
                {movements.map(m => (
                  <tr key={m.id}>
                    <td style={{ fontFamily: 'var(--mono)' }}>{m.move_date}</td>
                    <td>{m.product_name}</td>
                    <td style={{ fontFamily: 'var(--mono)' }}>{m.input_qty} {m.input_unit} <span style={{ color: 'var(--text3)', fontSize: '9px' }}>({m.qty_human})</span></td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: m.remaining_base === 0 ? 'var(--red)' : 'var(--teal)' }}>{m.remaining_human || '—'}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: '10px' }}>{m.waybill_no || '—'}</td>
                    <td style={{ textAlign: 'right' }}><button onClick={async () => { if (await confirmDialog({ title: 'Kaydı Sil', body: 'Silinsin mi?', danger: true })) del.mutate(m.id) }} style={{ border: 'none', background: 'transparent', color: 'var(--text3)', cursor: 'pointer' }}>✕</button></td>
                  </tr>
                ))}
                {movements.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text3)', padding: '16px' }}>Kayıt yok</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

// Tek kalem giriş/dağıtım formu
function SingleMovementForm({ kind, products, zones = [], onSaved }) {
  const isIn = kind === 'in'
  const [form, setForm] = useState({ product_id: '', zone_id: '', input_qty: '', input_unit: 'adet', move_date: todayStr(), waybill_no: '', note: '' })
  const selectedProduct = products.find(p => String(p.id) === String(form.product_id))
  const save = useMutation({
    mutationFn: (payload) => api.post(isIn ? '/water/intake' : '/water/distribute', payload),
    onSuccess: () => { onSaved(); toastOk('Kaydedildi'); setForm(f => ({ ...f, input_qty: '', waybill_no: '', note: '' })) },
    onError: (e) => toastErr(errMsg(e, 'Kaydedilemedi')),
  })
  const submit = () => {
    if (!form.product_id) return toastErr('Ürün seçin')
    if (!isIn && !form.zone_id) return toastErr('Bölge seçin')
    if (!(Number(form.input_qty) > 0)) return toastErr('Miktar girin')
    save.mutate({ product_id: +form.product_id, ...(isIn ? {} : { zone_id: +form.zone_id }), input_qty: Number(form.input_qty), input_unit: form.input_unit, move_date: form.move_date, waybill_no: form.waybill_no, note: form.note })
  }
  return (
    <div className="panel">
      <div className="panel-header"><div className="panel-title">{isIn ? 'TEK KALEM GİRİŞ' : 'YENİ DAĞITIM'}</div></div>
      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div><label className="form-label">Ürün</label>
          <select className="form-select" value={form.product_id} onChange={e => {
            const p = products.find(x => String(x.id) === e.target.value)
            setForm(f => ({ ...f, product_id: e.target.value, input_unit: defaultUnitForProduct(p) }))
          }}>
            <option value="">Seçin…</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></div>
        {!isIn && <div><label className="form-label">Bölge</label>
          <select className="form-select" value={form.zone_id} onChange={e => setForm(f => ({ ...f, zone_id: e.target.value }))}>
            <option value="">Seçin…</option>{zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select></div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div><label className="form-label">Miktar</label><input type="number" min="0" step="any" className="form-input" value={form.input_qty} onChange={e => setForm(f => ({ ...f, input_qty: e.target.value }))} /></div>
          <div><label className="form-label">Birim</label><select className="form-select" value={form.input_unit} onChange={e => setForm(f => ({ ...f, input_unit: e.target.value }))}>{unitOptionsForProduct(selectedProduct).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        </div>
        <div><label className="form-label">Tarih</label><input type="date" className="form-input" value={form.move_date} onChange={e => setForm(f => ({ ...f, move_date: e.target.value }))} /></div>
        {isIn && <div><label className="form-label">İrsaliye No</label><input className="form-input" value={form.waybill_no} onChange={e => setForm(f => ({ ...f, waybill_no: e.target.value }))} /></div>}
        <div><label className="form-label">Not</label><input className="form-input" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} /></div>
        <button className="btn btn-primary" onClick={submit} disabled={save.isPending}>{save.isPending ? 'Kaydediliyor…' : 'Kaydet'}</button>
      </div>
    </div>
  )
}

// ─────────────────────────── DAĞITIM (form + metinden) ───────────────────────────
function DistributeTab() {
  const qc = useQueryClient()
  const [mode, setMode] = useState('ledger') // 'ledger' | 'grid' | 'text' | 'form'
  const { data: products = [] } = useQuery({ queryKey: ['water-products'], queryFn: () => api.get('/water/products').then(r => r.data) })
  const { data: zones = [] } = useQuery({ queryKey: ['water-zones'], queryFn: () => api.get('/water/zones').then(r => r.data) })
  const { data: movements = [] } = useQuery({ queryKey: ['water-movements', 'out'], queryFn: () => api.get('/water/movements', { params: { type: 'out' } }).then(r => r.data) })
  const { data: summary } = useQuery({ queryKey: ['water-summary', 'live'], queryFn: () => api.get('/water/summary').then(r => r.data) })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['water-movements', 'out'] })
    qc.invalidateQueries({ queryKey: ['water-summary'] })
    qc.invalidateQueries({ queryKey: ['water-ledger'] })
    qc.invalidateQueries({ queryKey: ['water-zone-detail'] })
  }
  const del = useMutation({ mutationFn: (id) => api.delete(`/water/movements/${id}`), onSuccess: () => { invalidate(); toastOk('Silindi') }, onError: (e) => toastErr(errMsg(e, 'Silinemedi')) })

  return (
    <div>
      <div style={{ display: 'flex', gap: '2px', marginBottom: '12px', background: 'var(--surface2)', borderRadius: '8px', padding: '2px', border: '1px solid var(--border)', width: 'fit-content' }}>
        {[['ledger', 'Günlük Defter'], ['grid', 'Hızlı Çizelge'], ['text', '📝 Metinden'], ['form', 'Tek Kalem']].map(([id, l]) => (
          <button key={id} onClick={() => setMode(id)} style={{ border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', cursor: 'pointer', background: mode === id ? 'var(--accent)' : 'transparent', color: mode === id ? '#000' : 'var(--text3)' }}>{l}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: mode === 'form' ? 'minmax(280px,360px) 1fr' : '1fr', gap: '16px', alignItems: 'start' }}>
        {mode === 'ledger' && <DailyDistributionLedger products={products} zones={zones} stock={summary?.stock || []} onSaved={invalidate} />}
        {mode === 'grid' && <GridDistribute products={products} zones={zones} stock={summary?.stock || []} onSaved={invalidate} />}
        {mode === 'text' && <TextDistribute products={products} zones={zones} onSaved={invalidate} />}
        {mode === 'form' && <SingleMovementForm kind="out" products={products} zones={zones} onSaved={invalidate} />}

        <div className="panel">
          <div className="panel-header"><div className="panel-title">SON DAĞITIMLAR</div><div className="panel-subtitle">{movements.length}</div></div>
          <div className="panel-body" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="data-table" style={{ fontSize: '11px' }}>
              <thead><tr><th>Tarih</th><th>Bölge</th><th>Ürün</th><th>Miktar</th><th>İrsaliye</th><th></th></tr></thead>
              <tbody>
                {movements.map(m => (
                  <tr key={m.id}>
                    <td style={{ fontFamily: 'var(--mono)' }}>{m.move_date}</td>
                    <td>{m.zone_name || '—'}</td>
                    <td>{m.product_name}</td>
                    <td style={{ fontFamily: 'var(--mono)' }}>{m.input_qty} {m.input_unit} <span style={{ color: 'var(--text3)', fontSize: '9px' }}>({m.qty_human})</span></td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: m.source_waybills ? 'var(--text2)' : 'var(--text3)' }}>{m.source_waybills || '—'}</td>
                    <td style={{ textAlign: 'right' }}><button onClick={async () => { if (await confirmDialog({ title: 'Kaydı Sil', body: 'Silinsin mi?', danger: true })) del.mutate(m.id) }} style={{ border: 'none', background: 'transparent', color: 'var(--text3)', cursor: 'pointer' }}>✕</button></td>
                  </tr>
                ))}
                {movements.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text3)', padding: '16px' }}>Kayıt yok</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function DailyDistributionLedger({ products, zones, stock, onSaved }) {
  const qc = useQueryClient()
  const [from, setFrom] = useState(addDaysStr(todayStr(), -6))
  const [to, setTo] = useState(todayStr())
  const [zoneId, setZoneId] = useState('')
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [note, setNote] = useState('')
  const [cells, setCells] = useState({})
  const [productUnits, setProductUnits] = useState({})
  const [editForm, setEditForm] = useState(null)
  const inputRefs = useRef({})

  const days = useMemo(() => dateRange(from, to, 31), [from, to])
  const activeDate = days.includes(selectedDate) ? selectedDate : days[days.length - 1] || ''
  const rangeTooLong = dayDiff(from, to) >= 31
  const productById = useMemo(() => new Map(products.map(p => [String(p.id), p])), [products])
  const stockByProduct = useMemo(() => new Map(stock.map(s => [String(s.product_id), s])), [stock])
  const zoneById = useMemo(() => new Map(zones.map(z => [String(z.id), z])), [zones])
  const selectedZone = zoneById.get(String(zoneId)) || zones[0] || null
  const unitFor = (product) => productUnits[product.id] || defaultUnitForProduct(product)
  const cellKey = (date, productId) => `${date}:${productId}`

  const { data: movements = [], isLoading } = useQuery({
    queryKey: ['water-ledger', selectedZone?.id || null, from, to],
    enabled: !!selectedZone?.id && days.length > 0,
    queryFn: () => api.get('/water/movements', {
      params: { type: 'out', zone_id: selectedZone.id, from, to },
    }).then(r => r.data),
  })

  const history = useMemo(() => {
    const byCell = {}
    const byDate = {}
    const byProduct = {}
    let totalBase = 0
    movements.forEach(m => {
      const key = cellKey(m.move_date, m.product_id)
      byCell[key] = byCell[key] || { base: 0, count: 0, rows: [] }
      byCell[key].base += m.qty_base || 0
      byCell[key].count += 1
      byCell[key].rows.push(m)
      byDate[m.move_date] = byDate[m.move_date] || { base: 0, count: 0 }
      byDate[m.move_date].base += m.qty_base || 0
      byDate[m.move_date].count += 1
      byProduct[m.product_id] = byProduct[m.product_id] || { base: 0, count: 0 }
      byProduct[m.product_id].base += m.qty_base || 0
      byProduct[m.product_id].count += 1
      totalBase += m.qty_base || 0
    })
    return { byCell, byDate, byProduct, totalBase }
  }, [movements])

  const activeLines = useMemo(() => Object.entries(cells).map(([key, raw]) => {
    const [moveDate, productId] = key.split(':')
    const product = productById.get(productId)
    const qty = parseQty(raw)
    if (!selectedZone || !product || !(qty > 0)) return null
    return { move_date: moveDate, zone_id: Number(selectedZone.id), product_id: Number(productId), input_qty: qty, input_unit: unitFor(product) }
  }).filter(Boolean), [cells, productById, productUnits, selectedZone])

  const draftTotals = useMemo(() => {
    const byDate = {}
    const byProduct = {}
    let base = 0
    activeLines.forEach(line => {
      const product = productById.get(String(line.product_id))
      if (!product) return
      const baseQty = Math.round(line.input_qty * multiplier(product, line.input_unit))
      byDate[line.move_date] = (byDate[line.move_date] || 0) + baseQty
      byProduct[line.product_id] = byProduct[line.product_id] || { qty: 0, base: 0, unit: line.input_unit }
      byProduct[line.product_id].qty += line.input_qty
      byProduct[line.product_id].base += baseQty
      byProduct[line.product_id].unit = line.input_unit
      base += baseQty
    })
    return { byDate, byProduct, base }
  }, [activeLines, productById])

  const lowAfterSave = useMemo(() => stock.filter(s => {
    const after = s.balance - (draftTotals.byProduct[s.product_id]?.base || 0)
    return s.min_level > 0 && after < s.min_level
  }), [stock, draftTotals])

  const selectedDayRows = useMemo(() => movements.filter(m => m.move_date === activeDate), [movements, activeDate])

  const saveBatch = useMutation({
    mutationFn: (payload) => api.post('/water/distribute/batch', payload),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['water-ledger'] })
      onSaved()
      toastOk(`${r.data.count} günlük dağıtım kaydedildi`)
      setCells({})
      setNote('')
    },
    onError: (e) => toastErr(errMsg(e, 'Kaydedilemedi')),
  })

  const editProduct = editForm ? productById.get(String(editForm.product_id)) : null
  const updateMovement = useMutation({
    mutationFn: ({ id, payload }) => api.put(`/water/movements/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['water-ledger'] })
      onSaved()
      toastOk('Dağıtım kaydı güncellendi')
      setEditForm(null)
    },
    onError: (e) => toastErr(errMsg(e, 'Güncellenemedi')),
  })

  const updateCell = (date, productId, value) => {
    const key = cellKey(date, productId)
    setCells(prev => {
      const next = { ...prev }
      if (value === '') delete next[key]
      else next[key] = value
      return next
    })
  }

  const focusCell = (date, productId) => {
    setTimeout(() => inputRefs.current[cellKey(date, productId)]?.focus(), 0)
  }

  const handlePaste = (event, dateIndex, productIndex) => {
    const text = event.clipboardData?.getData('text')
    if (!text || (!text.includes('\t') && !text.includes('\n'))) return
    event.preventDefault()
    const pastedRows = text.trimEnd().split(/\r?\n/).map(row => row.split('\t'))
    setCells(prev => {
      const next = { ...prev }
      pastedRows.forEach((cols, rOffset) => {
        const date = days[dateIndex + rOffset]
        if (!date) return
        cols.forEach((raw, cOffset) => {
          const product = products[productIndex + cOffset]
          if (!product) return
          const val = raw.trim().replace(',', '.')
          const key = cellKey(date, product.id)
          if (val === '') delete next[key]
          else next[key] = val
        })
      })
      return next
    })
    toastOk(`${pastedRows.length} gün yapıştırıldı`)
  }

  const handleKeyDown = (event, dateIndex, productId) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    const nextIndex = event.shiftKey ? Math.max(0, dateIndex - 1) : Math.min(days.length - 1, dateIndex + 1)
    focusCell(days[nextIndex], productId)
  }

  const setPreset = (kind) => {
    if (kind === 'today') {
      setFrom(todayStr()); setTo(todayStr()); setSelectedDate(todayStr())
    } else if (kind === 'week') {
      setFrom(addDaysStr(todayStr(), -6)); setTo(todayStr()); setSelectedDate(todayStr())
    } else {
      setFrom(monthStartStr()); setTo(todayStr()); setSelectedDate(todayStr())
    }
  }

  const clearDay = (date) => setCells(prev => {
    const next = { ...prev }
    products.forEach(p => delete next[cellKey(date, p.id)])
    return next
  })

  const save = () => {
    if (!selectedZone) return toastErr('Bölge seçin')
    if (activeLines.length === 0) return toastErr('Kaydedilecek günlük dağıtım yok')
    saveBatch.mutate({ note, lines: activeLines })
  }

  const startEdit = (m) => {
    const product = productById.get(String(m.product_id))
    setEditForm({
      id: m.id,
      move_date: m.move_date,
      zone_id: m.zone_id || selectedZone?.id || '',
      product_id: m.product_id,
      input_qty: String(m.input_qty ?? ''),
      input_unit: coerceUnitForProduct(m.input_unit, product),
      note: m.note || '',
    })
  }

  const saveEdit = () => {
    if (!editForm) return
    if (!editForm.zone_id || !editForm.product_id || !(parseQty(editForm.input_qty) > 0)) return toastErr('Düzenleme alanlarını kontrol edin')
    updateMovement.mutate({
      id: editForm.id,
      payload: {
        move_date: editForm.move_date,
        zone_id: Number(editForm.zone_id),
        product_id: Number(editForm.product_id),
        input_qty: parseQty(editForm.input_qty),
        input_unit: editForm.input_unit,
        note: editForm.note,
      },
    })
  }

  return (
    <div className="panel" data-testid="water-daily-ledger">
      <div className="panel-header">
        <div>
          <div className="panel-title">GÜNLÜK DAĞITIM DEFTERİ</div>
          <div className="panel-subtitle">{selectedZone ? selectedZone.name : 'Bölge yok'} · {days.length} gün</div>
        </div>
        <div className="panel-subtitle">{activeLines.length} yeni hücre</div>
      </div>
      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1.2fr) repeat(2, minmax(130px, .8fr)) minmax(180px, 1.4fr)', gap: '8px' }}>
          <div><label className="form-label">Bölge</label><select className="form-select" value={selectedZone?.id || ''} onChange={e => setZoneId(e.target.value)}>
            {zones.length === 0 && <option value="">Bölge yok</option>}
            {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select></div>
          <div><label className="form-label">Başlangıç</label><input type="date" className="form-input" value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div><label className="form-label">Bitiş</label><input type="date" className="form-input" value={to} onChange={e => setTo(e.target.value)} /></div>
          <div><label className="form-label">Not</label><input className="form-input" value={note} onChange={e => setNote(e.target.value)} placeholder="Teslim alan, vardiya, açıklama..." /></div>
        </div>

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setPreset('today')}>Bugün</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setPreset('week')}>Son 7 Gün</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setPreset('month')}>Bu Ay</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
          {[
            ['Geçmiş Adet', history.totalBase, 'var(--teal)'],
            ['Yeni Adet', draftTotals.base, 'var(--green)'],
            ['Yeni Hücre', activeLines.length, 'var(--accent)'],
            ['Stok Uyarı', lowAfterSave.length, lowAfterSave.length ? 'var(--red)' : 'var(--text2)'],
          ].map(([label, value, color]) => (
            <div key={label} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>{label}</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: '22px', color }}>{nf(value)}</div>
            </div>
          ))}
        </div>

        {rangeTooLong && <div style={{ padding: '9px 12px', border: '1px solid var(--border)', background: 'var(--surface2)', borderRadius: '8px', fontSize: '11px', color: 'var(--text3)' }}>Aralık 31 günle sınırlandı; daha eski kayıt için başlangıç/bitişi daraltın.</div>}
        {lowAfterSave.length > 0 && <div style={{ padding: '9px 12px', border: '1px solid rgba(239,68,68,.35)', background: 'rgba(239,68,68,.08)', borderRadius: '8px', fontSize: '11px', color: 'var(--text2)' }}>Stok uyarısı: {lowAfterSave.map(p => `${p.name} (${p.balance_human})`).join(' · ')}</div>}

        {(products.length === 0 || zones.length === 0) && (
          <div style={{ padding: '9px 12px', border: '1px solid var(--border)', background: 'var(--surface2)', borderRadius: '8px', fontSize: '11px', color: 'var(--text3)' }}>
            {products.length === 0 ? 'Ürün tanımı yok. ' : ''}{zones.length === 0 ? 'Bölge tanımı yok.' : ''}
          </div>
        )}

        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
          <table className="data-table" style={{ fontSize: '11px', minWidth: Math.max(760, 170 + products.length * 190) }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, zIndex: 2, background: 'var(--surface)', minWidth: '160px' }}>Tarih</th>
                {products.map(p => {
                  const stockItem = stockByProduct.get(String(p.id))
                  return (
                    <th key={p.id} style={{ minWidth: '190px', verticalAlign: 'top' }}>
                      <div style={{ fontWeight: 700, marginBottom: '6px' }}>{p.name}</div>
                      <select className="form-select" value={unitFor(p)} onChange={e => setProductUnits(u => ({ ...u, [p.id]: e.target.value }))} style={{ fontSize: '10px', height: '28px', marginBottom: '4px' }}>
                        {unitOptionsForProduct(p).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      <div style={{ color: stockItem?.low ? 'var(--red)' : 'var(--text3)', fontSize: '10px', fontWeight: 400 }}>Stok: {stockItem?.balance_human || '—'}</div>
                    </th>
                  )
                })}
                <th style={{ textAlign: 'right', minWidth: '92px' }}>Geçmiş</th>
                <th style={{ textAlign: 'right', minWidth: '86px' }}>Yeni</th>
              </tr>
            </thead>
            <tbody>
              {days.map((date, dateIndex) => {
                const dayHistory = history.byDate[date] || { base: 0, count: 0 }
                const dayDraft = draftTotals.byDate[date] || 0
                const selected = activeDate === date
                return (
                  <tr key={date} onClick={() => setSelectedDate(date)} style={{ cursor: 'pointer', background: selected ? 'rgba(240,165,0,.10)' : undefined }}>
                    <td style={{ position: 'sticky', left: 0, zIndex: 1, background: selected ? 'rgba(240,165,0,.14)' : 'var(--surface)', minWidth: '160px', borderLeft: selected ? '3px solid var(--accent)' : '3px solid transparent' }}>
                      <div style={{ fontWeight: 700 }}>{dayLabel(date)}</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>{date}</div>
                      {dayHistory.count > 0 && <div style={{ fontSize: '10px', color: 'var(--teal)' }}>{dayHistory.count} kayıt</div>}
                    </td>
                    {products.map((p, productIndex) => {
                      const key = cellKey(date, p.id)
                      const old = history.byCell[key]
                      const draftActive = parseQty(cells[key]) > 0
                      return (
                        <td key={key} style={{ background: draftActive ? 'rgba(34,197,94,.08)' : old ? 'rgba(20,184,166,.06)' : undefined }}>
                          {old && <div style={{ color: 'var(--text3)', fontSize: '10px', marginBottom: '5px' }}>{humanQty(p, old.base)} · {old.count}</div>}
                          <input
                            ref={(el) => { if (el) inputRefs.current[key] = el }}
                            type="number"
                            min="0"
                            step="any"
                            className="form-input"
                            value={cells[key] || ''}
                            onChange={e => updateCell(date, p.id, e.target.value)}
                            onPaste={e => handlePaste(e, dateIndex, productIndex)}
                            onKeyDown={e => handleKeyDown(e, dateIndex, p.id)}
                            placeholder="0"
                            style={{ width: '100%', minWidth: '88px', textAlign: 'right', fontFamily: 'var(--mono)' }}
                          />
                        </td>
                      )
                    })}
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: dayHistory.base ? 'var(--text)' : 'var(--text3)' }}>{dayHistory.base ? nf(dayHistory.base) : '—'}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: dayDraft ? 'var(--green)' : 'var(--text3)' }}>
                      {dayDraft ? nf(dayDraft) : '—'}
                      {dayDraft > 0 && <button onClick={(e) => { e.stopPropagation(); clearDay(date) }} title="Günü temizle" style={{ marginLeft: '6px', border: 'none', background: 'transparent', color: 'var(--text3)', cursor: 'pointer' }}>✕</button>}
                    </td>
                  </tr>
                )
              })}
              {days.length === 0 && <tr><td colSpan={products.length + 3} style={{ textAlign: 'center', color: 'var(--text3)', padding: '16px' }}>Tarih aralığı seçin</td></tr>}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ position: 'sticky', left: 0, zIndex: 1, background: 'var(--surface)', fontWeight: 700 }}>TOPLAM</td>
                {products.map(p => {
                  const old = history.byProduct[p.id]?.base || 0
                  const draft = draftTotals.byProduct[p.id]
                  return (
                    <td key={p.id} style={{ fontFamily: 'var(--mono)', textAlign: 'right' }}>
                      <div style={{ color: old ? 'var(--text)' : 'var(--text3)' }}>{old ? humanQty(p, old) : '—'}</div>
                      {draft && <div style={{ color: 'var(--green)', fontSize: '10px' }}>+ {nf(draft.qty)} {draft.unit}</div>}
                    </td>
                  )
                })}
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{nf(history.totalBase)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: draftTotals.base ? 'var(--green)' : 'var(--text3)' }}>{draftTotals.base ? nf(draftTotals.base) : '—'}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setCells({})} disabled={activeLines.length === 0 || saveBatch.isPending}>Temizle</button>
          <button className="btn btn-primary" onClick={save} disabled={activeLines.length === 0 || saveBatch.isPending}>
            {saveBatch.isPending ? 'Kaydediliyor…' : `${activeLines.length} Hücreyi Kaydet`}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '12px' }}>
          <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
              <div className="panel-title">SEÇİLİ GÜN</div>
              <div className="panel-subtitle">{activeDate || '—'} · {selectedDayRows.length} kayıt</div>
            </div>
            <div style={{ maxHeight: '240px', overflow: 'auto' }}>
              <table className="data-table" style={{ fontSize: '11px' }}>
                <thead><tr><th>Ürün</th><th>Miktar</th><th>İrsaliye</th><th>Not</th><th></th></tr></thead>
                <tbody>
                  {selectedDayRows.map(m => (
                    <tr key={m.id}>
                      <td>{m.product_name}</td>
                      <td style={{ fontFamily: 'var(--mono)' }}>{m.input_qty} {m.input_unit}<div style={{ color: 'var(--text3)', fontSize: '9px' }}>{m.qty_human}</div></td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: m.source_waybills ? 'var(--text2)' : 'var(--text3)' }}>{m.source_waybills || '—'}</td>
                      <td style={{ color: 'var(--text3)' }}>{m.note || '—'}</td>
                      <td style={{ textAlign: 'right' }}><button className="btn btn-ghost btn-sm" onClick={() => startEdit(m)}>Düzenle</button></td>
                    </tr>
                  ))}
                  {!isLoading && selectedDayRows.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text3)', padding: '12px' }}>Bu gün kayıt yok</td></tr>}
                  {isLoading && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text3)', padding: '12px' }}>Yükleniyor…</td></tr>}
                </tbody>
              </table>
            </div>
            {editForm && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '12px', background: 'var(--surface2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
                  <div>
                    <div className="panel-title">KAYIT DÜZENLE</div>
                    <div className="panel-subtitle">#{editForm.id}</div>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditForm(null)}>Kapat</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
                  <div><label className="form-label">Tarih</label><input type="date" className="form-input" value={editForm.move_date} onChange={e => setEditForm(f => ({ ...f, move_date: e.target.value }))} /></div>
                  <div><label className="form-label">Bölge</label><select className="form-select" value={editForm.zone_id} onChange={e => setEditForm(f => ({ ...f, zone_id: e.target.value }))}>
                    {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                  </select></div>
                  <div><label className="form-label">Ürün</label><select className="form-select" value={editForm.product_id} onChange={e => {
                    const p = productById.get(String(e.target.value))
                    setEditForm(f => ({ ...f, product_id: e.target.value, input_unit: defaultUnitForProduct(p) }))
                  }}>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select></div>
                  <div><label className="form-label">Miktar</label><input type="number" min="0" step="any" className="form-input" value={editForm.input_qty} onChange={e => setEditForm(f => ({ ...f, input_qty: e.target.value }))} /></div>
                  <div><label className="form-label">Birim</label><select className="form-select" value={coerceUnitForProduct(editForm.input_unit, editProduct)} onChange={e => setEditForm(f => ({ ...f, input_unit: e.target.value }))}>
                    {unitOptionsForProduct(editProduct).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select></div>
                  <div style={{ gridColumn: 'span 2' }}><label className="form-label">Not</label><input className="form-input" value={editForm.note} onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))} /></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditForm(null)} disabled={updateMovement.isPending}>Vazgeç</button>
                  <button className="btn btn-primary" onClick={saveEdit} disabled={updateMovement.isPending}>{updateMovement.isPending ? 'Kaydediliyor…' : 'Güncelle'}</button>
                </div>
              </div>
            )}
          </div>

          <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
              <div className="panel-title">ARALIK ÜRÜN ÖZETİ</div>
              <div className="panel-subtitle">{from} · {to}</div>
            </div>
            <table className="data-table" style={{ fontSize: '11px' }}>
              <thead><tr><th>Ürün</th><th style={{ textAlign: 'right' }}>Geçmiş</th><th style={{ textAlign: 'right' }}>Yeni</th></tr></thead>
              <tbody>
                {products.map(p => {
                  const old = history.byProduct[p.id]?.base || 0
                  const draft = draftTotals.byProduct[p.id]
                  return (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: old ? 'var(--text)' : 'var(--text3)' }}>{old ? humanQty(p, old) : '—'}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: draft ? 'var(--green)' : 'var(--text3)' }}>{draft ? `${nf(draft.qty)} ${draft.unit}` : '—'}</td>
                    </tr>
                  )
                })}
                {products.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text3)', padding: '12px' }}>Ürün yok</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function GridDistribute({ products, zones, stock, onSaved }) {
  const [moveDate, setMoveDate] = useState(todayStr())
  const [note, setNote] = useState('')
  const [zoneSearch, setZoneSearch] = useState('')
  const [cells, setCells] = useState({})
  const [productUnits, setProductUnits] = useState({})
  const [selectedZoneId, setSelectedZoneId] = useState('')
  const [detailFrom, setDetailFrom] = useState(monthStartStr())
  const [detailTo, setDetailTo] = useState(todayStr())
  const [detailProductId, setDetailProductId] = useState('')
  const inputRefs = useRef({})

  const productById = useMemo(() => new Map(products.map(p => [String(p.id), p])), [products])
  const zoneById = useMemo(() => new Map(zones.map(z => [String(z.id), z])), [zones])
  const stockByProduct = useMemo(() => new Map(stock.map(s => [String(s.product_id), s])), [stock])

  const visibleZones = useMemo(() => {
    const q = zoneSearch.toLocaleLowerCase('tr').trim()
    if (!q) return zones
    return zones.filter(z => `${z.name} ${z.code || ''}`.toLocaleLowerCase('tr').includes(q))
  }, [zones, zoneSearch])
  const selectedZone = zoneById.get(String(selectedZoneId)) || visibleZones[0] || null

  const unitFor = (product) => productUnits[product.id] || defaultUnitForProduct(product)

  const activeLines = useMemo(() => Object.entries(cells).map(([key, raw]) => {
    const [zoneId, productId] = key.split(':')
    const product = productById.get(productId)
    const zone = zoneById.get(zoneId)
    const qty = parseQty(raw)
    if (!product || !zone || !(qty > 0)) return null
    return { zone_id: Number(zoneId), product_id: Number(productId), input_qty: qty, input_unit: unitFor(product) }
  }).filter(Boolean), [cells, productById, zoneById, productUnits])

  const totals = useMemo(() => {
    const byProduct = {}
    const zoneIds = new Set()
    let base = 0
    activeLines.forEach(line => {
      const product = productById.get(String(line.product_id))
      if (!product) return
      const baseQty = Math.round(line.input_qty * multiplier(product, line.input_unit))
      zoneIds.add(line.zone_id)
      base += baseQty
      byProduct[line.product_id] = byProduct[line.product_id] || { qty: 0, base: 0 }
      byProduct[line.product_id].qty += line.input_qty
      byProduct[line.product_id].base += baseQty
    })
    return { byProduct, zoneCount: zoneIds.size, base }
  }, [activeLines, productById])

  const lowAfterSave = useMemo(() => stock.filter(s => {
    const after = s.balance - (totals.byProduct[s.product_id]?.base || 0)
    return s.min_level > 0 && after < s.min_level
  }), [stock, totals])

  const saveBatch = useMutation({
    mutationFn: (payload) => api.post('/water/distribute/batch', payload),
    onSuccess: (r) => {
      onSaved()
      toastOk(`${r.data.count} dağıtım kaydedildi`)
      setCells({})
      setNote('')
    },
    onError: (e) => toastErr(errMsg(e, 'Kaydedilemedi')),
  })

  const { data: zoneMovements = [], isLoading: zoneDetailLoading } = useQuery({
    queryKey: ['water-zone-detail', selectedZone?.id || null, detailFrom, detailTo, detailProductId],
    enabled: !!selectedZone?.id,
    queryFn: () => api.get('/water/movements', {
      params: {
        type: 'out',
        zone_id: selectedZone.id,
        from: detailFrom || undefined,
        to: detailTo || undefined,
        product_id: detailProductId ? Number(detailProductId) : undefined,
      },
    }).then(r => r.data),
  })

  const updateCell = (zoneId, productId, value) => {
    const key = gridKey(zoneId, productId)
    setCells(prev => {
      const next = { ...prev }
      if (value === '') delete next[key]
      else next[key] = value
      return next
    })
  }

  const focusCell = (zoneId, productId) => {
    setTimeout(() => inputRefs.current[gridKey(zoneId, productId)]?.focus(), 0)
  }

  const handlePaste = (event, zoneIndex, productIndex) => {
    const text = event.clipboardData?.getData('text')
    if (!text || (!text.includes('\t') && !text.includes('\n'))) return
    event.preventDefault()
    const pastedRows = text.trimEnd().split(/\r?\n/).map(row => row.split('\t'))
    setCells(prev => {
      const next = { ...prev }
      pastedRows.forEach((cols, rOffset) => {
        const zone = visibleZones[zoneIndex + rOffset]
        if (!zone) return
        cols.forEach((raw, cOffset) => {
          const product = products[productIndex + cOffset]
          if (!product) return
          const val = raw.trim().replace(',', '.')
          const key = gridKey(zone.id, product.id)
          if (val === '') delete next[key]
          else next[key] = val
        })
      })
      return next
    })
    toastOk(`${pastedRows.length} satır yapıştırıldı`)
  }

  const handleKeyDown = (event, zoneIndex, productId) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    const nextIndex = event.shiftKey ? Math.max(0, zoneIndex - 1) : Math.min(visibleZones.length - 1, zoneIndex + 1)
    focusCell(visibleZones[nextIndex]?.id, productId)
  }

  const save = () => {
    if (!moveDate) return toastErr('Tarih seçin')
    if (activeLines.length === 0) return toastErr('Kaydedilecek dağıtım yok')
    saveBatch.mutate({ move_date: moveDate, note, lines: activeLines })
  }

  const clearRow = (zoneId) => {
    setCells(prev => {
      const next = { ...prev }
      products.forEach(p => delete next[gridKey(zoneId, p.id)])
      return next
    })
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: '16px', alignItems: 'start' }}>
      <div className="panel" data-testid="water-distribution-grid">
        <div className="panel-header">
          <div>
            <div className="panel-title">HIZLI DAĞITIM ÇİZELGESİ</div>
            <div className="panel-subtitle">Bölge x ürün hücrelerine miktar gir, tek seferde kaydet</div>
          </div>
          <div className="panel-subtitle">{activeLines.length} hücre</div>
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px' }}>
            <div><label className="form-label">Tarih</label><input type="date" className="form-input" value={moveDate} onChange={e => setMoveDate(e.target.value)} /></div>
            <div><label className="form-label">Bölge ara</label><input className="form-input" value={zoneSearch} onChange={e => setZoneSearch(e.target.value)} placeholder="Blok, yemekhane..." /></div>
            <div style={{ gridColumn: 'span 2' }}><label className="form-label">Not</label><input className="form-input" value={note} onChange={e => setNote(e.target.value)} placeholder="Vardiya, teslim alan, açıklama..." /></div>
          </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
          {[
            ['Dolu Hücre', activeLines.length, 'var(--accent)'],
            ['Bölge', totals.zoneCount, 'var(--teal)'],
            ['Toplam Adet', totals.base, 'var(--green)'],
            ['Uyarı', lowAfterSave.length, lowAfterSave.length ? 'var(--red)' : 'var(--text2)'],
          ].map(([label, value, color]) => (
            <div key={label} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '.6px' }}>{label}</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: '22px', color }}>{nf(value)}</div>
            </div>
          ))}
        </div>

        {lowAfterSave.length > 0 && (
          <div style={{ padding: '9px 12px', border: '1px solid rgba(239,68,68,.35)', background: 'rgba(239,68,68,.08)', borderRadius: '8px', fontSize: '11px', color: 'var(--text2)' }}>
            Stok uyarısı: {lowAfterSave.map(p => `${p.name} (${p.balance_human})`).join(' · ')}
          </div>
        )}

        {(products.length === 0 || zones.length === 0) && (
          <div style={{ padding: '9px 12px', border: '1px solid var(--border)', background: 'var(--surface2)', borderRadius: '8px', fontSize: '11px', color: 'var(--text3)' }}>
            {products.length === 0 ? 'Ürün tanımı yok. ' : ''}{zones.length === 0 ? 'Bölge tanımı yok; Bölgeler sekmesinden eklendiğinde satırlar burada görünecek.' : ''}
          </div>
        )}

        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
          <table className="data-table" style={{ fontSize: '11px', minWidth: Math.max(620, 190 + products.length * 150) }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, zIndex: 2, background: 'var(--surface)' }}>Bölge</th>
                {products.map(p => {
                  const stockItem = stockByProduct.get(String(p.id))
                  return (
                    <th key={p.id} style={{ minWidth: '150px', verticalAlign: 'top' }}>
                      <div style={{ fontWeight: 700, marginBottom: '6px' }}>{p.name}</div>
                      <select className="form-select" value={unitFor(p)} onChange={e => setProductUnits(u => ({ ...u, [p.id]: e.target.value }))} style={{ fontSize: '10px', height: '28px', marginBottom: '4px' }}>
                        {unitOptionsForProduct(p).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      <div style={{ color: stockItem?.low ? 'var(--red)' : 'var(--text3)', fontSize: '10px', fontWeight: 400 }}>
                        Stok: {stockItem?.balance_human || '—'}
                      </div>
                    </th>
                  )
                })}
                <th style={{ textAlign: 'right', minWidth: '86px' }}>Satır</th>
              </tr>
            </thead>
            <tbody>
              {visibleZones.map((z, zoneIndex) => {
                const rowBase = products.reduce((sum, p) => sum + Math.round(parseQty(cells[gridKey(z.id, p.id)]) * multiplier(p, unitFor(p))), 0)
                const isSelected = selectedZone?.id === z.id
                return (
                  <tr key={z.id} onClick={() => setSelectedZoneId(String(z.id))} aria-selected={isSelected} style={{ cursor: 'pointer', background: isSelected ? 'rgba(240,165,0,.10)' : undefined }}>
                    <td style={{ position: 'sticky', left: 0, zIndex: 1, background: isSelected ? 'rgba(240,165,0,.14)' : 'var(--surface)', minWidth: '180px', borderLeft: isSelected ? '3px solid var(--accent)' : '3px solid transparent' }}>
                      <div style={{ fontWeight: 700 }}>{z.name}</div>
                      <div style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: '10px' }}>{z.code || '—'}</div>
                    </td>
                    {products.map((p, productIndex) => {
                      const key = gridKey(z.id, p.id)
                      const active = parseQty(cells[key]) > 0
                      return (
                        <td key={key} style={{ background: active ? 'rgba(34,197,94,.08)' : undefined }}>
                          <input
                            ref={(el) => { if (el) inputRefs.current[key] = el }}
                            type="number"
                            min="0"
                            step="any"
                            className="form-input"
                            value={cells[key] || ''}
                            onChange={e => updateCell(z.id, p.id, e.target.value)}
                            onPaste={e => handlePaste(e, zoneIndex, productIndex)}
                            onKeyDown={e => handleKeyDown(e, zoneIndex, p.id)}
                            placeholder="0"
                            style={{ width: '100%', minWidth: '88px', textAlign: 'right', fontFamily: 'var(--mono)' }}
                          />
                        </td>
                      )
                    })}
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: rowBase ? 'var(--text)' : 'var(--text3)' }}>
                      {nf(rowBase)}
                      {rowBase > 0 && <button onClick={() => clearRow(z.id)} title="Satırı temizle" style={{ marginLeft: '6px', border: 'none', background: 'transparent', color: 'var(--text3)', cursor: 'pointer' }}>✕</button>}
                    </td>
                  </tr>
                )
              })}
              {visibleZones.length === 0 && <tr><td colSpan={products.length + 2} style={{ textAlign: 'center', color: 'var(--text3)', padding: '16px' }}>Bölge bulunamadı</td></tr>}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ position: 'sticky', left: 0, zIndex: 1, background: 'var(--surface)', fontWeight: 700 }}>TOPLAM</td>
                {products.map(p => {
                  const total = totals.byProduct[p.id]
                  return (
                    <td key={p.id} style={{ fontFamily: 'var(--mono)', textAlign: 'right', color: total ? 'var(--text)' : 'var(--text3)' }}>
                      {total ? `${nf(total.qty)} ${unitFor(p)}` : '—'}
                    </td>
                  )
                })}
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{nf(totals.base)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setCells({})} disabled={activeLines.length === 0 || saveBatch.isPending}>Temizle</button>
          <button className="btn btn-primary" onClick={save} disabled={activeLines.length === 0 || saveBatch.isPending}>
            {saveBatch.isPending ? 'Kaydediliyor…' : `${activeLines.length} Dağıtımı Kaydet`}
          </button>
        </div>
      </div>
      </div>
      <ZoneDetailPanel
        zone={selectedZone}
        products={products}
        movements={zoneMovements}
        isLoading={zoneDetailLoading}
        from={detailFrom}
        to={detailTo}
        productId={detailProductId}
        onFromChange={setDetailFrom}
        onToChange={setDetailTo}
        onProductChange={setDetailProductId}
      />
    </div>
  )
}

function ZoneDetailPanel({ zone, products, movements, isLoading, from, to, productId, onFromChange, onToChange, onProductChange }) {
  const summary = useMemo(() => {
    const byProduct = {}
    const byDate = {}
    let totalBase = 0
    movements.forEach(m => {
      totalBase += m.qty_base || 0
      byProduct[m.product_id] = byProduct[m.product_id] || { name: m.product_name, qty_base: 0, qty_human: [] }
      byProduct[m.product_id].qty_base += m.qty_base || 0
      byProduct[m.product_id].qty_human.push(m.qty_human)
      byDate[m.move_date] = byDate[m.move_date] || { move_date: m.move_date, qty_base: 0, count: 0 }
      byDate[m.move_date].qty_base += m.qty_base || 0
      byDate[m.move_date].count += 1
    })
    return {
      totalBase,
      dayCount: Object.keys(byDate).length,
      productRows: Object.values(byProduct).sort((a, b) => b.qty_base - a.qty_base),
      dateRows: Object.values(byDate).sort((a, b) => b.move_date.localeCompare(a.move_date)).slice(0, 8),
      last: movements[0] || null,
    }
  }, [movements])

  if (!zone) {
    return (
      <div className="panel" data-testid="water-zone-detail">
        <div className="panel-header"><div className="panel-title">BÖLGE DETAYI</div></div>
        <div className="panel-body" style={{ color: 'var(--text3)', fontSize: '12px' }}>Bölge yok.</div>
      </div>
    )
  }

  return (
    <div className="panel" data-testid="water-zone-detail">
      <div className="panel-header">
        <div>
          <div className="panel-title">BÖLGE DETAYI</div>
          <div className="panel-subtitle">{zone.name}{zone.code ? ` · ${zone.code}` : ''}</div>
        </div>
        <div className="panel-subtitle">{movements.length} kayıt</div>
      </div>
      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(112px, 1fr))', gap: '8px' }}>
          <div><label className="form-label">Başlangıç</label><input type="date" className="form-input" value={from} onChange={e => onFromChange(e.target.value)} /></div>
          <div><label className="form-label">Bitiş</label><input type="date" className="form-input" value={to} onChange={e => onToChange(e.target.value)} /></div>
          <div><label className="form-label">Ürün</label><select className="form-select" value={productId} onChange={e => onProductChange(e.target.value)}>
            <option value="">Tümü</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
          {[
            ['Toplam', summary.totalBase, 'var(--green)'],
            ['Gün', summary.dayCount, 'var(--teal)'],
            ['Kayıt', movements.length, 'var(--accent)'],
          ].map(([label, value, color]) => (
            <div key={label} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 10px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>{label}</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: '21px', color }}>{nf(value)}</div>
            </div>
          ))}
        </div>

        {summary.last && (
          <div style={{ border: '1px solid var(--border)', background: 'var(--surface2)', borderRadius: '8px', padding: '10px 12px' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginBottom: '4px' }}>SON TESLİMAT</div>
            <div style={{ fontSize: '12px', color: 'var(--text)' }}>{summary.last.move_date} · {summary.last.product_name}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--accent)' }}>{summary.last.input_qty} {summary.last.input_unit} ({summary.last.qty_human})</div>
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ fontSize: '11px' }}>
            <thead><tr><th>Ürün</th><th style={{ textAlign: 'right' }}>Adet</th><th>Paket</th></tr></thead>
            <tbody>
              {summary.productRows.map(p => (
                <tr key={p.name}><td>{p.name}</td><td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{nf(p.qty_base)}</td><td style={{ color: 'var(--text3)' }}>{p.qty_human.slice(0, 2).join(' + ')}</td></tr>
              ))}
              {!isLoading && summary.productRows.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text3)', padding: '12px' }}>Bu aralıkta kayıt yok</td></tr>}
              {isLoading && <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text3)', padding: '12px' }}>Yükleniyor…</td></tr>}
            </tbody>
          </table>
        </div>

        {summary.dateRows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ fontSize: '11px' }}>
              <thead><tr><th>Tarih</th><th style={{ textAlign: 'right' }}>Toplam</th><th style={{ textAlign: 'right' }}>Kalem</th></tr></thead>
              <tbody>
                {summary.dateRows.map(d => (
                  <tr key={d.move_date}><td style={{ fontFamily: 'var(--mono)' }}>{d.move_date}</td><td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{nf(d.qty_base)}</td><td style={{ textAlign: 'right' }}>{d.count}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ overflowX: 'auto', maxHeight: '260px' }}>
          <table className="data-table" style={{ fontSize: '11px' }}>
            <thead><tr><th>Tarih</th><th>Ürün</th><th>Miktar</th><th>İrsaliye</th><th>Not</th></tr></thead>
            <tbody>
              {movements.map(m => (
                <tr key={m.id}>
                  <td style={{ fontFamily: 'var(--mono)' }}>{m.move_date}</td>
                  <td>{m.product_name}</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{m.input_qty} {m.input_unit}<div style={{ color: 'var(--text3)', fontSize: '9px' }}>{m.qty_human}</div></td>
                  <td style={{ color: m.source_waybills ? 'var(--text2)' : 'var(--text3)', fontFamily: 'var(--mono)', fontSize: '10px' }}>{m.source_waybills || '—'}</td>
                  <td style={{ color: 'var(--text3)' }}>{m.note || '—'}</td>
                </tr>
              ))}
              {!isLoading && movements.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text3)', padding: '12px' }}>Kayıt yok</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
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
    <div className="panel">
      <div className="panel-header"><div className="panel-title">METİNDEN DAĞITIM</div><div className="panel-subtitle">Günlük raporu yapıştır, sistem çözümlesin</div></div>
      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {!items ? (
          <>
            <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
              Her satıra bir bölge yaz. Örnek:<br />
              <code style={{ fontSize: '10px' }}>B Blok Yemekhane 5 koli 0.5, 10 damacana</code><br />
              <code style={{ fontSize: '10px' }}>C Blok Şantiye 2 palet 0.33</code>
            </div>
            <textarea className="form-input" rows={8} value={text} onChange={e => setText(e.target.value)} placeholder="Dağıtım raporunu buraya yapıştır…" style={{ resize: 'vertical', fontFamily: 'var(--mono)', fontSize: '12px' }} />
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
                <thead><tr><th>Bölge</th><th>Ürün</th><th>Miktar</th><th>Birim</th><th></th></tr></thead>
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
    </div>
  )
}

// ─────────────────────────── BÖLGELER ───────────────────────────
function ZonesTab() {
  const qc = useQueryClient()
  const [form, setForm] = useState({ name: '', code: '', note: '' })
  const { data: zones = [] } = useQuery({ queryKey: ['water-zones'], queryFn: () => api.get('/water/zones').then(r => r.data) })
  const create = useMutation({ mutationFn: (p) => api.post('/water/zones', p), onSuccess: () => { qc.invalidateQueries({ queryKey: ['water-zones'] }); setForm({ name: '', code: '', note: '' }); toastOk('Bölge eklendi') }, onError: (e) => toastErr(errMsg(e, 'Eklenemedi')) })
  const del = useMutation({ mutationFn: (id) => api.delete(`/water/zones/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['water-zones'] }); toastOk('Silindi') }, onError: (e) => toastErr(errMsg(e, 'Silinemedi')) })
  return (
    <div style={{ maxWidth: '700px' }}>
      <div className="panel" style={{ marginBottom: '16px' }}>
        <div className="panel-header"><div className="panel-title">YENİ BÖLGE</div></div>
        <div className="panel-body" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: '160px' }}><label className="form-label">Bölge adı</label><input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ör. A Blok Yemekhane" /></div>
          <div style={{ width: '110px' }}><label className="form-label">Kod</label><input className="form-input" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} /></div>
          <div style={{ flex: 1, minWidth: '140px' }}><label className="form-label">Not</label><input className="form-input" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} /></div>
          <button className="btn btn-primary" disabled={!form.name.trim() || create.isPending} onClick={() => create.mutate({ ...form, name: form.name.trim() })}>Ekle</button>
        </div>
      </div>
      <div className="panel">
        <div className="panel-header"><div className="panel-title">BÖLGELER</div><div className="panel-subtitle">{zones.length}</div></div>
        <div className="panel-body" style={{ padding: 0 }}>
          <table className="data-table" style={{ fontSize: '12px' }}>
            <thead><tr><th>Ad</th><th>Kod</th><th>Not</th><th></th></tr></thead>
            <tbody>
              {zones.map(z => (
                <tr key={z.id}>
                  <td style={{ fontWeight: 600 }}>{z.name}</td>
                  <td style={{ fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{z.code || '—'}</td>
                  <td style={{ color: 'var(--text3)' }}>{z.note || '—'}</td>
                  <td style={{ textAlign: 'right' }}><button onClick={async () => { if (await confirmDialog({ title: 'Bölgeyi Sil', body: `"${z.name}" silinsin mi?`, danger: true })) del.mutate(z.id) }} className="btn btn-danger btn-sm">Sil</button></td>
                </tr>
              ))}
              {zones.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text3)', padding: '16px' }}>Bölge yok</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────── ÜRÜNLER (min eşik dahil, create+edit) ───────────────────────────
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
    <div style={{ maxWidth: '860px' }}>
      <div className="panel" style={{ marginBottom: '16px' }}>
        <div className="panel-header"><div className="panel-title">{form.id ? 'ÜRÜN DÜZENLE' : 'YENİ ÜRÜN'}</div>{form.id && <button className="btn btn-ghost btn-sm" onClick={() => setForm(blank)}>+ Yeni</button>}</div>
        <div className="panel-body" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: '150px' }}><label className="form-label">Ürün adı</label><input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ör. 1.5 L Şişe Su" /></div>
          <div style={{ width: '80px' }}><label className="form-label">Birim</label><input className="form-input" value={form.unit_label} onChange={e => setForm(f => ({ ...f, unit_label: e.target.value }))} /></div>
          <div style={{ minWidth: '220px' }}><label className="form-label">Paket tipi</label><div style={{ display: 'flex', gap: '2px', background: 'var(--surface2)', borderRadius: '7px', padding: '2px', border: '1px solid var(--border)' }}>
            {[['single', 'Tekil'], ['case', 'Koli'], ['pallet', 'Koli+Palet']].map(([id, label]) => (
              <button key={id} type="button" onClick={() => setPackageMode(id)} style={{ border: 'none', borderRadius: '5px', padding: '6px 9px', fontSize: '10px', cursor: 'pointer', background: packageMode === id ? 'var(--accent)' : 'transparent', color: packageMode === id ? '#000' : 'var(--text3)' }}>{label}</button>
            ))}
          </div></div>
          <div style={{ width: '80px' }}><label className="form-label">Koli/adet</label><input type="number" min="1" className="form-input" value={form.units_per_case} onChange={e => updatePackageNumber('units_per_case', e.target.value)} /></div>
          <div style={{ width: '80px' }}><label className="form-label">Palet/koli</label><input type="number" min="1" className="form-input" value={form.cases_per_pallet} onChange={e => updatePackageNumber('cases_per_pallet', e.target.value)} /></div>
          <div style={{ width: '80px' }}><label className="form-label">Min. stok</label><input type="number" min="0" className="form-input" value={form.min_qty} onChange={e => setForm(f => ({ ...f, min_qty: e.target.value }))} /></div>
          <div style={{ width: '80px' }}><label className="form-label">Min. birim</label><select className="form-select" value={coerceUnitForProduct(form.min_unit, formPackage)} onChange={e => setForm(f => ({ ...f, min_unit: e.target.value }))}>{formUnitOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div style={{ minWidth: '130px' }}><label className="form-label">Marka</label><select className="form-select" value={form.brand_id} onChange={e => setForm(f => ({ ...f, brand_id: e.target.value }))}>
            <option value="">Markasız</option>{brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select></div>
          <label style={{ display: 'flex', gap: '5px', alignItems: 'center', fontSize: '11px', color: 'var(--text2)', cursor: 'pointer', paddingBottom: '9px' }} title="Boş kap iade takibi (depozito) bu ürün için açılır">
            <input type="checkbox" checked={form.is_returnable} onChange={e => setForm(f => ({ ...f, is_returnable: e.target.checked }))} /> İade edilebilir
          </label>
          <button className="btn btn-primary" disabled={!form.name.trim() || create.isPending || update.isPending} onClick={() => form.id ? update.mutate() : create.mutate()}>{form.id ? 'Güncelle' : 'Ekle'}</button>
        </div>
        <div style={{ padding: '0 16px 12px', fontSize: '10px', color: 'var(--text3)' }}>Tekil = sadece adet; Koli = adet+koli; Koli+Palet = adet+koli+palet. Min. stok 0 = uyarı kapalı. "İade edilebilir" = damacana/tahta palet gibi boş dönüşü takip edilen kaplar.</div>
      </div>

      <BrandManager brands={brands} onChange={() => { qc.invalidateQueries({ queryKey: ['water-brands'] }); invalidate() }} />

      <div className="panel">
        <div className="panel-header"><div className="panel-title">ÜRÜNLER</div><div className="panel-subtitle">{products.length}</div></div>
        <div className="panel-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="data-table" style={{ fontSize: '12px' }}>
            <thead><tr><th>Ad</th><th>Marka</th><th>Birimler</th><th style={{ textAlign: 'right' }}>1 Koli</th><th style={{ textAlign: 'right' }}>1 Palet</th><th style={{ textAlign: 'right' }}>Min. eşik</th><th></th></tr></thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id} style={{ opacity: p.is_active ? 1 : 0.5 }}>
                  <td style={{ fontWeight: 600 }}>{p.name} {p.is_returnable ? <span title="İade edilebilir (depozito)" style={{ fontSize: '10px', color: 'var(--teal)' }}>♻️</span> : null}</td>
                  <td style={{ color: 'var(--text3)' }}>{p.brand_name || '—'}</td>
                  <td style={{ color: 'var(--text3)' }}>{unitOptionsForProduct(p).map(([, label]) => label).join(' / ')}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{p.units_per_case > 1 ? `${p.units_per_case} ${p.unit_label}` : '—'}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{p.units_per_case > 1 && p.cases_per_pallet > 1 ? `${p.units_per_case * p.cases_per_pallet} ${p.unit_label}` : '—'}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: p.min_level ? 'var(--text)' : 'var(--text3)' }}>{p.min_level ? `${nf(p.min_level)} ${p.unit_label}` : '—'}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => editProduct(p)} className="btn btn-ghost btn-sm">Düzenle</button>
                    <button onClick={async () => { if (await confirmDialog({ title: 'Ürünü Sil', body: `"${p.name}" silinsin mi? (hareketi varsa silinemez)`, danger: true })) del.mutate(p.id) }} className="btn btn-danger btn-sm">Sil</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// Kompakt marka (tedarikçi) yönetimi — Ürünler sekmesi altında
function BrandManager({ brands, onChange }) {
  const [name, setName] = useState('')
  const create = useMutation({ mutationFn: (n) => api.post('/water/brands', { name: n }), onSuccess: () => { onChange(); setName(''); toastOk('Marka eklendi') }, onError: (e) => toastErr(errMsg(e, 'Eklenemedi')) })
  const del = useMutation({ mutationFn: (id) => api.delete(`/water/brands/${id}`), onSuccess: () => { onChange(); toastOk('Silindi') }, onError: (e) => toastErr(errMsg(e, 'Silinemedi')) })
  return (
    <div className="panel" style={{ marginTop: '16px' }}>
      <div className="panel-header"><div className="panel-title">MARKALAR (TEDARİKÇİ)</div><div className="panel-subtitle">{brands.length}</div></div>
      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
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
    </div>
  )
}
