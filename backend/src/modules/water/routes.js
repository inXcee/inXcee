import { Router } from 'express'
import PDFDocument from 'pdfkit'
import { requireRole } from '../../shared/auth/middleware.js'
import { logAudit } from '../../shared/audit.js'
import { logger } from '../../shared/logger.js'
import {
  productsService, createProductService, updateProductService, deleteProductService,
  brandsService, createBrandService, updateBrandService, deleteBrandService,
  zonesService, createZoneService, updateZoneService, deleteZoneService,
  createIntakeService, createDistributionService, deleteMovementService, updateDistributionService, movementsService,
  createReturnService, batchReturnService, deleteReturnService, returnsService, depositService,
  summaryService, pivotService, batchIntakeService, batchDistributeService, parseDistributionText,
  alertsService, reconciliationService, saveStockCountService, monthlyCloseService, monthlyUnlockService,
  monthLockWarning, pendingDistributionsService,
  templatesService, createTemplateService, deleteTemplateService,
  adjustmentsService, createAdjustmentService, deleteAdjustmentService, COUNT_REASONS,
  reviewQueueService, approveReviewsService,
} from './service.js'

export const waterRouter = Router()
const mgr = requireRole('campus_manager', 'shift_supervisor')
const managerOnly = requireRole('campus_manager')

const fail = (res, e) => res.status(e.statusCode || 500).json({ error: e.message || 'Sunucu hatası' })

// ── Ürünler ──
waterRouter.get('/products', ...mgr, (req, res) => {
  try { res.json(productsService({ includeInactive: req.query.all === '1' })) } catch (e) { logger.error('[water]', e); fail(res, e) }
})
waterRouter.post('/products', ...mgr, (req, res) => {
  try { const id = createProductService(req.body); logAudit(req.user.id, 'water_product_create', 'water', id, req.body.name); res.status(201).json({ id }) }
  catch (e) { fail(res, e) }
})
waterRouter.put('/products/:id', ...mgr, (req, res) => {
  try { updateProductService(+req.params.id, req.body); res.json({ ok: true }) } catch (e) { fail(res, e) }
})
waterRouter.delete('/products/:id', ...mgr, (req, res) => {
  try { deleteProductService(+req.params.id); res.json({ ok: true }) } catch (e) { fail(res, e) }
})

// ── Markalar ──
waterRouter.get('/brands', ...mgr, (req, res) => {
  try { res.json(brandsService({ includeInactive: req.query.all === '1' })) } catch (e) { logger.error('[water]', e); fail(res, e) }
})
waterRouter.post('/brands', ...mgr, (req, res) => {
  try { const id = createBrandService(req.body); logAudit(req.user.id, 'water_brand_create', 'water', id, req.body.name); res.status(201).json({ id }) }
  catch (e) { fail(res, e) }
})
waterRouter.put('/brands/:id', ...mgr, (req, res) => {
  try { updateBrandService(+req.params.id, req.body); res.json({ ok: true }) } catch (e) { fail(res, e) }
})
waterRouter.delete('/brands/:id', ...mgr, (req, res) => {
  try { deleteBrandService(+req.params.id); res.json({ ok: true }) } catch (e) { fail(res, e) }
})

// ── Bölgeler ──
waterRouter.get('/zones', ...mgr, (req, res) => {
  try { res.json(zonesService({ includeInactive: req.query.all === '1' })) } catch (e) { logger.error('[water]', e); fail(res, e) }
})
waterRouter.post('/zones', ...mgr, (req, res) => {
  try { const id = createZoneService(req.body); logAudit(req.user.id, 'water_zone_create', 'water', id, req.body.name); res.status(201).json({ id }) }
  catch (e) { fail(res, e) }
})
waterRouter.put('/zones/:id', ...mgr, (req, res) => {
  try { updateZoneService(+req.params.id, req.body); res.json({ ok: true }) } catch (e) { fail(res, e) }
})
waterRouter.delete('/zones/:id', ...mgr, (req, res) => {
  try { deleteZoneService(+req.params.id); res.json({ ok: true }) } catch (e) { fail(res, e) }
})

