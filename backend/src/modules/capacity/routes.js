import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import * as svc from './service.js'

export const capacityRouter = Router()
const mgmt = requireRole('campus_manager', 'shift_supervisor')

capacityRouter.get('/rooms', ...mgmt, (req, res) => {
  try { res.json(svc.getRoomsService(req.query)) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

capacityRouter.get('/rooms/:id/personnel', ...mgmt, (req, res) => {
  try { res.json(svc.getRoomPersonnelService(+req.params.id)) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

capacityRouter.get('/block/:block/personnel', ...mgmt, (req, res) => {
  try { res.json(svc.getBlockPersonnelService(req.params.block)) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

capacityRouter.patch('/rooms/:id/beds', ...requireRole('campus_manager'), (req, res) => {
  try {
    svc.updateActiveBedsService(+req.params.id, req.body.active_beds)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

capacityRouter.patch('/rooms/:id/status', ...requireRole('campus_manager'), (req, res) => {
  const status = req.body.status
  if (!['active', 'quarantine', 'maintenance'].includes(status)) return res.status(400).json({ error: 'Geçersiz durum' })
  svc.updateRoomStatusService(+req.params.id, status, req.user.id)
  res.json({ ok: true })
})

capacityRouter.patch('/rooms/:id/notes', ...mgmt, (req, res) => {
  try { svc.updateRoomNotesService(+req.params.id, req.body.notes ?? null); res.json({ ok: true }) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

capacityRouter.get('/personnel/search', ...mgmt, (req, res) => {
  try { res.json(svc.searchPersonnelService(req.query.q || '')) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

capacityRouter.patch('/floor-supervisor', ...requireRole('campus_manager'), (req, res) => {
  try { svc.updateFloorSupervisorService(req.body.block, req.body.floor, req.body.user_id); res.json({ ok: true }) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

capacityRouter.post('/swap', ...mgmt, (req, res) => {
  try {
    const { person_a_id, person_b_id } = req.body
    if (!person_a_id || !person_b_id) return res.status(400).json({ error: 'İki personel ID gerekli' })
    svc.swapPersonnelService(person_a_id, person_b_id, req.user.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

capacityRouter.post('/reassign', ...mgmt, (req, res) => {
  try {
    svc.reassignPersonnelService(req.body.personnel_id, req.body.room_id, req.user.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

capacityRouter.post('/remove-from-room', ...mgmt, (req, res) => {
  try {
    const { personnel_id } = req.body
    if (!personnel_id) return res.status(400).json({ error: 'Personel ID gerekli' })
    const result = svc.removeFromRoomService(personnel_id, req.user.id)
    res.json({ ok: true, ...result })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Unassigned Personnel ──────────────────────────────────────────────────────

capacityRouter.get('/unassigned', ...mgmt, (req, res) => {
  try { res.json(svc.getUnassignedPersonnelService(req.query.q || null)) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

capacityRouter.post('/bulk/assign', ...mgmt, (req, res) => {
  try {
    const { personnel_ids, room_id } = req.body
    if (!Array.isArray(personnel_ids) || personnel_ids.length === 0) return res.status(400).json({ error: 'Personel listesi gerekli' })
    if (!room_id) return res.status(400).json({ error: 'Oda ID gerekli' })
    svc.bulkAssignToRoomService(personnel_ids, room_id, req.user.id)
    res.json({ ok: true, count: personnel_ids.length })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

capacityRouter.post('/bulk/remove', ...mgmt, (req, res) => {
  try {
    const { personnel_ids } = req.body
    if (!Array.isArray(personnel_ids) || personnel_ids.length === 0) return res.status(400).json({ error: 'Personel listesi gerekli' })
    svc.bulkRemoveFromRoomsService(personnel_ids, req.user.id)
    res.json({ ok: true, count: personnel_ids.length })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Bulk Operations (#6) ────────────────────────────────────────────────────

capacityRouter.post('/bulk/room-status', ...requireRole('campus_manager'), (req, res) => {
  const { room_ids, status } = req.body
  if (!Array.isArray(room_ids) || room_ids.length === 0) return res.status(400).json({ error: 'Oda listesi gerekli' })
  if (!['active', 'quarantine', 'maintenance'].includes(status)) return res.status(400).json({ error: 'Geçersiz durum' })
  svc.bulkUpdateRoomStatusService(room_ids, status, req.user.id)
  res.json({ ok: true, count: room_ids.length })
})

capacityRouter.post('/bulk/checkout', ...requireRole('campus_manager'), (req, res) => {
  try {
    const { personnel_ids, force } = req.body
    if (!Array.isArray(personnel_ids) || personnel_ids.length === 0) return res.status(400).json({ error: 'Personel listesi gerekli' })
    svc.bulkCheckoutService(personnel_ids, req.user.id, !!force)
    res.json({ ok: true, count: personnel_ids.length })
  } catch (e) {
    if (e.code === 'UNRETURNED_ZIMMET') {
      return res.status(409).json({ error: 'UNRETURNED_ZIMMET', details: e.details })
    }
    res.status(400).json({ error: e.message })
  }
})
