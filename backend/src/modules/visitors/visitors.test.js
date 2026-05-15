import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const res = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
  token = res.body.token
})

describe('Visitors', () => {
  it('ad olmadan reddedilir', async () => {
    const res = await request(app)
      .post('/api/visitors')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '0532' })
    expect(res.status).toBe(400)
  })

  it('ziyaretci giris + cikis akisi', async () => {
    const res = await request(app)
      .post('/api/visitors')
      .set('Authorization', `Bearer ${token}`)
      .send({ full_name: 'Ahmet Ziyaretci', phone: '0532123', purpose: 'aile ziyareti' })
    expect(res.status).toBe(201)
    const id = res.body.id

    const list = await request(app)
      .get('/api/visitors?active=1')
      .set('Authorization', `Bearer ${token}`)
    expect(list.body.some(v => v.id === id)).toBe(true)

    const out = await request(app)
      .post(`/api/visitors/${id}/checkout`)
      .set('Authorization', `Bearer ${token}`)
    expect(out.status).toBe(200)

    // Tekrar checkout reddedilir
    const out2 = await request(app)
      .post(`/api/visitors/${id}/checkout`)
      .set('Authorization', `Bearer ${token}`)
    expect(out2.status).toBe(404)
  })

  it('stats endpoint', async () => {
    const res = await request(app)
      .get('/api/visitors/stats')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.total).toBeGreaterThanOrEqual(1)
  })
})
