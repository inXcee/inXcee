import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'
import KioskHome from './KioskHome.jsx'

const overview = {
  summary: {
    intake_today: 7,
    delivered_today: 4,
    dirty: 2,
    washing: 1,
    ironing: 1,
    ready: 1,
    urgent: 1,
    sla_breaches: 2,
    lost_open: 2,
    lost_bags: 1,
    lost_garments: 1,
    burst_open: 1,
    burst_waiting_pieces: 3,
    burst_returned_today: 1,
  },
  next_jobs: [
    { id: 11, bag_no: 'T-0011', block: 'M1', room_no: '205', status: 'ironing', item_count: 5, urgent: 1, shelf_location: 'B-2' },
    { id: 12, bag_no: 'T-0012', block: 'A1', room_no: '101', status: 'dirty', item_count: 3, urgent: 0 },
    { id: 13, bag_no: 'T-0013', block: 'F', room_no: '303', status: 'ready', item_count: 2, urgent: 0 },
  ],
  recent_losses: [
    { kind: 'bag', incident_id: 91, item_id: 41, bag_no: 'T-0041', block: 'F2A', room_no: '80', item_count: 4, reported_by: 'Ayşe Yılmaz', reported_at: '2026-08-02 09:30:00', note: 'Teslim rafında bulunamadı' },
    { kind: 'garment', incident_id: 92, item_id: 42, garment_id: 8, bag_no: 'T-0042', block: 'A1', room_no: '101', garment_type: 'Gömlek', garment_code: 'G42-01', reported_by: 'Veli Can', reported_at: '2026-08-02 10:15:00', note: 'Torba kontrolünde eksik' },
  ],
  recent_bursts: [
    { id: 7, source_block: 'F2B', source_room_no: '79', source_file_no: '3', source_person_name: 'Ali Demir', found_location: 'Ayırma Masası 2', status: 'ready_for_selection', piece_waiting: 3, piece_returned: 1 },
  ],
}

function setup() {
  const kioskApi = { get: vi.fn(() => Promise.resolve({ data: overview })) }
  const onNavigate = vi.fn()
  renderWithProviders(<KioskHome kioskApi={kioskApi} onNavigate={onNavigate} workerName="Ayşe Yılmaz" />)
  return { kioskApi, onNavigate }
}

describe('KioskHome operasyon paneli', () => {
  it('günlük özet, canlı akış ve öncelikli işi birlikte gösterir', async () => {
    setup()

    await waitFor(() => expect(screen.getAllByText('T-0011')).toHaveLength(2))
    expect(screen.getByRole('heading', { name: /Ayşe/ })).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText(/2 geciken kayıt/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /2 açık kayıp araştırması/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /F2A-80 · T-0041/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Gömlek · G42-01/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /1 patlayan file ayırma alanında/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /FILE-007/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Yıkama bekliyor/ })).toBeInTheDocument()
  })

  it('hızlı işlem ve sıradaki görev doğru çalışma ekranına yönlendirir', async () => {
    const { onNavigate } = setup()
    await waitFor(() => expect(screen.getAllByText('T-0011')).toHaveLength(2))

    fireEvent.click(screen.getByRole('button', { name: /Torba Girişi/ }))
    expect(onNavigate).toHaveBeenCalledWith('entry')

    fireEvent.click(screen.getByRole('button', { name: 'Ütüyü tamamla →', exact: true }))
    expect(onNavigate).toHaveBeenCalledWith('ironing', overview.next_jobs[0])

    fireEvent.click(screen.getByRole('button', { name: /2 açık kayıp araştırması/ }))
    expect(onNavigate).toHaveBeenCalledWith('loss')

    fireEvent.click(screen.getByRole('button', { name: /1 patlayan file ayırma alanında/ }))
    expect(onNavigate).toHaveBeenCalledWith('sorting')
  })

  it('görev filtreleri yalnız ilgili iş sırasını gösterir', async () => {
    setup()
    await waitFor(() => expect(screen.getAllByText('T-0011')).toHaveLength(2))

    fireEvent.click(screen.getByRole('button', { name: 'Teslim', exact: true }))
    expect(screen.getByText('T-0013')).toBeInTheDocument()
    expect(screen.queryByText('T-0012')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Acil 1', exact: true }))
    expect(screen.getAllByText('T-0011')).toHaveLength(2)
    expect(screen.queryByText('T-0013')).not.toBeInTheDocument()
  })
})
