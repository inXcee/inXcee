import { useEffect } from 'react'
import { createPortal } from 'react-dom'

export default function WaterModal({ title, onClose, width = '860px', children }) {
  useEffect(() => {
    const previous = document.body.style.overflow
    const closeOnEscape = event => {
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
        onClick={event => event.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 5px', background: 'var(--surface)' }}>
          <div style={{ width: '42px', height: '4px', borderRadius: '999px', background: 'var(--border)' }} />
        </div>
        <div style={{ height: '2px', background: 'var(--accent)' }} />
        <div className="panel-header" style={{ flexShrink: 0, background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
          <div className="panel-title">{title}</div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>✕ Kapat</button>
        </div>
        <div className="panel-body" style={{ overflow: 'auto', minHeight: 0, paddingBottom: 'max(18px, env(safe-area-inset-bottom))' }}>{children}</div>
      </div>
    </>,
    document.body,
  )
}
