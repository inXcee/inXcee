import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

const lowTokens = {}
let staffId

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  for (const username of ['teknik', 'camasir', 'meydanci']) {
    lowTokens[username] = (await request(app).post('/api/auth/login').send({ username, password: 'admin123' })).body.token
  }
  const db = getDB()
  staffId = db.prepare("INSERT INTO staff(full_name,is_active,salary,tc_no) VALUES('Test Personel',1,30000,'12345678901')").run().lastInsertRowid
})

describe('F1 — shifts yetki korumaları (düşük yetkili rol 403 almalı)', () => {
  const auth = (req, username = 'teknik') => req.set('Authorization', `Bearer ${lowTokens[username]}`)

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

  const protectedReads = () => [
    ['/api/shifts/departments', 'departman tanımları'],
    ['/api/shifts/definitions', 'vardiya tanımları'],
    ['/api/shifts/schedule?week=2026-07-13', 'vardiya çizelgesi'],
    ['/api/shifts/personnel?date=2026-07-16', 'personel durumu'],
    [`/api/shifts/leave/balance/${staffId}`, 'izin bakiyesi'],
    ['/api/shifts/leave', 'izin listesi'],
    ['/api/shifts/request-documents/leave/1', 'talep belgeleri'],
    ['/api/shifts/overtime/summary?month=2026-07', 'mesai özeti'],
    ['/api/shifts/overtime', 'mesai listesi'],
    ['/api/shifts/overtime/requests', 'mesai talepleri'],
    ['/api/shifts/attendance?date=2026-07-16', 'devam kayıtları'],
    ['/api/shifts/puantaj?month=2026-07', 'bordro ve puantaj'],
    ['/api/shifts/puantaj/export/csv?month=2026-07', 'puantaj CSV'],
    ['/api/shifts/puantaj/days?month=2026-07', 'puantaj günleri'],
    [`/api/shifts/puantaj/${staffId}/days?month=2026-07`, 'personel puantaj detayı'],
    ['/api/shifts/statistics?date=2026-07-16', 'vardiya istatistikleri'],
    ['/api/shifts/coverage?from=2026-07-13&to=2026-07-19', 'kapsama verileri'],
    ['/api/shifts/swaps', 'takas talepleri'],
  ]

  it.each(['teknik', 'camasir', 'meydanci'])(
    '%s rolü yönetim okumalarına erişemez',
    async username => {
      for (const [url, label] of protectedReads()) {
        const res = await auth(request(app).get(url), username)
        expect(res.status, `${username}: ${label}`).toBe(403)
      }
    },
  )

  it.each(['teknik', 'camasir', 'meydanci'])(
    '%s rolü başka talebe belge yükleyemez',
    async username => {
      const res = await auth(request(app).post('/api/shifts/request-documents/leave/1'), username)
      expect(res.status).toBe(403)
    },
  )
})
