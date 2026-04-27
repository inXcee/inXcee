import { Router } from 'express'
import { requireRole } from '../../../shared/auth/middleware.js'
import * as service from './service.js'

export const suppliersRouter = Router()
const mgr = requireRole('campus_manager', 'shift_supervisor')

suppliersRouter.get('/', ...mgr, (req, res) => {
  try { res.json(service.list(req.query.active === '1')) }
  catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatasi' }) }
})

suppliersRouter.get('/:id', ...mgr, (req, res) => {
  try {
    const s = service.get(+req.params.id)
    if (!s) return res.status(404).json({ error: 'Bulunamadi' })
    res.json(s)
  } catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatasi' }) }
})

suppliersRouter.post('/', ...mgr, (req, res) => {
  try { res.status(201).json({ id: service.create(req.body, req.user.id) }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

suppliersRouter.put('/:id', ...mgr, (req, res) => {
  try { service.update(+req.params.id, req.body, req.user.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

suppliersRouter.delete('/:id', ...mgr, (req, res) => {
  try { service.remove(+req.params.id, req.user.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

suppliersRouter.get('/:id/price-history', ...mgr, (req, res) => {
  try { res.json(service.priceHistory(+req.params.id, req.query.item_id ? +req.query.item_id : null)) }
  catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatasi' }) }
})

suppliersRouter.get('/:id/scorecard', ...mgr, (req, res) => {
  try { res.json(service.scorecard(+req.params.id)) }
  catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatasi' }) }
})
