import { getDB } from '../../shared/db/index.js'
import { currentStaffFilters, trackingPeriod } from './tracking-read.js'

const METRICS = new Set([
  'active', 'offboarding', 'exited', 'hired', 'transfer', 'temporary_work',
  'shift_change', 'leave', 'overtime', 'absence', 'open_alerts',
  'overdue_critical', 'people', 'movement',
])
const VIEWS = new Set(['people', 'records'])
const ORDERS = new Set(['asc', 'desc'])
const SORT_FIELDS = new Set([
  'full_name', 'occurred_at', 'quantity', 'record_count', 'total_quantity',
  'project_name', 'department_name', 'status',
])
const LEAVE_STATUSES = new Set(['pending', 'approved', 'rejected'])
const OVERTIME_STATUSES = new Set(['recorded', 'pending', 'approved', 'rejected', 'returned'])

const CONFIG = {
  active: { definition: 'Bugünkü aktif personel', scope: 'current', unit: 'person' },
  offboarding: { definition: 'Bugün işten çıkış sürecindeki personel', scope: 'current', unit: 'person' },
  exited: { definition: 'Seçili dönemde işten çıkan personel', scope: 'period', unit: 'person' },
  hired: { definition: 'Seçili dönemde işe başlayan personel', scope: 'period', unit: 'person' },
  transfer: { definition: 'Seçili dönemdeki kalıcı atama değişiklikleri', scope: 'period', unit: 'record' },
  temporary_work: { definition: 'Kalıcı projesinden farklı projede çalışılan vardiyalar', scope: 'period', unit: 'record' },
  shift_change: { definition: 'Seçili dönemdeki vardiya revizyonları', scope: 'period', unit: 'record' },
  leave: { definition: 'Seçili dönemle çakışan izin ve rapor kayıtları', scope: 'period', unit: 'day' },
  overtime: { definition: 'Seçili dönemde kaydedilen fazla mesai', scope: 'period', unit: 'hour' },
  absence: { definition: 'Seçili dönemde devamsız işaretlenen vardiyalar', scope: 'period', unit: 'day' },
  open_alerts: { definition: 'Bugün açık veya görülmüş takip aksiyonları', scope: 'current', unit: 'action' },
  overdue_critical: { definition: 'Bugün gecikmiş veya kritik takip aksiyonları', scope: 'current', unit: 'action' },
  people: { definition: 'Seçili proje ve departman kapsamındaki personel', scope: 'current', unit: 'person' },
  movement: { definition: 'Seçilen ayın vardiya, atama ve çıkış hareketleri', scope: 'period', unit: 'record' },
}

function fail(message, statusCode = 400) {
  throw Object.assign(new Error(message), { statusCode })
}

function positiveId(value, label) {
  if (value == null || value === '') return null
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) fail(`${label} gecersiz`)
  return parsed
}

function drilldownPeriod(filters) {
  const base = trackingPeriod(filters)
  if (!filters.bucket) return base
  const bucket = String(filters.bucket)
  if (!/^\d{4}-\d{2}$/.test(bucket)) fail('Ay kovasi YYYY-MM olmali')
  const monthStart = `${bucket}-01`
  const db = getDB()
  const monthEnd = db.prepare("SELECT date(?, '+1 month', '-1 day') AS value").get(monthStart).value
  return { from: base.from > monthStart ? base.from : monthStart, to: base.to < monthEnd ? base.to : monthEnd }
}

function parseJson(value) {
  if (!value) return null
  try { return JSON.parse(value) } catch { return null }
}

function staffConstraint(filters, alias = 's') {
  const base = currentStaffFilters(filters, alias)
  const staffId = positiveId(filters.staff_id, 'Personel kimligi')
  if (!staffId) return base
  return { sql: `${base.sql} AND ${alias}.id=?`, params: [...base.params, staffId] }
}

function identity(row, extra = {}) {
  return {
    record_id: row.record_id ?? row.staff_id,
    staff_id: Number(row.staff_id),
    full_name: row.full_name,
    position: row.position || null,
    project_id: row.project_id == null ? null : Number(row.project_id),
    project_name: row.project_name || null,
    department_id: row.department_id == null ? null : Number(row.department_id),
    department_name: row.department_name || null,
    employment_status: row.employment_status || null,
    occurred_at: row.occurred_at || null,
    end_at: row.end_at || null,
    metric_type: row.metric_type || null,
    subtype: row.subtype || null,
    quantity: Number(row.quantity || 0),
    unit: row.unit || 'record',
    hour_quantity: Number(row.hour_quantity || 0),
    status: row.status || null,
    reason: row.reason || null,
    actor_name: row.actor_name || null,
    source_type: row.source_type || null,
    source_id: row.source_id == null ? null : String(row.source_id),
    source_route: row.source_route || null,
    before: parseJson(row.before_json),
    after: parseJson(row.after_json),
    ...extra,
  }
}

