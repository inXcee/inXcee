import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { logAudit } from '../../shared/audit.js'
import { getDB } from '../../shared/db/index.js'

export const safetyRouter = Router()
const mgr = requireRole('campus_manager', 'shift_supervisor')
const view = requireRole('campus_manager', 'shift_supervisor', 'technical')

// ── IG1: Eğitim oturumları CRUD ──
safetyRouter.get('/sessions', ...view, (req, res) => {
  try {
    const db = getDB()
    let q = `
      SELECT t.*,
        (SELECT COUNT(*) FROM training_attendances WHERE session_id = t.id) as registered_count,
        (SELECT COUNT(*) FROM training_attendances WHERE session_id = t.id AND attended = 1) as attended_count
      FROM training_sessions t
      WHERE 1=1
    `
    const params = []
    if (req.query.category) { q += ' AND t.category = ?'; params.push(req.query.category) }
    if (req.query.status) { q += ' AND t.status = ?'; params.push(req.query.status) }
    if (req.query.from) { q += ' AND t.session_date >= ?'; params.push(req.query.from) }
    if (req.query.to) { q += ' AND t.session_date <= ?'; params.push(req.query.to) }
    q += ' ORDER BY t.session_date DESC LIMIT 200'
    res.json(db.prepare(q).all(...params))
  } catch (e) { console.error('[safety/list]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

safetyRouter.get('/sessions/:id', ...view, (req, res) => {
  try {
    const db = getDB()
    const head = db.prepare('SELECT * FROM training_sessions WHERE id=?').get(+req.params.id)
    if (!head) return res.status(404).json({ error: 'Bulunamadı' })
    const attendances = db.prepare(`
      SELECT a.*, s.full_name, s.tc_no, d.name as dept_name
      FROM training_attendances a
      JOIN staff s ON s.id = a.staff_id
      LEFT JOIN departments d ON d.id = s.department_id
      WHERE a.session_id = ?
      ORDER BY s.full_name
    `).all(+req.params.id)
    res.json({ ...head, attendances })
  } catch (e) { console.error('[safety/get]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

safetyRouter.post('/sessions', ...mgr, (req, res) => {
  try {
    const { title, category, session_date, duration_min, location, instructor, notes } = req.body || {}
    if (!title || !category || !session_date) {
      return res.status(400).json({ error: 'title, category, session_date gerekli' })
    }
    if (!['safety', 'fire', 'first_aid', 'environment', 'quality', 'other'].includes(category)) {
      return res.status(400).json({ error: 'Geçersiz kategori' })
    }
    const id = getDB().prepare(`
      INSERT INTO training_sessions(title, category, session_date, duration_min, location, instructor, notes, created_by)
      VALUES(?,?,?,?,?,?,?,?)
    `).run(title, category, session_date, duration_min || 60, location || null, instructor || null, notes || null, req.user.id).lastInsertRowid
    logAudit(req.user.id, 'training_session_create', 'safety', id, `${title} ${session_date}`)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

safetyRouter.put('/sessions/:id', ...mgr, (req, res) => {
  try {
    const db = getDB()
    const fields = ['title', 'category', 'session_date', 'duration_min', 'location', 'instructor', 'notes', 'status']
    const sets = []
    const params = []
    fields.forEach(f => {
      if (req.body[f] !== undefined) { sets.push(`${f}=?`); params.push(req.body[f] === '' ? null : req.body[f]) }
    })
    if (!sets.length) return res.json({ ok: true })
    params.push(+req.params.id)
    db.prepare(`UPDATE training_sessions SET ${sets.join(',')} WHERE id=?`).run(...params)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

safetyRouter.delete('/sessions/:id', ...mgr, (req, res) => {
  try { getDB().prepare('DELETE FROM training_sessions WHERE id=?').run(+req.params.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Katılım ekleme/güncelleme ──
safetyRouter.post('/sessions/:id/attendances', ...mgr, (req, res) => {
  try {
    const sessionId = +req.params.id
    const { staff_ids, staff_id, attended, score, cert_expires_at } = req.body || {}
    const ids = Array.isArray(staff_ids) ? staff_ids : (staff_id ? [staff_id] : [])
    if (!ids.length) return res.status(400).json({ error: 'staff_id veya staff_ids gerekli' })

    const db = getDB()
    const stmt = db.prepare(`
      INSERT INTO training_attendances(session_id, staff_id, attended, score, cert_expires_at)
      VALUES(?,?,?,?,?)
      ON CONFLICT(session_id, staff_id) DO UPDATE SET
        attended = COALESCE(excluded.attended, attended),
        score = COALESCE(excluded.score, score),
        cert_expires_at = COALESCE(excluded.cert_expires_at, cert_expires_at)
    `)
    const tx = db.transaction(() => {
      ids.forEach(sid => stmt.run(sessionId, +sid, attended ? 1 : 0, score ?? null, cert_expires_at || null))
    })
    tx()
    res.json({ ok: true, count: ids.length })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

safetyRouter.delete('/attendances/:id', ...mgr, (req, res) => {
  try { getDB().prepare('DELETE FROM training_attendances WHERE id=?').run(+req.params.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

// ── IG2: Sertifika uyarıları (yakın bitiş) ──
safetyRouter.get('/expiring-certs', ...view, (req, res) => {
  try {
    const days = Math.max(1, Math.min(365, parseInt(req.query.days, 10) || 30))
    const cutoff = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)
    const rows = getDB().prepare(`
      SELECT a.id as attendance_id, a.cert_expires_at, a.score,
        t.id as session_id, t.title, t.category,
        s.id as staff_id, s.full_name, s.phone,
        d.name as dept_name, d.color_class as dept_color
      FROM training_attendances a
      JOIN training_sessions t ON t.id = a.session_id
      JOIN staff s ON s.id = a.staff_id
      LEFT JOIN departments d ON d.id = s.department_id
      WHERE a.cert_expires_at IS NOT NULL
        AND a.cert_expires_at <= ?
        AND a.attended = 1
        AND s.is_active = 1
      ORDER BY a.cert_expires_at
    `).all(cutoff)
    res.json(rows)
  } catch (e) { console.error('[safety/expiring]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Personelin sertifika geçmişi
safetyRouter.get('/staff/:id/training', ...view, (req, res) => {
  try {
    const rows = getDB().prepare(`
      SELECT a.id as attendance_id, a.attended, a.score, a.cert_expires_at,
        t.id as session_id, t.title, t.category, t.session_date
      FROM training_attendances a
      JOIN training_sessions t ON t.id = a.session_id
      WHERE a.staff_id = ?
      ORDER BY t.session_date DESC
    `).all(+req.params.id)
    res.json(rows)
  } catch (e) { console.error('[safety/staff-training]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── IG3: KKD zimmet CRUD ──
safetyRouter.get('/kkd', ...view, (req, res) => {
  try {
    const db = getDB()
    let q = `
      SELECT k.*, s.full_name, s.tc_no, d.name as dept_name
      FROM kkd_assignments k
      JOIN staff s ON s.id = k.staff_id
      LEFT JOIN departments d ON d.id = s.department_id
      WHERE 1=1
    `
    const params = []
    if (req.query.staff_id) { q += ' AND k.staff_id = ?'; params.push(+req.query.staff_id) }
    if (req.query.active === '1') q += ' AND k.returned_at IS NULL'
    if (req.query.active === '0') q += ' AND k.returned_at IS NOT NULL'
    q += ' ORDER BY k.assigned_at DESC LIMIT 200'
    res.json(db.prepare(q).all(...params))
  } catch (e) { console.error('[safety/kkd-list]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

safetyRouter.post('/kkd', ...mgr, (req, res) => {
  try {
    const { staff_id, item_type, size, serial_no, notes } = req.body || {}
    if (!staff_id || !item_type) return res.status(400).json({ error: 'staff_id ve item_type gerekli' })
    const id = getDB().prepare(`
      INSERT INTO kkd_assignments(staff_id, item_type, size, serial_no, notes, assigned_by)
      VALUES(?,?,?,?,?,?)
    `).run(+staff_id, item_type, size || null, serial_no || null, notes || null, req.user.id).lastInsertRowid
    logAudit(req.user.id, 'kkd_assign', 'safety', id, `${item_type} → staff:${staff_id}`)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

safetyRouter.post('/kkd/:id/return', ...mgr, (req, res) => {
  try {
    const db = getDB()
    const existing = db.prepare('SELECT returned_at FROM kkd_assignments WHERE id=?').get(+req.params.id)
    if (!existing) return res.status(404).json({ error: 'Bulunamadı' })
    if (existing.returned_at) return res.status(400).json({ error: 'Zaten iade edildi' })
    db.prepare(`
      UPDATE kkd_assignments
      SET returned_at = CURRENT_TIMESTAMP, returned_by = ?, condition_on_return = ?
      WHERE id = ?
    `).run(req.user.id, req.body?.condition || null, +req.params.id)
    logAudit(req.user.id, 'kkd_return', 'safety', +req.params.id, req.body?.condition || '')
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

safetyRouter.delete('/kkd/:id', ...mgr, (req, res) => {
  try { getDB().prepare('DELETE FROM kkd_assignments WHERE id=?').run(+req.params.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})
