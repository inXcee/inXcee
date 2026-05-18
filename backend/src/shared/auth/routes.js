import { Router } from 'express'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import { z } from 'zod'
import { login, loginKiosk, loginKioskById, searchKioskPersonnel, loginAvsKiosk, searchAvsWorkers, changeOwnPassword, refreshToken, verify2faChallenge } from './service.js'
import { get2faStatus, start2faSetupWithQr, enable2fa, disable2fa } from './totp.js'
import { getSetting } from '../../modules/email/queries.js'
import { requireAuth } from './middleware.js'
import { validate } from '../middleware/validate.js'

export const authRouter = Router()

// Kiosk / AVS PIN endpoint'lerine özel sıkı rate limit — 4 haneli PIN brute-force riski
// authLimiter 30/15dk şu an, kiosk-PIN için yetersiz (5dkdaki 30 attempt 4-hane uzayını
// günlerle gezer). Buraya 10/15dk per IP daha gerçekçi.
const pinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Çok fazla PIN denemesi. 15 dakika sonra tekrar deneyin.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip)}`,
})

const loginSchema = z.object({
  username: z.string().min(1, 'Kullanıcı adı gerekli').max(64),
  password: z.string().min(1, 'Şifre gerekli').max(256),
})

authRouter.post('/login', validate(loginSchema), (req, res) => {
  const { username, password } = req.validated
  const result = login(username, password)
  if (!result) return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı' })
  res.json(result)
})

authRouter.post('/kiosk-login', pinLimiter, (req, res) => {
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

// Kiosk arama — kiosk cihaza fiziksel erişim varsayımı ama anonim listeleme
// pratik bir saldırı vektörü. pinLimiter ile birlikte 2+ karakter zorunlu.
authRouter.get('/kiosk-search', pinLimiter, (req, res) => {
  const q = (req.query.q || '').trim()
  if (q.length < 2) return res.json([])
  res.json(searchKioskPersonnel(q))
})

authRouter.get('/kiosk-config', (req, res) => {
  res.json({ login_method: getSetting('kiosk_login_method') ?? 'both' })
})

authRouter.get('/avs-search', pinLimiter, (req, res) => {
  const q = (req.query.q || '').trim()
  if (q.length < 2) return res.json([])
  res.json(searchAvsWorkers(q))
})

authRouter.post('/avs-login', pinLimiter, (req, res) => {
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

// ── 2FA ──
authRouter.post('/2fa/verify-login', (req, res) => {
  const { challenge_token, code } = req.body
  if (!challenge_token || !code) return res.status(400).json({ error: 'challenge_token ve code gerekli' })
  const result = verify2faChallenge(challenge_token, code)
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.json(result)
})

authRouter.get('/2fa/status', requireAuth, (req, res) => {
  res.json(get2faStatus(req.user.id))
})

authRouter.post('/2fa/setup', requireAuth, async (req, res) => {
  try {
    const result = await start2faSetupWithQr(req.user.id)
    if (result.error) return res.status(result.status).json({ error: result.error })
    res.json({ secret: result.secret, qr: result.qr, uri: result.uri })
  } catch (e) {
    console.error('[2FA setup]', e)
    res.status(500).json({ error: 'Sunucu hatası' })
  }
})

authRouter.post('/2fa/enable', requireAuth, (req, res) => {
  const { code } = req.body
  if (!code) return res.status(400).json({ error: 'Kod gerekli' })
  const result = enable2fa(req.user.id, code)
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.json(result)
})

authRouter.post('/2fa/disable', requireAuth, (req, res) => {
  const { code } = req.body
  if (!code) return res.status(400).json({ error: 'Kod gerekli' })
  const result = disable2fa(req.user.id, code)
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
