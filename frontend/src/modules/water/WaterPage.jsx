import { useState, useMemo, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import { useAuthStore } from '../../shared/store/authStore.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import WaterQueryErrorCenter from './components/WaterQueryErrorCenter.jsx'

const toastOk = (m) => useToastStore.getState().addToast(m, 'success')
const toastErr = (m) => useToastStore.getState().addToast(m, 'error')
const errMsg = (e, f) => e?.response?.data?.error || f

const UNITS = [['adet', 'Adet'], ['koli', 'Koli'], ['paket', 'Paket'], ['palet', 'Palet']]
const BASE_UNITS = new Set(['adet', 'koli', 'paket', 'palet'])
const todayStr = () => new Date().toLocaleDateString('sv-SE')
const nf = (n) => new Intl.NumberFormat('tr-TR').format(n || 0)
const normUnit = (u) => String(u || 'adet').toLocaleLowerCase('tr').trim()
const baseUnitForProduct = (p) => {
  const unit = normUnit(p?.unit_label)
  return BASE_UNITS.has(unit) ? unit : 'adet'
}
const multiplier = (p, unit) => {
  const baseUnit = baseUnitForProduct(p)
  const perCase = Math.max(1, Number(p?.units_per_case || 1))
  const perPallet = Math.max(1, Number(p?.cases_per_pallet || 1))
  if (unit === 'adet') return 1
  if (unit === 'koli') return baseUnit === 'koli' ? 1 : perCase
  if (unit === 'paket') return baseUnit === 'paket' ? 1 : 1
  if (unit === 'palet') {
    if (baseUnit === 'palet') return 1
    if (baseUnit === 'koli' || baseUnit === 'paket') return perPallet
    return perCase * perPallet
  }
  return 1
}
const humanQty = (p, base) => {
  const label = p?.unit_label || 'adet'
  const sign = Number(base) < 0 ? '-' : ''
  let rest = Math.abs(Math.round(base || 0))
  if (rest === 0) return `0 ${label}`
  const parts = []
  const perCase = Math.max(1, Number(p?.units_per_case || 1))
  const casesPerPallet = Math.max(1, Number(p?.cases_per_pallet || 1))
  const baseUnit = baseUnitForProduct(p)
  const perPallet = baseUnit === 'palet' ? 1 : (baseUnit === 'koli' || baseUnit === 'paket') ? casesPerPallet : perCase * casesPerPallet
  if (perPallet > 1 && rest >= perPallet) {
    const palet = Math.floor(rest / perPallet); parts.push(`${palet} palet`); rest -= palet * perPallet
  }
  if (baseUnit === 'adet' && perCase > 1 && rest >= perCase) {
    const koli = Math.floor(rest / perCase); parts.push(`${koli} koli`); rest -= koli * perCase
  }
  if (rest > 0) parts.push(`${rest} ${label}`)
  return sign ? `-${parts.join(' ')}` : parts.join(' ')
}
const defaultUnitForProduct = (p) => {
  const baseUnit = baseUnitForProduct(p)
  if (baseUnit === 'koli' || baseUnit === 'paket') return baseUnit
  if ((p?.units_per_case || 1) > 1) return 'koli'
  return 'adet'
}
const availableUnitsForProduct = (p) => {
  const baseUnit = baseUnitForProduct(p)
  const upc = Math.max(1, Number(p?.units_per_case || 1))
  const cpp = Math.max(1, Number(p?.cases_per_pallet || 1))
  const units = []
  if (baseUnit === 'koli') units.push('koli')
  else if (baseUnit === 'paket') units.push('paket')
  else if (baseUnit === 'palet') units.push('palet')
  else units.push('adet')
  if (baseUnit === 'koli' || (baseUnit === 'adet' && upc > 1)) units.push('koli')
  if (baseUnit === 'paket') units.push('paket')
  if (baseUnit !== 'palet' && cpp > 1) units.push('palet')
  return [...new Set(units)]
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
const unitLabel = (unit) => UNITS.find(([v]) => v === unit)?.[1] || unit || 'Adet'
const productInputUnit = (product, unitMap = {}) => {
  const pid = product?.product_id || product?.id
  return coerceUnitForProduct(unitMap[pid] || defaultUnitForProduct(product), product)
}
const unitFromToken = (token) => {
  const t = normUnit(token).replace(/\./g, '')
  if (!t) return null
  if (['p', 'pl', 'plt', 'pal', 'palet', 'pallet'].includes(t)) return 'palet'
  if (['pk', 'pkt', 'pak', 'paket'].includes(t)) return 'paket'
  if (['k', 'kl', 'kol', 'koli'].includes(t)) return 'koli'
  if (['a', 'ad', 'adet', 'tane'].includes(t)) return 'adet'
  return null
}
const smartQty = (raw, product, fallbackUnit) => {
  const text = String(raw ?? '').trim()
  const fallback = coerceUnitForProduct(fallbackUnit, product)
  if (!text) return { input_qty: 0, input_unit: fallback, base: 0, valid: false }
  const normalized = text.replace(',', '.').toLocaleLowerCase('tr')
  const match = normalized.match(/^([0-9]+(?:\.[0-9]+)?)\s*([a-zçğıöşü.]+)?$/i)
  const qty = match ? Number(match[1]) : parseQty(text)
  const tokenUnit = match ? unitFromToken(match[2]) : null
  const wantedUnit = tokenUnit || fallback
  const available = availableUnitsForProduct(product)
  if (tokenUnit && !available.includes(tokenUnit)) {
    return { input_qty: qty || 0, input_unit: tokenUnit, base: 0, valid: false, tokenUnit }
  }
  const unit = available.includes(wantedUnit) ? wantedUnit : fallback
  const base = Number.isFinite(qty) && qty > 0 ? Math.round(qty * multiplier(product, unit)) : 0
  return { input_qty: qty, input_unit: unit, base, valid: base > 0, tokenUnit }
}
const calcText = (product, parsed) => {
  if (!parsed?.valid) return ''
  const baseLabel = product?.unit_label || 'adet'
  return `${nf(parsed.input_qty)} ${unitLabel(parsed.input_unit)} = ${nf(parsed.base)} ${baseLabel}`
}

const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const pad2 = (n) => String(n).padStart(2, '0')
const monthBounds = (y, m) => {
  const last = new Date(y, m, 0).getDate()
  return { from: `${y}-${pad2(m)}-01`, to: `${y}-${pad2(m)}-${pad2(last)}`, label: `${MONTHS_TR[m - 1]} ${y}` }
}
const isoDate = (d) => d.toLocaleDateString('sv-SE')
const dateRange = (from, to) => {
  if (!from || !to) return []
  const out = []
  const d = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T00:00:00`)
  while (d <= end) {
    out.push(isoDate(d))
    d.setDate(d.getDate() + 1)
  }
  return out
}
const dayShort = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('tr-TR', { weekday: 'short' })
const dayLong = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('tr-TR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
const movementTime = (value) => {
  if (!value) return ''
  const d = new Date(String(value).replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}
const shiftIsoDay = (iso, delta) => {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + delta)
  return isoDate(d)
}
const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`
const downloadCsv = (filename, headers, rows) => {
  const csv = [headers, ...rows].map(row => row.map(csvCell).join(';')).join('\n')
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
const cellKey = (zoneId, productId) => `${zoneId}:${productId}`
const brandKey = (id) => id == null ? 'null' : String(id)

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
  const isManager = useAuthStore(s => s.user?.role === 'campus_manager')
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 })
  const [modal, setModal] = useState(null) // 'settings' | 'text' | 'adjust' | null
  const [truckFocus, setTruckFocus] = useState({ seq: 0, mode: 'new' })
  const { from, to, label } = monthBounds(ym.y, ym.m)

  const summaryQuery = useQuery({
    queryKey: ['water-summary', from, to],
    queryFn: () => api.get('/water/summary', { params: { from, to } }).then(r => r.data),
  })
  const summary = summaryQuery.data

  const shiftMonth = (delta) => setYm(({ y, m }) => {
    const idx = (y * 12 + (m - 1)) + delta
    return { y: Math.floor(idx / 12), m: (idx % 12) + 1 }
  })
  const t = summary?.totals

  return (
    <div className="fade-up">
      <div className="sect"><div className="sect-title">SU TAKİP</div><div className="sect-line" /></div>

      <WaterQueryErrorCenter />

      <AlertBand />

      <ReviewPanel />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '9px', padding: '3px 4px' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => shiftMonth(-1)} style={{ padding: '4px 8px' }}>‹</button>
          <span style={{ fontFamily: 'var(--mono)', fontSize: '13px', minWidth: '120px', textAlign: 'center', fontWeight: 600 }}>{label}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => shiftMonth(1)} style={{ padding: '4px 8px' }}>›</button>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setModal('text')}>📝 Metinden</button>
          {isManager && <button className="btn btn-ghost btn-sm" onClick={() => setModal('adjust')}>🛠 Düzeltme</button>}
          <button className="btn btn-ghost btn-sm" onClick={() => setModal('settings')}>⚙ Ayarlar</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', alignItems: 'center', marginBottom: '16px', borderTop: '1px solid color-mix(in srgb, var(--teal) 45%, var(--border))', borderRight: '1px solid color-mix(in srgb, var(--teal) 45%, var(--border))', borderBottom: '1px solid color-mix(in srgb, var(--teal) 45%, var(--border))', borderLeft: '5px solid var(--teal)', borderRadius: '8px', background: 'color-mix(in srgb, var(--teal) 7%, var(--surface))', padding: '12px 14px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', gap: '7px', alignItems: 'center', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: '13px' }}>PERSONEL / TIR GİRİŞİ VE MAİL DOSYASI</strong>
            <span className="badge badge-green">PDF</span>
            <span className="badge badge-blue">EXCEL</span>
            <span className="badge badge-amber">PNG</span>
          </div>
          <div style={{ color: 'var(--text2)', fontSize: '11px', marginTop: '4px' }}>Tırcı bilgilerini gir, ana merkez mailini hazırla ve aynı kaydı üç formatta indir.</div>
        </div>
        <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary btn-sm" onClick={() => setTruckFocus({ seq: Date.now(), mode: 'new' })}>Yeni Giriş Hazırla</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setTruckFocus({ seq: Date.now(), mode: 'records' })}>Kayıt ve Çıktılar</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        {[
          ['Ay Dağıtım', t?.period_out, 'var(--accent)'],
          ['Gelen (Tır)', t?.period_in, 'var(--green)'],
          ['Ay Farkı', t?.period_net, (t?.period_net || 0) < 0 ? 'var(--red)' : 'var(--teal)'],
          ['Kalan Stok', t?.balance, (t?.balance || 0) < 0 ? 'var(--red)' : 'var(--teal)'],
          ['Eksi Stok', t?.deficit_total, (t?.deficit_total || 0) > 0 ? 'var(--red)' : 'var(--text3)'],
          ['Boş İade', t?.period_return, 'var(--text)'],
        ].map(([lbl, val, color]) => (
          <div key={lbl} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 16px' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px' }}>{lbl}</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: '24px', color, marginTop: '2px' }}>{summaryQuery.isError ? '—' : nf(val)}</div>
          </div>
        ))}
      </div>

      <WaterBoard from={from} to={to} label={label} lowItems={(summary?.stock || []).filter(s => s.low)} />

      <ForecastPanel />

      <PendingWaybillPanel />

      <TruckArrivalPanel from={from} to={to} label={label} focusRequest={truckFocus} />

      <MonthClosurePanel month={`${ym.y}-${String(ym.m).padStart(2, '0')}`} label={label} />

      <MonthlyReportPanel summary={summary} from={from} to={to} label={label} />

      <TrendPanel />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', marginTop: '16px' }}>
        <GelenTirPanel from={from} to={to} label={label} stockItems={summary?.stock || []} />
        <BosIadePanel from={from} to={to} deposit={summary?.deposit || []} />
      </div>

      {modal === 'settings' && <SettingsModal onClose={() => setModal(null)} />}
      {modal === 'text' && <TextModal onClose={() => setModal(null)} />}
      {modal === 'adjust' && <AdjustModal onClose={() => setModal(null)} />}
    </div>
  )
}

