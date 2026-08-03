import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let managerToken
let departmentId
let shiftDefinitionId

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  managerToken = (await request(app)
    .post('/api/auth/login')
    .send({ username: 'mudur', password: 'admin123' })).body.token
  const db = getDB()
  departmentId = Number(db.prepare("INSERT INTO departments(name, color_class) VALUES('Kart Uzlastirma Test', 'blue')").run().lastInsertRowid)
  shiftDefinitionId = Number(db.prepare(`
    INSERT INTO shift_definitions(name, start_hour, end_hour, color_class)
    VALUES('Kart Test 06-15', 6, 15, 'green')
  `).run().lastInsertRowid)
})

function createScheduledStaff(label, workDate) {
  const db = getDB()
  const staffId = Number(db.prepare(`
    INSERT INTO staff(full_name, department_id, is_active, salary)
    VALUES(?, ?, 1, 30000)
  `).run(label, departmentId).lastInsertRowid)
  const scheduleId = Number(db.prepare(`
    INSERT INTO shift_schedule(staff_id, dept_id, shift_def_id, work_date, status)
    VALUES(?, ?, ?, ?, 'scheduled')
  `).run(staffId, departmentId, shiftDefinitionId, workDate).lastInsertRowid)
  return { staffId, scheduleId }
}

async function addEvent(staffId, externalEventId, eventType, occurredAt, extra = {}) {
  return request(app)
    .post('/api/shifts/attendance/events')
    .set('Authorization', `Bearer ${managerToken}`)
    .send({
      staff_id: staffId,
      external_event_id: externalEventId,
      event_type: eventType,
      occurred_at: occurredAt,
      source: 'test_kiosk',
      device_id: 'test-device-1',
      ...extra,
    })
}

async function reconcile(workDate, staffId) {
  return request(app)
    .post('/api/shifts/attendance/reconcile')
    .set('Authorization', `Bearer ${managerToken}`)
    .send({ date: workDate, staff_id: staffId })
}

