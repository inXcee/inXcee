import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { upload, verifyMagicBytes } from '../../shared/uploads/middleware.js'
import { getDB } from '../../shared/db/index.js'
import * as svc from './service.js'

function paginate(req) {
  const page = Math.max(1, parseInt(req.query.page) || 1)
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50))
  const offset = (page - 1) * limit
  return { page, limit, offset }
}

export const maintenanceRouter = Router()
const techAccess = requireRole('campus_manager', 'shift_supervisor', 'technical')

// ── Requests ─────────────────────────────────────────────────────────────────

maintenanceRouter.post('/requests', ...techAccess, upload.single('photo_before'), verifyMagicBytes, (req, res) => {
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
  try {
    if (req.query.page || req.query.limit) {
      const { page, limit, offset } = paginate(req)
      const db = getDB()
      const total = db.prepare('SELECT COUNT(*) as c FROM maintenance_requests').get().c
      const data = svc.getRequestsService({ ...req.query, _limit: limit, _offset: offset })
      return res.json({ data, total, page, limit })
    }
    res.json(svc.getRequestsService(req.query))
  }
  catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

maintenanceRouter.get('/requests/:id', ...techAccess, (req, res) => {
  const r = svc.getRequestByIdService(+req.params.id)
  if (!r) return res.status(404).json({ error: 'Bulunamadı' })
  res.json(r)
})

maintenanceRouter.patch('/requests/:id/wait-reason', ...techAccess, (req, res) => {
  try { svc.updateWaitReasonService(+req.params.id, req.body.wait_reason); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

maintenanceRouter.patch('/requests/:id/priority', ...techAccess, (req, res) => {
  try { svc.updateRequestPriorityService(+req.params.id, req.body.priority); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

maintenanceRouter.patch('/requests/:id/start', ...techAccess, (req, res) => {
  try {
    svc.startRequestService(+req.params.id, req.user.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

maintenanceRouter.patch('/requests/:id/status', ...techAccess, (req, res) => {
  try {
    const { status } = req.body
    if (!status) return res.status(400).json({ error: 'Durum belirtilmeli' })
    svc.updateStatusService(+req.params.id, status, req.user.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

maintenanceRouter.patch('/requests/:id/close', ...techAccess, upload.single('photo'), verifyMagicBytes, (req, res) => {
  const photoUrl = req.file
    ? `/uploads/${req.file.filename}`
    : (req.body.photo_url?.startsWith('/uploads/') ? req.body.photo_url : null)
  svc.closeRequestService(+req.params.id, photoUrl)
  res.json({ ok: true })
})

maintenanceRouter.patch('/requests/:id/reopen', ...techAccess, (req, res) => {
  try { svc.reopenRequestService(+req.params.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

maintenanceRouter.delete('/requests/:id', ...requireRole('campus_manager'), (req, res) => {
  try { svc.deleteRequestService(+req.params.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Stats ────────────────────────────────────────────────────────────────────

maintenanceRouter.get('/stats', ...techAccess, (req, res) => {
  try { res.json(svc.getStatsService()) }
  catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

// ── Location suggestions ────────────────────────────────────────────────────

maintenanceRouter.get('/location-suggestions', ...techAccess, (req, res) => {
  try { res.json(svc.getLocationSuggestionsService()) }
  catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

// ── Technicians ──────────────────────────────────────────────────────────────

maintenanceRouter.get('/technicians', ...techAccess, (req, res) => {
  try { res.json(svc.getTechniciansService()) }
  catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

maintenanceRouter.get('/technicians/available', ...techAccess, (req, res) => {
  try { res.json(svc.getAvailableTechniciansService()) }
  catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

maintenanceRouter.post('/technicians', ...requireRole('campus_manager', 'technical'), (req, res) => {
  try {
    const id = svc.createTechnicianService(req.body.full_name, req.body.phone, req.body.specialty, req.body.shift)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

maintenanceRouter.put('/technicians/:id', ...requireRole('campus_manager', 'technical'), (req, res) => {
  try { svc.updateTechnicianService(+req.params.id, req.body); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

maintenanceRouter.delete('/technicians/:id', ...requireRole('campus_manager', 'technical'), (req, res) => {
  try { svc.deleteTechnicianService(+req.params.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Comments ─────────────────────────────────────────────────────────────────

maintenanceRouter.get('/requests/:id/comments', ...techAccess, (req, res) => {
  try { res.json(svc.getCommentsService(+req.params.id)) }
  catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

maintenanceRouter.post('/requests/:id/comments', ...techAccess, upload.single('photo'), verifyMagicBytes, (req, res) => {
  try {
    const photoUrl = req.file ? `/uploads/${req.file.filename}` : null
    const id = svc.addCommentService(+req.params.id, req.user.id, req.body.comment, photoUrl)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})
