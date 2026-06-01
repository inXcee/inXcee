import { Router } from 'express'
import { requireRole } from '../../../shared/auth/middleware.js'
import { validate } from '../../../shared/middleware/validate.js'
import { createSupplierSchema } from '../schemas.js'
import * as service from './service.js'
import { logger } from '../../../shared/logger.js'

export const suppliersRouter = Router()
const mgr = requireRole('campus_manager', 'shift_supervisor')

suppliersRouter.get('/', ...mgr, (req, res) => {
  try { res.json(service.list(req.query.active === '1')) }
  catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatasi' }) }
})

suppliersRouter.get('/:id', ...mgr, (req, res) => {
  try {
    const s = service.get(+req.params.id)
    if (!s) return res.status(404).json({ error: 'Bulunamadi' })
    res.json(s)
  } catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatasi' }) }
})

suppliersRouter.post('/', ...mgr, validate(createSupplierSchema), (req, res) => {
  try { res.status(201).json({ id: service.create(req.validated, req.user.id) }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

suppliersRouter.put('/:id', ...mgr, validate(createSupplierSchema), (req, res) => {
  try { service.update(+req.params.id, req.validated, req.user.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

suppliersRouter.delete('/:id', ...mgr, (req, res) => {
  try { service.remove(+req.params.id, req.user.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

suppliersRouter.get('/:id/price-history', ...mgr, (req, res) => {
  try { res.json(service.priceHistory(+req.params.id, req.query.item_id ? +req.query.item_id : null)) }
  catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatasi' }) }
})

suppliersRouter.get('/:id/scorecard', ...mgr, (req, res) => {
  try { res.json(service.scorecard(+req.params.id)) }
  catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatasi' }) }
})
