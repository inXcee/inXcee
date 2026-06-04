import { randomBytes } from 'crypto'
import { getDB } from '../../shared/db/index.js'

// qr modülüyle aynı token üretimi — 20 hex char, çakışma ~0.
function genVisitorToken() {
  return randomBytes(10).toString('hex')
}

// status filtresi: upcoming=pre_registered, active=checked_in, past=checked_out.
// Geriye uyum: eski `active` param'ı ('1'/'0') korunur.
function statusWhere({ status, active }) {
  if (status === 'upcoming') return "WHERE v.status = 'pre_registered'"
  if (status === 'active') return "WHERE v.status = 'checked_in'"
  if (status === 'past') return "WHERE v.status = 'checked_out'"
  if (active === '1' || active === true) return 'WHERE v.check_out_at IS NULL AND v.check_in_at IS NOT NULL'
  if (active === '0' || active === false) return 'WHERE v.check_out_at IS NOT NULL'
  return ''
}

export function listVisitors({ active, status } = {}) {
  const db = getDB()
  const where = statusWhere({ status, active })
  return db.prepare(`
    SELECT v.*, p.full_name AS visiting_name
    FROM visitors v
    LEFT JOIN personnel p ON p.id=v.visiting_personnel_id
    ${where}
    ORDER BY COALESCE(v.expected_at, v.check_in_at, v.pre_registered_at) DESC
    LIMIT 500
  `).all()
}

// Walk-in: anında giriş yapılmış ziyaretçi.
export function createVisitor(data, userId) {
  const db = getDB()
  const r = db.prepare(`
    INSERT INTO visitors (full_name, tc_no, phone, purpose, visiting_personnel_id, visiting_block, notes, created_by, status, check_in_at)
    VALUES (?,?,?,?,?,?,?,?, 'checked_in', datetime('now'))
  `).run(
    data.full_name, data.tc_no || null, data.phone || null, data.purpose || null,
    data.visiting_personnel_id || null, data.visiting_block || null, data.notes || null, userId
  )
  return r.lastInsertRowid
}

// Ön-kayıt: ziyaretçi gelmeden kaydedilir (check_in_at NULL), QR token üretilir.
export function preRegisterVisitor(data, userId) {
  const db = getDB()
  const token = genVisitorToken()
  const r = db.prepare(`
    INSERT INTO visitors (full_name, tc_no, phone, purpose, visiting_personnel_id, visiting_block, notes, created_by,
      status, qr_token, expected_at, pre_registered_at)
    VALUES (?,?,?,?,?,?,?,?, 'pre_registered', ?, ?, datetime('now'))
  `).run(
    data.full_name, data.tc_no || null, data.phone || null, data.purpose || null,
    data.visiting_personnel_id || null, data.visiting_block || null, data.notes || null, userId,
    token, data.expected_at || null
  )
  return { id: r.lastInsertRowid, qr_token: token }
}

// QR token ile giriş. Dönüş: { ok, status, already?, visitor } veya null (token yok).
export function checkInByToken(rawToken) {
  const db = getDB()
  const token = String(rawToken || '').replace(/^AVS:/, '').trim()
  if (!token) return null
  const v = db.prepare(`
    SELECT v.*, p.full_name AS visiting_name
    FROM visitors v LEFT JOIN personnel p ON p.id=v.visiting_personnel_id
    WHERE v.qr_token = ?
  `).get(token)
  if (!v) return null
  if (v.status !== 'pre_registered') {
    return { ok: false, already: true, status: v.status, visitor: v }
  }
  db.prepare("UPDATE visitors SET status='checked_in', check_in_at=datetime('now') WHERE id=?").run(v.id)
  const updated = db.prepare(`
    SELECT v.*, p.full_name AS visiting_name
    FROM visitors v LEFT JOIN personnel p ON p.id=v.visiting_personnel_id
    WHERE v.id=?
  `).get(v.id)
  return { ok: true, status: 'checked_in', visitor: updated }
}

export function getVisitorById(id) {
  const db = getDB()
  return db.prepare(`
    SELECT v.*, p.full_name AS visiting_name
    FROM visitors v LEFT JOIN personnel p ON p.id=v.visiting_personnel_id
    WHERE v.id=?
  `).get(id)
}

export function checkOutVisitor(id) {
  const db = getDB()
  const r = db.prepare("UPDATE visitors SET check_out_at=datetime('now'), status='checked_out' WHERE id=? AND check_out_at IS NULL").run(id)
  return r.changes > 0
}

export function getVisitorStats() {
  const db = getDB()
  return db.prepare(`
    SELECT
      SUM(CASE WHEN status='checked_in' THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN status='pre_registered' THEN 1 ELSE 0 END) AS upcoming,
      SUM(CASE WHEN date(check_in_at) = date('now') THEN 1 ELSE 0 END) AS today,
      COUNT(*) AS total
    FROM visitors
  `).get()
}
