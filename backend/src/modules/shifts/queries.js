import { getDB } from '../../shared/db/index.js'
import { isIsoDate } from '../../shared/validation/date.js'

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
      wl.is_active as primary_work_location_active,
      pr.name as project_name, pr.code as project_code, pr.color_class as project_color
    FROM staff s
    ${CURRENT_ASSIGNMENT_JOIN}
    LEFT JOIN departments d ON d.id = ${CURRENT_DEPARTMENT_SQL}
    LEFT JOIN staff_roles sr ON sr.id = ${CURRENT_ROLE_SQL}
    LEFT JOIN departments expected_dept ON expected_dept.id = sr.expected_dept_id
    LEFT JOIN work_locations wl ON wl.id = sa.work_location_id
    LEFT JOIN projects pr ON pr.id = s.project_id
    WHERE 1=1
  `
  const params = []
  // 'none' = kadrosu atanmamis olanlar; sayisal id = o proje.
  if (filters.project_id === 'none') { query += ' AND s.project_id IS NULL' }
  else if (filters.project_id) { query += ' AND s.project_id = ?'; params.push(Number(filters.project_id)) }
  if (filters.dept_id) { query += ` AND ${CURRENT_DEPARTMENT_SQL} = ?`; params.push(filters.dept_id) }
  if (filters.role_id) { query += ` AND ${CURRENT_ROLE_SQL} = ?`; params.push(filters.role_id) }
  if (filters.is_active !== undefined) { query += ' AND s.is_active = ?'; params.push(filters.is_active) }
  if (filters.gender) { query += ' AND s.gender = ?'; params.push(filters.gender) }
  if (filters.work_location_id) { query += ' AND sa.work_location_id = ?'; params.push(filters.work_location_id) }
  if (filters.search) {
    query += ' AND (s.full_name LIKE ? OR s.tc_no LIKE ? OR s.phone LIKE ? OR s.position LIKE ?)'
    const term = `%${filters.search}%`
    params.push(term, term, term, term)
  }
  query += ' ORDER BY s.full_name'
  if (filters._limit) {
    query += ' LIMIT ? OFFSET ?'
    params.push(Number(filters._limit), Number(filters._offset || 0))
  }
  return db.prepare(query).all(...params).map(resolveCurrentStaffAssignment)
}

export function getStaffDirectoryMetrics(staffIds = []) {
  const ids = [...new Set(staffIds.map(Number).filter(Number.isInteger))]
  if (ids.length === 0) return []
  const placeholders = ids.map(() => '?').join(',')
  return getDB().prepare(`
    SELECT
      s.id AS staff_id,
      (SELECT COUNT(*) FROM staff_followups sf
        WHERE sf.staff_id=s.id AND sf.status='open') AS open_followups,
      (SELECT COUNT(*) FROM staff_followups sf
        WHERE sf.staff_id=s.id AND sf.status='open' AND sf.due_at IS NOT NULL
          AND sf.due_at < datetime('now', 'localtime')) AS overdue_followups,
      (SELECT COUNT(*) FROM attendance_exceptions ax
        WHERE ax.staff_id=s.id AND ax.status='open') AS open_attendance_exceptions,
      (SELECT COUNT(*) FROM inventory_checkouts ic
        WHERE ic.staff_id=s.id AND ic.returned_at IS NULL
          AND (ic.quantity-COALESCE(ic.returned_qty,0))>0) AS active_inventory,
      (SELECT COUNT(*) FROM kkd_assignments ka
        WHERE ka.staff_id=s.id AND ka.returned_at IS NULL) AS active_kkd,
      (SELECT COUNT(*) FROM staff_uniform_issues ui
        WHERE ui.staff_id=s.id AND ui.returned_at IS NULL) AS active_uniform,
      s.hire_date AS hire_date,
      s.birth_date AS birth_date,
      (SELECT lb.annual_used FROM leave_balance lb
        WHERE lb.staff_id=s.id AND lb.year=CAST(strftime('%Y','now') AS INTEGER)) AS annual_used,
      (SELECT COUNT(*) FROM training_attendances ta
        WHERE ta.staff_id=s.id AND ta.attended=1 AND ta.cert_expires_at IS NOT NULL
          AND ta.cert_expires_at < date('now', 'localtime')) AS expired_certificates,
      (SELECT COUNT(*) FROM training_attendances ta
        WHERE ta.staff_id=s.id AND ta.attended=1
          AND ta.cert_expires_at BETWEEN date('now', 'localtime')
          AND date('now', 'localtime', '+30 days')) AS expiring_certificates,
      (SELECT COUNT(*) FROM hr_checklists hc
        WHERE hc.staff_id=s.id AND hc.kind='onboarding' AND hc.status='open') AS open_onboarding,
      (SELECT COUNT(*) FROM hr_checklists hc
        WHERE hc.staff_id=s.id AND hc.kind='offboarding' AND hc.status='open') AS open_offboarding,
      (SELECT COUNT(*) FROM documents doc
        WHERE doc.staff_id=s.id AND doc.archived_at IS NULL
          AND doc.expires_on IS NOT NULL
          AND doc.expires_on < date('now', 'localtime')) AS expired_documents,
      (SELECT COUNT(*) FROM documents doc
        WHERE doc.staff_id=s.id AND doc.archived_at IS NULL
          AND doc.expires_on BETWEEN date('now', 'localtime')
          AND date('now', 'localtime', '+30 days')) AS expiring_documents,
      (
        SELECT COUNT(*)
        FROM staff_document_requirements req
        WHERE req.is_active=1
          AND (req.department_id IS NULL OR req.department_id=s.department_id)
          AND (req.role_id IS NULL OR req.role_id=s.role_id)
          AND NOT EXISTS (
            SELECT 1 FROM documents doc
            WHERE doc.staff_id=s.id
              AND doc.document_kind=req.document_kind
              AND doc.archived_at IS NULL
          )
      ) AS missing_documents,
      (SELECT ss.status FROM shift_schedule ss
        WHERE ss.staff_id=s.id AND ss.work_date=date('now', 'localtime')
        ORDER BY ss.id DESC LIMIT 1) AS today_status,
      (SELECT sd.name FROM shift_schedule ss
        LEFT JOIN shift_definitions sd ON sd.id=ss.shift_def_id
        WHERE ss.staff_id=s.id AND ss.work_date=date('now', 'localtime')
        ORDER BY ss.id DESC LIMIT 1) AS today_shift_name,
      (SELECT ss.work_date FROM shift_schedule ss
        WHERE ss.staff_id=s.id AND ss.work_date>date('now', 'localtime')
          AND ss.status NOT IN ('off','on_leave')
        ORDER BY ss.work_date LIMIT 1) AS next_shift_date,
      (SELECT pr.total_score FROM performance_reviews pr
        WHERE pr.staff_id=s.id
        ORDER BY pr.reviewed_at DESC, pr.id DESC LIMIT 1) AS latest_performance_score
    FROM staff s
    WHERE s.id IN (${placeholders})
  `).all(...ids)
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
      wl.is_active as primary_work_location_active,
      pr.name as project_name, pr.code as project_code, pr.color_class as project_color
    FROM staff s
    ${CURRENT_ASSIGNMENT_JOIN}
    LEFT JOIN departments d ON d.id = ${CURRENT_DEPARTMENT_SQL}
    LEFT JOIN staff_roles sr ON sr.id = ${CURRENT_ROLE_SQL}
    LEFT JOIN departments expected_dept ON expected_dept.id = sr.expected_dept_id
    LEFT JOIN work_locations wl ON wl.id = sa.work_location_id
    LEFT JOIN projects pr ON pr.id = s.project_id
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
    'contract_end','address','emergency_contact','emergency_phone','blood_type','gender','salary','iban','notes','is_active','role_label','pickup_point_id',
    'project_id']
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
export function getSchedule(weekStart, weekEnd, deptId, projectId = null) {
  const db = getDB()
  let query = `
    SELECT
      ss.id, ss.work_date, ss.status, ss.row_version, ss.puantaj_code_id, ss.absent_reason,
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
      )) END as leave_type,
      pc.code as puantaj_code, pc.label as puantaj_code_label,
      pc.requires_document, pc.requires_reason,
      s.project_id, pr.name as project_name, pr.code as project_code
    FROM shift_schedule ss
    JOIN staff s ON s.id = ss.staff_id
    LEFT JOIN departments d ON d.id = COALESCE(ss.dept_id, s.department_id)
    LEFT JOIN staff_roles sr ON sr.id = s.role_id
    LEFT JOIN work_locations wl ON wl.id = ss.work_location_id
    LEFT JOIN shift_definitions sd ON sd.id = ss.shift_def_id
    LEFT JOIN puantaj_codes pc ON pc.id = ss.puantaj_code_id
    LEFT JOIN projects pr ON pr.id = s.project_id
    WHERE ss.work_date BETWEEN ? AND ?
  `
  const params = [weekStart, weekEnd]
  if (projectId === 'none') { query += ' AND s.project_id IS NULL' }
  else if (projectId) { query += ' AND s.project_id = ?'; params.push(Number(projectId)) }
  if (deptId) {
    query += ' AND COALESCE(ss.dept_id, s.department_id) = ?'
    params.push(deptId)
  }
  query += ' ORDER BY d.id, s.full_name, ss.work_date'
  const rows = db.prepare(query).all(...params)
  if (rows.length === 0) return rows

  let segmentQuery = `
    SELECT seg.id, seg.schedule_id, seg.sequence_no, seg.shift_def_id,
      seg.role_id, sr.name AS role_name,
      seg.work_location_id, wl.name AS work_location_name,
      wl.color_class AS work_location_color,
      seg.start_time, seg.end_time, seg.break_minutes,
      seg.actual_start, seg.actual_end, seg.note, seg.status,
      sd.name AS shift_name, sd.color_class AS shift_color
    FROM shift_schedule_segments seg
    JOIN shift_schedule ss ON ss.id = seg.schedule_id
    LEFT JOIN shift_definitions sd ON sd.id = seg.shift_def_id
    LEFT JOIN staff_roles sr ON sr.id = seg.role_id
    LEFT JOIN work_locations wl ON wl.id = seg.work_location_id
    WHERE ss.work_date BETWEEN ? AND ?
  `
  const segmentParams = [weekStart, weekEnd]
  if (deptId) {
    segmentQuery += ' AND ss.dept_id = ?'
    segmentParams.push(deptId)
  }
  segmentQuery += ' ORDER BY seg.schedule_id, seg.sequence_no, seg.id'
  const bySchedule = new Map()
  db.prepare(segmentQuery).all(...segmentParams).forEach(segment => {
    if (!bySchedule.has(segment.schedule_id)) bySchedule.set(segment.schedule_id, [])
    bySchedule.get(segment.schedule_id).push(segment)
  })
  return rows.map(row => ({ ...row, segments: bySchedule.get(row.id) || [] }))
}

export function getScheduleEntry(staffId, workDate) {
  return getDB().prepare(`
    SELECT ss.*, s.full_name, s.role_id AS staff_role_id,
      COALESCE(ss.dept_id, s.department_id) AS effective_dept_id
    FROM shift_schedule ss
    JOIN staff s ON s.id = ss.staff_id
    WHERE ss.staff_id = ? AND ss.work_date = ?
  `).get(staffId, workDate)
}

export function getScheduleSegment(id) {
  return getDB().prepare(`
    SELECT seg.*, ss.staff_id, ss.work_date, ss.dept_id,
      s.full_name, sd.name AS shift_name,
      sr.name AS role_name, wl.name AS work_location_name
    FROM shift_schedule_segments seg
    JOIN shift_schedule ss ON ss.id = seg.schedule_id
    JOIN staff s ON s.id = ss.staff_id
    LEFT JOIN shift_definitions sd ON sd.id = seg.shift_def_id
    LEFT JOIN staff_roles sr ON sr.id = seg.role_id
    LEFT JOIN work_locations wl ON wl.id = seg.work_location_id
    WHERE seg.id = ?
  `).get(id)
}

export function listScheduleSegments(scheduleId) {
  return getDB().prepare(`
    SELECT seg.*, sd.name AS shift_name, sd.color_class AS shift_color,
      sr.name AS role_name, wl.name AS work_location_name,
      wl.color_class AS work_location_color
    FROM shift_schedule_segments seg
    LEFT JOIN shift_definitions sd ON sd.id = seg.shift_def_id
    LEFT JOIN staff_roles sr ON sr.id = seg.role_id
    LEFT JOIN work_locations wl ON wl.id = seg.work_location_id
    WHERE seg.schedule_id = ?
    ORDER BY seg.sequence_no, seg.id
  `).all(scheduleId)
}

export function createScheduleSegment(data, createdBy) {
  const db = getDB()
  const next = db.prepare(`
    SELECT COALESCE(MAX(sequence_no), 0) + 1 AS sequence_no
    FROM shift_schedule_segments WHERE schedule_id = ?
  `).get(data.schedule_id).sequence_no
  const id = db.prepare(`
    INSERT INTO shift_schedule_segments(
      schedule_id, sequence_no, shift_def_id, role_id, work_location_id,
      start_time, end_time, break_minutes, actual_start, actual_end, note, status, created_by
    ) VALUES(
      @schedule_id, @sequence_no, @shift_def_id, @role_id, @work_location_id,
      @start_time, @end_time, @break_minutes, @actual_start, @actual_end, @note, @status, @created_by
    )
  `).run({
    schedule_id: data.schedule_id,
    sequence_no: data.sequence_no || next,
    shift_def_id: data.shift_def_id || null,
    role_id: data.role_id || null,
    work_location_id: data.work_location_id || null,
    start_time: data.start_time,
    end_time: data.end_time,
    break_minutes: data.break_minutes || 0,
    actual_start: data.actual_start || null,
    actual_end: data.actual_end || null,
    note: data.note || null,
    status: data.status || 'planned',
    created_by: createdBy || null,
  }).lastInsertRowid
  return getScheduleSegment(id)
}

export function updateScheduleSegment(id, data) {
  const allowed = ['shift_def_id', 'role_id', 'work_location_id', 'start_time', 'end_time', 'break_minutes', 'actual_start', 'actual_end', 'note', 'status', 'sequence_no']
  const sets = []
  const params = []
  allowed.forEach(key => {
    if (data[key] !== undefined) {
      sets.push(`${key} = ?`)
      params.push(data[key] === '' ? null : data[key])
    }
  })
  if (sets.length) {
    sets.push('updated_at = CURRENT_TIMESTAMP')
    params.push(id)
    getDB().prepare(`UPDATE shift_schedule_segments SET ${sets.join(', ')} WHERE id = ?`).run(...params)
  }
  return getScheduleSegment(id)
}

export function deleteScheduleSegment(id) {
  getDB().prepare('DELETE FROM shift_schedule_segments WHERE id = ?').run(id)
}

export function bulkAssignShifts(entries, createdBy) {
  const db = getDB()
  const findExisting = db.prepare('SELECT id, row_version FROM shift_schedule WHERE staff_id=? AND work_date=?')
  const findCode = db.prepare(`
    SELECT id FROM puantaj_codes
    WHERE is_active=1 AND status=?
      AND (? IS NULL OR leave_type=? OR (leave_type IS NULL AND ? IS NULL))
    ORDER BY CASE WHEN leave_type=? THEN 0 ELSE 1 END, is_builtin DESC, sort_order, id
    LIMIT 1
  `)
  const upsert = db.prepare(`
    INSERT INTO shift_schedule(staff_id, dept_id, shift_def_id, work_date, status, leave_type, absent_reason, work_location_id, puantaj_code_id, created_by)
    VALUES(@staff_id, @dept_id, @shift_def_id, @work_date, @status, @leave_type, @absent_reason, @work_location_id, @puantaj_code_id, @created_by)
    ON CONFLICT(staff_id, work_date) DO UPDATE SET
      shift_def_id = excluded.shift_def_id,
      dept_id = excluded.dept_id,
      status = excluded.status,
      leave_type = excluded.leave_type,
      absent_reason = excluded.absent_reason,
      work_location_id = excluded.work_location_id,
      puantaj_code_id = excluded.puantaj_code_id,
      row_version = shift_schedule.row_version + 1
  `)
  const saved = []
  const tx = db.transaction(() => {
    entries.forEach(e => {
      const status = e.status || 'scheduled'
      const leaveType = status === 'on_leave' ? (e.leave_type || e.leaveType || null) : null
      const existing = findExisting.get(e.staff_id, e.work_date)
      if (!existing && e.expected_version != null && Number(e.expected_version) !== 0) {
        throw Object.assign(new Error('Bu hucre silinmis veya baska bir kullanici tarafindan degistirilmis. Guncel veri yeniden yuklendi.'), {
          statusCode: 409,
          details: { conflict: true, staff_id: e.staff_id, work_date: e.work_date, current_version: 0 },
        })
      }
      if (existing && e.expected_version != null && Number(e.expected_version) !== Number(existing.row_version)) {
        throw Object.assign(new Error('Bu hucre baska bir kullanici tarafindan degistirildi. Guncel veri yeniden yuklendi.'), {
          statusCode: 409,
          details: { conflict: true, staff_id: e.staff_id, work_date: e.work_date, current_version: existing.row_version },
        })
      }
      const inferredCode = findCode.get(status, leaveType, leaveType, leaveType, leaveType)
      upsert.run({
        ...e,
        status,
        dept_id: e.dept_id ?? null,
        shift_def_id: e.shift_def_id || null,
        leave_type: leaveType,
        absent_reason: status === 'absent' ? (e.absent_reason || null) : null,
        work_location_id: ['scheduled', 'worked', 'overtime'].includes(status) ? (e.work_location_id || null) : null,
        puantaj_code_id: e.puantaj_code_id || inferredCode?.id || null,
        created_by: createdBy,
      })
      saved.push(db.prepare('SELECT * FROM shift_schedule WHERE staff_id=? AND work_date=?').get(e.staff_id, e.work_date))
    })
  })
  tx()
  return saved
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
  const endInclusive = new Date(endDate.getTime() - 86400000).toISOString().slice(0, 10)

  return db.prepare(`
    SELECT s.id, s.full_name, s.tc_no, s.salary, s.position,
      d.name as dept_name,
      COALESCE(u.worked_days, 0) as worked_days,
      COALESCE(u.absent_days, 0) as absent_days,
      COALESCE(u.leave_days, 0) as leave_days,
      COALESCE(u.paid_leave_units, 0) as paid_leave_units,
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
      COALESCE(u.off_days, 0) as off_days,
      (COALESCE(u.worked_days, 0) + COALESCE(u.off_days, 0) + COALESCE(u.sgk_day_units, 0)) as sgk_days
    FROM staff s
    LEFT JOIN departments d ON d.id = s.department_id
    LEFT JOIN (
      ${puantajUnitsSubquery()}
    ) u ON u.staff_id = s.id
    WHERE s.is_active = 1
    ORDER BY d.name, s.full_name
  `).all(start, end, start, end, start, end, yearMonth, start, endInclusive)
}

// H4 V7 — Bordro export (kişi başı aylık özet) — puantaj kod etkileriyle
export function getPayrollExport(yearMonth) {
  const db = getDB()
  const start = `${yearMonth}-01`
  const endDate = new Date(start)
  endDate.setMonth(endDate.getMonth() + 1)
  const end = endDate.toISOString().slice(0, 10)
  const endInclusive = new Date(endDate.getTime() - 86400000).toISOString().slice(0, 10)

  return db.prepare(`
    SELECT s.id, s.full_name, s.tc_no, s.salary, s.position,
      d.name as dept_name,
      COALESCE(u.worked_days, 0) as worked_days,
      COALESCE(u.absent_days, 0) as absent_days,
      COALESCE(u.leave_days, 0) as leave_days,
      COALESCE(u.paid_leave_units, 0) as paid_leave_units,
      COALESCE(u.off_days, 0) as off_days,
      COALESCE((SELECT SUM(hours) FROM overtime_records
        WHERE staff_id = s.id AND work_date >= ? AND work_date < ?), 0) as overtime_hours,
      COALESCE((SELECT COUNT(*) FROM shift_schedule ss
        JOIN holidays h ON h.date = ss.work_date
        WHERE ss.staff_id = s.id AND ss.status IN ('worked','overtime') AND ss.work_date >= ? AND ss.work_date < ?), 0) as holiday_days,
      (COALESCE(u.worked_days, 0) + COALESCE(u.off_days, 0) + COALESCE(u.sgk_day_units, 0)) as sgk_days
    FROM staff s
    LEFT JOIN departments d ON d.id = s.department_id
    LEFT JOIN (
      ${puantajUnitsSubquery()}
    ) u ON u.staff_id = s.id
    WHERE s.is_active = 1
    ORDER BY d.name, s.full_name
  `).all(start, end, start, end, start, endInclusive)
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
    INSERT INTO leave_requests(staff_id, leave_type, start_date, end_date, total_days, leave_hours, reason, requested_by)
    VALUES(@staff_id, @leave_type, @start_date, @end_date, @total_days, @leave_hours, @reason, @requested_by)
  `).run(data)
  return r.lastInsertRowid
}

