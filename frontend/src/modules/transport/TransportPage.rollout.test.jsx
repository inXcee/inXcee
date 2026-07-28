import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import api from '../../shared/api/client.js'
import { useAuthStore } from '../../shared/store/authStore.js'
import TransportPage from './TransportPage.jsx'

vi.mock('../../shared/api/client.js', () => ({
  default: { get: vi.fn(), patch: vi.fn() },
}))
vi.mock('./SetupWizard.jsx', () => ({ default: () => null }))
vi.mock('./tabs/OperationsTab.jsx', () => ({ default: () => <div>V2 operasyon içeriği</div> }))
vi.mock('./tabs/PlanningTab.jsx', () => ({ default: () => null }))
vi.mock('./tabs/LinesTab.jsx', () => ({ default: () => null }))
vi.mock('./tabs/ResourcesTab.jsx', () => ({ default: () => null }))
vi.mock('./tabs/PeopleTab.jsx', () => ({ default: () => null }))
vi.mock('./tabs/AnalyticsTab.jsx', () => ({ default: () => null }))
vi.mock('./tabs/DailyTab.jsx', () => ({ default: () => <div>Legacy günlük içerik</div> }))
vi.mock('./tabs/RoutesTab.jsx', () => ({ default: () => null }))
vi.mock('./tabs/PointsTab.jsx', () => ({ default: () => null }))
vi.mock('./tabs/MapTab.jsx', () => ({ default: () => null }))
vi.mock('./tabs/ReportsTab.jsx', () => ({ default: () => null }))

const disabledStatus = {
  enabled: false,
  ready: true,
  blockers: [],
  readiness: {
    routes: 2,
    stops: 4,
    vehicles: 2,
    drivers: 2,
    staff_without_stop: 3,
  },
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <MemoryRouter initialEntries={['/transport']}>
      <QueryClientProvider client={queryClient}>
        <TransportPage />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  window.history.replaceState({}, '', '/transport')
  api.get.mockResolvedValue({ data: disabledStatus })
  api.patch.mockResolvedValue({ data: { ...disabledStatus, enabled: true } })
})

afterEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ user: null, token: null })
})

describe('Transport V2 rollout gate', () => {
  it('shows parity status and lets a manager activate V2', async () => {
    useAuthStore.setState({ user: { id: 1, role: 'campus_manager' } })
    renderPage()

    expect(await screen.findByText('V2 veri katmanı hazır')).toBeInTheDocument()
    expect(screen.getByText(/2 hat · 4 durak · 2 araç/)).toBeInTheDocument()
    expect(screen.getByText('Legacy günlük içerik')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'V2 PANELİNİ ETKİNLEŞTİR' }))

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/transport/v2/status', {
      enabled: true,
      reason: 'Yönetici tarafından V2 arayüz geçişi onaylandı',
    }))
    expect(await screen.findByText('V2 operasyon içeriği')).toBeInTheDocument()
  })

  it('keeps activation manager-only for supervisors', async () => {
    useAuthStore.setState({ user: { id: 2, role: 'shift_supervisor' } })
    renderPage()

    expect(await screen.findByText('V2 geçişini kampüs müdürü etkinleştirebilir.'))
      .toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'V2 PANELİNİ ETKİNLEŞTİR' }))
      .not.toBeInTheDocument()
  })
})
