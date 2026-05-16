import { Router } from 'express'
import { requireRole } from '../../../shared/auth/middleware.js'
import * as service from './service.js'

export const lotsRouter = Router()
const mgr = requireRole('campus_manager', 'shift_supervisor')

// Lot listesi: /api/inventory/items/:id/lots — ana inventory routes'tan mount edilir
export const lotsByItemHandler = (req, res) => {
  try { res.json(service.list(+req.params.id)) }
  catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatasi' }) }
}

lotsRouter.post('/', ...mgr, (req, res) => {
  try { res.status(201).json({ id: service.create(req.body, req.user.id) }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

lotsRouter.get('/expiring', ...mgr, (req, res) => {
  try { res.json(service.expiring(+req.query.days || 30)) }
  catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatasi' }) }
})

lotsRouter.patch('/:id/status', ...mgr, (req, res) => {
  try { res.json(service.setStatus(+req.params.id, req.body.status, req.user.id)) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

// Manuel: SKT gecmis lotlari toplu olarak expired isaretle (cron tetiklenir, manuel de cagrilabilir)
lotsRouter.post('/expire-past', ...mgr, (req, res) => {
  try { res.json({ updated: service.expirePastLots() }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})
