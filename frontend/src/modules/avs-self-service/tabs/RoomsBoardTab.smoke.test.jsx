import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { renderWithProviders } from '../../../test/renderWithProviders.jsx'
import RoomsBoardTab from './RoomsBoardTab.jsx'

// Saha ekranı Odalar sekmesi (spec §7): blok → kat → oda kutucuğu → alt sayfa; her işlemden sonra Geri al.
const BLOCKS = {
  blocks: [{ block: 'M1', type: 'M', rooms: 2, open: 2, closed: 0, locked: 0, occupied: 1, empty: 0, unknown: 1, cleaned: 0, skipped: 0 }],
  assigned_block: null,
}
const spot = extra => ({ status: null, at: null, by: null, skip_reason: null, mine: false, last_cleaned_at: null, ...extra })
const ROOMS = {
  block: 'M1', date: '2026-10-24', type: 'M',
  floors: [{
    floor: 1,
    common_areas: [['corridor', 'Koridor'], ['toilet', 'Tuvalet / WC'], ['bathroom', 'Banyo'], ['stairs', 'Merdiven']]
      .map(([code, label]) => spot({ location: `M1-1-${code}`, code, label })),
    rooms: [
      spot({ location: 'M1-101', id: 501, room_no: '101', use_state: 'open', occupant_shift: null, no_clean: false, occupancy: null }),
      spot({ location: 'M1-102', id: 502, room_no: '102', use_state: 'open', occupant_shift: 'night', no_clean: false, occupancy: 'occupied' }),
    ],
  }],
}

function makeApi() {
  return {
    get: vi.fn(url => Promise.resolve({ data: url.includes('/board/rooms') ? ROOMS : BLOCKS })),
    post: vi.fn(url => {
      if (url.endsWith('/board/mark')) return Promise.resolve({ data: { task_id: 1, status: 'cleaned', at: '2026-10-24 06:15:00', already: false } })
      if (url.endsWith('/board/undo')) return Promise.resolve({ data: { ok: true, removed: true } })
      if (url.endsWith('/board/floor')) {
        return Promise.resolve({ data: { locations: ['M1-1-corridor', 'M1-101'], excluded: { closed: 0, locked: 0, night: 1, empty: 0, no_clean: 0, marked: 0 } } })
      }
      if (url.endsWith('/board/floor-undo')) return Promise.resolve({ data: { undone: 2, skipped: 0 } })
      return Promise.resolve({ data: {} })
    }),
    patch: vi.fn(() => Promise.resolve({ data: { id: 501, occupancy: 'occupied', occupancy_updated_at: '2026-10-24 07:00:00' } })),
  }
}

async function openBlock() {
  fireEvent.click(await screen.findByRole('button', { name: /^M1\b/ }))
  return screen.findByRole('button', { name: /^101\b/ })
}

beforeEach(() => {
  try { window.localStorage.clear() } catch { /* yoksay */ }
})

describe('RoomsBoardTab', () => {
  it('blok çipine basınca odalar gelir; kutucuk alt sayfayı açar; Temizlendi işaretler, Geri al geri alır', async () => {
    const api = makeApi()
    renderWithProviders(<RoomsBoardTab avsApi={api} onReportFault={() => {}} />)
    fireEvent.click(await openBlock())
    const sheet = await screen.findByRole('dialog', { name: 'M1-101' })
    fireEvent.click(within(sheet).getByRole('button', { name: /Temizlendi$/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/avs-self-service/board/mark', { location: 'M1-101', action: 'clean' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Geri al' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/avs-self-service/board/undo', { location: 'M1-101' }))
  })

  it('temizlenemedi sebebi seçilip kaydedilir', async () => {
    const api = makeApi()
    renderWithProviders(<RoomsBoardTab avsApi={api} onReportFault={() => {}} />)
    fireEvent.click(await openBlock())
    const sheet = await screen.findByRole('dialog', { name: 'M1-101' })
    fireEvent.click(within(sheet).getByRole('button', { name: /Temizlenemedi/ }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Rahatsız etmeyin' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Sebebi kaydet' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/avs-self-service/board/mark',
      { location: 'M1-101', action: 'skip', reason: 'dnd' }))
  })

  it('doluluk düğmesi odanın doluluğunu yazar', async () => {
    const api = makeApi()
    renderWithProviders(<RoomsBoardTab avsApi={api} onReportFault={() => {}} />)
    fireEvent.click(await openBlock())
    const sheet = await screen.findByRole('dialog', { name: 'M1-101' })
    fireEvent.click(within(sheet).getByRole('button', { name: /Dolu/ }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/avs-self-service/board/rooms/501/occupancy', { occupancy: 'occupied' }))
  })

  it('Katın hepsi temizlendi önce kuru denemeyle sayıyı ve dışarıda kalanı gösterir, onayda yazar', async () => {
    const api = makeApi()
    renderWithProviders(<RoomsBoardTab avsApi={api} onReportFault={() => {}} />)
    await openBlock()
    fireEvent.click(screen.getByRole('button', { name: /Katın hepsi temizlendi/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/avs-self-service/board/floor', { block: 'M1', floor: 1, dry_run: true }))
    expect(await screen.findByText(/2 yer/)).toBeInTheDocument()
    expect(screen.getByText(/1 gececi/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Onayla' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/avs-self-service/board/floor', { block: 'M1', floor: 1, dry_run: false }))
    fireEvent.click(await screen.findByRole('button', { name: 'Geri al' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/avs-self-service/board/floor-undo', { locations: ['M1-1-corridor', 'M1-101'] }))
  })

  it('çevrimdışıyken işaret düğmeleri pasif ve bağlantı uyarısı görünür', async () => {
    renderWithProviders(<RoomsBoardTab avsApi={makeApi()} onReportFault={() => {}} isOnline={false} />)
    fireEvent.click(await openBlock())
    const sheet = await screen.findByRole('dialog', { name: 'M1-101' })
    expect(within(sheet).getByRole('button', { name: /Temizlendi$/ })).toBeDisabled()
    expect(within(sheet).getByText('Bağlantı bekleniyor…')).toBeInTheDocument()
  })
})
