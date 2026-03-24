import { getDB } from '../../shared/db/index.js'

// ── Departments ──
export function getDepartments() {
  return getDB().prepare('SELECT * FROM departments ORDER BY id').all()
}

export function getShiftDefinitions() {
  return getDB().prepare('SELECT * FROM shift_definitions ORDER BY id').all()
}

// ── Staff CRUD ──
export function getStaffList(filters = {}) {
  const db = getDB()
  let query = `
    SELECT s.*, d.name as dept_name, d.color_class as dept_color
    FROM staff s
    LEFT JOIN departments d ON d.id = s.department_id
    WHERE 1=1
  `
  const params = []
  if (filters.dept_id) { query += ' AND s.department_id = ?'; params.push(filters.dept_id) }
  if (filters.is_active !== undefined) { query += ' AND s.is_active = ?'; params.push(filters.is_active) }
  if (filters.gender) { query += ' AND s.gender = ?'; params.push(filters.gender) }
  if (filters.search) {
    query += ' AND (s.full_name LIKE ? OR s.tc_no LIKE ? OR s.phone LIKE ? OR s.position LIKE ?)'
    const term = `%${filters.search}%`
    params.push(term, term, term, term)
  }
  query += ' ORDER BY s.full_name'
  return db.prepare(query).all(...params)
}

export function getStaffById(id) {
  return getDB().prepare(`
    SELECT s.*, d.name as dept_name, d.color_class as dept_color
    FROM staff s
    LEFT JOIN departments d ON d.id = s.department_id
    WHERE s.id = ?
  `).get(id)
}

export function createStaff(data) {
  const db = getDB()
  const r = db.prepare(`
    INSERT INTO staff(tc_no,full_name,phone,email,position,department_id,hire_date,birth_date,
      address,emergency_contact,emergency_phone,blood_type,gender,salary,notes,is_active)
    VALUES(@tc_no,@full_name,@phone,@email,@position,@department_id,@hire_date,@birth_date,
      @address,@emergency_contact,@emergency_phone,@blood_type,@gender,@salary,@notes,@is_active)
  `).run({
    tc_no: data.tc_no || null,
    full_name: data.full_name,
    phone: data.phone || null,
    email: data.email || null,
    position: data.position || null,
    department_id: data.department_id || null,
    hire_date: data.hire_date || null,
    birth_date: data.birth_date || null,
    address: data.address || null,
    emergency_contact: data.emergency_contact || null,
    emergency_phone: data.emergency_phone || null,
    blood_type: data.blood_type || null,
    gender: data.gender || null,
    salary: data.salary || null,
    notes: data.notes || null,
    is_active: data.is_active !== undefined ? data.is_active : 1,
  })
  return r.lastInsertRowid
}

export function updateStaff(id, data) {
  const db = getDB()
  const fields = ['tc_no','full_name','phone','email','position','department_id','hire_date','birth_date',
    'address','emergency_contact','emergency_phone','blood_type','gender','salary','notes','is_active']
  const sets = []
  const params = []
  fields.forEach(f => {
    if (data[f] !== undefined) {
      sets.push(`${f}=?`)
      params.push(data[f] === '' ? null : data[f])
    }
  })
  if (sets.length === 0) return
  params.push(id)
  db.prepare(`UPDATE staff SET ${sets.join(',')} WHERE id=?`).run(...params)
}

export function deleteStaff(id) {
  const db = getDB()
  // Soft delete — is_active = 0
  db.prepare('UPDATE staff SET is_active = 0 WHERE id = ?').run(id)
}

export function searchStaff(term) {
  const db = getDB()
  return db.prepare(`
    SELECT s.id, s.full_name, s.tc_no, s.gender, s.phone, s.position, d.name as dept_name
    FROM staff s
    LEFT JOIN departments d ON d.id = s.department_id
    WHERE s.is_active = 1
      AND (s.full_name LIKE ? OR CAST(s.id AS TEXT) LIKE ? OR s.tc_no LIKE ? OR s.phone LIKE ?)
    ORDER BY s.full_name LIMIT 20
  `).all(`%${term}%`, `%${term}%`, `%${term}%`, `%${term}%`)
}

