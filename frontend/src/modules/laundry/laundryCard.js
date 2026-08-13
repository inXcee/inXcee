import { useQuery } from '@tanstack/react-query'
import { laundryApi } from './api.js'

export {
  cardGateMessage,
  cardGateReady,
  cardRequestFields,
  emptyLaundryCard,
} from '../laundry-kiosk/laundryCard.js'

export function useLaundryCardRequirement(action) {
  const query = useQuery({
    queryKey: ['laundry-card-settings'],
    queryFn: laundryApi.getCardSettings,
    staleTime: 30_000,
  })
  const settings = query.data || {}
  return {
    ...query,
    settings,
    required: action === 'intake'
      ? settings.intake_required === true
      : settings.delivery_required === true,
  }
}
