import { getDB } from '../../shared/db/index.js'

// ── Pickup Points ──
export function listPickupPoints({ activeOnly = false } = {}) {
  const db = getDB()
  const where = activeOnly ? 'WHERE pp.is_active = 1' : ''
  return db.prepare(`
    SELECT pp.*,
      (SELECT COUNT(*) FROM staff WHERE pickup_point_id = pp.id AND is_active = 1) as staff_count,
      (SELECT COUNT(*) FROM route_stops WHERE pickup_point_id = pp.id) as route_count
    FROM pickup_points pp
    ${where}
    ORDER BY pp.district, pp.name
  `).all()
}

export function getPickupPoint(id) {
  return getDB().prepare('SELECT * FROM pickup_points WHERE id=?').get(id)
}

export function createPickupPoint(data) {
  return getDB().prepare(`
    INSERT INTO pickup_points(name, district, neighborhood, lat, lng, notes, is_active)
    VALUES(?,?,?,?,?,?,?)
  `).run(data.name, data.district || null, data.neighborhood || null,
    data.lat ?? null, data.lng ?? null, data.notes || null, data.is_active ?? 1).lastInsertRowid
}

export function updatePickupPoint(id, data) {
  const db = getDB()
  const fields = ['name', 'district', 'neighborhood', 'lat', 'lng', 'notes', 'is_active']
  const sets = []
  const params = []
  fields.forEach(f => {
    if (data[f] !== undefined) { sets.push(`${f}=?`); params.push(data[f] === '' ? null : data[f]) }
  })
  if (!sets.length) return
  params.push(id)
  db.prepare(`UPDATE pickup_points SET ${sets.join(',')} WHERE id=?`).run(...params)
}

export function deletePickupPoint(id) {
  getDB().prepare('UPDATE pickup_points SET is_active = 0 WHERE id=?').run(id)
}

// Tüm personel + durak/rota bilgisi (atama yönetim sayfası için)
export function listStaffWithTransport({ deptId, hasPickup } = {}) {
  const db = getDB()
  let q = `
    SELECT s.id, s.full_name, s.phone, s.role_label, s.is_active,
      s.pickup_point_id,
      pp.name as pickup_name, pp.district as pickup_district,
      d.id as department_id, d.name as dept_name, d.color_class as dept_color,
      (
        SELECT GROUP_CONCAT(r.name || '|' || COALESCE(r.color, ''))
        FROM route_stops rs
        JOIN routes r ON r.id = rs.route_id
        WHERE rs.pickup_point_id = s.pickup_point_id AND r.is_active = 1
      ) as route_summary
    FROM staff s
    LEFT JOIN pickup_points pp ON pp.id = s.pickup_point_id
    LEFT JOIN departments d ON d.id = s.department_id
    WHERE s.is_active = 1
  `
  const params = []
  if (deptId) { q += ' AND s.department_id = ?'; params.push(deptId) }
  if (hasPickup === 'yes') q += ' AND s.pickup_point_id IS NOT NULL'
  else if (hasPickup === 'no') q += ' AND s.pickup_point_id IS NULL'
  q += ' ORDER BY pp.district NULLS LAST, pp.name NULLS LAST, s.full_name'
  return db.prepare(q).all(...params)
}

export function getStaffAtPoint(pickupPointId) {
  return getDB().prepare(`
    SELECT s.id, s.full_name, s.phone, s.role_label,
      d.name as dept_name, d.color_class as dept_color
    FROM staff s
    LEFT JOIN departments d ON d.id = s.department_id
    WHERE s.pickup_point_id = ? AND s.is_active = 1
    ORDER BY s.full_name
  `).all(pickupPointId)
}

// ── Routes ──
export function listRoutes({ activeOnly = false } = {}) {
  const db = getDB()
  const where = activeOnly ? 'WHERE r.is_active = 1' : ''
  return db.prepare(`
    SELECT r.*,
      sd.name as shift_name, sd.start_hour, sd.end_hour, sd.color_class as shift_color,
      (SELECT COUNT(*) FROM route_stops WHERE route_id = r.id) as stop_count
    FROM routes r
    LEFT JOIN shift_definitions sd ON sd.id = r.shift_def_id
    ${where}
    ORDER BY r.name
  `).all()
}

export function getRoute(id) {
  return getDB().prepare(`
    SELECT r.*, sd.name as shift_name, sd.start_hour, sd.end_hour, sd.color_class as shift_color
    FROM routes r
    LEFT JOIN shift_definitions sd ON sd.id = r.shift_def_id
    WHERE r.id = ?
  `).get(id)
}

