import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { sessionUser } from '../../shared/auth/owner.js'
import { logger } from '../../shared/logger.js'
import {
  reportErrorService, listErrorsService, getErrorService,
  deleteErrorService, clearErrorsService,
} from './service.js'

export const errorLogRouter = Router()
const adminOnly = requireRole('campus_manager')

// Tarayıcıların hata raporu — auth isteğe bağlı (giriş öncesi de hata olur); oturum varsa (çerez ya da Bearer)
// kullanıcı bağlanır. 'backend' kaydını yalnız sunucu yazar (globalErrorHandler, ajan uçları): HTTP'den kabul
// edilince oturumsuz biri sahte "sunucu hatası" yazabiliyor, Hermes bunu Telegram'a taşıyordu.
errorLogRouter.post('/', (req, res) => {
  const user = sessionUser(req)
  const { source = 'frontend', severity, message, stack, url, context } = req.body || {}
  if (source !== 'frontend') return res.status(400).json({ error: 'Geçersiz source' })
  const result = reportErrorService({
    source, severity, message, stack, url,
    user_id: user?.id || user?.userId || null,
    user_agent: req.headers['user-agent'],
    context,
    // Oturumsuz rapor yalnız kaydedilir: anonim istekle müdürlere bildirim yağdırılamasın.
    notify: Boolean(user),
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
    logger.error('[ErrorLog]', e)
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
