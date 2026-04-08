import { useToastStore } from '../store/toastStore.js'

const TYPE_STYLES = {
  error:   { background: 'var(--red)',            color: '#fff' },
  warning: { background: 'var(--amber, #f0a500)', color: '#000' },
  success: { background: 'var(--green)',           color: '#fff' },
  info:    { background: 'var(--surface3)',        color: 'var(--text)' },
}

export default function ToastContainer() {
  const toasts      = useToastStore(s => s.toasts)
  const removeToast = useToastStore(s => s.removeToast)

  if (toasts.length === 0) return null

  return (
    <div style={{
      position: 'fixed', bottom: '20px', right: '20px', zIndex: 10000,
      display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '420px',
    }}>
      {toasts.map(t => (
        <div
          key={t.id}
          style={{
            ...TYPE_STYLES[t.type] || TYPE_STYLES.error,
            padding: '10px 16px',
            borderRadius: '6px',
            fontFamily: 'var(--mono)',
            fontSize: '12px',
            letterSpacing: '0.5px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            animation: 'fadeIn 0.2s ease',
            display: 'flex', alignItems: 'center', gap: 10,
          }}
        >
          <span style={{ flex: 1, cursor: 'pointer' }} onClick={() => removeToast(t.id)}>
            {t.message}
          </span>
          {t.onUndo && (
            <button
              onClick={(e) => { e.stopPropagation(); t.onUndo(); removeToast(t.id) }}
              style={{
                background: 'rgba(255,255,255,0.25)', border: 'none',
                borderRadius: 4, padding: '2px 8px', cursor: 'pointer',
                fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700,
                color: 'inherit', whiteSpace: 'nowrap',
              }}
            >
              ↩ Geri Al
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
