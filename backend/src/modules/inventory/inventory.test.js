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

describe('Inventory Forecast', () => {
  it('returns 200 with valid array structure', async () => {
    const res = await request(app).get('/api/inventory/forecast').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    // seed'de son 14 günde out hareketi olmayan item'lar dahil edilmemeli
    res.body.forEach(item => {
      expect(item.daily_avg).toBeGreaterThan(0)
      expect(item.days_left).toBeLessThanOrEqual(7)
    })
  })

  it('calculates severity correctly', async () => {
    const db = (await import('../../shared/db/index.js')).getDB()
    // Yeni item oluştur, düşük stok + son 14 günde out hareketi ekle
    const item = db.prepare(
      "INSERT INTO inventory(item_name,quantity,unit,category,reorder_threshold) VALUES('Forecast Test',5,'litre','laundry',1)"
    ).run()
    const itemId = item.lastInsertRowid
    const user = db.prepare("SELECT id FROM users LIMIT 1").get()
    // 14 günde toplamda 28 litre çıkış → daily_avg = 2, days_left = 2.5
    db.prepare(
      "INSERT INTO stock_movements(item_id,type,delta,quantity_after,reason,created_by,created_at) VALUES(?,?,?,?,?,?,datetime('now','-3 days'))"
    ).run(itemId, 'out', -28, -23, 'test', user.id)

    const res = await request(app).get('/api/inventory/forecast').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    const found = res.body.find(i => i.id === itemId)
    expect(found).toBeTruthy()
    expect(found.severity).toBe('critical')
    expect(found.days_left).toBeLessThanOrEqual(3)
  })

  it('excludes items with no out movements', async () => {
    const db = (await import('../../shared/db/index.js')).getDB()
    const item = db.prepare(
      "INSERT INTO inventory(item_name,quantity,unit,category,reorder_threshold) VALUES('No Movement',100,'adet','general',0)"
    ).run()
    const itemId = item.lastInsertRowid

    const res = await request(app).get('/api/inventory/forecast').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    const found = res.body.find(i => i.id === itemId)
    expect(found).toBeUndefined()
  })

  it('writes off as damage with reason', async () => {
    const inv = await request(app).get('/api/inventory').set('Authorization', `Bearer ${token}`)
    const target = inv.body.find(i => i.quantity >= 5)
    const before = target.quantity
    const res = await request(app).post(`/api/inventory/${target.id}/writeoff`).set('Authorization', `Bearer ${token}`)
      .send({ type: 'damage', quantity: 2, reason: 'Kirildi' })
    expect(res.status).toBe(200)
    expect(res.body.quantity).toBe(before - 2)
  })

  it('rejects writeoff with invalid type', async () => {
    const inv = await request(app).get('/api/inventory').set('Authorization', `Bearer ${token}`)
    const res = await request(app).post(`/api/inventory/${inv.body[0].id}/writeoff`).set('Authorization', `Bearer ${token}`)
      .send({ type: 'invalid', quantity: 1, reason: 'x' })
    expect(res.status).toBe(400)
  })

  it('excludes items with days_left > 7', async () => {
    const db = (await import('../../shared/db/index.js')).getDB()
    const user = db.prepare("SELECT id FROM users LIMIT 1").get()
    const item = db.prepare(
      "INSERT INTO inventory(item_name,quantity,unit,category,reorder_threshold) VALUES('Uzun Omurlu',100,'adet','general',0)"
    ).run()
    const itemId = item.lastInsertRowid
    // 14 günde 7 çıkış → daily_avg=0.5, days_left=200 → dahil edilmemeli
    db.prepare(
      "INSERT INTO stock_movements(item_id,type,delta,quantity_after,reason,created_by,created_at) VALUES(?,?,?,?,?,?,datetime('now','-1 days'))"
    ).run(itemId, 'out', -7, 93, 'test', user.id)

    const res = await request(app).get('/api/inventory/forecast').set('Authorization', `Bearer ${token}`)
    const found = res.body.find(i => i.id === itemId)
    expect(found).toBeUndefined()
  })
})
