import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token, db
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  db = getDB()
  const res = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
  token = res.body.token
})

describe('Maintenance — assign endpoint', () => {
  let requestId, techId

  it('creates a maintenance request', async () => {
    const res = await request(app)
      .post('/api/maintenance/requests')
      .set('Authorization', `Bearer ${token}`)
      .send({ location: 'B Blok 101', description: 'Musluk akıyor', priority: 'medium' })
    expect(res.status).toBe(201)
    requestId = res.body.id
  })

  it('creates a technician', async () => {
    const res = await request(app)
      .post('/api/maintenance/technicians')
      .set('Authorization', `Bearer ${token}`)
      .send({ full_name: 'Test Teknisyen', phone: '05001234567', specialty: 'tesisat' })
    expect(res.status).toBe(201)
    techId = res.body.id
  })

  it('assigns technician to request', async () => {
    const res = await request(app)
      .patch(`/api/maintenance/requests/${requestId}/assign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ technician_id: techId })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('verifies assigned_to is persisted', () => {
    const row = db.prepare('SELECT assigned_to FROM maintenance_requests WHERE id=?').get(requestId)
    expect(row.assigned_to).toBe(techId)
  })

  it('rejects assign with missing technician_id', async () => {
    const res = await request(app)
      .patch(`/api/maintenance/requests/${requestId}/assign`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
    expect(res.status).toBe(400)
  })

  it('rejects assign with non-existent technician', async () => {
    const res = await request(app)
      .patch(`/api/maintenance/requests/${requestId}/assign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ technician_id: 99999 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Teknisyen/)
  })
})
