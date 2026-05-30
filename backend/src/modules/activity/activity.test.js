import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { getStaffActivity } from './service.js'

let token, viewToken, staffId, entryKey
const auth = (t) => ({ Authorization: `Bearer ${t}` })

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  token = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  viewToken = (await request(app).post('/api/auth/login').send({ username: 'camasir', password: 'admin123' })).body.token
  const db = getDB()
  staffId = db.prepare('SELECT id FROM staff LIMIT 1').get().id

  // Fiziksel okutma üret: access kartı + NFC + giriş istasyonu okutması
  const card = await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(token)).send({ card_type: 'access', regenerate: true })
  await request(app).patch(`/api/cards/${card.body.id}/bind-nfc`).set(auth(token)).send({ nfc_uid: 'NFC-ACT-1' })
  entryKey = (await request(app).post('/api/stations').set(auth(token)).send({ name: 'Akt Giriş', station_type: 'entry' })).body.api_key
  await request(app).post('/api/stations/scan').set('X-Station-Key', entryKey).send({ raw_uid: 'NFC-ACT-1' })

  // Yemek kaydı + KKD zimmet — doğrudan DB (servisleri kısa devre)
  db.prepare("INSERT INTO meal_logs(staff_id, meal_type, meal_date, method) VALUES(?,?,date('now'),'manual')").run(staffId, 'lunch')
  db.prepare("INSERT INTO kkd_assignments(staff_id, item_type, size) VALUES(?,?,?)").run(staffId, 'Baret', 'L')
})

describe('activity — birleşik hareket geçmişi', () => {
  it('servis kaynakları birleştirir, kronolojik (yeni→eski) sıralar', () => {
    const items = getStaffActivity(getDB(), staffId, {})
    expect(items.length).toBeGreaterThanOrEqual(3)
    const kinds = new Set(items.map(i => i.kind))
    expect(kinds.has('access')).toBe(true)
    expect(kinds.has('meal')).toBe(true)
    expect(kinds.has('equipment')).toBe(true)
    // sıralı: her ts bir öncekinden küçük/eşit
    for (let i = 1; i < items.length; i++) expect(items[i].ts <= items[i - 1].ts).toBe(true)
  })

  it('types filtresi yalnız istenen kind döner', () => {
    const items = getStaffActivity(getDB(), staffId, { types: ['meal'] })
    expect(items.length).toBeGreaterThan(0)
    expect(items.every(i => i.kind === 'meal')).toBe(true)
  })

  it('GET /api/activity/staff/:id mgr için 200 + staff bilgisi', async () => {
    const r = await request(app).get(`/api/activity/staff/${staffId}`).set(auth(token))
    expect(r.status).toBe(200)
    expect(r.body.staff.id).toBe(staffId)
    expect(Array.isArray(r.body.items)).toBe(true)
    expect(r.body.items.length).toBeGreaterThan(0)
  })

  it('access okutması foto/istasyon alanlarıyla normalize edilir', async () => {
    const r = await request(app).get(`/api/activity/staff/${staffId}?types=access`).set(auth(token))
    const ev = r.body.items.find(i => i.kind === 'access')
    expect(ev).toBeTruthy()
    expect(ev.title).toContain('Giriş')
    expect(ev).toHaveProperty('station')
  })

  it('olmayan personel 404', async () => {
    const r = await request(app).get('/api/activity/staff/99999').set(auth(token))
    expect(r.status).toBe(404)
  })

  it('yetkisiz rol (camasir/laundry) 403', async () => {
    const r = await request(app).get(`/api/activity/staff/${staffId}`).set(auth(viewToken))
    expect(r.status).toBe(403)
  })
})
