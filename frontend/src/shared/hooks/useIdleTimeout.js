import { useEffect, useRef, useCallback } from 'react'
import { useAuthStore } from '../store/authStore.js'
import { useToastStore } from '../store/toastStore.js'

const EVENTS = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll']

export function useIdleTimeout({ timeoutMs = 30 * 60 * 1000, warnBeforeMs = 5 * 60 * 1000, token: tokenProp, onLogout } = {}) {
  const logoutStore = useAuthStore(s => s.logout)
  const tokenStore  = useAuthStore(s => s.token)
  const addToast    = useToastStore(s => s.addToast)
  const token  = tokenProp !== undefined ? tokenProp : tokenStore
  const logout = onLogout ?? logoutStore
  const timer    = useRef(null)
  const warned   = useRef(false)

  const reset = useCallback(() => {
    warned.current = false
    clearTimeout(timer.current)
    if (!token) return

    timer.current = setTimeout(() => {
      if (!warned.current) {
        warned.current = true
        const mins = Math.round(warnBeforeMs / 60000)
        addToast(`Oturum ${mins} dakika içinde otomatik kapatılacak — aktif kalmak için hareket edin`, 'warning')
        timer.current = setTimeout(() => {
          logout()
        }, warnBeforeMs)
      }
    }, timeoutMs - warnBeforeMs)
  }, [token, logout, addToast, timeoutMs, warnBeforeMs])

  useEffect(() => {
    if (!token) return
    reset()
    EVENTS.forEach(e => window.addEventListener(e, reset, { passive: true }))
    return () => {
      clearTimeout(timer.current)
      EVENTS.forEach(e => window.removeEventListener(e, reset))
    }
  }, [token, reset])
}
