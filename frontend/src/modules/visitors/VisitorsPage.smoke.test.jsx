import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'

vi.mock('../../shared/api/client.js', () => ({
  default: {
    get: vi.fn((url) => {
      if (url.includes('/visitors/stats')) return Promise.resolve({ data: { active: 1, upcoming: 2, today: 1, total: 5 } })
      if (url.includes('status=upcoming')) return Promise.resolve({ data: [
        { id: 10, full_name: 'Beklenen Ziyaretçi', status: 'pre_registered', qr_token: 'abc123def456', visiting_block: 'M1', purpose: 'toplantı', expected_at: '2026-06-10 14:00' },
      ] })
      return Promise.resolve({ data: [] })
    }),
    post: vi.fn(() => Promise.resolve({ data: { id: 1, qr_token: 'x'.repeat(20) } })),
  },
}))

import VisitorsPage from './VisitorsPage.jsx'

describe('visitors/VisitorsPage smoke', () => {
  beforeEach(() => vi.clearAllMocks())

  it('ön-kayıt formunu açar ve beklenen-zaman alanını gösterir', async () => {
    renderWithProviders(<VisitorsPage />)
    fireEvent.click(screen.getByText('+ ÖN-KAYIT'))
    expect(await screen.findByText('ZİYARETÇİ ÖN-KAYDI')).toBeInTheDocument()
    expect(screen.getByText('BEKLENEN ZİYARET ZAMANI')).toBeInTheDocument()
  })

  it('beklenen sekmesinde QR Kart ve Giriş Yap aksiyonlarını listeler', async () => {
    renderWithProviders(<VisitorsPage />)
    fireEvent.click(screen.getByText(/Beklenen \(/))
    expect(await screen.findByText('Beklenen Ziyaretçi')).toBeInTheDocument()
    expect(screen.getByText('QR Kart')).toBeInTheDocument()
    expect(screen.getByText('Giriş Yap')).toBeInTheDocument()
  })
})
