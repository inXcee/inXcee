import { Router } from 'express'
import PDFDocument from 'pdfkit'
import { isIsoMonth } from '../../shared/validation/date.js'
import fs from 'node:fs'
import { requireRole } from '../../shared/auth/middleware.js'
import { logAudit } from '../../shared/audit.js'
import { createImageUpload, verifyMagicBytes } from '../../shared/uploads/middleware.js'
import { removeUploadFile } from './file-lifecycle.js'
import {
  productsService, createProductService, updateProductService, deleteProductService,
  brandsService, createBrandService, updateBrandService, deleteBrandService,
  zonesService, zoneTargetSuggestionsService, createZoneService, updateZoneService, deleteZoneService,
  zoneSubLocationsService, createZoneSubLocationService, deleteZoneSubLocationService,
  createIntakeService, createDistributionService, deleteMovementService, clearDistributionsService, updateMovementService, movementsService,
  createReturnService, batchReturnService, deleteReturnService, returnsService, depositService,
  summaryService, productDistributionService, pivotService, batchIntakeService, batchDistributeService, parseDistributionText,
  alertsService, forecastService, trendsService, waterDailyDigest, dailyDigestDeliveriesService,
  intakeLotsService, updateIntakeLotService,
  reconciliationService, buildReconciliationPDF, saveStockCountService, monthlyCloseService, monthlyUnlockService,
  pendingDistributionsService,
  templatesService, createTemplateService, deleteTemplateService,
  adjustmentsService, createAdjustmentService, deleteAdjustmentService, COUNT_REASONS,
  reviewQueueService, approveReviewsService,
  truckArrivalsService, createTruckArrivalService, updateTruckArrivalService, deleteTruckArrivalService,
  truckGateEntryService, buildTruckGateEntryPDF, buildTruckGateEntryExcel,
  sendTruckArrivalMailService, markTruckMailSentService, markTruckCheckedService, checkTruckArrivalAlerts,
  waybillPhotosService, createWaybillPhotoService, deleteWaybillPhotoService,
  accountingReportService, writeAccountingReportPDF, attachReportPhotos,
} from './service.js'

export const waterRouter = Router()
const mgr = requireRole('campus_manager', 'shift_supervisor')
const managerOnly = requireRole('campus_manager')
const waybillUpload = createImageUpload('water-waybill')

const fail = (next, e) => next(e)

const AUDIT_FIELDS = {
  product: ['name', 'unit_label', 'base_unit', 'units_per_case', 'cases_per_pallet', 'is_active', 'min_level', 'critical_level', 'lead_time_days', 'safety_stock_days', 'expiry_tracking', 'expiry_warning_days', 'brand_id', 'is_returnable', 'sort_order'],
  brand: ['name', 'sort_order', 'is_active', 'color'],
  zone: ['name', 'code', 'note', 'is_active', 'expected_monthly'],
  movement: ['type', 'product_id', 'zone_id', 'move_date', 'qty_base', 'input_qty', 'input_unit', 'waybill_no', 'lot_no', 'production_date', 'expiry_date', 'lot_status', 'lot_status_note', 'note'],
}

function auditChange(before, after, fields) {
  const pick = row => row == null
    ? null
    : Object.fromEntries(fields.filter(key => Object.prototype.hasOwnProperty.call(row, key)).map(key => [key, row[key]]))
  return JSON.stringify({ before: pick(before), after: pick(after) })
}

// ── Ürünler ──
waterRouter.get('/products', ...mgr, (req, res, next) => {
  try { res.json(productsService({ includeInactive: req.query.all === '1' })) } catch (e) { fail(next, e) }
})
waterRouter.post('/products', ...mgr, (req, res, next) => {
  try { const id = createProductService(req.body); logAudit(req.user.id, 'water_product_create', 'water', id, req.body.name); res.status(201).json({ id }) }
  catch (e) { fail(next, e) }
})
waterRouter.put('/products/:id', ...mgr, (req, res, next) => {
  try {
    const change = updateProductService(+req.params.id, req.body)
    logAudit(req.user.id, 'water_product_update', 'water', +req.params.id, auditChange(change.before, change.after, AUDIT_FIELDS.product))
    res.json({ ok: true })
  } catch (e) { fail(next, e) }
})
waterRouter.delete('/products/:id', ...mgr, (req, res, next) => {
  try {
    const before = deleteProductService(+req.params.id)
    logAudit(req.user.id, 'water_product_delete', 'water', +req.params.id, auditChange(before, null, AUDIT_FIELDS.product))
    res.json({ ok: true })
  } catch (e) { fail(next, e) }
})

