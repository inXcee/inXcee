import { getDB } from '../../shared/db/index.js'

const CURRENT_ASSIGNMENT_JOIN = `
  LEFT JOIN staff_assignments sa ON sa.id = (
    SELECT current_sa.id
    FROM staff_assignments current_sa
    WHERE current_sa.staff_id = s.id
      AND current_sa.effective_from <= date('now', 'localtime')
      AND (current_sa.effective_to IS NULL OR current_sa.effective_to >= date('now', 'localtime'))
    ORDER BY current_sa.effective_from DESC, current_sa.id DESC
    LIMIT 1
  )
`

const CURRENT_DEPARTMENT_SQL = 'CASE WHEN sa.id IS NOT NULL THEN sa.department_id ELSE s.department_id END'
const CURRENT_ROLE_SQL = 'CASE WHEN sa.id IS NOT NULL THEN sa.role_id ELSE s.role_id END'

function resolveCurrentStaffAssignment(row) {
  if (!row) return row
  return {
    ...row,
    department_id: row.current_assignment_id ? row.assignment_department_id : row.department_id,
    role_id: row.current_assignment_id ? row.assignment_role_id : row.role_id,
  }
}

// ── Departments ──
export function getDepartments() {
  return getDB().prepare('SELECT * FROM departments ORDER BY id').all()
}

export function getShiftDefinitions() {
  return getDB().prepare('SELECT * FROM shift_definitions ORDER BY id').all()
}

// ── Work locations / staff roles ──
export function getWorkLocations({ includeInactive = false } = {}) {
  let sql = `
    SELECT wl.*, d.name AS dept_name, d.color_class AS dept_color
    FROM work_locations wl
    LEFT JOIN departments d ON d.id = wl.dept_id
    WHERE 1=1
  `
  if (!includeInactive) sql += ' AND wl.is_active = 1'
  sql += ' ORDER BY wl.sort_order, wl.name'
  return getDB().prepare(sql).all()
}

export function createWorkLocation(data) {
  return getDB().prepare(`
    INSERT INTO work_locations(name, dept_id, site, color_class, sort_order, is_active)
    VALUES(@name, @dept_id, @site, @color_class, @sort_order, @is_active)
  `).run({
    name: data.name,
    dept_id: data.dept_id || null,
    site: data.site?.trim() || null,
    color_class: data.color_class || 'bg-blue-400',
    sort_order: Number.isFinite(+data.sort_order) ? +data.sort_order : 0,
    is_active: data.is_active === undefined ? 1 : (data.is_active ? 1 : 0),
  }).lastInsertRowid
}

export function updateWorkLocation(id, data) {
  const db = getDB()
  const fields = ['name', 'dept_id', 'site', 'color_class', 'sort_order', 'is_active']
  const sets = []
  const params = []
  fields.forEach(f => {
    if (data[f] !== undefined) {
      sets.push(`${f}=?`)
      if (f === 'dept_id') params.push(data[f] || null)
      else if (f === 'sort_order') params.push(Number.isFinite(+data[f]) ? +data[f] : 0)
      else if (f === 'is_active') params.push(data[f] ? 1 : 0)
      else params.push(data[f] || null)
    }
  })
  if (!sets.length) return
  params.push(id)
  db.prepare(`UPDATE work_locations SET ${sets.join(',')} WHERE id=?`).run(...params)
}

export function deleteWorkLocation(id) {
  getDB().prepare('UPDATE work_locations SET is_active=0 WHERE id=?').run(id)
}

export function getStaffRoles({ includeInactive = false } = {}) {
  let sql = `
    SELECT sr.*, d.name AS expected_dept_name
    FROM staff_roles sr
    LEFT JOIN departments d ON d.id = sr.expected_dept_id
    WHERE 1=1
  `
  if (!includeInactive) sql += ' AND sr.is_active = 1'
  sql += ' ORDER BY sr.sort_order, sr.name'
  return getDB().prepare(sql).all()
}

export function createStaffRole(data) {
  return getDB().prepare(`
    INSERT INTO staff_roles(name, sort_order, is_active, expected_dept_id)
    VALUES(@name, @sort_order, @is_active, @expected_dept_id)
  `).run({
    name: data.name,
    sort_order: Number.isFinite(+data.sort_order) ? +data.sort_order : 0,
    is_active: data.is_active === undefined ? 1 : (data.is_active ? 1 : 0),
    expected_dept_id: data.expected_dept_id || null,
  }).lastInsertRowid
}

export function updateStaffRole(id, data) {
  const db = getDB()
  const fields = ['name', 'sort_order', 'is_active', 'expected_dept_id']
  const sets = []
  const params = []
  fields.forEach(f => {
    if (data[f] !== undefined) {
      sets.push(`${f}=?`)
      if (f === 'sort_order') params.push(Number.isFinite(+data[f]) ? +data[f] : 0)
      else if (f === 'is_active') params.push(data[f] ? 1 : 0)
      else if (f === 'expected_dept_id') params.push(data[f] || null)
      else params.push(data[f] || null)
    }
  })
  if (!sets.length) return
  params.push(id)
  db.prepare(`UPDATE staff_roles SET ${sets.join(',')} WHERE id=?`).run(...params)
}

export function deleteStaffRole(id) {
  const db = getDB()
  db.prepare('UPDATE staff SET role_id=NULL WHERE role_id=?').run(id)
  db.prepare('UPDATE staff_roles SET is_active=0 WHERE id=?').run(id)
}

// ── Staff CRUD ──
export function getStaffList(filters = {}) {
  const db = getDB()
  let query = `
    SELECT s.*, d.name as dept_name, d.color_class as dept_color,
      sr.name as role_name, sr.sort_order as role_sort_order,
      sr.expected_dept_id, expected_dept.name as expected_dept_name,
      sa.id as current_assignment_id,
      sa.department_id as assignment_department_id,
      sa.role_id as assignment_role_id,
      sa.work_location_id as primary_work_location_id,
      sa.effective_from as assignment_effective_from,
      sa.effective_to as assignment_effective_to,
      wl.name as primary_work_location_name,
      wl.site as primary_work_location_site,
      wl.color_class as primary_work_location_color,
      wl.dept_id as primary_work_location_dept_id,
      wl.is_active as primary_work_location_active
    FROM staff s
    ${CURRENT_ASSIGNMENT_JOIN}
    LEFT JOIN departments d ON d.id = ${CURRENT_DEPARTMENT_SQL}
    LEFT JOIN staff_roles sr ON sr.id = ${CURRENT_ROLE_SQL}
    LEFT JOIN departments expected_dept ON expected_dept.id = sr.expected_dept_id
    LEFT JOIN work_locations wl ON wl.id = sa.work_location_id
    WHERE 1=1
  `
  const params = []
  if (filters.dept_id) { query += ` AND ${CURRENT_DEPARTMENT_SQL} = ?`; params.push(filters.dept_id) }
  if (filters.role_id) { query += ` AND ${CURRENT_ROLE_SQL} = ?`; params.push(filters.role_id) }
  if (filters.is_active !== undefined) { query += ' AND s.is_active = ?'; params.push(filters.is_active) }
  if (filters.gender) { query += ' AND s.gender = ?'; params.push(filters.gender) }
  if (filters.search) {
    query += ' AND (s.full_name LIKE ? OR s.tc_no LIKE ? OR s.phone LIKE ? OR s.position LIKE ?)'
    const term = `%${filters.search}%`
    params.push(term, term, term, term)
  }
  query += ' ORDER BY s.full_name'
  return db.prepare(query).all(...params).map(resolveCurrentStaffAssignment)
}

export function getStaffById(id) {
  const row = getDB().prepare(`
    SELECT s.*, d.name as dept_name, d.color_class as dept_color,
      sr.name as role_name, sr.sort_order as role_sort_order,
      sr.expected_dept_id, expected_dept.name as expected_dept_name,
      sa.id as current_assignment_id,
      sa.department_id as assignment_department_id,
      sa.role_id as assignment_role_id,
      sa.work_location_id as primary_work_location_id,
      sa.effective_from as assignment_effective_from,
      sa.effective_to as assignment_effective_to,
      wl.name as primary_work_location_name,
      wl.site as primary_work_location_site,
      wl.color_class as primary_work_location_color,
      wl.dept_id as primary_work_location_dept_id,
      wl.is_active as primary_work_location_active
    FROM staff s
    ${CURRENT_ASSIGNMENT_JOIN}
    LEFT JOIN departments d ON d.id = ${CURRENT_DEPARTMENT_SQL}
    LEFT JOIN staff_roles sr ON sr.id = ${CURRENT_ROLE_SQL}
    LEFT JOIN departments expected_dept ON expected_dept.id = sr.expected_dept_id
    LEFT JOIN work_locations wl ON wl.id = sa.work_location_id
    WHERE s.id = ?
  `).get(id)
  return resolveCurrentStaffAssignment(row)
}

export function createStaff(data) {
  const db = getDB()
  const r = db.prepare(`
    INSERT INTO staff(tc_no,full_name,phone,email,position,department_id,role_id,hire_date,birth_date,
      address,emergency_contact,emergency_phone,blood_type,gender,salary,iban,notes,is_active,role_label,pickup_point_id)
    VALUES(@tc_no,@full_name,@phone,@email,@position,@department_id,@role_id,@hire_date,@birth_date,
      @address,@emergency_contact,@emergency_phone,@blood_type,@gender,@salary,@iban,@notes,@is_active,@role_label,@pickup_point_id)
  `).run({
    tc_no: data.tc_no || null,
    full_name: data.full_name,
    phone: data.phone || null,
    email: data.email || null,
    position: data.position || null,
    department_id: data.department_id || null,
    role_id: data.role_id || null,
    hire_date: data.hire_date || null,
    birth_date: data.birth_date || null,
    address: data.address || null,
    emergency_contact: data.emergency_contact || null,
    emergency_phone: data.emergency_phone || null,
    blood_type: data.blood_type || null,
    gender: data.gender || null,
    salary: data.salary || null,
    iban: data.iban || null,
    notes: data.notes || null,
    is_active: data.is_active !== undefined ? data.is_active : 1,
    role_label: data.role_label || null,
    pickup_point_id: data.pickup_point_id || null,
  })
  return r.lastInsertRowid
}

