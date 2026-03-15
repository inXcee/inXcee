import { getDB } from '../../shared/db/index.js'

export function getDepartments() {
  return getDB().prepare('SELECT * FROM departments ORDER BY id').all()
}

export function getShiftDefinitions() {
  return getDB().prepare('SELECT * FROM shift_definitions ORDER BY id').all()
}

export function getSchedule(weekStart, weekEnd, deptId) {
  const db = getDB()
  let query = `
    SELECT
      ss.id, ss.work_date, ss.status,
      p.id as personnel_id, p.full_name, p.gender,
      d.id as dept_id, d.name as dept_name, d.color_class as dept_color,
      sd.id as shift_def_id, sd.name as shift_name, sd.start_hour, sd.end_hour, sd.color_class as shift_color
    FROM shift_schedule ss
    JOIN personnel p ON p.id = ss.personnel_id
    JOIN departments d ON d.id = ss.dept_id
    JOIN shift_definitions sd ON sd.id = ss.shift_def_id
    WHERE ss.work_date BETWEEN ? AND ?
  `
  const params = [weekStart, weekEnd]
  if (deptId) {
    query += ' AND ss.dept_id = ?'
    params.push(deptId)
  }
  query += ' ORDER BY d.id, p.full_name, ss.work_date'
  return db.prepare(query).all(...params)
}

export function bulkAssignShifts(entries, createdBy) {
  const db = getDB()
  const upsert = db.prepare(`
    INSERT INTO shift_schedule(personnel_id, dept_id, shift_def_id, work_date, status, created_by)
    VALUES(@personnel_id, @dept_id, @shift_def_id, @work_date, 'scheduled', @created_by)
    ON CONFLICT(personnel_id, work_date) DO UPDATE SET
      shift_def_id = excluded.shift_def_id,
      dept_id = excluded.dept_id,
      status = excluded.status
  `)
  const tx = db.transaction(() => {
    entries.forEach(e => upsert.run({ ...e, created_by: createdBy }))
  })
  tx()
}

export function getPersonnelWithShiftStatus(date, deptId) {
  const db = getDB()
  let query = `
    SELECT
      p.id, p.full_name, p.gender, p.tc_no,
      d.id as dept_id, d.name as dept_name, d.color_class as dept_color,
      ss.id as schedule_id, ss.status as shift_status,
      sd.name as shift_name, sd.start_hour, sd.end_hour, sd.color_class as shift_color,
      lr.leave_type, lr.status as leave_status
    FROM personnel p
    LEFT JOIN departments d ON d.id = p.department_id
    LEFT JOIN shift_schedule ss ON ss.personnel_id = p.id AND ss.work_date = ?
    LEFT JOIN shift_definitions sd ON sd.id = ss.shift_def_id
    LEFT JOIN leave_requests lr ON lr.personnel_id = p.id
      AND lr.status = 'approved'
      AND ? BETWEEN lr.start_date AND lr.end_date
    WHERE p.check_out_date IS NULL AND p.check_in_date IS NOT NULL
  `
  const params = [date, date]
  if (deptId) {
    query += ' AND p.department_id = ?'
    params.push(deptId)
  }
  query += ' ORDER BY d.id, p.full_name'
  return db.prepare(query).all(...params)
}

export function createLeaveRequest(data) {
  const db = getDB()
  const existing = db.prepare(`
    SELECT id FROM leave_requests
    WHERE personnel_id = ? AND status != 'rejected'
      AND start_date <= ? AND end_date >= ?
  `).get(data.personnel_id, data.end_date, data.start_date)
  if (existing) throw new Error('Bu tarih aralığında zaten bir izin talebi mevcut')

  const r = db.prepare(`
    INSERT INTO leave_requests(personnel_id, leave_type, start_date, end_date, total_days, reason)
    VALUES(@personnel_id, @leave_type, @start_date, @end_date, @total_days, @reason)
  `).run(data)
  return r.lastInsertRowid
}

