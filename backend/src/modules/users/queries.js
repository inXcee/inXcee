import { getDB } from '../../shared/db/index.js'

export function getAllUsers() {
  const db = getDB()
  return db.prepare(`
    SELECT id, username, role, full_name, assigned_block, assigned_floor, created_at
    FROM users ORDER BY role, full_name
  `).all()
}

export function getUserById(id) {
  const db = getDB()
  return db.prepare('SELECT id, username, role, full_name, assigned_block, assigned_floor, created_at FROM users WHERE id=?').get(id)
}

export function createUser({ username, password_hash, role, full_name, assigned_block, assigned_floor }) {
  const db = getDB()
  const r = db.prepare(
    'INSERT INTO users(username, password_hash, role, full_name, assigned_block, assigned_floor) VALUES(?,?,?,?,?,?)'
  ).run(username, password_hash, role, full_name, assigned_block || null, assigned_floor || null)
  return r.lastInsertRowid
}

export function updateUser(id, { role, full_name, assigned_block, assigned_floor }) {
  const db = getDB()
  db.prepare(`
    UPDATE users SET role=?, full_name=?, assigned_block=?, assigned_floor=? WHERE id=?
  `).run(role, full_name, assigned_block || null, assigned_floor || null, id)
}

export function updatePassword(id, password_hash) {
  const db = getDB()
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(password_hash, id)
}

export function deleteUser(id) {
  const db = getDB()
  db.prepare('DELETE FROM users WHERE id=?').run(id)
}

export function usernameExists(username, excludeId) {
  const db = getDB()
  if (excludeId) {
    return !!db.prepare('SELECT 1 FROM users WHERE username=? AND id!=?').get(username, excludeId)
  }
  return !!db.prepare('SELECT 1 FROM users WHERE username=?').get(username)
}
