import { createHash } from 'node:crypto'
import { getDB } from '../db/index.js'

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function hashSecret(value) {
  return createHash('sha256').update(value).digest('hex')
}

function parseResult(value) {
  try { return JSON.parse(value || '{}') }
  catch { return {} }
}

export function kioskIdempotencyMiddleware(req, res, next) {
  if (!WRITE_METHODS.has(req.method)) return next()
  const clientActionId = req.headers['x-idempotency-key']
  const deviceKey = req.headers['x-kiosk-device-key']
  if (!clientActionId || !deviceKey) return next()
  if (typeof clientActionId !== 'string' || clientActionId.length < 8 || clientActionId.length > 160) {
    return res.status(400).json({ error: 'Geçersiz idempotency anahtarı' })
  }

  const db = getDB()
  const device = db.prepare(`
    SELECT id FROM kiosk_devices
    WHERE token_hash=? AND is_active=1 AND status<>'revoked'
  `).get(hashSecret(String(deviceKey)))
  if (!device) return res.status(401).json({ error: 'Geçersiz kiosk cihaz anahtarı' })

  const existing = db.prepare('SELECT * FROM kiosk_sync_receipts WHERE client_action_id=?').get(clientActionId)
  if (existing) {
    if (existing.device_id !== device.id) return res.status(409).json({ error: 'İşlem anahtarı başka bir cihaza ait' })
    if (existing.status === 'accepted') {
      const acceptedAt = new Date(`${existing.created_at.replace(' ', 'T')}Z`).getTime()
      if (Date.now() - acceptedAt < 2 * 60 * 1000) {
        return res.status(409).json({ error: 'İşlem halen gönderiliyor', idempotent: true, sync_status: 'accepted' })
      }
      db.prepare('DELETE FROM kiosk_sync_receipts WHERE id=?').run(existing.id)
    } else {
      const saved = parseResult(existing.result)
      res.setHeader('X-Idempotent-Replay', '1')
      return res.status(saved.http_status || (existing.status === 'conflict' ? 409 : existing.status === 'rejected' ? 422 : 200))
        .json({ ...(saved.body || {}), idempotent: true, sync_status: existing.status })
    }
  }

  db.prepare(`
    INSERT INTO kiosk_sync_receipts(
      client_action_id, device_id, principal_kind, principal_id, action_type, status
    ) VALUES(?,?,?,?,?,'accepted')
  `).run(
    clientActionId,
    device.id,
    null,
    null,
    String(req.headers['x-offline-action-type'] || `${req.method} ${req.path}`).slice(0, 160),
  )

  const originalJson = res.json.bind(res)
  res.json = body => {
    const httpStatus = res.statusCode || 200
    if (httpStatus >= 500) {
      db.prepare("DELETE FROM kiosk_sync_receipts WHERE client_action_id=? AND status='accepted'").run(clientActionId)
      return originalJson(body)
    }
    const status = httpStatus === 409 ? 'conflict' : httpStatus >= 400 ? 'rejected' : 'completed'
    db.prepare(`
      UPDATE kiosk_sync_receipts SET
        principal_kind=?, principal_id=?, status=?, result=?, completed_at=CURRENT_TIMESTAMP
      WHERE client_action_id=?
    `).run(
      req.user?.workerId ? 'staff' : req.user?.personnelId ? 'personnel' : req.user?.id ? 'user' : null,
      req.user?.workerId || req.user?.personnelId || req.user?.id || null,
      status,
      JSON.stringify({ http_status: httpStatus, body }),
      clientActionId,
    )
    if (status === 'completed') {
      db.prepare('UPDATE kiosk_devices SET last_sync_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(device.id)
    }
    return originalJson(body && typeof body === 'object' ? { ...body, idempotent: false, sync_status: status } : body)
  }
  next()
}