export function approveLeaveRequest(id, approvedBy, status) {
  const db = getDB()
  db.prepare(`
    UPDATE leave_requests SET status=?, approved_by=?, approved_at=datetime('now') WHERE id=?
  `).run(status, approvedBy, id)

  if (status === 'approved') {
    const req = db.prepare('SELECT * FROM leave_requests WHERE id=?').get(id)
    if (req) {
      db.prepare(`
        UPDATE shift_schedule SET status='on_leave'
        WHERE personnel_id=? AND work_date BETWEEN ? AND ?
      `).run(req.personnel_id, req.start_date, req.end_date)
    }
  }
}

export function getLeaveRequests(filters) {
  const db = getDB()
  let query = `
    SELECT lr.*, p.full_name, p.gender,
      d.name as dept_name, d.color_class as dept_color
    FROM leave_requests lr
    JOIN personnel p ON p.id = lr.personnel_id
    LEFT JOIN departments d ON d.id = p.department_id
    WHERE 1=1
  `
  const params = []
  if (filters.status) { query += ' AND lr.status=?'; params.push(filters.status) }
  if (filters.dept_id) { query += ' AND p.department_id=?'; params.push(filters.dept_id) }
  if (filters.personnel_id) { query += ' AND lr.personnel_id=?'; params.push(filters.personnel_id) }
  if (filters.leave_type) { query += ' AND lr.leave_type=?'; params.push(filters.leave_type) }
  query += ' ORDER BY lr.created_at DESC LIMIT 200'
  return db.prepare(query).all(...params)
}

export function getLeaveBalance(personnelId, year) {
  const db = getDB()
  let balance = db.prepare('SELECT * FROM leave_balance WHERE personnel_id=? AND year=?').get(personnelId, year)
  if (!balance) {
    db.prepare(`INSERT OR IGNORE INTO leave_balance(personnel_id,year) VALUES(?,?)`).run(personnelId, year)
    balance = db.prepare('SELECT * FROM leave_balance WHERE personnel_id=? AND year=?').get(personnelId, year)
  }
  return balance
}

export function createOvertime(data) {
  const db = getDB()
  const r = db.prepare(`
    INSERT INTO overtime_records(personnel_id, work_date, hours, reason, approved_by)
    VALUES(@personnel_id, @work_date, @hours, @reason, @approved_by)
  `).run(data)
  if (data.approved_by) {
    db.prepare(`
      UPDATE shift_schedule SET status='overtime'
      WHERE personnel_id=? AND work_date=?
    `).run(data.personnel_id, data.work_date)
  }
  return r.lastInsertRowid
}

export function getOvertimeRecords(filters) {
  const db = getDB()
  let query = `
    SELECT ot.*, p.full_name, p.gender, d.name as dept_name, d.color_class as dept_color
    FROM overtime_records ot
    JOIN personnel p ON p.id = ot.personnel_id
    LEFT JOIN departments d ON d.id = p.department_id
    WHERE 1=1
  `
  const params = []
  if (filters.dept_id) { query += ' AND p.department_id=?'; params.push(filters.dept_id) }
  if (filters.month) { query += " AND strftime('%Y-%m', ot.work_date)=?"; params.push(filters.month) }
  if (filters.personnel_id) { query += ' AND ot.personnel_id=?'; params.push(filters.personnel_id) }
  query += ' ORDER BY ot.work_date DESC LIMIT 200'
  return db.prepare(query).all(...params)
}

export function getOvertimeSummary(month) {
  return getDB().prepare(`
    SELECT d.id as dept_id, d.name as dept_name, d.color_class,
      COUNT(*) as record_count,
      SUM(ot.hours) as total_hours,
      COUNT(DISTINCT ot.personnel_id) as personnel_count
    FROM overtime_records ot
    JOIN personnel p ON p.id = ot.personnel_id
    JOIN departments d ON d.id = p.department_id
    WHERE strftime('%Y-%m', ot.work_date) = ?
    GROUP BY d.id
    ORDER BY total_hours DESC
  `).all(month)
}

export function createAttendanceLog(data) {
  const db = getDB()
  const r = db.prepare(`
    INSERT INTO attendance_logs(personnel_id, shift_schedule_id, check_in_at)
    VALUES(@personnel_id, @shift_schedule_id, datetime('now'))
  `).run(data)
  return r.lastInsertRowid
}

