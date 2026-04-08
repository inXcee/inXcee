import { create } from 'zustand'

let toastId = 0

export const useToastStore = create(set => ({
  toasts: [],
  addToast: (message, type = 'error', onUndo = null) => {
    const id = ++toastId
    set(s => ({ toasts: [...s.toasts, { id, message, type, onUndo }] }))
    setTimeout(() => {
      set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }))
    }, 5000)
  },
  removeToast: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}))
