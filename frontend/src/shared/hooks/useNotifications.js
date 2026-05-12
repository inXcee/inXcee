import { useEffect, useState, useCallback, useRef } from 'react'
import { useAuthStore } from '../store/authStore.js'
import { useEventStream } from './useEventStream.js'
import api from '../api/client.js'

function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1)
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.3)
  } catch {}
}

function sendBrowserNotification(notif) {
  if (!('Notification' in window)) return
  if (Notification.permission === 'granted') {
    const typeLabel = notif.type === 'critical' ? 'ACiL' : notif.type === 'warning' ? 'UYARI' : 'BiLGi'
    new Notification(`YYS — ${typeLabel}`, {
      body: notif.message,
      icon: '/favicon.ico',
      tag: `yys-${notif.id}`,
    })
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission()
  }
}

export function useNotifications() {
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('yys-notif-sound') !== 'off')
  const [browserEnabled, setBrowserEnabled] = useState(() => localStorage.getItem('yys-notif-browser') !== 'off')
  const token = useAuthStore(s => s.token)
  const initialLoadDone = useRef(false)
  const soundRef = useRef(soundEnabled)
  const browserRef = useRef(browserEnabled)
  soundRef.current = soundEnabled
  browserRef.current = browserEnabled

  useEffect(() => {
    if (!token) return
    initialLoadDone.current = false
    api.get('/notifications').then(r => {
      // Backward compat: route returns array (legacy) or { items, total } (v2)
      const list = Array.isArray(r.data) ? r.data : (r.data?.items || [])
      setNotifications(list)
      setUnreadCount(list.filter(n => !n.is_read).length)
      initialLoadDone.current = true
    }).catch(() => {})
  }, [token])

  useEventStream('/api/notifications/stream', token, ({ event, data }) => {
    if (event !== 'message') return
    setNotifications(prev => [data, ...prev.slice(0, 49)])
    setUnreadCount(prev => prev + 1)
    if (initialLoadDone.current) {
      if (soundRef.current) playNotificationSound()
      if (browserRef.current) sendBrowserNotification(data)
    }
  })

  const markRead = async (id) => {
    await api.patch(`/notifications/${id}/read`)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n))
    setUnreadCount(prev => Math.max(0, prev - 1))
  }

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.is_read)
    await Promise.all(unread.map(n => api.patch(`/notifications/${n.id}/read`)))
    setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })))
    setUnreadCount(0)
  }

  const toggleSound = useCallback(() => {
    setSoundEnabled(prev => {
      const next = !prev
      localStorage.setItem('yys-notif-sound', next ? 'on' : 'off')
      return next
    })
  }, [])

  const toggleBrowser = useCallback(() => {
    setBrowserEnabled(prev => {
      const next = !prev
      localStorage.setItem('yys-notif-browser', next ? 'on' : 'off')
      if (next && 'Notification' in window && Notification.permission !== 'granted') {
        Notification.requestPermission()
      }
      return next
    })
  }, [])

  return { notifications, unreadCount, markRead, markAllRead, soundEnabled, toggleSound, browserEnabled, toggleBrowser }
}
