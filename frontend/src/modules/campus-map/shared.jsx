// Campus-map genelinde paylaşılan sabitler, helper'lar, stil objeleri ve küçük
// presentational primitive'ler (Kpi, MiniStat, StatusDot).
import { BLOCKS } from '../../shared/blocks.js'

// ── Sabitler ──────────────────────────────────────────────────────────────────
export const VIEW_W = 680
export const VIEW_H = 822

// Bildirim mesajindan blok adi cikar (orn: "M1-101 karantinaya..." → M1)
export const BLOCK_NAMES = BLOCKS.map(b => b.block).sort((a, b) => b.length - a.length) // uzun olan once

export const MODES = [
  { id: 'occupancy',  label: 'DOLULUK',   icon: '◉', desc: 'Yatak dolulugu' },
  { id: 'faults',     label: 'ARIZA',     icon: '⚠', desc: 'Acik ariza talepleri' },
  { id: 'cleaning',   label: 'TEMIZLIK',  icon: '◈', desc: 'Bugunki temizlik gorevleri' },
  { id: 'shifts',     label: 'VARDIYA',   icon: '☾', desc: 'Gece/gunduz personel dagilimi' },
  { id: 'quarantine', label: 'KARANTINA', icon: '⊘', desc: 'Karantina/bakim odalari' },
  { id: 'company',    label: 'SIRKET',    icon: '⊞', desc: 'Dominant sirket dagilimi' },
]

export const PRESET_COLORS = [
  '#dc2626', // kirmizi
  '#f59e0b', // turuncu
  '#eab308', // sari
  '#16a34a', // yesil
  '#06b6d4', // cyan
  '#3b82f6', // mavi
  '#8b5cf6', // mor
  '#a855f7', // pembe-mor
  '#ec4899', // pembe
  '#475569', // gri-koyu
  '#6b7280', // gri
  '#000000', // siyah
]

// ── Helper'lar ────────────────────────────────────────────────────────────────
export function extractBlock(text) {
  if (!text) return null
  for (const block of BLOCK_NAMES) {
    const re = new RegExp(`\\b${block}\\b`, 'i')
    if (re.test(text)) return block
  }
  return null
}

export function eventColor(type) {
  switch (type) {
    case 'critical': return '#dc2626'
    case 'warning':  return '#f59e0b'
    default:         return '#3b82f6'
  }
}

