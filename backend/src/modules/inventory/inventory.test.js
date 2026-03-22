import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  const res = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
  token = res.body.token
})

describe('Inventory Module', () => {
  let itemId

  it('lists inventory items', async () => {
    const res = await request(app)
      .get('/api/inventory')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('filters by category', async () => {
    const res = await request(app)
      .get('/api/inventory?category=laundry')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    res.body.forEach(item => expect(item.category).toBe('laundry'))
  })

  it('creates a new item', async () => {
    const res = await request(app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${token}`)
      .send({ item_name: 'Test Malzeme', quantity: 50, unit: 'adet', reorder_threshold: 10, category: 'general' })
    expect(res.status).toBe(201)
    expect(res.body.id).toBeTruthy()
    itemId = res.body.id
  })

  it('rejects item without required fields', async () => {
    const res = await request(app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${token}`)
      .send({ item_name: 'Eksik' })
    expect(res.status).toBe(400)
  })

  it('updates an item', async () => {
    const res = await request(app)
      .put(`/api/inventory/${itemId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ item_name: 'Test Malzeme V2', quantity: 100, unit: 'adet', reorder_threshold: 20, category: 'general' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('adjusts stock positively', async () => {
    const res = await request(app)
      .patch(`/api/inventory/${itemId}/adjust`)
      .set('Authorization', `Bearer ${token}`)
      .send({ delta: 25, reason: 'Yeni teslimat' })
    expect(res.status).toBe(200)
    expect(res.body.quantity).toBe(125)
  })

  it('rejects negative stock', async () => {
    const res = await request(app)
      .patch(`/api/inventory/${itemId}/adjust`)
      .set('Authorization', `Bearer ${token}`)
      .send({ delta: -9999, reason: 'Asiri cikis' })
    expect(res.status).toBe(400)
  })

  it('rejects zero delta', async () => {
    const res = await request(app)
      .patch(`/api/inventory/${itemId}/adjust`)
      .set('Authorization', `Bearer ${token}`)
      .send({ delta: 0 })
    expect(res.status).toBe(400)
  })

  it('deletes an item', async () => {
    const res = await request(app)
      .delete(`/api/inventory/${itemId}`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('returns 404 adjusting non-existent item', async () => {
    const res = await request(app)
      .patch('/api/inventory/99999/adjust')
      .set('Authorization', `Bearer ${token}`)
      .send({ delta: 1, reason: 'test' })
    expect(res.status).toBe(404)
  })
})
