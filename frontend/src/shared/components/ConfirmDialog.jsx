import { create } from 'zustand'

// Tasarima uyumlu, mobil-uyumlu, ekran-okuyucu-dostu confirm dialog.
// Browser'in confirm() yerine kullanilir — promise tabanli, async/await ile cagrilabilir.
//
// Kullanim:
//   import { confirmDialog } from '../shared/components/ConfirmDialog.jsx'
//   if (await confirmDialog('Silinsin mi?')) { mutate() }
//   if (await confirmDialog({ title: 'Kart Sil', body: 'Geri alinamaz', danger: true })) { ... }

const useConfirmStore = create(set => ({
  open: false,
  title: '',
  body: '',
  confirmLabel: 'Onayla',
  cancelLabel: 'Iptal',
  danger: false,
  resolver: null,
  show: (opts, resolver) => set({ open: true, ...opts, resolver }),
  close: () => set({ open: false, resolver: null }),
}))

export function confirmDialog(opts) {
  const config = typeof opts === 'string' ? { body: opts } : opts
  return new Promise(resolve => {
    useConfirmStore.getState().show({
      title: config.title || 'Onay',
      body: config.body || '',
      confirmLabel: config.confirmLabel || 'Onayla',
      cancelLabel: config.cancelLabel || 'Iptal',
      danger: config.danger || false,
    }, resolve)
  })
}

export default function ConfirmDialog() {
  const { open, title, body, confirmLabel, cancelLabel, danger, resolver, close } = useConfirmStore()

  if (!open) return null

  const handle = (result) => {
    resolver?.(result)
    close()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={() => handle(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 24,
          maxWidth: 420,
          width: '100%',
          fontFamily: 'var(--sans)',
        }}
      >
        <div
          id="confirm-dialog-title"
          style={{
            fontFamily: 'var(--display)',
            fontSize: 16,
            letterSpacing: 1.5,
            color: 'var(--text)',
            marginBottom: 12,
            textTransform: 'uppercase',
          }}
        >
          {title}
        </div>
        {body && (
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 20 }}>
            {body}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={() => handle(false)}
            autoFocus
            style={{
              background: 'var(--surface3)',
              border: '1px solid var(--border)',
              color: 'var(--text2)',
              padding: '8px 16px',
              borderRadius: 6,
              fontFamily: 'var(--sans)',
              fontSize: 13,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => handle(true)}
            style={{
              background: danger ? 'var(--red)' : 'var(--accent)',
              border: 'none',
              color: danger ? '#fff' : '#000',
              padding: '8px 16px',
              borderRadius: 6,
              fontFamily: 'var(--sans)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
