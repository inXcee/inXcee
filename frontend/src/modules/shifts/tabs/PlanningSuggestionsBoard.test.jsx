import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PlanningSuggestionsBoard from './PlanningSuggestionsBoard.jsx'
import api from '../../../shared/api/client.js'

vi.mock('../../../shared/api/client.js', () => ({ default: { get: vi.fn() } }))

const GUNLER = ['2026-05-11', '2026-05-12']

const aday = (over = {}) => ({
  staff_id: 10, full_name: 'Ali Veli', score: 72,
  reasons: [{ delta: 25, aciklama: 'rol uyuyor' }], warnings: [], fully_verified: true,
  history: { son14Gun: 3, geceSayisi: 0, haftaSonu: 1 }, ...over,
})

const acik = (over = {}) => ({
  rule_id: 1, rule_name: 'OTC gündüz', shift_name: 'Gündüz', location: 'OTC Lokal',
  required: 2, assigned: 1, missing: 1, candidates: [aday()], candidate_pool: 3,
  blocked_count: 0, pool_truncated: null, ...over,
})

const oneri = (over = {}) => ({ data: {
  date: '2026-05-11', strategy: 'coverage', gaps: [acik()],
  summary: { gaps: 1, missing_total: 1, fillable: 1, no_candidate: 0 },
  unavailable: [], ...over,
} })

const senaryo = () => ({ data: {
  date: '2026-05-11',
  scenarios: [
    { strategy: 'coverage', fills: 1, remaining: 0, distinct_people: 1, stacked: 0, avg_recent_shifts: 3, unverified: 0, picks: [] },
    { strategy: 'fairness', fills: 1, remaining: 0, distinct_people: 1, stacked: 0, avg_recent_shifts: 1, unverified: 0, picks: [] },
    { strategy: 'cost', fills: 1, remaining: 0, distinct_people: 1, stacked: 0, avg_recent_shifts: 2, unverified: 0, picks: [] },
  ],
  recommendation: { most_filled: 'coverage', most_balanced: 'fairness', note: 'Öneri karar değildir — ...' },
} })

function ciz() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <PlanningSuggestionsBoard weekDays={GUNLER} departments={[{ id: 1, name: 'Temizlik' }]} />
    </QueryClientProvider>
  )
}

const ac = async () => userEvent.click(screen.getByRole('button', { name: 'Planlama önerileri' }))

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation(url => (url.includes('scenarios') ? Promise.resolve(senaryo()) : Promise.resolve(oneri())))
})

describe('Planlama önerisi panosu', () => {
  it('kapalıyken istek atmaz', async () => {
    ciz()
    expect(api.get).not.toHaveBeenCalled()
    await ac()
    expect(api.get).toHaveBeenCalled()
  })

  it('açığı ve adayı puan-gerekçesiyle gösterir', async () => {
    ciz()
    await ac()
    expect(await screen.findByText('OTC gündüz')).toBeInTheDocument()
    expect(screen.getByText('72')).toBeInTheDocument()
    expect(screen.getByText('rol uyuyor')).toBeInTheDocument()
  })

  // "Aday yok" ile "adaylar engelli" farklı şeylerdir.
  it('adayların hepsi engelliyse bunu ayrı yazar', async () => {
    api.get.mockResolvedValue(oneri({ gaps: [acik({ candidates: [], blocked_count: 4 })] }))
    ciz()
    await ac()
    expect(await screen.findByText(/havuzdaki 4 kişinin hepsi engelli/)).toBeInTheDocument()
  })

  it('havuz hiç yoksa farklı söyler', async () => {
    api.get.mockResolvedValue(oneri({ gaps: [acik({ candidates: [], blocked_count: 0 })] }))
    ciz()
    await ac()
    expect(await screen.findByText('Bu nokta için aday havuzu boş.')).toBeInTheDocument()
  })

  it('açık yoksa açıkça söyler', async () => {
    api.get.mockResolvedValue(oneri({ gaps: [], summary: { gaps: 0, missing_total: 0, fillable: 0, no_candidate: 0 } }))
    ciz()
    await ac()
    expect(await screen.findByText('Bu gün için kapsama açığı yok.')).toBeInTheDocument()
  })

  // Ölçülemeyen kontrol sessizce "temiz" görünmemeli.
  it('ölçülemeyen kontrolü olan adayı işaretler', async () => {
    api.get.mockResolvedValue(oneri({ gaps: [acik({ candidates: [aday({ fully_verified: false })] })] }))
    ciz()
    await ac()
    expect(await screen.findByText('ölçülemeyen kontrol')).toBeInTheDocument()
  })

  it('havuz kırpıldıysa bildirir', async () => {
    api.get.mockResolvedValue(oneri({ gaps: [acik({ pool_truncated: 60 })] }))
    ciz()
    await ac()
    expect(await screen.findByText(/ilk 60 kişiyle sınırlandı/)).toBeInTheDocument()
  })

  it('senaryoları yan yana karşılaştırır ve ölçütü yazar', async () => {
    ciz()
    await ac()
    await userEvent.click(screen.getByText(/Senaryoları karşılaştır/))
    expect(await screen.findByText('Adalet önceliği')).toBeInTheDocument()
    expect(screen.getByText(/Öneri karar değildir/)).toBeInTheDocument()
    expect(screen.getByText(/En dengeli: Adalet önceliği/)).toBeInTheDocument()
  })

  it('strateji değişimi isteğe yansır', async () => {
    ciz()
    await ac()
    await screen.findByText('OTC gündüz')
    await userEvent.selectOptions(screen.getByLabelText('Öneri stratejisi'), 'fairness')
    expect(api.get).toHaveBeenLastCalledWith('/shifts/planning-suggestions',
      { params: expect.objectContaining({ strategy: 'fairness' }) })
  })

  it('hata durumunda sebebi ve tekrar denemeyi gösterir', async () => {
    api.get.mockRejectedValue({ response: { data: { error: 'Geçersiz strateji' } } })
    ciz()
    await ac()
    expect(await screen.findByText(/Geçersiz strateji/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeInTheDocument()
  })
})
