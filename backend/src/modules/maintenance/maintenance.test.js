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

  it('full lifecycle: create → start → status change → done', async () => {
    const db = (await import('../../shared/db/index.js')).getDB()

    // create request
    const createRes = await request(app)
      .post('/api/maintenance/requests')
      .set('Authorization', `Bearer ${techToken}`)
      .send({ location: 'M3 Kat 1 Oda 101', description: 'Lifecycle test arıza', priority: 'medium' })
    expect(createRes.status).toBe(201)
    const reqId = createRes.body.id

    // verify open
    let row = db.prepare('SELECT status FROM maintenance_requests WHERE id=?').get(reqId)
    expect(row.status).toBe('open')

    // start (open → in_progress via start endpoint)
    const startRes = await request(app)
      .patch(`/api/maintenance/requests/${reqId}/start`)
      .set('Authorization', `Bearer ${techToken}`)
    expect(startRes.status).toBe(200)
    row = db.prepare('SELECT status, started_at FROM maintenance_requests WHERE id=?').get(reqId)
    expect(row.status).toBe('in_progress')
    expect(row.started_at).toBeTruthy()

    // complete via status endpoint (in_progress → done)
    const doneRes = await request(app)
      .patch(`/api/maintenance/requests/${reqId}/status`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ status: 'done' })
    expect(doneRes.status).toBe(200)
    row = db.prepare('SELECT status, closed_at FROM maintenance_requests WHERE id=?').get(reqId)
    expect(row.status).toBe('done')
    expect(row.closed_at).toBeTruthy()
  })

  it('drag-and-drop status change works', async () => {
    const db = (await import('../../shared/db/index.js')).getDB()

    const createRes = await request(app)
      .post('/api/maintenance/requests')
      .set('Authorization', `Bearer ${techToken}`)
      .send({ location: 'M1 Kat 2 Oda 201', description: 'Drag drop test arıza' })
    expect(createRes.status).toBe(201)
    const reqId = createRes.body.id

    // open → in_progress via status endpoint
    let res = await request(app)
      .patch(`/api/maintenance/requests/${reqId}/status`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ status: 'in_progress' })
    expect(res.status).toBe(200)

    // in_progress → open (drag back)
    res = await request(app)
      .patch(`/api/maintenance/requests/${reqId}/status`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ status: 'open' })
    expect(res.status).toBe(200)
    const row = db.prepare('SELECT status, started_at, closed_at FROM maintenance_requests WHERE id=?').get(reqId)
    expect(row.status).toBe('open')
    expect(row.started_at).toBeNull()
    expect(row.closed_at).toBeNull()
  })

  it('rejects invalid status', async () => {
    const createRes = await request(app)
      .post('/api/maintenance/requests')
      .set('Authorization', `Bearer ${techToken}`)
      .send({ location: 'M1 Kat 2 Oda 202', description: 'Invalid status test' })
    expect(createRes.status).toBe(201)

    const res = await request(app)
      .patch(`/api/maintenance/requests/${createRes.body.id}/status`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ status: 'invalid_status' })
    expect(res.status).toBe(400)
  })

  it('calculates SLA deadline based on priority', async () => {
    const db = (await import('../../shared/db/index.js')).getDB()

    const priorities = [
      { priority: 'high', expectedHours: 4 },
      { priority: 'medium', expectedHours: 24 },
      { priority: 'low', expectedHours: 72 },
    ]

    for (const { priority, expectedHours } of priorities) {
      const before = new Date()
      const res = await request(app)
        .post('/api/maintenance/requests')
        .set('Authorization', `Bearer ${techToken}`)
        .send({ location: `M2 Kat 1 Oda 101`, description: `SLA test ${priority}`, priority })
      expect(res.status).toBe(201)

      const row = db.prepare('SELECT opened_at, sla_deadline FROM maintenance_requests WHERE id=?').get(res.body.id)
      expect(row.sla_deadline).toBeTruthy()

      const openedAt = new Date(row.opened_at)
      const slaDeadline = new Date(row.sla_deadline)
      const diffHours = (slaDeadline - openedAt) / 3600000

      // Allow 1 minute tolerance for DB datetime rounding
      expect(diffHours).toBeGreaterThanOrEqual(expectedHours - 0.02)
      expect(diffHours).toBeLessThanOrEqual(expectedHours + 0.02)
    }
  })
})
