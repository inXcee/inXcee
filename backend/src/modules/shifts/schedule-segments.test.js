import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let managerToken
let supervisorToken
let staffId
let secondStaffId
let shiftDefId
let roleId
let locationId
let deptId

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  managerToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  supervisorToken = (await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })).body.token
  const db = getDB()
  deptId = db.prepare("INSERT INTO departments(name, color_class) VALUES('Segment Test Departman', 'dept-blue')").run().lastInsertRowid
  roleId = db.prepare("INSERT INTO staff_roles(name, sort_order) VALUES('Segment Test Rol', 1)").run().lastInsertRowid
  locationId = db.prepare("INSERT INTO work_locations(name, dept_id, site, sort_order) VALUES('Segment Test Lokal', ?, 'OTC', 1)").run(deptId).lastInsertRowid
  shiftDefId = db.prepare("INSERT INTO shift_definitions(name, start_hour, end_hour, color_class) VALUES('Segment Gündüz', '08:00', '17:00', 'shift-blue')").run().lastInsertRowid
  staffId = db.prepare("INSERT INTO staff(full_name, department_id, role_id, is_active) VALUES('Segment Personel', ?, ?, 1)")
    .run(deptId, roleId).lastInsertRowid
  secondStaffId = db.prepare("INSERT INTO staff(full_name, department_id, role_id, is_active) VALUES('Uygun Aday', ?, ?, 1)")
    .run(deptId, roleId).lastInsertRowid
  const assignment = db.prepare(`
    INSERT INTO staff_assignments(staff_id, department_id, role_id, work_location_id, effective_from, note)
    VALUES(?, ?, ?, ?, '2028-01-01', 'Segment test assignment')
  `)
  assignment.run(staffId, deptId, roleId, locationId)
  assignment.run(secondStaffId, deptId, roleId, locationId)
})

