import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'
import IroningWorkView from './IroningWorkView.jsx'

const BAG = { id: 10, bag_no: 'BG-10', block: 'A', room_no: '101', item_count: 2, garment_total: 2, garment_ready: 0 }

const GARMENTS = [
  {
    id: 101, garment_code: 'G10-01', garment_type: 'Gömlek', emoji: '👔',
    requires_ironing: 1, status: 'ironing',
    brand: 'Lacoste', model: null, size: 'XL',
    colors_json: '[{"key":"blue","label":"Mavi"}]', pattern: 'striped-h',
    condition_notes: 'yakada leke',
  },
  {
    id: 102, garment_code: 'G10-02', garment_type: 'Pantolon', emoji: '👖',
    requires_ironing: 1, status: 'ironing',
    brand: null, model: null, size: null, colors_json: '[]', pattern: 'solid',
    condition_notes: null,
  },
]

function makeApi(overrides = {}) {
  return {
    get: vi.fn(url => {
      if (url.includes('/brands')) return Promise.resolve({ data: ['Nike', 'Lacoste'] })
      if (url.includes('?status=ironing')) return Promise.resolve({ data: [BAG] })
      return Promise.resolve({ data: { bag: BAG, garments: GARMENTS, progress: { pending_ironing: 2 } } })
    }),
    put: vi.fn(() => Promise.resolve({
      data: { garment: { ...GARMENTS[1], brand: 'Mavi Jeans', size: '32' } },
    })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    ...overrides,
  }
}

async function openBag(api) {
  renderWithProviders(<IroningWorkView kioskApi={api} />)
  await waitFor(() => expect(screen.getByText(/BG-10/)).toBeInTheDocument())
  fireEvent.click(screen.getByText(/BG-10/))
  await waitFor(() => expect(screen.getByText(/G10-01/)).toBeInTheDocument())
}

describe('ütü ekranında parça künyesi', () => {
  it('marka, beden, renk ve deseni satırda gösterir', async () => {
    await openBag(makeApi())
    expect(screen.getByText(/Lacoste · Beden XL · Mavi · Çizgili/)).toBeInTheDocument()
  })

  it('durum notunu ayrıca uyarı olarak gösterir', async () => {
    await openBag(makeApi())
    expect(screen.getByText(/yakada leke/)).toBeInTheDocument()
  })

  it('künyesi boş parçayı "girilmemiş" olarak işaretler ve sayacı 0/4 gösterir', async () => {
    await openBag(makeApi())
    expect(screen.getByText('🏷️ Künye girilmemiş')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /G10-02 künye düzenle/ }).textContent).toMatch(/0\/4/)
    // Dolu künye 3/4 (marka + beden + renk + desen'den model hariç)
    expect(screen.getByRole('button', { name: /G10-01 künye düzenle/ }).textContent).toMatch(/4\/4/)
  })

  it('künye açılır, yalnız değişen alanlar sunucuya gider', async () => {
    const api = makeApi()
    await openBag(api)

    fireEvent.click(screen.getByRole('button', { name: /G10-02 künye düzenle/ }))
    fireEvent.change(screen.getByPlaceholderText('ör. Lacoste'), { target: { value: 'Mavi Jeans' } })
    fireEvent.change(screen.getByPlaceholderText('veya sayısal beden — ör. 42'), { target: { value: '32' } })
    fireEvent.click(screen.getByRole('button', { name: /Künyeyi Kaydet/ }))

    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      '/self-service/laundry-kiosk/bags/10/garments/102/details',
      { brand: 'Mavi Jeans', size: '32' },
    ))
  })

  it('hiçbir şey değişmediyse istek atılmaz, panel kapanır', async () => {
    const api = makeApi()
    await openBag(api)

    fireEvent.click(screen.getByRole('button', { name: /G10-01 künye düzenle/ }))
    fireEvent.click(screen.getByRole('button', { name: /Künyeyi Kaydet/ }))

    await waitFor(() => expect(screen.queryByPlaceholderText('ör. Lacoste')).not.toBeInTheDocument())
    expect(api.put).not.toHaveBeenCalled()
  })

  it('sunucu hatası künye panelinde gösterilir', async () => {
    const api = makeApi({
      put: vi.fn(() => Promise.reject({ response: { data: { error: 'Künye kilitli' } } })),
    })
    await openBag(api)

    fireEvent.click(screen.getByRole('button', { name: /G10-02 künye düzenle/ }))
    fireEvent.change(screen.getByPlaceholderText('ör. Lacoste'), { target: { value: 'X' } })
    fireEvent.click(screen.getByRole('button', { name: /Künyeyi Kaydet/ }))

    await waitFor(() => expect(screen.getByText('Künye kilitli')).toBeInTheDocument())
  })

  it('renk seçimi en fazla 3 renkle sınırlı', async () => {
    const api = makeApi()
    await openBag(api)
    fireEvent.click(screen.getByRole('button', { name: /G10-02 künye düzenle/ }))

    const colorNames = ['Beyaz rengi', 'Siyah rengi', 'Gri rengi', 'Lacivert rengi']
    colorNames.forEach(name => fireEvent.click(screen.getByRole('button', { name })))

    const pressed = colorNames.filter(name =>
      screen.getByRole('button', { name }).getAttribute('aria-pressed') === 'true')
    expect(pressed).toHaveLength(3)
  })
})
