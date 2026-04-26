import { Router } from 'express'
import { requireAuth } from '../../shared/auth/middleware.js'
import {
  getUserPreferencesService, setUserPreferencesService, NOTIFICATION_MODULES,
} from './service.js'

export const notificationPrefsRouter = Router()

notificationPrefsRouter.get('/modules', requireAuth, (req, res) => {
  res.json(NOTIFICATION_MODULES)
})

notificationPrefsRouter.get('/', requireAuth, (req, res) => {
  try { res.json(getUserPreferencesService(req.user.id)) }
  catch (e) { console.error('[NotifPrefs]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

notificationPrefsRouter.put('/', requireAuth, (req, res) => {
  const result = setUserPreferencesService(req.user.id, req.body?.preferences)
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.json(result)
})
