import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { upload } from '../../shared/uploads/middleware.js'
import { getDB } from '../../shared/db/index.js'
import * as svc from './service.js'
import { notifyItemReady, sendFoundMessage } from './whatsapp.js'

export const laundryRouter = Router()

// Yetki seviyeleri
// campus_manager tüm işlemlere erişebilir (en yetkili)
const laundryFull = requireRole('laundry', 'campus_manager')
const laundryRead = requireRole('laundry', 'shift_supervisor', 'campus_manager')
const slaWrite    = requireRole('laundry', 'campus_manager')

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
  } catch (e) { res.status(500).json({ error: e.message }) }
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
  } catch (e) { res.status(500).json({ error: e.message }) }
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

laundryRouter.delete('/items/:id', ...laundryFull, (req, res) => {
  try {
    svc.deleteItemService(+req.params.id, req.user.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.post('/items/batch-assign', ...laundryFull, (req, res) => {
  try {
    const { item_ids, machine_id, timer_minutes } = req.body
    if (!Array.isArray(item_ids) || !machine_id) {
      return res.status(400).json({ error: 'item_ids[] ve machine_id zorunlu' })
    }
    const result = svc.batchAssignService(item_ids, +machine_id, timer_minutes ? +timer_minutes : null, req.user.id)
    res.json(result)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.post('/items/batch-lost', ...laundryFull, (req, res) => {
  try {
    const { item_ids, notes } = req.body
    if (!Array.isArray(item_ids)) return res.status(400).json({ error: 'item_ids[] zorunlu' })
    const result = svc.batchLostService(item_ids, notes, req.user.id)
    res.json(result)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// Toplu teslim — batch-deliver must come before /:id routes
laundryRouter.post('/items/batch-deliver', ...laundryFull, (req, res) => {
  try {
    const { item_ids, delivered_to, signature_data } = req.body
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

// ═══════════════════════════════════════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════════════════════════════════════

laundryRouter.get('/reports/stats', ...laundryRead, (req, res) => {
  res.json(svc.getStatsService(req.query))
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
  } catch (e) { res.status(500).json({ error: e.message }) }
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
  } catch (e) { res.status(500).json({ error: e.message }) }
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
  } catch (e) { res.status(500).json({ error: e.message }) }
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
  } catch (e) { res.status(500).json({ error: e.message }) }
})

laundryRouter.get('/block-config', ...laundryRead, (req, res) => {
  try { res.json(svc.getBlockConfigService()) }
  catch (e) { res.status(500).json({ error: e.message }) }
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

laundryRouter.post('/upload-photo', ...laundryFull, upload.single('photo'), (req, res) => {
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
  } catch (e) { res.status(500).json({ error: e.message }) }
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
  catch (e) { res.status(500).json({ error: e.message }) }
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
    const { block, room_no, type, brand, size, color, status, from, to, page, limit } = req.query
    res.json(svc.searchPremiumGarmentsService({
      block, room_no, garment_type: type, brand, size, color, status,
      from_date: from, to_date: to,
      page: page ? +page : 1,
      limit: limit ? Math.min(+limit, 100) : 50,
    }))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

laundryRouter.get('/rooms/:room_id/garment-history', ...laundryRead, (req, res) => {
  try {
    const { from, to } = req.query
    res.json(svc.getRoomGarmentHistoryService(+req.params.room_id, { from_date: from, to_date: to }))
  } catch (e) { res.status(500).json({ error: e.message }) }
})
