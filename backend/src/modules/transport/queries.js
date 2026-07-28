import { getDB } from '../../shared/db/index.js'
import {
  syncLegacyAssignment,
  syncLegacyDate,
  syncLegacyRouteResources,
} from './legacy-adapter.js'

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
  if (!sets.length) return []
  params.push(id)
  db.prepare(`UPDATE pickup_points SET ${sets.join(',')} WHERE id=?`).run(...params)
  if (data.lat === undefined && data.lng === undefined) return []
  return db.prepare('SELECT DISTINCT route_id FROM route_stops WHERE pickup_point_id=?').all(id).map(r => r.route_id)
}

export function deletePickupPoint(id) {
  getDB().prepare('UPDATE pickup_points SET is_active = 0 WHERE id=?').run(id)
}

// Tüm personel + durak/rota bilgisi (atama yönetim sayfası için)
export function listStaffWithTransport({ deptId, hasPickup } = {}) {
  const db = getDB()
  let q = `
    SELECT s.id, s.tc_no, s.full_name, s.phone, s.role_label, s.is_active,
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
export function listRoutes({ activeOnly = false, withStops = false, workDate = null } = {}) {
  const db = getDB()
  const where = activeOnly ? 'WHERE r.is_active = 1' : ''
  const routes = db.prepare(`
    SELECT r.*,
      sd.name as shift_name, sd.start_hour, sd.end_hour, sd.color_class as shift_color,
      (SELECT COUNT(*) FROM route_stops WHERE route_id = r.id) as stop_count
    FROM routes r
    LEFT JOIN shift_definitions sd ON sd.id = r.shift_def_id
    ${where}
    ORDER BY r.name
  `).all()

  routes.forEach(r => {
    r.path_geometry = r.path_geometry ? JSON.parse(r.path_geometry) : null
    r.via_points = parseViaPoints(r.via_points)
  })

  if (!withStops && !workDate) return routes

  if (withStops) {
    const stopsStmt = db.prepare(`
      SELECT rs.id, rs.route_id, rs.sequence_order, rs.scheduled_time,
        pp.id as pickup_point_id, pp.name as point_name, pp.district, pp.neighborhood,
        pp.lat, pp.lng,
        (SELECT COUNT(*) FROM staff WHERE pickup_point_id = pp.id AND is_active = 1) as staff_count
      FROM route_stops rs
      JOIN pickup_points pp ON pp.id = rs.pickup_point_id
      WHERE rs.route_id = ?
      ORDER BY rs.sequence_order, rs.id
    `)
    routes.forEach(r => { r.stops = stopsStmt.all(r.id) })
  }

  if (workDate) {
    const today = db.prepare(`
      SELECT route_id,
        SUM(CASE WHEN is_waitlist = 0 THEN 1 ELSE 0 END) as assigned,
        SUM(CASE WHEN is_waitlist = 1 THEN 1 ELSE 0 END) as waitlisted
      FROM route_assignments WHERE work_date = ? GROUP BY route_id
    `).all(workDate)
    const map = new Map(today.map(t => [t.route_id, t]))
    routes.forEach(r => {
      const t = map.get(r.id)
      r.today_assigned = t?.assigned || 0
      r.today_waitlisted = t?.waitlisted || 0
    })
  }

  return routes
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
  const id = getDB().prepare(`
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
  syncLegacyRouteResources(id)
  return id
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
  syncLegacyRouteResources(id)
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
  const id = db.prepare(`
    INSERT INTO route_stops(route_id, pickup_point_id, sequence_order, scheduled_time)
    VALUES(?,?,?,?)
  `).run(routeId, data.pickup_point_id, data.sequence_order ?? (max + 1), data.scheduled_time || null).lastInsertRowid
  return id
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
  const db = getDB()
  const row = db.prepare('SELECT route_id FROM route_stops WHERE id=?').get(id)
  db.prepare('DELETE FROM route_stops WHERE id=?').run(id)
  if (!row) return null
  saveRouteViaPoints(row.route_id, getRouteViaPoints(row.route_id).filter(v => v.after_stop_id !== id))
  return row.route_id
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
    INSERT INTO route_assignments(route_id, stop_id, staff_id, work_date, assigned_by, is_waitlist)
    VALUES(?,?,?,?,?,?)
    ON CONFLICT(staff_id, work_date) DO UPDATE SET
      route_id = excluded.route_id, stop_id = excluded.stop_id, is_waitlist = excluded.is_waitlist
  `)
  const remove = db.prepare('DELETE FROM route_assignments WHERE staff_id=? AND work_date=?')

  // Faz 8: kapasite limiti ile aktif/yedek ayrımı
  const routeFillCount = new Map() // route_id -> aktif (waitlist olmayan) atanmış kişi sayısı
  db.prepare(`SELECT route_id, COUNT(*) as c FROM route_assignments WHERE work_date=? AND is_waitlist = 0 GROUP BY route_id`).all(workDate)
    .forEach(r => routeFillCount.set(r.route_id, r.c))

  stats.waitlisted = 0
  const tx = db.transaction(() => {
    for (const person of onShift) {
      if (!person.pickup_point_id) { stats.skipped_no_pickup++; continue }
      if (existing.has(person.id) && !overrideExisting) { stats.skipped_existing++; continue }

      // Bu durağa hizmet veren rotalar
      const candidates = stopRouteMap.filter(s => s.pickup_point_id === person.pickup_point_id)
      if (!candidates.length) { stats.skipped_no_route++; continue }

      // Vardiya uyumu öncelikli, sonra doluluk durumu (en az dolu rota)
      candidates.sort((a, b) => {
        const aMatch = a.shift_def_id === person.shift_def_id ? 0 : 1
        const bMatch = b.shift_def_id === person.shift_def_id ? 0 : 1
        if (aMatch !== bMatch) return aMatch - bMatch
        return (routeFillCount.get(a.route_id) || 0) - (routeFillCount.get(b.route_id) || 0)
      })

      const pick = candidates[0]
      const currentFill = routeFillCount.get(pick.route_id) || 0
      const isWaitlist = pick.capacity > 0 && currentFill >= pick.capacity ? 1 : 0
      if (overrideExisting && existing.has(person.id)) {
        remove.run(person.id, workDate)
      }
      insert.run(pick.route_id, pick.stop_id, person.id, workDate, null, isWaitlist)
      if (isWaitlist) {
        stats.waitlisted++
      } else {
        routeFillCount.set(pick.route_id, currentFill + 1)
        stats.assigned++
      }
    }
  })
  tx()
  syncLegacyDate(workDate)
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
    SELECT ra.id as assignment_id, ra.staff_id, ra.stop_id, ra.boarded, ra.is_waitlist,
      s.full_name, s.phone, s.role_label,
      d.name as dept_name, d.color_class as dept_color
    FROM route_assignments ra
    JOIN staff s ON s.id = ra.staff_id
    LEFT JOIN departments d ON d.id = s.department_id
    WHERE ra.route_id = ? AND ra.work_date = ?
    ORDER BY ra.is_waitlist, s.full_name
  `).all(routeId, workDate)

  const byStop = {}
  for (const s of stops) byStop[s.stop_id] = { ...s, passengers: [], waitlist: [] }
  byStop._unassigned = { stop_id: null, point_name: '(durak atanmamış)', passengers: [], waitlist: [] }
  let boardedCount = 0
  let noShowCount = 0
  let waitlistCount = 0
  for (const p of passengers) {
    const key = p.stop_id || '_unassigned'
    const bucket = byStop[key] || byStop._unassigned
    if (p.is_waitlist) { bucket.waitlist.push(p); waitlistCount++ }
    else {
      bucket.passengers.push(p)
      if (p.boarded === 1) boardedCount++
      else if (p.boarded === 0) noShowCount++
    }
  }

  const filteredStops = Object.values(byStop).filter(s => s.stop_id !== null || s.passengers.length > 0 || s.waitlist.length > 0)
  return {
    route,
    stops: filteredStops,
    total_passengers: passengers.filter(p => !p.is_waitlist).length,
    boarded_count: boardedCount,
    no_show_count: noShowCount,
    waitlist_count: waitlistCount,
  }
}

