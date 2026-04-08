import { useUndoStore } from '../../../shared/store/useUndoStore.js'
import { useToastStore } from '../../../shared/store/toastStore.js'

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return `${diff} sn önce`
  const m = Math.floor(diff / 60)
  return `${m} dk önce`
}

export default function UndoPanel({ onClose }) {
  const stack    = useUndoStore(s => s.stack)
  const remove   = useUndoStore(s => s.remove)
  const addToast = useToastStore(s => s.addToast)

  const handleUndo = async (entry) => {
    try {
      await entry.undo()
      remove(entry.id)
      addToast(`Geri alındı: ${entry.label}`, 'success')
    } catch (err) {
      addToast(err.message || 'Geri alma başarısız', 'error')
    }
  }

  return (
    <div style={{
      position: 'fixed', bottom: 80, right: 20, zIndex: 9999,
      background: 'var(--surface2)', border: '1px solid var(--border)',
      borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      width: 340, maxHeight: 420, display: 'flex', flexDirection: 'column',
      fontFamily: 'var(--mono)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', borderBottom: '1px solid var(--border)',
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', letterSpacing: 1 }}>
          SON İŞLEMLER
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 9, color: 'var(--text3)' }}>Ctrl+Z</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14, lineHeight: 1 }}
          >
            ✕
          </button>
        </div>
      </div>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        {stack.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 11 }}>
            Henüz işlem yok
          </div>
        ) : stack.map(entry => (
          <div
            key={entry.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 14px', borderBottom: '1px solid var(--border)',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {entry.label}
              </div>
              <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 2 }}>
                {timeAgo(entry.timestamp)}
              </div>
            </div>
            <button
              onClick={() => handleUndo(entry)}
              style={{
                background: 'var(--surface3)', border: '1px solid var(--border)',
                borderRadius: 4, padding: '3px 10px', cursor: 'pointer',
                fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)',
                whiteSpace: 'nowrap', fontWeight: 700,
              }}
            >
              ↩ Geri Al
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
