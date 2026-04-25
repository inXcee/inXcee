import { useEffect, useRef, useCallback } from 'react'
import { useAuthStore } from '../store/authStore.js'
import { useToastStore } from '../store/toastStore.js'

const TIMEOUT_MS = 30 * 60 * 1000  // 30 dakika
const WARN_MS   = 25 * 60 * 1000  // 25. dakikada uyar
const EVENTS    = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll']

export function useIdleTimeout() {
  const logout   = useAuthStore(s => s.logout)
  const token    = useAuthStore(s => s.token)
  const addToast = useToastStore(s => s.addToast)
  const timer    = useRef(null)
  const warned   = useRef(false)

  const reset = useCallback(() => {
    warned.current = false
    clearTimeout(timer.current)
    if (!token) return

    timer.current = setTimeout(() => {
      if (!warned.current) {
        warned.current = true
        addToast('Oturum 5 dakika içinde otomatik kapatılacak — aktif kalmak için hareket edin', 'warning')
        timer.current = setTimeout(() => {
          logout()
        }, TIMEOUT_MS - WARN_MS)
      }
    }, WARN_MS)
  }, [token, logout, addToast])

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
