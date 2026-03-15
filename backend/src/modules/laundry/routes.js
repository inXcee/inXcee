import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import * as svc from './service.js'

export const laundryRouter = Router()
const laundryAccess = requireRole('campus_manager', 'laundry')

laundryRouter.post('/bags/generate', ...laundryAccess, (req, res) => {
  try {
    const { room_id } = req.body
    const bag = svc.generateBagService(room_id)
    res.status(201).json(bag)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.post('/bags/collect', ...laundryAccess, (req, res) => {
  try {
    const { qr_code } = req.body
    const bag = svc.collectBagService(qr_code, req.user.id)
    res.json(bag)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.post('/machines/:id/load', ...laundryAccess, (req, res) => {
  try {
    const { bag_ids, block } = req.body
    svc.loadMachineService(+req.params.id, bag_ids, block, req.user.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.post('/machines/:id/finish', ...laundryAccess, (req, res) => {
  try {
    svc.finishWashService(+req.params.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.get('/distribution-route', ...laundryAccess, (req, res) => {
  res.json(svc.getDistributionRouteService())
})

laundryRouter.post('/bags/:id/distribute', ...laundryAccess, (req, res) => {
  try {
    svc.distributeBagService(+req.params.id, req.body.damage_note)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})
