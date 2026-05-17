import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { logAudit } from '../../shared/audit.js'
import * as q from './queries.js'

export const personnelRouter = Router()
const mgr = requireRole('campus_manager', 'shift_supervisor')
const view = requireRole('campus_manager', 'shift_supervisor', 'laundry', 'housekeeper', 'technical')

// ── 360° ──
personnelRouter.get('/:id/360', ...view, (req, res) => {
  try {
    const data = q.get360(+req.params.id)
    if (!data) return res.status(404).json({ error: 'Personel bulunamadı' })
    res.json(data)
  } catch (e) { console.error('[personnel/360]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

personnelRouter.get('/:id/timeline', ...view, (req, res) => {
  try { res.json(q.getTimeline(+req.params.id)) }
  catch (e) { console.error('[personnel/timeline]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── Notlar ──
personnelRouter.post('/:id/notes', ...mgr, (req, res) => {
  try {
    if (!req.body?.note?.trim()) return res.status(400).json({ error: 'Not boş olamaz' })
    const id = q.addNote({
      staffId: +req.params.id,
      authorId: req.user.id,
      authorName: req.user.full_name || req.user.username,
      note: req.body.note.trim().slice(0, 4000),
      pinned: !!req.body.pinned,
    })
    logAudit(req.user.id, 'staff_note_add', 'personnel', +req.params.id, req.body.note.slice(0, 50))
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

personnelRouter.delete('/notes/:noteId', ...mgr, (req, res) => {
  try { q.deleteNote(+req.params.noteId); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

personnelRouter.patch('/notes/:noteId/pin', ...mgr, (req, res) => {
  try { q.togglePinNote(+req.params.noteId); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Acil iletişim ──
personnelRouter.post('/:id/emergency-contacts', ...mgr, (req, res) => {
  try {
    if (!req.body?.name) return res.status(400).json({ error: 'İsim gerekli' })
    const id = q.addEmergencyContact(+req.params.id, req.body)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

personnelRouter.put('/emergency-contacts/:id', ...mgr, (req, res) => {
  try { q.updateEmergencyContact(+req.params.id, req.body); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

personnelRouter.delete('/emergency-contacts/:id', ...mgr, (req, res) => {
  try { q.deleteEmergencyContact(+req.params.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Arşiv ──
personnelRouter.post('/:id/archive', ...mgr, (req, res) => {
  try {
    q.archiveStaff(+req.params.id, req.body?.reason)
    logAudit(req.user.id, 'staff_archive', 'personnel', +req.params.id, req.body?.reason || '')
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

personnelRouter.post('/:id/restore', ...mgr, (req, res) => {
  try {
    q.restoreStaff(+req.params.id)
    logAudit(req.user.id, 'staff_restore', 'personnel', +req.params.id, '')
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

personnelRouter.get('/archived', ...view, (req, res) => {
  try { res.json(q.listArchived({ q: req.query.q })) }
  catch (e) { console.error('[personnel/archived]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── R5 Risk listesi ──
personnelRouter.get('/risk', ...view, (req, res) => {
  try { res.json(q.getRiskList({ limit: req.query.limit ? +req.query.limit : 30 })) }
  catch (e) { console.error('[personnel/risk]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})
