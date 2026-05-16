import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import * as q from './queries.js'
import { logAudit } from '../../shared/audit.js'

export const transportRouter = Router()
const mgr = requireRole('campus_manager', 'shift_supervisor')
const view = requireRole('campus_manager', 'shift_supervisor', 'laundry', 'housekeeper', 'technical')

// ── Pickup Points ──
transportRouter.get('/pickup-points', ...view, (req, res) => {
  try { res.json(q.listPickupPoints({ activeOnly: req.query.active === '1' })) }
  catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

transportRouter.post('/pickup-points', ...mgr, (req, res) => {
  try {
    if (!req.body?.name) return res.status(400).json({ error: 'Ad gerekli' })
    const id = q.createPickupPoint(req.body)
    logAudit(req.user.id, 'pickup_point_create', 'transport', id, req.body.name)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

transportRouter.put('/pickup-points/:id', ...mgr, (req, res) => {
  try { q.updatePickupPoint(+req.params.id, req.body); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

transportRouter.delete('/pickup-points/:id', ...mgr, (req, res) => {
  try { q.deletePickupPoint(+req.params.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

transportRouter.get('/pickup-points/:id/staff', ...view, (req, res) => {
  try { res.json(q.getStaffAtPoint(+req.params.id)) }
  catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── Routes ──
transportRouter.get('/routes', ...view, (req, res) => {
  try { res.json(q.listRoutes({ activeOnly: req.query.active === '1' })) }
  catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

transportRouter.get('/routes/:id', ...view, (req, res) => {
  try {
    const r = q.getRoute(+req.params.id)
    if (!r) return res.status(404).json({ error: 'Rota bulunamadı' })
    res.json(r)
  } catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

transportRouter.post('/routes', ...mgr, (req, res) => {
  try {
    if (!req.body?.name) return res.status(400).json({ error: 'Ad gerekli' })
    const id = q.createRoute(req.body)
    logAudit(req.user.id, 'route_create', 'transport', id, req.body.name)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

transportRouter.put('/routes/:id', ...mgr, (req, res) => {
  try { q.updateRoute(+req.params.id, req.body); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

transportRouter.delete('/routes/:id', ...mgr, (req, res) => {
  try { q.deleteRoute(+req.params.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Route Stops ──
transportRouter.get('/routes/:id/stops', ...view, (req, res) => {
  try { res.json(q.listRouteStops(+req.params.id)) }
  catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

transportRouter.post('/routes/:id/stops', ...mgr, (req, res) => {
  try {
    if (!req.body?.pickup_point_id) return res.status(400).json({ error: 'pickup_point_id gerekli' })
    const id = q.addRouteStop(+req.params.id, req.body)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

transportRouter.put('/stops/:id', ...mgr, (req, res) => {
  try { q.updateRouteStop(+req.params.id, req.body); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

transportRouter.delete('/stops/:id', ...mgr, (req, res) => {
  try { q.deleteRouteStop(+req.params.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

transportRouter.post('/routes/:id/reorder-stops', ...mgr, (req, res) => {
  try {
    const ids = req.body?.stop_ids
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'stop_ids dizisi gerekli' })
    q.reorderRouteStops(+req.params.id, ids)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Staff pickup ──
transportRouter.get('/staff', ...view, (req, res) => {
  try {
    res.json(q.listStaffWithTransport({
      deptId: req.query.dept_id ? +req.query.dept_id : null,
      hasPickup: req.query.has_pickup || null,
    }))
  } catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

transportRouter.put('/staff/:id/pickup', ...mgr, (req, res) => {
  try {
    q.setStaffPickup(+req.params.id, req.body?.pickup_point_id ?? null)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Daily ops ──
transportRouter.get('/daily', ...view, (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10)
    res.json(q.getDailyOverview(date))
  } catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

transportRouter.get('/routes/:id/manifest', ...view, (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10)
    const m = q.getRouteManifest(+req.params.id, date)
    if (!m) return res.status(404).json({ error: 'Rota bulunamadı' })
    res.json(m)
  } catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

transportRouter.post('/auto-assign', ...mgr, (req, res) => {
  try {
    const date = req.body?.date || new Date().toISOString().slice(0, 10)
    const override = !!req.body?.override
    const stats = q.autoAssign(date, { overrideExisting: override })
    logAudit(req.user.id, 'transport_auto_assign', 'transport', null, `${date}: ${stats.assigned} atandı`)
    res.json(stats)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

transportRouter.post('/assign', ...mgr, (req, res) => {
  try {
    const { staff_id, route_id, stop_id, work_date } = req.body
    if (!staff_id || !route_id || !work_date) return res.status(400).json({ error: 'staff_id, route_id, work_date gerekli' })
    q.setAssignment({ staffId: +staff_id, routeId: +route_id, stopId: stop_id ? +stop_id : null, workDate: work_date, userId: req.user.id })
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

transportRouter.delete('/assign/:staff_id', ...mgr, (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10)
    q.clearAssignment(+req.params.staff_id, date)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})
