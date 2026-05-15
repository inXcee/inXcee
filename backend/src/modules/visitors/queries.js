import { getDB } from '../../shared/db/index.js'

export function listVisitors({ active } = {}) {
  const db = getDB()
  let where = ''
  if (active === '1' || active === true) where = 'WHERE v.check_out_at IS NULL'
  else if (active === '0' || active === false) where = 'WHERE v.check_out_at IS NOT NULL'
  return db.prepare(`
    SELECT v.*, p.full_name AS visiting_name
    FROM visitors v
    LEFT JOIN personnel p ON p.id=v.visiting_personnel_id
    ${where}
    ORDER BY v.check_in_at DESC
    LIMIT 500
  `).all()
}

export function createVisitor(data, userId) {
  const db = getDB()
  const r = db.prepare(`
    INSERT INTO visitors (full_name, tc_no, phone, purpose, visiting_personnel_id, visiting_block, notes, created_by)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(
    data.full_name, data.tc_no || null, data.phone || null, data.purpose || null,
    data.visiting_personnel_id || null, data.visiting_block || null, data.notes || null, userId
  )
  return r.lastInsertRowid
}

export function checkOutVisitor(id) {
  const db = getDB()
  const r = db.prepare("UPDATE visitors SET check_out_at=datetime('now') WHERE id=? AND check_out_at IS NULL").run(id)
  return r.changes > 0
}

export function getVisitorStats() {
  const db = getDB()
  return db.prepare(`
    SELECT
      SUM(CASE WHEN check_out_at IS NULL THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN date(check_in_at) = date('now') THEN 1 ELSE 0 END) AS today,
      COUNT(*) AS total
    FROM visitors
  `).get()
}
