import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { getDB } from '../../shared/db/index.js'

const DEVICE_FIELDS = `
  id, name, device_type, mode, location, app_version, capabilities, health,
  status, queue_count, error_count, last_seen_at, last_sync_at,
  last_principal_kind, last_principal_id, last_principal_name,
  is_active, created_at, updated_at, revoked_at
`

export function hashDeviceSecret(secret) {
  return createHash('sha256').update(secret).digest('hex')
}

function parseObject(value) {
  if (!value) return {}
  try { return JSON.parse(value) }
  catch { return {} }
}

export function publicDevice(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    device_type: row.device_type,
    mode: row.mode,
    location: row.location,
    app_version: row.app_version,
    capabilities: parseObject(row.capabilities),
    health: parseObject(row.health),
    status: row.status,
    queue_count: row.queue_count,
    error_count: row.error_count,
    last_seen_at: row.last_seen_at,
    last_sync_at: row.last_sync_at,
    last_principal_kind: row.last_principal_kind,
    last_principal_id: row.last_principal_id,
    last_principal_name: row.last_principal_name,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
    revoked_at: row.revoked_at,
    online: Boolean(
      row.is_active
      && row.status !== 'revoked'
      && row.last_seen_at
      && Date.now() - new Date(`${row.last_seen_at.replace(' ', 'T')}Z`).getTime() <= 5 * 60 * 1000
    ),
  }
}

function addEvent(db, deviceId, eventType, detail = {}, actorUserId = null) {
  db.prepare(`
    INSERT INTO kiosk_device_events(device_id, event_type, detail, actor_user_id)
    VALUES(?,?,?,?)
  `).run(deviceId, eventType, JSON.stringify(detail), actorUserId)
}

export function createEnrollmentCode(actorUserId, input) {
  const db = getDB()
  const code = `KE-${randomBytes(10).toString('hex').toUpperCase()}`
  const expiresAt = new Date(Date.now() + input.expires_minutes * 60 * 1000)
    .toISOString().replace('T', ' ').slice(0, 19)
  const result = db.prepare(`
    INSERT INTO kiosk_enrollment_codes(
      code_hash, code_hint, name, device_type, mode, location, expires_at, created_by
    ) VALUES(?,?,?,?,?,?,?,?)
  `).run(
    hashDeviceSecret(code),
    code.slice(-6),
    input.name,
    input.device_type,
    input.mode,
    input.location || null,
    expiresAt,
    actorUserId,
  )
  return { id: Number(result.lastInsertRowid), code, expires_at: `${expiresAt.replace(' ', 'T')}Z`, ...input }
}

