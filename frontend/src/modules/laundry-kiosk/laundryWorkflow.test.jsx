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
  // Kontrollü harness: ayrıntı paneli iç state tutuyor, RTL rerender'ı
  // sarmalayıcıları düşürüp bileşeni yeniden mount ettiği için state kaybolur.
  function renderInput(initial = { garments: [], freeText: '', itemCount: 0 }, extra = {}) {
    const state = { current: initial }
    function Harness() {
      const [value, setValue] = useState(initial)
      state.current = value
      return (
        <QuickGarmentInput
          garmentTypes={garmentTypes} value={value} onChange={setValue} {...extra}
        />
      )
    }
    renderWithProviders(<Harness />)
    return state
  }

  it('kıyafete dokununca renk/desen/marka/beden paneli açılır', () => {
    renderInput()
    fireEvent.click(screen.getAllByRole('button', { name: /Gömlek/ })[0])

    // Renk ve desen doğrudan geliyor — katlanmış "ayrıntılı giriş" yok
    expect(screen.getByRole('button', { name: 'Mavi rengi' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Çizgili deseni' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('listede yoksa yazın')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'XXL' })).toBeInTheDocument()
  })

  it('panelden renk, desen, marka, beden ve adet ile parça eklenir', () => {
    const state = renderInput(undefined, { brandSuggestions: ['Penti'] })
    fireEvent.click(screen.getAllByRole('button', { name: /Gömlek/ })[0])

    fireEvent.click(screen.getByRole('button', { name: 'Mavi rengi' }))
    fireEvent.click(screen.getByRole('button', { name: 'Çizgili deseni' }))
    fireEvent.click(screen.getByRole('button', { name: 'Penti' }))
    fireEvent.click(screen.getByRole('button', { name: 'XL' }))
    fireEvent.click(screen.getByRole('button', { name: '3 adet' }))
    fireEvent.click(screen.getByRole('button', { name: /Gömlek Ekle/ }))

    expect(state.current.garments).toHaveLength(1)
    expect(state.current.garments[0]).toMatchObject({
      type_name: 'Gömlek', count: 3, brand: 'Penti', size: 'XL',
      pattern: 'striped-h', requires_ironing: true,
    })
    expect(state.current.garments[0].colors).toEqual([{ key: 'blue', label: 'Mavi' }])
  })

  it('renk seçimi panelde en fazla 3 ile sınırlı', () => {
    renderInput()
    fireEvent.click(screen.getAllByRole('button', { name: /Gömlek/ })[0])

    const names = ['Beyaz rengi', 'Siyah rengi', 'Gri rengi', 'Mavi rengi']
    names.forEach(name => fireEvent.click(screen.getByRole('button', { name })))
    const pressed = names.filter(name =>
      screen.getByRole('button', { name }).getAttribute('aria-pressed') === 'true')
    expect(pressed).toEqual(['Beyaz rengi', 'Siyah rengi', 'Gri rengi'])
  })

  it("politikası belirtilmemiş tür panelde ütü AÇIK gelir ve kontrol uyarısı verir", () => {
    const state = renderInput()
    fireEvent.click(screen.getAllByRole('button', { name: /Çorap/ })[0])

    expect(screen.getByRole('button', { name: /Ütülenecek · kontrol et/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Çorap Ekle/ }))
    expect(state.current.garments[0].requires_ironing).toBe(true)
  })

  it("'never' türü panelde ütü kapalı gelir", () => {
    const state = renderInput()
    fireEvent.click(screen.getAllByRole('button', { name: /Havlu/ })[0])

    expect(screen.getByRole('button', { name: '↪️ Ütülenmeyecek' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Havlu Ekle/ }))
    expect(state.current.garments[0].requires_ironing).toBe(false)
  })

  it('standart blokta ütü seçeneği hiç gösterilmez ve parça ütüsüz eklenir', () => {
    const state = renderInput(undefined, { allowIroning: false })
    fireEvent.click(screen.getAllByRole('button', { name: /Gömlek/ })[0])
    expect(screen.queryByRole('button', { name: /Ütülenecek/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Gömlek Ekle/ }))
    expect(state.current.garments[0].requires_ironing).toBe(false)
    expect(screen.queryByRole('button', { name: 'Tümüne aç' })).not.toBeInTheDocument()
  })

  it('aynı karta tekrar dokunmak paneli kapatır', () => {
    renderInput()
    fireEvent.click(screen.getAllByRole('button', { name: /Gömlek/ })[0])
    expect(screen.getByRole('button', { name: 'Mavi rengi' })).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: /Gömlek/ })[0])
    expect(screen.queryByRole('button', { name: 'Mavi rengi' })).not.toBeInTheDocument()
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
    // Marka artık palet — arşivden gelen öneri dokunarak seçilir
    fireEvent.click(screen.getByRole('button', { name: 'Lacoste' }))
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

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    const [url, payload] = api.post.mock.calls[0]
    expect(url).toBe('/self-service/laundry-kiosk/deliver-partial')
    expect(payload).toBeInstanceOf(FormData)
    expect(payload.get('item_id')).toBe('20')
    expect(JSON.parse(payload.get('garment_ids'))).toEqual([201])
    expect(payload.get('delivered_name')).toBe('Ayşe Test')
    expect(payload.get('recipient_type')).toBe('owner')
  })
})
