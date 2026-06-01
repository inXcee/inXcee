import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token, roomId

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const r = await request(app).post('/api/auth/login').send({ username: 'camasir', password: 'admin123' })
  token = r.body.token
  roomId = getDB().prepare('SELECT id FROM rooms LIMIT 1').get().id
})

describe('Laundry — Zod sweep', () => {
  it('cok uzun qr_code 400 doner', async () => {
    const r = await request(app).post('/api/laundry/bags')
      .set('Authorization', `Bearer ${token}`).send({ qr_code: 'Q'.repeat(101) })
    expect(r.status).toBe(400)
  })

  it('cok uzun garment-type ismi 400 doner', async () => {
    const r = await request(app).post('/api/laundry/garment-types')
      .set('Authorization', `Bearer ${token}`).send({ name: 'G'.repeat(101) })
    expect(r.status).toBe(400)
  })
})

describe('Laundry Bags - QR taramali canta yonetimi', () => {
  it('POST /laundry/bags yeni canta olusturur (qr_code unique)', async () => {
    const r = await request(app).post('/api/laundry/bags')
      .set('Authorization', `Bearer ${token}`)
      .send({ qr_code: 'BAG-TEST-001', room_id: roomId })
    expect(r.status).toBe(201)
    expect(r.body.id).toBeTruthy()
  })

  it('ayni qr_code ikinci kayitta 409 doner', async () => {
    await request(app).post('/api/laundry/bags')
      .set('Authorization', `Bearer ${token}`)
      .send({ qr_code: 'BAG-DUP', room_id: roomId })
    const r = await request(app).post('/api/laundry/bags')
      .set('Authorization', `Bearer ${token}`)
      .send({ qr_code: 'BAG-DUP', room_id: roomId })
    expect(r.status).toBe(409)
  })

  it('qr_code kisaysa 400 doner', async () => {
    const r = await request(app).post('/api/laundry/bags')
      .set('Authorization', `Bearer ${token}`)
      .send({ qr_code: 'AB' })
    expect(r.status).toBe(400)
  })

  it('GET /bags/by-qr/:code canta detayini doner', async () => {
    await request(app).post('/api/laundry/bags')
      .set('Authorization', `Bearer ${token}`)
      .send({ qr_code: 'BAG-FIND-1', room_id: roomId })
    const r = await request(app).get('/api/laundry/bags/by-qr/BAG-FIND-1')
      .set('Authorization', `Bearer ${token}`)
    expect(r.status).toBe(200)
    expect(r.body.qr_code).toBe('BAG-FIND-1')
    expect(r.body.status).toBe('clean')
  })

  it('GET /bags/by-qr/:code bulunamayan kod 404', async () => {
    const r = await request(app).get('/api/laundry/bags/by-qr/YOK-BUNDA')
      .set('Authorization', `Bearer ${token}`)
    expect(r.status).toBe(404)
  })

  it('PATCH /bags/:id/status durumu gunceller + collected_at yazar', async () => {
    const create = await request(app).post('/api/laundry/bags')
      .set('Authorization', `Bearer ${token}`)
      .send({ qr_code: 'BAG-STATUS-1', room_id: roomId })
    const id = create.body.id

    const r = await request(app).patch(`/api/laundry/bags/${id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'collected' })
    expect(r.status).toBe(200)

    const row = getDB().prepare('SELECT * FROM laundry_bags WHERE id=?').get(id)
    expect(row.status).toBe('collected')
    expect(row.collected_at).toBeTruthy()
  })

  it('gecersiz status 400 doner', async () => {
    const create = await request(app).post('/api/laundry/bags')
      .set('Authorization', `Bearer ${token}`)
      .send({ qr_code: 'BAG-INVALID-STATUS', room_id: roomId })
    const r = await request(app).patch(`/api/laundry/bags/${create.body.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'XYZ' })
    expect(r.status).toBe(400)
  })
})