export function getLeaveRequest(id) {
  return getDB().prepare('SELECT * FROM leave_requests WHERE id=?').get(id)
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
  const code = db.prepare(`
    SELECT id FROM puantaj_codes
    WHERE status='on_leave' AND is_active=1 AND leave_type=?
    ORDER BY is_builtin DESC, sort_order, id LIMIT 1
  `).get(req.leave_type)
  const upsertLeave = db.prepare(`
    INSERT INTO shift_schedule(staff_id, dept_id, shift_def_id, work_date, status, leave_type, leave_hours, puantaj_code_id, created_by)
    VALUES(?, ?, NULL, ?, 'on_leave', ?, ?, ?, ?)
    ON CONFLICT(staff_id, work_date) DO UPDATE SET
      status='on_leave', leave_type=excluded.leave_type, leave_hours=excluded.leave_hours,
      puantaj_code_id=excluded.puantaj_code_id, row_version=shift_schedule.row_version+1
  `)
  for (let date = req.start_date; date <= req.end_date; date = addDaysStr(date, 1)) {
    upsertLeave.run(req.staff_id, staff?.department_id || null, date, req.leave_type || null, req.leave_hours || null, code?.id || null, approvedBy || null)
  }
}

function clearLeaveFromSchedule(db, req) {
  const restorePlanned = db.prepare(`
    UPDATE shift_schedule
    SET status='scheduled', leave_type=NULL, leave_hours=NULL,
        puantaj_code_id=(SELECT id FROM puantaj_codes WHERE status='scheduled' AND is_active=1 ORDER BY is_builtin DESC, sort_order LIMIT 1),
        row_version=row_version+1
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

export function approveLeaveRequest(id, approvedBy, status, { note = null, expectedVersion = null } = {}) {
  const db = getDB()
  const req = db.prepare('SELECT * FROM leave_requests WHERE id=?').get(id)
  if (!req) throw new Error('İzin talebi bulunamadı')
  if (req.status === status) {
    throw Object.assign(new Error(`İzin talebi zaten '${status}' durumunda.`), {
      statusCode: 409,
      details: { current_status: req.status },
    })
  }
  if (expectedVersion != null && Number(expectedVersion) !== Number(req.version || 1)) {
    throw Object.assign(new Error('Izin talebi baska bir kullanici tarafindan guncellendi.'), {
      statusCode: 409,
      details: { conflict: true, current_version: req.version || 1 },
    })
  }
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
      UPDATE leave_requests
      SET status=?, approved_by=?, approved_at=datetime('now'), review_note=?,
          version=version+1, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(status, approvedBy, note, id)

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
  return db.prepare('SELECT * FROM leave_requests WHERE id=?').get(id)
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
  const rows = db.prepare(query).all(...params)
  if (!rows.length) return rows
  const placeholders = rows.map(() => '?').join(',')
  const docs = db.prepare(`
    SELECT * FROM leave_documents
    WHERE leave_request_id IN (${placeholders})
    ORDER BY created_at, id
  `).all(...rows.map(row => row.id))
  const byRequest = new Map()
  docs.forEach(doc => {
    if (!byRequest.has(doc.leave_request_id)) byRequest.set(doc.leave_request_id, [])
    byRequest.get(doc.leave_request_id).push(doc)
  })
  return rows.map(row => ({
    ...row,
    documents: byRequest.get(row.id) || [],
    document_count: (byRequest.get(row.id) || []).length,
  }))
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

export function addRequestDocuments({ leaveRequestId = null, overtimeRequestId = null, scheduleId = null, files = [], uploadedBy = null }) {
  const db = getDB()
  const insert = db.prepare(`
    INSERT INTO leave_documents(
      leave_request_id, overtime_request_id, schedule_id,
      file_url, file_name, mime_type, file_size, uploaded_by
    ) VALUES(?,?,?,?,?,?,?,?)
  `)
  const ids = []
  db.transaction(() => {
    files.forEach(file => {
      ids.push(insert.run(
        leaveRequestId, overtimeRequestId, scheduleId,
        file.file_url, file.file_name, file.mime_type, file.file_size || null, uploadedBy
      ).lastInsertRowid)
    })
  })()
  return ids
}

export function listRequestDocuments({ leaveRequestId = null, overtimeRequestId = null, scheduleId = null }) {
  const [column, value] = leaveRequestId
    ? ['leave_request_id', leaveRequestId]
    : overtimeRequestId
      ? ['overtime_request_id', overtimeRequestId]
      : ['schedule_id', scheduleId]
  return getDB().prepare(`SELECT * FROM leave_documents WHERE ${column}=? ORDER BY created_at, id`).all(value)
}

export function getRequestDocument(id) {
  return getDB().prepare('SELECT * FROM leave_documents WHERE id=?').get(id)
}

export function deleteRequestDocument(id) {
  return getDB().prepare('DELETE FROM leave_documents WHERE id=?').run(id).changes
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

export function createOvertimeRequest(data) {
  const db = getDB()
  const existing = db.prepare(`
    SELECT id FROM overtime_requests
    WHERE staff_id=? AND work_date=? AND status IN ('pending','approved','returned')
  `).get(data.staff_id, data.work_date)
  if (existing) throw Object.assign(new Error('Bu personel ve tarih icin acik bir mesai talebi var.'), { statusCode: 409 })
  const id = db.prepare(`
    INSERT INTO overtime_requests(
      staff_id, work_date, planned_start, planned_end, actual_start, actual_end,
      requested_hours, actual_hours, reason, compensation_type, requested_by
    ) VALUES(
      @staff_id, @work_date, @planned_start, @planned_end, @actual_start, @actual_end,
      @requested_hours, @actual_hours, @reason, @compensation_type, @requested_by
    )
  `).run(data).lastInsertRowid
  return getOvertimeRequest(id)
}

export function createOvertimeRequestFromAttendanceException(exceptionId, data, userId) {
  const db = getDB()
  const tx = db.transaction(() => {
    const exception = db.prepare('SELECT * FROM attendance_exceptions WHERE id=?').get(exceptionId)
    if (!exception) throw Object.assign(new Error('Istisna kaydi bulunamadi'), { statusCode: 404 })
    if (exception.exception_type !== 'overtime_candidate') {
      throw Object.assign(new Error('Yalnizca mesai adayi kaydi talebe donusturulebilir'), { statusCode: 400 })
    }
    if (exception.status !== 'open' || exception.overtime_request_id) {
      throw Object.assign(new Error('Mesai adayi daha once islenmis'), { statusCode: 409 })
    }

    const existing = db.prepare(`
      SELECT id FROM overtime_requests
      WHERE staff_id=? AND work_date=? AND status IN ('pending','approved','returned')
    `).get(data.staff_id, data.work_date)
    if (existing) {
      throw Object.assign(new Error('Bu personel ve tarih icin acik bir mesai talebi var.'), { statusCode: 409 })
    }

    const requestId = db.prepare(`
      INSERT INTO overtime_requests(
        staff_id, work_date, planned_start, planned_end, actual_start, actual_end,
        requested_hours, actual_hours, reason, compensation_type, requested_by
      ) VALUES(
        @staff_id, @work_date, @planned_start, @planned_end, @actual_start, @actual_end,
        @requested_hours, @actual_hours, @reason, @compensation_type, @requested_by
      )
    `).run(data).lastInsertRowid

    const updated = db.prepare(`
      UPDATE attendance_exceptions
      SET status='resolved', overtime_request_id=?, resolved_by=?, resolved_at=CURRENT_TIMESTAMP,
        resolution_note=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND status='open' AND overtime_request_id IS NULL
    `).run(requestId, userId || null, `Mesai talebi #${requestId} olusturuldu`, exceptionId)
    if (updated.changes !== 1) {
      throw Object.assign(new Error('Mesai adayi baska bir kullanici tarafindan islendi'), { statusCode: 409 })
    }
    return requestId
  })

  const requestId = tx()
  return {
    request: getOvertimeRequest(requestId),
    exception: getAttendanceException(exceptionId),
  }
}

