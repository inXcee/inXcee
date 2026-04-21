import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { upload, verifyMagicBytes } from '../../shared/uploads/middleware.js'
import { setKioskPin } from '../../shared/auth/service.js'
import { getDB } from '../../shared/db/index.js'
import * as svc from './service.js'
import { insertPlaceholderBatch } from './queries.js'

export const checkinRouter = Router()
const allowed = requireRole('campus_manager', 'shift_supervisor')

checkinRouter.post('/lookup', ...allowed, (req, res) => {
  const { tc_no, passport_no } = req.body
  const person = svc.lookupService(tc_no, passport_no)
  if (!person) return res.json({ found: false })
  res.json({ found: true, ...person })
})

checkinRouter.post('/search-name', ...allowed, (req, res) => {
  const { name } = req.body
  if (!name || name.trim().length < 2) return res.json([])
  res.json(svc.searchByNameService(name.trim()))
})

checkinRouter.get('/search', ...allowed, (req, res) => {
  const { q } = req.query
  if (!q || q.trim().length < 2) return res.json([])
  res.json(svc.searchResidentsService(q.trim()))
})

checkinRouter.post('/register', ...allowed, (req, res) => {
  try {
    const { full_name, tc_no, passport_no } = req.body
    if (!full_name || full_name.trim().length < 3) return res.status(400).json({ error: 'Ad soyad en az 3 karakter olmalı' })
    if (tc_no && !/^\d{11}$/.test(tc_no)) return res.status(400).json({ error: 'TC kimlik no 11 haneli olmalı' })
    const result = svc.registerService(req.body, req.user.id)
    res.status(201).json(result)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

checkinRouter.post('/suggest-room', ...allowed, (req, res) => {
  const { company, hometown, shift_type } = req.body
  const room = svc.suggestRoomService(company, hometown, shift_type)
  if (!room) return res.status(404).json({ error: 'Uygun oda bulunamadı' })
  res.json(room)
})

checkinRouter.get('/available-rooms', ...allowed, (req, res) => {
  res.json(svc.getAvailableRoomsService(req.query.block || null))
})

checkinRouter.post('/assign-room', ...allowed, (req, res) => {
  try {
    const { personnel_id, room_id } = req.body
    if (!personnel_id || !room_id) return res.status(400).json({ error: 'Personel ve oda ID gerekli' })
    const bedNo = svc.assignRoomService(personnel_id, room_id, req.user.id)
    res.json({ bed_no: bedNo })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

checkinRouter.post('/zimmet', ...allowed, (req, res) => {
  svc.zimmetService(req.body.personnel_id, req.body.items, req.user.id)
  res.status(201).json({ ok: true })
})

checkinRouter.post('/zimmet/sign', ...allowed, (req, res) => {
  const { personnel_id, signature } = req.body
  if (!personnel_id || !signature) return res.status(400).json({ error: 'Personel ID ve imza gerekli' })
  if (!signature.startsWith('data:image/')) return res.status(400).json({ error: 'Geçersiz imza formatı' })
  svc.signZimmetService(personnel_id, signature)
  res.json({ ok: true })
})

// ── Stats & Suggestions ─────────────────────────────────────────────────────
checkinRouter.get('/stats', ...allowed, (req, res) => {
  res.json(svc.getOverallStatsService())
})

checkinRouter.get('/company-stats', ...allowed, (req, res) => {
  res.json(svc.getCompanyDistributionService())
})

checkinRouter.get('/job-stats', ...allowed, (req, res) => {
  res.json(svc.getJobDistributionService())
})

checkinRouter.get('/company-personnel/:company', ...allowed, (req, res) => {
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 200))
  const offset = Math.max(0, parseInt(req.query.offset) || 0)
  res.json(svc.getCompanyPersonnelService(req.params.company, { limit, offset }))
})

checkinRouter.get('/company-suggestions', ...allowed, (req, res) => {
  res.json(svc.getCompanySuggestionsService())
})

checkinRouter.get('/job-suggestions', ...allowed, (req, res) => {
  res.json(svc.getJobSuggestionsService())
})

checkinRouter.post('/set-shift', ...allowed, (req, res) => {
  const { personnel_id, shift_type } = req.body
  if (!['day', 'night'].includes(shift_type)) return res.status(400).json({ error: 'Geçersiz vardiya tipi' })
  svc.setShiftService(personnel_id, shift_type)
  res.json({ ok: true })
})

// ── Zimmet Return (#7) ──────────────────────────────────────────────────────

checkinRouter.get('/zimmet/:personnelId', ...allowed, (req, res) => {
  res.json(svc.getPersonnelZimmetService(+req.params.personnelId))
})

checkinRouter.post('/zimmet/return', ...allowed, (req, res) => {
  const { zimmet_id, condition } = req.body
  if (!zimmet_id) return res.status(400).json({ error: 'Zimmet ID gerekli' })
  svc.returnZimmetService(zimmet_id, condition)
  res.json({ ok: true })
})

checkinRouter.post('/zimmet/return-all', ...allowed, (req, res) => {
  const { personnel_id, condition } = req.body
  if (!personnel_id) return res.status(400).json({ error: 'Personel ID gerekli' })
  svc.returnAllZimmetService(personnel_id, condition)
  res.json({ ok: true })
})

checkinRouter.get('/zimmet/:personnelId/unreturned', ...allowed, (req, res) => {
  res.json(svc.getUnreturnedZimmetService(+req.params.personnelId))
})

// ── CSV Import ──────────────────────────────────────────────────────────────
checkinRouter.post('/import-csv', ...allowed, (req, res) => {
  try {
    const { rows } = req.body
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'Veri bulunamadı' })
    const results = { success: 0, errors: [] }
    for (const row of rows) {
      try {
        if (!row.full_name || row.full_name.trim().length < 3) {
          results.errors.push(`${row.full_name || 'Boş'}: Ad soyad en az 3 karakter`)
          continue
        }
        svc.registerService({
          full_name: row.full_name.trim(),
          tc_no: row.tc_no || null,
          passport_no: row.passport_no || null,
          company: row.company || null,
          job_title: row.job_title || null,
          hometown: row.hometown || null,
          phone_number: row.phone_number || null,
          gender: row.gender || null,
        }, req.user.id)
        results.success++
      } catch (e) {
        results.errors.push(`${row.full_name}: ${e.message}`)
      }
    }
    res.json(results)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Kiosk PIN Yönetimi (admin only) ──────────────────────────────────────────
checkinRouter.patch('/:id/kiosk-pin', ...requireRole('campus_manager'), (req, res) => {
  const { pin } = req.body
  if (!pin) return res.status(400).json({ error: 'PIN gerekli' })
  const result = setKioskPin(+req.params.id, pin)
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.json(result)
})

checkinRouter.delete('/:id/kiosk-pin', ...requireRole('campus_manager'), (req, res) => {
  try {
    getDB().prepare('UPDATE personnel SET kiosk_pin=NULL WHERE id=?').run(+req.params.id)
    res.json({ ok: true })
  } catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

// ── Photo Upload ──────────────────────────────────────────────────────────────
checkinRouter.post('/photo/:personnelId', ...allowed, upload.single('photo'), verifyMagicBytes, (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Fotoğraf gerekli' })
    const photoUrl = `/uploads/${req.file.filename}`
    svc.updatePhotoService(+req.params.personnelId, photoUrl)
    res.json({ photo_url: photoUrl })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Placeholder Batch ─────────────────────────────────────────────────────────
checkinRouter.post('/placeholder-batch', ...allowed, (req, res) => {
  const { room_id, count } = req.body
  if (!room_id || !count || count < 1 || count > 10)
    return res.status(400).json({ error: 'room_id ve count (1-10) gerekli' })
  try {
    const ids = insertPlaceholderBatch(Number(room_id), Number(count), req.user.id)
    res.status(201).json({ ids })
  } catch (e) { res.status(400).json({ error: e.message }) }
})
