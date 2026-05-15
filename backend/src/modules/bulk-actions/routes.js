import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import * as svc from './service.js'

export const bulkActionsRouter = Router()
const mgmt = requireRole('campus_manager', 'shift_supervisor')

bulkActionsRouter.get('/personnel', ...mgmt, (req, res) => {
  try {
    const data = svc.listActivePersonnelService({
      block: req.query.block || null,
      floor: req.query.floor ?? null,
      company: req.query.company || null,
      q: req.query.q || null,
    })
    res.json(data)
  } catch (e) { console.error('[BulkActions]', e); res.status(500).json({ error: 'Sunucu hatasi' }) }
})

bulkActionsRouter.post('/checkout', ...mgmt, (req, res) => {
  const result = svc.bulkCheckoutService(req.body?.ids, req.user.id)
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.json(result)
})

bulkActionsRouter.post('/transfer', ...mgmt, (req, res) => {
  const result = svc.bulkTransferService(
    req.body?.ids,
    { target_block: req.body?.target_block, target_room_id: req.body?.target_room_id },
    req.user.id
  )
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.json(result)
})
