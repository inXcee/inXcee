import { Router } from 'express'
import { login, loginKiosk, changeOwnPassword } from './service.js'
import { requireAuth } from './middleware.js'

export const authRouter = Router()

authRouter.post('/login', (req, res) => {
  const { username, password } = req.body
  const result = login(username, password)
  if (!result) return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı' })
  res.json(result)
})

authRouter.post('/kiosk-login', (req, res) => {
  const { tc_no } = req.body
  const result = loginKiosk(tc_no)
  if (!result) return res.status(401).json({ error: 'TC No bulunamadı veya çıkış yapılmış' })
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
