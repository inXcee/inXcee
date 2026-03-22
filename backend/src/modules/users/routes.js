import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import * as service from './service.js'

export const usersRouter = Router()
const adminOnly = requireRole('campus_manager')

usersRouter.get('/', ...adminOnly, (req, res) => {
  res.json(service.listUsers())
})

usersRouter.get('/:id', ...adminOnly, (req, res) => {
  const user = service.getUser(+req.params.id)
  if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' })
  res.json(user)
})

usersRouter.post('/', ...adminOnly, (req, res) => {
  const result = service.addUser(req.body, req.user.id)
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.status(201).json(result)
})

usersRouter.put('/:id', ...adminOnly, (req, res) => {
  const result = service.editUser(+req.params.id, req.body, req.user.id)
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.json(result)
})

usersRouter.patch('/:id/password', ...adminOnly, (req, res) => {
  const result = service.changePassword(+req.params.id, req.body.password, req.user.id)
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.json(result)
})

usersRouter.delete('/:id', ...adminOnly, (req, res) => {
  const result = service.removeUser(+req.params.id, req.user.id)
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.json(result)
})