// ── Schedule ──
export function getSchedule(weekStart, weekEnd, deptId) {
  const db = getDB()
  let query = `
    SELECT
      ss.id, ss.work_date, ss.status,
      s.id as staff_id, s.full_name, s.gender, s.position,
      COALESCE(ss.dept_id, s.department_id) as dept_id,
      d.name as dept_name, d.color_class as dept_color,
      sd.id as shift_def_id, sd.name as shift_name, sd.start_hour, sd.end_hour, sd.color_class as shift_color
    FROM shift_schedule ss
    JOIN staff s ON s.id = ss.staff_id
    LEFT JOIN departments d ON d.id = COALESCE(ss.dept_id, s.department_id)
    LEFT JOIN shift_definitions sd ON sd.id = ss.shift_def_id
    WHERE ss.work_date BETWEEN ? AND ?
  `
  const params = [weekStart, weekEnd]
  if (deptId) {
    query += ' AND COALESCE(ss.dept_id, s.department_id) = ?'
    params.push(deptId)
  }
  query += ' ORDER BY d.id, s.full_name, ss.work_date'
  return db.prepare(query).all(...params)
}

export function bulkAssignShifts(entries, createdBy) {
  const db = getDB()
  const upsert = db.prepare(`
    INSERT INTO shift_schedule(staff_id, dept_id, shift_def_id, work_date, status, created_by)
    VALUES(@staff_id, @dept_id, @shift_def_id, @work_date, @status, @created_by)
    ON CONFLICT(staff_id, work_date) DO UPDATE SET
      shift_def_id = excluded.shift_def_id,
      dept_id = excluded.dept_id,
      status = excluded.status
  `)
  const tx = db.transaction(() => {
    entries.forEach(e => upsert.run({
      ...e,
      status: e.status || 'scheduled',
      shift_def_id: e.shift_def_id || null,
      created_by: createdBy,
    }))
  })
  tx()
}

export function getStaffWithShiftStatus(date, deptId) {
  const db = getDB()
  let query = `
    SELECT
      s.id, s.full_name, s.gender, s.tc_no, s.phone, s.position,
      d.id as dept_id, d.name as dept_name, d.color_class as dept_color,
      ss.id as schedule_id, ss.status as shift_status,
      sd.name as shift_name, sd.start_hour, sd.end_hour, sd.color_class as shift_color,
      lr.leave_type, lr.status as leave_status
    FROM staff s
    LEFT JOIN departments d ON d.id = s.department_id
    LEFT JOIN shift_schedule ss ON ss.staff_id = s.id AND ss.work_date = ?
    LEFT JOIN shift_definitions sd ON sd.id = ss.shift_def_id
    LEFT JOIN leave_requests lr ON lr.staff_id = s.id
      AND lr.status = 'approved'
      AND ? BETWEEN lr.start_date AND lr.end_date
    WHERE s.is_active = 1
  `
  const params = [date, date]
  if (deptId) {
    query += ' AND s.department_id = ?'
    params.push(deptId)
  }
  query += ' ORDER BY d.id, s.full_name'
  return db.prepare(query).all(...params)
}

// ── Leave ──
export function createLeaveRequest(data) {
  const db = getDB()
  const existing = db.prepare(`
    SELECT id FROM leave_requests
    WHERE staff_id = ? AND status != 'rejected'
      AND start_date <= ? AND end_date >= ?
  `).get(data.staff_id, data.end_date, data.start_date)
  if (existing) throw new Error('Bu tarih aralığında zaten bir izin talebi mevcut')

  const r = db.prepare(`
    INSERT INTO leave_requests(staff_id, leave_type, start_date, end_date, total_days, reason)
    VALUES(@staff_id, @leave_type, @start_date, @end_date, @total_days, @reason)
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
        WHERE staff_id=? AND work_date BETWEEN ? AND ?
      `).run(req.staff_id, req.start_date, req.end_date)
    }
  }
}