export function createRoute(data) {
  return getDB().prepare(`
    INSERT INTO routes(name, vehicle_plate, capacity, driver_name, driver_phone, shift_def_id, color, is_active, notes)
    VALUES(?,?,?,?,?,?,?,?,?)
  `).run(
    data.name,
    data.vehicle_plate || null,
    data.capacity || 16,
    data.driver_name || null,
    data.driver_phone || null,
    data.shift_def_id || null,
    data.color || '#3b82f6',
    data.is_active ?? 1,
    data.notes || null,
  ).lastInsertRowid
}

export function updateRoute(id, data) {
  const db = getDB()
  const fields = ['name', 'vehicle_plate', 'capacity', 'driver_name', 'driver_phone',
    'shift_def_id', 'color', 'is_active', 'notes']
  const sets = []
  const params = []
  fields.forEach(f => {
    if (data[f] !== undefined) { sets.push(`${f}=?`); params.push(data[f] === '' ? null : data[f]) }
  })
  if (!sets.length) return
  params.push(id)
  db.prepare(`UPDATE routes SET ${sets.join(',')} WHERE id=?`).run(...params)
}

export function deleteRoute(id) {
  getDB().prepare('UPDATE routes SET is_active = 0 WHERE id=?').run(id)
}

// ── Route Stops ──
export function listRouteStops(routeId) {
  return getDB().prepare(`
    SELECT rs.*, pp.name as point_name, pp.district, pp.neighborhood, pp.lat, pp.lng
    FROM route_stops rs
    JOIN pickup_points pp ON pp.id = rs.pickup_point_id
    WHERE rs.route_id = ?
    ORDER BY rs.sequence_order, rs.id
  `).all(routeId)
}

export function addRouteStop(routeId, data) {
  const db = getDB()
  // Sıra otomatik: en yüksek+1
  const max = db.prepare('SELECT COALESCE(MAX(sequence_order), 0) as m FROM route_stops WHERE route_id=?').get(routeId).m
  return db.prepare(`
    INSERT INTO route_stops(route_id, pickup_point_id, sequence_order, scheduled_time)
    VALUES(?,?,?,?)
  `).run(routeId, data.pickup_point_id, data.sequence_order ?? (max + 1), data.scheduled_time || null).lastInsertRowid
}

export function updateRouteStop(id, data) {
  const db = getDB()
  const fields = ['pickup_point_id', 'sequence_order', 'scheduled_time']
  const sets = []
  const params = []
  fields.forEach(f => {
    if (data[f] !== undefined) { sets.push(`${f}=?`); params.push(data[f] === '' ? null : data[f]) }
  })
  if (!sets.length) return
  params.push(id)
  db.prepare(`UPDATE route_stops SET ${sets.join(',')} WHERE id=?`).run(...params)
}

export function deleteRouteStop(id) {
  getDB().prepare('DELETE FROM route_stops WHERE id=?').run(id)
}

export function reorderRouteStops(routeId, orderedStopIds) {
  const db = getDB()
  const upd = db.prepare('UPDATE route_stops SET sequence_order = ? WHERE id = ? AND route_id = ?')
  const tx = db.transaction(() => {
    orderedStopIds.forEach((id, idx) => upd.run(idx + 1, id, routeId))
  })
  tx()
}

// ── Staff pickup assignment ──
export function setStaffPickup(staffId, pickupPointId) {
  getDB().prepare('UPDATE staff SET pickup_point_id = ? WHERE id = ?').run(pickupPointId || null, staffId)
}

