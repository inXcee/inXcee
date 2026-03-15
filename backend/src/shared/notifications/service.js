import { getDB } from '../db/index.js'

const sseClients = new Set()

export function addSSEClient(res) { sseClients.add(res) }
export function removeSSEClient(res) { sseClients.delete(res) }

export function createNotification({ message, type = 'info', module, target_role, target_user_id }) {
  const db = getDB()
  const r = db.prepare('INSERT INTO notifications(message,type,module,target_role,target_user_id) VALUES(?,?,?,?,?)').run(message, type, module || null, target_role || null, target_user_id || null)
  const notif = db.prepare('SELECT * FROM notifications WHERE id=?').get(r.lastInsertRowid)
  sseClients.forEach(client => {
    try { client.write(`data: ${JSON.stringify(notif)}\n\n`) } catch { sseClients.delete(client) }
  })
  return notif
}

export function getNotifications(userId, role) {
  const db = getDB()
  return db.prepare(`
    SELECT * FROM notifications
    WHERE (target_user_id=? OR target_role=? OR (target_user_id IS NULL AND target_role IS NULL))
    ORDER BY created_at DESC LIMIT 50
  `).all(userId, role)
}

export function markRead(id) {
  const db = getDB()
  db.prepare('UPDATE notifications SET is_read=1 WHERE id=?').run(id)
}
