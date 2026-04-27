import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../../app.js'
import { initDB } from '../../../shared/db/index.js'
import { seedDev } from '../../../shared/db/seed.js'

let token, supplierId, item1Id, item2Id
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  const res = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
  token = res.body.token
  const sup = await request(app).post('/api/inventory/suppliers').set({ Authorization: `Bearer ${token}` })
    .send({ name: 'PO Tedarik' })
  supplierId = sup.body.id
  const inv = await request(app).get('/api/inventory').set({ Authorization: `Bearer ${token}` })
  item1Id = inv.body[0].id
  item2Id = inv.body[1].id
})

const auth = () => ({ Authorization: `Bearer ${token}` })

describe('Inventory Purchase Orders', () => {
  let poId

  it('creates a PO', async () => {
    const res = await request(app).post('/api/inventory/po').set(auth())
      .send({
        supplier_id: supplierId,
        expected_date: '2026-05-15',
        notes: 'Acil siparis',
        items: [
          { item_id: item1Id, qty_ordered: 50, unit_price: 25 },
          { item_id: item2Id, qty_ordered: 20, unit_price: 100 },
        ]
      })
    expect(res.status).toBe(201)
    expect(res.body.po_no).toMatch(/^PO-/)
    expect(res.body.total_value).toBe(50 * 25 + 20 * 100)
    poId = res.body.id
  })

  it('rejects PO without supplier', async () => {
    const res = await request(app).post('/api/inventory/po').set(auth()).send({ items: [] })
    expect(res.status).toBe(400)
  })

  it('lists POs', async () => {
    const res = await request(app).get('/api/inventory/po').set(auth())
    expect(res.status).toBe(200)
    expect(res.body.some(p => p.id === poId)).toBe(true)
  })

  it('gets PO detail with items', async () => {
    const res = await request(app).get(`/api/inventory/po/${poId}`).set(auth())
    expect(res.status).toBe(200)
    expect(res.body.items.length).toBe(2)
    expect(res.body.supplier_name).toBe('PO Tedarik')
  })

  it('changes status to sent', async () => {
    const res = await request(app).patch(`/api/inventory/po/${poId}/status`).set(auth()).send({ status: 'sent' })
    expect(res.status).toBe(200)
    const get = await request(app).get(`/api/inventory/po/${poId}`).set(auth())
    expect(get.body.status).toBe('sent')
    expect(get.body.sent_at).toBeTruthy()
  })

  it('partial receive updates status to partial_received', async () => {
    const detail = await request(app).get(`/api/inventory/po/${poId}`).set(auth())
    const item1Line = detail.body.items.find(i => i.item_id === item1Id)
    const invBefore = await request(app).get('/api/inventory').set(auth())
    const item1Before = invBefore.body.find(i => i.id === item1Id).quantity

    const res = await request(app).post(`/api/inventory/po/${poId}/receive`).set(auth())
      .send({ items: [{ po_item_id: item1Line.id, qty_received_now: 30 }] })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('partial_received')

    const invAfter = await request(app).get('/api/inventory').set(auth())
    const item1After = invAfter.body.find(i => i.id === item1Id).quantity
    expect(item1After).toBe(item1Before + 30)
  })

  it('full receive updates status to received', async () => {
    const detail = await request(app).get(`/api/inventory/po/${poId}`).set(auth())
    const lines = detail.body.items
    const recItems = lines.map(l => ({ po_item_id: l.id, qty_received_now: l.qty_ordered - l.qty_received }))
    const res = await request(app).post(`/api/inventory/po/${poId}/receive`).set(auth())
      .send({ items: recItems })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('received')
  })

  it('rejects receive on already-received PO', async () => {
    const res = await request(app).post(`/api/inventory/po/${poId}/receive`).set(auth())
      .send({ items: [{ po_item_id: 1, qty_received_now: 1 }] })
    expect(res.status).toBe(400)
  })

  it('returns PDF for PO', async () => {
    const res = await request(app).get(`/api/inventory/po/${poId}/pdf`).set(auth())
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/pdf/)
    expect(res.body.length).toBeGreaterThan(500)
  })

  it('draft-from-low-stock creates POs for low items', async () => {
    // ensure at least one low-stock item assigned to supplier
    const inv = await request(app).get('/api/inventory').set(auth())
    const item = inv.body[2]
    await request(app).put(`/api/inventory/${item.id}`).set(auth())
      .send({ ...item, quantity: 0, reorder_threshold: 10, preferred_supplier_id: supplierId })

    const res = await request(app).post('/api/inventory/po/draft-from-low-stock').set(auth())
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.created)).toBe(true)
  })
})