// ── Daily route operations ──
// Bugün vardiyada olan personeli pickup_point_id'sine göre rotalara dağıt
export function autoAssign(workDate, options = {}) {
  const db = getDB()
  const { overrideExisting = false } = options

  // O gün vardiyada olan personeller
  const onShift = db.prepare(`
    SELECT DISTINCT s.id, s.full_name, s.pickup_point_id, s.department_id, ss.shift_def_id
    FROM staff s
    LEFT JOIN shift_schedule ss ON ss.staff_id = s.id AND ss.work_date = ?
    WHERE s.is_active = 1
      AND ss.id IS NOT NULL
      AND ss.status IN ('scheduled', 'worked', 'overtime')
  `).all(workDate)

  // Mevcut atamalar
  const existing = new Set(db.prepare('SELECT staff_id FROM route_assignments WHERE work_date=?').all(workDate).map(r => r.staff_id))

  // Her durak için rota+stop bul (varsa vardiya uyumlu olanı tercih et)
  const stopRouteMap = db.prepare(`
    SELECT rs.pickup_point_id, rs.id as stop_id, rs.route_id, r.shift_def_id, r.capacity
    FROM route_stops rs
    JOIN routes r ON r.id = rs.route_id
    WHERE r.is_active = 1
  `).all()

  const stats = { assigned: 0, skipped_no_pickup: 0, skipped_no_route: 0, skipped_existing: 0, errors: [] }

  const insert = db.prepare(`
    INSERT INTO route_assignments(route_id, stop_id, staff_id, work_date, assigned_by)
    VALUES(?,?,?,?,?)
    ON CONFLICT(staff_id, work_date) DO UPDATE SET
      route_id = excluded.route_id, stop_id = excluded.stop_id
  `)
  const remove = db.prepare('DELETE FROM route_assignments WHERE staff_id=? AND work_date=?')

  const routeFillCount = new Map() // route_id -> mevcut atanmış kişi sayısı
  db.prepare(`SELECT route_id, COUNT(*) as c FROM route_assignments WHERE work_date=? GROUP BY route_id`).all(workDate)
    .forEach(r => routeFillCount.set(r.route_id, r.c))

  const tx = db.transaction(() => {
    for (const person of onShift) {
      if (!person.pickup_point_id) { stats.skipped_no_pickup++; continue }
      if (existing.has(person.id) && !overrideExisting) { stats.skipped_existing++; continue }

      // Bu durağa hizmet veren rotalar
      const candidates = stopRouteMap.filter(s => s.pickup_point_id === person.pickup_point_id)
      if (!candidates.length) { stats.skipped_no_route++; continue }

      // Vardiya uyumu öncelikli, sonra doluluk durumu
      candidates.sort((a, b) => {
        const aMatch = a.shift_def_id === person.shift_def_id ? 0 : 1
        const bMatch = b.shift_def_id === person.shift_def_id ? 0 : 1
        if (aMatch !== bMatch) return aMatch - bMatch
        return (routeFillCount.get(a.route_id) || 0) - (routeFillCount.get(b.route_id) || 0)
      })

      const pick = candidates[0]
      if (overrideExisting && existing.has(person.id)) {
        remove.run(person.id, workDate)
      }
      insert.run(pick.route_id, pick.stop_id, person.id, workDate, null)
      routeFillCount.set(pick.route_id, (routeFillCount.get(pick.route_id) || 0) + 1)
      stats.assigned++
    }
  })
  tx()
  return stats
}

// Günün manifestosu — her rotanın durak-durak personel listesi
export function getRouteManifest(routeId, workDate) {
  const db = getDB()
  const route = getRoute(routeId)
  if (!route) return null
  const stops = db.prepare(`
    SELECT rs.id as stop_id, rs.sequence_order, rs.scheduled_time,
      pp.id as pickup_point_id, pp.name as point_name, pp.district, pp.neighborhood
    FROM route_stops rs
    JOIN pickup_points pp ON pp.id = rs.pickup_point_id
    WHERE rs.route_id = ?
    ORDER BY rs.sequence_order, rs.id
  `).all(routeId)

  const passengers = db.prepare(`
    SELECT ra.staff_id, ra.stop_id, s.full_name, s.phone, s.role_label,
      d.name as dept_name, d.color_class as dept_color
    FROM route_assignments ra
    JOIN staff s ON s.id = ra.staff_id
    LEFT JOIN departments d ON d.id = s.department_id
    WHERE ra.route_id = ? AND ra.work_date = ?
    ORDER BY s.full_name
  `).all(routeId, workDate)

  const byStop = {}
  for (const s of stops) byStop[s.stop_id] = { ...s, passengers: [] }
  byStop._unassigned = { stop_id: null, point_name: '(durak atanmamış)', passengers: [] }
  for (const p of passengers) {
    const key = p.stop_id || '_unassigned'
    if (byStop[key]) byStop[key].passengers.push(p)
    else byStop._unassigned.passengers.push(p)
  }

  return {
    route,
    stops: Object.values(byStop).filter(s => s.stop_id !== null || s.passengers.length > 0),
    total_passengers: passengers.length,
  }
}

