import { describe, expect, it } from 'vitest'
import { floorProgress, spotTime, spotTone } from './board.js'

// Saha ekranı oda panosu: kutucuk tonu, kat ilerlemesi (kapalılar sayılmaz) ve sunucu UTC saatinin yerel gösterimi.
describe('spotTone', () => {
  it.each([
    [{ use_state: 'open', status: null }, 'idle'],
    [{ use_state: 'open', status: 'cleaned' }, 'cleaned'],
    [{ use_state: 'locked', status: 'skipped' }, 'skipped'],
    [{ use_state: 'closed', status: 'cleaned' }, 'closed'],
    [{ code: 'toilet', status: 'cleaned' }, 'cleaned'],
    [{ code: 'stairs', status: null }, 'idle'],
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
        { use_state: 'open', status: 'cleaned', occupancy: 'occupied' },
        { use_state: 'open', status: 'skipped', occupancy: 'empty' },
        { use_state: 'open', status: null, occupancy: 'occupied' },
        { use_state: 'closed', status: 'cleaned', occupancy: 'occupied' },
        { use_state: 'locked', status: null, occupancy: null },
      ],
    }
    expect(floorProgress(floor)).toEqual({ total: 4, cleaned: 1, skipped: 1, occupied: 2, empty: 1 })
  })

  it('boş kat sıfır döner', () => {
    expect(floorProgress({ floor: 2, common_areas: [], rooms: [] })).toEqual({ total: 0, cleaned: 0, skipped: 0, occupied: 0, empty: 0 })
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
