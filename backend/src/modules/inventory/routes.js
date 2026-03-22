import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import * as service from './service.js'

export const inventoryRouter = Router()
const mgrAccess = requireRole('campus_manager', 'shift_supervisor', 'laundry', 'housekeeper')
const editAccess = requireRole('campus_manager', 'shift_supervisor')

inventoryRouter.get('/', ...mgrAccess, (req, res) => {
  res.json(service.listItems(req.query.category))
})

inventoryRouter.post('/', ...editAccess, (req, res) => {
  try {
    const { item_name, unit, category } = req.body
    if (!item_name || !unit || !category) return res.status(400).json({ error: 'Ad, birim ve kategori gerekli' })
    const id = service.addItem(req.body, req.user.id)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

inventoryRouter.put('/:id', ...editAccess, (req, res) => {
  try {
    service.editItem(+req.params.id, req.body, req.user.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

inventoryRouter.delete('/:id', ...editAccess, (req, res) => {
  try {
    service.removeItem(+req.params.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

inventoryRouter.patch('/:id/adjust', ...editAccess, (req, res) => {
  try {
    const { delta, reason } = req.body
    if (!delta || delta === 0) return res.status(400).json({ error: 'Miktar değişimi gerekli' })
    const result = service.adjustStock(+req.params.id, delta, reason, req.user.id)
    if (result.error) return res.status(result.status).json({ error: result.error })
    res.json(result)
  } catch (e) { res.status(400).json({ error: e.message }) }
})
