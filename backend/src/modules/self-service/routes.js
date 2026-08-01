import { Router } from 'express'
import { unlinkSync } from 'node:fs'
import { requireKioskOrStaff, requireLaundryKioskOperator } from '../../shared/auth/middleware.js'
import { getDB } from '../../shared/db/index.js'
import { createRequest } from '../maintenance/queries.js'
import { changeKioskPin } from '../../shared/auth/service.js'
import { createLeaveService } from '../shifts/service.js'
import { getLeaveBalance } from '../shifts/queries.js'
import { createNotification } from '../../shared/notifications/service.js'
import { validate } from '../../shared/middleware/validate.js'
import { maintenanceSchema, feedbackSchema } from './schemas.js'
import {
  insertItemQuery, listMachinesQuery, collectItemQuery, setBagNoQuery,
  getRoomLaundryHistoryQuery, getRoomLaundrySummaryQuery,
  getBlockRoomActiveCountsQuery, getSlaConfigQuery, isBlockPremiumQuery,
  insertTrackedGarmentsQuery, getPremiumGarmentsQuery,
  getGarmentProgressQuery, getGarmentWithItemQuery, setGarmentIroningQuery,
  insertGarmentExceptionQuery, updateGarmentDetailsQuery, MISSING_TAG_SQL,
  upsertArchiveGarmentsQuery, getRoomWardrobeQuery, listArchiveBrandsQuery,
  deleteArchiveGarmentQuery,
} from '../laundry/queries.js'
import { advanceItemService, batchAssignService, lostItemService, deleteItemService, deliverItemService, maintenanceDoneService, markFoundService, getItemService, getMachineDailyRunsService, getOperatorSummaryService } from '../laundry/service.js'
import { sendFoundMessage } from '../laundry/whatsapp.js'
import { createImageUpload, verifyMagicBytes } from '../../shared/uploads/middleware.js'
import { logger } from '../../shared/logger.js'
import { getStaffTransport } from '../transport/self-service.js'

export const selfServiceRouter = Router()

// `laundry-` öneki gecelik yetim dosya temizliğinin dosyaları hangi modüle ait
// olduğunu anlamasını sağlar (bkz. laundry/photo-retention.js).
const upload = createImageUpload('laundry')

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

function laundryActor(req) {
  return req.laundryOperator?.type === 'user'
    ? { userId: req.laundryOperator.id, workerId: null, name: req.laundryOperator.name }
    : { userId: null, workerId: req.laundryOperator?.id || req.user.workerId, name: req.laundryOperator?.name }
}

