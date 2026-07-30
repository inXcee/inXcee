import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'
import QuickGarmentInput from './QuickGarmentInput.jsx'
import IroningWorkView from './IroningWorkView.jsx'
import DeliverWorkView from './DeliverWorkView.jsx'

const garmentTypes = [
  { id: 1, name: 'Gömlek', emoji: '👔', ironing_policy: 'always' },
  { id: 2, name: 'Çorap', emoji: '🧦', ironing_policy: 'ask' },
  { id: 3, name: 'Havlu', emoji: '🧺', ironing_policy: 'never' },
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
    expect(screen.getByRole('button', { name: '♨️ Ütülenecek' })).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: '−' })[0])
    rerender(<QuickGarmentInput garmentTypes={garmentTypes} value={value} onChange={onChange} />)
    expect(screen.getAllByText(/Gömlek × 1/).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: '♨️ Ütülenecek' }))
    rerender(<QuickGarmentInput garmentTypes={garmentTypes} value={value} onChange={onChange} />)
    expect(screen.getByRole('button', { name: '↪️ Ütülenmeyecek' })).toBeInTheDocument()
  })

  it("politikası belirtilmemiş tür ütü AÇIK gelir ve kontrol uyarısı gösterir", () => {
    let value = { garments: [], freeText: '', itemCount: 0 }
    const onChange = vi.fn(next => { value = next })
    const { rerender } = renderWithProviders(
      <QuickGarmentInput garmentTypes={garmentTypes} value={value} onChange={onChange} />
    )
    fireEvent.click(screen.getAllByRole('button', { name: /Çorap/ })[0])
    rerender(<QuickGarmentInput garmentTypes={garmentTypes} value={value} onChange={onChange} />)

    expect(value.garments[0].requires_ironing).toBe(true)
    expect(screen.getByRole('button', { name: '♨️ Ütülenecek' })).toBeInTheDocument()
    expect(screen.getByText('KONTROL ET')).toBeInTheDocument()
  })

  it("'never' türü ütü kapalı gelir ve kontrol uyarısı çıkmaz", () => {
    let value = { garments: [], freeText: '', itemCount: 0 }
    const onChange = vi.fn(next => { value = next })
    const { rerender } = renderWithProviders(
      <QuickGarmentInput garmentTypes={garmentTypes} value={value} onChange={onChange} />
    )
    fireEvent.click(screen.getAllByRole('button', { name: /Havlu/ })[0])
    rerender(<QuickGarmentInput garmentTypes={garmentTypes} value={value} onChange={onChange} />)

    expect(value.garments[0].requires_ironing).toBe(false)
    expect(screen.queryByText('KONTROL ET')).not.toBeInTheDocument()
  })

  it('toplu ütü düğmeleri bütün parçaları birden değiştirir', () => {
    let value = {
      garments: [
        { type_id: 1, type_name: 'Gömlek', count: 1, requires_ironing: true },
        { type_id: 3, type_name: 'Havlu', count: 1, requires_ironing: false },
      ],
      freeText: '', itemCount: 0,
    }
    const onChange = vi.fn(next => { value = next })
    const { rerender } = renderWithProviders(
      <QuickGarmentInput garmentTypes={garmentTypes} value={value} onChange={onChange} />
    )
    expect(screen.getByText(/1\/2 parça/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Tümüne aç' }))
    rerender(<QuickGarmentInput garmentTypes={garmentTypes} value={value} onChange={onChange} />)
    expect(value.garments.every(g => g.requires_ironing)).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Tümünü kapat' }))
    expect(value.garments.every(g => !g.requires_ironing)).toBe(true)
  })

  it('künye açılır; marka ve beden parçaya yazılır', () => {
    // RTL rerender'ı sarmalayıcıları düşürüp bileşeni yeniden mount ediyor
    // (künye paneli iç state). Kontrollü harness ile gerçek akış sürdürülür.
    const state = { current: null }
    function Harness() {
      const [value, setValue] = useState({
        garments: [{ type_id: 1, type_name: 'Gömlek', count: 1, requires_ironing: true }],
        freeText: '', itemCount: 0,
      })
      state.current = value
      return (
        <QuickGarmentInput
          garmentTypes={garmentTypes} value={value} onChange={setValue}
          brandSuggestions={['Nike', 'Lacoste']}
        />
      )
    }
    renderWithProviders(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: /Marka \/ beden/ }))
    fireEvent.change(screen.getByPlaceholderText('ör. Nike'), { target: { value: 'Lacoste' } })
    expect(state.current.garments[0].brand).toBe('Lacoste')

    fireEvent.click(screen.getByRole('button', { name: 'XL' }))
    expect(state.current.garments[0].size).toBe('XL')

    // Künye özeti satırda görünür
    expect(screen.getByText(/Lacoste · XL/)).toBeInTheDocument()
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
