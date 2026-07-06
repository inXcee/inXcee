import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../../test/renderWithProviders.jsx'

vi.mock('../../../shared/api/client.js', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({
      data: {
        totals: { total_staff: 100, staff_with_pickup: 80, staff_no_pickup: 20, active_points: 5, active_routes: 3 },
        by_pickup: [], dept_pickup: [], shift_pickup: [], route_utilization: [],
        by_district: [], no_pickup_staff: [], daily_trend: [], no_show_top: [], per_staff_usage: [],
      },
    })),
  },
}))

import ReportsTab from './ReportsTab.jsx'

describe('ReportsTab smoke', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rapor yüklenince KPI kapsama gösterir', async () => {
    renderWithProviders(<ReportsTab />)
    expect(await screen.findByText('TOPLAM PERSONEL')).toBeInTheDocument()
    expect(screen.getByText('%80 kapsama')).toBeInTheDocument()
  })
})
