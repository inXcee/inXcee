import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { upload } from '../../shared/uploads/middleware.js'
import * as svc from './service.js'

export const maintenanceRouter = Router()
const techAccess = requireRole('campus_manager', 'shift_supervisor', 'technical')

// ── Requests ─────────────────────────────────────────────────────────────────

maintenanceRouter.post('/requests', ...techAccess, upload.single('photo_before'), (req, res) => {
  try {
    const { location, description, priority } = req.body
    if (!location || location.trim().length < 2) return res.status(400).json({ error: 'Konum gerekli' })
    if (!description || description.trim().length < 5) return res.status(400).json({ error: 'Açıklama en az 5 karakter olmalı' })
    if (priority && !['high', 'medium', 'low'].includes(priority)) return res.status(400).json({ error: 'Geçersiz öncelik' })
    const photoBefore = req.file ? `/uploads/${req.file.filename}` : null
    const id = svc.createRequestService({
      location: location.trim(),
      description: description.trim(),
      priority: priority || 'medium',
      reporterUserId: req.user.id,
      photoBefore,
      waitReason: req.body.wait_reason || null,
    })
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

maintenanceRouter.get('/requests', ...techAccess, (req, res) => {
  res.json(svc.getRequestsService(req.query))
})

maintenanceRouter.get('/requests/:id', ...techAccess, (req, res) => {
  const r = svc.getRequestByIdService(+req.params.id)
  if (!r) return res.status(404).json({ error: 'Bulunamadı' })
  res.json(r)
})

maintenanceRouter.patch('/requests/:id/wait-reason', ...techAccess, (req, res) => {
  svc.updateWaitReasonService(+req.params.id, req.body.wait_reason)
  res.json({ ok: true })
})

maintenanceRouter.patch('/requests/:id/priority', ...techAccess, (req, res) => {
  svc.updateRequestPriorityService(+req.params.id, req.body.priority)
  res.json({ ok: true })
})

maintenanceRouter.patch('/requests/:id/close', ...techAccess, upload.single('photo'), (req, res) => {
  const photoUrl = req.file ? `/uploads/${req.file.filename}` : req.body.photo_url || null
  svc.closeRequestService(+req.params.id, photoUrl)
  res.json({ ok: true })
})

maintenanceRouter.patch('/requests/:id/reopen', ...techAccess, (req, res) => {
  svc.reopenRequestService(+req.params.id)
  res.json({ ok: true })
})

maintenanceRouter.delete('/requests/:id', ...requireRole('campus_manager'), (req, res) => {
  svc.deleteRequestService(+req.params.id)
  res.json({ ok: true })
})

// ── Stats ────────────────────────────────────────────────────────────────────

maintenanceRouter.get('/stats', ...techAccess, (req, res) => {
  res.json(svc.getStatsService())
})

// ── Location suggestions ────────────────────────────────────────────────────

maintenanceRouter.get('/location-suggestions', ...techAccess, (req, res) => {
  res.json(svc.getLocationSuggestionsService())
})

// ── Technicians ──────────────────────────────────────────────────────────────

maintenanceRouter.get('/technicians', ...techAccess, (req, res) => {
  res.json(svc.getTechniciansService())
})

maintenanceRouter.get('/technicians/available', ...techAccess, (req, res) => {
  res.json(svc.getAvailableTechniciansService())
})

maintenanceRouter.post('/technicians', ...requireRole('campus_manager', 'technical'), (req, res) => {
  try {
    const id = svc.createTechnicianService(req.body.full_name, req.body.phone, req.body.specialty, req.body.shift)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

maintenanceRouter.put('/technicians/:id', ...requireRole('campus_manager', 'technical'), (req, res) => {
  svc.updateTechnicianService(+req.params.id, req.body)
  res.json({ ok: true })
})

maintenanceRouter.delete('/technicians/:id', ...requireRole('campus_manager', 'technical'), (req, res) => {
  svc.deleteTechnicianService(+req.params.id)
  res.json({ ok: true })
})

// ── Comments ─────────────────────────────────────────────────────────────────

maintenanceRouter.get('/requests/:id/comments', ...techAccess, (req, res) => {
  res.json(svc.getCommentsService(+req.params.id))
})

maintenanceRouter.post('/requests/:id/comments', ...techAccess, upload.single('photo'), (req, res) => {
  const photoUrl = req.file ? `/uploads/${req.file.filename}` : null
  const id = svc.addCommentService(+req.params.id, req.user.id, req.body.comment, photoUrl)
  res.status(201).json({ id })
})
