import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'
import { useAuthStore } from '../../shared/store/authStore.js'

vi.mock('../../shared/api/client.js', () => ({
  default: {
    get: vi.fn(url => {
      if (url.includes('/staff')) return Promise.resolve({ data: [{ id: 41, tc_no: '11111111111', full_name: 'Deniz Kaya', pickup_point_id: null }] })
      return Promise.resolve({ data: [] })
    }),
  },
}))

vi.mock('./tabs/RoutesTab.jsx', () => ({ default: () => <div>Rota çalışma alanı</div> }))
vi.mock('./tabs/PointsTab.jsx', () => ({ default: () => <div>Durak çalışma alanı</div> }))
vi.mock('./tabs/MapTab.jsx', () => ({ default: () => <div>Harita çalışma alanı</div> }))

import SetupWizard from './SetupWizard.jsx'
import LinesTab from './tabs/LinesTab.jsx'

describe('Transport V2 navigation and onboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({ user: { id: 1, role: 'campus_manager' } })
  })

  afterEach(() => useAuthStore.setState({ user: null }))

  it('shows the first incomplete setup action and navigates to stops', async () => {
    const onNavigate = vi.fn()
    renderWithProviders(<SetupWizard onNavigate={onNavigate} onClose={vi.fn()} />)

    expect(await screen.findByText('Servis operasyonunu kullanıma hazırlayın')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'DURAKLARA GİT' }))
    expect(onNavigate).toHaveBeenCalledWith('lines', 'points')
  })

  it('keeps route, stop and map views in one workspace', () => {
    const onViewChange = vi.fn()
    const { rerender } = renderWithProviders(<LinesTab view="routes" onViewChange={onViewChange} />)
    expect(screen.getByText('Rota çalışma alanı')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: /DURAKLAR/ }))
    expect(onViewChange).toHaveBeenCalledWith('points')

    rerender(<LinesTab view="map" onViewChange={onViewChange} />)
    expect(screen.getByText('Harita çalışma alanı')).toBeInTheDocument()
  })
})
