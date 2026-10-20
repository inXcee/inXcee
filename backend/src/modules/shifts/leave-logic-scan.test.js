import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { importSchedule } from './import.js'

// İK / izin mantık taraması (Ekim 2026) — her blok bir kanıtlanmış hatanın regresyon testi.

let managerToken
const auth = req => req.set('Authorization', `Bearer ${managerToken}`)
const newStaff = (name, extra = {}) => getDB().prepare(
  'INSERT INTO staff(full_name, is_active, hire_date) VALUES(?, 1, ?)',
).run(name, extra.hire_date ?? null).lastInsertRowid

async function createLeave(staffId, start, end, type = 'annual') {
  const res = await auth(request(app).post('/api/shifts/leave'))
    .send({ staff_id: staffId, leave_type: type, start_date: start, end_date: end })
  return res
}
const approve = id => auth(request(app).patch(`/api/shifts/leave/${id}`)).send({ status: 'approved' })

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  managerToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
})

describe('izin onayı — bakiye kontrolü onaylı açılış bakiyesini kullanır', () => {
  it('açılışı 30 gün olan kişinin 20 günlük izni onaylanır (eskiden sayaçtaki varsayılan 15 ile reddediliyordu)', async () => {
    const staffId = newStaff('Açılış Otuz', { hire_date: '2020-03-01' })
    getDB().prepare(`INSERT INTO leave_opening_balances(staff_id, as_of_date, days, status)
      VALUES(?, '2026-01-01', 30, 'approved')`).run(staffId)
    const created = await createLeave(staffId, '2026-11-02', '2026-11-21') // 20 gün
    expect(created.status).toBe(201)
    const res = await approve(created.body.id)
    expect(res.status).toBe(200)
    expect(res.body.row.status).toBe('approved')
  })

  it('açılış bakiyesini aşan izin, ekranın gösterdiği kalanla reddedilir', async () => {
    const staffId = newStaff('Açılış Beş', { hire_date: '2020-03-01' })
    getDB().prepare(`INSERT INTO leave_opening_balances(staff_id, as_of_date, days, status)
      VALUES(?, '2026-04-01', 5, 'approved')`).run(staffId)
    const created = await createLeave(staffId, '2026-11-02', '2026-11-11') // 10 gün
    const res = await approve(created.body.id)
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/kalan: 5 gün/)
  })
})

describe('izin onayı — reddedilmiş talep yeniden onaylanırken çakışma', () => {
  it('aynı günlere sonradan açılan onaylı izin varken eski (reddedilmiş) talep onaylanamaz', async () => {
    const staffId = newStaff('Çakışma Kişi')
    const first = await createLeave(staffId, '2026-08-03', '2026-08-04', 'emergency')
    expect((await auth(request(app).patch(`/api/shifts/leave/${first.body.id}`)).send({ status: 'rejected' })).status).toBe(200)
    const second = await createLeave(staffId, '2026-08-03', '2026-08-04', 'emergency')
    expect(second.status).toBe(201)
    expect((await approve(second.body.id)).status).toBe(200)

    const res = await approve(first.body.id)
    expect(res.status).toBe(409)
    expect(res.body.conflicting_leave_request_id).toBe(second.body.id)
    const bal = getDB().prepare('SELECT emergency_used FROM leave_balance WHERE staff_id=? AND year=2026').get(staffId)
    expect(bal.emergency_used).toBe(2) // iki kez düşülmedi
  })
})

describe('bekleyen izin talebinin iptali çizelgeye dokunmaz', () => {
  it('elle girilmiş izin hücresi bekleyen talep silinince kaybolmaz', async () => {
    const staffId = newStaff('Bekleyen İptal')
    getDB().prepare(`INSERT INTO shift_schedule(staff_id, work_date, status, leave_type)
      VALUES(?, '2026-09-14', 'on_leave', 'sick')`).run(staffId)
    const created = await createLeave(staffId, '2026-09-14', '2026-09-15', 'emergency')
    expect(created.status).toBe(201)
    const del = await auth(request(app).delete(`/api/shifts/leave/${created.body.id}`))
    expect(del.status).toBe(200)
    const cell = getDB().prepare("SELECT status, leave_type FROM shift_schedule WHERE staff_id=? AND work_date='2026-09-14'").get(staffId)
    expect(cell).toMatchObject({ status: 'on_leave', leave_type: 'sick' })
  })
})