// Sirket adindan deterministic renk uret (hash → hue)
export function companyColor(name) {
  if (!name) return '#475569'
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 55%, 50%)`
}

// Mode bazli pin metrigi: { value (sayisal 0-100), color, badge (sag-ust kose), centerText }
export function computeMetric(mode, s, cfg) {
  if (!s || !cfg) return { value: 0, color: '#6b7280', badge: null, centerLabel: '', subLabel: '...' }

  switch (mode) {
    case 'occupancy': {
      const pct = s.occupancy_pct
      const hasBeds = s.total_beds > 0
      let color = '#6b7280'
      if (hasBeds) {
        if (pct >= 85) color = '#dc2626'
        else if (pct >= 60) color = '#f59e0b'
        else if (pct > 0) color = '#16a34a'
      }
      return {
        value: pct, color,
        badge: s.full_rooms > 0 ? { text: '!', color: '#dc2626' } : null,
        centerLabel: `%${pct}`,
        subLabel: `${s.occupied}/${s.total_beds}`,
      }
    }
    case 'faults': {
      const n = s.open_faults
      let color = '#6b7280'
      if (n >= 5) color = '#dc2626'
      else if (n >= 2) color = '#f59e0b'
      else if (n >= 1) color = '#eab308'
      return {
        value: Math.min(100, n * 20), color,
        badge: n > 0 ? { text: String(n), color: '#dc2626' } : null,
        centerLabel: n > 0 ? `${n}⚠` : '✓',
        subLabel: n > 0 ? `${n} ariza` : 'temiz',
      }
    }
    case 'cleaning': {
      const pct = s.cleaning_pct
      const has = s.cleaning_total > 0
      let color = '#6b7280'
      if (has) {
        if (pct >= 80) color = '#16a34a'
        else if (pct >= 40) color = '#eab308'
        else color = '#dc2626'
      }
      return {
        value: pct, color,
        badge: s.cleaning_skipped > 0 ? { text: '✕', color: '#eab308' } : null,
        centerLabel: has ? `%${pct}` : '—',
        subLabel: has ? `${s.cleaning_done}/${s.cleaning_total}` : 'gorev yok',
      }
    }
    case 'shifts': {
      const total = s.day_count + s.night_count
      const nightPct = total > 0 ? Math.round((s.night_count / total) * 100) : 0
      // Gece vardiyasi yogunlugu = mavi-mor, gunduz = turuncu
      let color = '#6b7280'
      if (total > 0) {
        if (nightPct >= 60) color = '#8b5cf6'
        else if (nightPct >= 30) color = '#3b82f6'
        else color = '#f97316'
      }
      return {
        value: nightPct, color,
        badge: null,
        centerLabel: total > 0 ? `${total}` : '—',
        subLabel: total > 0 ? `G${s.day_count}/N${s.night_count}` : 'bos',
      }
    }
    case 'quarantine': {
      const q = s.quarantine, m = s.maintenance
      const both = q + m
      let color = '#6b7280'
      if (q > 0) color = '#dc2626'
      else if (m > 0) color = '#f59e0b'
      return {
        value: both > 0 ? Math.min(100, both * 25) : 0, color,
        badge: both > 0 ? { text: String(both), color: q > 0 ? '#dc2626' : '#f59e0b' } : null,
        centerLabel: both > 0 ? `${both}⊘` : '✓',
        subLabel: both > 0 ? `Q${q}/B${m}` : 'aktif',
      }
    }
    case 'company': {
      const top = s.top_companies?.[0]
      if (!top) return { value: 0, color: '#6b7280', badge: null, centerLabel: '—', subLabel: 'bos' }
      const color = companyColor(top.company)
      const sharePct = s.occupied > 0 ? Math.round((top.count / s.occupied) * 100) : 0
      return {
        value: sharePct, color,
        badge: s.top_companies.length > 1 ? { text: String(s.top_companies.length), color: '#475569' } : null,
        centerLabel: top.company.slice(0, 4).toUpperCase(),
        subLabel: `${top.count}k %${sharePct}`,
      }
    }
    default:
      return { value: 0, color: '#6b7280', badge: null, centerLabel: '?', subLabel: '?' }
  }
}

export function defaultPins() {
  const pins = {}
  const blocks = BLOCKS.map(b => b.block)
  const cols = 2, startX = 580, startY = 40, dy = 36
  blocks.forEach((b, i) => {
    const col = i % cols, row = Math.floor(i / cols)
    pins[b] = { x: startX + col * 50, y: startY + row * dy }
  })
  return pins
}

// ── Küçük primitive'ler ───────────────────────────────────────────────────────
export function Kpi({ label, value, color }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1, marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: 'var(--display)', fontSize: 20, color, letterSpacing: 1 }}>{value}</div>
    </div>
  )
}

export function MiniStat({ label, value, color = 'var(--text)' }) {
  return (
    <div style={{ background: 'var(--surface2)', borderRadius: 4, padding: '6px 4px', textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontFamily: 'var(--display)', fontSize: 14, color, letterSpacing: 1 }}>{value}</div>
    </div>
  )
}

export function StatusDot({ cx, cy, active, color }) {
  if (!active) return <circle cx={cx} cy={cy} r="2" fill="rgba(255,255,255,0.2)" />
  return (
    <>
      <circle cx={cx} cy={cy} r="3.5" fill={color} stroke="rgba(0,0,0,0.6)" strokeWidth="0.5" />
      <circle cx={cx} cy={cy} r="6" fill={color} opacity="0.3">
        <animate attributeName="r" values="3.5;7;3.5" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.4;0;0.4" dur="2s" repeatCount="indefinite" />
      </circle>
    </>
  )
}

// ── Stil objeleri ─────────────────────────────────────────────────────────────
export function chipBtn(active) {
  return {
    background: active ? 'var(--accent)' : 'var(--surface2)',
    color: active ? '#000' : 'var(--text2)',
    border: '1px solid var(--border)', borderRadius: 6,
    padding: '5px 10px', cursor: 'pointer',
    fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1, fontWeight: 600,
  }
}
export const lblToolbar = { display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', cursor: 'pointer', letterSpacing: 1 }
export const btnPrimary = {
  background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 6,
  padding: '8px 12px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 10,
  letterSpacing: 1, fontWeight: 700, textAlign: 'left',
}
export const btnSecondary = {
  background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: 6,
  padding: '7px 8px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 9,
  letterSpacing: 1, textAlign: 'center',
}
export const btnGreen = { background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1, fontWeight: 600 }
export const btnGhost = { background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1 }
export const btnDanger = { background: 'var(--surface2)', color: '#dc2626', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1 }
export const btnAccent = { background: 'var(--surface2)', color: 'var(--accent)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1, fontWeight: 600 }
export const btnDangerSolid = { background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1, fontWeight: 700 }
export const btnWarn = { background: '#f59e0b', color: '#000', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1, fontWeight: 700 }
export const zoomBtn = {
  background: 'transparent', color: 'var(--text2)', border: 'none', borderRadius: 4,
  padding: '4px 9px', cursor: 'pointer', fontFamily: 'var(--mono)',
  fontSize: 14, fontWeight: 700, lineHeight: 1, minWidth: 26,
}
export const thStyle = { textAlign: 'left', padding: '6px 4px', color: 'var(--text3)', fontWeight: 400, letterSpacing: 1 }
export const tdStyle = { padding: '6px 4px', color: 'var(--text2)' }
export const modalLabel = {
  display: 'block', fontFamily: 'var(--mono)', fontSize: 9,
  color: 'var(--text3)', letterSpacing: 1, marginBottom: 4, marginTop: 8,
}
export const modalInput = {
  width: '100%', boxSizing: 'border-box',
  background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6,
  padding: '8px 10px', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 12,
  marginBottom: 4,
}
export const miniLink = {
  background: 'transparent', border: 'none', color: 'var(--accent)',
  padding: 0, cursor: 'pointer',
  fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1, fontWeight: 600,
  textDecoration: 'underline',
}
export const kbd = {
  background: 'var(--surface2)', border: '1px solid var(--border)',
  borderBottomWidth: 2, borderRadius: 4,
  padding: '3px 8px', fontFamily: 'var(--mono)', fontSize: 11,
  color: 'var(--accent)', letterSpacing: 1, fontWeight: 600,
  minWidth: 28, textAlign: 'center', display: 'inline-block',
}
export const searchItemStyle = {
  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
  background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)',
  padding: '8px 10px', cursor: 'pointer', color: 'var(--text)', textAlign: 'left',
  transition: 'background .1s',
}