function safeJsonArray(raw) {
  try {
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function removeLaundryUpload(req) {
  if (!req.file?.path) return
  try { unlinkSync(req.file.path) } catch { /* already removed */ }
}

// AVS personeli için user_id NULL kalır; "kim yaptı" sorgulanabilsin diye
// worker_id kolonu da doldurulur (migration 071).
function auditLaundryKiosk(db, req, action, targetId, detail = {}) {
  const actor = laundryActor(req)
  db.prepare(`
    INSERT INTO audit_log(user_id, worker_id, action, module, target_id, detail)
    VALUES(?, ?, ?, 'laundry-kiosk', ?, ?)
  `).run(actor.userId, actor.workerId || null, action, targetId, JSON.stringify({
    ...detail,
    workerId: actor.workerId,
    operatorName: actor.name || null,
  }))
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
        sd.name as shift_name, sd.start_hour, sd.end_hour, sd.color_class,
        CASE WHEN ss.status = 'on_leave' THEN COALESCE(ss.leave_type, (
          SELECT lr.leave_type FROM leave_requests lr
          WHERE lr.staff_id = ss.staff_id AND lr.status = 'approved'
            AND lr.start_date <= ss.work_date AND lr.end_date >= ss.work_date
          ORDER BY lr.id DESC LIMIT 1
        )) END as leave_type
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
        SUM(CASE WHEN status='off' THEN 1 ELSE 0 END) as off,
        COUNT(*) as total
      FROM shift_schedule WHERE staff_id = ? AND work_date BETWEEN date('now','-30 days') AND date('now')
    `).get(staff.id)

    res.json({ shifts, summary })
  } catch (e) { logger.error('[my-shifts]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// P2 — İzin talepleri (kiosk self-service): personel TC → staff eşleşmesi üzerinden
function staffFromPersonnel(db, personnelId) {
  const p = db.prepare('SELECT tc_no FROM personnel WHERE id=?').get(personnelId)
  if (!p?.tc_no) return null
  return db.prepare('SELECT id, full_name FROM staff WHERE tc_no = ? AND is_active = 1').get(p.tc_no) || null
}

selfServiceRouter.get('/my-leaves', requireKioskOrStaff, (req, res) => {
  if (!req.user.personnelId) return res.status(403).json({ error: 'Kiosk token gerekli' })
  try {
    const db = getDB()
    const staff = staffFromPersonnel(db, req.user.personnelId)
    if (!staff) return res.json({ leaves: [], balance: null, message: 'Personel (staff) kaydınız bulunamadı' })

    const leaves = db.prepare(`
      SELECT id, leave_type, start_date, end_date, total_days, reason, status, created_at
      FROM leave_requests WHERE staff_id = ?
      ORDER BY created_at DESC LIMIT 20
    `).all(staff.id)
    const balance = getLeaveBalance(staff.id, new Date().getFullYear())
    res.json({ leaves, balance })
  } catch (e) { console.error('[my-leaves]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

const LEAVE_TYPES = ['annual', 'sick', 'emergency', 'maternity', 'paternity', 'marriage', 'bereavement']

selfServiceRouter.post('/leave-request', requireKioskOrStaff, (req, res) => {
  if (!req.user.personnelId) return res.status(403).json({ error: 'Kiosk token gerekli' })
  const { leave_type, start_date, end_date, reason } = req.body || {}
  if (!LEAVE_TYPES.includes(leave_type)) return res.status(400).json({ error: 'Geçersiz izin tipi' })
  if (!start_date || !end_date) return res.status(400).json({ error: 'start_date ve end_date gerekli' })
  try {
    const db = getDB()
    const staff = staffFromPersonnel(db, req.user.personnelId)
    if (!staff) return res.status(404).json({ error: 'Personel (staff) kaydınız bulunamadı — yönetime başvurun' })

    // Aynı aralıkla çakışan bekleyen/onaylı talep varsa engelle
    const overlap = db.prepare(`
      SELECT id FROM leave_requests
      WHERE staff_id = ? AND status IN ('pending','approved')
        AND start_date <= ? AND end_date >= ?
    `).get(staff.id, end_date, start_date)
    if (overlap) return res.status(400).json({ error: 'Bu tarih aralığında bekleyen/onaylı bir talebiniz zaten var' })

    const id = createLeaveService({
      staff_id: staff.id, leave_type, start_date, end_date, reason: reason || null,
    })
    createNotification({
      message: `İzin talebi: ${staff.full_name} — ${leave_type} ${start_date} → ${end_date}`,
      type: 'info', module: 'shifts', target_role: 'campus_manager',
      dedup_key: `leave_req_${id}`,
    })
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
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
    const staff = db.prepare('SELECT id FROM staff WHERE tc_no = ? AND is_active = 1').get(p.tc_no)
    if (!staff) return res.json({ today: null, pickup: null, date, message: 'Personel kaydınız bulunamadı' })

    const v2 = getStaffTransport(staff.id, date)
    if (v2.today || v2.upcoming.length || v2.history.length) return res.json(v2)

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

    res.json({ ...v2, today })
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

selfServiceRouter.get('/laundry-kiosk/session', requireLaundryKioskOperator, (req, res) => {
  const actor = laundryActor(req)
  res.json({
    role: req.user.role === 'campus_manager' ? 'campus_manager' : 'laundry',
    operator: {
      type: actor.userId ? 'user' : 'worker',
      id: actor.userId || actor.workerId,
      name: actor.name,
    },
    capabilities: {
      operate: true,
      persistent_offline_queue: Boolean(actor.workerId),
    },
  })
})

selfServiceRouter.get('/laundry-kiosk/overview', requireLaundryKioskOperator, (req, res) => {
  try {
    const db = getDB()
    const summary = db.prepare(`
      SELECT
        SUM(CASE WHEN date(created_at,'localtime')=date('now','localtime') THEN 1 ELSE 0 END)
          AS intake_today,
        SUM(CASE WHEN status='delivered'
          AND date(updated_at,'localtime')=date('now','localtime') THEN 1 ELSE 0 END)
          AS delivered_today,
        SUM(CASE WHEN status='dirty' THEN 1 ELSE 0 END) AS dirty,
        SUM(CASE WHEN status='washing' THEN 1 ELSE 0 END) AS washing,
        SUM(CASE WHEN status='ironing' THEN 1 ELSE 0 END) AS ironing,
        SUM(CASE WHEN status='ready' THEN 1 ELSE 0 END) AS ready,
        SUM(CASE WHEN urgent=1 AND status NOT IN ('delivered','lost') THEN 1 ELSE 0 END)
          AS urgent
      FROM laundry_items
    `).get()
    const slaBreaches = db.prepare(`
      SELECT COUNT(*) AS count
      FROM laundry_items li
      LEFT JOIN laundry_sla_config cfg ON cfg.stage=li.status
      WHERE li.status NOT IN ('delivered','lost')
        AND (
          (cfg.critical_hours IS NOT NULL
            AND (julianday('now')-julianday(li.updated_at))*24 >= cfg.critical_hours)
          OR (li.status='ironing'
            AND (julianday('now')-julianday(li.updated_at))*24 >= 8)
        )
    `).get().count
    const nextJobs = db.prepare(`
      SELECT li.id, li.bag_no, li.status, li.item_count, li.urgent,
             li.shelf_location, r.block, r.room_no, lm.name AS machine_name
      FROM laundry_items li
      JOIN rooms r ON r.id=li.room_id
      LEFT JOIN laundry_machines lm ON lm.id=li.machine_id
      WHERE li.status NOT IN ('delivered','lost')
      ORDER BY
        li.urgent DESC,
        CASE li.status
          WHEN 'washing' THEN 1 WHEN 'ironing' THEN 2
          WHEN 'ready' THEN 3 ELSE 4
        END,
        li.updated_at ASC
      LIMIT 8
    `).all()
    res.json({
      summary: {
        intake_today: summary.intake_today || 0,
        delivered_today: summary.delivered_today || 0,
        dirty: summary.dirty || 0,
        washing: summary.washing || 0,
        ironing: summary.ironing || 0,
        ready: summary.ready || 0,
        urgent: summary.urgent || 0,
        sla_breaches: slaBreaches || 0,
      },
      next_jobs: nextJobs,
    })
  } catch (e) {
    logger.error('[kiosk overview]', e)
    res.status(500).json({ error: 'Sunucu hatası' })
  }
})

selfServiceRouter.get('/laundry-kiosk/blocks', (req, res) => {
  try {
    const db = getDB()
    const blocks = db.prepare('SELECT DISTINCT block FROM rooms ORDER BY block').all().map(r => r.block)
    res.json(blocks)
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

selfServiceRouter.get('/laundry-kiosk/room-persons', requireLaundryKioskOperator, (req, res) => {
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

selfServiceRouter.get('/laundry-kiosk/room-history', requireLaundryKioskOperator, (req, res) => {
  const { block, room_no } = req.query
  if (!block || !room_no) return res.status(400).json({ error: 'block ve room_no gerekli' })
  try {
    const summary = getRoomLaundrySummaryQuery(block, room_no)
    const items = getRoomLaundryHistoryQuery(block, room_no)
    res.json({ summary, items })
  } catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Odanın kıyafet dolabı — daha önce görülmüş parçalar. Yeni girişte tek
// dokunuşla geri eklenir; marka/beden tekrar yazılmaz.
selfServiceRouter.get('/laundry-kiosk/room-wardrobe', requireLaundryKioskOperator, (req, res) => {
  const { block, room_no, owner_name, limit } = req.query
  if (!block || !room_no) return res.status(400).json({ error: 'block ve room_no gerekli' })
  try {
    const rows = getRoomWardrobeQuery(block, room_no, {
      ownerName: owner_name ? String(owner_name) : null,
      limit: limit ? Number(limit) : 24,
    })
    res.json(rows.map(row => ({
      ...row,
      colors: safeJsonArray(row.colors_json),
    })))
  } catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Marka önerileri — operatör markayı baştan yazmasın.
selfServiceRouter.get('/laundry-kiosk/brands', requireLaundryKioskOperator, (req, res) => {
  try {
    res.json(listArchiveBrandsQuery(req.query.q || '', 12))
  } catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Dolaptan kaldır — kişi taşındı ya da kıyafet artık gelmiyor.
selfServiceRouter.delete('/laundry-kiosk/wardrobe/:id', requireLaundryKioskOperator, (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) return res.status(404).json({ error: 'Kayıt bulunamadı' })
  try {
    if (!deleteArchiveGarmentQuery(id)) return res.status(404).json({ error: 'Kayıt bulunamadı' })
    auditLaundryKiosk(getDB(), req, 'laundry_kiosk_wardrobe_delete', id, {})
    res.json({ ok: true })
  } catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

selfServiceRouter.get('/laundry-kiosk/block-room-counts', requireLaundryKioskOperator, (req, res) => {
  const { block } = req.query
  if (!block) return res.status(400).json({ error: 'block gerekli' })
  try {
    const rows = getBlockRoomActiveCountsQuery(block)
    res.json(rows)
  } catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

selfServiceRouter.get('/laundry-kiosk/garment-types', requireLaundryKioskOperator, (req, res) => {
  try {
    const db = getDB()
    const types = db.prepare('SELECT * FROM laundry_garment_types WHERE is_active=1 ORDER BY sort_order ASC').all()
    res.json(types)
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Multipart destekli: foto eklenirse FormData gelir (alanlar string'leşir —
// JSON alanları parse edilir); fotosuz JSON gövde aynen çalışır.
selfServiceRouter.post('/laundry-kiosk/bag', requireLaundryKioskOperator, upload.single('photo'), verifyMagicBytes, (req, res) => {
  const { block, room_no, personnel_id, item_count, notes, intake_signature } = req.body
  let {
    is_premium, urgent, clothing_items, garments, client_request_id, tracking_mode,
  } = req.body
  // FormData'da boolean/array alanlar string gelir
  const truthy = (v) => v === true || v === 1 || v === '1' || v === 'true'
  is_premium = truthy(is_premium)
  urgent = truthy(urgent)
  try { if (typeof clothing_items === 'string') clothing_items = clothing_items ? JSON.parse(clothing_items) : null } catch { clothing_items = null }
  try { if (typeof garments === 'string') garments = garments ? JSON.parse(garments) : null } catch { garments = null }
  if (!block || !room_no) {
    removeLaundryUpload(req)
    return res.status(400).json({ error: 'block ve room_no gerekli' })
  }
  const count = Number(item_count)
  if (!count || count < 1 || count > 99) {
    removeLaundryUpload(req)
    return res.status(400).json({ error: 'Geçersiz adet (1-99)' })
  }
  client_request_id = typeof client_request_id === 'string' ? client_request_id.trim() : ''
  if (client_request_id && !/^[a-zA-Z0-9-]{8,80}$/.test(client_request_id)) {
    removeLaundryUpload(req)
    return res.status(400).json({ error: 'Geçersiz client_request_id' })
  }
  const hasGarments = Array.isArray(garments) && garments.length > 0
  tracking_mode = hasGarments ? 'individual' : (tracking_mode === 'legacy' ? 'legacy' : 'count_only')
  if (hasGarments) {
    const structuredCount = garments.reduce(
      (sum, garment) => sum + Math.min(99, Math.max(1, Number(garment.count) || 1)),
      0
    )
    if (structuredCount !== count) {
      removeLaundryUpload(req)
      return res.status(400).json({ error: 'Kıyafet adedi toplam parça sayısıyla eşleşmiyor' })
    }
  }
  try {
    const db = getDB()
    if (client_request_id) {
      const existing = db.prepare(
        'SELECT id, bag_no, tracking_mode FROM laundry_items WHERE client_request_id=?'
      ).get(client_request_id)
      if (existing) {
        removeLaundryUpload(req)
        return res.json({
          ...existing,
          idempotent: true,
          garments: getPremiumGarmentsQuery(existing.id),
        })
      }
    }
    const room = db.prepare('SELECT id FROM rooms WHERE block=? AND room_no=?').get(block, room_no)
    if (!room) {
      removeLaundryUpload(req)
      return res.status(404).json({ error: 'Oda bulunamadı' })
    }
    const intake_name = personnel_id
      ? db.prepare('SELECT full_name FROM personnel WHERE id=?').get(Number(personnel_id))?.full_name
      : null
    const actor = laundryActor(req)
    const created = db.transaction(() => {
      const id = insertItemQuery({
        room_id: room.id,
        item_count: count,
        status: 'dirty',
        is_premium: is_premium ? 1 : (isBlockPremiumQuery(block) ? 1 : 0),
        notes: notes || null,
        urgent: urgent ? 1 : 0,
        intake_signature: intake_signature || null,
        intake_name: intake_name || null,
        clothing_items: clothing_items ? JSON.stringify(clothing_items) : null,
        garments_json: hasGarments ? JSON.stringify(garments) : null,
        photo_url: req.file ? '/uploads/' + req.file.filename : null,
        created_by: actor.userId,
        client_request_id: client_request_id || null,
        tracking_mode,
      })
      const bag_no = setBagNoQuery(id)
      const tracked = hasGarments
        ? insertTrackedGarmentsQuery(id, garments, { source: 'kiosk' })
        : []
      // Odanın dolabını güncelle — bir dahaki girişte tek dokunuşla geri eklensin.
      // Arşiv yan üründür: hatası torba girişini düşürmemeli.
      if (hasGarments) {
        try {
          upsertArchiveGarmentsQuery(room.id, intake_name || null, garments)
        } catch (archiveError) {
          logger.warn('[kiosk/bag] arşiv güncellenemedi: ' + archiveError.message)
        }
      }
      const needsIroning = tracked.some(garment => garment.requires_ironing === 1)
      db.prepare('UPDATE laundry_items SET needs_ironing=? WHERE id=?')
        .run(needsIroning ? 1 : 0, id)
      db.prepare(`
        INSERT INTO laundry_history(
          item_id, from_status, to_status, action_by, worker_id, notes
        ) VALUES(?, NULL, 'dirty', ?, ?, ?)
      `).run(id, actor.userId, actor.workerId, `${count} parça kiosk giriş`)
      auditLaundryKiosk(db, req, 'laundry_kiosk_intake', id, {
        bagNo: bag_no,
        itemCount: count,
        trackingMode: tracking_mode,
      })
      return { id, bag_no, tracking_mode, garments: tracked }
    }).immediate()
    res.status(201).json(created)
  } catch (e) {
    removeLaundryUpload(req)
    logger.error('[kiosk/bag]', e)
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE' && client_request_id) {
      const existing = getDB().prepare(
        'SELECT id, bag_no, tracking_mode FROM laundry_items WHERE client_request_id=?'
      ).get(client_request_id)
      if (existing) {
        return res.json({
          ...existing,
          idempotent: true,
          garments: getPremiumGarmentsQuery(existing.id),
        })
      }
    }
    res.status(e.code === 'SQLITE_CONSTRAINT_UNIQUE' ? 409 : 500).json({
      error: e.code === 'SQLITE_CONSTRAINT_UNIQUE'
        ? 'Bu giriş daha önce kaydedildi'
        : 'Sunucu hatası',
    })
  }
})

selfServiceRouter.get('/laundry-kiosk/bags', requireLaundryKioskOperator, (req, res) => {
  const { block, room_no, status } = req.query
  try {
    const db = getDB()
    let q = `SELECT li.id, li.bag_no, li.status, li.item_count, li.urgent, li.is_premium, li.needs_ironing,
                    li.created_at, li.updated_at, li.intake_name, li.notes, li.garments_json, li.shelf_location, li.photo_url,
                    li.tracking_mode, li.client_request_id,
                    (SELECT COUNT(*) FROM premium_garments pg WHERE pg.item_id=li.id) AS garment_total,
                    (SELECT COUNT(*) FROM premium_garments pg WHERE pg.item_id=li.id AND pg.status='ready') AS garment_ready,
                    (SELECT COUNT(*) FROM premium_garments pg WHERE pg.item_id=li.id AND pg.status='ironing') AS garment_ironing,
                    (SELECT COUNT(*) FROM premium_garments pg WHERE pg.item_id=li.id AND pg.status='lost') AS garment_missing,
                    (SELECT COUNT(*) FROM premium_garments pg WHERE pg.item_id=li.id AND pg.status='damaged') AS garment_damaged,
                    -- Künyesi hiç girilmemiş parçalar: operatör kıyafeti elinde
                    -- tutarken tamamlasın diye torba listesinde rozetlenir.
                    -- Koşul kıyafet aramasıyla ORTAK (MISSING_TAG_SQL) — iki
                    -- ekran aynı parçayı farklı sınıflandırmasın.
                    (SELECT COUNT(*) FROM premium_garments pg
                     WHERE pg.item_id=li.id AND ${MISSING_TAG_SQL}
                    ) AS garment_untagged,
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

selfServiceRouter.get('/laundry-kiosk/bags/:id', requireLaundryKioskOperator, (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Torba bulunamadı' })
  try {
    const db = getDB()
    const bag = db.prepare(`
      SELECT li.*, r.block, r.room_no, r.floor, lm.name AS machine_name
      FROM laundry_items li
      JOIN rooms r ON r.id=li.room_id
      LEFT JOIN laundry_machines lm ON lm.id=li.machine_id
      WHERE li.id=?
    `).get(id)
    if (!bag) return res.status(404).json({ error: 'Torba bulunamadı' })
    const garments = db.prepare(`
      SELECT pg.*,
        (SELECT reason FROM laundry_garment_exceptions e
         WHERE e.garment_id=pg.id ORDER BY e.id DESC LIMIT 1) AS exception_reason,
        (SELECT photo_url FROM laundry_garment_exceptions e
         WHERE e.garment_id=pg.id ORDER BY e.id DESC LIMIT 1) AS exception_photo_url
      FROM premium_garments pg WHERE pg.item_id=?
      ORDER BY COALESCE(pg.sequence_no, pg.id)
    `).all(id)
    const exceptions = db.prepare(`
      SELECT e.*, pg.garment_code, pg.garment_type
      FROM laundry_garment_exceptions e
      JOIN premium_garments pg ON pg.id=e.garment_id
      WHERE e.item_id=? ORDER BY e.id DESC
    `).all(id)
    const history = db.prepare(`
      SELECT id, from_status, to_status, notes, worker_id, action_by, created_at
      FROM laundry_history WHERE item_id=? ORDER BY id
    `).all(id)
    return res.json({
      bag,
      garments,
      exceptions,
      history,
      progress: getGarmentProgressQuery(id),
    })
  } catch (e) {
    logger.error('[kiosk/bag detail]', e)
    return res.status(500).json({ error: 'Sunucu hatası' })
  }
})

// NOT: eski generic PUT /bags/:id/status ucu kaldırıldı — her şeyi bypass eden
// serbest geçişti ve hiçbir frontend tüketicisi yoktu. Tüm durum geçişleri artık
// ana state machine üzerinden (assign/wash-complete/ironing-complete/deliver).

selfServiceRouter.get('/laundry-kiosk/pending-bags', requireLaundryKioskOperator, (req, res) => {
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

selfServiceRouter.post('/laundry-kiosk/bags/:id/collect', requireLaundryKioskOperator, (req, res) => {
  try {
    const db = getDB()
    const item = db.prepare('SELECT id, status FROM laundry_items WHERE id=?').get(Number(req.params.id))
    if (!item) return res.status(404).json({ error: 'Torba bulunamadı' })
    if (item.status !== 'pending_collection') return res.status(400).json({ error: 'Torba pending_collection değil' })
    collectItemQuery(Number(req.params.id), laundryActor(req).workerId || null)
    auditLaundryKiosk(db, req, 'laundry_kiosk_collect', item.id, { from: item.status })
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

selfServiceRouter.put('/laundry-kiosk/bags/:id/ironing', requireLaundryKioskOperator, (req, res) => {
  const { needs_ironing } = req.body
  try {
    const db = getDB()
    db.prepare("UPDATE laundry_items SET needs_ironing=?, last_modified_worker_id=?, last_modified_at=datetime('now'), updated_at=datetime('now') WHERE id=?")
      .run(needs_ironing ? 1 : 0, laundryActor(req).workerId || null, Number(req.params.id))
    auditLaundryKiosk(db, req, 'laundry_kiosk_ironing_flag', Number(req.params.id), {
      needsIroning: needs_ironing ? 1 : 0,
    })
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

selfServiceRouter.put(
  '/laundry-kiosk/bags/:bagId/garments/:garmentId/ironing',
  requireLaundryKioskOperator,
  (req, res) => {
    const bagId = Number(req.params.bagId)
    const garmentId = Number(req.params.garmentId)
    const completed = req.body?.completed !== false
    const clientActionId = typeof req.body?.client_action_id === 'string'
      ? req.body.client_action_id.trim()
      : ''
    if (!Number.isInteger(bagId) || !Number.isInteger(garmentId)) {
      return res.status(404).json({ error: 'Kıyafet bulunamadı' })
    }
    if (clientActionId && !/^[a-zA-Z0-9-]{8,80}$/.test(clientActionId)) {
      return res.status(400).json({ error: 'Geçersiz client_action_id' })
    }
    try {
      const db = getDB()
      const actor = laundryActor(req)
      const result = db.transaction(() => {
        const updateResult = setGarmentIroningQuery({
          itemId: bagId,
          garmentId,
          completed,
          clientActionId: clientActionId || null,
          userId: actor.userId,
          workerId: actor.workerId,
        })
        if (!updateResult) return null
        if (updateResult.changed) {
          auditLaundryKiosk(
            db,
            req,
            completed ? 'laundry_garment_ironed' : 'laundry_garment_ironing_undo',
            garmentId,
            {
              itemId: bagId,
              clientActionId: clientActionId || null,
            }
          )
        }
        return updateResult
      }).immediate()
      if (!result) return res.status(404).json({ error: 'Kıyafet bulunamadı' })
      return res.json({
        garment: result.garment,
        idempotent: result.idempotent,
        progress: getGarmentProgressQuery(bagId),
      })
    } catch (e) {
      return res.status(e.status || 400).json({ error: e.message })
    }
  }
)

// Parça künyesi — marka/model/beden/renk/desen/durum notu. Operatör kıyafeti
// ütülerken etiketini görüyor; eksik künyeyi burada tamamlar. Kaydedilen künye
// odanın dolabına da işlenir, bir dahaki girişte hazır gelir.
selfServiceRouter.put(
  '/laundry-kiosk/bags/:bagId/garments/:garmentId/details',
  requireLaundryKioskOperator,
  (req, res) => {
    const bagId = Number(req.params.bagId)
    const garmentId = Number(req.params.garmentId)
    if (!Number.isInteger(bagId) || !Number.isInteger(garmentId)) {
      return res.status(404).json({ error: 'Kıyafet bulunamadı' })
    }
    if (req.body?.colors !== undefined && !Array.isArray(req.body.colors)) {
      return res.status(400).json({ error: 'colors dizi olmalı' })
    }
    try {
      const db = getDB()
      const result = db.transaction(() => {
        const existing = getGarmentWithItemQuery(bagId, garmentId)
        if (!existing) return { notFound: true }
        if (existing.status === 'delivered') {
          return { conflict: 'Teslim edilmiş parçanın künyesi değiştirilemez' }
        }
        const actor = laundryActor(req)
        const garment = updateGarmentDetailsQuery(garmentId, {
          brand: req.body?.brand,
          model: req.body?.model,
          size: req.body?.size,
          color: req.body?.color,
          colors: req.body?.colors,
          pattern: req.body?.pattern,
          condition_notes: req.body?.condition_notes,
        }, { userId: actor.userId, workerId: actor.workerId })
        if (!garment) return { notFound: true }
        auditLaundryKiosk(db, req, 'laundry_kiosk_garment_details', garmentId, {
          itemId: bagId,
          brand: garment.brand,
          size: garment.size,
          model: garment.model,
        })
        return { garment }
      }).immediate()

      if (result.notFound) return res.status(404).json({ error: 'Kıyafet bulunamadı' })
      if (result.conflict) return res.status(409).json({ error: result.conflict })

      // Arşiv yan üründür: hatası künye kaydını düşürmemeli.
      try {
        const room = getDB().prepare(`
          SELECT li.room_id, li.intake_name FROM laundry_items li WHERE li.id=?
        `).get(bagId)
        if (room?.room_id) {
          upsertArchiveGarmentsQuery(room.room_id, room.intake_name || null, [{
            type_id: result.garment.garment_type_id,
            type_name: result.garment.garment_type,
            emoji: result.garment.emoji,
            brand: result.garment.brand,
            model: result.garment.model,
            size: result.garment.size,
            color: result.garment.color,
            colors: safeJsonArray(result.garment.colors_json),
            pattern: result.garment.pattern,
            requires_ironing: result.garment.requires_ironing,
            condition_notes: result.garment.condition_notes,
          }])
        }
      } catch (archiveError) {
        logger.warn('[kiosk garment details] arşiv güncellenemedi: ' + archiveError.message)
      }

      return res.json({ garment: result.garment })
    } catch (e) {
      logger.error('[kiosk garment details]', e)
      return res.status(e.status || 500).json({ error: e.message || 'Sunucu hatası' })
    }
  }
)

selfServiceRouter.post(
  '/laundry-kiosk/bags/:bagId/garments/:garmentId/exception',
  requireLaundryKioskOperator,
  upload.single('photo'),
  verifyMagicBytes,
  (req, res) => {
    const bagId = Number(req.params.bagId)
    const garmentId = Number(req.params.garmentId)
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : ''
    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : ''
    const allowedReasons = new Set(['missing', 'damaged', 'no_ironing', 'rework', 'other'])
    if (!Number.isInteger(bagId) || !Number.isInteger(garmentId)) {
      removeLaundryUpload(req)
      return res.status(404).json({ error: 'Kıyafet bulunamadı' })
    }
    if (!allowedReasons.has(reason)) {
      removeLaundryUpload(req)
      return res.status(400).json({ error: 'Geçersiz istisna nedeni' })
    }
    if (note.length > 500) {
      removeLaundryUpload(req)
      return res.status(400).json({ error: 'Not en fazla 500 karakter olabilir' })
    }
    if (reason === 'damaged' && !req.file) {
      return res.status(400).json({ error: 'Hasarlı kıyafet için fotoğraf zorunludur' })
    }
    try {
      const db = getDB()
      const item = db.prepare('SELECT status FROM laundry_items WHERE id=?').get(bagId)
      if (!item) {
        removeLaundryUpload(req)
        return res.status(404).json({ error: 'Torba bulunamadı' })
      }
      if (!['ironing', 'ready'].includes(item.status)) {
        removeLaundryUpload(req)
        return res.status(409).json({ error: 'İstisna bu aşamada kaydedilemez' })
      }
      const actor = laundryActor(req)
      const garment = db.transaction(() => {
        const updated = insertGarmentExceptionQuery({
          itemId: bagId,
          garmentId,
          stage: item.status === 'ironing' ? 'ironing' : 'delivery',
          reason,
          note,
          photoUrl: req.file ? `/uploads/${req.file.filename}` : null,
          userId: actor.userId,
          workerId: actor.workerId,
        })
        if (!updated) return null
        auditLaundryKiosk(db, req, 'laundry_garment_exception', garmentId, {
          itemId: bagId,
          reason,
          photoUrl: req.file ? `/uploads/${req.file.filename}` : null,
        })
        return updated
      }).immediate()
      if (!garment) {
        removeLaundryUpload(req)
        return res.status(404).json({ error: 'Kıyafet bulunamadı' })
      }
      return res.status(201).json({ garment, progress: getGarmentProgressQuery(bagId) })
    } catch (e) {
      removeLaundryUpload(req)
      logger.error('[kiosk garment exception]', e)
      return res.status(e.status || 500).json({ error: e.message || 'Sunucu hatası' })
    }
  }
)

// Ütü tamam → hazıra al — ana state machine üzerinden: history + "rafta hazır"
// bildirimi + sakine WhatsApp artık ütüden çıkan torbalarda da gider
// (eskiden sadece yıkamadan hazıra geçenlerde gidiyordu).
selfServiceRouter.post('/laundry-kiosk/bags/:id/ironing-complete', requireLaundryKioskOperator, (req, res) => {
  try {
    const db = getDB()
    const item = db.prepare(
      'SELECT id, status, tracking_mode, item_count FROM laundry_items WHERE id=?'
    ).get(Number(req.params.id))
    if (!item) return res.status(404).json({ error: 'Torba bulunamadı' })
    if (item.status === 'ready') return res.json({ ok: true, idempotent: true })
    if (item.status !== 'ironing') return res.status(400).json({ error: 'Torba ironing durumunda değil' })
    const progress = getGarmentProgressQuery(item.id)
    if (progress.total > 0 && progress.pending_ironing > 0) {
      return res.status(409).json({
        error: `${progress.pending_ironing} kıyafet henüz ütülenmedi veya istisna ile kapatılmadı`,
        progress,
      })
    }
    if (progress.total === 0 && Number(req.body?.verified_count) !== item.item_count) {
      return res.status(400).json({ error: `Toplam ${item.item_count} parça doğrulanmalıdır` })
    }
    const shelf = (req.body?.shelf_location || '').trim() || null
    const actor = laundryActor(req)
    advanceItemService(item.id, { shelf_location: shelf }, actor.userId, actor.workerId)
    db.prepare("UPDATE laundry_items SET last_modified_worker_id=?, last_modified_at=datetime('now') WHERE id=?")
      .run(actor.workerId, item.id)
    stampHistoryWorker(db, item.id, actor.workerId)
    auditLaundryKiosk(db, req, 'laundry_ironing_complete', item.id, { shelfLocation: shelf })
    res.json({ ok: true, progress: getGarmentProgressQuery(item.id) })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// Yanlış girişi telafi — sadece kirli (henüz işlenmemiş) ve 15 dk'dan yeni
// torba kiosktan iptal edilebilir; sonrası yönetici işi.
selfServiceRouter.post('/laundry-kiosk/bags/:id/void', requireLaundryKioskOperator, (req, res) => {
  try {
    const db = getDB()
    const item = db.prepare(`
      SELECT id, status, (julianday('now') - julianday(created_at)) * 24 * 60 AS age_min
      FROM laundry_items WHERE id=?
    `).get(Number(req.params.id))
    if (!item) return res.status(404).json({ error: 'Torba bulunamadı' })
    if (item.status !== 'dirty') return res.status(400).json({ error: 'Sadece henüz işlenmemiş (kirli) torba iptal edilebilir' })
    if (item.age_min > 15) return res.status(400).json({ error: 'İptal süresi doldu (15 dk) — yöneticiye başvurun' })
    // Audit ÖNCE: torba silindikten sonra id'ye bağlı bağlam kalmaz.
    auditLaundryKiosk(db, req, 'laundry_kiosk_void', item.id, { ageMinutes: Math.round(item.age_min) })
    deleteItemService(item.id, null)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// Kayıp işaretleme — ana modülün lostItemService'i (history + vardiya amiri
// bildirimi + makine serbest bırakma dahil)
selfServiceRouter.post('/laundry-kiosk/bags/:id/lost', requireLaundryKioskOperator, (req, res) => {
  try {
    const notes = (req.body?.notes || '').trim() || 'Kiosk: teslimde bulunamadı'
    lostItemService(Number(req.params.id), { notes }, null)
    const dbL = getDB()
    const actor = laundryActor(req)
    dbL.prepare("UPDATE laundry_items SET last_modified_worker_id=?, last_modified_at=datetime('now') WHERE id=?")
      .run(actor.workerId || null, Number(req.params.id))
    stampHistoryWorker(dbL, Number(req.params.id), actor.workerId)
    auditLaundryKiosk(dbL, req, 'laundry_kiosk_lost', Number(req.params.id), { notes })
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// Teslim — ana modülün deliverItemService'i üzerinden: laundry_deliveries
// kaydı + history + premium parça teslimi + audit hub ile birebir aynı.
// Kiosk'a özgü kolonlar (delivered_name/file_count/occupant_signature/worker)
// servis çağrısından sonra ayrıca yazılır.
selfServiceRouter.post('/laundry-kiosk/bags/:id/deliver', requireLaundryKioskOperator, (req, res) => {
  const { delivered_name, signature } = req.body
  const garmentIds = Array.isArray(req.body?.garment_ids)
    ? req.body.garment_ids.map(Number)
    : undefined
  if (!delivered_name || !delivered_name.trim()) return res.status(400).json({ error: 'delivered_name gerekli' })
  try {
    const db = getDB()
    const item = db.prepare(
      'SELECT id, status, item_count, tracking_mode FROM laundry_items WHERE id=?'
    ).get(Number(req.params.id))
    if (!item) return res.status(404).json({ error: 'Torba bulunamadı' })
    if (item.status !== 'ready') return res.status(400).json({ error: 'Torba ready durumunda değil' })
    if (item.tracking_mode === 'individual' && !garmentIds) {
      return res.status(400).json({ error: 'Teslim için garment_ids zorunludur' })
    }
    const actor = laundryActor(req)
    const delivered = deliverItemService(
      item.id,
      {
        delivered_to: delivered_name.trim(),
        signature_data: signature || null,
        garment_ids: garmentIds,
      },
      actor.userId,
      actor.workerId
    )
    const deliveredCount = delivered.delivered_count || item.item_count
    db.prepare(`
      UPDATE laundry_items
      SET delivered_name=?, file_count=?, occupant_signature=?,
          last_modified_worker_id=?, last_modified_at=datetime('now')
      WHERE id=?
    `).run(
      delivered_name.trim(),
      deliveredCount,
      signature || null,
      actor.workerId,
      item.id
    )
    auditLaundryKiosk(db, req, 'laundry_deliver', item.id, {
      deliveredCount,
      garmentIds: garmentIds || null,
    })
    res.json({ ok: true, delivered_count: deliveredCount })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// M ve S bloklar standart camasir akisi (dirty status). Y bloklar
// (A, A1-A4, B, C, D, E, F, G, H, J) "premium" ozel banyolu kabul edilip
// ironing akisina gider.
const STANDARD_BLOCKS = new Set(['M1', 'M2', 'M3', 'S1', 'S2', 'S3'])

selfServiceRouter.post('/laundry-kiosk/garment', requireLaundryKioskOperator, (req, res) => {
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
    const actor = laundryActor(req)
    const created = db.transaction(() => {
      const id = insertItemQuery({
        room_id: room.id,
        item_count: total,
        status: itemStatus,
        needs_ironing: isStandard ? 0 : 1,
        is_premium: 1,
        garments_json: JSON.stringify(clothing_items),
        intake_name: intake_name || null,
        intake_signature: intake_signature || null,
        created_by: actor.userId,
        tracking_mode: 'individual',
      })
      const bagNo = setBagNoQuery(id)
      const garments = insertTrackedGarmentsQuery(
        id,
        clothing_items.map(garment => ({
          ...garment,
          requires_ironing: isStandard
            ? false
            : garment.requires_ironing,
        })),
        { source: 'legacy_kiosk', initialStatus: itemStatus === 'ironing' ? 'ironing' : 'received' }
      )
      db.prepare(`
        INSERT INTO laundry_history(
          item_id, from_status, to_status, action_by, worker_id, notes
        ) VALUES(?, NULL, ?, ?, ?, ?)
      `).run(
        id,
        itemStatus,
        actor.userId,
        actor.workerId,
        `${total} parça kiosk giriş (garment)`
      )
      auditLaundryKiosk(db, req, 'laundry_kiosk_intake', id, {
        bagNo,
        itemCount: total,
        trackingMode: 'individual',
        source: 'legacy_garment_endpoint',
      })
      return { id, bag_no: bagNo, tracking_mode: 'individual', garments }
    }).immediate()
    res.status(201).json(created)
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

selfServiceRouter.get('/laundry-kiosk/machines', requireLaundryKioskOperator, (req, res) => {
  try { res.json(listMachinesQuery()) }
  catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Makineye yükleme — ana modüldeki state machine'i kullanır (timer + deterjan
// stok düşümü + history + queue temizliği ana akışla birebir aynı olsun diye).
selfServiceRouter.put('/laundry-kiosk/machines/:id/assign', requireLaundryKioskOperator, (req, res) => {
  const { item_id, timer_minutes } = req.body
  if (!item_id) return res.status(400).json({ error: 'item_id gerekli' })
  try {
    const db = getDB()
    const item = db.prepare('SELECT id, status FROM laundry_items WHERE id=?').get(Number(item_id))
    if (!item) return res.status(404).json({ error: 'Torba bulunamadı' })
    if (item.status !== 'dirty') return res.status(400).json({ error: 'Torba kirli durumunda değil' })
    const actor = laundryActor(req)
    advanceItemService(Number(item_id), {
      machine_id: Number(req.params.id),
      timer_minutes: timer_minutes ? Number(timer_minutes) : null,
    }, actor.userId, actor.workerId)
    db.prepare("UPDATE laundry_items SET last_modified_worker_id=?, last_modified_at=datetime('now') WHERE id=?")
      .run(actor.workerId, Number(item_id))
    auditLaundryKiosk(db, req, 'laundry_machine_assign', Number(item_id), {
      machineId: Number(req.params.id),
    })
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// Toplu makine yükleme — birden çok kirli torba tek seferde aynı makineye.
// Kirli olmayanlar failed listesine düşer; makine meşgul/bakımda guard'ı
// batchAssignService içinde.
selfServiceRouter.post('/laundry-kiosk/machines/:id/batch-assign', requireLaundryKioskOperator, (req, res) => {
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
    const actor = laundryActor(req)
    for (const id of result.success) {
      db.prepare("UPDATE laundry_items SET last_modified_worker_id=?, last_modified_at=datetime('now') WHERE id=?")
        .run(actor.workerId || null, id)
      stampHistoryWorker(db, id, actor.workerId)
    }
    if (result.success.length) {
      auditLaundryKiosk(db, req, 'laundry_kiosk_batch_assign', Number(req.params.id), {
        itemIds: result.success, timerMinutes: timer_minutes ? Number(timer_minutes) : null,
      })
    }
    res.json({ success: result.success, failed: [...failed, ...result.failed] })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// Odanın tüm hazır torbalarını tek seferde teslim — tek isim + tek imza.
// file_count torba başına 1 yazılır (tek-torba akışındaki alan oradaki gibi kalır).
selfServiceRouter.post('/laundry-kiosk/deliver-room', requireLaundryKioskOperator, (req, res) => {
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
    const deliveredIds = []
    const failed = []
    const actor = laundryActor(req)
    for (const b of bags) {
      try {
        deliverItemService(b.id, { delivered_to: delivered_name.trim(), signature_data: signature || null }, null)
        extraStmt.run(delivered_name.trim(), signature || null, actor.workerId || null, b.id)
        stampHistoryWorker(db, b.id, actor.workerId)
        delivered.push(b.bag_no || `#${b.id}`)
        deliveredIds.push(b.id)
      } catch (e) {
        failed.push({ id: b.id, error: e.message })
      }
    }
    if (deliveredIds.length) {
      auditLaundryKiosk(db, req, 'laundry_kiosk_deliver_room', deliveredIds[0], {
        block, roomNo: room_no, deliveredTo: delivered_name.trim(), itemIds: deliveredIds,
      })
    }
    res.json({ ok: true, delivered: delivered.length, bag_nos: delivered, failed })
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Makinenin gün-gün koşu kırılımı — kiosk Makineler genel bakışı için
selfServiceRouter.get('/laundry-kiosk/machines/:id/daily-runs', requireLaundryKioskOperator, (req, res) => {
  try {
    res.json(getMachineDailyRunsService(Number(req.params.id), Number(req.query.days) || 14))
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Bakım yapıldı — sayaç sıfırlanır; bakımı fiilen yapan kiosk operatörü işaretler
selfServiceRouter.post('/laundry-kiosk/machines/:id/maintenance-done', requireLaundryKioskOperator, (req, res) => {
  try {
    const result = maintenanceDoneService(Number(req.params.id), null)
    auditLaundryKiosk(getDB(), req, 'laundry_kiosk_maintenance_done', Number(req.params.id), {})
    res.json(result)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// Kayıp torba bulundu — lost→ready geri döner, sakine "bulundu" WhatsApp'ı gider
selfServiceRouter.post('/laundry-kiosk/bags/:id/found', requireLaundryKioskOperator, async (req, res) => {
  try {
    const db = getDB()
    const item = db.prepare('SELECT id, status FROM laundry_items WHERE id=?').get(Number(req.params.id))
    if (!item) return res.status(404).json({ error: 'Torba bulunamadı' })
    if (item.status !== 'lost') return res.status(400).json({ error: 'Torba kayıp durumunda değil' })
    markFoundService(item.id, null)
    const actor = laundryActor(req)
    db.prepare("UPDATE laundry_items SET last_modified_worker_id=?, last_modified_at=datetime('now') WHERE id=?")
      .run(actor.workerId || null, item.id)
    stampHistoryWorker(db, item.id, actor.workerId)
    auditLaundryKiosk(db, req, 'laundry_kiosk_found', item.id, {})
    try {
      const full = getItemService(item.id)
      if (full) await sendFoundMessage(full)
    } catch {}
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// SLA eşikleri — kiosk panosundaki bekleme rozetleri hub ile aynı
// config'ten (laundry_sla_config) beslensin diye
selfServiceRouter.get('/laundry-kiosk/sla-config', requireLaundryKioskOperator, (req, res) => {
  try {
    res.json(getSlaConfigQuery().map(c => ({
      stage: c.stage, warning_hours: c.warning_hours, critical_hours: c.critical_hours,
    })))
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Operatör kırılımı — bugün kim kaç işlem yaptı (vardiya devri/değerlendirme)
selfServiceRouter.get('/laundry-kiosk/operator-summary', requireLaundryKioskOperator, (req, res) => {
  try {
    res.json(getOperatorSummaryService(Number(req.query.days) || 1))
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Gün özeti — vardiya devri için üç sayı + aktif durum kırılımı
selfServiceRouter.get('/laundry-kiosk/today-summary', requireLaundryKioskOperator, (req, res) => {
  try {
    const db = getDB()
    const row = db.prepare(`
      SELECT
        SUM(CASE WHEN date(li.created_at,'localtime')=date('now','localtime') THEN 1 ELSE 0 END) as intake_today,
        SUM(CASE WHEN li.status='delivered' AND date(li.updated_at,'localtime')=date('now','localtime') THEN 1 ELSE 0 END) as delivered_today,
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
selfServiceRouter.post('/laundry-kiosk/bags/:id/wash-complete', requireLaundryKioskOperator, (req, res) => {
  try {
    const db = getDB()
    const item = db.prepare('SELECT id, status FROM laundry_items WHERE id=?').get(Number(req.params.id))
    if (!item) return res.status(404).json({ error: 'Torba bulunamadı' })
    if (item.status !== 'washing') return res.status(400).json({ error: 'Torba makinede değil' })
    const shelf = (req.body?.shelf_location || '').trim() || null
    const actor = laundryActor(req)
    const updated = advanceItemService(
      item.id,
      { shelf_location: shelf },
      actor.userId,
      actor.workerId
    )
    db.prepare("UPDATE laundry_items SET last_modified_worker_id=?, last_modified_at=datetime('now') WHERE id=?")
      .run(actor.workerId, item.id)
    auditLaundryKiosk(db, req, 'laundry_wash_complete', item.id, {
      nextStatus: updated.status,
      shelfLocation: shelf,
    })
    res.json({ ok: true, next_status: updated.status })
  } catch (e) { res.status(400).json({ error: e.message }) }
})
