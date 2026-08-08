import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { recordPersonnelEvent } from './tracking-events.js'

let managerToken
let supervisorToken
let technicalToken
let staffId
let projectId
let departmentId
let roleId
let locationId
let checklistId
let scheduleId
let leaveId
let overtimeRequestId

function auth(token = managerToken) {
  return { Authorization: `Bearer ${token}` }
}

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  managerToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  supervisorToken = (await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })).body.token
  technicalToken = (await request(app).post('/api/auth/login').send({ username: 'teknik', password: 'admin123' })).body.token

  const db = getDB()
  projectId = db.prepare('SELECT id FROM projects ORDER BY id LIMIT 1').get().id
  departmentId = db.prepare('SELECT id FROM departments ORDER BY id LIMIT 1').get().id
  roleId = db.prepare('SELECT id FROM staff_roles ORDER BY id LIMIT 1').get().id
  locationId = db.prepare('SELECT id FROM work_locations ORDER BY id LIMIT 1').get().id

  const created = await request(app).post('/api/shifts/staff').set(auth()).send({
    full_name: 'Takip Yasam Dongusu Personeli',
    project_id: projectId,
    department_id: departmentId,
    role_id: roleId,
    primary_work_location_id: locationId,
    assignment_effective_from: '2026-01-01',
    hire_date: '2026-01-01',
  })
  expect(created.status).toBe(201)
  staffId = created.body.id
})

