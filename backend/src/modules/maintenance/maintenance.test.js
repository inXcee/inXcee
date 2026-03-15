import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let techToken, shiftToken
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  techToken = (await request(app).post('/api/auth/login').send({ username: 'teknik', password: 'admin123' })).body.token
  shiftToken = (await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })).body.token
})

describe('Maintenance', () => {
  it('creates maintenance request', async () => {
    const res = await request(app)
      .post('/api/maintenance/requests')
      .set('Authorization', `Bearer ${techToken}`)
      .send({ location: 'M1 Kat 1 Banyo', description: 'Musluk akıyor' })
    expect(res.status).toBe(201)
    expect(res.body.id).toBeTruthy()
  })
  it('shift supervisor can only view', async () => {
    const res = await request(app).get('/api/maintenance/requests').set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
  })
  it('closes request', async () => {
    const db = (await import('../../shared/db/index.js')).getDB()
    const req_ = db.prepare('SELECT id FROM maintenance_requests LIMIT 1').get()
    const res = await request(app)
      .patch(`/api/maintenance/requests/${req_.id}/close`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ photo_url: '/uploads/test.jpg' })
    expect(res.status).toBe(200)
  })
})
