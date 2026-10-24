import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '../../../shared/i18n/index.js'

// Saha ekranı (Odalar + Çamaşır): her işlemden sonra kısa süre "Geri al" bildirimi; yeni bildirim eskisini değiştirir.
export function useUndoToast(ms = 6000) {
  const [toast, setToast] = useState(null)
  const timer = useRef(null)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const showToast = (text, undo = null) => {
    window.clearTimeout(timer.current)
    setToast({ text, undo })
    timer.current = window.setTimeout(() => setToast(null), ms)
  }
  return { toast, showToast, clearToast: () => setToast(null) }
}

export default function UndoToast({ toast, onDismiss }) {
  const { t } = useTranslation()
  if (!toast) return null
  return (
    <div role="status"
      className="fixed inset-x-4 bottom-24 z-[80] mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white shadow-xl">
      <span>{toast.text}</span>
      {toast.undo && (
        <button type="button" onClick={() => { const run = toast.undo; onDismiss(); run() }}
          className="min-h-10 shrink-0 rounded-xl bg-slate-700 px-3 font-semibold text-blue-300">
          {t('avs_kiosk.board.undo')}
        </button>
      )}
    </div>
  )
}
