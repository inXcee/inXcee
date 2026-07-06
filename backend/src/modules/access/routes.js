import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { getDB } from '../../shared/db/index.js'
import { logger } from '../../shared/logger.js'
import { getPresence, getOverdueInside, getPassbackAnomalies } from './service.js'

export const accessRouter = Router()
const view = requireRole('campus_manager', 'shift_supervisor')

// ── Kampüste kim var (son giriş/çıkıştan türetilir) ──
accessRouter.get('/presence', ...view, (req, res) => {
  try {
    const on_campus = getPresence(getDB())
    res.json({ count: on_campus.length, on_campus })
  } catch (e) { logger.error('[access/presence]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── Anomaliler: çıkışsız uzun süre içeride kalanlar ──
accessRouter.get('/anomalies', ...view, (req, res) => {
  try {
    const db = getDB()
    const hours = Math.min(Math.max(+req.query.hours || 16, 1), 168)
    res.json({
      overdue_hours: hours,
      no_exit: getOverdueInside(db, hours),
      passback: getPassbackAnomalies(db),
    })
  } catch (e) { logger.error('[access/anomalies]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})