export function enrollDevice(input) {
  const db = getDB()
  const enrollment = db.prepare(`
    SELECT * FROM kiosk_enrollment_codes WHERE code_hash=?
  `).get(hashDeviceSecret(input.code))
  if (!enrollment) return { error: 'Kayıt kodu geçersiz', status: 404 }
  if (enrollment.revoked_at) return { error: 'Kayıt kodu iptal edilmiş', status: 410 }
  if (enrollment.used_at) return { error: 'Kayıt kodu daha önce kullanılmış', status: 409 }
  if (new Date(`${enrollment.expires_at.replace(' ', 'T')}Z`).getTime() <= Date.now()) {
    return { error: 'Kayıt kodunun süresi dolmuş', status: 410 }
  }

  const deviceId = randomUUID()
  const deviceKey = `KD-${randomBytes(32).toString('hex')}`
  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO kiosk_devices(
        id, name, device_type, mode, location, token_hash, app_version,
        capabilities, last_seen_at, created_by
      ) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?)
    `).run(
      deviceId,
      enrollment.name,
      enrollment.device_type,
      enrollment.mode,
      enrollment.location,
      hashDeviceSecret(deviceKey),
      input.app_version || null,
      JSON.stringify(input.capabilities || {}),
      enrollment.created_by,
    )
    db.prepare(`
      UPDATE kiosk_enrollment_codes
      SET used_at=CURRENT_TIMESTAMP, used_by_device_id=?
      WHERE id=? AND used_at IS NULL
    `).run(deviceId, enrollment.id)
    addEvent(db, deviceId, 'enrolled', { app_version: input.app_version || null }, enrollment.created_by)
  })
  transaction()
  const device = db.prepare(`SELECT ${DEVICE_FIELDS} FROM kiosk_devices WHERE id=?`).get(deviceId)
  return { device: publicDevice(device), device_key: deviceKey }
}

export function listDevices() {
  return getDB().prepare(`SELECT ${DEVICE_FIELDS} FROM kiosk_devices ORDER BY is_active DESC, name`).all().map(publicDevice)
}

export function overview() {
  const db = getDB()
  const devices = db.prepare(`
    SELECT
      COUNT(*) AS registered,
      COALESCE(SUM(CASE WHEN is_active=1 AND status<>'revoked' AND last_seen_at >= datetime('now','-5 minutes') THEN 1 ELSE 0 END),0) AS online,
      COALESCE(SUM(CASE WHEN is_active=1 AND status<>'revoked' AND (last_seen_at IS NULL OR last_seen_at < datetime('now','-5 minutes')) THEN 1 ELSE 0 END),0) AS offline,
      COALESCE(SUM(CASE WHEN status='locked' THEN 1 ELSE 0 END),0) AS locked,
      COALESCE(SUM(CASE WHEN status='revoked' OR is_active=0 THEN 1 ELSE 0 END),0) AS revoked
    FROM kiosk_devices
  `).get()
  const pendingEnrollment = db.prepare(`
    SELECT COUNT(*) AS count FROM kiosk_enrollment_codes
    WHERE used_at IS NULL AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
  `).get().count
  const staffPins = db.prepare(`
    SELECT COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN kiosk_pin IS NOT NULL AND kiosk_pin<>'' THEN 1 ELSE 0 END),0) AS configured
    FROM staff WHERE is_active=1
  `).get()
  const residentPins = db.prepare(`
    SELECT COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN kiosk_pin IS NOT NULL AND kiosk_pin<>'' THEN 1 ELSE 0 END),0) AS configured
    FROM personnel
    WHERE check_out_date IS NULL AND COALESCE(is_placeholder,0)=0
  `).get()
  const queues = db.prepare(`
    SELECT COALESCE(SUM(queue_count),0) AS pending,
      COALESCE(SUM(error_count),0) AS errors,
      SUM(CASE WHEN queue_count>0 THEN 1 ELSE 0 END) AS affected_devices
    FROM kiosk_devices WHERE is_active=1 AND status<>'revoked'
  `).get()
  return {
    devices: { ...devices, pending_enrollment: pendingEnrollment },
    pin_coverage: { staff: staffPins, personnel: residentPins },
    queues,
  }
}

export function updateDevice(deviceId, input, actorUserId) {
  const db = getDB()
  const current = db.prepare('SELECT * FROM kiosk_devices WHERE id=?').get(deviceId)
  if (!current) return null
  const fields = []
  const values = []
  for (const key of ['name', 'location', 'status']) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      fields.push(`${key}=?`)
      values.push(input[key])
    }
  }
  if (fields.length) {
    values.push(deviceId)
    db.prepare(`UPDATE kiosk_devices SET ${fields.join(', ')}, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(...values)
    addEvent(db, deviceId, 'configuration_updated', { before: publicDevice(current), changes: input }, actorUserId)
  }
  return publicDevice(db.prepare(`SELECT ${DEVICE_FIELDS} FROM kiosk_devices WHERE id=?`).get(deviceId))
}

