import { getDB } from '../../shared/db/index.js'

export function lookupPerson(tc_no, passport_no) {
  const db = getDB()
  if (tc_no) return db.prepare('SELECT * FROM personnel WHERE tc_no=?').get(tc_no)
  return db.prepare('SELECT * FROM personnel WHERE passport_no=?').get(passport_no)
}

export function insertPersonnel(data) {
  const db = getDB()
  const row = {
    tc_no: data.tc_no ?? null,
    passport_no: data.passport_no ?? null,
    full_name: data.full_name,
    company: data.company ?? null,
    hometown: data.hometown ?? null,
    preferred_block: data.preferred_block ?? null,
  }
  const r = db.prepare(`
    INSERT INTO personnel(tc_no,passport_no,full_name,company,hometown,preferred_block,check_in_date)
    VALUES(@tc_no,@passport_no,@full_name,@company,@hometown,@preferred_block,datetime('now'))
  `).run(row)
  return r.lastInsertRowid
}

export function suggestRoom(company, hometown) {
  const db = getDB()
  const room = db.prepare(`
    SELECT r.id as room_id, r.block, r.floor, r.room_no, r.active_beds,
           COUNT(ra.id) as current_count
    FROM rooms r
    LEFT JOIN room_assignments ra ON ra.room_id = r.id AND ra.check_out_at IS NULL
    WHERE r.status = 'active'
    GROUP BY r.id
    HAVING current_count < r.active_beds
    ORDER BY (
      SELECT COUNT(*) FROM room_assignments ra2
      JOIN personnel p ON p.id = ra2.personnel_id
      WHERE ra2.room_id = r.id AND ra2.check_out_at IS NULL
        AND (p.company = ? OR p.hometown = ?)
    ) DESC, current_count ASC
    LIMIT 1
  `).get(company, hometown)
  return room
}

export function assignRoom(personnelId, roomId, assignedBy) {
  const db = getDB()
  const room = db.prepare('SELECT * FROM rooms WHERE id=?').get(roomId)
  const count = db.prepare('SELECT COUNT(*) as c FROM room_assignments WHERE room_id=? AND check_out_at IS NULL').get(roomId)
  if (count.c >= room.active_beds) throw new Error('Oda dolu')
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
