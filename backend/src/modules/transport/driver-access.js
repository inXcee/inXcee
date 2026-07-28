import { createHash, randomBytes } from 'node:crypto'
import { getDB } from '../../shared/db/index.js'
import { bumpTransportRevision } from './v2-core.js'

function fail(message, status = 400) {
  const error = new Error(message)
  error.status = status
  throw error
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function loadTrip(id) {
  const trip = getDB().prepare(`
    SELECT t.*, r.name AS route_name, r.color AS route_color,
      v.plate AS vehicle_plate, v.label AS vehicle_label,
      d.full_name AS driver_name
    FROM transport_trips t
    JOIN routes r ON r.id=t.route_id
    LEFT JOIN transport_vehicles v ON v.id=t.vehicle_id
    LEFT JOIN transport_drivers d ON d.id=t.driver_id
    WHERE t.id=?
  `).get(id)
  if (!trip) fail('Sefer bulunamadı', 404)
  return trip
}

function addDriverEvent(tripId, eventType, fromStatus, toStatus, detail) {
  getDB().prepare(`
    INSERT INTO transport_trip_events(
      trip_id,event_type,from_status,to_status,actor_type,detail
    ) VALUES(?,?,?,?, 'driver_link', ?)
  `).run(tripId, eventType, fromStatus || null, toStatus || null, detail ? JSON.stringify(detail) : null)
}

export function createDriverAccess(tripId, requestedHours, userId) {
  const trip = loadTrip(tripId)
  if (!['published', 'boarding', 'departed'].includes(trip.status)) {
    fail('Yalnızca aktif ve yayınlanmış sefer paylaşılabilir', 409)
  }
  const hours = Math.min(24, Math.max(1, Number(requestedHours) || 24))
  const rawToken = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
  const result = getDB().prepare(`
    INSERT INTO transport_trip_access_tokens(trip_id,token_hash,expires_at,created_by)
    VALUES(?,?,?,?)
  `).run(tripId, hashToken(rawToken), expiresAt, userId || null)
  addDriverEvent(tripId, 'driver_link_created', trip.status, trip.status, {
    token_id: result.lastInsertRowid,
    expires_at: expiresAt,
  })
  return {
    id: result.lastInsertRowid,
    token: rawToken,
    expires_at: expiresAt,
    public_path: `/driver/trips/${rawToken}`,
  }
}

export function revokeDriverAccess(tripId, tokenId, userId) {
  const result = getDB().prepare(`
    UPDATE transport_trip_access_tokens
    SET revoked_at=datetime('now')
    WHERE id=? AND trip_id=? AND revoked_at IS NULL
  `).run(tokenId, tripId)
  if (!result.changes) fail('Aktif bağlantı bulunamadı', 404)
  const trip = loadTrip(tripId)
  addDriverEvent(tripId, 'driver_link_revoked', trip.status, trip.status, {
    token_id: tokenId,
    revoked_by: userId || null,
  })
  return { ok: true }
}

export function listDriverAccess(tripId) {
  loadTrip(tripId)
  return getDB().prepare(`
    SELECT id, expires_at, revoked_at, created_at,
      CASE
        WHEN revoked_at IS NOT NULL THEN 'revoked'
        WHEN datetime(expires_at)<=datetime('now') THEN 'expired'
        ELSE 'active'
      END AS status
    FROM transport_trip_access_tokens
    WHERE trip_id=? ORDER BY id DESC
  `).all(tripId)
}

function resolveToken(token) {
  if (typeof token !== 'string' || token.length < 32 || token.length > 200) {
    fail('Geçersiz bağlantı', 404)
  }
  const row = getDB().prepare(`
    SELECT tat.id AS token_id, tat.trip_id, tat.expires_at, tat.revoked_at
    FROM transport_trip_access_tokens tat
    WHERE tat.token_hash=?
  `).get(hashToken(token))
  if (!row) fail('Geçersiz bağlantı', 404)
  if (row.revoked_at) fail('Bağlantı iptal edilmiş', 410)
  if (new Date(row.expires_at).getTime() <= Date.now()) fail('Bağlantının süresi dolmuş', 410)
  return row
}

export function getDriverManifest(token) {
  const access = resolveToken(token)
  const trip = loadTrip(access.trip_id)
  if (trip.status === 'cancelled') fail('Sefer iptal edilmiş', 410)
  const assignments = getDB().prepare(`
    SELECT a.id, a.status, s.full_name,
      pp.name AS stop_name, pp.district,
      rs.sequence_order, rs.scheduled_time
    FROM transport_trip_assignments a
    JOIN staff s ON s.id=a.staff_id
    LEFT JOIN route_stops rs ON rs.id=a.stop_id
    LEFT JOIN pickup_points pp ON pp.id=rs.pickup_point_id
    WHERE a.trip_id=? AND a.status<>'cancelled'
    ORDER BY COALESCE(rs.sequence_order, 999), s.full_name
  `).all(trip.id)
  return {
    token_id: access.token_id,
    expires_at: access.expires_at,
    trip: {
      id: trip.id,
      route_name: trip.route_name,
      direction: trip.direction,
      scheduled_departure: trip.scheduled_departure,
      status: trip.status,
      vehicle_plate: trip.vehicle_plate,
      vehicle_label: trip.vehicle_label,
      driver_name: trip.driver_name,
      capacity: trip.capacity_snapshot,
    },
    manifest: assignments,
    privacy: 'Telefon numaraları şoför görünümünde gizlidir.',
  }
}

export function driverTransition(token, action) {
  const access = resolveToken(token)
  const db = getDB()
  const trip = loadTrip(access.trip_id)
  if (action === 'start') {
    if (!['published', 'boarding'].includes(trip.status)) {
      fail('Bu sefer başlatılamaz', 409)
    }
    const result = db.transaction(() => {
      db.prepare(`
        UPDATE transport_trips
        SET status='departed', departed_at=datetime('now'), updated_at=datetime('now')
        WHERE id=?
      `).run(trip.id)
      db.prepare(`
        UPDATE transport_trip_assignments
        SET status='no_show', status_reason='Kalkışta binmedi', updated_at=datetime('now')
        WHERE trip_id=? AND status='assigned'
      `).run(trip.id)
      addDriverEvent(trip.id, 'driver_started', trip.status, 'departed', { token_id: access.token_id })
      return 'departed'
    })()
    return { ok: true, status: result, revision: bumpTransportRevision() }
  }
  if (action === 'complete') {
    if (trip.status !== 'departed') fail('Yalnızca yoldaki sefer tamamlanabilir', 409)
    db.prepare(`
      UPDATE transport_trips
      SET status='completed', completed_at=datetime('now'), updated_at=datetime('now')
      WHERE id=?
    `).run(trip.id)
    addDriverEvent(trip.id, 'driver_completed', trip.status, 'completed', { token_id: access.token_id })
    return { ok: true, status: 'completed', revision: bumpTransportRevision() }
  }
  fail('Geçersiz işlem')
}