export function getOvertimeRequest(id) {
  return getDB().prepare(`
    SELECT otr.*, s.full_name, s.gender, s.position,
      d.name as dept_name, d.color_class as dept_color,
      reviewer.full_name as reviewer_name
    FROM overtime_requests otr
    JOIN staff s ON s.id=otr.staff_id
    LEFT JOIN departments d ON d.id=s.department_id
    LEFT JOIN users reviewer ON reviewer.id=otr.reviewed_by
    WHERE otr.id=?
  `).get(id)
}

export function getOvertimeRequests(filters = {}) {
  const db = getDB()
  let sql = `
    SELECT otr.*, s.full_name, s.gender, s.position,
      d.name as dept_name, d.color_class as dept_color,
      reviewer.full_name as reviewer_name
    FROM overtime_requests otr
    JOIN staff s ON s.id=otr.staff_id
    LEFT JOIN departments d ON d.id=s.department_id
    LEFT JOIN users reviewer ON reviewer.id=otr.reviewed_by
    WHERE 1=1
  `
  const params = []
  if (filters.status) { sql += ' AND otr.status=?'; params.push(filters.status) }
  if (filters.month) { sql += " AND strftime('%Y-%m', otr.work_date)=?"; params.push(filters.month) }
  if (filters.staff_id) { sql += ' AND otr.staff_id=?'; params.push(filters.staff_id) }
  if (filters.dept_id) { sql += ' AND s.department_id=?'; params.push(filters.dept_id) }
  sql += ' ORDER BY otr.work_date DESC, otr.id DESC LIMIT 300'
  const rows = db.prepare(sql).all(...params)
  if (!rows.length) return rows
  const placeholders = rows.map(() => '?').join(',')
  const docs = db.prepare(`
    SELECT * FROM leave_documents WHERE overtime_request_id IN (${placeholders}) ORDER BY created_at, id
  `).all(...rows.map(row => row.id))
  const byRequest = new Map()
  docs.forEach(doc => {
    if (!byRequest.has(doc.overtime_request_id)) byRequest.set(doc.overtime_request_id, [])
    byRequest.get(doc.overtime_request_id).push(doc)
  })
  return rows.map(row => ({
    ...row,
    documents: byRequest.get(row.id) || [],
    document_count: (byRequest.get(row.id) || []).length,
  }))
}

export function reviewOvertimeRequest(id, data, reviewedBy) {
  const db = getDB()
  const request = db.prepare('SELECT * FROM overtime_requests WHERE id=?').get(id)
  if (!request) throw Object.assign(new Error('Mesai talebi bulunamadi.'), { statusCode: 404 })
  if (request.status === data.status) {
    throw Object.assign(new Error(`Mesai talebi zaten '${data.status}' durumunda.`), {
      statusCode: 409,
      details: { current_status: request.status },
    })
  }
  if (data.expected_version != null && Number(data.expected_version) !== Number(request.version)) {
    throw Object.assign(new Error('Mesai talebi baska bir kullanici tarafindan guncellendi.'), {
      statusCode: 409,
      details: { conflict: true, current_version: request.version },
    })
  }
  const actualHours = data.actual_hours == null ? (request.actual_hours ?? request.requested_hours) : Number(data.actual_hours)
  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE overtime_requests
      SET status=?, actual_start=COALESCE(?,actual_start), actual_end=COALESCE(?,actual_end),
          actual_hours=?, review_note=?, reviewed_by=?, reviewed_at=CURRENT_TIMESTAMP,
          version=version+1, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(data.status, data.actual_start || null, data.actual_end || null, actualHours, data.review_note || null, reviewedBy || null, id)

    if (data.status === 'approved' && request.compensation_type === 'pay' && actualHours > 0) {
      const existingRecord = db.prepare('SELECT id FROM overtime_records WHERE overtime_request_id=?').get(id)
      if (existingRecord) {
        db.prepare('UPDATE overtime_records SET hours=?, reason=?, approved_by=? WHERE id=?')
          .run(actualHours, request.reason, reviewedBy || null, existingRecord.id)
      } else {
        db.prepare(`
          INSERT INTO overtime_records(staff_id, work_date, hours, reason, approved_by, overtime_request_id)
          VALUES(?,?,?,?,?,?)
        `).run(request.staff_id, request.work_date, actualHours, request.reason, reviewedBy || null, id)
      }
    } else {
      db.prepare('DELETE FROM overtime_records WHERE overtime_request_id=?').run(id)
    }
  })
  tx()
  return getOvertimeRequest(id)
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

