// Elle yazımda iş kuralı uyarıları (>6 gün kesintisiz çalışma, <11 saat dinlenme).
// Uyarılar yazımı engellemez; POST /shifts/schedule yanıtında `compliance` olarak döner.
import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { scheduleComplianceWarnings } from './service.js'

// Seed vardiya tanımları: 1 Gündüz 8-17, 2 Akşam 15-24, 3 Gece 0-8
const GUNDUZ = 1
const AKSAM = 2

let token
let staffA
let staffB

const day = (n) => `2027-03-${String(n).padStart(2, '0')}`
const entry = (staffId, n, shiftDefId = GUNDUZ, status = 'scheduled') => ({
  staff_id: staffId, work_date: day(n), shift_def_id: status === 'scheduled' ? shiftDefId : null, status,
})
const post = (entries) => request(app).post('/api/shifts/schedule')
  .set('Authorization', `Bearer ${token}`).send({ entries })

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const db = getDB()
  staffA = Number(db.prepare("INSERT INTO staff(full_name, is_active) VALUES('Uyum Test A', 1)").run().lastInsertRowid)
  staffB = Number(db.prepare("INSERT INTO staff(full_name, is_active) VALUES('Uyum Test B', 1)").run().lastInsertRowid)
  token = (await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })).body.token
})

describe('POST /shifts/schedule — uyum uyarıları', () => {
  it('6 gün çalışma uyarı üretmez', async () => {
    const r = await post([1, 2, 3, 4, 5, 6].map(n => entry(staffA, n)))
    expect(r.status).toBe(200)
    expect(r.body.compliance).toEqual([])
  })

  it('7. günü eklemek kesintisiz çalışma uyarısı verir ama yazımı engellemez', async () => {
    const r = await post([entry(staffA, 7)])
    expect(r.status).toBe(200)
    const w = r.body.compliance.find(x => x.type === 'consecutive')
    expect(w).toBeDefined()
    expect(w.staff_id).toBe(staffA)
    expect(w.date).toBe(day(1))
    expect(w.end_date).toBe(day(7))
    expect(w.days).toBe(7)
    expect(w.message).toContain('Uyum Test A')
    const saved = getDB().prepare('SELECT status FROM shift_schedule WHERE staff_id=? AND work_date=?').get(staffA, day(7))
    expect(saved.status).toBe('scheduled')
  })

  it('araya izin günü konunca uyarı kalkar', async () => {
    const r = await post([entry(staffA, 4, null, 'off')])
    expect(r.status).toBe(200)
    expect(r.body.compliance.filter(x => x.type === 'consecutive')).toEqual([])
  })

  it('akşam (15-24) sonrası ertesi gün gündüz (08) → 8 saat dinlenme uyarısı', async () => {
    const r = await post([entry(staffB, 10, AKSAM), entry(staffB, 11, GUNDUZ)])
    expect(r.status).toBe(200)
    const w = r.body.compliance.find(x => x.type === 'rest')
    expect(w).toBeDefined()
    expect(w.staff_id).toBe(staffB)
    expect(w.date).toBe(day(11))
    expect(w.message).toMatch(/8 saat/)
  })

  it('yalnız önceki günü yazmak da sonraki güne dokunan dinlenme ihlalini yakalar', async () => {
    await post([entry(staffB, 20, GUNDUZ), entry(staffB, 21, GUNDUZ)])
    const r = await post([entry(staffB, 20, AKSAM)])
    expect(r.body.compliance.some(x => x.type === 'rest' && x.date === day(21))).toBe(true)
  })

  it('yazımla ilgisiz eski ihlal tekrar raporlanmaz', async () => {
    const r = await post([entry(staffB, 28, GUNDUZ)])
    expect(r.status).toBe(200)
    expect(r.body.compliance).toEqual([])
  })

  it('gündüz → gündüz normal dinlenme uyarı vermez', async () => {
    const r = await post([entry(staffB, 14, GUNDUZ), entry(staffB, 15, GUNDUZ)])
    expect(r.body.compliance.filter(x => x.type === 'rest')).toEqual([])
  })
})

describe('scheduleComplianceWarnings', () => {
  it('boş ya da bozuk girdide boş liste döner', () => {
    expect(scheduleComplianceWarnings([])).toEqual([])
    expect(scheduleComplianceWarnings(undefined)).toEqual([])
    expect(scheduleComplianceWarnings([{ staff_id: 'x', work_date: 'bozuk' }])).toEqual([])
  })
})
