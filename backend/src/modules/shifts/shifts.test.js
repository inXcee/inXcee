import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { calcTax, workDaysInMonth, puantajService } from './service.js'
import { guessGender } from './nameGender.js'
import { analyzeAnomalies } from './analyze.js'
import { groupConsecutive } from './import.js'

let managerToken, shiftToken
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  managerToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  shiftToken = (await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })).body.token
})

describe('Puantaj onay akisi', () => {
  let staffId
  let lockDeptId
  let lockStaffId

  beforeAll(() => {
    staffId = getDB().prepare("INSERT INTO staff(full_name, is_active, salary) VALUES('Onay Test Personel', 1, 30000)")
      .run().lastInsertRowid
    lockDeptId = getDB().prepare("INSERT INTO departments(name, color_class) VALUES('Puantaj Kilit Test','test')")
      .run().lastInsertRowid
    lockStaffId = getDB().prepare("INSERT INTO staff(full_name, department_id, is_active, salary) VALUES('Kilit Test Personel', ?, 1, 30000)")
      .run(lockDeptId).lastInsertRowid
  })

  async function approveWholeMonth(period) {
    const [year, mon] = period.split('-').map(Number)
    const lastDay = new Date(year, mon, 0).getDate()
    const activeStaff = getDB().prepare('SELECT id, department_id FROM staff WHERE is_active = 1').all()
    for (let day = 1; day <= lastDay; day += 1) {
      const workDate = `${period}-${String(day).padStart(2, '0')}`
      const isSunday = new Date(year, mon - 1, day).getDay() === 0
      if (!isSunday) {
        const scheduleStatus = day === 1 ? 'off' : 'worked'
        const insert = getDB().prepare(`
          INSERT INTO shift_schedule(staff_id, dept_id, work_date, status)
          VALUES(?, ?, ?, ?)
        `)
        activeStaff.forEach(staff => {
          insert.run(staff.id, staff.department_id || null, workDate, scheduleStatus)
        })
      }
      const dayApproval = await request(app)
        .patch('/api/shifts/puantaj/approval/day')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ period, work_date: workDate, status: 'approved' })
      expect(dayApproval.status).toBe(200)
    }
  }

  it('onay ekrani ayin tum gunlerini taslak olarak dondurur', async () => {
    const res = await request(app)
      .get('/api/shifts/puantaj/approval?month=2027-04')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
    expect(res.body.period_approval.status).toBe('draft')
    expect(res.body.daily_approvals).toHaveLength(30)
    expect(res.body.daily_approvals[0].work_date).toBe('2027-04-01')
  })

  it('supervizor puantaji kontrole gonderir ve olay gecmisi olusur', async () => {
    const submit = await request(app)
      .post('/api/shifts/puantaj/approval/submit')
      .set('Authorization', `Bearer ${shiftToken}`)
      .send({ period: '2027-04', note: 'Nisan kontrol' })
    expect(submit.status).toBe(200)
    expect(submit.body.status).toBe('submitted')

    const res = await request(app)
      .get('/api/shifts/puantaj/approval?month=2027-04')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.body.period_approval.status).toBe('submitted')
    expect(res.body.events.some(e => e.action === 'submit')).toBe(true)
  })

  it('gun onayini sadece mudur verebilir; sorunlu gun 409, force ile gecer (P1b)', async () => {
    const supervisor = await request(app)
      .patch('/api/shifts/puantaj/approval/day')
      .set('Authorization', `Bearer ${shiftToken}`)
      .send({ period: '2027-04', work_date: '2027-04-05', status: 'approved' })
    expect(supervisor.status).toBe(403)

    // 2027-04-05 verisi bos → guard 409 + sorun listesi
    const blocked = await request(app)
      .patch('/api/shifts/puantaj/approval/day')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ period: '2027-04', work_date: '2027-04-05', status: 'approved', note: 'Gun tamam' })
    expect(blocked.status).toBe(409)
    expect(blocked.body.details.problems.length).toBeGreaterThan(0)

    // Mudur force ile zorla onaylar; olay notuna islenir
    const forced = await request(app)
      .patch('/api/shifts/puantaj/approval/day')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ period: '2027-04', work_date: '2027-04-05', status: 'approved', note: 'Gun tamam', force: true })
    expect(forced.status).toBe(200)
    expect(forced.body.status).toBe('approved')

    const res = await request(app)
      .get('/api/shifts/puantaj/approval?month=2027-04')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.body.events.some(e => (e.note || '').includes('zorla onaylandi'))).toBe(true)
  })

  it('puantaj kod kayit sistemi: yerlesikler + ozel kod CRUD + yeni izin turu yazilabilir (042)', async () => {
    const list = await request(app).get('/api/shifts/puantaj/codes').set('Authorization', `Bearer ${shiftToken}`)
    expect(list.status).toBe(200)
    const codes = list.body.map(c => c.code)
    expect(codes).toEqual(expect.arrayContaining(['N', 'H', 'Yİ', 'R', 'Üİ', 'İ', 'Aİ', 'Y', 'P']))
    const owedCode = list.body.find(c => c.code === 'Aİ')
    expect(owedCode.leave_type).toBe('owed')
    expect(owedCode.is_builtin).toBe(1)

    // Yeni izin turu (owed) shift_schedule'a yazilabilir (enum CHECK kalkti)
    const staff = getDB().prepare('SELECT id FROM staff WHERE is_active=1 LIMIT 1').get()
    const write = await request(app).post('/api/shifts/schedule').set('Authorization', `Bearer ${managerToken}`)
      .send({ entries: [{ staff_id: staff.id, work_date: '2027-09-06', status: 'on_leave', leave_type: 'owed' }] })
    expect(write.status).toBe(200)

    // Ozel kod olustur / guncelle / sil
    const created = await request(app).post('/api/shifts/puantaj/codes').set('Authorization', `Bearer ${managerToken}`)
      .send({ code: 'eğ', label: 'Eğitim', color_hex: '#00AAFF', status: 'on_leave' })
    expect(created.status).toBe(201)
    const afterCreate = await request(app).get('/api/shifts/puantaj/codes').set('Authorization', `Bearer ${managerToken}`)
    const custom = afterCreate.body.find(c => c.id === created.body.id)
    expect(custom.code).toBe('EĞ') // buyuk harfe cevrilir
    expect(custom.color_hex).toBe('00AAFF')

    const upd = await request(app).put(`/api/shifts/puantaj/codes/${created.body.id}`).set('Authorization', `Bearer ${managerToken}`)
      .send({ color_hex: '#FF0000', label: 'Eğitim İzni' })
    expect(upd.status).toBe(200)
    expect(upd.body.color_hex).toBe('FF0000')

    const dup = await request(app).post('/api/shifts/puantaj/codes').set('Authorization', `Bearer ${managerToken}`)
      .send({ code: 'N', label: 'Kopya', status: 'worked' })
    expect(dup.status).toBe(400)

    const delBuiltin = await request(app).delete(`/api/shifts/puantaj/codes/${owedCode.id}`).set('Authorization', `Bearer ${managerToken}`)
    expect(delBuiltin.status).toBe(400)
    const delCustom = await request(app).delete(`/api/shifts/puantaj/codes/${created.body.id}`).set('Authorization', `Bearer ${managerToken}`)
    expect(delCustom.status).toBe(200)
  })

  it('departman onay matrisi durum ve sayaclari dondurur (P4)', async () => {
    const period = '2027-08'
    // lockDeptId departmani icin gonder + bir gun onayla (veri yok → force)
    await request(app).post('/api/shifts/puantaj/approval/submit')
      .set('Authorization', `Bearer ${shiftToken}`).send({ period, dept_id: lockDeptId })
    await request(app).patch('/api/shifts/puantaj/approval/day')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ period, work_date: '2027-08-03', dept_id: lockDeptId, status: 'approved', force: true })

    const res = await request(app)
      .get(`/api/shifts/puantaj/approval/overview?month=${period}`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
    expect(res.body.period).toBe(period)
    expect(res.body.total_days).toBe(31)
    expect(res.body.all.period_status).toBe('draft')

    const dept = res.body.departments.find(d => d.dept_id === lockDeptId)
    expect(dept).toBeTruthy()
    expect(dept.staff_count).toBeGreaterThanOrEqual(1)
    expect(dept.period_status).toBe('submitted')
    expect(dept.approved_days).toBe(1)
    expect(dept.issues.empty).toBeGreaterThan(0) // ay bos → eksik gunler gorunur

    const noMonth = await request(app)
      .get('/api/shifts/puantaj/approval/overview')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(noMonth.status).toBe(400)
  })

  it('onay akisi bildirimleri: submit mudure, return amire (P2)', async () => {
    const period = '2027-07'
    await request(app).post('/api/shifts/puantaj/approval/submit')
      .set('Authorization', `Bearer ${shiftToken}`).send({ period, note: 'Temmuz kontrol' })
    const managerNotif = getDB().prepare(
      "SELECT * FROM notifications WHERE target_role='campus_manager' AND message LIKE '%2027-07%' ORDER BY id DESC"
    ).get()
    expect(managerNotif).toBeTruthy()
    expect(managerNotif.message).toContain('kontrole gönderildi')

    await request(app).patch('/api/shifts/puantaj/approval/day')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ period, work_date: '2027-07-05', status: 'returned', note: 'Eksik veri' })
    const supNotif = getDB().prepare(
      "SELECT * FROM notifications WHERE target_role='shift_supervisor' AND message LIKE '%2027-07-05%' ORDER BY id DESC"
    ).get()
    expect(supNotif).toBeTruthy()
    expect(supNotif.message).toContain('geri gönderildi')

    await request(app).patch('/api/shifts/puantaj/approval/period')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ period, action: 'return', note: 'Ay eksik' })
    const periodNotif = getDB().prepare(
      "SELECT * FROM notifications WHERE target_role='shift_supervisor' AND message LIKE '%2027-07 %' ORDER BY id DESC"
    ).get()
    expect(periodNotif).toBeTruthy()
  })

  it('onayli gune veri girisi gun onayini beklemeye dusurur (P1a)', async () => {
    const period = '2027-06'
    const workDate = '2027-06-02'
    const activeStaff = getDB().prepare('SELECT id, department_id FROM staff WHERE is_active = 1').all()
    const insert = getDB().prepare('INSERT INTO shift_schedule(staff_id, dept_id, work_date, status) VALUES(?, ?, ?, ?)')
    activeStaff.forEach(s => insert.run(s.id, s.department_id || null, workDate, 'worked'))

    const approve = await request(app)
      .patch('/api/shifts/puantaj/approval/day')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ period, work_date: workDate, status: 'approved' })
    expect(approve.status).toBe(200)

    // Donemi de onayla — veri degisince submitted'a dusmeli
    await request(app).post('/api/shifts/puantaj/approval/submit')
      .set('Authorization', `Bearer ${shiftToken}`).send({ period })
    const periodApprove = await request(app)
      .patch('/api/shifts/puantaj/approval/period')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ period, action: 'approve' })
    expect(periodApprove.status).toBe(200)

    // Onayli gune yazim → gun onayi pending, donem submitted, data_changed olaylari
    const write = await request(app)
      .post('/api/shifts/schedule')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ entries: [{ staff_id: staffId, work_date: workDate, status: 'off' }] })
    expect(write.status).toBe(200)
    expect(write.body.approvalsReset).toBeGreaterThanOrEqual(1)

    const res = await request(app)
      .get(`/api/shifts/puantaj/approval?month=${period}`)
      .set('Authorization', `Bearer ${managerToken}`)
    const day = res.body.daily_approvals.find(d => d.work_date === workDate)
    expect(day.status).toBe('pending')
    expect(res.body.period_approval.status).toBe('submitted')
    expect(res.body.events.filter(e => e.action === 'data_changed').length).toBeGreaterThanOrEqual(2)

    // Silme yolu da dusurur: tekrar onayla → DELETE → pending
    const reapprove = await request(app)
      .patch('/api/shifts/puantaj/approval/day')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ period, work_date: workDate, status: 'approved', force: true })
    expect(reapprove.status).toBe(200)
    const del = await request(app)
      .delete(`/api/shifts/schedule/${staffId}/${workDate}`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(del.status).toBe(200)
    const after = await request(app)
      .get(`/api/shifts/puantaj/approval?month=${period}`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(after.body.daily_approvals.find(d => d.work_date === workDate).status).toBe('pending')
  })

  it('eksik kapanis varken mudur puantaji kilitleyemez', async () => {
    const lock = await request(app)
      .patch('/api/shifts/puantaj/approval/period')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ period: '2027-04', action: 'lock', note: 'Nisan kapandi' })
    expect(lock.status).toBe(409)
    expect(lock.body.error).toContain('Puantaj kilitlenemez')
  })

  it('departman filtresi ile global ay kilidi atilamaz', async () => {
    const lock = await request(app)
      .patch('/api/shifts/puantaj/approval/period')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ period: '2027-04', dept_id: lockDeptId, action: 'lock' })
    expect(lock.status).toBe(400)
    expect(lock.body.error).toContain('departman filtresini kaldirin')
  })

  it('mudur puantaji tum kontroller tamamlaninca kilitler ve aya yazim 423 doner', async () => {
    await request(app)
      .post('/api/shifts/puantaj/approval/submit')
      .set('Authorization', `Bearer ${shiftToken}`)
      .send({ period: '2027-05', note: 'Mayis kontrol' })

    await approveWholeMonth('2027-05')

    const lock = await request(app)
      .patch('/api/shifts/puantaj/approval/period')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ period: '2027-05', action: 'lock', note: 'Mayis kapandi' })
    expect(lock.status).toBe(200)
    expect(lock.body.status).toBe('locked')

    const write = await request(app)
      .post('/api/shifts/schedule')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ entries: [{ staff_id: lockStaffId, work_date: '2027-05-10', status: 'worked' }] })
    expect(write.status).toBe(423)

    await request(app)
      .patch('/api/shifts/puantaj/approval/period')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ period: '2027-05', action: 'reopen' })
  })
})

