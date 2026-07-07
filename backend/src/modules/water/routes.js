import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { logAudit } from '../../shared/audit.js'
import { logger } from '../../shared/logger.js'
import {
  productsService, createProductService, updateProductService, deleteProductService,
  zonesService, createZoneService, updateZoneService, deleteZoneService,
  createIntakeService, createDistributionService, deleteMovementService, movementsService,
  summaryService, batchIntakeService, batchDistributeService, parseDistributionText,
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
    const { type, product_id, zone_id, from, to } = req.query
    res.json(movementsService({
      type, from, to,
      product_id: product_id ? +product_id : undefined,
      zone_id: zone_id ? +zone_id : undefined,
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

waterRouter.delete('/movements/:id', ...mgr, (req, res) => {
  try { deleteMovementService(+req.params.id); res.json({ ok: true }) } catch (e) { fail(res, e) }
})

// ── Özet / dashboard ──
waterRouter.get('/summary', ...mgr, (req, res) => {
  try {
    const { from, to, product_id, group } = req.query
    res.json(summaryService({ from, to, group: group === 'month' ? 'month' : 'day', product_id: product_id ? +product_id : undefined }))
  } catch (e) { logger.error('[water]', e); fail(res, e) }
})
