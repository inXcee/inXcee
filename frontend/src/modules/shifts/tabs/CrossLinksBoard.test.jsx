import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import CrossLinksBoard from './CrossLinksBoard.jsx'
import api from '../../../shared/api/client.js'

vi.mock('../../../shared/api/client.js', () => ({ default: { get: vi.fn() } }))

const GUNLER = ['2026-05-11', '2026-05-12']

const baglar = (over = {}) => ({
  transport: {
    measurable: true, working: 10, assigned: 8,
    working_without_transport: { items: [{ staff_id: 11, full_name: 'Ayşe Can' }], truncated: 0 },
    transport_without_shift: { items: [], truncated: 0 },
    boarded_tracked: true,
  },
  meals: {
    measurable: true, working: 10,
    by_type: [{ type: 'lunch', selected: 8, attending: 7, gap: 3 }],
    working_without_selection: { items: [], truncated: 0 },
  },
  attendance: { measurable: true, source_rows: 5, with_evidence: 4, working: 10 },
  combined_risk: { measurable: true, not_boarded: 2, absent: 1, both: { items: [{ staff_id: 10, full_name: 'Ali Veli' }], truncated: 0 } },
  exited_future: { measurable: true, count: 0, people: { items: [], truncated: 0 } },
  ...over,
})

const cevap = (over = {}) => {
  const l = baglar(over)
  return { data: { date: '2026-05-11', links: l, unmeasurable: Object.entries(l).filter(([, v]) => !v.measurable).map(([k]) => k) } }
}

function ciz() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <CrossLinksBoard weekDays={GUNLER} />
    </QueryClientProvider>
  )
}

const ac = async () => userEvent.click(screen.getByRole('button', { name: 'Modüller arası bağlar' }))

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue(cevap())
})

describe('Modüller arası bağ panosu', () => {
  it('kapalıyken istek atmaz', async () => {
    ciz()
    expect(api.get).not.toHaveBeenCalled()
    await ac()
    expect(api.get).toHaveBeenCalled()
  })

  it('servise yazılmayan çalışanı listeler', async () => {
    ciz()
    await ac()
    expect(await screen.findByText(/Çizelgede var, servise yazılmamış/)).toBeInTheDocument()
    expect(screen.getByText('Ayşe Can')).toBeInTheDocument()
  })

  // "0 eksik" ile "servis o gün hiç kullanılmamış" bambaşka şeyler.
  it('ölçülemeyen bağda sıfır değil gerekçe gösterir', async () => {
    api.get.mockResolvedValue(cevap({
      transport: { measurable: false, reason: 'Bu güne servis seferi/ataması girilmemiş — vardiya-servis eşleşmesi ölçülemez' },
    }))
    ciz()
    await ac()
    expect(await screen.findByText(/servis seferi\/ataması girilmemiş/)).toBeInTheDocument()
    expect(screen.getByText(/1 bağ ölçülemiyor/)).toBeInTheDocument()
  })

  it('turnike kaydı yoksa gerekçeyi yazar', async () => {
    api.get.mockResolvedValue(cevap({
      attendance: { measurable: false, reason: 'Turnike/kart kaydı sisteme hiç akmıyor — devam kanıtı ölçülemez', source_rows: 0 },
    }))
    ciz()
    await ac()
    expect(await screen.findByText(/hiç akmıyor/)).toBeInTheDocument()
  })

  it('birleşik riski kesişimle gösterir', async () => {
    ciz()
    await ac()
    expect(await screen.findByText(/Hem binmedi hem gelmedi/)).toBeInTheDocument()
    expect(screen.getByText('Ali Veli')).toBeInTheDocument()
  })

  it('ayrılmış kişinin gelecek vardiyası yoksa açıkça söyler', async () => {
    ciz()
    await ac()
    expect(await screen.findByText('Ayrılmış kimsenin gelecek vardiyası yok.')).toBeInTheDocument()
  })

  it('ayrılmış kişinin duran vardiyasını çıkış tarihiyle gösterir', async () => {
    api.get.mockResolvedValue(cevap({
      exited_future: {
        measurable: true, count: 1,
        people: { items: [{ staff_id: 12, full_name: 'Veli Ak', exit_date: '2026-05-01', first_shift: '2026-05-20', days: 2 }], truncated: 0 },
      },
    }))
    ciz()
    await ac()
    expect(await screen.findByText(/çıkış 2026-05-01 · ilk vardiya 2026-05-20/)).toBeInTheDocument()
  })

  // Kırpma sessiz kalırsa liste tam sanılır.
  it('kırpılan listeyi bildirir', async () => {
    api.get.mockResolvedValue(cevap({
      transport: {
        measurable: true, working: 40, assigned: 10,
        working_without_transport: { items: [{ staff_id: 11, full_name: 'Ayşe Can' }], truncated: 29 },
        transport_without_shift: { items: [], truncated: 0 }, boarded_tracked: true,
      },
    }))
    ciz()
    await ac()
    expect(await screen.findByText('+29 kişi daha')).toBeInTheDocument()
  })

  it('hata durumunda sebebi ve tekrar denemeyi gösterir', async () => {
    api.get.mockRejectedValue({ response: { data: { error: 'Geçersiz tarih' } } })
    ciz()
    await ac()
    expect(await screen.findByText(/Geçersiz tarih/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeInTheDocument()
  })
})