describe('Shifts', () => {
  it('GET /departments returns array', async () => {
    const res = await request(app).get('/api/shifts/departments').set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('GET /definitions returns array', async () => {
    const res = await request(app).get('/api/shifts/definitions').set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('GET /schedule returns data for a week', async () => {
    const res = await request(app).get('/api/shifts/schedule?week=2026-03-16').set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toBeTruthy()
  })

  it('GET /personnel returns array', async () => {
    const res = await request(app).get('/api/shifts/personnel?date=2026-03-16').set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('GET /statistics returns object', async () => {
    const res = await request(app).get('/api/shifts/statistics?date=2026-03-16').set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    expect(typeof res.body).toBe('object')
  })

  it('POST /departments creates a department (manager)', async () => {
    const res = await request(app)
      .post('/api/shifts/departments')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ name: 'Test Departman', color_class: 'bg-blue-500', description: 'Test açıklama' })
    expect(res.status).toBe(201)
    expect(res.body.id).toBeTruthy()
  })

  it('POST /definitions creates a shift definition (manager)', async () => {
    const res = await request(app)
      .post('/api/shifts/definitions')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ name: 'Test Vardiya', start_hour: '08:00', end_hour: '16:00', color_class: 'bg-green-500' })
    expect(res.status).toBe(201)
    expect(res.body.id).toBeTruthy()
  })

  it('vardiya tanımı min_staff (kadro hedefi) ile oluşur ve güncellenir (X4)', async () => {
    const created = await request(app).post('/api/shifts/definitions').set('Authorization', `Bearer ${managerToken}`)
      .send({ name: 'X4 Kapsama Vardiya', start_hour: 8, end_hour: 16, color_class: 'bg-blue-500', min_staff: 3 })
    expect(created.status).toBe(201)
    const def = (await request(app).get('/api/shifts/definitions').set('Authorization', `Bearer ${managerToken}`)).body.find(d => d.id === created.body.id)
    expect(def.min_staff).toBe(3)
    await request(app).put(`/api/shifts/definitions/${created.body.id}`).set('Authorization', `Bearer ${managerToken}`).send({ min_staff: 5 })
    const def2 = (await request(app).get('/api/shifts/definitions').set('Authorization', `Bearer ${managerToken}`)).body.find(d => d.id === created.body.id)
    expect(def2.min_staff).toBe(5)
  })

  it('GET /coverage vardiya listesi (min_staff dahil) + gün×vardiya sayımları döner (X4)', async () => {
    const res = await request(app).get('/api/shifts/coverage?from=2026-07-06&to=2026-07-12').set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.shifts)).toBe(true)
    expect(Array.isArray(res.body.counts)).toBe(true)
    expect(res.body.shifts[0]).toHaveProperty('min_staff')
    const bad = await request(app).get('/api/shifts/coverage').set('Authorization', `Bearer ${managerToken}`)
    expect(bad.status).toBe(400)
  })

  it('onaylı izin gününe vardiya varsayılan engellenir, müdür gerekçesiyle istisna verir', async () => {
    const db = getDB()
    const staff = db.prepare('SELECT id FROM staff WHERE is_active=1 LIMIT 1').get()
    const shiftDef = db.prepare('SELECT id FROM shift_definitions LIMIT 1').get()
    db.prepare("INSERT INTO leave_requests(staff_id, leave_type, start_date, end_date, total_days, status) VALUES(?,?,?,?,?, 'approved')")
      .run(staff.id, 'annual', '2026-08-10', '2026-08-12', 3)
    const blocked = await request(app).post('/api/shifts/schedule').set('Authorization', `Bearer ${managerToken}`)
      .send({ entries: [{ staff_id: staff.id, work_date: '2026-08-11', shift_def_id: shiftDef.id, status: 'scheduled' }] })
    expect(blocked.status).toBe(409)
    expect(blocked.body.override_required).toBe(true)
    expect(blocked.body.warnings.some(w => w.kind === 'leave_overwrite' && w.staff_id === staff.id)).toBe(true)
    expect(db.prepare('SELECT 1 FROM shift_schedule WHERE staff_id=? AND work_date=?').get(staff.id, '2026-08-11')).toBeFalsy()

    const overridden = await request(app).post('/api/shifts/schedule').set('Authorization', `Bearer ${managerToken}`)
      .send({
        entries: [{ staff_id: staff.id, work_date: '2026-08-11', shift_def_id: shiftDef.id, status: 'scheduled' }],
        override_leave: true,
        override_reason: 'Operasyon icin zorunlu gorevlendirme',
      })
    expect(overridden.status).toBe(200)
    expect(overridden.body.leaveOverride.reason).toContain('Operasyon')
    expect(db.prepare('SELECT 1 FROM shift_schedule WHERE staff_id=? AND work_date=?').get(staff.id, '2026-08-11')).toBeTruthy()
  })

  it('izinsiz güne atamada warning yok (X5)', async () => {
    const db = getDB()
    const staff = db.prepare('SELECT id FROM staff WHERE is_active=1 LIMIT 1').get()
    const shiftDef = db.prepare('SELECT id FROM shift_definitions LIMIT 1').get()
    const res = await request(app).post('/api/shifts/schedule').set('Authorization', `Bearer ${managerToken}`)
      .send({ entries: [{ staff_id: staff.id, work_date: '2026-09-15', shift_def_id: shiftDef.id, status: 'scheduled' }] })
    expect(res.body.warnings.length).toBe(0)
  })

  it('shift_swap_requests tablosu versiyonlu şemada (migration 038, X5)', () => {
    expect(getDB().prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='shift_swap_requests'").get()).toBeTruthy()
  })

  it('calisma noktasi + rol cizelgeye yazilir ve kirilimda sayilir (migration 039)', async () => {
    const db = getDB()
    const dept = db.prepare('SELECT id FROM departments LIMIT 1').get()
    const staff = db.prepare('SELECT id FROM staff WHERE is_active=1 LIMIT 1').get()
    const shiftDef = db.prepare('SELECT id FROM shift_definitions LIMIT 1').get()

    const loc = await request(app).post('/api/shifts/work-locations').set('Authorization', `Bearer ${managerToken}`)
      .send({ name: 'X6 OTC Lokal', dept_id: dept.id, site: 'OTC', sort_order: 1, color_class: 'teal' })
    expect(loc.status).toBe(201)
    const locList = await request(app).get('/api/shifts/work-locations').set('Authorization', `Bearer ${managerToken}`)
    expect(locList.body.find(l => l.id === loc.body.id)?.site).toBe('OTC')

    const role = await request(app).post('/api/shifts/roles').set('Authorization', `Bearer ${managerToken}`)
      .send({ name: 'X6 Ikramci', sort_order: 1 })
    expect(role.status).toBe(201)

    const upd = await request(app).put(`/api/shifts/staff/${staff.id}`).set('Authorization', `Bearer ${managerToken}`)
      .send({ role_id: role.body.id })
    expect(upd.status).toBe(200)

    const assign = await request(app).post('/api/shifts/schedule').set('Authorization', `Bearer ${managerToken}`)
      .send({ entries: [{
        staff_id: staff.id, dept_id: dept.id, work_date: '2027-01-05',
        shift_def_id: shiftDef.id, status: 'scheduled', work_location_id: loc.body.id,
      }] })
    expect(assign.status).toBe(200)

    const schedule = await request(app).get('/api/shifts/schedule?week=2027-01-05&week_end=2027-01-05')
      .set('Authorization', `Bearer ${managerToken}`)
    const row = schedule.body.find(r => r.staff_id === staff.id)
    expect(row.work_location_id).toBe(loc.body.id)
    expect(row.work_location_name).toBe('X6 OTC Lokal')
    expect(row.role_id).toBe(role.body.id)
    expect(row.role_name).toBe('X6 Ikramci')

    const puantaj = await request(app).get('/api/shifts/puantaj?month=2027-01')
      .set('Authorization', `Bearer ${managerToken}`)
    const puantajRow = puantaj.body.find(r => r.id === staff.id)
    expect(puantajRow.role_name).toBe('X6 Ikramci')

    const puantajDays = await request(app).get('/api/shifts/puantaj/days?month=2027-01')
      .set('Authorization', `Bearer ${managerToken}`)
    const day = puantajDays.body.days[staff.id].find(d => d.date === '2027-01-05')
    expect(day.work_location_id).toBe(loc.body.id)
    expect(day.work_location_name).toBe('X6 OTC Lokal')
    expect(day.role_name).toBe('X6 Ikramci')

    const breakdown = await request(app).get('/api/shifts/breakdown?from=2027-01-05&to=2027-01-05')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(breakdown.status).toBe(200)
    expect(breakdown.body.location_counts.some(x => x.work_location_id === loc.body.id && x.assigned >= 1)).toBe(true)
    expect(breakdown.body.role_counts.some(x => x.role_id === role.body.id && x.assigned >= 1)).toBe(true)
    expect(breakdown.body.site_counts.some(x => x.site === 'OTC' && x.assigned >= 1)).toBe(true)

    // Tıkla-panel: her kırılım hücresi için atanan kişiler getirilir
    const siteAssignees = await request(app).get('/api/shifts/breakdown/assignees?date=2027-01-05&dimension=site&value=OTC')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(siteAssignees.status).toBe(200)
    expect(siteAssignees.body.assignees.some(a => a.staff_id === staff.id)).toBe(true)

    const locAssignees = await request(app).get(`/api/shifts/breakdown/assignees?date=2027-01-05&dimension=location&value=${encodeURIComponent('X6 OTC Lokal')}`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(locAssignees.body.assignees.some(a => a.staff_id === staff.id && a.role_name === 'X6 Ikramci')).toBe(true)

    const roleAssignees = await request(app).get(`/api/shifts/breakdown/assignees?date=2027-01-05&dimension=role&value=${encodeURIComponent('X6 Ikramci')}`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(roleAssignees.body.assignees.some(a => a.staff_id === staff.id)).toBe(true)

    const badDim = await request(app).get('/api/shifts/breakdown/assignees?date=2027-01-05&dimension=bogus&value=x')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(badDim.status).toBe(400)
  })
})

describe('Excel çizelge içe aktarımı (/import)', () => {
  const payload = {
    weekDates: ['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10', '2026-07-11', '2026-07-12'],
    rows: [
      {
        name: 'MELİKE EXCELTEST', deptName: 'KAT HİZMETLERİ EXCELTEST',
        cells: [
          { date: '2026-07-06', startHour: 8, endHour: 17, status: 'scheduled', raw: '08:00 17:00' },
          { date: '2026-07-12', startHour: null, endHour: null, status: 'off', leaveType: 'weekly_off', raw: 'OFF' },
        ],
      },
      {
        name: 'ONUR EXCELTEST', deptName: 'TEKNİK EXCELTEST',
        cells: [
          { date: '2026-07-06', startHour: 6, endHour: 15, status: 'scheduled', raw: '06:00-15:00' }, // yeni vardiya tanımı (Sabah)
        ],
      },
    ],
    unrecognized: [{ name: 'ONUR EXCELTEST', date: '2026-07-07', raw: '??' }],
  }

  it('dryRun=1 önizleme döndürür, hiçbir şey yazmaz', async () => {
    const res = await request(app)
      .post('/api/shifts/import?dryRun=1')
      .set('Authorization', `Bearer ${managerToken}`)
      .send(payload)
    expect(res.status).toBe(200)
    expect(res.body.depts.created).toContain('KAT HİZMETLERİ EXCELTEST')
    expect(res.body.staff.created.length).toBe(2)
    // 6-15 vardiya tanımı seed'de yok → oluşturulacaklar listesinde
    expect(res.body.shiftDefs.created.some(s => s.key === '6-15')).toBe(true)
    // personel henüz yok → tüm hücreler yeni
    expect(res.body.scheduleNew).toBe(3)
    expect(res.body.scheduleUpdated).toBe(0)
    // cinsiyet çıkarımı: MELİKE→female, ONUR→male (ikisi de tahmin edildi)
    expect(res.body.staff.genderGuessed).toBe(2)
    expect(res.body.staff.genderUnknown.length).toBe(0)
    // anomali raporu mevcut
    expect(Array.isArray(res.body.anomalies.warnings)).toBe(true)
    // dryRun yazmadı: personel hâlâ yok
    const check = await request(app).get('/api/shifts/staff/search?q=EXCELTEST').set('Authorization', `Bearer ${managerToken}`)
    expect(check.body.length).toBe(0)
  })

  it('analyzeAnomalies: dinlenmesiz hafta + ardışık gün + ardışık gece', () => {
    const week = ['2026-07-06','2026-07-07','2026-07-08','2026-07-09','2026-07-10','2026-07-11','2026-07-12']
    const day = d => ({ date: d, startHour: 8, endHour: 17, status: 'scheduled' })
    const night = d => ({ date: d, startHour: 0, endHour: 8, status: 'scheduled' })
    const rows = [
      { name: 'YORGUN KİŞİ', deptName: 'X', cells: week.map(day) }, // 7/7 çalışma
      { name: 'GECECİ', deptName: 'X', cells: [night('2026-07-06'), night('2026-07-07'), { date:'2026-07-08', startHour:null, endHour:null, status:'on_leave' }] },
    ]
    const { warnings, counts } = analyzeAnomalies(rows, week)
    expect(counts.no_weekly_off).toBe(1)          // 7/7 çalışma, dinlenme yok
    expect(counts.consecutive_night).toBe(1)      // 2 ≥ 2
    expect(counts.consecutive_work).toBeUndefined() // bilinçli kaldırıldı (6 gün normal)
    expect(warnings.length).toBeGreaterThanOrEqual(2)
  })

  it('guessGender: bilinen isimleri tahmin eder, bilinmeyene null', () => {
    expect(guessGender('MELİKE AKÇA')).toBe('female')
    expect(guessGender('ONUR TOPLUCUK')).toBe('male')
    expect(guessGender('ZZZQ WXYZ')).toBeNull()
  })

  it('gerçek import eksik personel/departman/vardiyayı oluşturur ve çizelgeye işler', async () => {
    const res = await request(app)
      .post('/api/shifts/import')
      .set('Authorization', `Bearer ${managerToken}`)
      .send(payload)
    expect(res.status).toBe(200)
    expect(res.body.scheduleEntries).toBe(3)
    expect(res.body.staff.created.length).toBe(2)

    // Personel gerçekten oluştu
    const check = await request(app).get('/api/shifts/staff/search?q=EXCELTEST').set('Authorization', `Bearer ${managerToken}`)
    expect(check.body.length).toBe(2)

    // Çizelge gerçekten dolu (dosyanın kendi tarihleriyle)
    const sched = await request(app).get('/api/shifts/schedule?week=2026-07-06').set('Authorization', `Bearer ${managerToken}`)
    const melike = sched.body.find(r => r.full_name === 'MELİKE EXCELTEST' && r.work_date === '2026-07-06')
    expect(melike).toBeTruthy()
    expect(melike.start_hour).toBe(8)
    const off = sched.body.find(r => r.full_name === 'MELİKE EXCELTEST' && r.work_date === '2026-07-12')
    expect(off.status).toBe('off')
  })

  it('ikinci import idempotent — aynı kişiyi tekrar oluşturmaz, çizelgeyi günceller', async () => {
    const res = await request(app)
      .post('/api/shifts/import')
      .set('Authorization', `Bearer ${managerToken}`)
      .send(payload)
    expect(res.status).toBe(200)
    expect(res.body.staff.created.length).toBe(0)
    expect(res.body.staff.matched).toBe(2)
    // 2. kez: tüm kayıtlar mevcut → hepsi "güncellenecek"
    expect(res.body.scheduleUpdated).toBe(3)
    expect(res.body.scheduleNew).toBe(0)
  })

  it('aksan/yazım farkı mükerrer personel oluşturmaz (fold-eşleşme)', async () => {
    // "MELİKE EXCELTEST" zaten var; "MELIKE EXCELTEST" (noktasız I) aynı kişi sayılmalı.
    const fuzzy = {
      weekDates: ['2026-07-13'],
      rows: [{ name: 'MELIKE EXCELTEST', deptName: 'KAT HİZMETLERİ EXCELTEST',
        cells: [{ date: '2026-07-13', startHour: 8, endHour: 17, status: 'scheduled', raw: '08:00-17:00' }] }],
      unrecognized: [],
    }
    const res = await request(app)
      .post('/api/shifts/import?dryRun=1')
      .set('Authorization', `Bearer ${managerToken}`)
      .send(fuzzy)
    expect(res.status).toBe(200)
    expect(res.body.staff.created.length).toBe(0)          // yeni oluşturulmaz
    expect(res.body.staff.matched).toBe(1)
    expect(res.body.staff.fuzzyMatched[0]).toMatchObject({ excelName: 'MELIKE EXCELTEST', matchedTo: 'MELİKE EXCELTEST' })
    expect(res.body.deptSummary.length).toBe(1)
  })

  it('groupConsecutive: ardışık günleri tek koşuda toplar', () => {
    const runs = groupConsecutive(['2026-07-20', '2026-07-21', '2026-07-23'])
    expect(runs).toEqual([
      { start: '2026-07-20', end: '2026-07-21', days: 2 },
      { start: '2026-07-23', end: '2026-07-23', days: 1 },
    ])
  })

  it('izinleri leave_requests\'e çevirir + bakiye düşer', async () => {
    const lp = {
      weekDates: ['2026-08-17','2026-08-18','2026-08-19','2026-08-20','2026-08-21'],
      rows: [{ name: 'İZİNLİ EXCELKİŞİ', deptName: 'KAT HİZMETLERİ EXCELTEST', cells: [
        { date: '2026-08-17', startHour: null, endHour: null, status: 'on_leave', leaveType: 'annual', raw: 'YILLIK İZİN' },
        { date: '2026-08-18', startHour: null, endHour: null, status: 'on_leave', leaveType: 'annual', raw: 'YILLIK İZİN' },
        { date: '2026-08-20', startHour: null, endHour: null, status: 'on_leave', leaveType: 'sick', raw: 'RAPORLU' },
        { date: '2026-08-21', startHour: null, endHour: null, status: 'off', leaveType: 'weekly_off', raw: 'OFF' }, // leave_request üretmez
      ] }],
      unrecognized: [],
    }
    const res = await request(app).post('/api/shifts/import').set('Authorization', `Bearer ${managerToken}`).send(lp)
    expect(res.status).toBe(200)
    expect(res.body.leaves.created).toBe(2)        // yıllık(2gün koşu) + rapor(1gün) = 2 talep
    expect(res.body.leaves.annualDays).toBe(2)
    expect(res.body.leaves.sickDays).toBe(1)

    const sid = (await request(app).get(`/api/shifts/staff/search?q=${encodeURIComponent('İZİNLİ EXCELKİŞİ')}`).set('Authorization', `Bearer ${managerToken}`)).body[0].id
    const leaves = (await request(app).get(`/api/shifts/leave?staff_id=${sid}`).set('Authorization', `Bearer ${managerToken}`)).body
    expect(leaves.filter(l => l.status === 'approved').length).toBe(2)
    const bal = (await request(app).get(`/api/shifts/leave/balance/${sid}`).set('Authorization', `Bearer ${managerToken}`)).body
    expect(bal.annual_used).toBe(2)
    expect(bal.sick_used).toBe(1)

    // idempotent: tekrar import izinleri çoğaltmaz, bakiye sabit
    await request(app).post('/api/shifts/import').set('Authorization', `Bearer ${managerToken}`).send(lp)
    const bal2 = (await request(app).get(`/api/shifts/leave/balance/${sid}`).set('Authorization', `Bearer ${managerToken}`)).body
    expect(bal2.annual_used).toBe(2)
  })

  it('import bir oturum kaydeder ve geri-alma her şeyi eski haline döndürür', async () => {
    const up = {
      weekDates: ['2026-09-07','2026-09-08','2026-09-09'],
      rows: [{ name: 'UNDO EXCELKİŞİ', deptName: 'UNDO EXCELDEPT', cells: [
        { date: '2026-09-07', startHour: 8, endHour: 17, status: 'scheduled', raw: '08:00-17:00' },
        { date: '2026-09-08', startHour: null, endHour: null, status: 'on_leave', leaveType: 'annual', raw: 'YILLIK İZİN' },
        { date: '2026-09-09', startHour: null, endHour: null, status: 'on_leave', leaveType: 'annual', raw: 'YILLIK İZİN' },
      ] }],
      unrecognized: [],
    }
    const imp = await request(app).post('/api/shifts/import').set('Authorization', `Bearer ${managerToken}`).send(up)
    expect(imp.status).toBe(200)
    const batchId = imp.body.batchId
    expect(batchId).toBeTruthy()

    // personel + departman gerçekten oluştu
    const sid = (await request(app).get(`/api/shifts/staff/search?q=${encodeURIComponent('UNDO EXCELKİŞİ')}`).set('Authorization', `Bearer ${managerToken}`)).body[0].id
    expect(sid).toBeTruthy()
    let depts = (await request(app).get('/api/shifts/departments').set('Authorization', `Bearer ${managerToken}`)).body
    expect(depts.some(d => d.name === 'UNDO EXCELDEPT')).toBe(true)

    // oturum listede, henüz geri alınmamış
    const batches = (await request(app).get('/api/shifts/import/batches').set('Authorization', `Bearer ${managerToken}`)).body
    const b = batches.find(x => x.id === batchId)
    expect(b).toBeTruthy()
    expect(b.undone_at).toBeFalsy()

    // GERİ AL
    const undo = await request(app).post(`/api/shifts/import/batches/${batchId}/undo`).set('Authorization', `Bearer ${managerToken}`)
    expect(undo.status).toBe(200)
    expect(undo.body.staffDeleted).toBe(1)
    expect(undo.body.scheduleDeleted).toBe(3)
    expect(undo.body.leavesDeleted).toBe(1)

    // personel + departman silindi
    const sAfter = (await request(app).get(`/api/shifts/staff/search?q=${encodeURIComponent('UNDO EXCELKİŞİ')}`).set('Authorization', `Bearer ${managerToken}`)).body
    expect(sAfter.length).toBe(0)
    depts = (await request(app).get('/api/shifts/departments').set('Authorization', `Bearer ${managerToken}`)).body
    expect(depts.some(d => d.name === 'UNDO EXCELDEPT')).toBe(false)

    // ikinci kez geri al → hata
    const undo2 = await request(app).post(`/api/shifts/import/batches/${batchId}/undo`).set('Authorization', `Bearer ${managerToken}`)
    expect(undo2.status).toBe(400)
  })

  it('excludeDepts: seçilmeyen departman içe aktarılmaz', async () => {
    const p = {
      weekDates: ['2026-10-05'],
      rows: [
        { name: 'KEEP EXCELKİŞİ', deptName: 'KEEP EXCELDEPT', cells: [{ date: '2026-10-05', startHour: 8, endHour: 17, status: 'scheduled', raw: '08:00-17:00' }] },
        { name: 'SKIP EXCELKİŞİ', deptName: 'SKIP EXCELDEPT', cells: [{ date: '2026-10-05', startHour: 8, endHour: 17, status: 'scheduled', raw: '08:00-17:00' }] },
      ],
      unrecognized: [], excludeDepts: ['SKIP EXCELDEPT'],
    }
    const res = await request(app).post('/api/shifts/import?dryRun=1').set('Authorization', `Bearer ${managerToken}`).send(p)
    expect(res.status).toBe(200)
    expect(res.body.staff.created.map(s => s.name)).toEqual(['KEEP EXCELKİŞİ'])
    expect(res.body.deptSummary.map(d => d.name)).toEqual(['KEEP EXCELDEPT'])
  })

  it('mappings: excel adı elle mevcut personele bağlanır (yeni oluşturmaz)', async () => {
    // Mevcut bir seed personeli al
    const existing = (await request(app).get('/api/shifts/staff?is_active=1').set('Authorization', `Bearer ${managerToken}`)).body[0]
    const p = {
      weekDates: ['2026-10-12'],
      rows: [{ name: 'TAMAMEN FARKLI YAZIM', deptName: 'KEEP EXCELDEPT', cells: [{ date: '2026-10-12', startHour: 8, endHour: 17, status: 'scheduled', raw: '08:00-17:00' }] }],
      unrecognized: [], mappings: { 'TAMAMEN FARKLI YAZIM': existing.id },
    }
    const res = await request(app).post('/api/shifts/import?dryRun=1').set('Authorization', `Bearer ${managerToken}`).send(p)
    expect(res.status).toBe(200)
    expect(res.body.staff.created.length).toBe(0)
    expect(res.body.staff.matched).toBe(1)
  })

  it('boş rows reddedilir (400)', async () => {
    const res = await request(app)
      .post('/api/shifts/import')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ weekDates: [], rows: [], unrecognized: [] })
    expect(res.status).toBe(400)
  })
})

describe('Staff CRUD', () => {
  let createdStaffId

  it('GET /staff returns array', async () => {
    const res = await request(app).get('/api/shifts/staff').set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThan(0)
  })

  it('GET /staff with filters', async () => {
    const res = await request(app).get('/api/shifts/staff?is_active=1&gender=male').set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('GET /staff/search returns results', async () => {
    const res = await request(app).get('/api/shifts/staff/search?q=Ali').set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('POST /staff creates a staff member (manager)', async () => {
    const res = await request(app)
      .post('/api/shifts/staff')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        full_name: 'Test Personel',
        tc_no: '99999999999',
        phone: '05551112233',
        email: 'test@test.com',
        position: 'Test Pozisyon',
        gender: 'male',
        blood_type: 'A+'
      })
    expect(res.status).toBe(201)
    expect(res.body.id).toBeTruthy()
    createdStaffId = res.body.id
  })

  it('GET /staff/:id returns the created staff', async () => {
    const res = await request(app).get(`/api/shifts/staff/${createdStaffId}`).set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    expect(res.body.full_name).toBe('Test Personel')
    expect(res.body.tc_no).toBe('999******99')
    expect(res.body).not.toHaveProperty('salary')
    expect(res.body).not.toHaveProperty('iban')
  })

  it('GET /staff/:id/detail returns detailed info', async () => {
    const res = await request(app).get(`/api/shifts/staff/${createdStaffId}/detail`).set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    expect(res.body.person).toBeTruthy()
    expect(res.body.person.full_name).toBe('Test Personel')
    expect(res.body.person.tc_no).toBe('999******99')
    expect(res.body.person).not.toHaveProperty('salary')
    expect(res.body.person).not.toHaveProperty('iban')
  })

  it('PUT /staff/:id updates staff (manager)', async () => {
    const res = await request(app)
      .put(`/api/shifts/staff/${createdStaffId}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ full_name: 'Güncellenmiş Personel', position: 'Yeni Pozisyon' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('DELETE /staff/:id soft-deletes staff (manager)', async () => {
    const res = await request(app)
      .delete(`/api/shifts/staff/${createdStaffId}`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('POST /staff rejects without full_name', async () => {
    const res = await request(app)
      .post('/api/shifts/staff')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ phone: '05551112233' })
    expect(res.status).toBe(400)
  })

  it('returns directory risk metrics and protects sensitive list fields', async () => {
    const db = getDB()
    db.prepare(`
      INSERT INTO staff_followups(staff_id, title, due_at, status)
      VALUES(?, 'Gecikmis liste gorevi', datetime('now', '-1 day'), 'open')
    `).run(createdStaffId)
    const supervisor = await request(app)
      .get(`/api/shifts/staff?directory=1&search=${encodeURIComponent('Güncellenmiş Personel')}`)
      .set('Authorization', `Bearer ${shiftToken}`)
    expect(supervisor.status).toBe(200)
    expect(supervisor.body[0]).toMatchObject({
      id: createdStaffId,
      overdue_followups: 1,
    })
    expect(supervisor.body[0].risk_count).toBeGreaterThan(0)
    expect(supervisor.body[0]).not.toHaveProperty('salary')
    expect(supervisor.body[0]).not.toHaveProperty('iban')

    const manager = await request(app)
      .get(`/api/shifts/staff?directory=1&search=${encodeURIComponent('Güncellenmiş Personel')}`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(manager.status).toBe(200)
    expect(manager.body[0]).toHaveProperty('salary')
    expect(manager.body[0]).toHaveProperty('iban')
  })

  it('supports controlled bulk assignment and manager-only deactivation', async () => {
    const first = await request(app).post('/api/shifts/staff')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ full_name: 'Toplu Atama Bir', is_active: 1 })
    const second = await request(app).post('/api/shifts/staff')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ full_name: 'Toplu Atama Iki', is_active: 1 })
    const departmentId = getDB().prepare('SELECT id FROM departments ORDER BY id LIMIT 1').get().id

    const assignment = await request(app).post('/api/shifts/staff/bulk/assignment')
      .set('Authorization', `Bearer ${shiftToken}`)
      .send({
        staff_ids: [first.body.id, second.body.id],
        department_id: departmentId,
      })
    expect(assignment.status).toBe(200)
    expect(assignment.body.updated).toEqual([first.body.id, second.body.id])

    const assignedRow = await request(app).get(`/api/shifts/staff/${first.body.id}`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(assignedRow.body.department_id).toBe(Number(departmentId))

    const denied = await request(app).post('/api/shifts/staff/bulk/deactivate')
      .set('Authorization', `Bearer ${shiftToken}`)
      .send({ staff_ids: [first.body.id, second.body.id] })
    expect(denied.status).toBe(403)

    const deactivated = await request(app).post('/api/shifts/staff/bulk/deactivate')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ staff_ids: [first.body.id, second.body.id] })
    expect(deactivated.status).toBe(200)
    expect(deactivated.body.updated).toEqual([first.body.id, second.body.id])
  })

  it('prevents supervisors from writing sensitive staff fields', async () => {
    const created = await request(app).post('/api/shifts/staff')
      .set('Authorization', `Bearer ${shiftToken}`)
      .send({
        full_name: 'Supervisor Güvenli Kayıt',
        tc_no: '81111111111',
        salary: 99999,
        iban: 'TR000000000000000000000001',
      })
    expect(created.status).toBe(201)

    const managerView = await request(app).get(`/api/shifts/staff/${created.body.id}`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(managerView.body.tc_no).toBe(null)
    expect(managerView.body.salary).toBe(null)
    expect(managerView.body.iban).toBe(null)

    await request(app).put(`/api/shifts/staff/${created.body.id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ tc_no: '82222222222', salary: 42000, iban: 'TR330006100519786457841326' })
    const supervisorUpdate = await request(app).put(`/api/shifts/staff/${created.body.id}`)
      .set('Authorization', `Bearer ${shiftToken}`)
      .send({ position: 'Operasyon Sorumlusu', tc_no: '83333333333', salary: 1, iban: 'TR1' })
    expect(supervisorUpdate.status).toBe(200)

    const protectedView = await request(app).get(`/api/shifts/staff/${created.body.id}`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(protectedView.body).toMatchObject({
      position: 'Operasyon Sorumlusu',
      tc_no: '82222222222',
      salary: 42000,
      iban: 'TR330006100519786457841326',
    })
  })
})

describe('Staff assignment history and data quality (044)', () => {
  it('keeps dated assignments, preserves historical puantaj and reports mismatches', async () => {
    const db = getDB()
    const suffix = Date.now().toString(36)
    const deptA = db.prepare('INSERT INTO departments(name, color_class) VALUES(?, ?)')
      .run(`Assignment A ${suffix}`, 'blue').lastInsertRowid
    const deptB = db.prepare('INSERT INTO departments(name, color_class) VALUES(?, ?)')
      .run(`Assignment B ${suffix}`, 'green').lastInsertRowid

    const location = await request(app)
      .post('/api/shifts/work-locations')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ name: `Assignment Location ${suffix}`, dept_id: deptA, sort_order: 1 })
    expect(location.status).toBe(201)

    const role = await request(app)
      .post('/api/shifts/roles')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ name: `Assignment Role ${suffix}`, expected_dept_id: deptA, sort_order: 1 })
    expect(role.status).toBe(201)

    const created = await request(app)
      .post('/api/shifts/staff')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        full_name: `Assignment Staff ${suffix}`,
        department_id: deptA,
        role_id: role.body.id,
        primary_work_location_id: location.body.id,
        assignment_effective_from: '2026-01-01',
        salary: 30000,
        iban: 'TR000000000000000000000001',
        is_active: 1,
      })
    expect(created.status).toBe(201)
    const staffId = created.body.id

    const initial = await request(app)
      .get(`/api/shifts/staff/${staffId}`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(initial.body).toMatchObject({
      department_id: Number(deptA),
      role_id: role.body.id,
      primary_work_location_id: location.body.id,
    })

    db.prepare(`
      INSERT INTO shift_schedule(staff_id, dept_id, work_date, status)
      VALUES(?, ?, '2026-02-10', 'worked')
    `).run(staffId, deptA)

    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const changed = await request(app)
      .put(`/api/shifts/staff/${staffId}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ department_id: deptB, assignment_effective_from: today, assignment_note: 'B birimine gecis' })
    expect(changed.status).toBe(200)

    const assignments = await request(app)
      .get(`/api/shifts/staff/${staffId}/assignments`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(assignments.status).toBe(200)
    expect(assignments.body).toHaveLength(2)
    expect(assignments.body[0]).toMatchObject({ department_id: Number(deptB), effective_from: today })
    expect(assignments.body[1].effective_to).toBeTruthy()

    const historical = await request(app)
      .get('/api/shifts/puantaj?month=2026-02')
      .set('Authorization', `Bearer ${managerToken}`)
    const historicalStaff = historical.body.find(row => row.id === staffId)
    expect(historicalStaff.department_id).toBe(Number(deptA))
    expect(historicalStaff.role_id).toBe(role.body.id)

    const quality = await request(app)
      .get('/api/shifts/staff/quality')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(quality.status).toBe(200)
    const qualityStaff = quality.body.rows.find(row => row.id === staffId)
    expect(qualityStaff.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'role_department_mismatch',
      'location_department_mismatch',
    ]))

    const future = await request(app)
      .post(`/api/shifts/staff/${staffId}/assignments`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        department_id: deptA,
        role_id: role.body.id,
        work_location_id: location.body.id,
        effective_from: '2099-01-01',
        note: 'Gelecek gorev',
      })
    expect(future.status).toBe(201)
    const currentAfterFuture = await request(app)
      .get(`/api/shifts/staff/${staffId}`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(currentAfterFuture.body.department_id).toBe(Number(deptB))

    const detail = await request(app)
      .get(`/api/shifts/staff/${staffId}/detail`)
      .set('Authorization', `Bearer ${shiftToken}`)
    expect(detail.status).toBe(200)
    expect(detail.body.assignmentHistory).toHaveLength(3)

    const meta = await request(app)
      .get('/api/shifts/puantaj?month=2026-02&meta=1')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(meta.body).toMatchObject({ not_due: 0, exception_count: 0, source: 'shift_schedule' })
    expect(meta.body.as_of_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(Array.isArray(meta.body.rows)).toBe(true)
  })
})

describe('Leave & Overtime (staff_id)', () => {
  it('POST /leave creates a leave request with staff_id', async () => {
    const staffRes = await request(app).get('/api/shifts/staff').set('Authorization', `Bearer ${shiftToken}`)
    const staffId = staffRes.body[0]?.id
    if (!staffId) return

    const res = await request(app)
      .post('/api/shifts/leave')
      .set('Authorization', `Bearer ${shiftToken}`)
      .send({ staff_id: staffId, leave_type: 'annual', start_date: '2026-04-01', end_date: '2026-04-03', reason: 'Test izin' })
    expect(res.status).toBe(201)
    expect(res.body.id).toBeTruthy()
  })

  it('GET /leave returns leave list', async () => {
    const res = await request(app).get('/api/shifts/leave').set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('POST /overtime creates overtime with staff_id', async () => {
    const staffRes = await request(app).get('/api/shifts/staff').set('Authorization', `Bearer ${managerToken}`)
    const staffId = staffRes.body[0]?.id
    if (!staffId) return

    const res = await request(app)
      .post('/api/shifts/overtime')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ staff_id: staffId, work_date: '2026-03-20', hours: 3, reason: 'Test mesai' })
    expect(res.status).toBe(201)
    expect(res.body.id).toBeTruthy()
  })

  it('GET /overtime returns overtime list', async () => {
    const res = await request(app).get('/api/shifts/overtime').set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})

describe('Departments CRUD', () => {
  let deptId

  it('POST /departments creates department', async () => {
    const res = await request(app)
      .post('/api/shifts/departments')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ name: 'CRUD Test Dept', color_class: 'bg-red-500', description: 'Test' })
    expect(res.status).toBe(201)
    deptId = res.body.id
  })

  it('PUT /departments/:id updates department', async () => {
    const res = await request(app)
      .put(`/api/shifts/departments/${deptId}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ name: 'Updated Dept', color_class: 'bg-red-600' })
    expect(res.status).toBe(200)
  })

  it('DELETE /departments/:id deletes department', async () => {
    const res = await request(app)
      .delete(`/api/shifts/departments/${deptId}`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
  })

  it('POST /departments/assign assigns staff to dept', async () => {
    const staffRes = await request(app).get('/api/shifts/staff').set('Authorization', `Bearer ${shiftToken}`)
    const staffId = staffRes.body[0]?.id
    const deptRes = await request(app).get('/api/shifts/departments').set('Authorization', `Bearer ${shiftToken}`)
    const dId = deptRes.body[0]?.id
    if (!staffId || !dId) return

    const res = await request(app)
      .post('/api/shifts/departments/assign')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ staff_id: staffId, dept_id: dId })
    expect(res.status).toBe(200)
  })
})

