import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { addDays, istanbulDate } from '../../shared/time.js'
import { generateMissingQrCodes } from '../location-portal/service.js'
import { markField, setOccupancy } from './field.js'
import { buildSummaryText, eveningSummary } from './evening-summary.js'

// Akşam saha özeti (Hermes zamanlanmış görevi): doluluk, temizlik, çamaşır, sakin şikayeti + dikkat satırları ve
// Telegram'a gidecek hazır metin. Seed odaları kapatılır (paydaya girmez); ES: deneme bloğu 101..106.
let db, today, worker, ids, supervisor, housekeeper
const login = async u => (await request(app).post('/api/auth/login').send({ username: u, password: 'admin123' })).body.token
const locId = key => db.prepare('SELECT id FROM service_locations WHERE qr_location=?').get(key).id
const bag = (no, status, { createdHoursAgo = 1, updatedHoursAgo = 1, urgent = 0 } = {}) => Number(db.prepare(`
  INSERT INTO laundry_items(room_id, status, urgent, tracking_mode, created_at, updated_at)
  VALUES(?, ?, ?, 'count_only', datetime('now', ?), datetime('now', ?))
`).run(ids[no], status, urgent, `-${createdHoursAgo} hours`, `-${updatedHoursAgo} hours`).lastInsertRowid)

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  db = getDB()
  today = istanbulDate()
  db.prepare("UPDATE rooms SET use_state='closed'").run()
  const room = db.prepare(`INSERT INTO rooms(block, floor, room_no, capacity, active_beds, use_state) VALUES('ES', 1, ?, 6, 6, ?)`)
  ids = Object.fromEntries(['101', '102', '103', '104', '105', '106'].map(no => [no, Number(room.run(no, no === '106' ? 'locked' : 'open').lastInsertRowid)]))
  generateMissingQrCodes({}, null)
  worker = Number(db.prepare(`INSERT INTO staff(full_name, is_active) VALUES('Özet Ayşe', 1)`).run().lastInsertRowid)
  supervisor = await login('vardiya')
  housekeeper = await login('meydanci')
})

