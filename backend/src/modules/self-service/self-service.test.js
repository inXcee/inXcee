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

describe('Self-Service', () => {
  it('staff token without personnelId gets 403 on /my-info', async () => {
    const res = await request(app)
      .get('/api/self-service/my-info')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(403)
    expect(res.body).toHaveProperty('error')
  })

  it('staff token without personnelId gets 403 on /laundry-status', async () => {
    const res = await request(app)
      .get('/api/self-service/laundry-status')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(403)
    expect(res.body).toHaveProperty('error')
  })

  it('POST /maintenance returns 403 for non-kiosk token', async () => {
    const res = await request(app)
      .post('/api/self-service/maintenance')
      .set('Authorization', `Bearer ${token}`)
      .send({ location: 'M1 Kat 2', description: 'Kapı kolu kırık' })
    expect(res.status).toBe(403)
    expect(res.body).toHaveProperty('error')
  })

  it('unauthenticated request gets 401', async () => {
    const res = await request(app).get('/api/self-service/my-info')
    expect(res.status).toBe(401)
  })
})