// ── Markalar ──
waterRouter.get('/brands', ...mgr, (req, res, next) => {
  try { res.json(brandsService({ includeInactive: req.query.all === '1' })) } catch (e) { fail(next, e) }
})
waterRouter.post('/brands', ...mgr, (req, res, next) => {
  try { const id = createBrandService(req.body); logAudit(req.user.id, 'water_brand_create', 'water', id, req.body.name); res.status(201).json({ id }) }
  catch (e) { fail(next, e) }
})
waterRouter.put('/brands/:id', ...mgr, (req, res, next) => {
  try {
    const change = updateBrandService(+req.params.id, req.body)
    logAudit(req.user.id, 'water_brand_update', 'water', +req.params.id, auditChange(change.before, change.after, AUDIT_FIELDS.brand))
    res.json({ ok: true })
  } catch (e) { fail(next, e) }
})
waterRouter.delete('/brands/:id', ...mgr, (req, res, next) => {
  try {
    const before = deleteBrandService(+req.params.id)
    logAudit(req.user.id, 'water_brand_delete', 'water', +req.params.id, auditChange(before, null, AUDIT_FIELDS.brand))
    res.json({ ok: true })
  } catch (e) { fail(next, e) }
})

// ── Bölgeler ──
waterRouter.get('/zones', ...mgr, (req, res, next) => {
  try { res.json(zonesService({ includeInactive: req.query.all === '1' })) } catch (e) { fail(next, e) }
})
waterRouter.get('/zones/target-suggestions', ...mgr, (req, res, next) => {
  try { res.json(zoneTargetSuggestionsService({ as_of: req.query.as_of, months: req.query.months == null ? 3 : +req.query.months })) }
  catch (e) { fail(next, e) }
})
waterRouter.post('/zones', ...mgr, (req, res, next) => {
  try { const id = createZoneService(req.body); logAudit(req.user.id, 'water_zone_create', 'water', id, req.body.name); res.status(201).json({ id }) }
  catch (e) { fail(next, e) }
})
waterRouter.put('/zones/:id', ...mgr, (req, res, next) => {
  try {
    const change = updateZoneService(+req.params.id, req.body)
    logAudit(req.user.id, 'water_zone_update', 'water', +req.params.id, auditChange(change.before, change.after, AUDIT_FIELDS.zone))
    res.json({ ok: true })
  } catch (e) { fail(next, e) }
})
waterRouter.delete('/zones/:id', ...mgr, (req, res, next) => {
  try {
    const before = deleteZoneService(+req.params.id)
    logAudit(req.user.id, 'water_zone_delete', 'water', +req.params.id, auditChange(before, null, AUDIT_FIELDS.zone))
    res.json({ ok: true })
  } catch (e) { fail(next, e) }
})

// ── Alt yerler: bir bölgeye toplanan teslim noktaları (parser'da takma ad) ──
waterRouter.get('/zones/:id/sub-locations', ...mgr, (req, res, next) => {
  try { res.json(zoneSubLocationsService(+req.params.id)) } catch (e) { fail(next, e) }
})
waterRouter.post('/zones/:id/sub-locations', ...mgr, (req, res, next) => {
  try {
    const row = createZoneSubLocationService(+req.params.id, req.body)
    logAudit(req.user.id, 'water_zone_sub_create', 'water', +req.params.id, row.name)
    res.status(201).json(row)
  } catch (e) { fail(next, e) }
})
waterRouter.delete('/zones/:id/sub-locations/:subId', ...mgr, (req, res, next) => {
  try {
    const row = deleteZoneSubLocationService(+req.params.id, +req.params.subId)
    logAudit(req.user.id, 'water_zone_sub_delete', 'water', +req.params.id, row.name)
    res.json({ ok: true })
  } catch (e) { fail(next, e) }
})

