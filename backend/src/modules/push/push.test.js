import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  token = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
})

describe('POST /api/push/subscribe', () => {
  const validSub = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
    keys: { p256dh: 'BN...', auth: 'XYZ...' },
  }

  it('valid subscription kaydeder (201)', async () => {
    const res = await request(app)
      .post('/api/push/subscribe')
      .set('Authorization', `Bearer ${token}`)
      .send(validSub)
    expect(res.status).toBe(201)
    const db = getDB()
    const row = db.prepare('SELECT * FROM push_subscriptions WHERE endpoint=?').get(validSub.endpoint)
    expect(row).toBeTruthy()
    expect(row.p256dh_key).toBe('BN...')
  })

  it('ayni endpoint ikinci kayitta UPDATE eder (UNIQUE conflict)', async () => {
    const res = await request(app)
      .post('/api/push/subscribe')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validSub, keys: { p256dh: 'NEW', auth: 'NEW2' } })
    expect(res.status).toBe(201)
    const db = getDB()
    const rows = db.prepare('SELECT * FROM push_subscriptions WHERE endpoint=?').all(validSub.endpoint)
    expect(rows.length).toBe(1)
    expect(rows[0].p256dh_key).toBe('NEW')
  })

  it('eksik keys ile 400 doner', async () => {
    const res = await request(app)
      .post('/api/push/subscribe')
      .set('Authorization', `Bearer ${token}`)
      .send({ endpoint: 'foo' })
    expect(res.status).toBe(400)
  })

  it('auth gerektirir (401)', async () => {
    const res = await request(app).post('/api/push/subscribe').send(validSub)
    expect(res.status).toBe(401)
  })
})

describe('POST /api/push/unsubscribe', () => {
  it('subscription siler', async () => {
    const db = getDB()
    db.prepare(`INSERT INTO push_subscriptions(user_id,endpoint,p256dh_key,auth_key)
      VALUES(?,?,?,?)`).run(1, 'https://test/unsub', 'A', 'B')
    const res = await request(app)
      .post('/api/push/unsubscribe')
      .set('Authorization', `Bearer ${token}`)
      .send({ endpoint: 'https://test/unsub' })
    expect(res.status).toBe(200)
    const row = db.prepare('SELECT * FROM push_subscriptions WHERE endpoint=?').get('https://test/unsub')
    expect(row).toBeFalsy()
  })
})

describe('GET /api/push/vapid-public-key', () => {
  it('VAPID konfigure degilse 503 doner', async () => {
    delete process.env.VAPID_PUBLIC_KEY
    const res = await request(app).get('/api/push/vapid-public-key')
    expect(res.status).toBe(503)
  })
})
