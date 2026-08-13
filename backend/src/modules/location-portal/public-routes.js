import { createHash } from 'node:crypto'
import { Router } from 'express'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import {
  authenticatePortalResident,
  getPublicPortal,
  getPublicPortalReceipt,
} from './public-service.js'
import { validate } from '../../shared/middleware/validate.js'
import { logger } from '../../shared/logger.js'
import { portalFaultSchema, portalSurveySchema } from './public-action-schemas.js'
import { submitPortalFault, submitPortalSurvey } from './public-actions.js'
import {
  cleanupPortalImages,
  encodePortalFaultPhotos,
  receivePortalFaultPhotos,
  verifyPortalFaultPhotos,
} from './public-upload.js'

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
const actionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: limiterKey,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Çok fazla işlem denemesi. Lütfen biraz bekleyin.', code: 'action_rate_limited' },
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

roomPortalRouter.post(
  '/:token/faults',
  portalLimiter,
  actionLimiter,
  receivePortalFaultPhotos,
  verifyPortalFaultPhotos,
  validate(portalFaultSchema),
  encodePortalFaultPhotos,
  (req, res) => {
    const imageUrls = req.portalImageUrls || []
    try {
      const result = submitPortalFault({
        token: req.params.token,
        sessionToken: req.get('X-Room-Portal-Session'),
        body: req.validated,
        imageUrls,
        ip: req.ip,
      })
      if (!result.keepImages) cleanupPortalImages(imageUrls)
      const { keepImages: _keepImages, ...publicResult } = result
      res.setHeader('Cache-Control', 'no-store')
      res.status(result.replayed || result.merged ? 200 : 201).json(publicResult)
    } catch (error) {
      cleanupPortalImages(imageUrls)
      if (!error.statusCode) logger.error({ err: error }, '[RoomPortal] Arıza bildirimi kaydedilemedi')
      res.status(error.statusCode || 500).json({
        error: error.statusCode ? error.message : 'Arıza bildirimi kaydedilemedi',
        code: error.statusCode ? error.code : 'fault_submit_failed',
      })
    }
  },
)

roomPortalRouter.post('/:token/surveys', portalLimiter, actionLimiter, validate(portalSurveySchema), (req, res) => {
  try {
    const result = submitPortalSurvey({
      token: req.params.token,
      sessionToken: req.get('X-Room-Portal-Session'),
      body: req.validated,
      ip: req.ip,
    })
    res.setHeader('Cache-Control', 'no-store')
    res.status(result.replayed ? 200 : 201).json(result)
  } catch (error) {
    if (!error.statusCode) logger.error({ err: error }, '[RoomPortal] Anket kaydedilemedi')
    res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : 'Anket kaydedilemedi',
      code: error.statusCode ? error.code : 'survey_submit_failed',
    })
  }
})