function statusRecords(metric, filters, period) {
  const db = getDB()
  const sf = staffConstraint(filters)
  const conditions = []
  const params = []
  if (metric === 'active') conditions.push('s.is_active=1', 's.offboarding_started_at IS NULL')
  else if (metric === 'offboarding') conditions.push('s.is_active=1', 's.offboarding_started_at IS NOT NULL')
  else if (metric === 'people') conditions.push('1=1')
  else if (metric === 'hired') { conditions.push('s.hire_date BETWEEN ? AND ?'); params.push(period.from, period.to) }
  else if (metric === 'exited') {
    conditions.push(`s.is_active=0 AND (
      s.exit_date BETWEEN ? AND ? OR (
        s.exit_date IS NULL AND EXISTS (
          SELECT 1 FROM personnel_tracking_events xe
          WHERE xe.staff_id=s.id AND xe.event_type='employment_ended'
            AND date(xe.effective_at) BETWEEN ? AND ?
        )
      )
    )`)
    params.push(period.from, period.to, period.from, period.to)
  }
  const rows = db.prepare(`
    SELECT s.id AS staff_id, s.id AS record_id, s.full_name, s.position,
      s.project_id, p.name AS project_name, s.department_id, d.name AS department_name,
      CASE WHEN s.is_active=0 THEN 'exited' WHEN s.offboarding_started_at IS NOT NULL THEN 'offboarding' ELSE 'active' END AS employment_status,
      CASE WHEN ?='hired' THEN s.hire_date WHEN ?='exited' THEN COALESCE(s.exit_date, (
        SELECT date(e.effective_at) FROM personnel_tracking_events e
        WHERE e.staff_id=s.id AND e.event_type='employment_ended'
        ORDER BY e.effective_at DESC, e.id DESC LIMIT 1
      )) WHEN ?='offboarding' THEN s.offboarding_started_at ELSE s.created_at END AS occurred_at,
      ? AS metric_type, 1 AS quantity, 'person' AS unit,
      CASE WHEN s.is_active=0 THEN 'exited' WHEN s.offboarding_started_at IS NOT NULL THEN 'offboarding' ELSE 'active' END AS status,
      s.exit_type AS subtype, s.exit_reason AS reason, 'staff' AS source_type, s.id AS source_id,
      (SELECT COUNT(*) FROM staff_followups f WHERE f.staff_id=s.id AND f.status='open') AS open_followups,
      (SELECT COUNT(*) FROM hr_checklists c WHERE c.staff_id=s.id AND c.kind='offboarding' AND c.status='open') AS open_checklists,
      (SELECT COUNT(*) FROM inventory_checkouts ic WHERE ic.staff_id=s.id AND ic.returned_at IS NULL) +
      (SELECT COUNT(*) FROM kkd_assignments ka WHERE ka.staff_id=s.id AND ka.returned_at IS NULL) +
      (SELECT COUNT(*) FROM staff_uniform_issues ui WHERE ui.staff_id=s.id AND ui.returned_at IS NULL) AS open_equipment
    FROM staff s
    LEFT JOIN projects p ON p.id=s.project_id
    LEFT JOIN departments d ON d.id=s.department_id
    WHERE ${conditions.join(' AND ')} AND ${sf.sql}
  `).all(metric, metric, metric, metric, ...params, ...sf.params)
  const route = metric === 'offboarding' || metric === 'exited' ? 'hr' : 'work'
  return rows.map(row => identity(row, {
    open_followups: Number(row.open_followups || 0),
    open_checklists: Number(row.open_checklists || 0),
    open_equipment: Number(row.open_equipment || 0),
    source_route: `/shifts/personnel/${row.staff_id}?tab=${route}`,
  }))
}