describe('Swap requests', () => {
  it('GET /swaps returns array', async () => {
    const res = await request(app).get('/api/shifts/swaps').set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})

describe('calcTax — Turkish progressive income tax', () => {
  it('returns 0 for 0 gross', () => {
    expect(calcTax(0)).toBe(0)
  })

  it('taxes 190,000 TL entirely at 15%', () => {
    expect(calcTax(190_000)).toBe(28_500)
  })

  it('taxes 400,000 TL in two brackets', () => {
    // 190,000 × 0.15 = 28,500; 210,000 × 0.20 = 42,000; total = 70,500
    expect(calcTax(400_000)).toBe(70_500)
  })

  it('calculates marginal tax for 250,000 TL', () => {
    // 190,000 × 0.15 = 28,500; 60,000 × 0.20 = 12,000; total = 40,500
    expect(calcTax(250_000)).toBe(40_500)
  })

  it('handles amounts above top bracket', () => {
    // 190k×0.15 + 210k×0.20 + 1,100k×0.27 + 3,800k×0.35 + 700k×0.40
    // = 28,500 + 42,000 + 297,000 + 1,330,000 + 280,000 = 1,977,500
    expect(calcTax(6_000_000)).toBe(1_977_500)
  })
})

describe('workDaysInMonth', () => {
  it('March 2024 has 26 non-Sunday days', () => {
    // March 2024: 31 days, 5 Sundays (3,10,17,24,31) → 26
    expect(workDaysInMonth(2024, 3)).toBe(26)
  })

  it('February 2024 (leap) has 25 non-Sunday days', () => {
    // Feb 2024: 29 days, 4 Sundays (4,11,18,25) → 25
    expect(workDaysInMonth(2024, 2)).toBe(25)
  })

  it('January 2024 has 27 non-Sunday days', () => {
    // Jan 2024: 31 days, 4 Sundays (7,14,21,28) → 27
    expect(workDaysInMonth(2024, 1)).toBe(27)
  })
})

describe('Enhanced GET /shifts/puantaj', () => {
  it('returns 200 with valid month', async () => {
    const res = await request(app)
      .get('/api/shifts/puantaj?month=2026-03')
      .set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('returns 400 without month param', async () => {
    const res = await request(app)
      .get('/api/shifts/puantaj')
      .set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid month format', async () => {
    const res = await request(app)
      .get('/api/shifts/puantaj?month=2026/03')
      .set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(400)
  })

  it('each row has all required financial fields', async () => {
    const res = await request(app)
      .get('/api/shifts/puantaj?month=2026-03')
      .set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    if (res.body.length === 0) return // seed may have no data for this month
    const row = res.body[0]
    const required = [
      'annual_leave_days', 'sick_leave_days', 'emergency_leave_days', 'other_leave_days',
      'daily_rate', 'base_pay', 'overtime_pay', 'leave_pay', 'gross',
      'ssi_worker', 'unemployment_worker', 'income_tax', 'stamp_tax',
      'total_deductions', 'net',
      'ssi_employer', 'unemployment_employer', 'employer_total_cost',
      'attend_rate', 'work_days_in_month', 'ytd_gross', 'ytd_tax',
    ]
    required.forEach(field => {
      expect(row).toHaveProperty(field)
      expect(typeof row[field]).toBe('number')
    })
  })

  it('net equals gross minus total_deductions', async () => {
    const res = await request(app)
      .get('/api/shifts/puantaj?month=2026-03')
      .set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    res.body.forEach(row => {
      expect(row.net).toBeCloseTo(row.gross - row.total_deductions, 1)
    })
  })
})

describe('GET /shifts/puantaj/export/csv', () => {
  it('returns 400 without month', async () => {
    const res = await request(app)
      .get('/api/shifts/puantaj/export/csv')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(400)
  })

  it('returns CSV with correct content-type', async () => {
    const res = await request(app)
      .get('/api/shifts/puantaj/export/csv?month=2026-03')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/csv/)
    expect(res.headers['content-disposition']).toMatch(/puantaj-2026-03\.csv/)
  })

  it('CSV starts with UTF-8 BOM and correct header', async () => {
    const res = await request(app)
      .get('/api/shifts/puantaj/export/csv?month=2026-03')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
    // BOM: \uFEFF
    expect(res.text.startsWith('\uFEFF')).toBe(true)
    const firstLine = res.text.replace('\uFEFF', '').split('\n')[0]
    expect(firstLine).toContain('TC No')
    expect(firstLine).toContain('Ad Soyad')
    expect(firstLine).toContain('Brüt')
    expect(firstLine).toContain('Net')
  })
})

describe('GET /shifts/puantaj/days', () => {
  it('returns monthly day maps for visible staff in one response', async () => {
    const res = await request(app)
      .get('/api/shifts/puantaj/days?month=2026-03')
      .set('Authorization', `Bearer ${shiftToken}`)

    expect(res.status).toBe(200)
    expect(res.body.month).toBe('2026-03')
    expect(res.body.days).toBeTruthy()
    const firstDays = Object.values(res.body.days)[0]
    expect(Array.isArray(firstDays)).toBe(true)
    expect(firstDays).toHaveLength(31)
    expect(firstDays[0]).toHaveProperty('date')
    expect(firstDays[0]).toHaveProperty('status')
  })
})

describe('GET /shifts/puantaj/:staffId/days', () => {
  let existingStaffId

  beforeAll(async () => {
    const staffRes = await request(app).get('/api/shifts/staff').set('Authorization', `Bearer ${shiftToken}`)
    existingStaffId = staffRes.body[0]?.id
  })

  it('returns 400 without month', async () => {
    const res = await request(app)
      .get(`/api/shifts/puantaj/${existingStaffId}/days`)
      .set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(400)
  })

  it('returns 400 for non-numeric staffId', async () => {
    const res = await request(app)
      .get('/api/shifts/puantaj/notanumber/days?month=2026-03')
      .set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(400)
  })

  it('returns array with one entry per day of the month', async () => {
    if (!existingStaffId) return
    const res = await request(app)
      .get(`/api/shifts/puantaj/${existingStaffId}/days?month=2026-03`)
      .set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    // March 2026 has 31 days
    expect(res.body.length).toBe(31)
  })

  it('each entry has date, day_of_week, and status', async () => {
    if (!existingStaffId) return
    const res = await request(app)
      .get(`/api/shifts/puantaj/${existingStaffId}/days?month=2026-03`)
      .set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    res.body.forEach(entry => {
      expect(entry).toHaveProperty('date')
      expect(entry).toHaveProperty('day_of_week')
      expect(entry).toHaveProperty('status')
      expect(['worked','absent','on_leave','off','overtime','scheduled','sunday','no_record']).toContain(entry.status)
    })
  })

  it('Sundays have status sunday', async () => {
    if (!existingStaffId) return
    const res = await request(app)
      .get(`/api/shifts/puantaj/${existingStaffId}/days?month=2026-03`)
      .set('Authorization', `Bearer ${shiftToken}`)
    // March 1 2026 is a Sunday (day_of_week=0)
    const march1 = res.body.find(e => e.date === '2026-03-01')
    expect(march1).toBeDefined()
    expect(march1.status).toBe('sunday')
  })

  it('manuel puantaj izin türünü ve pazar haftalık iznini gün dökümünde gösterir', async () => {
    if (!existingStaffId) return
    const write = await request(app)
      .post('/api/shifts/schedule')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ entries: [
        { staff_id: existingStaffId, dept_id: null, shift_def_id: null, work_date: '2026-03-02', status: 'on_leave', leave_type: 'unpaid' },
        { staff_id: existingStaffId, dept_id: null, shift_def_id: null, work_date: '2026-03-08', status: 'off' },
      ] })
    expect(write.status).toBe(200)

    const days = await request(app)
      .get(`/api/shifts/puantaj/${existingStaffId}/days?month=2026-03`)
      .set('Authorization', `Bearer ${shiftToken}`)
    expect(days.status).toBe(200)
    expect(days.body.find(e => e.date === '2026-03-02')).toMatchObject({ status: 'on_leave', leave_type: 'unpaid' })
    expect(days.body.find(e => e.date === '2026-03-08')).toMatchObject({ status: 'off' })

    const puantaj = await request(app)
      .get('/api/shifts/puantaj?month=2026-03')
      .set('Authorization', `Bearer ${shiftToken}`)
    expect(puantaj.status).toBe(200)
    const row = puantaj.body.find(r => r.id === existingStaffId)
    expect(row.other_leave_days).toBeGreaterThanOrEqual(1)
    expect(row.off_days).toBeGreaterThanOrEqual(1)
  })
})

describe('getYtdGross', () => {
  it('returns 0 for January (no prior months)', async () => {
    // Any staff_id, month=1 means no prior months → ytdGross=0
    // We test via the puantaj endpoint: no previous months means ytd_gross === gross for January
    const staffRes = await request(app).get('/api/shifts/staff').set('Authorization', `Bearer ${shiftToken}`)
    const staffId = staffRes.body[0]?.id
    if (!staffId) return

    const res = await request(app)
      .get('/api/shifts/puantaj?month=2026-01')
      .set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    // For Jan, ytd_gross = gross (no prior months)
    const row = res.body.find(r => r.id === staffId)
    if (row && row.gross !== undefined) {
      expect(row.ytd_gross).toBe(row.gross)
    }
  })
})

// ── H4 Vardiya derinleştirme ──
describe('H4 V1 — Çakışma kontrol', () => {
  it('POST /schedule/check-conflicts boş entries için no conflict', async () => {
    const res = await request(app).post('/api/shifts/schedule/check-conflicts')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ entries: [] })
    expect(res.status).toBe(200)
    expect(res.body.has_conflicts).toBe(false)
    expect(res.body.conflicts).toEqual([])
  })

  it('mevcut vardiya varsa shift_exists çakışması döner', async () => {
    const staff = (await request(app).get('/api/shifts/staff').set('Authorization', `Bearer ${managerToken}`)).body
    if (!staff?.length) return
    const today = new Date().toISOString().slice(0, 10)
    await request(app).post('/api/shifts/schedule').set('Authorization', `Bearer ${managerToken}`)
      .send({ entries: [{ staff_id: staff[0].id, work_date: today, shift_def_id: 1 }] })
    const res = await request(app).post('/api/shifts/schedule/check-conflicts')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ entries: [{ staff_id: staff[0].id, work_date: today, shift_def_id: 2 }] })
    expect(res.body.has_conflicts).toBe(true)
    expect(res.body.conflicts[0].kind).toBe('shift_exists')
  })
})

