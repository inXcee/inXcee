import { getDB } from '../../shared/db/index.js'

export function generateDailyTasks(date = new Date()) {
  const db = getDB()
  const dateStr  = date.toISOString().split('T')[0]
  const scheduled = `${dateStr} 08:00:00`
  const insert = db.prepare(`
    INSERT OR IGNORE INTO cleaning_tasks(area, block, floor, task_type, scheduled_at, qr_location)
    VALUES(?,?,?,?,?,?)
  `)
  let count = 0
  const tx = db.transaction(() => {
    // M blok: ortak alan (kat başına bir) + bireysel odalar
    const mFloors = db.prepare("SELECT DISTINCT block, floor FROM rooms WHERE block LIKE 'M%'").all()
    mFloors.forEach(({ block, floor }) => {
      insert.run(`${block} ${floor}.Kat Ortak Alan`, block, floor, 'common_area', scheduled, `${block}-${floor}-common`)
      count++
    })
    const mRooms = db.prepare("SELECT id, block, floor, room_no FROM rooms WHERE block LIKE 'M%' AND status='active'").all()
    mRooms.forEach(r => {
      insert.run(`${r.block} Oda ${r.room_no}`, r.block, r.floor, 'room', scheduled, `${r.block}-${r.room_no}`)
      count++
    })
    // S blok: bireysel odalar
    const sRooms = db.prepare("SELECT id, block, floor, room_no FROM rooms WHERE block LIKE 'S%' AND status='active'").all()
    sRooms.forEach(r => {
      insert.run(`${r.block} Oda ${r.room_no}`, r.block, r.floor, 'room', scheduled, `${r.block}-${r.room_no}`)
      count++
    })
  })
  tx()
  return count
}

export function getTasks({ assigned_to, date, block } = {}) {
  const db = getDB()
  let q = `SELECT ct.*, u.full_name as assignee_name FROM cleaning_tasks ct LEFT JOIN users u ON u.id=ct.assigned_to WHERE 1=1`
  const params = []
  if (assigned_to) { q += ' AND ct.assigned_to=?'; params.push(assigned_to) }
  if (date)        { q += ' AND DATE(ct.scheduled_at)=?'; params.push(date) }
  if (block)       { q += ' AND ct.block=?'; params.push(block) }
  q += ' ORDER BY ct.scheduled_at'
  return db.prepare(q).all(...params)
}

export function completeTask(taskId, userId, checklist) {
  const db = getDB()
  db.prepare(`
    UPDATE cleaning_tasks
    SET completed_at=datetime('now'), assigned_to=?, verified_by_qr=1,
        skipped=0, skip_reason=NULL, checklist=?
    WHERE id=?
  `).run(userId, checklist ? JSON.stringify(checklist) : null, taskId)
}

export function uncompleteTask(taskId) {
  const db = getDB()
  db.prepare(`
    UPDATE cleaning_tasks
    SET completed_at=NULL, assigned_to=NULL, verified_by_qr=0
    WHERE id=?
  `).run(taskId)
}

export function skipTask(taskId, reason, userId) {
  const db = getDB()
  db.prepare(`
    UPDATE cleaning_tasks
    SET skipped=1, skip_reason=?, assigned_to=?, completed_at=NULL
    WHERE id=?
  `).run(reason || null, userId, taskId)
}

export function unskipTask(taskId) {
  const db = getDB()
  db.prepare(`UPDATE cleaning_tasks SET skipped=0, skip_reason=NULL WHERE id=?`).run(taskId)
}

export function completeFloorTasks(block, floor, date, userId) {
  const db = getDB()
  db.prepare(`
    UPDATE cleaning_tasks
    SET completed_at=datetime('now'), assigned_to=?, skipped=0, skip_reason=NULL
    WHERE block=? AND floor=? AND DATE(scheduled_at)=? AND completed_at IS NULL AND skipped=0
  `).run(userId, block, floor, date)
}

