import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { upload, verifyMagicBytes } from '../../shared/uploads/middleware.js'
import { getDB } from '../../shared/db/index.js'
import { logAudit } from '../../shared/audit.js'
import { validate } from '../../shared/middleware/validate.js'
import {
  createRequestSchema, updatePrioritySchema, waitReasonSchema, assignSchema,
  updateStatusSchema, createTechnicianSchema, updateTechnicianSchema, addCommentSchema,
} from './schemas.js'
import * as svc from './service.js'
import { paginate } from '../../shared/paginate.js'
import { logger } from '../../shared/logger.js'

export const maintenanceRouter = Router()
const techAccess = requireRole('campus_manager', 'shift_supervisor', 'technical')

// ── Requests ─────────────────────────────────────────────────────────────────

maintenanceRouter.post('/requests', ...techAccess, upload.single('photo_before'), verifyMagicBytes, validate(createRequestSchema), (req, res) => {
  try {
    const { location, block, room_id, description, priority, wait_reason } = req.validated
    const photoBefore = req.file ? `/uploads/${req.file.filename}` : null
    const id = svc.createRequestService({
      location,
      block,
      roomId: room_id,
      description,
      priority,
      reporterUserId: req.user.id,
      photoBefore,
      waitReason: wait_reason || null,
    })
    logAudit(req.user.id, 'maintenance_create', 'maintenance', id, `${location}: ${description}`)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

maintenanceRouter.get('/requests', ...techAccess, (req, res) => {
  try {
    const query = { ...req.query }
    if (query.reporter_user_id === 'me') query.reporter_user_id = req.user.id
    if (query.assigned_user_id === 'me') query.assigned_user_id = req.user.id
    if (req.query.page || req.query.limit) {
      const { page, limit, offset } = paginate(req)
      const data = svc.getRequestsService({ ...query, _limit: limit, _offset: offset })
      const total = svc.countRequestsService(query)
      return res.json({ data, total, page, limit })
    }
    res.json(svc.getRequestsService(query))
  }
  catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

maintenanceRouter.get('/requests/:id', ...techAccess, (req, res) => {
  const r = svc.getRequestByIdService(+req.params.id)
  if (!r) return res.status(404).json({ error: 'Bulunamadı' })
  res.json(r)
})

maintenanceRouter.patch('/requests/:id/wait-reason', ...techAccess, validate(waitReasonSchema), (req, res) => {
  try { svc.updateWaitReasonService(+req.params.id, req.validated.wait_reason); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

maintenanceRouter.patch('/requests/:id/priority', ...techAccess, validate(updatePrioritySchema), (req, res) => {
  try {
    svc.updateRequestPriorityService(+req.params.id, req.validated.priority)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

maintenanceRouter.patch('/requests/:id/assign', ...techAccess, validate(assignSchema), (req, res) => {
  try {
    const { technician_id } = req.validated
    svc.assignRequestService(+req.params.id, technician_id, req.user.id)
    logAudit(req.user.id, 'maintenance_assign', 'maintenance', +req.params.id, `teknisyen:${technician_id}`)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

maintenanceRouter.patch('/requests/:id/start', ...techAccess, (req, res) => {
  try {
    svc.startRequestService(+req.params.id, req.user.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

maintenanceRouter.patch('/requests/:id/status', ...techAccess, validate(updateStatusSchema), (req, res) => {
  try {
    const { status } = req.validated
    svc.updateStatusService(+req.params.id, status, req.user.id)
    logAudit(req.user.id, 'maintenance_status_change', 'maintenance', +req.params.id, status)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

maintenanceRouter.patch('/requests/:id/close', ...techAccess, upload.single('photo'), verifyMagicBytes, (req, res) => {
  const photoUrl = req.file
    ? `/uploads/${req.file.filename}`
    : (req.body.photo_url?.startsWith('/uploads/') ? req.body.photo_url : null)
  svc.closeRequestService(+req.params.id, photoUrl)
  logAudit(req.user.id, 'maintenance_close', 'maintenance', +req.params.id, null)
  res.json({ ok: true })
})

maintenanceRouter.patch('/requests/:id/reopen', ...techAccess, (req, res) => {
  try { svc.reopenRequestService(+req.params.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

maintenanceRouter.delete('/requests/:id', ...requireRole('campus_manager'), (req, res) => {
  try {
    svc.deleteRequestService(+req.params.id)
    logAudit(req.user.id, 'maintenance_delete', 'maintenance', +req.params.id, null)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Stats ────────────────────────────────────────────────────────────────────

maintenanceRouter.get('/stats', ...techAccess, (req, res) => {
  try { res.json(svc.getStatsService()) }
  catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

// ── Location suggestions ────────────────────────────────────────────────────

maintenanceRouter.get('/location-suggestions', ...techAccess, (req, res) => {
  try { res.json(svc.getLocationSuggestionsService()) }
  catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

// ── Technicians ──────────────────────────────────────────────────────────────

maintenanceRouter.get('/technicians', ...techAccess, (req, res) => {
  try { res.json(svc.getTechniciansService()) }
  catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

maintenanceRouter.get('/technicians/available', ...techAccess, (req, res) => {
  try { res.json(svc.getAvailableTechniciansService()) }
  catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

maintenanceRouter.post('/technicians', ...requireRole('campus_manager', 'technical'), validate(createTechnicianSchema), (req, res) => {
  try {
    const { full_name, phone, specialty, shift } = req.validated
    const id = svc.createTechnicianService(full_name, phone, specialty, shift)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

maintenanceRouter.put('/technicians/:id', ...requireRole('campus_manager', 'technical'), validate(updateTechnicianSchema), (req, res) => {
  try { svc.updateTechnicianService(+req.params.id, req.validated); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

maintenanceRouter.delete('/technicians/:id', ...requireRole('campus_manager', 'technical'), (req, res) => {
  try { svc.deleteTechnicianService(+req.params.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Comments ─────────────────────────────────────────────────────────────────

maintenanceRouter.get('/requests/:id/comments', ...techAccess, (req, res) => {
  try { res.json(svc.getCommentsService(+req.params.id)) }
  catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

maintenanceRouter.post('/requests/:id/comments', ...techAccess, upload.single('photo'), verifyMagicBytes, validate(addCommentSchema), (req, res) => {
  try {
    const photoUrl = req.file ? `/uploads/${req.file.filename}` : null
    const id = svc.addCommentService(+req.params.id, req.user.id, req.validated.comment, photoUrl)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})
