import { useState, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'

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

      <AlertBand />

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
          ['Ay Farkı', t?.period_net, (t?.period_net || 0) < 0 ? 'var(--red)' : 'var(--teal)'],
          ['Kalan Stok', t?.balance, (t?.balance || 0) < 0 ? 'var(--red)' : 'var(--teal)'],
          ['Eksi Stok', t?.deficit_total, (t?.deficit_total || 0) > 0 ? 'var(--red)' : 'var(--text3)'],
          ['Boş İade', t?.period_return, 'var(--text)'],
        ].map(([lbl, val, color]) => (
          <div key={lbl} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 16px' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px' }}>{lbl}</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: '24px', color, marginTop: '2px' }}>{nf(val)}</div>
          </div>
        ))}
      </div>

      <WaterBoard from={from} to={to} label={label} lowItems={(summary?.stock || []).filter(s => s.low)} />

      <MonthlyReportPanel summary={summary} from={from} to={to} label={label} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', marginTop: '16px' }}>
        <GelenTirPanel from={from} to={to} label={label} stockItems={summary?.stock || []} />
        <BosIadePanel from={from} to={to} deposit={summary?.deposit || []} />
      </div>

      {modal === 'settings' && <SettingsModal onClose={() => setModal(null)} />}
      {modal === 'text' && <TextModal onClose={() => setModal(null)} />}
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
    ;(pivot?.brands || []).forEach((b, i) => map.set(brandKey(b.brand_id), BRAND_TINT[i % BRAND_TINT.length]))
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
      const [summaryRes, outRes, inRes, returnsRes] = await Promise.all([
        api.get('/water/summary', { params: { from, to } }),
        api.get('/water/movements', { params: { type: 'out', from, to, limit: 1000 } }),
        api.get('/water/movements', { params: { type: 'in', from, to, limit: 1000 } }),
        api.get('/water/returns', { params: { from, to } }),
      ])
      const summary = summaryRes.data || {}
      const outRows = outRes.data || []
      const inRows = inRes.data || []
      const returnRows = returnsRes.data || []
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

        {isLoading ? <div style={{ padding: '20px', color: 'var(--text3)' }}>Yükleniyor…</div> : !orderedCols.length ? (
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
  const params = useMemo(() => ({
    type: 'out',
    zone_id: zone.zone_id,
    ...(range === 'month' ? { from, to } : {}),
  }), [zone.zone_id, range, from, to])
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['water-zone-history', zone.zone_id, range, from, to],
    queryFn: () => api.get('/water/movements', { params }).then(r => r.data),
  })

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
    return { total, days, products, activeDays: days.length, recordCount: rows.length }
  }, [rows])

  const rangeLabel = range === 'month' ? label : 'Tüm geçmiş'

  return (
    <Modal title={`${zone.zone_name} — DAĞITIM GEÇMİŞİ`} onClose={onClose} width="1040px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '2px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '2px' }}>
            {[
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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
          {[
            ['Toplam dağıtım', nf(stats.total), 'var(--accent)'],
            ['Dağıtım günü', nf(stats.activeDays), 'var(--teal)'],
            ['Kayıt', nf(stats.recordCount), 'var(--text)'],
            ['Ürün çeşidi', nf(stats.products.length), 'var(--green)'],
          ].map(([name, value, color]) => (
            <div key={name} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px' }}>
              <div style={{ fontSize: '9px', color: 'var(--text3)', letterSpacing: '.5px' }}>{name}</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: '22px', color }}>{value}</div>
            </div>
          ))}
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

  const [form, setForm] = useState({ product_id: '', input_qty: '', input_unit: 'palet', move_date: todayStr(), waybill_no: '' })
  const selected = products.find(p => String(p.id) === String(form.product_id))
  const intakeCalc = smartQty(form.input_qty, selected, form.input_unit)

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
    if (!intakeCalc.valid) return toastErr('Miktar girin')
    save.mutate({
      product_id: +form.product_id,
      input_qty: intakeCalc.input_qty,
      input_unit: intakeCalc.input_unit,
      move_date: form.move_date,
      waybill_no: form.waybill_no.trim() || undefined,
    })
  }

  return (
    <div className="panel" style={{ borderTop: '3px solid var(--green)' }}>
      <div className="panel-header"><div><div className="panel-title">GELEN TIR / İRSALİYE — {label}</div><div className="panel-subtitle">Giriş kaydı, otomatik palet çarpanı ve anlık stok</div></div></div>
      <div className="panel-body" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.05fr) minmax(260px, .95fr)', gap: '14px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr .8fr .8fr .8fr auto', gap: '6px', alignItems: 'end' }}>
            <select className="form-select" value={form.product_id} onChange={e => {
              const p = products.find(x => String(x.id) === e.target.value)
              const preferred = availableUnitsForProduct(p).includes('palet') ? 'palet' : defaultUnitForProduct(p)
              setForm(f => ({ ...f, product_id: e.target.value, input_unit: preferred }))
            }}>
              <option value="">Ürün…</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.brand_name ? `${p.brand_name} · ` : ''}{p.name}</option>)}
            </select>
            <input type="text" inputMode="decimal" className="form-input" placeholder="Miktar / 3p" value={form.input_qty} onChange={e => setForm(f => ({ ...f, input_qty: e.target.value }))} />
            <select className="form-select" value={coerceUnitForProduct(form.input_unit, selected)} onChange={e => setForm(f => ({ ...f, input_unit: e.target.value }))}>
              {unitOptionsForProduct(selected).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <input className="form-input" placeholder="İrsaliye no" value={form.waybill_no} onChange={e => setForm(f => ({ ...f, waybill_no: e.target.value }))} />
            <button className="btn btn-primary btn-sm" onClick={submit} disabled={save.isPending}>Ekle</button>
          </div>
          <div style={{ minHeight: '24px', fontSize: '11px', color: intakeCalc.valid ? 'var(--green)' : 'var(--text3)', border: '1px dashed var(--border)', borderRadius: '8px', padding: '6px 8px', background: 'var(--surface2)' }}>
            {intakeCalc.valid ? calcText(selected, intakeCalc) : 'Ürün + miktar girince palet/koli karşılığı burada görünür.'}
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
        {[['firmalar', '📍 Dağıtım Yerleri'], ['urunler', '💧 Ürünler & Marka']].map(([id, l]) => (
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
  const [form, setForm] = useState({ name: '', code: '', note: '' })
  const { data: zones = [] } = useQuery({ queryKey: ['water-zones'], queryFn: () => api.get('/water/zones').then(r => r.data) })
  const create = useMutation({ mutationFn: (p) => api.post('/water/zones', p), onSuccess: () => { qc.invalidateQueries({ queryKey: ['water-zones'] }); qc.invalidateQueries({ queryKey: ['water-pivot'] }); setForm({ name: '', code: '', note: '' }); toastOk('Dağıtım yeri eklendi') }, onError: (e) => toastErr(errMsg(e, 'Eklenemedi')) })
  const del = useMutation({ mutationFn: (id) => api.delete(`/water/zones/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['water-zones'] }); qc.invalidateQueries({ queryKey: ['water-pivot'] }); toastOk('Silindi') }, onError: (e) => toastErr(errMsg(e, 'Silinemedi')) })
  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '14px' }}>
        <div style={{ flex: 1, minWidth: '160px' }}><label className="form-label">Dağıtım yeri adı</label><input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ör. OTC Kamp Alanı" /></div>
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
                <td style={{ textAlign: 'right' }}><button onClick={async () => { if (await confirmDialog({ title: 'Dağıtım Yerini Sil', body: `"${z.name}" silinsin mi?`, danger: true })) del.mutate(z.id) }} className="btn btn-danger btn-sm">Sil</button></td>
              </tr>
            ))}
            {zones.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text3)', padding: '16px' }}>Dağıtım yeri yok</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─────────────────────────── ÜRÜNLER + MARKA ───────────────────────────
function ProductsTab() {
  const qc = useQueryClient()
  const blank = { id: null, name: '', unit_label: 'adet', units_per_case: '1', cases_per_pallet: '1', min_qty: '', min_unit: 'adet', brand_id: '', is_returnable: false }
  const [form, setForm] = useState(blank)
  const { data: products = [] } = useQuery({ queryKey: ['water-products-all'], queryFn: () => api.get('/water/products', { params: { all: 1 } }).then(r => r.data) })
  const { data: brands = [] } = useQuery({ queryKey: ['water-brands'], queryFn: () => api.get('/water/brands').then(r => r.data) })

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['water-products-all'] }); qc.invalidateQueries({ queryKey: ['water-products'] }); qc.invalidateQueries({ queryKey: ['water-summary'] }); qc.invalidateQueries({ queryKey: ['water-pivot'] }); qc.invalidateQueries({ queryKey: ['water-deposit'] }) }
  const payload = () => {
    const upc = +form.units_per_case || 1, cpp = +form.cases_per_pallet || 1
    const productShape = { unit_label: form.unit_label, units_per_case: upc, cases_per_pallet: cpp }
    const minUnit = coerceUnitForProduct(form.min_unit, productShape)
    const mult = multiplier(productShape, minUnit)
    return { name: form.name.trim(), unit_label: form.unit_label, units_per_case: upc, cases_per_pallet: cpp, min_level: Math.round((+form.min_qty || 0) * mult), brand_id: form.brand_id || null, is_returnable: form.is_returnable }
  }
  const create = useMutation({ mutationFn: () => api.post('/water/products', payload()), onSuccess: () => { invalidate(); setForm(blank); toastOk('Ürün eklendi') }, onError: (e) => toastErr(errMsg(e, 'Eklenemedi')) })
  const update = useMutation({ mutationFn: () => api.put(`/water/products/${form.id}`, payload()), onSuccess: () => { invalidate(); setForm(blank); toastOk('Ürün güncellendi') }, onError: (e) => toastErr(errMsg(e, 'Güncellenemedi')) })
  const del = useMutation({ mutationFn: (id) => api.delete(`/water/products/${id}`), onSuccess: () => { invalidate(); toastOk('Silindi') }, onError: (e) => toastErr(errMsg(e, 'Silinemedi')) })

  const editProduct = (p) => setForm({ id: p.id, name: p.name, unit_label: p.unit_label, units_per_case: String(p.units_per_case), cases_per_pallet: String(p.cases_per_pallet), min_qty: p.min_level ? String(p.min_level) : '', min_unit: 'adet', brand_id: p.brand_id ? String(p.brand_id) : '', is_returnable: !!p.is_returnable })
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
      <div style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: '12px' }}>Baz birim Excel hücresindeki ham sayıdır; ör. damacana adet, 0.33/0.5 koli, 5 L/cam paket. Palet çarpanı bu ham sayıya çevrilir. “İade edilebilir” = boş dönüşü takip edilen kaplar.</div>

      <div style={{ maxHeight: '40vh', overflowY: 'auto' }}>
        <table className="data-table" style={{ fontSize: '12px' }}>
          <thead><tr><th>Ad</th><th>Marka</th><th>Birimler</th><th style={{ textAlign: 'right' }}>1 Koli</th><th style={{ textAlign: 'right' }}>1 Palet</th><th style={{ textAlign: 'right' }}>Min.</th><th></th></tr></thead>
          <tbody>
            {products.map(p => (
              <tr key={p.id} style={{ opacity: p.is_active ? 1 : 0.5 }}>
                <td style={{ fontWeight: 600 }}>{p.name} {p.is_returnable ? <span title="İade edilebilir" style={{ fontSize: '10px', color: 'var(--teal)' }}>♻️</span> : null}</td>
                <td style={{ color: 'var(--text3)' }}>{p.brand_name || '—'}</td>
                <td style={{ color: 'var(--text3)' }}>{unitOptionsForProduct(p).map(([, label]) => label).join(' / ')}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{koliText(p)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{paletText(p)}</td>
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
