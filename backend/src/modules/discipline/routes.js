import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import * as svc from './service.js'

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

disciplineRouter.post('/records', ...mgmt, (req, res) => {
  try {
    const { personnel_id, card_type, reason } = req.body
    if (!personnel_id) return res.status(400).json({ error: 'Personel ID gerekli' })
    if (!['yellow', 'red'].includes(card_type)) return res.status(400).json({ error: 'Geçersiz kart tipi' })
    if (!reason || reason.trim().length < 3) return res.status(400).json({ error: 'Sebep en az 3 karakter olmalı' })
    const result = svc.addRecordService({
      personnelId: personnel_id,
      cardType: card_type,
      reason: reason.trim(),
      createdBy: req.user.id
    })
    res.status(201).json({ ok: true, discipline_points: result.discipline_points })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

disciplineRouter.delete('/records/:id', ...requireRole('campus_manager'), (req, res) => {
  try {
    svc.deleteRecordService(+req.params.id, req.user.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

disciplineRouter.get('/records/:personnelId', ...mgmt, (req, res) => {
  try {
    const { date_from, date_to } = req.query
    res.json(svc.getRecordsService(+req.params.personnelId, { date_from, date_to }))
  } catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

// ── Blacklist ───────────────────────────────────────────────────────────────

disciplineRouter.post('/blacklist', ...requireRole('campus_manager'), (req, res) => {
  if (!req.body.personnel_id) return res.status(400).json({ error: 'Personel ID gerekli' })
  if (!req.body.reason || req.body.reason.trim().length < 3) return res.status(400).json({ error: 'Sebep gerekli' })
  svc.addToBlacklistService(req.body.personnel_id, req.body.reason.trim(), req.user.id)
  res.json({ ok: true })
})

disciplineRouter.post('/blacklist/remove', ...requireRole('campus_manager'), (req, res) => {
  if (!req.body.personnel_id) return res.status(400).json({ error: 'Personel ID gerekli' })
  svc.removeFromBlacklistService(req.body.personnel_id, req.user.id)
  res.json({ ok: true })
})

disciplineRouter.get('/blacklisted', ...mgmt, (req, res) => {
  try { res.json(svc.getBlacklistedService()) }
  catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

// ── Stats & Suggestions ────────────────────────────────────────────────────

disciplineRouter.get('/stats', ...mgmt, (req, res) => {
  try {
    const { date_from, date_to } = req.query
    res.json(svc.getStatsService({ date_from, date_to }))
  } catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

disciplineRouter.get('/reason-suggestions', ...mgmt, (req, res) => {
  try { res.json(svc.getReasonSuggestionsService()) }
  catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})