export function getLeaveRequests(filters) {
  const db = getDB()
  let query = `
    SELECT lr.*, s.full_name, s.gender, s.position,
      d.name as dept_name, d.color_class as dept_color
    FROM leave_requests lr
    JOIN staff s ON s.id = lr.staff_id
    LEFT JOIN departments d ON d.id = s.department_id
    WHERE 1=1
  `
  const params = []
  if (filters.status) { query += ' AND lr.status=?'; params.push(filters.status) }
  if (filters.dept_id) { query += ' AND s.department_id=?'; params.push(filters.dept_id) }
  if (filters.staff_id) { query += ' AND lr.staff_id=?'; params.push(filters.staff_id) }
  if (filters.leave_type) { query += ' AND lr.leave_type=?'; params.push(filters.leave_type) }
  query += ' ORDER BY lr.created_at DESC LIMIT 200'
  return db.prepare(query).all(...params)
}

export function getLeaveBalance(staffId, year) {
  const db = getDB()
  let balance = db.prepare('SELECT * FROM leave_balance WHERE staff_id=? AND year=?').get(staffId, year)
  if (!balance) {
    db.prepare(`INSERT OR IGNORE INTO leave_balance(staff_id,year) VALUES(?,?)`).run(staffId, year)
    balance = db.prepare('SELECT * FROM leave_balance WHERE staff_id=? AND year=?').get(staffId, year)
  }
  return balance
}

// ── Overtime ──
export function createOvertime(data) {
  const db = getDB()
  const r = db.prepare(`
    INSERT INTO overtime_records(staff_id, work_date, hours, reason, approved_by)
    VALUES(@staff_id, @work_date, @hours, @reason, @approved_by)
  `).run(data)
  if (data.approved_by) {
    db.prepare(`
      UPDATE shift_schedule SET status='overtime'
      WHERE staff_id=? AND work_date=?
    `).run(data.staff_id, data.work_date)
  }
  return r.lastInsertRowid
}

export function getOvertimeRecords(filters) {
  const db = getDB()
  let query = `
    SELECT ot.*, s.full_name, s.gender, s.position, d.name as dept_name, d.color_class as dept_color
    FROM overtime_records ot
    JOIN staff s ON s.id = ot.staff_id
    LEFT JOIN departments d ON d.id = s.department_id
    WHERE 1=1
  `
  const params = []
  if (filters.dept_id) { query += ' AND s.department_id=?'; params.push(filters.dept_id) }
  if (filters.month) { query += " AND strftime('%Y-%m', ot.work_date)=?"; params.push(filters.month) }
  if (filters.staff_id) { query += ' AND ot.staff_id=?'; params.push(filters.staff_id) }
  query += ' ORDER BY ot.work_date DESC LIMIT 200'
  return db.prepare(query).all(...params)
}

export function getOvertimeSummary(month) {
  return getDB().prepare(`
    SELECT d.id as dept_id, d.name as dept_name, d.color_class,
      COUNT(*) as record_count,
      SUM(ot.hours) as total_hours,
      COUNT(DISTINCT ot.staff_id) as staff_count
    FROM overtime_records ot
    JOIN staff s ON s.id = ot.staff_id
    JOIN departments d ON d.id = s.department_id
    WHERE strftime('%Y-%m', ot.work_date) = ?
    GROUP BY d.id
    ORDER BY total_hours DESC
  `).all(month)
}

export function updateOvertime(id, data) {
  const db = getDB()
  const sets = []
  const params = []
  if (data.hours !== undefined) { sets.push('hours=?'); params.push(data.hours) }
  if (data.reason !== undefined) { sets.push('reason=?'); params.push(data.reason) }
  if (data.work_date !== undefined) { sets.push('work_date=?'); params.push(data.work_date) }
  if (sets.length === 0) return
  params.push(id)
  db.prepare(`UPDATE overtime_records SET ${sets.join(',')} WHERE id=?`).run(...params)
}

export function deleteOvertime(id) {
  getDB().prepare('DELETE FROM overtime_records WHERE id=?').run(id)
}

