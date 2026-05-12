import { Router } from 'express'
import { requireAuth } from '../../shared/auth/middleware.js'
import {
  getUserPreferencesService, setUserPreferencesService, NOTIFICATION_MODULES,
  NOTIFICATION_CHANNELS,
  getPreferencesV2Service, setPreferencesV2Service,
  getQuietHoursService, setQuietHoursService,
} from './service.js'
import { createNotification } from '../../shared/notifications/service.js'

export const notificationPrefsRouter = Router()

notificationPrefsRouter.get('/modules', requireAuth, (req, res) => {
  res.json(NOTIFICATION_MODULES)
})

notificationPrefsRouter.get('/channels', requireAuth, (req, res) => {
  res.json(NOTIFICATION_CHANNELS)
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

// A→Z Faz 5: v2 matrix
notificationPrefsRouter.get('/v2', requireAuth, (req, res) => {
  try { res.json(getPreferencesV2Service(req.user.id)) }
  catch (e) { console.error('[NotifPrefs v2]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

notificationPrefsRouter.put('/v2', requireAuth, (req, res) => {
  const result = setPreferencesV2Service(req.user.id, req.body?.preferences)
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.json(result)
})

notificationPrefsRouter.get('/quiet-hours', requireAuth, (req, res) => {
  try { res.json(getQuietHoursService(req.user.id)) }
  catch (e) { console.error('[NotifPrefs quiet]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

notificationPrefsRouter.put('/quiet-hours', requireAuth, (req, res) => {
  try {
    setQuietHoursService(req.user.id, req.body || {})
    res.json({ ok: true })
  } catch (e) { console.error('[NotifPrefs quiet]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Test bildirimi — sadece kendine gönderir
notificationPrefsRouter.post('/test', requireAuth, (req, res) => {
  try {
    createNotification({
      message: '🧪 Bu bir test bildirimidir — tercih ayarlarınızı doğrulamak için',
      severity: 'info',
      module: 'system',
      target_user_id: req.user.id,
    })
    res.json({ ok: true })
  } catch (e) { console.error('[NotifPrefs test]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})
