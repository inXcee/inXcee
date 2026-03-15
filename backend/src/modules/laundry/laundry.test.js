import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  const r = await request(app).post('/api/auth/login').send({ username: 'camasir', password: 'admin123' })
  token = r.body.token
})

describe('Laundry', () => {
  it('generates QR for room', async () => {
    const rooms = (await import('../../shared/db/index.js')).getDB()
      .prepare('SELECT id FROM rooms LIMIT 1').get()
    const res = await request(app)
      .post('/api/laundry/bags/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ room_id: rooms.id })
    expect(res.status).toBe(201)
    expect(res.body.qr_code).toBeTruthy()
  })
  it('collects bag by QR', async () => {
    const bag = (await import('../../shared/db/index.js')).getDB()
      .prepare("SELECT qr_code FROM laundry_bags LIMIT 1").get()
    const res = await request(app)
      .post('/api/laundry/bags/collect')
      .set('Authorization', `Bearer ${token}`)
      .send({ qr_code: bag.qr_code })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('collected')
  })
  it('deducts detergent on wash start', async () => {
    const db = (await import('../../shared/db/index.js')).getDB()
    const before = db.prepare("SELECT quantity FROM inventory WHERE item_name='Sanayi Deterjanı'").get()
    const bag = db.prepare("SELECT id FROM laundry_bags WHERE status='collected' LIMIT 1").get()
    if (!bag) return
    await request(app).post('/api/laundry/machines/1/load').set('Authorization', `Bearer ${token}`).send({ bag_ids: [bag.id], block: 'M1' })
    const after = db.prepare("SELECT quantity FROM inventory WHERE item_name='Sanayi Deterjanı'").get()
    expect(after.quantity).toBeLessThan(before.quantity)
  })
})
