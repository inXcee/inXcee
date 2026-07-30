import { Router } from 'express'
import { unlinkSync } from 'node:fs'
import { requireRole } from '../../shared/auth/middleware.js'
import { createImageUpload, verifyMagicBytes } from '../../shared/uploads/middleware.js'
import { getDB } from '../../shared/db/index.js'
import * as svc from './service.js'
import { collectItemQuery, listGarmentTypesQuery, insertGarmentTypeQuery, updateGarmentTypeQuery, reorderGarmentTypesQuery } from './queries.js'
import { notifyItemReady, sendFoundMessage, notifyRoomPersonReady, sendWhatsApp } from './whatsapp.js'
import { logger } from '../../shared/logger.js'
import { validate } from '../../shared/middleware/validate.js'
import { createGarmentTypeSchema, updateGarmentTypeSchema, createBagSchema } from './schemas.js'

export const laundryRouter = Router()

// Yetki seviyeleri
// campus_manager tüm işlemlere erişebilir (en yetkili)
const laundryFull = requireRole('laundry', 'campus_manager')
const laundryRead = requireRole('laundry', 'shift_supervisor', 'campus_manager')
const slaWrite    = requireRole('laundry', 'campus_manager')

// `laundry-` öneki gecelik yetim dosya temizliğinin dosyaları hangi modüle ait
// olduğunu anlamasını sağlar (bkz. photo-retention.js).
const upload = createImageUpload('laundry')

function removeUploadedPhoto(req) {
  if (!req.file?.path) return
  try { unlinkSync(req.file.path) } catch {}
}

// ═══════════════════════════════════════════════════════════════════════════
// ITEMS
// ═══════════════════════════════════════════════════════════════════════════