export function updateStaff(id, data) {
  const db = getDB()
  const fields = ['tc_no','full_name','phone','email','position','department_id','role_id','hire_date','birth_date',
    'address','emergency_contact','emergency_phone','blood_type','gender','salary','iban','notes','is_active','role_label','pickup_point_id']
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

export function getStaffAssignments(staffId) {
  return getDB().prepare(`
    SELECT sa.*,
      d.name AS dept_name,
      d.color_class AS dept_color,
      sr.name AS role_name,
      wl.name AS work_location_name,
      wl.site AS work_location_site,
      wl.color_class AS work_location_color,
      u.full_name AS created_by_name
    FROM staff_assignments sa
    LEFT JOIN departments d ON d.id = sa.department_id
    LEFT JOIN staff_roles sr ON sr.id = sa.role_id
    LEFT JOIN work_locations wl ON wl.id = sa.work_location_id
    LEFT JOIN users u ON u.id = sa.created_by
    WHERE sa.staff_id = ?
    ORDER BY sa.effective_from DESC, sa.id DESC
  `).all(staffId)
}

export function createStaffAssignment(data) {
  const db = getDB()
  const save = db.transaction(() => {
    const next = db.prepare(`
      SELECT effective_from
      FROM staff_assignments
      WHERE staff_id = ? AND effective_from > ?
      ORDER BY effective_from
      LIMIT 1
    `).get(data.staff_id, data.effective_from)
    const effectiveTo = next
      ? db.prepare("SELECT date(?, '-1 day') AS value").get(next.effective_from).value
      : null
    const existing = db.prepare(`
      SELECT id FROM staff_assignments WHERE staff_id = ? AND effective_from = ?
    `).get(data.staff_id, data.effective_from)

    let assignmentId
    if (existing) {
      db.prepare(`
        UPDATE staff_assignments
        SET department_id = @department_id,
            role_id = @role_id,
            work_location_id = @work_location_id,
            effective_to = @effective_to,
            note = @note,
            created_by = @created_by
        WHERE id = @id
      `).run({
        id: existing.id,
        department_id: data.department_id || null,
        role_id: data.role_id || null,
        work_location_id: data.work_location_id || null,
        effective_to: effectiveTo,
        note: data.note || null,
        created_by: data.created_by || null,
      })
      assignmentId = existing.id
    } else {
      db.prepare(`
        UPDATE staff_assignments
        SET effective_to = date(@effective_from, '-1 day')
        WHERE staff_id = @staff_id
          AND effective_from < @effective_from
          AND (effective_to IS NULL OR effective_to >= @effective_from)
      `).run({ staff_id: data.staff_id, effective_from: data.effective_from })

      assignmentId = db.prepare(`
        INSERT INTO staff_assignments(
          staff_id, department_id, role_id, work_location_id,
          effective_from, effective_to, note, created_by
        ) VALUES(
          @staff_id, @department_id, @role_id, @work_location_id,
          @effective_from, @effective_to, @note, @created_by
        )
      `).run({
        staff_id: data.staff_id,
        department_id: data.department_id || null,
        role_id: data.role_id || null,
        work_location_id: data.work_location_id || null,
        effective_from: data.effective_from,
        effective_to: effectiveTo,
        note: data.note || null,
        created_by: data.created_by || null,
      }).lastInsertRowid
    }

    const current = db.prepare(`
      SELECT department_id, role_id
      FROM staff_assignments
      WHERE staff_id = ?
        AND effective_from <= date('now', 'localtime')
        AND (effective_to IS NULL OR effective_to >= date('now', 'localtime'))
      ORDER BY effective_from DESC, id DESC
      LIMIT 1
    `).get(data.staff_id)
    if (current) {
      db.prepare('UPDATE staff SET department_id = ?, role_id = ? WHERE id = ?')
        .run(current.department_id, current.role_id, data.staff_id)
    }
    return assignmentId
  })
  return save()
}

export function getStaffDataQualityRows() {
  const db = getDB()
  const futureByStaff = new Map(db.prepare(`
    SELECT staff_id, COUNT(*) AS future_schedule_count
    FROM shift_schedule
    WHERE work_date >= date('now', 'localtime')
    GROUP BY staff_id
  `).all().map(row => [row.staff_id, row.future_schedule_count]))
  return getStaffList({}).map(row => ({
    ...row,
    future_schedule_count: futureByStaff.get(row.id) || 0,
  }))
}

export function deleteStaff(id) {
  const db = getDB()
  // Soft delete — is_active = 0
  db.prepare('UPDATE staff SET is_active = 0 WHERE id = ?').run(id)
}

export function searchStaff(term) {
  const db = getDB()
  return db.prepare(`
    SELECT s.id, s.full_name, s.tc_no, s.gender, s.phone, s.position, d.name as dept_name, sr.name as role_name
    FROM staff s
    LEFT JOIN departments d ON d.id = s.department_id
    LEFT JOIN staff_roles sr ON sr.id = s.role_id
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
      s.id as staff_id, s.full_name, s.gender, s.position, s.role_id,
      COALESCE(ss.dept_id, s.department_id) as dept_id,
      d.name as dept_name, d.color_class as dept_color,
      sr.name as role_name, sr.sort_order as role_sort_order,
      ss.work_location_id,
      wl.name as work_location_name, wl.color_class as work_location_color, wl.sort_order as work_location_sort_order,
      sd.id as shift_def_id, sd.name as shift_name, sd.start_hour, sd.end_hour, sd.color_class as shift_color,
      sd.start_hour as shift_start, sd.end_hour as shift_end,
      CASE WHEN ss.status = 'on_leave' THEN COALESCE(ss.leave_type, (
        SELECT lr.leave_type FROM leave_requests lr
        WHERE lr.staff_id = ss.staff_id AND lr.status = 'approved'
          AND lr.start_date <= ss.work_date AND lr.end_date >= ss.work_date
        ORDER BY lr.id DESC LIMIT 1
      )) END as leave_type
    FROM shift_schedule ss
    JOIN staff s ON s.id = ss.staff_id
    LEFT JOIN departments d ON d.id = COALESCE(ss.dept_id, s.department_id)
    LEFT JOIN staff_roles sr ON sr.id = s.role_id
    LEFT JOIN work_locations wl ON wl.id = ss.work_location_id
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
    INSERT INTO shift_schedule(staff_id, dept_id, shift_def_id, work_date, status, leave_type, absent_reason, work_location_id, created_by)
    VALUES(@staff_id, @dept_id, @shift_def_id, @work_date, @status, @leave_type, @absent_reason, @work_location_id, @created_by)
    ON CONFLICT(staff_id, work_date) DO UPDATE SET
      shift_def_id = excluded.shift_def_id,
      dept_id = excluded.dept_id,
      status = excluded.status,
      leave_type = excluded.leave_type,
      absent_reason = excluded.absent_reason,
      work_location_id = excluded.work_location_id
  `)
  const tx = db.transaction(() => {
    entries.forEach(e => {
      const status = e.status || 'scheduled'
      upsert.run({
        ...e,
        status,
        dept_id: e.dept_id ?? null,
        shift_def_id: e.shift_def_id || null,
        leave_type: status === 'on_leave' ? (e.leave_type || e.leaveType || null) : null,
        absent_reason: status === 'absent' ? (e.absent_reason || null) : null,
        work_location_id: ['scheduled', 'worked', 'overtime'].includes(status) ? (e.work_location_id || null) : null,
        created_by: createdBy,
      })
    })
  })
  tx()
}

// H4 V1 — Çakışma kontrolü: aynı staff'ın aynı günde mevcut vardiya/izin var mı?
export function checkConflicts(entries) {
  const db = getDB()
  const conflicts = []
  const checkExisting = db.prepare(`
    SELECT ss.staff_id, ss.work_date, ss.status, ss.shift_def_id,
      sd.name as existing_shift_name, s.full_name
    FROM shift_schedule ss
    JOIN staff s ON s.id = ss.staff_id
    LEFT JOIN shift_definitions sd ON sd.id = ss.shift_def_id
    WHERE ss.staff_id = ? AND ss.work_date = ?
  `)
  const approvedLeave = db.prepare(`
    SELECT id, leave_type, status FROM leave_requests
    WHERE staff_id = ? AND status = 'approved' AND ? BETWEEN start_date AND end_date
  `)
  for (const e of entries || []) {
    if (!e.staff_id || !e.work_date) continue
    const existing = checkExisting.get(e.staff_id, e.work_date)
    if (existing) {
      conflicts.push({
        staff_id: e.staff_id, work_date: e.work_date,
        kind: 'shift_exists', full_name: existing.full_name,
        message: `${existing.full_name}: ${e.work_date} tarihinde zaten "${existing.existing_shift_name || existing.status}" var`,
      })
    }
    const leave = approvedLeave.get(e.staff_id, e.work_date)
    if (leave) {
      conflicts.push({
        staff_id: e.staff_id, work_date: e.work_date,
        kind: 'on_leave', leave_type: leave.leave_type,
        message: `${e.work_date} tarihinde onaylı ${leave.leave_type} izni var`,
      })
    }
  }
  return conflicts
}

// H4 V3 — Holidays CRUD
export function listHolidays({ year } = {}) {
  const db = getDB()
  let q = 'SELECT * FROM holidays'
  const params = []
  if (year) { q += ' WHERE date LIKE ?'; params.push(`${year}-%`) }
  q += ' ORDER BY date'
  return db.prepare(q).all(...params)
}

export function createHoliday(data) {
  return getDB().prepare(`
    INSERT INTO holidays(date, name, multiplier, is_half_day) VALUES(?,?,?,?)
  `).run(data.date, data.name, data.multiplier ?? 2.0, data.is_half_day ? 1 : 0).lastInsertRowid
}

export function updateHoliday(id, data) {
  const db = getDB()
  const fields = ['date', 'name', 'multiplier', 'is_half_day']
  const sets = []
  const params = []
  fields.forEach(f => {
    if (data[f] !== undefined) { sets.push(`${f}=?`); params.push(data[f]) }
  })
  if (!sets.length) return
  params.push(id)
  db.prepare(`UPDATE holidays SET ${sets.join(',')} WHERE id=?`).run(...params)
}

export function deleteHoliday(id) {
  getDB().prepare('DELETE FROM holidays WHERE id=?').run(id)
}

// H8 — Kesinti CRUD
export function listDeductions({ period, staffId } = {}) {
  const db = getDB()
  let q = `
    SELECT pd.*, s.full_name, d.name as dept_name
    FROM payroll_deductions pd
    JOIN staff s ON s.id = pd.staff_id
    LEFT JOIN departments d ON d.id = s.department_id
    WHERE 1=1
  `
  const params = []
  if (period) { q += ' AND pd.period = ?'; params.push(period) }
  if (staffId) { q += ' AND pd.staff_id = ?'; params.push(staffId) }
  q += ' ORDER BY pd.created_at DESC LIMIT 500'
  return db.prepare(q).all(...params)
}

export function createDeduction(data, userId) {
  return getDB().prepare(`
    INSERT INTO payroll_deductions(staff_id, period, kind, amount, description, created_by)
    VALUES(?,?,?,?,?,?)
  `).run(data.staff_id, data.period, data.kind, data.amount, data.description || null, userId || null).lastInsertRowid
}

export function deleteDeduction(id) {
  getDB().prepare('DELETE FROM payroll_deductions WHERE id=?').run(id)
}

// H8 V7 detaylı bordro — kesinti + mesai çarpan + SGK gün
export function getPayrollDetailed(yearMonth) {
  const db = getDB()
  const start = `${yearMonth}-01`
  const endDate = new Date(start)
  endDate.setMonth(endDate.getMonth() + 1)
  const end = endDate.toISOString().slice(0, 10)

  return db.prepare(`
    SELECT s.id, s.full_name, s.tc_no, s.salary, s.position,
      d.name as dept_name,
      COALESCE((SELECT COUNT(*) FROM shift_schedule
        WHERE staff_id = s.id AND status IN ('worked','overtime') AND work_date >= ? AND work_date < ?), 0) as worked_days,
      COALESCE((SELECT COUNT(*) FROM shift_schedule
        WHERE staff_id = s.id AND status = 'absent' AND work_date >= ? AND work_date < ?), 0) as absent_days,
      COALESCE((SELECT COUNT(*) FROM shift_schedule
        WHERE staff_id = s.id AND status = 'on_leave' AND work_date >= ? AND work_date < ?), 0) as leave_days,
      COALESCE((SELECT SUM(hours) FROM overtime_records
        WHERE staff_id = s.id AND work_date >= ? AND work_date < ?), 0) as overtime_hours,
      COALESCE((SELECT COUNT(*) FROM shift_schedule ss
        JOIN holidays h ON h.date = ss.work_date
        WHERE ss.staff_id = s.id AND ss.status IN ('worked','overtime') AND ss.work_date >= ? AND ss.work_date < ?), 0) as holiday_days,
      COALESCE((SELECT SUM(CASE WHEN h.multiplier IS NULL THEN 1 ELSE h.multiplier END) FROM shift_schedule ss
        LEFT JOIN holidays h ON h.date = ss.work_date
        WHERE ss.staff_id = s.id AND ss.status IN ('worked','overtime') AND ss.work_date >= ? AND ss.work_date < ?), 0) as weighted_days,
      COALESCE((SELECT SUM(amount) FROM payroll_deductions
        WHERE staff_id = s.id AND period = ?), 0) as total_deductions,
      COALESCE((SELECT COUNT(*) FROM shift_schedule
        WHERE staff_id = s.id AND status = 'off' AND work_date >= ? AND work_date < ?), 0) as off_days,
      -- B5: SGK gün = çalıştığı + izinli + hafta tatili (yasal düşmeyen) günler
      (
        COALESCE((SELECT COUNT(*) FROM shift_schedule
          WHERE staff_id = s.id AND status IN ('worked','overtime') AND work_date >= ? AND work_date < ?), 0)
        + COALESCE((SELECT COUNT(*) FROM shift_schedule
          WHERE staff_id = s.id AND status IN ('on_leave','off') AND work_date >= ? AND work_date < ?), 0)
      ) as sgk_days
    FROM staff s
    LEFT JOIN departments d ON d.id = s.department_id
    WHERE s.is_active = 1
    ORDER BY d.name, s.full_name
  `).all(start, end, start, end, start, end, start, end, start, end, start, end, yearMonth, start, end, start, end, start, end)
}

// H4 V7 — Bordro export (kişi başı aylık özet)
export function getPayrollExport(yearMonth) {
  // yearMonth: 'YYYY-MM'
  const db = getDB()
  const start = `${yearMonth}-01`
  const endDate = new Date(start)
  endDate.setMonth(endDate.getMonth() + 1)
  const end = endDate.toISOString().slice(0, 10)

  const rows = db.prepare(`
    SELECT s.id, s.full_name, s.tc_no, s.salary, s.position,
      d.name as dept_name,
      COALESCE((SELECT COUNT(*) FROM shift_schedule
        WHERE staff_id = s.id AND status IN ('worked','overtime') AND work_date >= ? AND work_date < ?), 0) as worked_days,
      COALESCE((SELECT COUNT(*) FROM shift_schedule
        WHERE staff_id = s.id AND status = 'absent' AND work_date >= ? AND work_date < ?), 0) as absent_days,
      COALESCE((SELECT COUNT(*) FROM shift_schedule
        WHERE staff_id = s.id AND status = 'on_leave' AND work_date >= ? AND work_date < ?), 0) as leave_days,
      COALESCE((SELECT SUM(hours) FROM overtime_records
        WHERE staff_id = s.id AND work_date >= ? AND work_date < ?), 0) as overtime_hours,
      COALESCE((SELECT COUNT(*) FROM shift_schedule ss
        JOIN holidays h ON h.date = ss.work_date
        WHERE ss.staff_id = s.id AND ss.status IN ('worked','overtime') AND ss.work_date >= ? AND ss.work_date < ?), 0) as holiday_days
    FROM staff s
    LEFT JOIN departments d ON d.id = s.department_id
    WHERE s.is_active = 1
    ORDER BY d.name, s.full_name
  `).all(start, end, start, end, start, end, start, end, start, end)

  return rows
}

// H4 V8 — Birleşik devamsızlık (vardiya absent + transport no-show)
export function getCombinedAbsences({ startDate, endDate } = {}) {
  const db = getDB()
  const s = startDate || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const e = endDate || new Date().toISOString().slice(0, 10)

  return db.prepare(`
    SELECT * FROM (
      SELECT s.id, s.full_name, s.tc_no, s.phone,
        d.name as dept_name, d.color_class as dept_color,
        COALESCE((SELECT COUNT(*) FROM shift_schedule
          WHERE staff_id = s.id AND status = 'absent' AND work_date BETWEEN ? AND ?), 0) as shift_absent,
        COALESCE((SELECT COUNT(*) FROM route_assignments
          WHERE staff_id = s.id AND boarded = 0 AND is_waitlist = 0 AND work_date BETWEEN ? AND ?), 0) as transport_no_show,
        COALESCE((SELECT COUNT(*) FROM shift_schedule
          WHERE staff_id = s.id AND status IN ('worked','overtime') AND work_date BETWEEN ? AND ?), 0) as worked
      FROM staff s
      LEFT JOIN departments d ON d.id = s.department_id
      WHERE s.is_active = 1
    ) WHERE shift_absent + transport_no_show > 0
    ORDER BY (shift_absent * 2 + transport_no_show) DESC, full_name
  `).all(s, e, s, e, s, e)
}

export function getStaffWithShiftStatus(date, deptId) {
  const db = getDB()
  let query = `
    SELECT
      s.id, s.full_name, s.gender, s.tc_no, s.phone, s.position, s.role_id,
      d.id as dept_id, d.name as dept_name, d.color_class as dept_color,
      sr.name as role_name,
      ss.id as schedule_id, ss.status as shift_status,
      ss.work_location_id, wl.name as work_location_name, wl.color_class as work_location_color,
      sd.name as shift_name, sd.start_hour, sd.end_hour, sd.color_class as shift_color,
      lr.leave_type, lr.status as leave_status
    FROM staff s
    LEFT JOIN departments d ON d.id = s.department_id
    LEFT JOIN staff_roles sr ON sr.id = s.role_id
    LEFT JOIN shift_schedule ss ON ss.staff_id = s.id AND ss.work_date = ?
    LEFT JOIN work_locations wl ON wl.id = ss.work_location_id
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

// E1 — leave_balance sayaç kolonu eşlemesi (diğer izin tipleri sayaçsız)
const BALANCE_COLUMN = { annual: 'annual_used', sick: 'sick_used', emergency: 'emergency_used' }

function adjustLeaveBalance(db, req, delta) {
  const col = BALANCE_COLUMN[req.leave_type]
  if (!col) return
  const year = Number(req.start_date.slice(0, 4))
  db.prepare('INSERT OR IGNORE INTO leave_balance(staff_id, year) VALUES(?,?)').run(req.staff_id, year)
  db.prepare(`UPDATE leave_balance SET ${col} = MAX(0, ${col} + ?) WHERE staff_id=? AND year=?`)
    .run(delta * req.total_days, req.staff_id, year)
}

function markLeaveOnSchedule(db, req, approvedBy) {
  const staff = db.prepare('SELECT department_id FROM staff WHERE id=?').get(req.staff_id)
  const upsertLeave = db.prepare(`
    INSERT INTO shift_schedule(staff_id, dept_id, shift_def_id, work_date, status, leave_type, created_by)
    VALUES(?, ?, NULL, ?, 'on_leave', ?, ?)
    ON CONFLICT(staff_id, work_date) DO UPDATE SET status='on_leave', leave_type=excluded.leave_type
  `)
  for (let date = req.start_date; date <= req.end_date; date = addDaysStr(date, 1)) {
    upsertLeave.run(req.staff_id, staff?.department_id || null, date, req.leave_type || null, approvedBy || null)
  }
}

function clearLeaveFromSchedule(db, req) {
  const restorePlanned = db.prepare(`
    UPDATE shift_schedule SET status='scheduled', leave_type=NULL
    WHERE staff_id=? AND work_date=? AND status='on_leave' AND shift_def_id IS NOT NULL
  `)
  const deleteLeaveOnly = db.prepare(`
    DELETE FROM shift_schedule
    WHERE staff_id=? AND work_date=? AND status='on_leave' AND shift_def_id IS NULL
  `)
  for (let date = req.start_date; date <= req.end_date; date = addDaysStr(date, 1)) {
    restorePlanned.run(req.staff_id, date)
    deleteLeaveOnly.run(req.staff_id, date)
  }
}

export function approveLeaveRequest(id, approvedBy, status) {
  const db = getDB()
  const req = db.prepare('SELECT * FROM leave_requests WHERE id=?').get(id)
  if (!req) throw new Error('İzin talebi bulunamadı')
  const wasApproved = req.status === 'approved'

  // E1 — yıllık izinde bakiye kontrolü (pending → approved geçişinde)
  if (status === 'approved' && !wasApproved && req.leave_type === 'annual') {
    const year = Number(req.start_date.slice(0, 4))
    const bal = getLeaveBalance(req.staff_id, year)
    if (bal.annual_used + req.total_days > bal.annual_total) {
      throw new Error(`Yıllık izin bakiyesi yetersiz (kalan: ${bal.annual_total - bal.annual_used} gün, talep: ${req.total_days} gün)`)
    }
  }

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE leave_requests SET status=?, approved_by=?, approved_at=datetime('now') WHERE id=?
    `).run(status, approvedBy, id)

    if (status === 'approved' && !wasApproved) {
      markLeaveOnSchedule(db, req, approvedBy)
      adjustLeaveBalance(db, req, +1)
    } else if (status === 'rejected' && wasApproved) {
      // Onaylıyken reddedilirse bakiye iadesi + program geri alınır
      clearLeaveFromSchedule(db, req)
      adjustLeaveBalance(db, req, -1)
    }
  })
  tx()
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