// ── Hareketler ──
waterRouter.get('/movements', ...mgr, (req, res) => {
  try {
    const { type, product_id, zone_id, from, to, limit } = req.query
    const parsedLimit = limit ? Math.min(1000, Math.max(1, parseInt(limit, 10) || 200)) : undefined
    res.json(movementsService({
      type, from, to,
      product_id: product_id ? +product_id : undefined,
      zone_id: zone_id ? +zone_id : undefined,
      limit: parsedLimit,
    }))
  } catch (e) { logger.error('[water]', e); fail(res, e) }
})

// Giriş (irsaliye)
waterRouter.post('/intake', ...mgr, (req, res) => {
  try {
    const id = createIntakeService(req.body, req.user.id)
    logAudit(req.user.id, 'water_intake', 'water', id, `${req.body.input_qty} ${req.body.input_unit}`)
    res.status(201).json({ id, warning: monthLockWarning(req.body.move_date) })
  } catch (e) { fail(res, e) }
})

// Toplu giriş (tek irsaliye, çok ürün)
waterRouter.post('/intake/batch', ...mgr, (req, res) => {
  try {
    const { ids, matched } = batchIntakeService(req.body, req.user.id)
    logAudit(req.user.id, 'water_intake_batch', 'water', null, `irsaliye:${req.body.waybill_no || '-'} ${ids.length} satır`)
    res.status(201).json({ ids, count: ids.length, matched, warning: monthLockWarning(req.body.move_date) })
  } catch (e) { fail(res, e) }
})

// Dağıtım (bölgeye bırakma)
waterRouter.post('/distribute', ...mgr, (req, res) => {
  try {
    const id = createDistributionService(req.body, req.user.id)
    logAudit(req.user.id, 'water_distribute', 'water', id, `zone:${req.body.zone_id} ${req.body.input_qty} ${req.body.input_unit}`)
    res.status(201).json({ id, warning: monthLockWarning(req.body.move_date) })
  } catch (e) { fail(res, e) }
})

// Metinden dağıtım — önizleme (kaydetmez)
waterRouter.post('/distribute/parse', ...mgr, (req, res) => {
  try { res.json(parseDistributionText(req.body?.text || '')) } catch (e) { logger.error('[water]', e); fail(res, e) }
})

// Toplu dağıtım (yapılandırılmış satırlar)
waterRouter.post('/distribute/batch', ...mgr, (req, res) => {
  try {
    const ids = batchDistributeService(req.body, req.user.id)
    logAudit(req.user.id, 'water_distribute_batch', 'water', null, `${ids.length} satır`)
    res.status(201).json({ ids, count: ids.length })
  } catch (e) { fail(res, e) }
})

waterRouter.put('/movements/:id', ...mgr, (req, res) => {
  try {
    updateDistributionService(+req.params.id, req.body, req.user.id)
    logAudit(req.user.id, 'water_movement_update', 'water', +req.params.id, `${req.body.input_qty} ${req.body.input_unit}`)
    res.json({ ok: true })
  } catch (e) { fail(res, e) }
})

waterRouter.delete('/movements/:id', ...mgr, (req, res) => {
  try { deleteMovementService(+req.params.id); res.json({ ok: true }) } catch (e) { fail(res, e) }
})

// ── Boş kap / palet iadeleri (depozito) ──
waterRouter.get('/returns', ...mgr, (req, res) => {
  try {
    const { product_id, from, to } = req.query
    res.json(returnsService({ from, to, product_id: product_id ? +product_id : undefined }))
  } catch (e) { logger.error('[water]', e); fail(res, e) }
})
waterRouter.get('/deposit', ...mgr, (req, res) => {
  try { const { from, to } = req.query; res.json(depositService({ from, to })) } catch (e) { logger.error('[water]', e); fail(res, e) }
})
waterRouter.post('/returns', ...mgr, (req, res) => {
  try {
    const id = createReturnService(req.body, req.user.id)
    logAudit(req.user.id, 'water_return', 'water', id, `${req.body.input_qty} ${req.body.input_unit}`)
    res.status(201).json({ id })
  } catch (e) { fail(res, e) }
})
waterRouter.post('/returns/batch', ...mgr, (req, res) => {
  try {
    const ids = batchReturnService(req.body, req.user.id)
    logAudit(req.user.id, 'water_return_batch', 'water', null, `${ids.length} satır`)
    res.status(201).json({ ids, count: ids.length })
  } catch (e) { fail(res, e) }
})
waterRouter.delete('/returns/:id', ...mgr, (req, res) => {
  try { deleteReturnService(+req.params.id); res.json({ ok: true }) } catch (e) { fail(res, e) }
})

