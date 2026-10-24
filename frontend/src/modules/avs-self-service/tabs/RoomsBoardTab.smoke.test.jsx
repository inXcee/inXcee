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

// QR durumları için ROOMS'taki odaların alanları değiştirilir
const withSpots = overrides => ({
  ...ROOMS,
  floors: ROOMS.floors.map(f => ({ ...f, rooms: f.rooms.map(r => ({ ...r, ...(overrides[r.location] || {}) })) })),
})

function makeApi({ rooms = ROOMS, scan = null, scanError = null } = {}) {
  return {
    get: vi.fn(url => Promise.resolve({ data: url.includes('/board/rooms') ? rooms : BLOCKS })),
    post: vi.fn(url => {
      if (url.endsWith('/qr-scan')) return scanError ? Promise.reject(scanError) : Promise.resolve({ data: scan })
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

// Oda QR'ı ile saha takibi (spec 2026-10-24-oda-qr-saha): kapıdaki QR okutulunca yerin sayfası doğrulanmış açılır
const QR = `https://avskamp.com/r/${'T'.repeat(43)}`
const nowSql = () => new Date().toISOString().slice(0, 19).replace('T', ' ')
const scanResult = () => ({
  scan_id: 77, location: 'M1-101', kind: 'room', block: 'M1', floor: 1, room_id: 501, display_name: 'M1 Oda 101',
  qr_label: 'none', at: nowSql(), group: 'housekeeping',
})

describe('RoomsBoardTab — kapıdaki QR', () => {
  it('okutulan yerin sayfası "QR ile doğrulandı" açılır; Temizlendi okutmayı taşır; sakin sayfası bağlantısı', async () => {
    const api = makeApi({ scan: scanResult() })
    const done = vi.fn()
    renderWithProviders(
      <RoomsBoardTab avsApi={api} onReportFault={() => {}} pendingScan={{ qr: QR, via: 'camera' }} onPendingScanDone={done} />,
    )
    const sheet = await screen.findByRole('dialog', { name: 'M1-101' })
    expect(api.post).toHaveBeenCalledWith('/avs-self-service/qr-scan', { qr: QR, via: 'camera' })
    expect(done).toHaveBeenCalled()
    expect(within(sheet).getByText(/QR ile doğrulandı/)).toBeInTheDocument()
    expect(within(sheet).getByRole('link', { name: 'Sakin sayfası' })).toHaveAttribute('href', `${QR}?sakin=1`)
    fireEvent.click(within(sheet).getByRole('button', { name: /Temizlendi$/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/avs-self-service/board/mark', { location: 'M1-101', action: 'clean', scan_id: 77 }))
  })

  it('etiketi doğrulanmış kapıda okutmasız işaret pasif ve okutma istenir; etiketsiz yerde "Etiketi doğrula" görünür', async () => {
    const rooms = withSpots({ 'M1-101': { qr_required: true, qr_label: 'verified' }, 'M1-102': { qr_label: 'none' } })
    renderWithProviders(<RoomsBoardTab avsApi={makeApi({ rooms })} onReportFault={() => {}} />)
    fireEvent.click(await openBlock())
    let sheet = await screen.findByRole('dialog', { name: 'M1-101' })
    expect(within(sheet).getByRole('button', { name: /Temizlendi$/ })).toBeDisabled()
    expect(within(sheet).getByRole('button', { name: /Temizlenemedi/ })).toBeDisabled()
    expect(within(sheet).getByText("Bu kapıda QR etiketi var; işaretlemek için kapıdaki QR'ı okut")).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: /QR okut/ })).toBeEnabled()
    expect(within(sheet).queryByRole('button', { name: /Etiketi doğrula/ })).toBeNull()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Kapat' }))
    fireEvent.click(screen.getByRole('button', { name: /^102\b/ }))
    sheet = await screen.findByRole('dialog', { name: 'M1-102' })
    expect(within(sheet).getByRole('button', { name: /Etiketi doğrula/ })).toBeInTheDocument()
    expect(within(sheet).getByText('Etiket kaydı yok')).toBeInTheDocument()
  })

  it('sakinin çamaşır talebi ve eksik bildirimi kutucukta ve sayfada görünür', async () => {
    const rooms = withSpots({ 'M1-101': {
      pickup_request: { id: 9, created_at: nowSql(), request_count: 1, note: 'Kapının önünde' },
      complaint: { comment: 'Çöp alınmamış', rating: 2, created_at: nowSql(), open: true },
    } })
    renderWithProviders(<RoomsBoardTab avsApi={makeApi({ rooms })} onReportFault={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: /^M1\b/ }))
    fireEvent.click(await screen.findByRole('button', { name: /^101\b.*çamaşır talebi.*şikayet/ }))
    const sheet = await screen.findByRole('dialog', { name: 'M1-101' })
    expect(within(sheet).getByText(/Sakin çamaşırının alınmasını istedi/)).toBeInTheDocument()
    expect(within(sheet).getByText(/Kapının önünde/)).toBeInTheDocument()
    expect(within(sheet).getByText(/Sakin eksik bildirdi/)).toBeInTheDocument()
    expect(within(sheet).getByText(/Çöp alınmamış/)).toBeInTheDocument()
  })

  it('kat başlığında QR ile doğrulanan sayısı; kutucuk adında "QR ile doğrulandı"', async () => {
    const rooms = withSpots({ 'M1-101': { status: 'cleaned', at: nowSql(), by: 'Ayşe', verified_by_qr: true } })
    renderWithProviders(<RoomsBoardTab avsApi={makeApi({ rooms })} onReportFault={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: /^M1\b/ }))
    expect(await screen.findByRole('button', { name: /^101, temizlendi, QR ile doğrulandı/ })).toBeInTheDocument()
    expect(screen.getByText(/· 1 QR/)).toBeInTheDocument()
  })

  it('okutma hatası bildirimle söylenir', async () => {
    const scanError = { response: { status: 404, data: { error: 'Bu QR sistemde tanımlı değil', code: 'qr_unknown' } } }
    renderWithProviders(
      <RoomsBoardTab avsApi={makeApi({ scanError })} onReportFault={() => {}} pendingScan={{ qr: QR, via: 'camera' }} onPendingScanDone={() => {}} />,
    )
    expect(await screen.findByText('Bu QR sistemde tanımlı değil')).toBeInTheDocument()
  })
})
