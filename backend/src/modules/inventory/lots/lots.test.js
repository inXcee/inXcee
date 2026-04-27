import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../../app.js'
import { initDB, getDB } from '../../../shared/db/index.js'
import { seedDev } from '../../../shared/db/seed.js'

let token, itemId, personnelId
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  const r = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
  token = r.body.token
  // create item with track_lots
  const create = await request(app).post('/api/inventory').set({ Authorization: `Bearer ${token}` })
    .send({ item_name: 'Lot Test Urun', quantity: 0, unit: 'adet', reorder_threshold: 5, category: 'general', track_lots: 1 })
  itemId = create.body.id
  const pers = await request(app).get('/api/inventory/personnel/search?q=a').set({ Authorization: `Bearer ${token}` })
  personnelId = pers.body[0]?.id || 1
})

const auth = () => ({ Authorization: `Bearer ${token}` })

describe('Inventory Lots', () => {
  it('creates lots for tracked item', async () => {
    // increase stock manually first then 2 lots
    getDB().prepare('UPDATE inventory SET quantity = 30 WHERE id = ?').run(itemId)
    const r1 = await request(app).post('/api/inventory/lots').set(auth())
      .send({ item_id: itemId, lot_no: 'A1', quantity: 10, expiry_date: '2026-06-01' })
    expect(r1.status).toBe(201)
    const r2 = await request(app).post('/api/inventory/lots').set(auth())
      .send({ item_id: itemId, lot_no: 'A2', quantity: 20, expiry_date: '2026-08-01' })
    expect(r2.status).toBe(201)
  })

  it('lists lots for item', async () => {
    const res = await request(app).get(`/api/inventory/items/${itemId}/lots`).set(auth())
    expect(res.status).toBe(200)
    expect(res.body.length).toBe(2)
  })

  it('FIFO consumes oldest lot first on checkout', async () => {
    const res = await request(app).post('/api/inventory/checkout').set(auth())
      .send({ item_id: itemId, personnel_id: personnelId, quantity: 5 })
    expect(res.status).toBe(200)

    const lots = await request(app).get(`/api/inventory/items/${itemId}/lots`).set(auth())
    const a1 = lots.body.find(l => l.lot_no === 'A1')
    const a2 = lots.body.find(l => l.lot_no === 'A2')
    expect(a1.quantity).toBe(5) // 10-5
    expect(a2.quantity).toBe(20) // unchanged
    expect(a1.status).toBe('active')
  })

  it('FIFO crosses lot boundary when first depletes', async () => {
    // remaining lot A1: 5, A2: 20 → checkout 8 → A1 depleted, A2 = 17
    const res = await request(app).post('/api/inventory/checkout').set(auth())
      .send({ item_id: itemId, personnel_id: personnelId, quantity: 8 })
    expect(res.status).toBe(200)
    const lots = await request(app).get(`/api/inventory/items/${itemId}/lots`).set(auth())
    const a1 = lots.body.find(l => l.lot_no === 'A1')
    const a2 = lots.body.find(l => l.lot_no === 'A2')
    expect(a1.quantity).toBe(0)
    expect(a1.status).toBe('depleted')
    expect(a2.quantity).toBe(17)
    expect(a2.status).toBe('active')
  })

  it('expiring endpoint returns near-expiry lots', async () => {
    // create item with soon-expiring lot
    getDB().prepare(`
      INSERT INTO inventory_lots(item_id, lot_no, quantity, expiry_date, status)
      VALUES(?, 'EXP1', 5, date('now', '+5 days'), 'active')
    `).run(itemId)
    const res = await request(app).get('/api/inventory/lots/expiring?days=10').set(auth())
    expect(res.status).toBe(200)
    expect(res.body.some(l => l.lot_no === 'EXP1')).toBe(true)
  })
})
