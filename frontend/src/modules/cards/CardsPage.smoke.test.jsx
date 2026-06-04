import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'

const roster = [
  { id: 1, full_name: 'Ali Veli', department_name: 'Temizlik',
    access_id: 11, access_code: 'AVS-A:abcdef0123', access_nfc: null, access_photo: null,
    meal_id: null, meal_code: null, meal_nfc: null, meal_photo: null },
]

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
    get: vi.fn((url) => Promise.resolve({ data: url.includes('/cards/analytics') ? analyticsData : roster })),
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
})
