import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { getSystemInfoService } from './service.js'
import { logger } from '../../shared/logger.js'
import { register } from '../../shared/metrics.js'

export const systemRouter = Router()
const adminOnly = requireRole('campus_manager')

systemRouter.get('/info', ...adminOnly, (req, res) => {
  try { res.json(getSystemInfoService()) }
  catch (e) { logger.error('[System]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// /api/system/metrics — Prometheus scrape endpoint.
// Bearer token (METRICS_TOKEN) ile korunur. auth middleware'ini ATLAR
// (admin login gerektirmez, scrape'i otomatize etmek icin). nginx tarafinda
// public acilmamalidir; token ek savunma katmani.
systemRouter.get('/metrics', async (req, res) => {
  const token = process.env.METRICS_TOKEN
  if (!token) return res.status(503).json({ error: 'metrics disabled' })
  const auth = req.headers.authorization
  if (!auth || auth !== `Bearer ${token}`) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  try {
    res.set('Content-Type', register.contentType)
    res.end(await register.metrics())
  } catch (e) {
    logger.error('[Metrics]', e)
    res.status(500).end('metrics error')
  }
})