// ── Hareketler ──
waterRouter.get('/movements', ...mgr, (req, res, next) => {
  try {
    const { type, product_id, zone_id, from, to, limit } = req.query
    const parsedLimit = limit ? Math.min(1000, Math.max(1, parseInt(limit, 10) || 200)) : undefined
    res.json(movementsService({
      type, from, to,
      product_id: product_id ? +product_id : undefined,
      zone_id: zone_id ? +zone_id : undefined,
      limit: parsedLimit,
    }))
  } catch (e) { fail(next, e) }
})

// Giriş (irsaliye)
waterRouter.post('/intake', ...mgr, (req, res, next) => {
  try {
    const id = createIntakeService(req.body, req.user.id)
    logAudit(req.user.id, 'water_intake', 'water', id, `${req.body.input_qty} ${req.body.input_unit}`)
    res.status(201).json({ id })
  } catch (e) { fail(next, e) }
})

// Toplu giriş (tek irsaliye, çok ürün)
waterRouter.post('/intake/batch', ...mgr, (req, res, next) => {
  try {
    const { ids, matched } = batchIntakeService(req.body, req.user.id)
    logAudit(req.user.id, 'water_intake_batch', 'water', null, `irsaliye:${req.body.waybill_no || '-'} ${ids.length} satır`)
    res.status(201).json({ ids, count: ids.length, matched })
  } catch (e) { fail(next, e) }
})

// Dağıtım (bölgeye bırakma)
waterRouter.post('/distribute', ...mgr, (req, res, next) => {
  try {
    const id = createDistributionService(req.body, req.user.id)
    logAudit(req.user.id, 'water_distribute', 'water', id, `zone:${req.body.zone_id} ${req.body.input_qty} ${req.body.input_unit}`)
    res.status(201).json({ id })
  } catch (e) { fail(next, e) }
})

// Metinden dağıtım — önizleme (kaydetmez)
waterRouter.post('/distribute/parse', ...mgr, (req, res, next) => {
  try { res.json(parseDistributionText(req.body?.text || '')) } catch (e) { fail(next, e) }
})

// Toplu dağıtım (yapılandırılmış satırlar)
waterRouter.post('/distribute/batch', ...mgr, (req, res, next) => {
  try {
    const ids = batchDistributeService(req.body, req.user.id)
    logAudit(req.user.id, 'water_distribute_batch', 'water', null, `${ids.length} satır`)
    res.status(201).json({ ids, count: ids.length })
  } catch (e) { fail(next, e) }
})

// Giriş (irsaliye) ve dağıtım kayıtlarını düzenler — tür otomatik ayırt edilir.
waterRouter.put('/movements/:id', ...mgr, (req, res, next) => {
  try {
    updateMovementService(+req.params.id, req.body, req.user.id)
    logAudit(req.user.id, 'water_movement_update', 'water', +req.params.id, `${req.body.input_qty} ${req.body.input_unit}`)
    res.json({ ok: true })
  } catch (e) { fail(next, e) }
})

waterRouter.delete('/movements/:id', ...mgr, (req, res, next) => {
  try {
    const force = req.query.force === '1' || req.query.force === 'true'
    if (force && req.user.role !== 'campus_manager') {
      return res.status(403).json({ error: 'Bağlantıları çözerek silme yetkisi yalnızca müdürde' })
    }
    const before = deleteMovementService(+req.params.id, { force })
    logAudit(req.user.id, force ? 'water_movement_delete_force' : 'water_movement_delete', 'water', +req.params.id, auditChange(before, null, AUDIT_FIELDS.movement))
    res.json({ ok: true })
  } catch (e) { fail(next, e) }
})

// Bir dönemdeki dağıtım kayıtlarını topluca sil (müdür). Giriş/iade dokunulmaz; ay kilidine saygılı.
waterRouter.post('/movements/clear', ...managerOnly, (req, res, next) => {
  try {
    const result = clearDistributionsService({ from: req.body.from, to: req.body.to })
    logAudit(req.user.id, 'water_movements_clear', 'water', null, `${result.from}..${result.to} → ${result.deleted} dağıtım silindi`)
    res.json(result)
  } catch (e) { fail(next, e) }
})