function eventRecords(metric, filters, period) {
  const db = getDB()
  const sf = staffConstraint(filters)
  const types = metric === 'transfer'
    ? ['assignment_changed']
    : metric === 'shift_change'
      ? ['shift_changed']
      : ['shift_changed', 'assignment_changed', 'employment_ended']
  const placeholders = types.map(() => '?').join(',')
  const rows = db.prepare(`
    SELECT e.id AS record_id, e.staff_id, s.full_name, s.position,
      s.project_id, p.name AS project_name, s.department_id, d.name AS department_name,
      CASE WHEN s.is_active=0 THEN 'exited' WHEN s.offboarding_started_at IS NOT NULL THEN 'offboarding' ELSE 'active' END AS employment_status,
      e.effective_at AS occurred_at, e.event_type AS metric_type, e.event_type AS subtype,
      1 AS quantity, 'record' AS unit, 'recorded' AS status, e.reason,
      u.full_name AS actor_name, e.source_type, e.source_id, e.before_json, e.after_json
    FROM personnel_tracking_events e
    JOIN staff s ON s.id=e.staff_id
    LEFT JOIN projects p ON p.id=s.project_id
    LEFT JOIN departments d ON d.id=s.department_id
    LEFT JOIN users u ON u.id=e.actor_user_id
    WHERE e.event_type IN (${placeholders}) AND date(e.effective_at) BETWEEN ? AND ?
      AND ${sf.sql}
  `).all(...types, period.from, period.to, ...sf.params)
  return rows
    .filter(row => metric !== 'transfer' || row.before_json != null)
    .map(row => identity(row, { source_route: `/shifts/personnel/${row.staff_id}?tab=timeline` }))
}

function temporaryWorkRecords(filters, period) {
  const db = getDB()
  const sf = staffConstraint(filters)
  return db.prepare(`
    SELECT ss.id AS record_id, ss.staff_id, s.full_name, s.position,
      s.project_id, pp.name AS project_name, s.department_id, d.name AS department_name,
      CASE WHEN s.is_active=0 THEN 'exited' WHEN s.offboarding_started_at IS NOT NULL THEN 'offboarding' ELSE 'active' END AS employment_status,
      ss.work_date AS occurred_at, 'temporary_project_work' AS metric_type,
      wp.name AS subtype, 1 AS quantity, 'record' AS unit, ss.status,
      ss.absent_reason AS reason, 'shift_schedule' AS source_type, ss.id AS source_id,
      wp.id AS work_project_id, wp.name AS work_project_name,
      wl.id AS work_location_id, wl.name AS work_location_name, sd.name AS shift_name
    FROM shift_schedule ss
    JOIN staff s ON s.id=ss.staff_id
    JOIN work_locations wl ON wl.id=ss.work_location_id
    JOIN projects wp ON wp.id=wl.project_id
    LEFT JOIN projects pp ON pp.id=s.project_id
    LEFT JOIN departments d ON d.id=s.department_id
    LEFT JOIN shift_definitions sd ON sd.id=ss.shift_def_id
    WHERE ss.work_date BETWEEN ? AND ? AND s.project_id IS NOT NULL
      AND wp.id<>s.project_id AND ${sf.sql}
  `).all(period.from, period.to, ...sf.params).map(row => identity(row, {
    work_project_id: Number(row.work_project_id), work_project_name: row.work_project_name,
    work_location_id: Number(row.work_location_id), work_location_name: row.work_location_name,
    shift_name: row.shift_name, source_route: `/shifts?tab=schedule&staff=${row.staff_id}`,
  }))
}

