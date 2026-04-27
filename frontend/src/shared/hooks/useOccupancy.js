import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../store/authStore.js'
import { useEventStream } from './useEventStream.js'

export function useOccupancy() {
  const token = useAuthStore(s => s.token)
  const queryClient = useQueryClient()

  useEventStream('/api/notifications/stream', token, ({ event }) => {
    if (event !== 'occupancy') return
    queryClient.invalidateQueries({ queryKey: ['dashboard-kpi'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard-bed-occupancy'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard-heatmap'] })
  }, [queryClient])
}