// Faz 8: waitlist'ten aktife terfi (kapasitede yer açıldığında)
export function promoteFromWaitlist(assignmentId) {
  const db = getDB()
  const row = db.prepare('SELECT route_id, is_waitlist FROM route_assignments WHERE id=?').get(assignmentId)
  if (!row) throw new Error('Atama bulunamadı')
  if (!row.is_waitlist) throw new Error('Zaten aktif')
  db.prepare('UPDATE route_assignments SET is_waitlist = 0 WHERE id = ?').run(assignmentId)
  syncLegacyAssignment(assignmentId)
}

// Faz 6: katılım işaretle
export function setBoarded(assignmentId, boarded, userId) {
  const db = getDB()
  const val = boarded === null ? null : (boarded ? 1 : 0)
  db.prepare(`
    UPDATE route_assignments
    SET boarded = ?, boarded_marked_at = CURRENT_TIMESTAMP, boarded_marked_by = ?
    WHERE id = ?
  `).run(val, userId || null, assignmentId)
  syncLegacyAssignment(assignmentId)
}

// Faz 6: devamsızlık top N — son N gün servise atanmış ama binmemiş kişiler
export function getNoShowReport({ startDate, endDate, limit = 20 } = {}) {
  const db = getDB()
  const s = startDate || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const e = endDate || new Date().toISOString().slice(0, 10)
  return db.prepare(`
    SELECT s.id, s.full_name, s.phone, s.role_label,
      d.name as dept_name, d.color_class as dept_color,
      pp.name as pickup_name,
      SUM(CASE WHEN ra.boarded = 0 THEN 1 ELSE 0 END) as no_show_count,
      SUM(CASE WHEN ra.boarded = 1 THEN 1 ELSE 0 END) as boarded_count,
      SUM(CASE WHEN ra.boarded IS NULL THEN 1 ELSE 0 END) as unmarked_count,
      COUNT(ra.id) as total_assignments
    FROM route_assignments ra
    JOIN staff s ON s.id = ra.staff_id
    LEFT JOIN departments d ON d.id = s.department_id
    LEFT JOIN pickup_points pp ON pp.id = s.pickup_point_id
    WHERE ra.work_date BETWEEN ? AND ?
      AND ra.is_waitlist = 0
      AND s.is_active = 1
    GROUP BY s.id
    HAVING no_show_count > 0
    ORDER BY no_show_count DESC, total_assignments DESC
    LIMIT ?
  `).all(s, e, limit)
}

