import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { listWorkers, getWorker, createWorker, updateWorker, setWorkerPin, toggleWorker, deleteWorker } from './queries.js'

export const avsWorkersRouter = Router()
const adminOnly = requireRole('campus_manager')

avsWorkersRouter.get('/', ...adminOnly, (req, res) => {
  try { res.json(listWorkers()) }
  catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

avsWorkersRouter.post('/', ...adminOnly, (req, res) => {
  const { full_name, role_label, pickup_point_id, phone } = req.body
  if (!full_name || full_name.trim().length < 2) return res.status(400).json({ error: 'Ad en az 2 karakter olmalı' })
  try {
    const id = createWorker({
      full_name: full_name.trim(),
      role_label: role_label?.trim() || null,
      pickup_point_id: pickup_point_id ? +pickup_point_id : null,
      phone: phone?.trim() || null,
    })
    res.status(201).json(getWorker(id))
  } catch (e) { res.status(400).json({ error: e.message }) }
})

avsWorkersRouter.put('/:id', ...adminOnly, (req, res) => {
  const { full_name, role_label, pickup_point_id, phone } = req.body
  if (!full_name || full_name.trim().length < 2) return res.status(400).json({ error: 'Ad en az 2 karakter olmalı' })
  const w = getWorker(Number(req.params.id))
  if (!w) return res.status(404).json({ error: 'Çalışan bulunamadı' })
  updateWorker(Number(req.params.id), {
    full_name: full_name.trim(),
    role_label: role_label?.trim() || null,
    pickup_point_id: pickup_point_id ? +pickup_point_id : null,
    phone: phone?.trim() || null,
  })
  res.json(getWorker(Number(req.params.id)))
})

avsWorkersRouter.put('/:id/pin', ...adminOnly, (req, res) => {
  const { new_pin } = req.body
  if (!new_pin || !/^\d{4}$/.test(new_pin)) return res.status(400).json({ error: 'PIN 4 haneli rakam olmalı' })
  const w = getWorker(Number(req.params.id))
  if (!w) return res.status(404).json({ error: 'Çalışan bulunamadı' })
  setWorkerPin(Number(req.params.id), new_pin)
  res.json({ ok: true })
})

avsWorkersRouter.put('/:id/toggle', ...adminOnly, (req, res) => {
  const w = getWorker(Number(req.params.id))
  if (!w) return res.status(404).json({ error: 'Çalışan bulunamadı' })
  const result = toggleWorker(Number(req.params.id))
  res.json({ is_active: result.is_active })
})

avsWorkersRouter.delete('/:id', ...adminOnly, (req, res) => {
  const deleted = deleteWorker(Number(req.params.id))
  if (!deleted) return res.status(404).json({ error: 'Çalışan bulunamadı' })
  res.json({ ok: true })
})
