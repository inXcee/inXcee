import { getDB } from '../../shared/db/index.js'

export function createRequest({ location, description, reporterUserId, reporterPersonnelId, isPreventive }) {
  const db = getDB()
  const r = db.prepare(`
    INSERT INTO maintenance_requests(location,description,reporter_user_id,reporter_personnel_id,is_preventive)
    VALUES(?,?,?,?,?)
  `).run(location, description, reporterUserId || null, reporterPersonnelId || null, isPreventive ? 1 : 0)
  return r.lastInsertRowid
}

export function getRequests({ status, assigned_to } = {}) {
  const db = getDB()
  let q = `SELECT mr.*, u.full_name as assignee_name FROM maintenance_requests mr LEFT JOIN users u ON u.id=mr.assigned_to WHERE 1=1`
  const params = []
  if (status) { q += ' AND mr.status=?'; params.push(status) }
  if (assigned_to) { q += ' AND mr.assigned_to=?'; params.push(assigned_to) }
  q += ' ORDER BY mr.opened_at DESC'
  return db.prepare(q).all(...params)
}

export function assignRequest(id, userId) {
  const db = getDB()
  db.prepare("UPDATE maintenance_requests SET assigned_to=?, status='in_progress' WHERE id=?").run(userId, id)
}

export function closeRequest(id, photoUrl) {
  const db = getDB()
  db.prepare("UPDATE maintenance_requests SET status='done', photo_url=?, closed_at=datetime('now') WHERE id=?").run(photoUrl || null, id)
}

export function generatePreventiveTasks() {
  const db = getDB()
  const month = new Date().getMonth() + 1
  const tasks = []
  if (month === 10) tasks.push({ location: 'Tüm Bloklar', description: 'Kalorifer petekleri hava alma bakımı' })
  if (month === 4) tasks.push({ location: 'S Blokları', description: 'Klima filtre temizliği' })
  tasks.forEach(t => {
    db.prepare(`INSERT INTO maintenance_requests(location,description,is_preventive) VALUES(?,?,1)`).run(t.location, t.description)
  })
  return tasks.length
}
