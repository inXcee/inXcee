import { Router } from 'express'
import { requireKioskOrStaff, requireAvsKiosk } from '../../shared/auth/middleware.js'
import { getDB } from '../../shared/db/index.js'
import { createRequest } from '../maintenance/queries.js'
import { changeKioskPin } from '../../shared/auth/service.js'
import { insertItemQuery, updateItemStatusQuery, listMachinesQuery, addToQueueQuery, collectItemQuery, setBagNoQuery } from '../laundry/queries.js'

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

// ── Laundry Kiosk (AVS çalışanları) ──────────────────────────────────────

selfServiceRouter.get('/laundry-kiosk/blocks', (req, res) => {
  try {
    const db = getDB()
    const blocks = db.prepare('SELECT DISTINCT block FROM rooms ORDER BY block').all().map(r => r.block)
    res.json(blocks)
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

selfServiceRouter.get('/laundry-kiosk/room-persons', requireAvsKiosk, (req, res) => {
  const { block, room_no } = req.query
  if (!block || !room_no) return res.status(400).json({ error: 'block ve room_no gerekli' })
  try {
    const db = getDB()
    const persons = db.prepare(`
      SELECT p.id, p.full_name, p.company
      FROM room_assignments ra
      JOIN rooms r ON r.id = ra.room_id
      JOIN personnel p ON p.id = ra.personnel_id
      WHERE r.block=? AND r.room_no=? AND ra.check_out_at IS NULL AND p.check_out_date IS NULL
      ORDER BY p.full_name
    `).all(block, room_no)
    res.json(persons)
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

selfServiceRouter.get('/laundry-kiosk/garment-types', requireAvsKiosk, (req, res) => {
  try {
    const db = getDB()
    const types = db.prepare('SELECT * FROM laundry_garment_types WHERE is_active=1 ORDER BY sort_order ASC').all()
    res.json(types)
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

selfServiceRouter.post('/laundry-kiosk/bag', requireAvsKiosk, (req, res) => {
  const { block, room_no, personnel_id, item_count, is_premium, notes, urgent, intake_signature, clothing_items, garments } = req.body
  if (!block || !room_no) return res.status(400).json({ error: 'block ve room_no gerekli' })
  const count = Number(item_count)
  if (!count || count < 1 || count > 8) return res.status(400).json({ error: 'Geçersiz adet (1-8)' })
  try {
    const db = getDB()
    const room = db.prepare('SELECT id FROM rooms WHERE block=? AND room_no=?').get(block, room_no)
    if (!room) return res.status(404).json({ error: 'Oda bulunamadı' })
    const intake_name = personnel_id
      ? db.prepare('SELECT full_name FROM personnel WHERE id=?').get(Number(personnel_id))?.full_name
      : null
    const id = insertItemQuery({
      room_id: room.id,
      item_count: count,
      status: 'dirty',
      is_premium: is_premium ? 1 : 0,
      notes: notes || null,
      urgent: urgent ? 1 : 0,
      intake_signature: intake_signature || null,
      intake_name: intake_name || null,
      clothing_items: clothing_items ? JSON.stringify(clothing_items) : null,
      garments_json: garments && garments.length > 0 ? JSON.stringify(garments) : null,
      created_by: null,
    })
    const bag_no = setBagNoQuery(id)
    res.status(201).json({ id, bag_no })
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

selfServiceRouter.get('/laundry-kiosk/bags', requireAvsKiosk, (req, res) => {
  const { block, room_no, status } = req.query
  try {
    const db = getDB()
    let q = `SELECT li.id, li.bag_no, li.status, li.item_count, li.urgent, li.is_premium, li.needs_ironing,
                    li.created_at, li.intake_name, li.garments_json, r.block, r.room_no
             FROM laundry_items li JOIN rooms r ON r.id = li.room_id WHERE 1=1`
    const params = []
    if (block)   { q += ' AND r.block=?';   params.push(block) }
    if (room_no) { q += ' AND r.room_no=?'; params.push(room_no) }
    if (status)  { q += ' AND li.status=?'; params.push(status) }
    else         { q += ` AND li.status NOT IN ('delivered','lost')` }
    q += ' ORDER BY li.urgent DESC, li.created_at ASC LIMIT 50'
    res.json(db.prepare(q).all(...params))
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

selfServiceRouter.put('/laundry-kiosk/bags/:id/status', requireAvsKiosk, (req, res) => {
  const { status } = req.body
  const ALLOWED = ['pending_collection', 'washing', 'ironing', 'ready', 'delivered']
  if (!ALLOWED.includes(status)) return res.status(400).json({ error: 'Geçersiz durum' })
  try {
    updateItemStatusQuery(Number(req.params.id), status)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

selfServiceRouter.get('/laundry-kiosk/pending-bags', requireAvsKiosk, (req, res) => {
  try {
    const db = getDB()
    const bags = db.prepare(`
      SELECT li.id, li.bag_no, li.item_count, li.urgent, li.is_premium,
             li.intake_name, li.created_at, r.block, r.room_no
      FROM laundry_items li JOIN rooms r ON r.id = li.room_id
      WHERE li.status = 'pending_collection'
      ORDER BY li.urgent DESC, li.created_at ASC LIMIT 100
    `).all()
    res.json(bags)
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

selfServiceRouter.post('/laundry-kiosk/bags/:id/collect', requireAvsKiosk, (req, res) => {
  try {
    const db = getDB()
    const item = db.prepare('SELECT id, status FROM laundry_items WHERE id=?').get(Number(req.params.id))
    if (!item) return res.status(404).json({ error: 'Torba bulunamadı' })
    if (item.status !== 'pending_collection') return res.status(400).json({ error: 'Torba pending_collection değil' })
    collectItemQuery(Number(req.params.id), req.user.workerId || null)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

selfServiceRouter.post('/laundry-kiosk/deliver-resident/:id', requireKioskOrStaff, (req, res) => {
  if (!req.user.personnelId) return res.status(403).json({ error: 'Kiosk token gerekli' })
  const { signature } = req.body
  try {
    const db = getDB()
    const item = db.prepare(`
      SELECT li.id, li.status FROM laundry_items li
      JOIN room_assignments ra ON ra.room_id = li.room_id
      WHERE li.id=? AND ra.personnel_id=? AND ra.check_out_at IS NULL AND li.status='ready'
    `).get(Number(req.params.id), req.user.personnelId)
    if (!item) return res.status(403).json({ error: 'Torba bulunamadı veya hazır değil' })
    db.prepare(`UPDATE laundry_items SET status='delivered', occupant_signature=?, updated_at=datetime('now') WHERE id=?`)
      .run(signature || null, item.id)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

selfServiceRouter.put('/laundry-kiosk/bags/:id/ironing', requireAvsKiosk, (req, res) => {
  const { needs_ironing } = req.body
  try {
    const db = getDB()
    db.prepare("UPDATE laundry_items SET needs_ironing=?, updated_at=datetime('now') WHERE id=?")
      .run(needs_ironing ? 1 : 0, Number(req.params.id))
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

selfServiceRouter.post('/laundry-kiosk/bags/:id/ironing-complete', requireAvsKiosk, (req, res) => {
  try {
    const db = getDB()
    const item = db.prepare('SELECT id, status FROM laundry_items WHERE id=?').get(Number(req.params.id))
    if (!item) return res.status(404).json({ error: 'Torba bulunamadı' })
    if (item.status !== 'ironing') return res.status(400).json({ error: 'Torba ironing durumunda değil' })
    db.prepare("UPDATE laundry_items SET status='ready', updated_at=datetime('now') WHERE id=?")
      .run(item.id)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

selfServiceRouter.post('/laundry-kiosk/bags/:id/deliver', requireAvsKiosk, (req, res) => {
  const { delivered_name, file_count, signature } = req.body
  if (!delivered_name || !delivered_name.trim()) return res.status(400).json({ error: 'delivered_name gerekli' })
  const fc = Number(file_count)
  if (!fc || fc < 1) return res.status(400).json({ error: 'file_count en az 1 olmalı' })
  try {
    const db = getDB()
    const item = db.prepare('SELECT id, status FROM laundry_items WHERE id=?').get(Number(req.params.id))
    if (!item) return res.status(404).json({ error: 'Torba bulunamadı' })
    if (item.status !== 'ready') return res.status(400).json({ error: 'Torba ready durumunda değil' })
    db.prepare(`
      UPDATE laundry_items
      SET status='delivered', delivered_name=?, file_count=?, occupant_signature=?, updated_at=datetime('now')
      WHERE id=?
    `).run(delivered_name.trim(), fc, signature || null, item.id)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

const MS_BLOCKS = new Set(['M1', 'M2', 'M3', 'S1', 'S2', 'S3'])

selfServiceRouter.post('/laundry-kiosk/garment', requireAvsKiosk, (req, res) => {
  const { block, room_no, personnel_id, clothing_items, intake_signature } = req.body
  if (!block || !room_no) return res.status(400).json({ error: 'block ve room_no gerekli' })
  if (!Array.isArray(clothing_items) || clothing_items.length === 0)
    return res.status(400).json({ error: 'En az 1 kıyafet gerekli' })
  try {
    const db = getDB()
    const room = db.prepare('SELECT id FROM rooms WHERE block=? AND room_no=?').get(block, room_no)
    if (!room) return res.status(404).json({ error: 'Oda bulunamadı' })
    const intake_name = personnel_id
      ? db.prepare('SELECT full_name FROM personnel WHERE id=?').get(Number(personnel_id))?.full_name
      : null
    const total = clothing_items.reduce((s, c) => s + (Number(c.count) || 1), 0)
    const isMS = MS_BLOCKS.has(block.toUpperCase())
    const itemStatus = isMS ? 'dirty' : 'ironing'
    const id = insertItemQuery({
      room_id: room.id,
      item_count: total,
      status: itemStatus,
      needs_ironing: isMS ? 0 : 1,
      is_premium: 1,
      garments_json: JSON.stringify(clothing_items),
      intake_name: intake_name || null,
      intake_signature: intake_signature || null,
      created_by: null,
    })
    res.status(201).json({ id })
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

selfServiceRouter.get('/laundry-kiosk/machines', requireAvsKiosk, (req, res) => {
  try { res.json(listMachinesQuery()) }
  catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

selfServiceRouter.put('/laundry-kiosk/machines/:id/assign', requireAvsKiosk, (req, res) => {
  const { item_id } = req.body
  if (!item_id) return res.status(400).json({ error: 'item_id gerekli' })
  try {
    addToQueueQuery({ item_id: Number(item_id), machine_id: Number(req.params.id) })
    updateItemStatusQuery(Number(item_id), 'washing', { machine_id: Number(req.params.id) })
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})
