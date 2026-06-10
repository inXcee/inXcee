import { Router } from 'express'
import { requireKioskOrStaff, requireAvsKiosk } from '../../shared/auth/middleware.js'
import { getDB } from '../../shared/db/index.js'
import { createRequest } from '../maintenance/queries.js'
import { changeKioskPin } from '../../shared/auth/service.js'
import { validate } from '../../shared/middleware/validate.js'
import { maintenanceSchema, feedbackSchema } from './schemas.js'
import { insertItemQuery, listMachinesQuery, collectItemQuery, setBagNoQuery, getRoomLaundryHistoryQuery, getRoomLaundrySummaryQuery, getBlockRoomActiveCountsQuery, getSlaConfigQuery } from '../laundry/queries.js'
import { advanceItemService, batchAssignService, lostItemService, deleteItemService, deliverItemService, maintenanceDoneService, markFoundService, getItemService, getMachineDailyRunsService, getOperatorSummaryService } from '../laundry/service.js'
import { sendFoundMessage } from '../laundry/whatsapp.js'
import { logger } from '../../shared/logger.js'

export const selfServiceRouter = Router()

// Az önce atılan history satırına kiosk operatörünü damgala (operatör
// performans kırılımı için). 5 sn guard'ı: history yazmayan bir aksiyonda
// yanlışlıkla eski satırı damgalamayı önler.
function stampHistoryWorker(db, itemId, workerId) {
  if (!workerId) return
  db.prepare(`
    UPDATE laundry_history SET worker_id=?
    WHERE id = (SELECT MAX(id) FROM laundry_history WHERE item_id=?)
      AND created_at >= datetime('now', '-5 seconds')
  `).run(workerId, itemId)
}

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
  } catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// H2 M1 — Zengin profil (staff + acil iletişim + sayım)
