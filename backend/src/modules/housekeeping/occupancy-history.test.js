import { beforeAll, describe, expect, it } from 'vitest'
import { getDB, initDB } from '../../shared/db/index.js'
import { addDays, istanbulDate } from '../../shared/time.js'
import { setOccupancy } from './field.js'
import {
  captureOccupancySnapshot, occupancyChanges, occupancyOnDay, occupancyTrend, staleOccupancy, totalsOf,
} from './occupancy-history.js'

// Doluluk geçmişi: günün durumu blok başına yazılır, bugün canlı okunur, görüntüsü olmayan gün null kalır.
// OH: deneme bloğu — 101..105 (105 kapalı).
let db, today, ids

beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  initDB()
  db = getDB()
  today = istanbulDate()
  const room = db.prepare(`INSERT INTO rooms(block, floor, room_no, capacity, active_beds, use_state) VALUES('OH', 1, ?, 6, 6, ?)`)
  ids = Object.fromEntries(['101', '102', '103', '104', '105'].map(no => [no, Number(room.run(no, no === '105' ? 'closed' : 'open').lastInsertRowid)]))
})

const insertSnapshot = (day, counts) => db.prepare(`
  INSERT OR REPLACE INTO room_occupancy_daily(day, block, rooms, closed, occupied, empty, unknown) VALUES(?, 'OH', 5, 1, ?, ?, ?)
`).run(day, counts.occupied, counts.empty, counts.unknown)

describe('totalsOf', () => {
  it('oran dolu / (dolu + boş); kapsama bilinen / kapalı olmayan', () => {
    expect(totalsOf([{ rooms: 10, closed: 2, occupied: 3, empty: 1, unknown: 4 }])).toMatchObject({ pct: 75, coverage: 50 })
    expect(totalsOf([{ rooms: 2, closed: 0, occupied: 0, empty: 0, unknown: 2 }])).toMatchObject({ pct: null, coverage: 0 })
  })
})

describe('anlık görüntü', () => {
  it('günün satırını şimdiki durumla yazar; kapalı oda paydaya girmez; tekrar çalıştırmak üzerine yazar', () => {
    setOccupancy(ids['101'], 'occupied')
    setOccupancy(ids['102'], 'occupied')
    setOccupancy(ids['103'], 'empty')
    captureOccupancySnapshot({ day: today })
    let row = db.prepare(`SELECT * FROM room_occupancy_daily WHERE day=? AND block='OH'`).get(today)
    expect(row).toMatchObject({ rooms: 5, closed: 1, occupied: 2, empty: 1, unknown: 1 })

    setOccupancy(ids['104'], 'occupied')
    captureOccupancySnapshot({ day: today })
    row = db.prepare(`SELECT * FROM room_occupancy_daily WHERE day=? AND block='OH'`).get(today)
    expect(row).toMatchObject({ occupied: 3, unknown: 0 })
    expect(db.prepare(`SELECT COUNT(*) c FROM room_occupancy_daily WHERE day=? AND block='OH'`).get(today).c).toBe(1)
  })

  it('geçersiz gün reddedilir', () => {
    expect(() => captureOccupancySnapshot({ day: '25.10.2026' })).toThrow(/YYYY-MM-DD/)
  })
})

describe('günün doluluğu', () => {
  it('bugün canlı; geçmiş gün görüntüden; görüntüsüz gün null', () => {
    const live = occupancyOnDay(today, { block: 'OH' })
    expect(live).toMatchObject({ source: 'live', occupied: 3, empty: 1, unknown: 0, pct: 75 })

    insertSnapshot(addDays(today, -1), { occupied: 1, empty: 1, unknown: 2 })
    expect(occupancyOnDay(addDays(today, -1), { block: 'OH' })).toMatchObject({ source: 'snapshot', pct: 50 })
    expect(occupancyOnDay(addDays(today, -40), { block: 'OH' })).toBeNull()
  })
})

describe('trend', () => {
  it('en eski önce, bugün canlı, eksik gün null (sıfır yazılmaz); 7 gün farkı iki uç biliniyorsa', () => {
    insertSnapshot(addDays(today, -7), { occupied: 1, empty: 3, unknown: 0 })
    const trend = occupancyTrend({ days: 10, block: 'OH' })
    expect(trend.series).toHaveLength(10)
    expect(trend.series[0].date).toBe(addDays(today, -9))
    const last = trend.series[9]
    expect(last).toMatchObject({ date: today, live: true, captured: true, pct: 75 })
    const gap = trend.series.find(p => p.date === addDays(today, -3))
    expect(gap).toMatchObject({ captured: false, pct: null, occupied: null })
    expect(trend.summary).toMatchObject({ pct: 75, change_7d: 50, min: 25, max: 75, days_with_data: 3 })
  })

  it('gün sayısı 1..180 ile sınırlı', () => {
    expect(occupancyTrend({ days: 9999 }).series).toHaveLength(180)
    expect(occupancyTrend({ days: 'x' }).days).toBe(30)
  })
})

describe('bayatlık ve değişiklikler', () => {
  it('14 günden eski teyit bayat; bilinmeyen oda bayat sayılmaz', () => {
    db.prepare(`UPDATE rooms SET occupancy_updated_at=datetime('now','-20 days') WHERE id=?`).run(ids['101'])
    const stale = staleOccupancy({ block: 'OH' })
    expect(stale).toMatchObject({ stale_days: 14, total: 1 })
    expect(staleOccupancy({ block: 'OH', staleDays: 30 }).total).toBe(0)
  })

  it('günün değişiklikleri denetim kaydından: ilk giriş, dolu/boş; aynı değer yeniden verilince sayılmaz', () => {
    const before = occupancyChanges(today)
    setOccupancy(ids['103'], 'empty') // aynı değer → denetime düşmez
    setOccupancy(ids['103'], 'occupied')
    setOccupancy(ids['104'], null)
    const after = occupancyChanges(today)
    expect(after.total - before.total).toBe(2)
    expect(after.to_occupied - before.to_occupied).toBe(1)
    expect(after.cleared - before.cleared).toBe(1)
    expect(after.first_entry).toBeGreaterThanOrEqual(4)
  })
})