describe('H4 V3 — Holidays', () => {
  it('GET /holidays 2026 tatilleri seed edilmiş', async () => {
    const res = await request(app).get('/api/shifts/holidays?year=2026').set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThan(0)
    expect(res.body.find(h => h.date === '2026-01-01')).toBeTruthy()
  })

  it('CREATE/UPDATE/DELETE holiday', async () => {
    const add = await request(app).post('/api/shifts/holidays').set('Authorization', `Bearer ${managerToken}`)
      .send({ date: '2030-01-01', name: 'Test Tatili', multiplier: 1.5 })
    expect(add.status).toBe(201)
    const id = add.body.id

    const upd = await request(app).put(`/api/shifts/holidays/${id}`).set('Authorization', `Bearer ${managerToken}`)
      .send({ multiplier: 2.0 })
    expect(upd.status).toBe(200)

    const del = await request(app).delete(`/api/shifts/holidays/${id}`).set('Authorization', `Bearer ${managerToken}`)
    expect(del.status).toBe(200)
  })

  it('eksik veri 400 döner', async () => {
    const res = await request(app).post('/api/shifts/holidays').set('Authorization', `Bearer ${managerToken}`)
      .send({ name: 'sadece ad' })
    expect(res.status).toBe(400)
  })
})

describe('H4 V7 — Bordro export', () => {
  it('GET /payroll-export aylık personel başı veri döner', async () => {
    const month = new Date().toISOString().slice(0, 7)
    const res = await request(app).get(`/api/shifts/payroll-export?month=${month}`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('month', month)
    expect(Array.isArray(res.body.rows)).toBe(true)
    res.body.rows.forEach(r => {
      expect(r).toHaveProperty('worked_days')
      expect(r).toHaveProperty('absent_days')
      expect(r).toHaveProperty('overtime_hours')
      expect(r).toHaveProperty('holiday_days')
    })
  })

  it('yanlış ay formatı 400 döner', async () => {
    const res = await request(app).get('/api/shifts/payroll-export?month=2026')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(400)
  })
})

describe('H4 V8 — Birleşik devamsızlık', () => {
  it('GET /combined-absences dönüyor', async () => {
    const res = await request(app).get('/api/shifts/combined-absences')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    res.body.forEach(r => {
      expect(r).toHaveProperty('shift_absent')
      expect(r).toHaveProperty('transport_no_show')
      expect(r).toHaveProperty('worked')
    })
  })
})

// ── H8 Bordro detaylı (B1+B2+B3+B5) ──
describe('H8 — Kesinti CRUD', () => {
  it('kesinti ekle/listele/sil', async () => {
    const staff = (await request(app).get('/api/shifts/staff').set('Authorization', `Bearer ${managerToken}`)).body
    if (!staff?.length) return
    const add = await request(app).post('/api/shifts/deductions').set('Authorization', `Bearer ${managerToken}`)
      .send({ staff_id: staff[0].id, period: '2026-10', kind: 'damage', amount: 150.50, description: 'Test hasar' })
    expect(add.status).toBe(201)

    const list = await request(app).get('/api/shifts/deductions?period=2026-10').set('Authorization', `Bearer ${managerToken}`)
    expect(list.body.find(d => d.id === add.body.id)).toBeTruthy()

    const del = await request(app).delete(`/api/shifts/deductions/${add.body.id}`).set('Authorization', `Bearer ${managerToken}`)
    expect(del.status).toBe(200)
  })

  it('geçersiz kind 400', async () => {
    const r = await request(app).post('/api/shifts/deductions').set('Authorization', `Bearer ${managerToken}`)
      .send({ staff_id: 1, period: '2026-10', kind: 'invalid', amount: 50 })
    expect(r.status).toBe(400)
  })

  it('eksik alan 400', async () => {
    const r = await request(app).post('/api/shifts/deductions').set('Authorization', `Bearer ${managerToken}`)
      .send({ staff_id: 1, kind: 'damage' })
    expect(r.status).toBe(400)
  })
})

describe('H8 — payroll-detailed', () => {
  it('GET /payroll-detailed SGK + kesinti döner', async () => {
    const month = new Date().toISOString().slice(0, 7)
    const r = await request(app).get(`/api/shifts/payroll-detailed?month=${month}`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(r.status).toBe(200)
    expect(r.body.month).toBe(month)
    r.body.rows.forEach(row => {
      expect(row).toHaveProperty('weighted_days')
      expect(row).toHaveProperty('sgk_days')
      expect(row).toHaveProperty('total_deductions')
    })
  })
})

describe('Faz 27 — Çizelgede saat aliası + izin türü', () => {
  let staffId, defId

  beforeAll(() => {
    const db = getDB()
    staffId = db.prepare("INSERT INTO staff(full_name, is_active) VALUES('Faz27 Test', 1)").run().lastInsertRowid
    defId = db.prepare("INSERT INTO shift_definitions(name, start_hour, end_hour, color_class) VALUES('Sabah27', 8, 16, 'shift-blue')").run().lastInsertRowid
  })

  it('GET /schedule shift_start/shift_end aliaslarını ve izin türünü döner', async () => {
    await request(app).post('/api/shifts/schedule').set('Authorization', `Bearer ${managerToken}`)
      .send({ entries: [
        { staff_id: staffId, dept_id: null, shift_def_id: defId, work_date: '2026-08-03', status: 'scheduled' },
        { staff_id: staffId, dept_id: null, shift_def_id: null, work_date: '2026-08-04', status: 'on_leave' },
      ] })
    // 08-04'ü kapsayan onaylı RAPOR izni
    const lr = await request(app).post('/api/shifts/leave').set('Authorization', `Bearer ${managerToken}`)
      .send({ staff_id: staffId, leave_type: 'sick', start_date: '2026-08-04', end_date: '2026-08-04', reason: 'Doktor raporu' })
    expect(lr.status).toBe(201)
    const document = await request(app)
      .post(`/api/shifts/request-documents/leave/${lr.body.id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .attach('documents', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'), 'rapor.png')
    expect(document.status).toBe(201)
    await request(app).patch(`/api/shifts/leave/${lr.body.id}`).set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'approved' })

    const r = await request(app).get('/api/shifts/schedule?week=2026-08-03&week_end=2026-08-09')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(r.status).toBe(200)
    const rows = r.body.filter(x => x.staff_id === staffId)

    const shiftRow = rows.find(x => x.work_date === '2026-08-03')
    expect(shiftRow.shift_start).toBe(shiftRow.start_hour) // alias sözleşmesi
    expect(shiftRow.shift_end).toBe(shiftRow.end_hour)
    expect(shiftRow.shift_start).not.toBeNull()

    const leaveRow = rows.find(x => x.work_date === '2026-08-04')
    expect(leaveRow.status).toBe('on_leave')
    expect(leaveRow.leave_type).toBe('sick')
  })

  it('staff-detail vardiya geçmişi OFF/izin satırlarını ve izin türünü içerir', async () => {
    const db = getDB()
    db.prepare("INSERT INTO shift_schedule(staff_id, work_date, status) VALUES(?, '2026-08-05', 'off')").run(staffId)

    const r = await request(app).get(`/api/shifts/staff/${staffId}/detail`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(r.status).toBe(200)
    const hist = r.body.shiftHistory
    expect(hist.find(h => h.work_date === '2026-08-05' && h.status === 'off')).toBeTruthy()
    const leaveRow = hist.find(h => h.work_date === '2026-08-04')
    expect(leaveRow.leave_type).toBe('sick')
  })
})

describe('Faz 26 — Haftalık izin (OFF) durumu', () => {
  let staffId

  beforeAll(() => {
    staffId = getDB().prepare("INSERT INTO staff(full_name, is_active, salary) VALUES('Off Test Personel', 1, 30000)")
      .run().lastInsertRowid
  })

  it("shift_schedule CHECK constraint 'off' durumunu kabul eder", async () => {
    const r = await request(app).post('/api/shifts/schedule').set('Authorization', `Bearer ${managerToken}`)
      .send({ entries: [{ staff_id: staffId, dept_id: null, shift_def_id: null, work_date: '2026-07-12', status: 'off' }] })
    expect(r.status).toBe(200)
    const row = getDB().prepare("SELECT status FROM shift_schedule WHERE staff_id=? AND work_date='2026-07-12'").get(staffId)
    expect(row.status).toBe('off')
  })

  it('puantajda off_days sayılır ve hafta tatili ücreti brüte eklenir', async () => {
    const db = getDB()
    // 2026-07: 5 çalışılan gün ekle (off zaten 07-12'de)
    const days = ['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10']
    days.forEach(d => db.prepare(`
      INSERT INTO shift_schedule(staff_id, work_date, status) VALUES(?,?,'worked')
      ON CONFLICT(staff_id, work_date) DO UPDATE SET status='worked'
    `).run(staffId, d))

    const row = puantajService('2026-07').find(r => r.id === staffId)
    expect(row.off_days).toBe(1)
    expect(row.weekly_off_pay).toBe(1000) // 30000/30 × 1
    expect(row.gross).toBe(row.base_pay + row.weekly_off_pay) // 5×1000 + 1×1000
  })

  it('payroll-detailed off_days döner ve sgk_days off içerir', async () => {
    const r = await request(app).get('/api/shifts/payroll-detailed?month=2026-07')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(r.status).toBe(200)
    const row = r.body.rows.find(x => x.id === staffId)
    expect(row.off_days).toBe(1)
    expect(row.sgk_days).toBe(6) // 5 worked + 1 off
  })

  it('bordro PDF hafta tatili ile üretilir', async () => {
    const r = await request(app).get(`/api/shifts/payslip/${staffId}/pdf?month=2026-07`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(r.status).toBe(200)
    expect(r.headers['content-type']).toContain('application/pdf')
  })
})

describe('E1 — İzin bakiye takibi', () => {
  let staffId
  const db = () => getDB()

  beforeAll(() => {
    staffId = db().prepare("INSERT INTO staff(full_name, is_active) VALUES('Bakiye Test', 1)").run().lastInsertRowid
  })

  async function createLeave(start, end, type = 'annual') {
    const r = await request(app).post('/api/shifts/leave').set('Authorization', `Bearer ${managerToken}`)
      .send({
        staff_id: staffId,
        leave_type: type,
        start_date: start,
        end_date: end,
        reason: type === 'sick' ? 'Doktor raporu' : undefined,
      })
    expect(r.status).toBe(201)
    if (type === 'sick') {
      const document = await request(app)
        .post(`/api/shifts/request-documents/leave/${r.body.id}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .attach('documents', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'), 'rapor.png')
      expect(document.status).toBe(201)
    }
    return r.body.id
  }

  it('onayda annual_used artar, iptalde iade edilir', async () => {
    const id = await createLeave('2026-10-05', '2026-10-09') // 5 gün
    const ap = await request(app).patch(`/api/shifts/leave/${id}`).set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'approved' })
    expect(ap.status).toBe(200)

    let bal = db().prepare('SELECT * FROM leave_balance WHERE staff_id=? AND year=2026').get(staffId)
    expect(bal.annual_used).toBe(5)

    // İptal (delete) → iade
    const del = await request(app).delete(`/api/shifts/leave/${id}`).set('Authorization', `Bearer ${managerToken}`)
    expect(del.status).toBe(200)
    bal = db().prepare('SELECT * FROM leave_balance WHERE staff_id=? AND year=2026').get(staffId)
    expect(bal.annual_used).toBe(0)
  })

  it('onay boş çizelge günlerine on_leave satırı açar ve iptal temizler', async () => {
    const id = await createLeave('2026-08-24', '2026-08-25', 'emergency')
    const ap = await request(app).patch(`/api/shifts/leave/${id}`).set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'approved' })
    expect(ap.status).toBe(200)

    const createdRows = db().prepare(`
      SELECT work_date, status, shift_def_id
      FROM shift_schedule
      WHERE staff_id=? AND work_date BETWEEN '2026-08-24' AND '2026-08-25'
      ORDER BY work_date
    `).all(staffId)
    expect(createdRows).toHaveLength(2)
    expect(createdRows.every(r => r.status === 'on_leave' && r.shift_def_id == null)).toBe(true)

    const sched = await request(app).get('/api/shifts/schedule?week=2026-08-24&week_end=2026-08-30')
      .set('Authorization', `Bearer ${managerToken}`)
    const leaveRows = sched.body.filter(r => r.staff_id === staffId)
    expect(leaveRows.map(r => r.leave_type)).toEqual(['emergency', 'emergency'])

    const del = await request(app).delete(`/api/shifts/leave/${id}`).set('Authorization', `Bearer ${managerToken}`)
    expect(del.status).toBe(200)
    const remaining = db().prepare(`
      SELECT id FROM shift_schedule
      WHERE staff_id=? AND work_date BETWEEN '2026-08-24' AND '2026-08-25'
    `).all(staffId)
    expect(remaining).toHaveLength(0)
  })

  it('tekrar onay çift saymaz', async () => {
    const id = await createLeave('2026-11-02', '2026-11-04') // 3 gün
    await request(app).patch(`/api/shifts/leave/${id}`).set('Authorization', `Bearer ${managerToken}`).send({ status: 'approved' })
    await request(app).patch(`/api/shifts/leave/${id}`).set('Authorization', `Bearer ${managerToken}`).send({ status: 'approved' })
    const bal = db().prepare('SELECT * FROM leave_balance WHERE staff_id=? AND year=2026').get(staffId)
    expect(bal.annual_used).toBe(3)
  })

  it('bakiye yetersizse onay 400 döner', async () => {
    // Kalan: 15 - 3 = 12 gün; 20 günlük talep onaylanamaz
    const id = await createLeave('2026-12-01', '2026-12-20') // 20 gün
    const ap = await request(app).patch(`/api/shifts/leave/${id}`).set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'approved' })
    expect(ap.status).toBe(400)
    expect(ap.body.error).toMatch(/bakiye/i)
    const bal = db().prepare('SELECT * FROM leave_balance WHERE staff_id=? AND year=2026').get(staffId)
    expect(bal.annual_used).toBe(3)
  })

  it('onaylı izin reddedilince bakiye iadesi yapılır', async () => {
    const id = await createLeave('2026-09-07', '2026-09-08') // 2 gün
    await request(app).patch(`/api/shifts/leave/${id}`).set('Authorization', `Bearer ${managerToken}`).send({ status: 'approved' })
    let bal = db().prepare('SELECT * FROM leave_balance WHERE staff_id=? AND year=2026').get(staffId)
    expect(bal.annual_used).toBe(5) // 3 + 2

    await request(app).patch(`/api/shifts/leave/${id}`).set('Authorization', `Bearer ${managerToken}`).send({ status: 'rejected' })
    bal = db().prepare('SELECT * FROM leave_balance WHERE staff_id=? AND year=2026').get(staffId)
    expect(bal.annual_used).toBe(3)
  })

  it('sick izni sick_used sayacına işler', async () => {
    const id = await createLeave('2026-07-20', '2026-07-21', 'sick') // 2 gün
    await request(app).patch(`/api/shifts/leave/${id}`).set('Authorization', `Bearer ${managerToken}`).send({ status: 'approved' })
    const bal = db().prepare('SELECT * FROM leave_balance WHERE staff_id=? AND year=2026').get(staffId)
    expect(bal.sick_used).toBe(2)
    expect(bal.annual_used).toBe(3) // değişmedi
  })
})

