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

// ── Department CRUD ──
export function createDepartment(name, colorClass, description) {
  return getDB().prepare('INSERT INTO departments(name, color_class, description) VALUES(?,?,?)').run(name, colorClass, description || null).lastInsertRowid
}

export function updateDepartment(id, data) {
  const db = getDB()
  const sets = []
  const params = []
  if (data.name !== undefined) { sets.push('name=?'); params.push(data.name) }
  if (data.color_class !== undefined) { sets.push('color_class=?'); params.push(data.color_class) }
  if (data.description !== undefined) { sets.push('description=?'); params.push(data.description) }
  if (sets.length === 0) return
  params.push(id)
  db.prepare(`UPDATE departments SET ${sets.join(',')} WHERE id=?`).run(...params)
}

export function deleteDepartment(id) {
  const db = getDB()
  db.prepare('UPDATE personnel SET department_id=NULL WHERE department_id=?').run(id)
  db.prepare('DELETE FROM departments WHERE id=?').run(id)
}

export function assignPersonnelDepartment(personnelId, deptId) {
  getDB().prepare('UPDATE personnel SET department_id=? WHERE id=?').run(deptId, personnelId)
}

// ── Shift Definition CRUD ──
export function createShiftDefinition(name, startHour, endHour, colorClass) {
  return getDB().prepare('INSERT INTO shift_definitions(name, start_hour, end_hour, color_class) VALUES(?,?,?,?)').run(name, startHour, endHour, colorClass).lastInsertRowid
}

export function updateShiftDefinition(id, data) {
  const db = getDB()
  const sets = []
  const params = []
  if (data.name !== undefined) { sets.push('name=?'); params.push(data.name) }
  if (data.start_hour !== undefined) { sets.push('start_hour=?'); params.push(data.start_hour) }
  if (data.end_hour !== undefined) { sets.push('end_hour=?'); params.push(data.end_hour) }
  if (data.color_class !== undefined) { sets.push('color_class=?'); params.push(data.color_class) }
  if (sets.length === 0) return
  params.push(id)
  db.prepare(`UPDATE shift_definitions SET ${sets.join(',')} WHERE id=?`).run(...params)
}

export function deleteShiftDefinition(id) {
  getDB().prepare('DELETE FROM shift_definitions WHERE id=?').run(id)
}

// ── Leave cancellation ──
export function cancelLeaveRequest(id) {
  const db = getDB()
  const req = db.prepare('SELECT * FROM leave_requests WHERE id=?').get(id)
  if (!req) throw new Error('İzin talebi bulunamadı')
  db.prepare("UPDATE leave_requests SET status='rejected' WHERE id=?").run(id)
  // restore shift statuses
  db.prepare(`UPDATE shift_schedule SET status='scheduled' WHERE personnel_id=? AND work_date BETWEEN ? AND ? AND status='on_leave'`).run(req.personnel_id, req.start_date, req.end_date)
}

