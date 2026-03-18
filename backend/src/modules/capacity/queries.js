import { getDB } from '../../shared/db/index.js'

export function getRooms({ block, floor, status } = {}) {
  const db = getDB()
  const hour = new Date().getHours()
  const isDayTime = hour >= 8 && hour < 18
  const isNightTime = hour >= 22 || hour < 8
  let q = `
    SELECT r.*,
      COUNT(ra.id) as occupied,
      u.full_name as supervisor_name,
      (SELECT COUNT(*) FROM maintenance_requests mr
       WHERE mr.status != 'done'
         AND mr.location LIKE '%' || r.block || '%Oda ' || r.room_no || '%'
      ) as open_fault_count,
      (SELECT COALESCE(s2.shift_type,'day') FROM room_assignments ra2
       LEFT JOIN shifts s2 ON s2.personnel_id=ra2.personnel_id
       WHERE ra2.room_id=r.id AND ra2.check_out_at IS NULL LIMIT 1) as room_shift,
      CASE
        WHEN COUNT(ra.id) > 0 AND (SELECT COALESCE(s3.shift_type,'day') FROM room_assignments ra3
          LEFT JOIN shifts s3 ON s3.personnel_id=ra3.personnel_id
          WHERE ra3.room_id=r.id AND ra3.check_out_at IS NULL LIMIT 1) = 'night' AND ${isDayTime ? 1 : 0} THEN 1
        WHEN COUNT(ra.id) > 0 AND COALESCE((SELECT s4.shift_type FROM room_assignments ra4
          LEFT JOIN shifts s4 ON s4.personnel_id=ra4.personnel_id
          WHERE ra4.room_id=r.id AND ra4.check_out_at IS NULL LIMIT 1),'day') = 'day' AND ${isNightTime ? 1 : 0} THEN 1
        ELSE 0
      END as is_dnd
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
    SELECT p.id, p.full_name, p.company, p.hometown, ra.bed_no, ra.assigned_at,
      COALESCE(s.shift_type, 'day') as shift_type
    FROM room_assignments ra
    JOIN personnel p ON p.id=ra.personnel_id
    LEFT JOIN shifts s ON s.personnel_id=p.id
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
  const tx = db.transaction(() => {
    db.prepare('UPDATE rooms SET status=? WHERE id=?').run(status, roomId)
    // When room goes to quarantine/maintenance, check out all occupants
    if (status === 'quarantine' || status === 'maintenance') {
      db.prepare("UPDATE room_assignments SET check_out_at=datetime('now') WHERE room_id=? AND check_out_at IS NULL").run(roomId)
    }
  })
  tx()
}

export function updateFloorSupervisor(block, floor, userId) {
  const db = getDB()
  db.prepare('UPDATE rooms SET floor_supervisor_id=? WHERE block=? AND floor=?').run(userId, block, floor)
}

export function updateRoomNotes(roomId, notes) {
  const db = getDB()
  db.prepare('UPDATE rooms SET notes=? WHERE id=?').run(notes, roomId)
}

export function searchPersonnel(q) {
  const db = getDB()
  const term = `%${q}%`
  return db.prepare(`
    SELECT p.id, p.full_name, p.company, p.hometown, p.tc_no,
      ra.room_id, r.block, r.floor, r.room_no
    FROM personnel p
    LEFT JOIN room_assignments ra ON ra.personnel_id=p.id AND ra.check_out_at IS NULL
    LEFT JOIN rooms r ON r.id=ra.room_id
    WHERE p.full_name LIKE ? OR p.company LIKE ? OR p.tc_no LIKE ?
    LIMIT 20
  `).all(term, term, term)
}

export function getUnassignedPersonnel(search) {
  const db = getDB()
  let q = `
    SELECT p.id, p.full_name, p.company, p.hometown, p.tc_no, p.check_in_date
    FROM personnel p
    LEFT JOIN room_assignments ra ON ra.personnel_id=p.id AND ra.check_out_at IS NULL
    WHERE p.check_out_date IS NULL AND ra.id IS NULL
  `
  const params = []
  if (search && search.trim().length >= 2) {
    const term = `%${search.trim()}%`
    q += ' AND (p.full_name LIKE ? OR p.company LIKE ? OR p.tc_no LIKE ?)'
    params.push(term, term, term)
  }
  q += ' ORDER BY p.created_at DESC'
  return db.prepare(q).all(...params)
}

export function bulkAssignToRoom(personnelIds, roomId, userId) {
  const db = getDB()
  const room = db.prepare('SELECT * FROM rooms WHERE id=?').get(roomId)
  if (!room) throw new Error('Oda bulunamadı')
  if (room.status !== 'active') throw new Error('Oda aktif değil')
  const tx = db.transaction(() => {
    let count = db.prepare('SELECT COUNT(*) as c FROM room_assignments WHERE room_id=? AND check_out_at IS NULL').get(roomId).c

    // Check existing room shift type
    let roomShift = null
    if (count > 0) {
      const existing = db.prepare(`
        SELECT COALESCE(s.shift_type, 'day') as shift_type FROM room_assignments ra
        LEFT JOIN shifts s ON s.personnel_id=ra.personnel_id
        WHERE ra.room_id=? AND ra.check_out_at IS NULL LIMIT 1
      `).get(roomId)
      roomShift = existing?.shift_type || 'day'
    }

    for (const pid of personnelIds) {
      if (count >= room.active_beds) throw new Error(`Oda dolu — ${count}/${room.active_beds}`)
      const alreadyAssigned = db.prepare('SELECT id FROM room_assignments WHERE personnel_id=? AND check_out_at IS NULL').get(pid)
      if (alreadyAssigned) continue

      const personShift = db.prepare('SELECT shift_type FROM shifts WHERE personnel_id=?').get(pid)
      const myShift = personShift?.shift_type || 'day'
      if (roomShift && myShift !== roomShift) throw new Error(`Vardiya uyumsuzluğu: odada ${roomShift === 'day' ? 'gündüz' : 'gece'} var, ${myShift === 'day' ? 'gündüz' : 'gece'} atanamaz`)
      if (!roomShift) roomShift = myShift

      count++
      db.prepare('INSERT INTO room_assignments(personnel_id,room_id,bed_no,assigned_by) VALUES(?,?,?,?)').run(pid, roomId, count, userId)
    }
  })
  tx()
}

export function bulkRemoveFromRooms(personnelIds) {
  const db = getDB()
  const tx = db.transaction(() => {
    for (const pid of personnelIds) {
      db.prepare("UPDATE room_assignments SET check_out_at=datetime('now') WHERE personnel_id=? AND check_out_at IS NULL").run(pid)
    }
  })
  tx()
}

export function bulkUpdateRoomStatus(roomIds, status) {
  const db = getDB()
  const tx = db.transaction(() => {
    for (const roomId of roomIds) {
      db.prepare('UPDATE rooms SET status=? WHERE id=?').run(status, roomId)
      if (status === 'quarantine' || status === 'maintenance') {
        db.prepare("UPDATE room_assignments SET check_out_at=datetime('now') WHERE room_id=? AND check_out_at IS NULL").run(roomId)
      }
    }
  })
  tx()
  return roomIds.length
}

export function bulkCheckout(personnelIds) {
  const db = getDB()
  const tx = db.transaction(() => {
    for (const pid of personnelIds) {
      db.prepare("UPDATE room_assignments SET check_out_at=datetime('now') WHERE personnel_id=? AND check_out_at IS NULL").run(pid)
      db.prepare("UPDATE personnel SET check_out_date=datetime('now') WHERE id=?").run(pid)
    }
  })
  tx()
  return personnelIds.length
}

export function removeFromRoom(personnelId) {
  const db = getDB()
  const assignment = db.prepare(`
    SELECT ra.room_id, r.block, r.room_no, p.full_name
    FROM room_assignments ra
    JOIN rooms r ON r.id=ra.room_id
    JOIN personnel p ON p.id=ra.personnel_id
    WHERE ra.personnel_id=? AND ra.check_out_at IS NULL
  `).get(personnelId)
  if (!assignment) throw new Error('Aktif oda ataması bulunamadı')
  db.prepare("UPDATE room_assignments SET check_out_at=datetime('now') WHERE personnel_id=? AND check_out_at IS NULL").run(personnelId)
  return assignment
}

export function getReassignDetail(personnelId, newRoomId) {
  const db = getDB()
  const person = db.prepare('SELECT full_name FROM personnel WHERE id=?').get(personnelId)
  const oldAssignment = db.prepare(`
    SELECT r.block, r.room_no FROM room_assignments ra
    JOIN rooms r ON r.id=ra.room_id
    WHERE ra.personnel_id=? AND ra.check_out_at IS NULL
  `).get(personnelId)
  const newRoom = db.prepare('SELECT block, room_no FROM rooms WHERE id=?').get(newRoomId)
  return {
    name: person?.full_name || '?',
    from: oldAssignment ? `${oldAssignment.block}-${oldAssignment.room_no}` : 'yok',
    to: newRoom ? `${newRoom.block}-${newRoom.room_no}` : '?',
  }
}

export function reassignPersonnel(personnelId, newRoomId, userId) {
  const db = getDB()
  const tx = db.transaction(() => {
    db.prepare("UPDATE room_assignments SET check_out_at=datetime('now') WHERE personnel_id=? AND check_out_at IS NULL").run(personnelId)
    const room = db.prepare('SELECT * FROM rooms WHERE id=?').get(newRoomId)
    const count = db.prepare('SELECT COUNT(*) as c FROM room_assignments WHERE room_id=? AND check_out_at IS NULL').get(newRoomId)
    if (count.c >= room.active_beds) throw new Error('Oda dolu')

    // Shift compatibility check
    const personShift = db.prepare('SELECT shift_type FROM shifts WHERE personnel_id=?').get(personnelId)
    const myShift = personShift?.shift_type || 'day'
    if (count.c > 0) {
      const conflict = db.prepare(`
        SELECT COUNT(*) as c FROM room_assignments ra
        LEFT JOIN shifts s ON s.personnel_id=ra.personnel_id
        WHERE ra.room_id=? AND ra.check_out_at IS NULL
          AND COALESCE(s.shift_type, 'day') != ?
      `).get(newRoomId, myShift)
      if (conflict.c > 0) throw new Error(`Bu odada ${myShift === 'day' ? 'gece' : 'gündüz'} vardiyası var — aynı odaya farklı vardiya atanamaz`)
    }

    db.prepare('INSERT INTO room_assignments(personnel_id,room_id,bed_no,assigned_by) VALUES(?,?,?,?)').run(personnelId, newRoomId, count.c + 1, userId)
  })
  tx()
}
