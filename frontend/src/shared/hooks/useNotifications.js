import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/authStore.js'
import api from '../api/client.js'

export function useNotifications() {
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const token = useAuthStore(s => s.token)

  useEffect(() => {
    if (!token) return

    // Initial fetch
    api.get('/notifications').then(r => {
      setNotifications(r.data)
      setUnreadCount(r.data.filter(n => !n.is_read).length)
    }).catch(() => {})

    // SSE stream
    const es = new EventSource(`/api/notifications/stream?token=${token}`)
    es.onmessage = (e) => {
      const notif = JSON.parse(e.data)
      setNotifications(prev => [notif, ...prev.slice(0, 49)])
      setUnreadCount(prev => prev + 1)
    }
    es.onerror = () => es.close()

    return () => es.close()
  }, [token])

  const markRead = async (id) => {
    await api.patch(`/notifications/${id}/read`)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n))
    setUnreadCount(prev => Math.max(0, prev - 1))
  }

  return { notifications, unreadCount, markRead }
}
