import { Router } from 'express'
import { requireRole, requireAuth } from '../../shared/auth/middleware.js'
import * as svc from './service.js'

export const companiesRouter = Router()
const mgmt = requireRole('campus_manager', 'shift_supervisor')

companiesRouter.get('/', requireAuth, (req, res) => {
  res.json(svc.listService({ activeOnly: req.query.active === '1' }))
})

companiesRouter.get('/stats', requireAuth, (req, res) => {
  res.json(svc.statsService())
})

companiesRouter.get('/expiring', requireAuth, (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365)
  res.json(svc.expiringService(days))
})

companiesRouter.get('/:id', requireAuth, (req, res) => {
  const c = svc.getService(+req.params.id)
  if (!c) return res.status(404).json({ error: 'Firma bulunamadı' })
  res.json(c)
})

companiesRouter.post('/', ...mgmt, (req, res) => {
  const r = svc.createService(req.body, req.user.id)
  if (r.error) return res.status(r.status).json({ error: r.error })
  res.status(201).json(r)
})

companiesRouter.put('/:id', ...mgmt, (req, res) => {
  const r = svc.updateService(+req.params.id, req.body, req.user.id)
  if (r.error) return res.status(r.status).json({ error: r.error })
  res.json(r)
})

companiesRouter.delete('/:id', ...mgmt, (req, res) => {
  const r = svc.deleteService(+req.params.id, req.user.id)
  if (r.error) return res.status(r.status).json({ error: r.error })
  res.json(r)
})
