import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let lowToken // technical — yönetim rolü değil
let staffId

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  lowToken = (await request(app).post('/api/auth/login').send({ username: 'teknik', password: 'admin123' })).body.token
  const db = getDB()
  staffId = db.prepare("INSERT INTO staff(full_name,is_active,salary,tc_no) VALUES('Test Personel',1,30000,'12345678901')").run().lastInsertRowid
})

describe('F1 — shifts yetki korumaları (düşük yetkili rol 403 almalı)', () => {
  const auth = req => req.set('Authorization', `Bearer ${lowToken}`)

  it('GET /staff/:id/detail düşük yetkiliye kapalı (PII)', async () => {
    const res = await auth(request(app).get(`/api/shifts/staff/${staffId}/detail`))
    expect(res.status).toBe(403)
  })

  it('POST /leave düşük yetkiliye kapalı (IDOR)', async () => {
    const res = await auth(request(app).post('/api/shifts/leave'))
      .send({ staff_id: staffId, leave_type: 'annual', start_date: '2026-07-20', end_date: '2026-07-21' })
    expect(res.status).toBe(403)
  })

  it('POST /swaps düşük yetkiliye kapalı', async () => {
    const res = await auth(request(app).post('/api/shifts/swaps')).send({})
    expect(res.status).toBe(403)
  })

  it('POST /attendance/events düşük yetkiliye kapalı', async () => {
    const res = await auth(request(app).post('/api/shifts/attendance/events'))
      .send({ staff_id: staffId, external_event_id: 'x1', event_type: 'check_in', occurred_at: new Date().toISOString() })
    expect(res.status).toBe(403)
  })

  it('POST /attendance/checkin düşük yetkiliye kapalı', async () => {
    const res = await auth(request(app).post('/api/shifts/attendance/checkin')).send({ staff_id: staffId })
    expect(res.status).toBe(403)
  })

  it('POST /attendance/checkout düşük yetkiliye kapalı', async () => {
    const res = await auth(request(app).post('/api/shifts/attendance/checkout')).send({ log_id: 1 })
    expect(res.status).toBe(403)
  })
})
