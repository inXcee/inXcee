import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'

vi.mock('../../shared/api/client.js', () => ({
  default: { patch: vi.fn(() => Promise.resolve({})) },
}))

import KanbanView from './KanbanView.jsx'

describe('KanbanView smoke', () => {
  beforeEach(() => vi.clearAllMocks())

  it('durum kolonlarını ve kartı render eder', () => {
    const requests = [{ id: 1, location: 'M1 Oda 101', description: 'arıza', priority: 'high', status: 'open' }]
    renderWithProviders(<KanbanView requests={requests} onSelect={() => {}} />)
    expect(screen.getByText('AÇIK')).toBeInTheDocument()
    expect(screen.getByText('TAMAMLANDI')).toBeInTheDocument()
    expect(screen.getByText('M1 Oda 101')).toBeInTheDocument()
  })
})
