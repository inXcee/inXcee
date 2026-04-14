import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { upload } from '../../shared/uploads/middleware.js'
import * as svc from './service.js'

export const housekeepingRouter = Router()
const hkAccess = requireRole('campus_manager', 'housekeeper')

housekeepingRouter.get('/tasks', ...hkAccess, (req, res) => {
  try { res.json(svc.getTasksService(req.query)) }
  catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

housekeepingRouter.post('/tasks/generate-daily', ...hkAccess, (req, res) => {
  try { const count = svc.generateDailyTasksService(); res.status(201).json({ count }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

housekeepingRouter.post('/tasks/complete-floor', ...hkAccess, (req, res) => {
  try { const { block, floor, date } = req.body; svc.completeFloorTasksService(block, +floor, date, req.user.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

housekeepingRouter.post('/tasks/:id/complete', ...hkAccess, (req, res) => {
  try { svc.completeTaskService(+req.params.id, req.user.id, req.body.checklist || null); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

housekeepingRouter.patch('/tasks/:id/uncomplete', ...hkAccess, (req, res) => {
  try { svc.uncompleteTaskService(+req.params.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

housekeepingRouter.patch('/tasks/:id/skip', ...hkAccess, (req, res) => {
  try { svc.skipTaskService(+req.params.id, req.body.reason, req.user.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

housekeepingRouter.patch('/tasks/:id/unskip', ...hkAccess, (req, res) => {
  try { svc.unskipTaskService(+req.params.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

housekeepingRouter.get('/room-details', ...hkAccess, (req, res) => {
  try { res.json(svc.getRoomWithFaultsService(req.query.block, req.query.room_no)) }
  catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

housekeepingRouter.patch('/rooms/:id/no-clean', ...hkAccess, (req, res) => {
  try { svc.toggleNoCleanService(+req.params.id, req.body.no_clean); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

housekeepingRouter.patch('/rooms/:id/notes', ...hkAccess, (req, res) => {
  try { svc.updateRoomNotesService(+req.params.id, req.body.notes ?? null); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

housekeepingRouter.post('/fault-report', ...hkAccess, upload.single('photo'), (req, res) => {
  try {
    const photoBefore = req.file ? `/uploads/${req.file.filename}` : null
    const id = svc.reportFaultService(req.body.location, req.body.description, req.user.id, req.body.priority, photoBefore)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

housekeepingRouter.get('/dnd-rooms', ...hkAccess, (req, res) => {
  try { res.json(svc.getDNDRoomsService()) }
  catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

// ── Cleaning Staff ───────────────────────────────────────────────────────────
const staffAccess = requireRole('campus_manager', 'shift_supervisor', 'housekeeper')

housekeepingRouter.get('/staff', ...staffAccess, (req, res) => {
  try { res.json(svc.getStaffService(req.query.block)) }
  catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

housekeepingRouter.post('/staff', ...staffAccess, (req, res) => {
  try {
    const id = svc.createStaffService(req.body.full_name, req.body.phone)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

housekeepingRouter.put('/staff/:id', ...staffAccess, (req, res) => {
  try { svc.updateStaffService(+req.params.id, req.body); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

housekeepingRouter.delete('/staff/:id', ...staffAccess, (req, res) => {
  try { svc.deleteStaffService(+req.params.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})
