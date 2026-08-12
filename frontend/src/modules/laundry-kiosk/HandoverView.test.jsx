import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'
import HandoverView from './HandoverView.jsx'

function api() {
  return {
    get: vi.fn(url => Promise.resolve({ data: url.includes('handover-workers')
      ? [{ id: 8, full_name: 'Devralan Personel', role_label: 'Çamaşırhane Personeli' }]
      : { handover: null, summary: { active_jobs: 4, pending_deliveries: 2, supplies: { critical: 0 }, machines: [{ id: 1, name: 'Makine 1', status: 'running' }] } } })),
    post: vi.fn((url) => Promise.resolve({ data: url.endsWith('/start')
      ? { id: 14, status: 'open', summary: { active_jobs: 4, pending_deliveries: 2, supplies: { critical: 0 }, machines: [] } }
      : { id: 14, status: 'completed', incoming_worker: 'Devralan Personel' } })),
  }
}

describe('HandoverView', () => {
  it('çıkan ve devralan PIN adımlarını sırayla gönderir', async () => {
    localStorage.clear()
    const kioskApi = api()
    const onComplete = vi.fn()
    renderWithProviders(<HandoverView kioskApi={kioskApi} workerName="Çıkan Personel" onComplete={onComplete} />)
    await waitFor(() => expect(screen.getByText('4')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Çıkan personel PIN’i'), { target: { value: '2468' } })
    fireEvent.click(screen.getByRole('button', { name: 'Teslimi başlat' }))
    await waitFor(() => expect(kioskApi.post).toHaveBeenCalledWith('/self-service/laundry-kiosk/handovers/start', { outgoing_pin: '2468', offline_queue_count: 0 }))

    await waitFor(() => expect(screen.getByLabelText('Devralan personel')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Devralan personel'), { target: { value: '8' } })
    fireEvent.change(screen.getByLabelText('Devralan PIN’i'), { target: { value: '1357' } })
    fireEvent.click(screen.getByRole('button', { name: 'İki onayla vardiyayı devret' }))
    await waitFor(() => expect(kioskApi.post).toHaveBeenCalledWith('/self-service/laundry-kiosk/handovers/14/finalize', expect.objectContaining({ incoming_worker_id: 8, incoming_pin: '1357', offline_queue_count: 0 })))
  })

  it('offline kuyruk varken teslim düğmesini kilitler', async () => {
    localStorage.setItem('kiosk-offline-bags', JSON.stringify([{ queued_at: new Date().toISOString(), payload: {} }]))
    renderWithProviders(<HandoverView kioskApi={api()} workerName="Çıkan Personel" />)
    await waitFor(() => expect(screen.getByText(/1 offline kayıt bekliyor/)).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Çıkan personel PIN’i'), { target: { value: '2468' } })
    expect(screen.getByRole('button', { name: 'Teslimi başlat' })).toBeDisabled()
    localStorage.clear()
  })
})
