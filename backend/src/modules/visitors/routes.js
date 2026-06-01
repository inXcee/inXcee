import { Router } from 'express'
import { requireRole, requireAuth } from '../../shared/auth/middleware.js'
import * as q from './queries.js'
import { logAudit } from '../../shared/audit.js'
import { validate } from '../../shared/middleware/validate.js'
import { createVisitorSchema } from './schemas.js'

export const visitorsRouter = Router()
const mgmt = requireRole('campus_manager', 'shift_supervisor')

visitorsRouter.get('/', requireAuth, (req, res) => {
  res.json(q.listVisitors({ active: req.query.active }))
})

visitorsRouter.get('/stats', requireAuth, (req, res) => {
  res.json(q.getVisitorStats())
})

visitorsRouter.post('/', ...mgmt, validate(createVisitorSchema), (req, res) => {
  try {
    const id = q.createVisitor(req.validated, req.user.id)
    logAudit(req.user.id, 'visitor_checkin', 'visitors', id, req.validated.full_name)
    res.status(201).json({ id })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

visitorsRouter.post('/:id/checkout', ...mgmt, (req, res) => {
  const ok = q.checkOutVisitor(+req.params.id)
  if (!ok) return res.status(404).json({ error: 'Ziyaretçi bulunamadı veya zaten çıkmış' })
  logAudit(req.user.id, 'visitor_checkout', 'visitors', +req.params.id, null)
  res.json({ ok: true })
})