// O gün kart sistemi kullanılmış mı? Uzlaştırma planı kart gerçeğiyle
// karşılaştırır; hiç okutma yoksa gün gözlemsizdir ve kimse hakkında
// "okutmadı" sonucuna varılamaz. Gün başına tek sorgu (kişi başına değil).
export function dayHasAttendanceEvents(workDate) {
  return !!getDB()
    .prepare('SELECT 1 FROM attendance_events WHERE work_date = ? LIMIT 1')
    .get(workDate)
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
  return getDB().prepare(`
    SELECT ax.*, adr.planned_start, adr.planned_end,
      adr.actual_check_in, adr.actual_check_out, adr.overtime_candidate_minutes
    FROM attendance_exceptions ax
    LEFT JOIN attendance_daily_reconciliations adr ON adr.id=ax.reconciliation_id
    WHERE ax.id=?
  `).get(id)
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
// Daily operations workspace: keep the raw operational read model in one place so
// the screen, alerts and exports all use the same attendance/schedule facts.
export function getOperationsDashboardData({ date, monthStart, monthEnd, deptId = null }) {
  const db = getDB()
  const deptSql = deptId ? ' AND COALESCE(ss.dept_id, s.department_id) = ?' : ''

  const roster = db.prepare(`
    WITH segment_summary AS (
      SELECT seg.schedule_id,
        MIN(seg.start_time) AS segment_start,
        MAX(seg.end_time) AS segment_end,
        GROUP_CONCAT(DISTINCT sr.name) AS segment_roles,
        GROUP_CONCAT(DISTINCT wl.name) AS segment_locations
      FROM shift_schedule_segments seg
      LEFT JOIN staff_roles sr ON sr.id = seg.role_id
      LEFT JOIN work_locations wl ON wl.id = seg.work_location_id
      WHERE seg.status != 'cancelled'
      GROUP BY seg.schedule_id
    ), event_summary AS (
      SELECT staff_id, work_date, COUNT(*) AS event_count,
        MIN(occurred_at) AS first_event_at, MAX(occurred_at) AS last_event_at
      FROM attendance_events
      WHERE work_date = ? AND staff_id IS NOT NULL
      GROUP BY staff_id, work_date
    ), exception_summary AS (
      SELECT staff_id, work_date, COUNT(*) AS open_exception_count,
        SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) AS critical_exception_count
      FROM attendance_exceptions
      WHERE work_date = ? AND status = 'open' AND staff_id IS NOT NULL
      GROUP BY staff_id, work_date
    ), latest_reconciliation AS (
      SELECT adr.*
      FROM attendance_daily_reconciliations adr
      JOIN (
        SELECT staff_id, work_date, MAX(id) AS id
        FROM attendance_daily_reconciliations
        WHERE work_date = ?
        GROUP BY staff_id, work_date
      ) latest ON latest.id = adr.id
    ), overtime_summary AS (
      SELECT staff_id, work_date, SUM(hours) AS overtime_hours
      FROM overtime_records
      WHERE work_date = ?
      GROUP BY staff_id, work_date
    )
    SELECT ss.id AS schedule_id, ss.staff_id, s.full_name, s.position,
      COALESCE(ss.dept_id, s.department_id) AS dept_id,
      d.name AS dept_name, d.color_class AS dept_color,
      s.role_id, COALESCE(seg.segment_roles, sr.name) AS role_name,
      ss.work_location_id,
      COALESCE(seg.segment_locations, wl.name) AS work_location_name,
      ss.shift_def_id, sd.name AS shift_name, sd.start_hour, sd.end_hour,
      seg.segment_start, seg.segment_end,
      ss.status, ss.leave_type, ss.leave_hours, ss.absent_reason,
      COALESCE(ev.event_count, 0) AS event_count,
      ev.first_event_at, ev.last_event_at,
      rec.result_status AS reconciliation_status,
      rec.reason_code AS reconciliation_reason,
      rec.actual_check_in, rec.actual_check_out, rec.worked_minutes,
      COALESCE(rec.overtime_candidate_minutes, 0) AS overtime_candidate_minutes,
      COALESCE(ex.open_exception_count, 0) AS open_exception_count,
      COALESCE(ex.critical_exception_count, 0) AS critical_exception_count,
      COALESCE(ot.overtime_hours, 0) AS overtime_hours
    FROM shift_schedule ss
    JOIN staff s ON s.id = ss.staff_id
    LEFT JOIN departments d ON d.id = COALESCE(ss.dept_id, s.department_id)
    LEFT JOIN staff_roles sr ON sr.id = s.role_id
    LEFT JOIN work_locations wl ON wl.id = ss.work_location_id
    LEFT JOIN shift_definitions sd ON sd.id = ss.shift_def_id
    LEFT JOIN segment_summary seg ON seg.schedule_id = ss.id
    LEFT JOIN event_summary ev ON ev.staff_id = ss.staff_id AND ev.work_date = ss.work_date
    LEFT JOIN exception_summary ex ON ex.staff_id = ss.staff_id AND ex.work_date = ss.work_date
    LEFT JOIN latest_reconciliation rec ON rec.staff_id = ss.staff_id AND rec.work_date = ss.work_date
    LEFT JOIN overtime_summary ot ON ot.staff_id = ss.staff_id AND ot.work_date = ss.work_date
    WHERE ss.work_date = ?${deptSql}
    ORDER BY COALESCE(sd.start_hour, 99), d.name, s.full_name
  `).all(date, date, date, date, date, ...(deptId ? [deptId] : []))

  const unassignedParams = [date, date, date, date]
  let unassignedDeptSql = ''
  if (deptId) {
    unassignedDeptSql = ' AND COALESCE(sa.department_id, s.department_id) = ?'
    unassignedParams.push(deptId)
  }
  const unassignedStaff = db.prepare(`
    WITH event_summary AS (
      SELECT staff_id, COUNT(*) AS event_count,
        MIN(occurred_at) AS first_event_at, MAX(occurred_at) AS last_event_at
      FROM attendance_events
      WHERE work_date = ? AND staff_id IS NOT NULL
      GROUP BY staff_id
    )
    SELECT s.id AS staff_id, s.full_name, s.position,
      COALESCE(sa.department_id, s.department_id) AS dept_id,
      d.name AS dept_name, d.color_class AS dept_color,
      COALESCE(sa.role_id, s.role_id) AS role_id, sr.name AS role_name,
      sa.work_location_id, wl.name AS work_location_name,
      COALESCE(ev.event_count, 0) AS event_count,
      ev.first_event_at, ev.last_event_at
    FROM staff s
    LEFT JOIN staff_assignments sa ON sa.id = (
      SELECT sa2.id
      FROM staff_assignments sa2
      WHERE sa2.staff_id = s.id
        AND sa2.effective_from <= ?
        AND (sa2.effective_to IS NULL OR sa2.effective_to >= ?)
      ORDER BY sa2.effective_from DESC, sa2.id DESC
      LIMIT 1
    )
    LEFT JOIN departments d ON d.id = COALESCE(sa.department_id, s.department_id)
    LEFT JOIN staff_roles sr ON sr.id = COALESCE(sa.role_id, s.role_id)
    LEFT JOIN work_locations wl ON wl.id = sa.work_location_id
    LEFT JOIN event_summary ev ON ev.staff_id = s.id
    WHERE s.is_active = 1
      AND NOT EXISTS (
        SELECT 1 FROM shift_schedule ss
        WHERE ss.staff_id = s.id AND ss.work_date = ?
      )${unassignedDeptSql}
    ORDER BY CASE WHEN COALESCE(ev.event_count, 0) > 0 THEN 0 ELSE 1 END,
      d.name, s.full_name
  `).all(...unassignedParams)

  const unplannedEventParams = [date, date]
  let unplannedEventDeptSql = ''
  if (deptId) {
    unplannedEventDeptSql = ' AND s.department_id = ?'
    unplannedEventParams.push(deptId)
  }
  const unplannedEvents = db.prepare(`
    SELECT ae.id, ae.staff_id, ae.event_type, ae.occurred_at, ae.source,
      ae.device_id, ae.match_status, ae.match_detail,
      s.full_name, s.department_id AS dept_id, d.name AS dept_name,
      c.code AS card_code
    FROM attendance_events ae
    LEFT JOIN staff s ON s.id = ae.staff_id
    LEFT JOIN departments d ON d.id = s.department_id
    LEFT JOIN cards c ON c.id = ae.card_id
    WHERE ae.work_date = ?
      AND (ae.staff_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM shift_schedule ss
        WHERE ss.staff_id = ae.staff_id AND ss.work_date = ?
      ))${unplannedEventDeptSql}
    ORDER BY ae.occurred_at, ae.id
  `).all(...unplannedEventParams)

  const trendParams = [monthStart, monthEnd]
  let trendDeptSql = ''
  if (deptId) {
    trendDeptSql = ' AND COALESCE(ss.dept_id, s.department_id) = ?'
    trendParams.push(deptId)
  }
  const trends = db.prepare(`
    WITH schedule_counts AS (
      SELECT ss.work_date,
        COUNT(DISTINCT CASE WHEN ss.status IN ('scheduled','worked','overtime') THEN ss.staff_id END) AS scheduled,
        COUNT(DISTINCT CASE WHEN ss.status IN ('worked','overtime') THEN ss.staff_id END) AS worked,
        COUNT(DISTINCT CASE WHEN ss.status = 'on_leave' THEN ss.staff_id END) AS on_leave,
        COUNT(DISTINCT CASE WHEN ss.status = 'absent' THEN ss.staff_id END) AS absent,
        COUNT(DISTINCT CASE WHEN ss.status = 'off' THEN ss.staff_id END) AS off
      FROM shift_schedule ss
      JOIN staff s ON s.id = ss.staff_id
      WHERE ss.work_date BETWEEN ? AND ?${trendDeptSql}
      GROUP BY ss.work_date
    )
    SELECT sc.work_date AS date, sc.scheduled, sc.worked, sc.on_leave, sc.absent, sc.off,
      COALESCE((SELECT SUM(ot.hours) FROM overtime_records ot JOIN staff os ON os.id=ot.staff_id
        WHERE ot.work_date=sc.work_date${deptId ? ' AND os.department_id = ?' : ''}), 0) AS overtime_hours,
      COALESCE((SELECT COUNT(*) FROM attendance_exceptions ax LEFT JOIN staff es ON es.id=ax.staff_id
        WHERE ax.work_date=sc.work_date AND ax.status='open'${deptId ? ' AND es.department_id = ?' : ''}), 0) AS open_exceptions
    FROM schedule_counts sc
    ORDER BY sc.work_date
  `).all(...trendParams, ...(deptId ? [deptId, deptId] : []))

  const breakdownParams = [monthStart, monthEnd]
  let breakdownDeptSql = ''
  if (deptId) {
    breakdownDeptSql = ' AND COALESCE(ss.dept_id, s.department_id) = ?'
    breakdownParams.push(deptId)
  }
  const breakdowns = db.prepare(`
    WITH assignments AS (
      SELECT DISTINCT ss.staff_id, ss.work_date, ss.status,
        COALESCE(ss.dept_id, s.department_id) AS dept_id,
        d.name AS dept_name,
        COALESCE(seg.role_id, s.role_id) AS role_id,
        COALESCE(seg_role.name, staff_role.name) AS role_name,
        COALESCE(seg.work_location_id, ss.work_location_id) AS location_id,
        COALESCE(seg_location.name, schedule_location.name) AS location_name
      FROM shift_schedule ss
      JOIN staff s ON s.id = ss.staff_id
      LEFT JOIN shift_schedule_segments seg ON seg.schedule_id = ss.id AND seg.status != 'cancelled'
      LEFT JOIN departments d ON d.id = COALESCE(ss.dept_id, s.department_id)
      LEFT JOIN staff_roles staff_role ON staff_role.id = s.role_id
      LEFT JOIN staff_roles seg_role ON seg_role.id = seg.role_id
      LEFT JOIN work_locations schedule_location ON schedule_location.id = ss.work_location_id
      LEFT JOIN work_locations seg_location ON seg_location.id = seg.work_location_id
      WHERE ss.work_date BETWEEN ? AND ?${breakdownDeptSql}
    ), dimensions AS (
      SELECT 'department' AS dimension, dept_id AS dimension_id,
        COALESCE(dept_name, 'Departmansiz') AS name, staff_id, work_date, status
      FROM assignments
      UNION ALL
      SELECT 'role', role_id, COALESCE(role_name, 'Rolsuz'), staff_id, work_date, status FROM assignments
      UNION ALL
      SELECT 'location', location_id, COALESCE(location_name, 'Nokta tanimsiz'), staff_id, work_date, status FROM assignments
    )
    SELECT dimension, dimension_id, name,
      COUNT(DISTINCT staff_id) AS staff_count,
      COUNT(DISTINCT staff_id || ':' || work_date) AS person_days,
      COUNT(DISTINCT CASE WHEN status IN ('worked','overtime') THEN staff_id || ':' || work_date END) AS worked_days,
      COUNT(DISTINCT CASE WHEN status = 'scheduled' THEN staff_id || ':' || work_date END) AS planned_days,
      COUNT(DISTINCT CASE WHEN status = 'on_leave' THEN staff_id || ':' || work_date END) AS leave_days,
      COUNT(DISTINCT CASE WHEN status = 'absent' THEN staff_id || ':' || work_date END) AS absent_days
    FROM dimensions
    GROUP BY dimension, dimension_id, name
    ORDER BY dimension, person_days DESC, name
  `).all(...breakdownParams)

  const streakParams = [monthStart, monthEnd]
  let streakDeptSql = ''
  if (deptId) {
    streakDeptSql = ' AND COALESCE(ss.dept_id, s.department_id) = ?'
    streakParams.push(deptId)
  }
  const streakRows = db.prepare(`
    SELECT ss.staff_id, s.full_name, ss.work_date, ss.status,
      COALESCE(ss.dept_id, s.department_id) AS dept_id, d.name AS dept_name
    FROM shift_schedule ss
    JOIN staff s ON s.id=ss.staff_id
    LEFT JOIN departments d ON d.id=COALESCE(ss.dept_id, s.department_id)
    WHERE ss.work_date BETWEEN ? AND ?
      AND ss.status IN ('scheduled','worked','overtime')${streakDeptSql}
    ORDER BY ss.staff_id, ss.work_date
  `).all(...streakParams)

  const pendingLeaves = getLeaveRequests({ status: 'pending', ...(deptId ? { dept_id: deptId } : {}) })
  const pendingOvertime = getOvertimeRequests({ status: 'pending', ...(deptId ? { dept_id: deptId } : {}) })
  const endingLeaveParams = [date, date]
  let endingLeaveDeptSql = ''
  if (deptId) {
    endingLeaveDeptSql = ' AND s.department_id = ?'
    endingLeaveParams.push(deptId)
  }
  const endingLeaves = db.prepare(`
    SELECT lr.id, lr.staff_id, s.full_name, s.department_id AS dept_id,
      d.name AS dept_name, lr.leave_type, lr.end_date, lr.reason
    FROM leave_requests lr
    JOIN staff s ON s.id=lr.staff_id
    LEFT JOIN departments d ON d.id=s.department_id
    WHERE lr.status='approved' AND lr.leave_type='sick'
      AND lr.end_date BETWEEN ? AND date(?, '+7 day')${endingLeaveDeptSql}
    ORDER BY lr.end_date, s.full_name
  `).all(...endingLeaveParams)

  const balanceParams = [Number(monthStart.slice(0, 4))]
  let balanceDeptSql = ''
  if (deptId) {
    balanceDeptSql = ' AND s.department_id = ?'
    balanceParams.push(deptId)
  }
  const lowLeaveBalances = db.prepare(`
    SELECT s.id AS staff_id, s.full_name, s.department_id AS dept_id,
      d.name AS dept_name, COALESCE(lb.annual_total, 15) AS annual_total,
      COALESCE(lb.annual_used, 0) AS annual_used,
      COALESCE(lb.annual_total, 15) - COALESCE(lb.annual_used, 0) AS remaining
    FROM staff s
    LEFT JOIN departments d ON d.id=s.department_id
    LEFT JOIN leave_balance lb ON lb.staff_id=s.id AND lb.year=?
    WHERE s.is_active=1${balanceDeptSql}
      AND COALESCE(lb.annual_total, 15) - COALESCE(lb.annual_used, 0) <= 3
    ORDER BY remaining, s.full_name
  `).all(...balanceParams)

  const activeStaffParams = [date, date]
  let activeStaffSql = ''
  if (deptId) { activeStaffSql = ' AND COALESCE(sa.department_id, s.department_id)=?'; activeStaffParams.push(deptId) }
  const activeStaff = db.prepare(`
    SELECT COUNT(*) AS count
    FROM staff s
    LEFT JOIN staff_assignments sa ON sa.id = (
      SELECT sa2.id
      FROM staff_assignments sa2
      WHERE sa2.staff_id = s.id
        AND sa2.effective_from <= ?
        AND (sa2.effective_to IS NULL OR sa2.effective_to >= ?)
      ORDER BY sa2.effective_from DESC, sa2.id DESC
      LIMIT 1
    )
    WHERE s.is_active=1${activeStaffSql}
  `).get(...activeStaffParams).count

  return {
    roster,
    unassignedStaff,
    unplannedEvents,
    trends,
    breakdowns,
    streakRows,
    pendingLeaves,
    pendingOvertime,
    endingLeaves,
    lowLeaveBalances,
    activeStaff,
  }
}

export function getPuantajClosingPackageData({ monthStart, monthEnd, deptId = null }) {
  const db = getDB()
  const leavesParams = [monthEnd, monthStart]
  let leavesDeptSql = ''
  if (deptId) { leavesDeptSql = ' AND s.department_id=?'; leavesParams.push(deptId) }
  const leaveRequests = db.prepare(`
    SELECT lr.*, s.full_name, s.tc_no, s.department_id AS dept_id, d.name AS dept_name,
      reviewer.full_name AS reviewer_name,
      (SELECT COUNT(*) FROM leave_documents ld WHERE ld.leave_request_id=lr.id) AS document_count
    FROM leave_requests lr
    JOIN staff s ON s.id=lr.staff_id
    LEFT JOIN departments d ON d.id=s.department_id
    LEFT JOIN users reviewer ON reviewer.id=lr.approved_by
    WHERE lr.start_date<=? AND lr.end_date>=?${leavesDeptSql}
    ORDER BY lr.start_date, s.full_name
  `).all(...leavesParams)

  const overtimeParams = [monthStart, monthEnd]
  let overtimeDeptSql = ''
  if (deptId) { overtimeDeptSql = ' AND s.department_id=?'; overtimeParams.push(deptId) }
  const overtimeRequests = db.prepare(`
    SELECT otr.*, s.full_name, s.tc_no, s.department_id AS dept_id, d.name AS dept_name,
      reviewer.full_name AS reviewer_name,
      (SELECT COUNT(*) FROM leave_documents ld WHERE ld.overtime_request_id=otr.id) AS document_count
    FROM overtime_requests otr
    JOIN staff s ON s.id=otr.staff_id
    LEFT JOIN departments d ON d.id=s.department_id
    LEFT JOIN users reviewer ON reviewer.id=otr.reviewed_by
    WHERE otr.work_date BETWEEN ? AND ?${overtimeDeptSql}
    ORDER BY otr.work_date, s.full_name
  `).all(...overtimeParams)

  const eventParams = [monthStart, monthEnd]
  let eventDeptSql = ''
  if (deptId) { eventDeptSql = ' AND s.department_id=?'; eventParams.push(deptId) }
  const attendanceEvents = db.prepare(`
    SELECT ae.id, ae.work_date, ae.occurred_at, ae.event_type, ae.source, ae.device_id,
      ae.match_status, ae.match_detail, ae.staff_id, s.full_name,
      s.department_id AS dept_id, d.name AS dept_name, c.code AS card_code
    FROM attendance_events ae
    LEFT JOIN staff s ON s.id=ae.staff_id
    LEFT JOIN departments d ON d.id=s.department_id
    LEFT JOIN cards c ON c.id=ae.card_id
    WHERE ae.work_date BETWEEN ? AND ?${eventDeptSql}
    ORDER BY ae.occurred_at, ae.id
  `).all(...eventParams)

  const exceptionParams = [monthStart, monthEnd]
  let exceptionDeptSql = ''
  if (deptId) { exceptionDeptSql = ' AND s.department_id=?'; exceptionParams.push(deptId) }
  const attendanceExceptions = db.prepare(`
    SELECT ax.*, s.full_name, s.department_id AS dept_id, d.name AS dept_name,
      resolver.full_name AS resolved_by_name
    FROM attendance_exceptions ax
    LEFT JOIN staff s ON s.id=ax.staff_id
    LEFT JOIN departments d ON d.id=s.department_id
    LEFT JOIN users resolver ON resolver.id=ax.resolved_by
    WHERE ax.work_date BETWEEN ? AND ?${exceptionDeptSql}
    ORDER BY ax.work_date, ax.id
  `).all(...exceptionParams)

  const documentParams = [monthEnd, monthStart, monthStart, monthEnd, monthStart, monthEnd]
  let documentDeptSql = ''
  if (deptId) {
    documentDeptSql = ' AND COALESCE(ls.department_id, os.department_id, ss_staff.department_id)=?'
    documentParams.push(deptId)
  }
  const documents = db.prepare(`
    SELECT ld.id, ld.file_name, ld.mime_type, ld.file_size, ld.file_url, ld.created_at,
      ld.leave_request_id, ld.overtime_request_id, ld.schedule_id,
      CASE WHEN ld.leave_request_id IS NOT NULL THEN 'leave'
        WHEN ld.overtime_request_id IS NOT NULL THEN 'overtime' ELSE 'schedule' END AS request_type,
      COALESCE(lr.staff_id, otr.staff_id, ss.staff_id) AS staff_id,
      COALESCE(ls.full_name, os.full_name, ss_staff.full_name) AS full_name,
      COALESCE(ld.leave_request_id, ld.overtime_request_id, ld.schedule_id) AS request_id,
      COALESCE(lr.start_date, otr.work_date, ss.work_date) AS start_date,
      COALESCE(lr.end_date, otr.work_date, ss.work_date) AS end_date,
      COALESCE(ld_leave.name, ld_ot.name, ld_ss.name) AS dept_name
    FROM leave_documents ld
    LEFT JOIN leave_requests lr ON lr.id=ld.leave_request_id
    LEFT JOIN overtime_requests otr ON otr.id=ld.overtime_request_id
    LEFT JOIN shift_schedule ss ON ss.id=ld.schedule_id
    LEFT JOIN staff ls ON ls.id=lr.staff_id
    LEFT JOIN staff os ON os.id=otr.staff_id
    LEFT JOIN staff ss_staff ON ss_staff.id=ss.staff_id
    LEFT JOIN departments ld_leave ON ld_leave.id=ls.department_id
    LEFT JOIN departments ld_ot ON ld_ot.id=os.department_id
    LEFT JOIN departments ld_ss ON ld_ss.id=ss_staff.department_id
    WHERE ((lr.start_date<=? AND lr.end_date>=?)
      OR otr.work_date BETWEEN ? AND ?
      OR ss.work_date BETWEEN ? AND ?)${documentDeptSql}
    ORDER BY ld.created_at, ld.id
  `).all(...documentParams)

  return {
    leaveRequests,
    overtimeRequests,
    attendanceEvents,
    attendanceExceptions,
    documents,
  }
}

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
  const rules = getCoverageRules({ includeInactive: false })
  const assignments = db.prepare(`
    SELECT ss.staff_id, ss.work_date,
      COALESCE(ss.dept_id, s.department_id) AS dept_id,
      COALESCE(seg.role_id, s.role_id) AS role_id,
      COALESCE(seg.work_location_id, ss.work_location_id) AS work_location_id,
      COALESCE(seg.shift_def_id, ss.shift_def_id) AS shift_def_id,
      seg.start_time, seg.end_time
    FROM shift_schedule_segments seg
    JOIN shift_schedule ss ON ss.id = seg.schedule_id
    JOIN staff s ON s.id = ss.staff_id
    WHERE ss.work_date BETWEEN ? AND ?
      AND ss.status IN ('scheduled','worked','overtime')
      AND seg.status != 'cancelled'
    UNION ALL
    SELECT ss.staff_id, ss.work_date,
      COALESCE(ss.dept_id, s.department_id) AS dept_id,
      s.role_id, ss.work_location_id, ss.shift_def_id,
      printf('%02d:00', sd.start_hour) AS start_time,
      printf('%02d:00', sd.end_hour) AS end_time
    FROM shift_schedule ss
    JOIN staff s ON s.id = ss.staff_id
    LEFT JOIN shift_definitions sd ON sd.id = ss.shift_def_id
    WHERE ss.work_date BETWEEN ? AND ?
      AND ss.status IN ('scheduled','worked','overtime')
      AND NOT EXISTS (
        SELECT 1 FROM shift_schedule_segments seg WHERE seg.schedule_id = ss.id AND seg.status != 'cancelled'
      )
  `).all(from, to, from, to)
  const ruleCounts = buildCoverageRuleCounts(rules, assignments, from, to)
  return { shifts, counts, rules, rule_counts: ruleCounts }
}

