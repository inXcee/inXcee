import { useState, useEffect, useRef } from 'react'

export default function MoreMenu({ items, align = 'right', label = '⋯' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={() => setOpen(o => !o)} className="btn btn-ghost btn-sm"
        style={{ borderRadius: 10, padding: '6px 12px', fontSize: 14, fontWeight: 700, letterSpacing: 1 }}>
        {label}
      </button>
      {open && (
        <div style={{
          position: 'absolute', [align]: 0, top: 'calc(100% + 4px)', zIndex: 50,
          minWidth: 180, background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, padding: 4, boxShadow: '0 12px 32px rgba(0,0,0,.18)',
        }}>
          {items.map((it, idx) => it.divider ? (
            <div key={`d-${idx}`} style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          ) : (
            <button key={it.label} onClick={() => { setOpen(false); it.onClick?.() }}
              disabled={it.disabled}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '7px 10px', border: 'none', borderRadius: 7,
                background: 'transparent', color: it.color || 'var(--text)',
                fontSize: 12, fontFamily: 'var(--mono)', cursor: it.disabled ? 'default' : 'pointer',
                textAlign: 'left', opacity: it.disabled ? 0.4 : 1,
              }}
              onMouseEnter={e => { if (!it.disabled) e.currentTarget.style.background = 'var(--surface2)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
              {it.icon && <span style={{ fontSize: 13, width: 16, textAlign: 'center' }}>{it.icon}</span>}
              <span>{it.label}</span>
              {it.hint && <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text4)' }}>{it.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
