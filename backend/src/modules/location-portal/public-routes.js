import { createHash } from 'node:crypto'
import { Router } from 'express'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import {
  authenticatePortalResident,
  getPublicPortal,
  getPublicPortalReceipt,
} from './public-service.js'

export const roomPortalRouter = Router()

function limiterKey(req) {
  const token = String(req.params.token || req.params.receipt || '')
  const tokenPart = createHash('sha256').update(token).digest('hex').slice(0, 16)
  return `${ipKeyGenerator(req.ip)}:${tokenPart}`
}

const portalLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: limiterKey,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Çok fazla QR portal isteği. Lütfen biraz bekleyin.', code: 'rate_limited' },
})
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: limiterKey,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Çok fazla PIN denemesi. Lütfen biraz bekleyin.', code: 'auth_rate_limited' },
})

roomPortalRouter.get('/receipts/:receipt', portalLimiter, (req, res) => {
  const receipt = getPublicPortalReceipt(req.params.receipt)
  if (!receipt) return res.status(404).json({ error: 'Takip kaydı bulunamadı', code: 'receipt_not_found' })
  res.setHeader('Cache-Control', 'no-store')
  res.json(receipt)
})

roomPortalRouter.get('/:token', portalLimiter, (req, res) => {
  const result = getPublicPortal(req.params.token, req.ip)
  if (result.error) return res.status(result.status).json({ error: result.error, code: result.code })
  res.setHeader('Cache-Control', 'no-store')
  res.json(result)
})

roomPortalRouter.post('/:token/auth', portalLimiter, authLimiter, (req, res) => {
  try {
    const result = authenticatePortalResident({
      token: req.params.token,
      identifier: req.body?.identifier,
      pin: req.body?.pin,
      ip: req.ip,
    })
    res.setHeader('Cache-Control', 'no-store')
    res.json(result)
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : 'Kimlik doğrulanamadı',
      code: error.code || 'auth_failed',
    })
  }
})
