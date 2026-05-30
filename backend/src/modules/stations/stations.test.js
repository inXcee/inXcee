import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token, viewToken, staffId, entryKey, cafeKey
let accessUid = 'NFC-ACCESS-001'
let mealUid = 'NFC-MEAL-001'

const auth = (t) => ({ Authorization: `Bearer ${t}` })

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  token = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  viewToken = (await request(app).post('/api/auth/login').send({ username: 'camasir', password: 'admin123' })).body.token
  const db = getDB()
  let s = db.prepare('SELECT id FROM staff LIMIT 1').get()
  if (!s) { db.prepare('INSERT INTO staff(full_name, is_active) VALUES(?,1)').run('İstasyon Test'); s = db.prepare('SELECT id FROM staff WHERE full_name=?').get('İstasyon Test') }
  staffId = s.id

  // Giriş + yemek kartı üret, NFC UID bağla
  const access = await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(token)).send({ card_type: 'access', regenerate: true })
  await request(app).patch(`/api/cards/${access.body.id}/bind-nfc`).set(auth(token)).send({ nfc_uid: accessUid })
  const meal = await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(token)).send({ card_type: 'meal', regenerate: true })
  await request(app).patch(`/api/cards/${meal.body.id}/bind-nfc`).set(auth(token)).send({ nfc_uid: mealUid })

  // İstasyonlar
  entryKey = (await request(app).post('/api/stations').set(auth(token)).send({ name: 'Ana Giriş', station_type: 'entry' })).body.api_key
  cafeKey  = (await request(app).post('/api/stations').set(auth(token)).send({ name: 'Yemekhane', station_type: 'cafeteria' })).body.api_key
})

describe('stations — CRUD & yetki', () => {
  it('create raw key bir kez döner, liste hash sızdırmaz', async () => {
    const r = await request(app).post('/api/stations').set(auth(token)).send({ name: 'Çıkış', station_type: 'exit' })
    expect(r.status).toBe(201)
    expect(r.body.api_key).toMatch(/^ST-/)
    const list = await request(app).get('/api/stations').set(auth(token))
    expect(list.status).toBe(200)
    expect(list.body.every(s => !('api_key_hash' in s) && !('api_key' in s))).toBe(true)
  })

  it('geçersiz tip 400', async () => {
    const r = await request(app).post('/api/stations').set(auth(token)).send({ name: 'X', station_type: 'foo' })
    expect(r.status).toBe(400)
  })

  it('mgr olmayan istasyon oluşturamaz (403)', async () => {
    const r = await request(app).post('/api/stations').set(auth(viewToken)).send({ name: 'Y', station_type: 'entry' })
    expect(r.status).toBe(403)
  })

  it('/me istasyon kendi kimliğini key ile döner', async () => {
    const r = await request(app).get('/api/stations/me').set('X-Station-Key', entryKey)
    expect(r.status).toBe(200)
    expect(r.body.station_type).toBe('entry')
    expect(r.body).not.toHaveProperty('api_key_hash')
  })

  it('rotate-key eski anahtarı geçersiz kılar', async () => {
    const created = await request(app).post('/api/stations').set(auth(token)).send({ name: 'Rot', station_type: 'entry' })
    const oldKey = created.body.api_key
    const rot = await request(app).post(`/api/stations/${created.body.id}/rotate-key`).set(auth(token))
    expect(rot.body.api_key).toMatch(/^ST-/)
    expect(rot.body.api_key).not.toBe(oldKey)
    // eski anahtarla okutma artık reddedilir
    const scan = await request(app).post('/api/stations/scan').set('X-Station-Key', oldKey).send({ raw_uid: accessUid })
    expect(scan.status).toBe(401)
  })
})

describe('stations — okutma (scan)', () => {
  it('anahtarsız okutma 401', async () => {
    const r = await request(app).post('/api/stations/scan').send({ raw_uid: accessUid })
    expect(r.status).toBe(401)
  })

  it('giriş istasyonunda access kartı OK + sahip bilgisi', async () => {
    const r = await request(app).post('/api/stations/scan').set('X-Station-Key', entryKey).send({ raw_uid: accessUid })
    expect(r.status).toBe(200)
    expect(r.body.result).toBe('ok')
    expect(r.body.event_type).toBe('entry')
    expect(r.body.holder.full_name).toBeTruthy()
  })

  it('tanımsız UID → unknown_card + event loglanır', async () => {
    const r = await request(app).post('/api/stations/scan').set('X-Station-Key', entryKey).send({ raw_uid: 'YOK-123' })
    expect(r.body.result).toBe('unknown_card')
    const ev = getDB().prepare("SELECT * FROM access_events WHERE raw_uid='YOK-123'").get()
    expect(ev.result).toBe('unknown_card')
  })

  it('yemekhanede access kartı → not_eligible', async () => {
    const r = await request(app).post('/api/stations/scan').set('X-Station-Key', cafeKey).send({ raw_uid: accessUid })
    expect(r.body.result).toBe('not_eligible')
  })

  it('yemekhanede yemek kartı OK (event_type=meal)', async () => {
    const r = await request(app).post('/api/stations/scan').set('X-Station-Key', cafeKey).send({ raw_uid: mealUid, meal_type: 'lunch' })
    expect(r.body.result).toBe('ok')
    expect(r.body.event_type).toBe('meal')
    expect(r.body.meal_type).toBe('lunch')
  })

  it('iptal kart → denied', async () => {
    const c = await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(token)).send({ card_type: 'access', regenerate: true })
    await request(app).patch(`/api/cards/${c.body.id}/bind-nfc`).set(auth(token)).send({ nfc_uid: 'NFC-REVOKED' })
    await request(app).patch(`/api/cards/${c.body.id}/revoke`).set(auth(token))
    const r = await request(app).post('/api/stations/scan').set('X-Station-Key', entryKey).send({ raw_uid: 'NFC-REVOKED' })
    expect(r.body.result).toBe('denied')
  })

  it('recent-events son hareketleri sahip adıyla döner', async () => {
    const r = await request(app).get('/api/stations/recent-events').set(auth(token))
    expect(r.status).toBe(200)
    expect(r.body.length).toBeGreaterThan(0)
    expect(r.body[0]).toHaveProperty('station_name')
  })
})
