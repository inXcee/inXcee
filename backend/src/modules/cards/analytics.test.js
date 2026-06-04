import { describe, it, expect, beforeAll } from 'vitest'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { summary, usageByDay, usageByResult, topStations } from './analytics.js'

let db, s1, s2, stA, stB

const dayOffset = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 19).replace('T', ' ')

beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  db = getDB()

  // Deterministik kart/hareket verisi
  db.prepare('DELETE FROM access_events').run()
  db.prepare('DELETE FROM cards').run()

  const actives = db.prepare('SELECT id FROM staff WHERE is_active=1 ORDER BY id LIMIT 2').all()
  s1 = actives[0].id; s2 = actives[1].id

  const ins = db.prepare("INSERT INTO cards(holder_type, holder_id, card_type, code, nfc_uid, status) VALUES('staff',?,?,?,?,?)")
  ins.run(s1, 'access', 'AVS-A:c1', '041A2B', 'active')   // aktif + nfc bağlı
  ins.run(s2, 'access', 'AVS-A:c2', null, 'active')        // aktif, nfc yok
  ins.run(s1, 'access', 'AVS-A:c3', null, 'lost')          // kayıp
  ins.run(s1, 'meal',   'AVS-M:m1', null, 'active')        // meal aktif

  stA = db.prepare("INSERT INTO scan_stations(name, station_type, api_key_hash) VALUES('Ana Giriş','entry','x')").run().lastInsertRowid
  stB = db.prepare("INSERT INTO scan_stations(name, station_type, api_key_hash) VALUES('Yemekhane','cafeteria','x')").run().lastInsertRowid

  const ev = db.prepare("INSERT INTO access_events(holder_type, holder_id, station_id, event_type, result, scanned_at) VALUES('staff',?,?,?,?,?)")
  ev.run(s1, stA, 'entry', 'ok', dayOffset(0))
  ev.run(s2, stA, 'entry', 'ok', dayOffset(0))
  ev.run(s1, stA, 'entry', 'denied', dayOffset(-1))
  ev.run(s2, stB, 'meal', 'ok', dayOffset(0))
})

describe('cards/analytics summary', () => {
  it('counts active/lost and nfc_bound per card_type', () => {
    const rows = summary(db)
    const access = rows.find(r => r.card_type === 'access')
    expect(access.active).toBe(2)
    expect(access.lost).toBe(1)
    expect(access.nfc_bound).toBe(1) // sadece s1 access
    const meal = rows.find(r => r.card_type === 'meal')
    expect(meal.active).toBe(1)
  })

  it('computes coverage_pct against active staff', () => {
    const totalActive = db.prepare('SELECT COUNT(*) c FROM staff WHERE is_active=1').get().c
    const access = summary(db).find(r => r.card_type === 'access')
    // s1 + s2 aktif access kartı var → 2 / totalActive
    expect(access.coverage_pct).toBe(Math.round((2 / totalActive) * 100))
  })
})

describe('cards/analytics usageByDay', () => {
  it('returns a continuous day series of the requested length', () => {
    const rows = usageByDay(db, 14)
    expect(rows).toHaveLength(14)
    const today = new Date().toISOString().slice(0, 10)
    const t = rows.find(r => r.day === today)
    expect(t.total).toBe(3) // bugün 3 olay
    expect(t.ok).toBe(3)
  })
})

describe('cards/analytics usageByResult', () => {
  it('breaks down by result', () => {
    const rows = usageByResult(db, 30)
    const ok = rows.find(r => r.result === 'ok')
    const denied = rows.find(r => r.result === 'denied')
    expect(ok.count).toBe(3)
    expect(denied.count).toBe(1)
  })
})

describe('cards/analytics topStations', () => {
  it('ranks stations by scan count', () => {
    const rows = topStations(db, 30)
    expect(rows[0].station_id).toBe(stA) // 3 okutma
    expect(rows[0].count).toBe(3)
    expect(rows.find(r => r.station_id === stB).count).toBe(1)
  })
})
