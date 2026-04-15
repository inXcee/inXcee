import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { getAll, create, remove } from './queries.js'

export const announcementsRouter = Router()
const adminOnly = requireRole('campus_manager')

announcementsRouter.get('/', ...adminOnly, (req, res) => {
  try { res.json(getAll()) }
  catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

announcementsRouter.post('/', ...adminOnly, (req, res) => {
  const { title, body, expires_at } = req.body
  if (!title || title.trim().length < 2) return res.status(400).json({ error: 'Başlık gerekli' })
  if (!body || body.trim().length < 5) return res.status(400).json({ error: 'İçerik gerekli' })
  try {
    const id = create({ title: title.trim(), body: body.trim(), expiresAt: expires_at || null, createdBy: req.user.userId })
    res.status(201).json({ id })
  } catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

announcementsRouter.delete('/:id', ...adminOnly, (req, res) => {
  try {
    remove(parseInt(req.params.id, 10))
    res.json({ ok: true })
  } catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})
