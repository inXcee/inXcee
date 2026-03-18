import { useToastStore } from '../store/toastStore.js'

const TYPE_STYLES = {
  error: { background: 'var(--red)', color: '#fff' },
  warning: { background: 'var(--amber, #f0a500)', color: '#000' },
  success: { background: 'var(--green)', color: '#fff' },
  info: { background: 'var(--surface3)', color: 'var(--text)' },
}

export default function ToastContainer() {
  const toasts = useToastStore(s => s.toasts)
  const removeToast = useToastStore(s => s.removeToast)

  if (toasts.length === 0) return null

  return (
    <div style={{
      position: 'fixed', bottom: '20px', right: '20px', zIndex: 10000,
      display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '380px',
    }}>
      {toasts.map(t => (
        <div
          key={t.id}
          onClick={() => removeToast(t.id)}
          style={{
            ...TYPE_STYLES[t.type] || TYPE_STYLES.error,
            padding: '10px 16px',
            borderRadius: '6px',
            fontFamily: 'var(--mono)',
            fontSize: '12px',
            letterSpacing: '0.5px',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
