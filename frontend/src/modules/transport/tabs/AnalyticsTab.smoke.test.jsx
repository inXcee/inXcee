import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithProviders } from '../../../test/renderWithProviders.jsx'

const analytics = {
  range: { start: '2026-07-01', end: '2026-07-28' },
  kpis: {
    trips: 12,
    occupancy_pct: 78,
    boarding_pct: 92,
    no_show_pct: 8,
    on_time_pct: 87,
    cancellation_pct: 3,
    coverage_pct: 96,
  },
  filters: {
    routes: [{ id: 1, label: 'Sahil Hattı' }],
    vehicles: [{ id: 2, label: '67 TEST 1' }],
    drivers: [{ id: 3, label: 'Test Şoförü' }],
    shifts: [{ id: 4, label: 'Gündüz' }],
  },
  daily: [{ date: '2026-07-28', trips: 3, capacity: 48, cancelled: 0 }],
  by_route: [{ id: 1, label: 'Sahil Hattı', trips: 12, boarded: 80, no_show: 7, occupancy_pct: 78 }],
  by_vehicle: [{ id: 2, label: '67 TEST 1', trips: 12, boarded: 80, no_show: 7, occupancy_pct: 78 }],
  by_driver: [{ id: 3, label: 'Test Şoförü', trips: 12, boarded: 80, no_show: 7, occupancy_pct: 78 }],
  by_shift: [{ id: 4, label: 'Gündüz', trips: 12, boarded: 80, no_show: 7, occupancy_pct: 78 }],
  people: [{ id: 5, label: 'Ali Kaya', department: 'Teknik', assignments: 8, boarded: 7, no_show: 1, last_trip: '2026-07-28' }],
  trips: [{
    id: 10,
    work_date: '2026-07-28',
    scheduled_departure: '2026-07-28T07:00',
    route_name: 'Sahil Hattı',
    direction: 'outbound',
    vehicle: '67 TEST 1',
    driver: 'Test Şoförü',
    status: 'completed',
    boarded: 8,
    capacity: 12,
  }],
}

vi.mock('../../../shared/api/client.js', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: analytics })),
  },
}))

import api from '../../../shared/api/client.js'
import AnalyticsTab from './AnalyticsTab.jsx'

describe('Transport AnalyticsTab', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders V2 KPIs, filters and resource drilldowns', async () => {
    renderWithProviders(<AnalyticsTab />)
    expect(await screen.findByText('DOLULUK')).toBeInTheDocument()
    expect(screen.getAllByText('%78').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Sahil Hattı').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'PERSONEL' }))
    expect(screen.getByText('Ali Kaya')).toBeInTheDocument()
    expect(screen.getByText('Teknik')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Yön'), { target: { value: 'outbound' } })
    expect(api.get).toHaveBeenCalled()
  })
})
