import { beforeAll, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let managerToken
let supervisorToken
let staffId

const pngBuffer = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
)

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  managerToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  supervisorToken = (await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })).body.token
  const db = getDB()
  const deptId = db.prepare("INSERT INTO departments(name,color_class) VALUES('Faz 4 Test','dept-blue')").run().lastInsertRowid
  staffId = db.prepare("INSERT INTO staff(full_name,department_id,is_active,salary) VALUES('Faz Dort Personel',?,1,30000)")
    .run(deptId).lastInsertRowid
})

describe('Phase 4 leave, overtime and puantaj workflow', () => {
  it('applies the workflow migration when leave_requests already contains data', () => {
    const populated = new Database(':memory:')
    populated.exec(`
      PRAGMA foreign_keys=ON;
      CREATE TABLE users(id INTEGER PRIMARY KEY);
      CREATE TABLE staff(id INTEGER PRIMARY KEY);
      CREATE TABLE puantaj_codes(id INTEGER PRIMARY KEY, code TEXT, leave_type TEXT);
      CREATE TABLE leave_requests(id INTEGER PRIMARY KEY, staff_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE shift_schedule(id INTEGER PRIMARY KEY, staff_id INTEGER, work_date TEXT);
      CREATE TABLE overtime_records(id INTEGER PRIMARY KEY, staff_id INTEGER, work_date TEXT, hours REAL);
      INSERT INTO users(id) VALUES(1);
      INSERT INTO staff(id) VALUES(1);
      INSERT INTO puantaj_codes(id,code,leave_type) VALUES(1,'N',NULL);
      INSERT INTO leave_requests(id,staff_id) VALUES(1,1);
    `)

    const sql = readFileSync(new URL('../../shared/db/migrations/047_puantaj_request_workflow.sql', import.meta.url), 'utf8')
    expect(() => populated.exec(sql)).not.toThrow()
    expect(populated.prepare('SELECT updated_at, version FROM leave_requests WHERE id=1').get()).toMatchObject({ version: 1 })
    expect(populated.prepare('SELECT updated_at FROM leave_requests WHERE id=1').get().updated_at).toBeTruthy()
    populated.close()
  })

  it('creates request workflow tables, code effects and optimistic version columns', () => {
    const db = getDB()
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='overtime_requests'").get()).toBeTruthy()
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='leave_documents'").get()).toBeTruthy()
    const codeColumns = db.prepare('PRAGMA table_info(puantaj_codes)').all().map(row => row.name)
    expect(codeColumns).toEqual(expect.arrayContaining([
      'is_paid', 'sgk_day_factor', 'day_multiplier', 'hour_multiplier',
      'overtime_effect', 'requires_document', 'requires_reason',
    ]))
    const scheduleColumns = db.prepare('PRAGMA table_info(shift_schedule)').all().map(row => row.name)
    expect(scheduleColumns).toEqual(expect.arrayContaining(['puantaj_code_id', 'row_version']))
  })

  it('requires configured leave evidence, stores multiple documents and reflects approval in puantaj', async () => {
    const codes = await request(app).get('/api/shifts/puantaj/codes').set('Authorization', `Bearer ${managerToken}`)
    const sickCode = codes.body.find(code => code.leave_type === 'sick')
    const configured = await request(app).put(`/api/shifts/puantaj/codes/${sickCode.id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ requires_document: true, requires_reason: true, is_paid: false, sgk_day_factor: 0 })
    expect(configured.status).toBe(200)
    expect(configured.body.requires_document).toBe(1)

    const created = await request(app).post('/api/shifts/leave')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({
        staff_id: staffId,
        leave_type: 'sick',
        start_date: '2029-06-04',
        end_date: '2029-06-04',
        reason: 'Doktor raporu',
      })
    expect(created.status).toBe(201)

    const blocked = await request(app).patch(`/api/shifts/leave/${created.body.id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'approved', expected_version: 1 })
    expect(blocked.status).toBe(409)
    expect(blocked.body.document_required).toBe(true)

    const uploaded = await request(app).post(`/api/shifts/request-documents/leave/${created.body.id}`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .attach('documents', pngBuffer, { filename: 'rapor-1.png', contentType: 'image/png' })
      .attach('documents', pngBuffer, { filename: 'rapor-2.png', contentType: 'image/png' })
    expect(uploaded.status).toBe(201)
    expect(uploaded.body).toHaveLength(2)

    const approved = await request(app).patch(`/api/shifts/leave/${created.body.id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'approved', expected_version: 1, review_note: 'Belge kontrol edildi' })
    expect(approved.status).toBe(200)
    expect(approved.body.row).toMatchObject({ status: 'approved', version: 2 })

    const listed = await request(app).get('/api/shifts/leave')
      .set('Authorization', `Bearer ${managerToken}`)
      .query({ staff_id: staffId })
    const leave = listed.body.find(row => row.id === created.body.id)
    expect(leave.document_count).toBe(2)

    const schedule = getDB().prepare("SELECT * FROM shift_schedule WHERE staff_id=? AND work_date='2029-06-04'").get(staffId)
    expect(schedule.status).toBe('on_leave')
    expect(schedule.puantaj_code_id).toBe(sickCode.id)
  })

  it('keeps overtime pending until review and creates a linked payment record after approval', async () => {
    const created = await request(app).post('/api/shifts/overtime/requests')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({
        staff_id: staffId,
        work_date: '2029-06-05',
        planned_start: '17:00',
        planned_end: '20:00',
        requested_hours: 3,
        reason: 'Aksam kapanis destegi',
        compensation_type: 'pay',
      })
    expect(created.status).toBe(201)
    expect(created.body.status).toBe('pending')
    expect(getDB().prepare('SELECT * FROM overtime_records WHERE overtime_request_id=?').get(created.body.id)).toBeFalsy()

    const uploaded = await request(app).post(`/api/shifts/request-documents/overtime/${created.body.id}`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .attach('documents', pngBuffer, { filename: 'mesai.png', contentType: 'image/png' })
    expect(uploaded.status).toBe(201)

    const approved = await request(app).patch(`/api/shifts/overtime/requests/${created.body.id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'approved', expected_version: 1, actual_hours: 3.5, actual_start: '17:00', actual_end: '20:30' })
    expect(approved.status).toBe(200)
    expect(approved.body).toMatchObject({ status: 'approved', version: 2, actual_hours: 3.5 })
    expect(getDB().prepare('SELECT hours FROM overtime_records WHERE overtime_request_id=?').get(created.body.id).hours).toBe(3.5)

    const stale = await request(app).patch(`/api/shifts/overtime/requests/${created.body.id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'rejected', expected_version: 1, review_note: 'Eski ekran' })
    expect(stale.status).toBe(409)
    expect(stale.body.conflict).toBe(true)

    const list = await request(app).get('/api/shifts/overtime/requests')
      .set('Authorization', `Bearer ${managerToken}`)
      .query({ month: '2029-06', staff_id: staffId })
    expect(list.body[0].document_count).toBe(1)
  })

  it('rejects stale puantaj cell writes and returns the current row version', async () => {
    const first = await request(app).post('/api/shifts/schedule')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ entries: [{ staff_id: staffId, work_date: '2029-06-06', status: 'worked' }] })
    expect(first.status).toBe(200)
    expect(first.body.rows[0].row_version).toBe(1)

    const second = await request(app).post('/api/shifts/schedule')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ entries: [{ staff_id: staffId, work_date: '2029-06-06', status: 'off', expected_version: 1 }] })
    expect(second.status).toBe(200)
    expect(second.body.rows[0].row_version).toBe(2)

    const stale = await request(app).post('/api/shifts/schedule')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ entries: [{ staff_id: staffId, work_date: '2029-06-06', status: 'absent', expected_version: 1 }] })
    expect(stale.status).toBe(409)
    expect(stale.body).toMatchObject({ conflict: true, current_version: 2 })

    const removed = await request(app).delete('/api/shifts/schedule/' + staffId + '/2029-06-06')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .query({ expected_version: 2 })
    expect(removed.status).toBe(200)

    const writeAfterDelete = await request(app).post('/api/shifts/schedule')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ entries: [{ staff_id: staffId, work_date: '2029-06-06', status: 'worked', expected_version: 2 }] })
    expect(writeAfterDelete.status).toBe(409)
    expect(writeAfterDelete.body).toMatchObject({ conflict: true, current_version: 0 })
  })

  it('uses configurable leave multipliers in payroll calculation', async () => {
    const codes = await request(app).get('/api/shifts/puantaj/codes').set('Authorization', `Bearer ${managerToken}`)
    const annualCode = codes.body.find(code => code.leave_type === 'annual')
    await request(app).put(`/api/shifts/puantaj/codes/${annualCode.id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ is_paid: true, day_multiplier: 0.5, sgk_day_factor: 1 })

    const leave = await request(app).post('/api/shifts/leave')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ staff_id: staffId, leave_type: 'annual', start_date: '2029-06-07', end_date: '2029-06-07' })
    await request(app).patch(`/api/shifts/leave/${leave.body.id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'approved', expected_version: 1 })

    const puantaj = await request(app).get('/api/shifts/puantaj?month=2029-06')
      .set('Authorization', `Bearer ${managerToken}`)
    const row = puantaj.body.find(item => item.id === staffId)
    expect(row.paid_leave_units).toBe(0.5)
    expect(row.leave_pay).toBe(500)
    expect(row.sgk_day_units).toBe(1)
  })
})