// ── INDEX pivot (firma × marka/ürün matrisi) ──
waterRouter.get('/pivot', ...mgr, (req, res) => {
  try { const { from, to } = req.query; res.json(pivotService({ from, to })) } catch (e) { logger.error('[water]', e); fail(res, e) }
})

// ── Operasyon Uyarı Merkezi ("Bugün Yapılacaklar") ──
waterRouter.get('/alerts', ...mgr, (req, res) => {
  try { res.json(alertsService({ today: req.query.today })) } catch (e) { logger.error('[water]', e); fail(res, e) }
})

// ── Stok düzeltme / sayım fişi ──
waterRouter.get('/adjustments', ...mgr, (req, res) => {
  try {
    const { product_id, from, to } = req.query
    res.json({ rows: adjustmentsService({ from, to, product_id: product_id ? +product_id : undefined }), reasons: COUNT_REASONS })
  } catch (e) { logger.error('[water]', e); fail(res, e) }
})
// Düzeltme yazımı — sadece kampüs müdürü (kontrollü stok düzeltme)
waterRouter.post('/adjustments', ...managerOnly, (req, res) => {
  try {
    const id = createAdjustmentService(req.body, req.user.id)
    logAudit(req.user.id, 'water_adjustment', 'water', id, `${req.body.direction} ${req.body.input_qty} ${req.body.input_unit} (${req.body.reason})`)
    res.status(201).json({ id })
  } catch (e) { fail(res, e) }
})
waterRouter.delete('/adjustments/:id', ...managerOnly, (req, res) => {
  try {
    deleteAdjustmentService(+req.params.id)
    logAudit(req.user.id, 'water_adjustment_delete', 'water', +req.params.id, null)
    res.json({ ok: true })
  } catch (e) { fail(res, e) }
})

// ── Hızlı giriş şablonları ──
waterRouter.get('/templates', ...mgr, (req, res) => {
  try { res.json(templatesService()) } catch (e) { logger.error('[water]', e); fail(res, e) }
})
waterRouter.post('/templates', ...mgr, (req, res) => {
  try {
    const id = createTemplateService(req.body, req.user.id)
    logAudit(req.user.id, 'water_template_create', 'water', id, req.body.name)
    res.status(201).json({ id })
  } catch (e) { fail(res, e) }
})
waterRouter.delete('/templates/:id', ...mgr, (req, res) => {
  try { deleteTemplateService(+req.params.id); res.json({ ok: true }) } catch (e) { fail(res, e) }
})

// ── Onay akışı (kontrol bekleyen eksi stok dağıtımları) ──
waterRouter.get('/review', ...mgr, (req, res) => {
  try { res.json(reviewQueueService()) } catch (e) { logger.error('[water]', e); fail(res, e) }
})
waterRouter.post('/review/approve', ...managerOnly, (req, res) => {
  try {
    const approved = approveReviewsService(req.body?.ids)
    logAudit(req.user.id, 'water_review_approve', 'water', null, `${approved} kayıt onaylandı`)
    res.json({ approved })
  } catch (e) { fail(res, e) }
})

// ── İrsaliye Bekleyenler ──
waterRouter.get('/pending', ...mgr, (req, res) => {
  try { res.json(pendingDistributionsService({ today: req.query.today })) } catch (e) { logger.error('[water]', e); fail(res, e) }
})

// ── Ay Sonu Kapanış / Uyuşturma ──
waterRouter.get('/reconciliation', ...mgr, (req, res) => {
  try { res.json(reconciliationService({ month: req.query.month })) } catch (e) { logger.error('[water]', e); fail(res, e) }
})

