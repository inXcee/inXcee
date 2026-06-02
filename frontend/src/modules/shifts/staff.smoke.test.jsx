import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'

vi.mock('../../shared/api/client.js', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [] })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))

import StaffTab from './tabs/StaffTab.jsx'
import StaffDetailPanel from './StaffDetailPanel.jsx'

describe('shifts staff smoke', () => {
  beforeEach(() => vi.clearAllMocks())

  it('StaffTab çökmeden render olur', () => {
    renderWithProviders(<StaffTab departments={[]} onPersonClick={() => {}} />)
    expect(screen.getByText('TOPLAM PERSONEL')).toBeInTheDocument()
  })

  it('StaffDetailPanel çökmeden render olur (veri yok)', async () => {
    renderWithProviders(<StaffDetailPanel staffId={1} onClose={() => {}} />)
    expect(await screen.findByText('Veri bulunamadı')).toBeInTheDocument()
  })
})