export function revokeDevice(deviceId, actorUserId) {
  const db = getDB()
  const current = db.prepare('SELECT id FROM kiosk_devices WHERE id=?').get(deviceId)
  if (!current) return null
  db.prepare(`
    UPDATE kiosk_devices
    SET status='revoked', is_active=0, revoked_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(deviceId)
  db.prepare(`
    UPDATE kiosk_device_commands SET status='cancelled', completed_at=CURRENT_TIMESTAMP
    WHERE device_id=? AND status IN ('pending','delivered')
  `).run(deviceId)
  db.prepare(`
    UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP
    WHERE device_id=? AND revoked_at IS NULL
  `).run(deviceId)
  addEvent(db, deviceId, 'revoked', {}, actorUserId)
  return publicDevice(db.prepare(`SELECT ${DEVICE_FIELDS} FROM kiosk_devices WHERE id=?`).get(deviceId))
}

export function heartbeat(device, input) {
  const db = getDB()
  const principal = input.current_principal || null
  db.prepare(`
    UPDATE kiosk_devices SET
      app_version=COALESCE(?,app_version),
      capabilities=COALESCE(?,capabilities),
      health=COALESCE(?,health),
      queue_count=COALESCE(?,queue_count),
      error_count=COALESCE(?,error_count),
      last_sync_at=COALESCE(?,last_sync_at),
      last_principal_kind=?, last_principal_id=?, last_principal_name=?,
      last_seen_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(
    input.app_version || null,
    input.capabilities ? JSON.stringify(input.capabilities) : null,
    input.health ? JSON.stringify(input.health) : null,
    input.queue_count ?? null,
    input.error_count ?? null,
    input.last_sync_at || null,
    principal?.kind || null,
    principal?.id || null,
    principal?.name || null,
    device.id,
  )
  return publicDevice(db.prepare(`SELECT ${DEVICE_FIELDS} FROM kiosk_devices WHERE id=?`).get(device.id))
}

export function createCommand(deviceId, input, actorUserId) {
  const db = getDB()
  const device = db.prepare('SELECT id, status FROM kiosk_devices WHERE id=? AND is_active=1').get(deviceId)
  if (!device) return null
  const result = db.prepare(`
    INSERT INTO kiosk_device_commands(device_id, command_type, payload, created_by)
    VALUES(?,?,?,?)
  `).run(deviceId, input.command_type, JSON.stringify(input.payload || {}), actorUserId)
  if (input.command_type === 'lock') {
    db.prepare("UPDATE kiosk_devices SET status='locked', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(deviceId)
  }
  addEvent(db, deviceId, 'command_created', { command_type: input.command_type }, actorUserId)
  return commandById(Number(result.lastInsertRowid))
}

function publicCommand(row) {
  return row ? { ...row, payload: parseObject(row.payload), result: parseObject(row.result) } : null
}

function commandById(id) {
  return publicCommand(getDB().prepare('SELECT * FROM kiosk_device_commands WHERE id=?').get(id))
}

export function pendingCommands(deviceId) {
  const db = getDB()
  const rows = db.prepare(`
    SELECT * FROM kiosk_device_commands
    WHERE device_id=? AND status IN ('pending','delivered')
    ORDER BY created_at, id
  `).all(deviceId)
  db.prepare(`
    UPDATE kiosk_device_commands SET status='delivered', delivered_at=COALESCE(delivered_at,CURRENT_TIMESTAMP)
    WHERE device_id=? AND status='pending'
  `).run(deviceId)
  return rows.map(row => publicCommand({ ...row, status: row.status === 'pending' ? 'delivered' : row.status }))
}

export function acknowledgeCommand(deviceId, commandId, input) {
  const db = getDB()
  const command = db.prepare('SELECT * FROM kiosk_device_commands WHERE id=? AND device_id=?').get(commandId, deviceId)
  if (!command) return null
  db.prepare(`
    UPDATE kiosk_device_commands
    SET status=?, result=?, completed_at=CURRENT_TIMESTAMP
    WHERE id=? AND device_id=?
  `).run(input.status, JSON.stringify(input.result || {}), commandId, deviceId)
  addEvent(db, deviceId, 'command_acknowledged', { command_id: commandId, status: input.status })
  return commandById(commandId)
}

export function deviceConfig(deviceId) {
  const db = getDB()
  const device = db.prepare(`SELECT ${DEVICE_FIELDS} FROM kiosk_devices WHERE id=?`).get(deviceId)
  if (!device) return null
  const settings = Object.fromEntries(db.prepare(`
    SELECT key, value FROM system_settings WHERE key LIKE 'kiosk_%'
  `).all().map(row => [row.key, row.value]))
  return { device: publicDevice(device), settings }
}

export function rotateDeviceKey(deviceId) {
  const db = getDB()
  const deviceKey = `KD-${randomBytes(32).toString('hex')}`
  db.prepare(`
    UPDATE kiosk_devices SET token_hash=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
  `).run(hashDeviceSecret(deviceKey), deviceId)
  addEvent(db, deviceId, 'key_rotated')
  return { device_key: deviceKey }
}