// ─────────────────────────── Operasyon Uyarı Merkezi ("Bugün Yapılacaklar") ───────────────────────────
function AlertBand() {
  const [open, setOpen] = useState(null) // hangi kategori açık
  const today = todayStr()
  const { data } = useQuery({
    queryKey: ['water-alerts', today],
    queryFn: () => api.get('/water/alerts', { params: { today } }).then(r => r.data),
    refetchInterval: 60000,
  })

  const s = data?.summary
  if (!data) return null
  if (!s || s.total === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px',
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 14px' }}>
        <span style={{ color: 'var(--green)', fontSize: '15px' }}>✓</span>
        <span style={{ fontSize: '13px', color: 'var(--text2)' }}>Bugün için bekleyen operasyon işi yok — her şey güncel.</span>
      </div>
    )
  }

  const CARDS = [
    { key: 'pending', icon: '🧾', label: 'İrsaliye Bekleyen', count: s.pending, color: 'var(--accent)', items: data.pending_waybill,
      render: (it) => `${it.product_name} — ${it.unallocated_human} (${it.count} kayıt, ${it.waiting_days} gün)` },
    { key: 'negative', icon: '⚠️', label: 'Eksi Stok', count: s.negative, color: 'var(--red)', items: data.negative_stock,
      render: (it) => `${it.product_name} — ${it.balance_human}` },
    { key: 'over', icon: '📉', label: 'Ay Dağıtım > Gelen', count: s.over, color: 'var(--red)', items: data.over_distributed,
      render: (it) => `${it.product_name} — dağıtılan ${it.period_out_human}, gelen ${it.period_in_human} (fazla ${it.diff_human})` },
    { key: 'low', icon: '🔽', label: 'Düşük Stok', count: s.low, color: 'var(--amber, #d97706)', items: data.low_stock,
      render: (it) => `${it.product_name} — kalan ${it.balance_human} (eşik ${it.min_human})` },
    { key: 'idle', icon: '🕳', label: 'Bugün Kayıtsız Bölge', count: s.idle_zones, color: 'var(--text3)', items: data.idle_zones,
      render: (it) => it.zone_name },
  ].filter(c => c.count > 0)

  const active = CARDS.find(c => c.key === open)

  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '1px', color: 'var(--text3)' }}>BUGÜN YAPILACAKLAR</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>· {data.date}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' }}>
        {CARDS.map(c => {
          const isOpen = open === c.key
          return (
            <button key={c.key} onClick={() => setOpen(isOpen ? null : c.key)}
              style={{ textAlign: 'left', cursor: 'pointer', background: isOpen ? 'var(--surface2)' : 'var(--surface)',
                border: `1px solid ${isOpen ? c.color : 'var(--border)'}`, borderLeft: `3px solid ${c.color}`,
                borderRadius: '10px', padding: '10px 12px', transition: 'border-color .15s' }}
              title="Detayı aç/kapat">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '14px' }}>{c.icon}</span>
                <span style={{ fontFamily: 'var(--display)', fontSize: '22px', color: c.color }}>{c.count}</span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '2px' }}>{c.label}</div>
            </button>
          )
        })}
      </div>
      {active && (
        <div style={{ marginTop: '10px', background: 'var(--surface)', border: `1px solid var(--border)`,
          borderLeft: `3px solid ${active.color}`, borderRadius: '10px', padding: '10px 14px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text2)', marginBottom: '6px' }}>
            {active.icon} {active.label} ({active.count})
          </div>
          <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {active.items.map((it, i) => (
              <li key={it.product_id ?? it.zone_id ?? i} style={{ fontSize: '12px', color: 'var(--text)', fontFamily: 'var(--mono)' }}>
                {active.render(it)}
              </li>
            ))}
          </ul>
        </div>
      )}
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
  const [productUnits, setProductUnits] = useState({})
  const [selectedZone, setSelectedZone] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [zoneFilter, setZoneFilter] = useState('')
  const [brandFilter, setBrandFilter] = useState('all')
  const [zoneSort, setZoneSort] = useState('total_desc')
  const [zoneActivity, setZoneActivity] = useState('all')
  const inputRefs = useRef({})

  const pivotQuery = useQuery({
    queryKey: ['water-pivot', from, to],
    queryFn: () => api.get('/water/pivot', { params: { from, to } }).then(r => r.data),
  })
  const { data: pivot, isLoading } = pivotQuery
  const { data: dayRows = [] } = useQuery({
    queryKey: ['water-day', day],
    queryFn: () => api.get('/water/movements', { params: { type: 'out', from: day, to: day } }).then(r => r.data),
  })

  const { data: templates = [] } = useQuery({
    queryKey: ['water-templates'],
    queryFn: () => api.get('/water/templates').then(r => r.data),
  })

  const columnsById = useMemo(() => new Map((pivot?.columns || []).map(c => [c.product_id, c])), [pivot])
  const brandColor = useMemo(() => {
    const map = new Map()
    ;(pivot?.brands || []).forEach((b, i) => map.set(brandKey(b.brand_id), b.color ? { bg: `${b.color}18`, fg: b.color } : BRAND_TINT[i % BRAND_TINT.length]))
    return map
  }, [pivot])
  const orderedCols = useMemo(
    () => (pivot?.brands || []).flatMap(b => b.product_ids.map(pid => columnsById.get(pid)).filter(Boolean)),
    [pivot, columnsById],
  )
  const visibleBrandGroups = useMemo(() => (pivot?.brands || [])
    .filter(b => brandFilter === 'all' || brandKey(b.brand_id) === brandFilter)
    .map(b => ({ ...b, product_ids: b.product_ids.map(pid => columnsById.get(pid)).filter(Boolean).map(p => p.product_id) }))
    .filter(b => b.product_ids.length > 0), [pivot, columnsById, brandFilter])
  const visibleCols = useMemo(
    () => visibleBrandGroups.flatMap(b => b.product_ids.map(pid => columnsById.get(pid)).filter(Boolean)),
    [visibleBrandGroups, columnsById],
  )
  const zones = pivot?.rows || []

  // O gün zaten girilmiş dağıtım (mükerrer girişi görmek için)
  const dayMap = useMemo(() => {
    const m = {}
    dayRows.forEach(r => { const k = cellKey(r.zone_id, r.product_id); m[k] = (m[k] || 0) + (r.qty_base || 0) })
    return m
  }, [dayRows])

  // Taslak (yazılan) miktarlar — matris girişi her zaman base birim (adet/şişe) = Excel ham sayısı
  const inputUnitFor = (product) => productInputUnit(product, productUnits)

  const draft = useMemo(() => {
    const byCell = {}, byZone = {}, byProduct = {}
    let total = 0
    Object.entries(cells).forEach(([k, raw]) => {
      const [z, p] = k.split(':')
      const product = columnsById.get(+p)
      const parsed = smartQty(raw, product, inputUnitFor(product))
      if (!parsed.valid) return
      byCell[k] = parsed; byZone[z] = (byZone[z] || 0) + parsed.base; byProduct[p] = (byProduct[p] || 0) + parsed.base; total += parsed.base
    })
    return { byCell, byZone, byProduct, total, count: Object.keys(byCell).length }
  }, [cells, columnsById, productUnits])

  const brandStats = useMemo(() => (pivot?.brands || []).map(b => {
    const ids = b.product_ids || []
    const total = zones.reduce((sum, row) => sum + ids.reduce((s, pid) => s + (row.cells?.[pid]?.base || 0), 0), 0)
    const today = zones.reduce((sum, row) => sum + ids.reduce((s, pid) => s + (dayMap[cellKey(row.zone_id, pid)] || 0), 0), 0)
    const draftTotal = ids.reduce((sum, pid) => sum + (draft.byProduct[pid] || 0), 0)
    return { ...b, key: brandKey(b.brand_id), total, today, draftTotal, productCount: ids.length }
  }), [pivot, zones, dayMap, draft])

  const visibleZoneRows = useMemo(() => {
    const needle = zoneFilter.trim().toLocaleLowerCase('tr')
    const rows = zones.map((row, index) => {
      const visibleBase = visibleCols.reduce((sum, c) => sum + (row.cells?.[c.product_id]?.base || 0), 0)
      const visibleDay = visibleCols.reduce((sum, c) => sum + (dayMap[cellKey(row.zone_id, c.product_id)] || 0), 0)
      const visibleDraft = visibleCols.reduce((sum, c) => sum + (draft.byCell[cellKey(row.zone_id, c.product_id)]?.base || 0), 0)
      return { ...row, _index: index, visible_base: visibleBase, visible_day: visibleDay, visible_draft: visibleDraft }
    }).filter(row => {
      if (needle && !String(row.zone_name || '').toLocaleLowerCase('tr').includes(needle)) return false
      if (zoneActivity === 'with_month') return row.visible_base > 0
      if (zoneActivity === 'with_day') return row.visible_day > 0
      if (zoneActivity === 'with_draft') return row.visible_draft > 0
      if (zoneActivity === 'empty') return row.visible_base === 0 && row.visible_day === 0 && row.visible_draft === 0
      return true
    })
    const byName = (a, b) => String(a.zone_name || '').localeCompare(String(b.zone_name || ''), 'tr')
    rows.sort((a, b) => {
      if (zoneSort === 'name_asc') return byName(a, b)
      if (zoneSort === 'name_desc') return byName(b, a)
      if (zoneSort === 'total_asc') return (a.visible_base - b.visible_base) || byName(a, b)
      if (zoneSort === 'day_desc') return (b.visible_day - a.visible_day) || byName(a, b)
      if (zoneSort === 'draft_desc') return (b.visible_draft - a.visible_draft) || byName(a, b)
      return (b.visible_base - a.visible_base) || byName(a, b)
    })
    return rows
  }, [zones, visibleCols, dayMap, draft, zoneFilter, zoneSort, zoneActivity])

  const visibleTotals = useMemo(() => {
    const byProduct = {}
    let month = 0, today = 0, draftTotal = 0
    visibleCols.forEach(c => { byProduct[c.product_id] = { month: 0, today: 0, draft: 0 } })
    visibleZoneRows.forEach(row => {
      month += row.visible_base || 0
      today += row.visible_day || 0
      draftTotal += row.visible_draft || 0
      visibleCols.forEach(c => {
        const bucket = byProduct[c.product_id]
        bucket.month += row.cells?.[c.product_id]?.base || 0
        bucket.today += dayMap[cellKey(row.zone_id, c.product_id)] || 0
        bucket.draft += draft.byCell[cellKey(row.zone_id, c.product_id)]?.base || 0
      })
    })
    return { byProduct, month, today, draft: draftTotal }
  }, [visibleCols, visibleZoneRows, dayMap, draft])

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
    if (String(value ?? '').trim() === '') delete next[k]; else next[k] = value
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
        const zone = visibleZoneRows[zoneIdx + ro]; if (!zone) return
        cols.forEach((raw, co) => {
          const col = visibleCols[prodIdx + co]; if (!col) return
          const val = raw.trim().replace(',', '.'); const k = cellKey(zone.zone_id, col.product_id)
          if (val === '') delete next[k]; else next[k] = val
        })
      })
      return next
    })
    toastOk(`${rows.length} satır yapıştırıldı`)
  }

  const save = () => {
    const lines = Object.entries(draft.byCell).map(([k, parsed]) => {
      const [zone_id, product_id] = k.split(':')
      return { zone_id: +zone_id, product_id: +product_id, input_qty: parsed.input_qty, input_unit: parsed.input_unit }
    })
    if (lines.length === 0) return toastErr('Önce hücrelere miktar girin')
    saveBatch.mutate(lines)
  }

  const setAllInputUnits = (unit) => {
    if (unit === 'default') { setProductUnits({}); return }
    const next = {}
    orderedCols.forEach(c => { next[c.product_id] = coerceUnitForProduct(unit, c) })
    setProductUnits(next)
  }

  // Şablon uygula: hücreleri varsayılan miktarla doldur + ürün birimini şablona ayarla
  const applyTemplate = (tplId) => {
    const tpl = templates.find(t => t.id === +tplId)
    if (!tpl) return
    setProductUnits(prev => {
      const next = { ...prev }
      tpl.lines.forEach(l => { next[l.product_id] = coerceUnitForProduct(l.default_unit, columnsById.get(l.product_id) || {}) })
      return next
    })
    setCells(prev => {
      const next = { ...prev }
      tpl.lines.forEach(l => { if (l.default_qty != null) next[cellKey(l.zone_id, l.product_id)] = String(l.default_qty) })
      return next
    })
    const filled = tpl.lines.filter(l => l.default_qty != null).length
    toastOk(`"${tpl.name}" uygulandı — ${filled}/${tpl.lines.length} hücre dolduruldu`)
  }

  const exportExcelLegacy = async () => {
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
      ws.mergeCells(2, 1, 3, 1); ws.getCell(2, 1).value = 'DAĞITIM YERİ'
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

  const exportExcel = async () => {
    if (!pivot) return
    setExporting(true)
    try {
      const ExcelJS = (await import('exceljs')).default
      const [summaryRes, outRes, inRes, returnsRes, pendingRes, adjRes] = await Promise.all([
        api.get('/water/summary', { params: { from, to } }),
        api.get('/water/movements', { params: { type: 'out', from, to, limit: 1000 } }),
        api.get('/water/movements', { params: { type: 'in', from, to, limit: 1000 } }),
        api.get('/water/returns', { params: { from, to } }),
        api.get('/water/pending'),
        api.get('/water/adjustments', { params: { from, to } }),
      ])
      const summary = summaryRes.data || {}
      const outRows = outRes.data || []
      const inRows = inRes.data || []
      const returnRows = returnsRes.data || []
      const pendingRows = pendingRes.data?.rows || []
      const adjRows = adjRes.data?.rows || []
      const cols = orderedCols
      const totals = summary.totals || {}
      const stock = summary.stock || []
      const daily = summary.daily || []
      const zoneTotals = summary.zones || []

      const wb = new ExcelJS.Workbook()
      wb.creator = 'YYS Su Takip'
      wb.created = new Date()
      wb.modified = new Date()

      const numFmt = '#,##0'
      const border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      }
      const fills = { title: 'FF0F172A', header: 'FF334155', sub: 'FFE2E8F0', total: 'FFFDE68A', red: 'FFFEE2E2' }
      const clean = (v) => {
        if (v == null) return ''
        const s = String(v)
        return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
      }
      const title = (ws, text, lastCol) => {
        ws.mergeCells(1, 1, 1, lastCol)
        const cell = ws.getCell(1, 1)
        cell.value = text
        cell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fills.title } }
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
        ws.getRow(1).height = 24
      }
      const header = (ws, rowNo, lastCol, fill = fills.header) => {
        for (let i = 1; i <= lastCol; i++) {
          const cell = ws.getCell(rowNo, i)
          cell.font = { bold: true, color: { argb: fill === fills.sub ? 'FF0F172A' : 'FFFFFFFF' } }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
          cell.border = border
        }
      }
      const table = (ws, headerRow, lastRow, lastCol, numericCols = []) => {
        header(ws, headerRow, lastCol)
        ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: Math.max(headerRow, lastRow), column: lastCol } }
        ws.views = [{ state: 'frozen', ySplit: headerRow }]
        for (let r = headerRow + 1; r <= lastRow; r++) {
          for (let c = 1; c <= lastCol; c++) {
            const cell = ws.getCell(r, c)
            cell.border = border
            cell.alignment = { vertical: 'middle', wrapText: true }
            if (numericCols.includes(c)) cell.numFmt = numFmt
            if ((r - headerRow) % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
          }
        }
      }

      const wsSummary = wb.addWorksheet('Aylık Özet')
      title(wsSummary, `SU TAKİP AYLIK ÖZET - ${label}`, 8)
      wsSummary.addRow(['Dönem başlangıç', from, 'Dönem bitiş', to, 'Oluşturma', new Date().toLocaleString('tr-TR'), '', ''])
      wsSummary.addRow([])
      wsSummary.addRow(['Gösterge', 'Değer', 'Açıklama', '', 'Gösterge', 'Değer', 'Açıklama', ''])
      wsSummary.addRow(['Gelen', totals.period_in || 0, 'Seçili ayda gelen dolu ürün', '', 'Dağıtım', totals.period_out || 0, 'Bölgelere verilen', ''])
      wsSummary.addRow(['Kalan Stok', totals.balance || 0, 'Tüm zamanlı giriş - dağıtım', '', 'Boş İade', totals.period_return || 0, 'Dönen boş kap', ''])
      wsSummary.addRow(['Düşük Stok', totals.low_count || 0, 'Eşik altındaki ürün', '', 'Dolaşımda Boş', totals.outstanding || 0, 'Depozito takibi', ''])
      wsSummary.addRow([])
      wsSummary.addRow(['Stok Durumu'])
      wsSummary.addRow(['Marka', 'Ürün', 'Baz Birim', 'Gelen', 'Dağıtım', 'Kalan', 'Kalan Okunur', 'Durum'])
      stock.forEach(s => wsSummary.addRow([clean(s.brand_name), clean(s.name), clean(s.unit_label), s.total_in || 0, s.total_out || 0, s.balance || 0, clean(s.balance_human || humanQty(s, s.balance)), s.low ? 'DÜŞÜK' : 'OK']))
      if (!stock.length) wsSummary.addRow(['', 'Stok verisi yok'])
      header(wsSummary, 4, 8, fills.sub)
      const stockLast = 10 + Math.max(stock.length, 1)
      table(wsSummary, 10, stockLast, 8, [4, 5, 6])
      for (let r = 11; r <= stockLast; r++) if (wsSummary.getCell(r, 8).value === 'DÜŞÜK') wsSummary.getRow(r).eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fills.red } } })
      wsSummary.columns = [{ width: 16 }, { width: 24 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 22 }, { width: 12 }]

      const wsMatch = wb.addWorksheet('Ay Uyuşturma')
      title(wsMatch, `AY SONU GELEN / DAĞITILAN UYUŞTURMA - ${label}`, 9)
      wsMatch.addRow(['Marka', 'Ürün', 'Baz Birim', 'Ay Gelen', 'Ay Dağıtım', 'Ay Farkı', 'Anlık Kalan', 'Kalan Okunur', 'Durum'])
      stock.forEach(s => {
        const periodNet = Number(s.period_net || 0)
        const status = s.negative ? 'EKSİ STOK' : periodNet < 0 ? 'AY EKSİ' : periodNet > 0 ? 'FAZLA' : 'TAM'
        wsMatch.addRow([clean(s.brand_name), clean(s.name), clean(s.unit_label), Number(s.period_in || 0), Number(s.period_out || 0), periodNet, Number(s.balance || 0), clean(s.balance_human || humanQty(s, s.balance)), status])
      })
      if (!stock.length) wsMatch.addRow(['', 'Ürün verisi yok'])
      table(wsMatch, 2, Math.max(2, 2 + stock.length), 9, [4, 5, 6, 7])
      for (let r = 3; r <= 2 + stock.length; r++) {
        const status = wsMatch.getCell(r, 9).value
        if (status === 'EKSİ STOK' || status === 'AY EKSİ') wsMatch.getRow(r).eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fills.red } } })
      }
      wsMatch.columns = [{ width: 16 }, { width: 24 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 14 }, { width: 22 }, { width: 12 }]

      const wsIndex = wb.addWorksheet('INDEX')
      const totalCols = 1 + cols.length + 1
      title(wsIndex, `INDEX - DAĞITIM YERİ MATRİSİ - ${label}`, totalCols)
      wsIndex.getCell(2, 1).value = 'Dönem'
      wsIndex.getCell(2, 2).value = `${from} / ${to}`
      wsIndex.getCell(2, 4).value = 'Genel toplam'
      wsIndex.getCell(2, 5).value = pivot.grandTotal || 0
      wsIndex.getCell(2, 5).numFmt = numFmt
      wsIndex.mergeCells(3, 1, 5, 1); wsIndex.getCell(3, 1).value = 'DAĞITIM YERİ'
      let cIdx = 2
      ;(pivot.brands || []).forEach(b => {
        const span = b.product_ids.length
        if (span < 1) return
        wsIndex.mergeCells(3, cIdx, 3, cIdx + span - 1)
        wsIndex.getCell(3, cIdx).value = clean(b.brand_name)
        cIdx += span
      })
      wsIndex.mergeCells(3, totalCols, 5, totalCols); wsIndex.getCell(3, totalCols).value = 'TOPLAM'
      cols.forEach((c, i) => {
        wsIndex.getCell(4, 2 + i).value = clean(c.name)
        wsIndex.getCell(5, 2 + i).value = `${c.unit_label || 'adet'} / 1 palet=${nf(multiplier(c, 'palet'))}`
      })
      for (let r = 3; r <= 5; r++) wsIndex.getRow(r).eachCell({ includeEmpty: true }, cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fills.header } }
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
        cell.border = border
      })
      let rowNo = 6
      zones.forEach(row => {
        wsIndex.getCell(rowNo, 1).value = clean(row.zone_name)
        cols.forEach((c, i) => { wsIndex.getCell(rowNo, 2 + i).value = (row.cells[c.product_id]?.base) || null })
        wsIndex.getCell(rowNo, totalCols).value = row.total_base || null
        wsIndex.getRow(rowNo).eachCell({ includeEmpty: true }, cell => { cell.border = border; cell.numFmt = numFmt })
        wsIndex.getCell(rowNo, totalCols).font = { bold: true }
        rowNo++
      })
      wsIndex.getCell(rowNo, 1).value = 'GENEL TOPLAM'
      cols.forEach((c, i) => { wsIndex.getCell(rowNo, 2 + i).value = pivot.colTotals[c.product_id]?.base || 0 })
      wsIndex.getCell(rowNo, totalCols).value = pivot.grandTotal
      wsIndex.getRow(rowNo).eachCell({ includeEmpty: true }, cell => {
        cell.font = { bold: true }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fills.total } }
        cell.border = border
        cell.numFmt = numFmt
      })
      wsIndex.views = [{ state: 'frozen', ySplit: 5, xSplit: 1 }]
      wsIndex.getColumn(1).width = 26
      for (let i = 0; i < cols.length; i++) wsIndex.getColumn(2 + i).width = 12
      wsIndex.getColumn(totalCols).width = 12

      const wsDaily = wb.addWorksheet('Günlük Çizelge')
      title(wsDaily, `GÜNLÜK AKIŞ - ${label}`, 7)
      wsDaily.addRow(['Tarih', 'Gün', 'Gelen', 'Dağıtım', 'Net', 'Kümülatif Net', 'Not'])
      daily.forEach((d, idx) => {
        const r = 3 + idx
        wsDaily.addRow([d.move_date, dayLong(d.move_date), d.in_base || 0, d.out_base || 0, { formula: `C${r}-D${r}`, result: (d.in_base || 0) - (d.out_base || 0) }, { formula: idx === 0 ? `E${r}` : `F${r - 1}+E${r}`, result: 0 }, ''])
      })
      table(wsDaily, 2, Math.max(2, 2 + daily.length), 7, [3, 4, 5, 6])
      wsDaily.columns = [{ width: 14 }, { width: 24 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 22 }]

      const wsOut = wb.addWorksheet('Dağıtım Defteri')
      title(wsOut, `DAĞITIM DEFTERİ - ${label}`, 11)
      wsOut.addRow(['Tarih', 'Saat', 'Bölge', 'Marka', 'Ürün', 'Girilen Miktar', 'Birim', 'Hesaplanan', 'İrsaliye Kaynağı', 'Kaydı Giren', 'Not'])
      outRows.forEach(r => wsOut.addRow([r.move_date, movementTime(r.created_at), clean(r.zone_name), clean(r.brand_name), clean(r.product_name), Number(r.input_qty || 0), clean(r.input_unit), Number(r.qty_base || 0), clean(r.source_waybills), clean(r.created_by_name || r.created_by_username), clean(r.note)]))
      table(wsOut, 2, Math.max(2, 2 + outRows.length), 11, [6, 8])
      wsOut.columns = [{ width: 14 }, { width: 10 }, { width: 24 }, { width: 16 }, { width: 22 }, { width: 14 }, { width: 10 }, { width: 14 }, { width: 30 }, { width: 18 }, { width: 24 }]

      const wsIn = wb.addWorksheet('İrsaliye Stok')
      title(wsIn, `GELEN TIR / İRSALİYE STOK - ${label}`, 12)
      wsIn.addRow(['Tarih', 'İrsaliye', 'Marka', 'Ürün', 'Girilen Miktar', 'Birim', 'Hesaplanan', 'Dağıtılan', 'Kalan', 'Kalan Okunur', 'Kaydı Giren', 'Not'])
      inRows.forEach(r => wsIn.addRow([r.move_date, clean(r.waybill_no || `Giriş #${r.id}`), clean(r.brand_name), clean(r.product_name), Number(r.input_qty || 0), clean(r.input_unit), Number(r.qty_base || 0), Number(r.intake_allocated_base || 0), Number(r.remaining_base || 0), clean(r.remaining_human || humanQty(r, r.remaining_base)), clean(r.created_by_name || r.created_by_username), clean(r.note)]))
      table(wsIn, 2, Math.max(2, 2 + inRows.length), 12, [5, 7, 8, 9])
      wsIn.columns = [{ width: 14 }, { width: 18 }, { width: 16 }, { width: 22 }, { width: 14 }, { width: 10 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 22 }, { width: 18 }, { width: 22 }]

      const wsZones = wb.addWorksheet('Bölge Toplamları')
      title(wsZones, `BÖLGE / ÜRÜN TOPLAMLARI - ${label}`, 7)
      wsZones.addRow(['Bölge', 'Marka', 'Ürün', 'Baz Birim', 'Toplam', 'Okunur', 'Not'])
      zoneTotals.forEach(z => wsZones.addRow([clean(z.zone_name), clean(z.brand_name), clean(z.product_name), clean(z.unit_label), Number(z.total_out || 0), clean(humanQty(z, z.total_out)), '']))
      table(wsZones, 2, Math.max(2, 2 + zoneTotals.length), 7, [5])
      wsZones.columns = [{ width: 26 }, { width: 16 }, { width: 22 }, { width: 12 }, { width: 14 }, { width: 22 }, { width: 18 }]

      const wsRules = wb.addWorksheet('Ürün Kuralları')
      title(wsRules, 'ÜRÜN / PALET ÇEVRİM KURALLARI', 8)
      wsRules.addRow(['Marka', 'Ürün', 'Baz Birim', 'Koli İçi', 'Palet Koli/Paket', '1 Palet Baz', 'Varsayılan Giriş', 'Min Stok'])
      cols.forEach(p => wsRules.addRow([clean(p.brand_name), clean(p.name), clean(p.unit_label), Number(p.units_per_case || 1), Number(p.cases_per_pallet || 1), Number(multiplier(p, 'palet') || 1), unitLabel(defaultUnitForProduct(p)), Number(p.min_level || 0)]))
      table(wsRules, 2, Math.max(2, 2 + cols.length), 8, [4, 5, 6, 8])
      wsRules.columns = [{ width: 16 }, { width: 24 }, { width: 12 }, { width: 10 }, { width: 16 }, { width: 14 }, { width: 16 }, { width: 12 }]

      const wsReturns = wb.addWorksheet('Boş İade')
      title(wsReturns, `BOŞ İADE / DEPOZİTO - ${label}`, 8)
      wsReturns.addRow(['Tarih', 'Marka', 'Ürün', 'Girilen Miktar', 'Birim', 'Hesaplanan', 'Kaydı Giren', 'Not'])
      returnRows.forEach(r => wsReturns.addRow([r.move_date, clean(r.brand_name), clean(r.product_name), Number(r.input_qty || 0), clean(r.input_unit), Number(r.qty_base || 0), clean(r.created_by_name || r.created_by_username), clean(r.note)]))
      table(wsReturns, 2, Math.max(2, 2 + returnRows.length), 8, [4, 6])
      wsReturns.columns = [{ width: 14 }, { width: 16 }, { width: 22 }, { width: 14 }, { width: 10 }, { width: 14 }, { width: 18 }, { width: 24 }]

      // İrsaliye Bekleyenler (W9)
      const wsPending = wb.addWorksheet('İrsaliye Bekleyen')
      title(wsPending, 'İRSALİYE BEKLEYEN DAĞITIMLAR', 7)
      wsPending.addRow(['Tarih', 'Dağıtım Yeri', 'Ürün', 'Dağıtılan', 'Eşleşen', 'Bekleyen', 'Gün'])
      pendingRows.forEach(p => wsPending.addRow([p.move_date, clean(p.zone_name), clean(p.product_name), Number(p.qty_base || 0), Number(p.allocated_base || 0), Number(p.unallocated_base || 0), Number(p.waiting_days || 0)]))
      if (!pendingRows.length) wsPending.addRow(['', 'Bekleyen dağıtım yok'])
      table(wsPending, 2, Math.max(2, 2 + pendingRows.length), 7, [4, 5, 6, 7])
      for (let r = 3; r <= 2 + pendingRows.length; r++) if (Number(wsPending.getCell(r, 7).value) >= 3) wsPending.getRow(r).eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fills.red } } })
      wsPending.columns = [{ width: 14 }, { width: 26 }, { width: 22 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 8 }]

      // Eksi Stoklar (W9)
      const negStock = stock.filter(s => s.negative || s.balance < 0)
      const wsNeg = wb.addWorksheet('Eksi Stoklar')
      title(wsNeg, `EKSİ STOKTAKİ ÜRÜNLER - ${label}`, 5)
      wsNeg.addRow(['Marka', 'Ürün', 'Baz Birim', 'Bakiye', 'Eksik (okunur)'])
      negStock.forEach(s => wsNeg.addRow([clean(s.brand_name), clean(s.name), clean(s.unit_label), Number(s.balance || 0), clean(s.deficit_human || humanQty(s, Math.abs(s.balance)))]))
      if (!negStock.length) wsNeg.addRow(['', 'Eksi stok yok 🎉'])
      table(wsNeg, 2, Math.max(2, 2 + negStock.length), 5, [4])
      for (let r = 3; r <= 2 + negStock.length; r++) wsNeg.getRow(r).eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fills.red } } })
      wsNeg.columns = [{ width: 16 }, { width: 24 }, { width: 12 }, { width: 12 }, { width: 20 }]

      // Sayım / Düzeltme Fişleri (W9)
      const wsAdj = wb.addWorksheet('Düzeltme Fişleri')
      title(wsAdj, `STOK DÜZELTME / SAYIM FİŞLERİ - ${label}`, 6)
      wsAdj.addRow(['Tarih', 'Ürün', 'Yön', 'Etki (baz)', 'Sebep', 'Not'])
      adjRows.forEach(a => wsAdj.addRow([a.move_date, clean(a.product_name), a.direction === 'in' ? 'Artı (+)' : 'Eksi (−)', Number(a.signed_base || 0), clean(a.reason), clean(a.note)]))
      if (!adjRows.length) wsAdj.addRow(['', 'Düzeltme kaydı yok'])
      table(wsAdj, 2, Math.max(2, 2 + adjRows.length), 6, [4])
      wsAdj.columns = [{ width: 14 }, { width: 24 }, { width: 12 }, { width: 12 }, { width: 18 }, { width: 24 }]

      wb.eachSheet(sheet => {
        sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
        sheet.properties.defaultRowHeight = 18
      })
      const buf = await wb.xlsx.writeBuffer()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      a.download = `su-takip-detayli-${from}_${to}.xlsx`
      a.click()
      URL.revokeObjectURL(a.href)
      toastOk('Detaylı Excel hazırlandı')
    } catch (e) {
      toastErr(errMsg(e, 'Excel oluşturulamadı'))
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
    <div className="panel" data-testid="water-board">
      <div className="panel-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <div className="panel-title">INDEX — DAĞITIM YERİ MATRİSİ</div>
          <div className="panel-subtitle">{visibleZoneRows.length}/{zones.length} dağıtım yeri · görünür toplam {nf(visibleTotals.month)} · bugün {nf(visibleTotals.today)}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Gün girişi:</span>
          <input type="date" className="form-input" min={from} max={to} value={day} onChange={e => setDay(e.target.value)} style={{ width: 'auto', fontSize: '12px' }} />
          {templates.length > 0 && (
            <select className="form-select" aria-label="Şablon uygula" value="" onChange={e => { if (e.target.value) applyTemplate(e.target.value) }} style={{ width: 'auto', fontSize: '12px' }}>
              <option value="">🗂 Şablon…</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.lines.length})</option>)}
            </select>
          )}
          <span style={{ width: '1px', height: '22px', background: 'var(--border)' }} />
          <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Hücre birimi:</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setAllInputUnits('default')}>Baz</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setAllInputUnits('palet')}>Palet</button>
          <button className="btn btn-ghost btn-sm" onClick={exportExcel} disabled={exporting || !pivot}>⬇ {exporting ? '…' : 'Excel'}</button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saveBatch.isPending || draft.count === 0}>
            {saveBatch.isPending ? 'Kaydediliyor…' : draft.count ? `${draft.count} Hücreyi Kaydet` : 'Kaydet'}
          </button>
        </div>
      </div>
      <div className="panel-body" style={{ padding: 0 }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(180deg, var(--surface), var(--surface2))' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'stretch' }}>
            <button
              type="button"
              onClick={() => setBrandFilter('all')}
              className="btn btn-ghost btn-sm"
              style={{ borderColor: brandFilter === 'all' ? 'var(--accent)' : 'var(--border)', background: brandFilter === 'all' ? 'rgba(59,130,246,.09)' : 'var(--surface)' }}
            >
              Tüm Markalar · {nf(pivot?.grandTotal)}
            </button>
            {brandStats.map(b => {
              const c = brandColor.get(b.key)
              const selected = brandFilter === b.key
              return (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => setBrandFilter(selected ? 'all' : b.key)}
                  className="btn btn-ghost btn-sm"
                  style={{
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: '2px',
                    minHeight: '38px',
                    borderColor: selected ? c?.fg : 'var(--border)',
                    background: selected ? c?.bg : 'var(--surface)',
                    color: selected ? c?.fg : 'var(--text)',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 800 }}>
                    <span style={{ width: '9px', height: '9px', borderRadius: '3px', background: c?.fg }} />{b.brand_name}
                  </span>
                  <span style={{ fontSize: '9px', color: selected ? c?.fg : 'var(--text3)' }}>{b.productCount} ürün · {nf(b.total)} · bugün {nf(b.today)}</span>
                </button>
              )
            })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: '8px', alignItems: 'end', marginTop: '10px' }}>
            <div>
              <label className="form-label">Dağıtım yeri ara</label>
              <input className="form-input" aria-label="Dağıtım yeri ara" value={zoneFilter} onChange={e => setZoneFilter(e.target.value)} placeholder="OTC, FPU, yemekhane..." style={{ fontSize: '12px' }} />
            </div>
            <div>
              <label className="form-label">Marka</label>
              <select className="form-select" aria-label="Marka" value={brandFilter} onChange={e => setBrandFilter(e.target.value)} style={{ fontSize: '12px' }}>
                <option value="all">Tüm markalar</option>
                {brandStats.map(b => <option key={b.key} value={b.key}>{b.brand_name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Sırala</label>
              <select className="form-select" aria-label="Sırala" value={zoneSort} onChange={e => setZoneSort(e.target.value)} style={{ fontSize: '12px' }}>
                <option value="total_desc">Çok dağıtılan</option>
                <option value="total_asc">Az dağıtılan</option>
                <option value="day_desc">Bugün hareketli</option>
                <option value="draft_desc">Giriş yazılan</option>
                <option value="name_asc">A-Z dağıtım yeri</option>
                <option value="name_desc">Z-A dağıtım yeri</option>
              </select>
            </div>
            <div>
              <label className="form-label">Göster</label>
              <select className="form-select" aria-label="Göster" value={zoneActivity} onChange={e => setZoneActivity(e.target.value)} style={{ fontSize: '12px' }}>
                <option value="all">Tüm yerler</option>
                <option value="with_month">Bu ay hareketli</option>
                <option value="with_day">Bugün verilmiş</option>
                <option value="with_draft">Giriş yazılan</option>
                <option value="empty">Hareketsiz</option>
              </select>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={() => { setZoneFilter(''); setBrandFilter('all'); setZoneSort('total_desc'); setZoneActivity('all') }}
            >
              Temizle
            </button>
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '8px', fontSize: '11px', color: 'var(--text3)' }}>
            <span>Üst sayı ay toplamı</span>
            <span>Alt kutu <b>{day}</b> girişi</span>
            <span><b>3p</b>, <b>3 palet</b>, <b>10 koli</b> otomatik çarpılır</span>
            {visibleTotals.draft > 0 && <span style={{ color: 'var(--green)', fontWeight: 700 }}>taslak +{nf(visibleTotals.draft)}</span>}
          </div>
        </div>

        {lowItems.length > 0 && (
          <div style={{ padding: '8px 14px', fontSize: '11px', color: 'var(--red)', borderBottom: '1px solid var(--border)', background: 'rgba(239,68,68,.06)' }}>
            ⚠ Düşük stok: {lowItems.map(p => `${p.name} (${p.balance_human})`).join(' · ')}
          </div>
        )}

        {pivotQuery.isError ? (
          <div style={{ padding: '18px 20px', borderTop: '1px solid var(--border)', color: 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <span>Dağıtım matrisi alınamadı.</span>
            <button type="button" className="btn btn-danger btn-sm" onClick={() => pivotQuery.refetch()} disabled={pivotQuery.isFetching}>
              {pivotQuery.isFetching ? 'Deneniyor...' : 'Tekrar dene'}
            </button>
          </div>
        ) : isLoading ? <div style={{ padding: '20px', color: 'var(--text3)' }}>Yükleniyor…</div> : !orderedCols.length ? (
          <div style={{ padding: '20px', color: 'var(--text3)' }}>Ürün tanımı yok — ⚙ Ayarlar’dan ekleyin.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ fontSize: '11px', minWidth: Math.max(760, 250 + visibleCols.length * 108) }}>
              <thead>
                <tr>
                  <th rowSpan={2} style={{ position: 'sticky', left: 0, zIndex: 3, background: 'var(--surface)', textAlign: 'left', minWidth: '176px' }}>DAĞITIM YERİ</th>
                  {visibleBrandGroups.map(b => {
                    if (!b.product_ids.length) return null
                    const c = brandColor.get(brandKey(b.brand_id))
                    return <th key={b.brand_id ?? 'none'} colSpan={b.product_ids.length} style={{ textAlign: 'center', background: c?.bg, color: c?.fg, fontWeight: 800, borderLeft: `3px solid ${c?.fg || 'var(--border)'}`, boxShadow: `inset 0 -2px 0 ${c?.fg || 'var(--border)'}` }}>{b.brand_name}</th>
                  })}
                  <th rowSpan={2} style={{ textAlign: 'right', minWidth: '64px', background: 'var(--surface2)' }}>TOPLAM</th>
                </tr>
                <tr>
                  {visibleCols.map((c, prodIdx) => {
                    const startsBrand = prodIdx === 0 || brandKey(visibleCols[prodIdx - 1]?.brand_id) !== brandKey(c.brand_id)
                    const tint = brandColor.get(brandKey(c.brand_id))
                    return (
                    <th key={c.product_id} style={{ textAlign: 'right', minWidth: '96px', borderLeft: startsBrand ? `3px solid ${tint?.fg || 'var(--border)'}` : '1px solid var(--border)', background: startsBrand ? tint?.bg : undefined }} title={`${c.brand_name} · ${c.name}`}>
                      <div style={{ fontWeight: 700, marginBottom: '4px' }}>{c.name}</div>
                      <select
                        className="form-select"
                        value={inputUnitFor(c)}
                        onChange={e => setProductUnits(prev => ({ ...prev, [c.product_id]: e.target.value }))}
                        style={{ height: '24px', minHeight: 0, fontSize: '10px', padding: '2px 4px', textAlign: 'right' }}
                      >
                        {unitOptionsForProduct(c).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {visibleZoneRows.map((row, zoneIdx) => {
                  const rowDraft = row.visible_draft || 0
                  return (
                    <tr key={row.zone_id}>
                      <td style={{ position: 'sticky', left: 0, zIndex: 1, background: 'var(--surface)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          onClick={() => setSelectedZone(row)}
                          title={`${row.zone_name} geçmişini aç`}
                          style={{
                            border: '1px solid var(--border)',
                            background: row.visible_base ? 'rgba(20,184,166,.08)' : row.visible_draft ? 'rgba(34,197,94,.08)' : 'var(--surface2)',
                            color: 'var(--text)',
                            borderRadius: '7px',
                            padding: '5px 8px',
                            cursor: 'pointer',
                            fontWeight: 700,
                            fontSize: '11px',
                            textAlign: 'left',
                            maxWidth: '190px',
                            width: '100%',
                          }}
                        >
                          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.zone_name}</span>
                          <span style={{ display: 'block', color: 'var(--text3)', fontSize: '9px', fontWeight: 500 }}>geçmişi aç · ay {nf(row.visible_base)} · bugün {nf(row.visible_day)}</span>
                        </button>
                      </td>
                      {visibleCols.map((c, prodIdx) => {
                        const key = cellKey(row.zone_id, c.product_id)
                        const monthBase = row.cells[c.product_id]?.base || 0
                        const dayBase = dayMap[key] || 0
                        const raw = cells[key] || ''
                        const parsed = draft.byCell[key] || smartQty(raw, c, inputUnitFor(c))
                        const active = parsed.valid
                        const pending = String(raw).trim() !== ''
                        const startsBrand = prodIdx === 0 || brandKey(visibleCols[prodIdx - 1]?.brand_id) !== brandKey(c.brand_id)
                        const tint = brandColor.get(brandKey(c.brand_id))
                        return (
                          <td key={c.product_id} style={{ textAlign: 'right', verticalAlign: 'top', borderLeft: startsBrand ? `3px solid ${tint?.fg || 'var(--border)'}` : '1px solid var(--border)', background: active ? 'rgba(34,197,94,.08)' : pending ? 'rgba(239,68,68,.05)' : startsBrand ? tint?.bg : undefined }}>
                            <div title={monthBase ? humanQty(c, monthBase) : ''} style={{ fontFamily: 'var(--mono)', color: monthBase ? 'var(--text)' : 'var(--text3)' }}>{monthBase ? nf(monthBase) : '·'}</div>
                            <input
                              ref={el => { if (el) inputRefs.current[key] = el }}
                              type="text" inputMode="decimal"
                              className="form-input" value={raw}
                              onChange={e => updateCell(row.zone_id, c.product_id, e.target.value)}
                              onPaste={e => handlePaste(e, zoneIdx, prodIdx)}
                              placeholder="0 / 3p"
                              style={{ width: '66px', height: '26px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: '11px', padding: '2px 5px', marginTop: '3px' }}
                            />
                            {active && <div style={{ fontSize: '9px', color: 'var(--green)', marginTop: '2px', whiteSpace: 'nowrap' }} title={calcText(c, parsed)}>= {nf(parsed.base)}</div>}
                            {dayBase > 0 && <div style={{ fontSize: '9px', color: 'var(--teal)', marginTop: '2px' }}>bugün {nf(dayBase)}</div>}
                          </td>
                        )
                      })}
                      <td style={{ textAlign: 'right', verticalAlign: 'top', fontFamily: 'var(--mono)', fontWeight: 700, background: 'var(--surface2)' }}>
                        <div style={{ color: row.visible_base ? 'var(--teal)' : 'var(--text3)' }}>{row.visible_base ? nf(row.visible_base) : '·'}</div>
                        {rowDraft > 0 && <div style={{ fontSize: '10px', color: 'var(--green)' }}>+{nf(rowDraft)}</div>}
                      </td>
                    </tr>
                  )
                })}
                {visibleZoneRows.length === 0 && (
                  <tr>
                    <td colSpan={visibleCols.length + 2} style={{ textAlign: 'center', padding: '18px', color: 'var(--text3)' }}>Filtreye uygun dağıtım yeri yok</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border)' }}>
                  <td style={{ position: 'sticky', left: 0, zIndex: 1, background: 'var(--surface2)', fontWeight: 700 }}>GENEL TOPLAM</td>
                  {visibleCols.map((c, prodIdx) => {
                    const startsBrand = prodIdx === 0 || brandKey(visibleCols[prodIdx - 1]?.brand_id) !== brandKey(c.brand_id)
                    const tint = brandColor.get(brandKey(c.brand_id))
                    const colBase = visibleTotals.byProduct[c.product_id]?.month || 0
                    const colDraft = visibleTotals.byProduct[c.product_id]?.draft || 0
                    return (
                      <td key={c.product_id} style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, background: 'var(--surface2)', borderLeft: startsBrand ? `3px solid ${tint?.fg || 'var(--border)'}` : '1px solid var(--border)' }}>
                        {nf(colBase)}{colDraft > 0 && <div style={{ fontSize: '10px', color: 'var(--green)' }}>+{nf(colDraft)}</div>}
                      </td>
                    )
                  })}
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)', background: 'var(--surface2)' }}>
                    {nf(visibleTotals.month)}{visibleTotals.draft > 0 && <div style={{ fontSize: '10px', color: 'var(--green)' }}>+{nf(visibleTotals.draft)}</div>}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
    {selectedZone && (
      <ZoneHistoryModal zone={selectedZone} from={from} to={to} label={label} onClose={() => setSelectedZone(null)} />
    )}
    </>
  )
}

function ZoneHistoryModal({ zone, from, to, label, onClose }) {
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
    <Modal title={`${zone.zone_name} — DAĞITIM GEÇMİŞİ`} onClose={onClose} width="1040px">
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
    </Modal>
  )
}

function DailyDistributionModal({ day, from, to, onDayChange, onClose }) {
  const qc = useQueryClient()
  const [filter, setFilter] = useState('')
  const [editing, setEditing] = useState(null)
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['water-daily-ledger', day],
    enabled: !!day,
    queryFn: () => api.get('/water/movements', { params: { type: 'out', from: day, to: day, limit: 600 } }).then(r => r.data),
  })
  const { data: products = [] } = useQuery({
    queryKey: ['water-products'],
    enabled: !!editing,
    queryFn: () => api.get('/water/products').then(r => r.data),
  })
  const { data: zones = [] } = useQuery({
    queryKey: ['water-zones'],
    enabled: !!editing,
    queryFn: () => api.get('/water/zones').then(r => r.data),
  })

  const visibleRows = useMemo(() => {
    const needle = filter.trim().toLocaleLowerCase('tr')
    if (!needle) return rows
    return rows.filter(r => [
      r.zone_name, r.product_name, r.brand_name, r.source_waybills,
      r.created_by_name, r.created_by_username, r.note, r.input_unit, r.qty_human,
    ].some(v => String(v || '').toLocaleLowerCase('tr').includes(needle)))
  }, [rows, filter])

  const stats = useMemo(() => {
    const byZone = new Map()
    const byProduct = new Map()
    let total = 0, pending = 0
    visibleRows.forEach(r => {
      const qty = Number(r.qty_base || 0)
      total += qty
      pending += Number(r.unallocated_base || 0)
      const zoneKey = r.zone_id || r.zone_name || 'unknown'
      const zone = byZone.get(zoneKey) || { key: zoneKey, zone_name: r.zone_name || 'Bölge yok', total: 0, count: 0, products: new Map() }
      zone.total += qty
      zone.count += 1
      const zoneProduct = zone.products.get(r.product_id) || { product: r, total: 0 }
      zoneProduct.total += qty
      zone.products.set(r.product_id, zoneProduct)
      byZone.set(zoneKey, zone)

      const product = byProduct.get(r.product_id) || { product: r, total: 0, count: 0, zones: new Set() }
      product.total += qty
      product.count += 1
      if (r.zone_name) product.zones.add(r.zone_name)
      byProduct.set(r.product_id, product)
    })
    return {
      total,
      zoneCount: byZone.size,
      productCount: byProduct.size,
      recordCount: visibleRows.length,
      pending,
      zones: [...byZone.values()].sort((a, b) => b.total - a.total),
      products: [...byProduct.values()].sort((a, b) => b.total - a.total),
    }
  }, [visibleRows])

  const selectedProduct = products.find(p => String(p.id) === String(editing?.product_id))
  const editCalc = editing ? smartQty(editing.input_qty, selectedProduct, editing.input_unit) : null
  const prevDay = shiftIsoDay(day, -1)
  const nextDay = shiftIsoDay(day, 1)
  const canPrev = !from || prevDay >= from
  const canNext = !to || nextDay <= to

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['water-daily-ledger'] })
    qc.invalidateQueries({ queryKey: ['water-summary'] })
    qc.invalidateQueries({ queryKey: ['water-pivot'] })
    qc.invalidateQueries({ queryKey: ['water-day'] })
    qc.invalidateQueries({ queryKey: ['water-zone-history'] })
    qc.invalidateQueries({ queryKey: ['water-intake'] })
  }
  const updateMovement = useMutation({
    mutationFn: ({ id, payload }) => api.put(`/water/movements/${id}`, payload),
    onSuccess: (_, vars) => {
      invalidate()
      toastOk('Dağıtım kaydı güncellendi')
      setEditing(null)
      if (vars?.payload?.move_date && vars.payload.move_date !== day) onDayChange?.(vars.payload.move_date)
    },
    onError: (e) => toastErr(errMsg(e, 'Güncellenemedi')),
  })
  const deleteMovement = useMutation({
    mutationFn: (id) => api.delete(`/water/movements/${id}`),
    onSuccess: () => { invalidate(); toastOk('Dağıtım kaydı silindi'); setEditing(null) },
    onError: (e) => toastErr(errMsg(e, 'Silinemedi')),
  })

  const startEdit = (r) => setEditing({
    id: r.id,
    move_date: r.move_date || day,
    zone_id: r.zone_id || '',
    product_id: r.product_id || '',
    input_qty: r.input_qty || '',
    input_unit: r.input_unit || defaultUnitForProduct(r),
    note: r.note || '',
  })
  const saveEdit = () => {
    if (!editing?.zone_id) return toastErr('Bölge seçin')
    if (!editing?.product_id) return toastErr('Ürün seçin')
    if (!editCalc?.valid) return toastErr('Geçerli miktar girin')
    updateMovement.mutate({
      id: editing.id,
      payload: {
        zone_id: +editing.zone_id,
        product_id: +editing.product_id,
        move_date: editing.move_date,
        input_qty: editCalc.input_qty,
        input_unit: editCalc.input_unit,
        note: editing.note?.trim() || undefined,
      },
    })
  }
  const exportCsv = () => {
    downloadCsv(`su-dagitim-${day}.csv`, ['Tarih', 'Saat', 'Bölge', 'Marka', 'Ürün', 'Girilen', 'Hesaplanan', 'İrsaliye', 'Kaydı Giren', 'Not'],
      visibleRows.map(r => [
        r.move_date, movementTime(r.created_at), r.zone_name, r.brand_name, r.product_name,
        `${nf(r.input_qty)} ${r.input_unit}`, r.qty_human || humanQty(r, r.qty_base),
        r.source_waybills || '', r.created_by_name || r.created_by_username || '', r.note || '',
      ]))
  }

  return (
    <Modal title={`${day} - GÜNLÜK DAĞITIM DEFTERİ`} onClose={onClose} width="1160px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: '22px' }}>{dayLong(day)}</div>
            <div style={{ color: 'var(--text3)', fontSize: '11px' }}>O gün girilen dağıtım kayıtları, irsaliye bağlantıları ve kaydı giren kullanıcı</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(82px, 1fr))', gap: '8px' }}>
            {[
              ['Toplam', nf(stats.total), 'var(--accent)'],
              ['Bölge', nf(stats.zoneCount), 'var(--teal)'],
              ['Ürün', nf(stats.productCount), 'var(--green)'],
              ['Kayıt', nf(stats.recordCount), 'var(--text)'],
              ['Bekleyen', nf(stats.pending), stats.pending > 0 ? 'var(--red)' : 'var(--text3)'],
            ].map(([name, value, color]) => (
              <div key={name} style={{ border: '1px solid var(--border)', background: 'var(--surface2)', padding: '7px 9px', borderRadius: '8px', textAlign: 'right' }}>
                <div style={{ fontSize: '9px', color: 'var(--text3)' }}>{name}</div>
                <div style={{ fontFamily: 'var(--display)', fontSize: '18px', color }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px' }}>
          <button className="btn btn-ghost btn-sm" type="button" disabled={!canPrev} onClick={() => onDayChange?.(prevDay)}>‹ Önceki</button>
          <button className="btn btn-ghost btn-sm" type="button" disabled={!canNext} onClick={() => onDayChange?.(nextDay)}>Sonraki ›</button>
          <input
            className="form-input"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Bölge, ürün, irsaliye, kişi ara..."
            style={{ minWidth: '240px', flex: '1 1 260px', fontSize: '12px' }}
          />
          <button className="btn btn-ghost btn-sm" type="button" disabled={!visibleRows.length} onClick={exportCsv}>CSV</button>
        </div>

        {editing && (
          <div style={{ border: '1px solid rgba(20,184,166,.45)', background: 'rgba(20,184,166,.07)', borderRadius: '8px', padding: '10px', display: 'grid', gridTemplateColumns: 'repeat(6, minmax(120px, 1fr))', gap: '8px', alignItems: 'end' }}>
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
              <strong style={{ fontSize: '12px' }}>Kayıt #{editing.id} düzenleniyor</strong>
              <span style={{ color: 'var(--text3)', fontSize: '11px' }}>{editCalc?.valid ? calcText(selectedProduct, editCalc) : 'Miktar girince hesaplanır'}</span>
            </div>
            <label style={{ fontSize: '11px', color: 'var(--text2)' }}>Tarih
              <input type="date" className="form-input" value={editing.move_date} onChange={e => setEditing(v => ({ ...v, move_date: e.target.value }))} style={{ fontSize: '12px' }} />
            </label>
            <label style={{ fontSize: '11px', color: 'var(--text2)' }}>Bölge
              <select className="form-select" value={editing.zone_id} onChange={e => setEditing(v => ({ ...v, zone_id: e.target.value }))} style={{ fontSize: '12px' }}>
                <option value="">Seçin</option>
                {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
            </label>
            <label style={{ fontSize: '11px', color: 'var(--text2)' }}>Ürün
              <select className="form-select" value={editing.product_id} onChange={e => {
                const product = products.find(p => String(p.id) === e.target.value)
                setEditing(v => ({ ...v, product_id: e.target.value, input_unit: defaultUnitForProduct(product) }))
              }} style={{ fontSize: '12px' }}>
                <option value="">Seçin</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.brand_name ? `${p.brand_name} · ` : ''}{p.name}</option>)}
              </select>
            </label>
            <label style={{ fontSize: '11px', color: 'var(--text2)' }}>Miktar
              <input className="form-input" value={editing.input_qty} onChange={e => setEditing(v => ({ ...v, input_qty: e.target.value }))} style={{ fontSize: '12px' }} />
            </label>
            <label style={{ fontSize: '11px', color: 'var(--text2)' }}>Birim
              <select className="form-select" value={editing.input_unit} onChange={e => setEditing(v => ({ ...v, input_unit: e.target.value }))} style={{ fontSize: '12px' }}>
                {unitOptionsForProduct(selectedProduct).map(([unit, label]) => <option key={unit} value={unit}>{label}</option>)}
              </select>
            </label>
            <label style={{ fontSize: '11px', color: 'var(--text2)' }}>Not
              <input className="form-input" value={editing.note} onChange={e => setEditing(v => ({ ...v, note: e.target.value }))} style={{ fontSize: '12px' }} />
            </label>
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => setEditing(null)}>Vazgeç</button>
              <button className="btn btn-primary btn-sm" type="button" disabled={updateMovement.isPending} onClick={saveEdit}>{updateMovement.isPending ? 'Kaydediliyor…' : 'Kaydet'}</button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div style={{ padding: '18px', color: 'var(--text3)' }}>Günlük kayıtlar yükleniyor...</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: '18px', color: 'var(--text3)', border: '1px dashed var(--border)', borderRadius: '8px', textAlign: 'center' }}>Bu gün için dağıtım kaydı yok.</div>
        ) : visibleRows.length === 0 ? (
          <div style={{ padding: '18px', color: 'var(--text3)', border: '1px dashed var(--border)', borderRadius: '8px', textAlign: 'center' }}>Filtreye uygun kayıt yok.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(300px, .65fr)', gap: '14px' }}>
            <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'auto', maxHeight: '58vh' }}>
              <table className="data-table" style={{ fontSize: '11px', minWidth: '980px' }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: '76px' }}>Saat</th>
                    <th style={{ minWidth: '160px' }}>Kime / nereye</th>
                    <th style={{ minWidth: '160px' }}>Ürün</th>
                    <th style={{ textAlign: 'right', minWidth: '90px' }}>Girilen</th>
                    <th style={{ textAlign: 'right', minWidth: '112px' }}>Hesaplanan</th>
                    <th style={{ minWidth: '150px' }}>İrsaliye</th>
                    <th style={{ minWidth: '120px' }}>Kaydı giren</th>
                    <th style={{ minWidth: '120px' }}>Not</th>
                    <th style={{ minWidth: '120px' }}>İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map(r => {
                    const pending = Number(r.unallocated_base || 0)
                    return (
                    <tr key={r.id} style={{ background: pending > 0 ? 'rgba(239,68,68,.06)' : undefined }}>
                      <td>
                        <div style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{movementTime(r.created_at) || '--:--'}</div>
                        <div style={{ color: 'var(--text3)', fontSize: '9px' }}>#{r.id}</div>
                      </td>
                      <td style={{ fontWeight: 700 }}>{r.zone_name || '-'}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{r.product_name}</div>
                        <div style={{ color: 'var(--text3)', fontSize: '9px' }}>{r.brand_name || 'Marka yok'}</div>
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{nf(r.input_qty)} {r.input_unit}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)' }}>{r.qty_human || humanQty(r, r.qty_base)}</td>
                      <td style={{ color: r.source_waybills || pending > 0 ? 'var(--text2)' : 'var(--text3)', fontSize: '10px' }}>
                        {r.source_waybills || '-'}
                        {pending > 0 && <div style={{ color: 'var(--red)', fontWeight: 800, marginTop: '3px' }}>-{r.unallocated_human || humanQty(r, pending)} irsaliye bekliyor</div>}
                      </td>
                      <td>{r.created_by_name || r.created_by_username || '-'}</td>
                      <td style={{ color: r.note ? 'var(--text2)' : 'var(--text3)' }}>{r.note || '-'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                          <button className="btn btn-ghost btn-sm" type="button" onClick={() => startEdit(r)}>Düzenle</button>
                          <button
                            className="btn btn-danger btn-sm"
                            type="button"
                            disabled={deleteMovement.isPending}
                            onClick={async () => {
                              if (await confirmDialog({ title: 'Dağıtım Kaydını Sil', body: `${r.zone_name || '-'} / ${r.product_name} kaydı silinsin mi?`, danger: true })) deleteMovement.mutate(r.id)
                            }}
                          >
                            Sil
                          </button>
                        </div>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', marginBottom: '8px' }}>BÖLGE TOPLAMI</div>
                <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'auto', maxHeight: '240px' }}>
                  <table className="data-table" style={{ fontSize: '11px' }}>
                    <tbody>
                      {stats.zones.map(z => (
                        <tr key={z.key}>
                          <td>
                            <div style={{ fontWeight: 700 }}>{z.zone_name}</div>
                            <div style={{ color: 'var(--text3)', fontSize: '9px' }}>
                              {[...z.products.values()].sort((a, b) => b.total - a.total).slice(0, 2).map(p => `${p.product.product_name}: ${nf(p.total)}`).join(' · ')}
                            </div>
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{nf(z.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', marginBottom: '8px' }}>ÜRÜN TOPLAMI</div>
                <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'auto', maxHeight: '240px' }}>
                  <table className="data-table" style={{ fontSize: '11px' }}>
                    <tbody>
                      {stats.products.map(p => (
                        <tr key={p.product.product_id}>
                          <td>
                            <div style={{ fontWeight: 700 }}>{p.product.brand_name ? `${p.product.brand_name} · ` : ''}{p.product.product_name}</div>
                            <div style={{ color: 'var(--text3)', fontSize: '9px' }}>{p.count} kayıt · {p.zones.size} bölge</div>
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{humanQty(p.product, p.total)}</td>
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
    </Modal>
  )
}

// ─────────────────────────── Onay Akışı (kontrol bekleyen eksi stok) ───────────────────────────
function ReviewPanel() {
  const qc = useQueryClient()
  const isManager = useAuthStore(s => s.user?.role === 'campus_manager')
  const [open, setOpen] = useState(false)
  const { data } = useQuery({
    queryKey: ['water-review'],
    queryFn: () => api.get('/water/review').then(r => r.data),
    refetchInterval: 60000,
  })
  const rows = data?.rows || []
  const approve = useMutation({
    mutationFn: (ids) => api.post('/water/review/approve', ids ? { ids } : {}),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['water-review'] }); qc.invalidateQueries({ queryKey: ['water-alerts'] }); toastOk(`${r.data.approved} kayıt onaylandı ✓`) },
    onError: (e) => toastErr(errMsg(e, 'Onaylanamadı')),
  })
  if (!data || rows.length === 0) return null

  return (
    <div style={{ marginBottom: '16px', background: 'color-mix(in srgb, var(--red) 8%, var(--surface))', border: '1px solid var(--red)', borderLeft: '3px solid var(--red)', borderRadius: '10px', padding: '10px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '15px' }}>🔎</span>
        <span style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 600 }}>{rows.length} eksi stok dağıtımı kontrol bekliyor</span>
        <span style={{ fontSize: '11px', color: 'var(--text3)' }}>stok karşılığı olmadan girildi</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setOpen(o => !o)}>{open ? '▲ Gizle' : '▼ Listele'}</button>
          {isManager && <button className="btn btn-primary btn-sm" disabled={approve.isPending} onClick={async () => { if (await confirmDialog({ title: 'Toplu Onay', message: `${rows.length} dağıtım kaydı onaylansın mı?`, confirmText: 'Hepsini Onayla' })) approve.mutate(null) }}>✓ Toplu Onayla</button>}
        </div>
      </div>
      {open && (
        <div style={{ marginTop: '8px', overflowX: 'auto' }}>
          <table className="data-table" style={{ fontSize: '11px', minWidth: '640px' }}>
            <thead><tr>{['Tarih', 'Bölge', 'Ürün', 'Miktar', 'Karşılıksız', 'Giren', isManager ? '' : null].filter(h => h !== null).map((h, i) => <th key={i} style={{ textAlign: ['Tarih', 'Bölge', 'Ürün', 'Giren'].includes(h) ? 'left' : 'right', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.movement_id}>
                  <td style={{ fontFamily: 'var(--mono)' }}>{r.move_date}</td>
                  <td>{r.zone_name}</td>
                  <td style={{ fontWeight: 600 }}>{r.product_name}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }} title={r.qty_human}>{nf(r.qty_base)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--red)', fontWeight: 600 }} title={r.unallocated_human}>{nf(r.unallocated_base)}</td>
                  <td style={{ color: 'var(--text3)' }}>{r.created_by_name || '—'}</td>
                  {isManager && <td style={{ textAlign: 'right' }}><button className="btn btn-ghost btn-sm" disabled={approve.isPending} onClick={() => approve.mutate([r.movement_id])}>Onayla</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────── Tüketim Öngörüsü & Sipariş Önerisi (V1) ───────────────────────────
function ForecastPanel() {
  const [open, setOpen] = useState(false)
  const today = todayStr()
  const { data } = useQuery({
    queryKey: ['water-forecast', today],
    queryFn: () => api.get('/water/forecast', { params: { today } }).then(r => r.data),
  })
  const rows = data?.rows || []
  const orders = data?.order_suggestions || []
  const t = data?.totals || { order_count: 0, soon_count: 0 }
  const withData = useMemo(() => [...rows].filter(r => r.days_of_cover != null).sort((a, b) => a.days_of_cover - b.days_of_cover), [rows])
  if (!data || (withData.length === 0 && orders.length === 0)) return null

  const coverColor = (d) => d == null ? 'var(--text3)' : d <= 7 ? 'var(--red)' : d <= 14 ? 'var(--amber, #d97706)' : 'var(--green)'
  return (
    <div className="panel" style={{ marginTop: '16px', borderTop: `3px solid ${t.order_count ? 'var(--red)' : 'var(--teal)'}` }}>
      <div className="panel-header" style={{ alignItems: 'center' }}>
        <div>
          <div className="panel-title">📉 SİPARİŞ ÖNERİLERİ & GÜN-YETER</div>
          <div className="panel-subtitle">
            {t.order_count > 0 ? <span style={{ color: 'var(--red)', fontWeight: 600 }}>{t.order_count} ürün sipariş bekliyor</span> : 'sipariş gerekmiyor'} · {t.soon_count} ürün 7 günden az · son 30 gün tüketimine göre
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setOpen(o => !o)}>{open ? '▲ Gizle' : '▼ Aç'}</button>
      </div>
      {open && (
        <>
          {orders.length > 0 && (
            <div style={{ padding: '0 0 10px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--red)', marginBottom: '6px' }}>ÖNERİLEN SİPARİŞLER</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {orders.map(o => (
                  <span key={o.product_id} style={{ fontSize: '11px', border: '1px solid var(--red)', background: 'color-mix(in srgb, var(--red) 8%, transparent)', borderRadius: '8px', padding: '4px 9px' }}>
                    {o.brand_name ? `${o.brand_name} · ` : ''}<b>{o.product_name}</b> → {o.suggested_human} <span style={{ color: 'var(--text3)' }}>({o.days_of_cover}g yeter)</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ fontSize: '11px', minWidth: '640px' }}>
              <thead><tr>{['Ürün', 'Bakiye', 'Günlük ort.', 'Gün yeter', 'Tahmini bitiş', 'Öneri'].map((h, i) => <th key={i} style={{ textAlign: h === 'Ürün' ? 'left' : 'right', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
              <tbody>
                {withData.map(r => (
                  <tr key={r.product_id}>
                    <td style={{ fontWeight: 600 }}>{r.product_name}{r.confidence === 'low' && <span style={{ fontSize: '9px', color: 'var(--text3)', marginLeft: '4px' }}>(az veri)</span>}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }} title={r.balance_human}>{nf(r.balance)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{r.avg_daily}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: coverColor(r.days_of_cover) }}>{r.days_of_cover}g</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{r.stockout_date || '—'}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: r.needs_order ? 'var(--red)' : 'var(--text3)' }}>{r.needs_order ? r.suggested_human : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────── İrsaliye Bekleyenler (eşleşmemiş dağıtımlar) ───────────────────────────
function PendingWaybillPanel() {
  const [open, setOpen] = useState(false)
  const today = todayStr()
  const { data } = useQuery({
    queryKey: ['water-pending', today],
    queryFn: () => api.get('/water/pending', { params: { today } }).then(r => r.data),
    refetchInterval: 60000,
  })
  const rows = data?.rows || []
  const t = data?.totals || { count: 0, overdue: 0 }
  if (t.count === 0) return null // hiç bekleyen yoksa gizle (AlertBand zaten "güncel" der)

  return (
    <div className="panel" style={{ marginTop: '16px', borderTop: `3px solid ${t.overdue ? 'var(--red)' : 'var(--accent)'}` }}>
      <div className="panel-header" style={{ alignItems: 'center' }}>
        <div>
          <div className="panel-title">🧾 İRSALİYE BEKLEYEN DAĞITIMLAR ({t.count})</div>
          <div className="panel-subtitle">
            {t.overdue > 0 ? <span style={{ color: 'var(--red)', fontWeight: 600 }}>{t.overdue} tanesi 3+ gündür bekliyor</span> : 'hepsi taze'} · yeni irsaliye girince otomatik kapanır
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setOpen(o => !o)}>{open ? '▲ Gizle' : '▼ Aç'}</button>
      </div>
      {open && (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ fontSize: '11px', minWidth: '820px' }}>
            <thead>
              <tr>
                {['Tarih', 'Bölge', 'Ürün', 'Dağıtılan', 'Eşleşen', 'Bekleyen', 'Gün', 'İrsaliye'].map(h => (
                  <th key={h} style={{ textAlign: ['Tarih', 'Bölge', 'Ürün'].includes(h) ? 'left' : 'right', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.movement_id}>
                  <td style={{ fontFamily: 'var(--mono)' }}>{r.move_date}</td>
                  <td>{r.zone_name}</td>
                  <td style={{ fontWeight: 600 }}>{r.product_name}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }} title={r.qty_human}>{nf(r.qty_base)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--green)' }} title={r.allocated_human}>{r.allocated_base ? nf(r.allocated_base) : '·'}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--red)', fontWeight: 600 }} title={r.unallocated_human}>{nf(r.unallocated_base)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: r.severity === 'overdue' ? 700 : 400, color: r.severity === 'overdue' ? 'var(--red)' : 'var(--text2)' }}>{r.waiting_days}g</td>
                  <td style={{ fontSize: '10px', color: 'var(--text3)' }}>{r.source_waybills || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────── Ay Sonu Kapanış / Uyuşturma ───────────────────────────
const truckBadgeBySeverity = (severity) => ({
  success: 'badge-green',
  critical: 'badge-red',
  warning: 'badge-amber',
  attention: 'badge-blue',
  muted: 'badge-gray',
}[severity] || 'badge-gray')

const timeToMinutes = (time) => {
  const [h, m] = String(time || '').split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return h * 60 + m
}
const minutesToTime = (minutes) => {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
const truckCheckSlots = (truck) => {
  const start = timeToMinutes(truck?.reminder_start_time || '08:00')
  const end = timeToMinutes(truck?.reminder_end_time || '17:00')
  const step = Math.max(15, Number(truck?.reminder_interval_minutes || 60))
  if (start == null || end == null || end < start) return []
  const slots = []
  for (let t = start; t <= end && slots.length < 16; t += step) slots.push(minutesToTime(t))
  return slots
}
const truckPriorityScore = (truck, today) => {
  let score = 0
  if (truck.deadline_passed || truck.mail_phase === 'overdue') score += 60
  if (truck.arrival_phase === 'late') score += 50
  if (truck.mail_required) score += 24
  if ((truck.missing_mail_fields || []).length) score += 18
  if (truck.arrival_date === today) score += 14
  if (!truck.photo_count && truck.status !== 'cancelled') score += 6
  return score
}

const truckFilterDefs = [
  { key: 'action', label: 'Aksiyon' },
  { key: 'mail', label: 'Mail bekleyen' },
  { key: 'ready', label: 'Mail hazır' },
  { key: 'missing', label: 'Eksik bilgi' },
  { key: 'photo', label: 'Fotosuz' },
  { key: 'today', label: 'Bugün gelecek' },
  { key: 'late', label: 'Geciken' },
  { key: 'all', label: 'Tümü' },
]

const gateEntryFileBase = (truck) => (
  `su-nakliye-personel-giris-${truck?.arrival_date || todayStr()}-${String(truck?.plate || 'arac').trim().replace(/\s+/g, '-')}`
)
const gateEntryRows = (truck) => {
  const entry = truck?.gate_entry || {}
  return [
    ['ADI SOYADI', entry.full_name || truck?.driver_name || '-'],
    ['T.C. KİMLİK / PASAPORT NUMARASI', `${entry.identity_label || (truck?.identity_type === 'passport' ? 'Pasaport' : 'T.C. Kimlik')}: ${entry.identity_no || truck?.driver_tc || '-'}`],
    ['TELEFON NUMARASI', entry.phone || truck?.driver_phone || '-'],
    ['ARAÇ PLAKASI', [entry.plate || truck?.plate, entry.trailer_plate || truck?.trailer_plate].filter(Boolean).join('\n') || '-'],
    ['ZİYARET EDİLECEK FİRMA', entry.visit_company || truck?.visit_company || '-'],
    ['ZİYARET EDİLECEK KİŞİ', entry.host_person_name || truck?.host_person_name || '-'],
    ['ZİYARET EDİLECEK KİŞİ TELEFONU', entry.host_person_phone || truck?.host_person_phone || '-'],
    ['GİRİŞ TARİHİ', entry.entry_date || truck?.arrival_date || '-'],
    ['GİRİŞ SAATİ', [entry.entry_start_time || truck?.arrival_start_time, entry.entry_end_time || truck?.arrival_end_time].filter(Boolean).join('-') || '-'],
    ['SAHA GİRİŞ NEDENİ', entry.entry_reason || truck?.entry_reason || 'SU AMAÇLI NAKLİYE'],
    ['ÇALIŞMA YAPACAĞI BÖLGE', entry.work_area || truck?.work_area || '-'],
  ]
}
const canvasTextLines = (ctx, value, maxWidth, maxLines = 99) => {
  const output = []
  const paragraphs = String(value ?? '-').split(/\r?\n/)
  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean)
    if (!words.length) {
      output.push('')
      continue
    }
    let line = ''
    words.forEach(word => {
      const next = line ? `${line} ${word}` : word
      if (line && ctx.measureText(next).width > maxWidth) {
        output.push(line)
        line = word
      } else {
        line = next
      }
    })
    if (line) output.push(line)
  }
  if (output.length <= maxLines) return output
  const trimmed = output.slice(0, maxLines)
  let last = `${trimmed[maxLines - 1]}...`
  while (last.length > 3 && ctx.measureText(last).width > maxWidth) last = `${last.slice(0, -4)}...`
  trimmed[maxLines - 1] = last
  return trimmed
}
const triggerDownload = (url, filename) => {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

function TruckArrivalPanel({ from, to, label, focusRequest }) {
  const qc = useQueryClient()
  const isManager = useAuthStore(s => s.user?.role === 'campus_manager')
  const fileRef = useRef(null)
  const panelRef = useRef(null)
  const entryFormRef = useRef(null)
  const [open, setOpen] = useState(true)
  const [truckFilter, setTruckFilter] = useState('action')
  const [selectedTruckId, setSelectedTruckId] = useState(null)
  const [editingTruckId, setEditingTruckId] = useState(null)
  const [gateExporting, setGateExporting] = useState('')
  const [photoForm, setPhotoForm] = useState({ truck_arrival_id: '', waybill_no: '', move_date: todayStr(), note: '' })
  const [form, setForm] = useState({
    arrival_date: todayStr(), arrival_start_time: '08:00', arrival_end_time: '17:00',
    mail_deadline_date: todayStr(), mail_deadline_time: '17:00',
    reminder_start_time: '08:00', reminder_end_time: '17:00', reminder_interval_minutes: 60,
    supplier_name: '', brand_id: '', driver_name: '', driver_tc: '', driver_phone: '',
    plate: '', trailer_plate: '', identity_type: 'tc', visit_company: '',
    host_person_name: '', host_person_phone: '', entry_reason: 'SU AMAÇLI NAKLİYE',
    work_area: '', center_email: '', note: '',
  })

  const { data: trucks = [] } = useQuery({
    queryKey: ['water-truck-arrivals', from, to],
    queryFn: () => api.get('/water/truck-arrivals', { params: { from, to, limit: 300 } }).then(r => r.data),
    refetchInterval: query => (query.state.data || []).some(t => ['pending', 'processing'].includes(t.mail_queue?.status)) ? 2000 : 60000,
  })
  const { data: photos = [] } = useQuery({
    queryKey: ['water-waybill-photos', from, to],
    queryFn: () => api.get('/water/waybill-photos', { params: { from, to, limit: 120 } }).then(r => r.data),
  })
  const { data: brands = [] } = useQuery({
    queryKey: ['water-brands'],
    queryFn: () => api.get('/water/brands').then(r => r.data),
  })

  useEffect(() => {
    if (!focusRequest?.seq) return undefined
    setOpen(true)
    const timer = setTimeout(() => {
      const target = focusRequest.mode === 'new' ? entryFormRef.current : panelRef.current
      target?.scrollIntoView({ behavior: 'smooth', block: focusRequest.mode === 'new' ? 'center' : 'start' })
    }, 0)
    return () => clearTimeout(timer)
  }, [focusRequest])

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['water-truck-arrivals'] })
    qc.invalidateQueries({ queryKey: ['water-waybill-photos'] })
    qc.invalidateQueries({ queryKey: ['water-alerts'] })
  }
  const create = useMutation({
    mutationFn: () => {
      const body = { ...form, brand_id: form.brand_id || null }
      return editingTruckId
        ? api.put(`/water/truck-arrivals/${editingTruckId}`, body)
        : api.post('/water/truck-arrivals', body)
    },
    onSuccess: response => {
      const savedId = Number(editingTruckId || response.data?.id)
      invalidate()
      if (savedId) {
        setSelectedTruckId(savedId)
        setTruckFilter('all')
      }
      setForm(f => ({
        ...f,
        driver_name: '', driver_tc: '', driver_phone: '', plate: '', trailer_plate: '',
        host_person_name: '', host_person_phone: '', work_area: '', note: '',
        status: 'planned',
      }))
      toastOk(editingTruckId ? 'Kayıt güncellendi; çıktı paketi kullanıma hazır' : 'Kayıt oluşturuldu; PDF, Excel ve PNG çıktıları hazır')
      setEditingTruckId(null)
      requestAnimationFrame(() => entryFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    },
    onError: e => toastErr(errMsg(e, 'Tır kaydı oluşturulamadı')),
  })
  const updateTruck = useMutation({
    mutationFn: ({ id, body }) => api.put(`/water/truck-arrivals/${id}`, body),
    onSuccess: () => { invalidate(); toastOk('Tır kaydı güncellendi') },
    onError: e => toastErr(errMsg(e, 'Güncellenemedi')),
  })
  const sendMail = useMutation({
    mutationFn: id => api.post(`/water/truck-arrivals/${id}/send-mail`),
    onSuccess: response => {
      invalidate()
      toastOk(response.data?.alreadyQueued ? 'Mail zaten gönderim kuyruğunda' : 'Mail gönderim kuyruğuna alındı')
    },
    onError: e => toastErr(errMsg(e, 'Mail gönderilemedi')),
  })
  const markMail = useMutation({
    mutationFn: id => api.post(`/water/truck-arrivals/${id}/mark-mail-sent`),
    onSuccess: () => { invalidate(); toastOk('Mail atıldı olarak işaretlendi') },
    onError: e => toastErr(errMsg(e, 'İşaretlenemedi')),
  })
  const markChecked = useMutation({
    mutationFn: id => api.post(`/water/truck-arrivals/${id}/check`),
    onSuccess: () => { invalidate(); toastOk('Kontrol saati işlendi') },
    onError: e => toastErr(errMsg(e, 'Kontrol işlenemedi')),
  })
  const runAlertCheck = useMutation({
    mutationFn: () => api.post('/water/truck-arrivals/check-alerts'),
    onSuccess: r => {
      invalidate()
      const checked = r.data?.checked ?? 0
      const created = r.data?.created ?? r.data?.count ?? 0
      toastOk(`${nf(checked)} tır tarandı, ${nf(created)} uyarı oluşturuldu`)
    },
    onError: e => toastErr(errMsg(e, 'Toplu kontrol çalıştırılamadı')),
  })
  const delTruck = useMutation({
    mutationFn: id => api.delete(`/water/truck-arrivals/${id}`),
    onSuccess: () => { invalidate(); toastOk('Tır kaydı silindi') },
    onError: e => toastErr(errMsg(e, 'Silinemedi')),
  })
  const uploadPhoto = useMutation({
    mutationFn: file => {
      const fd = new FormData()
      fd.append('photo', file)
      if (photoForm.truck_arrival_id) fd.append('truck_arrival_id', photoForm.truck_arrival_id)
      if (photoForm.waybill_no.trim()) fd.append('waybill_no', photoForm.waybill_no.trim())
      fd.append('move_date', photoForm.move_date || todayStr())
      if (photoForm.note.trim()) fd.append('note', photoForm.note.trim())
      return api.post('/water/waybill-photos', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    },
    onSuccess: () => { invalidate(); setPhotoForm(f => ({ ...f, waybill_no: '', note: '' })); toastOk('İrsaliye fotoğrafı yüklendi') },
    onError: e => toastErr(errMsg(e, 'Fotoğraf yüklenemedi')),
  })
  const delPhoto = useMutation({
    mutationFn: id => api.delete(`/water/waybill-photos/${id}`),
    onSuccess: () => { invalidate(); toastOk('Fotoğraf silindi') },
    onError: e => toastErr(errMsg(e, 'Fotoğraf silinemedi')),
  })

  const truckPayload = (t, patch = {}) => ({
    arrival_date: t.arrival_date, arrival_start_time: t.arrival_start_time, arrival_end_time: t.arrival_end_time,
    mail_deadline_date: t.mail_deadline_date, mail_deadline_time: t.mail_deadline_time,
    reminder_start_time: t.reminder_start_time, reminder_end_time: t.reminder_end_time,
    reminder_interval_minutes: t.reminder_interval_minutes,
    supplier_name: t.supplier_name || '', brand_id: t.brand_id || null,
    driver_name: t.driver_name || '', driver_tc: t.driver_tc || '', driver_phone: t.driver_phone || '',
    plate: t.plate, trailer_plate: t.trailer_plate || '', center_email: t.center_email || '',
    identity_type: t.identity_type || 'tc', visit_company: t.visit_company || '',
    host_person_name: t.host_person_name || '', host_person_phone: t.host_person_phone || '',
    entry_reason: t.entry_reason || 'SU AMAÇLI NAKLİYE', work_area: t.work_area || '',
    note: t.note || '', status: t.status, ...patch,
  })
  const editTruck = (t) => {
    setEditingTruckId(t.id)
    setForm({ ...truckPayload(t), brand_id: t.brand_id ? String(t.brand_id) : '' })
    requestAnimationFrame(() => entryFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }
  const cancelTruckEdit = () => {
    setEditingTruckId(null)
    setForm(f => ({
      ...f,
      driver_name: '', driver_tc: '', driver_phone: '', plate: '', trailer_plate: '',
      host_person_name: '', host_person_phone: '', work_area: '', note: '', status: 'planned',
    }))
  }
  const today = todayStr()
  const truckStats = useMemo(() => {
    const active = trucks.filter(t => !['arrived', 'cancelled'].includes(t.status))
    return {
      total: trucks.length,
      active: active.length,
      mail: trucks.filter(t => t.mail_required).length,
      missing: trucks.filter(t => (t.missing_mail_fields || []).length > 0 && t.mail_required).length,
      overdue: trucks.filter(t => t.deadline_passed || t.mail_phase === 'overdue' || t.arrival_phase === 'late').length,
      today: trucks.filter(t => t.arrival_date === today && !['arrived', 'cancelled'].includes(t.status)).length,
      ready: trucks.filter(t => t.mail_required && t.mail_ready).length,
      noPhoto: trucks.filter(t => !t.photo_count && t.status !== 'cancelled').length,
      photos: photos.length,
    }
  }, [trucks, photos.length, today])
  const filteredTrucks = useMemo(() => {
    const isAction = (t) => t.mail_required || t.deadline_passed || t.arrival_phase === 'late' || t.arrival_date === today || (t.missing_mail_fields || []).length || !t.photo_count
    const filters = {
      action: isAction,
      mail: (t) => t.mail_required,
      ready: (t) => t.mail_required && t.mail_ready,
      missing: (t) => (t.missing_mail_fields || []).length > 0,
      photo: (t) => !t.photo_count && t.status !== 'cancelled',
      today: (t) => t.arrival_date === today,
      late: (t) => t.deadline_passed || t.mail_phase === 'overdue' || t.arrival_phase === 'late',
      all: () => true,
    }
    return trucks.filter(filters[truckFilter] || filters.action)
  }, [trucks, truckFilter, today])
  const selectedTruck = filteredTrucks.find(t => t.id === selectedTruckId)
    || trucks.find(t => t.id === selectedTruckId)
    || filteredTrucks[0]
    || trucks[0]
    || null
  const danger = truckStats.overdue > 0 || truckStats.missing > 0
  const actionTruckCount = trucks.filter(t => (
    t.mail_required || t.deadline_passed || t.arrival_phase === 'late' || t.arrival_date === today || (t.missing_mail_fields || []).length || !t.photo_count
  )).length
  const missingFieldSummary = useMemo(() => {
    const map = new Map()
    trucks.forEach(t => {
      ;(t.mail_checklist || []).forEach(item => {
        if (item.ok) return
        const row = map.get(item.key) || { key: item.key, label: item.label, count: 0, plates: [] }
        row.count += 1
        if (row.plates.length < 4) row.plates.push(t.plate)
        map.set(item.key, row)
      })
      ;(t.missing_mail_fields || []).forEach(label => {
        const key = String(label || 'missing')
        if ([...map.values()].some(row => row.plates.includes(t.plate) && row.label === label)) return
        const row = map.get(key) || { key, label, count: 0, plates: [] }
        row.count += 1
        if (row.plates.length < 4) row.plates.push(t.plate)
        map.set(key, row)
      })
    })
    return [...map.values()].sort((a, b) => b.count - a.count)
  }, [trucks])
  const checkPlanRows = useMemo(() => (
    [...filteredTrucks]
      .filter(t => !['arrived', 'cancelled'].includes(t.status))
      .sort((a, b) => truckPriorityScore(b, today) - truckPriorityScore(a, today))
      .slice(0, 6)
  ), [filteredTrucks, today])
  const photoBacklogRows = useMemo(() => (
    trucks
      .filter(t => !t.photo_count && t.status !== 'cancelled')
      .sort((a, b) => truckPriorityScore(b, today) - truckPriorityScore(a, today))
      .slice(0, 6)
  ), [trucks, today])

  const copyTruckMail = async (t) => {
    if (!t) return
    const preview = t.mail_preview || { to: t.center_email, subject: t.mail_subject, body: t.mail_body }
    const text = [
      `Alıcı: ${preview.to || '-'}`,
      `Konu: ${preview.subject || '-'}`,
      '',
      preview.body || '',
    ].join('\n')
    try {
      await navigator.clipboard?.writeText(text)
      toastOk('Mail taslağı panoya kopyalandı')
    } catch {
      toastErr('Mail taslağı kopyalanamadı')
    }
  }

  const downloadGateEntryExcel = async (t) => {
    if (!t) return
    setGateExporting('excel')
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      wb.creator = 'Şantiye Yatakhane Yönetim Sistemi'
      wb.created = new Date()
      wb.subject = 'Su nakliyesi personel günlük giriş bildirimi'

      const gate = wb.addWorksheet('PERSONEL GÜNLÜK GİRİŞ', {
        pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
        views: [{ showGridLines: false }],
      })
      gate.mergeCells('A1:K1')
      const title = gate.getCell('A1')
      title.value = 'PERSONEL GÜNLÜK GİRİŞ'
      title.font = { name: 'Times New Roman', size: 16, bold: true, color: { argb: 'FFFFFFFF' } }
      title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF155E75' } }
      title.alignment = { horizontal: 'center', vertical: 'middle' }
      gate.getRow(1).height = 30
      gate.getRow(2).height = 8

      const rows = gateEntryRows(t)
      const headers = rows.map(([header]) => header)
      const values = rows.map(([, value]) => value)
      gate.addRow([])
      gate.addRow(headers)
      gate.addRow(values)
      gate.columns = [17, 23, 16, 16, 28, 22, 19, 13, 14, 20, 22].map(width => ({ width }))
      gate.getRow(3).height = 46
      gate.getRow(4).height = 72
      for (let rowNo = 3; rowNo <= 4; rowNo += 1) {
        gate.getRow(rowNo).eachCell(cell => {
          cell.font = { name: 'Times New Roman', size: rowNo === 3 ? 9 : 11, bold: rowNo === 3 }
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
          cell.border = {
            top: { style: 'thin', color: { argb: 'FF334155' } },
            left: { style: 'thin', color: { argb: 'FF334155' } },
            bottom: { style: 'thin', color: { argb: 'FF334155' } },
            right: { style: 'thin', color: { argb: 'FF334155' } },
          }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowNo === 3 ? 'FFD6EAF0' : 'FFFFFFFF' } }
        })
      }
      gate.autoFilter = 'A3:K4'
      gate.pageSetup.printArea = 'A1:K4'
      gate.headerFooter.oddFooter = '&LŞantiye Su Takibi&C&F&R&P / &N'

      const letter = wb.addWorksheet('RESMİ YAZI', {
        pageSetup: { orientation: 'portrait', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
        views: [{ showGridLines: false }],
      })
      letter.columns = [{ width: 4 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 4 }]
      letter.mergeCells('B2:E2')
      letter.getCell('B2').value = 'SU AMAÇLI NAKLİYE PERSONEL GİRİŞ TALEBİ'
      letter.getCell('B2').font = { name: 'Times New Roman', size: 15, bold: true, color: { argb: 'FF155E75' } }
      letter.getCell('B2').alignment = { horizontal: 'center' }
      letter.mergeCells('B4:E4')
      letter.getCell('B4').value = `Konu: ${t.mail_preview?.subject || t.mail_subject || '-'}`
      letter.getCell('B4').font = { name: 'Times New Roman', size: 11, bold: true }
      letter.mergeCells('B6:E18')
      letter.getCell('B6').value = t.mail_preview?.body || t.mail_body || ''
      letter.getCell('B6').font = { name: 'Times New Roman', size: 11 }
      letter.getCell('B6').alignment = { vertical: 'top', wrapText: true }
      letter.getCell('B6').border = {
        top: { style: 'thin', color: { argb: 'FF94A3B8' } }, left: { style: 'thin', color: { argb: 'FF94A3B8' } },
        bottom: { style: 'thin', color: { argb: 'FF94A3B8' } }, right: { style: 'thin', color: { argb: 'FF94A3B8' } },
      }
      letter.getRow(6).height = 280
      letter.mergeCells('B20:E20')
      letter.getCell('B20').value = `Alıcı: ${t.mail_preview?.to || t.center_email || '-'}`
      letter.getCell('B20').font = { name: 'Times New Roman', size: 10, italic: true, color: { argb: 'FF475569' } }
      letter.pageSetup.printArea = 'B2:E20'

      const buffer = await wb.xlsx.writeBuffer()
      const blobUrl = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      triggerDownload(blobUrl, `${gateEntryFileBase(t)}.xlsx`)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
      toastOk('Personel giriş formu ve resmi yazı Excel olarak hazırlandı')
    } catch {
      toastErr('Personel giriş Exceli oluşturulamadı')
    } finally {
      setGateExporting('')
    }
  }

  const downloadGateEntryPdf = async (t) => {
    if (!t) return
    setGateExporting('pdf')
    try {
      const response = await api.get(`/water/truck-arrivals/${t.id}/gate-entry.pdf`, { responseType: 'blob' })
      const blobUrl = URL.createObjectURL(response.data)
      triggerDownload(blobUrl, `${gateEntryFileBase(t)}.pdf`)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
      toastOk('Kurumsal personel giriş PDF’i hazırlandı')
    } catch (error) {
      toastErr(errMsg(error, 'Personel giriş PDF’i oluşturulamadı'))
    } finally {
      setGateExporting('')
    }
  }

  const downloadGateEntryPng = async (t) => {
    if (!t) return
    setGateExporting('png')
    try {
      const width = 1600
      const height = 1000
      const scale = 2
      const canvas = document.createElement('canvas')
      canvas.width = width * scale
      canvas.height = height * scale
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas kullanılamıyor')
      ctx.scale(scale, scale)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)

      ctx.fillStyle = '#155e75'
      ctx.fillRect(0, 0, width, 104)
      ctx.fillStyle = '#ffffff'
      ctx.font = '700 34px Arial, sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText('PERSONEL GÜNLÜK GİRİŞ', 32, 55)
      ctx.font = '18px Arial, sans-serif'
      ctx.fillStyle = '#cffafe'
      ctx.fillText('Su amaçlı nakliye personel giriş talebi', 32, 84)
      ctx.textAlign = 'right'
      ctx.font = '700 20px Arial, sans-serif'
      ctx.fillStyle = '#ffffff'
      ctx.fillText(`${t.arrival_date || '-'}  ·  ${t.vehicle_summary || t.plate || '-'}`, width - 32, 62)

      const rows = gateEntryRows(t)
      const columnWidths = [125, 170, 117, 117, 205, 161, 139, 95, 102, 146, 163]
      const tableX = 15
      const headerY = 130
      const headerHeight = 88
      const valueHeight = 142
      let x = tableX
      rows.forEach(([header, value], index) => {
        const cellWidth = columnWidths[index]
        ctx.fillStyle = index % 2 ? '#e0f2fe' : '#ecfeff'
        ctx.fillRect(x, headerY, cellWidth, headerHeight)
        ctx.strokeStyle = '#475569'
        ctx.lineWidth = 1
        ctx.strokeRect(x, headerY, cellWidth, headerHeight)
        ctx.font = '700 14px Arial, sans-serif'
        ctx.fillStyle = '#0f172a'
        ctx.textAlign = 'center'
        const headerLines = canvasTextLines(ctx, header, cellWidth - 12, 4)
        const headerStart = headerY + (headerHeight - headerLines.length * 18) / 2 + 14
        headerLines.forEach((line, lineIndex) => ctx.fillText(line, x + cellWidth / 2, headerStart + lineIndex * 18))

        ctx.fillStyle = '#ffffff'
        ctx.fillRect(x, headerY + headerHeight, cellWidth, valueHeight)
        ctx.strokeRect(x, headerY + headerHeight, cellWidth, valueHeight)
        ctx.font = '18px Arial, sans-serif'
        ctx.fillStyle = '#111827'
        const valueLines = canvasTextLines(ctx, value, cellWidth - 14, 5)
        const valueStart = headerY + headerHeight + (valueHeight - valueLines.length * 23) / 2 + 17
        valueLines.forEach((line, lineIndex) => ctx.fillText(line, x + cellWidth / 2, valueStart + lineIndex * 23))
        x += cellWidth
      })

      const requestY = 400
      ctx.fillStyle = '#f8fafc'
      ctx.fillRect(28, requestY, width - 56, 475)
      ctx.strokeStyle = '#94a3b8'
      ctx.strokeRect(28, requestY, width - 56, 475)
      ctx.fillStyle = '#155e75'
      ctx.fillRect(28, requestY, 11, 475)
      ctx.textAlign = 'left'
      ctx.fillStyle = '#0f172a'
      ctx.font = '700 25px Arial, sans-serif'
      ctx.fillText('ANA MERKEZ PERSONEL GİRİŞ TALEBİ', 62, requestY + 48)
      ctx.font = '700 17px Arial, sans-serif'
      ctx.fillStyle = '#334155'
      const subject = `Konu: ${t.mail_preview?.subject || t.mail_subject || '-'}`
      canvasTextLines(ctx, subject, width - 145, 2).forEach((line, index) => ctx.fillText(line, 62, requestY + 85 + index * 23))
      ctx.font = '19px Arial, sans-serif'
      ctx.fillStyle = '#1e293b'
      const body = t.mail_preview?.body || t.mail_body || ''
      canvasTextLines(ctx, body, width - 145, 13).forEach((line, index) => ctx.fillText(line, 62, requestY + 148 + index * 27))

      ctx.fillStyle = '#e0f2fe'
      ctx.fillRect(28, 898, width - 56, 70)
      ctx.fillStyle = '#0e7490'
      ctx.font = '700 17px Arial, sans-serif'
      ctx.fillText(`Alıcı: ${t.mail_preview?.to || t.center_email || '-'}`, 50, 928)
      ctx.font = '15px Arial, sans-serif'
      ctx.fillStyle = '#475569'
      ctx.fillText(`Kayıt no: ${t.id}  ·  Oluşturulma: ${new Date().toLocaleString('tr-TR')}  ·  Şantiye Su Takibi`, 50, 953)

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(result => result ? resolve(result) : reject(new Error('PNG üretilemedi')), 'image/png')
      })
      const blobUrl = URL.createObjectURL(blob)
      triggerDownload(blobUrl, `${gateEntryFileBase(t)}.png`)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
      toastOk('Mailde paylaşılabilir yüksek çözünürlüklü PNG hazırlandı')
    } catch {
      toastErr('Personel giriş PNG görseli oluşturulamadı')
    } finally {
      setGateExporting('')
    }
  }

  return (
    <div ref={panelRef} id="water-truck-entry" className="panel" style={{ marginTop: '16px', borderTop: `3px solid ${danger ? 'var(--red)' : 'var(--teal)'}`, scrollMarginTop: '18px' }}>
      <div className="panel-header" style={{ alignItems: 'center', gap: '10px' }}>
        <div>
          <div className="panel-title">TIR / İRSALİYE TAKİBİ — {label}</div>
          <div className="panel-subtitle">{truckStats.total} tır kaydı · {truckStats.mail} mail bekliyor · {truckStats.photos} irsaliye fotoğrafı</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          {truckStats.today > 0 && <span className="badge badge-amber">{truckStats.today} bugün</span>}
          {truckStats.overdue > 0 && <span className="badge badge-red">{truckStats.overdue} kritik</span>}
          <button className="btn btn-ghost btn-sm" onClick={() => setOpen(o => !o)}>{open ? '▲ Gizle' : '▼ Aç'}</button>
        </div>
      </div>
      {open && (
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(138px, 1fr))', gap: '8px' }}>
            {[
              ['Mail bekleyen', truckStats.mail, 'var(--accent)', `${truckStats.ready} hazır`],
              ['Eksik bilgi', truckStats.missing, 'var(--red)', 'mail öncesi tamamla'],
              ['Deadline / gecikme', truckStats.overdue, 'var(--red)', 'hemen kontrol'],
              ['Bugün gelecek', truckStats.today, 'var(--blue)', 'geliş teyidi'],
              ['Fotoğrafsız', truckStats.noPhoto, 'var(--teal)', 'irsaliye arşivi'],
            ].map(([title, value, color, sub]) => (
              <div key={title} style={{ border: `1px solid color-mix(in srgb, ${color} 34%, var(--border))`, borderLeft: `4px solid ${color}`, borderRadius: '8px', background: `color-mix(in srgb, ${color} 7%, var(--surface))`, padding: '9px 10px' }}>
                <div style={{ fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0 }}>{title}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '7px', marginTop: '4px' }}>
                  <strong style={{ fontFamily: 'var(--mono)', fontSize: '20px', color }}>{nf(value)}</strong>
                  <span style={{ fontSize: '11px', color: 'var(--text2)' }}>{sub}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
            <section style={{ border: '1px solid color-mix(in srgb, var(--blue) 28%, var(--border))', borderRadius: '8px', background: 'color-mix(in srgb, var(--blue) 5%, var(--surface))', padding: '10px', minHeight: '172px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                <div>
                  <strong style={{ fontSize: '12px' }}>Saatlik kontrol planı</strong>
                  <div style={{ color: 'var(--text3)', fontSize: '10px' }}>Geciken, bugüne düşen ve mail bekleyen tırlar önce görünür</div>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={!isManager || runAlertCheck.isPending}
                  title={isManager ? 'Aktif tırları tarar ve uyarı üretir' : 'Sadece müdür çalıştırabilir'}
                  onClick={() => runAlertCheck.mutate()}
                >
                  {runAlertCheck.isPending ? 'Taranıyor...' : 'Toplu kontrol çalıştır'}
                </button>
              </div>
              <div style={{ display: 'grid', gap: '7px' }}>
                {checkPlanRows.map(t => {
                  const slots = truckCheckSlots(t)
                  const urgent = truckPriorityScore(t, today) >= 50
                  return (
                    <div key={t.id} style={{ border: `1px solid ${urgent ? 'color-mix(in srgb, var(--red) 36%, var(--border))' : 'var(--border)'}`, borderRadius: '7px', background: urgent ? 'color-mix(in srgb, var(--red) 5%, var(--surface))' : 'var(--surface)', padding: '7px' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'space-between', alignItems: 'start' }}>
                        <button type="button" onClick={() => setSelectedTruckId(t.id)} style={{ textAlign: 'left', padding: 0, fontFamily: 'var(--mono)', fontWeight: 900, border: 0, background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}>{t.plate}</button>
                        <span className={`badge ${urgent ? 'badge-red' : truckBadgeBySeverity(t.mail_severity)}`}>{t.next_check_time || t.mail_phase_label || 'Planlı'}</span>
                      </div>
                      <div style={{ color: 'var(--text3)', fontSize: '10px', marginTop: '3px' }}>{t.arrival_date} · {t.arrival_window || '-'} · {t.check_plan_label || 'kontrol aralığı yok'}</div>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '6px' }}>
                        {slots.slice(0, 7).map(slot => <span key={slot} className={`badge ${slot === t.next_check_time ? 'badge-blue' : 'badge-gray'}`}>{slot}</span>)}
                        {slots.length > 7 && <span className="badge badge-gray">+{slots.length - 7}</span>}
                      </div>
                    </div>
                  )
                })}
                {checkPlanRows.length === 0 && <div style={{ color: 'var(--text3)', fontSize: '12px', padding: '18px 4px' }}>Kontrol bekleyen aktif tır yok</div>}
              </div>
            </section>

            <section style={{ border: '1px solid color-mix(in srgb, var(--red) 24%, var(--border))', borderRadius: '8px', background: 'color-mix(in srgb, var(--red) 4%, var(--surface))', padding: '10px', minHeight: '172px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                <div>
                  <strong style={{ fontSize: '12px' }}>Eksik bilgi listesi</strong>
                  <div style={{ color: 'var(--text3)', fontSize: '10px' }}>Mail atılmadan önce tamamlanması gereken alanlar</div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setTruckFilter('missing')}>Filtrele</button>
              </div>
              <div style={{ display: 'grid', gap: '6px' }}>
                {missingFieldSummary.slice(0, 6).map(item => (
                  <button key={item.key} type="button" onClick={() => setTruckFilter('missing')} style={{ border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: '7px', padding: '7px', textAlign: 'left', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                      <strong style={{ fontSize: '11px' }}>{item.label}</strong>
                      <span className="badge badge-red">{nf(item.count)}</span>
                    </div>
                    <div style={{ color: 'var(--text3)', fontSize: '10px', marginTop: '3px', fontFamily: 'var(--mono)' }}>{item.plates.join(', ')}</div>
                  </button>
                ))}
                {missingFieldSummary.length === 0 && <div style={{ color: 'var(--green)', fontSize: '12px', padding: '18px 4px' }}>Mail bilgileri tamam görünüyor</div>}
              </div>
            </section>

            <section style={{ border: '1px solid color-mix(in srgb, var(--teal) 28%, var(--border))', borderRadius: '8px', background: 'color-mix(in srgb, var(--teal) 5%, var(--surface))', padding: '10px', minHeight: '172px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                <div>
                  <strong style={{ fontSize: '12px' }}>Foto bekleyen irsaliye</strong>
                  <div style={{ color: 'var(--text3)', fontSize: '10px' }}>Gelen fotoğraf bağlanınca arşiv ve tır kaydı birlikte takip edilir</div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setTruckFilter('photo')}>Fotosuz</button>
              </div>
              <div style={{ display: 'grid', gap: '6px' }}>
                {photoBacklogRows.map(t => (
                  <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'center', border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: '7px', padding: '7px' }}>
                    <button type="button" onClick={() => setSelectedTruckId(t.id)} style={{ textAlign: 'left', padding: 0, border: 0, background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}>
                      <strong style={{ fontFamily: 'var(--mono)' }}>{t.plate}</strong>
                      <div style={{ color: 'var(--text3)', fontSize: '10px' }}>{t.arrival_date} · {t.brand_name || t.supplier_name || 'tedarikçi yok'}</div>
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setPhotoForm(f => ({ ...f, truck_arrival_id: String(t.id), move_date: t.arrival_date })); fileRef.current?.click() }}>Foto</button>
                  </div>
                ))}
                {photoBacklogRows.length === 0 && <div style={{ color: 'var(--green)', fontSize: '12px', padding: '18px 4px' }}>Fotoğraf bekleyen aktif kayıt yok</div>}
              </div>
            </section>
          </div>
          <div ref={entryFormRef} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))', gap: '8px', alignItems: 'end', border: `1px solid ${editingTruckId ? 'color-mix(in srgb, var(--amber) 55%, var(--border))' : 'var(--border)'}`, background: 'var(--surface2)', borderRadius: '8px', padding: '10px' }}>
            <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px', alignItems: 'center', border: '1px solid color-mix(in srgb, var(--teal) 35%, var(--border))', borderRadius: '8px', background: 'color-mix(in srgb, var(--teal) 6%, var(--surface))', padding: '10px 11px' }}>
              <div>
                <strong style={{ display: 'block', fontSize: '12px' }}>PERSONEL GİRİŞİ VE ÇIKTI MERKEZİ</strong>
                <div style={{ color: 'var(--text2)', fontSize: '10px', marginTop: '3px' }}>
                  <span style={{ fontWeight: 800 }}>1.</span> Bilgileri doldur&nbsp;&nbsp; <span style={{ fontWeight: 800 }}>2.</span> Kaydı oluştur&nbsp;&nbsp; <span style={{ fontWeight: 800 }}>3.</span> Mail eklerini indir
                </div>
                <div style={{ color: selectedTruck ? 'var(--green)' : 'var(--text3)', fontSize: '10px', marginTop: '5px', fontFamily: 'var(--mono)' }}>
                  {selectedTruck ? `Aktif çıktı: ${selectedTruck.arrival_date} · ${selectedTruck.vehicle_summary || selectedTruck.plate}` : 'Henüz kayıt yok. Bilgileri doldurup Tır Kaydı Oluştur düğmesine basın.'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary btn-sm" disabled={!selectedTruck || Boolean(gateExporting)} onClick={() => downloadGateEntryPdf(selectedTruck)}>{gateExporting === 'pdf' ? 'Hazırlanıyor…' : 'PDF Hazırla'}</button>
                <button className="btn btn-ghost btn-sm" disabled={!selectedTruck || Boolean(gateExporting)} onClick={() => downloadGateEntryExcel(selectedTruck)}>{gateExporting === 'excel' ? 'Hazırlanıyor…' : 'Excel Hazırla'}</button>
                <button className="btn btn-ghost btn-sm" disabled={!selectedTruck || Boolean(gateExporting)} onClick={() => downloadGateEntryPng(selectedTruck)}>{gateExporting === 'png' ? 'Hazırlanıyor…' : 'PNG Hazırla'}</button>
              </div>
            </div>
            {editingTruckId && (
              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', padding: '7px 9px', borderRadius: '7px', background: 'color-mix(in srgb, var(--amber) 12%, var(--surface))' }}>
                <strong style={{ fontSize: '12px' }}>Kayıt #{editingTruckId} düzenleniyor</strong>
                <button className="btn btn-ghost btn-sm" onClick={cancelTruckEdit}>Düzenlemeyi İptal</button>
              </div>
            )}
            <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '2px' }}>
              <span className="badge badge-blue">1</span>
              <strong style={{ fontSize: '12px' }}>Geliş, mail deadline ve kontrol aralığı</strong>
              <span style={{ color: 'var(--text3)', fontSize: '11px' }}>17:00 son saat ve seçilen aralıklar uyarılara bağlanır</span>
            </div>
            <label className="form-label">Geliş tarihi<input type="date" className="form-input" value={form.arrival_date} onChange={e => setForm(f => ({ ...f, arrival_date: e.target.value, mail_deadline_date: f.mail_deadline_date || e.target.value }))} /></label>
            <label className="form-label">Başlangıç<input type="time" className="form-input" value={form.arrival_start_time} onChange={e => setForm(f => ({ ...f, arrival_start_time: e.target.value }))} /></label>
            <label className="form-label">Bitiş<input type="time" className="form-input" value={form.arrival_end_time} onChange={e => setForm(f => ({ ...f, arrival_end_time: e.target.value }))} /></label>
            <label className="form-label">Mail son tarih<input type="date" className="form-input" value={form.mail_deadline_date} onChange={e => setForm(f => ({ ...f, mail_deadline_date: e.target.value }))} /></label>
            <label className="form-label">Mail son saat<input type="time" className="form-input" value={form.mail_deadline_time} onChange={e => setForm(f => ({ ...f, mail_deadline_time: e.target.value }))} /></label>
            <label className="form-label">Kontrol başla<input type="time" className="form-input" value={form.reminder_start_time} onChange={e => setForm(f => ({ ...f, reminder_start_time: e.target.value }))} /></label>
            <label className="form-label">Kontrol bitiş<input type="time" className="form-input" value={form.reminder_end_time} onChange={e => setForm(f => ({ ...f, reminder_end_time: e.target.value }))} /></label>
            <label className="form-label">Saat aralığı<input type="number" min="15" step="15" className="form-input" value={form.reminder_interval_minutes} onChange={e => setForm(f => ({ ...f, reminder_interval_minutes: e.target.value }))} /></label>
            <label className="form-label">Marka<select className="form-select" value={form.brand_id} onChange={e => setForm(f => ({ ...f, brand_id: e.target.value }))}><option value="">Seçin</option>{brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
            <label className="form-label">Tedarikçi<input className="form-input" value={form.supplier_name} onChange={e => setForm(f => ({ ...f, supplier_name: e.target.value }))} /></label>
            <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
              <span className="badge badge-amber">2</span>
              <strong style={{ fontSize: '12px' }}>Personel giriş / güvenlik bilgileri</strong>
              <span style={{ color: 'var(--text3)', fontSize: '11px' }}>fotoğraftaki günlük giriş formu ve resmi yazı aynı kayıttan hazırlanır</span>
            </div>
            <label className="form-label">Tırcı adı<input className="form-input" value={form.driver_name} onChange={e => setForm(f => ({ ...f, driver_name: e.target.value }))} /></label>
            <label className="form-label">Kimlik türü<select className="form-select" value={form.identity_type} onChange={e => setForm(f => ({ ...f, identity_type: e.target.value }))}><option value="tc">T.C. Kimlik</option><option value="passport">Pasaport</option></select></label>
            <label className="form-label">TC / Pasaport / Sicil no<input className="form-input" value={form.driver_tc} onChange={e => setForm(f => ({ ...f, driver_tc: e.target.value }))} /></label>
            <label className="form-label">Telefon<input className="form-input" value={form.driver_phone} onChange={e => setForm(f => ({ ...f, driver_phone: e.target.value }))} /></label>
            <label className="form-label">Plaka<input className="form-input" value={form.plate} onChange={e => setForm(f => ({ ...f, plate: e.target.value.toUpperCase() }))} /></label>
            <label className="form-label">Dorse<input className="form-input" value={form.trailer_plate} onChange={e => setForm(f => ({ ...f, trailer_plate: e.target.value.toUpperCase() }))} /></label>
            <label className="form-label" style={{ gridColumn: '1 / -1' }}>Ziyaret edilecek firma<input className="form-input" value={form.visit_company} onChange={e => setForm(f => ({ ...f, visit_company: e.target.value }))} placeholder="AVS Küresel Gıda Tedarik ve Yönetim A.Ş." /></label>
            <label className="form-label">Ziyaret edilecek kişi<input className="form-input" value={form.host_person_name} onChange={e => setForm(f => ({ ...f, host_person_name: e.target.value }))} /></label>
            <label className="form-label">Yetkili telefonu<input className="form-input" value={form.host_person_phone} onChange={e => setForm(f => ({ ...f, host_person_phone: e.target.value }))} /></label>
            <label className="form-label">Saha giriş nedeni<input className="form-input" value={form.entry_reason} onChange={e => setForm(f => ({ ...f, entry_reason: e.target.value }))} /></label>
            <label className="form-label">Çalışma yapacağı bölge<input className="form-input" value={form.work_area} onChange={e => setForm(f => ({ ...f, work_area: e.target.value }))} placeholder="FPU Kamp Alanı" /></label>
            <label className="form-label">Ana merkez mail<input type="email" className="form-input" value={form.center_email} onChange={e => setForm(f => ({ ...f, center_email: e.target.value }))} /></label>
            <label className="form-label" style={{ gridColumn: '1 / -1' }}>Not<input className="form-input" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} /></label>
            <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', paddingTop: '9px', borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-primary" disabled={!form.arrival_date || !form.plate.trim() || create.isPending} onClick={() => create.mutate()}>{create.isPending ? 'Kaydediliyor…' : editingTruckId ? 'Kaydı Güncelle ve Çıktıları Yenile' : 'Tır Kaydı Oluştur'}</button>
              <span style={{ color: 'var(--text3)', fontSize: '10px' }}>Kayıttan sonra PDF, Excel ve PNG düğmeleri otomatik aktifleşir.</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(320px, .65fr)', gap: '12px', alignItems: 'start' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                {truckFilterDefs.map(f => {
                  const counts = {
                    action: actionTruckCount,
                    mail: truckStats.mail,
                    ready: truckStats.ready,
                    missing: truckStats.missing,
                    photo: truckStats.noPhoto,
                    today: truckStats.today,
                    late: truckStats.overdue,
                    all: truckStats.total,
                  }
                  return (
                    <button key={f.key} className={`btn btn-sm ${truckFilter === f.key ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTruckFilter(f.key)}>
                      {f.label} <span style={{ fontFamily: 'var(--mono)' }}>{nf(counts[f.key] || 0)}</span>
                    </button>
                  )
                })}
              </div>
              <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
                <table className="data-table" style={{ fontSize: '11px', minWidth: '1040px' }}>
                  <thead><tr>{['Geliş', 'Mail', 'Durum', 'Marka/Tedarikçi', 'Tırcı / Sicil', 'Araç', 'İletişim', 'Eksik', 'Foto', 'Kontrol'].map(h => <th key={h} style={{ textAlign: h === 'Kontrol' ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {filteredTrucks.map(t => {
                      const missing = t.missing_mail_fields || []
                      const selected = selectedTruck?.id === t.id
                      return (
                        <tr
                          key={t.id}
                          onClick={() => setSelectedTruckId(t.id)}
                          style={{
                            cursor: 'pointer',
                            background: selected
                              ? 'color-mix(in srgb, var(--blue) 12%, transparent)'
                              : t.deadline_passed || t.arrival_phase === 'late'
                                ? 'color-mix(in srgb, var(--red) 7%, transparent)'
                                : undefined,
                          }}
                        >
                          <td>
                            <div style={{ fontFamily: 'var(--mono)', fontWeight: 800 }}>{t.arrival_date}</div>
                            <div style={{ fontFamily: 'var(--mono)', color: 'var(--text3)', fontSize: '10px' }}>{t.arrival_window}</div>
                          </td>
                          <td>
                            <span className={`badge ${truckBadgeBySeverity(t.mail_severity)}`}>{t.mail_phase_label || (t.mail_sent_at ? 'Mail atıldı' : 'Bekliyor')}</span>
                            <div style={{ fontFamily: 'var(--mono)', color: t.deadline_passed ? 'var(--red)' : 'var(--text3)', fontSize: '10px', marginTop: '4px' }}>{t.mail_deadline_label}</div>
                          </td>
                          <td>
                            <span className={`badge ${t.status === 'arrived' ? 'badge-green' : t.status === 'cancelled' ? 'badge-gray' : t.mail_sent_at ? 'badge-blue' : 'badge-amber'}`}>{t.status_label}</span>
                            <div style={{ marginTop: '4px' }}><span className={`badge ${truckBadgeBySeverity(t.arrival_severity)}`}>{t.arrival_phase_label || 'Planlı'}</span></div>
                          </td>
                          <td>{t.brand_name || t.supplier_name || '—'}</td>
                          <td>
                            <div>{t.driver_name || '—'}</div>
                            <div style={{ fontFamily: 'var(--mono)', color: 'var(--text3)', fontSize: '10px' }}>{t.driver_tc || 'sicil yok'}</div>
                          </td>
                          <td>
                            <div style={{ fontFamily: 'var(--mono)', fontWeight: 800 }}>{t.plate}</div>
                            <div style={{ fontFamily: 'var(--mono)', color: 'var(--text3)', fontSize: '10px' }}>{t.trailer_plate || 'dorse yok'}</div>
                          </td>
                          <td>
                            <div style={{ fontFamily: 'var(--mono)' }}>{t.driver_phone || '—'}</div>
                            <div style={{ color: 'var(--text3)', fontSize: '10px' }}>{t.center_email || 'mail yok'}</div>
                          </td>
                          <td style={{ color: missing.length ? 'var(--red)' : 'var(--green)', maxWidth: '210px' }}>{missing.length ? missing.join(', ') : 'Tamam'}</td>
                          <td style={{ fontFamily: 'var(--mono)', color: t.photo_count ? 'var(--green)' : 'var(--accent)' }}>{nf(t.photo_count || 0)}</td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); setPhotoForm(f => ({ ...f, truck_arrival_id: String(t.id), move_date: t.arrival_date })); fileRef.current?.click() }}>Foto</button>
                            <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); markChecked.mutate(t.id) }}>Kontrol</button>
                          </td>
                        </tr>
                      )
                    })}
                    {filteredTrucks.length === 0 && <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--text3)', padding: '14px' }}>Bu filtrede tır kaydı yok</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface2)', padding: '12px', minHeight: '280px' }}>
              {selectedTruck ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div>
                      <div style={{ fontFamily: 'var(--mono)', fontWeight: 900, fontSize: '17px' }}>{selectedTruck.vehicle_summary || selectedTruck.plate}</div>
                      <div style={{ color: 'var(--text2)', fontSize: '12px' }}>{selectedTruck.brand_name || selectedTruck.supplier_name || 'Tedarikçi yok'} · {selectedTruck.arrival_date} {selectedTruck.arrival_window}</div>
                    </div>
                    <span className={`badge ${truckBadgeBySeverity(selectedTruck.mail_severity)}`}>{selectedTruck.mail_phase_label}</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '8px', background: 'var(--surface)' }}>
                      <div style={{ color: 'var(--text3)', fontSize: '10px' }}>Mail durumu</div>
                      <strong style={{ color: selectedTruck.deadline_passed ? 'var(--red)' : 'var(--text)' }}>{selectedTruck.mail_notice}</strong>
                      {selectedTruck.mail_queue && (
                        <div style={{ color: selectedTruck.mail_queue.failed ? 'var(--red)' : 'var(--text3)', fontFamily: 'var(--mono)', fontSize: '10px', marginTop: '4px' }}>
                          İş #{selectedTruck.mail_queue.job_id} · {selectedTruck.mail_queue.attempts}/{selectedTruck.mail_queue.max_attempts} deneme
                        </div>
                      )}
                    </div>
                    <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '8px', background: 'var(--surface)' }}>
                      <div style={{ color: 'var(--text3)', fontSize: '10px' }}>Geliş durumu</div>
                      <strong>{selectedTruck.arrival_notice}</strong>
                    </div>
                  </div>

                  <div style={{ border: '1px solid color-mix(in srgb, var(--teal) 38%, var(--border))', borderRadius: '8px', background: 'color-mix(in srgb, var(--teal) 6%, var(--surface))', padding: '9px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', marginBottom: '7px' }}>
                      <div>
                        <strong style={{ fontSize: '12px' }}>PERSONEL GİRİŞ KARTI</strong>
                        <div style={{ color: 'var(--text3)', fontSize: '10px', marginTop: '2px' }}>Mail eki ve ana merkez bildirimi için tek kayıt</div>
                      </div>
                      <span className={`badge ${(selectedTruck.missing_mail_fields || []).length ? 'badge-red' : 'badge-green'}`}>
                        {(selectedTruck.missing_mail_fields || []).length ? `${selectedTruck.missing_mail_fields.length} eksik alan` : 'Çıktıya hazır'}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px 10px', fontSize: '11px' }}>
                      {[
                        ['Adı soyadı', selectedTruck.gate_entry?.full_name || selectedTruck.driver_name],
                        ['Kimlik / sicil', `${selectedTruck.gate_entry?.identity_label || 'T.C. Kimlik'} · ${selectedTruck.gate_entry?.identity_no || selectedTruck.driver_tc || '—'}`],
                        ['Telefon', selectedTruck.gate_entry?.phone || selectedTruck.driver_phone],
                        ['Araç / dorse', selectedTruck.vehicle_summary],
                        ['Ziyaret firması', selectedTruck.gate_entry?.visit_company || selectedTruck.visit_company],
                        ['Ziyaret kişisi', [selectedTruck.gate_entry?.host_person_name || selectedTruck.host_person_name, selectedTruck.gate_entry?.host_person_phone || selectedTruck.host_person_phone].filter(Boolean).join(' · ')],
                        ['Giriş tarihi / saati', `${selectedTruck.arrival_date} · ${selectedTruck.arrival_window}`],
                        ['Giriş nedeni', selectedTruck.gate_entry?.entry_reason || selectedTruck.entry_reason],
                        ['Çalışma bölgesi', selectedTruck.gate_entry?.work_area || selectedTruck.work_area],
                      ].map(([key, value]) => (
                        <div key={key} style={{ minWidth: 0 }}>
                          <div style={{ color: 'var(--text3)', fontSize: '9px', textTransform: 'uppercase' }}>{key}</div>
                          <strong style={{ display: 'block', overflowWrap: 'anywhere' }}>{value || '—'}</strong>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: '10px', paddingTop: '9px', borderTop: '1px solid color-mix(in srgb, var(--teal) 24%, var(--border))', display: 'flex', gap: '8px', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '11px' }}>PAYLAŞIM ÇIKTILARI</div>
                        <div style={{ color: 'var(--text3)', fontSize: '9px' }}>PDF resmi yazı · Excel düzenlenebilir tablo · PNG hızlı paylaşım</div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button className="btn btn-primary btn-sm" disabled={Boolean(gateExporting)} onClick={() => downloadGateEntryPdf(selectedTruck)}>{gateExporting === 'pdf' ? 'Hazırlanıyor…' : 'PDF İndir'}</button>
                        <button className="btn btn-ghost btn-sm" disabled={Boolean(gateExporting)} onClick={() => downloadGateEntryExcel(selectedTruck)}>{gateExporting === 'excel' ? 'Hazırlanıyor…' : 'Excel İndir'}</button>
                        <button className="btn btn-ghost btn-sm" disabled={Boolean(gateExporting)} onClick={() => downloadGateEntryPng(selectedTruck)}>{gateExporting === 'png' ? 'Hazırlanıyor…' : 'PNG Görsel'}</button>
                      </div>
                    </div>
                  </div>

                  <div style={{ border: '1px solid color-mix(in srgb, var(--blue) 35%, var(--border))', borderRadius: '8px', background: 'color-mix(in srgb, var(--blue) 6%, var(--surface))', padding: '9px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', marginBottom: '7px' }}>
                      <strong style={{ fontSize: '12px' }}>Ana merkez mail taslağı</strong>
                      <button className="btn btn-ghost btn-sm" onClick={() => copyTruckMail(selectedTruck)}>Taslağı Kopyala</button>
                    </div>
                    <div style={{ display: 'grid', gap: '5px', fontSize: '11px' }}>
                      <div><span style={{ color: 'var(--text3)' }}>Alıcı:</span> <span style={{ fontFamily: 'var(--mono)' }}>{selectedTruck.mail_preview?.to || selectedTruck.center_email || '—'}</span></div>
                      <div><span style={{ color: 'var(--text3)' }}>Konu:</span> <span style={{ fontWeight: 700 }}>{selectedTruck.mail_preview?.subject || selectedTruck.mail_subject || '—'}</span></div>
                      <textarea className="form-input" readOnly value={selectedTruck.mail_preview?.body || selectedTruck.mail_body || ''} style={{ minHeight: '150px', fontFamily: 'var(--mono)', fontSize: '11px', resize: 'vertical', whiteSpace: 'pre-wrap' }} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px' }}>
                    {(selectedTruck.mail_checklist || []).map(item => (
                      <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid var(--border)', borderRadius: '7px', padding: '6px', background: item.ok ? 'color-mix(in srgb, var(--green) 5%, var(--surface))' : 'color-mix(in srgb, var(--red) 5%, var(--surface))' }}>
                        <span className={`badge ${item.ok ? 'badge-green' : 'badge-red'}`}>{item.ok ? 'OK' : 'Eksik'}</span>
                        <span style={{ fontSize: '11px' }}>{item.label}</span>
                      </div>
                    ))}
                  </div>

                  {selectedTruck.action_items?.length > 0 && (
                    <div style={{ border: '1px solid color-mix(in srgb, var(--accent) 35%, var(--border))', borderRadius: '8px', background: 'color-mix(in srgb, var(--accent) 7%, var(--surface))', padding: '8px' }}>
                      <strong style={{ fontSize: '12px' }}>Aksiyon listesi</strong>
                      <ul style={{ margin: '6px 0 0 16px', padding: 0, color: 'var(--text2)', fontSize: '11px' }}>
                        {selectedTruck.action_items.map((a, idx) => <li key={`${a}-${idx}`}>{a}</li>)}
                      </ul>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {isManager && !selectedTruck.mail_sent_at && (
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={!selectedTruck.mail_ready || sendMail.isPending || selectedTruck.mail_queue?.active}
                        onClick={() => sendMail.mutate(selectedTruck.id)}
                      >
                        {sendMail.isPending
                          ? 'Kuyruğa alınıyor…'
                          : selectedTruck.mail_queue?.active
                            ? selectedTruck.mail_queue.status === 'processing' ? 'Gönderiliyor…' : 'Mail kuyrukta'
                            : selectedTruck.mail_queue?.failed ? 'Tekrar Kuyruğa Al' : 'Maili Kuyruğa Al'}
                      </button>
                    )}
                    <button className="btn btn-ghost btn-sm" onClick={() => editTruck(selectedTruck)}>Düzenle</button>
                    {!selectedTruck.mail_sent_at && <button className="btn btn-ghost btn-sm" onClick={() => markMail.mutate(selectedTruck.id)}>Mail atıldı</button>}
                    <button className="btn btn-ghost btn-sm" onClick={() => markChecked.mutate(selectedTruck.id)}>Kontrol edildi</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setPhotoForm(f => ({ ...f, truck_arrival_id: String(selectedTruck.id), move_date: selectedTruck.arrival_date })); fileRef.current?.click() }}>Foto bağla</button>
                    {selectedTruck.status !== 'arrived' && <button className="btn btn-ghost btn-sm" onClick={() => updateTruck.mutate({ id: selectedTruck.id, body: truckPayload(selectedTruck, { status: 'arrived' }) })}>Geldi</button>}
                    {selectedTruck.status !== 'cancelled' && <button className="btn btn-ghost btn-sm" onClick={() => updateTruck.mutate({ id: selectedTruck.id, body: truckPayload(selectedTruck, { status: 'cancelled' }) })}>İptal</button>}
                    {isManager && <button className="btn btn-danger btn-sm" onClick={async () => { if (await confirmDialog({ title: 'Tır Kaydı Sil', body: `${selectedTruck.plate} kaydı silinsin mi?`, danger: true })) delTruck.mutate(selectedTruck.id) }}>Sil</button>}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', color: 'var(--text3)', fontSize: '11px' }}>
                    <div>Kontrol planı: <strong style={{ color: 'var(--text2)' }}>{selectedTruck.check_plan_label}</strong></div>
                    <div>Son kontrol: <strong style={{ color: 'var(--text2)' }}>{selectedTruck.last_checked_at || '—'}</strong></div>
                    <div>Sonraki kontrol: <strong style={{ color: 'var(--text2)' }}>{selectedTruck.next_check_time || '—'}</strong></div>
                    <div>Fotoğraf: <strong style={{ color: 'var(--text2)' }}>{nf(selectedTruck.photo_count || 0)}</strong></div>
                  </div>
                </div>
              ) : (
                <div style={{ color: 'var(--text3)', textAlign: 'center', padding: '60px 10px' }}>Tır seçilmedi</div>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, .8fr)', gap: '12px' }}>
            <div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'end', marginBottom: '8px' }}>
                <label className="form-label" style={{ minWidth: '180px' }}>Tır bağlantısı<select className="form-select" value={photoForm.truck_arrival_id} onChange={e => { const t = trucks.find(x => String(x.id) === e.target.value); setPhotoForm(f => ({ ...f, truck_arrival_id: e.target.value, move_date: t?.arrival_date || f.move_date })) }}><option value="">Serbest</option>{trucks.map(t => <option key={t.id} value={t.id}>{t.arrival_date} · {t.plate}</option>)}</select></label>
                <label className="form-label" style={{ width: '130px' }}>Tarih<input type="date" className="form-input" value={photoForm.move_date} onChange={e => setPhotoForm(f => ({ ...f, move_date: e.target.value }))} /></label>
                <label className="form-label" style={{ width: '140px' }}>İrsaliye no<input className="form-input" value={photoForm.waybill_no} onChange={e => setPhotoForm(f => ({ ...f, waybill_no: e.target.value }))} /></label>
                <label className="form-label" style={{ flex: 1, minWidth: '160px' }}>Not<input className="form-input" value={photoForm.note} onChange={e => setPhotoForm(f => ({ ...f, note: e.target.value }))} /></label>
                <button className="btn btn-primary btn-sm" onClick={() => fileRef.current?.click()} disabled={uploadPhoto.isPending}>{uploadPhoto.isPending ? 'Yükleniyor…' : 'Foto Yükle'}</button>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/*" style={{ display: 'none' }} onChange={e => { const file = e.target.files?.[0]; if (file) uploadPhoto.mutate(file); e.target.value = '' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(116px, 1fr))', gap: '8px' }}>
                {photos.slice(0, 12).map(p => (
                  <button key={p.id} type="button" onClick={() => window.open(p.photo_url, '_blank')} style={{ border: '1px solid var(--border)', background: 'var(--surface2)', borderRadius: '8px', padding: '5px', cursor: 'pointer', textAlign: 'left' }}>
                    <img src={p.photo_url} alt="irsaliye" style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: '6px', display: 'block' }} />
                    <div style={{ fontSize: '10px', color: 'var(--text2)', marginTop: '4px', fontFamily: 'var(--mono)' }}>{p.move_date}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.waybill_no || p.plate || 'irsaliye'}</div>
                  </button>
                ))}
                {photos.length === 0 && <div style={{ color: 'var(--text3)', fontSize: '12px', padding: '12px' }}>Fotoğraf yok</div>}
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ fontSize: '11px', minWidth: '430px' }}>
                <thead><tr><th>Tarih</th><th>İrsaliye</th><th>Plaka</th><th>Yükleyen</th><th></th></tr></thead>
                <tbody>
                  {photos.slice(0, 10).map(p => (
                    <tr key={p.id}>
                      <td style={{ fontFamily: 'var(--mono)' }}>{p.move_date}</td>
                      <td>{p.waybill_no || '—'}</td>
                      <td style={{ fontFamily: 'var(--mono)' }}>{p.plate || '—'}</td>
                      <td>{p.uploaded_by_name || '—'}</td>
                      <td style={{ textAlign: 'right' }}><button className="btn btn-danger btn-sm" onClick={async () => { if (await confirmDialog({ title: 'İrsaliye Fotoğrafı Sil', body: 'Fotoğraf silinsin mi?', danger: true })) delPhoto.mutate(p.id) }}>Sil</button></td>
                    </tr>
                  ))}
                  {photos.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text3)', padding: '10px' }}>Kayıt yok</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const STATUS_META = {
  pending: { label: 'Sayım yok', color: 'var(--text3)' },
  even: { label: 'Tuttu', color: 'var(--green)' },
  over: { label: 'Fazla', color: 'var(--teal)' },
  short: { label: 'Eksik', color: 'var(--red)' },
}
function MonthClosurePanel({ month, label }) {
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const isManager = user?.role === 'campus_manager'
  const [open, setOpen] = useState(false)
  const [drafts, setDrafts] = useState({}) // product_id -> { counted, reason, note }

  const { data } = useQuery({
    queryKey: ['water-reconciliation', month],
    queryFn: () => api.get('/water/reconciliation', { params: { month } }).then(r => r.data),
    enabled: open,
  })
  const rows = data?.rows || []
  const reasons = data?.reasons || []
  const locked = !!data?.locked
  const t = data?.totals

  const saveCount = useMutation({
    mutationFn: (body) => api.post('/water/stock-count', body),
    onSuccess: (_r, body) => {
      qc.invalidateQueries({ queryKey: ['water-reconciliation', month] })
      qc.invalidateQueries({ queryKey: ['water-alerts'] })
      setDrafts(prev => { const n = { ...prev }; delete n[body.product_id]; return n })
      toastOk('Sayım kaydedildi')
    },
    onError: (e) => toastErr(errMsg(e, 'Kaydedilemedi')),
  })
  const closeMonth = useMutation({
    mutationFn: () => api.post('/water/monthly-close', { month }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['water-reconciliation', month] }); toastOk(`${label} kapatıldı 🔒`) },
    onError: (e) => toastErr(errMsg(e, 'Kapatılamadı')),
  })
  const unlockMonth = useMutation({
    mutationFn: () => api.post(`/water/monthly-close/${month}/unlock`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['water-reconciliation', month] }); toastOk(`${label} kilidi açıldı 🔓`) },
    onError: (e) => toastErr(errMsg(e, 'Açılamadı')),
  })

  const setDraft = (pid, patch) => setDrafts(prev => ({ ...prev, [pid]: { ...prev[pid], ...patch } }))

  const commit = (row) => {
    const d = drafts[row.product_id] || {}
    if (d.counted == null || String(d.counted).trim() === '') return
    const counted = Number(String(d.counted).replace(',', '.'))
    if (!Number.isFinite(counted) || counted < 0) return toastErr('Geçersiz sayım miktarı')
    const diff = counted - row.system_base
    const reason = d.reason ?? row.reason
    if (diff !== 0 && !reason) return toastErr(`${row.product_name}: fark var — sebep seçin`)
    saveCount.mutate({ month, product_id: row.product_id, counted_qty: counted, counted_unit: 'adet', reason: diff !== 0 ? reason : undefined, note: d.note })
  }

  const askClose = async () => {
    if (await confirmDialog({ title: `${label} kapatılsın mı?`, message: 'Ay kilitlenir; kilitli aya girilen kayıtlar uyarı verir. Kilidi sonra açabilirsiniz.', confirmText: 'Ayı Kilitle' })) closeMonth.mutate()
  }
  const downloadPdf = async () => {
    try {
      const r = await api.get(`/water/reconciliation/${month}/pdf`, { responseType: 'blob' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(r.data)
      a.download = `su-ay-kapanis-${month}.pdf`; a.click(); URL.revokeObjectURL(a.href)
    } catch { toastErr('PDF oluşturulamadı') }
  }

  return (
    <div className="panel" style={{ marginTop: '16px', borderTop: `3px solid ${locked ? 'var(--red)' : 'var(--amber, #d97706)'}` }}>
      <div className="panel-header" style={{ alignItems: 'center', gap: '10px' }}>
        <div>
          <div className="panel-title">AY KAPANIŞI — {label} {locked && <span style={{ color: 'var(--red)', fontSize: '12px' }}>🔒 KİLİTLİ</span>}</div>
          <div className="panel-subtitle">Sistem kalanı vs fiziksel sayım — fark + açıklama + kilit</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setOpen(o => !o)}>{open ? '▲ Gizle' : '▼ Aç'}</button>
          {open && <button className="btn btn-ghost btn-sm" onClick={downloadPdf}>📄 PDF Özet</button>}
          {open && isManager && (locked
            ? <button className="btn btn-ghost btn-sm" onClick={() => unlockMonth.mutate()}>🔓 Kilidi Aç</button>
            : <button className="btn btn-primary btn-sm" onClick={askClose}>🔒 Ayı Kilitle</button>)}
        </div>
      </div>

      {open && (
        <>
          {t && (
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', margin: '4px 0 12px', fontSize: '11px', color: 'var(--text2)' }}>
              <span>{t.products} ürün</span>
              <span>· {t.counted} sayıldı</span>
              <span style={{ color: t.pending ? 'var(--amber, #d97706)' : 'var(--text3)' }}>· {t.pending} bekliyor</span>
              <span style={{ color: t.mismatch ? 'var(--red)' : 'var(--green)' }}>· {t.mismatch} farklı</span>
            </div>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ fontSize: '11px', minWidth: '900px' }}>
              <thead>
                <tr>
                  {['Marka', 'Ürün', 'Devreden', 'Gelen', 'Dağıtılan', 'Düzeltme', 'Boş İade', 'Sistem', 'Sayım', 'Fark', 'Sebep', 'Durum'].map(h => (
                    <th key={h} style={{ textAlign: h === 'Marka' || h === 'Ürün' ? 'left' : 'right', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const d = drafts[row.product_id] || {}
                  const draftCounted = d.counted != null && String(d.counted).trim() !== '' ? Number(String(d.counted).replace(',', '.')) : null
                  const effCounted = draftCounted != null ? draftCounted : row.counted_base
                  const diff = effCounted == null || !Number.isFinite(effCounted) ? row.diff_base : effCounted - row.system_base
                  const hasDiff = diff != null && diff !== 0
                  const meta = STATUS_META[diff == null ? 'pending' : diff === 0 ? 'even' : diff > 0 ? 'over' : 'short']
                  return (
                    <tr key={row.product_id}>
                      <td style={{ color: 'var(--text3)' }}>{row.brand_name || '—'}</td>
                      <td style={{ fontWeight: 600 }}>{row.product_name}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }} title={row.opening_human}>{nf(row.opening_base)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--green)' }} title={row.month_in_human}>{nf(row.month_in)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--accent)' }} title={row.month_out_human}>{nf(row.month_out)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: row.month_adjust ? (row.month_adjust > 0 ? 'var(--green)' : 'var(--red)') : 'var(--text3)' }} title={row.month_adjust_human || ''}>{row.month_adjust ? (row.month_adjust > 0 ? '+' : '') + nf(row.month_adjust) : '·'}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text3)' }} title={row.month_return_human}>{row.month_return ? nf(row.month_return) : '·'}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600 }} title={row.system_human}>{nf(row.system_base)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <input aria-label={`${row.product_name} sayım`} inputMode="decimal"
                          defaultValue={row.counted_base ?? ''}
                          onChange={e => setDraft(row.product_id, { counted: e.target.value })}
                          onKeyDown={e => { if (e.key === 'Enter') commit(row) }}
                          onBlur={() => commit(row)}
                          style={{ width: '68px', textAlign: 'right', fontFamily: 'var(--mono)', padding: '2px 4px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '5px', color: 'var(--text)' }} />
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: hasDiff ? 'var(--red)' : 'var(--text3)' }}>{diff == null ? '·' : nf(diff)}</td>
                      <td style={{ textAlign: 'right' }}>
                        {hasDiff ? (
                          <select aria-label={`${row.product_name} sebep`} value={d.reason ?? row.reason ?? ''}
                            onChange={e => setDraft(row.product_id, { reason: e.target.value })}
                            style={{ fontSize: '10px', padding: '2px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '5px', color: 'var(--text)', maxWidth: '110px' }}>
                            <option value="">— seç —</option>
                            {reasons.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                          </select>
                        ) : <span style={{ color: 'var(--text3)' }}>—</span>}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '10px', fontWeight: 600, color: meta.color }}>{meta.label}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────── Trend & Analiz (V2) ───────────────────────────
function TrendPanel() {
  const [open, setOpen] = useState(false)
  const [months, setMonths] = useState(6)
  const today = todayStr()
  const { data } = useQuery({
    queryKey: ['water-trends', today, months],
    queryFn: () => api.get('/water/trends', { params: { today, months } }).then(r => r.data),
    enabled: open,
  })
  const monthly = data?.monthly || []
  const zones = data?.zones || []
  const products = data?.products || []
  const maxFlow = Math.max(1, ...monthly.map(m => Math.max(m.in_base, m.out_base)))
  const maxZone = Math.max(1, ...zones.map(z => z.total))

  return (
    <div className="panel" style={{ marginTop: '16px', borderTop: '3px solid var(--teal)' }}>
      <div className="panel-header" style={{ alignItems: 'center' }}>
        <div>
          <div className="panel-title">📈 TREND & ANALİZ</div>
          <div className="panel-subtitle">aylık gelen/dağıtım + en çok tüketen bölge/ürün</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          {open && (
            <select className="form-select" aria-label="Dönem" value={months} onChange={e => setMonths(+e.target.value)} style={{ fontSize: '12px', width: 'auto' }}>
              {[3, 6, 12].map(m => <option key={m} value={m}>Son {m} ay</option>)}
            </select>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => setOpen(o => !o)}>{open ? '▲ Gizle' : '▼ Aç'}</button>
        </div>
      </div>
      {open && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '18px', paddingTop: '4px' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', marginBottom: '8px' }}>AYLIK GELEN / DAĞITIM</div>
            {monthly.map(m => (
              <div key={m.month} style={{ marginBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text3)' }}><span style={{ fontFamily: 'var(--mono)' }}>{m.month}</span><span>↓{nf(m.in_base)} · ↑{nf(m.out_base)}</span></div>
                <div style={{ height: '9px', marginTop: '2px' }}><div style={{ width: `${(m.in_base / maxFlow) * 100}%`, height: '100%', background: 'var(--green)', borderRadius: '2px' }} /></div>
                <div style={{ height: '9px', marginTop: '2px' }}><div style={{ width: `${(m.out_base / maxFlow) * 100}%`, height: '100%', background: 'var(--accent)', borderRadius: '2px' }} /></div>
              </div>
            ))}
            {monthly.length === 0 && <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Veri yok</div>}
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', marginBottom: '8px' }}>EN ÇOK TÜKETEN BÖLGELER</div>
            {zones.map(z => (
              <div key={z.zone_id} style={{ marginBottom: '7px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}><span style={{ fontWeight: 600 }}>{z.zone_name}</span><span style={{ fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{nf(z.total)}</span></div>
                <div style={{ height: '8px', background: 'var(--surface2)', borderRadius: '3px', marginTop: '2px' }}><div style={{ width: `${(z.total / maxZone) * 100}%`, height: '100%', background: 'var(--teal)', borderRadius: '3px' }} /></div>
              </div>
            ))}
            {zones.length === 0 && <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Veri yok</div>}
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', marginBottom: '8px' }}>EN ÇOK DAĞITILAN ÜRÜNLER</div>
            <table className="data-table" style={{ fontSize: '11px' }}>
              <tbody>
                {products.map(p => (
                  <tr key={p.product_id}>
                    <td>{p.brand_name ? `${p.brand_name} · ` : ''}{p.name}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{p.out_human || nf(p.out)}</td>
                  </tr>
                ))}
                {products.length === 0 && <tr><td style={{ color: 'var(--text3)' }}>Veri yok</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function MonthlyReportPanel({ summary, from, to, label }) {
  const [selectedDay, setSelectedDay] = useState(null)
  const dailyMap = useMemo(() => {
    const m = new Map()
    ;(summary?.daily || []).forEach(d => m.set(d.move_date, d))
    return m
  }, [summary])
  const days = useMemo(() => dateRange(from, to), [from, to])
  const maxFlow = Math.max(1, ...(summary?.daily || []).map(d => Math.max(d.in_base || 0, d.out_base || 0)))
  const topZones = useMemo(() => {
    const m = new Map()
    ;(summary?.zones || []).forEach(z => {
      const cur = m.get(z.zone_id) || { zone_id: z.zone_id, zone_name: z.zone_name, total: 0, products: [] }
      cur.total += z.total_out || 0
      cur.products.push(`${z.product_name}: ${nf(z.total_out)}`)
      m.set(z.zone_id, cur)
    })
    return [...m.values()].sort((a, b) => b.total - a.total).slice(0, 8)
  }, [summary])
  const stock = summary?.stock || []
  const totals = summary?.totals || {}
  const reconcileRows = useMemo(() => [...stock].sort((a, b) => {
    const aRisk = (a.negative ? 2 : 0) + (a.period_net < 0 ? 1 : 0)
    const bRisk = (b.negative ? 2 : 0) + (b.period_net < 0 ? 1 : 0)
    return bRisk - aRisk || Math.abs(b.period_net || 0) - Math.abs(a.period_net || 0)
  }), [stock])
  const busyDays = useMemo(() => days.map(iso => ({ iso, ...(dailyMap.get(iso) || { in_base: 0, out_base: 0 }) }))
    .filter(d => (d.in_base || 0) > 0 || (d.out_base || 0) > 0)
    .sort((a, b) => b.iso.localeCompare(a.iso)), [days, dailyMap])

  return (
    <>
    <div className="panel" style={{ marginTop: '16px', borderTop: '3px solid var(--teal)' }}>
      <div className="panel-header" style={{ alignItems: 'flex-start', gap: '10px' }}>
        <div>
          <div className="panel-title">AYLIK RAPOR — {label}</div>
          <div className="panel-subtitle">Gün gün akış, eldeki stok ve bölge dağıtım özeti</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(86px, 1fr))', gap: '8px', marginLeft: 'auto', minWidth: '360px' }}>
          {[
            ['Gelen', totals.period_in, 'var(--green)'],
            ['Dağıtım', totals.period_out, 'var(--accent)'],
            ['Ay Farkı', totals.period_net, (totals.period_net || 0) < 0 ? 'var(--red)' : 'var(--teal)'],
            ['Stok', totals.balance, (totals.balance || 0) < 0 ? 'var(--red)' : 'var(--teal)'],
            ['Eksi', totals.deficit_total, (totals.deficit_total || 0) > 0 ? 'var(--red)' : 'var(--text3)'],
          ].map(([name, value, color]) => (
            <div key={name} style={{ border: '1px solid var(--border)', background: 'var(--surface2)', padding: '7px 9px', borderRadius: '8px', textAlign: 'right' }}>
              <div style={{ fontSize: '9px', color: 'var(--text3)' }}>{name}</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: '18px', color }}>{nf(value)}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="panel-body" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(280px, .9fr)', gap: '14px' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', marginBottom: '8px' }}>GÜNLÜK ÇİZELGE</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(86px, 1fr))', gap: '7px' }}>
            {days.map(iso => {
              const d = dailyMap.get(iso) || { in_base: 0, out_base: 0 }
              const hasIn = (d.in_base || 0) > 0
              const hasOut = (d.out_base || 0) > 0
              const intensity = Math.min(1, Math.max(d.in_base || 0, d.out_base || 0) / maxFlow)
              return (
                <button
                  key={iso}
                  type="button"
                  data-testid={`water-day-${iso}`}
                  onClick={() => setSelectedDay(iso)}
                  title={`${iso} · gelen ${nf(d.in_base)} · dağıtım ${nf(d.out_base)}`}
                  style={{
                    minHeight: '74px',
                    border: `1px solid ${hasIn || hasOut ? 'rgba(20,184,166,.55)' : 'var(--border)'}`,
                    borderLeft: `4px solid ${hasOut ? 'var(--accent)' : hasIn ? 'var(--green)' : 'var(--border)'}`,
                    background: hasIn || hasOut ? `rgba(20,184,166,${0.06 + intensity * 0.12})` : 'var(--surface2)',
                    borderRadius: '8px',
                    padding: '7px',
                    cursor: 'pointer',
                    color: 'var(--text)',
                    font: 'inherit',
                    textAlign: 'left',
                    width: '100%',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px', alignItems: 'baseline' }}>
                    <strong style={{ fontFamily: 'var(--display)', fontSize: '18px', color: hasOut ? 'var(--accent)' : 'var(--text)' }}>{iso.slice(-2)}</strong>
                    <span style={{ fontSize: '9px', color: 'var(--text3)' }}>{dayShort(iso)}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginTop: '7px', fontFamily: 'var(--mono)', fontSize: '10px' }}>
                    <span style={{ color: hasIn ? 'var(--green)' : 'var(--text3)' }}>G {nf(d.in_base)}</span>
                    <span style={{ color: hasOut ? 'var(--accent)' : 'var(--text3)', textAlign: 'right' }}>D {nf(d.out_base)}</span>
                  </div>
                </button>
              )
            })}
          </div>
          {busyDays.length > 0 && (
            <div style={{ marginTop: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', marginBottom: '8px' }}>HAREKETLİ GÜNLER</div>
              <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'auto', maxHeight: '190px' }}>
                <table className="data-table" style={{ fontSize: '11px' }}>
                  <tbody>
                    {busyDays.map(d => (
                      <tr key={d.iso} onClick={() => setSelectedDay(d.iso)} style={{ cursor: 'pointer' }} title={`${d.iso} günlük defteri`}>
                        <td>
                          <div style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{d.iso}</div>
                          <div style={{ color: 'var(--text3)', fontSize: '9px' }}>{dayShort(d.iso)}</div>
                        </td>
                        <td style={{ color: 'var(--green)', fontFamily: 'var(--mono)' }}>G {nf(d.in_base)}</td>
                        <td style={{ color: 'var(--accent)', fontFamily: 'var(--mono)', textAlign: 'right' }}>D {nf(d.out_base)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', marginBottom: '8px' }}>AY SONU UYUŞTURMA</div>
            <div style={{ maxHeight: '250px', overflow: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
              <table className="data-table" style={{ fontSize: '11px', minWidth: '560px' }}>
                <thead>
                  <tr>
                    <th>Ürün</th>
                    <th style={{ textAlign: 'right' }}>Gelen</th>
                    <th style={{ textAlign: 'right' }}>Dağıtım</th>
                    <th style={{ textAlign: 'right' }}>Ay Farkı</th>
                    <th style={{ textAlign: 'right' }}>Kalan</th>
                    <th>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {reconcileRows.map(s => {
                    const periodNet = s.period_net || 0
                    const bad = s.negative || periodNet < 0
                    const status = s.negative ? 'EKSİ STOK' : periodNet < 0 ? 'AY EKSİ' : periodNet > 0 ? 'FAZLA' : 'TAM'
                    return (
                      <tr key={s.product_id} style={{ background: bad ? 'rgba(239,68,68,.06)' : undefined }}>
                        <td>
                          <div style={{ fontWeight: 700 }}>{s.brand_name ? `${s.brand_name} · ` : ''}{s.name}</div>
                          <div style={{ color: 'var(--text3)', fontSize: '9px' }}>{s.unit_label}</div>
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--green)' }}>{s.period_in_human || humanQty(s, s.period_in)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{s.period_out_human || humanQty(s, s.period_out)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: periodNet < 0 ? 'var(--red)' : 'var(--teal)', fontWeight: 700 }}>{s.period_net_human || humanQty(s, periodNet)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: s.negative ? 'var(--red)' : 'var(--text)', fontWeight: 700 }}>{s.balance_human || humanQty(s, s.balance)}</td>
                        <td><span style={{ color: bad ? 'var(--red)' : 'var(--teal)', fontWeight: 800 }}>{status}</span></td>
                      </tr>
                    )
                  })}
                  {reconcileRows.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text3)', padding: '12px' }}>Uyuşturma verisi yok</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', marginBottom: '8px' }}>ELDEKİ STOK</div>
            <div style={{ maxHeight: '220px', overflow: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
              <table className="data-table" style={{ fontSize: '11px' }}>
                <tbody>
                  {stock.map(s => (
                    <tr key={s.product_id} style={{ background: s.low ? 'rgba(239,68,68,.06)' : undefined }}>
                      <td style={{ fontWeight: 600 }}>{s.brand_name ? `${s.brand_name} · ` : ''}{s.name}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: s.negative ? 'var(--red)' : s.low ? 'var(--accent)' : 'var(--text)' }}>{s.balance_human || nf(s.balance)}</td>
                    </tr>
                  ))}
                  {stock.length === 0 && <tr><td style={{ textAlign: 'center', color: 'var(--text3)', padding: '12px' }}>Stok verisi yok</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', marginBottom: '8px' }}>EN ÇOK DAĞITILAN BÖLGELER</div>
            <div style={{ maxHeight: '220px', overflow: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
              <table className="data-table" style={{ fontSize: '11px' }}>
                <tbody>
                  {topZones.map(z => (
                    <tr key={z.zone_id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{z.zone_name}</div>
                        <div style={{ color: 'var(--text3)', fontSize: '9px' }}>{z.products.slice(0, 2).join(' · ')}</div>
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{nf(z.total)}</td>
                    </tr>
                  ))}
                  {topZones.length === 0 && <tr><td style={{ textAlign: 'center', color: 'var(--text3)', padding: '12px' }}>Bu ay dağıtım yok</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
    {selectedDay && <DailyDistributionModal day={selectedDay} from={from} to={to} onDayChange={setSelectedDay} onClose={() => setSelectedDay(null)} />}
    </>
  )
}

// ─────────────────────────── GELEN TIR (aylık giriş) ───────────────────────────
function GelenTirPanel({ from, to, label, stockItems = [] }) {
  const qc = useQueryClient()
  const { data: products = [] } = useQuery({ queryKey: ['water-products'], queryFn: () => api.get('/water/products').then(r => r.data) })
  const { data: intakes = [] } = useQuery({ queryKey: ['water-intake', from, to], queryFn: () => api.get('/water/movements', { params: { type: 'in', from, to } }).then(r => r.data) })

  const byProduct = useMemo(() => {
    const m = new Map()
    intakes.forEach(r => {
      const cur = m.get(r.product_id) || { name: r.product_name, brand: r.brand_name, p: r, base: 0, remaining: 0 }
      cur.base += r.qty_base || 0
      cur.remaining += r.remaining_base || 0
      m.set(r.product_id, cur)
    })
    return [...m.values()].sort((a, b) => b.base - a.base)
  }, [intakes])

  // Çok-satırlı irsaliye: üstte irsaliye no + tarih tek kez, altında N ürün satırı
  const [waybill, setWaybill] = useState('')
  const [date, setDate] = useState(todayStr())
  const blankRow = { product_id: '', input_qty: '', input_unit: 'palet', note: '' }
  const [rows, setRows] = useState([{ ...blankRow }])

  const saveBatch = useMutation({
    mutationFn: (payload) => api.post('/water/intake/batch', payload),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['water-intake'] }); qc.invalidateQueries({ queryKey: ['water-summary'] })
      qc.invalidateQueries({ queryKey: ['water-pending'] }); qc.invalidateQueries({ queryKey: ['water-alerts'] })
      const m = r.data.matched ? ` · ${r.data.matched} bekleyen dağıtım eşleşti ✓` : ''
      toastOk(`${r.data.count} ürün kaydedildi${m}`)
      setRows([{ ...blankRow }]); setWaybill('')
    },
    onError: (e) => toastErr(errMsg(e, 'Kaydedilemedi')),
  })
  const updRow = (i, patch) => setRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  const addRow = () => setRows(rs => [...rs, { ...blankRow }])
  const rmRow = (i) => setRows(rs => rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs)
  const rowCalc = (r) => smartQty(r.input_qty, products.find(p => String(p.id) === String(r.product_id)), r.input_unit)
  const validRows = rows.filter(r => r.product_id && rowCalc(r).valid)
  const submit = () => {
    if (validRows.length === 0) return toastErr('En az bir geçerli ürün satırı girin')
    saveBatch.mutate({
      move_date: date, waybill_no: waybill.trim() || undefined,
      lines: validRows.map(r => { const c = rowCalc(r); return { product_id: +r.product_id, input_qty: c.input_qty, input_unit: c.input_unit, note: r.note?.trim() || undefined } }),
    })
  }

  return (
    <div className="panel" style={{ borderTop: '3px solid var(--green)' }}>
      <div className="panel-header"><div><div className="panel-title">GELEN TIR / İRSALİYE — {label}</div><div className="panel-subtitle">Çok satırlı irsaliye — tek no/tarih, N ürün; kayıtta bekleyen dağıtımlar otomatik kapanır</div></div></div>
      <div className="panel-body" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.05fr) minmax(260px, .95fr)', gap: '14px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'end' }}>
            <div style={{ flex: 1, minWidth: '140px' }}><label className="form-label">İrsaliye no</label><input className="form-input" placeholder="Ör. IRS-2026-045" value={waybill} onChange={e => setWaybill(e.target.value)} /></div>
            <div style={{ width: '150px' }}><label className="form-label">Tarih</label><input type="date" className="form-input" value={date} onChange={e => setDate(e.target.value)} /></div>
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
            <table className="data-table" style={{ fontSize: '11px', width: '100%' }}>
              <thead><tr><th>Ürün</th><th style={{ width: '78px' }}>Miktar</th><th style={{ width: '82px' }}>Birim</th><th style={{ width: '110px' }}>Hesaplanan</th><th>Not</th><th style={{ width: '30px' }}></th></tr></thead>
              <tbody>
                {rows.map((r, i) => {
                  const p = products.find(x => String(x.id) === String(r.product_id))
                  const calc = rowCalc(r)
                  return (
                    <tr key={i}>
                      <td><select className="form-select" style={{ fontSize: '11px', minWidth: '150px' }} value={r.product_id} onChange={e => {
                        const np = products.find(x => String(x.id) === e.target.value)
                        const preferred = availableUnitsForProduct(np).includes('palet') ? 'palet' : defaultUnitForProduct(np)
                        updRow(i, { product_id: e.target.value, input_unit: preferred })
                      }}>
                        <option value="">Ürün…</option>
                        {products.map(pp => <option key={pp.id} value={pp.id}>{pp.brand_name ? `${pp.brand_name} · ` : ''}{pp.name}</option>)}
                      </select></td>
                      <td><input type="text" inputMode="decimal" className="form-input" style={{ fontSize: '11px' }} placeholder="3 / 3p" value={r.input_qty} onChange={e => updRow(i, { input_qty: e.target.value })} /></td>
                      <td><select className="form-select" style={{ fontSize: '11px' }} value={coerceUnitForProduct(r.input_unit, p)} onChange={e => updRow(i, { input_unit: e.target.value })}>{unitOptionsForProduct(p).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
                      <td style={{ fontFamily: 'var(--mono)', color: calc.valid ? 'var(--green)' : 'var(--text3)' }}>{calc.valid ? nf(calc.base) : '·'}</td>
                      <td><input className="form-input" style={{ fontSize: '11px' }} placeholder="opsiyonel" value={r.note} onChange={e => updRow(i, { note: e.target.value })} /></td>
                      <td style={{ textAlign: 'center' }}>{rows.length > 1 && <button type="button" onClick={() => rmRow(i)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--red)' }}>✕</button>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addRow}>+ Ürün satırı</button>
            <button className="btn btn-primary btn-sm" onClick={submit} disabled={saveBatch.isPending || validRows.length === 0} style={{ marginLeft: 'auto' }}>{saveBatch.isPending ? 'Kaydediliyor…' : `İrsaliyeyi Kaydet (${validRows.length} ürün)`}</button>
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'auto', maxHeight: '280px' }}>
            <table className="data-table" style={{ fontSize: '11px' }}>
              <thead><tr><th>Tarih</th><th>İrsaliye</th><th>Ürün</th><th style={{ textAlign: 'right' }}>Gelen</th><th style={{ textAlign: 'right' }}>Kalan</th></tr></thead>
              <tbody>
                {intakes.slice(0, 12).map(r => (
                  <tr key={r.id}>
                    <td style={{ fontFamily: 'var(--mono)' }}>{r.move_date}</td>
                    <td style={{ fontFamily: 'var(--mono)', color: r.waybill_no ? 'var(--text)' : 'var(--text3)' }}>{r.waybill_no || '—'}</td>
                    <td>{r.brand_name ? `${r.brand_name} · ` : ''}{r.product_name}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{r.qty_human || humanQty(r, r.qty_base)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: (r.remaining_base || 0) > 0 ? 'var(--teal)' : 'var(--text3)' }}>{r.remaining_human || nf(r.remaining_base)}</td>
                  </tr>
                ))}
                {intakes.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text3)', padding: '12px' }}>Bu ay gelen tır kaydı yok</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)' }}>ELDEKİ SU/STOK</div>
          <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'auto', maxHeight: '190px' }}>
            <table className="data-table" style={{ fontSize: '11px' }}>
              <tbody>
                {stockItems.map(s => (
                  <tr key={s.product_id} style={{ background: s.low ? 'rgba(239,68,68,.06)' : undefined }}>
                    <td style={{ fontWeight: 600 }}>{s.brand_name ? `${s.brand_name} · ` : ''}{s.name}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: s.low ? 'var(--red)' : 'var(--text)' }}>{s.balance_human || nf(s.balance)}</td>
                  </tr>
                ))}
                {stockItems.length === 0 && <tr><td style={{ textAlign: 'center', color: 'var(--text3)', padding: '12px' }}>Stok verisi yok</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', marginTop: '4px' }}>BU AY GELEN ÜRÜN ÖZETİ</div>
          <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'auto', maxHeight: '190px' }}>
            <table className="data-table" style={{ fontSize: '11px' }}>
              <tbody>
                {byProduct.map(r => (
                  <tr key={r.name + (r.brand || '')}>
                    <td style={{ color: 'var(--text2)' }}>
                      <div style={{ fontWeight: 600 }}>{r.brand ? `${r.brand} · ` : ''}{r.name}</div>
                      <div style={{ color: 'var(--text3)', fontSize: '9px' }}>irsaliye kalan {humanQty(r.p, r.remaining)}</div>
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{humanQty(r.p, r.base)}</td>
                  </tr>
                ))}
                {byProduct.length === 0 && <tr><td style={{ textAlign: 'center', color: 'var(--text3)', padding: '12px' }}>Gelen ürün özeti yok</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
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
  useEffect(() => {
    const previous = document.body.style.overflow
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])

  return createPortal(
    <>
      <div
        data-testid="water-modal-overlay"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,.58)',
          zIndex: 1080,
        }}
        onClick={onClose}
      />
      <div
        className="panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid="water-bottom-sheet"
        style={{
          position: 'fixed',
          left: '50%',
          bottom: 0,
          zIndex: 1081,
          width: 'calc(100vw - 24px)',
          maxWidth: width,
          height: 'min(86vh, 860px)',
          maxHeight: 'min(88vh, 880px)',
          minHeight: 'min(360px, calc(100vh - 24px))',
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: '16px 16px 0 0',
          boxShadow: '0 -24px 72px rgba(0,0,0,.48)',
          transform: 'translateX(-50%)',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 5px', background: 'var(--surface)' }}>
          <div style={{ width: '42px', height: '4px', borderRadius: '999px', background: 'var(--border)' }} />
        </div>
        <div style={{ height: '2px', background: 'var(--accent)' }} />
        <div className="panel-header" style={{ flexShrink: 0, background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
          <div className="panel-title">{title}</div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕ Kapat</button>
        </div>
        <div className="panel-body" style={{ overflow: 'auto', minHeight: 0, paddingBottom: 'max(18px, env(safe-area-inset-bottom))' }}>{children}</div>
      </div>
    </>,
    document.body
  )
}

function SettingsModal({ onClose }) {
  const [tab, setTab] = useState('firmalar')
  return (
    <Modal title="AYARLAR" onClose={onClose} width="900px">
      <div style={{ display: 'flex', gap: '2px', marginBottom: '14px', background: 'var(--surface2)', borderRadius: '8px', padding: '2px', border: '1px solid var(--border)', width: 'fit-content' }}>
        {[['firmalar', '📍 Dağıtım Yerleri'], ['urunler', '💧 Ürünler & Marka'], ['sablonlar', '🗂 Şablonlar']].map(([id, l]) => (
          <button key={id} onClick={() => setTab(id)} style={{ border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', cursor: 'pointer', background: tab === id ? 'var(--accent)' : 'transparent', color: tab === id ? '#000' : 'var(--text3)' }}>{l}</button>
        ))}
      </div>
      {tab === 'firmalar' ? <ZonesTab /> : tab === 'urunler' ? <ProductsTab /> : <TemplatesTab />}
    </Modal>
  )
}

function AdjustModal({ onClose }) {
  const qc = useQueryClient()
  const { data: products = [] } = useQuery({ queryKey: ['water-products'], queryFn: () => api.get('/water/products').then(r => r.data) })
  const { data: adjData } = useQuery({ queryKey: ['water-adjustments'], queryFn: () => api.get('/water/adjustments').then(r => r.data) })
  const rows = adjData?.rows || []
  const reasons = adjData?.reasons || []
  const [form, setForm] = useState({ product_id: '', direction: 'in', input_qty: '', input_unit: 'adet', move_date: todayStr(), reason: '', note: '' })
  const selected = products.find(p => String(p.id) === String(form.product_id))
  const calc = smartQty(form.input_qty, selected, form.input_unit)
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['water-adjustments'] }); qc.invalidateQueries({ queryKey: ['water-summary'] })
    qc.invalidateQueries({ queryKey: ['water-reconciliation'] }); qc.invalidateQueries({ queryKey: ['water-alerts'] }); qc.invalidateQueries({ queryKey: ['water-pivot'] })
  }
  const create = useMutation({
    mutationFn: () => api.post('/water/adjustments', { product_id: +form.product_id, direction: form.direction, input_qty: calc.input_qty, input_unit: calc.input_unit, move_date: form.move_date, reason: form.reason, note: form.note?.trim() || undefined }),
    onSuccess: () => { invalidate(); setForm(f => ({ ...f, input_qty: '', note: '' })); toastOk('Düzeltme kaydedildi') },
    onError: (e) => toastErr(errMsg(e, 'Kaydedilemedi')),
  })
  const del = useMutation({ mutationFn: (id) => api.delete(`/water/adjustments/${id}`), onSuccess: () => { invalidate(); toastOk('Silindi') }, onError: (e) => toastErr(errMsg(e, 'Silinemedi')) })
  const submit = () => {
    if (!form.product_id) return toastErr('Ürün seçin')
    if (!calc.valid) return toastErr('Miktar girin')
    if (!form.reason) return toastErr('Sebep seçin')
    create.mutate()
  }
  const reasonLabel = (k) => reasons.find(r => r.key === k)?.label || k

  return (
    <Modal title="STOK DÜZELTME / SAYIM FİŞİ" onClose={onClose} width="760px">
      <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '10px' }}>Kontrollü stok düzeltmesi — normal dağıtımdan ayrı tutulur, ay uyuşturmasında “Düzeltme” kolonunda görünür.</div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'end', marginBottom: '12px' }}>
        <div style={{ flex: 1, minWidth: '150px' }}><label className="form-label">Ürün</label>
          <select className="form-select" value={form.product_id} onChange={e => { const p = products.find(x => String(x.id) === e.target.value); setForm(f => ({ ...f, product_id: e.target.value, input_unit: defaultUnitForProduct(p) })) }}>
            <option value="">Ürün…</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.brand_name ? `${p.brand_name} · ` : ''}{p.name}</option>)}
          </select>
        </div>
        <div><label className="form-label">Yön</label>
          <div style={{ display: 'flex', gap: '2px', background: 'var(--surface2)', borderRadius: '7px', padding: '2px', border: '1px solid var(--border)' }}>
            {[['in', '+ Artı'], ['out', '− Eksi']].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setForm(f => ({ ...f, direction: v }))} style={{ border: 'none', borderRadius: '5px', padding: '6px 10px', fontSize: '11px', cursor: 'pointer', background: form.direction === v ? (v === 'in' ? 'var(--green)' : 'var(--red)') : 'transparent', color: form.direction === v ? '#000' : 'var(--text3)', fontWeight: 700 }}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{ width: '78px' }}><label className="form-label">Miktar</label><input type="text" inputMode="decimal" className="form-input" value={form.input_qty} onChange={e => setForm(f => ({ ...f, input_qty: e.target.value }))} /></div>
        <div style={{ width: '84px' }}><label className="form-label">Birim</label><select className="form-select" value={coerceUnitForProduct(form.input_unit, selected)} onChange={e => setForm(f => ({ ...f, input_unit: e.target.value }))}>{unitOptionsForProduct(selected).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div style={{ width: '140px' }}><label className="form-label">Tarih</label><input type="date" className="form-input" value={form.move_date} onChange={e => setForm(f => ({ ...f, move_date: e.target.value }))} /></div>
      </div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'end', marginBottom: '6px' }}>
        <div style={{ width: '180px' }}><label className="form-label">Sebep</label>
          <select className="form-select" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}>
            <option value="">— seç —</option>
            {reasons.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: '150px' }}><label className="form-label">Not</label><input className="form-input" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="opsiyonel" /></div>
        <button className="btn btn-primary" disabled={create.isPending} onClick={submit}>Kaydet</button>
      </div>
      <div style={{ minHeight: '20px', fontSize: '11px', color: calc.valid ? (form.direction === 'in' ? 'var(--green)' : 'var(--red)') : 'var(--text3)', marginBottom: '10px' }}>
        {calc.valid ? `Stok etkisi: ${form.direction === 'in' ? '+' : '−'}${nf(calc.base)} ${selected?.unit_label || 'adet'}` : 'Ürün + miktar girince stok etkisi burada görünür.'}
      </div>
      <div style={{ maxHeight: '38vh', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
        <table className="data-table" style={{ fontSize: '11px' }}>
          <thead><tr><th>Tarih</th><th>Ürün</th><th style={{ textAlign: 'right' }}>Etki</th><th>Sebep</th><th>Not</th><th></th></tr></thead>
          <tbody>
            {rows.map(a => (
              <tr key={a.id}>
                <td style={{ fontFamily: 'var(--mono)' }}>{a.move_date}</td>
                <td>{a.brand_name ? `${a.brand_name} · ` : ''}{a.product_name}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600, color: a.direction === 'in' ? 'var(--green)' : 'var(--red)' }}>{a.signed_human}</td>
                <td style={{ color: 'var(--text2)' }}>{reasonLabel(a.reason)}</td>
                <td style={{ color: 'var(--text3)' }}>{a.note || '—'}</td>
                <td style={{ textAlign: 'right' }}><button className="btn btn-danger btn-sm" onClick={async () => { if (await confirmDialog({ title: 'Düzeltmeyi Sil', body: 'Bu düzeltme silinsin mi? Stok bakiyesi geri döner.', danger: true })) del.mutate(a.id) }}>Sil</button></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text3)', padding: '14px' }}>Henüz düzeltme kaydı yok</td></tr>}
          </tbody>
        </table>
      </div>
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
            Her satıra bir dağıtım yeri yaz. Örnek:<br />
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
              <thead><tr><th>Dağıtım yeri</th><th>Ürün</th><th>Miktar</th><th>Birim</th><th></th></tr></thead>
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

// ─────────────────────────── DAĞITIM YERLERİ (bölge yönetimi) ───────────────────────────
function ZonesTab() {
  const qc = useQueryClient()
  const [form, setForm] = useState({ name: '', code: '', note: '', expected_monthly: '' })
  const { data: zones = [] } = useQuery({ queryKey: ['water-zones'], queryFn: () => api.get('/water/zones').then(r => r.data) })
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['water-zones'] }); qc.invalidateQueries({ queryKey: ['water-pivot'] }) }
  const create = useMutation({ mutationFn: (p) => api.post('/water/zones', p), onSuccess: () => { invalidate(); setForm({ name: '', code: '', note: '', expected_monthly: '' }); toastOk('Dağıtım yeri eklendi') }, onError: (e) => toastErr(errMsg(e, 'Eklenemedi')) })
  const update = useMutation({ mutationFn: ({ id, ...p }) => api.put(`/water/zones/${id}`, p), onSuccess: () => { invalidate(); toastOk('Güncellendi') }, onError: (e) => toastErr(errMsg(e, 'Güncellenemedi')) })
  const del = useMutation({ mutationFn: (id) => api.delete(`/water/zones/${id}`), onSuccess: () => { invalidate(); toastOk('Silindi') }, onError: (e) => toastErr(errMsg(e, 'Silinemedi')) })
  const saveExpected = (z, value) => {
    const expected = Math.max(0, parseInt(value) || 0)
    if (expected === (z.expected_monthly || 0)) return
    update.mutate({ id: z.id, name: z.name, code: z.code, note: z.note, is_active: z.is_active !== 0, expected_monthly: expected })
  }
  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '14px' }}>
        <div style={{ flex: 1, minWidth: '150px' }}><label className="form-label">Dağıtım yeri adı</label><input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ör. OTC Kamp Alanı" /></div>
        <div style={{ width: '90px' }}><label className="form-label">Kod</label><input className="form-input" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} /></div>
        <div style={{ width: '120px' }}><label className="form-label">Beklenen/ay</label><input type="number" min="0" className="form-input" value={form.expected_monthly} onChange={e => setForm(f => ({ ...f, expected_monthly: e.target.value }))} placeholder="adet" /></div>
        <div style={{ flex: 1, minWidth: '120px' }}><label className="form-label">Not</label><input className="form-input" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} /></div>
        <button className="btn btn-primary" disabled={!form.name.trim() || create.isPending} onClick={() => create.mutate({ ...form, name: form.name.trim() })}>Ekle</button>
      </div>
      <div style={{ maxHeight: '46vh', overflowY: 'auto' }}>
        <table className="data-table" style={{ fontSize: '12px' }}>
          <thead><tr><th>Ad</th><th>Kod</th><th style={{ textAlign: 'right' }}>Beklenen/ay</th><th>Not</th><th></th></tr></thead>
          <tbody>
            {zones.map(z => (
              <tr key={z.id}>
                <td style={{ fontWeight: 600 }}>{z.name}</td>
                <td style={{ fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{z.code || '—'}</td>
                <td style={{ textAlign: 'right' }}>
                  <input type="number" min="0" aria-label={`${z.name} beklenen aylık`} defaultValue={z.expected_monthly || ''}
                    onBlur={e => saveExpected(z, e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
                    style={{ width: '72px', textAlign: 'right', fontFamily: 'var(--mono)', padding: '3px 5px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '5px', color: 'var(--text)' }} placeholder="—" />
                </td>
                <td style={{ color: 'var(--text3)' }}>{z.note || '—'}</td>
                <td style={{ textAlign: 'right' }}><button onClick={async () => { if (await confirmDialog({ title: 'Dağıtım Yerini Sil', body: `"${z.name}" silinsin mi?`, danger: true })) del.mutate(z.id) }} className="btn btn-danger btn-sm">Sil</button></td>
              </tr>
            ))}
            {zones.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text3)', padding: '16px' }}>Dağıtım yeri yok</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─────────────────────────── HIZLI GİRİŞ ŞABLONLARI ───────────────────────────
function TemplatesTab() {
  const qc = useQueryClient()
  const { data: templates = [] } = useQuery({ queryKey: ['water-templates'], queryFn: () => api.get('/water/templates').then(r => r.data) })
  const { data: products = [] } = useQuery({ queryKey: ['water-products'], queryFn: () => api.get('/water/products').then(r => r.data) })
  const { data: zones = [] } = useQuery({ queryKey: ['water-zones'], queryFn: () => api.get('/water/zones').then(r => r.data) })
  const productsById = useMemo(() => new Map(products.map(p => [p.id, p])), [products])
  const [name, setName] = useState('')
  const [lines, setLines] = useState([])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['water-templates'] })
  const create = useMutation({
    mutationFn: () => api.post('/water/templates', {
      name: name.trim(),
      lines: lines.filter(l => l.zone_id && l.product_id).map(l => ({ zone_id: +l.zone_id, product_id: +l.product_id, default_qty: l.default_qty === '' ? null : +l.default_qty, default_unit: l.default_unit })),
    }),
    onSuccess: () => { invalidate(); setName(''); setLines([]); toastOk('Şablon kaydedildi') },
    onError: (e) => toastErr(errMsg(e, 'Kaydedilemedi')),
  })
  const del = useMutation({ mutationFn: (id) => api.delete(`/water/templates/${id}`), onSuccess: () => { invalidate(); toastOk('Silindi') }, onError: (e) => toastErr(errMsg(e, 'Silinemedi')) })

  const addLine = () => setLines(ls => [...ls, { zone_id: '', product_id: '', default_qty: '', default_unit: 'adet' }])
  const updLine = (i, patch) => setLines(ls => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  const rmLine = (i) => setLines(ls => ls.filter((_, idx) => idx !== i))
  const validLines = lines.filter(l => l.zone_id && l.product_id).length

  return (
    <div>
      <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', marginBottom: '14px', background: 'var(--surface2)' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', marginBottom: '10px' }}>
          <div style={{ flex: 1 }}><label className="form-label">Şablon adı</label><input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Ör. FPU Yemekhane Rutin" /></div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={addLine}>+ Satır</button>
        </div>
        {lines.map((l, i) => {
          const prod = productsById.get(+l.product_id)
          const unitOpts = prod ? unitOptionsForProduct(prod) : [['adet', 'Adet']]
          return (
            <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
              <select className="form-select" style={{ flex: 1, fontSize: '11px' }} value={l.zone_id} onChange={e => updLine(i, { zone_id: e.target.value })}>
                <option value="">Dağıtım yeri…</option>
                {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
              <select className="form-select" style={{ flex: 1, fontSize: '11px' }} value={l.product_id} onChange={e => updLine(i, { product_id: e.target.value, default_unit: 'adet' })}>
                <option value="">Ürün…</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input type="number" min="0" className="form-input" style={{ width: '72px', fontSize: '11px' }} value={l.default_qty} onChange={e => updLine(i, { default_qty: e.target.value })} placeholder="miktar" />
              <select className="form-select" style={{ width: '90px', fontSize: '11px' }} value={l.default_unit} onChange={e => updLine(i, { default_unit: e.target.value })}>
                {unitOpts.map(([v, lab]) => <option key={v} value={v}>{lab}</option>)}
              </select>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => rmLine(i)}>✕</button>
            </div>
          )
        })}
        {lines.length === 0 && <div style={{ fontSize: '11px', color: 'var(--text3)', padding: '6px 0' }}>Satır ekleyin (dağıtım yeri + ürün + varsayılan miktar/birim).</div>}
        <button className="btn btn-primary btn-sm" style={{ marginTop: '8px' }} disabled={!name.trim() || validLines === 0 || create.isPending} onClick={() => create.mutate()}>{create.isPending ? 'Kaydediliyor…' : `Şablonu Kaydet (${validLines} satır)`}</button>
      </div>

      <div style={{ maxHeight: '38vh', overflowY: 'auto' }}>
        {templates.map(t => (
          <div key={t.id} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 700 }}>🗂 {t.name}</span>
              <span style={{ fontSize: '11px', color: 'var(--text3)' }}>{t.lines.length} satır</span>
              <button className="btn btn-danger btn-sm" style={{ marginLeft: 'auto' }} onClick={async () => { if (await confirmDialog({ title: 'Şablonu Sil', body: `"${t.name}" silinsin mi?`, danger: true })) del.mutate(t.id) }}>Sil</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '6px' }}>
              {t.lines.map(l => (
                <span key={l.id} style={{ fontSize: '10px', border: '1px solid var(--border)', background: 'var(--surface2)', borderRadius: '999px', padding: '2px 8px' }}>
                  {l.zone_name} · {l.product_name}{l.default_qty != null ? ` · ${nf(l.default_qty)} ${l.default_unit}` : ''}
                </span>
              ))}
            </div>
          </div>
        ))}
        {templates.length === 0 && <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '16px', fontSize: '12px' }}>Henüz şablon yok</div>}
      </div>
    </div>
  )
}

// ─────────────────────────── ÜRÜNLER + MARKA ───────────────────────────
function ProductsTab() {
  const qc = useQueryClient()
  const blank = { id: null, name: '', unit_label: 'adet', units_per_case: '1', cases_per_pallet: '1', min_qty: '', crit_qty: '', min_unit: 'adet', brand_id: '', is_returnable: false, is_active: true }
  const [form, setForm] = useState(blank)
  const { data: products = [] } = useQuery({ queryKey: ['water-products-all'], queryFn: () => api.get('/water/products', { params: { all: 1 } }).then(r => r.data) })
  const { data: brands = [] } = useQuery({ queryKey: ['water-brands'], queryFn: () => api.get('/water/brands').then(r => r.data) })

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['water-products-all'] }); qc.invalidateQueries({ queryKey: ['water-products'] }); qc.invalidateQueries({ queryKey: ['water-summary'] }); qc.invalidateQueries({ queryKey: ['water-pivot'] }); qc.invalidateQueries({ queryKey: ['water-deposit'] }) }
  const payload = () => {
    const upc = +form.units_per_case || 1, cpp = +form.cases_per_pallet || 1
    const productShape = { unit_label: form.unit_label, units_per_case: upc, cases_per_pallet: cpp }
    const minUnit = coerceUnitForProduct(form.min_unit, productShape)
    const mult = multiplier(productShape, minUnit)
    return { name: form.name.trim(), unit_label: form.unit_label, units_per_case: upc, cases_per_pallet: cpp, min_level: Math.round((+form.min_qty || 0) * mult), critical_level: Math.round((+form.crit_qty || 0) * mult), brand_id: form.brand_id || null, is_returnable: form.is_returnable, is_active: form.is_active }
  }
  const create = useMutation({ mutationFn: () => api.post('/water/products', payload()), onSuccess: () => { invalidate(); setForm(blank); toastOk('Ürün eklendi') }, onError: (e) => toastErr(errMsg(e, 'Eklenemedi')) })
  const update = useMutation({ mutationFn: () => api.put(`/water/products/${form.id}`, payload()), onSuccess: () => { invalidate(); setForm(blank); toastOk('Ürün güncellendi') }, onError: (e) => toastErr(errMsg(e, 'Güncellenemedi')) })
  const del = useMutation({ mutationFn: (id) => api.delete(`/water/products/${id}`), onSuccess: () => { invalidate(); toastOk('Silindi') }, onError: (e) => toastErr(errMsg(e, 'Silinemedi')) })
  const patch = useMutation({ mutationFn: (p) => api.put(`/water/products/${p.id}`, p), onSuccess: () => { invalidate(); toastOk('Güncellendi') }, onError: (e) => toastErr(errMsg(e, 'Güncellenemedi')) })

  const editProduct = (p) => setForm({ id: p.id, name: p.name, unit_label: p.unit_label, units_per_case: String(p.units_per_case), cases_per_pallet: String(p.cases_per_pallet), min_qty: p.min_level ? String(p.min_level) : '', crit_qty: p.critical_level ? String(p.critical_level) : '', min_unit: 'adet', brand_id: p.brand_id ? String(p.brand_id) : '', is_returnable: !!p.is_returnable, is_active: p.is_active !== 0 })
  const toggleActive = (p) => patch.mutate({ id: p.id, name: p.name, unit_label: p.unit_label, units_per_case: p.units_per_case, cases_per_pallet: p.cases_per_pallet, min_level: p.min_level, critical_level: p.critical_level, brand_id: p.brand_id, is_returnable: p.is_returnable, is_active: p.is_active === 0 })
  const formPackage = { unit_label: form.unit_label, units_per_case: +form.units_per_case || 1, cases_per_pallet: +form.cases_per_pallet || 1 }
  const packageMode = baseUnitForProduct(formPackage) === 'paket' ? 'packPallet'
    : baseUnitForProduct(formPackage) === 'koli' ? 'casePallet'
      : (+form.cases_per_pallet || 1) > 1 ? 'piecePallet' : 'single'
  const formUnitOptions = unitOptionsForProduct(formPackage)
  const updatePackageNumber = (field, value) => setForm(f => {
    const next = { ...f, [field]: value }
    const nextPackage = { unit_label: next.unit_label, units_per_case: +next.units_per_case || 1, cases_per_pallet: +next.cases_per_pallet || 1 }
    return { ...next, min_unit: coerceUnitForProduct(next.min_unit, nextPackage) }
  })
  const setPackageMode = (mode) => {
    if (mode === 'single') setForm(f => ({ ...f, unit_label: 'adet', units_per_case: '1', cases_per_pallet: '1', min_unit: 'adet' }))
    else if (mode === 'piecePallet') setForm(f => ({ ...f, units_per_case: '1', cases_per_pallet: f.cases_per_pallet === '1' ? '36' : f.cases_per_pallet, min_unit: 'adet' }))
    else if (mode === 'casePallet') setForm(f => ({ ...f, unit_label: 'koli', units_per_case: '1', cases_per_pallet: f.cases_per_pallet === '1' ? '140' : f.cases_per_pallet, min_unit: 'koli' }))
    else setForm(f => ({ ...f, unit_label: 'paket', units_per_case: '1', cases_per_pallet: f.cases_per_pallet === '1' ? '80' : f.cases_per_pallet, min_unit: 'paket' }))
  }
  const paletText = (p) => {
    const mult = multiplier(p, 'palet')
    if (mult <= 1 && baseUnitForProduct(p) !== 'palet') return '—'
    return `${nf(mult)} ${p.unit_label || 'adet'}`
  }
  const koliText = (p) => {
    if (baseUnitForProduct(p) === 'koli') return `1 ${p.unit_label || 'koli'}`
    return p.units_per_case > 1 ? `${nf(p.units_per_case)} ${p.unit_label}` : '—'
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '6px' }}>
        <div style={{ flex: 1, minWidth: '150px' }}><label className="form-label">{form.id ? 'Ürün düzenle' : 'Ürün adı'}</label><input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ör. 0.5 L Şişe Su" /></div>
        <div style={{ width: '80px' }}><label className="form-label">Baz birim</label><input className="form-input" value={form.unit_label} onChange={e => setForm(f => {
          const next = { ...f, unit_label: e.target.value }
          return { ...next, min_unit: coerceUnitForProduct(next.min_unit, { unit_label: next.unit_label, units_per_case: +next.units_per_case || 1, cases_per_pallet: +next.cases_per_pallet || 1 }) }
        })} /></div>
        <div style={{ minWidth: '200px' }}><label className="form-label">Paket tipi</label><div style={{ display: 'flex', gap: '2px', background: 'var(--surface2)', borderRadius: '7px', padding: '2px', border: '1px solid var(--border)' }}>
          {[['single', 'Tekil'], ['piecePallet', 'Adet+Palet'], ['casePallet', 'Koli+Palet'], ['packPallet', 'Paket+Palet']].map(([id, label]) => (
            <button key={id} type="button" onClick={() => setPackageMode(id)} style={{ border: 'none', borderRadius: '5px', padding: '6px 9px', fontSize: '10px', cursor: 'pointer', background: packageMode === id ? 'var(--accent)' : 'transparent', color: packageMode === id ? '#000' : 'var(--text3)' }}>{label}</button>
          ))}
        </div></div>
        <div style={{ width: '78px' }}><label className="form-label">Koli içi</label><input type="number" min="1" className="form-input" value={form.units_per_case} onChange={e => updatePackageNumber('units_per_case', e.target.value)} /></div>
        <div style={{ width: '86px' }}><label className="form-label">Palet çarp.</label><input type="number" min="1" className="form-input" value={form.cases_per_pallet} onChange={e => updatePackageNumber('cases_per_pallet', e.target.value)} /></div>
        <div style={{ width: '72px' }}><label className="form-label">Min. stok</label><input type="number" min="0" className="form-input" value={form.min_qty} onChange={e => setForm(f => ({ ...f, min_qty: e.target.value }))} /></div>
        <div style={{ width: '72px' }}><label className="form-label" title="Min’den düşük acil eşik">Kritik</label><input type="number" min="0" className="form-input" value={form.crit_qty} onChange={e => setForm(f => ({ ...f, crit_qty: e.target.value }))} /></div>
        <div style={{ width: '72px' }}><label className="form-label">Min. birim</label><select className="form-select" value={coerceUnitForProduct(form.min_unit, formPackage)} onChange={e => setForm(f => ({ ...f, min_unit: e.target.value }))}>{formUnitOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div style={{ minWidth: '130px' }}><label className="form-label">Marka</label><select className="form-select" value={form.brand_id} onChange={e => setForm(f => ({ ...f, brand_id: e.target.value }))}>
          <option value="">Markasız</option>{brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select></div>
        <label style={{ display: 'flex', gap: '5px', alignItems: 'center', fontSize: '11px', color: 'var(--text2)', cursor: 'pointer', paddingBottom: '9px' }} title="Boş kap iade takibi (depozito)">
          <input type="checkbox" checked={form.is_returnable} onChange={e => setForm(f => ({ ...f, is_returnable: e.target.checked }))} /> İade edilebilir
        </label>
        {form.id && (
          <label style={{ display: 'flex', gap: '5px', alignItems: 'center', fontSize: '11px', color: 'var(--text2)', cursor: 'pointer', paddingBottom: '9px' }} title="Pasif ürün yeni girişte görünmez, eski raporlarda kalır">
            <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} /> Aktif
          </label>
        )}
        {form.id && <button className="btn btn-ghost btn-sm" onClick={() => setForm(blank)}>+ Yeni</button>}
        <button className="btn btn-primary" disabled={!form.name.trim() || create.isPending || update.isPending} onClick={() => form.id ? update.mutate() : create.mutate()}>{form.id ? 'Güncelle' : 'Ekle'}</button>
      </div>
      <div style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: '12px' }}>Baz birim Excel hücresindeki ham sayıdır; ör. damacana adet, 0.33/0.5 koli, 5 L/cam paket. Palet çarpanı bu ham sayıya çevrilir. “İade edilebilir” = boş dönüşü takip edilen kaplar.</div>

      <div style={{ maxHeight: '40vh', overflowY: 'auto' }}>
        <table className="data-table" style={{ fontSize: '12px' }}>
          <thead><tr><th>Ad</th><th>Marka</th><th>Birimler</th><th style={{ textAlign: 'right' }}>1 Koli</th><th style={{ textAlign: 'right' }}>1 Palet</th><th style={{ textAlign: 'right' }}>Min.</th><th style={{ textAlign: 'right' }}>Kritik</th><th></th></tr></thead>
          <tbody>
            {products.map(p => (
              <tr key={p.id} style={{ opacity: p.is_active ? 1 : 0.5 }}>
                <td style={{ fontWeight: 600 }}>{p.name} {p.is_returnable ? <span title="İade edilebilir" style={{ fontSize: '10px', color: 'var(--teal)' }}>♻️</span> : null}{p.is_active ? null : <span style={{ fontSize: '9px', color: 'var(--text3)', marginLeft: '4px' }}>(pasif)</span>}</td>
                <td style={{ color: 'var(--text3)' }}>{p.brand_name || '—'}</td>
                <td style={{ color: 'var(--text3)' }}>{unitOptionsForProduct(p).map(([, label]) => label).join(' / ')}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{koliText(p)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{paletText(p)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: p.min_level ? 'var(--text)' : 'var(--text3)' }}>{p.min_level ? `${nf(p.min_level)}` : '—'}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: p.critical_level ? 'var(--red)' : 'var(--text3)' }}>{p.critical_level ? `${nf(p.critical_level)}` : '—'}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button onClick={() => editProduct(p)} className="btn btn-ghost btn-sm">Düzenle</button>
                  <button onClick={() => toggleActive(p)} className="btn btn-ghost btn-sm" title={p.is_active ? 'Pasife al' : 'Aktifleştir'}>{p.is_active ? 'Pasife al' : 'Aktif et'}</button>
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
  const [color, setColor] = useState('#3b82f6')
  const create = useMutation({ mutationFn: () => api.post('/water/brands', { name: name.trim(), color }), onSuccess: () => { onChange(); setName(''); toastOk('Marka eklendi') }, onError: (e) => toastErr(errMsg(e, 'Eklenemedi')) })
  const update = useMutation({ mutationFn: (b) => api.put(`/water/brands/${b.id}`, b), onSuccess: () => { onChange(); toastOk('Marka güncellendi') }, onError: (e) => toastErr(errMsg(e, 'Güncellenemedi')) })
  const del = useMutation({ mutationFn: (id) => api.delete(`/water/brands/${id}`), onSuccess: () => { onChange(); toastOk('Silindi') }, onError: (e) => toastErr(errMsg(e, 'Silinemedi')) })
  return (
    <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
      <div className="panel-title" style={{ marginBottom: '10px' }}>MARKALAR (TEDARİKÇİ)</div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '10px' }}>
        <div style={{ flex: 1, minWidth: '160px' }}><label className="form-label">Yeni marka</label><input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Ör. MİLA SU" onKeyDown={e => { if (e.key === 'Enter' && name.trim()) create.mutate() }} /></div>
        <div><label className="form-label">Renk</label><input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ width: '44px', height: '34px', border: '1px solid var(--border)', borderRadius: '7px', background: 'var(--surface2)', cursor: 'pointer' }} /></div>
        <button className="btn btn-primary" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>Ekle</button>
      </div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {brands.map(b => (
          <span key={b.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: b.color ? `${b.color}18` : 'var(--surface2)', border: `1px solid ${b.color || 'var(--border)'}`, borderRadius: '999px', padding: '4px 10px', fontSize: '11px' }}>
            <input type="color" aria-label={`${b.name} rengi`} value={b.color || '#64748b'} onChange={e => update.mutate({ id: b.id, name: b.name, sort_order: b.sort_order, is_active: b.is_active !== 0, color: e.target.value })} style={{ width: '16px', height: '16px', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }} title="Rengi değiştir" />
            {b.name}
            <button onClick={async () => { if (await confirmDialog({ title: 'Markayı Sil', body: `"${b.name}" silinsin mi? (bağlı ürün varsa silinemez)`, danger: true })) del.mutate(b.id) }} style={{ border: 'none', background: 'transparent', color: 'var(--text3)', cursor: 'pointer', fontSize: '12px', lineHeight: 1 }}>✕</button>
          </span>
        ))}
        {brands.length === 0 && <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Marka yok</span>}
      </div>
    </div>
  )
}
