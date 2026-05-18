import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import * as svc from './service.js'

export const checkoutRouter = Router()
const mgmt = requireRole('campus_manager', 'shift_supervisor')

checkoutRouter.get('/preview/:personnelId', ...mgmt, (req, res) => {
  const data = svc.getCheckoutPreviewService(+req.params.personnelId)
  if (!data) return res.status(404).json({ error: 'Personel bulunamadi' })
  res.json(data)
})

checkoutRouter.post('/process', ...mgmt, (req, res) => {
  try {
    const { personnel_id, zimmet_actions } = req.body
    if (!personnel_id) return res.status(400).json({ error: 'Personel ID gerekli' })
    svc.processCheckoutService(personnel_id, zimmet_actions || [], req.user.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

checkoutRouter.get('/recent', ...mgmt, (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, +req.query.limit || 20))
    res.json(svc.getRecentCheckoutsService(limit))
  }
  catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})
