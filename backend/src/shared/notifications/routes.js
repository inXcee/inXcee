import { Router } from 'express'
import { requireAuth } from '../auth/middleware.js'
import { addSSEClient, removeSSEClient, getNotifications, markRead } from './service.js'

export const notificationsRouter = Router()

notificationsRouter.get('/stream', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()
  addSSEClient(res)
  req.on('close', () => removeSSEClient(res))
})

notificationsRouter.get('/', requireAuth, (req, res) => {
  res.json(getNotifications(req.user.id, req.user.role))
})

notificationsRouter.patch('/:id/read', requireAuth, (req, res) => {
  markRead(+req.params.id)
  res.json({ ok: true })
})

// WhatsApp moved to /api/whatsapp
