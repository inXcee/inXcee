import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { listRecentRooms, rememberRoom, MAX_RECENT } from './recentRooms.js'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('recentRooms', () => {
  it('son kullanılan oda başa gelir', () => {
    rememberRoom({ block: 'M1', room_no: '101' })
    rememberRoom({ block: 'S2', room_no: '204' })
    expect(listRecentRooms()).toEqual([
      { block: 'S2', room_no: '204' },
      { block: 'M1', room_no: '101' },
    ])
  })

  it('aynı oda tekrar seçilince çoğalmaz, başa taşınır', () => {
    rememberRoom({ block: 'M1', room_no: '101' })
    rememberRoom({ block: 'S2', room_no: '204' })
    rememberRoom({ block: 'M1', room_no: '101' })
    expect(listRecentRooms()).toEqual([
      { block: 'M1', room_no: '101' },
      { block: 'S2', room_no: '204' },
    ])
  })

  it(`en fazla ${MAX_RECENT} oda tutulur`, () => {
    for (let i = 0; i < MAX_RECENT + 3; i++) rememberRoom({ block: 'M1', room_no: String(100 + i) })
    const rooms = listRecentRooms()
    expect(rooms).toHaveLength(MAX_RECENT)
    expect(rooms[0].room_no).toBe(String(100 + MAX_RECENT + 2)) // en son seçilen
  })

  it('eksik alan kaydedilmez', () => {
    rememberRoom({ block: 'M1' })
    rememberRoom({ room_no: '101' })
    expect(listRecentRooms()).toEqual([])
  })

  it('bozuk localStorage boş liste döner', () => {
    localStorage.setItem('kiosk-recent-rooms', 'bozuk{json')
    expect(listRecentRooms()).toEqual([])
  })

  it('kota hatası akışı kesmez', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota') })
    expect(() => rememberRoom({ block: 'M1', room_no: '101' })).not.toThrow()
  })
})
