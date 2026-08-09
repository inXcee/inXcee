import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PublishBar from './PublishBar.jsx'
import api from '../../../shared/api/client.js'
import { useAuthStore } from '../../../shared/store/authStore.js'

vi.mock('../../../shared/api/client.js', () => ({
  default: { get: vi.fn(), post: vi.fn(() => Promise.resolve({ data: {} })) },
}))

const HAFTA = '2026-08-10'

const durum = (over = {}) => ({ data: {
  week_start: HAFTA, status: 'draft', version: 0, published_at: null, changes: null, ...over,
} })

function ciz(rol = 'campus_manager') {
  useAuthStore.setState({ user: { id: 1, role: rol } })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><PublishBar weekStart={HAFTA} /></QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  api.post.mockResolvedValue({ data: { version: 1, entries: 12 } })
})

describe('Yayın durumu şeridi', () => {
  it('yayınlanmamış hafta TASLAK gösterir', async () => {
    api.get.mockResolvedValue(durum())
    ciz()
    expect(await screen.findByText(/TASLAK/)).toBeInTheDocument()
    expect(screen.getByText(/kesin vardiya olarak duyurulmadı/)).toBeInTheDocument()
  })

  it('yayındaki hafta sürüm ve yayınlayanı gösterir', async () => {
    api.get.mockResolvedValue(durum({
      status: 'published', version: 3, published_by_name: 'Müdür',
      published_at: '2026-08-10 09:30:00', changes: { added: [], changed: [], removed: [], total: 0 },
    }))
    ciz()
    expect(await screen.findByText(/YAYINDA/)).toBeInTheDocument()
    expect(screen.getByText(/v3 · Müdür/)).toBeInTheDocument()
  })

  // Asıl kazanç: yayından sonra değişen hücreler görünür olmalı, yoksa
  // personelin gördüğü çizelge ile ekrandaki sessizce ayrışır.
  it('yayından beri değişiklik varsa uyarır ve satır satır döker', async () => {
    const user = userEvent.setup()
    api.get.mockResolvedValue(durum({
      status: 'published', version: 2,
      changes: {
        added: [{ staff_id: 11, work_date: '2026-08-11', full_name: 'Ayşe Demir', shift_name: 'Gece' }],
        changed: [{
          before: { staff_id: 10, work_date: '2026-08-10', full_name: 'Ali Veli', shift_name: 'Gündüz' },
          after: { staff_id: 10, work_date: '2026-08-10', full_name: 'Ali Veli', shift_name: 'Gece' },
        }],
        removed: [{ staff_id: 12, work_date: '2026-08-12', full_name: 'Can Öz', shift_name: 'Gündüz' }],
        total: 3,
      },
    }))
    ciz()
    await user.click(await screen.findByRole('button', { name: /Yayından beri 3 değişiklik/ }))

    // Sayı değil, KİM etkilendi görünmeli.
    expect(screen.getByText(/Ayşe Demir · 2026-08-11 · Gece/)).toBeInTheDocument()
    expect(screen.getByText(/Ali Veli · 2026-08-10 · Gündüz → Gece/)).toBeInTheDocument()
    expect(screen.getByText(/Can Öz · 2026-08-12 · Gündüz/)).toBeInTheDocument()
    expect(screen.getByText(/Personelin gördüğü çizelge v2/)).toBeInTheDocument()
  })

  // Kırpma sessiz kalırsa liste tam sanılır.
  it('uzun listede kırpılanı açıkça bildirir', async () => {
    const user = userEvent.setup()
    const cok = Array.from({ length: 12 }, (_, i) => ({
      staff_id: i, work_date: '2026-08-11', full_name: `Kisi ${i}`, shift_name: 'Gece',
    }))
    api.get.mockResolvedValue(durum({
      status: 'published', version: 1,
      changes: { added: cok, changed: [], removed: [], total: 12 },
    }))
    ciz()
    await user.click(await screen.findByRole('button', { name: /Yayından beri 12 değişiklik/ }))
    expect(screen.getByText(/\+4 değişiklik daha/)).toBeInTheDocument()
  })

  it('değişiklik yoksa uyarı çıkmaz', async () => {
    api.get.mockResolvedValue(durum({
      status: 'published', version: 1, changes: { added: [], changed: [], removed: [], total: 0 },
    }))
    ciz()
    await screen.findByText(/YAYINDA/)
    expect(screen.queryByText(/Yayından beri/)).not.toBeInTheDocument()
  })

  it('müdür yayınlayabilir', async () => {
    const user = userEvent.setup()
    api.get.mockResolvedValue(durum())
    ciz('campus_manager')
    await user.click(await screen.findByRole('button', { name: 'Yayınla' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/shifts/schedule/version/publish', expect.objectContaining({ week: HAFTA }),
    ))
  })

  // Durumu herkes görmeli; yalnız yayınlama müdürde.
  it('vardiya amiri durumu görür ama yayınlayamaz', async () => {
    api.get.mockResolvedValue(durum())
    ciz('shift_supervisor')
    expect(await screen.findByText(/TASLAK/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Yayınla' })).not.toBeInTheDocument()
    expect(screen.getByText('Yayınlama yetkisi müdürde')).toBeInTheDocument()
  })

  it('yayındayken geri çekme sunulur', async () => {
    const user = userEvent.setup()
    api.get.mockResolvedValue(durum({
      status: 'published', version: 1, changes: { added: [], changed: [], removed: [], total: 0 },
    }))
    ciz()
    await user.click(await screen.findByRole('button', { name: 'Yayını geri çek' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/shifts/schedule/version/withdraw', expect.objectContaining({ week: HAFTA }),
    ))
  })

  it('uç patlarsa sebebi yazar', async () => {
    api.get.mockRejectedValue({ response: { status: 500, data: { error: 'no such table: schedule_versions' } } })
    ciz()
    expect(await screen.findByText(/no such table: schedule_versions/)).toBeInTheDocument()
  })
})
