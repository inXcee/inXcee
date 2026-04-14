import { getDB } from '../db/index.js'

const MAX_SSE_CLIENTS = 100
const sseClients = new Set()

export function addSSEClient(res) {
  if (sseClients.size >= MAX_SSE_CLIENTS) {
    const oldest = sseClients.values().next().value
    try { oldest.end() } catch { /* bağlantı zaten kapalı */ }
    sseClients.delete(oldest)
  }
  sseClients.add(res)
}
export function removeSSEClient(res) { sseClients.delete(res) }

export function createNotification({ message, type = 'info', module, target_role, target_user_id, dedup_key }) {
  const db = getDB()

  if (dedup_key) {
    const existing = db.prepare(
      "SELECT id FROM notifications WHERE dedup_key=? AND date(created_at)=date('now')"
    ).get(dedup_key)
    if (existing) return null
  }

  const r = db.prepare(
    'INSERT INTO notifications(message,type,module,target_role,target_user_id,dedup_key) VALUES(?,?,?,?,?,?)'
  ).run(message, type, module || null, target_role || null, target_user_id || null, dedup_key || null)

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

export function broadcastOccupancy() {
  const db = getDB()
  const blocks = db.prepare(`
    SELECT r.block,
      SUM(r.active_beds) as total_beds,
      COALESCE(SUM(cnt.c), 0) as occupied
    FROM rooms r
    LEFT JOIN (
      SELECT room_id, COUNT(*) as c FROM room_assignments WHERE check_out_at IS NULL GROUP BY room_id
    ) cnt ON cnt.room_id=r.id
    WHERE r.status='active'
    GROUP BY r.block
  `).all()

  const totals = blocks.reduce((acc, b) => {
    acc.total_beds += b.total_beds
    acc.occupied += b.occupied
    return acc
  }, { total_beds: 0, occupied: 0 })

  const data = { blocks, totals }
  const payload = `event: occupancy\ndata: ${JSON.stringify(data)}\n\n`

  sseClients.forEach(client => {
    try { client.write(payload) } catch { sseClients.delete(client) }
  })
}
