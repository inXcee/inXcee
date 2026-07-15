import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../../shared/api/client.js'
import WaterExpiryPanel from './WaterExpiryPanel.jsx'

vi.mock('../../../shared/api/client.js', () => ({
  default: { get: vi.fn(), put: vi.fn() },
}))

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <WaterExpiryPanel />
    </QueryClientProvider>,
  )
}

describe('WaterExpiryPanel', () => {
  beforeEach(() => {
    api.get.mockResolvedValue({
      data: {
        summary: { all: 1, critical: 1, expired: 1, expiring: 0, quarantined: 0, missing: 0, healthy: 0 },
        rows: [{
          id: 54,
          health: 'expired',
          lot_status: 'active',
          expiry_tracking: 1,
          brand_name: 'Mila Su',
          product_name: '0.5 L Su',
          lot_no: 'LOT-54',
          waybill_no: 'IRS-54',
          move_date: '2026-06-01',
          production_date: '2026-05-01',
          expiry_date: '2026-07-01',
          days_to_expiry: -14,
          remaining_human: '20 koli',
          lot_status_note: null,
        }],
      },
    })
    api.put.mockResolvedValue({ data: { ok: true, matched: 0 } })
  })

  afterEach(() => vi.clearAllMocks())

  it('kritik lotu gösterir ve gerekçeli karantina güncellemesi yapar', async () => {
    renderPanel()

    expect(await screen.findByText(/1 kritik lot/)).toBeInTheDocument()
    expect(screen.getByText('Kontrol gerekli')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Lotları göster/ }))
    expect(screen.getByText('LOT-54')).toBeInTheDocument()
    expect(screen.getByText('14 gün geçti')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /LOT-54 lotunu karantinaya al/ }))
    expect(screen.getByRole('dialog', { name: 'Lot Bilgisi ve Kullanım Durumu' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/Durum açıklaması/), { target: { value: 'Ambalaj hasarı kontrolü' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lotu Kaydet' }))

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/water/lots/54', expect.objectContaining({
      lot_no: 'LOT-54',
      expiry_date: '2026-07-01',
      lot_status: 'quarantined',
      lot_status_note: 'Ambalaj hasarı kontrolü',
    })))
  })
})
