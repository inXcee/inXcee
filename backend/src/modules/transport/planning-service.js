import { getDB } from '../../shared/db/index.js'
import { bumpTransportRevision, getTransportRevision } from './v2-core.js'

const TRIP_WINDOW_MINUTES = 180

function parseDays(raw) {
  try {
    const days = JSON.parse(raw)
    return Array.isArray(days) ? days.map(Number).filter(day => day >= 0 && day <= 6) : []
  } catch {
    return []
  }
}

function dateRange(startDate, endDate) {
  const dates = []
  const cursor = new Date(`${startDate}T12:00:00Z`)
  const end = new Date(`${endDate}T12:00:00Z`)
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}

function minutesOf(iso) {
  const time = iso.slice(11, 16)
  const [hour, minute] = time.split(':').map(Number)
  return hour * 60 + minute
}

function resourceConflict(a, b, field) {
  if (!a[field] || a[field] !== b[field] || a.work_date !== b.work_date) return false
  return Math.abs(minutesOf(a.scheduled_departure) - minutesOf(b.scheduled_departure)) < TRIP_WINDOW_MINUTES
}

function templateRow(row) {
  return { ...row, days_of_week: parseDays(row.days_of_week) }
}

export function listVehicles({ includeInactive = true } = {}) {
  const where = includeInactive ? '' : "WHERE v.status='active'"
  return getDB().prepare(`
    SELECT v.*,
      (SELECT COUNT(*) FROM routes r WHERE r.default_vehicle_id=v.id) AS route_count,
      (SELECT COUNT(*) FROM transport_trips t
        WHERE t.vehicle_id=v.id AND t.work_date>=date('now') AND t.status<>'cancelled') AS upcoming_trip_count
    FROM transport_vehicles v
    ${where}
    ORDER BY CASE v.status WHEN 'active' THEN 0 ELSE 1 END, v.plate
  `).all()
}

export function createVehicle(data) {
  const db = getDB()
  const id = db.prepare(`
    INSERT INTO transport_vehicles(plate,label,capacity,status,notes)
    VALUES(?,?,?,?,?)
  `).run(data.plate.trim(), data.label || null, data.capacity, data.status || 'active', data.notes || null).lastInsertRowid
  return { id, revision: bumpTransportRevision() }
}

export function updateVehicle(id, data) {
  const db = getDB()
  const fields = ['plate', 'label', 'capacity', 'status', 'notes']
  const sets = []
  const params = []
  for (const field of fields) {
    if (data[field] !== undefined) {
      sets.push(`${field}=?`)
      params.push(data[field] === '' ? null : data[field])
    }
  }
  if (!sets.length) return { ok: true, revision: getTransportRevision() }
  params.push(id)
  const result = db.prepare(`
    UPDATE transport_vehicles SET ${sets.join(',')}, updated_at=datetime('now') WHERE id=?
  `).run(...params)
  if (!result.changes) return null
  return { ok: true, revision: bumpTransportRevision() }
}

export function deactivateVehicle(id) {
  return updateVehicle(id, { status: 'inactive' })
}

export function listDrivers({ includeInactive = true } = {}) {
  const where = includeInactive ? '' : "WHERE d.status='active'"
  return getDB().prepare(`
    SELECT d.*,
      (SELECT COUNT(*) FROM routes r WHERE r.default_driver_id=d.id) AS route_count,
      (SELECT COUNT(*) FROM transport_trips t
        WHERE t.driver_id=d.id AND t.work_date>=date('now') AND t.status<>'cancelled') AS upcoming_trip_count
    FROM transport_drivers d
    ${where}
    ORDER BY CASE d.status WHEN 'active' THEN 0 ELSE 1 END, d.full_name
  `).all()
}

export function createDriver(data) {
  const id = getDB().prepare(`
    INSERT INTO transport_drivers(full_name,phone,status,notes)
    VALUES(?,?,?,?)
  `).run(data.full_name.trim(), data.phone || null, data.status || 'active', data.notes || null).lastInsertRowid
  return { id, revision: bumpTransportRevision() }
}

