import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { renderWithProviders } from '../../../test/renderWithProviders.jsx'
import LaundryLedgerTab from './LaundryLedgerTab.jsx'

// Saha ekranı Çamaşır sekmesi (spec §7): Çamaşır al → blok → oda → torba sayısı → ütü/acil → kaydet;
// altta Yıkamada · Hazır · Bugün teslim; kartta tek dokunuş Hazır / Teslim et; her işlemde Geri al.
const group = extra => ({ block: 'M1', ironing: 0, urgent: 0, since: '2026-10-24 06:00:00', updated_at: '2026-10-24 06:00:00', ...extra })
const LEDGER = {
  open: [group({ room_id: 501, room_no: '101', bags: 3, ironing: 1, urgent: 1, ids: [11, 12, 13] })],
  ready: [group({ room_id: 502, room_no: '102', bags: 1, ids: [21] })],
  delivered_today: [],
}
const BLOCKS = { blocks: [{ block: 'M1', type: 'M', rooms: 2, open: 2, closed: 0, locked: 0, cleaned: 0, skipped: 0 }], assigned_block: null }
const ROOMS = {
  block: 'M1', type: 'M',
  floors: [{ floor: 1, common_areas: [], rooms: [
    { location: 'M1-101', id: 501, room_no: '101', use_state: 'open', status: null },
    { location: 'M1-102', id: 502, room_no: '102', use_state: 'open', status: null },
  ] }],
}

function makeApi({ failFirstIntake = false, ledger = LEDGER } = {}) {
  let intakeCalls = 0
  return {
    get: vi.fn(url => Promise.resolve({
      data: url.includes('/board/rooms') ? ROOMS : url.includes('/board/blocks') ? BLOCKS : ledger,
    })),
    post: vi.fn(url => {
      if (url === '/avs-self-service/laundry') {
        intakeCalls += 1
        if (failFirstIntake && intakeCalls === 1) return Promise.reject(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }))
        return Promise.resolve({ data: { ids: [31, 32], already: false } })
      }
      if (url.endsWith('/ready')) return Promise.resolve({ data: { ids: [11, 12, 13] } })
      if (url.endsWith('/deliver')) return Promise.resolve({ data: { ids: [21] } })
      if (url.endsWith('/undo')) return Promise.resolve({ data: { undone: 1 } })
      return Promise.resolve({ data: {} })
    }),
  }
}

async function fillIntake() {
  fireEvent.click(await screen.findByRole('button', { name: /Çamaşır al/ }))
  const form = await screen.findByRole('dialog', { name: 'Çamaşır al' })
  fireEvent.click(await within(form).findByRole('button', { name: /^M1\b/ }))
  fireEvent.click(await within(form).findByRole('button', { name: '101' }))
  fireEvent.click(within(form).getByRole('button', { name: 'Torba ekle' }))
  fireEvent.click(within(form).getByRole('button', { name: /Ütü/ }))
  return form
}

beforeEach(() => {
  try { window.localStorage.clear() } catch { /* yoksay */ }
})

