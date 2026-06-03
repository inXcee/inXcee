// CheckinPage sihirbazının paylaştığı sabitler ve küçük sunum primitive'leri.
import { useState } from 'react'

export const STEPS = [
  { key: 'search', label: 'ARAMA' },
  { key: 'register', label: 'KAYIT' },
  { key: 'room', label: 'ODA ATAMA' },
  { key: 'zimmet', label: 'ZİMMET' },
]

export const INIT_FORM_DATA = { full_name: '', company: '', job_title: '', preferred_block: '', phone_number: '', emergency_name: '', emergency_phone: '' }

export function StepBar({ step, onStepClick }) {
  return (
    <div style={{ display: 'flex', gap: '0', marginBottom: '24px', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      {STEPS.map((s, i) => {
        const done = i < step, active = i === step
        const clickable = done && typeof onStepClick === 'function'
        return (
          <div key={s.key} style={{ flex: '1 0 auto', display: 'flex', alignItems: 'center', minWidth: 0 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                onClick={clickable ? () => onStepClick(i) : undefined}
                title={clickable ? `${s.label} adımına dön` : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 8px', borderRadius: '7px',
                  background: active ? 'rgba(240,165,0,.1)' : done ? 'rgba(39,201,106,.08)' : 'var(--surface2)',
                  border: `1px solid ${active ? 'rgba(240,165,0,.3)' : done ? 'rgba(39,201,106,.2)' : 'var(--border)'}`,
                  cursor: clickable ? 'pointer' : 'default',
                  transition: 'transform 0.15s',
                }}
                onMouseEnter={e => { if (clickable) e.currentTarget.style.transform = 'translateY(-1px)' }}
                onMouseLeave={e => { if (clickable) e.currentTarget.style.transform = 'none' }}
              >
                <div style={{
                  width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: active ? 'var(--accent)' : done ? 'var(--green)' : 'var(--surface3)',
                  fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 700,
                  color: active || done ? '#000' : 'var(--text3)',
                }}>{done ? '✓' : i + 1}</div>
                <span className="step-label" style={{ fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1px', whiteSpace: 'nowrap',
                  color: active ? 'var(--accent)' : done ? 'var(--green)' : 'var(--text3)',
                  display: active ? 'inline' : 'none',
                }}>{s.label}</span>
              </div>
            </div>
            {i < STEPS.length - 1 && <div style={{ width: '12px', height: '1px', flexShrink: 0, background: done ? 'rgba(39,201,106,.4)' : 'var(--border)' }} />}
          </div>
        )
      })}
    </div>
  )
}

// ── Autocomplete Input ──────────────────────────────────────────────────────
export function AutoInput({ label, value, onChange, suggestions, placeholder }) {
  const [focused, setFocused] = useState(false)
  const filtered = suggestions.filter(s => s.toLowerCase().includes(value.toLowerCase()) && s !== value).slice(0, 6)
  return (
    <div style={{ position: 'relative' }}>
      <label className="form-label">{label}</label>
      <input className="form-input" value={value} onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)} onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder={placeholder} />
      {focused && value.length >= 1 && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px',
          overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,.4)', marginTop: '2px',
        }}>
          {filtered.map(s => (
            <div key={s} onMouseDown={() => onChange(s)} style={{
              padding: '8px 12px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '11px',
              color: 'var(--text)', borderBottom: '1px solid var(--border)',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >{s}</div>
          ))}
        </div>
      )}
    </div>
  )
}
