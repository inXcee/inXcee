import { getDB } from '../../shared/db/index.js'
import bcrypt from 'bcryptjs'

const SAFE_COLS = 'id, full_name, role_label, is_active, created_at, kiosk_pin IS NOT NULL as has_pin'

export function listWorkers() {
  return getDB().prepare(`SELECT ${SAFE_COLS} FROM avs_workers ORDER BY full_name`).all()
}

export function getWorker(id) {
  return getDB().prepare(`SELECT ${SAFE_COLS} FROM avs_workers WHERE id=?`).get(id)
}

export function createWorker({ full_name, role_label }) {
  const r = getDB().prepare('INSERT INTO avs_workers(full_name, role_label) VALUES(?,?)').run(full_name, role_label || null)
  return r.lastInsertRowid
}

export function updateWorker(id, { full_name, role_label }) {
  getDB().prepare('UPDATE avs_workers SET full_name=?, role_label=? WHERE id=?').run(full_name, role_label || null, id)
}

export function setWorkerPin(id, pin) {
  const hash = bcrypt.hashSync(pin, 10)
  getDB().prepare('UPDATE avs_workers SET kiosk_pin=? WHERE id=?').run(hash, id)
}

export function toggleWorker(id) {
  getDB().prepare('UPDATE avs_workers SET is_active = 1 - is_active WHERE id=?').run(id)
  return getDB().prepare('SELECT is_active FROM avs_workers WHERE id=?').get(id)
}

export function deleteWorker(id) {
  return getDB().prepare('DELETE FROM avs_workers WHERE id=?').run(id).changes > 0
}
