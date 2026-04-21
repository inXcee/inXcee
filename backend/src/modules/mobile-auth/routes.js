import { Router } from 'express'
import { loginMobile, getMobileMe } from './service.js'
import { requireMobile } from './middleware.js'

export const mobileAuthRouter = Router()

mobileAuthRouter.post('/login', (req, res) => {
  try {
    const { pin, role } = req.body
    const result = loginMobile(pin, role)
    if (result.error) return res.status(result.status).json({ error: result.error })
    res.json(result)
  } catch (e) {
    console.error('[MobileAuth]', e)
    res.status(500).json({ error: 'Sunucu hatası' })
  }
})

mobileAuthRouter.get('/me', requireMobile(), (req, res) => {
  const user = getMobileMe(req.user.id)
  if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' })
  res.json(user)
})
