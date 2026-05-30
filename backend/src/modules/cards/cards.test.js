import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token, viewToken, staffId
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  token = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  viewToken = (await request(app).post('/api/auth/login').send({ username: 'camasir', password: 'admin123' })).body.token
  const db = getDB()
  let s = db.prepare('SELECT id FROM staff LIMIT 1').get()
  if (!s) {
    db.prepare('INSERT INTO staff(full_name, is_active) VALUES(?,1)').run('Kart Test')
    s = db.prepare('SELECT id FROM staff WHERE full_name=?').get('Kart Test')
  }
  staffId = s.id
})

const auth = (t) => ({ Authorization: `Bearer ${t}` })

describe('cards — kart üretimi (amaç bazında ayrı)', () => {
  it('giriş kartı üretir (AVS-A: prefix)', async () => {
    const r = await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(token)).send({ card_type: 'access' })
    expect(r.status).toBe(201)
    expect(r.body.card_type).toBe('access')
    expect(r.body.code).toMatch(/^AVS-A:/)
    expect(r.body.status).toBe('active')
  })

  it('yemek kartı ayrı üretir (AVS-M: prefix)', async () => {
    const r = await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(token)).send({ card_type: 'meal' })
    expect(r.status).toBe(201)
    expect(r.body.card_type).toBe('meal')
    expect(r.body.code).toMatch(/^AVS-M:/)
  })

  it('aynı tip tekrar istenince mevcut aktif kartı döner (idempotent)', async () => {
    const r1 = await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(token)).send({ card_type: 'access' })
    const r2 = await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(token)).send({ card_type: 'access' })
    expect(r2.body.code).toBe(r1.body.code)
  })

  it('regenerate eskiyi iptal eder, yeni kod üretir', async () => {
    const r1 = await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(token)).send({ card_type: 'access' })
    const r2 = await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(token)).send({ card_type: 'access', regenerate: true })
    expect(r2.body.code).not.toBe(r1.body.code)
    expect(r2.status).toBe(201)
    // eski kart revoked olmalı
    const db = getDB()
    const old = db.prepare('SELECT status FROM cards WHERE code=?').get(r1.body.code)
    expect(old.status).toBe('revoked')
  })

  it('geçersiz card_type 400', async () => {
    const r = await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(token)).send({ card_type: 'xyz' })
    expect(r.status).toBe(400)
  })

  it('GET kişinin kartlarını listeler (access + meal)', async () => {
    await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(token)).send({ card_type: 'access' })
    await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(token)).send({ card_type: 'meal' })
    const r = await request(app).get(`/api/cards/staff/${staffId}`).set(auth(token))
    expect(r.status).toBe(200)
    const types = r.body.filter(c => c.status === 'active').map(c => c.card_type)
    expect(types).toContain('access')
    expect(types).toContain('meal')
  })

  it('revoke sonrası aynı tip yeniden üretilebilir', async () => {
    const issued = await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(token)).send({ card_type: 'meal', regenerate: true })
    const rev = await request(app).patch(`/api/cards/${issued.body.id}/revoke`).set(auth(token)).send({})
    expect(rev.status).toBe(200)
    const fresh = await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(token)).send({ card_type: 'meal' })
    expect(fresh.status).toBe(201)
    expect(fresh.body.code).not.toBe(issued.body.code)
  })

  it('bulk-issue eksik kartları doldurur, ikinci çağrı 0', async () => {
    const db = getDB()
    db.prepare("DELETE FROM cards WHERE card_type='access'").run()
    const r1 = await request(app).post('/api/cards/bulk-issue').set(auth(token)).send({ card_type: 'access' })
    expect(r1.status).toBe(200)
    expect(r1.body.generated).toBeGreaterThanOrEqual(1)
    const r2 = await request(app).post('/api/cards/bulk-issue').set(auth(token)).send({ card_type: 'access' })
    expect(r2.body.generated).toBe(0)
  })

  it('karta özel PDF döner', async () => {
    const issued = await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(token)).send({ card_type: 'access' })
    const r = await request(app).get(`/api/cards/${issued.body.id}/pdf`).set(auth(token))
    expect(r.status).toBe(200)
    expect(r.headers['content-type']).toMatch(/pdf/)
    expect(r.body.length).toBeGreaterThan(500)
  })
})

describe('cards — yetki', () => {
  it('mgr olmayan kart üretemez (403)', async () => {
    const r = await request(app).post(`/api/cards/staff/${staffId}/issue`).set(auth(viewToken)).send({ card_type: 'access' })
    expect(r.status).toBe(403)
  })
  it('view rolü kartları görebilir (200)', async () => {
    const r = await request(app).get(`/api/cards/staff/${staffId}`).set(auth(viewToken))
    expect(r.status).toBe(200)
  })
})
