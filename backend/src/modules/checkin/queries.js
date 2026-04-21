import { getDB } from '../../shared/db/index.js'

export function lookupPerson(tc_no, passport_no) {
  const db = getDB()
  if (tc_no) return db.prepare('SELECT * FROM personnel WHERE tc_no=?').get(tc_no)
  if (passport_no) return db.prepare('SELECT * FROM personnel WHERE passport_no=?').get(passport_no)
  return null
}

export function searchByName(name) {
  const db = getDB()
  const term = `%${name}%`
  return db.prepare(`
    SELECT p.id, p.full_name, p.company, p.phone_number, p.job_title, p.tc_no, p.photo_url,
      p.is_blacklisted, p.blacklist_reason, p.blacklisted_at,
      ra.room_id, r.block, r.floor, r.room_no,
      s.shift_type
    FROM personnel p
    LEFT JOIN room_assignments ra ON ra.personnel_id=p.id AND ra.check_out_at IS NULL
    LEFT JOIN rooms r ON r.id=ra.room_id
    LEFT JOIN shifts s ON s.personnel_id=p.id
    WHERE p.full_name LIKE ? OR p.company LIKE ? OR p.job_title LIKE ?
    ORDER BY p.full_name
    LIMIT 20
  `).all(term, term, term)
}

export function searchResidents(q) {
  const db = getDB()
  const term = `%${q}%`
  return db.prepare(`
    SELECT p.id, p.full_name, p.job_title, p.company, p.tc_no,
      r.block, r.room_no, ra.bed_no,
      p.check_out_date,
      CASE WHEN p.kiosk_pin IS NOT NULL THEN 1 ELSE 0 END as has_kiosk_pin
    FROM personnel p
    LEFT JOIN room_assignments ra ON ra.personnel_id=p.id AND ra.check_out_at IS NULL
    LEFT JOIN rooms r ON r.id=ra.room_id
    WHERE p.check_out_date IS NULL
      AND (p.full_name LIKE ? OR r.room_no LIKE ?)
    ORDER BY p.full_name
    LIMIT 10
  `).all(term, term)
}

// ── Company & Job autocomplete ──────────────────────────────────────────────

export function getCompanySuggestions() {
  const db = getDB()
  return db.prepare(`
    SELECT company, COUNT(*) as cnt
    FROM personnel
    WHERE company IS NOT NULL AND company != ''
    GROUP BY company
    ORDER BY cnt DESC
  `).all()
}

export function getJobSuggestions() {
  const db = getDB()
  return db.prepare(`
    SELECT job_title, COUNT(*) as cnt
    FROM personnel
    WHERE job_title IS NOT NULL AND job_title != ''
    GROUP BY job_title
    ORDER BY cnt DESC
  `).all()
}

// ── Room browsing ───────────────────────────────────────────────────────────

export function getAvailableRooms(block) {
  const db = getDB()
  let q = `
    SELECT r.id as room_id, r.block, r.floor, r.room_no, r.capacity, r.active_beds, r.status,
      COUNT(ra.id) as current_count
    FROM rooms r
    LEFT JOIN room_assignments ra ON ra.room_id=r.id AND ra.check_out_at IS NULL
    WHERE r.status='active'
  `
  const params = []
  if (block) { q += ' AND r.block=?'; params.push(block) }
  q += ' GROUP BY r.id ORDER BY r.block, r.floor, CAST(r.room_no AS INTEGER)'
  return db.prepare(q).all(...params)
}

// ── Stats & Distribution ────────────────────────────────────────────────────

