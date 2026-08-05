import { useQuery } from '@tanstack/react-query'
import api from '../api/client.js'

// Proje listesi birkaç ekranda birden lazım (personel listesi, personel kartı,
// vardiya çizelgesi). Tek query key kullanılır ki bir kadro değişikliğinden
// sonra hepsi aynı anda tazelensin.
export const PROJECTS_QUERY_KEY = ['projects']

export function useProjects({ enabled = true } = {}) {
  const { data = [], isLoading } = useQuery({
    queryKey: PROJECTS_QUERY_KEY,
    queryFn: () => api.get('/projects').then(r => r.data),
    enabled,
    staleTime: 60000,
  })
  return { projects: data, isLoading }
}

// Kadrosu olmayanların filtre değeri. Boş string "filtre yok" demek olduğu için
// ayrı bir işaret gerekiyor; backend de aynı değeri bekliyor.
export const NO_PROJECT = 'none'
