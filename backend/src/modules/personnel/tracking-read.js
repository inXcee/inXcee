import { getDB } from '../../shared/db/index.js'
import { PERSONNEL_EVENT_TYPES } from './tracking-events.js'

const EVENT_SET = new Set(PERSONNEL_EVENT_TYPES)

function fail(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode })
}

function isoDate(value, label) {
  const normalized = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw fail(`${label} YYYY-MM-DD olmali`)
  return normalized
}

function period(filters = {}) {
  const db = getDB()
  const today = db.prepare("SELECT date('now','localtime') AS value").get().value
  const from = filters.from
    ? isoDate(filters.from, 'Baslangic tarihi')
    : db.prepare("SELECT date(?, '-29 days') AS value").get(today).value
  const to = filters.to ? isoDate(filters.to, 'Bitis tarihi') : today
  if (from > to) throw fail('Baslangic tarihi bitis tarihinden sonra olamaz')
  return { from, to }
}

function currentStaffFilters(filters, alias = 's') {
  const where = ['1=1']
  const params = []
  if (filters.project_id === 'none') where.push(`${alias}.project_id IS NULL`)
  else if (filters.project_id) { where.push(`${alias}.project_id=?`); params.push(Number(filters.project_id)) }
  if (filters.department_id) { where.push(`${alias}.department_id=?`); params.push(Number(filters.department_id)) }
  if (filters.status === 'active') where.push(`${alias}.is_active=1 AND ${alias}.offboarding_started_at IS NULL`)
  else if (filters.status === 'offboarding') where.push(`${alias}.is_active=1 AND ${alias}.offboarding_started_at IS NOT NULL`)
  else if (filters.status === 'exited') where.push(`${alias}.is_active=0`)
  if (filters.q) {
    const like = `%${String(filters.q).trim()}%`
    where.push(`(${alias}.full_name LIKE ? OR ${alias}.tc_no LIKE ? OR ${alias}.phone LIKE ? OR ${alias}.position LIKE ?)`)
    params.push(like, like, like, like)
  }
  return { sql: where.join(' AND '), params }
}

