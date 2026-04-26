import { useState, useRef, useEffect } from 'react'
import { HELP_CONTENT } from '../utils/helpContent.js'

export default function HelpHint({ topic, title, children }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const content = children || HELP_CONTENT[topic]
  if (!content) return null

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-block', marginLeft: 8 }}>
      <button
        type="button"
        aria-label="Yardım"
        onClick={() => setOpen(o => !o)}
        style={{
          width: 22, height: 22, borderRadius: '50%',
          background: open ? 'var(--accent)' : 'transparent',
          border: '1px solid var(--border)',
          color: open ? '#000' : 'var(--text3)',
          fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700,
          cursor: 'pointer', padding: 0, lineHeight: '20px',
          verticalAlign: 'middle',
        }}
      >?</button>

      {open && (
        <div style={{
          position: 'absolute', top: 30, left: 0, zIndex: 50,
          width: 360, padding: 16,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          fontFamily: 'var(--mono)', fontSize: 11, lineHeight: 1.6,
          color: 'var(--text2)', whiteSpace: 'normal',
        }}>
          {title && (
            <div style={{
              fontFamily: 'var(--display)', fontSize: 12, letterSpacing: 2,
              color: 'var(--accent)', marginBottom: 10,
            }}>{title}</div>
          )}
          {typeof content === 'string' ? (
            <pre style={{
              fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, lineHeight: 1.6,
            }}>{content}</pre>
          ) : content}
        </div>
      )}
    </span>
  )
}
