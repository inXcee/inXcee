import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'
import DashboardView from './DashboardView.jsx'

vi.mock('../../shared/components/ConfirmDialog.jsx', () => ({
  confirmDialog: vi.fn(() => Promise.resolve(true)),
}))

const records = [
  {
    id: 20, bag_no: 'T-00020', block: 'M1', room_no: '205', status: 'delivered', item_count: 5,
    intake_name: 'Ali Demir', created_at: '2026-08-02 08:10:00', updated_at: '2026-08-02 12:30:00',
    wash_started_at: '2026-08-02 09:00:00', washed_at: '2026-08-02 10:00:00', washed_by: 'Ayşe Yılmaz',
    delivered_at: '2026-08-02 12:30:00', delivered_to: 'Ali Demir', delivered_by: 'Ayşe Yılmaz',
    has_intake_signature: 1, has_delivery_signature: 1, tracking_mode: 'legacy',
  },
  {
    id: 21, bag_no: 'T-00021', block: 'S1', room_no: '101', status: 'dirty', item_count: 3,
    intake_name: 'Veli Can', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    has_intake_signature: 1, tracking_mode: 'individual',
  },
  {
    id: 22, bag_no: 'T-00022', block: 'A1', room_no: '102', status: 'ready', item_count: 4,
    intake_name: 'Zeynep Kaya', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    garment_missing: 1, latest_garment_lost_name: 'Gömlek · G22-01', latest_garment_lost_note: 'Teslim kontrolünde eksik',
    burst_open_incidents: 1, burst_waiting_pieces: 2,
    tracking_mode: 'individual',
  },
]

function setup() {
  const kioskApi = {
    get: vi.fn(url => Promise.resolve({ data: url.includes('today-summary')
      ? { intake_today: 2, delivered_today: 1, active_total: 1, ready_waiting: 0 }
      : records })),
    post: vi.fn(() => Promise.resolve({ data: { ok: true } })),
  }
  const onAction = vi.fn()
  renderWithProviders(<DashboardView kioskApi={kioskApi} onAction={onAction} />)
  return { kioskApi, onAction }
}

describe('Tüm çamaşır kayıtları', () => {
  it('teslim edilen kayıtları teslim alan kişiyle ve ayrıntılı zaman çizelgesiyle gösterir', async () => {
    setup()
    await waitFor(() => expect(screen.getByText('T-00020')).toBeInTheDocument())
    expect(screen.getByText('Ali Demir', { selector: '.records-recipient strong' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /T-00020/ }))
    expect(screen.getByText('Yıkandı')).toBeInTheDocument()
    expect(screen.getByText('İşlemi yapan: Ayşe Yılmaz')).toBeInTheDocument()
    expect(screen.getAllByText('✓ Alındı')).toHaveLength(2)
  })

  it('arama yapar ve yıkama bekleyen kaydı makinesiz akışta yıkamaya alır', async () => {
    const { kioskApi } = setup()
    await waitFor(() => expect(screen.getByText('T-00021')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText(/Torba no/), { target: { value: 'S1 101' } })
    expect(screen.queryByText('T-00020')).not.toBeInTheDocument()
    expect(screen.getByText('T-00021')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Yıkamaya al' }))
    await waitFor(() => expect(kioskApi.post).toHaveBeenCalledWith(
      '/self-service/laundry-kiosk/bags/21/start-wash',
      {},
    ))
  })

  it('tekil kayıp kıyafeti ana listede rozetler ve kayıp filtresine dahil eder', async () => {
    setup()
    await waitFor(() => expect(screen.getByText('T-00022')).toBeInTheDocument())
    expect(screen.getByText('! 1 kayıp kıyafet')).toBeInTheDocument()
    expect(screen.getByText('≋ 2 fileden ayrılan')).toBeInTheDocument()
    expect(screen.getByText('1', { selector: '.records-summary .is-loss strong' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Kayıp 1', exact: true }))
    expect(screen.getByText('T-00022')).toBeInTheDocument()
    expect(screen.queryByText('T-00021')).not.toBeInTheDocument()
  })

  it('patlayan fileden ayrılan parçaları özel filtrede gösterir', async () => {
    setup()
    await waitFor(() => expect(screen.getByText('T-00022')).toBeInTheDocument())
    expect(screen.getByText('2', { selector: '.records-summary .is-burst strong' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'File ayırma 2', exact: true }))
    expect(screen.getByText('T-00022')).toBeInTheDocument()
    expect(screen.queryByText('T-00020')).not.toBeInTheDocument()
  })
})
