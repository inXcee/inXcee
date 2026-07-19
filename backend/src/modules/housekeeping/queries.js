import { getDB } from '../../shared/db/index.js'

export function generateDailyTasks(date = new Date()) {
  const db = getDB()
  // YEREL tarih (toISOString UTC döndürür — 00:00-03:00 TR arasında üretim
  // dünün tarihini basardı; sv-SE locale'i YYYY-MM-DD verir)
  const dateStr  = date.toLocaleDateString('sv-SE')
  const scheduled = `${dateStr} 08:00:00`
  const insert = db.prepare(`
    INSERT INTO cleaning_tasks(area, block, floor, task_type, scheduled_at, qr_location)
    SELECT ?,?,?,?,?,?
    WHERE NOT EXISTS (
      SELECT 1 FROM cleaning_tasks
      WHERE qr_location=? AND DATE(scheduled_at)=?
    )
  `)
  let count = 0
  const tx = db.transaction(() => {
    // M blokları için ortak alan task'i (sadece M tipi ortak banyo/WC içerir)
    const mFloors = db.prepare("SELECT DISTINCT block, floor FROM rooms WHERE block LIKE 'M%'").all()
    const commonAreas = [
      { code: 'corridor', label: 'Koridor' },
      { code: 'toilet', label: 'Tuvalet / WC' },
      { code: 'bathroom', label: 'Banyo' },
      { code: 'stairs', label: 'Merdiven' },
    ]
    mFloors.forEach(({ block, floor }) => {
      commonAreas.forEach(({ code, label }) => {
        const qrLocation = `${block}-${floor}-${code}`
        count += insert.run(
          `${block} ${floor}.Kat ${label}`, block, floor, 'common_area', scheduled,
          qrLocation, qrLocation, dateStr,
        ).changes
      })
    })
    // Tüm aktif odalar için bireysel oda task'i (M, S ve Y bloklar dahil)
    const allRooms = db.prepare("SELECT id, block, floor, room_no FROM rooms WHERE status='active'").all()
    allRooms.forEach(r => {
      const qrLocation = `${r.block}-${r.room_no}`
      count += insert.run(
        `${r.block} Oda ${r.room_no}`, r.block, r.floor, 'room', scheduled,
        qrLocation, qrLocation, dateStr,
      ).changes
    })
  })
  tx()
  return count
}

export function getTasks({ assigned_to, date, block, uncleaned } = {}) {
  const db = getDB()
  let q = `SELECT ct.*, u.full_name as assignee_name, w.full_name as worker_name
           FROM cleaning_tasks ct
           LEFT JOIN users u ON u.id=ct.assigned_to
           LEFT JOIN staff w ON w.id=ct.completed_by_worker_id
           WHERE 1=1`
  const params = []
  if (assigned_to) { q += ' AND ct.assigned_to=?'; params.push(assigned_to) }
  if (date)        { q += ' AND DATE(ct.scheduled_at)=?'; params.push(date) }
  if (block)       { q += ' AND ct.block=?'; params.push(block) }
  if (uncleaned)   { q += ' AND ct.completed_at IS NULL AND ct.skipped=0' }
  q += ' ORDER BY ct.scheduled_at'
  return db.prepare(q).all(...params)
}

