import { Router } from 'express'
import { requireAuth } from '../../shared/auth/middleware.js'
import {
  getVapidPublicKey,
  isPushConfigured,
  saveSubscription,
  deleteSubscription,
} from '../../shared/notifications/push.js'

export const pushRouter = Router()

// Frontend subscription olustururken bu key'i kullanir
pushRouter.get('/vapid-public-key', (req, res) => {
  if (!isPushConfigured()) return res.status(503).json({ error: 'Push servisi yapilandirilmamis' })
  res.json({ key: getVapidPublicKey() })
})

// PushSubscription'i kaydet
pushRouter.post('/subscribe', requireAuth, (req, res) => {
  try {
    const { endpoint, keys } = req.body
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Gecersiz subscription' })
    }
    saveSubscription({
      userId: req.user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: req.get('user-agent'),
    })
    res.status(201).json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// Subscription'i sil (logout / izin iptal)
pushRouter.post('/unsubscribe', requireAuth, (req, res) => {
  try {
    const { endpoint } = req.body
    if (!endpoint) return res.status(400).json({ error: 'endpoint gerekli' })
    deleteSubscription(endpoint)
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})
