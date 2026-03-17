import { getDB } from '../../shared/db/index.js'

export function getKPI() {
  const db = getDB()
  const active_personnel = db.prepare("SELECT COUNT(*) as c FROM personnel WHERE check_out_date IS NULL AND check_in_date IS NOT NULL").get().c
  const total_beds = db.prepare("SELECT SUM(active_beds) as s FROM rooms WHERE status='active'").get().s || 0
  const occupied = db.prepare("SELECT COUNT(*) as c FROM room_assignments WHERE check_out_at IS NULL").get().c
  const occupancy_pct = total_beds > 0 ? Math.round((occupied / total_beds) * 100) : 0
  const open_maintenance = db.prepare("SELECT COUNT(*) as c FROM maintenance_requests WHERE status='open'").get().c
  const quarantine_rooms = db.prepare("SELECT COUNT(*) as c FROM rooms WHERE status='quarantine'").get().c
  return { active_personnel, occupancy_pct, open_maintenance, quarantine_rooms, occupied, total_beds }
}

export function getHeatmap() {
  const db = getDB()
  return db.prepare(`
    SELECT r.block,
      SUM(r.active_beds) as total_beds,
      COUNT(ra.id) as occupied,
      MIN(r.status) as status,
      ROUND(COUNT(ra.id) * 100.0 / MAX(SUM(r.active_beds), 1)) as pct
    FROM rooms r
    LEFT JOIN room_assignments ra ON ra.room_id=r.id AND ra.check_out_at IS NULL
    GROUP BY r.block
    ORDER BY r.block
  `).all()
}

export function getBedOccupancy() {
  const db = getDB()
  const blocks = db.prepare(`
    SELECT r.block,
      COUNT(r.id) as total_rooms,
      SUM(r.capacity) as total_capacity,
      SUM(r.active_beds) as total_beds,
      COUNT(CASE WHEN r.status='active' THEN 1 END) as active_rooms,
      COUNT(CASE WHEN r.status='maintenance' THEN 1 END) as maintenance_rooms,
      COUNT(CASE WHEN r.status='quarantine' THEN 1 END) as quarantine_rooms
    FROM rooms r
    GROUP BY r.block
    ORDER BY r.block
  `).all()

  const occupancy = db.prepare(`
    SELECT r.block,
      COUNT(ra.id) as occupied_beds
    FROM room_assignments ra
    JOIN rooms r ON r.id = ra.room_id
    WHERE ra.check_out_at IS NULL
    GROUP BY r.block
  `).all()

  const occMap = Object.fromEntries(occupancy.map(o => [o.block, o.occupied_beds]))

  const totals = { total_rooms: 0, total_capacity: 0, total_beds: 0, occupied: 0, active_rooms: 0, maintenance_rooms: 0, quarantine_rooms: 0 }

  const result = blocks.map(b => {
    const occ = occMap[b.block] || 0
    const empty = (b.total_beds || 0) - occ
    const pct = b.total_beds > 0 ? Math.round((occ / b.total_beds) * 100) : 0
    totals.total_rooms += b.total_rooms
    totals.total_capacity += b.total_capacity
    totals.total_beds += b.total_beds || 0
    totals.occupied += occ
    totals.active_rooms += b.active_rooms
    totals.maintenance_rooms += b.maintenance_rooms
    totals.quarantine_rooms += b.quarantine_rooms
    return { ...b, occupied: occ, empty, pct }
  })

  totals.empty = totals.total_beds - totals.occupied
  totals.pct = totals.total_beds > 0 ? Math.round((totals.occupied / totals.total_beds) * 100) : 0

  return { blocks: result, totals }
}

export function getProjection() {
  const db = getDB()
  const leaving = db.prepare(`
    SELECT COUNT(*) as c, r.block
    FROM personnel p
    JOIN room_assignments ra ON ra.personnel_id=p.id AND ra.check_out_at IS NULL
    JOIN rooms r ON r.id=ra.room_id
    WHERE p.check_out_date BETWEEN datetime('now') AND datetime('now','+14 days')
    GROUP BY r.block
  `).all()
  return leaving
}

export function getAuditLog(limit = 50) {
  const db = getDB()
  return db.prepare(`
    SELECT a.*, u.full_name as user_name
    FROM audit_log a
    LEFT JOIN users u ON u.id=a.user_id
    ORDER BY a.created_at DESC
    LIMIT ?
  `).all(limit)
}

// ── Export queries (#4) ──────────────────────────────────────────────────────

export function exportPersonnel() {
  const db = getDB()
  return db.prepare(`
    SELECT p.full_name, p.tc_no, p.company, p.job_title, p.hometown,
      r.block, r.floor, r.room_no, ra.bed_no, s.shift_type,
      p.discipline_points, p.check_in_date
    FROM personnel p
    LEFT JOIN room_assignments ra ON ra.personnel_id=p.id AND ra.check_out_at IS NULL
    LEFT JOIN rooms r ON r.id=ra.room_id
    LEFT JOIN shifts s ON s.personnel_id=p.id
    WHERE p.check_out_date IS NULL
    ORDER BY p.full_name
  `).all()
}

export function exportOccupancy() {
  const db = getDB()
  return db.prepare(`
    SELECT r.block, r.floor, r.room_no, r.capacity, r.active_beds, r.status,
      COUNT(ra.id) as occupied
    FROM rooms r
    LEFT JOIN room_assignments ra ON ra.room_id=r.id AND ra.check_out_at IS NULL
    GROUP BY r.id
    ORDER BY r.block, r.floor, CAST(r.room_no AS INTEGER)
  `).all()
}

export function exportMaintenance() {
  const db = getDB()
  return db.prepare(`
    SELECT mr.location, mr.description, mr.status, mr.priority,
      mr.wait_reason, mr.opened_at, mr.closed_at, u.full_name as reporter
    FROM maintenance_requests mr
    LEFT JOIN users u ON u.id=mr.reporter_user_id
    ORDER BY mr.opened_at DESC
  `).all()
}
