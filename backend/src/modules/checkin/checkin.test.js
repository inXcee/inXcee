import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token, managerToken
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  const res = await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })
  token = res.body.token
  const res2 = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
  managerToken = res2.body.token
})

describe('Check-in', () => {
  it('detects blacklisted person', async () => {
    const db = (await import('../../shared/db/index.js')).getDB()
    db.prepare("INSERT INTO personnel(tc_no,full_name,is_blacklisted,blacklist_reason) VALUES('11111111111','Ali Kara',1,'Kavga')").run()
    const res = await request(app)
      .post('/api/checkin/lookup')
      .set('Authorization', `Bearer ${token}`)
      .send({ tc_no: '11111111111' })
    expect(res.status).toBe(200)
    expect(res.body.is_blacklisted).toBe(1)
  })
  it('checks in new person', async () => {
    const res = await request(app)
      .post('/api/checkin/register')
      .set('Authorization', `Bearer ${token}`)
      .send({ tc_no: '22222222222', full_name: 'Mehmet Demir', company: 'ABC Ltd', hometown: 'Konya' })
    expect(res.status).toBe(201)
    expect(res.body.id).toBeTruthy()
  })
  it('suggests room for group with same company', async () => {
    const res = await request(app)
      .post('/api/checkin/suggest-room')
      .set('Authorization', `Bearer ${token}`)
      .send({ company: 'ABC Ltd', hometown: 'Konya' })
    expect(res.status).toBe(200)
    expect(res.body.room_id).toBeTruthy()
  })

  it('blocks checkout when unreturned zimmet exists', async () => {
    const db = (await import('../../shared/db/index.js')).getDB()

    // Create personnel
    const regRes = await request(app)
      .post('/api/checkin/register')
      .set('Authorization', `Bearer ${token}`)
      .send({ tc_no: '33333333333', full_name: 'Zimmet Test Kisi', company: 'Test Ltd' })
    expect(regRes.status).toBe(201)
    const personnelId = regRes.body.id

    // Assign to a room
    const rooms = db.prepare("SELECT id FROM rooms WHERE status='active' LIMIT 1").get()
    await request(app)
      .post('/api/checkin/assign-room')
      .set('Authorization', `Bearer ${token}`)
      .send({ personnel_id: personnelId, room_id: rooms.id })

    // Add zimmet
    await request(app)
      .post('/api/checkin/zimmet')
      .set('Authorization', `Bearer ${token}`)
      .send({ personnel_id: personnelId, items: [{ item_name: 'Yatak Takimi', quantity: 1 }] })

    // Try bulk checkout — should fail with 409
    const checkoutRes = await request(app)
      .post('/api/capacity/bulk/checkout')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ personnel_ids: [personnelId] })
    expect(checkoutRes.status).toBe(409)
    expect(checkoutRes.body.error).toBe('UNRETURNED_ZIMMET')
    expect(checkoutRes.body.details).toHaveLength(1)
    expect(checkoutRes.body.details[0].personnel_id).toBe(personnelId)
    expect(checkoutRes.body.details[0].items).toHaveLength(1)

    // Return zimmet
    await request(app)
      .post('/api/checkin/zimmet/return-all')
      .set('Authorization', `Bearer ${token}`)
      .send({ personnel_id: personnelId, condition: 'normal' })

    // Retry checkout — should succeed
    const retryRes = await request(app)
      .post('/api/capacity/bulk/checkout')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ personnel_ids: [personnelId] })
    expect(retryRes.status).toBe(200)
    expect(retryRes.body.ok).toBe(true)
  })

  it('GET /checkin/search?q= — isim veya oda ile arama', async () => {
    const res = await request(app)
      .get('/api/checkin/search?q=Mehmet')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.some(p => p.full_name === 'Mehmet Demir')).toBe(true)
    // Seed'deki Mehmet Demir kaydı (önceki testte oluşturulmuştu)
    // Sonuç boş bile olsa array dönmeli
  })

  it('GET /checkin/search — 1 karakterde boş array döner', async () => {
    const res = await request(app)
      .get('/api/checkin/search?q=A')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })
})

describe('Placeholder batch', () => {
  it('POST /checkin/placeholder-batch oda bulunamadıysa hata', async () => {
    const res = await request(app)
      .post('/api/checkin/placeholder-batch')
      .set('Authorization', `Bearer ${token}`)
      .send({ room_id: 99999, count: 2 })
    expect(res.status).toBe(400)
  })

  it('POST /checkin/placeholder-batch geçerli oda ile çalışır', async () => {
    const rooms = await request(app)
      .get('/api/checkin/available-rooms')
      .set('Authorization', `Bearer ${token}`)
    const firstRoom = rooms.body[0]
    if (!firstRoom) return

    const res = await request(app)
      .post('/api/checkin/placeholder-batch')
      .set('Authorization', `Bearer ${token}`)
      .send({ room_id: firstRoom.room_id, count: 1 })
    expect(res.status).toBe(201)
    expect(Array.isArray(res.body.ids)).toBe(true)
    expect(res.body.ids).toHaveLength(1)
  })

  it('POST /checkin/placeholder-batch count 0 reddedilir', async () => {
    const res = await request(app)
      .post('/api/checkin/placeholder-batch')
      .set('Authorization', `Bearer ${token}`)
      .send({ room_id: 1, count: 0 })
    expect(res.status).toBe(400)
  })

  it('yetkisiz kullanıcı 403 alır', async () => {
    const laundryToken = (await request(app).post('/api/auth/login').send({ username: 'camasir', password: 'admin123' })).body.token
    const res = await request(app)
      .post('/api/checkin/placeholder-batch')
      .set('Authorization', `Bearer ${laundryToken}`)
      .send({ room_id: 1, count: 1 })
    expect(res.status).toBe(403)
  })

  it('CSV import 1001 satırda 400 döner', async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => ({ full_name: `Test Kişi ${i}` }))
    const res = await request(app)
      .post('/api/checkin/import-csv')
      .set('Authorization', `Bearer ${token}`)
      .send({ rows })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/1000/)
  })
})
