import { Router } from 'express'
import { requireRole, requireAuth } from '../../shared/auth/middleware.js'
import { getDB } from '../../shared/db/index.js'
import { logAudit } from '../../shared/audit.js'
import { evaluateRule, evaluateAllActive } from './evaluator.js'

export const automationRouter = Router()
const mgmt = requireRole('campus_manager')

const VALID_TRIGGERS = ['occupancy_high', 'contract_expiring', 'maintenance_backlog', 'drill_overdue', 'no_recent_drill', 'access_overdue_inside']
const VALID_ACTIONS = ['log', 'notify_group']

automationRouter.get('/', requireAuth, (req, res) => {
  const db = getDB()
  const rows = db.prepare(`
    SELECT r.*, g.name AS action_target_name
    FROM automation_rules r
    LEFT JOIN notification_groups g ON g.id=r.action_target AND r.action_type='notify_group'
    ORDER BY r.is_active DESC, r.name
  `).all()
  res.json(rows)
})

automationRouter.post('/', ...mgmt, (req, res) => {
  const b = req.body || {}
  if (!b.name || b.name.trim().length < 2) return res.status(400).json({ error: 'Kural adi gerekli' })
  if (!VALID_TRIGGERS.includes(b.trigger_type)) return res.status(400).json({ error: 'Gecersiz trigger' })
  if (!VALID_ACTIONS.includes(b.action_type)) return res.status(400).json({ error: 'Gecersiz action' })
  if (b.trigger_threshold == null || isNaN(+b.trigger_threshold)) return res.status(400).json({ error: 'Esik degeri gerekli' })
  const db = getDB()
  const r = db.prepare(`
    INSERT INTO automation_rules (name, trigger_type, trigger_threshold, action_type, action_target, cooldown_hours, is_active, created_by)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(
    b.name.trim(), b.trigger_type, +b.trigger_threshold,
    b.action_type, b.action_target || null,
    b.cooldown_hours ?? 24, b.is_active === false ? 0 : 1,
    req.user.id
  )
  logAudit(req.user.id, 'automation_create', 'automation_rules', r.lastInsertRowid, b.name)
  res.status(201).json({ id: r.lastInsertRowid })
})

automationRouter.put('/:id', ...mgmt, (req, res) => {
  const b = req.body || {}
  const db = getDB()
  db.prepare(`
    UPDATE automation_rules
    SET name=?, trigger_type=?, trigger_threshold=?, action_type=?, action_target=?,
        cooldown_hours=?, is_active=?
    WHERE id=?
  `).run(
    b.name, b.trigger_type, +b.trigger_threshold, b.action_type,
    b.action_target || null, b.cooldown_hours ?? 24,
    b.is_active === false ? 0 : 1, +req.params.id
  )
  res.json({ ok: true })
})

automationRouter.delete('/:id', ...mgmt, (req, res) => {
  const db = getDB()
  const r = db.prepare('DELETE FROM automation_rules WHERE id=?').run(+req.params.id)
  if (r.changes === 0) return res.status(404).json({ error: 'Bulunamadi' })
  res.json({ ok: true })
})

automationRouter.post('/:id/test', ...mgmt, (req, res) => {
  const db = getDB()
  const rule = db.prepare('SELECT * FROM automation_rules WHERE id=?').get(+req.params.id)
  if (!rule) return res.status(404).json({ error: 'Bulunamadi' })
  const result = evaluateRule(rule)
  res.json(result)
})

automationRouter.post('/evaluate-all', ...mgmt, (req, res) => {
  res.json(evaluateAllActive())
})
