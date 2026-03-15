import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import * as svc from './service.js'

export const disciplineRouter = Router()
const mgmt = requireRole('campus_manager', 'shift_supervisor')

disciplineRouter.post('/records', ...mgmt, (req, res) => {
  try {
    svc.addRecordService({
      personnelId: req.body.personnel_id,
      cardType: req.body.card_type,
      reason: req.body.reason,
      createdBy: req.user.id
    })
    res.status(201).json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

disciplineRouter.get('/records/:personnelId', ...mgmt, (req, res) => {
  res.json(svc.getRecordsService(+req.params.personnelId))
})

disciplineRouter.post('/blacklist', ...requireRole('campus_manager'), (req, res) => {
  svc.addToBlacklistService(req.body.personnel_id, req.body.reason, req.user.id)
  res.json({ ok: true })
})
