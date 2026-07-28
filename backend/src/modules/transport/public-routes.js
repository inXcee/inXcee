import { Router } from 'express'
import { getDriverManifest, driverTransition } from './driver-access.js'
import { logAudit } from '../../shared/audit.js'
import { logger } from '../../shared/logger.js'

export const transportPublicRouter = Router()

function handleError(res, error) {
  const status = error.status || 500
  if (status >= 500) logger.error('[Transport driver link]', error)
  res.status(status).json({ error: status >= 500 ? 'Sunucu hatası' : error.message })
}

transportPublicRouter.get('/:token', (req, res) => {
  try {
    const result = getDriverManifest(req.params.token)
    logAudit(null, 'transport_driver_link_view', 'transport', result.trip.id, `token:${result.token_id}`)
    res.setHeader('Cache-Control', 'no-store')
    res.json(result)
  } catch (error) { handleError(res, error) }
})

transportPublicRouter.post('/:token', (req, res) => {
  try {
    const action = req.body?.action
    if (!['start', 'complete'].includes(action)) {
      return res.status(400).json({ error: 'İşlem start veya complete olmalı' })
    }
    const result = driverTransition(req.params.token, action)
    logAudit(null, `transport_driver_${action}`, 'transport', null, `durum:${result.status}`)
    res.json(result)
  } catch (error) { handleError(res, error) }
})
