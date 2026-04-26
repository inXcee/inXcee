import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import jwt from 'jsonwebtoken'
import {
  reportErrorService, listErrorsService, getErrorService,
  deleteErrorService, clearErrorsService,
} from './service.js'

export const errorLogRouter = Router()
const adminOnly = requireRole('campus_manager')

// Frontend hata raporlama — auth opsiyonel (login öncesi de hata olabilir),
// ama varsa user_id'yi token'dan çekeriz
errorLogRouter.post('/', (req, res) => {
  let userId = null
  const h = req.headers.authorization
  if (h?.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(h.slice(7), process.env.JWT_SECRET)
      userId = decoded?.id || decoded?.userId || null
    } catch { /* ignore — anonymous error */ }
  }

  const { source = 'frontend', severity, message, stack, url, context } = req.body || {}
  const result = reportErrorService({
    source, severity, message, stack, url,
    user_id: userId,
    user_agent: req.headers['user-agent'],
    context,
  })
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.status(201).json(result)
})

errorLogRouter.get('/', ...adminOnly, (req, res) => {
  try {
    const { source, severity, limit, offset } = req.query
    res.json(listErrorsService({
      source, severity,
      limit: limit ? Math.min(parseInt(limit, 10) || 100, 500) : 100,
      offset: offset ? parseInt(offset, 10) || 0 : 0,
    }))
  } catch (e) {
    console.error('[ErrorLog]', e)
    res.status(500).json({ error: 'Sunucu hatası' })
  }
})

errorLogRouter.get('/:id', ...adminOnly, (req, res) => {
  const result = getErrorService(parseInt(req.params.id, 10))
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.json(result)
})

errorLogRouter.delete('/all', ...adminOnly, (req, res) => {
  res.json(clearErrorsService())
})

errorLogRouter.delete('/:id', ...adminOnly, (req, res) => {
  res.json(deleteErrorService(parseInt(req.params.id, 10)))
})
