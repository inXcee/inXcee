import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../../test/renderWithProviders.jsx'

vi.mock('../../../shared/api/client.js', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [] })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))

import LeaveTab from './LeaveTab.jsx'
import OvertimeTab from './OvertimeTab.jsx'
import DepartmentsTab from './DepartmentsTab.jsx'
import SwapTab from './SwapTab.jsx'
import SettingsTab from './SettingsTab.jsx'

describe('shifts tabs smoke', () => {
  beforeEach(() => vi.clearAllMocks())

  it('LeaveTab çökmeden render olur', () => {
    renderWithProviders(<LeaveTab departments={[]} onPersonClick={() => {}} />)
    expect(screen.getByText('IZIN TALEPLERI')).toBeInTheDocument()
  })

  it('OvertimeTab çökmeden render olur', () => {
    renderWithProviders(<OvertimeTab departments={[]} onPersonClick={() => {}} />)
    expect(screen.getByText('MESAI KAYITLARI')).toBeInTheDocument()
  })

  it('DepartmentsTab çökmeden render olur', () => {
    renderWithProviders(<DepartmentsTab />)
    expect(screen.getByText('BOLUMLER')).toBeInTheDocument()
  })

  it('SwapTab çökmeden render olur', () => {
    renderWithProviders(<SwapTab />)
    expect(screen.getByText('VARDIYA TAKAS TALEPLERI')).toBeInTheDocument()
  })

  it('SettingsTab çökmeden render olur', () => {
    renderWithProviders(<SettingsTab departments={[]} shiftDefs={[]} />)
    expect(screen.getAllByText('VARDIYA TANIMLARI').length).toBeGreaterThan(0)
  })
})
