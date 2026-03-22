import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../store/authStore.js'

export function useOccupancy() {
  const token = useAuthStore(s => s.token)
  const queryClient = useQueryClient()
  const esRef = useRef(null)

  useEffect(() => {
    if (!token) return

    const es = new EventSource(`/api/notifications/stream?token=${token}`)
    esRef.current = es

    es.addEventListener('occupancy', () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-kpi'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-bed-occupancy'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-heatmap'] })
    })

    es.onerror = () => es.close()

    return () => es.close()
  }, [token, queryClient])
}