// Archive must be before /:id routes
laundryRouter.get('/items/archive', ...laundryRead, (req, res) => {
  try {
    const { from, to, status, room, search, page, limit } = req.query
    res.json(svc.archiveItemsService({
      from, to, status, room, search,
      page: page ? +page : 1,
      limit: limit ? Math.min(+limit, 100) : 50,
    }))
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

laundryRouter.get('/items', ...laundryRead, (req, res) => {
  try {
    const { status, urgent, sla_only, search } = req.query
    res.json(svc.listItemsService({
      status: status || undefined,
      urgent: urgent === '1',
      sla_only: sla_only === '1',
      search: search || undefined,
    }))
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

// Dashboard özeti (laundry rol dashboard'u için) — durum sayımları + aktif/acil/bugün-teslim.
laundryRouter.get('/summary', ...laundryRead, (req, res) => {
  try { res.json(svc.getLaundrySummaryService()) }
  catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

// Yeni mobil tarama, ana laundry_items durum makinesini kullanır. Eski
// laundry_bags QR kodları oda üzerinden en güncel aktif torbaya yönlendirilir.
laundryRouter.get('/items/by-code/:code', ...laundryRead, (req, res) => {
  try {
    const db = getDB()
    const code = String(req.params.code || '').trim()
    let item = db.prepare(`
      SELECT li.*, r.block, r.room_no, r.floor, m.name AS machine_name
      FROM laundry_items li
      LEFT JOIN rooms r ON r.id=li.room_id
      LEFT JOIN laundry_machines m ON m.id=li.machine_id
      WHERE li.bag_no=? OR CAST(li.id AS TEXT)=?
      ORDER BY li.id DESC LIMIT 1
    `).get(code, code)
    if (!item) {
      const legacy = db.prepare('SELECT room_id FROM laundry_bags WHERE qr_code=?').get(code)
      if (legacy?.room_id) {
        item = db.prepare(`
          SELECT li.*, r.block, r.room_no, r.floor, m.name AS machine_name
          FROM laundry_items li
          LEFT JOIN rooms r ON r.id=li.room_id
          LEFT JOIN laundry_machines m ON m.id=li.machine_id
          WHERE li.room_id=? AND li.status NOT IN ('delivered','lost')
          ORDER BY li.id DESC LIMIT 1
        `).get(legacy.room_id)
      }
    }
    if (!item) return res.status(404).json({ error: 'Aktif torba bulunamadı' })
    res.json({
      ...item,
      garments: svc.getPremiumGarmentsService(item.id),
    })
  } catch (e) {
    logger.error('[laundry item scan]', e)
    res.status(500).json({ error: 'Sunucu hatası' })
  }
})

laundryRouter.get('/items/:id', ...laundryRead, (req, res) => {
  const item = svc.getItemService(+req.params.id)
  if (!item) return res.status(404).json({ error: 'Kayıt bulunamadı' })
  res.json(item)
})

laundryRouter.get('/items/:id/history', ...laundryRead, (req, res) => {
  res.json(svc.getItemHistoryService(+req.params.id))
})

laundryRouter.get('/items/:id/damages', ...laundryRead, (req, res) => {
  res.json(svc.getDamagesService(+req.params.id))
})

laundryRouter.post('/items', ...laundryFull, (req, res) => {
  try {
    const item = svc.createItemService(req.body, req.user.id)
    res.status(201).json(item)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.post('/items/:id/collect', ...laundryFull, (req, res) => {
  try {
    const item = getDB().prepare('SELECT id, status FROM laundry_items WHERE id=?').get(+req.params.id)
    if (!item) return res.status(404).json({ error: 'Kayıt bulunamadı' })
    if (item.status !== 'pending_collection') return res.status(400).json({ error: 'Durum pending_collection değil' })
    collectItemQuery(+req.params.id, null)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

laundryRouter.patch('/items/:id/advance', ...laundryFull, (req, res) => {
  try {
    const { machine_id, shelf_location, timer_minutes } = req.body
    const item = svc.advanceItemService(
      +req.params.id,
      { machine_id, shelf_location, timer_minutes: timer_minutes ? +timer_minutes : null },
      req.user.id
    )
    res.json(item)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.patch('/items/:id/deliver', ...laundryFull, (req, res) => {
  try {
    const item = svc.deliverItemService(+req.params.id, req.body, req.user.id)
    res.json(item)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.patch('/items/:id/revert', ...laundryFull, (req, res) => {
  try {
    const { target_status } = req.body
    if (!target_status) return res.status(400).json({ error: 'target_status gerekli' })
    const item = svc.revertItemService(+req.params.id, target_status, req.user.id)
    res.json(item)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.patch('/items/:id/lost', ...laundryFull, (req, res) => {
  try {
    const item = svc.lostItemService(+req.params.id, req.body, req.user.id)
    res.json(item)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.patch('/items/:id/compensation', ...laundryFull, (req, res) => {
  try {
    const item = svc.setCompensationService(+req.params.id, req.body, req.user.id)
    res.json(item)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.delete('/items/:id', ...laundryFull, (req, res) => {
  try {
    svc.deleteItemService(+req.params.id, req.user.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

const MAX_BATCH = 100

laundryRouter.post('/items/batch-assign', ...laundryFull, (req, res) => {
  try {
    const { item_ids, machine_id, timer_minutes } = req.body
    if (!Array.isArray(item_ids) || !machine_id) {
      return res.status(400).json({ error: 'item_ids[] ve machine_id zorunlu' })
    }
    if (item_ids.length > MAX_BATCH) return res.status(400).json({ error: `Tek seferde en fazla ${MAX_BATCH} kayit` })
    const result = svc.batchAssignService(item_ids, +machine_id, timer_minutes ? +timer_minutes : null, req.user.id)
    res.json(result)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.post('/items/batch-lost', ...laundryFull, (req, res) => {
  try {
    const { item_ids, notes } = req.body
    if (!Array.isArray(item_ids)) return res.status(400).json({ error: 'item_ids[] zorunlu' })
    if (item_ids.length > MAX_BATCH) return res.status(400).json({ error: `Tek seferde en fazla ${MAX_BATCH} kayit` })
    const result = svc.batchLostService(item_ids, notes, req.user.id)
    res.json(result)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// Toplu teslim — batch-deliver must come before /:id routes
laundryRouter.post('/items/batch-deliver', ...laundryFull, (req, res) => {
  try {
    const { item_ids, delivered_to, signature_data } = req.body
    if (Array.isArray(item_ids) && item_ids.length > MAX_BATCH) return res.status(400).json({ error: `Tek seferde en fazla ${MAX_BATCH} kayit` })
    const result = svc.batchDeliverService(item_ids, { delivered_to, signature_data }, req.user.id)
    res.json(result)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// Hasar kaydı
laundryRouter.post('/items/:id/damages', ...laundryFull, (req, res) => {
  try {
    const damages = svc.reportDamageService(+req.params.id, req.body, req.user.id)
    res.status(201).json(damages)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.delete('/damages/:id', ...laundryFull, (req, res) => {
  try {
    svc.deleteDamageService(+req.params.id, req.user.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.post('/items/:id/verify', ...laundryFull, (req, res) => {
  try {
    const { stage, items, all_present, missing_notes } = req.body
    if (!stage || !items) return res.status(400).json({ error: 'stage ve items zorunlu' })
    const result = svc.createVerificationService(+req.params.id, { stage, items, all_present, missing_notes }, req.user.username || String(req.user.id))
    res.status(201).json(result)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.get('/items/:id/verifications', ...laundryRead, (req, res) => {
  res.json(svc.getVerificationsService(+req.params.id))
})

laundryRouter.get('/rooms-overview', ...laundryRead, (req, res) => {
  try {
    res.json(svc.getRoomsOverviewService())
  } catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

laundryRouter.get('/rooms/:block/:room_no/detail', ...laundryRead, (req, res) => {
  try {
    res.json(svc.getRoomLaundryDetailService(req.params.block, req.params.room_no))
  } catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Faz 4 — Oda sakinine 'hazır' hatırlatıcı (WhatsApp)
laundryRouter.post('/rooms/:block/:room_no/remind-ready', ...laundryFull, async (req, res) => {
  try {
    const personName = (req.body?.person_name || '').trim()
    if (!personName) return res.status(400).json({ error: 'person_name gerekli' })
    const result = await notifyRoomPersonReady(req.params.block, req.params.room_no, personName)
    if (!result.configured) return res.status(503).json({ error: 'WhatsApp yapılandırılmamış' })
    res.json(result)
  } catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Faz 4 — Belirli oda sakinine özel mesaj (kayıp uyarısı vs.) — telefonu sunucu çözer
laundryRouter.post('/rooms/:block/:room_no/notify-person', ...laundryFull, async (req, res) => {
  try {
    const personName = (req.body?.person_name || '').trim()
    const message    = (req.body?.message || '').trim()
    if (!personName) return res.status(400).json({ error: 'person_name gerekli' })
    if (!message)    return res.status(400).json({ error: 'message gerekli' })
    if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_ID) {
      return res.status(503).json({ error: 'WhatsApp yapılandırılmamış' })
    }
    const db = getDB()
    const person = db.prepare(`
      SELECT p.phone_number FROM personnel p
      JOIN room_assignments ra ON ra.personnel_id = p.id AND ra.check_out_at IS NULL
      JOIN rooms r ON r.id = ra.room_id
      WHERE r.block = ? AND r.room_no = ? AND p.full_name = ?
      LIMIT 1
    `).get(req.params.block, req.params.room_no, personName)
    if (!person?.phone_number) return res.status(404).json({ error: 'Telefon bulunamadı' })
    await sendWhatsApp(person.phone_number, message)
    res.json({ sent: true })
  } catch (e) { logger.error('[Route]', e); res.status(500).json({ error: e.message || 'Sunucu hatası' }) }
})

// Faz 4 — Serbest WhatsApp mesajı (kayıp uyarısı vs.)
laundryRouter.post('/notify', ...laundryFull, async (req, res) => {
  try {
    const phone = (req.body?.phone || '').trim()
    const message = (req.body?.message || '').trim()
    if (!phone)   return res.status(400).json({ error: 'phone gerekli' })
    if (!message) return res.status(400).json({ error: 'message gerekli' })
    if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_ID) {
      return res.status(503).json({ error: 'WhatsApp yapılandırılmamış' })
    }
    await sendWhatsApp(phone, message)
    res.json({ sent: true })
  } catch (e) { logger.error('[Route]', e); res.status(500).json({ error: e.message || 'Sunucu hatası' }) }
})

laundryRouter.get('/person/:name', ...laundryRead, (req, res) => {
  try {
    res.json(svc.getPersonHistoryService(decodeURIComponent(req.params.name)))
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.post('/items/:id/found', ...laundryFull, async (req, res) => {
  try {
    const item = svc.markFoundService(+req.params.id, req.user.id)
    if (req.body.send_whatsapp && item) {
      const full = svc.getItemService(+req.params.id)
      if (full) await sendFoundMessage(full)
    }
    res.json(item)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ═══════════════════════════════════════════════════════════════════════════
// MACHINES
// ═══════════════════════════════════════════════════════════════════════════

laundryRouter.get('/machines', ...laundryRead, (req, res) => {
  res.json(svc.listMachinesService())
})

laundryRouter.post('/machines', ...laundryFull, (req, res) => {
  try {
    const m = svc.createMachineService(req.body, req.user.id)
    res.status(201).json(m)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// Yoğunluk: giriş/teslim saat + haftagünü dağılımı (varsayılan son 30 gün)
laundryRouter.get('/busyness', ...laundryRead, (req, res) => {
  res.json(svc.getBusynessService(+req.query.days || 30))
})

// Operatör performans kırılımı (varsayılan son 7 gün)
laundryRouter.get('/operator-summary', ...laundryRead, (req, res) => {
  res.json(svc.getOperatorSummaryService(+req.query.days || 7))
})

// Gün-gün koşu kırılımı (varsayılan son 14 gün, max 90)
laundryRouter.get('/machines/:id/daily-runs', ...laundryRead, (req, res) => {
  res.json(svc.getMachineDailyRunsService(+req.params.id, +req.query.days || 14))
})

laundryRouter.post('/machines/:id/maintenance-done', ...laundryFull, (req, res) => {
  try {
    res.json(svc.maintenanceDoneService(+req.params.id, req.user.id))
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.patch('/machines/:id', ...laundryFull, (req, res) => {
  try {
    const m = svc.updateMachineService(+req.params.id, req.body, req.user.id)
    res.json(m)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.delete('/machines/:id', ...laundryFull, (req, res) => {
  try {
    svc.deleteMachineService(+req.params.id, req.user.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ═══════════════════════════════════════════════════════════════════════════
// QUEUE
// ═══════════════════════════════════════════════════════════════════════════

laundryRouter.get('/queue', ...laundryRead, (req, res) => {
  res.json(svc.getQueueService(req.query.machine_id ? +req.query.machine_id : undefined))
})

laundryRouter.post('/queue', ...laundryFull, (req, res) => {
  try {
    svc.addToQueueService(req.body, req.user.id)
    res.status(201).json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.delete('/queue/:id', ...laundryFull, (req, res) => {
  try {
    svc.removeFromQueueService(+req.params.id, req.user.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ═══════════════════════════════════════════════════════════════════════════
// SLA
// ═══════════════════════════════════════════════════════════════════════════

laundryRouter.get('/sla-config', ...laundryRead, (req, res) => {
  res.json(svc.getSlaConfigService())
})

laundryRouter.put('/sla-config', ...slaWrite, (req, res) => {
  try {
    const { stage, warning_hours, critical_hours, whatsapp_notify } = req.body
    if (!stage || warning_hours == null || critical_hours == null) {
      return res.status(400).json({ error: 'stage, warning_hours, critical_hours zorunlu' })
    }
    if (+critical_hours <= +warning_hours) {
      return res.status(400).json({ error: 'Kritik eşik uyarıdan büyük olmalı' })
    }
    svc.upsertSlaConfigService({ stage, warning_hours: +warning_hours, critical_hours: +critical_hours, whatsapp_notify: whatsapp_notify ? 1 : 0, updated_by: req.user.id })
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.get('/sla/violations', ...laundryRead, (req, res) => {
  res.json(svc.getSlaViolationsService())
})

laundryRouter.get('/sla/pre-warnings', ...laundryRead, (req, res) => {
  res.json(svc.getSlaPreWarningsService())
})

// ═══════════════════════════════════════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════════════════════════════════════

laundryRouter.get('/reports/stats', ...laundryRead, (req, res) => {
  res.json(svc.getStatsService(req.query))
})

laundryRouter.get('/reports/premium', ...laundryRead, (req, res) => {
  try {
    const { from, to } = req.query
    res.json(svc.getPremiumReportService({ from_date: from, to_date: to }))
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

laundryRouter.get('/reports/export-premium', ...laundryRead, (req, res) => {
  try {
    const { from, to } = req.query
    const rows = svc.exportPremiumGarmentsService({ from_date: from, to_date: to })
    const header = 'Kod,Blok,Oda,Tip,Marka,Model,Beden,Renk,Durum,Ütü Gerekli,Ütüleyen,Ütü Zamanı,İstisna,Giriş,Teslim,Toplam Saat'
    const csv = [header, ...rows.map(r => [
      r.garment_code, r.block, r.room_no, r.garment_type,
      r.brand || '', r.model || '', r.size || '', r.color || '',
      r.status, r.requires_ironing ? 'Evet' : 'Hayır',
      r.ironed_by_name || '', r.ironed_at || '', r.exception_reason || '',
      r.intake_date?.slice(0, 10) || '',
      r.delivered_at?.slice(0, 10) || '', r.total_hours ?? '',
    ].join(','))].join('\n')
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="laundry-garments-${new Date().toISOString().slice(0,10)}.csv"`)
    res.send('\uFEFF' + csv)
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

laundryRouter.get('/reports/export', ...laundryRead, (req, res) => {
  try {
    const { from, to, status, include_verifications } = req.query
    const items = svc.listAllItemsService({ from, to, status })
    const baseHeader = 'ID,Blok,Oda,Durum,Parça,Acil,Notlar,Oluşturulma,Ütü'
    const verifHeader = include_verifications === '1' ? ',Doğrulandı,Eksik Not' : ''
    const header = baseHeader + verifHeader

    const rows = items.map(i => {
      const base = [
        i.id, i.block || '', i.room_no || '', i.status, i.item_count,
        i.urgent ? 'Evet' : 'Hayır',
        (i.notes || '').replace(/,/g, ';').replace(/\n/g, ' '),
        i.created_at,
        i.needs_ironing ? 'Evet' : 'Hayır',
      ]
      if (include_verifications === '1') {
        base.push(i.all_present === 1 ? 'Evet' : i.all_present === 0 ? 'Hayır' : '')
        base.push((i.verification_notes || '').replace(/,/g, ';'))
      }
      return base.join(',')
    })

    const csv = [header, ...rows].join('\n')
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="camasir-${new Date().toISOString().slice(0,10)}.csv"`)
    res.send('\uFEFF' + csv)
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

// Oda sakininin telefon bilgisi
laundryRouter.get('/room-occupant/:room_id', ...laundryFull, (req, res) => {
  try {
    const db = getDB()
    const row = db.prepare(`
      SELECT p.full_name, p.phone_number
      FROM room_assignments ra
      JOIN personnel p ON p.id = ra.personnel_id
      WHERE ra.room_id = ? AND ra.check_out_at IS NULL
      LIMIT 1
    `).get(+req.params.room_id)
    res.json(row || {})
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

// Manuel WhatsApp bildirimi
laundryRouter.post('/items/:id/notify-whatsapp', ...laundryFull, async (req, res) => {
  try {
    const item = svc.getItemService(+req.params.id)
    if (!item) return res.status(404).json({ error: 'Kayıt bulunamadı' })
    // phone override in body takes priority
    const phone = req.body.phone || item.phone_number
    if (!phone) return res.status(400).json({ error: 'Telefon numarası bulunamadı' })
    await notifyItemReady(+req.params.id)
    res.json({ ok: true, phone })
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

// ═══════════════════════════════════════════════════════════════════════════
// BLOCK CONFIG
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// ROOMS (laundry modülü için oda listesi)
// ═══════════════════════════════════════════════════════════════════════════

laundryRouter.get('/rooms', ...laundryRead, (req, res) => {
  try {
    const db = getDB()
    const rooms = db.prepare(`
      SELECT id, block, floor, room_no, capacity, active_beds, status
      FROM rooms
      WHERE status != 'quarantine'
      ORDER BY block ASC, room_no ASC
    `).all()
    res.json(rooms)
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

laundryRouter.get('/block-config', ...laundryRead, (req, res) => {
  try { res.json(svc.getBlockConfigService()) }
  catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

laundryRouter.put('/block-config/:block', ...slaWrite, (req, res) => {
  try {
    const { is_premium } = req.body
    if (is_premium == null) return res.status(400).json({ error: 'is_premium zorunlu' })
    res.json(svc.upsertBlockConfigService(req.params.block, is_premium, req.user.id))
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════════════════

laundryRouter.get('/settings', ...laundryRead, (req, res) => {
  res.json(svc.getSettingsService())
})

laundryRouter.put('/settings/:key', ...slaWrite, (req, res) => {
  try {
    const { value } = req.body
    if (value == null) return res.status(400).json({ error: 'value zorunlu' })
    svc.updateSettingService(req.params.key, String(value))
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ═══════════════════════════════════════════════════════════════════════════
// PHOTO UPLOAD
// ═══════════════════════════════════════════════════════════════════════════

laundryRouter.post('/upload-photo', ...laundryFull, upload.single('photo'), verifyMagicBytes, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Dosya bulunamadı' })
  const path = `/uploads/${req.file.filename}`
  res.json({ url: path, filename: req.file.filename })
})

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGES
// ═══════════════════════════════════════════════════════════════════════════

laundryRouter.get('/messages', ...laundryRead, (req, res) => {
  try {
    const { before_id, limit } = req.query
    res.json(svc.getMessagesService({
      before_id: before_id ? +before_id : undefined,
      limit: limit ? +limit : 50,
    }))
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

laundryRouter.post('/messages', ...laundryFull, (req, res) => {
  try {
    const msg = svc.sendMessageService(req.body, req.user)
    res.status(201).json(msg)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.delete('/messages/:id', ...laundryFull, (req, res) => {
  try {
    svc.deleteMessageService(+req.params.id, req.user)
    res.json({ ok: true })
  } catch (e) { res.status(e.status || 400).json({ error: e.message }) }
})

laundryRouter.patch('/messages/:id/pin', ...slaWrite, (req, res) => {
  try {
    const msg = svc.pinMessageService(+req.params.id, req.body.is_pinned, req.user)
    res.json(msg)
  } catch (e) { res.status(e.status || 400).json({ error: e.message }) }
})

// ═══════════════════════════════════════════════════════════════════════════
// PREMIUM GARMENTS
// ═══════════════════════════════════════════════════════════════════════════

// by-code must be before /:id routes
laundryRouter.get('/garments/by-code/:code', ...laundryRead, (req, res) => {
  try { res.json(svc.getPremiumGarmentByCodeService(req.params.code)) }
  catch (e) { res.status(e.status || 500).json({ error: e.message }) }
})

laundryRouter.get('/items/:id/garments', ...laundryRead, (req, res) => {
  try { res.json(svc.getPremiumGarmentsService(+req.params.id)) }
  catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

laundryRouter.get('/garments/:id/detail', ...laundryRead, (req, res) => {
  try { res.json(svc.getGarmentDetailService(+req.params.id)) }
  catch (e) { res.status(e.status || 500).json({ error: e.message }) }
})

laundryRouter.put(
  '/items/:itemId/garments/:garmentId/ironing',
  ...laundryFull,
  (req, res) => {
    const clientActionId = typeof req.body?.client_action_id === 'string'
      ? req.body.client_action_id.trim()
      : ''
    if (clientActionId && !/^[a-zA-Z0-9-]{8,80}$/.test(clientActionId)) {
      return res.status(400).json({ error: 'Geçersiz client_action_id' })
    }
    try {
      const result = svc.setGarmentIroningService(
        +req.params.itemId,
        +req.params.garmentId,
        {
          completed: req.body?.completed !== false,
          client_action_id: clientActionId || null,
        },
        req.user.id
      )
      res.json({
        garment: result.garment,
        idempotent: result.idempotent,
        progress: result.progress,
      })
    } catch (e) { res.status(e.status || 400).json({ error: e.message, progress: e.progress }) }
  }
)

laundryRouter.post(
  '/items/:itemId/garments/:garmentId/exception',
  ...laundryFull,
  upload.single('photo'),
  verifyMagicBytes,
  (req, res) => {
    try {
      const note = String(req.body?.note || '').trim()
      if (note.length > 500) {
        removeUploadedPhoto(req)
        return res.status(400).json({ error: 'Not en fazla 500 karakter olabilir' })
      }
      const result = svc.addGarmentExceptionService(
        +req.params.itemId,
        +req.params.garmentId,
        {
          reason: String(req.body?.reason || '').trim(),
          note,
          photo_url: req.file ? `/uploads/${req.file.filename}` : null,
        },
        req.user.id
      )
      res.status(201).json(result)
    } catch (e) {
      removeUploadedPhoto(req)
      res.status(e.status || 400).json({ error: e.message })
    }
  }
)

laundryRouter.post('/items/:id/ironing-complete', ...laundryFull, (req, res) => {
  try {
    res.json(svc.completeGarmentIroningService(
      +req.params.id,
      String(req.body?.shelf_location || '').trim() || null,
      req.user.id
    ))
  } catch (e) { res.status(e.status || 400).json({ error: e.message, progress: e.progress }) }
})

laundryRouter.post('/items/:id/garments', ...laundryFull, (req, res) => {
  try {
    const garments = req.body
    if (!Array.isArray(garments)) return res.status(400).json({ error: 'Dizi bekleniyor' })
    res.status(201).json(svc.addPremiumGarmentsService(+req.params.id, garments, req.user.id))
  } catch (e) { res.status(e.status || 400).json({ error: e.message }) }
})

laundryRouter.patch('/garments/:id/advance', ...laundryFull, (req, res) => {
  try {
    const garment = svc.advancePremiumGarmentService(+req.params.id, req.user.id)
    res.json(garment)
  } catch (e) { res.status(e.status || 400).json({ error: e.message }) }
})

laundryRouter.post('/items/:id/garments/bulk-advance', ...laundryFull, (req, res) => {
  try {
    const { garment_ids, to_status } = req.body
    if (!Array.isArray(garment_ids) || !to_status) {
      return res.status(400).json({ error: 'garment_ids[] ve to_status zorunlu' })
    }
    const result = svc.bulkAdvancePremiumGarmentsService(+req.params.id, garment_ids, to_status, req.user.id)
    res.json(result)
  } catch (e) { res.status(e.status || 400).json({ error: e.message }) }
})

laundryRouter.patch('/garments/:id/deliver', ...laundryFull, (req, res) => {
  try {
    const garment = svc.deliverPremiumGarmentService(+req.params.id, req.body, req.user.id)
    res.json(garment)
  } catch (e) { res.status(e.status || 400).json({ error: e.message }) }
})

laundryRouter.post('/items/:id/premium-deliver', ...laundryFull, (req, res) => {
  try {
    const { garment_ids, delivered_to, signature_data } = req.body
    if (!Array.isArray(garment_ids) || !delivered_to) {
      return res.status(400).json({ error: 'garment_ids[] ve delivered_to zorunlu' })
    }
    const result = svc.bulkDeliverPremiumGarmentsService(+req.params.id, garment_ids, { delivered_to, signature_data }, req.user.id)
    res.json(result)
  } catch (e) { res.status(e.status || 400).json({ error: e.message }) }
})

laundryRouter.get('/items/:id/delivery-receipt', ...laundryRead, (req, res) => {
  try { res.json(svc.getPremiumDeliveryReceiptService(+req.params.id)) }
  catch (e) { res.status(e.status || 500).json({ error: e.message }) }
})

// garments/search must be before /garments/:id routes
laundryRouter.get('/garments/search', ...laundryRead, (req, res) => {
  try {
    const { block, room_no, type, brand, size, color, pattern, intake_name, status, from, to, page, limit } = req.query
    res.json(svc.searchPremiumGarmentsService({
      block, room_no, garment_type: type, brand, size, color, pattern, intake_name, status,
      from_date: from, to_date: to,
      page: page ? +page : 1,
      limit: limit ? Math.min(+limit, 100) : 50,
    }))
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

laundryRouter.get('/rooms/:room_id/garment-history', ...laundryRead, (req, res) => {
  try {
    const { from, to } = req.query
    res.json(svc.getRoomGarmentHistoryService(+req.params.room_id, { from_date: from, to_date: to }))
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

// rooms-scan must be before /rooms/:room_id
laundryRouter.get('/rooms-scan', ...laundryFull, (req, res) => {
  try {
    const { block, room_no } = req.query
    res.json(svc.getRoomGarmentsForScanService(block, room_no))
  } catch (e) { res.status(e.status || 500).json({ error: e.message }) }
})

laundryRouter.post('/garments/scan-action', ...laundryFull, (req, res) => {
  try {
    const { block, room_no, garment_id, action } = req.body
    if (!block || !room_no || !garment_id || !action) {
      return res.status(400).json({ error: 'block, room_no, garment_id, action zorunlu' })
    }
    const result = svc.scanActionService(block, room_no, +garment_id, action, req.user.id)
    res.json(result)
  } catch (e) { res.status(e.status || 400).json({ error: e.message }) }
})

// ═══════════════════════════════════════════════════════════════════════════
// SUPPLIES
// ═══════════════════════════════════════════════════════════════════════════

laundryRouter.get('/supplies/alerts', ...laundryRead, (req, res) => {
  try {
    res.json(svc.getAlertSuppliesService())
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

laundryRouter.get('/supplies', ...laundryRead, (req, res) => {
  try {
    res.json(svc.listSuppliesService(req.query.include_inactive === '1'))
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

laundryRouter.post('/supplies', ...slaWrite, (req, res) => {
  try {
    const supply = svc.createSupplyService(req.body, req.user.id)
    res.status(201).json(supply)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.patch('/supplies/:id', ...slaWrite, (req, res) => {
  try {
    const supply = svc.updateSupplyService(+req.params.id, req.body, req.user.id)
    res.json(supply)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.post('/supplies/:id/add-stock', ...slaWrite, (req, res) => {
  try {
    const { amount, note } = req.body
    const supply = svc.addStockService(+req.params.id, amount, note, req.user.id)
    res.json(supply)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.post('/supplies/:id/set-stock', ...slaWrite, (req, res) => {
  try {
    const { new_stock } = req.body
    const supply = svc.setStockService(+req.params.id, new_stock, req.user.id)
    res.json(supply)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.get('/supplies/:id/log', ...laundryRead, (req, res) => {
  try {
    res.json(svc.getSupplyLogService(+req.params.id))
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

laundryRouter.put('/machines/:machine_id/supplies/:supply_id', ...slaWrite, (req, res) => {
  try {
    const { per_wash_amount } = req.body
    svc.upsertMachineSupplyService(+req.params.machine_id, +req.params.supply_id, per_wash_amount, req.user.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.delete('/machines/:machine_id/supplies/:supply_id', ...slaWrite, (req, res) => {
  try {
    svc.deleteMachineSupplyService(+req.params.machine_id, +req.params.supply_id, req.user.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ═══════════════════════════════════════════════════════════════════════════
// GARMENT TYPES
// ═══════════════════════════════════════════════════════════════════════════

laundryRouter.get('/garment-types/all', ...laundryFull, (req, res) => {
  try {
    res.json(listGarmentTypesQuery(true))
  } catch(e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

laundryRouter.get('/garment-types', ...laundryRead, (req, res) => {
  try {
    res.json(listGarmentTypesQuery(false))
  } catch(e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

laundryRouter.post('/garment-types', ...laundryFull, validate(createGarmentTypeSchema), (req, res) => {
  try {
    const result = insertGarmentTypeQuery(req.validated)
    res.status(201).json(result)
  } catch(e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

laundryRouter.patch('/garment-types/:id', ...laundryFull, validate(updateGarmentTypeSchema), (req, res) => {
  try {
    const result = updateGarmentTypeQuery(+req.params.id, req.validated)
    if (!result) return res.status(404).json({ error: 'Bulunamadı' })
    res.json(result)
  } catch(e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

laundryRouter.post('/garment-types/reorder', ...laundryFull, (req, res) => {
  try {
    const { items } = req.body
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items array gerekli' })
    reorderGarmentTypesQuery(items)
    res.json({ ok: true })
  } catch(e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ═══════════════════════════════════════════════════════════════════════════
// LAUNDRY BAGS — QR koduyla canta takibi (M21)
// ═══════════════════════════════════════════════════════════════════════════

const VALID_BAG_STATUSES = new Set(['clean','dirty','collected','washing','ready','distributed'])

laundryRouter.get('/bags', ...laundryRead, (req, res) => {
  const db = getDB()
  const rows = db.prepare(`
    SELECT b.*, r.block, r.room_no, r.floor
    FROM laundry_bags b
    LEFT JOIN rooms r ON r.id = b.room_id
    ORDER BY b.id DESC LIMIT 200
  `).all()
  res.json(rows)
})

laundryRouter.get('/bags/by-qr/:code', ...laundryRead, (req, res) => {
  const db = getDB()
  const row = db.prepare(`
    SELECT b.*, r.block, r.room_no, r.floor, m.name as machine_name
    FROM laundry_bags b
    LEFT JOIN rooms r ON r.id = b.room_id
    LEFT JOIN machines m ON m.id = b.machine_id
    WHERE b.qr_code = ?
  `).get(req.params.code)
  if (!row) return res.status(404).json({ error: 'Çanta bulunamadı' })
  res.json(row)
})

laundryRouter.post('/bags', ...laundryFull, validate(createBagSchema), (req, res) => {
  const { qr_code, room_id } = req.validated
  const db = getDB()
  try {
    const r = db.prepare(`
      INSERT INTO laundry_bags(qr_code, room_id, status) VALUES(?, ?, 'clean')
    `).run(qr_code, room_id || null)
    res.status(201).json({ id: Number(r.lastInsertRowid) })
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Bu QR koduyla çanta zaten kayıtlı' })
    throw e
  }
})

laundryRouter.patch('/bags/:id/status', ...laundryFull, (req, res) => {
  const { status, machine_id } = req.body || {}
  if (!VALID_BAG_STATUSES.has(status)) return res.status(400).json({ error: 'Geçersiz durum' })
  const db = getDB()
  const sets = ['status = ?']
  const params = [status]
  if (status === 'collected')   { sets.push("collected_at = datetime('now')") }
  if (status === 'washing')     { sets.push("wash_started_at = datetime('now')") }
  if (status === 'distributed') { sets.push("distributed_at = datetime('now')") }
  if (machine_id !== undefined) { sets.push('machine_id = ?'); params.push(machine_id || null) }
  params.push(req.params.id)
  const r = db.prepare(`UPDATE laundry_bags SET ${sets.join(', ')} WHERE id = ?`).run(...params)
  if (r.changes === 0) return res.status(404).json({ error: 'Çanta bulunamadı' })
  res.json({ ok: true })
})