describe('akşam özeti', () => {
  it('saha bilgisi yokken: doluluk girilmedi, temizlik işareti yok; sıfırlar ayrı söylenir', () => {
    const s = eveningSummary()
    expect(s.occupancy).toMatchObject({ available: true, source: 'live', pct: null, occupied: 0, unknown: 6 })
    expect(s.cleaning).toMatchObject({ cleaned: 0, skipped: 0, expected_rooms: 5, unmarked_rooms: 5 })
    expect(s.text).toContain('henüz dolu/boş bilgisi girilmedi (6 oda bilinmiyor)')
    expect(s.text).toContain('saha işareti yok (beklenen 5 oda)')
    expect(s.alerts.map(a => a.code)).toEqual(expect.arrayContaining(['occupancy_coverage_low', 'cleaning_unmarked']))
  })

  it('dolu oda doluluk oranına, boş oda "beklenmez"e girer; dünkü görüntüyle fark; günün değişiklikleri', () => {
    for (const no of ['101', '102', '103']) setOccupancy(ids[no], 'occupied')
    setOccupancy(ids['104'], 'empty')
    db.prepare(`INSERT INTO room_occupancy_daily(day, block, rooms, closed, occupied, empty, unknown) VALUES(?, 'ES', 6, 0, 1, 1, 4)`)
      .run(addDays(today, -1))
    const o = eveningSummary().occupancy
    expect(o).toMatchObject({ pct: 75, occupied: 3, empty: 1, unknown: 2, prev_pct: 50, change_1d: 25, stale: 0 })
    expect(o.changes).toMatchObject({ total: 4, to_occupied: 3, to_empty: 1, first_entry: 4 })
    expect(o.unknown_blocks).toEqual([{ block: 'ES', unknown: 2 }])
  })

  it('temizlik: temizlendi, temizlenemedi sebebiyle, işaretsiz blok başına, en çok temizleyen', () => {
    markField({ location: 'ES-101', action: 'clean', workerId: worker })
    markField({ location: 'ES-102', action: 'clean', workerId: worker })
    markField({ location: 'ES-103', action: 'skip', reason: 'dnd', note: 'kapıda kart', workerId: worker })
    const c = eveningSummary().cleaning
    // beklenen: 101, 102, 103 (dolu) + 105 (bilinmiyor); 104 boş, 106 kilitli
    expect(c).toMatchObject({ cleaned: 2, skipped: 1, qr_verified: 0, qr_pct: 0, expected_rooms: 4, unmarked_rooms: 1 })
    expect(c.skip_reasons).toEqual([{ reason: 'Rahatsız etmeyin', count: 1 }])
    expect(c.unmarked_blocks).toEqual([{ block: 'ES', count: 1 }])
    expect(c.workers[0]).toMatchObject({ full_name: 'Özet Ayşe', cleaned: 2, skipped: 1 })
  })

  it('çamaşır: bugün alınan/hazırlanan/teslim; bekleyen; 24 saatten uzun hazırda bekleyen dikkat satırı', () => {
    bag('101', 'washing', { urgent: 1 })
    const readyId = bag('102', 'ready')
    db.prepare(`INSERT INTO laundry_history(item_id, from_status, to_status) VALUES(?, 'washing', 'ready')`).run(readyId)
    bag('103', 'delivered')
    bag('105', 'ready', { createdHoursAgo: 80, updatedHoursAgo: 30 })
    db.prepare(`INSERT INTO laundry_pickup_requests(service_location_id, room_id, request_count, created_at) VALUES(?, ?, 1, datetime('now','-14 hours'))`)
      .run(locId('ES-105'), ids['105'])
    const s = eveningSummary()
    expect(s.laundry).toMatchObject({
      readied: 1, delivered: 1, open_bags: 1, urgent_open: 1, ready_bags: 2, ready_late: 1, pickup_requests_open: 1,
    })
    expect(s.laundry.ready_oldest_hours).toBeGreaterThanOrEqual(29)
    expect(s.alerts.map(a => a.code)).toEqual(expect.arrayContaining(['laundry_ready_late', 'pickup_waiting']))
    expect(s.text).toMatch(/Şu an bekleyen: yıkamada 1 \(1 acil\) · hazırda 2 · alma talebi 1/)
  })

  it('sakin şikayeti: günün onay/şikayet sayısı, takip temizliği yapılmamış şikayet dikkat satırına düşer', () => {
    const first = db.prepare(`SELECT id FROM cleaning_tasks WHERE qr_location='ES-101'`).get().id
    const followup = Number(db.prepare(`
      INSERT INTO cleaning_tasks(area, block, floor, task_type, scheduled_at, qr_location) VALUES('ES Oda 101', 'ES', 1, 'room', ?, 'ES-101')
    `).run(`${today} 12:00:00`).lastInsertRowid)
    db.prepare(`
      INSERT INTO cleaning_task_reviews(task_id, location_id, identity_mode, outcome, rating, comment, followup_task_id)
      VALUES(?, ?, 'anonymous', 'issue', 2, 'Çöp alınmamış', ?)
    `).run(first, locId('ES-101'), followup)
    const s = eveningSummary()
    expect(s.complaints).toMatchObject({ issues: 1, approved: 0, avg_rating: 2, open_followups: 1 })
    expect(s.alerts.find(a => a.code === 'complaint_open').text).toContain('1 sakin şikayetinin')
    // Takip görevi geçerli görev olur: oda yeniden işaretsiz sayılır
    expect(s.cleaning.unmarked_rooms).toBe(2)
  })

  it('metin: başlık İstanbul tarihiyle, bölümler ve dikkat listesi', () => {
    const text = eveningSummary().text
    const [y, m, d] = today.split('-')
    expect(text.split('\n')[0]).toBe(`🌙 Akşam saha özeti — ${d}.${m}.${y}`)
    expect(text).toContain('🏠 Doluluk %75 (düne göre +25 puan) — 3 dolu · 1 boş · 2 bilinmiyor')
    expect(text).toContain('🧹 Temizlik: 2 yer temizlendi, 1 temizlenemedi · QR ile %0')
    expect(text).toContain('Temizlenemedi: Rahatsız etmeyin 1')
    expect(text).toContain('💬 Sakin: 0 onay, 1 şikayet (ort. 2★)')
    expect(text).toContain('⚠️ Dikkat:')
  })

  it('dikkat yoksa bunu söyler', () => {
    const quiet = {
      date: '2026-10-25',
      occupancy: { available: true, pct: 80, change_1d: null, occupied: 8, empty: 2, unknown: 0, changes: { total: 0 }, unknown_blocks: [] },
      cleaning: { cleaned: 5, skipped: 0, qr_pct: null, skip_reasons: [], unmarked_rooms: 0, unmarked_blocks: [], workers: [], expected_rooms: 5 },
      laundry: { opened: 0, readied: 0, delivered: 0, open_bags: 0, urgent_open: 0, ready_bags: 0, pickup_requests_open: 0 },
      complaints: { issues: 0, approved: 0, avg_rating: null },
      alerts: [],
    }
    expect(buildSummaryText(quiet)).toContain('✅ Dikkat gerektiren bir şey yok.')
  })

  it('geçmiş gün: doluluk görüntüden, görüntü yoksa "kayıt yok"; gelecek gün ve bozuk tarih reddedilir', () => {
    const past = eveningSummary({ date: addDays(today, -1) })
    expect(past.occupancy).toMatchObject({ source: 'snapshot', pct: 50, stale: null })
    const old = eveningSummary({ date: addDays(today, -30) })
    expect(old.occupancy).toEqual({ available: false, day: addDays(today, -30), source: null })
    expect(old.text).toContain('🏠 Doluluk: bu gün için kayıt yok.')
    expect(() => eveningSummary({ date: addDays(today, 1) })).toThrow(/Gelecek/)
    expect(() => eveningSummary({ date: '25.10.2026' })).toThrow(/YYYY-MM-DD/)
  })
})

