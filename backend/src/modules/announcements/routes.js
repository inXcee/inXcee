import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { getAll, create, remove } from './queries.js'
import { createNotification } from '../../shared/notifications/service.js'
import { EVENT_KINDS } from '../../shared/notifications/events.js'
import { logger } from '../../shared/logger.js'
import { validate } from '../../shared/middleware/validate.js'
import { createAnnouncementSchema } from './schemas.js'

export const announcementsRouter = Router()
const adminOnly = requireRole('campus_manager')

announcementsRouter.get('/', ...adminOnly, (req, res) => {
  try { res.json(getAll()) }
  catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

announcementsRouter.post('/', ...adminOnly, validate(createAnnouncementSchema), (req, res) => {
  const { title, body, expires_at } = req.validated
  try {
    const id = create({ title, body, expiresAt: expires_at || null, createdBy: req.user.userId })
    // A→Z: yeni duyuru bildirim akışına (broadcast — target_role/user yok)
    createNotification({
      message: `📢 Yeni duyuru: ${title.trim()}`,
      event_kind: EVENT_KINDS.ANNOUNCEMENT_PUBLISHED,
      entity_type: 'announcement', entity_id: id,
    })
    res.status(201).json({ id })
  } catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

announcementsRouter.delete('/:id', ...adminOnly, (req, res) => {
  try {
    remove(parseInt(req.params.id, 10))
    res.json({ ok: true })
  } catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})