function leaveRecords(filters, period) {
  const db = getDB()
  const sf = staffConstraint(filters)
  const recordStatus = filters.record_status || 'approved'
  if (!LEAVE_STATUSES.has(recordStatus)) fail('Izin kayit durumu desteklenmiyor')
  const subtype = String(filters.subtype || '')
  const subtypeSql = subtype === 'other'
    ? "AND lr.leave_type NOT IN ('annual','sick')"
    : subtype ? 'AND lr.leave_type=?' : ''
  const subtypeParams = subtype && subtype !== 'other' ? [subtype] : []
  return db.prepare(`
    SELECT lr.id AS record_id, lr.staff_id, s.full_name, s.position,
      s.project_id, p.name AS project_name, s.department_id, d.name AS department_name,
      CASE WHEN s.is_active=0 THEN 'exited' WHEN s.offboarding_started_at IS NOT NULL THEN 'offboarding' ELSE 'active' END AS employment_status,
      MAX(lr.start_date, ?) AS occurred_at, MIN(lr.end_date, ?) AS end_at,
      'leave' AS metric_type, lr.leave_type AS subtype,
      CASE WHEN lr.leave_hours IS NOT NULL THEN lr.leave_hours ELSE
        MAX(0, julianday(MIN(lr.end_date, ?)) - julianday(MAX(lr.start_date, ?)) + 1)
      END AS quantity,
      CASE WHEN lr.leave_hours IS NOT NULL THEN 'hour' ELSE 'day' END AS unit,
      COALESCE(lr.leave_hours,0) AS hour_quantity, lr.status, lr.reason,
      u.full_name AS actor_name, 'leave_request' AS source_type, lr.id AS source_id
    FROM leave_requests lr
    JOIN staff s ON s.id=lr.staff_id
    LEFT JOIN projects p ON p.id=s.project_id
    LEFT JOIN departments d ON d.id=s.department_id
    LEFT JOIN users u ON u.id=lr.approved_by
    WHERE lr.status=? AND lr.end_date>=? AND lr.start_date<=?
      ${subtypeSql} AND ${sf.sql}
  `).all(period.from, period.to, period.to, period.from, recordStatus, period.from, period.to,
    ...subtypeParams, ...sf.params).map(row => identity(row, {
      source_route: `/shifts?tab=leave&staff=${row.staff_id}`,
    }))
}

function overtimeRecords(filters, period) {
  const db = getDB()
  const sf = staffConstraint(filters)
  const recordStatus = filters.record_status || 'recorded'
  if (!OVERTIME_STATUSES.has(recordStatus)) fail('Mesai kayit durumu desteklenmiyor')
  if (recordStatus !== 'recorded') {
    return db.prepare(`
      SELECT ot.id AS record_id, ot.staff_id, s.full_name, s.position,
        s.project_id, p.name AS project_name, s.department_id, d.name AS department_name,
        CASE WHEN s.is_active=0 THEN 'exited' WHEN s.offboarding_started_at IS NOT NULL THEN 'offboarding' ELSE 'active' END AS employment_status,
        ot.work_date AS occurred_at, 'overtime_request' AS metric_type,
        ot.compensation_type AS subtype, COALESCE(ot.actual_hours,ot.requested_hours) AS quantity,
        'hour' AS unit, ot.status, ot.reason, u.full_name AS actor_name,
        'overtime_request' AS source_type, ot.id AS source_id
      FROM overtime_requests ot
      JOIN staff s ON s.id=ot.staff_id
      LEFT JOIN projects p ON p.id=s.project_id
      LEFT JOIN departments d ON d.id=s.department_id
      LEFT JOIN users u ON u.id=ot.reviewed_by
      WHERE ot.status=? AND ot.work_date BETWEEN ? AND ? AND ${sf.sql}
    `).all(recordStatus, period.from, period.to, ...sf.params).map(row => identity(row, {
      source_route: `/shifts?tab=overtime&staff=${row.staff_id}`,
    }))
  }
  return db.prepare(`
    SELECT ot.id AS record_id, ot.staff_id, s.full_name, s.position,
      s.project_id, p.name AS project_name, s.department_id, d.name AS department_name,
      CASE WHEN s.is_active=0 THEN 'exited' WHEN s.offboarding_started_at IS NOT NULL THEN 'offboarding' ELSE 'active' END AS employment_status,
      ot.work_date AS occurred_at, 'overtime' AS metric_type, 'recorded' AS subtype,
      ot.hours AS quantity, 'hour' AS unit, 'recorded' AS status, ot.reason,
      u.full_name AS actor_name, 'overtime_record' AS source_type, ot.id AS source_id
    FROM overtime_records ot
    JOIN staff s ON s.id=ot.staff_id
    LEFT JOIN projects p ON p.id=s.project_id
    LEFT JOIN departments d ON d.id=s.department_id
    LEFT JOIN users u ON u.id=ot.approved_by
    WHERE ot.work_date BETWEEN ? AND ? AND ${sf.sql}
  `).all(period.from, period.to, ...sf.params).map(row => identity(row, {
    source_route: `/shifts?tab=overtime&staff=${row.staff_id}`,
  }))
}

