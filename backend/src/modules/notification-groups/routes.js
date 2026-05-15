import { Router } from 'express'
import { requireRole, requireAuth } from '../../shared/auth/middleware.js'
import { getDB } from '../../shared/db/index.js'
import { logAudit } from '../../shared/audit.js'

export const notifGroupsRouter = Router()
const mgmt = requireRole('campus_manager')

const VALID_CHANNELS = ['app', 'email', 'whatsapp', 'push']

function normalizeChannels(input) {
  if (!input) return 'app'
  const arr = (Array.isArray(input) ? input : String(input).split(',')).map(s => s.trim()).filter(Boolean)
  const valid = arr.filter(c => VALID_CHANNELS.includes(c))
  return valid.length ? valid.join(',') : 'app'
}

notifGroupsRouter.get('/', requireAuth, (req, res) => {
  const db = getDB()
  const rows = db.prepare(`
    SELECT g.*, COUNT(m.user_id) AS member_count
    FROM notification_groups g
    LEFT JOIN notification_group_members m ON m.group_id=g.id
    GROUP BY g.id ORDER BY g.name
  `).all()
  res.json(rows.map(r => ({ ...r, channels: r.channels.split(',') })))
})

notifGroupsRouter.get('/:id', requireAuth, (req, res) => {
  const db = getDB()
  const g = db.prepare('SELECT * FROM notification_groups WHERE id=?').get(+req.params.id)
  if (!g) return res.status(404).json({ error: 'Bulunamadi' })
  const members = db.prepare(`
    SELECT u.id, u.username, u.full_name, u.role, u.email, u.phone
    FROM notification_group_members m
    JOIN users u ON u.id=m.user_id
    WHERE m.group_id=?
    ORDER BY u.full_name
  `).all(g.id)
  res.json({ ...g, channels: g.channels.split(','), members })
})

notifGroupsRouter.post('/', ...mgmt, (req, res) => {
  const { name, description } = req.body || {}
  if (!name || name.trim().length < 2) return res.status(400).json({ error: 'Grup adi gerekli' })
  const channels = normalizeChannels(req.body.channels)
  try {
    const db = getDB()
    const r = db.prepare('INSERT INTO notification_groups (name, description, channels) VALUES (?,?,?)')
      .run(name.trim(), description || null, channels)
    logAudit(req.user.id, 'notif_group_create', 'notification_groups', r.lastInsertRowid, name)
    res.status(201).json({ id: r.lastInsertRowid })
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Bu isimde grup zaten var' })
    res.status(500).json({ error: e.message })
  }
})

notifGroupsRouter.put('/:id', ...mgmt, (req, res) => {
  const { name, description } = req.body || {}
  if (!name || name.trim().length < 2) return res.status(400).json({ error: 'Grup adi gerekli' })
  const channels = normalizeChannels(req.body.channels)
  const db = getDB()
  try {
    db.prepare('UPDATE notification_groups SET name=?, description=?, channels=? WHERE id=?')
      .run(name.trim(), description || null, channels, +req.params.id)
    res.json({ ok: true })
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Bu isimde grup zaten var' })
    res.status(500).json({ error: e.message })
  }
})

notifGroupsRouter.delete('/:id', ...mgmt, (req, res) => {
  const db = getDB()
  const r = db.prepare('DELETE FROM notification_groups WHERE id=?').run(+req.params.id)
  if (r.changes === 0) return res.status(404).json({ error: 'Bulunamadi' })
  logAudit(req.user.id, 'notif_group_delete', 'notification_groups', +req.params.id, null)
  res.json({ ok: true })
})

notifGroupsRouter.post('/:id/members', ...mgmt, (req, res) => {
  const { user_id } = req.body || {}
  if (!user_id) return res.status(400).json({ error: 'user_id gerekli' })
  const db = getDB()
  try {
    db.prepare('INSERT OR IGNORE INTO notification_group_members (group_id, user_id) VALUES (?,?)')
      .run(+req.params.id, +user_id)
    res.status(201).json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

notifGroupsRouter.delete('/:id/members/:userId', ...mgmt, (req, res) => {
  const db = getDB()
  db.prepare('DELETE FROM notification_group_members WHERE group_id=? AND user_id=?')
    .run(+req.params.id, +req.params.userId)
  res.json({ ok: true })
})