// ── Boş kap / palet iadeleri (depozito) ──
waterRouter.get('/returns', ...mgr, (req, res, next) => {
  try {
    const { product_id, from, to } = req.query
    res.json(returnsService({ from, to, product_id: product_id ? +product_id : undefined }))
  } catch (e) { fail(next, e) }
})
waterRouter.get('/deposit', ...mgr, (req, res, next) => {
  try { const { from, to } = req.query; res.json(depositService({ from, to })) } catch (e) { fail(next, e) }
})
waterRouter.post('/returns', ...mgr, (req, res, next) => {
  try {
    const id = createReturnService(req.body, req.user.id)
    logAudit(req.user.id, 'water_return', 'water', id, `${req.body.input_qty} ${req.body.input_unit}`)
    res.status(201).json({ id })
  } catch (e) { fail(next, e) }
})
waterRouter.post('/returns/batch', ...mgr, (req, res, next) => {
  try {
    const ids = batchReturnService(req.body, req.user.id)
    logAudit(req.user.id, 'water_return_batch', 'water', null, `${ids.length} satır`)
    res.status(201).json({ ids, count: ids.length })
  } catch (e) { fail(next, e) }
})
waterRouter.delete('/returns/:id', ...mgr, (req, res, next) => {
  try { deleteReturnService(+req.params.id); res.json({ ok: true }) } catch (e) { fail(next, e) }
})

// ── INDEX pivot (firma × marka/ürün matrisi) ──
waterRouter.get('/pivot', ...mgr, (req, res, next) => {
  try { const { from, to } = req.query; res.json(pivotService({ from, to })) } catch (e) { fail(next, e) }
})

// ── Operasyon Uyarı Merkezi ("Bugün Yapılacaklar") ──
waterRouter.get('/alerts', ...mgr, (req, res, next) => {
  try { res.json(alertsService({ today: req.query.today })) } catch (e) { fail(next, e) }
})

// ── Günlük operasyon özeti teslim geçmişi / elle çalıştırma ──
waterRouter.get('/daily-digest', ...mgr, (req, res, next) => {
  try { res.json(dailyDigestDeliveriesService({ limit: req.query.limit })) } catch (e) { fail(next, e) }
})

// Giriş lotları, SKT sağlık durumu ve karantina yönetimi
waterRouter.get('/lots', ...mgr, (req, res, next) => {
  try {
    res.json(intakeLotsService({
      today: req.query.today,
      status: req.query.status,
      product_id: req.query.product_id ? +req.query.product_id : undefined,
    }))
  } catch (e) { fail(next, e) }
})
waterRouter.put('/lots/:id', ...mgr, (req, res, next) => {
  try {
    const change = updateIntakeLotService(+req.params.id, req.body, req.user.id)
    const audit = JSON.parse(auditChange(change.before, change.after, [
      'lot_no', 'production_date', 'expiry_date', 'lot_status', 'lot_status_note',
    ]))
    logAudit(req.user.id, 'water_lot_update', 'water', +req.params.id, JSON.stringify({
      ...audit,
      affected_distribution_ids: change.affected_distribution_ids,
      released_base: change.released_base,
      reallocated_rows: change.matched,
    }))
    res.json({ ok: true, matched: change.matched, lot: change.after })
  } catch (e) { fail(next, e) }
})
waterRouter.post('/daily-digest/run', ...managerOnly, (req, res, next) => {
  try {
    const result = waterDailyDigest({
      forceEmail: req.body?.force === true,
      requestedBy: req.user.id,
      source: 'manual',
    })
    logAudit(req.user.id, 'water_daily_digest_run', 'water', result.email?.id || null, result.email?.status || 'unknown')
    const queued = result.email?.status === 'queued' && !result.email?.already_queued
    res.status(queued ? 202 : 200).json(result)
  } catch (e) { fail(next, e) }
})

// ── Tüketim öngörüsü & sipariş önerisi ──
waterRouter.get('/forecast', ...mgr, (req, res, next) => {
  try { res.json(forecastService({ today: req.query.today, window: req.query.window, targetDays: req.query.target_days })) }
  catch (e) { fail(next, e) }
})

// ── Trend & analiz (son N ay) ──
waterRouter.get('/trends', ...mgr, (req, res, next) => {
  try { res.json(trendsService({ today: req.query.today, months: req.query.months })) }
  catch (e) { fail(next, e) }
})

