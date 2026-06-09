import { getDB } from '../../../shared/db/index.js'
export function getMessagesQuery({ limit = 50, before_id } = {}) {
  const db = getDB()
  if (before_id) {
    return db.prepare(`
      SELECT * FROM laundry_messages WHERE id < ?
      ORDER BY created_at ASC, id ASC LIMIT ?
    `).all(before_id, limit)
  }
  return db.prepare(`
    SELECT * FROM laundry_messages
    ORDER BY created_at ASC, id ASC LIMIT ?
  `).all(limit)
}

export function getMessageQuery(id) {
  const db = getDB()
  return db.prepare(`SELECT * FROM laundry_messages WHERE id=?`).get(id)
}

export function insertMessageQuery({ sender_id, sender_name, message, message_type = 'normal' }) {
  const db = getDB()
  const result = db.prepare(`
    INSERT INTO laundry_messages(sender_id, sender_name, message, message_type)
    VALUES(?, ?, ?, ?)
  `).run(sender_id, sender_name, message, message_type)
  return db.prepare(`SELECT * FROM laundry_messages WHERE id=?`).get(result.lastInsertRowid)
}

export function deleteMessageQuery(id) {
  const db = getDB()
  return db.prepare(`DELETE FROM laundry_messages WHERE id=?`).run(id)
}

export function pinMessageQuery(id, is_pinned) {
  const db = getDB()
  db.prepare(`UPDATE laundry_messages SET is_pinned=? WHERE id=?`).run(is_pinned ? 1 : 0, id)
  return db.prepare(`SELECT * FROM laundry_messages WHERE id=?`).get(id)
}

// ═══════════════════════════════════════════════════════════════════════════
// PREMIUM GARMENTS
// ═══════════════════════════════════════════════════════════════════════════

