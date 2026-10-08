import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

// 112: Aİ (alacak izin / denkleştirme) ve İ (izinli) puantaj kodları vardı ama leave_requests CHECK'i
// 'owed' / 'other' türünü reddediyordu → Excel'deki "A.İ" izinleri YYS'ye hiç girilemiyordu.

let supervisorToken, staffId

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  supervisorToken = (await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })).body.token
  staffId = getDB().prepare("INSERT INTO staff(full_name,is_active,salary) VALUES('Alacak Personel',1,30000)").run().lastInsertRowid
})

const auth = req => req.set('Authorization', `Bearer ${supervisorToken}`)

describe('112 — alacak / diğer izin türleri', () => {
  it('şema owed ve other türünü kabul eder, indeks ve trigger korunur', () => {
    const db = getDB()
    const sql = db.prepare("SELECT sql FROM sqlite_master WHERE name='leave_requests'").get().sql
    expect(sql).toContain("'owed'")
    expect(sql).toContain("'other'")
    const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='leave_requests'").all().map(r => r.name)
    expect(idx).toEqual(expect.arrayContaining(['idx_leave_requests_status', 'idx_leave_requests_tracking_period']))
    const id = db.prepare(`INSERT INTO leave_requests(staff_id,leave_type,start_date,end_date,total_days)
      VALUES(?,'other','2026-01-05','2026-01-05',1)`).run(staffId).lastInsertRowid
    expect(db.prepare('SELECT updated_at FROM leave_requests WHERE id=?').get(id).updated_at).toBeTruthy()
  })

  it('alacak izni oluşturulup onaylanınca çizelgeye Aİ koduyla işlenir', async () => {
    const created = await auth(request(app).post('/api/shifts/leave')).send({
      staff_id: staffId, leave_type: 'owed', start_date: '2026-10-10', end_date: '2026-10-10', reason: 'Excel çizelgesi: A.İ',
    })
    expect(created.status).toBe(201)
    const approved = await auth(request(app).patch(`/api/shifts/leave/${created.body.id}`)).send({ status: 'approved' })
    expect(approved.status).toBe(200)
    const cell = getDB().prepare(`SELECT ss.status, ss.leave_type, pc.code FROM shift_schedule ss
      LEFT JOIN puantaj_codes pc ON pc.id=ss.puantaj_code_id WHERE ss.staff_id=? AND ss.work_date='2026-10-10'`).get(staffId)
    expect(cell).toMatchObject({ status: 'on_leave', leave_type: 'owed', code: 'Aİ' })
  })

  it('gerekçesiz alacak izni onaylanmaz', async () => {
    const created = await auth(request(app).post('/api/shifts/leave')).send({
      staff_id: staffId, leave_type: 'owed', start_date: '2026-10-20', end_date: '2026-10-20',
    })
    const res = await auth(request(app).patch(`/api/shifts/leave/${created.body.id}`)).send({ status: 'approved' })
    expect(res.status).toBe(409)
  })
})