describe('LaundryLedgerTab', () => {
  it('üç liste başlığı torba sayısıyla görünür', async () => {
    renderWithProviders(<LaundryLedgerTab avsApi={makeApi()} />)
    expect(await screen.findByRole('heading', { name: /Yıkamada.*3/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Hazır.*1/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Bugün teslim.*0/ })).toBeInTheDocument()
  })

  it('Çamaşır al: blok → oda → 2 torba → ütü → kaydet; ağ hatasında aynı anahtarla tekrar dener, sonra Geri al', async () => {
    const api = makeApi({ failFirstIntake: true })
    renderWithProviders(<LaundryLedgerTab avsApi={api} />)
    const form = await fillIntake()
    fireEvent.click(within(form).getByRole('button', { name: 'Kaydet' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    const first = api.post.mock.calls[0]
    expect(first[0]).toBe('/avs-self-service/laundry')
    expect(first[1]).toEqual({ room_id: 501, bags: 2, ironing: true, urgent: false, client_request_id: expect.stringMatching(/^saha-[a-zA-Z0-9-]{8,}$/) })

    fireEvent.click(await within(form).findByRole('button', { name: 'Kaydet' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2))
    expect(api.post.mock.calls[1][1].client_request_id).toBe(first[1].client_request_id)

    fireEvent.click(await screen.findByRole('button', { name: 'Geri al' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/avs-self-service/laundry/undo', { action: 'intake', ids: [31, 32] }))
  })

  it('form yeniden açılınca yeni istemci anahtarı üretilir', async () => {
    const api = makeApi()
    renderWithProviders(<LaundryLedgerTab avsApi={api} />)
    let form = await fillIntake()
    fireEvent.click(within(form).getByRole('button', { name: 'Kaydet' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Çamaşır al' })).toBeNull())
    form = await fillIntake()
    fireEvent.click(within(form).getByRole('button', { name: 'Kaydet' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2))
    expect(api.post.mock.calls[1][1].client_request_id).not.toBe(api.post.mock.calls[0][1].client_request_id)
  })

  it('kartta Hazır odanın torbalarını rafa alır, Geri al aynı torbaları geri alır', async () => {
    const api = makeApi()
    renderWithProviders(<LaundryLedgerTab avsApi={api} />)
    const card = (await screen.findByText('M1-101')).closest('article')
    fireEvent.click(within(card).getByRole('button', { name: 'Hazır' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/avs-self-service/laundry/rooms/501/ready'))
    fireEvent.click(await screen.findByRole('button', { name: 'Geri al' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/avs-self-service/laundry/undo', { action: 'ready', ids: [11, 12, 13] }))
  })

  it('Teslim et teslim alanı sorar ve adıyla gönderir', async () => {
    const api = makeApi()
    renderWithProviders(<LaundryLedgerTab avsApi={api} />)
    const card = (await screen.findByText('M1-102')).closest('article')
    fireEvent.click(within(card).getByRole('button', { name: 'Teslim et' }))
    fireEvent.change(within(card).getByPlaceholderText('Teslim alan (isteğe bağlı)'), { target: { value: 'Ahmet' } })
    fireEvent.click(within(card).getByRole('button', { name: 'Teslimi kaydet' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/avs-self-service/laundry/rooms/502/deliver', { name: 'Ahmet' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Geri al' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/avs-self-service/laundry/undo', { action: 'deliver', ids: [21] }))
  })
})

// Sakinin oda QR'ından çamaşır alma talebi (spec 2026-10-24-oda-qr-saha §Hedefler 6): defterin başında, tek dokunuşla alım
describe('LaundryLedgerTab — sakin talepleri', () => {
  it('Talepler bölümünde oda ve not; "Çamaşırı al" alım sayfasını o oda seçili açar ve kaydeder', async () => {
    const request = { id: 9, room_id: 502, block: 'M1', room_no: '102', note: 'Kapının önünde', request_count: 1, created_at: '2026-10-24 06:00:00' }
    const api = makeApi({ ledger: { ...LEDGER, requests: [request] } })
    renderWithProviders(<LaundryLedgerTab avsApi={api} />)
    const section = await screen.findByRole('region', { name: /Talepler/ })
    expect(within(section).getByText('M1-102')).toBeInTheDocument()
    expect(within(section).getByText(/Kapının önünde/)).toBeInTheDocument()
    fireEvent.click(within(section).getByRole('button', { name: 'Çamaşırı al' }))
    const form = await screen.findByRole('dialog', { name: 'Çamaşır al' })
    expect(await within(form).findByRole('button', { name: '102' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(form).getByRole('button', { name: 'Kaydet' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/avs-self-service/laundry', expect.objectContaining({ room_id: 502, bags: 1 })))
  })

  it('talep yoksa bölüm görünmez', async () => {
    renderWithProviders(<LaundryLedgerTab avsApi={makeApi()} />)
    await screen.findByRole('heading', { name: /Yıkamada/ })
    expect(screen.queryByRole('region', { name: /Talepler/ })).toBeNull()
  })
})
