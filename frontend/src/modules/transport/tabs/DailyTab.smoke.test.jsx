import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../../test/renderWithProviders.jsx'

vi.mock('../../../shared/api/client.js', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({
      data: {
        on_shift_count: 50, assigned_count: 40, uncovered_count: 10,
        alerts: [], routes: [], uncovered: [],
      },
    })),
    post: vi.fn(() => Promise.resolve({ data: { assigned: 0 } })),
  },
}))

import DailyTab from './DailyTab.jsx'

describe('DailyTab smoke', () => {
  beforeEach(() => vi.clearAllMocks())

  it('günlük veri yüklenince KPI kapsama gösterir', async () => {
    renderWithProviders(<DailyTab date="2026-06-03" />)
    expect(await screen.findByText('VARDİYADA')).toBeInTheDocument()
    expect(screen.getByText('SERVİSE ATANMIŞ')).toBeInTheDocument()
    expect(screen.getByText('%80 kapsama')).toBeInTheDocument()
  })
})
