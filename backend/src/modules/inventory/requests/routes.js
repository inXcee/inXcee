import { Router } from 'express'
import { requireAuth, requireRole } from '../../../shared/auth/middleware.js'
import * as service from './service.js'

export const requestsRouter = Router()
const mgr = requireRole('campus_manager', 'shift_supervisor')

// listele — yetkililer hepsini, diger personel sadece kendi taleplerini
requestsRouter.get('/', requireAuth, (req, res) => {
  try {
    const isMgr = req.user.role === 'campus_manager' || req.user.role === 'shift_supervisor'
    const opts = {}
    if (req.query.status) opts.status = req.query.status
    if (!isMgr) opts.requesterId = req.user.id
    res.json(service.list(opts))
  } catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatasi' }) }
})

// olustur — login olan herkes (kendi talebi)
requestsRouter.post('/', requireAuth, (req, res) => {
  try { res.status(201).json({ id: service.create(req.body, req.user.id) }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

requestsRouter.patch('/:id/approve', ...mgr, (req, res) => {
  try { service.approve(+req.params.id, req.user.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

requestsRouter.patch('/:id/reject', ...mgr, (req, res) => {
  try { service.reject(+req.params.id, req.body.reason, req.user.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

requestsRouter.post('/:id/fulfill', ...mgr, (req, res) => {
  try { res.json(service.fulfill(+req.params.id, +req.body.staff_id, req.user.id)) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

requestsRouter.post('/:id/cancel', requireAuth, (req, res) => {
  try { service.cancel(+req.params.id, req.user.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})
