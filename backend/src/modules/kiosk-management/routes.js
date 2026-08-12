import { Router } from 'express'
import { requireKioskDevice, requireRole } from '../../shared/auth/middleware.js'
import { validate } from '../../shared/middleware/validate.js'
import {
  commandAckSchema,
  commandSchema,
  enrollmentCodeSchema,
  enrollDeviceSchema,
  heartbeatSchema,
  updateDeviceSchema,
} from './schemas.js'
import {
  acknowledgeCommand,
  createCommand,
  createEnrollmentCode,
  deviceConfig,
  enrollDevice,
  heartbeat,
  listDevices,
  overview,
  pendingCommands,
  revokeDevice,
  rotateDeviceKey,
  updateDevice,
} from './service.js'

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
