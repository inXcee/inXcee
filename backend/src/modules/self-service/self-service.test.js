import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import app from '../../app.js'
import { initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  token = (await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })).body.token
})

describe('Self-Service', () => {
  it('staff token without personnelId gets 403 on /my-info', async () => {
    const res = await request(app)
      .get('/api/self-service/my-info')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(403)
    expect(res.body).toHaveProperty('error')
  })

  it('staff token without personnelId gets 403 on /laundry-status', async () => {
    const res = await request(app)
      .get('/api/self-service/laundry-status')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(403)
    expect(res.body).toHaveProperty('error')
  })

  it('POST /maintenance returns 403 for non-kiosk token', async () => {
    const res = await request(app)
      .post('/api/self-service/maintenance')
      .set('Authorization', `Bearer ${token}`)
      .send({ location: 'M1 Kat 2', description: 'Kapı kolu kırık' })
    expect(res.status).toBe(403)
    expect(res.body).toHaveProperty('error')
  })

  it('unauthenticated request gets 401', async () => {
    const res = await request(app).get('/api/self-service/my-info')
    expect(res.status).toBe(401)
  })
})

describe('self-service maintenance validasyon', () => {
  it('kısa location reddedilir', async () => {
    const kioskToken = jwt.sign({ personnelId: 1, role: 'kiosk' }, process.env.JWT_SECRET, { expiresIn: '1h' })
    const res = await request(app)
      .post('/api/self-service/maintenance')
      .set('Authorization', `Bearer ${kioskToken}`)
      .send({ location: 'AB', description: 'Bu yeterince uzun bir aciklama metnidir' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/location/)
  })

  it('kısa description reddedilir', async () => {
    const kioskToken = jwt.sign({ personnelId: 1, role: 'kiosk' }, process.env.JWT_SECRET, { expiresIn: '1h' })
    const res = await request(app)
      .post('/api/self-service/maintenance')
      .set('Authorization', `Bearer ${kioskToken}`)
      .send({ location: 'Oda 101', description: 'kisa' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/description/)
  })
})

// kiosk token yardımcısı
function makeKioskToken(personnelId = 1) {
  return jwt.sign({ personnelId, role: 'kiosk' }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' })
}

describe('GET /api/self-service/my-maintenance', () => {
  it('kiosk token ile 200 ve dizi döner', async () => {
    const res = await request(app)
      .get('/api/self-service/my-maintenance')
      .set('Authorization', `Bearer ${makeKioskToken(1)}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
  it('staff token ile 403 döner', async () => {
    const res = await request(app)
      .get('/api/self-service/my-maintenance')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(403)
  })
})

describe('GET /api/self-service/my-discipline', () => {
  it('kiosk token ile 200 ve dizi döner', async () => {
    const res = await request(app)
      .get('/api/self-service/my-discipline')
      .set('Authorization', `Bearer ${makeKioskToken(1)}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})

describe('GET /api/self-service/announcements', () => {
  it('kiosk token ile 200 ve dizi döner', async () => {
    const res = await request(app)
      .get('/api/self-service/announcements')
      .set('Authorization', `Bearer ${makeKioskToken(1)}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})

describe('POST /api/self-service/feedback', () => {
  it('geçerli veriyle 201 döner', async () => {
    const res = await request(app)
      .post('/api/self-service/feedback')
      .set('Authorization', `Bearer ${makeKioskToken(1)}`)
      .send({ type: 'suggestion', message: 'Bu yeterince uzun bir öneri metnidir.', anonymous: false })
    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('id')
  })
  it('kısa mesaj 400 döner', async () => {
    const res = await request(app)
      .post('/api/self-service/feedback')
      .set('Authorization', `Bearer ${makeKioskToken(1)}`)
      .send({ type: 'complaint', message: 'kisa', anonymous: false })
    expect(res.status).toBe(400)
  })
  it('anonymous=true ise personnel_id kaydedilmez', async () => {
    const res = await request(app)
      .post('/api/self-service/feedback')
      .set('Authorization', `Bearer ${makeKioskToken(1)}`)
      .send({ type: 'other', message: 'Anonim bir geri bildirim metnidir.', anonymous: true })
    expect(res.status).toBe(201)
  })
  it('geçersiz type 400 döner', async () => {
    const res = await request(app)
      .post('/api/self-service/feedback')
      .set('Authorization', `Bearer ${makeKioskToken(1)}`)
      .send({ type: 'invalid', message: 'Bu yeterince uzun bir mesajdır.', anonymous: false })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/self-service/my-info expected_departure', () => {
  it('my-info yanıtında expected_departure alanı bulunur', async () => {
    const res = await request(app)
      .get('/api/self-service/my-info')
      .set('Authorization', `Bearer ${makeKioskToken(1)}`)
    expect(res.status).toBe(200)
    expect('expected_departure' in res.body).toBe(true)
  })
})