describe('Kart/kiosk puantaj uzlastirmasi (045)', () => {
  it('ham olaylari idempotent ve degistirilemez saklar', async () => {
    const { staffId } = createScheduledStaff('Ham Olay Personeli', '2025-09-01')
    const first = await addEvent(staffId, 'immutable-1', 'check_in', '2025-09-01T06:00:00+03:00')
    const duplicate = await addEvent(staffId, 'immutable-1', 'check_in', '2025-09-01T06:00:00+03:00')

    expect(first.status).toBe(201)
    expect(duplicate.status).toBe(200)
    expect(duplicate.body.id).toBe(first.body.id)
    expect(duplicate.body.inserted).toBe(false)

    const db = getDB()
    expect(() => db.prepare('UPDATE attendance_events SET source = ? WHERE id = ?').run('changed', first.body.id))
      .toThrow(/immutable/)
    expect(() => db.prepare('DELETE FROM attendance_events WHERE id = ?').run(first.body.id))
      .toThrow(/immutable/)
  })

  it('uyumlu giris-cikisi N yapar, kaynagi gosterir ve tekrar calismada cogaltmaz', async () => {
    const date = '2025-09-02'
    const { staffId, scheduleId } = createScheduledStaff('Eslesen Kart Personeli', date)
    await addEvent(staffId, 'matched-in', 'check_in', `${date}T05:58:00+03:00`)
    await addEvent(staffId, 'matched-out', 'check_out', `${date}T15:04:00+03:00`)

    const first = await reconcile(date, staffId)
    expect(first.status).toBe(200)
    expect(first.body).toMatchObject({ processed: 1, changed: 1, matched: 1 })
    expect(getDB().prepare('SELECT status FROM shift_schedule WHERE id = ?').get(scheduleId).status).toBe('worked')

    const second = await reconcile(date, staffId)
    expect(second.body.idempotent).toBe(1)
    expect(getDB().prepare(`
      SELECT COUNT(*) AS count FROM attendance_daily_reconciliations
      WHERE staff_id = ? AND work_date = ?
    `).get(staffId, date).count).toBe(1)

    const days = await request(app)
      .get('/api/shifts/puantaj/days?month=2025-09')
      .set('Authorization', `Bearer ${managerToken}`)
    const day = days.body.days[staffId].find(row => row.date === date)
    expect(day).toMatchObject({
      status: 'worked',
      attendance_source: 'card_kiosk',
      reconciliation_status: 'matched',
      attendance_exception_count: 0,
    })
  })

  it('kilitli gun ve elle onayli gunu degistirmez', async () => {
    const lockedDate = '2025-10-03'
    const locked = createScheduledStaff('Kilitli Kart Personeli', lockedDate)
    await addEvent(locked.staffId, 'locked-in', 'check_in', `${lockedDate}T06:00:00+03:00`)
    await addEvent(locked.staffId, 'locked-out', 'check_out', `${lockedDate}T15:00:00+03:00`)
    getDB().prepare('INSERT INTO period_locks(period, note) VALUES(?, ?)').run('2025-10', 'test lock')

    const lockedResult = await reconcile(lockedDate, locked.staffId)
    expect(lockedResult.body.results[0].reason_code).toBe('period_locked')
    expect(getDB().prepare('SELECT status FROM shift_schedule WHERE id = ?').get(locked.scheduleId).status).toBe('scheduled')
    getDB().prepare('DELETE FROM period_locks WHERE period = ?').run('2025-10')

    const approvedDate = '2025-10-06'
    const approved = createScheduledStaff('Onayli Kart Personeli', approvedDate)
    getDB().prepare(`
      INSERT INTO puantaj_daily_approvals(period, work_date, dept_scope, dept_id, status)
      VALUES('2025-10', ?, 'all', NULL, 'approved')
    `).run(approvedDate)
    await addEvent(approved.staffId, 'approved-in', 'check_in', `${approvedDate}T06:00:00+03:00`)
    await addEvent(approved.staffId, 'approved-out', 'check_out', `${approvedDate}T15:00:00+03:00`)

    const approvedResult = await reconcile(approvedDate, approved.staffId)
    expect(approvedResult.body.results[0].reason_code).toBe('approved_day')
    expect(getDB().prepare('SELECT status FROM shift_schedule WHERE id = ?').get(approved.scheduleId).status).toBe('scheduled')
  })

  it('onayli izni kart hareketinden ustun tutar', async () => {
    const date = '2025-10-07'
    const { staffId, scheduleId } = createScheduledStaff('Izinli Kart Personeli', date)
    getDB().prepare(`
      INSERT INTO leave_requests(staff_id, leave_type, start_date, end_date, total_days, status)
      VALUES(?, 'annual', ?, ?, 1, 'approved')
    `).run(staffId, date, date)
    await addEvent(staffId, 'leave-in', 'check_in', `${date}T06:00:00+03:00`)
    await addEvent(staffId, 'leave-out', 'check_out', `${date}T15:00:00+03:00`)

    const result = await reconcile(date, staffId)
    expect(result.body.results[0].reason_code).toBe('approved_leave')
    expect(getDB().prepare('SELECT status FROM shift_schedule WHERE id = ?').get(scheduleId).status).toBe('scheduled')
  })

  // Uzlastirma plani KART GERCEGIYLE karsilastirir. O gun hicbir okutma yoksa
  // gun gozlemsizdir; kimse icin "okutmadi" denemez. Canlida kart sistemi hic
  // kullanilmadigi icin bu kural olmadan her gun ~180 kritik istisna aciliyordu.
  it('o gun hic okutma yoksa istisna acmaz, gunu gozlemsiz sayar', async () => {
    const date = '2025-10-08'
    const { staffId, scheduleId } = createScheduledStaff('Eksik Okutma Personeli', date)

    const result = await reconcile(date, staffId)
    expect(result.body).toMatchObject({ processed: 1, exceptions: 0 })
    expect(result.body.results[0].reason_code).toBe('no_card_activity')
    expect(getDB().prepare('SELECT status FROM shift_schedule WHERE id = ?').get(scheduleId).status).toBe('scheduled')
    const acik = getDB().prepare(`
      SELECT COUNT(*) n FROM attendance_exceptions
      WHERE staff_id = ? AND work_date = ? AND status = 'open'
    `).get(staffId, date)
    expect(acik.n).toBe(0)
  })

  // Ayni gun BASKASI okuttuysa kart sistemi o gun kullanimdadir; bu kisinin
  // okutmamasi artik gercek ve uzerinde islem yapilabilir bir bulgudur.
  it('o gun baska biri okuttuysa okutmayan icin istisna acar', async () => {
    const date = '2025-10-21'
    const okutan = createScheduledStaff('Okutan Personel', date)
    const okutmayan = createScheduledStaff('Okutmayan Personel', date)
    await addEvent(okutan.staffId, 'aktif-in', 'check_in', `${date}T06:05:00+03:00`)
    await addEvent(okutan.staffId, 'aktif-out', 'check_out', `${date}T15:05:00+03:00`)

    const result = await reconcile(date, okutmayan.staffId)
    expect(result.body.results[0].reason_code).toBe('missing_scan')
    const exception = getDB().prepare(`
      SELECT * FROM attendance_exceptions
      WHERE staff_id = ? AND work_date = ? AND status = 'open'
    `).get(okutmayan.staffId, date)
    expect(exception.exception_type).toBe('missing_scan')
  })

  it('gec giris ve erken cikisi inceleme kuyruguna dusurur', async () => {
    const date = '2025-10-09'
    const { staffId, scheduleId } = createScheduledStaff('Gec Erken Personeli', date)
    await addEvent(staffId, 'late-in', 'check_in', `${date}T06:35:00+03:00`)
    await addEvent(staffId, 'early-out', 'check_out', `${date}T14:25:00+03:00`)

    const result = await reconcile(date, staffId)
    expect(result.body.results[0]).toMatchObject({ result_status: 'exception', exception_count: 2 })
    expect(getDB().prepare('SELECT status FROM shift_schedule WHERE id = ?').get(scheduleId).status).toBe('scheduled')
    const types = getDB().prepare(`
      SELECT exception_type FROM attendance_exceptions
      WHERE staff_id = ? AND work_date = ? AND status = 'open'
      ORDER BY exception_type
    `).all(staffId, date).map(row => row.exception_type)
    expect(types).toEqual(['early_departure', 'late_arrival'])
  })

  it('fazla sureyi odemeye yazmadan mesai adayi olusturur', async () => {
    const date = '2025-10-10'
    const { staffId, scheduleId } = createScheduledStaff('Mesai Adayi Personeli', date)
    await addEvent(staffId, 'overtime-in', 'check_in', `${date}T05:57:00+03:00`)
    await addEvent(staffId, 'overtime-out', 'check_out', `${date}T16:05:00+03:00`)

    const result = await reconcile(date, staffId)
    expect(result.body.results[0]).toMatchObject({
      result_status: 'matched',
      reason_code: 'overtime_candidate',
      overtime_candidate_minutes: 65,
    })
    expect(getDB().prepare('SELECT status FROM shift_schedule WHERE id = ?').get(scheduleId).status).toBe('worked')
    expect(getDB().prepare('SELECT COUNT(*) AS count FROM overtime_records WHERE staff_id = ? AND work_date = ?').get(staffId, date).count).toBe(0)
    const exception = getDB().prepare(`
      SELECT exception_type FROM attendance_exceptions
      WHERE staff_id = ? AND work_date = ? AND status = 'open'
    `).get(staffId, date)
    expect(exception.exception_type).toBe('overtime_candidate')

    const exceptionId = getDB().prepare(`
      SELECT id FROM attendance_exceptions
      WHERE staff_id = ? AND work_date = ? AND status = 'open'
    `).get(staffId, date).id
    const requestResult = await request(app)
      .post(`/api/shifts/attendance/exceptions/${exceptionId}/overtime-request`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ compensation_type: 'pay' })

    expect(requestResult.status).toBe(201)
    expect(requestResult.body.request).toMatchObject({
      staff_id: staffId,
      work_date: date,
      status: 'pending',
      requested_hours: 1.08,
      actual_hours: 1.08,
      actual_start: '15:00',
      actual_end: '16:05',
      compensation_type: 'pay',
    })
    expect(requestResult.body.exception).toMatchObject({
      id: exceptionId,
      status: 'resolved',
      overtime_request_id: requestResult.body.request.id,
    })
    expect(getDB().prepare('SELECT COUNT(*) AS count FROM overtime_records WHERE staff_id = ? AND work_date = ?').get(staffId, date).count).toBe(0)

    const duplicate = await request(app)
      .post(`/api/shifts/attendance/exceptions/${exceptionId}/overtime-request`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ compensation_type: 'pay' })
    expect(duplicate.status).toBe(409)
    expect(getDB().prepare('SELECT COUNT(*) AS count FROM overtime_requests WHERE staff_id = ? AND work_date = ?').get(staffId, date).count).toBe(1)
  })

  it('mevcut giris-cikis istasyonu olaylarini otomatik iceri alir', async () => {
    const date = '2025-10-13'
    const { staffId, scheduleId } = createScheduledStaff('Istasyon Kart Personeli', date)
    const db = getDB()
    const cardId = Number(db.prepare(`
      INSERT INTO cards(holder_type, holder_id, card_type, code, status)
      VALUES('staff', ?, 'access', ?, 'active')
    `).run(staffId, `TEST-ACCESS-${staffId}`).lastInsertRowid)
    const stationId = Number(db.prepare(`
      INSERT INTO scan_stations(name, station_type, api_key_hash, is_active)
      VALUES(?, 'generic', 'test-hash', 1)
    `).run(`Test Istasyon ${staffId}`).lastInsertRowid)
    db.prepare(`
      INSERT INTO access_events(card_id, holder_type, holder_id, station_id, event_type, result, scanned_at)
      VALUES(?, 'staff', ?, ?, 'entry', 'ok', '2025-10-13 02:58:00')
    `).run(cardId, staffId, stationId)
    db.prepare(`
      INSERT INTO access_events(card_id, holder_type, holder_id, station_id, event_type, result, scanned_at)
      VALUES(?, 'staff', ?, ?, 'exit', 'ok', '2025-10-13 12:02:00')
    `).run(cardId, staffId, stationId)

    const result = await reconcile(date, staffId)
    expect(result.body).toMatchObject({ imported_events: 2, matched: 1 })
    expect(db.prepare('SELECT status FROM shift_schedule WHERE id = ?').get(scheduleId).status).toBe('worked')
    expect(db.prepare(`
      SELECT COUNT(*) AS count FROM attendance_events
      WHERE staff_id = ? AND source = 'access_station'
    `).get(staffId).count).toBe(2)
  })

  it('eslesmeyen karti ham olay ve kritik istisna olarak saklar', async () => {
    const response = await request(app)
      .post('/api/shifts/attendance/events')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        card_code: 'TANIMSIZ-KART-045',
        external_event_id: 'unknown-card-045',
        event_type: 'scan',
        occurred_at: '2025-10-14T08:00:00+03:00',
        source: 'test_kiosk',
      })

    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({ match_status: 'unmatched', staff_id: null })
    const exception = getDB().prepare(`
      SELECT * FROM attendance_exceptions
      WHERE source_event_id = ? AND status = 'open'
    `).get(response.body.id)
    expect(exception).toMatchObject({ exception_type: 'unmatched_event', severity: 'critical' })
  })
})
