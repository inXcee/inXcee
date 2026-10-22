import { getDB } from '../../shared/db/index.js'

// Bitiş, formdaki datetime-local alanından YEREL (İstanbul) saatle gelir: '2026-10-25T18:00'. Eskiden UTC
// datetime('now') ile ve 'T' ↔ boşluk farkıyla kıyaslanıyordu → duyuru saatinde değil, tarihinin ertesi gecesi
// (UTC gün dönümü, TR 03:00) kapanıyordu. Parametre: istanbulNowNaive().
export const ACTIVE_ANNOUNCEMENT_SQL = "(expires_at IS NULL OR replace(expires_at, 'T', ' ') > ?)"

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
