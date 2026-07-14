import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let managerToken
let supervisorToken
let departmentId
let scheduledStaffId
let managerStaffId
let absentStaffId
let leaveRequestId
let overtimeRequestId

const workDate = '2025-08-04'
const month = '2025-08'

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  managerToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  supervisorToken = (await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })).body.token

  const db = getDB()
  departmentId = Number(db.prepare("INSERT INTO departments(name,color_class) VALUES('Operasyon Test','dept-green')").run().lastInsertRowid)
  const roleId = Number(db.prepare("INSERT INTO staff_roles(name,sort_order,expected_dept_id) VALUES('Vardiya Amiri',1,?)").run(departmentId).lastInsertRowid)
  const locationId = Number(db.prepare("INSERT INTO work_locations(name,dept_id,sort_order,is_active) VALUES('Test Yemekhane',?,1,1)").run(departmentId).lastInsertRowid)
  const shiftId = Number(db.prepare("INSERT INTO shift_definitions(name,start_hour,end_hour,color_class,min_staff) VALUES('Sabah 06-15',6,15,'green',2)").run().lastInsertRowid)

  scheduledStaffId = Number(db.prepare(`
    INSERT INTO staff(full_name,department_id,role_id,is_active,salary,tc_no,iban)
    VALUES('Okutma Bekleyen Personel',?,?,1,30000,'11111111111','TR0001')
  `).run(departmentId, roleId).lastInsertRowid)
  managerStaffId = Number(db.prepare(`
    INSERT INTO staff(full_name,department_id,role_id,position,is_active,salary,tc_no,iban)
    VALUES('Gunluk Operasyon Amiri',?,?,'Vardiya Amiri',1,36000,'22222222222','TR0002')
  `).run(departmentId, roleId).lastInsertRowid)
  absentStaffId = Number(db.prepare(`
    INSERT INTO staff(full_name,department_id,is_active,salary,tc_no,iban)
    VALUES('Devamsiz Operasyon Personeli',?,1,28000,'33333333333','TR0003')
  `).run(departmentId).lastInsertRowid)

  const insertSchedule = db.prepare(`
    INSERT INTO shift_schedule(staff_id,dept_id,shift_def_id,work_location_id,work_date,status)
    VALUES(?,?,?,?,?,?)
  `)
  insertSchedule.run(scheduledStaffId, departmentId, shiftId, locationId, workDate, 'scheduled')
  insertSchedule.run(managerStaffId, departmentId, shiftId, locationId, workDate, 'worked')
  insertSchedule.run(absentStaffId, departmentId, shiftId, locationId, workDate, 'absent')

  db.prepare(`
    INSERT INTO shift_coverage_rules(
      name,dept_id,role_id,work_location_id,shift_def_id,start_time,end_time,min_staff,days_of_week,is_active
    ) VALUES('Yemekhane Acilis',?,?,?,?, '06:00','15:00',3,'1,2,3,4,5,6,7',1)
  `).run(departmentId, roleId, locationId, shiftId)

  leaveRequestId = Number(db.prepare(`
    INSERT INTO leave_requests(staff_id,leave_type,start_date,end_date,total_days,status,reason)
    VALUES(?, 'annual', '2025-08-11', '2025-08-12', 2, 'pending', 'Planli izin')
  `).run(scheduledStaffId).lastInsertRowid)
  overtimeRequestId = Number(db.prepare(`
    INSERT INTO overtime_requests(staff_id,work_date,requested_hours,reason,status,compensation_type)
    VALUES(?, '2025-08-08', 2, 'Operasyon yogunlugu', 'pending', 'pay')
  `).run(managerStaffId).lastInsertRowid)
  db.prepare(`
    INSERT INTO overtime_records(staff_id,work_date,hours,reason,approved_by)
    VALUES(?, ?, 32, 'Aylik yuksek mesai', 1)
  `).run(managerStaffId, workDate)
  db.prepare(`
    INSERT INTO leave_documents(leave_request_id,file_url,file_name,mime_type,file_size,uploaded_by)
    VALUES(?, '/uploads/izin-belgesi.png', 'izin-belgesi.png', 'image/png', 123, 1)
  `).run(leaveRequestId)

  await request(app).post('/api/shifts/attendance/events')
    .set('Authorization', `Bearer ${supervisorToken}`)
    .send({
      staff_id: managerStaffId,
      external_event_id: 'operation-in',
      event_type: 'check_in',
      occurred_at: `${workDate}T06:00:00+03:00`,
      source: 'operation_test',
    })
  await request(app).post('/api/shifts/attendance/events')
    .set('Authorization', `Bearer ${supervisorToken}`)
    .send({
      staff_id: managerStaffId,
      external_event_id: 'operation-out',
      event_type: 'check_out',
      occurred_at: `${workDate}T15:00:00+03:00`,
      source: 'operation_test',
    })
})

