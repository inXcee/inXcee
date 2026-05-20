import { create } from 'zustand'
import { useEffect, useRef, useState } from 'react'

// Tasarima uyumlu, mobil-uyumlu, klavyeden submit edilebilir input dialog.
// Browser'in prompt() yerine kullanilir — promise tabanli, async/await ile cagrilabilir.
//
// Kullanim:
//   import { inputDialog } from '../shared/components/InputDialog.jsx'
//   const val = await inputDialog('Bakim notu (opsiyonel):')
//   if (val !== null) { ... }
//
//   // Select listesi:
//   const cond = await inputDialog({
//     title: 'İade durumu',
//     body: 'Eşyanın iade edildiği durumu seçin.',
//     options: ['sağlam', 'eskimiş', 'hasarlı', 'kayıp'],
//     defaultValue: 'sağlam',
//   })

const useInputStore = create(set => ({
  open: false,
  title: '',
  body: '',
  placeholder: '',
  defaultValue: '',
  options: null,
  confirmLabel: 'Tamam',
  cancelLabel: 'İptal',
  resolver: null,
  show: (opts, resolver) => set({ open: true, ...opts, resolver }),
  close: () => set({ open: false, resolver: null }),
}))

export function inputDialog(opts) {
  const config = typeof opts === 'string' ? { body: opts } : opts
  return new Promise(resolve => {
    useInputStore.getState().show({
      title: config.title || 'Giriş',
      body: config.body || '',
      placeholder: config.placeholder || '',
      defaultValue: config.defaultValue ?? '',
      options: Array.isArray(config.options) ? config.options : null,
      confirmLabel: config.confirmLabel || 'Tamam',
      cancelLabel: config.cancelLabel || 'İptal',
    }, resolve)
  })
}

export default function InputDialog() {
  const { open, title, body, placeholder, defaultValue, options, confirmLabel, cancelLabel, resolver, close } = useInputStore()
  const [value, setValue] = useState('')
  const inputRef = useRef(null)

  // Dialog açıldığında defaultValue'yi yükle, input'a odaklan
  useEffect(() => {
    if (open) {
      setValue(defaultValue || '')
      // setTimeout: focus, mount tamamlandıktan sonra çalışsın
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open, defaultValue])

  if (!open) return null

  const submit = () => { resolver?.(value); close() }
  const cancel = () => { resolver?.(null); close() }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="input-dialog-title"
      onClick={cancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <form
        onClick={e => e.stopPropagation()}
        onSubmit={e => { e.preventDefault(); submit() }}
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
          id="input-dialog-title"
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
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 14 }}>
            {body}
          </div>
        )}

        {options ? (
          <select
            ref={inputRef}
            className="form-select"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') cancel() }}
            style={{ width: '100%', marginBottom: 18 }}
          >
            {!options.includes(defaultValue) && <option value="">— Seçiniz —</option>}
            {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        ) : (
          <input
            ref={inputRef}
            type="text"
            className="form-input"
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder={placeholder}
            onKeyDown={e => { if (e.key === 'Escape') cancel() }}
            style={{ width: '100%', marginBottom: 18 }}
          />
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={cancel}
            style={{
              background: 'var(--surface3)',
              border: '1px solid var(--border)',
              color: 'var(--text2)',
              padding: '8px 16px',
              borderRadius: 6,
              fontFamily: 'var(--sans)',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="submit"
            style={{
              background: 'var(--accent)',
              border: 'none',
              color: '#000',
              padding: '8px 16px',
              borderRadius: 6,
              fontFamily: 'var(--sans)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
