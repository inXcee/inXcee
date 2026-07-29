import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../store/authStore.js'
import { useToastStore } from '../store/toastStore.js'
import { useEventStream } from './useEventStream.js'

/**
 * LaundryHub'a mount olduğunda SSE'ye bağlanır.
 * module=laundry olan bildirimleri dinler, query cache'i invalidate eder,
 * önemli olaylar için toast gösterir.
 */
export function useLaundrySSE() {
  const qc       = useQueryClient()
  const token    = useAuthStore(s => s.token)
  const addToast = useToastStore(s => s.addToast)

  useEventStream('/api/notifications/stream', token, ({ event, data: notif }) => {
    if (event !== 'message') return
    if (notif.module !== 'laundry') return

    const type = notif.type
    if (type === 'critical' || type === 'warning') {
      qc.invalidateQueries({ queryKey: ['laundry-sla'] })
    }
    if (type === 'info') {
      qc.invalidateQueries({ queryKey: ['laundry-items'] })
      qc.invalidateQueries({ queryKey: ['laundry-machines'] })
    }
    qc.invalidateQueries({ queryKey: ['laundry-stats'] })
    // Odalar v2 — overview + açık olabilecek detay panelleri canlı yenile
    qc.invalidateQueries({ queryKey: ['laundry-rooms-overview'] })
    qc.invalidateQueries({ queryKey: ['laundry-room-detail'] })
    qc.invalidateQueries({ queryKey: ['premium-search'] })
    qc.invalidateQueries({ queryKey: ['premium-garments'] })
    qc.invalidateQueries({ queryKey: ['garment-detail'] })
    qc.invalidateQueries({ queryKey: ['laundry-premium-report'] })
    qc.invalidateQueries({ queryKey: ['mobile-laundry-items'] })

    const toastType = type === 'critical' ? 'error' : type === 'warning' ? 'warning' : 'info'
    addToast(notif.message, toastType)
  }, [qc, addToast])
}
