import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CardSystemSettings } from './LaundrySettings.jsx'
import { laundryApi } from './api.js'
import { useAuthStore } from '../../shared/store/authStore.js'

vi.mock('./api.js', () => ({
  laundryApi: { getCardSettings: vi.fn(), getCardCoverage: vi.fn(), updateCardSetting: vi.fn() },
}))

// Canlıda zorunluluk SIFIR kartla açıldı ve kimse fark etmedi. Ekran "kartlar
// dağıtıldı mı?" diye soruyordu; artık sayıyor.

const ciz = () => {
  useAuthStore.setState({ user: { id: 1, role: 'campus_manager' } })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><CardSystemSettings /></QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  laundryApi.getCardSettings.mockResolvedValue({ intake_required: false, delivery_required: false })
})

describe('kart kapsamı şeridi', () => {
  it('kaç sakinde kart olduğunu sayıyla yazar', async () => {
    laundryApi.getCardCoverage.mockResolvedValue({
      available: true, residents: 12, with_card: 12, without_card: 0, ratio: 1,
      missing: [], missing_truncated: 0, warnings: [],
    })
    ciz()
    expect(await screen.findByText(/12 sakinden 12 kişide kart var/)).toBeInTheDocument()
  })

  // Asıl yakalanmak istenen durum.
  it('zorunluluk açıkken eksik kartı uyarı olarak gösterir ve kimler olduğunu yazar', async () => {
    laundryApi.getCardCoverage.mockResolvedValue({
      available: true, residents: 12, with_card: 9, without_card: 3, ratio: 0.75,
      missing: [{ personnel_id: 1, full_name: 'Ali', room: 'M1-101' }],
      missing_truncated: 2,
      warnings: ['Kart zorunluluğu açık ama 3 sakinin kartı yok — her işlemlerinde gerekçe yazılması gerekecek'],
    })
    ciz()
    expect(await screen.findByText(/3 sakinin kartı yok/)).toBeInTheDocument()
    expect(screen.getByText(/Kartsız: Ali/)).toBeInTheDocument()
    expect(screen.getByText(/\+2 kişi daha/)).toBeInTheDocument()
  })

  // Ölçülemeyen kapsamı "tam" saymak, kaçırılan hatayı tekrar eder.
  it('kapsam ölçülemediyse bunu söyler, tam saymaz', async () => {
    laundryApi.getCardCoverage.mockResolvedValue({
      available: false, reason: 'Kart kapsamı okunamadı: no such table',
      warnings: ['Kapsam ölçülemedi — zorunluluğu açmadan önce elle doğrulayın'],
    })
    ciz()
    expect(await screen.findByText(/okunamadı/)).toBeInTheDocument()
    expect(screen.queryByText(/kişide kart var/)).not.toBeInTheDocument()
  })
})
