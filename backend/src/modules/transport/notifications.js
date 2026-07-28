import { getDB } from '../../shared/db/index.js'
import { createNotification } from '../../shared/notifications/service.js'
import { sendPushToWorker } from '../../shared/notifications/push.js'
import { EVENT_KINDS } from '../../shared/notifications/events.js'
import { logger } from '../../shared/logger.js'

const EVENT_CONFIG = {
  published: {
    kind: EVENT_KINDS.TRANSPORT_TRIP_PUBLISHED,
    severity: 'info',
    title: 'Servis planınız yayınlandı',
  },
  changed: {
    kind: EVENT_KINDS.TRANSPORT_TRIP_CHANGED,
    severity: 'warning',
    title: 'Servis planınız değişti',
  },
  cancelled: {
    kind: EVENT_KINDS.TRANSPORT_TRIP_CANCELLED,
    severity: 'critical',
    title: 'Servis seferi iptal edildi',
  },
  promoted: {
    kind: EVENT_KINDS.TRANSPORT_WAITLIST_PROMOTED,
    severity: 'info',
    title: 'Serviste yer açıldı',
  },
  upcoming: {
    kind: EVENT_KINDS.TRANSPORT_TRIP_UPCOMING,
    severity: 'info',
    title: 'Servisiniz yaklaşıyor',
  },
}

function tripContext(tripId) {
  return getDB().prepare(`
    SELECT t.id, t.status, t.direction, t.scheduled_departure,
      r.name AS route_name, v.plate, d.full_name AS driver_name
    FROM transport_trips t
    JOIN routes r ON r.id=t.route_id
    LEFT JOIN transport_vehicles v ON v.id=t.vehicle_id
    LEFT JOIN transport_drivers d ON d.id=t.driver_id
    WHERE t.id=?
  `).get(tripId)
}

function participantIds(tripId, staffId) {
  if (staffId) return [Number(staffId)]
  return getDB().prepare(`
    SELECT staff_id FROM transport_trip_assignments
    WHERE trip_id=? AND status NOT IN ('cancelled','no_show')
  `).all(tripId).map(row => row.staff_id)
}

function formatMessage(config, trip, detail) {
  const direction = trip.direction === 'inbound' ? 'dönüş' : 'gidiş'
  const time = String(trip.scheduled_departure).slice(11, 16)
  const suffix = detail ? ` · ${detail}` : ''
  return `${config.title}: ${trip.route_name} ${direction}, ${time}${suffix}`
}

export function notifyTripEvent(tripId, event, { staffId, detail, dedupSuffix } = {}) {
  const config = EVENT_CONFIG[event]
  const trip = tripContext(tripId)
  if (!config || !trip || trip.status === 'draft') return { notified: 0 }

  const message = formatMessage(config, trip, detail)
  const dedupBase = `transport_${event}_${tripId}_${dedupSuffix || trip.status}`
  for (const role of ['campus_manager', 'shift_supervisor']) {
    createNotification({
      message,
      severity: config.severity,
      target_role: role,
      dedup_key: `${dedupBase}_${role}`,
      event_kind: config.kind,
      entity_type: 'transport_trip',
      entity_id: tripId,
    })
  }

  const workers = participantIds(tripId, staffId)
  for (const workerId of workers) {
    sendPushToWorker(workerId, {
      title: config.title,
      body: message,
      severity: config.severity,
      module: 'transport',
      event_kind: config.kind,
      url: '/avs-kiosk',
      trip_id: tripId,
    }).catch(error => logger.error('[Transport push]', error))
  }
  return { notified: workers.length }
}

export function notifyUpcomingTrips(now = new Date()) {
  const db = getDB()
  const start = now.toISOString().slice(0, 19).replace('T', ' ')
  const end = new Date(now.getTime() + 30 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ')
  const trips = db.prepare(`
    SELECT id FROM transport_trips
    WHERE status='published'
      AND datetime(scheduled_departure) BETWEEN datetime(?) AND datetime(?)
  `).all(start, end)
  let notified = 0
  for (const trip of trips) {
    notified += notifyTripEvent(trip.id, 'upcoming', {
      dedupSuffix: String(trip.id),
      detail: '30 dakika içinde',
    }).notified
  }
  return { trips: trips.length, notified }
}
