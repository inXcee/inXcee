import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import { getDB } from '../../shared/db/index.js'

const ALLOWED_STATUS = new Set(['draft', 'published', 'boarding', 'departed', 'completed', 'cancelled'])
const ALLOWED_DIRECTION = new Set(['outbound', 'inbound'])

function buildFilter(input = {}) {
  const where = ['t.work_date BETWEEN ? AND ?']
  const start = input.start || new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10)
  const end = input.end || new Date().toISOString().slice(0, 10)
  const params = [start, end]
  const numeric = [
    ['route_id', 't.route_id'],
    ['vehicle_id', 't.vehicle_id'],
    ['driver_id', 't.driver_id'],
    ['shift_id', 'COALESCE(tt.shift_def_id,r.shift_def_id)'],
  ]
  for (const [key, column] of numeric) {
    const value = Number(input[key])
    if (Number.isInteger(value) && value > 0) {
      where.push(`${column}=?`)
      params.push(value)
    }
  }
  if (ALLOWED_DIRECTION.has(input.direction)) {
    where.push('t.direction=?')
    params.push(input.direction)
  }
  if (ALLOWED_STATUS.has(input.status)) {
    where.push('t.status=?')
    params.push(input.status)
  }
  return { sql: where.join(' AND '), params, start, end }
}

function baseFrom() {
  return `
    FROM transport_trips t
    JOIN routes r ON r.id=t.route_id
    LEFT JOIN transport_trip_templates tt ON tt.id=t.template_id
    LEFT JOIN shift_definitions sd ON sd.id=COALESCE(tt.shift_def_id,r.shift_def_id)
    LEFT JOIN transport_vehicles v ON v.id=t.vehicle_id
    LEFT JOIN transport_drivers d ON d.id=t.driver_id
  `
}

function number(value) {
  return Number(value || 0)
}

