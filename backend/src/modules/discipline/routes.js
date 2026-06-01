import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { logAudit } from '../../shared/audit.js'
import { validate } from '../../shared/middleware/validate.js'
import { addRecordSchema, blacklistAddSchema, blacklistRemoveSchema } from './schemas.js'
import * as svc from './service.js'
import { logger } from '../../shared/logger.js'

export const disciplineRouter = Router()
const mgmt = requireRole('campus_manager', 'shift_supervisor')

// ── Search ──────────────────────────────────────────────────────────────────

disciplineRouter.get('/search', ...mgmt, (req, res) => {
  const { q } = req.query
  if (!q || q.trim().length < 2) return res.json([])
  res.json(svc.searchPersonnelService(q.trim()))
})

disciplineRouter.get('/personnel/:id', ...mgmt, (req, res) => {
  const p = svc.getPersonnelByIdService(+req.params.id)
  if (!p) return res.status(404).json({ error: 'Personel bulunamadı' })
  res.json(p)
})

// ── Records ─────────────────────────────────────────────────────────────────

disciplineRouter.post('/records', ...mgmt, validate(addRecordSchema), (req, res) => {
  try {
    const { personnel_id, card_type, reason } = req.validated
    const result = svc.addRecordService({
      personnelId: personnel_id,
      cardType: card_type,
      reason,
      createdBy: req.user.id
    })
    logAudit(req.user.id, `discipline_${card_type}_card`, 'discipline', personnel_id, reason)
    res.status(201).json({ ok: true, discipline_points: result.discipline_points })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

disciplineRouter.delete('/records/:id', ...requireRole('campus_manager'), (req, res) => {
  try {
    svc.deleteRecordService(+req.params.id, req.user.id)
    logAudit(req.user.id, 'discipline_record_delete', 'discipline', +req.params.id, null)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

disciplineRouter.get('/records/:personnelId', ...mgmt, (req, res) => {
  try {
    const { date_from, date_to } = req.query
    res.json(svc.getRecordsService(+req.params.personnelId, { date_from, date_to }))
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

// ── Blacklist ───────────────────────────────────────────────────────────────

disciplineRouter.post('/blacklist', ...requireRole('campus_manager'), validate(blacklistAddSchema), (req, res) => {
  const { personnel_id, reason } = req.validated
  svc.addToBlacklistService(personnel_id, reason, req.user.id)
  logAudit(req.user.id, 'blacklist_add', 'discipline', personnel_id, reason)
  res.json({ ok: true })
})

disciplineRouter.post('/blacklist/remove', ...requireRole('campus_manager'), validate(blacklistRemoveSchema), (req, res) => {
  const { personnel_id } = req.validated
  svc.removeFromBlacklistService(personnel_id, req.user.id)
  logAudit(req.user.id, 'blacklist_remove', 'discipline', personnel_id, null)
  res.json({ ok: true })
})

disciplineRouter.get('/blacklisted', ...mgmt, (req, res) => {
  try { res.json(svc.getBlacklistedService()) }
  catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

// ── Stats & Suggestions ────────────────────────────────────────────────────

disciplineRouter.get('/stats', ...mgmt, (req, res) => {
  try {
    const { date_from, date_to } = req.query
    res.json(svc.getStatsService({ date_from, date_to }))
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

disciplineRouter.get('/reason-suggestions', ...mgmt, (req, res) => {
  try { res.json(svc.getReasonSuggestionsService()) }
  catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})
