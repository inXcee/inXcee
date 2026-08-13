import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'

const roster = [
  { id: 1, full_name: 'Ali Veli', department_name: 'Temizlik',
    access_id: 11, access_code: 'AVS-A:abcdef0123', access_nfc: null, access_photo: null,
    meal_id: null, meal_code: null, meal_nfc: null, meal_photo: null },
]

const residentRoster = [
  { id: 91, full_name: 'Sakin Resident', company: 'Örnek AŞ', block: 'M1', room_no: '101',
    laundry_id: 801, laundry_code: 'AVS-C:resident001', laundry_nfc: '04AABB', laundry_photo: null },
  { id: 92, full_name: 'Kartsız Sakin', company: 'Örnek AŞ', block: 'M1', room_no: '102',
    laundry_id: null, laundry_code: null, laundry_nfc: null, laundry_photo: null },
]

const scanStats = { available: true, total: 10, ok: 8, mismatch: 1, unknown_card: 0, inactive: 0, override: 1, success_ratio: 0.8 }
const scanIssues = { available: true, items: [{ id: 44, result: 'mismatch', card_holder_name: 'Başka Sakin', block: 'M2', room_no: '202', action: 'delivery', bag_no: 'T-0044', operator_name: 'Vardiya Amir', created_at: '2026-08-12 10:30:00', scanned_code: 'AVS-C:BASKA' }] }

const analyticsData = {
  days: 30,
  summary: [
    { card_type: 'access', active: 5, lost: 1, revoked: 0, nfc_bound: 3, coverage_pct: 71 },
    { card_type: 'meal', active: 4, lost: 0, revoked: 0, nfc_bound: 0, coverage_pct: 57 },
  ],
  usageByDay: [{ day: '2026-06-05', total: 12, ok: 11 }],
  usageByResult: [{ result: 'ok', count: 40 }, { result: 'denied', count: 3 }],
  topStations: [{ station_id: 1, name: 'Ana Giriş', count: 30 }],
}

vi.mock('../../shared/api/client.js', () => ({
  default: {
    get: vi.fn((url) => {
      if (url.includes('/cards/analytics')) return Promise.resolve({ data: analyticsData })
      if (url.includes('/cards/roster?holder_type=personnel')) return Promise.resolve({ data: residentRoster })
      if (url.includes('/laundry/card-scan-stats')) return Promise.resolve({ data: scanStats })
      if (url.includes('/laundry/card-scans')) return Promise.resolve({ data: scanIssues })
      return Promise.resolve({ data: roster })
    }),
    post: vi.fn(() => Promise.resolve({ data: { generated: 1 } })),
    patch: vi.fn(() => Promise.resolve({ data: { ok: true } })),
  },
}))

import CardsPage from './CardsPage.jsx'

describe('cards/CardsPage smoke', () => {
  beforeEach(() => vi.clearAllMocks())

  it('kart detayında foto çek butonu ve elle UID girişi görünür', async () => {
    renderWithProviders(<CardsPage />)
    fireEvent.click(await screen.findByText('Ali Veli'))
    // access kartı detayı açılır
    expect(await screen.findByText(/Foto çek/)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/NFC UID elle gir/)).toBeInTheDocument()
  })

  it('Web NFC desteklenmeyen ortamda (jsdom) NFC OKU butonu gizli', async () => {
    renderWithProviders(<CardsPage />)
    fireEvent.click(await screen.findByText('Ali Veli'))
    await screen.findByText(/Foto çek/)
    expect(screen.queryByText(/NFC OKU/)).not.toBeInTheDocument()
  })

  it('toplu PDF butonu doğru endpoint\'e blob isteği yapar', async () => {
    const api = (await import('../../shared/api/client.js')).default
    renderWithProviders(<CardsPage />)
    await screen.findByText('Ali Veli') // roster yüklensin → coverage>0, buton aktif olsun
    const btn = await screen.findByText(/giriş toplu PDF/)
    fireEvent.click(btn)
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(
      expect.stringContaining('/cards/batch-pdf?card_type=access'),
      expect.objectContaining({ responseType: 'blob' }),
    ))
  })

  it('Analiz görünümü özet ve kullanım bloklarını gösterir', async () => {
    renderWithProviders(<CardsPage />)
    fireEvent.click(await screen.findByText('📊 Analiz'))
    expect(await screen.findByText('SON 14 GÜN OKUTMA')).toBeInTheDocument()
    expect(screen.getByText('SONUÇ KIRILIMI (30 GÜN)')).toBeInTheDocument()
    expect(screen.getByText('EN YOĞUN İSTASYONLAR')).toBeInTheDocument()
    expect(screen.getByText('Ana Giriş')).toBeInTheDocument()
  })

  it('Hızlı Kayıt modu — Web NFC desteklenmeyen ortamda bilgi notu gösterir', async () => {
    renderWithProviders(<CardsPage />)
    fireEvent.click(await screen.findByText('📲 Hızlı Kayıt'))
    expect(await screen.findByText(/yalnızca/)).toBeInTheDocument()
    expect(screen.getByText(/Android Chrome/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sakin / çamaşır' })).toBeInTheDocument()
  })

  it('sakin çamaşır kartlarını çalışanlardan ayrı gösterir', async () => {
    const api = (await import('../../shared/api/client.js')).default
    renderWithProviders(<CardsPage />)
    fireEvent.click(screen.getByRole('button', { name: /Sakin Çamaşır Kartları/ }))
    expect(await screen.findByText('Sakin Resident')).toBeInTheDocument()
    expect(screen.getByText('Kartsız Sakin')).toBeInTheDocument()
    expect(screen.getByText('Sakin Resident').closest('button')).toHaveTextContent('M1/101')
    fireEvent.click(screen.getByText('Sakin Resident'))
    expect(await screen.findByRole('button', { name: /Tekli PDF/ })).toBeInTheDocument()
    expect(screen.getByLabelText(/NFC UID/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/NFC UID/), { target: { value: '04:11:22' } })
    fireEvent.click(screen.getByRole('button', { name: 'Bağla' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/cards/801/bind-nfc', { nfc_uid: '04:11:22' }))

    fireEvent.click(screen.getByText('Kartsız Sakin'))
    fireEvent.click(await screen.findByRole('button', { name: /Çamaşır kartı üret/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/cards/personnel/92/issue', { card_type: 'laundry', regenerate: false }))
  })

  it('sorunlu okutma listesini KPI ve denetim ayrıntılarıyla gösterir', async () => {
    renderWithProviders(<CardsPage />)
    fireEvent.click(screen.getByRole('button', { name: /Sorunlu Okutmalar/ }))
    expect(await screen.findByText('%80')).toBeInTheDocument()
    expect(screen.getByText('Başka Sakin')).toBeInTheDocument()
    expect(screen.getByText('T-0044')).toBeInTheDocument()
    expect(screen.getByText('Vardiya Amir')).toBeInTheDocument()
  })
})
