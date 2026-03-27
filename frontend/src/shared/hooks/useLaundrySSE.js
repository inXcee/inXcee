import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../store/authStore.js'
import { useToastStore } from '../store/toastStore.js'

/**
 * LaundryHub'a mount olduğunda SSE'ye bağlanır.
 * module=laundry olan bildirimleri dinler, query cache'i invalidate eder,
 * önemli olaylar için toast gösterir.
 *
 * NOT: Sistemde zaten useNotifications (NotificationBell, Sidebar) çalışıyor.
 * Bu hook ayrı bir EventSource açar — SSE server bunu destekler.
 */
export function useLaundrySSE() {
  const qc       = useQueryClient()
  const token    = useAuthStore(s => s.token)
  const addToast = useToastStore(s => s.addToast)

  useEffect(() => {
    if (!token) return

    const es = new EventSource(`/api/notifications/stream?token=${token}`)

    es.onmessage = (e) => {
      try {
        const notif = JSON.parse(e.data)
        if (notif.module !== 'laundry') return

        const type = notif.type // 'info' | 'warning' | 'critical'

        // Cache invalidation
        if (type === 'critical' || type === 'warning') {
          qc.invalidateQueries({ queryKey: ['laundry-sla'] })
        }
        if (type === 'info') {
          qc.invalidateQueries({ queryKey: ['laundry-items'] })
          qc.invalidateQueries({ queryKey: ['laundry-machines'] })
        }
        // Her zaman stats güncelle
        qc.invalidateQueries({ queryKey: ['laundry-stats'] })

        // Toast
        const toastType = type === 'critical' ? 'error' : type === 'warning' ? 'warning' : 'info'
        addToast(notif.message, toastType)
      } catch {}
    }

    es.onerror = () => es.close()

    return () => es.close()
  }, [token, qc, addToast])
}
