import { Router } from 'express'
import { login, loginKiosk } from './service.js'

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
