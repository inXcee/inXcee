import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
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
  it('staff token ile 403 döner', async () => {
    const res = await request(app)
      .get('/api/self-service/my-discipline')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(403)
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

describe('Laundry Kiosk endpoints', () => {
  let avsToken

  beforeAll(async () => {
    const adminToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
    const w = (await request(app).post('/api/avs-workers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ full_name: 'Kiosk Test Worker' })).body
    await request(app).put(`/api/avs-workers/${w.id}/pin`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ new_pin: '0000' })
    const loginRes = await request(app).post('/api/auth/avs-login').send({ worker_id: w.id, pin: '0000' })
    avsToken = loginRes.body.token
  })

  it('GET /laundry-kiosk/blocks token gerektirmez', async () => {
    const res = await request(app).get('/api/self-service/laundry-kiosk/blocks')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('GET /laundry-kiosk/room-persons AVS token olmadan 401', async () => {
    const res = await request(app).get('/api/self-service/laundry-kiosk/room-persons?block=A&room_no=101')
    expect(res.status).toBe(401)
  })

  it('GET /laundry-kiosk/room-persons AVS token ile çalışır', async () => {
    const res = await request(app)
      .get('/api/self-service/laundry-kiosk/room-persons?block=A&room_no=101')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('GET /laundry-kiosk/bags AVS token ile çalışır', async () => {
    const res = await request(app)
      .get('/api/self-service/laundry-kiosk/bags')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('PUT /laundry-kiosk/bags/:id/status geçersiz durum reddedilir', async () => {
    const res = await request(app)
      .put('/api/self-service/laundry-kiosk/bags/1/status')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ status: 'invalid_status' })
    expect(res.status).toBe(400)
  })

  it('GET /laundry-kiosk/machines AVS token ile çalışır', async () => {
    const res = await request(app)
      .get('/api/self-service/laundry-kiosk/machines')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('Kiosk token (role:kiosk) laundry-kiosk endpoint\'lerine erişemez', async () => {
    const kioskToken = jwt.sign({ personnelId: 1, role: 'kiosk' }, process.env.JWT_SECRET, { expiresIn: '1h' })
    const res = await request(app)
      .get('/api/self-service/laundry-kiosk/machines')
      .set('Authorization', `Bearer ${kioskToken}`)
    expect(res.status).toBe(403)
  })

  it('POST /laundry-kiosk/bags/:id/ironing-complete — ironing olmayan torba 400 döner', async () => {
    const bagRes = await request(app)
      .post('/api/self-service/laundry-kiosk/bag')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ block: 'A', room_no: '101', item_count: 2 })
    expect(bagRes.status).toBe(201)
    const bagId = bagRes.body.id
    // status = dirty, ironing-complete reddedilmeli
    const res = await request(app)
      .post(`/api/self-service/laundry-kiosk/bags/${bagId}/ironing-complete`)
      .set('Authorization', `Bearer ${avsToken}`)
      .send({})
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('POST /laundry-kiosk/bags/:id/deliver — delivered_name ve file_count zorunlu', async () => {
    const bagRes = await request(app)
      .post('/api/self-service/laundry-kiosk/bag')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ block: 'A', room_no: '101', item_count: 1 })
    const bagId = bagRes.body.id
    // delivered_name olmadan
    const res = await request(app)
      .post(`/api/self-service/laundry-kiosk/bags/${bagId}/deliver`)
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ file_count: 2 })
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('POST /laundry-kiosk/bag — direkt dirty olur (pending_collection değil)', async () => {
    const res = await request(app)
      .post('/api/self-service/laundry-kiosk/bag')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ block: 'A', room_no: '101', item_count: 1 })
    expect(res.status).toBe(201)
    const db = getDB()
    const item = db.prepare('SELECT status FROM laundry_items WHERE id=?').get(res.body.id)
    expect(item.status).toBe('dirty')
  })

  it('POST /laundry-kiosk/garment — M1 blok dirty olur', async () => {
    const res = await request(app)
      .post('/api/self-service/laundry-kiosk/garment')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({
        block: 'M1', room_no: '101',
        clothing_items: [{ type_id: 1, type_name: 'Gömlek', emoji: '👔', count: 1, colors: [], pattern: 'solid', pattern_label: 'Düz' }],
      })
    expect(res.status).toBe(201)
    const db = getDB()
    const item = db.prepare('SELECT status, needs_ironing FROM laundry_items WHERE id=?').get(res.body.id)
    expect(item.status).toBe('dirty')
    expect(item.needs_ironing).toBe(0)
  })

  it('POST /laundry-kiosk/garment — A blok (M/S dışı) ironing olur', async () => {
    const res = await request(app)
      .post('/api/self-service/laundry-kiosk/garment')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({
        block: 'A', room_no: '101',
        clothing_items: [{ type_id: 1, type_name: 'Gömlek', emoji: '👔', count: 1, colors: [], pattern: 'solid', pattern_label: 'Düz' }],
      })
    expect(res.status).toBe(201)
    const db = getDB()
    const item = db.prepare('SELECT status, needs_ironing FROM laundry_items WHERE id=?').get(res.body.id)
    expect(item.status).toBe('ironing')
    expect(item.needs_ironing).toBe(1)
  })
})