// Günün tüm rotaları + her birinin yolcu sayısı
export function getDailyOverview(workDate) {
  const db = getDB()
  const routes = db.prepare(`
    SELECT r.id, r.name, r.color, r.capacity, r.vehicle_plate, r.driver_name,
      sd.name as shift_name, sd.start_hour, sd.end_hour,
      COALESCE(ra.assigned, 0) as assigned_count,
      COALESCE(ra.waitlisted, 0) as waitlist_count,
      COALESCE(ra.boarded, 0) as boarded_count,
      COALESCE(ra.no_show, 0) as no_show_count
    FROM routes r
    LEFT JOIN shift_definitions sd ON sd.id = r.shift_def_id
    LEFT JOIN (
      SELECT route_id,
        SUM(CASE WHEN is_waitlist = 0 THEN 1 ELSE 0 END) as assigned,
        SUM(CASE WHEN is_waitlist = 1 THEN 1 ELSE 0 END) as waitlisted,
        SUM(CASE WHEN is_waitlist = 0 AND boarded = 1 THEN 1 ELSE 0 END) as boarded,
        SUM(CASE WHEN is_waitlist = 0 AND boarded = 0 THEN 1 ELSE 0 END) as no_show
      FROM route_assignments WHERE work_date = ? GROUP BY route_id
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
  const result = getDB().prepare(`
    INSERT INTO route_assignments(route_id, stop_id, staff_id, work_date, assigned_by)
    VALUES(?,?,?,?,?)
    ON CONFLICT(staff_id, work_date) DO UPDATE SET
      route_id = excluded.route_id, stop_id = excluded.stop_id, assigned_by = excluded.assigned_by
  `).run(routeId, stopId || null, staffId, workDate, userId).lastInsertRowid
  syncLegacyDate(workDate)
  return result
}

export function clearAssignment(staffId, workDate) {
  getDB().prepare('DELETE FROM route_assignments WHERE staff_id=? AND work_date=?').run(staffId, workDate)
  syncLegacyDate(workDate)
}

// ── Personel detay (servis geçmişi) ──
export function getStaffTransportDetail(staffId) {
  const db = getDB()
  const person = db.prepare(`
    SELECT s.*, d.name as dept_name, d.color_class as dept_color,
      pp.name as pickup_name, pp.district as pickup_district, pp.lat as pickup_lat, pp.lng as pickup_lng
    FROM staff s
    LEFT JOIN departments d ON d.id = s.department_id
    LEFT JOIN pickup_points pp ON pp.id = s.pickup_point_id
    WHERE s.id = ?
  `).get(staffId)
  if (!person) return null

  const assignments = db.prepare(`
    SELECT ra.work_date, ra.route_id,
      r.name as route_name, r.color as route_color, r.vehicle_plate,
      rs.scheduled_time, pp.name as stop_name
    FROM route_assignments ra
    JOIN routes r ON r.id = ra.route_id
    LEFT JOIN route_stops rs ON rs.id = ra.stop_id
    LEFT JOIN pickup_points pp ON pp.id = rs.pickup_point_id
    WHERE ra.staff_id = ?
    ORDER BY ra.work_date DESC
    LIMIT 60
  `).all(staffId)

  // Bu kişinin durağındaki rotalar (varsa)
  const availableRoutes = person.pickup_point_id ? db.prepare(`
    SELECT r.id, r.name, r.color, r.vehicle_plate, r.capacity,
      sd.name as shift_name, rs.scheduled_time
    FROM route_stops rs
    JOIN routes r ON r.id = rs.route_id
    LEFT JOIN shift_definitions sd ON sd.id = r.shift_def_id
    WHERE rs.pickup_point_id = ? AND r.is_active = 1
    ORDER BY r.name
  `).all(person.pickup_point_id) : []

  return { person, assignments, availableRoutes }
}

// ── Raporlar ──
// Bir tarihte / aralıkta servis kullanım raporları
export function getReports({ startDate, endDate } = {}) {
  const db = getDB()
  const s = startDate || new Date().toISOString().slice(0, 10)
  const e = endDate || s

  // 1) Genel toplam
  const totals = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM staff WHERE is_active=1) as total_staff,
      (SELECT COUNT(*) FROM staff WHERE is_active=1 AND pickup_point_id IS NOT NULL) as staff_with_pickup,
      (SELECT COUNT(*) FROM staff WHERE is_active=1 AND pickup_point_id IS NULL) as staff_no_pickup,
      (SELECT COUNT(*) FROM pickup_points WHERE is_active=1) as active_points,
      (SELECT COUNT(*) FROM routes WHERE is_active=1) as active_routes
  `).get()

  // 2) Durak başına personel sayısı (tüm aktif personel)
  const byPickup = db.prepare(`
    SELECT pp.id, pp.name, pp.district, pp.neighborhood,
      COUNT(s.id) as staff_count,
      GROUP_CONCAT(DISTINCT d.name) as departments
    FROM pickup_points pp
    LEFT JOIN staff s ON s.pickup_point_id = pp.id AND s.is_active = 1
    LEFT JOIN departments d ON d.id = s.department_id
    WHERE pp.is_active = 1
    GROUP BY pp.id
    ORDER BY staff_count DESC, pp.name
  `).all()

  // 3) Departman × Durak matrisi
  const deptPickup = db.prepare(`
    SELECT d.id as dept_id, d.name as dept_name, d.color_class,
      pp.id as pickup_id, pp.name as pickup_name,
      COUNT(*) as cnt
    FROM staff s
    JOIN departments d ON d.id = s.department_id
    LEFT JOIN pickup_points pp ON pp.id = s.pickup_point_id
    WHERE s.is_active = 1 AND s.pickup_point_id IS NOT NULL
    GROUP BY d.id, pp.id
    ORDER BY d.name, cnt DESC
  `).all()

  // 4) Vardiya × Durak (tarih aralığında çalışmış olanlar)
  const shiftPickup = db.prepare(`
    SELECT sd.id as shift_id, sd.name as shift_name, sd.start_hour, sd.end_hour,
      pp.id as pickup_id, pp.name as pickup_name, pp.district,
      COUNT(DISTINCT ss.staff_id) as cnt
    FROM shift_schedule ss
    JOIN staff s ON s.id = ss.staff_id
    JOIN shift_definitions sd ON sd.id = ss.shift_def_id
    LEFT JOIN pickup_points pp ON pp.id = s.pickup_point_id
    WHERE ss.work_date BETWEEN ? AND ?
      AND ss.status IN ('scheduled','worked','overtime')
      AND s.is_active = 1
      AND pp.id IS NOT NULL
    GROUP BY sd.id, pp.id
    ORDER BY sd.start_hour, cnt DESC
  `).all(s, e)

  // 5) Rota kullanım istatistiği — atama sayıları (tarih aralığı)
  const routeUtil = db.prepare(`
    SELECT r.id, r.name, r.capacity, r.color, r.vehicle_plate, r.driver_name,
      sd.name as shift_name,
      COUNT(ra.id) as total_assignments,
      COUNT(DISTINCT ra.work_date) as days,
      COUNT(DISTINCT ra.staff_id) as unique_staff,
      ROUND(COUNT(ra.id) * 1.0 / NULLIF(COUNT(DISTINCT ra.work_date), 0), 1) as avg_per_day,
      ROUND(COUNT(ra.id) * 1.0 / NULLIF(COUNT(DISTINCT ra.work_date) * r.capacity, 0) * 100, 1) as avg_fill_pct
    FROM routes r
    LEFT JOIN route_assignments ra ON ra.route_id = r.id AND ra.work_date BETWEEN ? AND ?
    LEFT JOIN shift_definitions sd ON sd.id = r.shift_def_id
    WHERE r.is_active = 1
    GROUP BY r.id
    ORDER BY total_assignments DESC, r.name
  `).all(s, e)

  // 6) Bölge/ilçe bazlı dağılım
  const byDistrict = db.prepare(`
    SELECT pp.district,
      COUNT(s.id) as staff_count,
      COUNT(DISTINCT pp.id) as point_count
    FROM staff s
    JOIN pickup_points pp ON pp.id = s.pickup_point_id
    WHERE s.is_active = 1 AND pp.district IS NOT NULL
    GROUP BY pp.district
    ORDER BY staff_count DESC
  `).all()

  // 7) Atanmamış personeller (durak yok ya da pasif durakta)
  const noPickup = db.prepare(`
    SELECT s.id, s.full_name, s.role_label, s.phone,
      d.name as dept_name
    FROM staff s
    LEFT JOIN departments d ON d.id = s.department_id
    WHERE s.is_active = 1 AND s.pickup_point_id IS NULL
    ORDER BY s.full_name
  `).all()

  // 8) Günlük trend (son N gün — start..end)
  const dailyTrend = db.prepare(`
    SELECT ra.work_date,
      COUNT(*) as assignments,
      COUNT(DISTINCT ra.route_id) as routes_used,
      SUM(CASE WHEN ra.boarded = 1 THEN 1 ELSE 0 END) as boarded,
      SUM(CASE WHEN ra.boarded = 0 THEN 1 ELSE 0 END) as no_show
    FROM route_assignments ra
    WHERE ra.work_date BETWEEN ? AND ?
      AND ra.is_waitlist = 0
    GROUP BY ra.work_date
    ORDER BY ra.work_date
  `).all(s, e)

  // 9) Faz 6 — Devamsızlık Top 10
  const noShowTop = getNoShowReport({ startDate: s, endDate: e, limit: 10 })

  // 10) Faz 7 — Kişi bazı kullanım (en çok kullanan + en az kullanan)
  const perStaffUsage = db.prepare(`
    SELECT s.id, s.full_name, s.role_label,
      d.name as dept_name, d.color_class as dept_color,
      pp.name as pickup_name,
      COUNT(ra.id) as assignment_count,
      COUNT(DISTINCT ra.route_id) as routes_used,
      MAX(ra.work_date) as last_assigned
    FROM staff s
    LEFT JOIN departments d ON d.id = s.department_id
    LEFT JOIN pickup_points pp ON pp.id = s.pickup_point_id
    LEFT JOIN route_assignments ra ON ra.staff_id = s.id
      AND ra.work_date BETWEEN ? AND ?
      AND ra.is_waitlist = 0
    WHERE s.is_active = 1 AND s.pickup_point_id IS NOT NULL
    GROUP BY s.id
    ORDER BY assignment_count DESC, s.full_name
  `).all(s, e)

  return {
    range: { start: s, end: e },
    totals,
    by_pickup: byPickup,
    dept_pickup: deptPickup,
    shift_pickup: shiftPickup,
    route_utilization: routeUtil,
    by_district: byDistrict,
    no_pickup_staff: noPickup,
    daily_trend: dailyTrend,
    no_show_top: noShowTop,
    per_staff_usage: perStaffUsage,
  }
}

