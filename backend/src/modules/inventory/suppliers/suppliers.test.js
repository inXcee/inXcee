import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../../app.js'
import { initDB } from '../../../shared/db/index.js'
import { seedDev } from '../../../shared/db/seed.js'

let token
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  const res = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
  token = res.body.token
})

const auth = () => ({ Authorization: `Bearer ${token}` })

describe('Inventory Suppliers', () => {
  let supplierId

  it('lists suppliers (initially empty or seeded)', async () => {
    const res = await request(app).get('/api/inventory/suppliers').set(auth())
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('creates a new supplier', async () => {
    const res = await request(app).post('/api/inventory/suppliers').set(auth())
      .send({ name: 'Acme Tedarikci', phone: '0212', email: 'a@b.com', payment_term: 'net_30', default_lead_time_days: 14 })
    expect(res.status).toBe(201)
    expect(res.body.id).toBeDefined()
    supplierId = res.body.id
  })

  it('rejects supplier without name', async () => {
    const res = await request(app).post('/api/inventory/suppliers').set(auth()).send({ phone: '0' })
    expect(res.status).toBe(400)
  })

  it('gets a single supplier', async () => {
    const res = await request(app).get(`/api/inventory/suppliers/${supplierId}`).set(auth())
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('Acme Tedarikci')
    expect(res.body.payment_term).toBe('net_30')
  })

  it('updates a supplier', async () => {
    const res = await request(app).put(`/api/inventory/suppliers/${supplierId}`).set(auth())
      .send({ name: 'Acme Ltd', phone: '0216', payment_term: 'net_60', default_lead_time_days: 21 })
    expect(res.status).toBe(200)
    const get = await request(app).get(`/api/inventory/suppliers/${supplierId}`).set(auth())
    expect(get.body.name).toBe('Acme Ltd')
    expect(get.body.payment_term).toBe('net_60')
  })

  it('soft-deletes a supplier (is_active=0)', async () => {
    const res = await request(app).delete(`/api/inventory/suppliers/${supplierId}`).set(auth())
    expect(res.status).toBe(200)
    const get = await request(app).get(`/api/inventory/suppliers/${supplierId}`).set(auth())
    expect(get.body.is_active).toBe(0)
  })

  it('filters by active=1', async () => {
    const res = await request(app).get('/api/inventory/suppliers?active=1').set(auth())
    expect(res.status).toBe(200)
    expect(res.body.every(s => s.is_active === 1)).toBe(true)
  })

  it('records supplier_prices when creating goods receipt', async () => {
    // create a fresh supplier
    const sup = await request(app).post('/api/inventory/suppliers').set(auth()).send({ name: 'Test Tedarik' })
    const supId = sup.body.id

    // pick existing item
    const inv = await request(app).get('/api/inventory').set(auth())
    const item = inv.body[0]
    expect(item).toBeDefined()

    // create receipt with that supplier name
    const rec = await request(app).post('/api/inventory/receipts').set(auth())
      .send({
        supplier: 'Test Tedarik',
        invoice_no: 'INV-1',
        receipt_date: '2026-04-27',
        items: [{ item_id: item.id, quantity: 5, unit_price: 99.5 }]
      })
    expect(rec.status).toBe(201)

    // price history should have 1 entry
    const ph = await request(app).get(`/api/inventory/suppliers/${supId}/price-history`).set(auth())
    expect(ph.status).toBe(200)
    expect(ph.body.length).toBe(1)
    expect(ph.body[0].unit_price).toBe(99.5)
    expect(ph.body[0].source).toBe('goods_receipt')
  })

  it('returns scorecard for supplier', async () => {
    const sc = await request(app).get('/api/inventory/suppliers/2/scorecard').set(auth())
    expect(sc.status).toBe(200)
    expect(typeof sc.body.receipt_count).toBe('number')
  })
})