function absenceRecords(filters, period) {
  const db = getDB()
  const sf = staffConstraint(filters)
  return db.prepare(`
    SELECT ss.id AS record_id, ss.staff_id, s.full_name, s.position,
      s.project_id, p.name AS project_name, s.department_id, d.name AS department_name,
      CASE WHEN s.is_active=0 THEN 'exited' WHEN s.offboarding_started_at IS NOT NULL THEN 'offboarding' ELSE 'active' END AS employment_status,
      ss.work_date AS occurred_at, 'absence' AS metric_type, sd.name AS subtype,
      1 AS quantity, 'day' AS unit, 'absent' AS status, ss.absent_reason AS reason,
      'shift_schedule' AS source_type, ss.id AS source_id,
      wl.name AS work_location_name, wp.name AS work_project_name, sd.name AS shift_name
    FROM shift_schedule ss
    JOIN staff s ON s.id=ss.staff_id
    LEFT JOIN projects p ON p.id=s.project_id
    LEFT JOIN departments d ON d.id=s.department_id
    LEFT JOIN shift_definitions sd ON sd.id=ss.shift_def_id
    LEFT JOIN work_locations wl ON wl.id=ss.work_location_id
    LEFT JOIN projects wp ON wp.id=wl.project_id
    WHERE ss.status='absent' AND ss.work_date BETWEEN ? AND ? AND ${sf.sql}
  `).all(period.from, period.to, ...sf.params).map(row => identity(row, {
    work_location_name: row.work_location_name, work_project_name: row.work_project_name,
    shift_name: row.shift_name, source_route: `/shifts?tab=schedule&staff=${row.staff_id}`,
  }))
}

function alertRecords(metric, filters) {
  const db = getDB()
  const sf = staffConstraint(filters)
  const condition = metric === 'open_alerts'
    ? "a.status IN ('open','acknowledged')"
    : "a.status IN ('open','acknowledged') AND (a.severity='critical' OR a.due_at<datetime('now','localtime'))"
  return db.prepare(`
    SELECT a.id AS record_id, a.staff_id, s.full_name, s.position,
      s.project_id, p.name AS project_name, s.department_id, d.name AS department_name,
      CASE WHEN s.is_active=0 THEN 'exited' WHEN s.offboarding_started_at IS NOT NULL THEN 'offboarding' ELSE 'active' END AS employment_status,
      a.first_detected_at AS occurred_at, a.rule_key AS metric_type, a.severity AS subtype,
      1 AS quantity, 'action' AS unit, a.status, a.message AS reason,
      u.full_name AS actor_name, 'personnel_tracking_alert' AS source_type, a.id AS source_id,
      a.due_at, a.severity, a.title, a.followup_id
    FROM personnel_tracking_alerts a
    JOIN staff s ON s.id=a.staff_id
    LEFT JOIN projects p ON p.id=s.project_id
    LEFT JOIN departments d ON d.id=s.department_id
    LEFT JOIN users u ON u.id=a.assigned_user_id
    WHERE ${condition} AND ${sf.sql}
  `).all(...sf.params).map(row => identity(row, {
    due_at: row.due_at, severity: row.severity, title: row.title,
    followup_id: row.followup_id, source_route: `/shifts/personnel/${row.staff_id}?tab=tasks`,
  }))
}

function loadRecords(metric, filters, period) {
  if (['active', 'offboarding', 'exited', 'hired', 'people'].includes(metric)) return statusRecords(metric, filters, period)
  if (['transfer', 'shift_change', 'movement'].includes(metric)) return eventRecords(metric, filters, period)
  if (metric === 'temporary_work') return temporaryWorkRecords(filters, period)
  if (metric === 'leave') return leaveRecords(filters, period)
  if (metric === 'overtime') return overtimeRecords(filters, period)
  if (metric === 'absence') return absenceRecords(filters, period)
  return alertRecords(metric, filters)
}

function groupPeople(records) {
  const groups = new Map()
  for (const record of records) {
    let group = groups.get(record.staff_id)
    if (!group) {
      group = {
        staff_id: record.staff_id, full_name: record.full_name, position: record.position,
        project_id: record.project_id, project_name: record.project_name,
        department_id: record.department_id, department_name: record.department_name,
        employment_status: record.employment_status, record_count: 0, total_quantity: 0,
        day_total: 0, hour_total: 0, last_occurred_at: null, status: record.status,
        breakdown: {}, source_route: `/shifts/personnel/${record.staff_id}?tab=work`,
      }
      groups.set(record.staff_id, group)
    }
    group.record_count += 1
    group.total_quantity += Number(record.quantity || 0)
    if (record.unit === 'day') group.day_total += Number(record.quantity || 0)
    if (record.unit === 'hour') group.hour_total += Number(record.quantity || 0)
    if (!group.last_occurred_at || String(record.occurred_at || '') > String(group.last_occurred_at)) group.last_occurred_at = record.occurred_at
    const key = record.subtype || record.metric_type || 'other'
    group.breakdown[key] = (group.breakdown[key] || 0) + Number(record.quantity || 0)
  }
  return [...groups.values()]
}

