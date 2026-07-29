import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'
import QuickGarmentInput from './QuickGarmentInput.jsx'
import IroningWorkView from './IroningWorkView.jsx'
import DeliverWorkView from './DeliverWorkView.jsx'

const garmentTypes = [
  { id: 1, name: 'Gömlek', emoji: '👔', default_requires_ironing: 1 },
  { id: 2, name: 'Çorap', emoji: '🧦', default_requires_ironing: 0 },
]

describe('Laundry kiosk hızlı operasyon', () => {
  it('kıyafet kartına her dokunuş adedi artırır; azaltma ve ütü değişikliği çalışır', () => {
    let value = { garments: [], freeText: '', itemCount: 0 }
    const onChange = vi.fn(next => { value = next })
    const { rerender } = renderWithProviders(
      <QuickGarmentInput garmentTypes={garmentTypes} value={value} onChange={onChange} />
    )

    fireEvent.click(screen.getAllByRole('button', { name: /Gömlek/ })[0])
    rerender(<QuickGarmentInput garmentTypes={garmentTypes} value={value} onChange={onChange} />)
    fireEvent.click(screen.getAllByRole('button', { name: /Gömlek/ })[0])
    rerender(<QuickGarmentInput garmentTypes={garmentTypes} value={value} onChange={onChange} />)

    expect(screen.getAllByText(/Gömlek × 2/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '♨️ Ütü açık' })).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: '−' })[0])
    rerender(<QuickGarmentInput garmentTypes={garmentTypes} value={value} onChange={onChange} />)
    expect(screen.getAllByText(/Gömlek × 1/).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: '♨️ Ütü açık' }))
    rerender(<QuickGarmentInput garmentTypes={garmentTypes} value={value} onChange={onChange} />)
    expect(screen.getByRole('button', { name: '↪️ Ütü gerekmiyor' })).toBeInTheDocument()
  })

  it('tekil ütü tiki iyimser görünür ve sunucuya client_action_id ile kaydedilir', async () => {
    const api = {
      get: vi.fn(url => {
        if (url.includes('?status=ironing')) {
          return Promise.resolve({ data: [{
            id: 10,
            bag_no: 'BG-10',
            block: 'A',
            room_no: '101',
            item_count: 1,
            garment_total: 1,
            garment_ready: 0,
          }] })
        }
        return Promise.resolve({ data: {
          bag: { id: 10, bag_no: 'BG-10', block: 'A', room_no: '101', item_count: 1 },
          garments: [{
            id: 101,
            garment_code: 'G10-01',
            garment_type: 'Gömlek',
            emoji: '👔',
            requires_ironing: 1,
            status: 'ironing',
          }],
          progress: { pending_ironing: 1 },
        } })
      }),
      put: vi.fn(() => Promise.resolve({ data: {
        garment: {
          id: 101,
          garment_code: 'G10-01',
          garment_type: 'Gömlek',
          emoji: '👔',
          requires_ironing: 1,
          status: 'ready',
        },
        progress: { pending_ironing: 0 },
      } })),
      post: vi.fn(),
    }

    renderWithProviders(<IroningWorkView kioskApi={api} />)
    await screen.findByText('BG-10')
    fireEvent.click(screen.getByRole('button', { name: /Aç/ }))
    await screen.findByText('G10-01')
    fireEvent.click(screen.getByRole('button', { name: 'G10-01 ütü onayı' }))

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
    const [url, payload] = api.put.mock.calls[0]
    expect(url).toBe('/self-service/laundry-kiosk/bags/10/garments/101/ironing')
    expect(payload.completed).toBe(true)
    expect(payload.client_action_id).toBeTruthy()
    expect(await screen.findByText(/1\/1/)).toBeInTheDocument()
  })

  it('teslim checklist’i seçilen gerçek garment_id listesini gönderir', async () => {
    const api = {
      get: vi.fn(url => {
        if (url.includes('?status=ready')) {
          return Promise.resolve({ data: [{
            id: 20,
            bag_no: 'BG-20',
            block: 'A',
            room_no: '102',
            item_count: 1,
            shelf_location: 'A-01',
          }] })
        }
        if (url.includes('/room-persons')) {
          return Promise.resolve({ data: [{ id: 7, full_name: 'Ayşe Test' }] })
        }
        return Promise.resolve({ data: {
          bag: {
            id: 20,
            bag_no: 'BG-20',
            block: 'A',
            room_no: '102',
            item_count: 1,
            shelf_location: 'A-01',
          },
          garments: [{
            id: 201,
            garment_code: 'G20-01',
            garment_type: 'Pantolon',
            emoji: '👖',
            status: 'ready',
          }],
          progress: { ready: 1 },
        } })
      }),
      post: vi.fn(() => Promise.resolve({ data: { ok: true, delivered_count: 1 } })),
    }

    renderWithProviders(<DeliverWorkView kioskApi={api} />)
    await screen.findByText('BG-20')
    fireEvent.click(screen.getByRole('button', { name: /Teslim/ }))
    await screen.findByText('G20-01')
    fireEvent.click(screen.getByRole('button', { name: /Pantolon/ }))
    fireEvent.click(screen.getByRole('button', { name: /Ayşe Test/ }))
    fireEvent.click(screen.getByRole('button', { name: /1 Parçayı Teslim Et/ }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/self-service/laundry-kiosk/bags/20/deliver',
      {
        delivered_name: 'Ayşe Test',
        garment_ids: [201],
        signature: null,
      }
    ))
  })
})