describe('Phase 5 daily operations dashboard', () => {
  it('combines roster, card state, coverage, requests, costs and risks', async () => {
    const response = await request(app)
      .get('/api/shifts/operations/dashboard')
      .set('Authorization', `Bearer ${managerToken}`)
      .query({ date: workDate, month, dept_id: departmentId })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ date: workDate, month, dept_id: departmentId })
    expect(response.body.metrics).toMatchObject({
      active_staff: 3,
      scheduled: 2,
      worked: 1,
      absent: 1,
      pending_scan: 1,
      pending_leave_requests: 1,
      pending_overtime_requests: 1,
      coverage_missing: 1,
      overtime_hours_month: 32,
    })
    expect(response.body.roster.find(row => row.staff_id === scheduledStaffId).attendance_state).toBe('pending_scan')
    expect(response.body.roster.find(row => row.staff_id === managerStaffId).attendance_state).toBe('worked')
    expect(response.body.coverage[0]).toMatchObject({ name: 'Yemekhane Acilis', assigned: 2, missing: 1 })
    expect(response.body.duty_managers.some(row => row.staff_id === managerStaffId)).toBe(true)
    expect(response.body.risks.some(row => row.type === 'high_overtime' && row.staff_id === managerStaffId)).toBe(true)
    expect(response.body.breakdowns.departments[0].employer_total_cost).toBeGreaterThan(0)
    expect(response.body.trends.find(row => row.date === workDate)).toMatchObject({ scheduled: 2, absent: 1, coverage_missing: 1 })
  })

  it('validates that the selected date belongs to the requested month', async () => {
    const response = await request(app)
      .get('/api/shifts/operations/dashboard')
      .set('Authorization', `Bearer ${managerToken}`)
      .query({ date: workDate, month: '2025-09', dept_id: departmentId })

    expect(response.status).toBe(400)
    expect(response.body.error).toMatch(/month/)
  })
})

describe('Phase 5 puantaj closing package', () => {
  it('returns request, raw card, document, approval and accounting appendices', async () => {
    const response = await request(app)
      .get('/api/shifts/puantaj/closing-package')
      .set('Authorization', `Bearer ${managerToken}`)
      .query({ month, dept_id: departmentId })

    expect(response.status).toBe(200)
    expect(response.body.period).toBe(month)
    expect(response.body.approval.period).toBe(month)
    expect(response.body.leave_requests.some(row => row.id === leaveRequestId)).toBe(true)
    expect(response.body.overtime_requests.some(row => row.id === overtimeRequestId)).toBe(true)
    expect(response.body.attendance_events).toHaveLength(2)
    expect(response.body.documents[0]).toMatchObject({ request_type: 'leave', request_id: leaveRequestId })
    expect(response.body.accounting).toHaveLength(3)
    expect(response.body.summary).toMatchObject({
      staff_count: 3,
      leave_requests: 1,
      overtime_requests: 1,
      attendance_events: 2,
      documents: 1,
    })
  })

  it('requires management role for sensitive cost and raw card data', async () => {
    const response = await request(app)
      .get('/api/shifts/puantaj/closing-package')
      .query({ month, dept_id: departmentId })
    expect(response.status).toBe(401)
  })
})