// ── Attendance ──
export function createAttendanceLog(data) {
  const db = getDB()
  const r = db.prepare(`
    INSERT INTO attendance_logs(staff_id, shift_schedule_id, check_in_at)
    VALUES(@staff_id, @shift_schedule_id, datetime('now'))
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
    SELECT al.*, s.full_name, s.gender, s.position, d.name as dept_name, d.color_class as dept_color
    FROM attendance_logs al
    JOIN staff s ON s.id = al.staff_id
    LEFT JOIN departments d ON d.id = s.department_id
    WHERE 1=1
  `
  const params = []
  if (filters.date) { query += " AND date(al.check_in_at)=?"; params.push(filters.date) }
  if (filters.dept_id) { query += ' AND s.department_id=?'; params.push(filters.dept_id) }
  query += ' ORDER BY al.check_in_at DESC LIMIT 200'
  return db.prepare(query).all(...params)
}

// ── Statistics ──
export function getShiftStatistics(date) {
  const db = getDB()

  const byShift = db.prepare(`
    SELECT sd.id as shift_def_id, sd.name as shift_name, sd.color_class,
      sd.start_hour, sd.end_hour,
      COUNT(ss.id) as total,
      SUM(CASE WHEN s.gender='male' THEN 1 ELSE 0 END) as male_count,
      SUM(CASE WHEN s.gender='female' THEN 1 ELSE 0 END) as female_count
    FROM shift_schedule ss
    JOIN shift_definitions sd ON sd.id = ss.shift_def_id
    JOIN staff s ON s.id = ss.staff_id
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
      SUM(CASE WHEN s.gender='male' THEN 1 ELSE 0 END) as male_count,
      SUM(CASE WHEN s.gender='female' THEN 1 ELSE 0 END) as female_count
    FROM shift_schedule ss
    JOIN departments d ON d.id = ss.dept_id
    JOIN staff s ON s.id = ss.staff_id
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

  const totalStaff = db.prepare('SELECT COUNT(*) as count FROM staff WHERE is_active = 1').get()

  return { byShift, onLeave: onLeave.count, absent: absent.count, byDept, overtimeMonth, pendingLeave: pendingLeave.count, totalStaff: totalStaff.count }
}

// ── Department CRUD ──
export function getDepartmentSummary() {
  return getDB().prepare(`
    SELECT d.id, d.name, d.color_class, d.description,
      COUNT(s.id) as staff_count,
      SUM(CASE WHEN s.gender='male' THEN 1 ELSE 0 END) as male_count,
      SUM(CASE WHEN s.gender='female' THEN 1 ELSE 0 END) as female_count
    FROM departments d
    LEFT JOIN staff s ON s.department_id = d.id AND s.is_active = 1
    GROUP BY d.id
    ORDER BY d.id
  `).all()
}

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
  db.prepare('UPDATE staff SET department_id=NULL WHERE department_id=?').run(id)
  db.prepare('DELETE FROM departments WHERE id=?').run(id)
}

export function assignStaffDepartment(staffId, deptId) {
  getDB().prepare('UPDATE staff SET department_id=? WHERE id=?').run(deptId, staffId)
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
  db.prepare(`UPDATE shift_schedule SET status='scheduled' WHERE staff_id=? AND work_date BETWEEN ? AND ? AND status='on_leave'`).run(req.staff_id, req.start_date, req.end_date)
}

// ── Shift swap requests ──
export function ensureSwapTable() {
  getDB().exec(`CREATE TABLE IF NOT EXISTS shift_swap_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requester_id INTEGER NOT NULL REFERENCES staff(id),
    target_id INTEGER NOT NULL REFERENCES staff(id),
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
      s1.full_name as requester_name, s1.gender as requester_gender,
      s2.full_name as target_name, s2.gender as target_gender,
      sd1.name as requester_shift_name, sd2.name as target_shift_name
    FROM shift_swap_requests sr
    JOIN staff s1 ON s1.id = sr.requester_id
    JOIN staff s2 ON s2.id = sr.target_id
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
    if (swap.requester_shift_id && swap.target_shift_id) {
      db.prepare('UPDATE shift_schedule SET shift_def_id=? WHERE staff_id=? AND work_date=?').run(swap.target_shift_id, swap.requester_id, swap.swap_date)
      db.prepare('UPDATE shift_schedule SET shift_def_id=? WHERE staff_id=? AND work_date=?').run(swap.requester_shift_id, swap.target_id, swap.swap_date)
    }
    db.prepare("UPDATE shift_swap_requests SET status='approved', approved_by=? WHERE id=?").run(approvedBy, id)
  })()
}

