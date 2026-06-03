import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'

vi.mock('../../shared/api/client.js', () => ({
  default: {
    get: vi.fn((url) => {
      if (url.includes('/stats')) return Promise.resolve({ data: {
        total: 120, checked_in: 90, day_shift: 60, night_shift: 30,
        total_beds: 200, total_occupied: 90, full_rooms: 5, blockDist: [],
      } })
      return Promise.resolve({ data: [] })
    }),
    post: vi.fn(() => Promise.resolve({})),
  },
}))

import StatsDashboard from './StatsDashboard.jsx'

describe('StatsDashboard smoke', () => {
  beforeEach(() => vi.clearAllMocks())

  it('KPI + yatak doluluk render eder', async () => {
    renderWithProviders(<StatsDashboard />)
    expect(await screen.findByText('TOPLAM PERSONEL')).toBeInTheDocument()
    expect(screen.getByText('YATAK DOLULUK')).toBeInTheDocument()
    expect(screen.getByText('%45')).toBeInTheDocument() // 90/200
  })
})
