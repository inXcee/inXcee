import { Router } from 'express'
import { login, loginKiosk, changeOwnPassword, refreshToken } from './service.js'
import { requireAuth } from './middleware.js'

export const authRouter = Router()

authRouter.post('/login', (req, res) => {
  const { username, password } = req.body
  const result = login(username, password)
  if (!result) return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı' })
  res.json(result)
})

authRouter.post('/kiosk-login', (req, res) => {
  const { tc_no, pin } = req.body
  if (!tc_no || !pin) return res.status(400).json({ error: 'TC No ve PIN gerekli' })
  const result = loginKiosk(tc_no, pin)
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.json(result)
})

authRouter.post('/refresh', (req, res) => {
  const h = req.headers.authorization
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token gerekli' })
  const result = refreshToken(h.slice(7))
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.json(result)
})

authRouter.patch('/password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Mevcut ve yeni şifre gerekli' })
  }
  const result = changeOwnPassword(req.user.id, currentPassword, newPassword)
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.json(result)
})
