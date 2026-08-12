import { Router } from 'express'
import { requireKioskDevice, requireRole } from '../../shared/auth/middleware.js'
import { validate } from '../../shared/middleware/validate.js'
import {
  commandAckSchema,
  commandSchema,
  enrollmentCodeSchema,
  enrollDeviceSchema,
  heartbeatSchema,
  syncStatusSchema,
  bulkPinDeliverySchema,
  pinDeliverySchema,
  pinIssueSchema,
  sessionSettingsSchema,
  updateDeviceSchema,
} from './schemas.js'
import {
  acknowledgeCommand,
  createCommand,
  createEnrollmentCode,
  deviceConfig,
  enrollDevice,
  heartbeat,
  syncStatuses,
  listDevices,
  overview,
  pendingCommands,
  revokeDevice,
  rotateDeviceKey,
  updateDevice,
} from './service.js'
import {
  deliverPin,
  endKioskSession,
  endPrincipalSessions,
  getSessionSettings,
  issuePins,
  listKioskSessions,
  listPinPrincipals,
  markPinDeliveries,
  revokePin,
  updateSessionSettings,
} from './pins.js'

export const kioskManagementRouter = Router()
export const kioskDeviceRouter = Router()

const view = requireRole('campus_manager', 'shift_supervisor')
const manage = requireRole('campus_manager')

kioskManagementRouter.get('/overview', ...view, (_req, res) => {
  res.json(overview())
})

kioskManagementRouter.get('/devices', ...view, (_req, res) => {
  res.json(listDevices())
})

kioskManagementRouter.get('/pins', ...view, (req, res) => {
  res.json(listPinPrincipals(req.query))
})

kioskManagementRouter.post('/pins/issue', ...manage, validate(pinIssueSchema), (req, res) => {
  const result = issuePins(req.user.id, req.validated.principals)
  if (!result.count) return res.status(404).json({ error: 'Aktif personel bulunamadı' })
  res.status(201).json(result)
})

kioskManagementRouter.post('/pins/deliver-bulk', ...manage, validate(bulkPinDeliverySchema), (req, res) => {
  const { issuance_ids, ...input } = req.validated
  res.json(markPinDeliveries(req.user.id, issuance_ids, input))
})

kioskManagementRouter.post('/pins/:id/deliver', ...manage, validate(pinDeliverySchema), (req, res) => {
  const result = deliverPin(Number(req.params.id), req.user.id, req.validated)
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.json(result)
})

kioskManagementRouter.post('/pins/:id/revoke', ...manage, (req, res) => {
  const result = revokePin(Number(req.params.id), req.user.id, req.body?.reason)
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.json(result)
})

kioskManagementRouter.get('/sessions', ...view, (_req, res) => {
  res.json(listKioskSessions())
})

kioskManagementRouter.post('/sessions/:jti/revoke', ...manage, (req, res) => {
  if (!endKioskSession(req.params.jti, req.user.id)) return res.status(404).json({ error: 'Oturum bulunamadı' })
  res.json({ ok: true })
})

kioskManagementRouter.post('/principals/:kind/:id/logout', ...manage, (req, res) => {
  if (!endPrincipalSessions(req.params.kind, Number(req.params.id), req.user.id)) {
    return res.status(404).json({ error: 'Personel bulunamadı' })
  }
  res.json({ ok: true })
})

kioskManagementRouter.get('/session-settings', ...view, (_req, res) => {
  res.json(getSessionSettings())
})

kioskManagementRouter.patch('/session-settings', ...manage, validate(sessionSettingsSchema), (req, res) => {
  res.json(updateSessionSettings(req.user.id, req.validated))
})

kioskManagementRouter.post('/enrollment-codes', ...manage, validate(enrollmentCodeSchema), (req, res) => {
  res.status(201).json(createEnrollmentCode(req.user.id, req.validated))
})

kioskManagementRouter.patch('/devices/:id', ...manage, validate(updateDeviceSchema), (req, res) => {
  const device = updateDevice(req.params.id, req.validated, req.user.id)
  if (!device) return res.status(404).json({ error: 'Cihaz bulunamadı' })
  res.json(device)
})

kioskManagementRouter.post('/devices/:id/revoke', ...manage, (req, res) => {
  const device = revokeDevice(req.params.id, req.user.id)
  if (!device) return res.status(404).json({ error: 'Cihaz bulunamadı' })
  res.json(device)
})

kioskManagementRouter.post('/devices/:id/commands', ...manage, validate(commandSchema), (req, res) => {
  const command = createCommand(req.params.id, req.validated, req.user.id)
  if (!command) return res.status(404).json({ error: 'Aktif cihaz bulunamadı' })
  res.status(201).json(command)
})

kioskDeviceRouter.post('/enroll', validate(enrollDeviceSchema), (req, res) => {
  const result = enrollDevice(req.validated)
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.status(201).json(result)
})

kioskDeviceRouter.use(requireKioskDevice)

kioskDeviceRouter.post('/heartbeat', validate(heartbeatSchema), (req, res) => {
  res.json(heartbeat(req.kioskDevice, req.validated))
})

kioskDeviceRouter.post('/sync', validate(syncStatusSchema), (req, res) => {
  res.json(syncStatuses(req.kioskDevice.id, req.validated.client_action_ids))
})

kioskDeviceRouter.get('/config', (req, res) => {
  res.json(deviceConfig(req.kioskDevice.id))
})

kioskDeviceRouter.get('/commands', (req, res) => {
  res.json(pendingCommands(req.kioskDevice.id))
})

kioskDeviceRouter.post('/commands/:id/ack', validate(commandAckSchema), (req, res) => {
  const command = acknowledgeCommand(req.kioskDevice.id, Number(req.params.id), req.validated)
  if (!command) return res.status(404).json({ error: 'Komut bulunamadı' })
  res.json(command)
})

kioskDeviceRouter.post('/rotate-key', (req, res) => {
  res.json(rotateDeviceKey(req.kioskDevice.id))
})
