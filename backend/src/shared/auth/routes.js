import { Router } from 'express'
import { login, loginKiosk, loginKioskById, searchKioskPersonnel, loginAvsKiosk, searchAvsWorkers, changeOwnPassword, refreshToken } from './service.js'
import { getSetting } from '../../modules/email/queries.js'
import { requireAuth } from './middleware.js'

export const authRouter = Router()

authRouter.post('/login', (req, res) => {
  const { username, password } = req.body
  const result = login(username, password)
  if (!result) return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı' })
  res.json(result)
})

authRouter.post('/kiosk-login', (req, res) => {
  const { tc_no, pin, personnel_id } = req.body
  if (personnel_id) {
    if (!pin) return res.status(400).json({ error: 'PIN gerekli' })
    const result = loginKioskById(Number(personnel_id), pin)
    if (result.error) return res.status(result.status).json({ error: result.error })
    return res.json(result)
  }
  if (!tc_no || !pin) return res.status(400).json({ error: 'TC No ve PIN gerekli' })
  const result = loginKiosk(tc_no, pin)
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.json(result)
})

authRouter.get('/kiosk-search', (req, res) => {
  const q = (req.query.q || '').trim()
  if (q.length < 2) return res.json([])
  res.json(searchKioskPersonnel(q))
})

authRouter.get('/kiosk-config', (req, res) => {
  res.json({ login_method: getSetting('kiosk_login_method') ?? 'both' })
})

authRouter.get('/avs-search', (req, res) => {
  const q = (req.query.q || '').trim()
  if (q.length < 2) return res.json([])
  res.json(searchAvsWorkers(q))
})

authRouter.post('/avs-login', (req, res) => {
  const { worker_id, pin } = req.body
  if (!worker_id || !pin) return res.status(400).json({ error: 'worker_id ve pin gerekli' })
  const result = loginAvsKiosk(Number(worker_id), pin)
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
