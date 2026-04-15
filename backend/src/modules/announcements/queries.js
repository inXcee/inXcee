import { getDB } from '../../shared/db/index.js'

export function getAll() {
  return getDB().prepare('SELECT * FROM announcements ORDER BY created_at DESC').all()
}

export function create({ title, body, expiresAt, createdBy }) {
  const r = getDB().prepare(`
    INSERT INTO announcements(title, body, expires_at, created_by) VALUES(?,?,?,?)
  `).run(title, body, expiresAt || null, createdBy)
  return r.lastInsertRowid
}

export function remove(id) {
  return getDB().prepare('DELETE FROM announcements WHERE id=?').run(id)
}
