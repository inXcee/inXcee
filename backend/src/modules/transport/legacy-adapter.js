import { getDB } from '../../shared/db/index.js'
import { bumpTransportRevision } from './v2-core.js'

function assignmentStatus(row) {
  if (row.is_waitlist) return 'waitlisted'
  if (row.boarded === 1) return 'boarded'
  if (row.boarded === 0) return 'no_show'
  return 'assigned'
}

function legacyKey(routeId, workDate) {
  return `legacy:${routeId}:${workDate}`
}

export function syncLegacyRouteResources(routeId) {
  const db = getDB()
  const route = db.prepare(`
    SELECT id, vehicle_plate, capacity, driver_name, driver_phone
    FROM routes WHERE id=?
  `).get(routeId)
  if (!route) return null

  const tx = db.transaction(() => {
    let vehicleId = null
    let driverId = null
    const plate = route.vehicle_plate?.trim()
    const driverName = route.driver_name?.trim()
    const driverPhone = route.driver_phone?.trim() || null

    if (plate) {
      db.prepare(`
        INSERT INTO transport_vehicles(plate, label, capacity)
        VALUES(?,?,?)
        ON CONFLICT(plate) DO NOTHING
      `).run(plate, plate, route.capacity || 16)
      vehicleId = db.prepare(
        'SELECT id FROM transport_vehicles WHERE lower(trim(plate))=lower(trim(?))'
      ).get(plate)?.id || null
    }

    if (driverName) {
      db.prepare(`
        INSERT OR IGNORE INTO transport_drivers(full_name, phone)
        VALUES(?,?)
      `).run(driverName, driverPhone)
      driverId = db.prepare(`
        SELECT id FROM transport_drivers
        WHERE lower(trim(full_name))=lower(trim(?))
          AND ifnull(trim(phone), '')=ifnull(trim(?), '')
      `).get(driverName, driverPhone)?.id || null
    }

    db.prepare(`
      UPDATE routes SET default_vehicle_id=?, default_driver_id=? WHERE id=?
    `).run(vehicleId, driverId, routeId)
    return { vehicle_id: vehicleId, driver_id: driverId }
  })

  const result = tx()
  bumpTransportRevision()
  return result
}

function ensureLegacyTrip(db, routeId, workDate) {
  const route = db.prepare(`
    SELECT r.id, r.capacity, r.default_vehicle_id, r.default_driver_id,
      COALESCE(
        (SELECT MIN(scheduled_time) FROM route_stops WHERE route_id=r.id AND scheduled_time IS NOT NULL),
        sd.start_hour,
        '00:00'
      ) AS departure_time
    FROM routes r
    LEFT JOIN shift_definitions sd ON sd.id=r.shift_def_id
    WHERE r.id=?
  `).get(routeId)
  if (!route) return null

  const firstAssignment = db.prepare(`
    SELECT COALESCE(MIN(created_at), datetime('now')) AS created_at,
      COUNT(*) AS assignment_count
    FROM route_assignments WHERE route_id=? AND work_date=?
  `).get(routeId, workDate)
  if (!firstAssignment?.assignment_count) return null

  db.prepare(`
    INSERT INTO transport_trips(
      route_id, work_date, direction, scheduled_departure, status,
      vehicle_id, driver_id, capacity_snapshot, source, legacy_key,
      published_at, completed_at, created_at, updated_at
    )
    VALUES(
      ?, ?, 'outbound', ?,
      CASE WHEN ? < date('now') THEN 'completed' ELSE 'published' END,
      ?, ?, ?, 'legacy', ?, ?,
      CASE WHEN ? < date('now') THEN ? ELSE NULL END,
      ?, datetime('now')
    )
    ON CONFLICT(legacy_key) DO UPDATE SET
      route_id=excluded.route_id,
      scheduled_departure=excluded.scheduled_departure,
      vehicle_id=excluded.vehicle_id,
      driver_id=excluded.driver_id,
      capacity_snapshot=excluded.capacity_snapshot,
      updated_at=datetime('now')
  `).run(
    routeId,
    workDate,
    `${workDate}T${route.departure_time}`,
    workDate,
    route.default_vehicle_id,
    route.default_driver_id,
    route.capacity,
    legacyKey(routeId, workDate),
    firstAssignment.created_at,
    workDate,
    firstAssignment.created_at,
    firstAssignment.created_at,
  )

  return db.prepare('SELECT id FROM transport_trips WHERE legacy_key=?')
    .get(legacyKey(routeId, workDate))?.id || null
}

// Feature flag kapaliyken eski ekranlar route_assignments'a yazmaya devam eder.
// Bu adapter ayni gunu V2 tablolarina idempotent bicimde yansitir.
export function syncLegacyDate(workDate) {
  const db = getDB()
  const tx = db.transaction(() => {
    const routeIds = db.prepare(`
      SELECT DISTINCT route_id FROM route_assignments WHERE work_date=?
    `).all(workDate).map(row => row.route_id)

    const tripIds = new Map()
    for (const routeId of routeIds) {
      const tripId = ensureLegacyTrip(db, routeId, workDate)
      if (tripId) tripIds.set(routeId, tripId)
    }

    const assignments = db.prepare(`
      SELECT * FROM route_assignments WHERE work_date=? ORDER BY id
    `).all(workDate)

    const upsert = db.prepare(`
      INSERT INTO transport_trip_assignments(
        trip_id, staff_id, stop_id, status, source, assigned_by,
        boarded_at, legacy_assignment_id, created_at, updated_at
      )
      VALUES(?,?,?,?, 'legacy', ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(legacy_assignment_id) DO UPDATE SET
        trip_id=excluded.trip_id,
        staff_id=excluded.staff_id,
        stop_id=excluded.stop_id,
        status=excluded.status,
        assigned_by=excluded.assigned_by,
        boarded_at=excluded.boarded_at,
        updated_at=datetime('now')
    `)

    for (const row of assignments) {
      const tripId = tripIds.get(row.route_id)
      if (!tripId) continue
      upsert.run(
        tripId,
        row.staff_id,
        row.stop_id,
        assignmentStatus(row),
        row.assigned_by,
        row.boarded === 1 ? row.boarded_marked_at : null,
        row.id,
        row.created_at,
      )
    }

    db.prepare(`
      DELETE FROM transport_trip_assignments
      WHERE source='legacy'
        AND trip_id IN (
          SELECT id FROM transport_trips WHERE source='legacy' AND work_date=?
        )
        AND (
          legacy_assignment_id IS NULL OR
          NOT EXISTS(
            SELECT 1 FROM route_assignments ra
            WHERE ra.id=transport_trip_assignments.legacy_assignment_id
              AND ra.work_date=?
          )
        )
    `).run(workDate, workDate)

    db.prepare(`
      DELETE FROM transport_trips
      WHERE source='legacy' AND work_date=?
        AND NOT EXISTS(
          SELECT 1 FROM route_assignments ra
          WHERE ra.route_id=transport_trips.route_id
            AND ra.work_date=transport_trips.work_date
        )
    `).run(workDate)

    return { trips: routeIds.length, assignments: assignments.length }
  })

  const result = tx()
  result.revision = bumpTransportRevision()
  return result
}

export function syncLegacyAssignment(legacyAssignmentId) {
  const row = getDB().prepare(
    'SELECT work_date FROM route_assignments WHERE id=?'
  ).get(legacyAssignmentId)
  if (!row) return null
  return syncLegacyDate(row.work_date)
}
