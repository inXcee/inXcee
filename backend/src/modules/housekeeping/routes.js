import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import * as svc from './service.js'

export const housekeepingRouter = Router()
const hkAccess = requireRole('campus_manager', 'housekeeper')

housekeepingRouter.get('/tasks', ...hkAccess, (req, res) => {
  res.json(svc.getTasksService(req.query))
})

housekeepingRouter.post('/tasks/generate-daily', ...hkAccess, (req, res) => {
  const count = svc.generateDailyTasksService()
  res.status(201).json({ count })
})

housekeepingRouter.post('/tasks/:id/complete', ...hkAccess, (req, res) => {
  svc.completeTaskService(+req.params.id, req.user.id)
  res.json({ ok: true })
})

housekeepingRouter.get('/dnd-rooms', ...hkAccess, (req, res) => {
  res.json(svc.getDNDRoomsService())
})
