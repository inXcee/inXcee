import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { logAudit } from '../../shared/audit.js'
import { getDB } from '../../shared/db/index.js'
import { logger } from '../../shared/logger.js'
import { validate } from '../../shared/middleware/validate.js'
import { createSessionSchema, updateSessionSchema, createKkdSchema, kkdReturnSchema, createIncidentSchema, updateIncidentSchema } from './schemas.js'
import { createNotification } from '../../shared/notifications/service.js'
import { EVENT_KINDS } from '../../shared/notifications/events.js'

export const safetyRouter = Router()
const mgr = requireRole('campus_manager', 'shift_supervisor')
const view = requireRole('campus_manager', 'shift_supervisor', 'technical')

// ── İSG olay/kaza takibi ──
const INCIDENT_TYPE_TR = { injury: 'Yaralanma', near_miss: 'Ramak kala', property_damage: 'Maddi hasar', environmental: 'Çevresel', other: 'Diğer' }

safetyRouter.get('/incidents', ...view, (req, res) => {
  try {
    const db = getDB()
    let q = `
      SELECT si.*, s.full_name AS staff_name, u.username AS reported_by_name
      FROM safety_incidents si
      LEFT JOIN staff s ON s.id = si.staff_id
      LEFT JOIN users u ON u.id = si.reported_by
      WHERE 1=1`
    const params = []
    if (req.query.status) { q += ' AND si.status = ?'; params.push(String(req.query.status)) }
    if (req.query.type) { q += ' AND si.incident_type = ?'; params.push(String(req.query.type)) }
    q += ' ORDER BY si.occurred_at DESC LIMIT 200'
    res.json(db.prepare(q).all(...params))
  } catch (e) { logger.error('[safety/incidents]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

safetyRouter.post('/incidents', ...mgr, validate(createIncidentSchema), (req, res) => {
  try {
    const db = getDB()
    const v = req.validated
    const id = db.prepare(`
      INSERT INTO safety_incidents(occurred_at, location, incident_type, severity, description, staff_id, actions_taken, reported_by)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(v.occurred_at, v.location || null, v.incident_type, v.severity, v.description,
      v.staff_id || null, v.actions_taken || null, req.user.id).lastInsertRowid
    // Ciddi olaylar (major/critical) yönetime anında bildirilir.
    if (v.severity === 'major' || v.severity === 'critical') {
      try {
        createNotification({
          message: `🚨 İSG olayı (${INCIDENT_TYPE_TR[v.incident_type] || v.incident_type}, ${v.severity}): ${v.description.slice(0, 120)}`,
          event_kind: EVENT_KINDS.SAFETY_INCIDENT,
          target_role: 'campus_manager',
          entity_type: 'safety_incident', entity_id: id,
        })
      } catch (e) { logger.warn('[safety/incidents] bildirim:', e.message) }
    }
    logAudit(req.user.id, 'safety_incident_create', 'safety', id, `${v.incident_type}/${v.severity}`)
    res.status(201).json({ id })
  } catch (e) { logger.error('[safety/incidents]', e); res.status(400).json({ error: e.message }) }
})

safetyRouter.patch('/incidents/:id', ...mgr, validate(updateIncidentSchema), (req, res) => {
  try {
    const db = getDB()
    const r = db.prepare('SELECT * FROM safety_incidents WHERE id = ?').get(+req.params.id)
    if (!r) return res.status(404).json({ error: 'Olay bulunamadı' })
    const v = req.validated
    const closing = v.status === 'closed' && r.status !== 'closed'
    db.prepare(`
      UPDATE safety_incidents SET
        status = COALESCE(?, status),
        actions_taken = COALESCE(?, actions_taken),
        severity = COALESCE(?, severity),
        location = COALESCE(?, location),
        description = COALESCE(?, description),
        closed_at = CASE WHEN ? THEN datetime('now') ELSE closed_at END,
        closed_by = CASE WHEN ? THEN ? ELSE closed_by END
      WHERE id = ?
    `).run(v.status ?? null, v.actions_taken ?? null, v.severity ?? null, v.location ?? null,
      v.description ?? null, closing ? 1 : 0, closing ? 1 : 0, req.user.id, r.id)
    logAudit(req.user.id, 'safety_incident_update', 'safety', r.id, v.status || 'edit')
    res.json({ ok: true })
  } catch (e) { logger.error('[safety/incidents]', e); res.status(400).json({ error: e.message }) }
})

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
  } catch (e) { logger.error('[safety/list]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
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
  } catch (e) { logger.error('[safety/get]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

safetyRouter.post('/sessions', ...mgr, validate(createSessionSchema), (req, res) => {
  try {
    const { title, category, session_date, duration_min, location, instructor, notes } = req.validated
    const id = getDB().prepare(`
      INSERT INTO training_sessions(title, category, session_date, duration_min, location, instructor, notes, created_by)
      VALUES(?,?,?,?,?,?,?,?)
    `).run(title, category, session_date, duration_min || 60, location || null, instructor || null, notes || null, req.user.id).lastInsertRowid
    logAudit(req.user.id, 'training_session_create', 'safety', id, `${title} ${session_date}`)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

safetyRouter.put('/sessions/:id', ...mgr, validate(updateSessionSchema), (req, res) => {
  try {
    const db = getDB()
    const fields = ['title', 'category', 'session_date', 'duration_min', 'location', 'instructor', 'notes', 'status']
    const sets = []
    const params = []
    fields.forEach(f => {
      if (req.validated[f] !== undefined) { sets.push(`${f}=?`); params.push(req.validated[f] === '' ? null : req.validated[f]) }
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
  } catch (e) { logger.error('[safety/expiring]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
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
  } catch (e) { logger.error('[safety/staff-training]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
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
  } catch (e) { logger.error('[safety/kkd-list]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

safetyRouter.post('/kkd', ...mgr, validate(createKkdSchema), (req, res) => {
  try {
    const { staff_id, item_type, size, serial_no, notes } = req.validated
    const id = getDB().prepare(`
      INSERT INTO kkd_assignments(staff_id, item_type, size, serial_no, notes, assigned_by)
      VALUES(?,?,?,?,?,?)
    `).run(staff_id, item_type, size || null, serial_no || null, notes || null, req.user.id).lastInsertRowid
    logAudit(req.user.id, 'kkd_assign', 'safety', id, `${item_type} → staff:${staff_id}`)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

safetyRouter.post('/kkd/:id/return', ...mgr, validate(kkdReturnSchema), (req, res) => {
  try {
    const db = getDB()
    const existing = db.prepare('SELECT returned_at FROM kkd_assignments WHERE id=?').get(+req.params.id)
    if (!existing) return res.status(404).json({ error: 'Bulunamadı' })
    if (existing.returned_at) return res.status(400).json({ error: 'Zaten iade edildi' })
    db.prepare(`
      UPDATE kkd_assignments
      SET returned_at = CURRENT_TIMESTAMP, returned_by = ?, condition_on_return = ?
      WHERE id = ?
    `).run(req.user.id, req.validated.condition || null, +req.params.id)
    logAudit(req.user.id, 'kkd_return', 'safety', +req.params.id, req.validated.condition || '')
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

safetyRouter.delete('/kkd/:id', ...mgr, (req, res) => {
  try { getDB().prepare('DELETE FROM kkd_assignments WHERE id=?').run(+req.params.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Uyumluluk özeti — dashboard widget için ──
// Aktif personel üzerinden 3 kritik metrik: süresi dolmuş sertifika,
// 30 gün içinde dolacak ve hiç eğitim almamış.
safetyRouter.get('/compliance-summary', ...view, (req, res) => {
  try {
    const db = getDB()
    const today = new Date().toISOString().slice(0, 10)
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
    const year_ago = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10)

    // Sertifikası süresi dolmuş aktif personel (en güncel cert_expires_at per staff)
    const expired = db.prepare(`
      SELECT COUNT(DISTINCT a.staff_id) as cnt
      FROM training_attendances a
      JOIN staff s ON s.id = a.staff_id
      WHERE s.is_active = 1
        AND a.attended = 1
        AND a.cert_expires_at IS NOT NULL
        AND a.cert_expires_at < ?
        AND a.cert_expires_at = (
          SELECT MAX(a2.cert_expires_at)
          FROM training_attendances a2
          WHERE a2.staff_id = a.staff_id
            AND a2.cert_expires_at IS NOT NULL
        )
    `).get(today)

    // 30 gün içinde süresi dolacak (bugünden itibaren, süresi dolmamış)
    const expiring_soon = db.prepare(`
      SELECT COUNT(DISTINCT a.staff_id) as cnt
      FROM training_attendances a
      JOIN staff s ON s.id = a.staff_id
      WHERE s.is_active = 1
        AND a.attended = 1
        AND a.cert_expires_at IS NOT NULL
        AND a.cert_expires_at >= ?
        AND a.cert_expires_at <= ?
        AND a.cert_expires_at = (
          SELECT MAX(a2.cert_expires_at)
          FROM training_attendances a2
          WHERE a2.staff_id = a.staff_id
            AND a2.cert_expires_at IS NOT NULL
        )
    `).get(today, in30)

    // Hiç eğitim almamış veya son 1 yılda eğitim almamış aktif personel
    const untrained = db.prepare(`
      SELECT COUNT(*) as cnt
      FROM staff s
      WHERE s.is_active = 1
        AND NOT EXISTS (
          SELECT 1 FROM training_attendances a
          JOIN training_sessions ts ON ts.id = a.session_id
          WHERE a.staff_id = s.id
            AND a.attended = 1
            AND ts.session_date >= ?
        )
    `).get(year_ago)

    // KKD zimmetleri teslim edilmemiş (sadece sayı — detay KKD sayfasında)
    const kkd_outstanding = db.prepare(`
      SELECT COUNT(*) as cnt
      FROM kkd_assignments k
      JOIN staff s ON s.id = k.staff_id
      WHERE s.is_active = 1 AND k.returned_at IS NULL
    `).get()

    // Toplam aktif personel (oran hesabı için)
    const total_active = db.prepare(`SELECT COUNT(*) as cnt FROM staff WHERE is_active = 1`).get()

    res.json({
      expired_certs: expired.cnt,
      expiring_soon: expiring_soon.cnt,
      untrained_12m: untrained.cnt,
      kkd_outstanding: kkd_outstanding.cnt,
      total_active: total_active.cnt,
    })
  } catch (e) { logger.error('[safety/compliance-summary]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})