// ── Rota yol geometrisi (path) ──
// path_geometry her zaman OSRM ciktisidir; elle serbest cizim yoktur (bkz. 064 migration).
export function getRoutePath(routeId) {
  const row = getDB().prepare('SELECT path_geometry, path_computed_at FROM routes WHERE id=?').get(routeId)
  if (!row) return null
  return {
    geometry: row.path_geometry ? JSON.parse(row.path_geometry) : null,
    computed_at: row.path_computed_at,
  }
}

export function saveRoutePath(routeId, geometry) {
  getDB().prepare(`
    UPDATE routes SET path_geometry=?, path_computed_at=datetime('now') WHERE id=?
  `).run(JSON.stringify(geometry), routeId)
}

// ── Ugrak (via) noktalari ──
function parseViaPoints(raw) {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function getRouteViaPoints(routeId) {
  const row = getDB().prepare('SELECT via_points FROM routes WHERE id=?').get(routeId)
  return row ? parseViaPoints(row.via_points) : []
}

export function saveRouteViaPoints(routeId, viaPoints) {
  getDB().prepare('UPDATE routes SET via_points=? WHERE id=?').run(JSON.stringify(viaPoints), routeId)
}

// ── Kalici durak silme ──
// Soft delete (deletePickupPoint) yalnizca is_active=0 yapar; bu ise kaydi tamamen siler.
// Foreign key'ler acik oldugu icin sira onemli: once referanslar, en son durak.
// Etkilenen rota id'leri doner — cagiran yol yeniden hesaplamayi kuyruga atmalidir.
export function deletePickupPointPermanent(id) {
  const db = getDB()
  const point = db.prepare('SELECT id FROM pickup_points WHERE id=?').get(id)
  if (!point) return null

  const affectedRouteIds = db.prepare('SELECT DISTINCT route_id FROM route_stops WHERE pickup_point_id=?')
    .all(id).map(r => r.route_id)
  const doomedStopIds = db.prepare('SELECT id FROM route_stops WHERE pickup_point_id=?').all(id).map(r => r.id)

  let removedStops = 0
  let unassignedStaff = 0
  const tx = db.transaction(() => {
    for (const routeId of affectedRouteIds) {
      saveRouteViaPoints(routeId, getRouteViaPoints(routeId).filter(v => !doomedStopIds.includes(v.after_stop_id)))
    }
    removedStops = db.prepare('DELETE FROM route_stops WHERE pickup_point_id=?').run(id).changes
    unassignedStaff = db.prepare('UPDATE staff SET pickup_point_id=NULL WHERE pickup_point_id=?').run(id).changes
    db.prepare('DELETE FROM pickup_points WHERE id=?').run(id)
  })
  tx()

  return { removed_stops: removedStops, unassigned_staff: unassignedStaff, affected_routes: affectedRouteIds }
}

// Pasif VE hicbir rotada/personelde gecmeyen duraklari toplu siler.
// Aktif duraklara ve kullanimdaki pasif duraklara dokunmaz.
export function cleanupUnusedPickupPoints() {
  return getDB().prepare(`
    DELETE FROM pickup_points
    WHERE is_active = 0
      AND id NOT IN (SELECT pickup_point_id FROM route_stops)
      AND id NOT IN (SELECT pickup_point_id FROM staff WHERE pickup_point_id IS NOT NULL)
  `).run().changes
}