describe('izin talebi tarih doğrulaması', () => {
  it('takvimde olmayan ya da dolgusuz tarih reddedilir', async () => {
    const staffId = newStaff('Tarih Kişi')
    expect((await createLeave(staffId, '2026-02-30', '2026-03-02')).status).toBe(400)
    expect((await createLeave(staffId, '2026-10-5', '2026-10-07')).status).toBe(400)
    expect(getDB().prepare('SELECT COUNT(*) c FROM leave_requests WHERE staff_id=?').get(staffId).c).toBe(0)
  })
})

describe('personel rehberi kalan izni tek kaynaktan', () => {
  it('onaylı açılış bakiyesi (devir) rehberde de görünür', async () => {
    const staffId = newStaff('Rehber Devirli', { hire_date: '2023-03-01' })
    getDB().prepare(`INSERT INTO leave_opening_balances(staff_id, as_of_date, days, status)
      VALUES(?, '2026-04-01', 25, 'approved')`).run(staffId)
    const res = await auth(request(app).get(`/api/shifts/staff?directory=1&search=${encodeURIComponent('Rehber Devirli')}`))
    expect(res.status).toBe(200)
    const balance = await auth(request(app).get(`/api/shifts/leave/annual-balance/${staffId}`))
    expect(res.body[0].annual_leave_remaining).toBe(balance.body.remaining)
    expect(res.body[0].annual_leave_remaining).toBe(25)
  })
})

describe('Excel aktarımı — mevcut izinle çakışan günler ikinci kez izin açmaz', () => {
  const cell = (date, leaveType = 'annual') => ({ date, startHour: null, endHour: null, status: 'on_leave', leaveType, raw: 'YILLIK İZİN' })

  it('elle onaylanmış 3–9 izin varken Excel 5–11 koşusu yalnız 10–11 için talep açar', async () => {
    const staffId = newStaff('KAPSAMA EXCELKİŞİ')
    const manual = await createLeave(staffId, '2026-08-03', '2026-08-09', 'emergency')
    expect((await approve(manual.body.id)).status).toBe(200)

    const days = ['2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08', '2026-08-09', '2026-08-10', '2026-08-11']
    const report = importSchedule({
      weekDates: days,
      rows: [{ name: 'KAPSAMA EXCELKİŞİ', deptName: 'KAPSAMA EXCELDEPT', cells: days.map(d => cell(d)) }],
      unrecognized: [],
    }, null)
    expect(report.leaves.created).toBe(1)
    const annual = getDB().prepare(`SELECT start_date, end_date, total_days FROM leave_requests
      WHERE staff_id=? AND leave_type='annual'`).all(staffId)
    expect(annual).toEqual([{ start_date: '2026-08-10', end_date: '2026-08-11', total_days: 2 }])
    const bal = getDB().prepare('SELECT annual_used FROM leave_balance WHERE staff_id=? AND year=2026').get(staffId)
    expect(bal.annual_used).toBe(2)
  })

  it('düzeltilmiş çizelgenin yeniden aktarımı (5–9 → 5–8) aynı günler için ikinci izin açmaz', () => {
    const staffId = newStaff('YENİDEN EXCELKİŞİ')
    const run = days => importSchedule({
      weekDates: days,
      rows: [{ name: 'YENİDEN EXCELKİŞİ', deptName: 'KAPSAMA EXCELDEPT', cells: days.map(d => cell(d)) }],
      unrecognized: [],
    }, null)
    run(['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25'])
    const second = run(['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24'])
    expect(second.leaves.created).toBe(0)
    const total = getDB().prepare(`SELECT COALESCE(SUM(total_days),0) d FROM leave_requests
      WHERE staff_id=? AND leave_type='annual' AND status='approved'`).get(staffId).d
    expect(total).toBe(5)
  })
})
