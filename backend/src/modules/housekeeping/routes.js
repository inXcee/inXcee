import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { upload, verifyMagicBytes } from '../../shared/uploads/middleware.js'
import * as svc from './service.js'
import { logger } from '../../shared/logger.js'
import { validate } from '../../shared/middleware/validate.js'
import {
  completeFloorSchema, skipTaskSchema, roomNotesSchema, noCleanSchema,
  faultReportSchema, createStaffSchema, updateStaffSchema, completeTaskSchema,
} from './schemas.js'

export const housekeepingRouter = Router()
const hkAccess = requireRole('campus_manager', 'housekeeper')

housekeepingRouter.get('/tasks', ...hkAccess, (req, res) => {
  try { res.json(svc.getTasksService(req.query)) }
  catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

housekeepingRouter.post('/tasks/generate-daily', ...hkAccess, (req, res) => {
  try { const count = svc.generateDailyTasksService(); res.status(201).json({ count }) }
  catch (e) { res.status(400).json({ error: e.message }) }
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

housekeepingRouter.post('/tasks/:id/complete', ...hkAccess, validate(completeTaskSchema), (req, res) => {
  try {
    svc.completeTaskService(+req.params.id, req.user.id, req.validated.checklist || null, req.validated.via_qr)
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
