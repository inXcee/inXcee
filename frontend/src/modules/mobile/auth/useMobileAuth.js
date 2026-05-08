import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Logout sirasinda Service Worker'a API cache temizleme mesaji gonder.
// Kullanici degisikliginde eski kullanicinin cache'lenen verisi sizmasin.
function clearApiCache() {
  if (typeof navigator !== 'undefined' && navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_API_CACHE' })
  }
}

export const useMobileAuth = create(persist(
  set => ({
    token: null,
    user: null,
    login: (token, user) => set({ token, user }),
    logout: () => { clearApiCache(); set({ token: null, user: null }) },
  }),
  { name: 'yys-mobile-auth' }
))
