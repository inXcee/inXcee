import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { logAudit } from '../../shared/audit.js'
import { getDB } from '../../shared/db/index.js'

export const performanceRouter = Router()
const mgr = requireRole('campus_manager', 'shift_supervisor')
const view = requireRole('campus_manager', 'shift_supervisor')

const REVIEW_FIELDS = ['productivity', 'teamwork', 'attendance', 'attitude', 'skills', 'initiative', 'reliability', 'communication']

function calcTotal(body) {
  let sum = 0, count = 0
  REVIEW_FIELDS.forEach(f => {
    if (body[f] != null) { sum += +body[f]; count++ }
  })
  return count > 0 ? Math.round((sum / count) * 100) / 100 : null
}

// ── PE1: Değerlendirme CRUD ──
performanceRouter.get('/reviews', ...view, (req, res) => {
  try {
    const db = getDB()
    let q = `
      SELECT pr.id, pr.staff_id, pr.period, pr.total_score, pr.reviewed_at,
        s.full_name, d.name as dept_name
      FROM performance_reviews pr
      JOIN staff s ON s.id = pr.staff_id
      LEFT JOIN departments d ON d.id = s.department_id
      WHERE 1=1
    `
    const params = []
    if (req.query.period) { q += ' AND pr.period = ?'; params.push(req.query.period) }
    if (req.query.staff_id) { q += ' AND pr.staff_id = ?'; params.push(+req.query.staff_id) }
    q += ' ORDER BY pr.reviewed_at DESC LIMIT 200'
    res.json(db.prepare(q).all(...params))
  } catch (e) { console.error('[perf/list]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

performanceRouter.get('/reviews/:id', ...view, (req, res) => {
  try {
    const db = getDB()
    const r = db.prepare(`
      SELECT pr.*, s.full_name, d.name as dept_name
      FROM performance_reviews pr
      JOIN staff s ON s.id = pr.staff_id
      LEFT JOIN departments d ON d.id = s.department_id
      WHERE pr.id = ?
    `).get(+req.params.id)
    if (!r) return res.status(404).json({ error: 'Bulunamadı' })
    res.json(r)
  } catch (e) { console.error('[perf/get]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

performanceRouter.post('/reviews', ...mgr, (req, res) => {
  try {
    const { staff_id, period } = req.body || {}
    if (!staff_id || !period) return res.status(400).json({ error: 'staff_id ve period gerekli' })
    if (!/^\d{4}(-Q[1-4])?$/.test(period)) return res.status(400).json({ error: 'period: YYYY veya YYYY-Q1 formatında' })

    const total = calcTotal(req.body)
    const cols = ['staff_id', 'period', ...REVIEW_FIELDS, 'strengths', 'improvement_areas', 'manager_notes', 'total_score', 'reviewed_by']
    const vals = [+staff_id, period, ...REVIEW_FIELDS.map(f => req.body[f] != null ? +req.body[f] : null),
                  req.body.strengths || null, req.body.improvement_areas || null, req.body.manager_notes || null,
                  total, req.user.id]
    const placeholders = cols.map(() => '?').join(',')

    try {
      const id = getDB().prepare(`INSERT INTO performance_reviews(${cols.join(',')}) VALUES(${placeholders})`).run(...vals).lastInsertRowid
      logAudit(req.user.id, 'perf_review_create', 'performance', id, `staff:${staff_id} ${period}`)
      res.status(201).json({ id, total_score: total })
    } catch (e) {
      if (e.message?.includes('UNIQUE')) {
        return res.status(409).json({ error: 'Bu dönem için değerlendirme zaten var' })
      }
      throw e
    }
  } catch (e) { res.status(400).json({ error: e.message }) }
})

performanceRouter.put('/reviews/:id', ...mgr, (req, res) => {
  try {
    const db = getDB()
    const fields = [...REVIEW_FIELDS, 'strengths', 'improvement_areas', 'manager_notes']
    const sets = []
    const params = []
    fields.forEach(f => {
      if (req.body[f] !== undefined) { sets.push(`${f}=?`); params.push(req.body[f] === '' ? null : req.body[f]) }
    })
    if (sets.length) {
      // total recalc
      const existing = db.prepare(`SELECT ${REVIEW_FIELDS.join(',')} FROM performance_reviews WHERE id=?`).get(+req.params.id)
      if (existing) {
        const merged = { ...existing, ...Object.fromEntries(REVIEW_FIELDS.filter(f => req.body[f] !== undefined).map(f => [f, req.body[f]])) }
        const total = calcTotal(merged)
        sets.push('total_score=?'); params.push(total)
      }
      params.push(+req.params.id)
      db.prepare(`UPDATE performance_reviews SET ${sets.join(',')} WHERE id=?`).run(...params)
    }
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

performanceRouter.delete('/reviews/:id', ...mgr, (req, res) => {
  try { getDB().prepare('DELETE FROM performance_reviews WHERE id=?').run(+req.params.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

// ── PE2: Hedef CRUD ──
performanceRouter.get('/goals', ...view, (req, res) => {
  try {
    const db = getDB()
    let q = `
      SELECT g.*, s.full_name, d.name as dept_name
      FROM performance_goals g
      JOIN staff s ON s.id = g.staff_id
      LEFT JOIN departments d ON d.id = s.department_id
      WHERE 1=1
    `
    const params = []
    if (req.query.staff_id) { q += ' AND g.staff_id = ?'; params.push(+req.query.staff_id) }
    if (req.query.status) { q += ' AND g.status = ?'; params.push(req.query.status) }
    q += ' ORDER BY g.target_date NULLS LAST, g.created_at DESC LIMIT 200'
    res.json(db.prepare(q).all(...params))
  } catch (e) { console.error('[perf/goals]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

performanceRouter.post('/goals', ...mgr, (req, res) => {
  try {
    const { staff_id, title, description, target_date } = req.body || {}
    if (!staff_id || !title) return res.status(400).json({ error: 'staff_id ve title gerekli' })
    const id = getDB().prepare(`
      INSERT INTO performance_goals(staff_id, title, description, target_date, created_by)
      VALUES(?,?,?,?,?)
    `).run(+staff_id, title, description || null, target_date || null, req.user.id).lastInsertRowid
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

performanceRouter.patch('/goals/:id', ...mgr, (req, res) => {
  try {
    const db = getDB()
    const fields = ['title', 'description', 'target_date', 'status', 'progress']
    const sets = []
    const params = []
    fields.forEach(f => {
      if (req.body[f] !== undefined) { sets.push(`${f}=?`); params.push(req.body[f] === '' ? null : req.body[f]) }
    })
    if (req.body.status === 'done' || req.body.status === 'cancelled') {
      sets.push("closed_at = CURRENT_TIMESTAMP")
    }
    if (!sets.length) return res.json({ ok: true })
    params.push(+req.params.id)
    db.prepare(`UPDATE performance_goals SET ${sets.join(',')} WHERE id=?`).run(...params)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

performanceRouter.delete('/goals/:id', ...mgr, (req, res) => {
  try { getDB().prepare('DELETE FROM performance_goals WHERE id=?').run(+req.params.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

// ── PE3: Pozitif puan ──
performanceRouter.post('/positive', ...mgr, (req, res) => {
  try {
    const { staff_id, reason, points = 1 } = req.body || {}
    if (!staff_id || !reason) return res.status(400).json({ error: 'staff_id ve reason gerekli' })
    const id = getDB().prepare(`
      INSERT INTO positive_points(staff_id, reason, points, created_by) VALUES(?,?,?,?)
    `).run(+staff_id, reason, +points, req.user.id).lastInsertRowid
    logAudit(req.user.id, 'positive_point', 'performance', id, `staff:${staff_id} +${points}`)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

performanceRouter.get('/positive/:staffId', ...view, (req, res) => {
  try {
    const db = getDB()
    const list = db.prepare(`
      SELECT * FROM positive_points WHERE staff_id = ? ORDER BY created_at DESC LIMIT 100
    `).all(+req.params.staffId)
    const total = list.reduce((s, p) => s + p.points, 0)
    res.json({ total, items: list })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

performanceRouter.delete('/positive/:id', ...mgr, (req, res) => {
  try { getDB().prepare('DELETE FROM positive_points WHERE id=?').run(+req.params.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

// Liderler tablosu — toplam pozitif puana göre
performanceRouter.get('/leaderboard', ...view, (req, res) => {
  try {
    const days = Math.max(1, Math.min(365, parseInt(req.query.days, 10) || 90))
    const rows = getDB().prepare(`
      SELECT s.id, s.full_name, d.name as dept_name,
        COALESCE(SUM(pp.points), 0) as positive_points,
        COUNT(pp.id) as positive_count
      FROM staff s
      LEFT JOIN departments d ON d.id = s.department_id
      LEFT JOIN positive_points pp ON pp.staff_id = s.id AND pp.created_at >= date('now', '-' || ? || ' days')
      WHERE s.is_active = 1
      GROUP BY s.id
      HAVING positive_points > 0
      ORDER BY positive_points DESC
      LIMIT 30
    `).all(days)
    res.json(rows)
  } catch (e) { console.error('[perf/leaderboard]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})
