import { Router } from 'express'
import { requireRole, requireAuth } from '../../shared/auth/middleware.js'
import { getDB } from '../../shared/db/index.js'
import { logAudit } from '../../shared/audit.js'

export const drillsRouter = Router()
const mgmt = requireRole('campus_manager', 'shift_supervisor')

const VALID_TYPES = ['fire', 'earthquake', 'security', 'evacuation', 'other']

drillsRouter.get('/', requireAuth, (req, res) => {
  const db = getDB()
  const rows = db.prepare(`
    SELECT d.*, u.full_name AS created_by_name
    FROM drills d LEFT JOIN users u ON u.id=d.created_by
    ORDER BY d.drill_date DESC LIMIT 200
  `).all()
  res.json(rows)
})

drillsRouter.get('/stats', requireAuth, (req, res) => {
  const db = getDB()
  const stats = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN date(drill_date) >= date('now', '-365 days') THEN 1 ELSE 0 END) AS last_year,
      MAX(drill_date) AS last_drill,
      (SELECT next_drill_date FROM drills WHERE next_drill_date IS NOT NULL ORDER BY drill_date DESC LIMIT 1) AS upcoming
    FROM drills
  `).get()
  res.json(stats)
})

drillsRouter.post('/', ...mgmt, (req, res) => {
  const b = req.body || {}
  if (!VALID_TYPES.includes(b.drill_type)) return res.status(400).json({ error: 'Geçersiz tatbikat tipi' })
  if (!b.drill_date) return res.status(400).json({ error: 'Tarih gerekli' })
  if (b.actual_count != null && b.actual_count < 0) return res.status(400).json({ error: 'Geçersiz katılım sayısı' })
  const db = getDB()
  const r = db.prepare(`
    INSERT INTO drills (drill_type, drill_date, expected_count, actual_count, duration_minutes,
      missing_names, findings, next_action, next_drill_date, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(
    b.drill_type, b.drill_date,
    b.expected_count ?? null, b.actual_count ?? null, b.duration_minutes ?? null,
    b.missing_names || null, b.findings || null, b.next_action || null, b.next_drill_date || null,
    req.user.id
  )
  logAudit(req.user.id, 'drill_create', 'drills', r.lastInsertRowid, `${b.drill_type} ${b.drill_date}`)
  res.status(201).json({ id: r.lastInsertRowid })
})

drillsRouter.delete('/:id', ...mgmt, (req, res) => {
  const db = getDB()
  const r = db.prepare('DELETE FROM drills WHERE id=?').run(+req.params.id)
  if (r.changes === 0) return res.status(404).json({ error: 'Bulunamadı' })
  logAudit(req.user.id, 'drill_delete', 'drills', +req.params.id, null)
  res.json({ ok: true })
})
