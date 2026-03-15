import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  token = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
})

describe('Dashboard', () => {
  it('returns KPI data', async () => {
    const res = await request(app).get('/api/dashboard/kpi').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('active_personnel')
    expect(res.body).toHaveProperty('occupancy_pct')
    expect(res.body).toHaveProperty('open_maintenance')
    expect(res.body).toHaveProperty('quarantine_rooms')
  })
  it('returns heatmap data', async () => {
    const res = await request(app).get('/api/dashboard/heatmap').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})