function breakdown(records, key) {
  const groups = new Map()
  for (const record of records) {
    const value = record[key] || 'unknown'
    const current = groups.get(value) || { key: value, count: 0, quantity: 0 }
    current.count += 1
    current.quantity += Number(record.quantity || 0)
    groups.set(value, current)
  }
  return [...groups.values()].sort((a, b) => b.quantity - a.quantity || b.count - a.count)
}

function compareValues(left, right, order) {
  const multiplier = order === 'asc' ? 1 : -1
  if (left == null && right == null) return 0
  if (left == null) return 1
  if (right == null) return -1
  if (typeof left === 'number' || typeof right === 'number') return (Number(left) - Number(right)) * multiplier
  return String(left).localeCompare(String(right), 'tr', { sensitivity: 'base', numeric: true }) * multiplier
}

function sortRows(items, view, filters) {
  const fallback = view === 'people' ? 'total_quantity' : 'occurred_at'
  const sort = filters.sort || fallback
  const order = filters.order || (sort === 'full_name' ? 'asc' : 'desc')
  if (!SORT_FIELDS.has(sort)) fail('Siralama alani desteklenmiyor')
  if (!ORDERS.has(order)) fail('Siralama yonu desteklenmiyor')
  return [...items].sort((a, b) => compareValues(a[sort] ?? a.last_occurred_at, b[sort] ?? b.last_occurred_at, order))
}

function undatedExited(filters) {
  const db = getDB()
  const sf = staffConstraint(filters)
  return Number(db.prepare(`
    SELECT COUNT(*) AS count FROM staff s
    WHERE s.is_active=0 AND s.exit_date IS NULL AND NOT EXISTS (
      SELECT 1 FROM personnel_tracking_events e
      WHERE e.staff_id=s.id AND e.event_type='employment_ended'
    ) AND ${sf.sql}
  `).get(...sf.params).count || 0)
}

export function getTrackingDrilldown(filters = {}) {
  const metric = String(filters.metric || '')
  if (!METRICS.has(metric)) fail('Takip metrigi desteklenmiyor')
  const view = String(filters.view || 'people')
  if (!VIEWS.has(view)) fail('Takip detay gorunumu desteklenmiyor')
  const period = drilldownPeriod(filters)
  if (period.from > period.to) {
    return { metric, definition: CONFIG[metric].definition, scope: CONFIG[metric].scope, period, view, summary: { primary_value: 0, primary_unit: CONFIG[metric].unit, people_count: 0, record_count: 0, day_total: 0, hour_total: 0, undated_count: 0 }, breakdowns: { status: [], subtype: [], project: [], department: [] }, items: [], total: 0, page: 1, limit: 50 }
  }
  const records = loadRecords(metric, filters, period)
  const people = groupPeople(records)
  const dayTotal = records.filter(row => row.unit === 'day').reduce((sum, row) => sum + row.quantity, 0)
  const hourTotal = records.filter(row => row.unit === 'hour').reduce((sum, row) => sum + row.quantity, 0)
  const primaryValue = metric === 'leave' ? dayTotal : metric === 'overtime' ? hourTotal : records.length
  const source = view === 'people' ? people : records
  const sorted = sortRows(source, view, filters)
  const page = Math.max(1, Number(filters.page) || 1)
  const limit = Math.min(500, Math.max(1, Number(filters.limit) || 50))
  const start = (page - 1) * limit
  return {
    metric, definition: CONFIG[metric].definition, scope: CONFIG[metric].scope,
    period, view,
    summary: {
      primary_value: primaryValue, primary_unit: CONFIG[metric].unit,
      people_count: people.length, record_count: records.length,
      day_total: dayTotal, hour_total: hourTotal,
      undated_count: metric === 'exited' ? undatedExited(filters) : 0,
    },
    breakdowns: {
      status: breakdown(records, 'status'), subtype: breakdown(records, 'subtype'),
      project: breakdown(records, 'project_name'), department: breakdown(records, 'department_name'),
    },
    items: sorted.slice(start, start + limit), total: sorted.length, page, limit,
  }
}

export { METRICS as PERSONNEL_DRILLDOWN_METRICS }