export function rejectSwapRequest(id, approvedBy) {
  ensureSwapTable()
  getDB().prepare("UPDATE shift_swap_requests SET status='rejected', approved_by=? WHERE id=?").run(approvedBy, id)
}

// ── Copy week schedule ──
function addDaysStr(dateStr, n) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

export function copyWeekSchedule(sourceWeekStart, targetWeekStart, createdBy) {
  const db = getDB()
  const sourceEnd = addDaysStr(sourceWeekStart, 6)
  const rows = db.prepare('SELECT staff_id, dept_id, shift_def_id, work_date FROM shift_schedule WHERE work_date BETWEEN ? AND ?').all(sourceWeekStart, sourceEnd)

  const dayDiff = Math.round((new Date(targetWeekStart) - new Date(sourceWeekStart)) / 86400000)

  const upsert = db.prepare(`
    INSERT INTO shift_schedule(staff_id, dept_id, shift_def_id, work_date, status, created_by)
    VALUES(?, ?, ?, ?, 'scheduled', ?)
    ON CONFLICT(staff_id, work_date) DO UPDATE SET shift_def_id=excluded.shift_def_id, dept_id=excluded.dept_id, status='scheduled'
  `)

  db.transaction(() => {
    rows.forEach(r => {
      const newDate = addDaysStr(r.work_date, dayDiff)
      upsert.run(r.staff_id, r.dept_id, r.shift_def_id, newDate, createdBy)
    })
  })()

  return rows.length
}

// ── Rotation templates ──
export function applyRotationTemplate(staffIds, deptId, shiftDefIds, startDate, weeks, createdBy) {
  const db = getDB()
  const upsert = db.prepare(`
    INSERT INTO shift_schedule(staff_id, dept_id, shift_def_id, work_date, status, created_by)
    VALUES(?, ?, ?, ?, 'scheduled', ?)
    ON CONFLICT(staff_id, work_date) DO UPDATE SET shift_def_id=excluded.shift_def_id, dept_id=excluded.dept_id, status='scheduled'
  `)

  let count = 0
  db.transaction(() => {
    for (let w = 0; w < weeks; w++) {
      for (let d = 0; d < 7; d++) {
        const date = addDaysStr(startDate, w * 7 + d)
        staffIds.forEach((sid, idx) => {
          const shiftIdx = (idx + w) % shiftDefIds.length
          upsert.run(sid, deptId, shiftDefIds[shiftIdx], date, createdBy)
          count++
        })
      }
    }
  })()
  return count
}

// ── Delete shift schedule entry ──
export function deleteScheduleEntry(staffId, workDate) {
  getDB().prepare('DELETE FROM shift_schedule WHERE staff_id=? AND work_date=?').run(staffId, workDate)
}

