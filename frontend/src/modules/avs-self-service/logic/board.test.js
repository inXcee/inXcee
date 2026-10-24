import { describe, expect, it } from 'vitest'
import { SCAN_WINDOW_MS, floorProgress, scanFresh, spotTime, spotTone } from './board.js'

// Saha ekranı oda panosu: kutucuk tonu, kat ilerlemesi (kapalılar sayılmaz) ve sunucu UTC saatinin yerel gösterimi.
describe('spotTone', () => {
  it.each([
    [{ use_state: 'open', status: null }, 'idle'],
    [{ use_state: 'open', status: 'cleaned' }, 'cleaned'],
    [{ use_state: 'locked', status: 'skipped' }, 'skipped'],
    [{ use_state: 'closed', status: 'cleaned' }, 'closed'],
    [{ code: 'toilet', status: 'cleaned' }, 'cleaned'],
    [{ code: 'stairs', status: null }, 'idle'],
    [{ use_state: 'open', status: null, complaint: { open: true } }, 'complaint'],
    [{ use_state: 'open', status: 'skipped', complaint: { open: true } }, 'complaint'],
    [{ use_state: 'closed', status: null, complaint: { open: true } }, 'closed'],
    [{ use_state: 'open', status: 'cleaned', complaint: { open: false } }, 'cleaned'],
  ])('%j → %s', (spot, tone) => {
    expect(spotTone(spot)).toBe(tone)
  })
})

describe('floorProgress', () => {
  it('kapalı odalar sayılmaz; ortak alanlar oda sayısına girmez; doluluk yalnız açık odalarda sayılır', () => {
    const floor = {
      floor: 1,
      common_areas: [{ code: 'toilet', status: 'cleaned' }],
      rooms: [
        { use_state: 'open', status: 'cleaned', occupancy: 'occupied', verified_by_qr: true },
        { use_state: 'open', status: 'skipped', occupancy: 'empty' },
        { use_state: 'open', status: null, occupancy: 'occupied' },
        { use_state: 'closed', status: 'cleaned', occupancy: 'occupied' },
        { use_state: 'locked', status: null, occupancy: null },
      ],
    }
    expect(floorProgress(floor)).toEqual({ total: 4, cleaned: 1, skipped: 1, occupied: 2, empty: 1, qr: 1 })
  })

  it('boş kat sıfır döner', () => {
    expect(floorProgress({ floor: 2, common_areas: [], rooms: [] })).toEqual({ total: 0, cleaned: 0, skipped: 0, occupied: 0, empty: 0, qr: 0 })
  })
})

describe('spotTime', () => {
  const now = new Date(2026, 9, 24, 12, 0)
  it('bugünse yalnız yerel saat, değilse gün.ay + saat (sunucu damgası UTC)', () => {
    expect(spotTime('2026-10-24 06:15:00', now)).toBe('09:15')
    expect(spotTime('2026-10-23 11:30:00', now)).toBe('23.10 14:30')
    expect(spotTime(null, now)).toBeNull()
  })
})

// Kapıdaki QR okutması 60 dk ve yalnız okutulan yer için geçerli (sunucu da aynı pencereyi uygular)
describe('scanFresh', () => {
  const scan = { location: 'M1-101', at: '2026-10-24 10:00:00' }
  const base = Date.parse('2026-10-24T10:00:00Z')
  it('aynı yer 59 dk geçerli, 61 dk değil; başka yer ve okutmasız geçersiz', () => {
    expect(SCAN_WINDOW_MS).toBe(3600000)
    expect(scanFresh(scan, 'M1-101', base + 59 * 60000)).toBe(true)
    expect(scanFresh(scan, 'M1-101', base + 61 * 60000)).toBe(false)
    expect(scanFresh(scan, 'M1-102', base + 60000)).toBe(false)
    expect(scanFresh(null, 'M1-101', base)).toBe(false)
  })
})
