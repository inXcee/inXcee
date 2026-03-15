import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import * as svc from './service.js'

export const capacityRouter = Router()
const mgmt = requireRole('campus_manager', 'shift_supervisor')

capacityRouter.get('/rooms', ...mgmt, (req, res) => {
  res.json(svc.getRoomsService(req.query))
})

capacityRouter.get('/rooms/:id/personnel', ...mgmt, (req, res) => {
  res.json(svc.getRoomPersonnelService(+req.params.id))
})

capacityRouter.get('/block/:block/personnel', ...mgmt, (req, res) => {
  res.json(svc.getBlockPersonnelService(req.params.block))
})

capacityRouter.patch('/rooms/:id/beds', ...requireRole('campus_manager'), (req, res) => {
  try {
    svc.updateActiveBedsService(+req.params.id, req.body.active_beds)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

capacityRouter.patch('/rooms/:id/status', ...requireRole('campus_manager'), (req, res) => {
  svc.updateRoomStatusService(+req.params.id, req.body.status)
  res.json({ ok: true })
})

capacityRouter.patch('/floor-supervisor', ...requireRole('campus_manager'), (req, res) => {
  svc.updateFloorSupervisorService(req.body.block, req.body.floor, req.body.user_id)
  res.json({ ok: true })
})

capacityRouter.post('/reassign', ...mgmt, (req, res) => {
  try {
    svc.reassignPersonnelService(req.body.personnel_id, req.body.room_id, req.user.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})
