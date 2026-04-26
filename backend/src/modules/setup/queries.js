import { getDB } from '../../shared/db/index.js'

export function hasAnyUserQuery() {
  const db = getDB()
  const row = db.prepare('SELECT COUNT(*) AS c FROM users').get()
  return (row?.c || 0) > 0
}

export function createFirstAdminQuery({ username, password_hash, full_name, email }) {
  const db = getDB()
  const r = db.prepare(`
    INSERT INTO users(username, password_hash, role, full_name, email)
    VALUES(?, ?, 'campus_manager', ?, ?)
  `).run(username, password_hash, full_name, email || null)
  return r.lastInsertRowid
}
