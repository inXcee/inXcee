import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../../test/renderWithProviders.jsx'

vi.mock('../../../shared/api/client.js', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: [] })), post: vi.fn() },
}))

import ResourcesTab from './ResourcesTab.jsx'
import PlanningTab from './PlanningTab.jsx'

describe('Transport V2 planning surfaces', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders empty vehicle and driver resource states', async () => {
    renderWithProviders(<ResourcesTab />)
    expect(await screen.findByText('ARAÇ YOK')).toBeInTheDocument()
    expect(await screen.findByText('ŞOFÖR YOK')).toBeInTheDocument()
  })

  it('renders plan controls and template section', async () => {
    renderWithProviders(<PlanningTab />)
    expect(await screen.findByText('🗓 SEFER ŞABLONLARI (0)')).toBeInTheDocument()
    expect(screen.getByText('⚡ PLAN ÖNER')).toBeDisabled()
  })
})
