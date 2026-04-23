import { getDB } from '../../shared/db/index.js'

// ── Maintenance Requests ─────────────────────────────────────────────────────

export function createRequest({ location, description, priority, reporterUserId, reporterPersonnelId, photoBefore, waitReason }) {
  const db = getDB()
  // SLA: high=4h, medium=24h, low=72h
  const slaHours = priority === 'high' ? 4 : priority === 'low' ? 72 : 24
  const r = db.prepare(`
    INSERT INTO maintenance_requests(location,description,priority,reporter_user_id,reporter_personnel_id,photo_before,wait_reason,sla_deadline)
    VALUES(?,?,?,?,?,?,?,datetime('now','+${slaHours} hours'))
  `).run(location, description, priority || 'medium', reporterUserId || null, reporterPersonnelId || null, photoBefore || null, waitReason || null)
  return r.lastInsertRowid
}

export function getRequests({ status, search, priority, reporter_user_id } = {}) {
  const db = getDB()
  let q = `
    SELECT mr.*,
      ru.full_name as reporter_name,
      t.full_name as technician_name
    FROM maintenance_requests mr
    LEFT JOIN users ru ON ru.id = mr.reporter_user_id
    LEFT JOIN technicians t ON t.id = mr.assigned_to
    WHERE 1=1
  `
  const params = []
  if (status) { q += ' AND mr.status=?'; params.push(status) }
  if (priority) { q += ' AND mr.priority=?'; params.push(priority) }
  if (reporter_user_id) { q += ' AND mr.reporter_user_id=?'; params.push(reporter_user_id) }
  if (search) {
    q += ' AND (mr.location LIKE ? OR mr.description LIKE ? OR mr.wait_reason LIKE ?)'
    const like = `%${search}%`
    params.push(like, like, like)
  }
  q += ' ORDER BY CASE mr.priority WHEN \'high\' THEN 0 WHEN \'medium\' THEN 1 ELSE 2 END, mr.opened_at DESC'
  return db.prepare(q).all(...params)
}

export function getRequestById(id) {
  const db = getDB()
  return db.prepare(`
    SELECT mr.*,
      ru.full_name as reporter_name,
      t.full_name as technician_name
    FROM maintenance_requests mr
    LEFT JOIN users ru ON ru.id = mr.reporter_user_id
    LEFT JOIN technicians t ON t.id = mr.assigned_to
    WHERE mr.id=?
  `).get(id)
}

export function updateWaitReason(id, waitReason) {
  const db = getDB()
  db.prepare('UPDATE maintenance_requests SET wait_reason=? WHERE id=?').run(waitReason || null, id)
}

export function updateRequestPriority(id, priority) {
  const db = getDB()
  db.prepare('UPDATE maintenance_requests SET priority=? WHERE id=?').run(priority, id)
}

export function closeRequest(id, photoUrl) {
  const db = getDB()
  db.prepare(`
    UPDATE maintenance_requests
    SET status='done', photo_url=?, closed_at=datetime('now'), wait_reason=NULL
    WHERE id=?
  `).run(photoUrl || null, id)
}

export function reopenRequest(id) {
  const db = getDB()
  db.prepare(`
    UPDATE maintenance_requests
    SET status='open', closed_at=NULL
    WHERE id=?
  `).run(id)
}

export function assignRequest(id, technicianId) {
  const db = getDB()
  const tech = db.prepare('SELECT id FROM technicians WHERE id=?').get(technicianId)
  if (!tech) throw new Error('Teknisyen bulunamadı')
  const r = db.prepare(
    "UPDATE maintenance_requests SET assigned_to=? WHERE id=?"
  ).run(technicianId, id)
  if (!r.changes) throw new Error('Talep bulunamadı')
}

export function startRequest(id) {
  const db = getDB()
  const r = db.prepare(`
    UPDATE maintenance_requests
    SET status='in_progress', started_at=datetime('now')
    WHERE id=? AND status='open'
  `).run(id)
  return r.changes
}

export function updateStatus(id, newStatus) {
  const db = getDB()
  const allowed = ['open', 'in_progress', 'done']
  if (!allowed.includes(newStatus)) throw new Error('Geçersiz durum')
  const extras = []
  if (newStatus === 'in_progress') extras.push("started_at=datetime('now')")
  if (newStatus === 'done') { extras.push("closed_at=datetime('now')"); extras.push("wait_reason=NULL") }
  if (newStatus === 'open') { extras.push("closed_at=NULL"); extras.push("started_at=NULL") }
  const setClause = ['status=?', ...extras].join(', ')
  const r = db.prepare(`UPDATE maintenance_requests SET ${setClause} WHERE id=?`).run(newStatus, id)
  return r.changes
}

export function deleteRequest(id) {
  const db = getDB()
  db.prepare('DELETE FROM maintenance_comments WHERE request_id=?').run(id)
  db.prepare('DELETE FROM maintenance_requests WHERE id=?').run(id)
}

