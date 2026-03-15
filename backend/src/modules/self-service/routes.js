import { Router } from 'express'
import { requireKioskOrStaff } from '../../shared/auth/middleware.js'
import { getDB } from '../../shared/db/index.js'
import { createRequest } from '../maintenance/queries.js'

export const selfServiceRouter = Router()

selfServiceRouter.get('/my-info', requireKioskOrStaff, (req, res) => {
  if (!req.user.personnelId) return res.status(403).json({ error: 'Kiosk token gerekli' })
  const db = getDB()
  const p = db.prepare('SELECT id, full_name, company, hometown, check_in_date, discipline_points FROM personnel WHERE id=?').get(req.user.personnelId)
  const assignment = db.prepare(`
    SELECT r.block, r.floor, r.room_no, ra.bed_no
    FROM room_assignments ra JOIN rooms r ON r.id=ra.room_id
    WHERE ra.personnel_id=? AND ra.check_out_at IS NULL
  `).get(req.user.personnelId)
  res.json({ ...p, room: assignment || null })
})

selfServiceRouter.get('/laundry-status', requireKioskOrStaff, (req, res) => {
  if (!req.user.personnelId) return res.status(403).json({ error: 'Kiosk token gerekli' })
  const db = getDB()
  const assignment = db.prepare(`
    SELECT room_id FROM room_assignments WHERE personnel_id=? AND check_out_at IS NULL
  `).get(req.user.personnelId)
  if (!assignment) return res.json([])
  const bags = db.prepare('SELECT * FROM laundry_bags WHERE room_id=? ORDER BY collected_at DESC LIMIT 10').all(assignment.room_id)
  res.json(bags)
})

selfServiceRouter.post('/maintenance', requireKioskOrStaff, (req, res) => {
  if (!req.user.personnelId) return res.status(403).json({ error: 'Kiosk token gerekli' })
  try {
    const id = createRequest({
      location: req.body.location,
      description: req.body.description,
      reporterPersonnelId: req.user.personnelId
    })
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})