export function getDNDRooms() {
  const db = getDB()
  const hour = new Date().getHours()
  // Night shift (20:00-08:00) sleeps during day → DND 08:00-18:00
  // Day shift (08:00-17:00) sleeps during night → DND 22:00-08:00
  const isDayTime = hour >= 8 && hour < 18
  const isNightTime = hour >= 22 || hour < 8

  return db.prepare(`
    SELECT DISTINCT r.id, r.block, r.floor, r.room_no,
      CASE
        WHEN s.shift_type = 'night' AND ? THEN 'night_sleeping'
        WHEN (s.shift_type = 'day' OR s.shift_type IS NULL) AND ? THEN 'day_sleeping'
        ELSE 'occupied'
      END as dnd_reason,
      s.shift_type
    FROM rooms r
    JOIN room_assignments ra ON ra.room_id=r.id AND ra.check_out_at IS NULL
    JOIN personnel p ON p.id=ra.personnel_id
    LEFT JOIN shifts s ON s.personnel_id=p.id
    WHERE (
      (s.shift_type = 'night' AND ?)
      OR ((s.shift_type = 'day' OR s.shift_type IS NULL) AND ?)
    )
    AND p.check_out_date IS NULL
  `).all(isDayTime ? 1 : 0, isNightTime ? 1 : 0, isDayTime ? 1 : 0, isNightTime ? 1 : 0)
}

export function getRoomWithFaults(block, roomNo) {
  const db = getDB()
  const room = db.prepare(`SELECT * FROM rooms WHERE block=? AND room_no=?`).get(block, roomNo)
  const faults = db.prepare(`
    SELECT id, location, description, status, priority, opened_at, closed_at,
           photo_before, photo_url
    FROM maintenance_requests
    WHERE (location LIKE ? OR location LIKE ?)
    ORDER BY opened_at DESC
  `).all(`%${block}%${roomNo}%`, `%Oda ${roomNo}%`)
  return { room: room || null, faults }
}

export function toggleNoClean(roomId, value) {
  const db = getDB()
  db.prepare(`UPDATE rooms SET no_clean=? WHERE id=?`).run(value ? 1 : 0, roomId)
}

export function updateRoomNotes(roomId, notes) {
  const db = getDB()
  db.prepare('UPDATE rooms SET notes=? WHERE id=?').run(notes, roomId)
}

export function reportFault(location, description, userId, priority, photoBefore) {
  const db = getDB()
  return db.prepare(`
    INSERT INTO maintenance_requests(location, description, reporter_user_id, priority, photo_before)
    VALUES(?,?,?,?,?)
  `).run(location, description, userId, priority || 'medium', photoBefore || null).lastInsertRowid
}

// ── Cleaning Staff ───────────────────────────────────────────────────────────

export function getStaff(block) {
  const db = getDB()
  let q = 'SELECT * FROM cleaning_staff WHERE is_active=1'
  const params = []
  if (block) { q += ' AND assigned_block=?'; params.push(block) }
  q += ' ORDER BY assigned_block, assigned_floor, full_name'
  return db.prepare(q).all(...params)
}

export function createStaff(fullName, phone) {
  const db = getDB()
  return db.prepare(
    'INSERT INTO cleaning_staff(full_name,phone) VALUES(?,?)'
  ).run(fullName, phone || null).lastInsertRowid
}

export function updateStaff(id, data) {
  const db = getDB()
  const sets = []
  const params = []
  if (data.full_name !== undefined)      { sets.push('full_name=?');      params.push(data.full_name) }
  if (data.phone !== undefined)          { sets.push('phone=?');          params.push(data.phone || null) }
  if (data.assigned_block !== undefined) { sets.push('assigned_block=?'); params.push(data.assigned_block) }
  if (data.assigned_floor !== undefined) { sets.push('assigned_floor=?'); params.push(data.assigned_floor) }
  if (sets.length === 0) return
  params.push(id)
  db.prepare(`UPDATE cleaning_staff SET ${sets.join(',')} WHERE id=?`).run(...params)
}

export function deleteStaff(id) {
  const db = getDB()
  db.prepare('UPDATE cleaning_staff SET is_active=0 WHERE id=?').run(id)
}