export function getStats() {
  const db = getDB()
  const total = db.prepare('SELECT COUNT(*) as c FROM maintenance_requests').get().c
  const open = db.prepare("SELECT COUNT(*) as c FROM maintenance_requests WHERE status='open'").get().c
  const waiting = db.prepare("SELECT COUNT(*) as c FROM maintenance_requests WHERE status='open' AND wait_reason IS NOT NULL AND wait_reason != ''").get().c
  const closedToday = db.prepare("SELECT COUNT(*) as c FROM maintenance_requests WHERE status='done' AND DATE(closed_at)=DATE('now')").get().c

  const avgRow = db.prepare(`
    SELECT AVG(CAST((julianday(closed_at) - julianday(opened_at)) * 24 AS REAL)) as avg_hours
    FROM maintenance_requests WHERE status='done' AND closed_at IS NOT NULL
  `).get()
  const avgHours = avgRow?.avg_hours ? Math.round(avgRow.avg_hours * 10) / 10 : null

  const byBlock = db.prepare(`
    SELECT
      CASE
        WHEN location LIKE 'M1%' THEN 'M1'
        WHEN location LIKE 'M2%' THEN 'M2'
        WHEN location LIKE 'M3%' THEN 'M3'
        WHEN location LIKE 'S1%' THEN 'S1'
        WHEN location LIKE 'S2%' THEN 'S2'
        WHEN location LIKE 'S3%' THEN 'S3'
        ELSE 'Diğer'
      END as block,
      COUNT(*) as count
    FROM maintenance_requests WHERE status != 'done'
    GROUP BY block ORDER BY count DESC
  `).all()

  const byPriority = db.prepare(`
    SELECT COALESCE(priority,'medium') as priority, COUNT(*) as count
    FROM maintenance_requests WHERE status != 'done'
    GROUP BY priority
  `).all()

  const overdue = db.prepare("SELECT COUNT(*) as c FROM maintenance_requests WHERE status='open' AND sla_deadline IS NOT NULL AND sla_deadline < datetime('now')").get().c

  return { total, open, waiting, closedToday, avgHours, overdue, byBlock, byPriority }
}

// ── Location Suggestions ────────────────────────────────────────────────────

export function getLocationSuggestions() {
  const db = getDB()
  return db.prepare(`
    SELECT location, COUNT(*) as cnt
    FROM maintenance_requests
    WHERE location IS NOT NULL AND location != ''
    GROUP BY location
    ORDER BY cnt DESC
    LIMIT 30
  `).all()
}

// ── Technicians (with shifts) ───────────────────────────────────────────────

export function getTechnicians() {
  const db = getDB()
  return db.prepare(`
    SELECT * FROM technicians WHERE is_active=1 ORDER BY shift, full_name
  `).all()
}

export function getAvailableTechnicians() {
  const db = getDB()
  const hour = new Date().getHours()
  const shifts = new Set()
  if (hour >= 8 && hour < 17) shifts.add('1')   // 08:00-17:00
  if (hour >= 15 && hour < 24) shifts.add('2')   // 15:00-00:00
  if (hour >= 0 && hour < 8) shifts.add('3')     // 00:00-08:00

  if (shifts.size === 0) shifts.add('1')
  const arr = [...shifts]
  const placeholders = arr.map(() => '?').join(',')
  return db.prepare(`
    SELECT * FROM technicians WHERE is_active=1 AND shift IN (${placeholders}) ORDER BY shift, full_name
  `).all(...arr)
}

export function createTechnician(fullName, phone, specialty, shift) {
  const db = getDB()
  return db.prepare('INSERT INTO technicians(full_name,phone,specialty,shift) VALUES(?,?,?,?)').run(fullName, phone || null, specialty || 'genel', shift || '1').lastInsertRowid
}

export function updateTechnician(id, data) {
  const db = getDB()
  const sets = []
  const params = []
  if (data.full_name !== undefined) { sets.push('full_name=?'); params.push(data.full_name) }
  if (data.phone !== undefined)     { sets.push('phone=?');     params.push(data.phone || null) }
  if (data.specialty !== undefined) { sets.push('specialty=?'); params.push(data.specialty) }
  if (data.shift !== undefined)     { sets.push('shift=?');     params.push(data.shift) }
  if (sets.length === 0) return
  params.push(id)
  db.prepare(`UPDATE technicians SET ${sets.join(',')} WHERE id=?`).run(...params)
}

export function deleteTechnician(id) {
  const db = getDB()
  db.prepare('UPDATE technicians SET is_active=0 WHERE id=?').run(id)
}

// ── Comments ─────────────────────────────────────────────────────────────────

export function getComments(requestId) {
  const db = getDB()
  return db.prepare(`
    SELECT mc.*, u.full_name as user_name
    FROM maintenance_comments mc
    LEFT JOIN users u ON u.id=mc.user_id
    WHERE mc.request_id=?
    ORDER BY mc.created_at ASC
  `).all(requestId)
}

export function addComment(requestId, userId, comment, photoUrl) {
  const db = getDB()
  return db.prepare(`
    INSERT INTO maintenance_comments(request_id,user_id,comment,photo_url) VALUES(?,?,?,?)
  `).run(requestId, userId, comment, photoUrl || null).lastInsertRowid
}
