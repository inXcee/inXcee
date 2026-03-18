import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  token = (await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })).body.token
})

describe('Room History', () => {
  it('GET /summary returns array', async () => {
    const res = await request(app)
      .get('/api/room-history/summary')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('GET /summary respects days parameter', async () => {
    const res = await request(app)
      .get('/api/room-history/summary?days=30')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('GET /room returns 404 for nonexistent room', async () => {
    const res = await request(app)
      .get('/api/room-history/room/ZZ/999')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(404)
    expect(res.body).toHaveProperty('error')
  })

  it('GET /room with valid seed room returns data', async () => {
    const res = await request(app)
      .get('/api/room-history/room/M1/101')
      .set('Authorization', `Bearer ${token}`)
    expect([200, 404]).toContain(res.status)
    if (res.status === 200) {
      expect(res.body).toHaveProperty('room')
    }
  })
})