export function getTrackingOverview(filters = {}) {
  const db = getDB()
  const { from, to } = period(filters)
  const staffFilter = currentStaffFilters(filters)
  const eventTypeFilter = filters.event_type
    ? (() => {
      if (!EVENT_SET.has(filters.event_type)) throw fail('Olay turu desteklenmiyor')
      return filters.event_type
    })()
    : null

  const staffCounts = db.prepare(`
    SELECT
      SUM(CASE WHEN s.is_active=1 AND s.offboarding_started_at IS NULL THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN s.is_active=1 AND s.offboarding_started_at IS NOT NULL THEN 1 ELSE 0 END) AS offboarding,
      SUM(CASE WHEN s.is_active=0 THEN 1 ELSE 0 END) AS exited,
      SUM(CASE WHEN s.hire_date BETWEEN ? AND ? THEN 1 ELSE 0 END) AS hired
    FROM staff s
    WHERE ${staffFilter.sql}
  `).get(from, to, ...staffFilter.params)

  const eventParams = [from, to, ...staffFilter.params]
  let eventSql = `
    SELECT e.event_type, COUNT(*) AS count
    FROM personnel_tracking_events e
    JOIN staff s ON s.id=e.staff_id
    WHERE date(e.effective_at) BETWEEN ? AND ? AND ${staffFilter.sql}
  `
  if (eventTypeFilter) { eventSql += ' AND e.event_type=?'; eventParams.push(eventTypeFilter) }
  eventSql += ' GROUP BY e.event_type'
  const eventCounts = Object.fromEntries(db.prepare(eventSql).all(...eventParams).map(row => [row.event_type, row.count]))
  const permanentMovements = eventTypeFilter && eventTypeFilter !== 'assignment_changed'
    ? 0
    : db.prepare(`
      SELECT COUNT(*) AS count
      FROM personnel_tracking_events e
      JOIN staff s ON s.id=e.staff_id
      WHERE e.event_type='assignment_changed' AND e.before_json IS NOT NULL
        AND date(e.effective_at) BETWEEN ? AND ? AND ${staffFilter.sql}
    `).get(from, to, ...staffFilter.params).count

  const temporaryWork = db.prepare(`
    SELECT COUNT(*) AS count
    FROM shift_schedule ss
    JOIN staff s ON s.id=ss.staff_id
    JOIN work_locations wl ON wl.id=ss.work_location_id
    WHERE ss.work_date BETWEEN ? AND ?
      AND wl.project_id IS NOT NULL AND s.project_id IS NOT NULL
      AND wl.project_id<>s.project_id AND ${staffFilter.sql}
  `).get(from, to, ...staffFilter.params).count

  const leave = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN lr.leave_type='annual' THEN lr.total_days ELSE 0 END),0) AS annual_days,
      COALESCE(SUM(CASE WHEN lr.leave_type='sick' THEN lr.total_days ELSE 0 END),0) AS sick_days,
      COALESCE(SUM(CASE WHEN lr.leave_type NOT IN ('annual','sick') THEN lr.total_days ELSE 0 END),0) AS other_days,
      COUNT(*) AS occurrences
    FROM leave_requests lr
    JOIN staff s ON s.id=lr.staff_id
    WHERE lr.status='approved' AND lr.end_date>=? AND lr.start_date<=?
      AND ${staffFilter.sql}
  `).get(from, to, ...staffFilter.params)

  const operations = db.prepare(`
    SELECT
      COALESCE((SELECT SUM(ot.hours) FROM overtime_records ot JOIN staff os ON os.id=ot.staff_id
        WHERE ot.work_date BETWEEN ? AND ? AND ${currentStaffFilters(filters, 'os').sql}),0) AS overtime_hours,
      COALESCE((SELECT COUNT(*) FROM shift_schedule ss JOIN staff axs ON axs.id=ss.staff_id
        WHERE ss.work_date BETWEEN ? AND ? AND ss.status='absent' AND ${currentStaffFilters(filters, 'axs').sql}),0) AS absent_days
  `).get(from, to, ...currentStaffFilters(filters, 'os').params,
    from, to, ...currentStaffFilters(filters, 'axs').params)

  const alertCounts = db.prepare(`
    SELECT
      SUM(CASE WHEN a.status IN ('open','acknowledged') THEN 1 ELSE 0 END) AS open,
      SUM(CASE WHEN a.status IN ('open','acknowledged') AND a.due_at<datetime('now','localtime') THEN 1 ELSE 0 END) AS overdue,
      SUM(CASE WHEN a.status IN ('open','acknowledged') AND a.severity='critical' THEN 1 ELSE 0 END) AS critical
    FROM personnel_tracking_alerts a
    JOIN staff s ON s.id=a.staff_id
    WHERE ${staffFilter.sql}
  `).get(...staffFilter.params)

  const trends = db.prepare(`
    SELECT month,
      SUM(shift_changes) AS shift_changes,
      SUM(movements) AS movements,
      SUM(exits) AS exits
    FROM (
      SELECT substr(e.effective_at,1,7) AS month,
        SUM(CASE WHEN e.event_type='shift_changed' THEN 1 ELSE 0 END) AS shift_changes,
        SUM(CASE WHEN e.event_type='assignment_changed' AND e.before_json IS NOT NULL THEN 1 ELSE 0 END) AS movements,
        SUM(CASE WHEN e.event_type='employment_ended' THEN 1 ELSE 0 END) AS exits
      FROM personnel_tracking_events e
      JOIN staff s ON s.id=e.staff_id
      WHERE date(e.effective_at) BETWEEN ? AND ? AND ${staffFilter.sql}
      GROUP BY substr(e.effective_at,1,7)
    ) GROUP BY month ORDER BY month
  `).all(from, to, ...staffFilter.params)

  return {
    period: { from, to },
    filters,
    kpis: {
      active: Number(staffCounts.active || 0),
      offboarding: Number(staffCounts.offboarding || 0),
      exited: Number(staffCounts.exited || 0),
      hired: Number(staffCounts.hired || 0),
      permanent_movements: Number(permanentMovements || 0),
      temporary_project_work: Number(temporaryWork || 0),
      shift_changes: Number(eventCounts.shift_changed || 0),
      annual_leave_days: Number(leave.annual_days || 0),
      sick_leave_days: Number(leave.sick_days || 0),
      other_leave_days: Number(leave.other_days || 0),
      leave_occurrences: Number(leave.occurrences || 0),
      overtime_hours: Number(operations.overtime_hours || 0),
      absent_days: Number(operations.absent_days || 0),
      open_alerts: Number(alertCounts.open || 0),
      overdue_alerts: Number(alertCounts.overdue || 0),
      critical_alerts: Number(alertCounts.critical || 0),
    },
    event_counts: eventCounts,
    trends,
  }
}

export function listTrackingPeople(filters = {}) {
  const db = getDB()
  const { from, to } = period(filters)
  const staffFilter = currentStaffFilters(filters)
  const limit = Math.min(500, Math.max(1, Number(filters.limit) || 200))
  const rows = db.prepare(`
    SELECT s.id, s.full_name, s.phone, s.position, s.hire_date, s.is_active,
      s.offboarding_started_at, s.exit_date, s.exit_type,
      s.project_id, p.name AS project_name,
      s.department_id, d.name AS department_name,
      CASE WHEN s.is_active=0 THEN 'exited'
        WHEN s.offboarding_started_at IS NOT NULL THEN 'offboarding' ELSE 'active' END AS employment_status,
      COALESCE((SELECT SUM(lr.total_days) FROM leave_requests lr
        WHERE lr.staff_id=s.id AND lr.status='approved' AND lr.leave_type='annual'
          AND lr.end_date>=? AND lr.start_date<=?),0) AS annual_leave_days,
      COALESCE((SELECT SUM(lr.total_days) FROM leave_requests lr
        WHERE lr.staff_id=s.id AND lr.status='approved' AND lr.leave_type='sick'
          AND lr.end_date>=? AND lr.start_date<=?),0) AS sick_leave_days,
      COALESCE((SELECT COUNT(*) FROM leave_requests lr
        WHERE lr.staff_id=s.id AND lr.status='approved' AND lr.leave_type='sick'
          AND lr.end_date>=? AND lr.start_date<=?),0) AS sick_occurrences,
      COALESCE((SELECT SUM(ot.hours) FROM overtime_records ot
        WHERE ot.staff_id=s.id AND ot.work_date BETWEEN ? AND ?),0) AS overtime_hours,
      COALESCE((SELECT COUNT(*) FROM shift_schedule ss
        WHERE ss.staff_id=s.id AND ss.status='absent' AND ss.work_date BETWEEN ? AND ?),0) AS absent_days,
      COALESCE((SELECT COUNT(*) FROM personnel_tracking_events e
        WHERE e.staff_id=s.id AND e.event_type='shift_changed' AND date(e.effective_at) BETWEEN ? AND ?),0) AS shift_changes,
      COALESCE((SELECT COUNT(*) FROM personnel_tracking_events e
        WHERE e.staff_id=s.id AND e.event_type='assignment_changed' AND e.before_json IS NOT NULL
          AND date(e.effective_at) BETWEEN ? AND ?),0) AS permanent_movements,
      COALESCE((SELECT COUNT(*) FROM personnel_tracking_alerts a
        WHERE a.staff_id=s.id AND a.status IN ('open','acknowledged')),0) AS open_alerts,
      (SELECT e.event_type FROM personnel_tracking_events e WHERE e.staff_id=s.id
        ORDER BY e.effective_at DESC, e.id DESC LIMIT 1) AS last_event_type,
      (SELECT e.effective_at FROM personnel_tracking_events e WHERE e.staff_id=s.id
        ORDER BY e.effective_at DESC, e.id DESC LIMIT 1) AS last_event_at
    FROM staff s
    LEFT JOIN projects p ON p.id=s.project_id
    LEFT JOIN departments d ON d.id=s.department_id
    WHERE ${staffFilter.sql}
    ORDER BY open_alerts DESC, s.full_name
    LIMIT ?
  `).all(
    from, to, from, to, from, to, from, to, from, to,
    from, to, from, to,
    ...staffFilter.params, limit,
  )
  return { period: { from, to }, items: rows, total: rows.length }
}

export function getTrackingExportDetails(filters = {}) {
  const db = getDB()
  const { from, to } = period(filters)
  const staffFilter = currentStaffFilters(filters)
  const leaves = db.prepare(`
    SELECT lr.*, s.full_name, p.name AS project_name, d.name AS department_name,
      u.full_name AS approved_by_name
    FROM leave_requests lr
    JOIN staff s ON s.id=lr.staff_id
    LEFT JOIN projects p ON p.id=s.project_id
    LEFT JOIN departments d ON d.id=s.department_id
    LEFT JOIN users u ON u.id=lr.approved_by
    WHERE lr.end_date>=? AND lr.start_date<=? AND ${staffFilter.sql}
    ORDER BY lr.start_date DESC, lr.id DESC
  `).all(from, to, ...staffFilter.params)
  const overtime = db.prepare(`
    SELECT ot.*, s.full_name, p.name AS project_name, d.name AS department_name,
      u.full_name AS approved_by_name
    FROM overtime_records ot
    JOIN staff s ON s.id=ot.staff_id
    LEFT JOIN projects p ON p.id=s.project_id
    LEFT JOIN departments d ON d.id=s.department_id
    LEFT JOIN users u ON u.id=ot.approved_by
    WHERE ot.work_date BETWEEN ? AND ? AND ${staffFilter.sql}
    ORDER BY ot.work_date DESC, ot.id DESC
  `).all(from, to, ...staffFilter.params)
  const temporaryWork = db.prepare(`
    SELECT ss.id, ss.work_date, ss.status, s.id AS staff_id, s.full_name,
      p.name AS permanent_project_name, wp.name AS work_project_name,
      d.name AS department_name, wl.name AS work_location_name,
      sd.name AS shift_name
    FROM shift_schedule ss
    JOIN staff s ON s.id=ss.staff_id
    JOIN work_locations wl ON wl.id=ss.work_location_id
    JOIN projects wp ON wp.id=wl.project_id
    LEFT JOIN projects p ON p.id=s.project_id
    LEFT JOIN departments d ON d.id=s.department_id
    LEFT JOIN shift_definitions sd ON sd.id=ss.shift_def_id
    WHERE ss.work_date BETWEEN ? AND ?
      AND s.project_id IS NOT NULL AND wl.project_id<>s.project_id
      AND ${staffFilter.sql}
    ORDER BY ss.work_date DESC, ss.id DESC
  `).all(from, to, ...staffFilter.params)
  return { period: { from, to }, leaves, overtime, temporary_work: temporaryWork }
}

function parseEvent(row) {
  return {
    ...row,
    before: row.before_json ? JSON.parse(row.before_json) : null,
    after: row.after_json ? JSON.parse(row.after_json) : null,
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : null,
  }
}

export function listTrackingEvents(filters = {}) {
  const db = getDB()
  const { from, to } = period(filters)
  const where = ['date(e.effective_at) BETWEEN ? AND ?']
  const params = [from, to]
  const staffFilter = currentStaffFilters(filters)
  where.push(staffFilter.sql)
  params.push(...staffFilter.params)
  if (filters.staff_id) { where.push('e.staff_id=?'); params.push(Number(filters.staff_id)) }
  if (filters.event_type) {
    if (!EVENT_SET.has(filters.event_type)) throw fail('Olay turu desteklenmiyor')
    where.push('e.event_type=?'); params.push(filters.event_type)
  }
  const page = Math.max(1, Number(filters.page) || 1)
  const limit = Math.min(200, Math.max(1, Number(filters.limit) || 50))
  const total = db.prepare(`
    SELECT COUNT(*) AS count
    FROM personnel_tracking_events e JOIN staff s ON s.id=e.staff_id
    WHERE ${where.join(' AND ')}
  `).get(...params).count
  const items = db.prepare(`
    SELECT e.*, s.full_name, p.name AS project_name, d.name AS department_name,
      u.full_name AS actor_name
    FROM personnel_tracking_events e
    JOIN staff s ON s.id=e.staff_id
    LEFT JOIN projects p ON p.id=s.project_id
    LEFT JOIN departments d ON d.id=s.department_id
    LEFT JOIN users u ON u.id=e.actor_user_id
    WHERE ${where.join(' AND ')}
    ORDER BY e.effective_at DESC, e.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, (page - 1) * limit).map(parseEvent)
  return { period: { from, to }, items, total: Number(total), page, limit }
}

