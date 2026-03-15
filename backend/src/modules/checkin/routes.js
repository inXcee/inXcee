import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { lookupService, registerService, suggestRoomService, assignRoomService, zimmetService, signZimmetService } from './service.js'

export const checkinRouter = Router()
const allowed = requireRole('campus_manager', 'shift_supervisor')

checkinRouter.post('/lookup', ...allowed, (req, res) => {
  const { tc_no, passport_no } = req.body
  const person = lookupService(tc_no, passport_no)
  if (!person) return res.json({ found: false })
  res.json({ found: true, ...person })
})

checkinRouter.post('/register', ...allowed, (req, res) => {
  try {
    const result = registerService(req.body, req.user.id)
    res.status(201).json(result)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

checkinRouter.post('/suggest-room', ...allowed, (req, res) => {
  const { company, hometown } = req.body
  const room = suggestRoomService(company, hometown)
  if (!room) return res.status(404).json({ error: 'Uygun oda bulunamadı' })
  res.json(room)
})

checkinRouter.post('/assign-room', ...allowed, (req, res) => {
  try {
    const { personnel_id, room_id } = req.body
    const bedNo = assignRoomService(personnel_id, room_id, req.user.id)
    res.json({ bed_no: bedNo })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

checkinRouter.post('/zimmet', ...allowed, (req, res) => {
  const { personnel_id, items } = req.body
  zimmetService(personnel_id, items, req.user.id)
  res.status(201).json({ ok: true })
})

checkinRouter.post('/zimmet/sign', ...allowed, (req, res) => {
  const { personnel_id, signature } = req.body
  signZimmetService(personnel_id, signature)
  res.json({ ok: true })
})
