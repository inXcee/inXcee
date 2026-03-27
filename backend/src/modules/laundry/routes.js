import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import * as svc from './service.js'

export const laundryRouter = Router()

// Yetki seviyeleri
const laundryFull = requireRole('laundry')
const laundryRead = requireRole('laundry', 'shift_supervisor', 'campus_manager')
const slaWrite    = requireRole('laundry', 'campus_manager')

// ═══════════════════════════════════════════════════════════════════════════
// ITEMS
// ═══════════════════════════════════════════════════════════════════════════

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
    const item = svc.advanceItemService(+req.params.id, req.body, req.user.id)
    res.json(item)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.patch('/items/:id/deliver', ...laundryFull, (req, res) => {
  try {
    const item = svc.deliverItemService(+req.params.id, req.body, req.user.id)
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
    const { stage, warning_hours, critical_hours } = req.body
    if (!stage || warning_hours == null || critical_hours == null) {
      return res.status(400).json({ error: 'stage, warning_hours, critical_hours zorunlu' })
    }
    if (+critical_hours <= +warning_hours) {
      return res.status(400).json({ error: 'Kritik eşik uyarıdan büyük olmalı' })
    }
    svc.upsertSlaConfigService({ stage, warning_hours: +warning_hours, critical_hours: +critical_hours, updated_by: req.user.id })
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
    const items = svc.listAllItemsService(req.query)
    const header = 'ID,Blok,Oda,Durum,Parça,Acil,Notlar,Oluşturulma'
    const rows = items.map(i => [
      i.id,
      i.block || '',
      i.room_no || '',
      i.status,
      i.item_count,
      i.urgent ? 'Evet' : 'Hayır',
      (i.notes || '').replace(/,/g, ';').replace(/\n/g, ' '),
      i.created_at,
    ].join(','))
    const csv = [header, ...rows].join('\n')
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="camasir-${new Date().toISOString().slice(0,10)}.csv"`)
    res.send('\uFEFF' + csv)
  } catch (e) { res.status(500).json({ error: e.message }) }
})