describe('L1 — Bordro PDF', () => {
  const month = new Date().toISOString().slice(0, 7)
  let staffId

  beforeAll(async () => {
    const staff = (await request(app).get('/api/shifts/staff').set('Authorization', `Bearer ${managerToken}`)).body
    staffId = staff[0].id
  })

  it('GET /payslip/:id/pdf PDF döner', async () => {
    const r = await request(app).get(`/api/shifts/payslip/${staffId}/pdf?month=${month}`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(r.status).toBe(200)
    expect(r.headers['content-type']).toContain('application/pdf')
    expect(r.headers['content-disposition']).toContain(`bordro-${month}`)
  })

  it('geçersiz month 400', async () => {
    const r = await request(app).get(`/api/shifts/payslip/${staffId}/pdf?month=2026-13-01`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(r.status).toBe(400)
  })

  it('olmayan personel 404', async () => {
    const r = await request(app).get(`/api/shifts/payslip/999999/pdf?month=${month}`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(r.status).toBe(404)
  })

  it('yetkisiz rol 403', async () => {
    const laundryToken = (await request(app).post('/api/auth/login')
      .send({ username: 'camasir', password: 'admin123' })).body.token
    const r = await request(app).get(`/api/shifts/payslip/${staffId}/pdf?month=${month}`)
      .set('Authorization', `Bearer ${laundryToken}`)
    expect(r.status).toBe(403)
  })

  it('GET /bank-transfer CSV döner (IBAN + net tutar)', async () => {
    // staff'a IBAN yaz — CSV'de görünmeli
    const upd = await request(app).put(`/api/shifts/staff/${staffId}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ iban: 'TR12 0006 4000 0011 2345 6789 01' })
    expect(upd.status).toBe(200)

    const r = await request(app).get(`/api/shifts/bank-transfer?month=${month}`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(r.status).toBe(200)
    expect(r.headers['content-type']).toContain('text/csv')
    expect(r.text).toContain('Sira;Ad Soyad;TC No;IBAN;Tutar (TL);Aciklama')
    // net > 0 olan personel varsa IBAN satırda yer alır
    if (r.text.split('\r\n').length > 1) {
      expect(r.text).toMatch(/maas odemesi/)
    }
  })

  it('bank-transfer geçersiz month 400', async () => {
    const r = await request(app).get('/api/shifts/bank-transfer?month=kotu')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(r.status).toBe(400)
  })

  it('bank-transfer takvim dışı month 400', async () => {
    const r = await request(app).get('/api/shifts/bank-transfer?month=2026-13')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(r.status).toBe(400)
  })

  it('staff iban alanı create/update ile korunur', async () => {
    const created = await request(app).post('/api/shifts/staff')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ full_name: 'IBAN Test Personel', iban: 'TR330006100519786457841326', salary: 30000 })
    expect(created.status).toBe(201)
    const got = await request(app).get(`/api/shifts/staff/${created.body.id}`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(got.body.iban).toBe('TR330006100519786457841326')
  })

  it('payslipService özel kesintiyi netten düşer', async () => {
    const { payslipService } = await import('./service.js')
    const before = payslipService(staffId, month)

    const add = await request(app).post('/api/shifts/deductions').set('Authorization', `Bearer ${managerToken}`)
      .send({ staff_id: staffId, period: month, kind: 'advance', amount: 100, description: 'Bordro test avans' })
    expect(add.status).toBe(201)

    const after = payslipService(staffId, month)
    expect(after.other_deductions).toBe(before.other_deductions + 100)
    expect(after.net_payable).toBeCloseTo(before.net_payable - 100, 2)
    expect(after.deduction_items.some(d => d.id === add.body.id)).toBe(true)

    await request(app).delete(`/api/shifts/deductions/${add.body.id}`).set('Authorization', `Bearer ${managerToken}`)
  })
})

describe('Faz 28 — Puantaj bordro girdileri (absent_reason + FM upsert)', () => {
  let staffId

  beforeAll(() => {
    staffId = getDB().prepare("INSERT INTO staff(full_name, is_active, salary) VALUES('Faz28 Test Personel', 1, 30000)")
      .run().lastInsertRowid
  })

  it('absent + absent_reason kaydedilir ve puantaj/days ile döner', async () => {
    const r = await request(app).post('/api/shifts/schedule').set('Authorization', `Bearer ${managerToken}`)
      .send({ entries: [{ staff_id: staffId, work_date: '2026-09-15', status: 'absent', absent_reason: 'Mazeretsiz devamsızlık' }] })
    expect(r.status).toBe(200)

    const days = await request(app).get('/api/shifts/puantaj/days?month=2026-09')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(days.status).toBe(200)
    const entry = (days.body.days[staffId] || []).find(d => d.date === '2026-09-15')
    expect(entry.status).toBe('absent')
    expect(entry.absent_reason).toBe('Mazeretsiz devamsızlık')
  })

  it('absent dışı statüye geçince absent_reason temizlenir', async () => {
    const r = await request(app).post('/api/shifts/schedule').set('Authorization', `Bearer ${managerToken}`)
      .send({ entries: [{ staff_id: staffId, work_date: '2026-09-15', status: 'worked' }] })
    expect(r.status).toBe(200)
    const row = getDB().prepare("SELECT status, absent_reason FROM shift_schedule WHERE staff_id=? AND work_date='2026-09-15'").get(staffId)
    expect(row.status).toBe('worked')
    expect(row.absent_reason).toBe(null)
  })

  it('puantaj day-detail saatlik izin ve notu kalici kaydeder', async () => {
    const r = await request(app).post('/api/shifts/puantaj/day-detail').set('Authorization', `Bearer ${managerToken}`)
      .field('staff_id', String(staffId))
      .field('work_date', '2026-09-17')
      .field('status', 'on_leave')
      .field('leave_type', 'unpaid')
      .field('leave_hours', '4')
      .field('detail_note', 'Saatlik ucretsiz izin formu teslim')
    expect(r.status).toBe(200)
    expect(r.body.row.leave_hours).toBe(4)
    expect(r.body.row.detail_note).toBe('Saatlik ucretsiz izin formu teslim')

    const days = await request(app).get('/api/shifts/puantaj/days?month=2026-09')
      .set('Authorization', `Bearer ${managerToken}`)
    const entry = (days.body.days[staffId] || []).find(d => d.date === '2026-09-17')
    expect(entry).toMatchObject({
      status: 'on_leave',
      leave_type: 'unpaid',
      leave_hours: 4,
      detail_note: 'Saatlik ucretsiz izin formu teslim',
    })

    const detail = await request(app).get(`/api/shifts/staff/${staffId}/detail`)
      .set('Authorization', `Bearer ${managerToken}`)
    const history = detail.body.shiftHistory.find(d => d.work_date === '2026-09-17')
    expect(history.leave_hours).toBe(4)
    expect(history.detail_note).toBe('Saatlik ucretsiz izin formu teslim')
  })

  it('POST /overtime/day upsert: oluştur → güncelle → 0 ile sil', async () => {
    // FM görünürlüğü için gün kaydı gerekli (puantaj/days shift_schedule üzerinden döner)
    await request(app).post('/api/shifts/schedule').set('Authorization', `Bearer ${managerToken}`)
      .send({ entries: [{ staff_id: staffId, work_date: '2026-09-16', status: 'worked' }] })

    const create = await request(app).post('/api/shifts/overtime/day').set('Authorization', `Bearer ${managerToken}`)
      .send({ staff_id: staffId, work_date: '2026-09-16', hours: 3 })
    expect(create.status).toBe(200)
    let rows = getDB().prepare("SELECT hours FROM overtime_records WHERE staff_id=? AND work_date='2026-09-16'").all(staffId)
    expect(rows).toHaveLength(1)
    expect(rows[0].hours).toBe(3)

    const update = await request(app).post('/api/shifts/overtime/day').set('Authorization', `Bearer ${managerToken}`)
      .send({ staff_id: staffId, work_date: '2026-09-16', hours: 5 })
    expect(update.status).toBe(200)
    rows = getDB().prepare("SELECT hours FROM overtime_records WHERE staff_id=? AND work_date='2026-09-16'").all(staffId)
    expect(rows).toHaveLength(1)
    expect(rows[0].hours).toBe(5)

    const days = await request(app).get('/api/shifts/puantaj/days?month=2026-09')
      .set('Authorization', `Bearer ${managerToken}`)
    const entry = (days.body.days[staffId] || []).find(d => d.date === '2026-09-16')
    expect(entry.overtime_hours).toBe(5)

    const remove = await request(app).post('/api/shifts/overtime/day').set('Authorization', `Bearer ${managerToken}`)
      .send({ staff_id: staffId, work_date: '2026-09-16', hours: 0 })
    expect(remove.status).toBe(200)
    rows = getDB().prepare("SELECT hours FROM overtime_records WHERE staff_id=? AND work_date='2026-09-16'").all(staffId)
    expect(rows).toHaveLength(0)
  })

  it('overtime/day 12 saat üstünü ve eksik alanları reddeder', async () => {
    const tooMuch = await request(app).post('/api/shifts/overtime/day').set('Authorization', `Bearer ${managerToken}`)
      .send({ staff_id: staffId, work_date: '2026-09-16', hours: 13 })
    expect(tooMuch.status).toBe(400)

    const missing = await request(app).post('/api/shifts/overtime/day').set('Authorization', `Bearer ${managerToken}`)
      .send({ staff_id: staffId, hours: 2 })
    expect(missing.status).toBe(400)
  })
})

describe('Faz 30 — Rotasyon şablonları', () => {
  let staffA, staffB, morningId, eveningId, templateId

  beforeAll(async () => {
    const db = getDB()
    staffA = db.prepare("INSERT INTO staff(full_name, is_active) VALUES('Rotasyon A', 1)").run().lastInsertRowid
    staffB = db.prepare("INSERT INTO staff(full_name, is_active) VALUES('Rotasyon B', 1)").run().lastInsertRowid
    // Sabah 08-16, Akşam 16-24 → akşam→sabah geçişinde dinlenme 8 saat (< 11) uyarı üretir
    const mk = async (name, start, end) => {
      const r = await request(app).post('/api/shifts/definitions')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ name, start_hour: start, end_hour: end, color_class: 'bg-blue-400' })
      expect(r.status).toBe(201)
      return r.body.id
    }
    morningId = await mk('Rot Sabah', 8, 16)
    eveningId = await mk('Rot Akşam', 16, 24)
  })

  it('şablon oluşturulur ve listelenir', async () => {
    const r = await request(app).post('/api/shifts/rotation-templates')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ name: '2 sabah + 2 akşam + 2 off', pattern: [
        { shift_def_id: morningId }, { shift_def_id: morningId },
        { shift_def_id: eveningId }, { shift_def_id: eveningId },
        { shift_def_id: null }, { shift_def_id: null },
      ] })
    expect(r.status).toBe(201)
    templateId = r.body.id

    const list = await request(app).get('/api/shifts/rotation-templates')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(list.status).toBe(200)
    const tpl = list.body.find(t => t.id === templateId)
    expect(tpl.name).toContain('2 sabah')
    expect(tpl.pattern).toHaveLength(6)
    expect(tpl.pattern[4].shift_def_id).toBe(null)
  })

  it('geçersiz şablon 400 (boş desen / isim yok)', async () => {
    const noName = await request(app).post('/api/shifts/rotation-templates')
      .set('Authorization', `Bearer ${managerToken}`).send({ pattern: [{ shift_def_id: null }] })
    expect(noName.status).toBe(400)
    const noPattern = await request(app).post('/api/shifts/rotation-templates')
      .set('Authorization', `Bearer ${managerToken}`).send({ name: 'x', pattern: [] })
    expect(noPattern.status).toBe(400)
  })

  it('önizleme: akşam→sabah geçişi dinlenme uyarısı, kesintisiz gün uyarısı', async () => {
    // Desen: akşam, sabah → dinlenme 8s < 11s uyarısı; 14 gün hiç OFF yok → kesintisiz uyarı
    const r = await request(app).post('/api/shifts/rotation-templates/preview')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        pattern: [{ shift_def_id: eveningId }, { shift_def_id: morningId }],
        staff_ids: [staffA], start_date: '2026-10-05', weeks: 2,
      })
    expect(r.status).toBe(200)
    expect(r.body.total_entries).toBe(14)
    const types = r.body.warnings.map(w => w.type)
    expect(types).toContain('rest')
    expect(types).toContain('consecutive')
  })

  it('OFF içeren desende kesintisiz uyarısı çıkmaz', async () => {
    const r = await request(app).post('/api/shifts/rotation-templates/preview')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ template_id: templateId, staff_ids: [staffA, staffB], start_date: '2026-10-05', weeks: 1 })
    expect(r.status).toBe(200)
    expect(r.body.warnings.filter(w => w.type === 'consecutive')).toHaveLength(0)
  })

  it('uygula: scheduled + off satırları yazılır, stagger personel başlangıcını kaydırır', async () => {
    const r = await request(app).post('/api/shifts/rotation-templates/apply')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ template_id: templateId, staff_ids: [staffA, staffB], start_date: '2026-10-05', weeks: 1, stagger: true })
    expect(r.status).toBe(200)
    expect(r.body.count).toBe(14) // 2 personel × 7 gün (1 hafta)

    const db = getDB()
    const rowsA = db.prepare(`
      SELECT work_date, status, shift_def_id FROM shift_schedule
      WHERE staff_id=? AND work_date BETWEEN '2026-10-05' AND '2026-10-10' ORDER BY work_date
    `).all(staffA)
    expect(rowsA).toHaveLength(6)
    expect(rowsA[0].shift_def_id).toBe(morningId) // stagger 0 → desen başı
    expect(rowsA[4].status).toBe('off')
    expect(rowsA[4].shift_def_id).toBe(null)

    const rowsB = db.prepare(`
      SELECT work_date, status, shift_def_id FROM shift_schedule
      WHERE staff_id=? AND work_date BETWEEN '2026-10-05' AND '2026-10-10' ORDER BY work_date
    `).all(staffB)
    expect(rowsB[0].shift_def_id).toBe(morningId) // stagger 1 → desen 2. elemanı (yine sabah)
    expect(rowsB[3].status).toBe('off') // kayma: off günleri 1 gün öne gelir
  })

  it('şablon silinir', async () => {
    const del = await request(app).delete(`/api/shifts/rotation-templates/${templateId}`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(del.status).toBe(200)
    const list = await request(app).get('/api/shifts/rotation-templates')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(list.body.find(t => t.id === templateId)).toBeFalsy()
  })
})

describe('Faz 31 — Dönem kilidi (ay kapatma)', () => {
  let staffId

  beforeAll(() => {
    staffId = getDB().prepare("INSERT INTO staff(full_name, is_active, salary) VALUES('Kilit Test Personel', 1, 30000)")
      .run().lastInsertRowid
  })

  it('müdür dönemi kilitler, liste kilidi gösterir', async () => {
    const r = await request(app).post('/api/shifts/period-locks').set('Authorization', `Bearer ${managerToken}`)
      .send({ period: '2026-11', note: 'Kasım bordrosu kesildi' })
    expect(r.status).toBe(201)

    const list = await request(app).get('/api/shifts/period-locks').set('Authorization', `Bearer ${managerToken}`)
    expect(list.status).toBe(200)
    const lock = list.body.find(l => l.period === '2026-11')
    expect(lock).toBeTruthy()
    expect(lock.note).toBe('Kasım bordrosu kesildi')
  })

  it('süpervizör kilitleyemez (403), sadece müdür', async () => {
    const r = await request(app).post('/api/shifts/period-locks').set('Authorization', `Bearer ${shiftToken}`)
      .send({ period: '2026-12' })
    expect(r.status).toBe(403)
  })

  it('geçersiz period 400', async () => {
    const r = await request(app).post('/api/shifts/period-locks').set('Authorization', `Bearer ${managerToken}`)
      .send({ period: 'kasim' })
    expect(r.status).toBe(400)
  })

  it('kilitli aya puantaj yazımı 423 döner', async () => {
    const r = await request(app).post('/api/shifts/schedule').set('Authorization', `Bearer ${managerToken}`)
      .send({ entries: [{ staff_id: staffId, work_date: '2026-11-10', status: 'worked' }] })
    expect(r.status).toBe(423)
    expect(r.body.error).toMatch(/kilit/i)
    const row = getDB().prepare("SELECT id FROM shift_schedule WHERE staff_id=? AND work_date='2026-11-10'").get(staffId)
    expect(row).toBeFalsy()
  })

  it('kilitli aya FM ve silme de engellenir (423)', async () => {
    const ot = await request(app).post('/api/shifts/overtime/day').set('Authorization', `Bearer ${managerToken}`)
      .send({ staff_id: staffId, work_date: '2026-11-12', hours: 3 })
    expect(ot.status).toBe(423)

    const del = await request(app).delete(`/api/shifts/schedule/${staffId}/2026-11-12`).set('Authorization', `Bearer ${managerToken}`)
    expect(del.status).toBe(423)
  })

  it('kilitli olmayan aya yazım normal çalışır', async () => {
    const r = await request(app).post('/api/shifts/schedule').set('Authorization', `Bearer ${managerToken}`)
      .send({ entries: [{ staff_id: staffId, work_date: '2026-10-20', status: 'worked' }] })
    expect(r.status).toBe(200)
  })

  it('kilit açılınca yazım tekrar mümkün', async () => {
    const unlock = await request(app).delete('/api/shifts/period-locks/2026-11').set('Authorization', `Bearer ${managerToken}`)
    expect(unlock.status).toBe(200)

    const r = await request(app).post('/api/shifts/schedule').set('Authorization', `Bearer ${managerToken}`)
      .send({ entries: [{ staff_id: staffId, work_date: '2026-11-10', status: 'worked' }] })
    expect(r.status).toBe(200)
  })

  it('süpervizör kilit açamaz (403)', async () => {
    await request(app).post('/api/shifts/period-locks').set('Authorization', `Bearer ${managerToken}`)
      .send({ period: '2026-11' })
    const r = await request(app).delete('/api/shifts/period-locks/2026-11').set('Authorization', `Bearer ${shiftToken}`)
    expect(r.status).toBe(403)
    // temizle
    await request(app).delete('/api/shifts/period-locks/2026-11').set('Authorization', `Bearer ${managerToken}`)
  })
})
