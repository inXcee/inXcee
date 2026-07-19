// Housekeeping genelinde paylaşılan sabitler, helper'lar ve küçük presentational
// primitive'ler (ProgressStrip, GhostTile, FacilityCell).
import { BLOCKS } from '../../shared/blocks.js'

// ── Constants ─────────────────────────────────────────────────────────────────
export const ALL_BLOCK_NAMES = BLOCKS.map(b => b.block)
export const TODAY = new Date().toISOString().split('T')[0]

export const CHECKLIST_ITEMS = [
  { id: 'zemin',    label: 'Zemin süpürüldü / silindi',    icon: '🧹' },
  { id: 'yuzeyler', label: 'Yüzeyler / mobilyalar silindi', icon: '🧽' },
  { id: 'cop',      label: 'Çöp boşaltıldı',               icon: '🗑'  },
  { id: 'yatak',    label: 'Yatak / yorgan düzenlendi',     icon: '🛏'  },
  { id: 'cam',      label: 'Pencere / cam silindi',         icon: '🪟' },
  { id: 'banyo',    label: 'Banyo temizlendi',              icon: '🚿', privateOnly: true },
  { id: 'tuvalet',  label: 'Tuvalet temizlendi',            icon: '🚽', privateOnly: true },
]

export const SKIP_REASONS = [
  'Oda kilitli',
  'Personel odada — istemedi',
  'Zaten temiz',
  'Bakımda / onarımda',
  'Diğer',
]

// Temizlik fotoğrafı kategorileri (backend enum ile birebir: genel/oncesi/sonrasi/detay/hasar).
export const PHOTO_CATEGORIES = [
  { id: 'genel',   label: 'Genel',   icon: '📷', color: 'var(--blue)' },
  { id: 'oncesi',  label: 'Öncesi',  icon: '⏮', color: 'var(--accent)' },
  { id: 'sonrasi', label: 'Sonrası', icon: '✨', color: 'var(--green)' },
  { id: 'detay',   label: 'Detay',   icon: '🔍', color: 'var(--purple)' },
  { id: 'hasar',   label: 'Hasar',   icon: '⚠', color: 'var(--red)' },
]
export const PHOTO_CATEGORY_MAP = Object.fromEntries(PHOTO_CATEGORIES.map(c => [c.id, c]))

export function roomNoFromQr(qr) {
  if (!qr) return null
  const parts = qr.split('-')
  return parts.length >= 2 ? parts[parts.length - 1] : null
}

// ── Progress strip ────────────────────────────────────────────────────────────
export function ProgressStrip({ tasks, onGenerate, generating }) {
  const done    = tasks.filter(t => t.completed_at).length
  const skipped = tasks.filter(t => t.skipped).length
  const total   = tasks.length
  const pct     = total > 0 ? Math.round((done / total) * 100) : 0
  const barCls  = pct === 100 ? 'prog-green' : pct >= 60 ? 'prog-amber' : 'prog-red'

  return (
    <div className="panel fade-up-1" style={{ marginBottom: '20px' }}>
      <div style={{ height: '3px', background: pct === 100
        ? 'linear-gradient(90deg,var(--green),var(--teal))'
        : 'linear-gradient(90deg,var(--accent),var(--accent3))' }} />
      <div style={{ padding: '14px 20px', display: 'flex', gap: '20px', alignItems: 'center' }}>
        {[
          { label: 'TOPLAM',    value: total,             color: 'var(--text)'   },
          { label: 'TAMAM',     value: done,               color: 'var(--green)'  },
          { label: 'ATLANDI',   value: skipped,            color: 'var(--text3)'  },
          { label: 'BEKLEYEN',  value: total-done-skipped, color: (total-done-skipped)>0 ? 'var(--accent)' : 'var(--text3)' },
          { label: 'TAMAMLAMA', value: `%${pct}`,          color: pct===100 ? 'var(--green)' : pct>=60 ? 'var(--accent)' : 'var(--red)' },
        ].map(s => (
          <div key={s.label} style={{ textAlign: 'center', minWidth: '52px' }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: '26px', color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '7.5px', color: 'var(--text3)', letterSpacing: '1.5px', marginTop: '3px' }}>{s.label}</div>
          </div>
        ))}
        <div style={{ flex: 1, padding: '0 8px' }}>
          <div className="prog-bar" style={{ height: '7px', borderRadius: '4px' }}>
            <div className={`prog-fill ${barCls}`} style={{ width: `${pct}%`, height: '100%', borderRadius: '4px', transition: 'width .8s ease' }} />
          </div>
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', flexShrink: 0 }}>
          {new Date().toLocaleDateString('tr-TR', { day:'2-digit', month:'long', year:'numeric' })}
        </div>
        <button className="btn btn-primary" onClick={onGenerate} disabled={generating}
          style={{ flexShrink: 0, opacity: generating ? 0.6 : 1 }}>
          {generating ? '...' : '+ GÖREV OLUŞTUR'}
        </button>
      </div>
    </div>
  )
}

// ── Ghost Tile (missing room) ────────────────────────────────────────────────
export function GhostTile({ rno }) {
  return (
    <div style={{
      width: '58px', height: '74px', borderRadius: '7px', flexShrink: 0,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      border: '1px dashed var(--border)', gap: '2px',
    }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text4)', fontWeight: 600 }}>{rno}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: '7px', color: 'var(--text4)' }}>—</div>
    </div>
  )
}

// ── Facility Cell (M blocks — shared WC/shower) ──────────────────────────────
export function FacilityCell({ type, height = 74 }) {
  const isWC = type === 'WC'
  return (
    <div style={{
      height, width: '34px', flexShrink: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: '2px',
      background: isWC ? 'rgba(59,140,240,.08)' : 'rgba(26,188,156,.08)',
      border: `1px solid ${isWC ? 'rgba(59,140,240,.25)' : 'rgba(26,188,156,.25)'}`,
      borderRadius: '5px',
    }}>
      <span style={{ fontSize: '11px' }}>{isWC ? '🚽' : '🚿'}</span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: '5.5px', letterSpacing: '0.3px', color: isWC ? 'var(--blue)' : 'var(--teal)', fontWeight: 700 }}>{type}</span>
    </div>
  )
}
