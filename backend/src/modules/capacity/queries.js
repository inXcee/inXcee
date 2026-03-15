import { getDB } from '../../shared/db/index.js'

export function getRooms({ block, floor, status } = {}) {
  const db = getDB()
  let q = `
    SELECT r.*,
      COUNT(ra.id) as occupied,
      u.full_name as supervisor_name
    FROM rooms r
    LEFT JOIN room_assignments ra ON ra.room_id=r.id AND ra.check_out_at IS NULL
    LEFT JOIN users u ON u.id=r.floor_supervisor_id
  `
  const where = [], params = []
  if (block) { where.push('r.block=?'); params.push(block) }
  if (floor) { where.push('r.floor=?'); params.push(floor) }
  if (status) { where.push('r.status=?'); params.push(status) }
  if (where.length) q += ' WHERE ' + where.join(' AND ')
  q += ' GROUP BY r.id ORDER BY r.block, r.floor, r.room_no'
  return db.prepare(q).all(...params)
}

export function getRoomPersonnel(roomId) {
  const db = getDB()
  return db.prepare(`
    SELECT p.id, p.full_name, p.company, p.hometown, ra.bed_no, ra.assigned_at
    FROM room_assignments ra
    JOIN personnel p ON p.id=ra.personnel_id
    WHERE ra.room_id=? AND ra.check_out_at IS NULL
    ORDER BY ra.bed_no
  `).all(roomId)
}

export function getBlockPersonnel(block) {
  const db = getDB()
  return db.prepare(`
    SELECT p.id, p.full_name, p.company, r.block, r.floor, r.room_no, ra.bed_no
    FROM room_assignments ra
    JOIN personnel p ON p.id=ra.personnel_id
    JOIN rooms r ON r.id=ra.room_id
    WHERE r.block=? AND ra.check_out_at IS NULL
    ORDER BY r.floor, r.room_no, ra.bed_no
  `).all(block)
}

export function updateActiveBeds(roomId, activeBeds) {
  const db = getDB()
  db.prepare('UPDATE rooms SET active_beds=? WHERE id=?').run(activeBeds, roomId)
}

export function updateRoomStatus(roomId, status) {
  const db = getDB()
  db.prepare('UPDATE rooms SET status=? WHERE id=?').run(status, roomId)
}

export function updateFloorSupervisor(block, floor, userId) {
  const db = getDB()
  db.prepare('UPDATE rooms SET floor_supervisor_id=? WHERE block=? AND floor=?').run(userId, block, floor)
}

export function reassignPersonnel(personnelId, newRoomId, userId) {
  const db = getDB()
  const tx = db.transaction(() => {
    db.prepare("UPDATE room_assignments SET check_out_at=datetime('now') WHERE personnel_id=? AND check_out_at IS NULL").run(personnelId)
    const room = db.prepare('SELECT * FROM rooms WHERE id=?').get(newRoomId)
    const count = db.prepare('SELECT COUNT(*) as c FROM room_assignments WHERE room_id=? AND check_out_at IS NULL').get(newRoomId)
    if (count.c >= room.active_beds) throw new Error('Oda dolu')
    db.prepare('INSERT INTO room_assignments(personnel_id,room_id,bed_no,assigned_by) VALUES(?,?,?,?)').run(personnelId, newRoomId, count.c + 1, userId)
  })
  tx()
}
