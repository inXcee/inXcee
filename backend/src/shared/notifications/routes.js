import { Router } from 'express'
import { requireAuth, requireSSEAuth } from '../auth/middleware.js'
import { getDB } from '../db/index.js'
import {
  addSSEClient, removeSSEClient,
  getNotifications, getNotificationsLegacy, markRead,
  markAllRead, deleteNotification, clearRead, getNotificationStats,
} from './service.js'
import { requireRole } from '../auth/middleware.js'

export const notificationsRouter = Router()

notificationsRouter.get('/stream', requireSSEAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()
  addSSEClient(res, req.user.id, req.user.role)
  req.on('close', () => removeSSEClient(res))
})

// Eski sözleşme: parametre yoksa düz array (geriye uyumlu)
notificationsRouter.get('/', requireAuth, (req, res) => {
  const { module, severity, from, to, unread_only, q, page, limit } = req.query
  const hasFilter = module || severity || from || to || unread_only || q || page || limit
  if (!hasFilter) {
    return res.json(getNotificationsLegacy(req.user.id, req.user.role))
  }
  res.json(getNotifications(req.user.id, req.user.role, {
    module, severity, from, to,
    unread_only: unread_only === '1' || unread_only === 'true',
    q, page, limit,
  }))
})

notificationsRouter.patch('/:id/read', requireAuth, (req, res) => {
  const notif = getDB().prepare('SELECT target_user_id, target_role FROM notifications WHERE id=?').get(+req.params.id)
  if (!notif) return res.status(404).json({ error: 'Bildirim bulunamadı' })
  if (notif.target_user_id && notif.target_user_id !== req.user.id) {
    return res.status(403).json({ error: 'Yetkisiz' })
  }
  markRead(+req.params.id)
  res.json({ ok: true })
})

// A→Z Faz 7
notificationsRouter.post('/mark-all-read', requireAuth, (req, res) => {
  const changes = markAllRead(req.user.id, req.user.role)
  res.json({ ok: true, updated: changes })
})

notificationsRouter.delete('/:id', requireAuth, (req, res) => {
  const r = deleteNotification(+req.params.id, req.user.id, req.user.role)
  if (r.error) return res.status(r.status).json({ error: r.error })
  res.json(r)
})

notificationsRouter.post('/clear-read', requireAuth, (req, res) => {
  const changes = clearRead(req.user.id, req.user.role)
  res.json({ ok: true, deleted: changes })
})

// A→Z Faz 10 — Stats (sadece campus_manager)
notificationsRouter.get('/stats', ...requireRole('campus_manager'), (req, res) => {
  try {
    res.json(getNotificationStats({ days: req.query.days }))
  } catch (e) { console.error('[Notif stats]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// WhatsApp moved to /api/whatsapp
