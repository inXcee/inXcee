import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'

vi.mock('../../shared/api/client.js', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: { room: { id: 1, occupied: 2, capacity: 6, notes: '' }, personnel: [], faults: [] } })),
    post: vi.fn(() => Promise.resolve({})),
    patch: vi.fn(() => Promise.resolve({})),
  },
}))

import RoomDetailPanel from './RoomDetailPanel.jsx'

describe('housekeeping/RoomDetailPanel smoke', () => {
  beforeEach(() => vi.clearAllMocks())

  it('oda başlığı + kontrol listesi + arıza bildir bölümü render eder', async () => {
    renderWithProviders(
      <RoomDetailPanel block="S1" floor={1} roomNo="101" task={null} isPrivateBath={true}
        onComplete={() => {}} onUncomplete={() => {}} onSkip={() => {}} onClose={() => {}} onInvalidateRooms={() => {}} />
    )
    expect(await screen.findByText(/TEMİZLİK KONTROL/)).toBeInTheDocument()
    expect(screen.getByText('ARIZA BİLDİR')).toBeInTheDocument()
    expect(await screen.findByText('ODADAKI KİŞİLER')).toBeInTheDocument()
  })
})