// Faz 28 — Puantaj hücresinden gün bazlı FM: tek kayıt upsert, 0 saat = sil.
// createOvertime'dan farkı: statüye dokunmaz (hücre kodu N kalır) ve günü tek kayda indirger.
export function upsertOvertimeDay(staffId, workDate, hours, userId) {
  const db = getDB()
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM overtime_records WHERE staff_id=? AND work_date=?').run(staffId, workDate)
    if (hours > 0) {
      db.prepare(`
        INSERT INTO overtime_records(staff_id, work_date, hours, reason, approved_by)
        VALUES(?, ?, ?, 'Puantaj girişi', ?)
      `).run(staffId, workDate, hours, userId || null)
    }
  })
  tx()
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
  // SQLite datetime('now') UTC yazar — 'Z' eklenmeden parse edilirse yerel saat
  // sanılır ve UTC+3'te süre 3 saat şişer
  const checkIn = new Date(log.check_in_at.replace(' ', 'T') + 'Z')
  const now = new Date()
  const actualHours = Math.round((now - checkIn) / 3600000 * 10) / 10
  db.prepare(`
    UPDATE attendance_logs SET check_out_at=datetime('now'), actual_hours=? WHERE id=?
  `).run(actualHours, logId)
  return db.prepare('SELECT * FROM attendance_logs WHERE id=?').get(logId)
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

