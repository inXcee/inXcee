import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { createImageUpload, upload, verifyMagicBytes } from '../../shared/uploads/middleware.js'
import * as svc from './service.js'
import { logger } from '../../shared/logger.js'
import { validate } from '../../shared/middleware/validate.js'
import {
  completeFloorSchema, skipTaskSchema, roomNotesSchema, noCleanSchema,
  faultReportSchema, createStaffSchema, updateStaffSchema, completeTaskSchema, photoRetentionSchema,
} from './schemas.js'

export const housekeepingRouter = Router()
const hkAccess = requireRole('campus_manager', 'housekeeper')
const managerAccess = requireRole('campus_manager')
const housekeepingPhotoUpload = createImageUpload('housekeeping')

housekeepingRouter.get('/tasks', ...hkAccess, (req, res) => {
  try { res.json(svc.getTasksService(req.query)) }
  catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

housekeepingRouter.post('/tasks/generate-daily', ...hkAccess, (req, res) => {
  try { const count = svc.generateDailyTasksService(); res.status(201).json({ count }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

// Oda/ortak alan temizlik geçmişi (foto kanıtlı) — qr_location anahtarıyla
housekeepingRouter.get('/task-history', ...hkAccess, (req, res) => {
  try {
    const { qr_location, days } = req.query
    if (!qr_location) return res.status(400).json({ error: 'qr_location gerekli' })
    res.json(svc.getTaskHistoryService(qr_location, days ? +days : 30))
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

housekeepingRouter.get('/photo-overview', ...hkAccess, (req, res) => {
  try { res.json(svc.getPhotoOverviewService(req.query)) }
  catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

housekeepingRouter.get('/photo-retention', ...hkAccess, (req, res) => {
  try { res.json(svc.getPhotoRetentionPolicyService()) }
  catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

housekeepingRouter.patch('/photo-retention', ...managerAccess, validate(photoRetentionSchema), (req, res) => {
  try { res.json(svc.setPhotoRetentionPolicyService(req.validated.retention_days, req.user.id)) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

housekeepingRouter.post('/photo-retention/cleanup', ...managerAccess, (req, res) => {
  try { res.json(svc.cleanupHousekeepingPhotosService()) }
  catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

housekeepingRouter.get('/tasks/floor-preview', ...hkAccess, (req, res) => {
  try {
    const { block, floor, date } = req.query
    if (!block || !floor || !date) return res.status(400).json({ error: 'block, floor, date gerekli' })
    const tasks = svc.getFloorTaskPreviewService(block, +floor, date)
    res.json({ count: tasks.length, tasks })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

housekeepingRouter.post('/tasks/complete-floor', ...hkAccess, validate(completeFloorSchema), (req, res) => {
  try {
    const { block, floor, date } = req.validated
    const count = svc.completeFloorTasksService(block, floor, date, req.user.id)
    res.json({ ok: true, count })
  }
  catch (e) { res.status(400).json({ error: e.message }) }
})

// Multipart 'photo' destekli — FormData'da checklist JSON string gelir, parse edilir
function coerceCompleteBody(req, res, next) {
  if (typeof req.body?.checklist === 'string') {
    try { req.body.checklist = req.body.checklist ? JSON.parse(req.body.checklist) : null } catch { req.body.checklist = null }
  }
  next()
}

housekeepingRouter.post('/tasks/:id/complete', ...hkAccess, housekeepingPhotoUpload.single('photo'), verifyMagicBytes, coerceCompleteBody, validate(completeTaskSchema), (req, res) => {
  try {
    const photoUrl = req.file ? '/uploads/' + req.file.filename : null
    svc.completeTaskService(+req.params.id, req.user.id, req.validated.checklist || null, req.validated.via_qr, photoUrl)
    res.json({ ok: true })
  }
  catch (e) { res.status(400).json({ error: e.message }) }
})

housekeepingRouter.patch('/tasks/:id/uncomplete', ...hkAccess, (req, res) => {
  try { svc.uncompleteTaskService(+req.params.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

housekeepingRouter.patch('/tasks/:id/skip', ...hkAccess, validate(skipTaskSchema), (req, res) => {
  try { svc.skipTaskService(+req.params.id, req.validated.reason, req.user.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

housekeepingRouter.patch('/tasks/:id/unskip', ...hkAccess, (req, res) => {
  try { svc.unskipTaskService(+req.params.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

housekeepingRouter.get('/room-details', ...hkAccess, (req, res) => {
  try { res.json(svc.getRoomWithFaultsService(req.query.block, req.query.room_no)) }
  catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

housekeepingRouter.patch('/rooms/:id/no-clean', ...hkAccess, validate(noCleanSchema), (req, res) => {
  try { svc.toggleNoCleanService(+req.params.id, req.validated.no_clean); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

housekeepingRouter.patch('/rooms/:id/notes', ...hkAccess, validate(roomNotesSchema), (req, res) => {
  try { svc.updateRoomNotesService(+req.params.id, req.validated.notes ?? null); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

housekeepingRouter.post('/fault-report', ...hkAccess, upload.single('photo'), verifyMagicBytes, validate(faultReportSchema), (req, res) => {
  try {
    const photoBefore = req.file ? `/uploads/${req.file.filename}` : null
    const { location, description, priority } = req.validated
    const id = svc.reportFaultService(location, description, req.user.id, priority, photoBefore)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

housekeepingRouter.get('/dnd-rooms', ...hkAccess, (req, res) => {
  try { res.json(svc.getDNDRoomsService()) }
  catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

// ── Cleaning Staff ───────────────────────────────────────────────────────────
const staffAccess = requireRole('campus_manager', 'shift_supervisor', 'housekeeper')

housekeepingRouter.get('/staff', ...staffAccess, (req, res) => {
  try { res.json(svc.getStaffService(req.query.block)) }
  catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

housekeepingRouter.post('/staff', ...staffAccess, validate(createStaffSchema), (req, res) => {
  try {
    const id = svc.createStaffService(req.validated.full_name, req.validated.phone)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

housekeepingRouter.put('/staff/:id', ...staffAccess, validate(updateStaffSchema), (req, res) => {
  try { svc.updateStaffService(+req.params.id, req.validated); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

housekeepingRouter.delete('/staff/:id', ...staffAccess, (req, res) => {
  try { svc.deleteStaffService(+req.params.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})
