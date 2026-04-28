import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../../app.js'
import { initDB } from '../../../shared/db/index.js'
import { seedDev } from '../../../shared/db/seed.js'

let token
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  const r = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
  token = r.body.token
})

const auth = () => ({ Authorization: `Bearer ${token}` })

describe('Inventory Analytics', () => {
  it('returns ABC analysis with classes', async () => {
    const res = await request(app).get('/api/inventory/analytics/abc').set(auth())
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('total')
    expect(res.body).toHaveProperty('items')
    expect(Array.isArray(res.body.items)).toBe(true)
    res.body.items.forEach(it => expect(['A', 'B', 'C']).toContain(it.abc_class))
  })

  it('returns department consumption', async () => {
    const res = await request(app).get('/api/inventory/analytics/department-consumption').set(auth())
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.rows)).toBe(true)
  })

  it('returns heatmap', async () => {
    const res = await request(app).get('/api/inventory/analytics/heatmap?days=7').set(auth())
    expect(res.status).toBe(200)
    expect(res.body.days).toBe(7)
    expect(Array.isArray(res.body.rows)).toBe(true)
  })

  it('rejects analytics for non-manager', async () => {
    const s = await request(app).post('/api/auth/login').send({ username: 'camasir', password: 'admin123' })
    const res = await request(app).get('/api/inventory/analytics/abc').set({ Authorization: `Bearer ${s.body.token}` })
    expect(res.status).toBe(403)
  })
})
