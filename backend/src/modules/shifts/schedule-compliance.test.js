// Elle yazımda iş kuralı uyarıları (>6 gün kesintisiz çalışma, <11 saat dinlenme).
// Uyarılar yazımı engellemez; POST /shifts/schedule yanıtında `compliance` olarak döner.
import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { scheduleComplianceWarnings, shiftHourValue, shiftHourClock, rotationWarnings } from './service.js'

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

describe('vardiya saati iki biçim (8 ve "08:00")', () => {
  it('shiftHourValue tamsayı ve HH:MM okur', () => {
    expect(shiftHourValue(8)).toBe(8)
    expect(shiftHourValue('8')).toBe(8)
    expect(shiftHourValue('08:00')).toBe(8)
    expect(shiftHourValue('07:30')).toBe(7.5)
    expect(shiftHourValue('24')).toBe(24)
    expect(shiftHourValue('')).toBe(null)
    expect(shiftHourValue('sabah')).toBe(null)
    expect(shiftHourValue('25:00')).toBe(null)
  })

  it('shiftHourClock HH:MM üretir, 24 → 00:00', () => {
    expect(shiftHourClock(8)).toBe('08:00')
    expect(shiftHourClock('07:30')).toBe('07:30')
    expect(shiftHourClock(24)).toBe('00:00')
    expect(shiftHourClock(null)).toBe(null)
  })

  it('metin saatli tanımlarda da dinlenme ihlali yakalanır (önceden NaN → sessiz)', () => {
    const defs = {
      10: { id: 10, name: 'Akşam', start_hour: '15:00', end_hour: '23:00' },
      11: { id: 11, name: 'Sabah', start_hour: '06:00', end_hour: '14:00' },
    }
    const w = rotationWarnings([
      { staff_id: 1, work_date: '2027-05-01', shift_def_id: 10, status: 'scheduled' },
      { staff_id: 1, work_date: '2027-05-02', shift_def_id: 11, status: 'scheduled' },
    ], defs, { 1: 'Metin Saat' })
    expect(w).toHaveLength(1)
    expect(w[0].type).toBe('rest')
    expect(w[0].message).toMatch(/7 saat/)
  })
})

describe('vardiya parçası — saat verilmezse tanımdan alınır', () => {
  it('tamsayı saatli tanım (Gündüz 8-17) ile saat göndermeden parça açılır', async () => {
    const r = await request(app).post('/api/shifts/schedule/segments')
      .set('Authorization', `Bearer ${token}`)
      .send({ staff_id: staffA, work_date: day(25), shift_def_id: GUNDUZ, start_time: '', end_time: '' })
    expect(r.status).toBe(201)
    expect(r.body.row).toMatchObject({ start_time: '08:00', end_time: '17:00' })
  })
})