export function updateCheckout(logId) {
  const db = getDB()
  const log = db.prepare('SELECT * FROM attendance_logs WHERE id=?').get(logId)
  if (!log) throw new Error('Kayıt bulunamadı')
  const checkIn = new Date(log.check_in_at)
  const now = new Date()
  const actualHours = Math.round((now - checkIn) / 3600000 * 10) / 10
  db.prepare(`
    UPDATE attendance_logs SET check_out_at=datetime('now'), actual_hours=? WHERE id=?
  `).run(actualHours, logId)
  if (log.shift_schedule_id) {
    db.prepare(`UPDATE shift_schedule SET status='worked' WHERE id=?`).run(log.shift_schedule_id)
  }
}

export function getAttendanceLogs(filters) {
  const db = getDB()
  let query = `
    SELECT al.*, p.full_name, p.gender, d.name as dept_name, d.color_class as dept_color
    FROM attendance_logs al
    JOIN personnel p ON p.id = al.personnel_id
    LEFT JOIN departments d ON d.id = p.department_id
    WHERE 1=1
  `
  const params = []
  if (filters.date) { query += " AND date(al.check_in_at)=?"; params.push(filters.date) }
  if (filters.dept_id) { query += ' AND p.department_id=?'; params.push(filters.dept_id) }
  query += ' ORDER BY al.check_in_at DESC LIMIT 200'
  return db.prepare(query).all(...params)
}

export function getShiftStatistics(date) {
  const db = getDB()

  const byShift = db.prepare(`
    SELECT sd.id as shift_def_id, sd.name as shift_name, sd.color_class,
      sd.start_hour, sd.end_hour,
      COUNT(ss.id) as total,
      SUM(CASE WHEN p.gender='male' THEN 1 ELSE 0 END) as male_count,
      SUM(CASE WHEN p.gender='female' THEN 1 ELSE 0 END) as female_count
    FROM shift_schedule ss
    JOIN shift_definitions sd ON sd.id = ss.shift_def_id
    JOIN personnel p ON p.id = ss.personnel_id
    WHERE ss.work_date = ? AND ss.status IN ('scheduled','worked','overtime')
    GROUP BY sd.id
  `).all(date)

  const onLeave = db.prepare(`
    SELECT COUNT(*) as count FROM shift_schedule WHERE work_date=? AND status='on_leave'
  `).get(date)

  const absent = db.prepare(`
    SELECT COUNT(*) as count FROM shift_schedule WHERE work_date=? AND status='absent'
  `).get(date)

  const byDept = db.prepare(`
    SELECT d.id as dept_id, d.name as dept_name, d.color_class,
      COUNT(ss.id) as scheduled,
      SUM(CASE WHEN p.gender='male' THEN 1 ELSE 0 END) as male_count,
      SUM(CASE WHEN p.gender='female' THEN 1 ELSE 0 END) as female_count
    FROM shift_schedule ss
    JOIN departments d ON d.id = ss.dept_id
    JOIN personnel p ON p.id = ss.personnel_id
    WHERE ss.work_date = ?
    GROUP BY d.id
    ORDER BY d.id
  `).all(date)

  const monthStr = date.substring(0, 7)
  const overtimeMonth = db.prepare(`
    SELECT COALESCE(SUM(hours), 0) as total_hours,
      COUNT(*) as record_count
    FROM overtime_records
    WHERE strftime('%Y-%m', work_date) = ?
  `).get(monthStr)

  const pendingLeave = db.prepare(`
    SELECT COUNT(*) as count FROM leave_requests WHERE status='pending'
  `).get()

  return { byShift, onLeave: onLeave.count, absent: absent.count, byDept, overtimeMonth, pendingLeave: pendingLeave.count }
}

export function getDepartmentSummary() {
  return getDB().prepare(`
    SELECT d.id, d.name, d.color_class, d.description,
      COUNT(p.id) as personnel_count,
      SUM(CASE WHEN p.gender='male' THEN 1 ELSE 0 END) as male_count,
      SUM(CASE WHEN p.gender='female' THEN 1 ELSE 0 END) as female_count
    FROM departments d
    LEFT JOIN personnel p ON p.department_id = d.id
      AND p.check_out_date IS NULL AND p.check_in_date IS NOT NULL
    GROUP BY d.id
    ORDER BY d.id
  `).all()
}
