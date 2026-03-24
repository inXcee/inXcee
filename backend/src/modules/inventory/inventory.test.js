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
    const res = await request(app).get('/api/inventory').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThan(0)
  })

  it('filters by category', async () => {
    const res = await request(app).get('/api/inventory?category=laundry').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    res.body.forEach(item => expect(item.category).toBe('laundry'))
  })

  it('searches by name', async () => {
    const res = await request(app).get('/api/inventory?search=Deterjan').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.some(i => i.item_name.includes('Deterjan'))).toBe(true)
  })

  it('returns stats with active_checkouts', async () => {
    const res = await request(app).get('/api/inventory/stats').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.total_items).toBeGreaterThan(0)
    expect(Array.isArray(res.body.by_category)).toBe(true)
    expect(typeof res.body.active_checkouts).toBe('number')
  })

  it('creates a new item', async () => {
    const res = await request(app).post('/api/inventory').set('Authorization', `Bearer ${token}`)
      .send({ item_name: 'Test Malzeme', quantity: 50, unit: 'adet', reorder_threshold: 10, category: 'general', location: 'Depo A', unit_price: 25 })
    expect(res.status).toBe(201)
    itemId = res.body.id
  })

  it('rejects item without required fields', async () => {
    const res = await request(app).post('/api/inventory').set('Authorization', `Bearer ${token}`)
      .send({ item_name: 'Eksik' })
    expect(res.status).toBe(400)
  })

  it('updates an item', async () => {
    const res = await request(app).put(`/api/inventory/${itemId}`).set('Authorization', `Bearer ${token}`)
      .send({ item_name: 'Test V2', quantity: 100, unit: 'adet', reorder_threshold: 20, category: 'general', location: 'Depo B', unit_price: 30 })
    expect(res.status).toBe(200)
  })

  it('adjusts stock positively', async () => {
    const res = await request(app).patch(`/api/inventory/${itemId}/adjust`).set('Authorization', `Bearer ${token}`)
      .send({ delta: 25, reason: 'Teslimat' })
    expect(res.status).toBe(200)
    expect(res.body.quantity).toBe(125)
  })

  it('records movement on adjust', async () => {
    const res = await request(app).get(`/api/inventory/${itemId}/movements`).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.find(m => m.type === 'in')).toBeTruthy()
  })

  it('rejects negative stock', async () => {
    const res = await request(app).patch(`/api/inventory/${itemId}/adjust`).set('Authorization', `Bearer ${token}`)
      .send({ delta: -9999, reason: 'Fazla' })
    expect(res.status).toBe(400)
  })

  it('rejects zero delta', async () => {
    const res = await request(app).patch(`/api/inventory/${itemId}/adjust`).set('Authorization', `Bearer ${token}`)
      .send({ delta: 0 })
    expect(res.status).toBe(400)
  })

  it('exports CSV', async () => {
    const res = await request(app).get('/api/inventory/export/csv').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/csv')
  })

  it('bulk count', async () => {
    const res = await request(app).post('/api/inventory/bulk-count').set('Authorization', `Bearer ${token}`)
      .send({ items: [{ id: itemId, counted_qty: 80 }] })
    expect(res.status).toBe(200)
    expect(res.body.updated).toBe(1)
  })

  it('recent movements', async () => {
    const res = await request(app).get('/api/inventory/movements/recent?limit=5').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  // ── Checkout tests ──────────────────────────────────────────────────────
  it('searches personnel', async () => {
    const res = await request(app).get('/api/inventory/personnel/search?q=test').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('checks out item to personnel', async () => {
    // Register a person first
    const reg = await request(app).post('/api/checkin/register').set('Authorization', `Bearer ${token}`)
      .send({ full_name: 'Envanter Test Kisi', company: 'TestFirma' })
    const personnelId = reg.body.id

    const res = await request(app).post('/api/inventory/checkout').set('Authorization', `Bearer ${token}`)
      .send({ item_id: itemId, personnel_id: personnelId, quantity: 5, note: 'Test teslim' })
    expect(res.status).toBe(200)
    expect(res.body.quantity).toBe(75) // 80 (after count) - 5
  })

  it('lists active checkouts', async () => {
    const res = await request(app).get('/api/inventory/checkouts/active').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThan(0)
    expect(res.body[0].personnel_name).toBe('Envanter Test Kisi')
  })

  it('returns item from personnel', async () => {
    const active = await request(app).get('/api/inventory/checkouts/active').set('Authorization', `Bearer ${token}`)
    const coId = active.body[0].id
    const res = await request(app).post(`/api/inventory/return/${coId}`).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.quantity).toBe(80) // 75 + 5 back
  })

  it('rejects checkout with insufficient stock', async () => {
    const reg = await request(app).post('/api/checkin/register').set('Authorization', `Bearer ${token}`)
      .send({ full_name: 'Stok Test', company: 'X' })
    const res = await request(app).post('/api/inventory/checkout').set('Authorization', `Bearer ${token}`)
      .send({ item_id: itemId, personnel_id: reg.body.id, quantity: 99999, note: 'Cok fazla' })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('Yetersiz')
  })

  it('deletes an item', async () => {
    const res = await request(app).delete(`/api/inventory/${itemId}`).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
  })

  it('returns 404 adjusting non-existent item', async () => {
    const res = await request(app).patch('/api/inventory/99999/adjust').set('Authorization', `Bearer ${token}`)
      .send({ delta: 1, reason: 'test' })
    expect(res.status).toBe(404)
  })
})
