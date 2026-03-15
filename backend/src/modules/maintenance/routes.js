import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { upload } from '../../shared/uploads/middleware.js'
import * as svc from './service.js'

export const maintenanceRouter = Router()
const techAccess = requireRole('campus_manager', 'shift_supervisor', 'technical')

maintenanceRouter.post('/requests', ...techAccess, (req, res) => {
  try {
    const id = svc.createRequestService({
      location: req.body.location,
      description: req.body.description,
      reporterUserId: req.user.id,
      isPreventive: req.body.is_preventive || false
    })
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

maintenanceRouter.get('/requests', ...techAccess, (req, res) => {
  res.json(svc.getRequestsService(req.query))
})

maintenanceRouter.patch('/requests/:id/assign', ...requireRole('campus_manager', 'technical'), (req, res) => {
  svc.assignRequestService(+req.params.id, req.body.user_id || req.user.id)
  res.json({ ok: true })
})

maintenanceRouter.patch('/requests/:id/close', ...techAccess, upload.single('photo'), (req, res) => {
  const photoUrl = req.file ? `/uploads/${req.file.filename}` : req.body.photo_url || null
  svc.closeRequestService(+req.params.id, photoUrl)
  res.json({ ok: true })
})

maintenanceRouter.post('/preventive', ...requireRole('campus_manager'), (req, res) => {
  const count = svc.generatePreventiveTasksService()
  res.json({ count })
})