export function completeTask(taskId, userId, checklist, viaQr = false, photoUrl = null) {
  const db = getDB()
  db.prepare(`
    UPDATE cleaning_tasks
    SET completed_at=datetime('now'), assigned_to=?, verified_by_qr=?,
        skipped=0, skip_reason=NULL, checklist=?,
        photo_url=COALESCE(?, photo_url)
    WHERE id=?
  `).run(userId, viaQr ? 1 : 0, checklist ? JSON.stringify(checklist) : null, photoUrl, taskId)
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

export function getFloorTaskPreview(block, floor, date) {
  const db = getDB()
  return db.prepare(`
    SELECT id, area, task_type
    FROM cleaning_tasks
    WHERE block=? AND floor=? AND DATE(scheduled_at)=? AND completed_at IS NULL AND skipped=0
    ORDER BY area
  `).all(block, floor, date)
}

export function completeFloorTasks(block, floor, date, userId) {
  const db = getDB()
  const r = db.prepare(`
    UPDATE cleaning_tasks
    SET completed_at=datetime('now'), assigned_to=?, skipped=0, skip_reason=NULL
    WHERE block=? AND floor=? AND DATE(scheduled_at)=? AND completed_at IS NULL AND skipped=0
  `).run(userId, block, floor, date)
  return r.changes
}

// Oda/ortak alan temizlik geçmişi — qr_location üretimle aynı anahtar:
// oda `M1-205`, ortak alan `M1-1-common` (generateDailyTasks)
export function getTaskHistory(qrLocation, days = 30) {
  const db = getDB()
  const offset = `-${Math.max(1, Math.min(180, days)) - 1} days`
  return db.prepare(`
    SELECT ct.id, ct.area, ct.task_type, ct.scheduled_at, ct.completed_at,
           ct.skipped, ct.skip_reason, ct.photo_url, ct.verified_by_qr,
           u.full_name as assignee_name, w.full_name as worker_name
    FROM cleaning_tasks ct
    LEFT JOIN users u ON u.id=ct.assigned_to
    LEFT JOIN staff w ON w.id=ct.completed_by_worker_id
    WHERE ct.qr_location = ?
      AND date(ct.scheduled_at) >= date('now', 'localtime', ?)
    ORDER BY ct.scheduled_at DESC
  `).all(qrLocation, offset)
}

export function getPhotoOverview({ days = 7, block, floor } = {}) {
  const db = getDB()
  const safeDays = Math.max(1, Math.min(7, Number(days) || 7))
  const offset = `-${safeDays - 1} days`
  let sql = `
    SELECT ct.id, ct.area, ct.block, ct.floor, ct.task_type, ct.qr_location,
           ct.scheduled_at, ct.completed_at, ct.skipped, ct.skip_reason,
           ct.photo_url, ct.verified_by_qr,
           CASE
             WHEN ct.task_type='room' THEN 'room'
             WHEN ct.qr_location LIKE '%-corridor' THEN 'corridor'
             WHEN ct.qr_location LIKE '%-toilet' THEN 'toilet'
             WHEN ct.qr_location LIKE '%-bathroom' THEN 'bathroom'
             WHEN ct.qr_location LIKE '%-stairs' THEN 'stairs'
             ELSE 'common'
           END AS area_code,
           u.full_name AS assignee_name,
           w.full_name AS worker_name
    FROM cleaning_tasks ct
    LEFT JOIN users u ON u.id=ct.assigned_to
    LEFT JOIN staff w ON w.id=ct.completed_by_worker_id
    WHERE DATE(ct.scheduled_at) >= DATE('now', 'localtime', ?)
  `
  const params = [offset]
  if (block) { sql += ' AND ct.block=?'; params.push(block) }
  if (floor !== undefined && floor !== null && floor !== '') {
    sql += ' AND ct.floor=?'; params.push(Number(floor))
  }
  sql += ` ORDER BY DATE(ct.scheduled_at) DESC, ct.block, ct.floor,
           CASE ct.task_type WHEN 'common_area' THEN 0 ELSE 1 END, ct.area`
  return db.prepare(sql).all(...params)
}

export function getDNDRooms() {
  const db = getDB()
  const hour = new Date().getHours()
  // Sadece gece vardiyası gündüz uyur → DND 07:00–19:00
  // Gündüz vardiyası DND yok (gece zaten herkes uyur, temizlik gece yapılmaz)
  const nightShiftSleeping = hour >= 7 && hour < 19

  if (!nightShiftSleeping) return []

  return db.prepare(`
    SELECT DISTINCT r.id, r.block, r.floor, r.room_no,
      'night_sleeping' as dnd_reason,
      'night' as shift_type,
      COUNT(ra.id) as occupied_count
    FROM rooms r
    JOIN room_assignments ra ON ra.room_id=r.id AND ra.check_out_at IS NULL
    JOIN personnel p ON p.id=ra.personnel_id AND p.check_out_date IS NULL
    JOIN shifts s ON s.personnel_id=p.id AND s.shift_type='night'
    GROUP BY r.id
  `).all()
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
  const personnel = room ? db.prepare(`
    SELECT p.id, p.full_name, p.company, p.phone_number, ra.bed_no,
      COALESCE(s.shift_type, 'day') as shift_type
    FROM room_assignments ra
    JOIN personnel p ON p.id = ra.personnel_id
    LEFT JOIN shifts s ON s.personnel_id = p.id
    WHERE ra.room_id = ? AND ra.check_out_at IS NULL AND p.check_out_date IS NULL
    ORDER BY ra.bed_no
  `).all(room.id) : []
  return { room: room || null, faults, personnel }
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