function timeParts(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''))
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  return hour * 60 + minute
}

function timeRanges(start, end) {
  const startMin = timeParts(start)
  const endMin = timeParts(end)
  if (startMin == null || endMin == null || startMin === endMin) return []
  if (endMin > startMin) return [[startMin, endMin]]
  return [[startMin, 1440], [0, endMin]]
}

function rangesOverlap(leftStart, leftEnd, rightStart, rightEnd) {
  const left = timeRanges(leftStart, leftEnd)
  const right = timeRanges(rightStart, rightEnd)
  return left.some(a => right.some(b => a[0] < b[1] && b[0] < a[1]))
}

function isoDay(date) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  return day === 0 ? 7 : day
}

function dateRange(from, to) {
  const dates = []
  const cursor = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}

function buildCoverageRuleCounts(rules, assignments, from, to) {
  const result = []
  for (const rule of rules) {
    const activeDays = new Set(String(rule.days_of_week || '').split(',').map(Number))
    for (const workDate of dateRange(from, to)) {
      if (!activeDays.has(isoDay(workDate))) continue
      const staffIds = new Set(assignments.filter(item => (
        item.work_date === workDate
        && (!rule.dept_id || Number(item.dept_id) === Number(rule.dept_id))
        && (!rule.role_id || Number(item.role_id) === Number(rule.role_id))
        && (!rule.work_location_id || Number(item.work_location_id) === Number(rule.work_location_id))
        && (!rule.shift_def_id || Number(item.shift_def_id) === Number(rule.shift_def_id))
        && rangesOverlap(rule.start_time, rule.end_time, item.start_time, item.end_time)
      )).map(item => item.staff_id))
      result.push({
        rule_id: rule.id,
        work_date: workDate,
        assigned: staffIds.size,
        min_staff: rule.min_staff,
        missing: Math.max(0, rule.min_staff - staffIds.size),
      })
    }
  }
  return result
}

export function getCoverageRules({ includeInactive = false } = {}) {
  let query = `
    SELECT cr.*, d.name AS dept_name, sr.name AS role_name,
      wl.name AS work_location_name, sd.name AS shift_name
    FROM shift_coverage_rules cr
    LEFT JOIN departments d ON d.id = cr.dept_id
    LEFT JOIN staff_roles sr ON sr.id = cr.role_id
    LEFT JOIN work_locations wl ON wl.id = cr.work_location_id
    LEFT JOIN shift_definitions sd ON sd.id = cr.shift_def_id
  `
  if (!includeInactive) query += ' WHERE cr.is_active = 1'
  query += ' ORDER BY cr.is_active DESC, cr.name COLLATE NOCASE, cr.id'
  return getDB().prepare(query).all()
}

export function createCoverageRule(data, createdBy) {
  const id = getDB().prepare(`
    INSERT INTO shift_coverage_rules(
      name, dept_id, role_id, work_location_id, shift_def_id,
      start_time, end_time, min_staff, days_of_week, is_active, created_by
    ) VALUES(
      @name, @dept_id, @role_id, @work_location_id, @shift_def_id,
      @start_time, @end_time, @min_staff, @days_of_week, @is_active, @created_by
    )
  `).run({
    name: data.name,
    dept_id: data.dept_id || null,
    role_id: data.role_id || null,
    work_location_id: data.work_location_id || null,
    shift_def_id: data.shift_def_id || null,
    start_time: data.start_time,
    end_time: data.end_time,
    min_staff: data.min_staff,
    days_of_week: data.days_of_week,
    is_active: data.is_active === false || data.is_active === 0 ? 0 : 1,
    created_by: createdBy || null,
  }).lastInsertRowid
  return getDB().prepare('SELECT * FROM shift_coverage_rules WHERE id = ?').get(id)
}

export function updateCoverageRule(id, data) {
  const allowed = ['name', 'dept_id', 'role_id', 'work_location_id', 'shift_def_id', 'start_time', 'end_time', 'min_staff', 'days_of_week', 'is_active']
  const sets = []
  const params = []
  allowed.forEach(key => {
    if (data[key] !== undefined) {
      sets.push(`${key} = ?`)
      params.push(data[key] === '' ? null : data[key])
    }
  })
  if (sets.length) {
    sets.push('updated_at = CURRENT_TIMESTAMP')
    params.push(id)
    getDB().prepare(`UPDATE shift_coverage_rules SET ${sets.join(', ')} WHERE id = ?`).run(...params)
  }
  return getDB().prepare('SELECT * FROM shift_coverage_rules WHERE id = ?').get(id)
}

export function deleteCoverageRule(id) {
  getDB().prepare('DELETE FROM shift_coverage_rules WHERE id = ?').run(id)
}

function addIsoDays(date, amount) {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + amount)
  return value.toISOString().slice(0, 10)
}

function scheduledAssignmentsForRange(db, from, to) {
  return db.prepare(`
    SELECT ss.staff_id, ss.work_date,
      COALESCE(seg.role_id, s.role_id) AS role_id,
      COALESCE(seg.work_location_id, ss.work_location_id) AS work_location_id,
      COALESCE(seg.shift_def_id, ss.shift_def_id) AS shift_def_id,
      seg.start_time, seg.end_time
    FROM shift_schedule_segments seg
    JOIN shift_schedule ss ON ss.id = seg.schedule_id
    JOIN staff s ON s.id = ss.staff_id
    WHERE ss.work_date BETWEEN ? AND ?
      AND ss.status IN ('scheduled','worked','overtime')
      AND seg.status != 'cancelled'
    UNION ALL
    SELECT ss.staff_id, ss.work_date, s.role_id, ss.work_location_id, ss.shift_def_id,
      sd.start_hour AS start_time, sd.end_hour AS end_time
    FROM shift_schedule ss
    JOIN staff s ON s.id = ss.staff_id
    LEFT JOIN shift_definitions sd ON sd.id = ss.shift_def_id
    WHERE ss.work_date BETWEEN ? AND ?
      AND ss.status IN ('scheduled','worked','overtime')
      AND NOT EXISTS (
        SELECT 1 FROM shift_schedule_segments seg WHERE seg.schedule_id = ss.id AND seg.status != 'cancelled'
      )
  `).all(from, to, from, to)
}

function restAfterPrevious(previous, targetStart) {
  if (!previous) return null
  const prevStart = timeParts(previous.start_time)
  let prevEnd = timeParts(previous.end_time)
  const nextStart = timeParts(targetStart)
  if (prevStart == null || prevEnd == null || nextStart == null) return null
  if (prevEnd <= prevStart) prevEnd += 1440
  return (1440 + nextStart - prevEnd) / 60
}

function restBeforeNext(targetStart, targetEnd, next) {
  if (!next) return null
  const start = timeParts(targetStart)
  let end = timeParts(targetEnd)
  const nextStart = timeParts(next.start_time)
  if (start == null || end == null || nextStart == null) return null
  if (end <= start) end += 1440
  return (1440 + nextStart - end) / 60
}

export function getScheduleCandidates({
  date, deptId = null, roleId = null, workLocationId = null,
  shiftDefId = null, startTime = null, endTime = null, excludeStaffId = null,
}) {
  const db = getDB()
  let targetStart = startTime
  let targetEnd = endTime
  if (shiftDefId && (!targetStart || !targetEnd)) {
    const shift = db.prepare('SELECT start_hour, end_hour FROM shift_definitions WHERE id = ?').get(shiftDefId)
    targetStart ||= shift?.start_hour
    targetEnd ||= shift?.end_hour
  }

  const staff = db.prepare(`
    SELECT s.id, s.full_name, s.position,
      COALESCE((
        SELECT sa.department_id FROM staff_assignments sa
        WHERE sa.staff_id = s.id AND sa.effective_from <= ?
          AND (sa.effective_to IS NULL OR sa.effective_to >= ?)
        ORDER BY sa.effective_from DESC, sa.id DESC LIMIT 1
      ), s.department_id) AS dept_id,
      COALESCE((
        SELECT sa.role_id FROM staff_assignments sa
        WHERE sa.staff_id = s.id AND sa.effective_from <= ?
          AND (sa.effective_to IS NULL OR sa.effective_to >= ?)
        ORDER BY sa.effective_from DESC, sa.id DESC LIMIT 1
      ), s.role_id) AS role_id,
      (
        SELECT sa.work_location_id FROM staff_assignments sa
        WHERE sa.staff_id = s.id AND sa.effective_from <= ?
          AND (sa.effective_to IS NULL OR sa.effective_to >= ?)
        ORDER BY sa.effective_from DESC, sa.id DESC LIMIT 1
      ) AS primary_work_location_id,
      d.name AS dept_name, sr.name AS role_name, wl.name AS primary_work_location_name
    FROM staff s
    LEFT JOIN departments d ON d.id = COALESCE((
      SELECT sa.department_id FROM staff_assignments sa
      WHERE sa.staff_id = s.id AND sa.effective_from <= ?
        AND (sa.effective_to IS NULL OR sa.effective_to >= ?)
      ORDER BY sa.effective_from DESC, sa.id DESC LIMIT 1
    ), s.department_id)
    LEFT JOIN staff_roles sr ON sr.id = COALESCE((
      SELECT sa.role_id FROM staff_assignments sa
      WHERE sa.staff_id = s.id AND sa.effective_from <= ?
        AND (sa.effective_to IS NULL OR sa.effective_to >= ?)
      ORDER BY sa.effective_from DESC, sa.id DESC LIMIT 1
    ), s.role_id)
    LEFT JOIN work_locations wl ON wl.id = (
      SELECT sa.work_location_id FROM staff_assignments sa
      WHERE sa.staff_id = s.id AND sa.effective_from <= ?
        AND (sa.effective_to IS NULL OR sa.effective_to >= ?)
      ORDER BY sa.effective_from DESC, sa.id DESC LIMIT 1
    )
    WHERE s.is_active = 1
    ORDER BY s.full_name COLLATE NOCASE
  `).all(date, date, date, date, date, date, date, date, date, date, date, date)
  const leaves = new Set(db.prepare(`
    SELECT staff_id FROM leave_requests
    WHERE status = 'approved' AND ? BETWEEN start_date AND end_date
  `).all(date).map(row => row.staff_id))
  const assignments = scheduledAssignmentsForRange(db, addIsoDays(date, -3), addIsoDays(date, 3))
  const byStaff = new Map()
  assignments.forEach(item => {
    if (!byStaff.has(item.staff_id)) byStaff.set(item.staff_id, [])
    byStaff.get(item.staff_id).push(item)
  })

  return staff
    .filter(person => !excludeStaffId || Number(person.id) !== Number(excludeStaffId))
    .map(person => {
      const personAssignments = byStaff.get(person.id) || []
      const sameDay = personAssignments.filter(item => item.work_date === date)
      const previous = personAssignments
        .filter(item => item.work_date === addIsoDays(date, -1))
        .sort((a, b) => String(b.end_time).localeCompare(String(a.end_time)))[0]
      const next = personAssignments
        .filter(item => item.work_date === addIsoDays(date, 1))
        .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)))[0]
      const overlap = sameDay.some(item => rangesOverlap(targetStart, targetEnd, item.start_time, item.end_time))
      const restBefore = restAfterPrevious(previous, targetStart)
      const restAfter = restBeforeNext(targetStart, targetEnd, next)
      const reasons = []
      if (leaves.has(person.id)) reasons.push('approved_leave')
      if (overlap) reasons.push('time_conflict')
      if (restBefore != null && restBefore < 11) reasons.push('rest_before')
      if (restAfter != null && restAfter < 11) reasons.push('rest_after')
      const roleMatch = roleId && Number(person.role_id) === Number(roleId)
      const locationMatch = workLocationId && Number(person.primary_work_location_id) === Number(workLocationId)
      const deptMatch = deptId && Number(person.dept_id) === Number(deptId)
      const workload = new Set(personAssignments
        .filter(item => item.work_date >= addIsoDays(date, -3) && item.work_date <= addIsoDays(date, 3))
        .map(item => item.work_date)).size
      const score = 50 + (roleMatch ? 30 : 0) + (locationMatch ? 15 : 0) + (deptMatch ? 10 : 0) - Math.min(workload * 2, 20) - reasons.length * 30
      return {
        ...person,
        eligible: reasons.length === 0,
        reasons,
        score,
        workload,
        same_day_assignments: sameDay.length,
        rest_before_hours: restBefore == null ? null : Math.round(restBefore * 10) / 10,
        rest_after_hours: restAfter == null ? null : Math.round(restAfter * 10) / 10,
      }
    })
    .sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score || a.full_name.localeCompare(b.full_name, 'tr'))
}

