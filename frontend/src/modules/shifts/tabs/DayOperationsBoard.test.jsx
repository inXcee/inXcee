import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DayOperationsBoard from './DayOperationsBoard.jsx'
import api from '../../../shared/api/client.js'

vi.mock('../../../shared/api/client.js', () => ({
  default: { get: vi.fn(), post: vi.fn(() => Promise.resolve({ data: {} })) },
}))

const GUNLER = ['2026-08-10', '2026-08-11']

const gunCevabi = (over = {}) => ({ data: {
  date: GUNLER[0],
  summary: { planned: 5, worked: 12, on_leave: 2, absent: 0, off: 3, total: 22 },
  coverage_gaps: [],
  attendance: { available: false, reason: 'attendance_logs boş — turnike/kart kaydı sisteme akmıyor', count: 0 },
  handover: [],
  unavailable: [],
  ...over,
} })

function ciz() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><DayOperationsBoard weekDays={GUNLER} /></QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation(url => {
    if (url.includes('replacements')) return Promise.resolve({ data: { items: [] } })
    return Promise.resolve(gunCevabi())
  })
})

describe('Günlük operasyon paneli', () => {
  it('kapsama tamsa açıkça söyler', async () => {
    expect(await screen.findByText('kapsama tam', {}, { container: ciz().container })).toBeInTheDocument()
  })

  it('eksik kadroyu nokta nokta gösterir', async () => {
    api.get.mockImplementation(url => {
      if (url.includes('replacements')) return Promise.resolve({ data: { items: [] } })
      return Promise.resolve(gunCevabi({ coverage_gaps: [
        { rule_id: 1, rule_name: 'OTC Sabah', location: 'OTC Lokal', shift_name: 'Gündüz', time: '06:00-15:00', required: 3, assigned: 1, missing: 2 },
      ] }))
    })
    ciz()
    expect(await screen.findByText(/2 kişi eksik · 1 nokta/)).toBeInTheDocument()
    expect(screen.getByText('OTC Sabah')).toBeInTheDocument()
    expect(screen.getByText('1/3')).toBeInTheDocument()
  })

  // Canlıda attendance_logs boş; "0 devamsız" demek yanlış güven verir.
  it('giriş/çıkış kaydı yoksa sebebini yazar', async () => {
    ciz()
    expect(await screen.findByText(/Giriş\/çıkış kaydı yok/)).toBeInTheDocument()
    expect(screen.getByText(/turnike\/kart kaydı sisteme akmıyor/)).toBeInTheDocument()
  })

  it('yerine çağrılabilecekleri istendiğinde getirir', async () => {
    const user = userEvent.setup()
    api.get.mockImplementation(url => {
      if (url.includes('replacements')) {
        return Promise.resolve({ data: { items: [
          { id: 1, full_name: 'Ali Veli', department_name: 'Mutfak', role_name: 'Aşçı', son_7_gun_calisma: 0 },
        ] } })
      }
      return Promise.resolve(gunCevabi())
    })
    ciz()
    await user.click(await screen.findByRole('button', { name: /Yerine çağrılabilecekler/ }))
    expect(await screen.findByText('Ali Veli')).toBeInTheDocument()
    expect(screen.getByText(/son 7 gün 0/)).toBeInTheDocument()
  })

  it('devir teslim notu ekler', async () => {
    const user = userEvent.setup()
    ciz()
    await screen.findByText('kapsama tam')
    await user.type(screen.getByLabelText('Devir teslim notu'), 'Gece 2 kişi eksik kaldı')
    await user.click(screen.getByRole('button', { name: 'Ekle' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/shifts/day-operations/handover',
      expect.objectContaining({ note: 'Gece 2 kişi eksik kaldı' }),
    ))
  })

  it('boş notta ekleme düğmesi kapalı', async () => {
    ciz()
    await screen.findByText('kapsama tam')
    expect(screen.getByRole('button', { name: 'Ekle' })).toBeDisabled()
  })

  // Boş liste "sorun yok" sanılmasın.
  it('okunamayan kaynağı bildirir', async () => {
    api.get.mockImplementation(url => {
      if (url.includes('replacements')) return Promise.resolve({ data: { items: [] } })
      return Promise.resolve(gunCevabi({ unavailable: [{ source: 'shift_coverage_rules', error: 'no such table' }] }))
    })
    ciz()
    expect(await screen.findByText(/1 kaynak okunamadı, bu özet eksik olabilir/)).toBeInTheDocument()
  })
})
