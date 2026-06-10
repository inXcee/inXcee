import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'
import MachineView from './MachineView.jsx'

function makeKioskApi() {
  return {
    get: vi.fn((url) => {
      if (url.includes('/machines')) return Promise.resolve({ data: [{ id: 1, name: 'Makine 1', type: 'washer', status: 'idle', active_items: 0, timer_end: null }] })
      if (url.includes('status=dirty')) return Promise.resolve({ data: [{ id: 10, bag_no: 'BAG-10', block: 'M1', room_no: '101', item_count: 3, urgent: 1, is_premium: 0 }] })
      if (url.includes('status=washing')) return Promise.resolve({ data: [{ id: 11, bag_no: 'BAG-11', block: 'S1', room_no: '202', item_count: 2, needs_ironing: 1, machine_name: 'Makine 1', machine_timer_end: null }] })
      return Promise.resolve({ data: [] })
    }),
    put: vi.fn(() => Promise.resolve({ data: { ok: true } })),
    post: vi.fn(() => Promise.resolve({ data: { ok: true, next_status: 'ironing' } })),
  }
}

describe('MachineView smoke', () => {
  it('kirli + makinede listeleri render olur', async () => {
    renderWithProviders(<MachineView kioskApi={makeKioskApi()} />)
    await waitFor(() => expect(screen.getByText(/BAG-10/)).toBeInTheDocument())
    expect(screen.getByText(/⚡ ACİL/)).toBeInTheDocument()
    expect(screen.getByText(/BAG-11/)).toBeInTheDocument()
    expect(screen.getByText('✓ Yıkama Bitti')).toBeInTheDocument()
  })

  it('torba seçince süre + makine seçimi açılır, assign timer_minutes gönderir', async () => {
    const api = makeKioskApi()
    renderWithProviders(<MachineView kioskApi={api} />)
    await waitFor(() => expect(screen.getByText(/BAG-10/)).toBeInTheDocument())
    fireEvent.click(screen.getByText(/BAG-10/))
    expect(screen.getByText('45 dk')).toBeInTheDocument()
    fireEvent.click(screen.getByText('45 dk'))
    fireEvent.click(screen.getByRole('button', { name: /Makine 1 · 🫧 Çamaşır/ }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      '/self-service/laundry-kiosk/machines/1/assign',
      { item_id: 10, timer_minutes: 45 },
    ))
  })

  it('yıkama bitti butonu wash-complete çağırır ve ütü mesajı gösterir', async () => {
    const api = makeKioskApi()
    renderWithProviders(<MachineView kioskApi={api} />)
    await waitFor(() => expect(screen.getByText('✓ Yıkama Bitti')).toBeInTheDocument())
    fireEvent.click(screen.getByText('✓ Yıkama Bitti'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/self-service/laundry-kiosk/bags/11/wash-complete', {},
    ))
    await waitFor(() => expect(screen.getByText(/ütüye gönderildi/)).toBeInTheDocument())
  })
})