// ── Tır ön bildirimleri / 17:00 mail kontrolü ──
waterRouter.get('/truck-arrivals', ...mgr, (req, res, next) => {
  try {
    const { from, to, status, limit } = req.query
    res.json(truckArrivalsService({ from, to, status, limit }))
  } catch (e) { fail(next, e) }
})
waterRouter.get('/truck-arrivals/:id/gate-entry.pdf', ...mgr, (req, res, next) => {
  try {
    const truck = truckGateEntryService(+req.params.id)
    const filename = `su-nakliye-personel-giris-${truck.arrival_date}-${truck.plate.replace(/\s+/g, '-')}.pdf`
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 24 })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    doc.pipe(res)
    buildTruckGateEntryPDF(truck, doc)
    logAudit(req.user.id, 'water_truck_gate_pdf', 'water', truck.id, filename)
  } catch (e) { fail(next, e) }
})
waterRouter.get('/truck-arrivals/:id/gate-entry.xlsx', ...mgr, async (req, res, next) => {
  try {
    const truck = truckGateEntryService(+req.params.id)
    const filename = `su-nakliye-personel-giris-${truck.arrival_date}-${truck.plate.replace(/\s+/g, '-')}.xlsx`
    const workbook = await buildTruckGateEntryExcel(truck)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(workbook)
    logAudit(req.user.id, 'water_truck_gate_xlsx', 'water', truck.id, filename)
  } catch (e) { fail(next, e) }
})
waterRouter.post('/truck-arrivals', ...mgr, (req, res, next) => {
  try {
    const id = createTruckArrivalService(req.body, req.user.id)
    logAudit(req.user.id, 'water_truck_create', 'water', id, req.body.plate || '')
    res.status(201).json({ id })
  } catch (e) { fail(next, e) }
})
waterRouter.put('/truck-arrivals/:id', ...mgr, (req, res, next) => {
  try {
    updateTruckArrivalService(+req.params.id, req.body, req.user.id)
    logAudit(req.user.id, 'water_truck_update', 'water', +req.params.id, req.body.plate || '')
    res.json({ ok: true })
  } catch (e) { fail(next, e) }
})
waterRouter.delete('/truck-arrivals/:id', ...managerOnly, (req, res, next) => {
  try {
    const result = deleteTruckArrivalService(+req.params.id)
    const fileResults = result.deleted_photos.map(photo => removeUploadFile(photo.photo_url))
    const pending = fileResults.filter(item => item.status === 'failed').length
    const detail = `foto_silinen:${result.deleted_photos.length} foto_korunan:${result.preserved_photo_ids.length} dosya_bekleyen:${pending}`
    logAudit(req.user.id, 'water_truck_delete', 'water', +req.params.id, detail)
    res.json({
      ok: true,
      deleted_photo_count: result.deleted_photos.length,
      preserved_photo_count: result.preserved_photo_ids.length,
      file_cleanup_pending: pending,
    })
  } catch (e) { fail(next, e) }
})
waterRouter.post('/truck-arrivals/:id/send-mail', ...managerOnly, async (req, res, next) => {
  try {
    const result = await sendTruckArrivalMailService(+req.params.id, req.user.id)
    logAudit(req.user.id, 'water_truck_mail_queue', 'water', +req.params.id, `job:${result.job_id}`)
    res.status(result.alreadyQueued ? 200 : 202).json(result)
  } catch (e) { fail(next, e) }
})
waterRouter.post('/truck-arrivals/:id/mark-mail-sent', ...mgr, (req, res, next) => {
  try {
    const truck = markTruckMailSentService(+req.params.id, req.user.id)
    logAudit(req.user.id, 'water_truck_mail_mark', 'water', +req.params.id, '')
    res.json(truck)
  } catch (e) { fail(next, e) }
})
waterRouter.post('/truck-arrivals/:id/check', ...mgr, (req, res, next) => {
  try {
    const truck = markTruckCheckedService(+req.params.id, req.user.id)
    logAudit(req.user.id, 'water_truck_check', 'water', +req.params.id, '')
    res.json(truck)
  } catch (e) { fail(next, e) }
})
waterRouter.post('/truck-arrivals/check-alerts', ...managerOnly, (req, res, next) => {
  try { res.json(checkTruckArrivalAlerts()) } catch (e) { fail(next, e) }
})

