// Çamaşır mantık taraması (Eki 2026): CSV ortak güvenli yardımcı + İstanbul "bugün" sayımları.
import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { istanbulDayBoundsUtc } from '../../shared/time.js'
import { getStatsQuery, getLaundrySummaryQuery, getAllRoomsLaundryOverviewQuery } from './queries.js'

let token, db, roomId, userId
const auth = () => ({ Authorization: `Bearer ${token}` })

// İstanbul bugünü 00:30 (UTC'de bir önceki gün 21:30) — UTC gün karşılaştırması bunu dünde sayar.
function earlyTodayUtc() {
  const start = istanbulDayBoundsUtc().from
  const d = new Date(start.replace(' ', 'T') + 'Z')
  d.setUTCMinutes(d.getUTCMinutes() + 30)
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

function insertItem({ status = 'dirty', notes = null, at = null } = {}) {
  const ts = at || db.prepare("SELECT datetime('now') t").get().t
  return db.prepare(`INSERT INTO laundry_items(room_id, status, item_count, notes, created_by, created_at, updated_at)
    VALUES(?, ?, 1, ?, ?, ?, ?)`).run(roomId, status, notes, userId, ts, ts).lastInsertRowid
}

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  db = getDB()
  const r = await request(app).post('/api/auth/login').send({ username: 'camasir', password: 'admin123' })
  token = r.body.token
  userId = db.prepare("SELECT id FROM users WHERE username='camasir'").get().id
  roomId = db.prepare('SELECT id FROM rooms LIMIT 1').get().id
})

describe('Çamaşır CSV dışa aktarımları', () => {
  it('kayıt CSV notu formül olarak çalışmaz, tırnak kaçar', async () => {
    insertItem({ notes: '=HYPERLINK("http://x")' })
    const res = await request(app).get('/api/laundry/reports/export').set(auth())
    expect(res.status).toBe(200)
    expect(res.text).toContain(`"'=HYPERLINK(""http://x"")"`)
  })

  it('premium CSV marka alanı formül olarak çalışmaz', async () => {
    const itemId = insertItem()
    db.prepare(`INSERT INTO premium_garments(item_id, garment_code, garment_type, brand)
      VALUES(?, 'TR-01', 'Gömlek', '=cmd|x, y')`).run(itemId)
    const res = await request(app).get('/api/laundry/reports/export-premium').set(auth())
    expect(res.status).toBe(200)
    expect(res.text).toContain(`'=cmd|x, y`)
  })
})

describe('Çamaşır "bugün" sayımları İstanbul günüdür', () => {
  it('İstanbul 00:30 teslimi bugünün teslim sayısına girer', () => {
    const before = getStatsQuery().delivered_today.count
    const itemId = insertItem({ status: 'delivered' })
    db.prepare(`INSERT INTO laundry_deliveries(item_id, delivered_to, delivered_by, delivered_at)
      VALUES(?, 'Tarama', ?, ?)`).run(itemId, userId, earlyTodayUtc())
    expect(getStatsQuery().delivered_today.count).toBe(before + 1)
  })

  it('özet kartı bugün teslim sayısı İstanbul gününe göre', () => {
    const before = getLaundrySummaryQuery().delivered_today
    insertItem({ status: 'delivered', at: earlyTodayUtc() })
    expect(getLaundrySummaryQuery().delivered_today).toBe(before + 1)
  })

  it('haftalık trend kaydı İstanbul gününe yazar', () => {
    const day = istanbulDayBoundsUtc().day
    const todayCount = () => getStatsQuery().weekly_trend.find(t => t.day === day)?.received || 0
    const before = todayCount()
    insertItem({ at: earlyTodayUtc() })
    expect(todayCount()).toBe(before + 1)
  })

  it('oda özeti bugün sayısı İstanbul gece yarısından başlar', () => {
    const row = () => getAllRoomsLaundryOverviewQuery().find(r => r.room_id === roomId)
    const before = row().today_count
    insertItem({ at: earlyTodayUtc() })
    expect(row().today_count).toBe(before + 1)
  })
})
