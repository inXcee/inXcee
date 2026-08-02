import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'
import LossCenterView from './LossCenterView.jsx'

vi.mock('../../shared/components/ConfirmDialog.jsx', () => ({
  confirmDialog: vi.fn(() => Promise.resolve(true)),
}))

const response = {
  summary: { open_total: 2, lost_bags: 1, lost_garments: 1, resolved_total: 1, oldest_open_at: '2026-08-01 08:00:00' },
  incidents: [
    { kind: 'bag', incident_id: 1, item_id: 10, status: 'open', bag_no: 'T-0010', block: 'F2A', room_no: '80', item_count: 5, intake_name: 'Ali Demir', intake_at: '2026-08-01 07:00:00', reported_at: '2026-08-01 08:00:00', reported_by: 'Ayşe Yılmaz', last_stage: 'ready', note: 'Teslim rafında bulunamadı' },
    { kind: 'garment', incident_id: 2, item_id: 11, garment_id: 21, status: 'open', bag_no: 'T-0011', block: 'A1', room_no: '101', intake_name: 'Veli Can', garment_type: 'Gömlek', garment_code: 'G11-01', intake_at: '2026-08-02 08:00:00', reported_at: '2026-08-02 10:00:00', reported_by: 'Mehmet Kaya', last_stage: 'delivery', note: 'Torba içinden çıkmadı' },
    { kind: 'bag', incident_id: 3, item_id: 12, status: 'resolved', bag_no: 'T-0012', block: 'M1', room_no: '205', intake_at: '2026-07-31 08:00:00', reported_at: '2026-07-31 09:00:00', reported_by: 'Ayşe Yılmaz', resolved_at: '2026-07-31 12:00:00', resolved_by: 'Mehmet Kaya', last_stage: 'washing', note: 'Makine yanında bulundu' },
  ],
}

function setup() {
  const kioskApi = {
    get: vi.fn(() => Promise.resolve({ data: response })),
    post: vi.fn(() => Promise.resolve({ data: { ok: true } })),
  }
  renderWithProviders(<LossCenterView kioskApi={kioskApi} />)
  return kioskApi
}

describe('Kayıp Merkezi', () => {
  it('açık torba ve kıyafet kayıplarını ayrıntılı gösterir', async () => {
    setup()
    await waitFor(() => expect(screen.getByText('T-0010')).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Kayıp Merkezi' })).toBeInTheDocument()
    expect(screen.getByText('Teslim rafında bulunamadı')).toBeInTheDocument()
    expect(screen.getByText('Gömlek')).toBeInTheDocument()
    expect(screen.getByText('G11-01')).toBeInTheDocument()
    expect(screen.getByText('Ayşe Yılmaz')).toBeInTheDocument()
  })

  it('torba ve kıyafeti ayrı endpointlerle bulundu olarak kapatır', async () => {
    const kioskApi = setup()
    await waitFor(() => expect(screen.getByText('T-0010')).toBeInTheDocument())
    const foundButtons = screen.getAllByRole('button', { name: /Bulundu Olayı kapat/ })

    fireEvent.click(foundButtons[0])
    await waitFor(() => expect(kioskApi.post).toHaveBeenCalledWith(
      '/self-service/laundry-kiosk/bags/10/found', {},
    ))

    fireEvent.click(foundButtons[1])
    await waitFor(() => expect(kioskApi.post).toHaveBeenCalledWith(
      '/self-service/laundry-kiosk/bags/11/garments/21/found', {},
    ))
  })

  it('bulunan geçmişini ve aramayı filtreler', async () => {
    setup()
    await waitFor(() => expect(screen.getByText('T-0010')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Bulundu', exact: true }))
    expect(screen.getByText('T-0012')).toBeInTheDocument()
    expect(screen.queryByText('T-0010')).not.toBeInTheDocument()
    expect(screen.getByText(/Mehmet Kaya tarafından bulundu/)).toBeInTheDocument()
  })
})
