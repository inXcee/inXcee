import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let managerToken, shiftToken
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  managerToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  shiftToken = (await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })).body.token
})

describe('Shifts', () => {
  it('GET /departments returns array', async () => {
    const res = await request(app).get('/api/shifts/departments').set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('GET /definitions returns array', async () => {
    const res = await request(app).get('/api/shifts/definitions').set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('GET /schedule returns data for a week', async () => {
    const res = await request(app).get('/api/shifts/schedule?week=2026-03-16').set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toBeTruthy()
  })

  it('GET /personnel returns array', async () => {
    const res = await request(app).get('/api/shifts/personnel?date=2026-03-16').set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('GET /statistics returns object', async () => {
    const res = await request(app).get('/api/shifts/statistics?date=2026-03-16').set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    expect(typeof res.body).toBe('object')
  })

  it('POST /departments creates a department (manager)', async () => {
    const res = await request(app)
      .post('/api/shifts/departments')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ name: 'Test Departman', color_class: 'bg-blue-500', description: 'Test açıklama' })
    expect(res.status).toBe(201)
    expect(res.body.id).toBeTruthy()
  })

  it('POST /definitions creates a shift definition (manager)', async () => {
    const res = await request(app)
      .post('/api/shifts/definitions')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ name: 'Test Vardiya', start_hour: '08:00', end_hour: '16:00', color_class: 'bg-green-500' })
    expect(res.status).toBe(201)
    expect(res.body.id).toBeTruthy()
  })
})
