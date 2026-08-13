import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import QrCodesPage from './QrCodesPage.jsx'
import api from '../../shared/api/client.js'

vi.mock('../../shared/api/client.js', () => ({
  default: { get: vi.fn(), post: vi.fn(() => Promise.resolve({ data: { created: 0 } })) },
}))

// QR altyapısı ve sakinin gördüğü portal vardı ama yöneticinin göreceği ekran
// yoktu: kodlar üretildi, kimse nerede olduklarını göremedi, basacak çıktı yoktu.

const cevaplar = ({ kapsam, konumlar, ayarlar } = {}) => url => {
  if (url.includes('coverage')) return Promise.resolve({ data: kapsam ?? { active_locations: 1078, locations_with_qr: 1078 } })
  if (url.includes('settings')) return Promise.resolve({ data: ayarlar ?? { location_portal_enabled: true } })
  if (url.includes('locations')) return Promise.resolve({ data: konumlar ?? { items: [
    { id: 1, display_name: 'M1 Oda 101', block: 'M1', floor: 1, location_type: 'room', token: 'tok' },
  ], total: 1 } })
  return Promise.resolve({ data: {} })
}

const ciz = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><QrCodesPage /></QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation(cevaplar())
})

describe('QR kodları ekranı', () => {
  it('kapsamı sayıyla gösterir', async () => {
    ciz()
    expect(await screen.findByText('QR\'I OLMAYAN')).toBeInTheDocument()
    expect(screen.getByText('hepsi hazır')).toBeInTheDocument()
  })

  // Eksik QR baskıda sessizce boşluk bırakır; sayı görünmeli.
  it('eksik QR varsa kırmızı sayar ve üretme düğmesi çıkarır', async () => {
    api.get.mockImplementation(cevaplar({ kapsam: { active_locations: 1078, locations_with_qr: 1000 } }))
    ciz()
    expect(await screen.findByText('78')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Eksik 78 QR'ı üret/ })).toBeInTheDocument()
  })

  it('konum listesini QR durumuyla gösterir', async () => {
    ciz()
    expect(await screen.findByText('M1 Oda 101')).toBeInTheDocument()
    expect(screen.getByText('QR var')).toBeInTheDocument()
  })

  // QR'ı olmayan konum baskıda eksik kalır; listede ayırt edilmeli.
  it('QR\'ı olmayan konumu işaretler', async () => {
    api.get.mockImplementation(cevaplar({ konumlar: { items: [
      { id: 2, display_name: 'S2 Oda 101', block: 'S2', floor: 1, location_type: 'room', token: null },
    ], total: 1 } }))
    ciz()
    expect(await screen.findByText('QR YOK')).toBeInTheDocument()
  })

  // Portal kapalıyken etiket basmak boşa emek: okutan kişi hiçbir şey yapamaz.
  it('portal kapalıysa uyarır', async () => {
    api.get.mockImplementation(cevaplar({ ayarlar: { location_portal_enabled: false } }))
    ciz()
    expect(await screen.findByText(/Portal kapalı/)).toBeInTheDocument()
  })

  // Süre SUNUCUDA ölçüldü; geliştirme makinesinin ölçümünü yazmak yalan olurdu.
  it('filtresiz baskının gerçek maliyetini sayfa ve süreyle söyler', async () => {
    ciz()
    expect(await screen.findByText(/1078 etiket/)).toBeInTheDocument()
    expect(screen.getByText(/90 sayfa/)).toBeInTheDocument()
    expect(screen.getByText(/~40 saniye/)).toBeInTheDocument()
  })

  it('blok seçilince uyarı kalkar ve istek filtrelenir', async () => {
    ciz()
    await screen.findByText('M1 Oda 101')
    await userEvent.selectOptions(screen.getByLabelText('Blok'), 'M1')
    expect(api.get).toHaveBeenLastCalledWith('/location-portal/locations',
      { params: expect.objectContaining({ block: 'M1' }) })
    expect(screen.queryByText(/~11 saniye/)).not.toBeInTheDocument()
  })

  it('liste kırpıldıysa baskının tamamı kapsadığını söyler', async () => {
    api.get.mockImplementation(cevaplar({ konumlar: { items: [
      { id: 1, display_name: 'M1 Oda 101', block: 'M1', floor: 1, location_type: 'room', token: 'tok' },
    ], total: 900 } }))
    ciz()
    expect(await screen.findByText(/\+899 konum daha/)).toBeInTheDocument()
  })
})