export function findAttendanceIdentity({ staffId, cardId, cardCode, nfcUid }) {
  const db = getDB()
  if (staffId) {
    const staff = db.prepare('SELECT id, full_name FROM staff WHERE id = ?').get(staffId)
    return staff ? { staff_id: staff.id, card_id: cardId || null, matched_via: 'staff_id', staff } : null
  }
  if (!cardId && !cardCode && !nfcUid) return null
  const card = cardId
    ? db.prepare("SELECT * FROM cards WHERE id = ? AND holder_type = 'staff' AND status = 'active'").get(cardId)
    : cardCode
      ? db.prepare("SELECT * FROM cards WHERE code = ? AND holder_type = 'staff' AND status = 'active'").get(cardCode)
      : db.prepare("SELECT * FROM cards WHERE nfc_uid = ? AND holder_type = 'staff' AND status = 'active'").get(nfcUid)
  if (!card) return null
  const staff = db.prepare('SELECT id, full_name FROM staff WHERE id = ?').get(card.holder_id)
  return staff ? { staff_id: staff.id, card_id: card.id, matched_via: cardId ? 'card_id' : cardCode ? 'card_code' : 'nfc_uid', staff } : null
}

export function insertAttendanceEvent(data) {
  const db = getDB()
  const result = db.prepare(`
    INSERT OR IGNORE INTO attendance_events(
      event_key, external_event_id, staff_id, card_id, event_type,
      occurred_at, work_date, source, device_id, match_status,
      match_detail, raw_payload
    ) VALUES(
      @event_key, @external_event_id, @staff_id, @card_id, @event_type,
      @occurred_at, @work_date, @source, @device_id, @match_status,
      @match_detail, @raw_payload
    )
  `).run(data)
  const row = db.prepare(`
    SELECT ae.*, s.full_name
    FROM attendance_events ae
    LEFT JOIN staff s ON s.id = ae.staff_id
    WHERE ae.event_key = ?
  `).get(data.event_key)
  return { ...row, inserted: result.changes === 1 }
}

export function listAttendanceEvents(filters = {}) {
  const db = getDB()
  let sql = `
    SELECT ae.*, s.full_name, d.name AS dept_name, c.code AS card_code
    FROM attendance_events ae
    LEFT JOIN staff s ON s.id = ae.staff_id
    LEFT JOIN departments d ON d.id = s.department_id
    LEFT JOIN cards c ON c.id = ae.card_id
    WHERE 1 = 1
  `
  const params = []
  if (filters.from) { sql += ' AND ae.work_date >= ?'; params.push(filters.from) }
  if (filters.to) { sql += ' AND ae.work_date <= ?'; params.push(filters.to) }
  if (filters.staff_id) { sql += ' AND ae.staff_id = ?'; params.push(filters.staff_id) }
  if (filters.dept_id) { sql += ' AND s.department_id = ?'; params.push(filters.dept_id) }
  if (filters.source) { sql += ' AND ae.source = ?'; params.push(filters.source) }
  if (filters.device_id) { sql += ' AND ae.device_id = ?'; params.push(filters.device_id) }
  if (filters.match_status) { sql += ' AND ae.match_status = ?'; params.push(filters.match_status) }
  sql += ' ORDER BY ae.occurred_at DESC, ae.id DESC LIMIT ?'
  params.push(Math.min(Math.max(Number(filters.limit) || 200, 1), 1000))
  return db.prepare(sql).all(...params)
}

export function listStationAttendanceSourceEvents(from, to) {
  return getDB().prepare(`
    SELECT ae.id, ae.card_id, ae.holder_id AS staff_id, ae.event_type,
      ae.scanned_at, ae.raw_uid, ae.station_id, st.name AS station_name,
      st.station_type, st.location
    FROM access_events ae
    LEFT JOIN scan_stations st ON st.id = ae.station_id
    WHERE ae.holder_type = 'staff'
      AND ae.result = 'ok'
      AND ae.event_type IN ('entry', 'exit')
      AND date(ae.scanned_at) BETWEEN date(?, '-1 day') AND date(?, '+1 day')
    ORDER BY ae.scanned_at, ae.id
  `).all(from, to)
}

export function getAttendanceCandidateStaffIds(workDate, staffId) {
  const sql = `
    SELECT staff_id FROM shift_schedule WHERE work_date = ?
    UNION
    SELECT staff_id FROM attendance_events WHERE work_date = ? AND staff_id IS NOT NULL
  `
  const rows = getDB().prepare(sql).all(workDate, workDate)
  const ids = rows.map(row => row.staff_id)
  return staffId ? ids.filter(id => Number(id) === Number(staffId)) : ids
}

export function getAttendanceReconciliationContext(staffId, workDate) {
  const db = getDB()
  const staff = db.prepare(`
    SELECT s.id, s.full_name, s.department_id, s.is_active, d.name AS dept_name
    FROM staff s LEFT JOIN departments d ON d.id = s.department_id
    WHERE s.id = ?
  `).get(staffId)
  const schedule = db.prepare(`
    SELECT ss.*, sd.name AS shift_name, sd.start_hour, sd.end_hour
    FROM shift_schedule ss
    LEFT JOIN shift_definitions sd ON sd.id = ss.shift_def_id
    WHERE ss.staff_id = ? AND ss.work_date = ?
  `).get(staffId, workDate)
  const leave = db.prepare(`
    SELECT * FROM leave_requests
    WHERE staff_id = ? AND status = 'approved' AND ? BETWEEN start_date AND end_date
    ORDER BY id DESC LIMIT 1
  `).get(staffId, workDate)
  const periodLock = db.prepare('SELECT * FROM period_locks WHERE period = ?').get(workDate.slice(0, 7))
  const dailyApproval = db.prepare(`
    SELECT * FROM puantaj_daily_approvals
    WHERE work_date = ? AND status = 'approved'
      AND (dept_scope = 'all' OR dept_scope = ?)
    ORDER BY CASE WHEN dept_scope = 'all' THEN 0 ELSE 1 END
    LIMIT 1
  `).get(workDate, `dept:${schedule?.dept_id || staff?.department_id || 0}`)
  const latestReconciliation = db.prepare(`
    SELECT * FROM attendance_daily_reconciliations
    WHERE staff_id = ? AND work_date = ?
    ORDER BY id DESC LIMIT 1
  `).get(staffId, workDate)
  const events = db.prepare(`
    SELECT * FROM attendance_events
    WHERE staff_id = ? AND work_date = ?
    ORDER BY occurred_at, id
  `).all(staffId, workDate)
  return { staff, schedule, leave, periodLock, dailyApproval, latestReconciliation, events }
}

export function findAttendanceReconciliation(fingerprint) {
  return getDB().prepare('SELECT * FROM attendance_daily_reconciliations WHERE fingerprint = ?').get(fingerprint)
}

export function insertAttendanceReconciliation(data) {
  return getDB().prepare(`
    INSERT INTO attendance_daily_reconciliations(
      fingerprint, staff_id, work_date, shift_schedule_id,
      check_in_event_id, check_out_event_id, source_event_ids,
      old_status, new_status, result_status, reason_code,
      planned_start, planned_end, actual_check_in, actual_check_out,
      worked_minutes, overtime_candidate_minutes, run_source, reconciled_by
    ) VALUES(
      @fingerprint, @staff_id, @work_date, @shift_schedule_id,
      @check_in_event_id, @check_out_event_id, @source_event_ids,
      @old_status, @new_status, @result_status, @reason_code,
      @planned_start, @planned_end, @actual_check_in, @actual_check_out,
      @worked_minutes, @overtime_candidate_minutes, @run_source, @reconciled_by
    )
  `).run(data).lastInsertRowid
}

export function markScheduleWorkedFromAttendance(scheduleId) {
  return getDB().prepare(`
    UPDATE shift_schedule SET status = 'worked'
    WHERE id = ? AND status = 'scheduled'
  `).run(scheduleId).changes === 1
}

export function resolveStaleAttendanceExceptions({ staffId, workDate, activeTypes = [], userId }) {
  const db = getDB()
  let sql = `
    UPDATE attendance_exceptions
    SET status = 'resolved', resolved_by = ?, resolved_at = CURRENT_TIMESTAMP,
      resolution_note = 'Yeni uzlastirma ile otomatik kapatildi', updated_at = CURRENT_TIMESTAMP
    WHERE staff_id = ? AND work_date = ? AND status = 'open'
  `
  const params = [userId || null, staffId, workDate]
  if (activeTypes.length) {
    sql += ` AND exception_type NOT IN (${activeTypes.map(() => '?').join(',')})`
    params.push(...activeTypes)
  }
  return db.prepare(sql).run(...params).changes
}