// Günün tüm rotaları + her birinin yolcu sayısı
export function getDailyOverview(workDate) {
  const db = getDB()
  const routes = db.prepare(`
    SELECT r.id, r.name, r.color, r.capacity, r.vehicle_plate, r.driver_name,
      sd.name as shift_name, sd.start_hour, sd.end_hour,
      COALESCE(ra.assigned, 0) as assigned_count
    FROM routes r
    LEFT JOIN shift_definitions sd ON sd.id = r.shift_def_id
    LEFT JOIN (
      SELECT route_id, COUNT(*) as assigned FROM route_assignments WHERE work_date = ? GROUP BY route_id
    ) ra ON ra.route_id = r.id
    WHERE r.is_active = 1
    ORDER BY r.name
  `).all(workDate)

  // Bugün vardiyada olan toplam kişi
  const onShiftCount = db.prepare(`
    SELECT COUNT(DISTINCT s.id) as c FROM staff s
    JOIN shift_schedule ss ON ss.staff_id = s.id
    WHERE ss.work_date = ? AND ss.status IN ('scheduled', 'worked', 'overtime') AND s.is_active = 1
  `).get(workDate).c

  // Atanmış toplam
  const assignedCount = db.prepare('SELECT COUNT(*) as c FROM route_assignments WHERE work_date=?').get(workDate).c

  // Servissiz vardiyalı personel
  const uncovered = db.prepare(`
    SELECT s.id, s.full_name, s.pickup_point_id, s.phone, s.role_label,
      pp.name as pickup_name, pp.district,
      d.name as dept_name, d.color_class as dept_color
    FROM staff s
    JOIN shift_schedule ss ON ss.staff_id = s.id AND ss.work_date = ?
    LEFT JOIN pickup_points pp ON pp.id = s.pickup_point_id
    LEFT JOIN departments d ON d.id = s.department_id
    WHERE s.is_active = 1
      AND ss.status IN ('scheduled', 'worked', 'overtime')
      AND NOT EXISTS (
        SELECT 1 FROM route_assignments ra WHERE ra.staff_id = s.id AND ra.work_date = ?
      )
    ORDER BY s.full_name
  `).all(workDate, workDate)

  // Uyarılar
  const alerts = []
  for (const r of routes) {
    if (r.assigned_count > r.capacity) {
      alerts.push({ type: 'over_capacity', route_id: r.id, route_name: r.name, message: `${r.name}: ${r.assigned_count}/${r.capacity} (${r.assigned_count - r.capacity} fazla)` })
    } else if (r.capacity > 0 && r.assigned_count > 0 && (r.assigned_count / r.capacity) < 0.35) {
      alerts.push({ type: 'low_fill', route_id: r.id, route_name: r.name, message: `${r.name}: %${Math.round(r.assigned_count / r.capacity * 100)} dolu` })
    }
  }
  if (uncovered.length > 0) {
    alerts.push({ type: 'uncovered', message: `${uncovered.length} personel servise atanmamış` })
  }

  // Bugün vardiyadaki personellerin durak yoğunluğu (kimin nereden geldiği özeti)
  const pickupDistribution = db.prepare(`
    SELECT pp.id, pp.name, pp.district, pp.neighborhood,
      COUNT(s.id) as staff_count
    FROM staff s
    JOIN shift_schedule ss ON ss.staff_id = s.id AND ss.work_date = ?
    JOIN pickup_points pp ON pp.id = s.pickup_point_id
    WHERE s.is_active = 1 AND ss.status IN ('scheduled','worked','overtime')
    GROUP BY pp.id
    ORDER BY staff_count DESC, pp.name
  `).all(workDate)

  return {
    work_date: workDate,
    on_shift_count: onShiftCount,
    assigned_count: assignedCount,
    uncovered_count: uncovered.length,
    routes,
    uncovered,
    alerts,
    pickup_distribution: pickupDistribution,
  }
}

export function setAssignment({ staffId, routeId, stopId, workDate, userId }) {
  return getDB().prepare(`
    INSERT INTO route_assignments(route_id, stop_id, staff_id, work_date, assigned_by)
    VALUES(?,?,?,?,?)
    ON CONFLICT(staff_id, work_date) DO UPDATE SET
      route_id = excluded.route_id, stop_id = excluded.stop_id, assigned_by = excluded.assigned_by
  `).run(routeId, stopId || null, staffId, workDate, userId).lastInsertRowid
}

export function clearAssignment(staffId, workDate) {
  getDB().prepare('DELETE FROM route_assignments WHERE staff_id=? AND work_date=?').run(staffId, workDate)
}
