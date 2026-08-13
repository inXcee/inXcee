import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { logAudit } from '../../shared/audit.js'
import { logger } from '../../shared/logger.js'
import {
  generateMissingQrCodes,
  getActiveCoverage,
  getPortalSettings,
  listServiceLocations,
  revokeLocationQr,
  rotateLocationQr,
  syncServiceLocations,
  updatePortalSettings,
} from './service.js'

export const locationPortalRouter = Router()
const canRead = requireRole('campus_manager', 'shift_supervisor')
const managerOnly = requireRole('campus_manager')

function sendError(res, error, fallback) {
  res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : fallback })
}

locationPortalRouter.get('/settings', ...canRead, (_req, res) => {
  try { res.json(getPortalSettings()) }
  catch (error) {
    logger.error({ error }, '[location-portal.settings.get]')
    sendError(res, error, 'QR portal ayarları alınamadı')
  }
})

locationPortalRouter.put('/settings', ...managerOnly, (req, res) => {
  try {
    const settings = updatePortalSettings(req.body)
    logAudit(req.user.id, 'location_portal_settings_update', 'location_portal', null, JSON.stringify(req.body))
    res.json(settings)
  } catch (error) { sendError(res, error, 'QR portal ayarları güncellenemedi') }
})

locationPortalRouter.get('/locations', ...canRead, (req, res) => {
  try { res.json(listServiceLocations(req.query)) }
  catch (error) { sendError(res, error, 'QR konumları alınamadı') }
})

locationPortalRouter.get('/coverage', ...canRead, (_req, res) => {
  try {
    res.json(getActiveCoverage())
  } catch (error) { sendError(res, error, 'QR kapsamı alınamadı') }
})

locationPortalRouter.post('/locations/sync', ...managerOnly, (req, res) => {
  try {
    const result = syncServiceLocations()
    logAudit(req.user.id, 'location_portal_locations_sync', 'location_portal', null, JSON.stringify(result))
    res.json(result)
  } catch (error) { sendError(res, error, 'Konumlar eşitlenemedi') }
})

locationPortalRouter.post('/locations/generate-missing', ...managerOnly, (req, res) => {
  try {
    const result = generateMissingQrCodes(req.body || {}, req.user.id)
    logAudit(req.user.id, 'location_portal_qr_generate_missing', 'location_portal', null, JSON.stringify(result))
    res.status(201).json(result)
  } catch (error) { sendError(res, error, 'QR kodları üretilemedi') }
})

locationPortalRouter.post('/locations/:id/rotate', ...managerOnly, (req, res) => {
  try {
    const qr = rotateLocationQr(req.params.id, req.user.id, req.body?.reason)
    logAudit(req.user.id, 'location_portal_qr_rotate', 'location_portal', Number(req.params.id), req.body?.reason || null)
    res.status(201).json(qr)
  } catch (error) { sendError(res, error, 'QR yenilenemedi') }
})

locationPortalRouter.post('/locations/:id/revoke', ...managerOnly, (req, res) => {
  try {
    const result = revokeLocationQr(req.params.id, req.user.id, req.body?.reason)
    logAudit(req.user.id, 'location_portal_qr_revoke', 'location_portal', Number(req.params.id), req.body?.reason || null)
    res.json(result)
  } catch (error) { sendError(res, error, 'QR iptal edilemedi') }
})