describe('Phase 3 split shifts and operational coverage', () => {
  it('migration creates segment and coverage tables plus swap links', () => {
    const db = getDB()
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='shift_schedule_segments'").get()).toBeTruthy()
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='shift_coverage_rules'").get()).toBeTruthy()
    const columns = db.prepare('PRAGMA table_info(shift_swap_requests)').all().map(row => row.name)
    expect(columns).toEqual(expect.arrayContaining(['requester_segment_id', 'target_segment_id', 'target_accepted_at']))
  })

  it('creates multiple non-overlapping segments under one daily schedule', async () => {
    const first = await request(app).post('/api/shifts/schedule/segments')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        staff_id: staffId,
        dept_id: deptId,
        work_date: '2028-03-06',
        shift_def_id: shiftDefId,
        role_id: roleId,
        work_location_id: locationId,
        start_time: '08:00',
        end_time: '12:00',
        break_minutes: 15,
      })
    expect(first.status).toBe(201)
    expect(first.body.row.sequence_no).toBe(1)

    const second = await request(app).post('/api/shifts/schedule/segments')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        staff_id: staffId,
        dept_id: deptId,
        work_date: '2028-03-06',
        role_id: roleId,
        work_location_id: locationId,
        start_time: '13:00',
        end_time: '17:00',
        break_minutes: 30,
      })
    expect(second.status).toBe(201)
    expect(second.body.row.sequence_no).toBe(2)

    const detail = await request(app).get(`/api/shifts/schedule/${staffId}/2028-03-06/segments`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(detail.status).toBe(200)
    expect(detail.body.segments).toHaveLength(2)
    expect(detail.body.schedule.status).toBe('scheduled')

    const schedule = await request(app).get('/api/shifts/schedule?week=2028-03-06&week_end=2028-03-06')
      .set('Authorization', `Bearer ${managerToken}`)
    const row = schedule.body.find(item => item.staff_id === staffId)
    expect(row.segments).toHaveLength(2)
    expect(row.segments[0]).toMatchObject({ start_time: '08:00', end_time: '12:00', role_name: 'Segment Test Rol' })
  })

  it('rejects overlapping segment and allows update/delete of a valid segment', async () => {
    const overlap = await request(app).post('/api/shifts/schedule/segments')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ staff_id: staffId, work_date: '2028-03-06', start_time: '11:00', end_time: '14:00' })
    expect(overlap.status).toBe(409)
    expect(overlap.body.conflicting_segment).toBeTruthy()

    const row = getDB().prepare('SELECT id FROM shift_schedule_segments WHERE schedule_id=(SELECT id FROM shift_schedule WHERE staff_id=? AND work_date=?) ORDER BY sequence_no DESC').get(staffId, '2028-03-06')
    const updated = await request(app).put(`/api/shifts/schedule/segments/${row.id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ start_time: '13:30', end_time: '17:30', break_minutes: 20 })
    expect(updated.status).toBe(200)
    expect(updated.body.break_minutes).toBe(20)

    const removed = await request(app).delete(`/api/shifts/schedule/segments/${row.id}`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(removed.status).toBe(200)
    expect(getDB().prepare('SELECT id FROM shift_schedule_segments WHERE id=?').get(row.id)).toBeFalsy()
  })

  it('coverage rule counts matching role, location and time only once per person', async () => {
    const rule = await request(app).post('/api/shifts/coverage-rules')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        name: 'OTC Sabah Ikramci',
        dept_id: deptId,
        role_id: roleId,
        work_location_id: locationId,
        start_time: '08:00',
        end_time: '12:00',
        min_staff: 2,
        days_of_week: '1,2,3,4,5,6,7',
      })
    expect(rule.status).toBe(201)

    const coverage = await request(app).get('/api/shifts/coverage?from=2028-03-06&to=2028-03-06')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(coverage.status).toBe(200)
    const count = coverage.body.rule_counts.find(item => item.rule_id === rule.body.id)
    expect(count).toMatchObject({ assigned: 1, min_staff: 2, missing: 1 })

    const breakdown = await request(app).get('/api/shifts/breakdown?from=2028-03-06&to=2028-03-06')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(breakdown.body.location_counts.find(item => item.work_location_id === locationId)).toMatchObject({ assigned: 1 })
  })

  it('copies split-shift segments when a week is copied', async () => {
    const copied = await request(app).post('/api/shifts/schedule/copy-week')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ source_week: '2028-03-06', target_week: '2028-03-13' })
    expect(copied.status).toBe(200)
    const target = await request(app).get(`/api/shifts/schedule/${staffId}/2028-03-13/segments`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(target.body.segments).toHaveLength(1)
    expect(target.body.segments[0]).toMatchObject({ start_time: '08:00', end_time: '12:00', work_location_id: locationId })
  })

  it('candidate suggestions score matching available staff and flag conflicts/leaves', async () => {
    await request(app).post('/api/shifts/schedule')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ entries: [{ staff_id: staffId, dept_id: deptId, work_date: '2028-03-07', shift_def_id: shiftDefId, status: 'scheduled' }] })
    getDB().prepare("INSERT INTO leave_requests(staff_id, leave_type, start_date, end_date, total_days, status) VALUES(?, 'annual', '2028-03-07', '2028-03-07', 1, 'approved')")
      .run(secondStaffId)

    const candidates = await request(app).get('/api/shifts/schedule/candidates')
      .query({ date: '2028-03-07', dept_id: deptId, role_id: roleId, work_location_id: locationId, shift_def_id: shiftDefId })
      .set('Authorization', `Bearer ${managerToken}`)
    expect(candidates.status).toBe(200)
    const conflict = candidates.body.candidates.find(item => item.id === staffId)
    const leave = candidates.body.candidates.find(item => item.id === secondStaffId)
    expect(conflict.eligible).toBe(false)
    expect(conflict.reasons).toContain('time_conflict')
    expect(leave.eligible).toBe(false)
    expect(leave.reasons).toContain('approved_leave')
  })

  it('supervisor cannot override approved leave even with a reason', async () => {
    getDB().prepare("INSERT INTO leave_requests(staff_id, leave_type, start_date, end_date, total_days, status) VALUES(?, 'annual', '2028-03-08', '2028-03-08', 1, 'approved')")
      .run(staffId)
    const response = await request(app).post('/api/shifts/schedule')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({
        entries: [{ staff_id: staffId, work_date: '2028-03-08', shift_def_id: shiftDefId, status: 'scheduled' }],
        override_leave: true,
        override_reason: 'Amir operasyon gerekcesi',
      })
    expect(response.status).toBe(403)
  })

  it('segment swap requires target acceptance and swaps operational details', async () => {
    const requester = await request(app).post('/api/shifts/schedule/segments')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ staff_id: staffId, dept_id: deptId, work_date: '2028-03-09', role_id: roleId, work_location_id: locationId, start_time: '08:00', end_time: '12:00' })
    const target = await request(app).post('/api/shifts/schedule/segments')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ staff_id: secondStaffId, dept_id: deptId, work_date: '2028-03-09', role_id: roleId, work_location_id: locationId, start_time: '13:00', end_time: '17:00' })
    expect(requester.status).toBe(201)
    expect(target.status).toBe(201)

    const created = await request(app).post('/api/shifts/swaps')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        requester_id: staffId,
        target_id: secondStaffId,
        swap_date: '2028-03-09',
        requester_segment_id: requester.body.row.id,
        target_segment_id: target.body.row.id,
        reason: 'Operasyon noktasi degisikligi',
      })
    expect(created.status).toBe(201)

    const blocked = await request(app).patch(`/api/shifts/swaps/${created.body.id}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(blocked.status).toBe(400)
    expect(blocked.body.error).toContain('kabul')

    const accepted = await request(app).patch(`/api/shifts/swaps/${created.body.id}/accept`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ target_id: secondStaffId })
    expect(accepted.status).toBe(200)
    expect(accepted.body.target_accepted_at).toBeTruthy()

    const approved = await request(app).patch(`/api/shifts/swaps/${created.body.id}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(approved.status).toBe(200)
    const db = getDB()
    expect(db.prepare('SELECT start_time, end_time FROM shift_schedule_segments WHERE id=?').get(requester.body.row.id))
      .toMatchObject({ start_time: '13:00', end_time: '17:00' })
    expect(db.prepare('SELECT start_time, end_time FROM shift_schedule_segments WHERE id=?').get(target.body.row.id))
      .toMatchObject({ start_time: '08:00', end_time: '12:00' })
  })
})