// ── Staff detail / profile ──
export function getStaffDetail(staffId) {
  const db = getDB()

  const person = db.prepare(`
    SELECT s.*, d.name as dept_name, d.color_class as dept_color
    FROM staff s
    LEFT JOIN departments d ON d.id = s.department_id
    WHERE s.id = ?
  `).get(staffId)
  if (!person) throw new Error('Personel bulunamadi')

  const shiftHistory = db.prepare(`
    SELECT ss.work_date, ss.status,
      sd.name as shift_name, sd.start_hour, sd.end_hour, sd.color_class as shift_color,
      d.name as dept_name, d.color_class as dept_color
    FROM shift_schedule ss
    JOIN shift_definitions sd ON sd.id = ss.shift_def_id
    JOIN departments d ON d.id = ss.dept_id
    WHERE ss.staff_id = ?
    ORDER BY ss.work_date DESC
    LIMIT 100
  `).all(staffId)

  const leaveHistory = db.prepare(`
    SELECT lr.*
    FROM leave_requests lr
    WHERE lr.staff_id = ?
    ORDER BY lr.created_at DESC
    LIMIT 50
  `).all(staffId)

  const overtimeRecords = db.prepare(`
    SELECT ot.*
    FROM overtime_records ot
    WHERE ot.staff_id = ?
    ORDER BY ot.work_date DESC
    LIMIT 50
  `).all(staffId)

  const attendanceLogs = db.prepare(`
    SELECT al.*
    FROM attendance_logs al
    WHERE al.staff_id = ?
    ORDER BY al.check_in_at DESC
    LIMIT 50
  `).all(staffId)

  const totalShifts = db.prepare('SELECT COUNT(*) as count FROM shift_schedule WHERE staff_id=?').get(staffId).count
  const workedShifts = db.prepare("SELECT COUNT(*) as count FROM shift_schedule WHERE staff_id=? AND status='worked'").get(staffId).count
  const totalOvertime = db.prepare('SELECT COALESCE(SUM(hours),0) as total FROM overtime_records WHERE staff_id=?').get(staffId).total
  const totalLeave = db.prepare("SELECT COUNT(*) as count FROM leave_requests WHERE staff_id=? AND status='approved'").get(staffId).count
  const absentCount = db.prepare("SELECT COUNT(*) as count FROM shift_schedule WHERE staff_id=? AND status='absent'").get(staffId).count

  return {
    person,
    shiftHistory,
    leaveHistory,
    overtimeRecords,
    attendanceLogs,
    stats: { totalShifts, workedShifts, totalOvertime, totalLeave, absentCount }
  }
}

// ── Puantaj (Timesheet) ──
export function getPuantaj(monthStart, monthEnd, deptId) {
  const db = getDB()
  let query = `
    SELECT
      s.id, s.full_name, s.position, s.salary, s.gender, s.department_id,
      d.name as dept_name, d.color_class as dept_color,
      COALESCE(sch.worked_days, 0) as worked_days,
      COALESCE(sch.scheduled_days, 0) as scheduled_days,
      COALESCE(sch.leave_days, 0) as leave_days,
      COALESCE(sch.absent_days, 0) as absent_days,
      COALESCE(sch.total_days, 0) as total_days,
      COALESCE(ot.overtime_hours, 0) as overtime_hours,
      COALESCE(ot.overtime_count, 0) as overtime_count
    FROM staff s
    LEFT JOIN departments d ON d.id = s.department_id
    LEFT JOIN (
      SELECT staff_id,
        COUNT(CASE WHEN status IN ('worked','overtime') THEN 1 END) as worked_days,
        COUNT(CASE WHEN status='scheduled' THEN 1 END) as scheduled_days,
        COUNT(CASE WHEN status='on_leave' THEN 1 END) as leave_days,
        COUNT(CASE WHEN status='absent' THEN 1 END) as absent_days,
        COUNT(*) as total_days
      FROM shift_schedule
      WHERE work_date BETWEEN ? AND ?
      GROUP BY staff_id
    ) sch ON sch.staff_id = s.id
    LEFT JOIN (
      SELECT staff_id,
        COALESCE(SUM(hours), 0) as overtime_hours,
        COUNT(*) as overtime_count
      FROM overtime_records
      WHERE work_date BETWEEN ? AND ?
      GROUP BY staff_id
    ) ot ON ot.staff_id = s.id
    WHERE s.is_active = 1
  `
  const params = [monthStart, monthEnd, monthStart, monthEnd]
  if (deptId) { query += ' AND s.department_id=?'; params.push(deptId) }
  query += ' ORDER BY d.name, s.full_name'
  return db.prepare(query).all(...params)
}
