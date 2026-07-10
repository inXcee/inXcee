import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../../test/renderWithProviders.jsx'
import { useAuthStore } from '../../../shared/store/authStore.js'

vi.mock('../../../shared/api/client.js', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [] })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))

import ScheduleTab from './ScheduleTab.jsx'

describe('ScheduleTab smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({ user: { role: 'campus_manager' } })
  })

  it('çökmeden render olur ve görünüm geçişini gösterir', () => {
    renderWithProviders(<ScheduleTab departments={[]} shiftDefs={[]} onPersonClick={() => {}} />)
    expect(screen.getByText('HAFTALIK')).toBeInTheDocument()
    expect(screen.getByText('Seçim')).toBeInTheDocument()
    expect(screen.getByText('CANLI KONTROL')).toBeInTheDocument()
    expect(screen.getByText('GÜNLÜK')).toBeInTheDocument()
  })
})
