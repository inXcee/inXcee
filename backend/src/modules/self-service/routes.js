import { Router } from 'express'
import { requireKioskOrStaff } from '../../shared/auth/middleware.js'
import { getDB } from '../../shared/db/index.js'
import { createRequest } from '../maintenance/queries.js'
import { changeKioskPin } from '../../shared/auth/service.js'

export const selfServiceRouter = Router()

selfServiceRouter.get('/my-info', requireKioskOrStaff, (req, res) => {
  if (!req.user.personnelId) return res.status(403).json({ error: 'Kiosk token gerekli' })
  try {
    const db = getDB()
    const p = db.prepare(`
      SELECT id, full_name, company, hometown, check_in_date, discipline_points, expected_departure
      FROM personnel WHERE id=?
    `).get(req.user.personnelId)
    const assignment = db.prepare(`
      SELECT r.block, r.floor, r.room_no, ra.bed_no
      FROM room_assignments ra JOIN rooms r ON r.id=ra.room_id
      WHERE ra.personnel_id=? AND ra.check_out_at IS NULL
    `).get(req.user.personnelId)
    res.json({ ...p, room: assignment || null })
  } catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

selfServiceRouter.get('/laundry-status', requireKioskOrStaff, (req, res) => {
  if (!req.user.personnelId) return res.status(403).json({ error: 'Kiosk token gerekli' })
  try {
    const db = getDB()
    const assignment = db.prepare(`
      SELECT room_id FROM room_assignments WHERE personnel_id=? AND check_out_at IS NULL
    `).get(req.user.personnelId)
    if (!assignment) return res.json([])
    const bags = db.prepare('SELECT * FROM laundry_bags WHERE room_id=? ORDER BY collected_at DESC LIMIT 10').all(assignment.room_id)
    res.json(bags)
  } catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

selfServiceRouter.post('/maintenance', requireKioskOrStaff, (req, res) => {
  if (!req.user.personnelId) return res.status(403).json({ error: 'Kiosk token gerekli' })
  const { location, description } = req.body
  if (!location || location.trim().length < 3)
    return res.status(400).json({ error: 'location en az 3 karakter olmalıdır' })
  if (!description || description.trim().length < 10)
    return res.status(400).json({ error: 'description en az 10 karakter olmalıdır' })
  try {
    const id = createRequest({
      location: location.trim(),
      description: description.trim(),
      reporterUserId: req.user.userId || null,
      reporterPersonnelId: req.user.personnelId,
    })
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

selfServiceRouter.post('/set-pin', requireKioskOrStaff, (req, res) => {
  if (!req.user.personnelId) return res.status(403).json({ error: 'Kiosk token gerekli' })
  const { currentPin, newPin } = req.body
  if (!currentPin || !newPin) return res.status(400).json({ error: 'Mevcut ve yeni PIN gerekli' })
  const result = changeKioskPin(req.user.personnelId, currentPin, newPin)
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.json(result)
})

selfServiceRouter.get('/my-maintenance', requireKioskOrStaff, (req, res) => {
  if (!req.user.personnelId) return res.status(403).json({ error: 'Kiosk token gerekli' })
  try {
    const db = getDB()
    const rows = db.prepare(`
      SELECT id, location, description, status, priority, opened_at, closed_at
      FROM maintenance_requests
      WHERE reporter_personnel_id=?
      ORDER BY opened_at DESC LIMIT 20
    `).all(req.user.personnelId)
    res.json(rows)
  } catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

selfServiceRouter.get('/my-discipline', requireKioskOrStaff, (req, res) => {
  if (!req.user.personnelId) return res.status(403).json({ error: 'Kiosk token gerekli' })
  try {
    const db = getDB()
    const rows = db.prepare(`
      SELECT id, card_type, reason, created_at
      FROM discipline_records
      WHERE personnel_id=?
      ORDER BY created_at DESC
    `).all(req.user.personnelId)
    res.json(rows)
  } catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

selfServiceRouter.get('/announcements', requireKioskOrStaff, (req, res) => {
  try {
    const db = getDB()
    const rows = db.prepare(`
      SELECT id, title, body, created_at
      FROM announcements
      WHERE expires_at IS NULL OR expires_at > datetime('now')
      ORDER BY created_at DESC
    `).all()
    res.json(rows)
  } catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

selfServiceRouter.post('/feedback', requireKioskOrStaff, (req, res) => {
  if (!req.user.personnelId) return res.status(403).json({ error: 'Kiosk token gerekli' })
  const { type, message, anonymous } = req.body
  if (!['complaint', 'suggestion', 'other'].includes(type))
    return res.status(400).json({ error: 'Geçersiz tip (complaint, suggestion, other)' })
  if (!message || message.trim().length < 20)
    return res.status(400).json({ error: 'Mesaj en az 20 karakter olmalıdır' })
  try {
    const db = getDB()
    const r = db.prepare(`
      INSERT INTO feedback(personnel_id, type, message) VALUES(?,?,?)
    `).run(anonymous ? null : req.user.personnelId, type, message.trim())
    res.status(201).json({ id: r.lastInsertRowid })
  } catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})
