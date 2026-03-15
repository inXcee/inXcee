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
