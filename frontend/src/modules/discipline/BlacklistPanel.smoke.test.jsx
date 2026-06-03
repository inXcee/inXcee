import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'

vi.mock('../../shared/api/client.js', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [
      { id: 1, full_name: 'Mehmet Kara', company: 'XYZ', job_title: 'İşçi', tc_no: '111', blacklist_reason: 'Kavga', blacklisted_at: '2026-01-10', blacklisted_by_name: 'Müdür', discipline_points: 5 },
    ] })),
    post: vi.fn(() => Promise.resolve({})),
  },
}))

import BlacklistPanel from './BlacklistPanel.jsx'

describe('discipline/BlacklistPanel smoke', () => {
  beforeEach(() => vi.clearAllMocks())

  it('kara listedeki personeli listeler', async () => {
    renderWithProviders(<BlacklistPanel />)
    expect(await screen.findByText('Mehmet Kara')).toBeInTheDocument()
    expect(screen.getByText('Sebep: Kavga')).toBeInTheDocument()
    expect(screen.getByText('ÇIKAR')).toBeInTheDocument()
  })
})