export function getPersonTracking(staffId, filters = {}) {
  const db = getDB()
  const id = Number(staffId)
  if (!Number.isInteger(id) || id <= 0) throw fail('Personel kimligi gecersiz')
  const staff = db.prepare(`
    SELECT s.*, p.name AS project_name, d.name AS department_name, r.name AS role_name
    FROM staff s
    LEFT JOIN projects p ON p.id=s.project_id
    LEFT JOIN departments d ON d.id=s.department_id
    LEFT JOIN staff_roles r ON r.id=s.role_id
    WHERE s.id=?
  `).get(id)
  if (!staff) throw fail('Personel bulunamadi', 404)
  const { from, to } = period(filters)
  const shifts = db.prepare(`
    SELECT ss.*, sd.name AS shift_name, wl.name AS work_location_name,
      wp.name AS work_project_name
    FROM shift_schedule ss
    LEFT JOIN shift_definitions sd ON sd.id=ss.shift_def_id
    LEFT JOIN work_locations wl ON wl.id=ss.work_location_id
    LEFT JOIN projects wp ON wp.id=wl.project_id
    WHERE ss.staff_id=? AND ss.work_date BETWEEN ? AND ?
    ORDER BY ss.work_date DESC, ss.id DESC
  `).all(id, from, to)
  const leaves = db.prepare(`
    SELECT * FROM leave_requests
    WHERE staff_id=? AND end_date>=? AND start_date<=?
    ORDER BY start_date DESC, id DESC
  `).all(id, from, to)
  const overtime = db.prepare(`
    SELECT * FROM overtime_records
    WHERE staff_id=? AND work_date BETWEEN ? AND ?
    ORDER BY work_date DESC, id DESC
  `).all(id, from, to)
  const assignments = db.prepare(`
    SELECT sa.*, p.name AS project_name, d.name AS department_name,
      r.name AS role_name, wl.name AS work_location_name
    FROM staff_assignments sa
    LEFT JOIN projects p ON p.id=sa.project_id
    LEFT JOIN departments d ON d.id=sa.department_id
    LEFT JOIN staff_roles r ON r.id=sa.role_id
    LEFT JOIN work_locations wl ON wl.id=sa.work_location_id
    WHERE sa.staff_id=?
    ORDER BY sa.effective_from DESC, sa.id DESC
  `).all(id)
  const events = listTrackingEvents({ ...filters, staff_id: id, from, to, limit: filters.event_limit || 100 })
  const eventSummary = db.prepare(`
    SELECT
      SUM(CASE WHEN event_type='shift_changed' THEN 1 ELSE 0 END) AS shift_changes,
      SUM(CASE WHEN event_type='assignment_changed' AND before_json IS NOT NULL THEN 1 ELSE 0 END) AS permanent_movements
    FROM personnel_tracking_events
    WHERE staff_id=? AND date(effective_at) BETWEEN ? AND ?
  `).get(id, from, to)
  const summary = {
    scheduled_days: shifts.filter(row => row.status === 'scheduled').length,
    worked_days: shifts.filter(row => ['worked', 'overtime'].includes(row.status)).length,
    absent_days: shifts.filter(row => row.status === 'absent').length,
    leave_days_actual: shifts.filter(row => row.status === 'on_leave').length,
    approved_leave_days: leaves.filter(row => row.status === 'approved').reduce((sum, row) => sum + Number(row.total_days || 0), 0),
    sick_days: leaves.filter(row => row.status === 'approved' && row.leave_type === 'sick').reduce((sum, row) => sum + Number(row.total_days || 0), 0),
    overtime_hours: overtime.reduce((sum, row) => sum + Number(row.hours || 0), 0),
    shift_changes: Number(eventSummary.shift_changes || 0),
    permanent_movements: Number(eventSummary.permanent_movements || 0),
  }
  return { period: { from, to }, staff, summary, shifts, leaves, overtime, assignments, events: events.items }
}
