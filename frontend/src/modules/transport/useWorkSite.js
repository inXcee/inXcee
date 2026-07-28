import { useQuery } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { WORK_SITE } from './zonguldakBartin.js'

// Is yeri (varis noktasi) konumu artik sunucuda saklanir ve haritadan tasinabilir.
// zonguldakBartin.js#WORK_SITE yalnizca ilk render/istek basarisiz oldugunda kullanilan
// varsayilandir — tek dogru kaynak backend'dir (bkz. backend workSite.js).
export const WORK_SITE_QUERY_KEY = ['transport-work-site']

export function useWorkSite() {
  const { data } = useQuery({
    queryKey: WORK_SITE_QUERY_KEY,
    queryFn: () => api.get('/transport/work-site').then(r => r.data),
    staleTime: 60_000,
  })
  return data || WORK_SITE
}