selfServiceRouter.get('/my-profile', requireKioskOrStaff, (req, res) => {
  if (!req.user.personnelId) return res.status(403).json({ error: 'Kiosk token gerekli' })
  try {
    const db = getDB()
    const p = db.prepare(`
      SELECT id, full_name, tc_no, passport_no, company, hometown, check_in_date,
        discipline_points, expected_departure, phone_number, gender, preferred_block
      FROM personnel WHERE id=?
    `).get(req.user.personnelId)
    if (!p) return res.status(404).json({ error: 'Personel bulunamadı' })

    // TC üzerinden staff eşleştirmesi
    const staff = p.tc_no ? db.prepare(`
      SELECT s.id, s.email, s.position, s.hire_date, s.contract_end, s.blood_type,
        s.emergency_contact, s.emergency_phone, s.address, s.notes,
        d.name as dept_name, d.color_class as dept_color,
        pp.name as pickup_name, pp.district as pickup_district
      FROM staff s
      LEFT JOIN departments d ON d.id = s.department_id
      LEFT JOIN pickup_points pp ON pp.id = s.pickup_point_id
      WHERE s.tc_no = ? AND s.is_active = 1
    `).get(p.tc_no) : null

    const room = db.prepare(`
      SELECT r.id as room_id, r.block, r.floor, r.room_no, ra.bed_no, ra.assigned_at
      FROM room_assignments ra JOIN rooms r ON r.id=ra.room_id
      WHERE ra.personnel_id=? AND ra.check_out_at IS NULL
    `).get(req.user.personnelId)

    const emergencyContacts = staff ? db.prepare(
      'SELECT name, relationship, phone FROM emergency_contacts WHERE staff_id = ? ORDER BY id'
    ).all(staff.id) : []

    const discipline = db.prepare(`
      SELECT SUM(CASE WHEN card_type='yellow' THEN 1 ELSE 0 END) as yellow,
        SUM(CASE WHEN card_type='red' THEN 1 ELSE 0 END) as red,
        COUNT(*) as total
      FROM discipline_records WHERE personnel_id = ?
    `).get(req.user.personnelId)

    const maintenanceOpen = db.prepare(
      `SELECT COUNT(*) as c FROM maintenance_requests WHERE reporter_personnel_id = ? AND status != 'done'`
    ).get(req.user.personnelId).c

    res.json({
      person: p,
      staff,
      room,
      emergency_contacts: emergencyContacts,
      discipline_total: discipline,
      maintenance_open: maintenanceOpen,
    })
  } catch (e) { logger.error('[my-profile]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// H2 M2 — Vardiyalarım
selfServiceRouter.get('/my-shifts', requireKioskOrStaff, (req, res) => {
  if (!req.user.personnelId) return res.status(403).json({ error: 'Kiosk token gerekli' })
  try {
    const db = getDB()
    const p = db.prepare('SELECT tc_no FROM personnel WHERE id=?').get(req.user.personnelId)
    if (!p?.tc_no) return res.json({ shifts: [], summary: { worked: 0, absent: 0, on_leave: 0, total: 0 }, message: 'TC numarası kayıtlı değil' })
    const staff = db.prepare('SELECT id FROM staff WHERE tc_no = ? AND is_active = 1').get(p.tc_no)
    if (!staff) return res.json({ shifts: [], summary: { worked: 0, absent: 0, on_leave: 0, total: 0 }, message: 'Vardiya kaydınız yok' })

    const shifts = db.prepare(`
      SELECT ss.work_date, ss.status,
        sd.name as shift_name, sd.start_hour, sd.end_hour, sd.color_class
      FROM shift_schedule ss
      LEFT JOIN shift_definitions sd ON sd.id = ss.shift_def_id
      WHERE ss.staff_id = ? AND ss.work_date BETWEEN date('now','-7 days') AND date('now','+14 days')
      ORDER BY ss.work_date
    `).all(staff.id)

    const summary = db.prepare(`
      SELECT
        SUM(CASE WHEN status='worked' THEN 1 ELSE 0 END) as worked,
        SUM(CASE WHEN status='absent' THEN 1 ELSE 0 END) as absent,
        SUM(CASE WHEN status='on_leave' THEN 1 ELSE 0 END) as on_leave,
        COUNT(*) as total
      FROM shift_schedule WHERE staff_id = ? AND work_date BETWEEN date('now','-30 days') AND date('now')
    `).get(staff.id)

    res.json({ shifts, summary })
  } catch (e) { logger.error('[my-shifts]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// H5 Q6 — Kişinin kendi QR'ı (mobile kart)
selfServiceRouter.get('/my-qr', requireKioskOrStaff, (req, res) => {
  if (!req.user.personnelId) return res.status(403).json({ error: 'Kiosk token gerekli' })
  try {
    const db = getDB()
    const p = db.prepare('SELECT tc_no, full_name FROM personnel WHERE id=?').get(req.user.personnelId)
    if (!p?.tc_no) return res.json({ qr_token: null, message: 'TC numarası kayıtlı değil' })
    const staff = db.prepare('SELECT qr_token FROM staff WHERE tc_no = ? AND is_active = 1').get(p.tc_no)
    res.json({ qr_token: staff?.qr_token || null, full_name: p.full_name })
  } catch (e) { logger.error('[my-qr]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// H2 M3 — Bugünkü servisim
selfServiceRouter.get('/my-transport', requireKioskOrStaff, (req, res) => {
  if (!req.user.personnelId) return res.status(403).json({ error: 'Kiosk token gerekli' })
  try {
    const db = getDB()
    const date = req.query.date || new Date().toISOString().slice(0, 10)
    const p = db.prepare('SELECT tc_no FROM personnel WHERE id=?').get(req.user.personnelId)
    if (!p?.tc_no) return res.json({ today: null, pickup: null, date, message: 'TC numarası kayıtlı değil' })
    const staff = db.prepare('SELECT id, pickup_point_id FROM staff WHERE tc_no = ? AND is_active = 1').get(p.tc_no)
    if (!staff) return res.json({ today: null, pickup: null, date, message: 'Personel kaydınız bulunamadı' })

    const today = db.prepare(`
      SELECT ra.id, ra.boarded, ra.is_waitlist,
        r.name as route_name, r.vehicle_plate, r.color, r.driver_name, r.driver_phone,
        rs.scheduled_time, pp.name as stop_name, pp.district
      FROM route_assignments ra
      JOIN routes r ON r.id = ra.route_id
      LEFT JOIN route_stops rs ON rs.id = ra.stop_id
      LEFT JOIN pickup_points pp ON pp.id = rs.pickup_point_id
      WHERE ra.staff_id = ? AND ra.work_date = ?
    `).get(staff.id, date) || null

    const pickup = staff.pickup_point_id ? db.prepare(
      'SELECT name, district, neighborhood, photo_url FROM pickup_points WHERE id = ?'
    ).get(staff.pickup_point_id) : null

    res.json({ today, pickup, date })
  } catch (e) { logger.error('[my-transport]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
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
  } catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

const requirePersonnel = (req, res, next) =>
  req.user.personnelId ? next() : res.status(403).json({ error: 'Kiosk token gerekli' })

selfServiceRouter.post('/maintenance', requireKioskOrStaff, requirePersonnel, validate(maintenanceSchema), (req, res) => {
  const { location, description } = req.body
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
  } catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
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
  } catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
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
  } catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

selfServiceRouter.post('/feedback', requireKioskOrStaff, requirePersonnel, validate(feedbackSchema), (req, res) => {
  const { type, message, anonymous } = req.body
  try {
    const db = getDB()
    const r = db.prepare(`
      INSERT INTO feedback(personnel_id, type, message) VALUES(?,?,?)
    `).run(anonymous ? null : req.user.personnelId, type, message.trim())
    res.status(201).json({ id: r.lastInsertRowid })
  } catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
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

selfServiceRouter.get('/laundry-kiosk/room-history', requireAvsKiosk, (req, res) => {
  const { block, room_no } = req.query
  if (!block || !room_no) return res.status(400).json({ error: 'block ve room_no gerekli' })
  try {
    const summary = getRoomLaundrySummaryQuery(block, room_no)
    const items = getRoomLaundryHistoryQuery(block, room_no)
    res.json({ summary, items })
  } catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

selfServiceRouter.get('/laundry-kiosk/block-room-counts', requireAvsKiosk, (req, res) => {
  const { block } = req.query
  if (!block) return res.status(400).json({ error: 'block gerekli' })
  try {
    const rows = getBlockRoomActiveCountsQuery(block)
    res.json(rows)
  } catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
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
    // Giriş history'si (hub createItemService paritesi) + operatör damgası
    db.prepare(`INSERT INTO laundry_history(item_id, from_status, to_status, worker_id, notes) VALUES(?, NULL, 'dirty', ?, ?)`)
      .run(id, req.user.workerId || null, `${count} parça kiosk giriş`)
    res.status(201).json({ id, bag_no })
  } catch (e) { logger.error('[kiosk/bag]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

selfServiceRouter.get('/laundry-kiosk/bags', requireAvsKiosk, (req, res) => {
  const { block, room_no, status } = req.query
  try {
    const db = getDB()
    let q = `SELECT li.id, li.bag_no, li.status, li.item_count, li.urgent, li.is_premium, li.needs_ironing,
                    li.created_at, li.updated_at, li.intake_name, li.notes, li.garments_json, li.shelf_location,
                    r.block, r.room_no,
                    li.machine_id, lm.name AS machine_name, lm.timer_end AS machine_timer_end
             FROM laundry_items li JOIN rooms r ON r.id = li.room_id
             LEFT JOIN laundry_machines lm ON lm.id = li.machine_id WHERE 1=1`
    const params = []
    if (block)   { q += ' AND r.block=?';   params.push(block) }
    if (room_no) { q += ' AND r.room_no=?'; params.push(room_no) }
    if (status)  { q += ' AND li.status=?'; params.push(status) }
    else         { q += ` AND li.status NOT IN ('delivered','lost')` }
    q += ' ORDER BY li.urgent DESC, li.created_at ASC LIMIT 50'
    res.json(db.prepare(q).all(...params))
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

// NOT: eski generic PUT /bags/:id/status ucu kaldırıldı — her şeyi bypass eden
// serbest geçişti ve hiçbir frontend tüketicisi yoktu. Tüm durum geçişleri artık
// ana state machine üzerinden (assign/wash-complete/ironing-complete/deliver).

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
    const me = db.prepare('SELECT full_name FROM personnel WHERE id=?').get(req.user.personnelId)
    // Ana teslim servisi: laundry_deliveries + history + premium parça teslimi
    deliverItemService(item.id, { delivered_to: me?.full_name || 'Sakin (self)', signature_data: signature || null }, null)
    db.prepare(`UPDATE laundry_items SET delivered_name=?, occupant_signature=? WHERE id=?`)
      .run(me?.full_name || 'Sakin (self)', signature || null, item.id)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

selfServiceRouter.put('/laundry-kiosk/bags/:id/ironing', requireAvsKiosk, (req, res) => {
  const { needs_ironing } = req.body
  try {
    const db = getDB()
    db.prepare("UPDATE laundry_items SET needs_ironing=?, last_modified_worker_id=?, last_modified_at=datetime('now'), updated_at=datetime('now') WHERE id=?")
      .run(needs_ironing ? 1 : 0, req.user.workerId || null, Number(req.params.id))
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Ütü tamam → hazıra al — ana state machine üzerinden: history + "rafta hazır"
// bildirimi + sakine WhatsApp artık ütüden çıkan torbalarda da gider
// (eskiden sadece yıkamadan hazıra geçenlerde gidiyordu).
selfServiceRouter.post('/laundry-kiosk/bags/:id/ironing-complete', requireAvsKiosk, (req, res) => {
  try {
    const db = getDB()
    const item = db.prepare('SELECT id, status FROM laundry_items WHERE id=?').get(Number(req.params.id))
    if (!item) return res.status(404).json({ error: 'Torba bulunamadı' })
    if (item.status !== 'ironing') return res.status(400).json({ error: 'Torba ironing durumunda değil' })
    const shelf = (req.body?.shelf_location || '').trim() || null
    advanceItemService(item.id, { shelf_location: shelf }, null)
    db.prepare("UPDATE laundry_items SET last_modified_worker_id=?, last_modified_at=datetime('now') WHERE id=?")
      .run(req.user.workerId || null, item.id)
    stampHistoryWorker(db, item.id, req.user.workerId)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// Yanlış girişi telafi — sadece kirli (henüz işlenmemiş) ve 15 dk'dan yeni
// torba kiosktan iptal edilebilir; sonrası yönetici işi.
selfServiceRouter.post('/laundry-kiosk/bags/:id/void', requireAvsKiosk, (req, res) => {
  try {
    const db = getDB()
    const item = db.prepare(`
      SELECT id, status, (julianday('now') - julianday(created_at)) * 24 * 60 AS age_min
      FROM laundry_items WHERE id=?
    `).get(Number(req.params.id))
    if (!item) return res.status(404).json({ error: 'Torba bulunamadı' })
    if (item.status !== 'dirty') return res.status(400).json({ error: 'Sadece henüz işlenmemiş (kirli) torba iptal edilebilir' })
    if (item.age_min > 15) return res.status(400).json({ error: 'İptal süresi doldu (15 dk) — yöneticiye başvurun' })
    deleteItemService(item.id, null)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// Kayıp işaretleme — ana modülün lostItemService'i (history + vardiya amiri
// bildirimi + makine serbest bırakma dahil)
selfServiceRouter.post('/laundry-kiosk/bags/:id/lost', requireAvsKiosk, (req, res) => {
  try {
    const notes = (req.body?.notes || '').trim() || 'Kiosk: teslimde bulunamadı'
    lostItemService(Number(req.params.id), { notes }, null)
    const dbL = getDB()
    dbL.prepare("UPDATE laundry_items SET last_modified_worker_id=?, last_modified_at=datetime('now') WHERE id=?")
      .run(req.user.workerId || null, Number(req.params.id))
    stampHistoryWorker(dbL, Number(req.params.id), req.user.workerId)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// Teslim — ana modülün deliverItemService'i üzerinden: laundry_deliveries
// kaydı + history + premium parça teslimi + audit hub ile birebir aynı.
// Kiosk'a özgü kolonlar (delivered_name/file_count/occupant_signature/worker)
// servis çağrısından sonra ayrıca yazılır.
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
    deliverItemService(item.id, { delivered_to: delivered_name.trim(), signature_data: signature || null }, null)
    db.prepare(`
      UPDATE laundry_items
      SET delivered_name=?, file_count=?, occupant_signature=?,
          last_modified_worker_id=?, last_modified_at=datetime('now')
      WHERE id=?
    `).run(delivered_name.trim(), fc, signature || null, req.user.workerId || null, item.id)
    stampHistoryWorker(db, item.id, req.user.workerId)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// M ve S bloklar standart camasir akisi (dirty status). Y bloklar
// (A, A1-A4, B, C, D, E, F, G, H, J) "premium" ozel banyolu kabul edilip
// ironing akisina gider.
const STANDARD_BLOCKS = new Set(['M1', 'M2', 'M3', 'S1', 'S2', 'S3'])

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
    const isStandard = STANDARD_BLOCKS.has(block.toUpperCase())
    const itemStatus = isStandard ? 'dirty' : 'ironing'
    const id = insertItemQuery({
      room_id: room.id,
      item_count: total,
      status: itemStatus,
      needs_ironing: isStandard ? 0 : 1,
      is_premium: 1,
      garments_json: JSON.stringify(clothing_items),
      intake_name: intake_name || null,
      intake_signature: intake_signature || null,
      created_by: null,
    })
    db.prepare(`INSERT INTO laundry_history(item_id, from_status, to_status, worker_id, notes) VALUES(?, NULL, ?, ?, ?)`)
      .run(id, itemStatus, req.user.workerId || null, `${total} parça kiosk giriş (garment)`)
    res.status(201).json({ id })
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

selfServiceRouter.get('/laundry-kiosk/machines', requireAvsKiosk, (req, res) => {
  try { res.json(listMachinesQuery()) }
  catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Makineye yükleme — ana modüldeki state machine'i kullanır (timer + deterjan
// stok düşümü + history + queue temizliği ana akışla birebir aynı olsun diye).
selfServiceRouter.put('/laundry-kiosk/machines/:id/assign', requireAvsKiosk, (req, res) => {
  const { item_id, timer_minutes } = req.body
  if (!item_id) return res.status(400).json({ error: 'item_id gerekli' })
  try {
    const db = getDB()
    const item = db.prepare('SELECT id, status FROM laundry_items WHERE id=?').get(Number(item_id))
    if (!item) return res.status(404).json({ error: 'Torba bulunamadı' })
    if (item.status !== 'dirty') return res.status(400).json({ error: 'Torba kirli durumunda değil' })
    advanceItemService(Number(item_id), {
      machine_id: Number(req.params.id),
      timer_minutes: timer_minutes ? Number(timer_minutes) : null,
    }, null)
    db.prepare("UPDATE laundry_items SET last_modified_worker_id=?, last_modified_at=datetime('now') WHERE id=?")
      .run(req.user.workerId || null, Number(item_id))
    stampHistoryWorker(db, Number(item_id), req.user.workerId)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// Toplu makine yükleme — birden çok kirli torba tek seferde aynı makineye.
// Kirli olmayanlar failed listesine düşer; makine meşgul/bakımda guard'ı
// batchAssignService içinde.
selfServiceRouter.post('/laundry-kiosk/machines/:id/batch-assign', requireAvsKiosk, (req, res) => {
  const { item_ids, timer_minutes } = req.body
  if (!Array.isArray(item_ids) || item_ids.length === 0) return res.status(400).json({ error: 'item_ids[] gerekli' })
  try {
    const db = getDB()
    const dirtyIds = []
    const failed = []
    for (const id of item_ids.map(Number)) {
      const item = db.prepare('SELECT id, status FROM laundry_items WHERE id=?').get(id)
      if (!item) failed.push({ id, error: 'Torba bulunamadı' })
      else if (item.status !== 'dirty') failed.push({ id, error: 'Torba kirli durumunda değil' })
      else dirtyIds.push(id)
    }
    const result = dirtyIds.length
      ? batchAssignService(dirtyIds, Number(req.params.id), timer_minutes ? Number(timer_minutes) : null, null)
      : { success: [], failed: [] }
    for (const id of result.success) {
      db.prepare("UPDATE laundry_items SET last_modified_worker_id=?, last_modified_at=datetime('now') WHERE id=?")
        .run(req.user.workerId || null, id)
      stampHistoryWorker(db, id, req.user.workerId)
    }
    res.json({ success: result.success, failed: [...failed, ...result.failed] })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// Odanın tüm hazır torbalarını tek seferde teslim — tek isim + tek imza.
// file_count torba başına 1 yazılır (tek-torba akışındaki alan oradaki gibi kalır).
selfServiceRouter.post('/laundry-kiosk/deliver-room', requireAvsKiosk, (req, res) => {
  const { block, room_no, delivered_name, signature } = req.body
  if (!block || !room_no) return res.status(400).json({ error: 'block ve room_no gerekli' })
  if (!delivered_name || !delivered_name.trim()) return res.status(400).json({ error: 'delivered_name gerekli' })
  try {
    const db = getDB()
    const bags = db.prepare(`
      SELECT li.id, li.bag_no FROM laundry_items li
      JOIN rooms r ON r.id = li.room_id
      WHERE r.block=? AND r.room_no=? AND li.status='ready'
    `).all(block, room_no)
    if (bags.length === 0) return res.status(404).json({ error: 'Bu odada hazır torba yok' })
    // Her torba ana teslim servisinden geçer (deliveries+history+premium);
    // biri hata verirse diğerleri etkilenmez (batch-assign deseni)
    const extraStmt = db.prepare(`
      UPDATE laundry_items
      SET delivered_name=?, file_count=1, occupant_signature=?,
          last_modified_worker_id=?, last_modified_at=datetime('now')
      WHERE id=?
    `)
    const delivered = []
    const failed = []
    for (const b of bags) {
      try {
        deliverItemService(b.id, { delivered_to: delivered_name.trim(), signature_data: signature || null }, null)
        extraStmt.run(delivered_name.trim(), signature || null, req.user.workerId || null, b.id)
        stampHistoryWorker(db, b.id, req.user.workerId)
        delivered.push(b.bag_no || `#${b.id}`)
      } catch (e) {
        failed.push({ id: b.id, error: e.message })
      }
    }
    res.json({ ok: true, delivered: delivered.length, bag_nos: delivered, failed })
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Makinenin gün-gün koşu kırılımı — kiosk Makineler genel bakışı için
selfServiceRouter.get('/laundry-kiosk/machines/:id/daily-runs', requireAvsKiosk, (req, res) => {
  try {
    res.json(getMachineDailyRunsService(Number(req.params.id), Number(req.query.days) || 14))
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Bakım yapıldı — sayaç sıfırlanır; bakımı fiilen yapan kiosk operatörü işaretler
selfServiceRouter.post('/laundry-kiosk/machines/:id/maintenance-done', requireAvsKiosk, (req, res) => {
  try {
    res.json(maintenanceDoneService(Number(req.params.id), null))
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// Kayıp torba bulundu — lost→ready geri döner, sakine "bulundu" WhatsApp'ı gider
selfServiceRouter.post('/laundry-kiosk/bags/:id/found', requireAvsKiosk, async (req, res) => {
  try {
    const db = getDB()
    const item = db.prepare('SELECT id, status FROM laundry_items WHERE id=?').get(Number(req.params.id))
    if (!item) return res.status(404).json({ error: 'Torba bulunamadı' })
    if (item.status !== 'lost') return res.status(400).json({ error: 'Torba kayıp durumunda değil' })
    markFoundService(item.id, null)
    db.prepare("UPDATE laundry_items SET last_modified_worker_id=?, last_modified_at=datetime('now') WHERE id=?")
      .run(req.user.workerId || null, item.id)
    stampHistoryWorker(db, item.id, req.user.workerId)
    try {
      const full = getItemService(item.id)
      if (full) await sendFoundMessage(full)
    } catch {}
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// SLA eşikleri — kiosk panosundaki bekleme rozetleri hub ile aynı
// config'ten (laundry_sla_config) beslensin diye
selfServiceRouter.get('/laundry-kiosk/sla-config', requireAvsKiosk, (req, res) => {
  try {
    res.json(getSlaConfigQuery().map(c => ({
      stage: c.stage, warning_hours: c.warning_hours, critical_hours: c.critical_hours,
    })))
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Operatör kırılımı — bugün kim kaç işlem yaptı (vardiya devri/değerlendirme)
selfServiceRouter.get('/laundry-kiosk/operator-summary', requireAvsKiosk, (req, res) => {
  try {
    res.json(getOperatorSummaryService(Number(req.query.days) || 1))
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Gün özeti — vardiya devri için üç sayı + aktif durum kırılımı
selfServiceRouter.get('/laundry-kiosk/today-summary', requireAvsKiosk, (req, res) => {
  try {
    const db = getDB()
    const row = db.prepare(`
      SELECT
        SUM(CASE WHEN date(li.created_at)=date('now','localtime') THEN 1 ELSE 0 END) as intake_today,
        SUM(CASE WHEN li.status='delivered' AND date(li.updated_at)=date('now','localtime') THEN 1 ELSE 0 END) as delivered_today,
        SUM(CASE WHEN li.status NOT IN ('delivered','lost') THEN 1 ELSE 0 END) as active_total,
        SUM(CASE WHEN li.status='ready' THEN 1 ELSE 0 END) as ready_waiting
      FROM laundry_items li
    `).get()
    res.json({
      intake_today: row.intake_today || 0,
      delivered_today: row.delivered_today || 0,
      active_total: row.active_total || 0,
      ready_waiting: row.ready_waiting || 0,
    })
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Yıkama bitti — needs_ironing'e göre ütüye ya da hazıra geçer; makine 'done'
// olur, premium parçalar ve hazır bildirimi ana akıştaki gibi işler.
selfServiceRouter.post('/laundry-kiosk/bags/:id/wash-complete', requireAvsKiosk, (req, res) => {
  try {
    const db = getDB()
    const item = db.prepare('SELECT id, status FROM laundry_items WHERE id=?').get(Number(req.params.id))
    if (!item) return res.status(404).json({ error: 'Torba bulunamadı' })
    if (item.status !== 'washing') return res.status(400).json({ error: 'Torba makinede değil' })
    const shelf = (req.body?.shelf_location || '').trim() || null
    const updated = advanceItemService(item.id, { shelf_location: shelf }, null)
    db.prepare("UPDATE laundry_items SET last_modified_worker_id=?, last_modified_at=datetime('now') WHERE id=?")
      .run(req.user.workerId || null, item.id)
    stampHistoryWorker(db, item.id, req.user.workerId)
    res.json({ ok: true, next_status: updated.status })
  } catch (e) { res.status(400).json({ error: e.message }) }
})