export function upsertAttendanceException(data) {
  const db = getDB()
  const existing = db.prepare(`
    SELECT id FROM attendance_exceptions
    WHERE COALESCE(staff_id, 0) = COALESCE(?, 0)
      AND work_date = ? AND exception_type = ? AND status = 'open'
  `).get(data.staff_id, data.work_date, data.exception_type)
  if (existing) {
    db.prepare(`
      UPDATE attendance_exceptions
      SET shift_schedule_id = @shift_schedule_id,
        reconciliation_id = @reconciliation_id,
        source_event_id = @source_event_id,
        severity = @severity,
        message = @message,
        details_json = @details_json,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run({ ...data, id: existing.id })
    return existing.id
  }
  return db.prepare(`
    INSERT INTO attendance_exceptions(
      staff_id, work_date, shift_schedule_id, reconciliation_id,
      source_event_id, exception_type, severity, message, details_json
    ) VALUES(
      @staff_id, @work_date, @shift_schedule_id, @reconciliation_id,
      @source_event_id, @exception_type, @severity, @message, @details_json
    )
  `).run(data).lastInsertRowid
}

export function listAttendanceExceptions(filters = {}) {
  const db = getDB()
  let sql = `
    SELECT ax.*, s.full_name, d.name AS dept_name, d.color_class AS dept_color,
      sd.name AS shift_name, sd.start_hour, sd.end_hour,
      adr.actual_check_in, adr.actual_check_out, adr.overtime_candidate_minutes,
      resolver.full_name AS resolved_by_name
    FROM attendance_exceptions ax
    LEFT JOIN staff s ON s.id = ax.staff_id
    LEFT JOIN departments d ON d.id = s.department_id
    LEFT JOIN shift_schedule ss ON ss.id = ax.shift_schedule_id
    LEFT JOIN shift_definitions sd ON sd.id = ss.shift_def_id
    LEFT JOIN attendance_daily_reconciliations adr ON adr.id = ax.reconciliation_id
    LEFT JOIN users resolver ON resolver.id = ax.resolved_by
    WHERE 1 = 1
  `
  const params = []
  if (filters.status) { sql += ' AND ax.status = ?'; params.push(filters.status) }
  if (filters.from) { sql += ' AND ax.work_date >= ?'; params.push(filters.from) }
  if (filters.to) { sql += ' AND ax.work_date <= ?'; params.push(filters.to) }
  if (filters.staff_id) { sql += ' AND ax.staff_id = ?'; params.push(filters.staff_id) }
  if (filters.dept_id) { sql += ' AND s.department_id = ?'; params.push(filters.dept_id) }
  if (filters.exception_type) { sql += ' AND ax.exception_type = ?'; params.push(filters.exception_type) }
  sql += ` ORDER BY CASE ax.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
    ax.work_date DESC, ax.updated_at DESC LIMIT ?`
  params.push(Math.min(Math.max(Number(filters.limit) || 500, 1), 1000))
  return db.prepare(sql).all(...params)
}

export function getAttendanceException(id) {
  return getDB().prepare('SELECT * FROM attendance_exceptions WHERE id = ?').get(id)
}

export function updateAttendanceExceptionStatus(id, status, note, userId) {
  getDB().prepare(`
    UPDATE attendance_exceptions
    SET status = ?, resolution_note = ?, resolved_by = ?, resolved_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status, note || null, userId || null, id)
  return getAttendanceException(id)
}

export function getAttendanceMonthSummary(monthStart, monthEnd, deptId) {
  const db = getDB()
  let sql = `
    SELECT s.id AS staff_id,
      COUNT(DISTINCT adr.work_date) AS reconciled_days,
      SUM(CASE WHEN adr.result_status = 'matched' THEN 1 ELSE 0 END) AS matched_days,
      SUM(CASE WHEN adr.result_status IN ('exception','no_events','unplanned') THEN 1 ELSE 0 END) AS exception_days,
      COALESCE(SUM(adr.overtime_candidate_minutes), 0) AS overtime_candidate_minutes,
      (SELECT COUNT(*) FROM attendance_exceptions ax
        WHERE ax.staff_id = s.id AND ax.status = 'open'
          AND ax.work_date BETWEEN ? AND ?) AS open_exception_count
    FROM staff s
    LEFT JOIN attendance_daily_reconciliations adr
      ON adr.staff_id = s.id
      AND adr.work_date BETWEEN ? AND ?
      AND NOT EXISTS (
        SELECT 1 FROM attendance_daily_reconciliations newer
        WHERE newer.staff_id = adr.staff_id
          AND newer.work_date = adr.work_date
          AND newer.id > adr.id
      )
    WHERE 1 = 1
  `
  const params = [monthStart, monthEnd, monthStart, monthEnd]
  if (deptId) { sql += ' AND s.department_id = ?'; params.push(deptId) }
  sql += ' GROUP BY s.id'
  return db.prepare(sql).all(...params)
}

// ── Statistics ──
export function getShiftStatistics(date) {
  const db = getDB()

  const byShift = db.prepare(`
    SELECT sd.id as shift_def_id, sd.name as shift_name, sd.color_class,
      sd.start_hour, sd.end_hour, sd.min_staff,
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
export function createShiftDefinition(name, startHour, endHour, colorClass, minStaff = 0) {
  return getDB().prepare('INSERT INTO shift_definitions(name, start_hour, end_hour, color_class, min_staff) VALUES(?,?,?,?,?)')
    .run(name, startHour, endHour, colorClass, Math.max(0, parseInt(minStaff) || 0)).lastInsertRowid
}

export function updateShiftDefinition(id, data) {
  const db = getDB()
  const sets = []
  const params = []
  if (data.name !== undefined) { sets.push('name=?'); params.push(data.name) }
  if (data.start_hour !== undefined) { sets.push('start_hour=?'); params.push(data.start_hour) }
  if (data.end_hour !== undefined) { sets.push('end_hour=?'); params.push(data.end_hour) }
  if (data.color_class !== undefined) { sets.push('color_class=?'); params.push(data.color_class) }
  if (data.min_staff !== undefined) { sets.push('min_staff=?'); params.push(Math.max(0, parseInt(data.min_staff) || 0)) }
  if (sets.length === 0) return
  params.push(id)
  db.prepare(`UPDATE shift_definitions SET ${sets.join(',')} WHERE id=?`).run(...params)
}

// Kapsama panosu: tarih aralığında vardiya×gün gerçekleşen atama vs hedef (min_staff).
// Tüm vardiyalar döner (atamasız olanlar da) → eksik kadro görünür.
export function getShiftCoverage(from, to) {
  const db = getDB()
  const shifts = db.prepare(`
    SELECT id, name, color_class, start_hour, end_hour, min_staff
    FROM shift_definitions ORDER BY start_hour, id
  `).all()
  const counts = db.prepare(`
    SELECT ss.work_date, ss.shift_def_id, COUNT(*) AS assigned
    FROM shift_schedule ss
    WHERE ss.work_date BETWEEN ? AND ? AND ss.status IN ('scheduled','worked','overtime') AND ss.shift_def_id IS NOT NULL
    GROUP BY ss.work_date, ss.shift_def_id
  `).all(from, to)
  return { shifts, counts }
}

export function getScheduleBreakdown(from, to) {
  const db = getDB()
  const workLocations = getWorkLocations({ includeInactive: true })
  const roles = getStaffRoles({ includeInactive: true })
  const locationCounts = db.prepare(`
    SELECT ss.work_date, ss.work_location_id,
      COALESCE(wl.name, 'Noktasiz') AS work_location_name,
      COALESCE(wl.color_class, 'gray') AS work_location_color,
      COUNT(*) AS assigned
    FROM shift_schedule ss
    LEFT JOIN work_locations wl ON wl.id = ss.work_location_id
    WHERE ss.work_date BETWEEN ? AND ? AND ss.status IN ('scheduled','worked','overtime')
    GROUP BY ss.work_date, ss.work_location_id
    ORDER BY ss.work_date, wl.sort_order, wl.name
  `).all(from, to)
  const roleCounts = db.prepare(`
    SELECT ss.work_date, s.role_id,
      COALESCE(sr.name, 'Rolsuz') AS role_name,
      COUNT(*) AS assigned
    FROM shift_schedule ss
    JOIN staff s ON s.id = ss.staff_id
    LEFT JOIN staff_roles sr ON sr.id = s.role_id
    WHERE ss.work_date BETWEEN ? AND ? AND ss.status IN ('scheduled','worked','overtime')
    GROUP BY ss.work_date, s.role_id
    ORDER BY ss.work_date, sr.sort_order, sr.name
  `).all(from, to)
  const siteCounts = db.prepare(`
    SELECT ss.work_date, COALESCE(wl.site, 'Sitesiz') AS site, COUNT(*) AS assigned
    FROM shift_schedule ss
    LEFT JOIN work_locations wl ON wl.id = ss.work_location_id
    WHERE ss.work_date BETWEEN ? AND ? AND ss.status IN ('scheduled','worked','overtime')
    GROUP BY ss.work_date, COALESCE(wl.site, 'Sitesiz')
    ORDER BY ss.work_date, site
  `).all(from, to)
  return { from, to, work_locations: workLocations, roles, location_counts: locationCounts, role_counts: roleCounts, site_counts: siteCounts }
}

// Bir kırılım hücresine (dimension × değer × gün) atanan kişileri getir — tıkla-panel için.
// dimension: 'site' | 'location' | 'role'
export function getBreakdownAssignees({ date, dimension, value }) {
  const db = getDB()
  const groupExpr = {
    site: "COALESCE(wl.site, 'Sitesiz')",
    location: "COALESCE(wl.name, 'Noktasiz')",
    role: "COALESCE(sr.name, 'Rolsuz')",
  }[dimension]
  if (!groupExpr) return []
  return db.prepare(`
    SELECT ss.staff_id, s.full_name, s.position,
      COALESCE(d.name, '—') AS dept_name,
      COALESCE(sr.name, '') AS role_name,
      COALESCE(sd.name, '') AS shift_name,
      sd.start_hour, sd.end_hour,
      COALESCE(wl.name, '') AS work_location_name,
      COALESCE(wl.color_class, '') AS work_location_color,
      COALESCE(wl.site, '') AS site,
      ss.status
    FROM shift_schedule ss
    JOIN staff s ON s.id = ss.staff_id
    LEFT JOIN departments d ON d.id = COALESCE(ss.dept_id, s.department_id)
    LEFT JOIN staff_roles sr ON sr.id = s.role_id
    LEFT JOIN shift_definitions sd ON sd.id = ss.shift_def_id
    LEFT JOIN work_locations wl ON wl.id = ss.work_location_id
    WHERE ss.work_date = ? AND ss.status IN ('scheduled','worked','overtime')
      AND ${groupExpr} = ?
    ORDER BY s.full_name COLLATE NOCASE
  `).all(date, value)
}

export function deleteShiftDefinition(id) {
  getDB().prepare('DELETE FROM shift_definitions WHERE id=?').run(id)
}

// ── Leave cancellation ──
export function cancelLeaveRequest(id) {
  const db = getDB()
  const req = db.prepare('SELECT * FROM leave_requests WHERE id=?').get(id)
  if (!req) throw new Error('İzin talebi bulunamadı')
  const tx = db.transaction(() => {
    db.prepare("UPDATE leave_requests SET status='rejected' WHERE id=?").run(id)
    clearLeaveFromSchedule(db, req)
    // E1 — onaylı izin iptalinde bakiye iadesi
    if (req.status === 'approved') adjustLeaveBalance(db, req, -1)
  })
  tx()
}

// ── Shift swap requests ──
// X5 — Yazım uyarıları: çalışma vardiyası ONAYLI izin gününe atanıyorsa uyar (bloklamaz).
export function assignmentWarnings(entries) {
  const db = getDB()
  const approvedLeave = db.prepare(`
    SELECT lr.leave_type, s.full_name FROM leave_requests lr
    JOIN staff s ON s.id = lr.staff_id
    WHERE lr.staff_id = ? AND lr.status='approved' AND ? BETWEEN lr.start_date AND lr.end_date
  `)
  const warnings = []
  for (const e of entries || []) {
    if (!e.staff_id || !e.work_date) continue
    const status = e.status || 'scheduled'
    if (['scheduled', 'worked', 'overtime'].includes(status)) {
      const leave = approvedLeave.get(e.staff_id, e.work_date)
      if (leave) warnings.push({
        staff_id: e.staff_id, work_date: e.work_date, kind: 'leave_overwrite',
        message: `${leave.full_name}: ${e.work_date} onaylı izinli — üzerine vardiya atandı`,
      })
    }
  }
  return warnings
}

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
  const rows = db.prepare('SELECT staff_id, dept_id, shift_def_id, work_location_id, work_date, status, leave_type, absent_reason FROM shift_schedule WHERE work_date BETWEEN ? AND ?').all(sourceWeekStart, sourceEnd)

  const dayDiff = Math.round((new Date(targetWeekStart) - new Date(sourceWeekStart)) / 86400000)

  const upsert = db.prepare(`
    INSERT INTO shift_schedule(staff_id, dept_id, shift_def_id, work_location_id, work_date, status, leave_type, absent_reason, created_by)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(staff_id, work_date) DO UPDATE SET
      shift_def_id=excluded.shift_def_id,
      dept_id=excluded.dept_id,
      work_location_id=excluded.work_location_id,
      status=excluded.status,
      leave_type=excluded.leave_type,
      absent_reason=excluded.absent_reason
  `)

  db.transaction(() => {
    rows.forEach(r => {
      const newDate = addDaysStr(r.work_date, dayDiff)
      upsert.run(r.staff_id, r.dept_id, r.shift_def_id, r.work_location_id || null, newDate, r.status || 'scheduled', r.leave_type || null, r.absent_reason || null, createdBy)
    })
  })()

  return rows.length
}

// ── Period locks (Faz 31 — ay kapatma) ──
export function listPeriodLocks() {
  return getDB().prepare(`
    SELECT pl.period, pl.locked_at, pl.note, u.username as locked_by_name
    FROM period_locks pl
    LEFT JOIN users u ON u.id = pl.locked_by
    ORDER BY pl.period DESC
  `).all()
}

export function isPeriodLocked(period) {
  return !!getDB().prepare('SELECT 1 FROM period_locks WHERE period=?').get(period)
}

export function lockedPeriodsFor(periods) {
  if (!periods.length) return []
  const ph = periods.map(() => '?').join(',')
  return getDB().prepare(`SELECT period FROM period_locks WHERE period IN (${ph})`).all(...periods).map(r => r.period)
}

export function lockPeriod(period, userId, note) {
  getDB().prepare(`
    INSERT INTO period_locks(period, locked_by, note) VALUES(?,?,?)
    ON CONFLICT(period) DO UPDATE SET locked_by=excluded.locked_by, locked_at=CURRENT_TIMESTAMP, note=excluded.note
  `).run(period, userId || null, note || null)
}

export function unlockPeriod(period) {
  getDB().prepare('DELETE FROM period_locks WHERE period=?').run(period)
}

// Puantaj approvals: period + daily workflow state.
export function getPuantajPeriodApproval(period, deptScope) {
  return getDB().prepare(`
    SELECT p.*,
      submitter.full_name as submitted_by_name,
      approver.full_name as approved_by_name,
      returner.full_name as returned_by_name,
      locker.full_name as locked_by_name,
      d.name as dept_name
    FROM puantaj_period_approvals p
    LEFT JOIN users submitter ON submitter.id = p.submitted_by
    LEFT JOIN users approver ON approver.id = p.approved_by
    LEFT JOIN users returner ON returner.id = p.returned_by
    LEFT JOIN users locker ON locker.id = p.locked_by
    LEFT JOIN departments d ON d.id = p.dept_id
    WHERE p.period = ? AND p.dept_scope = ?
  `).get(period, deptScope)
}

export function upsertPuantajPeriodApproval({ period, deptScope, deptId, status, note, userId, action }) {
  const db = getDB()
  db.prepare(`
    INSERT INTO puantaj_period_approvals(period, dept_scope, dept_id, status, note)
    VALUES(?, ?, ?, 'draft', NULL)
    ON CONFLICT(period, dept_scope) DO NOTHING
  `).run(period, deptScope, deptId || null)

  const fields = ['status = ?', 'note = ?', 'updated_at = CURRENT_TIMESTAMP']
  const params = [status, note || null]
  if (action === 'submit') {
    fields.push('submitted_by = ?', 'submitted_at = CURRENT_TIMESTAMP')
    params.push(userId || null)
  } else if (action === 'approve') {
    fields.push('approved_by = ?', 'approved_at = CURRENT_TIMESTAMP')
    params.push(userId || null)
  } else if (action === 'return') {
    fields.push('returned_by = ?', 'returned_at = CURRENT_TIMESTAMP')
    params.push(userId || null)
  } else if (action === 'lock') {
    fields.push('locked_by = ?', 'locked_at = CURRENT_TIMESTAMP')
    params.push(userId || null)
  }
  params.push(period, deptScope)
  db.prepare(`
    UPDATE puantaj_period_approvals
    SET ${fields.join(', ')}
    WHERE period = ? AND dept_scope = ?
  `).run(...params)
  return getPuantajPeriodApproval(period, deptScope)
}

export function listPuantajDailyApprovals(period, deptScope) {
  return getDB().prepare(`
    SELECT p.*,
      submitter.full_name as submitted_by_name,
      approver.full_name as approved_by_name,
      returner.full_name as returned_by_name,
      d.name as dept_name
    FROM puantaj_daily_approvals p
    LEFT JOIN users submitter ON submitter.id = p.submitted_by
    LEFT JOIN users approver ON approver.id = p.approved_by
    LEFT JOIN users returner ON returner.id = p.returned_by
    LEFT JOIN departments d ON d.id = p.dept_id
    WHERE p.period = ? AND p.dept_scope = ?
    ORDER BY p.work_date ASC
  `).all(period, deptScope)
}

export function upsertPuantajDailyApproval({ period, workDate, deptScope, deptId, status, note, userId }) {
  const db = getDB()
  db.prepare(`
    INSERT INTO puantaj_daily_approvals(period, work_date, dept_scope, dept_id, status, note)
    VALUES(?, ?, ?, ?, 'missing', NULL)
    ON CONFLICT(work_date, dept_scope) DO NOTHING
  `).run(period, workDate, deptScope, deptId || null)

  const fields = ['status = ?', 'note = ?', 'updated_at = CURRENT_TIMESTAMP']
  const params = [status, note || null]
  if (status === 'pending') {
    fields.push('submitted_by = ?', 'submitted_at = CURRENT_TIMESTAMP')
    params.push(userId || null)
  } else if (status === 'approved') {
    fields.push('approved_by = ?', 'approved_at = CURRENT_TIMESTAMP')
    params.push(userId || null)
  } else if (status === 'returned') {
    fields.push('returned_by = ?', 'returned_at = CURRENT_TIMESTAMP')
    params.push(userId || null)
  }
  params.push(workDate, deptScope)
  db.prepare(`
    UPDATE puantaj_daily_approvals
    SET ${fields.join(', ')}
    WHERE work_date = ? AND dept_scope = ?
  `).run(...params)

  return db.prepare(`
    SELECT p.*,
      submitter.full_name as submitted_by_name,
      approver.full_name as approved_by_name,
      returner.full_name as returned_by_name,
      d.name as dept_name
    FROM puantaj_daily_approvals p
    LEFT JOIN users submitter ON submitter.id = p.submitted_by
    LEFT JOIN users approver ON approver.id = p.approved_by
    LEFT JOIN users returner ON returner.id = p.returned_by
    LEFT JOIN departments d ON d.id = p.dept_id
    WHERE p.work_date = ? AND p.dept_scope = ?
  `).get(workDate, deptScope)
}

export function insertPuantajApprovalEvent({ scope, period, workDate, deptScope, deptId, action, status, note, userId }) {
  return getDB().prepare(`
    INSERT INTO puantaj_approval_events(scope, period, work_date, dept_scope, dept_id, action, status, note, user_id)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(scope, period, workDate || null, deptScope, deptId || null, action, status || null, note || null, userId || null).lastInsertRowid
}

export function listPuantajApprovalEvents(period, deptScope, limit = 50) {
  return getDB().prepare(`
    SELECT e.*, u.full_name as user_name, d.name as dept_name
    FROM puantaj_approval_events e
    LEFT JOIN users u ON u.id = e.user_id
    LEFT JOIN departments d ON d.id = e.dept_id
    WHERE e.period = ? AND e.dept_scope = ?
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT ?
  `).all(period, deptScope, limit)
}

// ── Puantaj kod kayıt sistemi (migration 042) ──
export function listPuantajCodes({ includeInactive = false } = {}) {
  let sql = 'SELECT * FROM puantaj_codes WHERE 1=1'
  if (!includeInactive) sql += ' AND is_active = 1'
  sql += ' ORDER BY sort_order, code'
  return getDB().prepare(sql).all()
}

export function createPuantajCode({ code, label, colorHex, status, leaveType, sortOrder }) {
  return getDB().prepare(`
    INSERT INTO puantaj_codes(code, label, color_hex, status, leave_type, sort_order, is_builtin)
    VALUES(?, ?, ?, ?, ?, ?, 0)
  `).run(code, label, colorHex, status, leaveType || null, sortOrder ?? 99).lastInsertRowid
}

export function updatePuantajCode(id, fields) {
  const allowed = ['code', 'label', 'color_hex', 'leave_type', 'sort_order', 'is_active']
  const sets = []
  const params = []
  allowed.forEach(key => {
    if (fields[key] !== undefined) { sets.push(`${key} = ?`); params.push(fields[key]) }
  })
  if (!sets.length) return
  sets.push("updated_at = CURRENT_TIMESTAMP")
  params.push(id)
  getDB().prepare(`UPDATE puantaj_codes SET ${sets.join(', ')} WHERE id = ?`).run(...params)
}

export function getPuantajCode(id) {
  return getDB().prepare('SELECT * FROM puantaj_codes WHERE id = ?').get(id)
}

export function deletePuantajCode(id) {
  getDB().prepare('DELETE FROM puantaj_codes WHERE id = ? AND is_builtin = 0').run(id)
}

// Departman onay matrisi — dönem için tüm scope'ların durum + sayaç özeti.
export function getPuantajApprovalOverview(period, monthStart, monthEnd) {
  const db = getDB()
  const departments = db.prepare(`
    SELECT d.id, d.name, d.color_class, COUNT(s.id) AS staff_count
    FROM departments d
    JOIN staff s ON s.department_id = d.id AND s.is_active = 1
    GROUP BY d.id
    ORDER BY d.name COLLATE NOCASE
  `).all()
  const periodRows = db.prepare(`
    SELECT p.*, u.full_name AS submitted_by_name
    FROM puantaj_period_approvals p
    LEFT JOIN users u ON u.id = p.submitted_by
    WHERE p.period = ?
  `).all(period)
  const dailyCounts = db.prepare(`
    SELECT dept_scope, status, COUNT(*) AS n
    FROM puantaj_daily_approvals
    WHERE period = ?
    GROUP BY dept_scope, status
  `).all(period)
  const lastEvents = db.prepare(`
    SELECT dept_scope, MAX(created_at) AS last_event_at
    FROM puantaj_approval_events
    WHERE period = ?
    GROUP BY dept_scope
  `).all(period)
  const issueCounts = db.prepare(`
    SELECT COALESCE(ss.dept_id, s.department_id) AS dept_id,
      SUM(CASE WHEN ss.status = 'scheduled' THEN 1 ELSE 0 END) AS scheduled,
      SUM(CASE WHEN ss.status = 'absent' AND TRIM(COALESCE(ss.absent_reason, '')) = '' THEN 1 ELSE 0 END) AS absent_no_reason,
      SUM(CASE WHEN strftime('%w', ss.work_date) != '0' THEN 1 ELSE 0 END) AS filled_days
    FROM shift_schedule ss
    JOIN staff s ON s.id = ss.staff_id AND s.is_active = 1
    WHERE ss.work_date BETWEEN ? AND ?
    GROUP BY COALESCE(ss.dept_id, s.department_id)
  `).all(monthStart, monthEnd)
  return { departments, periodRows, dailyCounts, lastEvents, issueCounts }
}

// Gün onayı guard'ı için tek günün sorun sayaçları (aktif personel bazında).
export function getPuantajDayIssueCounts(date, deptId) {
  return getDB().prepare(`
    SELECT COUNT(*) AS staff_count,
      SUM(CASE WHEN ss.status = 'scheduled' THEN 1 ELSE 0 END) AS scheduled,
      SUM(CASE WHEN ss.status = 'absent' AND TRIM(COALESCE(ss.absent_reason, '')) = '' THEN 1 ELSE 0 END) AS absent_no_reason,
      SUM(CASE WHEN ss.staff_id IS NULL THEN 1 ELSE 0 END) AS empty
    FROM staff s
    LEFT JOIN shift_schedule ss ON ss.staff_id = s.id AND ss.work_date = ?
    WHERE s.is_active = 1 AND (? IS NULL OR s.department_id = ?)
  `).get(date, deptId ?? null, deptId ?? null)
}

// Onay bütünlüğü: puantaj verisi değişen günlerin 'approved' gün onaylarını
// (tüm scope'larda) 'pending'e düşürür; onaylı dönem varsa 'submitted'a çeker.
// Her düşürme puantaj_approval_events'e 'data_changed' olarak yazılır.
export function resetDailyApprovalsForDates(dates, userId) {
  const db = getDB()
  const uniqueDates = [...new Set((dates || []).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''))))]
  if (!uniqueDates.length) return 0
  let reset = 0

  const findApproved = db.prepare(`
    SELECT id, period, work_date, dept_scope, dept_id
    FROM puantaj_daily_approvals
    WHERE work_date = ? AND status = 'approved'
  `)
  const downgradeDay = db.prepare(`
    UPDATE puantaj_daily_approvals
    SET status = 'pending', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `)
  const findApprovedPeriod = db.prepare(`
    SELECT id, period, dept_scope, dept_id
    FROM puantaj_period_approvals
    WHERE period = ? AND dept_scope = ? AND status = 'approved'
  `)
  const downgradePeriod = db.prepare(`
    UPDATE puantaj_period_approvals
    SET status = 'submitted', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `)

  const touchedPeriodScopes = new Set()
  uniqueDates.forEach(date => {
    findApproved.all(date).forEach(row => {
      downgradeDay.run(row.id)
      reset += 1
      insertPuantajApprovalEvent({
        scope: 'day',
        period: row.period,
        workDate: row.work_date,
        deptScope: row.dept_scope,
        deptId: row.dept_id,
        action: 'data_changed',
        status: 'pending',
        note: 'Puantaj verisi değişti — gün onayı beklemeye düştü',
        userId,
      })
      touchedPeriodScopes.add(`${row.period}|${row.dept_scope}`)
    })
  })

  touchedPeriodScopes.forEach(key => {
    const [period, deptScope] = key.split('|')
    const periodRow = findApprovedPeriod.get(period, deptScope)
    if (periodRow) {
      downgradePeriod.run(periodRow.id)
      insertPuantajApprovalEvent({
        scope: 'period',
        period: periodRow.period,
        deptScope: periodRow.dept_scope,
        deptId: periodRow.dept_id,
        action: 'data_changed',
        status: 'submitted',
        note: 'Onaylı dönemde puantaj verisi değişti — dönem onayı geri alındı',
        userId,
      })
    }
  })

  return reset
}