export function updateDriver(id, data) {
  const db = getDB()
  const fields = ['full_name', 'phone', 'status', 'notes']
  const sets = []
  const params = []
  for (const field of fields) {
    if (data[field] !== undefined) {
      sets.push(`${field}=?`)
      params.push(data[field] === '' ? null : data[field])
    }
  }
  if (!sets.length) return { ok: true, revision: getTransportRevision() }
  params.push(id)
  const result = db.prepare(`
    UPDATE transport_drivers SET ${sets.join(',')}, updated_at=datetime('now') WHERE id=?
  `).run(...params)
  if (!result.changes) return null
  return { ok: true, revision: bumpTransportRevision() }
}

export function deactivateDriver(id) {
  return updateDriver(id, { status: 'inactive' })
}

export function listUnavailability({ from, to } = {}) {
  const start = from || new Date().toISOString().slice(0, 10)
  const end = to || '9999-12-31'
  return getDB().prepare(`
    SELECT u.*, v.plate AS vehicle_plate, d.full_name AS driver_name
    FROM transport_resource_unavailability u
    LEFT JOIN transport_vehicles v ON v.id=u.vehicle_id
    LEFT JOIN transport_drivers d ON d.id=u.driver_id
    WHERE u.ends_at>=? AND u.starts_at<=?
    ORDER BY u.starts_at
  `).all(start, `${end}T23:59:59`)
}

export function createUnavailability(data, userId) {
  const id = getDB().prepare(`
    INSERT INTO transport_resource_unavailability(
      vehicle_id,driver_id,starts_at,ends_at,reason,created_by
    ) VALUES(?,?,?,?,?,?)
  `).run(
    data.vehicle_id || null,
    data.driver_id || null,
    data.starts_at,
    data.ends_at,
    data.reason || null,
    userId || null,
  ).lastInsertRowid
  return { id, revision: bumpTransportRevision() }
}

export function deleteUnavailability(id) {
  const result = getDB().prepare(
    'DELETE FROM transport_resource_unavailability WHERE id=?'
  ).run(id)
  if (!result.changes) return null
  return { ok: true, revision: bumpTransportRevision() }
}

export function listTemplates({ activeOnly = false } = {}) {
  const where = activeOnly ? 'WHERE t.is_active=1' : ''
  return getDB().prepare(`
    SELECT t.*, r.name AS route_name, r.color AS route_color,
      sd.name AS shift_name,
      v.plate AS vehicle_plate, v.capacity AS vehicle_capacity,
      d.full_name AS driver_name
    FROM transport_trip_templates t
    JOIN routes r ON r.id=t.route_id
    LEFT JOIN shift_definitions sd ON sd.id=t.shift_def_id
    LEFT JOIN transport_vehicles v ON v.id=t.default_vehicle_id
    LEFT JOIN transport_drivers d ON d.id=t.default_driver_id
    ${where}
    ORDER BY t.departure_time, t.name
  `).all().map(templateRow)
}