// ── İrsaliye fotoğraf arşivi ──
waterRouter.get('/waybill-photos', ...mgr, (req, res, next) => {
  try {
    const { truck_arrival_id, movement_id, waybill_no, from, to, limit } = req.query
    res.json(waybillPhotosService({
      truck_arrival_id: truck_arrival_id ? +truck_arrival_id : undefined,
      movement_id: movement_id ? +movement_id : undefined,
      waybill_no, from, to, limit,
    }))
  } catch (e) { fail(next, e) }
})
waterRouter.post('/waybill-photos', ...mgr, waybillUpload.single('photo'), verifyMagicBytes, (req, res, next) => {
  try {
    const id = createWaybillPhotoService(req.body, req.file, req.user.id)
    logAudit(req.user.id, 'water_waybill_photo_upload', 'water', id, req.body.waybill_no || '')
    res.status(201).json({ id })
  } catch (e) {
    if (req.file?.path) { try { fs.unlinkSync(req.file.path) } catch { /* ignore */ } }
    fail(next, e)
  }
})
waterRouter.delete('/waybill-photos/:id', ...mgr, (req, res, next) => {
  try {
    const row = deleteWaybillPhotoService(+req.params.id)
    const fileResult = removeUploadFile(row.photo_url)
    logAudit(req.user.id, 'water_waybill_photo_delete', 'water', +req.params.id, '')
    res.json({ ok: true, file_status: fileResult.status })
  } catch (e) { fail(next, e) }
})

// ── Stok düzeltme / sayım fişi ──
waterRouter.get('/adjustments', ...mgr, (req, res, next) => {
  try {
    const { product_id, from, to } = req.query
    res.json({ rows: adjustmentsService({ from, to, product_id: product_id ? +product_id : undefined }), reasons: COUNT_REASONS })
  } catch (e) { fail(next, e) }
})
// Düzeltme yazımı — sadece kampüs müdürü (kontrollü stok düzeltme)
waterRouter.post('/adjustments', ...managerOnly, (req, res, next) => {
  try {
    const id = createAdjustmentService(req.body, req.user.id)
    logAudit(req.user.id, 'water_adjustment', 'water', id, `${req.body.direction} ${req.body.input_qty} ${req.body.input_unit} (${req.body.reason})`)
    res.status(201).json({ id })
  } catch (e) { fail(next, e) }
})
waterRouter.delete('/adjustments/:id', ...managerOnly, (req, res, next) => {
  try {
    deleteAdjustmentService(+req.params.id)
    logAudit(req.user.id, 'water_adjustment_delete', 'water', +req.params.id, null)
    res.json({ ok: true })
  } catch (e) { fail(next, e) }
})

// ── Hızlı giriş şablonları ──
waterRouter.get('/templates', ...mgr, (req, res, next) => {
  try { res.json(templatesService()) } catch (e) { fail(next, e) }
})
waterRouter.post('/templates', ...mgr, (req, res, next) => {
  try {
    const id = createTemplateService(req.body, req.user.id)
    logAudit(req.user.id, 'water_template_create', 'water', id, req.body.name)
    res.status(201).json({ id })
  } catch (e) { fail(next, e) }
})
waterRouter.delete('/templates/:id', ...mgr, (req, res, next) => {
  try { deleteTemplateService(+req.params.id); res.json({ ok: true }) } catch (e) { fail(next, e) }
})

// ── Onay akışı (kontrol bekleyen eksi stok dağıtımları) ──
waterRouter.get('/review', ...mgr, (req, res, next) => {
  try { res.json(reviewQueueService()) } catch (e) { fail(next, e) }
})
waterRouter.post('/review/approve', ...managerOnly, (req, res, next) => {
  try {
    const approved = approveReviewsService(req.body?.ids, req.body?.note, req.user.id)
    logAudit(req.user.id, 'water_review_approve', 'water', null, JSON.stringify({ approved, ids: req.body?.ids || null, note: req.body?.note }))
    res.json({ approved })
  } catch (e) { fail(next, e) }
})

