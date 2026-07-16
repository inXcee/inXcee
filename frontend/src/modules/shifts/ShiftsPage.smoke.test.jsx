import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'

vi.mock('../../shared/api/client.js', () => ({
  default: {
    get: vi.fn((url) => {
      if (url === '/shifts/departments') return Promise.resolve({ data: [{ id: 1, name: 'Operasyon' }] })
      if (url === '/shifts/definitions') return Promise.resolve({ data: [{ id: 1, code: 'G' }] })
      if (url === '/shifts/leave?status=pending') return Promise.resolve({ data: [{ id: 91 }] })
      return Promise.resolve({ data: [] })
    }),
  },
}))

vi.mock('./tabs/ScheduleTab.jsx', () => ({ default: () => <div>Çizelge sekmesi hazır</div> }))
vi.mock('./tabs/StaffTab.jsx', () => ({ default: () => <div>Personel sekmesi hazır</div> }))
vi.mock('./tabs/LeaveTab.jsx', () => ({ default: () => <div>İzinler sekmesi hazır</div> }))
vi.mock('./tabs/OvertimeTab.jsx', () => ({ default: () => <div>Mesai sekmesi hazır</div> }))
vi.mock('./tabs/PuantajTab.jsx', () => ({ default: () => <div>Puantaj sekmesi hazır</div> }))
vi.mock('./tabs/SwapTab.jsx', () => ({ default: () => <div>Takas sekmesi hazır</div> }))
vi.mock('./tabs/DepartmentsTab.jsx', () => ({ default: () => <div>Bölümler sekmesi hazır</div> }))
vi.mock('./tabs/SettingsTab.jsx', () => ({ default: () => <div>Ayarlar sekmesi hazır</div> }))

import ShiftsPage from './ShiftsPage.jsx'

describe('ShiftsPage lazy tab navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState({}, '', '/shifts')
  })

  it('varsayılan çizelgeyi yükler ve puantaj sekmesine kesintisiz geçer', async () => {
    renderWithProviders(<ShiftsPage />, { route: '/shifts' })

    expect(await screen.findByText('Çizelge sekmesi hazır')).toBeInTheDocument()
    expect(screen.queryByText('Puantaj sekmesi hazır')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTitle('Puantaj'))

    expect(await screen.findByText('Puantaj sekmesi hazır')).toBeInTheDocument()
    expect(screen.queryByText('Çizelge sekmesi hazır')).not.toBeInTheDocument()
  })
})
