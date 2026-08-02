import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'
import DeliverWorkView from './DeliverWorkView.jsx'

// A (Y tipi) imza istemez; M1 (standart blok) imza ister — constants.js SIGN_BLOCKS.
const READY_BAGS = [
  { id: 1, bag_no: 'BG-1', block: 'A', room_no: '101', item_count: 3, intake_name: 'Ali Veli', garment_names: 'Gömlek,Pantolon' },
  { id: 2, bag_no: 'BG-2', block: 'A', room_no: '101', item_count: 2, intake_name: 'Ali Veli', garment_names: 'Havlu' },
  { id: 3, bag_no: 'BG-3', block: 'A', room_no: '205', item_count: 1, garment_names: 'Çorap' },
]

function makeApi(overrides = {}) {
  return {
    get: vi.fn(url => {
      if (url.includes('status=ready')) return Promise.resolve({ data: READY_BAGS })
      if (url.includes('room-persons')) return Promise.resolve({ data: [{ id: 7, full_name: 'Ali Veli' }] })
      return Promise.resolve({ data: [] })
    }),
    post: vi.fn(() => Promise.resolve({ data: { ok: true, delivered: 2, bag_nos: ['BG-1', 'BG-2'], failed: [] } })),
    ...overrides,
  }
}

async function openBulk(api) {
  renderWithProviders(<DeliverWorkView kioskApi={api} />)
  await waitFor(() => expect(screen.getByText('ODAYA DOKUNARAK TESLİM')).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: /📦 A-101/ }))
  await waitFor(() => expect(screen.getByText('TESLİM EDİLECEK TORBALAR')).toBeInTheDocument())
}

describe('oda bazlı toplu teslim', () => {
  it('tek veya birden çok torbası olan her oda doğrudan teslim satırı gösterir', async () => {
    renderWithProviders(<DeliverWorkView kioskApi={makeApi()} />)
    await waitFor(() => expect(screen.getByText('ODAYA DOKUNARAK TESLİM')).toBeInTheDocument())

    expect(screen.getByRole('button', { name: /📦 A-101/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /📦 A-205/ })).toBeInTheDocument()
  })

  it('oda, torba, kişi ve kıyafet adına göre arar', async () => {
    renderWithProviders(<DeliverWorkView kioskApi={makeApi()} />)
    await waitFor(() => expect(screen.getByLabelText('Teslimatlarda ara')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Teslimatlarda ara'), { target: { value: 'Çorap' } })
    expect(screen.getByText('BG-3')).toBeInTheDocument()
    expect(screen.queryByText('BG-1')).not.toBeInTheDocument()
  })

  it('toplu teslim tek isim ile deliver-room ucuna gider', async () => {
    const api = makeApi()
    await openBulk(api)
    // Oda sakini otomatik seçildi (torbanın intake_name'i)
    expect(screen.getByDisplayValue('Ali Veli')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /2 Torbayı Birden Teslim Et/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/self-service/laundry-kiosk/deliver-room',
      { block: 'A', room_no: '101', delivered_name: 'Ali Veli', signature: null },
    ))
    await waitFor(() => expect(screen.getByText(/2 torba tek imzayla teslim edildi/)).toBeInTheDocument())
  })

  it('isim boşsa gönderim yapılmaz', async () => {
    const api = makeApi({
      get: vi.fn(url => {
        if (url.includes('status=ready')) return Promise.resolve({ data: READY_BAGS.map(b => ({ ...b, intake_name: null })) })
        if (url.includes('room-persons')) return Promise.resolve({ data: [] })
        return Promise.resolve({ data: [] })
      }),
    })
    await openBulk(api)
    fireEvent.click(screen.getByRole('button', { name: /2 Torbayı Birden Teslim Et/ }))

    await waitFor(() => expect(screen.getByText(/Teslim alan kişiyi seçin/)).toBeInTheDocument())
    expect(api.post).not.toHaveBeenCalled()
  })

  it('imza zorunlu blokta imzasız gönderim engellenir', async () => {
    const api = makeApi({
      get: vi.fn(url => {
        if (url.includes('status=ready')) return Promise.resolve({ data: READY_BAGS.map(b => ({ ...b, block: 'M1' })) })
        if (url.includes('room-persons')) return Promise.resolve({ data: [{ id: 7, full_name: 'Ali Veli' }] })
        return Promise.resolve({ data: [] })
      }),
    })
    renderWithProviders(<DeliverWorkView kioskApi={api} />)
    await waitFor(() => expect(screen.getByText('ODAYA DOKUNARAK TESLİM')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /📦 M1-101/ }))
    await waitFor(() => expect(screen.getByText('TESLİM EDİLECEK TORBALAR')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /2 Torbayı Birden Teslim Et/ }))
    await waitFor(() => expect(screen.getByText(/İmza gerekli/)).toBeInTheDocument())
    expect(api.post).not.toHaveBeenCalled()
  })

  it('kısmi başarısızlık kullanıcıya bildirilir', async () => {
    const api = makeApi({
      post: vi.fn(() => Promise.resolve({
        data: { ok: true, delivered: 1, bag_nos: ['BG-1'], failed: [{ id: 2, error: 'Torba ready değil' }] },
      })),
    })
    await openBulk(api)
    fireEvent.click(screen.getByRole('button', { name: /2 Torbayı Birden Teslim Et/ }))

    // Sebep de görünmeli — yalnız sayı operatöre ne yapacağını söylemiyor
    await waitFor(() => expect(
      screen.getByText(/1 torba teslim edildi · 1 başarısız — Torba ready değil/)
    ).toBeInTheDocument())
  })
})
