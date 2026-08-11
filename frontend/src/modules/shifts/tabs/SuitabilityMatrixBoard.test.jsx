import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SuitabilityMatrixBoard from './SuitabilityMatrixBoard.jsx'
import api from '../../../shared/api/client.js'

vi.mock('../../../shared/api/client.js', () => ({ default: { get: vi.fn() } }))

const GUNLER = ['2026-05-11', '2026-05-12']

const satir = (over = {}) => ({
  staff_id: 10, full_name: 'Ali Veli', dept_name: 'Temizlik', role_name: 'Meydancı',
  eligible: true, fully_verified: true, blockers: [], warnings: [], unknown: [], checks: [], ...over,
})

const cevap = (over = {}) => ({ data: {
  date: '2026-05-11',
  filters: {},
  summary: { total: 3, eligible: 3, blocked: 0, with_warnings: 0, not_fully_verified: 0 },
  items: [satir()],
  truncated_at: null,
  ...over,
} })

function ciz(props = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SuitabilityMatrixBoard weekDays={GUNLER} shiftDefs={[{ id: 1, name: 'Gündüz' }]}
        departments={[{ id: 1, name: 'Temizlik' }]} {...props} />
    </QueryClientProvider>
  )
}

const ac = async () => userEvent.click(screen.getByRole('button', { name: 'Uygunluk matrisi' }))

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue(cevap())
})

describe('Uygunluk matrisi panosu', () => {
  // Panel kapaliyken tum kadroyu degerlendirmek pahali; istek acilinca gitmeli.
  it('kapalıyken istek atmaz', async () => {
    ciz()
    expect(api.get).not.toHaveBeenCalled()
    await ac()
    expect(api.get).toHaveBeenCalled()
  })

  it('kişiyi durumuyla listeler', async () => {
    ciz()
    await ac()
    expect(await screen.findByText('Ali Veli')).toBeInTheDocument()
    expect(screen.getByText('uygun')).toBeInTheDocument()
  })

  // Engelli kişi listeden çıkarılmaz; gerekçesi görünür.
  it('engelli kişiyi gerekçesiyle listede tutar', async () => {
    api.get.mockResolvedValue(cevap({
      items: [satir({
        eligible: false, blockers: ['on_leave'],
        checks: [{ key: 'on_leave', label: 'İzin', status: 'block', detail: 'annual izni (2026-05-11 → 2026-05-11)' }],
      })],
      summary: { total: 3, eligible: 2, blocked: 1, with_warnings: 0, not_fully_verified: 0 },
    }))
    ciz()
    await ac()
    expect(await screen.findByText('1 engel')).toBeInTheDocument()
    expect(screen.getByText(/annual izni/)).toBeInTheDocument()
  })

  // Ölçülemeyen kontrol gizlenirse liste olduğundan güvenilir görünür.
  it('ölçülemeyen kontrolü olan kişi sayısını söyler', async () => {
    api.get.mockResolvedValue(cevap({
      summary: { total: 3, eligible: 3, blocked: 0, with_warnings: 0, not_fully_verified: 2 },
    }))
    ciz()
    await ac()
    expect(await screen.findByText(/2 kişide ölçülemeyen kontrol var/)).toBeInTheDocument()
  })

  // Kırpma sessiz kalırsa liste tam sanılır.
  it('kırpılan listeyi bildirir', async () => {
    api.get.mockResolvedValue(cevap({ truncated_at: 300 }))
    ciz()
    await ac()
    expect(await screen.findByText(/ilk 300 kişiyle sınırlandı/)).toBeInTheDocument()
  })

  it('yalnız uygunlar filtresi isteğe yansır', async () => {
    ciz()
    await ac()
    await screen.findByText('Ali Veli')
    await userEvent.click(screen.getByLabelText('Yalnız uygunlar'))
    expect(api.get).toHaveBeenLastCalledWith('/shifts/suitability-matrix',
      { params: expect.objectContaining({ only_eligible: '1' }) })
  })

  it('boş sonuçta açıkça söyler', async () => {
    api.get.mockResolvedValue(cevap({ items: [] }))
    ciz()
    await ac()
    expect(await screen.findByText('Bu filtrede kimse yok.')).toBeInTheDocument()
  })

  it('hata durumunda sebebi ve tekrar denemeyi gösterir', async () => {
    api.get.mockRejectedValue({ response: { data: { error: 'Geçersiz tarih' } } })
    ciz()
    await ac()
    expect(await screen.findByText(/Geçersiz tarih/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeInTheDocument()
  })
})