describe('personnel tracking APIs and controlled offboarding', () => {
  it('stores employment and project-aware assignment events for a new staff member', async () => {
    const assignments = getDB().prepare('SELECT * FROM staff_assignments WHERE staff_id=?').all(staffId)
    expect(assignments).toHaveLength(1)
    expect(assignments[0].project_id).toBe(projectId)

    const events = await request(app)
      .get(`/api/personnel/tracking/events?staff_id=${staffId}&from=2026-01-01&to=2026-12-31`)
      .set(auth())
    expect(events.status).toBe(200)
    expect(events.body.items.map(row => row.event_type)).toEqual(expect.arrayContaining([
      'assignment_changed', 'employment_started',
    ]))
  })

  it('records shift, leave and overtime changes as ordered revisions', async () => {
    const schedule = await request(app).post('/api/shifts/schedule').set(auth()).send({
      entries: [{
        staff_id: staffId,
        dept_id: departmentId,
        shift_def_id: null,
        work_location_id: locationId,
        work_date: '2099-01-12',
        status: 'scheduled',
      }],
    })
    expect(schedule.status).toBe(200)
    scheduleId = schedule.body.rows[0].id

    const revised = await request(app).post('/api/shifts/schedule').set(auth()).send({
      entries: [{
        staff_id: staffId,
        dept_id: departmentId,
        shift_def_id: null,
        work_location_id: locationId,
        work_date: '2099-01-12',
        status: 'absent',
        absent_reason: 'Test devamsizlik',
        change_reason: 'Plan degisikligi',
      }],
    })
    expect(revised.status).toBe(200)

    const leave = await request(app).post('/api/shifts/leave').set(auth()).send({
      staff_id: staffId,
      leave_type: 'annual',
      start_date: '2099-01-08',
      end_date: '2099-01-15',
      reason: 'Gelecek izin',
    })
    expect(leave.status).toBe(201)
    leaveId = leave.body.id

    const overtime = await request(app).post('/api/shifts/overtime/requests').set(auth()).send({
      staff_id: staffId,
      work_date: '2099-01-13',
      requested_hours: 2,
      reason: 'Gelecek mesai',
      compensation_type: 'pay',
    })
    expect(overtime.status).toBe(201)
    overtimeRequestId = overtime.body.id

    const shiftEvents = getDB().prepare(`
      SELECT * FROM personnel_tracking_events
      WHERE staff_id=? AND event_type='shift_changed' AND source_id=?
    `).all(staffId, String(scheduleId))
    expect(shiftEvents).toHaveLength(1)
    expect(JSON.parse(shiftEvents[0].before_json).status).toBe('scheduled')
    expect(JSON.parse(shiftEvents[0].after_json).status).toBe('absent')
  })

  it('starts offboarding, creates a checklist and blocks schedules after exit', async () => {
    const started = await request(app)
      .post(`/api/personnel/${staffId}/offboarding/start`)
      .set(auth(supervisorToken))
      .send({
        exit_date: '2099-01-10',
        exit_type: 'contract_end',
        reason: 'Sozlesme tamamlandi',
      })
    expect(started.status).toBe(201)
    checklistId = started.body.checklistId
    expect(started.body.impact.counts).toMatchObject({ schedules: 1, leaves: 1, overtime_requests: 1 })

    const blocked = await request(app).post('/api/shifts/schedule').set(auth()).send({
      entries: [{ staff_id: staffId, work_date: '2099-01-20', status: 'scheduled' }],
    })
    expect(blocked.status).toBe(409)
    expect(blocked.body.exit_date).toBe('2099-01-10')

    expect(() => getDB().prepare(`
      INSERT INTO shift_schedule(staff_id, work_date, status) VALUES(?,?,'scheduled')
    `).run(staffId, '2099-01-21')).toThrow(/Cikis tarihinden sonraya vardiya yazilamaz/)
  })

  it('requires a complete checklist and an explicit decision for every future record', async () => {
    const blocked = await request(app)
      .post(`/api/personnel/${staffId}/offboarding/finalize`)
      .set(auth())
      .send({ schedules: [], leaves: [], overtime_requests: [] })
    expect(blocked.status).toBe(409)
    expect(blocked.body.details.missing_ids).toContain(scheduleId)

    const db = getDB()
    db.prepare(`
      UPDATE hr_checklist_items
      SET done=1, done_at=CURRENT_TIMESTAMP, done_by=?
      WHERE checklist_id=?
    `).run(1, checklistId)
    db.prepare(`
      UPDATE hr_checklists SET status='completed', completed_at=CURRENT_TIMESTAMP WHERE id=?
    `).run(checklistId)

    db.prepare(`
      INSERT INTO staff_uniform_issues(staff_id, item_key, quantity, issued_by)
      VALUES(?, 'helmet', 1, 1)
    `).run(staffId)

    const decisions = {
      schedules: [{ id: scheduleId, action: 'cancel', reason: 'Cikis sonrasi vardiya' }],
      leaves: [{ id: leaveId, action: 'truncate', new_end_date: '2099-01-10', reason: 'Son calisma gunu' }],
      overtime_requests: [{ id: overtimeRequestId, action: 'cancel', reason: 'Cikis sonrasi mesai' }],
    }
    const equipmentBlocked = await request(app)
      .post(`/api/personnel/${staffId}/offboarding/finalize`)
      .set(auth())
      .send(decisions)
    expect(equipmentBlocked.status).toBe(409)
    expect(equipmentBlocked.body.details.equipment).toHaveLength(1)

    const finalized = await request(app)
      .post(`/api/personnel/${staffId}/offboarding/finalize`)
      .set(auth())
      .send({
        ...decisions,
        equipment_exception_reason: 'Baret saha sorumlusuna teslim edilecek',
      })
    expect(finalized.status).toBe(200)
    expect(getDB().prepare('SELECT is_active FROM staff WHERE id=?').get(staffId).is_active).toBe(0)
    expect(getDB().prepare('SELECT 1 FROM shift_schedule WHERE id=?').get(scheduleId)).toBeUndefined()
    expect(getDB().prepare('SELECT end_date FROM leave_requests WHERE id=?').get(leaveId).end_date).toBe('2099-01-10')
    expect(getDB().prepare('SELECT status FROM overtime_requests WHERE id=?').get(overtimeRequestId).status).toBe('rejected')
    expect(getDB().prepare(`
      SELECT COUNT(*) AS count FROM personnel_tracking_events
      WHERE staff_id=? AND event_type='employment_ended'
    `).get(staffId).count).toBe(1)
  })

  it('restores employment without deleting exit history', async () => {
    const restored = await request(app)
      .post(`/api/personnel/${staffId}/restore`)
      .set(auth())
      .send({
        effective_from: '2099-02-01',
        reason: 'Yeni donem sozlesmesi',
        project_id: projectId,
        department_id: departmentId,
        role_id: roleId,
        work_location_id: locationId,
      })
    expect(restored.status).toBe(200)
    const staff = getDB().prepare('SELECT * FROM staff WHERE id=?').get(staffId)
    expect(staff.is_active).toBe(1)
    expect(staff.exit_date).toBeNull()
    const eventTypes = getDB().prepare(`
      SELECT event_type FROM personnel_tracking_events WHERE staff_id=?
    `).all(staffId).map(row => row.event_type)
    expect(eventTypes).toEqual(expect.arrayContaining(['employment_ended', 'employment_restored']))
  })

  it('evaluates configurable alerts once and converts an alert into a follow-up', async () => {
    const db = getDB()
    const today = db.prepare("SELECT date('now','localtime') AS value").get().value
    for (let index = 0; index < 3; index += 1) {
      recordPersonnelEvent({
        staffId,
        eventType: 'shift_changed',
        effectiveAt: today,
        sourceType: 'shift_schedule',
        sourceId: `alert-${index}`,
        before: { shift_def_id: index },
        after: { shift_def_id: index + 1 },
        reason: 'Uyari testi vardiya degisikligi',
        actorUserId: 1,
      })
    }

    const first = await request(app)
      .get(`/api/personnel/tracking/alerts?staffId=${staffId}`)
      .set(auth())
    expect(first.status).toBe(200)
    const shiftAlert = first.body.items.find(row => row.rule_key === 'shift_changes')
    expect(shiftAlert).toBeTruthy()

    const notificationCount = db.prepare(`
      SELECT COUNT(*) AS count FROM notifications
      WHERE entity_type='personnel_tracking_alert' AND entity_id=?
    `).get(shiftAlert.id).count
    await request(app).get(`/api/personnel/tracking/alerts?staffId=${staffId}`).set(auth())
    expect(db.prepare(`
      SELECT COUNT(*) AS count FROM notifications
      WHERE entity_type='personnel_tracking_alert' AND entity_id=?
    `).get(shiftAlert.id).count).toBe(notificationCount)

    const followup = await request(app)
      .post(`/api/personnel/tracking/alerts/${shiftAlert.id}/followup`)
      .set(auth(supervisorToken))
      .send({ assigned_user_id: 1, due_at: today })
    expect(followup.status).toBe(201)
    expect(db.prepare('SELECT status FROM staff_followups WHERE id=?').get(followup.body.id).status).toBe('open')
  })

  it('limits rule changes to campus managers and returns tracking summaries', async () => {
    const denied = await request(app).patch('/api/personnel/tracking/settings')
      .set(auth(supervisorToken))
      .send({ rules: [{ rule_key: 'shift_changes', threshold_primary: 4 }] })
    expect(denied.status).toBe(403)

    const updated = await request(app).patch('/api/personnel/tracking/settings')
      .set(auth())
      .send({ rules: [{ rule_key: 'shift_changes', threshold_primary: 4, window_days: 45 }] })
    expect(updated.status).toBe(200)
    expect(updated.body.rules.find(row => row.rule_key === 'shift_changes')).toMatchObject({
      threshold_primary: 4,
      window_days: 45,
    })

    const overview = await request(app)
      .get('/api/personnel/tracking/overview?from=2026-01-01&to=2099-12-31')
      .set(auth())
    expect(overview.status).toBe(200)
    expect(overview.body.kpis).toHaveProperty('permanent_movements')
    const people = await request(app)
      .get(`/api/personnel/tracking/people?from=2026-01-01&to=2099-12-31&q=Takip Yasam`)
      .set(auth())
    expect(people.status).toBe(200)
    expect(people.body.items.find(row => row.id === staffId)).toMatchObject({ hire_date: '2026-01-01' })
    const exportDetails = await request(app)
      .get('/api/personnel/tracking/export-details?from=2026-01-01&to=2099-12-31')
      .set(auth())
    expect(exportDetails.status).toBe(200)
    expect(exportDetails.body).toEqual(expect.objectContaining({
      leaves: expect.any(Array), overtime: expect.any(Array), temporary_work: expect.any(Array),
    }))
  })

  it('denies tracking data to non-management roles', async () => {
    const denied = await request(app).get('/api/personnel/tracking/overview').set(auth(technicalToken))
    expect(denied.status).toBe(403)
  })
})
