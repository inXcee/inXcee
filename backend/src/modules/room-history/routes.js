import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import * as svc from './service.js'
import { logger } from '../../shared/logger.js'

export const roomHistoryRouter = Router()
const access = requireRole('campus_manager', 'shift_supervisor', 'housekeeper', 'technical')

roomHistoryRouter.get('/summary', ...access, (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days) || 7, 1), 90)
    res.json(svc.getRoomSummaryService(days))
  } catch (err) {
    logger.error('Room history summary error:', err.message)
    res.status(500).json({ error: 'Özet verileri alınamadı' })
  }
})

roomHistoryRouter.get('/room/:block/:roomNo', ...access, (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days) || 7, 1), 90)
    const result = svc.getRoomTimelineService(req.params.block, req.params.roomNo, days)
    if (!result.room) return res.status(404).json({ error: 'Oda bulunamadı' })
    res.json(result)
  } catch (err) {
    logger.error('Room timeline error:', err.message)
    res.status(500).json({ error: 'Oda geçmişi alınamadı' })
  }
})