export function getOverallStats() {
  const db = getDB()
  const personnel = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN ra.id IS NOT NULL THEN 1 ELSE 0 END) as checked_in,
      SUM(CASE WHEN ra.id IS NULL THEN 1 ELSE 0 END) as not_assigned
    FROM personnel p
    LEFT JOIN room_assignments ra ON ra.personnel_id=p.id AND ra.check_out_at IS NULL
    WHERE p.check_out_date IS NULL
  `).get()

  const shifts = db.prepare(`
    SELECT
      SUM(CASE WHEN s.shift_type='day' OR s.shift_type IS NULL THEN 1 ELSE 0 END) as day_shift,
      SUM(CASE WHEN s.shift_type='night' THEN 1 ELSE 0 END) as night_shift
    FROM personnel p
    LEFT JOIN shifts s ON s.personnel_id=p.id
    WHERE p.check_out_date IS NULL
  `).get()

  const rooms = db.prepare(`
    SELECT
      COUNT(*) as total_rooms,
      SUM(r.active_beds) as total_beds,
      SUM(CASE WHEN cnt.c > 0 THEN 1 ELSE 0 END) as occupied_rooms,
      SUM(CASE WHEN cnt.c >= r.active_beds THEN 1 ELSE 0 END) as full_rooms,
      SUM(cnt.c) as total_occupied
    FROM rooms r
    LEFT JOIN (
      SELECT room_id, COUNT(*) as c FROM room_assignments WHERE check_out_at IS NULL GROUP BY room_id
    ) cnt ON cnt.room_id=r.id
    WHERE r.status='active'
  `).get()

  const blockDist = db.prepare(`
    SELECT r.block,
      COUNT(DISTINCT r.id) as rooms,
      SUM(r.active_beds) as beds,
      COALESCE(SUM(cnt.c),0) as occupied
    FROM rooms r
    LEFT JOIN (
      SELECT room_id, COUNT(*) as c FROM room_assignments WHERE check_out_at IS NULL GROUP BY room_id
    ) cnt ON cnt.room_id=r.id
    WHERE r.status='active'
    GROUP BY r.block
    ORDER BY r.block
  `).all()

  return { ...personnel, ...shifts, ...rooms, blockDist }
}

export function getCompanyDistribution() {
  const db = getDB()
  return db.prepare(`
    SELECT
      p.company,
      COUNT(p.id) as total,
      SUM(CASE WHEN ra.id IS NOT NULL THEN 1 ELSE 0 END) as checked_in,
      SUM(CASE WHEN s.shift_type='day' OR s.shift_type IS NULL THEN 1 ELSE 0 END) as day_shift,
      SUM(CASE WHEN s.shift_type='night' THEN 1 ELSE 0 END) as night_shift
    FROM personnel p
    LEFT JOIN room_assignments ra ON ra.personnel_id=p.id AND ra.check_out_at IS NULL
    LEFT JOIN shifts s ON s.personnel_id=p.id
    WHERE p.check_out_date IS NULL
    GROUP BY p.company
    ORDER BY total DESC
  `).all()
}

export function getJobDistribution() {
  const db = getDB()
  return db.prepare(`
    SELECT
      COALESCE(p.job_title, '(Belirtilmemiş)') as job_title,
      COUNT(p.id) as total,
      SUM(CASE WHEN s.shift_type='day' OR s.shift_type IS NULL THEN 1 ELSE 0 END) as day_shift,
      SUM(CASE WHEN s.shift_type='night' THEN 1 ELSE 0 END) as night_shift
    FROM personnel p
    LEFT JOIN shifts s ON s.personnel_id=p.id
    WHERE p.check_out_date IS NULL
    GROUP BY p.job_title
    ORDER BY total DESC
  `).all()
}

export function getCompanyPersonnel(company, { limit = 200, offset = 0 } = {}) {
  const db = getDB()
  const total = db.prepare(
    'SELECT COUNT(*) as c FROM personnel WHERE company=? AND check_out_date IS NULL'
  ).get(company).c
  const data = db.prepare(`
    SELECT p.id, p.full_name, p.phone_number, p.tc_no, p.job_title,
      ra.room_id, r.block, r.floor, r.room_no, ra.bed_no,
      s.shift_type, s.start_hour, s.end_hour
    FROM personnel p
    LEFT JOIN room_assignments ra ON ra.personnel_id=p.id AND ra.check_out_at IS NULL
    LEFT JOIN rooms r ON r.id=ra.room_id
    LEFT JOIN shifts s ON s.personnel_id=p.id
    WHERE p.company=? AND p.check_out_date IS NULL
    ORDER BY s.shift_type, p.full_name
    LIMIT ? OFFSET ?
  `).all(company, limit, offset)
  return { data, total }
}

// ── Shift ───────────────────────────────────────────────────────────────────

export function setShift(personnelId, shiftType) {
  const db = getDB()
  const startHour = shiftType === 'night' ? 20 : 8
  const endHour = shiftType === 'night' ? 8 : 17
  const existing = db.prepare('SELECT id FROM shifts WHERE personnel_id=?').get(personnelId)
  if (existing) {
    db.prepare('UPDATE shifts SET shift_type=?, start_hour=?, end_hour=? WHERE personnel_id=?')
      .run(shiftType, startHour, endHour, personnelId)
  } else {
    db.prepare('INSERT INTO shifts(personnel_id, shift_type, start_hour, end_hour) VALUES(?,?,?,?)')
      .run(personnelId, shiftType, startHour, endHour)
  }
}

// ── Registration & Assignment ───────────────────────────────────────────────

export function insertPersonnel(data) {
  const db = getDB()
  const row = {
    tc_no: data.tc_no ?? null,
    passport_no: data.passport_no ?? null,
    full_name: data.full_name,
    company: data.company ?? null,
    hometown: data.hometown ?? null,
    phone_number: data.phone_number ?? null,
    job_title: data.job_title ?? null,
    preferred_block: data.preferred_block ?? null,
    emergency_name: data.emergency_name ?? null,
    emergency_phone: data.emergency_phone ?? null,
    created_by: data.created_by ?? null,
  }
  const r = db.prepare(`
    INSERT INTO personnel(tc_no,passport_no,full_name,company,hometown,phone_number,job_title,preferred_block,emergency_name,emergency_phone,check_in_date,created_by)
    VALUES(@tc_no,@passport_no,@full_name,@company,@hometown,@phone_number,@job_title,@preferred_block,@emergency_name,@emergency_phone,datetime('now'),@created_by)
  `).run(row)
  return r.lastInsertRowid
}

export function suggestRoom(company, hometown, shiftType) {
  const db = getDB()
  const shift = shiftType || 'day'
  const room = db.prepare(`
    SELECT r.id as room_id, r.block, r.floor, r.room_no, r.active_beds,
           COUNT(ra.id) as current_count
    FROM rooms r
    LEFT JOIN room_assignments ra ON ra.room_id = r.id AND ra.check_out_at IS NULL
    WHERE r.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM room_assignments ra3
        JOIN personnel p3 ON p3.id = ra3.personnel_id
        LEFT JOIN shifts s3 ON s3.personnel_id = p3.id
        WHERE ra3.room_id = r.id AND ra3.check_out_at IS NULL
          AND COALESCE(s3.shift_type, 'day') != ?
      )
    GROUP BY r.id
    HAVING current_count < r.active_beds
    ORDER BY (
      SELECT COUNT(*) FROM room_assignments ra2
      JOIN personnel p ON p.id = ra2.personnel_id
      WHERE ra2.room_id = r.id AND ra2.check_out_at IS NULL
        AND (p.company = ? OR p.hometown = ?)
    ) DESC, current_count ASC
    LIMIT 1
  `).get(shift, company, hometown)
  return room
}

export function assignRoom(personnelId, roomId, assignedBy) {
  const db = getDB()
  const room = db.prepare('SELECT * FROM rooms WHERE id=?').get(roomId)
  const count = db.prepare('SELECT COUNT(*) as c FROM room_assignments WHERE room_id=? AND check_out_at IS NULL').get(roomId)
  if (count.c >= room.active_beds) throw new Error('Oda dolu')

  // Shift compatibility check
  const personShift = db.prepare('SELECT shift_type FROM shifts WHERE personnel_id=?').get(personnelId)
  const myShift = personShift?.shift_type || 'day'
  if (count.c > 0) {
    const conflict = db.prepare(`
      SELECT COUNT(*) as c FROM room_assignments ra
      JOIN personnel p ON p.id=ra.personnel_id
      LEFT JOIN shifts s ON s.personnel_id=p.id
      WHERE ra.room_id=? AND ra.check_out_at IS NULL
        AND COALESCE(s.shift_type, 'day') != ?
    `).get(roomId, myShift)
    if (conflict.c > 0) throw new Error(`Bu odada ${myShift === 'day' ? 'gece' : 'gündüz'} vardiyası var — aynı odaya farklı vardiya atanamaz`)
  }

  const bedNo = count.c + 1
  db.prepare(`
    INSERT INTO room_assignments(personnel_id,room_id,bed_no,assigned_by)
    VALUES(?,?,?,?)
  `).run(personnelId, roomId, bedNo, assignedBy)
  return bedNo
}

export function addZimmet(personnelId, items, createdBy) {
  const db = getDB()
  const insert = db.prepare(`
    INSERT INTO zimmet(personnel_id,item_name,quantity,created_by) VALUES(?,?,?,?)
  `)
  const tx = db.transaction(() => items.forEach(i => insert.run(personnelId, i.item_name, i.quantity || 1, createdBy)))
  tx()
}

export function signZimmet(personnelId, signature) {
  const db = getDB()
  db.prepare(`
    UPDATE zimmet SET digital_signature=?, signed_at=datetime('now')
    WHERE personnel_id=? AND digital_signature IS NULL
  `).run(signature, personnelId)
}

// ── Zimmet Return (#7) ──────────────────────────────────────────────────────

export function getPersonnelZimmet(personnelId) {
  const db = getDB()
  return db.prepare(`
    SELECT z.*, p.full_name
    FROM zimmet z
    JOIN personnel p ON p.id=z.personnel_id
    WHERE z.personnel_id=?
    ORDER BY z.created_at DESC
  `).all(personnelId)
}

export function returnZimmet(zimmetId, condition) {
  const db = getDB()
  db.prepare("UPDATE zimmet SET returned_at=datetime('now'), return_condition=? WHERE id=?").run(condition || 'normal', zimmetId)
}

export function returnAllZimmet(personnelId, condition) {
  const db = getDB()
  db.prepare("UPDATE zimmet SET returned_at=datetime('now'), return_condition=? WHERE personnel_id=? AND returned_at IS NULL").run(condition || 'normal', personnelId)
}

export function getUnreturnedZimmet(personnelId) {
  const db = getDB()
  return db.prepare(`
    SELECT z.id, z.item_name, z.quantity, z.created_at
    FROM zimmet z
    WHERE z.personnel_id=? AND z.returned_at IS NULL
    ORDER BY z.created_at DESC
  `).all(personnelId)
}

export function insertPlaceholderBatch(roomId, count, assignedBy) {
  const db = getDB()
  const room = db.prepare('SELECT * FROM rooms WHERE id=?').get(roomId)
  if (!room) throw new Error('Oda bulunamadı')
  const current = db.prepare('SELECT COUNT(*) as c FROM room_assignments WHERE room_id=? AND check_out_at IS NULL').get(roomId)
  const available = room.active_beds - current.c
  if (count > available) throw new Error(`Sadece ${available} yatak müsait`)
  const ids = []
  for (let i = 0; i < count; i++) {
    const r = db.prepare(`
      INSERT INTO personnel(full_name, is_placeholder, check_in_date)
      VALUES('Anonim', 1, datetime('now'))
    `).run()
    const bedNo = current.c + i + 1
    db.prepare(`
      INSERT INTO room_assignments(personnel_id, room_id, bed_no, assigned_by)
      VALUES(?,?,?,?)
    `).run(r.lastInsertRowid, roomId, bedNo, assignedBy || null)
    ids.push(r.lastInsertRowid)
  }
  return ids
}
