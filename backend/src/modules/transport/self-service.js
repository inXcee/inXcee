import { getDB } from '../../shared/db/index.js'

export function getStaffTransport(staffId, date = new Date().toISOString().slice(0, 10)) {
  const db = getDB()
  const staff = db.prepare('SELECT id, pickup_point_id FROM staff WHERE id=? AND is_active=1').get(staffId)
  if (!staff) return { today: null, schedule: null, pickup: null, date, upcoming: [], history: [] }

  const pickup = staff.pickup_point_id ? db.prepare(`
    SELECT name, district, neighborhood, notes, photo_url, lat, lng
    FROM pickup_points WHERE id=?
  `).get(staff.pickup_point_id) : null

  const rows = db.prepare(`
    SELECT a.id AS assignment_id, a.status AS assignment_status,
      t.id AS trip_id, t.work_date, t.direction, t.scheduled_departure, t.status,
      r.name AS route_name, r.color,
      v.plate AS vehicle_plate, v.label AS vehicle_label,
      d.full_name AS driver_name,
      rs.scheduled_time, pp.name AS stop_name, pp.district, pp.neighborhood
    FROM transport_trip_assignments a
    JOIN transport_trips t ON t.id=a.trip_id
    JOIN routes r ON r.id=t.route_id
    LEFT JOIN transport_vehicles v ON v.id=t.vehicle_id
    LEFT JOIN transport_drivers d ON d.id=t.driver_id
    LEFT JOIN route_stops rs ON rs.id=a.stop_id
    LEFT JOIN pickup_points pp ON pp.id=rs.pickup_point_id
    WHERE a.staff_id=? AND a.status<>'cancelled'
      AND t.work_date BETWEEN date(?, '-30 days') AND date(?, '+60 days')
    ORDER BY t.scheduled_departure
  `).all(staffId, date, date)

  const today = rows.find(row => row.work_date === date) || null
  const boundary = `${date}T00:00`
  const upcoming = rows.filter(row =>
    row.scheduled_departure >= boundary && !['completed', 'cancelled'].includes(row.status))
  const history = rows.filter(row =>
    row.scheduled_departure < boundary || ['completed', 'cancelled'].includes(row.status)).reverse()
  const schedule = today ? {
    trip_id: today.trip_id,
    time: today.scheduled_time || String(today.scheduled_departure).slice(11, 16),
    route_name: today.route_name,
    driver_name: today.driver_name,
    driver_phone: null,
    plate: today.vehicle_plate,
    direction: today.direction,
    status: today.status,
    assignment_status: today.assignment_status,
  } : null

  return { today, schedule, pickup, date, upcoming, history }
}
