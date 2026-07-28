import { getDB } from '../../shared/db/index.js'
import { bumpTransportRevision, getTransportRevision } from './v2-core.js'

const TRANSITIONS = {
  draft: ['published', 'cancelled'],
  published: ['boarding', 'cancelled'],
  boarding: ['departed', 'cancelled'],
  departed: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

function fail(message, status = 400, details) {
  const error = new Error(message)
  error.status = status
  error.details = details
  throw error
}

function tripById(id) {
  const trip = getDB().prepare('SELECT * FROM transport_trips WHERE id=?').get(id)
  if (!trip) fail('Sefer bulunamadı', 404)
  return trip
}

function parseDetail(value) {
  try { return value ? JSON.parse(value) : null } catch { return value }
}

function hydrateTrip(row) {
  if (!row) return row
  return {
    ...row,
    events: row.events?.map(event => ({ ...event, detail: parseDetail(event.detail) })) || row.events,
  }
}

function tripSelect(where = '', order = 'ORDER BY t.scheduled_departure') {
  return `
    SELECT t.*, r.name AS route_name, r.color AS route_color,
      v.plate AS vehicle_plate, v.label AS vehicle_label,
      d.full_name AS driver_name, d.phone AS driver_phone,
      COUNT(a.id) AS assignment_total,
      SUM(CASE WHEN a.status='assigned' THEN 1 ELSE 0 END) AS assigned_count,
      SUM(CASE WHEN a.status='waitlisted' THEN 1 ELSE 0 END) AS waitlisted_count,
      SUM(CASE WHEN a.status='boarded' THEN 1 ELSE 0 END) AS boarded_count,
      SUM(CASE WHEN a.status='no_show' THEN 1 ELSE 0 END) AS no_show_count,
      SUM(CASE WHEN a.status='cancelled' THEN 1 ELSE 0 END) AS assignment_cancelled_count
    FROM transport_trips t
    JOIN routes r ON r.id=t.route_id
    LEFT JOIN transport_vehicles v ON v.id=t.vehicle_id
    LEFT JOIN transport_drivers d ON d.id=t.driver_id
    LEFT JOIN transport_trip_assignments a ON a.trip_id=t.id
    ${where}
    GROUP BY t.id
    ${order}
  `
}

export function listTrips({ date, direction, status, route_id: routeId } = {}) {
  const filters = []
  const params = []
  if (date) { filters.push('t.work_date=?'); params.push(date) }
  if (direction) { filters.push('t.direction=?'); params.push(direction) }
  if (status) {
    const statuses = String(status).split(',').filter(Boolean)
    if (statuses.length) {
      filters.push(`t.status IN (${statuses.map(() => '?').join(',')})`)
      params.push(...statuses)
    }
  }
  if (routeId) { filters.push('t.route_id=?'); params.push(Number(routeId)) }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
  return getDB().prepare(tripSelect(where)).all(...params)
}

function nextAction(status) {
  return {
    draft: { key: 'publish', label: 'Planı yayınla' },
    published: { key: 'boarding', label: 'Binişi başlat' },
    boarding: { key: 'depart', label: 'Kalkışı onayla' },
    departed: { key: 'complete', label: 'Seferi tamamla' },
  }[status] || null
}

export function getOperations({ date, direction, status, route_id: routeId } = {}) {
  const workDate = date || new Date().toISOString().slice(0, 10)
  const trips = listTrips({ date: workDate, direction, status, route_id: routeId })
  const active = trips.find(trip => ['boarding', 'departed'].includes(trip.status))
    || trips.find(trip => ['draft', 'published'].includes(trip.status))
  const totals = trips.reduce((sum, trip) => ({
    capacity: sum.capacity + trip.capacity_snapshot,
    assigned: sum.assigned + (trip.assigned_count || 0),
    waitlisted: sum.waitlisted + (trip.waitlisted_count || 0),
    boarded: sum.boarded + (trip.boarded_count || 0),
    no_show: sum.no_show + (trip.no_show_count || 0),
  }), { capacity: 0, assigned: 0, waitlisted: 0, boarded: 0, no_show: 0 })
  return {
    date: workDate,
    trips,
    totals,
    next_trip: active ? { ...active, next_action: nextAction(active.status) } : null,
    revision: getTransportRevision(),
  }
}

export function getTrip(id) {
  const trip = getDB().prepare(tripSelect('WHERE t.id=?', '')).get(id)
  if (!trip) fail('Sefer bulunamadı', 404)
  const assignments = getDB().prepare(`
    SELECT a.*, s.full_name, s.tc_no, s.phone,
      pp.name AS pickup_name, rs.scheduled_time AS stop_time,
      rs.sequence_order
    FROM transport_trip_assignments a
    JOIN staff s ON s.id=a.staff_id
    LEFT JOIN route_stops rs ON rs.id=a.stop_id
    LEFT JOIN pickup_points pp ON pp.id=rs.pickup_point_id
    WHERE a.trip_id=?
    ORDER BY CASE a.status WHEN 'waitlisted' THEN 1 ELSE 0 END,
      rs.sequence_order, s.full_name
  `).all(id)
  const events = getDB().prepare(`
    SELECT e.*, u.full_name AS actor_name
    FROM transport_trip_events e
    LEFT JOIN users u ON u.id=e.actor_user_id
    WHERE e.trip_id=?
    ORDER BY e.created_at DESC, e.id DESC
  `).all(id)
  return hydrateTrip({ ...trip, assignments, events })
}

function assertRouteAndResources(trip) {
  const db = getDB()
  const route = db.prepare(`
    SELECT r.is_active, COUNT(rs.id) AS stop_count
    FROM routes r LEFT JOIN route_stops rs ON rs.route_id=r.id
    WHERE r.id=? GROUP BY r.id
  `).get(trip.route_id)
  if (!route?.is_active || !route.stop_count) fail('Yayınlamak için aktif ve duraklı bir rota gerekli')
  const vehicle = db.prepare('SELECT status FROM transport_vehicles WHERE id=?').get(trip.vehicle_id)
  const driver = db.prepare('SELECT status FROM transport_drivers WHERE id=?').get(trip.driver_id)
  if (vehicle?.status !== 'active') fail('Aktif araç gerekli')
  if (driver?.status !== 'active') fail('Aktif şoför gerekli')
  const occupied = db.prepare(`
    SELECT COUNT(*) AS count FROM transport_trip_assignments
    WHERE trip_id=? AND status IN ('assigned','boarded','no_show')
  `).get(trip.id).count
  if (occupied > trip.capacity_snapshot) fail('Kapasite aşımı giderilmeli')
}

function assertResourceConflicts(trip, ignoreId = null) {
  const conflict = getDB().prepare(`
    SELECT t.id, r.name AS route_name
    FROM transport_trips t JOIN routes r ON r.id=t.route_id
    WHERE t.id<>? AND t.work_date=? AND t.status<>'cancelled'
      AND (t.vehicle_id=? OR t.driver_id=?)
      AND abs((julianday(t.scheduled_departure)-julianday(?))*24*60) < 180
    LIMIT 1
  `).get(ignoreId || 0, trip.work_date, trip.vehicle_id, trip.driver_id, trip.scheduled_departure)
  if (conflict) fail(`Araç veya şoför ${conflict.route_name} seferiyle çakışıyor`, 409)
}

function addEvent(tripId, eventType, fromStatus, toStatus, userId, detail, actorType = 'user') {
  getDB().prepare(`
    INSERT INTO transport_trip_events(
      trip_id,event_type,from_status,to_status,actor_type,actor_user_id,detail
    ) VALUES(?,?,?,?,?,?,?)
  `).run(
    tripId,
    eventType,
    fromStatus || null,
    toStatus || null,
    actorType,
    userId || null,
    detail ? JSON.stringify(detail) : null,
  )
}

export function createTrip(data, userId) {
  const db = getDB()
  const vehicle = db.prepare('SELECT capacity FROM transport_vehicles WHERE id=?').get(data.vehicle_id)
  const capacity = data.capacity_snapshot || vehicle?.capacity
  if (!capacity) fail('Kapasite veya geçerli araç gerekli')
  const candidate = { ...data, capacity_snapshot: capacity }
  assertResourceConflicts(candidate)
  const id = db.prepare(`
    INSERT INTO transport_trips(
      route_id,work_date,direction,scheduled_departure,status,vehicle_id,driver_id,
      capacity_snapshot,source,notes,created_by,updated_by
    ) VALUES(?,?,?,?,'draft',?,?,?,'manual',?,?,?)
  `).run(
    data.route_id, data.work_date, data.direction, data.scheduled_departure,
    data.vehicle_id || null, data.driver_id || null, capacity, data.notes || null,
    userId || null, userId || null,
  ).lastInsertRowid
  addEvent(id, 'created', null, 'draft', userId, { source: 'manual' })
  return { id, revision: bumpTransportRevision() }
}

export function updateTrip(id, data, userId) {
  const trip = tripById(id)
  if (['completed', 'cancelled'].includes(trip.status)) fail('Tamamlanmış veya iptal edilmiş sefer kilitli', 409)
  const fields = [
    'route_id', 'work_date', 'direction', 'scheduled_departure',
    'vehicle_id', 'driver_id', 'capacity_snapshot', 'notes',
  ]
  const next = { ...trip, ...data }
  assertResourceConflicts(next, id)
  const sets = []
  const params = []
  for (const field of fields) {
    if (data[field] !== undefined) {
      sets.push(`${field}=?`)
      params.push(data[field] === '' ? null : data[field])
    }
  }
  if (!sets.length) return { ok: true, revision: getTransportRevision() }
  params.push(userId || null, id)
  getDB().prepare(`
    UPDATE transport_trips SET ${sets.join(',')}, updated_by=?, updated_at=datetime('now') WHERE id=?
  `).run(...params)
  addEvent(id, 'trip_updated', trip.status, trip.status, userId, { changes: data, reason: data.change_reason || null })
  return { ok: true, revision: bumpTransportRevision() }
}

export function transitionTrip(id, action, { reason, delay_minutes: delayMinutes } = {}, user) {
  const db = getDB()
  const trip = tripById(id)
  const target = {
    publish: 'published',
    boarding: 'boarding',
    depart: 'departed',
    complete: 'completed',
    cancel: 'cancelled',
  }[action]
  if (!target) fail('Geçersiz sefer işlemi')
  if (!TRANSITIONS[trip.status]?.includes(target)) {
    fail(`${trip.status} durumundan ${target} durumuna geçilemez`, 409)
  }
  if (target === 'published') {
    assertRouteAndResources(trip)
    assertResourceConflicts(trip, id)
  }
  if (target === 'cancelled' && !reason?.trim()) fail('İptal gerekçesi gerekli')

  const timestamp = {
    published: 'published_at',
    boarding: 'boarding_started_at',
    departed: 'departed_at',
    completed: 'completed_at',
    cancelled: 'cancelled_at',
  }[target]
  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE transport_trips
      SET status=?, ${timestamp}=datetime('now'),
        cancellation_reason=CASE WHEN ?='cancelled' THEN ? ELSE cancellation_reason END,
        updated_by=?, updated_at=datetime('now')
      WHERE id=?
    `).run(target, target, reason || null, user.id || null, id)
    if (target === 'departed') {
      db.prepare(`
        UPDATE transport_trip_assignments
        SET status='no_show', status_reason='Kalkışta binmedi', updated_at=datetime('now')
        WHERE trip_id=? AND status='assigned'
      `).run(id)
    }
    addEvent(id, action, trip.status, target, user.id, {
      reason: reason || null,
      delay_minutes: delayMinutes || null,
    })
  })
  tx()
  return { ok: true, status: target, revision: bumpTransportRevision() }
}

export function reopenTrip(id, reason, user) {
  if (user.role !== 'campus_manager') fail('Yalnızca kampüs müdürü yeniden açabilir', 403)
  if (!reason?.trim()) fail('Yeniden açma gerekçesi gerekli')
  const trip = tripById(id)
  if (!['completed', 'cancelled'].includes(trip.status)) fail('Yalnızca kapanmış sefer yeniden açılabilir', 409)
  getDB().prepare(`
    UPDATE transport_trips SET status='published', completed_at=NULL, cancelled_at=NULL,
      cancellation_reason=NULL, updated_by=?, updated_at=datetime('now') WHERE id=?
  `).run(user.id || null, id)
  addEvent(id, 'reopened', trip.status, 'published', user.id, { reason })
  return { ok: true, status: 'published', revision: bumpTransportRevision() }
}

function assertStaffConflict(staffId, trip) {
  const conflict = getDB().prepare(`
    SELECT t.id, r.name AS route_name
    FROM transport_trip_assignments a
    JOIN transport_trips t ON t.id=a.trip_id
    JOIN routes r ON r.id=t.route_id
    WHERE a.staff_id=? AND a.status NOT IN ('cancelled','waitlisted')
      AND t.status<>'cancelled' AND t.work_date=? AND t.id<>?
      AND abs((julianday(t.scheduled_departure)-julianday(?))*24*60) < 180
    LIMIT 1
  `).get(staffId, trip.work_date, trip.id, trip.scheduled_departure)
  if (conflict) fail(`Personel ${conflict.route_name} seferiyle çakışıyor`, 409)
}

export function addAssignment(tripId, data, userId) {
  const db = getDB()
  const trip = tripById(tripId)
  if (['departed', 'completed', 'cancelled'].includes(trip.status)) fail('Bu sefere atama yapılamaz', 409)
  assertStaffConflict(data.staff_id, trip)
  const occupied = db.prepare(`
    SELECT COUNT(*) AS count FROM transport_trip_assignments
    WHERE trip_id=? AND status IN ('assigned','boarded','no_show')
  `).get(tripId).count
  const status = data.status || (occupied >= trip.capacity_snapshot ? 'waitlisted' : 'assigned')
  const id = db.prepare(`
    INSERT INTO transport_trip_assignments(
      trip_id,staff_id,stop_id,status,source,assigned_by,status_reason
    ) VALUES(?,?,?,?, 'manual', ?,?)
    ON CONFLICT(trip_id,staff_id) DO UPDATE SET
      stop_id=excluded.stop_id,status=excluded.status,status_reason=excluded.status_reason,
      assigned_by=excluded.assigned_by,updated_at=datetime('now')
    RETURNING id
  `).get(tripId, data.staff_id, data.stop_id || null, status, userId || null, data.reason || null).id
  addEvent(tripId, 'assignment_added', trip.status, trip.status, userId, { assignment_id: id, staff_id: data.staff_id, status })
  return { id, status, revision: bumpTransportRevision() }
}

function promoteWaitlist(tripId, userId, approveAfterDeparture = false) {
  const db = getDB()
  const trip = tripById(tripId)
  const occupied = db.prepare(`
    SELECT COUNT(*) AS count FROM transport_trip_assignments
    WHERE trip_id=? AND status IN ('assigned','boarded','no_show')
  `).get(tripId).count
  if (occupied >= trip.capacity_snapshot) return null
  const waiting = db.prepare(`
    SELECT id, staff_id FROM transport_trip_assignments
    WHERE trip_id=? AND status='waitlisted' ORDER BY created_at, id LIMIT 1
  `).get(tripId)
  if (!waiting) return null
  if (['departed', 'completed'].includes(trip.status) && !approveAfterDeparture) {
    return { approval_required: true, assignment_id: waiting.id }
  }
  db.prepare(`
    UPDATE transport_trip_assignments
    SET status='assigned', status_reason='Yedekten otomatik terfi', updated_at=datetime('now')
    WHERE id=?
  `).run(waiting.id)
  addEvent(tripId, 'waitlist_promoted', trip.status, trip.status, userId, {
    assignment_id: waiting.id,
    staff_id: waiting.staff_id,
    after_departure: ['departed', 'completed'].includes(trip.status),
  }, userId ? 'user' : 'system')
  return { promoted_assignment_id: waiting.id }
}

export function updateAssignment(id, data, user) {
  const db = getDB()
  const assignment = db.prepare(`
    SELECT a.*, t.status AS trip_status FROM transport_trip_assignments a
    JOIN transport_trips t ON t.id=a.trip_id WHERE a.id=?
  `).get(id)
  if (!assignment) fail('Atama bulunamadı', 404)
  if (assignment.trip_status === 'completed') fail('Tamamlanan sefer kilitli', 409)
  if (data.status === 'assigned' && assignment.status !== 'assigned') {
    const trip = tripById(assignment.trip_id)
    const occupied = db.prepare(`
      SELECT COUNT(*) AS count FROM transport_trip_assignments
      WHERE trip_id=? AND id<>? AND status IN ('assigned','boarded','no_show')
    `).get(assignment.trip_id, id).count
    if (occupied >= trip.capacity_snapshot) fail('Sefer kapasitesi dolu', 409)
    assertStaffConflict(assignment.staff_id, trip)
  }
  const boardedAt = data.status === 'boarded' ? "datetime('now')" : 'boarded_at'
  db.prepare(`
    UPDATE transport_trip_assignments
    SET status=?, status_reason=?, boarded_at=${boardedAt}, updated_at=datetime('now')
    WHERE id=?
  `).run(data.status, data.reason || null, id)
  addEvent(assignment.trip_id, 'assignment_status', assignment.trip_status, assignment.trip_status, user.id, {
    assignment_id: id,
    from_status: assignment.status,
    to_status: data.status,
    reason: data.reason || null,
  })
  let promotion = null
  if (['cancelled', 'no_show'].includes(data.status)) {
    promotion = promoteWaitlist(assignment.trip_id, user.id, data.approve_promotion === true)
  }
  return { ok: true, promotion, revision: bumpTransportRevision() }
}

export function removeAssignment(id, user) {
  return updateAssignment(id, { status: 'cancelled', reason: 'Atama kaldırıldı' }, user)
}

export function scanTrip(tripId, data, userId) {
  const db = getDB()
  const existing = db.prepare(`
    SELECT se.*, s.full_name FROM transport_scan_events se
    LEFT JOIN staff s ON s.id=se.staff_id WHERE se.client_event_id=?
  `).get(data.client_event_id)
  if (existing) return { ...existing, duplicate: true, revision: getTransportRevision() }
  const tx = db.transaction(() => {
    const trip = tripById(tripId)
    const offlineBeforeDeparture = ['departed', 'completed'].includes(trip.status)
      && data.device_time
      && trip.departed_at
      && data.device_time <= `${trip.departed_at.replace(' ', 'T')}Z`
    if (trip.status !== 'boarding' && !offlineBeforeDeparture) {
      fail('QR okutmak için biniş başlatılmalı', 409)
    }
    const token = data.qr_token.replace(/^AVS:/i, '').trim()
    const staff = db.prepare(`
      SELECT id, full_name FROM staff WHERE qr_token=? AND is_active=1
    `).get(token)
    let assignment = null
    let result = 'invalid_qr'
    if (staff) {
      assignment = db.prepare(`
        SELECT * FROM transport_trip_assignments WHERE trip_id=? AND staff_id=?
      `).get(tripId, staff.id)
      if (!assignment || assignment.status === 'cancelled') result = 'not_assigned'
      else if (assignment.status === 'boarded') result = 'already_boarded'
      else if (assignment.status === 'assigned') {
        result = 'boarded'
        db.prepare(`
          UPDATE transport_trip_assignments SET status='boarded', boarded_at=datetime('now'),
            status_reason=NULL, updated_at=datetime('now') WHERE id=?
        `).run(assignment.id)
      } else result = 'rejected'
    }
    const id = db.prepare(`
      INSERT INTO transport_scan_events(
        trip_id,assignment_id,staff_id,client_event_id,result,scanned_by,device_time
      ) VALUES(?,?,?,?,?,?,?)
    `).run(
      tripId, assignment?.id || null, staff?.id || null, data.client_event_id,
      result, userId || null, data.device_time || null,
    ).lastInsertRowid
    addEvent(tripId, 'qr_scan', trip.status, trip.status, userId, {
      scan_event_id: id,
      result,
      staff_id: staff?.id || null,
    })
    return { id, result, staff_id: staff?.id || null, full_name: staff?.full_name || null }
  })
  const result = tx()
  return { ...result, duplicate: false, revision: bumpTransportRevision() }
}
