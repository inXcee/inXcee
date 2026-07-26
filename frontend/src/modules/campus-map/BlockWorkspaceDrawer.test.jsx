import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import BlockWorkspaceDrawer from './BlockWorkspaceDrawer.jsx'

vi.mock('../../shared/api/client.js', () => ({ default: { get: vi.fn() } }))

const workspace = {
  generated_at: '2026-07-26T08:30:00.000Z',
  block: 'M2',
  permissions: { faults: true, cleaning: true, rooms: true },
  freshness: { status: 'fresh' },
  overview: {
    total_beds: 12, occupied: 8, occupancy_pct: 67, open_faults: 1,
    empty_rooms: 1, quarantine: 0, maintenance: 1,
  },
  faults: [{ id: 51, location: 'M2-101', description: 'Kapı kilidi', priority: 'high', status: 'open' }],
  cleaning: { total: 3, done: 2, pending: 1, skipped: 0, pct: 67 },
  rooms: [{
    id: 21, room_no: '101', floor: 1, status: 'active', active_beds: 4, occupied: 1,
    occupants: [{ personnel_id: 71, full_name: 'Ayşe Demir', company: 'Yapı AŞ' }],
  }],
}

function renderDrawer(overrides = {}, props = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  api.get.mockResolvedValue({ data: { ...workspace, ...overrides } })
  return render(
    <QueryClientProvider client={client}>
      <BlockWorkspaceDrawer
        block="M2"
        tab="overview"
        selectedRoomId={null}
        onTabChange={vi.fn()}
        onRoomChange={vi.fn()}
        onClose={vi.fn()}
        onNavigate={vi.fn()}
        onQuickFault={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  )
}

describe('BlockWorkspaceDrawer', () => {
  beforeEach(() => vi.clearAllMocks())

  it('blok KPI, sekme ve blok işlemlerini getirir; vardiya ve envanter göstermez', async () => {
    renderDrawer()
    expect(await screen.findByText('BLOK İŞLEMLERİ')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/campus-map/block/M2/workspace')
    expect(screen.getByRole('tab', { name: 'ODALAR' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'ARIZALAR' })).toBeInTheDocument()
    expect(screen.getByText('Bu bloğa check-in')).toBeInTheDocument()
    expect(screen.queryByText(/Vardiya/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Envanter/i)).not.toBeInTheDocument()
  })

  it('oda sekmesinde oda seçimini URL callbackine iletir', async () => {
    const user = userEvent.setup()
    const onRoomChange = vi.fn()
    renderDrawer({}, { tab: 'rooms', onRoomChange })
    await user.click(await screen.findByRole('button', { name: /101/ }))
    expect(onRoomChange).toHaveBeenCalledWith(21)
  })

  it('teknik rolde oda, kişi ve temizlik alanlarını tamamen gizler', async () => {
    renderDrawer({
      permissions: { faults: true, cleaning: false, rooms: false },
      rooms: undefined,
      cleaning: undefined,
    })
    expect(await screen.findByRole('tab', { name: 'ARIZALAR' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'ODALAR' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'KİŞİLER' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'TEMİZLİK' })).not.toBeInTheDocument()
    expect(screen.queryByText('Bu bloğa check-in')).not.toBeInTheDocument()
  })
})