export function getTransportAnalytics(input = {}) {
  const db = getDB()
  const filter = buildFilter(input)
  const from = baseFrom()
  const totals = db.prepare(`
    SELECT
      COUNT(*) AS trips,
      SUM(CASE WHEN t.status='cancelled' THEN 1 ELSE 0 END) AS cancelled,
      SUM(t.capacity_snapshot) AS capacity,
      SUM(CASE WHEN t.status='completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN t.departed_at IS NOT NULL
        AND (julianday(t.departed_at)-julianday(t.scheduled_departure))*1440 <= 5
        THEN 1 ELSE 0 END) AS on_time,
      SUM(CASE WHEN t.departed_at IS NOT NULL THEN 1 ELSE 0 END) AS departed
    ${from}
    WHERE ${filter.sql}
  `).get(...filter.params)

  const assignments = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN a.status='boarded' THEN 1 ELSE 0 END) AS boarded,
      SUM(CASE WHEN a.status='no_show' THEN 1 ELSE 0 END) AS no_show,
      SUM(CASE WHEN a.status='waitlisted' THEN 1 ELSE 0 END) AS waitlisted,
      SUM(CASE WHEN a.status='assigned' THEN 1 ELSE 0 END) AS assigned
    FROM transport_trip_assignments a
    JOIN transport_trips t ON t.id=a.trip_id
    JOIN routes r ON r.id=t.route_id
    LEFT JOIN transport_trip_templates tt ON tt.id=t.template_id
    WHERE ${filter.sql}
      AND a.status<>'cancelled'
  `).get(...filter.params)

  const activeStaff = db.prepare(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN pickup_point_id IS NOT NULL THEN 1 ELSE 0 END) AS covered
    FROM staff WHERE is_active=1
  `).get()
  const passengerCount = number(assignments.total) - number(assignments.waitlisted)
  const decidedBoarding = number(assignments.boarded) + number(assignments.no_show)
  const kpis = {
    trips: number(totals.trips),
    occupancy_pct: number(totals.capacity)
      ? Math.round(passengerCount / number(totals.capacity) * 100) : 0,
    boarding_pct: decidedBoarding
      ? Math.round(number(assignments.boarded) / decidedBoarding * 100) : 0,
    no_show_pct: decidedBoarding
      ? Math.round(number(assignments.no_show) / decidedBoarding * 100) : 0,
    on_time_pct: number(totals.departed)
      ? Math.round(number(totals.on_time) / number(totals.departed) * 100) : 0,
    cancellation_pct: number(totals.trips)
      ? Math.round(number(totals.cancelled) / number(totals.trips) * 100) : 0,
    coverage_pct: number(activeStaff.total)
      ? Math.round(number(activeStaff.covered) / number(activeStaff.total) * 100) : 0,
    assigned: number(assignments.assigned),
    waitlisted: number(assignments.waitlisted),
    boarded: number(assignments.boarded),
    no_show: number(assignments.no_show),
  }

  const groupSelect = (groupColumn, groupId, label) => db.prepare(`
    SELECT ${groupId} AS id, ${label} AS label,
      COUNT(t.id) AS trips,
      SUM(t.capacity_snapshot) AS capacity,
      SUM(COALESCE(ag.assignments,0)) AS assignments,
      SUM(COALESCE(ag.boarded,0)) AS boarded,
      SUM(COALESCE(ag.no_show,0)) AS no_show,
      ROUND(100.0 * SUM(COALESCE(ag.passengers,0))
        / NULLIF(SUM(t.capacity_snapshot),0), 1) AS occupancy_pct
    ${from}
    LEFT JOIN (
      SELECT trip_id,
        COUNT(CASE WHEN status<>'cancelled' THEN 1 END) AS assignments,
        COUNT(CASE WHEN status='boarded' THEN 1 END) AS boarded,
        COUNT(CASE WHEN status='no_show' THEN 1 END) AS no_show,
        COUNT(CASE WHEN status NOT IN ('cancelled','waitlisted') THEN 1 END) AS passengers
      FROM transport_trip_assignments GROUP BY trip_id
    ) ag ON ag.trip_id=t.id
    WHERE ${filter.sql} AND ${groupColumn} IS NOT NULL
    GROUP BY ${groupColumn}
    ORDER BY trips DESC, label
  `).all(...filter.params)

  const byRoute = groupSelect('t.route_id', 't.route_id', 'r.name')
  const byVehicle = groupSelect('t.vehicle_id', 't.vehicle_id', "COALESCE(v.label,v.plate)")
  const byDriver = groupSelect('t.driver_id', 't.driver_id', 'd.full_name')
  const byShift = groupSelect('COALESCE(tt.shift_def_id,r.shift_def_id)', 'COALESCE(tt.shift_def_id,r.shift_def_id)', 'sd.name')

  const daily = db.prepare(`
    SELECT t.work_date AS date, COUNT(*) AS trips,
      SUM(t.capacity_snapshot) AS capacity,
      SUM(CASE WHEN t.status='cancelled' THEN 1 ELSE 0 END) AS cancelled
    ${from}
    WHERE ${filter.sql}
    GROUP BY t.work_date ORDER BY t.work_date
  `).all(...filter.params)

  const people = db.prepare(`
    SELECT s.id, s.full_name AS label, dep.name AS department,
      COUNT(a.id) AS assignments,
      SUM(CASE WHEN a.status='boarded' THEN 1 ELSE 0 END) AS boarded,
      SUM(CASE WHEN a.status='no_show' THEN 1 ELSE 0 END) AS no_show,
      MAX(t.work_date) AS last_trip
    FROM transport_trip_assignments a
    JOIN staff s ON s.id=a.staff_id
    LEFT JOIN departments dep ON dep.id=s.department_id
    JOIN transport_trips t ON t.id=a.trip_id
    JOIN routes r ON r.id=t.route_id
    LEFT JOIN transport_trip_templates tt ON tt.id=t.template_id
    WHERE ${filter.sql} AND a.status<>'cancelled'
    GROUP BY s.id ORDER BY no_show DESC, assignments DESC, s.full_name
    LIMIT 250
  `).all(...filter.params)

  const trips = listAnalyticsRows(input)
  const filters = {
    routes: db.prepare('SELECT id,name AS label FROM routes WHERE is_active=1 ORDER BY name').all(),
    vehicles: db.prepare("SELECT id,COALESCE(label,plate) AS label FROM transport_vehicles WHERE status='active' ORDER BY plate").all(),
    drivers: db.prepare("SELECT id,full_name AS label FROM transport_drivers WHERE status='active' ORDER BY full_name").all(),
    shifts: db.prepare('SELECT id,name AS label FROM shift_definitions ORDER BY start_hour').all(),
  }

  return {
    range: { start: filter.start, end: filter.end },
    kpis,
    totals: { ...totals, ...assignments, staff_total: activeStaff.total, staff_covered: activeStaff.covered },
    by_route: byRoute,
    by_vehicle: byVehicle,
    by_driver: byDriver,
    by_shift: byShift,
    people,
    daily,
    trips,
    filters,
  }
}

