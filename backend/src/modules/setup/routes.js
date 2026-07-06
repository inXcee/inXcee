import { Router } from 'express'
import { getSetupStatusService, initSetupService } from './service.js'
import { logger } from '../../shared/logger.js'

export const setupRouter = Router()

setupRouter.get('/status', (req, res) => {
  try { res.json(getSetupStatusService()) }
  catch (e) { logger.error('[Setup]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

setupRouter.post('/init', (req, res) => {
  try {
    const result = initSetupService(req.body || {})
    if (result.error) return res.status(result.status).json({ error: result.error })
    res.status(201).json(result)
  } catch (e) {
    logger.error('[Setup]', e)
    res.status(500).json({ error: 'Sunucu hatası' })
  }
})
