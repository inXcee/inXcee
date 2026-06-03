// DisciplinePage genelinde paylaşılan helper'lar, sabitler ve küçük primitive'ler.
import { useState, useRef, useEffect } from 'react'

/* ── helpers ─────────────────────────────────────────────────────────────── */
export const fmt = d => d ? new Date(d).toLocaleDateString('tr-TR') : '—'
export const fmtFull = d => d ? new Date(d).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—'

export const PREDEFINED_REASONS = [
  'Alkol kullanımı',
  'Kavga / fiziksel şiddet',
  'Oda kurallarına uymama',
  'Sessizlik saatlerine uymama',
  'Ortak alan kurallarına uymama',
  'İzinsiz misafir getirme',
  'Temizlik kurallarına uymama',
  'Sigara ihlali',
  'Malzeme hasarı',
  'Hırsızlık',
  'Tehdit / hakaret',
  'İzinsiz blok değişikliği',
]

export const INIT_CARD = { card_type: 'yellow', reason: '' }

/* ── KPI Card ────────────────────────────────────────────────────────────── */
export function KPI({ label, value, color = 'var(--text)', sub }) {
  return (
    <div style={{
      flex: 1, minWidth: '100px', padding: '14px 16px',
      background: 'rgba(15,23,42,.3)', borderRadius: '8px',
      border: '1px solid var(--border)',
    }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '6px' }}>{label}</div>
      <div style={{ fontFamily: 'var(--display)', fontSize: '26px', color, letterSpacing: '1px' }}>{value}</div>
      {sub && <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>{sub}</div>}
    </div>
  )
}

/* ── AutoReason ──────────────────────────────────────────────────────────── */
export function AutoReason({ value, onChange, suggestions = [] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const allSuggestions = [...new Set([
    ...PREDEFINED_REASONS,
    ...suggestions.map(s => s.reason),
  ])]
  const filtered = value.length >= 1
    ? allSuggestions.filter(s => s.toLowerCase().includes(value.toLowerCase()))
    : allSuggestions

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="İhlal sebebi yazın veya seçin..."
        className="form-input"
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
          background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '6px',
          maxHeight: '200px', overflowY: 'auto', marginTop: '2px',
          boxShadow: '0 8px 24px rgba(0,0,0,.4)',
        }}>
          {filtered.map(s => (
            <div key={s} onClick={() => { onChange(s); setOpen(false) }}
              style={{
                padding: '8px 12px', cursor: 'pointer', fontSize: '12px', color: 'var(--text)',
                borderBottom: '1px solid rgba(35,45,63,.3)',
                transition: 'background .1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.05)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
