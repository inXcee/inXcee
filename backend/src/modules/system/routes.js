import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { getSystemInfoService } from './service.js'
import { logger } from '../../shared/logger.js'

export const systemRouter = Router()
const adminOnly = requireRole('campus_manager')

systemRouter.get('/info', ...adminOnly, (req, res) => {
  try { res.json(getSystemInfoService()) }
  catch (e) { logger.error('[System]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})
