import { useEffect, useState, useCallback, useRef } from 'react'
import { useAuthStore } from '../store/authStore.js'
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

  useEffect(() => {
    if (!token) return
    initialLoadDone.current = false

    api.get('/notifications').then(r => {
      setNotifications(r.data)
      setUnreadCount(r.data.filter(n => !n.is_read).length)
      initialLoadDone.current = true
    }).catch(() => {})

    const es = new EventSource(`/api/notifications/stream?token=${token}`)
    es.onmessage = (e) => {
      const notif = JSON.parse(e.data)
      setNotifications(prev => [notif, ...prev.slice(0, 49)])
      setUnreadCount(prev => prev + 1)

      if (initialLoadDone.current) {
        if (soundEnabled) playNotificationSound()
        if (browserEnabled) sendBrowserNotification(notif)
      }
    }
    es.onerror = () => es.close()

    return () => es.close()
  }, [token, soundEnabled, browserEnabled])

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