export function listAnalyticsRows(input = {}) {
  const filter = buildFilter(input)
  return getDB().prepare(`
    SELECT t.id, t.work_date, t.direction, t.scheduled_departure, t.departed_at,
      t.completed_at, t.status, r.name AS route_name,
      COALESCE(v.label,v.plate) AS vehicle, d.full_name AS driver, sd.name AS shift_name,
      t.capacity_snapshot AS capacity,
      COUNT(a.id) AS assignments,
      SUM(CASE WHEN a.status='boarded' THEN 1 ELSE 0 END) AS boarded,
      SUM(CASE WHEN a.status='no_show' THEN 1 ELSE 0 END) AS no_show,
      SUM(CASE WHEN a.status='waitlisted' THEN 1 ELSE 0 END) AS waitlisted
    ${baseFrom()}
    LEFT JOIN transport_trip_assignments a ON a.trip_id=t.id AND a.status<>'cancelled'
    WHERE ${filter.sql}
    GROUP BY t.id ORDER BY t.scheduled_departure DESC
  `).all(...filter.params)
}

export function createAnalyticsCsv(input = {}) {
  const headers = [
    ['work_date', 'Tarih'], ['direction', 'Yön'], ['route_name', 'Hat'],
    ['scheduled_departure', 'Planlanan'], ['departed_at', 'Gerçek kalkış'],
    ['status', 'Durum'], ['vehicle', 'Araç'], ['driver', 'Şoför'],
    ['shift_name', 'Vardiya'], ['capacity', 'Kapasite'], ['assignments', 'Atama'],
    ['boarded', 'Binen'], ['no_show', 'Binmeyen'], ['waitlisted', 'Yedek'],
  ]
  const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`
  return [
    headers.map(([, label]) => escape(label)).join(';'),
    ...listAnalyticsRows(input).map(row => headers.map(([key]) => escape(row[key])).join(';')),
  ].join('\n')
}

export async function createAnalyticsWorkbook(input = {}) {
  const analytics = getTransportAnalytics(input)
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'YYS Servisler'
  const summary = workbook.addWorksheet('Özet')
  summary.columns = [{ header: 'KPI', key: 'label', width: 28 }, { header: 'Değer', key: 'value', width: 18 }]
  summary.addRows([
    { label: 'Sefer', value: analytics.kpis.trips },
    { label: 'Doluluk %', value: analytics.kpis.occupancy_pct },
    { label: 'Biniş %', value: analytics.kpis.boarding_pct },
    { label: 'No-show %', value: analytics.kpis.no_show_pct },
    { label: 'Zamanında kalkış %', value: analytics.kpis.on_time_pct },
    { label: 'İptal %', value: analytics.kpis.cancellation_pct },
    { label: 'Personel kapsama %', value: analytics.kpis.coverage_pct },
  ])
  summary.getRow(1).font = { bold: true }
  const detail = workbook.addWorksheet('Seferler')
  detail.columns = [
    ['Tarih', 'work_date'], ['Yön', 'direction'], ['Hat', 'route_name'],
    ['Planlanan', 'scheduled_departure'], ['Gerçek kalkış', 'departed_at'],
    ['Durum', 'status'], ['Araç', 'vehicle'], ['Şoför', 'driver'],
    ['Vardiya', 'shift_name'], ['Kapasite', 'capacity'], ['Atama', 'assignments'],
    ['Binen', 'boarded'], ['Binmeyen', 'no_show'], ['Yedek', 'waitlisted'],
  ].map(([header, key]) => ({ header, key, width: 18 }))
  detail.addRows(analytics.trips)
  detail.getRow(1).font = { bold: true }
  detail.autoFilter = { from: 'A1', to: 'N1' }
  return workbook.xlsx.writeBuffer()
}

export function writeAnalyticsPdf(res, input = {}) {
  const analytics = getTransportAnalytics(input)
  const doc = new PDFDocument({ size: 'A4', margin: 42 })
  doc.pipe(res)
  doc.fontSize(20).text('SERVISLER OPERASYON RAPORU')
  doc.moveDown(0.4).fontSize(10).fillColor('#555')
    .text(`${analytics.range.start} - ${analytics.range.end}`)
  doc.moveDown().fillColor('#111').fontSize(12)
  const kpiRows = [
    ['Sefer', analytics.kpis.trips],
    ['Doluluk', `%${analytics.kpis.occupancy_pct}`],
    ['Binis', `%${analytics.kpis.boarding_pct}`],
    ['No-show', `%${analytics.kpis.no_show_pct}`],
    ['Zamaninda kalkis', `%${analytics.kpis.on_time_pct}`],
    ['Iptal', `%${analytics.kpis.cancellation_pct}`],
    ['Kapsama', `%${analytics.kpis.coverage_pct}`],
  ]
  for (const [label, value] of kpiRows) doc.text(`${label}: ${value}`)
  doc.moveDown().fontSize(14).text('Hat performansi')
  doc.fontSize(9)
  for (const route of analytics.by_route.slice(0, 20)) {
    doc.text(`${route.label}: ${route.trips} sefer, doluluk %${route.occupancy_pct || 0}, ${route.no_show || 0} no-show`)
  }
  doc.end()
}