// Rol grubu anahtarları — ASCII'ye indirgenmiş, küçük harf. Sıra önemlidir:
// önce en özgül grup (bulaşıkhane, mutfaktan önce) denenir.
// Not: staff_roles tablosunda departman bağı yok, bu yüzden sınıflandırma rol
// adına dayanır. Yeni bir departman/rol eklenirse anahtarı buraya eklenmeli —
// eşleşmeyen rol "Diğer" grubunda kalır.
const ROLE_GROUP_KEYWORDS = [
  ['Bulaşıkhane', ['bulasik']],
  ['Çamaşırhane', ['camasir', 'utu', 'kurutma', 'yikama']],
  ['Yemek/İkram', ['ikram', 'asci', 'lokal', 'garson', 'mutfak', 'servis', 'yemek', 'komi']],
  ['Temizlik', ['temizlik', 'meydanci', 'hizmetli', 'kat gorevlisi', 'housekeep']],
  ['Teknik', ['teknik', 'teknisyen', 'elektrik', 'tesisat', 'bakim', 'onarim', 'usta', 'kaynakci', 'marangoz']],
  ['Güvenlik', ['guvenlik', 'bekci', 'security']],
  ['Bahçe', ['bahce', 'bahci', 'peyzaj', 'cevre duzen']],
  ['Sağlık', ['saglik', 'revir', 'hemsire', 'doktor', 'ilk yardim', 'paramedik']],
  ['İdari', ['idari', 'ofis', 'muhasebe', 'insan kaynak', 'sekreter', 'memur', 'satin alma', 'depo sorumlu']],
]

// Rol grubu: her departman kendi grubunu alır; hiçbiri eşleşmezse "Diğer".
export function roleGroupOf(roleName) {
  // Türkçe İ/ı büyük-küçük tuzağını aşmak için ASCII'ye indir, sonra karşılaştır.
  const name = String(roleName || '')
    .replace(/İ/g, 'I').replace(/ı/g, 'i').replace(/Ş/g, 'S').replace(/ş/g, 's')
    .replace(/Ğ/g, 'G').replace(/ğ/g, 'g').replace(/Ü/g, 'U').replace(/ü/g, 'u')
    .replace(/Ö/g, 'O').replace(/ö/g, 'o').replace(/Ç/g, 'C').replace(/ç/g, 'c')
    .toLowerCase()
  // Sıra önemli: en özgül anahtar önce denenir (ör. "bulaşık" mutfaktan önce).
  for (const [group, keywords] of ROLE_GROUP_KEYWORDS) {
    if (keywords.some(keyword => name.includes(keyword))) return group
  }
  return 'Diğer'
}

// Atanmamış (çalışma noktası seçilmemiş) vardiyalı personelin toplandığı sanal grup.
// Eskiden "Yemekhane" idi; bu, noktası girilmemiş herkesi yemekhaneye sayıyor ve
// GÜN DETAYI paneliyle çelişiyordu. Artık nötr etiket — iki panel aynı sayıyı verir.
export const DEFAULT_SITE = 'Site belirtilmemiş'
export const DEFAULT_LOCATION = 'Konum belirtilmemiş'
// Geriye uyum: eski adı kullanan çağrılar konum etiketini alsın.
export const DEFAULT_WORK_AREA = DEFAULT_LOCATION

export function getScheduleBreakdown(from, to) {
  const db = getDB()
  const workLocations = getWorkLocations({ includeInactive: true })
  const roles = getStaffRoles({ includeInactive: true })
  const assignments = scheduledAssignmentsForRange(db, from, to)
  const locationsById = new Map(workLocations.map(item => [Number(item.id), item]))
  const rolesById = new Map(roles.map(item => [Number(item.id), item]))
  const locationSets = new Map()
  const roleSets = new Map()
  const siteSets = new Map()
  const add = (map, key, staffId) => {
    if (!map.has(key)) map.set(key, new Set())
    map.get(key).add(staffId)
  }
  assignments.forEach(item => {
    const location = locationsById.get(Number(item.work_location_id))
    add(locationSets, `${item.work_date}|${item.work_location_id || 0}`, item.staff_id)
    add(roleSets, `${item.work_date}|${item.role_id || 0}`, item.staff_id)
    // Nokta seçilmemişse site de "Yemekhane" grubuna yazılır (lokal olarak sayılmasın).
    add(siteSets, `${item.work_date}|${location?.site || DEFAULT_SITE}`, item.staff_id)
  })
  const locationCounts = [...locationSets.entries()].map(([key, staffIds]) => {
    const [workDate, rawId] = key.split('|')
    const id = Number(rawId) || null
    const location = locationsById.get(Number(id))
    return {
      work_date: workDate,
      work_location_id: id,
      // Atanmamışlar "Yemekhane" grubu — "Noktasız" değil.
      work_location_name: location?.name || DEFAULT_LOCATION,
      work_location_color: location?.color_class || 'bg-amber-400',
      is_default_area: !id,
      assigned: staffIds.size,
    }
  })
  const roleCounts = [...roleSets.entries()].map(([key, staffIds]) => {
    const [workDate, rawId] = key.split('|')
    const id = Number(rawId) || null
    const roleName = rolesById.get(Number(id))?.name || 'Rolsüz'
    return { work_date: workDate, role_id: id, role_name: roleName, role_group: roleGroupOf(roleName), assigned: staffIds.size }
  })
  const siteCounts = [...siteSets.entries()].map(([key, staffIds]) => {
    const separator = key.indexOf('|')
    return { work_date: key.slice(0, separator), site: key.slice(separator + 1), assigned: staffIds.size }
  })

  // Boş lokal tespiti: aralıkta çalışan (bir gün ≥1 kişi olan) her aktif lokasyonun
  // 0 kişili günleri — "normalde dolu ama bugün boş" lokalleri yakalar. İşçi Lokali gibi
  // zorunlu noktalar ayrıca coverage kurallarıyla (her gün) izlenir.
  const dayCount = new Map()
  locationCounts.forEach(lc => { if (lc.work_location_id) dayCount.set(`${lc.work_date}|${lc.work_location_id}`, lc.assigned) })
  const operatingIds = new Set(locationCounts.filter(lc => lc.work_location_id && lc.assigned > 0).map(lc => Number(lc.work_location_id)))
  const emptyLocations = []
  for (const loc of workLocations.filter(l => l.is_active !== 0)) {
    if (!operatingIds.has(Number(loc.id))) continue
    for (const workDate of dateRange(from, to)) {
      if ((dayCount.get(`${workDate}|${loc.id}`) || 0) === 0) {
        emptyLocations.push({ work_date: workDate, work_location_id: loc.id, work_location_name: loc.name })
      }
    }
  }

  return {
    from, to, work_locations: workLocations, roles,
    location_counts: locationCounts, role_counts: roleCounts, site_counts: siteCounts,
    empty_locations: emptyLocations,
  }
}

// Bir kırılım hücresine (dimension × değer × gün) atanan kişileri getir — tıkla-panel için.
// dimension: 'site' | 'location' | 'role'
export function getBreakdownAssignees({ date, dimension, value }) {
  const db = getDB()
  // Atanmamış nokta/site "Yemekhane" grubunda toplanır (breakdown ile tutarlı).
  const groupExpr = {
    // Etiketler yukarıdaki sabitlerle birebir aynı olmalı — yoksa kırılım
    // hücresine tıklayınca kimse gelmez.
    site: `COALESCE(wl.site, '${DEFAULT_SITE}')`,
    location: `COALESCE(wl.name, '${DEFAULT_LOCATION}')`,
    role: "COALESCE(sr.name, 'Rolsüz')",
  }[dimension]
  if (!groupExpr) return []
  return db.prepare(`
    WITH assignments AS (
      SELECT ss.staff_id, ss.work_date, ss.status,
        COALESCE(ss.dept_id, s.department_id) AS dept_id,
        COALESCE(seg.role_id, s.role_id) AS role_id,
        COALESCE(seg.work_location_id, ss.work_location_id) AS work_location_id,
        COALESCE(seg.shift_def_id, ss.shift_def_id) AS shift_def_id,
        seg.start_time, seg.end_time
      FROM shift_schedule_segments seg
      JOIN shift_schedule ss ON ss.id = seg.schedule_id
      JOIN staff s ON s.id = ss.staff_id
      WHERE ss.work_date = ? AND ss.status IN ('scheduled','worked','overtime') AND seg.status != 'cancelled'
      UNION ALL
      SELECT ss.staff_id, ss.work_date, ss.status,
        COALESCE(ss.dept_id, s.department_id), s.role_id, ss.work_location_id, ss.shift_def_id,
        sd.start_hour, sd.end_hour
      FROM shift_schedule ss
      JOIN staff s ON s.id = ss.staff_id
      LEFT JOIN shift_definitions sd ON sd.id = ss.shift_def_id
      WHERE ss.work_date = ? AND ss.status IN ('scheduled','worked','overtime')
        AND NOT EXISTS (SELECT 1 FROM shift_schedule_segments seg WHERE seg.schedule_id = ss.id AND seg.status != 'cancelled')
    )
    SELECT a.staff_id, s.full_name, s.position,
      COALESCE(d.name, '—') AS dept_name,
      COALESCE(sr.name, '') AS role_name,
      COALESCE(sd.name, '') AS shift_name,
      a.start_time AS start_hour, a.end_time AS end_hour,
      COALESCE(wl.name, '') AS work_location_name,
      COALESCE(wl.color_class, '') AS work_location_color,
      COALESCE(wl.site, '') AS site,
      a.status
    FROM assignments a
    JOIN staff s ON s.id = a.staff_id
    LEFT JOIN departments d ON d.id = a.dept_id
    LEFT JOIN staff_roles sr ON sr.id = a.role_id
    LEFT JOIN shift_definitions sd ON sd.id = a.shift_def_id
    LEFT JOIN work_locations wl ON wl.id = a.work_location_id
    WHERE 1=1
      AND ${groupExpr} = ?
    ORDER BY s.full_name COLLATE NOCASE, a.start_time
  `).all(date, date, value)
}

// Gün detayı için o günün TÜM schedule satırları: çalışanlar (segment kırılımlı) +
// izinli/raporlu/devamsız/off. buildDayDetail (dayDetail.js) bunları kovalar.
export function getDayDetailRows(date) {
  const db = getDB()
  return db.prepare(`
    WITH working AS (
      -- Segmentli çalışanlar (gün içi çoklu vardiya/nokta)
      SELECT ss.staff_id, ss.status,
        COALESCE(ss.dept_id, s.department_id) AS dept_id,
        COALESCE(seg.role_id, s.role_id) AS role_id,
        COALESCE(seg.work_location_id, ss.work_location_id) AS work_location_id,
        COALESCE(seg.shift_def_id, ss.shift_def_id) AS shift_def_id,
        seg.start_time AS start_hour, seg.end_time AS end_hour,
        NULL AS leave_type, NULL AS absent_reason
      FROM shift_schedule_segments seg
      JOIN shift_schedule ss ON ss.id = seg.schedule_id
      JOIN staff s ON s.id = ss.staff_id
      WHERE ss.work_date = ? AND ss.status IN ('scheduled','worked','overtime') AND seg.status != 'cancelled'
      UNION ALL
      -- Segmentsiz çalışanlar
      SELECT ss.staff_id, ss.status,
        COALESCE(ss.dept_id, s.department_id), s.role_id, ss.work_location_id, ss.shift_def_id,
        sd.start_hour, sd.end_hour, NULL, NULL
      FROM shift_schedule ss
      JOIN staff s ON s.id = ss.staff_id
      LEFT JOIN shift_definitions sd ON sd.id = ss.shift_def_id
      WHERE ss.work_date = ? AND ss.status IN ('scheduled','worked','overtime')
        AND NOT EXISTS (SELECT 1 FROM shift_schedule_segments seg WHERE seg.schedule_id = ss.id AND seg.status != 'cancelled')
      UNION ALL
      -- İzinli / raporlu / devamsız / off (vardiyaya yazılmaz)
      SELECT ss.staff_id, ss.status,
        COALESCE(ss.dept_id, s.department_id), s.role_id, ss.work_location_id, ss.shift_def_id,
        sd.start_hour, sd.end_hour, ss.leave_type, ss.absent_reason
      FROM shift_schedule ss
      JOIN staff s ON s.id = ss.staff_id
      LEFT JOIN shift_definitions sd ON sd.id = ss.shift_def_id
      WHERE ss.work_date = ? AND ss.status IN ('on_leave','absent','off')
    )
    SELECT w.staff_id, s.full_name, w.status, w.leave_type, w.absent_reason,
      COALESCE(d.name, '') AS dept_name,
      COALESCE(sr.name, '') AS role_name,
      COALESCE(sd.name, '') AS shift_name,
      w.start_hour, w.end_hour,
      COALESCE(wl.name, '') AS work_location_name,
      COALESCE(wl.site, '') AS site
    FROM working w
    JOIN staff s ON s.id = w.staff_id
    LEFT JOIN departments d ON d.id = w.dept_id
    LEFT JOIN staff_roles sr ON sr.id = w.role_id
    LEFT JOIN shift_definitions sd ON sd.id = w.shift_def_id
    LEFT JOIN work_locations wl ON wl.id = w.work_location_id
    ORDER BY s.full_name COLLATE NOCASE
  `).all(date, date, date)
}

