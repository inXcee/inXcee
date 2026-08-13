import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../../../test/renderWithProviders.jsx'

vi.mock('../api.js', () => ({
  laundryApi: {
    getCardSettings: vi.fn(() => Promise.resolve({ intake_required: false, delivery_required: false })),
    getRoomLaundryDetail: vi.fn(() => Promise.resolve({
      summary: { total_count: 3, last_intake_at: new Date().toISOString() },
      items: [{ id: 1, status: 'washing', bag_no: 'B-1', item_count: 2, created_at: new Date().toISOString() }],
      premium_items: [],
      occupants: [],
      trend: [], by_person: [], heatmap: [], hour_day: [],
      block_avg: null, damages: [], sla_violations: [], last_bag: null,
    })),
    advanceItem: vi.fn(() => Promise.resolve({})),
    lostItem: vi.fn(() => Promise.resolve({})),
    deliverItem: vi.fn(() => Promise.resolve({})),
    batchDeliver: vi.fn(() => Promise.resolve({})),
    batchLost: vi.fn(() => Promise.resolve({})),
    getRoomOccupant: vi.fn(() => Promise.resolve({})),
    createItem: vi.fn(() => Promise.resolve({ id: 1 })),
    addPremiumGarments: vi.fn(() => Promise.resolve({})),
  },
}))

import RoomDetailPanel from './roomDetailPanel.jsx'

describe('RoomDetailPanel smoke', () => {
  beforeEach(() => vi.clearAllMocks())

  it('oda detayı yüklenince başlık + kapat butonu render olur', async () => {
    renderWithProviders(<RoomDetailPanel block="M1" room_no="101" onClose={() => {}} />)
    expect(await screen.findByText(/M1/)).toBeInTheDocument()
  })

  it('kapat callback çalışır', async () => {
    const onClose = vi.fn()
    renderWithProviders(<RoomDetailPanel block="M1" room_no="101" onClose={onClose} />)
    await screen.findByText(/M1/)
    const closeBtn = document.querySelector('.room-detail-overlay')
    if (closeBtn) fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalled()
  })
})
