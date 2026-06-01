import { Router } from 'express'
import { requireRole, requireAuth } from '../../shared/auth/middleware.js'
import { getDB } from '../../shared/db/index.js'
import { logAudit } from '../../shared/audit.js'
import { evaluateRule, evaluateAllActive } from './evaluator.js'
import { validate } from '../../shared/middleware/validate.js'
import { ruleSchema } from './schemas.js'

export const automationRouter = Router()
const mgmt = requireRole('campus_manager')

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

automationRouter.post('/', ...mgmt, validate(ruleSchema), (req, res) => {
  const b = req.validated
  const db = getDB()
  const r = db.prepare(`
    INSERT INTO automation_rules (name, trigger_type, trigger_threshold, action_type, action_target, cooldown_hours, is_active, created_by)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(
    b.name, b.trigger_type, b.trigger_threshold,
    b.action_type, b.action_target || null,
    b.cooldown_hours ?? 24, b.is_active === false ? 0 : 1,
    req.user.id
  )
  logAudit(req.user.id, 'automation_create', 'automation_rules', r.lastInsertRowid, b.name)
  res.status(201).json({ id: r.lastInsertRowid })
})

automationRouter.put('/:id', ...mgmt, validate(ruleSchema), (req, res) => {
  const b = req.validated
  const db = getDB()
  db.prepare(`
    UPDATE automation_rules
    SET name=?, trigger_type=?, trigger_threshold=?, action_type=?, action_target=?,
        cooldown_hours=?, is_active=?
    WHERE id=?
  `).run(
    b.name, b.trigger_type, b.trigger_threshold, b.action_type,
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