// Bir gün + an (atMinutes) için lokasyon doluluğu — saf/test edilebilir çekirdek.
// assignments: [{ staff_id, full_name, role_name, dept_name, work_location_id, start_time, end_time }]
//   start_time/end_time "HH:MM" (gece aşırı destekli) veya null → gün boyu mevcut sayılır.
// locations: aktif work_locations [{ id, name, site, color_class, is_active }]
// rules: coverage kuralları; atMinutes: gün içi dakika; date: kuralın gününü belirler.
export function computeLocationOccupancy({ assignments = [], locations = [], rules = [], date, atMinutes } = {}) {
  const at = Number.isFinite(atMinutes) ? atMinutes : 0
  const day = date ? isoDay(date) : null
  const coversAt = (start, end) => {
    if (start == null || start === '' || end == null || end === '') return true
    const ranges = timeRanges(start, end)
    if (!ranges.length) return true
    return ranges.some(([s, e]) => at >= s && at < e)
  }
  const activeLocs = locations.filter(l => l.is_active !== 0)
  const locById = new Map(activeLocs.map(l => [Number(l.id), l]))

  // Bu gün + bu an geçerli kuralların lokasyon başına gerektirdiği min kişi.
  const requiredByLoc = new Map()
  rules.forEach(rule => {
    if (!rule.work_location_id) return
    const days = new Set(String(rule.days_of_week || '').split(',').map(Number))
    if (day != null && !days.has(day)) return
    if (!coversAt(rule.start_time, rule.end_time)) return
    const id = Number(rule.work_location_id)
    requiredByLoc.set(id, Math.max(requiredByLoc.get(id) || 0, Number(rule.min_staff) || 0))
  })

  // O an mevcut personel — lokasyon başına (0 = atanmamış → Yemekhane).
  const presentByLoc = new Map()
  assignments.forEach(a => {
    if (!coversAt(a.start_time, a.end_time)) return
    const id = a.work_location_id ? Number(a.work_location_id) : 0
    if (!presentByLoc.has(id)) presentByLoc.set(id, [])
    presentByLoc.get(id).push({
      staff_id: a.staff_id, full_name: a.full_name,
      role_name: a.role_name || '', dept_name: a.dept_name || '',
      start_time: a.start_time || '', end_time: a.end_time || '',
    })
  })

  const ids = new Set()
  activeLocs.forEach(l => ids.add(Number(l.id)))
  requiredByLoc.forEach((_, id) => ids.add(id))
  presentByLoc.forEach((_, id) => { if (id) ids.add(id) })

  const rows = [...ids].map(id => {
    const loc = locById.get(id)
    const present = (presentByLoc.get(id) || []).sort((a, b) => a.full_name.localeCompare(b.full_name, 'tr'))
    const required = requiredByLoc.get(id) || 0
    const count = present.length
    return {
      work_location_id: id,
      name: loc?.name || `#${id}`,
      site: loc?.site || DEFAULT_SITE,
      color_class: loc?.color_class || 'bg-slate-400',
      is_default_area: false,
      present, count, required,
      empty: count === 0,
      understaffed: required > 0 && count < required,
    }
  })

  const defaultPresent = (presentByLoc.get(0) || []).sort((a, b) => a.full_name.localeCompare(b.full_name, 'tr'))
  if (defaultPresent.length) {
    rows.push({
      work_location_id: null, name: DEFAULT_LOCATION, site: DEFAULT_SITE,
      color_class: 'bg-amber-400', is_default_area: true,
      present: defaultPresent, count: defaultPresent.length, required: 0,
      empty: false, understaffed: false,
    })
  }

  rows.sort((a, b) => (a.site || '').localeCompare(b.site || '', 'tr') || a.name.localeCompare(b.name, 'tr'))
  return rows
}

// Canlı "ŞU AN" doluluğu: seçili gün + an için lokasyon başına kim var + eksik/boş.
export function getLocationOccupancy({ date, atMinutes } = {}) {
  const db = getDB()
  const locations = getWorkLocations({ includeInactive: false })
  const rules = getCoverageRules({ includeInactive: false })
  const assignments = db.prepare(`
    WITH a AS (
      SELECT ss.staff_id,
        COALESCE(ss.dept_id, s.department_id) AS dept_id,
        COALESCE(seg.role_id, s.role_id) AS role_id,
        COALESCE(seg.work_location_id, ss.work_location_id) AS work_location_id,
        seg.start_time, seg.end_time
      FROM shift_schedule_segments seg
      JOIN shift_schedule ss ON ss.id = seg.schedule_id
      JOIN staff s ON s.id = ss.staff_id
      WHERE ss.work_date = ? AND ss.status IN ('scheduled','worked','overtime') AND seg.status != 'cancelled'
      UNION ALL
      SELECT ss.staff_id, COALESCE(ss.dept_id, s.department_id), s.role_id, ss.work_location_id,
        CASE WHEN sd.start_hour IS NULL THEN NULL ELSE printf('%02d:00', sd.start_hour) END,
        CASE WHEN sd.end_hour IS NULL THEN NULL ELSE printf('%02d:00', sd.end_hour) END
      FROM shift_schedule ss
      JOIN staff s ON s.id = ss.staff_id
      LEFT JOIN shift_definitions sd ON sd.id = ss.shift_def_id
      WHERE ss.work_date = ? AND ss.status IN ('scheduled','worked','overtime')
        AND NOT EXISTS (SELECT 1 FROM shift_schedule_segments seg WHERE seg.schedule_id = ss.id AND seg.status != 'cancelled')
    )
    SELECT a.staff_id, a.work_location_id, a.start_time, a.end_time,
      s.full_name, COALESCE(sr.name, '') AS role_name, COALESCE(d.name, '') AS dept_name
    FROM a
    JOIN staff s ON s.id = a.staff_id
    LEFT JOIN staff_roles sr ON sr.id = a.role_id
    LEFT JOIN departments d ON d.id = a.dept_id
  `).all(date, date)
  const rows = computeLocationOccupancy({ assignments, locations, rules, date, atMinutes })
  const alerts = rows.filter(r => r.understaffed)
  return {
    date,
    at_minutes: atMinutes,
    rows,
    present_total: rows.reduce((sum, r) => sum + r.count, 0),
    empty_count: rows.filter(r => !r.is_default_area && r.empty).length,
    alert_count: alerts.length,
    alerts: alerts.map(r => ({ work_location_id: r.work_location_id, name: r.name, site: r.site, count: r.count, required: r.required })),
  }
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
    db.prepare("UPDATE leave_requests SET status='rejected', version=version+1, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(id)
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
    INSERT INTO shift_swap_requests(
      requester_id, target_id, swap_date, requester_shift_id, target_shift_id,
      requester_segment_id, target_segment_id, reason
    ) VALUES(
      @requester_id, @target_id, @swap_date, @requester_shift_id, @target_shift_id,
      @requester_segment_id, @target_segment_id, @reason
    )
  `).run({
    requester_id: data.requester_id,
    target_id: data.target_id,
    swap_date: data.swap_date,
    requester_shift_id: data.requester_shift_id || null,
    target_shift_id: data.target_shift_id || null,
    requester_segment_id: data.requester_segment_id || null,
    target_segment_id: data.target_segment_id || null,
    reason: data.reason || null,
  }).lastInsertRowid
}

export function getSwapRequests(filters = {}) {
  ensureSwapTable()
  let query = `
    SELECT sr.*,
      s1.full_name as requester_name, s1.gender as requester_gender,
      s2.full_name as target_name, s2.gender as target_gender,
      sd1.name as requester_shift_name, sd2.name as target_shift_name,
      rseg.start_time as requester_segment_start, rseg.end_time as requester_segment_end,
      tseg.start_time as target_segment_start, tseg.end_time as target_segment_end,
      rwl.name as requester_segment_location, twl.name as target_segment_location
    FROM shift_swap_requests sr
    JOIN staff s1 ON s1.id = sr.requester_id
    JOIN staff s2 ON s2.id = sr.target_id
    LEFT JOIN shift_definitions sd1 ON sd1.id = sr.requester_shift_id
    LEFT JOIN shift_definitions sd2 ON sd2.id = sr.target_shift_id
    LEFT JOIN shift_schedule_segments rseg ON rseg.id = sr.requester_segment_id
    LEFT JOIN shift_schedule_segments tseg ON tseg.id = sr.target_segment_id
    LEFT JOIN work_locations rwl ON rwl.id = rseg.work_location_id
    LEFT JOIN work_locations twl ON twl.id = tseg.work_location_id
    WHERE 1=1
  `
  const params = []
  if (filters.status) { query += ' AND sr.status=?'; params.push(filters.status) }
  query += ' ORDER BY sr.created_at DESC LIMIT 100'
  return getDB().prepare(query).all(...params)
}

export function acceptSwapRequest(id, targetId) {
  ensureSwapTable()
  const result = getDB().prepare(`
    UPDATE shift_swap_requests
    SET target_accepted_at = CURRENT_TIMESTAMP
    WHERE id = ? AND target_id = ? AND status = 'pending'
  `).run(id, targetId)
  if (!result.changes) throw new Error('Takas talebi bulunamadi veya hedef personel uyusmuyor')
  return getDB().prepare('SELECT * FROM shift_swap_requests WHERE id = ?').get(id)
}

export function approveSwapRequest(id, approvedBy) {
  ensureSwapTable()
  const db = getDB()
  const swap = db.prepare('SELECT * FROM shift_swap_requests WHERE id=? AND status=?').get(id, 'pending')
  if (!swap) throw new Error('Takas talebi bulunamadı veya zaten işlenmiş')

  db.transaction(() => {
    if (swap.requester_segment_id || swap.target_segment_id) {
      if (!swap.requester_segment_id || !swap.target_segment_id) throw new Error('Parçalı takasta iki vardiya parçası da seçilmeli')
      if (!swap.target_accepted_at) throw new Error('Hedef personel takası kabul etmeden onaylanamaz')
      const requesterSegment = getScheduleSegment(swap.requester_segment_id)
      const targetSegment = getScheduleSegment(swap.target_segment_id)
      if (!requesterSegment || !targetSegment) throw new Error('Takas vardiya parçası bulunamadı')
      if (Number(requesterSegment.staff_id) !== Number(swap.requester_id)
        || Number(targetSegment.staff_id) !== Number(swap.target_id)
        || requesterSegment.work_date !== swap.swap_date
        || targetSegment.work_date !== swap.swap_date) {
        throw new Error('Takas parçası personel veya tarih ile uyuşmuyor')
      }
      const fields = ['shift_def_id', 'role_id', 'work_location_id', 'start_time', 'end_time', 'break_minutes', 'note']
      const set = fields.map(field => `${field}=@${field}`).join(', ')
      const update = db.prepare(`UPDATE shift_schedule_segments SET ${set}, updated_at=CURRENT_TIMESTAMP WHERE id=@id`)
      update.run({ ...targetSegment, id: requesterSegment.id })
      update.run({ ...requesterSegment, id: targetSegment.id })
    } else if (swap.requester_shift_id && swap.target_shift_id) {
      db.prepare('UPDATE shift_schedule SET shift_def_id=? WHERE staff_id=? AND work_date=?').run(swap.target_shift_id, swap.requester_id, swap.swap_date)
      db.prepare('UPDATE shift_schedule SET shift_def_id=? WHERE staff_id=? AND work_date=?').run(swap.requester_shift_id, swap.target_id, swap.swap_date)
    }
    db.prepare("UPDATE shift_swap_requests SET status='approved', approved_by=?, validation_note=? WHERE id=?")
      .run(approvedBy, swap.requester_segment_id ? 'Segment personel/tarih ve hedef kabul kontrolü tamamlandı' : 'Günlük vardiya takası', id)
  })()
  return getDB().prepare('SELECT * FROM shift_swap_requests WHERE id = ?').get(id)
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
  const rows = db.prepare('SELECT id, staff_id, dept_id, shift_def_id, work_location_id, work_date, status, leave_type, absent_reason FROM shift_schedule WHERE work_date BETWEEN ? AND ?').all(sourceWeekStart, sourceEnd)
  const sourceSegments = db.prepare(`
    SELECT seg.* FROM shift_schedule_segments seg
    JOIN shift_schedule ss ON ss.id = seg.schedule_id
    WHERE ss.work_date BETWEEN ? AND ?
    ORDER BY seg.schedule_id, seg.sequence_no
  `).all(sourceWeekStart, sourceEnd)
  const segmentsBySchedule = new Map()
  sourceSegments.forEach(segment => {
    if (!segmentsBySchedule.has(segment.schedule_id)) segmentsBySchedule.set(segment.schedule_id, [])
    segmentsBySchedule.get(segment.schedule_id).push(segment)
  })

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
  const findTarget = db.prepare('SELECT id FROM shift_schedule WHERE staff_id = ? AND work_date = ?')
  const clearTargetSegments = db.prepare('DELETE FROM shift_schedule_segments WHERE schedule_id = ?')
  const insertSegment = db.prepare(`
    INSERT INTO shift_schedule_segments(
      schedule_id, sequence_no, shift_def_id, role_id, work_location_id,
      start_time, end_time, break_minutes, actual_start, actual_end, note, status, created_by
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)
  `)

  db.transaction(() => {
    rows.forEach(r => {
      const newDate = addDaysStr(r.work_date, dayDiff)
      upsert.run(r.staff_id, r.dept_id, r.shift_def_id, r.work_location_id || null, newDate, r.status || 'scheduled', r.leave_type || null, r.absent_reason || null, createdBy)
      const targetId = findTarget.get(r.staff_id, newDate)?.id
      if (targetId) {
        clearTargetSegments.run(targetId)
        ;(segmentsBySchedule.get(r.id) || []).forEach(segment => {
          insertSegment.run(
            targetId, segment.sequence_no, segment.shift_def_id, segment.role_id, segment.work_location_id,
            segment.start_time, segment.end_time, segment.break_minutes || 0,
            segment.note, segment.status || 'planned', createdBy
          )
        })
      }
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

export function createPuantajCode({
  code, label, colorHex, status, leaveType, sortOrder,
  isPaid, sgkDayFactor, dayMultiplier, hourMultiplier, overtimeEffect,
  requiresDocument, requiresReason,
}) {
  return getDB().prepare(`
    INSERT INTO puantaj_codes(
      code, label, color_hex, status, leave_type, sort_order, is_builtin,
      is_paid, sgk_day_factor, day_multiplier, hour_multiplier, overtime_effect,
      requires_document, requires_reason
    ) VALUES(?,?,?,?,?,?,0,?,?,?,?,?,?,?)
  `).run(
    code, label, colorHex, status, leaveType || null, sortOrder ?? 99,
    isPaid, sgkDayFactor, dayMultiplier, hourMultiplier, overtimeEffect,
    requiresDocument, requiresReason
  ).lastInsertRowid
}

export function updatePuantajCode(id, fields) {
  const allowed = [
    'code', 'label', 'color_hex', 'leave_type', 'sort_order', 'is_active',
    'is_paid', 'sgk_day_factor', 'day_multiplier', 'hour_multiplier',
    'overtime_effect', 'requires_document', 'requires_reason',
  ]
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
      SUM(CASE WHEN ss.staff_id IS NULL THEN 1 ELSE 0 END) AS empty,
      SUM(CASE WHEN pc.requires_reason=1 AND TRIM(COALESCE(ss.detail_note, ss.absent_reason, ''))='' THEN 1 ELSE 0 END) AS required_reason_missing,
      SUM(CASE WHEN pc.requires_document=1 AND ss.attachment_url IS NULL
        AND NOT EXISTS(
          SELECT 1 FROM leave_documents ld
          WHERE ld.schedule_id=ss.id OR ld.leave_request_id IN (
            SELECT lr.id FROM leave_requests lr
            WHERE lr.staff_id=s.id AND lr.status='approved' AND ? BETWEEN lr.start_date AND lr.end_date
          )
        ) THEN 1 ELSE 0 END) AS required_document_missing,
      (SELECT COUNT(*) FROM overtime_requests otr
        JOIN staff os ON os.id=otr.staff_id
        WHERE otr.work_date=? AND otr.status IN ('pending','returned')
          AND (? IS NULL OR os.department_id=?)) AS pending_overtime_requests,
      (SELECT COUNT(*) FROM leave_requests lr
        JOIN staff ls ON ls.id=lr.staff_id
        WHERE lr.status='pending' AND ? BETWEEN lr.start_date AND lr.end_date
          AND (? IS NULL OR ls.department_id=?)) AS pending_leave_requests
    FROM staff s
    LEFT JOIN shift_schedule ss ON ss.staff_id = s.id AND ss.work_date = ?
    LEFT JOIN puantaj_codes pc ON pc.id=COALESCE(ss.puantaj_code_id, (
      SELECT fallback_pc.id FROM puantaj_codes fallback_pc
      WHERE fallback_pc.is_active=1 AND fallback_pc.status=ss.status
        AND (ss.status!='on_leave' OR fallback_pc.leave_type=ss.leave_type)
      ORDER BY fallback_pc.is_builtin DESC, fallback_pc.sort_order, fallback_pc.id LIMIT 1
    ))
    WHERE s.is_active = 1 AND (? IS NULL OR s.department_id = ?)
  `).get(
    date,
    date, deptId ?? null, deptId ?? null,
    date, deptId ?? null, deptId ?? null,
    date, deptId ?? null, deptId ?? null
  )
}