describe('uçlar', () => {
  it('özet JSON ve ?format=text düz metin; amir/müdür, temizlikçi 403; bozuk tarih 400', async () => {
    const json = await request(app).get('/api/housekeeping/evening-summary').set('Authorization', `Bearer ${supervisor}`)
    expect(json.status).toBe(200)
    expect(json.body).toMatchObject({ date: today, occupancy: { pct: 75 } })
    const text = await request(app).get('/api/housekeeping/evening-summary?format=text').set('Authorization', `Bearer ${supervisor}`)
    expect(text.headers['content-type']).toMatch(/text\/plain/)
    expect(text.text.startsWith('🌙 Akşam saha özeti')).toBe(true)
    expect((await request(app).get('/api/housekeeping/evening-summary').set('Authorization', `Bearer ${housekeeper}`)).status).toBe(403)
    expect((await request(app).get('/api/housekeeping/evening-summary?date=bozuk').set('Authorization', `Bearer ${supervisor}`)).status).toBe(400)
  })

  it('doluluk trendi ucu: blok süzgeci ve gün sayısı', async () => {
    const res = await request(app).get('/api/housekeeping/occupancy/trend?days=7&block=ES').set('Authorization', `Bearer ${supervisor}`)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ days: 7, block: 'ES', summary: { pct: 75, days_with_data: 2 } })
    expect(res.body.series).toHaveLength(7)
    expect((await request(app).get('/api/housekeeping/occupancy/trend').set('Authorization', `Bearer ${housekeeper}`)).status).toBe(403)
  })
})