// ── Shift swap requests ──
// First create the table if needed
export function ensureSwapTable() {
  getDB().exec(`CREATE TABLE IF NOT EXISTS shift_swap_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requester_id INTEGER NOT NULL REFERENCES personnel(id),
    target_id INTEGER NOT NULL REFERENCES personnel(id),
    swap_date TEXT NOT NULL,
    requester_shift_id INTEGER REFERENCES shift_definitions(id),
    target_shift_id INTEGER REFERENCES shift_definitions(id),
    reason TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
    approved_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)
}

export function createSwapRequest(data) {
  ensureSwapTable()
  return getDB().prepare(`
    INSERT INTO shift_swap_requests(requester_id, target_id, swap_date, requester_shift_id, target_shift_id, reason)
    VALUES(@requester_id, @target_id, @swap_date, @requester_shift_id, @target_shift_id, @reason)
  `).run(data).lastInsertRowid
}

export function getSwapRequests(filters = {}) {
  ensureSwapTable()
  let query = `
    SELECT sr.*,
      p1.full_name as requester_name, p1.gender as requester_gender,
      p2.full_name as target_name, p2.gender as target_gender,
      sd1.name as requester_shift_name, sd2.name as target_shift_name
    FROM shift_swap_requests sr
    JOIN personnel p1 ON p1.id = sr.requester_id
    JOIN personnel p2 ON p2.id = sr.target_id
    LEFT JOIN shift_definitions sd1 ON sd1.id = sr.requester_shift_id
    LEFT JOIN shift_definitions sd2 ON sd2.id = sr.target_shift_id
    WHERE 1=1
  `
  const params = []
  if (filters.status) { query += ' AND sr.status=?'; params.push(filters.status) }
  query += ' ORDER BY sr.created_at DESC LIMIT 100'
  return getDB().prepare(query).all(...params)
}

export function approveSwapRequest(id, approvedBy) {
  ensureSwapTable()
  const db = getDB()
  const swap = db.prepare('SELECT * FROM shift_swap_requests WHERE id=? AND status=?').get(id, 'pending')
  if (!swap) throw new Error('Takas talebi bulunamadı veya zaten işlenmiş')

  db.transaction(() => {
    // Swap the shift definitions in shift_schedule
    if (swap.requester_shift_id && swap.target_shift_id) {
      db.prepare('UPDATE shift_schedule SET shift_def_id=? WHERE personnel_id=? AND work_date=?').run(swap.target_shift_id, swap.requester_id, swap.swap_date)
      db.prepare('UPDATE shift_schedule SET shift_def_id=? WHERE personnel_id=? AND work_date=?').run(swap.requester_shift_id, swap.target_id, swap.swap_date)
    }
    db.prepare("UPDATE shift_swap_requests SET status='approved', approved_by=? WHERE id=?").run(approvedBy, id)
  })()
}

export function rejectSwapRequest(id, approvedBy) {
  ensureSwapTable()
  getDB().prepare("UPDATE shift_swap_requests SET status='rejected', approved_by=? WHERE id=?").run(approvedBy, id)
}

// ── Copy week schedule ──
export function copyWeekSchedule(sourceWeekStart, targetWeekStart, createdBy) {
  const db = getDB()
  const sourceEnd = addDaysStr(sourceWeekStart, 6)
  const rows = db.prepare('SELECT personnel_id, dept_id, shift_def_id, work_date FROM shift_schedule WHERE work_date BETWEEN ? AND ?').all(sourceWeekStart, sourceEnd)

  const dayDiff = Math.round((new Date(targetWeekStart) - new Date(sourceWeekStart)) / 86400000)

  const upsert = db.prepare(`
    INSERT INTO shift_schedule(personnel_id, dept_id, shift_def_id, work_date, status, created_by)
    VALUES(?, ?, ?, ?, 'scheduled', ?)
    ON CONFLICT(personnel_id, work_date) DO UPDATE SET shift_def_id=excluded.shift_def_id, dept_id=excluded.dept_id, status='scheduled'
  `)

  db.transaction(() => {
    rows.forEach(r => {
      const newDate = addDaysStr(r.work_date, dayDiff)
      upsert.run(r.personnel_id, r.dept_id, r.shift_def_id, newDate, createdBy)
    })
  })()

  return rows.length
}

function addDaysStr(dateStr, n) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

// ── Rotation templates ──
export function applyRotationTemplate(personnelIds, deptId, shiftDefIds, startDate, weeks, createdBy) {
  const db = getDB()
  const upsert = db.prepare(`
    INSERT INTO shift_schedule(personnel_id, dept_id, shift_def_id, work_date, status, created_by)
    VALUES(?, ?, ?, ?, 'scheduled', ?)
    ON CONFLICT(personnel_id, work_date) DO UPDATE SET shift_def_id=excluded.shift_def_id, dept_id=excluded.dept_id, status='scheduled'
  `)

  let count = 0
  db.transaction(() => {
    for (let w = 0; w < weeks; w++) {
      for (let d = 0; d < 7; d++) {
        const date = addDaysStr(startDate, w * 7 + d)
        personnelIds.forEach((pid, idx) => {
          const shiftIdx = (idx + w) % shiftDefIds.length
          upsert.run(pid, deptId, shiftDefIds[shiftIdx], date, createdBy)
          count++
        })
      }
    }
  })()
  return count
}

// ── Personnel search for forms ──
export function searchPersonnel(term) {
  const db = getDB()
  return db.prepare(`
    SELECT p.id, p.full_name, p.tc_no, p.gender, d.name as dept_name
    FROM personnel p
    LEFT JOIN departments d ON d.id = p.department_id
    WHERE p.check_out_date IS NULL AND p.check_in_date IS NOT NULL
      AND (p.full_name LIKE ? OR CAST(p.id AS TEXT) LIKE ?)
    ORDER BY p.full_name LIMIT 20
  `).all(`%${term}%`, `%${term}%`)
}

// ── Delete shift schedule entry ──
export function deleteScheduleEntry(personnelId, workDate) {
  getDB().prepare('DELETE FROM shift_schedule WHERE personnel_id=? AND work_date=?').run(personnelId, workDate)
}

// ── Personnel detail / profile ──
export function getPersonnelDetail(personnelId) {
  const db = getDB()

  const person = db.prepare(`
    SELECT p.*, d.name as dept_name, d.color_class as dept_color
    FROM personnel p
    LEFT JOIN departments d ON d.id = p.department_id
    WHERE p.id = ?
  `).get(personnelId)
  if (!person) throw new Error('Personel bulunamadi')

  const shiftHistory = db.prepare(`
    SELECT ss.work_date, ss.status,
      sd.name as shift_name, sd.start_hour, sd.end_hour, sd.color_class as shift_color,
      d.name as dept_name, d.color_class as dept_color
    FROM shift_schedule ss
    JOIN shift_definitions sd ON sd.id = ss.shift_def_id
    JOIN departments d ON d.id = ss.dept_id
    WHERE ss.personnel_id = ?
    ORDER BY ss.work_date DESC
    LIMIT 100
  `).all(personnelId)

  const leaveHistory = db.prepare(`
    SELECT lr.*
    FROM leave_requests lr
    WHERE lr.personnel_id = ?
    ORDER BY lr.created_at DESC
    LIMIT 50
  `).all(personnelId)

  const overtimeRecords = db.prepare(`
    SELECT ot.*
    FROM overtime_records ot
    WHERE ot.personnel_id = ?
    ORDER BY ot.work_date DESC
    LIMIT 50
  `).all(personnelId)

  const attendanceLogs = db.prepare(`
    SELECT al.*
    FROM attendance_logs al
    WHERE al.personnel_id = ?
    ORDER BY al.check_in_at DESC
    LIMIT 50
  `).all(personnelId)

  // Summary stats
  const totalShifts = db.prepare('SELECT COUNT(*) as count FROM shift_schedule WHERE personnel_id=?').get(personnelId).count
  const workedShifts = db.prepare("SELECT COUNT(*) as count FROM shift_schedule WHERE personnel_id=? AND status='worked'").get(personnelId).count
  const totalOvertime = db.prepare('SELECT COALESCE(SUM(hours),0) as total FROM overtime_records WHERE personnel_id=?').get(personnelId).total
  const totalLeave = db.prepare("SELECT COUNT(*) as count FROM leave_requests WHERE personnel_id=? AND status='approved'").get(personnelId).count
  const absentCount = db.prepare("SELECT COUNT(*) as count FROM shift_schedule WHERE personnel_id=? AND status='absent'").get(personnelId).count

  return {
    person,
    shiftHistory,
    leaveHistory,
    overtimeRecords,
    attendanceLogs,
    stats: { totalShifts, workedShifts, totalOvertime, totalLeave, absentCount }
  }
}