// Ay kapanışı kısa PDF özeti (gelen/dağıtılan/kalan/eksi + en çok dağıtılan yerler)
waterRouter.get('/reconciliation/:month/pdf', ...mgr, (req, res) => {
  try {
    const month = req.params.month
    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'Ay YYYY-MM formatında olmalı' })
    const [y, m] = month.split('-').map(Number)
    const from = `${month}-01`
    const to = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
    const summary = summaryService({ from, to })
    const rec = reconciliationService({ month })
    const t = summary.totals || {}
    const zoneAgg = new Map()
    for (const z of summary.zones || []) zoneAgg.set(z.zone_id, { name: z.zone_name, total: (zoneAgg.get(z.zone_id)?.total || 0) + (z.total_out || 0) })
    const topZones = [...zoneAgg.values()].sort((a, b) => b.total - a.total).slice(0, 8)
    const negatives = (summary.stock || []).filter(s => s.negative)

    const doc = new PDFDocument({ size: 'A4', margin: 40 })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="su-ay-kapanis-${month}.pdf"`)
    doc.pipe(res)
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#0f172a').text(`SU TAKIP AY KAPANISI - ${month}`, { align: 'center' })
    doc.moveDown(0.3)
    doc.fontSize(9).font('Helvetica').fillColor('#6b7280')
      .text(`Olusturma: ${new Date().toLocaleString('tr-TR')}${rec.locked ? '  -  AY KILITLI' : ''}`, { align: 'center' })
    doc.moveDown(1)
    const line = (label, val) => { doc.fontSize(11).font('Helvetica-Bold').fillColor('#374151').text(label, { continued: true }).font('Helvetica').fillColor('#0f172a').text(`  ${val}`) }
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#0f172a').text('OZET'); doc.moveDown(0.3)
    line('Ay gelen (tir):', String(t.period_in || 0))
    line('Ay dagitilan:', String(t.period_out || 0))
    line('Kalan stok (anlik):', String(t.balance || 0))
    line('Eksi stoktaki urun sayisi:', String(t.deficit_count || 0))
    line('Sayim farkli urun sayisi:', String(rec.totals?.mismatch || 0))
    doc.moveDown(0.8)
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#0f172a').text('EN COK DAGITILAN YERLER'); doc.moveDown(0.3)
    if (topZones.length === 0) doc.fontSize(10).font('Helvetica').fillColor('#9ca3af').text('Kayit yok.')
    else topZones.forEach((z, i) => doc.fontSize(10).font('Helvetica').fillColor('#374151').text(`${i + 1}. ${z.name}  -  ${z.total}`))
    if (negatives.length) {
      doc.moveDown(0.8)
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#dc2626').text('EKSI STOKLAR'); doc.moveDown(0.3)
      negatives.forEach(s => doc.fontSize(10).font('Helvetica').fillColor('#374151').text(`- ${s.name}: ${s.balance}`))
    }
    doc.end()
    logAudit(req.user.id, 'water_close_pdf', 'water', null, month)
  } catch (e) { logger.error('[water]', e); if (!res.headersSent) fail(res, e) }
})
waterRouter.post('/stock-count', ...mgr, (req, res) => {
  try {
    const r = saveStockCountService(req.body, req.user.id)
    logAudit(req.user.id, 'water_stock_count', 'water', req.body.product_id, `${req.body.month} fark:${r.diff_base}`)
    res.json(r)
  } catch (e) { fail(res, e) }
})
// Ay kapanışı/kilit — sadece kampüs müdürü
waterRouter.post('/monthly-close', ...managerOnly, (req, res) => {
  try {
    const c = monthlyCloseService(req.body, req.user.id)
    logAudit(req.user.id, 'water_month_close', 'water', null, req.body.month)
    res.status(201).json(c)
  } catch (e) { fail(res, e) }
})
waterRouter.post('/monthly-close/:month/unlock', ...managerOnly, (req, res) => {
  try {
    monthlyUnlockService(req.params.month)
    logAudit(req.user.id, 'water_month_unlock', 'water', null, req.params.month)
    res.json({ ok: true })
  } catch (e) { fail(res, e) }
})

// ── Özet / dashboard ──
waterRouter.get('/summary', ...mgr, (req, res) => {
  try {
    const { from, to, product_id, group } = req.query
    res.json(summaryService({ from, to, group: group === 'month' ? 'month' : 'day', product_id: product_id ? +product_id : undefined }))
  } catch (e) { logger.error('[water]', e); fail(res, e) }
})
