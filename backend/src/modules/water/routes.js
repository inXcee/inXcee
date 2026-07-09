import { Router } from 'express'
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
} from './service.js'

export const waterRouter = Router()
const mgr = requireRole('campus_manager', 'shift_supervisor')

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
    res.status(201).json({ id })
  } catch (e) { fail(res, e) }
})

// Toplu giriş (tek irsaliye, çok ürün)
waterRouter.post('/intake/batch', ...mgr, (req, res) => {
  try {
    const ids = batchIntakeService(req.body, req.user.id)
    logAudit(req.user.id, 'water_intake_batch', 'water', null, `irsaliye:${req.body.waybill_no || '-'} ${ids.length} satır`)
    res.status(201).json({ ids, count: ids.length })
  } catch (e) { fail(res, e) }
})

// Dağıtım (bölgeye bırakma)
waterRouter.post('/distribute', ...mgr, (req, res) => {
  try {
    const id = createDistributionService(req.body, req.user.id)
    logAudit(req.user.id, 'water_distribute', 'water', id, `zone:${req.body.zone_id} ${req.body.input_qty} ${req.body.input_unit}`)
    res.status(201).json({ id })
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

// ── Özet / dashboard ──
waterRouter.get('/summary', ...mgr, (req, res) => {
  try {
    const { from, to, product_id, group } = req.query
    res.json(summaryService({ from, to, group: group === 'month' ? 'month' : 'day', product_id: product_id ? +product_id : undefined }))
  } catch (e) { logger.error('[water]', e); fail(res, e) }
})