export function createTemplate(data, userId) {
  const id = getDB().prepare(`
    INSERT INTO transport_trip_templates(
      name,route_id,shift_def_id,direction,departure_time,days_of_week,
      default_vehicle_id,default_driver_id,valid_from,valid_to,is_active,created_by
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    data.name,
    data.route_id,
    data.shift_def_id || null,
    data.direction,
    data.departure_time,
    JSON.stringify(data.days_of_week),
    data.default_vehicle_id || null,
    data.default_driver_id || null,
    data.valid_from || null,
    data.valid_to || null,
    data.is_active ?? 1,
    userId || null,
  ).lastInsertRowid
  return { id, revision: bumpTransportRevision() }
}

export function updateTemplate(id, data) {
  const db = getDB()
  const fields = [
    'name', 'route_id', 'shift_def_id', 'direction', 'departure_time',
    'default_vehicle_id', 'default_driver_id', 'valid_from', 'valid_to', 'is_active',
  ]
  const sets = []
  const params = []
  for (const field of fields) {
    if (data[field] !== undefined) {
      sets.push(`${field}=?`)
      params.push(data[field] === '' ? null : data[field])
    }
  }
  if (data.days_of_week !== undefined) {
    sets.push('days_of_week=?')
    params.push(JSON.stringify(data.days_of_week))
  }
  if (!sets.length) return { ok: true, revision: getTransportRevision() }
  params.push(id)
  const result = db.prepare(`
    UPDATE transport_trip_templates
    SET ${sets.join(',')}, updated_at=datetime('now')
    WHERE id=?
  `).run(...params)
  if (!result.changes) return null
  return { ok: true, revision: bumpTransportRevision() }
}

export function deactivateTemplate(id) {
  return updateTemplate(id, { is_active: 0 })
}

function templateApplies(template, workDate) {
  const day = new Date(`${workDate}T12:00:00Z`).getUTCDay()
  return template.days_of_week.includes(day)
    && (!template.valid_from || workDate >= template.valid_from)
    && (!template.valid_to || workDate <= template.valid_to)
}

function proposalKey(templateId, workDate, direction) {
  return `${templateId}:${workDate}:${direction}`
}

export function previewPlan({ start_date: startDate, end_date: endDate, template_ids: templateIds } = {}) {
  const db = getDB()
  const selected = templateIds?.length ? new Set(templateIds.map(Number)) : null
  const templates = listTemplates({ activeOnly: true })
    .filter(template => !selected || selected.has(template.id))
  const dates = dateRange(startDate, endDate)
  const routes = new Map(db.prepare(`
    SELECT r.*,
      (SELECT COUNT(*) FROM route_stops rs WHERE rs.route_id=r.id) AS stop_count,
      (SELECT COUNT(*) FROM route_stops rs JOIN pickup_points pp ON pp.id=rs.pickup_point_id
        WHERE rs.route_id=r.id AND (pp.lat IS NULL OR pp.lng IS NULL)) AS missing_coord_count
    FROM routes r
  `).all().map(route => [route.id, route]))
  const vehicles = new Map(listVehicles().map(vehicle => [vehicle.id, vehicle]))
  const drivers = new Map(listDrivers().map(driver => [driver.id, driver]))
  const unavailability = listUnavailability({ from: startDate, to: endDate })
  const warnings = []
  const blockers = []
  const trips = []

  for (const workDate of dates) {
    for (const template of templates) {
      if (!templateApplies(template, workDate)) continue
      const route = routes.get(template.route_id)
      const vehicle = vehicles.get(template.default_vehicle_id)
      const driver = drivers.get(template.default_driver_id)
      const scheduledDeparture = `${workDate}T${template.departure_time}`
      const trip = {
        key: proposalKey(template.id, workDate, template.direction),
        template_id: template.id,
        template_name: template.name,
        route_id: template.route_id,
        route_name: template.route_name,
        route_color: template.route_color,
        shift_def_id: template.shift_def_id,
        direction: template.direction,
        work_date: workDate,
        scheduled_departure: scheduledDeparture,
        vehicle_id: template.default_vehicle_id,
        vehicle_plate: vehicle?.plate || null,
        driver_id: template.default_driver_id,
        driver_name: driver?.full_name || null,
        capacity: vehicle?.capacity || route?.capacity || 16,
        assignments: [],
        waitlist: [],
      }
      trips.push(trip)

      if (!route?.is_active || !route?.stop_count) {
        blockers.push({ severity: 'blocker', code: 'route_unavailable', trip_key: trip.key, message: `${template.route_name}: aktif duraklı rota gerekli` })
      }
      if (!vehicle || vehicle.status !== 'active') {
        blockers.push({ severity: 'blocker', code: 'vehicle_unavailable', trip_key: trip.key, message: `${template.name}: aktif araç gerekli` })
      }
      if (!driver || driver.status !== 'active') {
        blockers.push({ severity: 'blocker', code: 'driver_unavailable', trip_key: trip.key, message: `${template.name}: aktif şoför gerekli` })
      }
      if (route?.missing_coord_count) {
        warnings.push({ severity: 'warning', code: 'missing_coordinates', trip_key: trip.key, message: `${template.route_name}: ${route.missing_coord_count} durak konumsuz` })
      }
      for (const unavailable of unavailability) {
        const matches = unavailable.vehicle_id === trip.vehicle_id || unavailable.driver_id === trip.driver_id
        if (matches && unavailable.starts_at <= scheduledDeparture && unavailable.ends_at >= scheduledDeparture) {
          blockers.push({ severity: 'blocker', code: 'resource_unavailable', trip_key: trip.key, message: `${template.name}: kaynak belirtilen saatte müsait değil` })
        }
      }
    }
  }

  for (let i = 0; i < trips.length; i++) {
    for (let j = i + 1; j < trips.length; j++) {
      const a = trips[i]
      const b = trips[j]
      if (resourceConflict(a, b, 'vehicle_id')) {
        blockers.push({ severity: 'blocker', code: 'vehicle_overlap', trip_key: b.key, message: `${a.vehicle_plate}: ${a.template_name} ve ${b.template_name} çakışıyor` })
      }
      if (resourceConflict(a, b, 'driver_id')) {
        blockers.push({ severity: 'blocker', code: 'driver_overlap', trip_key: b.key, message: `${a.driver_name}: ${a.template_name} ve ${b.template_name} çakışıyor` })
      }
    }
  }

  const uncovered = []
  for (const workDate of dates) {
    const staffRows = db.prepare(`
      SELECT DISTINCT s.id, s.full_name, s.phone, s.pickup_point_id, ss.shift_def_id
      FROM staff s
      JOIN shift_schedule ss ON ss.staff_id=s.id AND ss.work_date=?
      WHERE s.is_active=1 AND ss.status IN ('scheduled','worked','overtime')
    `).all(workDate)
    const stopRows = db.prepare(`
      SELECT rs.route_id, rs.id AS stop_id, rs.pickup_point_id
      FROM route_stops rs JOIN routes r ON r.id=rs.route_id
      WHERE r.is_active=1
    `).all()

    const plannedDirections = [...new Set(
      trips.filter(trip => trip.work_date === workDate).map(trip => trip.direction)
    )]
    for (const direction of plannedDirections) {
      const dayTrips = trips.filter(trip => trip.work_date === workDate && trip.direction === direction)
      for (const staff of staffRows) {
        if (!staff.pickup_point_id) {
          uncovered.push({ work_date: workDate, direction, staff_id: staff.id, full_name: staff.full_name, reason: 'no_pickup' })
          continue
        }
        const candidates = dayTrips.filter(trip => {
          const servesStop = stopRows.some(stop => stop.route_id === trip.route_id && stop.pickup_point_id === staff.pickup_point_id)
          return servesStop && (!trip.shift_def_id || trip.shift_def_id === staff.shift_def_id)
        }).sort((a, b) => a.assignments.length - b.assignments.length)
        const chosen = candidates[0]
        if (!chosen) {
          uncovered.push({ work_date: workDate, direction, staff_id: staff.id, full_name: staff.full_name, reason: 'no_route' })
          continue
        }
        const stop = stopRows.find(row => row.route_id === chosen.route_id && row.pickup_point_id === staff.pickup_point_id)
        const assignment = { staff_id: staff.id, full_name: staff.full_name, stop_id: stop?.stop_id || null }
        if (chosen.assignments.length < chosen.capacity) chosen.assignments.push(assignment)
        else chosen.waitlist.push(assignment)
      }
    }
  }

  for (const trip of trips) {
    if (trip.waitlist.length) {
      warnings.push({ severity: 'warning', code: 'waitlist', trip_key: trip.key, message: `${trip.template_name}: ${trip.waitlist.length} kişi yedekte` })
    }
  }
  if (uncovered.length) {
    warnings.push({ severity: 'warning', code: 'uncovered_staff', message: `${uncovered.length} kişi/yön eşleşmesi servissiz` })
  }

  return {
    range: { start_date: startDate, end_date: endDate },
    base_revision: getTransportRevision(),
    trips,
    blockers,
    warnings,
    uncovered,
    summary: {
      trip_count: trips.length,
      assignment_count: trips.reduce((sum, trip) => sum + trip.assignments.length, 0),
      waitlist_count: trips.reduce((sum, trip) => sum + trip.waitlist.length, 0),
      blocker_count: blockers.length,
      warning_count: warnings.length,
    },
  }
}

export function publishPlan(data, userId) {
  if (Number(data.base_revision) !== getTransportRevision()) {
    const error = new Error('Plan verisi değişti; önizlemeyi yenileyin')
    error.status = 409
    throw error
  }
  const preview = previewPlan(data)
  if (preview.blockers.length) {
    const error = new Error('Engelleyici plan çakışmaları çözülmeli')
    error.status = 400
    error.conflicts = preview.blockers
    throw error
  }
  if (preview.warnings.length && !data.warning_reason?.trim()) {
    const error = new Error('Uyarılarla yayınlamak için gerekçe gerekli')
    error.status = 400
    error.conflicts = preview.warnings
    throw error
  }

  const selected = data.selected_trip_keys?.length ? new Set(data.selected_trip_keys) : null
  const db = getDB()
  const tx = db.transaction(() => {
    const created = []
    for (const proposal of preview.trips) {
      if (selected && !selected.has(proposal.key)) continue
      const existing = db.prepare(`
        SELECT id FROM transport_trips
        WHERE template_id=? AND work_date=? AND direction=? AND status<>'cancelled'
      `).get(proposal.template_id, proposal.work_date, proposal.direction)
      if (existing) {
        created.push({ id: existing.id, key: proposal.key, existing: true })
        continue
      }
      const tripId = db.prepare(`
        INSERT INTO transport_trips(
          template_id,route_id,work_date,direction,scheduled_departure,status,
          vehicle_id,driver_id,capacity_snapshot,source,notes,published_at,created_by
        ) VALUES(?,?,?,?,?,'published',?,?,?,'template',?,datetime('now'),?)
      `).run(
        proposal.template_id,
        proposal.route_id,
        proposal.work_date,
        proposal.direction,
        proposal.scheduled_departure,
        proposal.vehicle_id,
        proposal.driver_id,
        proposal.capacity,
        data.warning_reason || null,
        userId || null,
      ).lastInsertRowid

      const assignmentInsert = db.prepare(`
        INSERT INTO transport_trip_assignments(
          trip_id,staff_id,stop_id,status,source,assigned_by
        ) VALUES(?,?,?,?, 'plan', ?)
      `)
      for (const assignment of proposal.assignments) {
        assignmentInsert.run(tripId, assignment.staff_id, assignment.stop_id, 'assigned', userId || null)
      }
      for (const assignment of proposal.waitlist) {
        assignmentInsert.run(tripId, assignment.staff_id, assignment.stop_id, 'waitlisted', userId || null)
      }
      db.prepare(`
        INSERT INTO transport_trip_events(
          trip_id,event_type,to_status,actor_type,actor_user_id,detail
        ) VALUES(?,'published','published','user',?,?)
      `).run(tripId, userId || null, JSON.stringify({ warning_reason: data.warning_reason || null }))
      created.push({ id: tripId, key: proposal.key, existing: false })
    }
    return created
  })

  const trips = tx()
  return { ok: true, trips, revision: bumpTransportRevision() }
}
