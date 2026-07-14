import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let managerToken, staffId

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  managerToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  const db = getDB()
  staffId = db.prepare("INSERT INTO staff(full_name,is_active,salary) VALUES('F3 Personel',1,30000)").run().lastInsertRowid
})

const auth = req => req.set('Authorization', `Bearer ${managerToken}`)

describe('F3 — onay durum geçiş guard\'ları', () => {
  it('dönem onayı submit olmadan approve edilemez (draft→approved 409)', async () => {
    const res = await auth(request(app).patch('/api/shifts/puantaj/approval/period'))
      .send({ period: '2026-08', action: 'approve' })
    expect(res.status).toBe(409)
  })

  it('zaten onaylı izin tekrar onaylanamaz (409)', async () => {
    const db = getDB()
    const id = db.prepare(`INSERT INTO leave_requests(staff_id,leave_type,start_date,end_date,total_days,status,version)
      VALUES(?,'annual','2026-08-10','2026-08-11',2,'approved',1)`).run(staffId).lastInsertRowid
    const res = await auth(request(app).patch(`/api/shifts/leave/${id}`)).send({ status: 'approved' })
    expect(res.status).toBe(409)
  })

  it('zaten onaylı mesai talebi tekrar approve edilemez (409)', async () => {
    const db = getDB()
    const id = db.prepare(`INSERT INTO overtime_requests(staff_id,work_date,requested_hours,reason,status,version)
      VALUES(?,'2026-08-12',3,'test','approved',1)`).run(staffId).lastInsertRowid
    const res = await auth(request(app).patch(`/api/shifts/overtime/requests/${id}`)).send({ status: 'approved' })
    expect(res.status).toBe(409)
  })
})
