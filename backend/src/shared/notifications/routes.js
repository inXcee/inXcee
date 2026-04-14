import { Router } from 'express'
import { requireAuth } from '../auth/middleware.js'
import { getDB } from '../db/index.js'
import { addSSEClient, removeSSEClient, getNotifications, markRead } from './service.js'

export const notificationsRouter = Router()

notificationsRouter.get('/stream', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()
  addSSEClient(res, req.user.id, req.user.role)
  req.on('close', () => removeSSEClient(res))
})

notificationsRouter.get('/', requireAuth, (req, res) => {
  res.json(getNotifications(req.user.id, req.user.role))
})

notificationsRouter.patch('/:id/read', requireAuth, (req, res) => {
  const notif = getDB().prepare('SELECT target_user_id, target_role FROM notifications WHERE id=?').get(+req.params.id)
  if (!notif) return res.status(404).json({ error: 'Bildirim bulunamadı' })
  // Kişisel bildirimse sadece sahibi okuyabilir
  if (notif.target_user_id && notif.target_user_id !== req.user.id) {
    return res.status(403).json({ error: 'Yetkisiz' })
  }
  markRead(+req.params.id)
  res.json({ ok: true })
})

// WhatsApp moved to /api/whatsapp