// ── Rotation templates (Faz 30 — isimli şablonlar) ──
export function listRotationTemplates() {
  return getDB().prepare('SELECT * FROM rotation_templates ORDER BY id DESC').all()
}

export function getRotationTemplate(id) {
  return getDB().prepare('SELECT * FROM rotation_templates WHERE id=?').get(id)
}

export function createRotationTemplate(name, patternJson, createdBy) {
  return getDB().prepare('INSERT INTO rotation_templates(name, pattern_json, created_by) VALUES(?,?,?)')
    .run(name, patternJson, createdBy || null).lastInsertRowid
}

export function deleteRotationTemplate(id) {
  getDB().prepare('DELETE FROM rotation_templates WHERE id=?').run(id)
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

export function upsertPuantajDayDetail(data, userId) {
  const db = getDB()
  const staffId = Number(data.staff_id)
  const workDate = String(data.work_date || '')
  if (!staffId || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) throw new Error('Personel ve tarih zorunlu')
  const staff = db.prepare('SELECT department_id FROM staff WHERE id=? AND is_active=1').get(staffId)
  if (!staff) throw new Error('Personel bulunamadi')

  const existing = db.prepare('SELECT * FROM shift_schedule WHERE staff_id=? AND work_date=?').get(staffId, workDate)
  const requestedStatus = data.status || existing?.status || (data.leave_type || data.leave_hours ? 'on_leave' : 'scheduled')
  const status = ['scheduled', 'worked', 'absent', 'on_leave', 'overtime', 'off'].includes(requestedStatus) ? requestedStatus : 'scheduled'
  const keepsWorkFields = ['scheduled', 'worked', 'overtime'].includes(status)
  const leaveHours = data.leave_hours === '' || data.leave_hours == null ? null : Number(data.leave_hours)
  if (leaveHours != null && (!Number.isFinite(leaveHours) || leaveHours < 0 || leaveHours > 24)) throw new Error('Saatlik izin 0-24 arasinda olmali')
  const removeAttachment = data.remove_attachment === true || data.remove_attachment === 'true' || data.remove_attachment === '1'
  const hasField = (key) => Object.prototype.hasOwnProperty.call(data, key)
  const cleanText = (value) => {
    if (value == null) return null
    const trimmed = String(value).trim()
    return trimmed || null
  }

  const next = {
    staff_id: staffId,
    dept_id: existing?.dept_id ?? staff.department_id ?? null,
    shift_def_id: keepsWorkFields ? (existing?.shift_def_id ?? null) : null,
    work_location_id: keepsWorkFields ? (existing?.work_location_id ?? null) : null,
    work_date: workDate,
    status,
    leave_type: status === 'on_leave' ? (cleanText(data.leave_type) || existing?.leave_type || 'other') : null,
    absent_reason: status === 'absent' ? (hasField('absent_reason') ? cleanText(data.absent_reason) : (existing?.absent_reason ?? null)) : null,
    leave_hours: status === 'on_leave' ? leaveHours : null,
    detail_note: hasField('detail_note') ? cleanText(data.detail_note) : (existing?.detail_note ?? null),
    attachment_url: removeAttachment ? null : (data.attachment_url ?? existing?.attachment_url ?? null),
    attachment_name: removeAttachment ? null : (data.attachment_name ?? existing?.attachment_name ?? null),
    attachment_mime: removeAttachment ? null : (data.attachment_mime ?? existing?.attachment_mime ?? null),
    created_by: userId || existing?.created_by || null,
  }

  db.prepare(`
    INSERT INTO shift_schedule(
      staff_id, dept_id, shift_def_id, work_location_id, work_date, status, leave_type, absent_reason,
      leave_hours, detail_note, attachment_url, attachment_name, attachment_mime, created_by
    )
    VALUES(
      @staff_id, @dept_id, @shift_def_id, @work_location_id, @work_date, @status, @leave_type, @absent_reason,
      @leave_hours, @detail_note, @attachment_url, @attachment_name, @attachment_mime, @created_by
    )
    ON CONFLICT(staff_id, work_date) DO UPDATE SET
      dept_id=excluded.dept_id,
      shift_def_id=excluded.shift_def_id,
      work_location_id=excluded.work_location_id,
      status=excluded.status,
      leave_type=excluded.leave_type,
      absent_reason=excluded.absent_reason,
      leave_hours=excluded.leave_hours,
      detail_note=excluded.detail_note,
      attachment_url=excluded.attachment_url,
      attachment_name=excluded.attachment_name,
      attachment_mime=excluded.attachment_mime
  `).run(next)

  return db.prepare('SELECT * FROM shift_schedule WHERE staff_id=? AND work_date=?').get(staffId, workDate)
}

// ── Staff detail / profile ──
export function getStaffDetail(staffId) {
  const db = getDB()

  const person = getStaffById(staffId)
  if (!person) throw new Error('Personel bulunamadi')
  const assignmentHistory = getStaffAssignments(staffId)

  // LEFT JOIN: OFF / izin günlerinde shift_def_id NULL — bu satırlar da listelensin
  const shiftHistory = db.prepare(`
    SELECT ss.work_date, ss.status,
      sd.name as shift_name, sd.start_hour, sd.end_hour, sd.color_class as shift_color,
      d.name as dept_name, d.color_class as dept_color,
      wl.name as work_location_name, wl.color_class as work_location_color,
      CASE WHEN ss.status = 'on_leave' THEN COALESCE(ss.leave_type, (
        SELECT lr.leave_type FROM leave_requests lr
        WHERE lr.staff_id = ss.staff_id AND lr.status = 'approved'
          AND lr.start_date <= ss.work_date AND lr.end_date >= ss.work_date
        ORDER BY lr.id DESC LIMIT 1
      )) END as leave_type,
      ss.absent_reason,
      ss.leave_hours,
      ss.detail_note,
      ss.attachment_url,
      ss.attachment_name,
      ss.attachment_mime
    FROM shift_schedule ss
    LEFT JOIN shift_definitions sd ON sd.id = ss.shift_def_id
    LEFT JOIN departments d ON d.id = ss.dept_id
    LEFT JOIN work_locations wl ON wl.id = ss.work_location_id
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
  const offCount = db.prepare("SELECT COUNT(*) as count FROM shift_schedule WHERE staff_id=? AND status='off'").get(staffId).count

  // Aylık geçmiş — son 12 ay: puantaj sayaçları + FM saati
  const monthlyHistory = db.prepare(`
    SELECT substr(ss.work_date, 1, 7) AS month,
      SUM(CASE WHEN ss.status IN ('worked','overtime') THEN 1 ELSE 0 END) AS worked,
      SUM(CASE WHEN ss.status = 'off' THEN 1 ELSE 0 END) AS off,
      SUM(CASE WHEN ss.status = 'on_leave' THEN 1 ELSE 0 END) AS leave,
      SUM(CASE WHEN ss.status = 'absent' THEN 1 ELSE 0 END) AS absent,
      SUM(CASE WHEN ss.status = 'scheduled' THEN 1 ELSE 0 END) AS scheduled
    FROM shift_schedule ss
    WHERE ss.staff_id = ?
    GROUP BY substr(ss.work_date, 1, 7)
    ORDER BY month DESC
    LIMIT 12
  `).all(staffId)
  const monthlyOvertime = db.prepare(`
    SELECT substr(work_date, 1, 7) AS month, COALESCE(SUM(hours), 0) AS fm_hours
    FROM overtime_records
    WHERE staff_id = ?
    GROUP BY substr(work_date, 1, 7)
  `).all(staffId)
  const fmByMonth = new Map(monthlyOvertime.map(row => [row.month, row.fm_hours]))
  monthlyHistory.forEach(row => { row.fm_hours = fmByMonth.get(row.month) || 0 })

  return {
    person,
    shiftHistory,
    leaveHistory,
    overtimeRecords,
    attendanceLogs,
    assignmentHistory,
    monthlyHistory,
    stats: { totalShifts, workedShifts, totalOvertime, totalLeave, absentCount, offCount }
  }
}

// ── Puantaj day breakdown ──
export function getStaffDayBreakdown(staffId, monthStart, monthEnd) {
  const db = getDB()
  return db.prepare(`
    SELECT
      ss.work_date as date,
      ss.id as schedule_id,
      ss.dept_id,
      ss.shift_def_id,
      ss.status,
      sd.name as shift_name,
      sd.start_hour,
      sd.end_hour,
      ss.work_location_id,
      wl.name as work_location_name,
      wl.color_class as work_location_color,
      CASE WHEN ss.status = 'on_leave' THEN COALESCE(ss.leave_type, lr.leave_type) END as leave_type,
      ss.absent_reason,
      ss.leave_hours,
      ss.detail_note,
      ss.attachment_url,
      ss.attachment_name,
      ss.attachment_mime,
      ot.hours as overtime_hours,
      CASE WHEN adr.id IS NOT NULL THEN 'card_kiosk' ELSE 'manual' END as attendance_source,
      adr.result_status as reconciliation_status,
      adr.reason_code as reconciliation_reason,
      adr.actual_check_in,
      adr.actual_check_out,
      adr.worked_minutes as attendance_worked_minutes,
      adr.overtime_candidate_minutes,
      (SELECT COUNT(*) FROM attendance_exceptions ax
        WHERE ax.staff_id = ss.staff_id AND ax.work_date = ss.work_date AND ax.status = 'open') as attendance_exception_count
    FROM shift_schedule ss
    LEFT JOIN shift_definitions sd ON sd.id = ss.shift_def_id
    LEFT JOIN work_locations wl ON wl.id = ss.work_location_id
    LEFT JOIN leave_requests lr ON lr.staff_id = ss.staff_id
      AND lr.status = 'approved'
      AND ss.work_date BETWEEN lr.start_date AND lr.end_date
    LEFT JOIN overtime_records ot ON ot.staff_id = ss.staff_id
      AND ot.work_date = ss.work_date
    LEFT JOIN attendance_daily_reconciliations adr ON adr.id = (
      SELECT latest_adr.id
      FROM attendance_daily_reconciliations latest_adr
      WHERE latest_adr.staff_id = ss.staff_id AND latest_adr.work_date = ss.work_date
      ORDER BY latest_adr.id DESC
      LIMIT 1
    )
    WHERE ss.staff_id = ? AND ss.work_date BETWEEN ? AND ?
    ORDER BY ss.work_date
  `).all(staffId, monthStart, monthEnd)
}

// ── Puantaj (Timesheet) ──
export function getPuantajDayRows(monthStart, monthEnd, deptId) {
  const db = getDB()
  let query = `
    SELECT
      ss.staff_id,
      ss.work_date as date,
      ss.id as schedule_id,
      ss.dept_id,
      ss.shift_def_id,
      ss.status,
      sd.name as shift_name,
      sd.start_hour,
      sd.end_hour,
      ss.work_location_id,
      wl.name as work_location_name,
      wl.color_class as work_location_color,
      CASE WHEN day_sa.id IS NOT NULL THEN day_sa.role_id ELSE s.role_id END as role_id,
      sr.name as role_name,
      CASE WHEN ss.status = 'on_leave' THEN COALESCE(ss.leave_type, lr.leave_type) END as leave_type,
      ss.absent_reason,
      ss.leave_hours,
      ss.detail_note,
      ss.attachment_url,
      ss.attachment_name,
      ss.attachment_mime,
      ot.hours as overtime_hours,
      CASE WHEN adr.id IS NOT NULL THEN 'card_kiosk' ELSE 'manual' END as attendance_source,
      adr.result_status as reconciliation_status,
      adr.reason_code as reconciliation_reason,
      adr.actual_check_in,
      adr.actual_check_out,
      adr.worked_minutes as attendance_worked_minutes,
      adr.overtime_candidate_minutes,
      (SELECT COUNT(*) FROM attendance_exceptions ax
        WHERE ax.staff_id = ss.staff_id AND ax.work_date = ss.work_date AND ax.status = 'open') as attendance_exception_count
    FROM shift_schedule ss
    JOIN staff s ON s.id = ss.staff_id
    LEFT JOIN staff_assignments day_sa ON day_sa.id = (
      SELECT dated_sa.id
      FROM staff_assignments dated_sa
      WHERE dated_sa.staff_id = ss.staff_id
        AND dated_sa.effective_from <= ss.work_date
        AND (dated_sa.effective_to IS NULL OR dated_sa.effective_to >= ss.work_date)
      ORDER BY dated_sa.effective_from DESC, dated_sa.id DESC
      LIMIT 1
    )
    LEFT JOIN shift_definitions sd ON sd.id = ss.shift_def_id
    LEFT JOIN work_locations wl ON wl.id = ss.work_location_id
    LEFT JOIN staff_roles sr ON sr.id = CASE WHEN day_sa.id IS NOT NULL THEN day_sa.role_id ELSE s.role_id END
    LEFT JOIN leave_requests lr ON lr.staff_id = ss.staff_id
      AND lr.status = 'approved'
      AND ss.work_date BETWEEN lr.start_date AND lr.end_date
    LEFT JOIN overtime_records ot ON ot.staff_id = ss.staff_id
      AND ot.work_date = ss.work_date
    LEFT JOIN attendance_daily_reconciliations adr ON adr.id = (
      SELECT latest_adr.id
      FROM attendance_daily_reconciliations latest_adr
      WHERE latest_adr.staff_id = ss.staff_id AND latest_adr.work_date = ss.work_date
      ORDER BY latest_adr.id DESC
      LIMIT 1
    )
    WHERE ss.work_date BETWEEN ? AND ?
  `
  const params = [monthStart, monthEnd]
  if (deptId) {
    query += ' AND COALESCE(ss.dept_id, CASE WHEN day_sa.id IS NOT NULL THEN day_sa.department_id ELSE s.department_id END) = ?'
    params.push(deptId)
  }
  query += ' ORDER BY ss.staff_id, ss.work_date'
  return db.prepare(query).all(...params)
}

export function getPuantaj(monthStart, monthEnd, deptId) {
  const db = getDB()
  let query = `
    SELECT
      s.id, s.full_name, s.position, s.salary, s.gender, s.tc_no,
      CASE WHEN period_sa.id IS NOT NULL THEN period_sa.department_id ELSE COALESCE(sch.snapshot_dept_id, s.department_id) END as department_id,
      CASE WHEN period_sa.id IS NOT NULL THEN period_sa.role_id ELSE s.role_id END as role_id,
      d.name as dept_name, d.color_class as dept_color,
      sr.name as role_name,
      COALESCE(sch.worked_days, 0) as worked_days,
      COALESCE(sch.scheduled_days, 0) as scheduled_days,
      COALESCE(sch.leave_days, 0) as leave_days,
      COALESCE(sch.absent_days, 0) as absent_days,
      COALESCE(sch.off_days, 0) as off_days,
      COALESCE(sch.total_days, 0) as total_days,
      COALESCE(ot.overtime_hours, 0) as overtime_hours,
      COALESCE(ot.overtime_count, 0) as overtime_count,
      COALESCE(sch.annual_leave_days, 0) as annual_leave_days,
      COALESCE(sch.sick_leave_days, 0) as sick_leave_days,
      COALESCE(sch.emergency_leave_days, 0) as emergency_leave_days,
      COALESCE(sch.other_leave_days, 0) as other_leave_days
    FROM staff s
    LEFT JOIN staff_assignments period_sa ON period_sa.id = (
      SELECT dated_sa.id
      FROM staff_assignments dated_sa
      WHERE dated_sa.staff_id = s.id
        AND dated_sa.effective_from <= ?
        AND (dated_sa.effective_to IS NULL OR dated_sa.effective_to >= ?)
      ORDER BY dated_sa.effective_from DESC, dated_sa.id DESC
      LIMIT 1
    )
    LEFT JOIN (
      SELECT ss.staff_id,
        MAX(ss.dept_id) as snapshot_dept_id,
        COUNT(CASE WHEN ss.status IN ('worked','overtime') THEN 1 END) as worked_days,
        COUNT(CASE WHEN ss.status='scheduled' THEN 1 END) as scheduled_days,
        COUNT(CASE WHEN ss.status='on_leave' THEN 1 END) as leave_days,
        COUNT(CASE WHEN ss.status='absent' THEN 1 END) as absent_days,
        COUNT(CASE WHEN ss.status='off' THEN 1 END) as off_days,
        COUNT(*) as total_days,
        COUNT(CASE WHEN ss.status='on_leave' AND COALESCE(ss.leave_type, lr.leave_type)='annual' THEN 1 END) as annual_leave_days,
        COUNT(CASE WHEN ss.status='on_leave' AND COALESCE(ss.leave_type, lr.leave_type)='sick' THEN 1 END) as sick_leave_days,
        COUNT(CASE WHEN ss.status='on_leave' AND COALESCE(ss.leave_type, lr.leave_type)='emergency' THEN 1 END) as emergency_leave_days,
        COUNT(CASE WHEN ss.status='on_leave' AND (COALESCE(ss.leave_type, lr.leave_type) IS NULL OR COALESCE(ss.leave_type, lr.leave_type) NOT IN ('annual','sick','emergency')) THEN 1 END) as other_leave_days
      FROM shift_schedule ss
      LEFT JOIN leave_requests lr ON lr.staff_id = ss.staff_id
        AND lr.status = 'approved'
        AND ss.work_date BETWEEN lr.start_date AND lr.end_date
      WHERE ss.work_date BETWEEN ? AND ?
      GROUP BY ss.staff_id
    ) sch ON sch.staff_id = s.id
    LEFT JOIN (
      SELECT staff_id,
        COALESCE(SUM(hours), 0) as overtime_hours,
        COUNT(*) as overtime_count
      FROM overtime_records
      WHERE work_date BETWEEN ? AND ?
      GROUP BY staff_id
    ) ot ON ot.staff_id = s.id
    LEFT JOIN departments d ON d.id = CASE WHEN period_sa.id IS NOT NULL THEN period_sa.department_id ELSE COALESCE(sch.snapshot_dept_id, s.department_id) END
    LEFT JOIN staff_roles sr ON sr.id = CASE WHEN period_sa.id IS NOT NULL THEN period_sa.role_id ELSE s.role_id END
    WHERE (s.is_active = 1 OR COALESCE(sch.total_days, 0) > 0 OR COALESCE(ot.overtime_count, 0) > 0)
  `
  const params = [monthEnd, monthEnd, monthStart, monthEnd, monthStart, monthEnd]
  if (deptId) {
    query += ' AND CASE WHEN period_sa.id IS NOT NULL THEN period_sa.department_id ELSE COALESCE(sch.snapshot_dept_id, s.department_id) END = ?'
    params.push(deptId)
  }
  query += ' ORDER BY d.name, s.full_name'
  return db.prepare(query).all(...params)
}