// ── İrsaliye Bekleyenler ──
waterRouter.get('/pending', ...mgr, (req, res, next) => {
  try { res.json(pendingDistributionsService({ today: req.query.today })) } catch (e) { fail(next, e) }
})

// ── Ay Sonu Kapanış / Uyuşturma ──
waterRouter.get('/reconciliation', ...mgr, (req, res, next) => {
  try { res.json(reconciliationService({ month: req.query.month })) } catch (e) { fail(next, e) }
})

// Ay kapanışı kısa PDF özeti (gelen/dağıtılan/kalan/eksi + en çok dağıtılan yerler)
waterRouter.get('/reconciliation/:month/pdf', ...mgr, (req, res, next) => {
  try {
    const month = req.params.month
    if (!isIsoMonth(month)) return res.status(400).json({ error: 'Ay YYYY-MM formatında olmalı' })
    const doc = new PDFDocument({ size: 'A4', margin: 40 })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="su-ay-kapanis-${month}.pdf"`)
    doc.pipe(res)
    buildReconciliationPDF(month, doc)
    logAudit(req.user.id, 'water_close_pdf', 'water', null, month)
  } catch (e) { fail(next, e) }
})
waterRouter.post('/stock-count', ...mgr, (req, res, next) => {
  try {
    const r = saveStockCountService(req.body, req.user.id)
    logAudit(req.user.id, 'water_stock_count', 'water', req.body.product_id, `${req.body.month} fark:${r.diff_base}`)
    res.json(r)
  } catch (e) { fail(next, e) }
})
// Ay kapanışı/kilit — sadece kampüs müdürü
waterRouter.post('/monthly-close', ...managerOnly, (req, res, next) => {
  try {
    const c = monthlyCloseService(req.body, req.user.id)
    logAudit(req.user.id, 'water_month_close', 'water', null, req.body.month)
    res.status(201).json(c)
  } catch (e) { fail(next, e) }
})
waterRouter.post('/monthly-close/:month/unlock', ...managerOnly, (req, res, next) => {
  try {
    monthlyUnlockService(req.params.month)
    logAudit(req.user.id, 'water_month_unlock', 'water', null, req.params.month)
    res.json({ ok: true })
  } catch (e) { fail(next, e) }
})

// ── Muhasebe raporu ──
// Özet tek sayfa; sections=ledger,photos,matrix,days,zones,intakes (veya all) ek bölümleri açar.
waterRouter.get('/report/accounting', ...mgr, (req, res, next) => {
  try {
    res.json(accountingReportService({ from: req.query.from, to: req.query.to, sections: req.query.sections }))
  } catch (e) { fail(next, e) }
})
waterRouter.get('/report/accounting.pdf', ...mgr, async (req, res, next) => {
  try {
    const report = accountingReportService({ from: req.query.from, to: req.query.to, sections: req.query.sections })
    // Fotoğraflar çizimden önce diskten okunup küçültülür (çizici senkron kalır)
    if (report.photos?.items?.length) await attachReportPhotos(report)
    const doc = new PDFDocument({ size: 'A4', margin: 28 })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="su-muhasebe-raporu-${report.from}_${report.to}.pdf"`)
    doc.pipe(res)
    writeAccountingReportPDF(report, doc)
    logAudit(req.user.id, 'water_accounting_pdf', 'water', null,
      `${report.from}..${report.to}${report.sections.length ? ` +${report.sections.join(',')}` : ''}`)
  } catch (e) { fail(next, e) }
})

// Tek ürünün dağıtım dökümü — hangi gün, hangi yere, kaç adet.
// Dönem verilmezse ürünün tüm geçmişi döner.
waterRouter.get('/products/:id/distribution', ...mgr, (req, res, next) => {
  try {
    res.json(productDistributionService({
      product_id: +req.params.id,
      from: req.query.from || undefined,
      to: req.query.to || undefined,
    }))
  } catch (e) { fail(next, e) }
})

// ── Özet / dashboard ──
waterRouter.get('/summary', ...mgr, (req, res, next) => {
  try {
    const { from, to, product_id, group } = req.query
    res.json(summaryService({ from, to, group: group === 'month' ? 'month' : 'day', product_id: product_id ? +product_id : undefined }))
  } catch (e) { fail(next, e) }
})