// Onay bütünlüğü: puantaj verisi değişen günlerin 'approved' gün onaylarını
// (tüm scope'larda) 'pending'e düşürür; onaylı dönem varsa 'submitted'a çeker.
// Her düşürme puantaj_approval_events'e 'data_changed' olarak yazılır.
export function resetDailyApprovalsForDates(dates, userId) {
  const db = getDB()
  const uniqueDates = [...new Set((dates || []).filter(isIsoDate))]
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
export function deleteScheduleEntry(staffId, workDate, expectedVersion = null) {
  const db = getDB()
  const current = db.prepare('SELECT row_version FROM shift_schedule WHERE staff_id=? AND work_date=?').get(staffId, workDate)
  if (!current && expectedVersion != null && Number(expectedVersion) !== 0) {
    throw Object.assign(new Error('Bu hucre zaten silinmis veya baska bir kullanici tarafindan degistirilmis.'), {
      statusCode: 409,
      details: { conflict: true, current_version: 0 },
    })
  }
  if (current && expectedVersion != null && Number(expectedVersion) !== Number(current.row_version)) {
    throw Object.assign(new Error('Bu hucre baska bir kullanici tarafindan degistirildi. Guncel veri yeniden yuklendi.'), {
      statusCode: 409,
      details: { conflict: true, current_version: current.row_version },
    })
  }
  db.prepare('DELETE FROM shift_schedule WHERE staff_id=? AND work_date=?').run(staffId, workDate)
}

export function upsertPuantajDayDetail(data, userId) {
  const db = getDB()
  const staffId = Number(data.staff_id)
  const workDate = String(data.work_date || '')
  if (!staffId || !isIsoDate(workDate)) throw new Error('Personel ve tarih zorunlu')
  const staff = db.prepare('SELECT department_id FROM staff WHERE id=? AND is_active=1').get(staffId)
  if (!staff) throw new Error('Personel bulunamadi')

  const existing = db.prepare('SELECT * FROM shift_schedule WHERE staff_id=? AND work_date=?').get(staffId, workDate)
  if (!existing && data.expected_version != null && Number(data.expected_version) !== 0) {
    throw Object.assign(new Error('Bu hucre silinmis veya baska bir kullanici tarafindan degistirilmis. Guncel veri yeniden yuklendi.'), {
      statusCode: 409,
      details: { conflict: true, current_version: 0 },
    })
  }
  if (existing && data.expected_version != null && Number(data.expected_version) !== Number(existing.row_version || 1)) {
    throw Object.assign(new Error('Bu hucre baska bir kullanici tarafindan degistirildi. Guncel veri yeniden yuklendi.'), {
      statusCode: 409,
      details: { conflict: true, current_version: existing.row_version || 1 },
    })
  }
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

  const leaveType = status === 'on_leave' ? (cleanText(data.leave_type) || existing?.leave_type || 'other') : null
  const code = data.puantaj_code_id
    ? db.prepare('SELECT * FROM puantaj_codes WHERE id=? AND is_active=1').get(Number(data.puantaj_code_id))
    : db.prepare(`
      SELECT * FROM puantaj_codes
      WHERE is_active=1 AND status=? AND (? IS NULL OR leave_type=?)
      ORDER BY CASE WHEN leave_type=? THEN 0 ELSE 1 END, is_builtin DESC, sort_order, id LIMIT 1
    `).get(status, leaveType, leaveType, leaveType)
  const detailNote = hasField('detail_note') ? cleanText(data.detail_note) : (existing?.detail_note ?? null)
  const nextAttachmentUrl = removeAttachment ? null : (data.attachment_url ?? existing?.attachment_url ?? null)
  const documentCount = existing?.id
    ? db.prepare('SELECT COUNT(*) as count FROM leave_documents WHERE schedule_id=?').get(existing.id).count
    : 0
  if (code?.requires_reason && !detailNote) {
    throw Object.assign(new Error(`${code.label} icin gerekce zorunlu`), { statusCode: 409, details: { reason_required: true } })
  }
  if (code?.requires_document && !nextAttachmentUrl && !documentCount) {
    throw Object.assign(new Error(`${code.label} icin belge zorunlu`), { statusCode: 409, details: { document_required: true } })
  }

  const next = {
    staff_id: staffId,
    dept_id: existing?.dept_id ?? staff.department_id ?? null,
    shift_def_id: keepsWorkFields ? (existing?.shift_def_id ?? null) : null,
    work_location_id: keepsWorkFields ? (existing?.work_location_id ?? null) : null,
    work_date: workDate,
    status,
    leave_type: leaveType,
    absent_reason: status === 'absent' ? (hasField('absent_reason') ? cleanText(data.absent_reason) : (existing?.absent_reason ?? null)) : null,
    leave_hours: status === 'on_leave' ? leaveHours : null,
    detail_note: detailNote,
    attachment_url: nextAttachmentUrl,
    attachment_name: removeAttachment ? null : (data.attachment_name ?? existing?.attachment_name ?? null),
    attachment_mime: removeAttachment ? null : (data.attachment_mime ?? existing?.attachment_mime ?? null),
    puantaj_code_id: code?.id || null,
    created_by: userId || existing?.created_by || null,
  }

  db.prepare(`
    INSERT INTO shift_schedule(
      staff_id, dept_id, shift_def_id, work_location_id, work_date, status, leave_type, absent_reason,
      leave_hours, detail_note, attachment_url, attachment_name, attachment_mime, puantaj_code_id, created_by
    )
    VALUES(
      @staff_id, @dept_id, @shift_def_id, @work_location_id, @work_date, @status, @leave_type, @absent_reason,
      @leave_hours, @detail_note, @attachment_url, @attachment_name, @attachment_mime, @puantaj_code_id, @created_by
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
      attachment_mime=excluded.attachment_mime,
      puantaj_code_id=excluded.puantaj_code_id,
      row_version=shift_schedule.row_version+1
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
      ss.row_version,
      ss.puantaj_code_id,
      pc.code as puantaj_code,
      pc.label as puantaj_code_label,
      pc.requires_document,
      pc.requires_reason,
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
      (SELECT COUNT(*) FROM leave_documents ld WHERE ld.schedule_id=ss.id) as document_count,
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
    LEFT JOIN puantaj_codes pc ON pc.id = ss.puantaj_code_id
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
export function getPuantajDayRows(monthStart, monthEnd, deptId, projectId = null) {
  const db = getDB()
  let query = `
    SELECT
      ss.staff_id,
      ss.work_date as date,
      ss.id as schedule_id,
      ss.dept_id,
      ss.shift_def_id,
      ss.status,
      ss.row_version,
      ss.puantaj_code_id,
      pc.code as puantaj_code,
      pc.label as puantaj_code_label,
      pc.requires_document,
      pc.requires_reason,
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
      (SELECT COUNT(*) FROM leave_documents ld WHERE ld.schedule_id=ss.id) as document_count,
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
    LEFT JOIN puantaj_codes pc ON pc.id = ss.puantaj_code_id
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
  const projeGun = projectFilterSql(projectId)
  query += projeGun.sql
  params.push(...projeGun.params)
  query += ' ORDER BY ss.staff_id, ss.work_date'
  return db.prepare(query).all(...params)
}

// Puantaj kod-etkili gün birimleri alt-sorgusu — föy (getPuantaj) ve bordro
// raporları (getPayrollExport/getPayrollDetailed) tek kaynaktan beslensin diye.
// Placeholder sırası: (monthStart, monthEndInclusive) — ss.work_date BETWEEN.
export function puantajUnitsSubquery() {
  return `
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
      COUNT(CASE WHEN ss.status='on_leave' AND (COALESCE(ss.leave_type, lr.leave_type) IS NULL OR COALESCE(ss.leave_type, lr.leave_type) NOT IN ('annual','sick','emergency')) THEN 1 END) as other_leave_days,
      SUM(CASE WHEN ss.status='on_leave' AND COALESCE(pc.is_paid, 0)=1 THEN
        CASE WHEN COALESCE(ss.leave_hours, 0)>0
          THEN (ss.leave_hours / 8.0) * COALESCE(pc.hour_multiplier, 0)
          ELSE COALESCE(pc.day_multiplier, 0)
        END ELSE 0 END) as paid_leave_units,
      SUM(CASE WHEN ss.status='on_leave' THEN COALESCE(pc.sgk_day_factor, 0) ELSE 0 END) as sgk_day_units,
      COUNT(CASE WHEN ss.status='on_leave' AND COALESCE(pc.requires_document,0)=1
        AND ss.attachment_url IS NULL
        AND NOT EXISTS(SELECT 1 FROM leave_documents ld WHERE ld.schedule_id=ss.id OR ld.leave_request_id=lr.id)
        THEN 1 END) as missing_required_documents
    FROM shift_schedule ss
    LEFT JOIN leave_requests lr ON lr.staff_id = ss.staff_id
      AND lr.status = 'approved'
      AND ss.work_date BETWEEN lr.start_date AND lr.end_date
    LEFT JOIN puantaj_codes pc ON pc.id=COALESCE(ss.puantaj_code_id, (
      SELECT fallback_pc.id FROM puantaj_codes fallback_pc
      WHERE fallback_pc.is_active=1 AND fallback_pc.status=ss.status
        AND (ss.status!='on_leave' OR fallback_pc.leave_type=COALESCE(ss.leave_type, lr.leave_type))
      ORDER BY fallback_pc.is_builtin DESC, fallback_pc.sort_order, fallback_pc.id LIMIT 1
    ))
    WHERE ss.work_date BETWEEN ? AND ?
    GROUP BY ss.staff_id`
}

// Proje (kadro) süzme kuralı — TEK NOKTA. 'none' = kadrosu atanmamış.
// Boş/null verilirse süzme yapılmaz. Kolon adı çağırana göre değişir
// (s.project_id / staff tablosunun takma adı).
export function projectFilterSql(projectId, column = 's.project_id') {
  if (projectId === 'none') return { sql: ` AND ${column} IS NULL`, params: [] }
  if (projectId === undefined || projectId === null || projectId === '') return { sql: '', params: [] }
  return { sql: ` AND ${column} = ?`, params: [Number(projectId)] }
}

export function getPuantaj(monthStart, monthEnd, deptId, projectId = null) {
  const db = getDB()
  let query = `
    SELECT
      s.id, s.full_name, s.position, s.salary, s.gender, s.tc_no,
      CASE WHEN period_sa.id IS NOT NULL THEN period_sa.department_id ELSE COALESCE(sch.snapshot_dept_id, s.department_id) END as department_id,
      CASE WHEN period_sa.id IS NOT NULL THEN period_sa.role_id ELSE s.role_id END as role_id,
      d.name as dept_name, d.color_class as dept_color,
      s.project_id, pr.name as project_name, pr.code as project_code, pr.color_class as project_color,
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
      COALESCE(sch.other_leave_days, 0) as other_leave_days,
      COALESCE(sch.paid_leave_units, 0) as paid_leave_units,
      COALESCE(sch.sgk_day_units, 0) as sgk_day_units,
      COALESCE(sch.missing_required_documents, 0) as missing_required_documents
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
      ${puantajUnitsSubquery()}
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
    LEFT JOIN projects pr ON pr.id = s.project_id
    WHERE (s.is_active = 1 OR COALESCE(sch.total_days, 0) > 0 OR COALESCE(ot.overtime_count, 0) > 0)
  `
  const params = [monthEnd, monthEnd, monthStart, monthEnd, monthStart, monthEnd]
  if (deptId) {
    query += ' AND CASE WHEN period_sa.id IS NOT NULL THEN period_sa.department_id ELSE COALESCE(sch.snapshot_dept_id, s.department_id) END = ?'
    params.push(deptId)
  }
  const proje = projectFilterSql(projectId)
  query += proje.sql
  params.push(...proje.params)
  query += ' ORDER BY d.name, s.full_name'
  return db.prepare(query).all(...params)
}

// Kadrosu bir projede olup fiilen BAŞKA projenin noktasında çalışanlar.
// İki alan bilerek ayrı tutuluyor (bkz. migration 084) — bu sorgu o ayrımın
// karşılığı: "FPU listesinde ama Kamp'ta çalışanlar".
export function getProjectMismatch(from, to) {
  return getDB().prepare(`
    SELECT ss.work_date, s.id AS staff_id, s.full_name,
           s.project_id AS roster_project_id, rp.name AS roster_project_name,
           wl.project_id AS worked_project_id, wp.name AS worked_project_name,
           wl.id AS work_location_id, wl.name AS work_location_name,
           ss.status
    FROM shift_schedule ss
    JOIN staff s ON s.id = ss.staff_id
    JOIN work_locations wl ON wl.id = ss.work_location_id
    JOIN projects rp ON rp.id = s.project_id
    JOIN projects wp ON wp.id = wl.project_id
    WHERE ss.work_date BETWEEN ? AND ?
      AND s.project_id <> wl.project_id
    ORDER BY ss.work_date, s.full_name
  `).all(from, to)
}
