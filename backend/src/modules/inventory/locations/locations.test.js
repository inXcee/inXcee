import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../../app.js'
import { initDB } from '../../../shared/db/index.js'
import { seedDev } from '../../../shared/db/seed.js'

let token, itemId, fromLoc, toLoc
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  const res = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
  token = res.body.token
  const inv = await request(app).get('/api/inventory').set({ Authorization: `Bearer ${token}` })
  itemId = inv.body[0].id
})

const auth = () => ({ Authorization: `Bearer ${token}` })

describe('Inventory Locations + Transfer', () => {
  it('creates locations', async () => {
    const r1 = await request(app).post('/api/inventory/locations').set(auth())
      .send({ name: 'Depo A', block: 'S1' })
    expect(r1.status).toBe(201)
    fromLoc = r1.body.id
    const r2 = await request(app).post('/api/inventory/locations').set(auth())
      .send({ name: 'Depo B', block: 'S2' })
    expect(r2.status).toBe(201)
    toLoc = r2.body.id
  })

  it('lists locations', async () => {
    const res = await request(app).get('/api/inventory/locations').set(auth())
    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThanOrEqual(2)
  })

  it('rejects transfer without quantity', async () => {
    const res = await request(app).post('/api/inventory/locations/transfer').set(auth())
      .send({ item_id: itemId, from_location_id: fromLoc, to_location_id: toLoc })
    expect(res.status).toBe(400)
  })

  it('rejects transfer to same location', async () => {
    const res = await request(app).post('/api/inventory/locations/transfer').set(auth())
      .send({ item_id: itemId, from_location_id: fromLoc, to_location_id: fromLoc, quantity: 1 })
    expect(res.status).toBe(400)
  })

  it('records transfer movement (without track_locations)', async () => {
    const res = await request(app).post('/api/inventory/locations/transfer').set(auth())
      .send({ item_id: itemId, from_location_id: fromLoc, to_location_id: toLoc, quantity: 5, reason: 'Yer degisikligi' })
    expect(res.status).toBe(200)

    // movement should appear
    const mv = await request(app).get(`/api/inventory/${itemId}/movements`).set(auth())
    expect(mv.body.some(m => m.type === 'transfer')).toBe(true)
  })

  it('soft-deletes a location', async () => {
    const res = await request(app).delete(`/api/inventory/locations/${fromLoc}`).set(auth())
    expect(res.status).toBe(200)
    const list = await request(app).get('/api/inventory/locations?active=1').set(auth())
    expect(list.body.find(l => l.id === fromLoc)).toBeUndefined()
  })
})
