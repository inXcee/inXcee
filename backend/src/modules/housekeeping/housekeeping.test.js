import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  const r = await request(app).post('/api/auth/login').send({ username: 'meydanci', password: 'admin123' })
  token = r.body.token
})

describe('Housekeeping', () => {
  it('creates daily tasks', async () => {
    const res = await request(app).post('/api/housekeeping/tasks/generate-daily').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(201)
    expect(res.body.count).toBeGreaterThan(0)
  })
  it('completes task by QR', async () => {
    const db = (await import('../../shared/db/index.js')).getDB()
    const task = db.prepare('SELECT * FROM cleaning_tasks LIMIT 1').get()
    const res = await request(app)
      .post(`/api/housekeeping/tasks/${task.id}/complete`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
  })
  it('lists tasks for housekeeper', async () => {
    const res = await request(app).get('/api/housekeeping/tasks').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})
