import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../../app.js'
import { initDB, getDB } from '../../../shared/db/index.js'
import { seedDev } from '../../../shared/db/seed.js'

let mgrToken, staffToken, itemId, avsStaffId
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  const m = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
  mgrToken = m.body.token
  const s = await request(app).post('/api/auth/login').send({ username: 'camasir', password: 'admin123' })
  staffToken = s.body.token
  const inv = await request(app).get('/api/inventory').set({ Authorization: `Bearer ${mgrToken}` })
  // pick item with stock
  const stocked = inv.body.find(i => i.quantity >= 5) || inv.body[0]
  itemId = stocked.id
  // AVS personeli (staff) yarat
  const r = getDB().prepare(`
    INSERT INTO staff(full_name, role_label, position, is_active)
    VALUES(?,?,?,1)
  `).run('Request Test AVS', 'Çamaşırcı', 'Çamaşırcı')
  avsStaffId = r.lastInsertRowid
})

const a = (t) => ({ Authorization: `Bearer ${t}` })

describe('Inventory Requests', () => {
  let reqId

  it('staff creates a request', async () => {
    const res = await request(app).post('/api/inventory/requests').set(a(staffToken))
      .send({ item_id: itemId, quantity: 2, reason: 'Camasirhane sarf' })
    expect(res.status).toBe(201)
    reqId = res.body.id
  })

  it('staff sees only own requests', async () => {
    const res = await request(app).get('/api/inventory/requests').set(a(staffToken))
    expect(res.status).toBe(200)
    expect(res.body.every(r => r.requester_name === 'camasir')).toBe(true)
  })

  it('manager sees all requests', async () => {
    const res = await request(app).get('/api/inventory/requests').set(a(mgrToken))
    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThanOrEqual(1)
  })

  it('staff cannot approve', async () => {
    const res = await request(app).patch(`/api/inventory/requests/${reqId}/approve`).set(a(staffToken))
    expect(res.status).toBe(403)
  })

  it('manager approves', async () => {
    const res = await request(app).patch(`/api/inventory/requests/${reqId}/approve`).set(a(mgrToken))
    expect(res.status).toBe(200)
    const list = await request(app).get('/api/inventory/requests').set(a(mgrToken))
    const r = list.body.find(x => x.id === reqId)
    expect(r.status).toBe('approved')
  })

  it('rejects approve on already-approved request', async () => {
    const res = await request(app).patch(`/api/inventory/requests/${reqId}/approve`).set(a(mgrToken))
    expect(res.status).toBe(400)
  })

  it('manager fulfills request — checkout created, stock decremented', async () => {
    const before = await request(app).get('/api/inventory').set(a(mgrToken))
    const itemBefore = before.body.find(i => i.id === itemId).quantity

    const res = await request(app).post(`/api/inventory/requests/${reqId}/fulfill`).set(a(mgrToken))
      .send({ staff_id: avsStaffId })
    expect(res.status).toBe(200)
    expect(res.body.checkout_id).toBeDefined()

    const after = await request(app).get('/api/inventory').set(a(mgrToken))
    const itemAfter = after.body.find(i => i.id === itemId).quantity
    expect(itemAfter).toBe(itemBefore - 2)
  })

  it('rejects fulfill on already-fulfilled', async () => {
    const res = await request(app).post(`/api/inventory/requests/${reqId}/fulfill`).set(a(mgrToken))
      .send({ staff_id: avsStaffId })
    expect(res.status).toBe(400)
  })

  it('manager rejects pending request', async () => {
    const c = await request(app).post('/api/inventory/requests').set(a(staffToken))
      .send({ item_id: itemId, quantity: 1 })
    const id = c.body.id
    const res = await request(app).patch(`/api/inventory/requests/${id}/reject`).set(a(mgrToken))
      .send({ reason: 'stok yok' })
    expect(res.status).toBe(200)
    const list = await request(app).get('/api/inventory/requests').set(a(mgrToken))
    const r = list.body.find(x => x.id === id)
    expect(r.status).toBe('rejected')
    expect(r.rejection_reason).toBe('stok yok')
  })

  it('staff cancels own pending request', async () => {
    const c = await request(app).post('/api/inventory/requests').set(a(staffToken))
      .send({ item_id: itemId, quantity: 1 })
    const id = c.body.id
    const res = await request(app).post(`/api/inventory/requests/${id}/cancel`).set(a(staffToken))
    expect(res.status).toBe(200)
  })
})
