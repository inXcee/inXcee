import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import BlockWorkspaceDrawer from './BlockWorkspaceDrawer.jsx'

vi.mock('../../shared/api/client.js', () => ({ default: { get: vi.fn() } }))

const workspace = {
  generated_at: '2026-07-26T08:30:00.000Z',
  date: '2026-07-26',
  block: 'M2',
  permissions: { faults: true, cleaning: true, rooms: true },
  freshness: { status: 'fresh' },
  overview: {
    total_beds: 12, occupied: 8, occupancy_pct: 67, open_faults: 1,
    empty_rooms: 1, quarantine: 0, maintenance: 1,
  },
  faults: [{ id: 51, location: 'M2-101', description: 'Kapı kilidi', priority: 'high', status: 'open' }],
  cleaning: {
    total: 3, done: 2, pending: 1, skipped: 0, pct: 67,
    room_tasks: 2, common_area_tasks: 1, photo_evidence_count: 1, qr_verified_count: 1,
    night_shift_room_count: 1, floors: [{ floor: 1, total: 3, done: 2, pending: 1, skipped: 0, pct: 67 }],
    tasks: [{
      id: 81, area: 'M2 Oda 101', room_no: '101', floor: 1, task_type: 'room', status: 'pending',
      companies: ['Yapı AŞ'], shift_profile: { day: 0, night: 1, unknown: 0, total: 1 },
      photo_count: 0, verified_by_qr: 0,
    }],
  },
  shifts: {
    total: 1, day: 0, night: 1, unknown: 0, coverage_pct: 100,
    residents: [{
      personnel_id: 71, full_name: 'Ayşe Demir', company: 'Yapı AŞ', room_no: '101',
      bed_no: 1, shift_type: 'night', start_hour: 20, end_hour: 8,
    }],
  },
  companies: {
    total_companies: 1, unassigned_company_count: 0,
    companies: [{
      company: 'Yapı AŞ', people_count: 1, room_count: 1, share_pct: 100,
      day_count: 0, night_count: 1, unknown_count: 0, dominant_shift: 'night',
      rooms: [{ room_id: 21, room_no: '101', floor: 1 }],
      cleaning: { total: 1, done: 0, pending: 1, skipped: 0, pct: 0 },
    }],
  },
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
        onReport={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  )
}

describe('BlockWorkspaceDrawer', () => {
  beforeEach(() => vi.clearAllMocks())

  it('blok KPI, şirket ve vardiya takip sekmelerini getirir; envanter göstermez', async () => {
    renderDrawer()
    expect(await screen.findByText('BLOK İŞLEMLERİ')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/campus-map/block/M2/workspace')
    expect(screen.getByRole('tab', { name: 'ODALAR' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'ŞİRKETLER' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'VARDİYALAR' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'ARIZALAR' })).toBeInTheDocument()
    expect(screen.getByText('Bu bloğa check-in')).toBeInTheDocument()
    expect(screen.getByText('Gündüz / gece takibini aç')).toBeInTheDocument()
    expect(screen.queryByText(/Envanter/i)).not.toBeInTheDocument()
  })

  it('şirket sekmesinde kişi, oda, vardiya ve temizlik ilişkisini gösterir', async () => {
    renderDrawer({}, { tab: 'companies' })
    expect(await screen.findByText('Yapı AŞ')).toBeInTheDocument()
    expect(screen.getByText(/1 kişi · 1 oda/)).toBeInTheDocument()
    expect(screen.getAllByText('Gece')).not.toHaveLength(0)
    expect(screen.getByText(/İlişkili oda temizliği/)).toBeInTheDocument()
  })

  it('temizlik tarihini değiştirince çalışma alanını seçili günle yeniden getirir', async () => {
    renderDrawer({}, { tab: 'cleaning' })
    const date = await screen.findByLabelText('Takip tarihi')
    fireEvent.change(date, { target: { value: '2026-07-25' } })
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/campus-map/block/M2/workspace?date=2026-07-25'))
    expect(await screen.findByText('M2 Oda 101')).toBeInTheDocument()
    expect(screen.getByText('☾ 1 gece')).toBeInTheDocument()
  })

  it('oda sekmesinde oda seçimini URL callbackine iletir', async () => {
    const user = userEvent.setup()
    const onRoomChange = vi.fn()
    renderDrawer({}, { tab: 'rooms', onRoomChange })
    await user.click(await screen.findByRole('button', { name: /101/ }))
    expect(onRoomChange).toHaveBeenCalledWith(21)
  })

  it('blok raporu işlemini seçili blok bağlamında açar', async () => {
    const user = userEvent.setup()
    const onReport = vi.fn()
    renderDrawer({}, { onReport })
    await user.click(await screen.findByText('Blok raporu oluştur'))
    expect(onReport).toHaveBeenCalledTimes(1)
  })

  it('veri yüklenirken geçerli derin bağlantı sekmesini overview ile ezmez', async () => {
    const onTabChange = vi.fn()
    renderDrawer({}, { tab: 'rooms', onTabChange })
    expect(await screen.findByLabelText('Oda veya kişi filtrele')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'ODALAR' })).toHaveAttribute('aria-selected', 'true')
    expect(onTabChange).not.toHaveBeenCalled()
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
    expect(screen.queryByRole('tab', { name: 'ŞİRKETLER' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'VARDİYALAR' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'TEMİZLİK' })).not.toBeInTheDocument()
    expect(screen.queryByText('Bu bloğa check-in')).not.toBeInTheDocument()
  })
})
