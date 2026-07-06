import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'

vi.mock('../../shared/api/client.js', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [] })),
    post: vi.fn(() => Promise.resolve({})),
    patch: vi.fn(() => Promise.resolve({})),
  },
}))

import RoomDetailPanel from './RoomDetailPanel.jsx'

const room = { id: 5, room_no: '101', block: 'M1', floor: 1, capacity: 6, occupied: 0, status: 'active' }

describe('RoomDetailPanel smoke', () => {
  beforeEach(() => vi.clearAllMocks())

  it('seçili oda başlığını ve sekmeleri render eder', async () => {
    renderWithProviders(<RoomDetailPanel room={room} onClose={() => {}} />)
    expect(await screen.findByText('101', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('DÜZENLE')).toBeInTheDocument()
    expect(screen.getByText('ARIZA / NOT')).toBeInTheDocument()
  })
})
