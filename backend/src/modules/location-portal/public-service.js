import bcrypt from 'bcryptjs'
import { createHash, createHmac, randomBytes } from 'node:crypto'
import { getDB } from '../../shared/db/index.js'
import { logger } from '../../shared/logger.js'
import { getPortalSettings, resolveLocationToken } from './service.js'

const PORTAL_SESSION_MINUTES = 15
const FAILED_PIN_WARN_AT = 10
const RECEIPT_STATUS = new Set(['accepted', 'pending', 'completed', 'rejected', 'merged'])

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function dailyAuditKey() {
  const secret = process.env.PORTAL_AUDIT_SECRET || process.env.JWT_SECRET
  const day = new Date().toISOString().slice(0, 10)
  return createHmac('sha256', secret).update(`room-portal:${day}`).digest()
}

export function portalIpHash(ip) {
  return createHmac('sha256', dailyAuditKey()).update(String(ip || 'unknown')).digest('hex')
}

function safeMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const json = JSON.stringify(value)
  return json.length <= 2000 ? json : JSON.stringify({ truncated: true })
}

export function recordPortalEvent({
  locationId,
  qrCodeId = null,
  eventType,
  actorMode = 'anonymous',
  actorPersonnelId = null,
  actorStaffId = null,
  linkedEntityType = null,
  linkedEntityId = null,
  result,
  clientRequestId = null,
  ip,
  metadata = null,
}) {
  const write = getDB().prepare(`
    INSERT INTO location_portal_events(
      location_id, qr_code_id, event_type, actor_mode,
      actor_personnel_id, actor_staff_id, linked_entity_type, linked_entity_id,
      result, client_request_id, ip_hash, metadata
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    locationId, qrCodeId, String(eventType), actorMode,
    actorPersonnelId, actorStaffId, linkedEntityType, linkedEntityId,
    result, clientRequestId, portalIpHash(ip), safeMetadata(metadata),
  )
  return write.lastInsertRowid
}

function publicActions(settings, locationType) {
  return {
    fault: {
      enabled: settings.location_portal_fault_enabled,
      pin_required: settings.location_portal_fault_pin_required,
    },
    laundry: {
      enabled: locationType === 'room' && settings.location_portal_laundry_enabled,
      pin_required: settings.location_portal_laundry_pin_required,
    },
    cleaning: {
      enabled: settings.location_portal_cleaning_enabled,
      pin_required: false,
      review_pin_required: settings.location_portal_cleaning_review_pin_required,
    },
    survey: {
      enabled: settings.location_portal_survey_enabled,
      pin_required: false,
    },
  }
}

export function getPublicPortal(token, ip) {
  const resolved = resolveLocationToken(token)
  if (!resolved) return { error: 'QR kodu bulunamadı', code: 'unknown_qr', status: 404 }
  if (resolved.qr_status !== 'active') return { error: 'Bu QR kodu artık geçerli değil', code: 'revoked_qr', status: 410 }
  if (!resolved.is_active) return { error: 'Bu konum artık kullanımda değil', code: 'inactive_location', status: 410 }

  const settings = getPortalSettings()
  recordPortalEvent({
    locationId: resolved.location_id,
    qrCodeId: resolved.qr_id,
    eventType: 'scan',
    result: 'opened',
    ip,
    metadata: { portal_enabled: settings.location_portal_enabled },
  })
  return {
    status: 200,
    portal_status: settings.location_portal_enabled ? 'active' : 'disabled',
    location: {
      type: resolved.location_type,
      block: resolved.block,
      floor: resolved.floor,
      area_code: resolved.area_code,
      display_name: resolved.display_name,
    },
    actions: settings.location_portal_enabled
      ? publicActions(settings, resolved.location_type)
      : publicActions(Object.fromEntries(Object.keys(settings).map(key => [key, false])), resolved.location_type),
  }
}

function authError(message, statusCode, code) {
  const error = new Error(message)
  error.statusCode = statusCode
  error.code = code
  return error
}

function findResident(location, identifier) {
  const db = getDB()
  const normalized = String(identifier || '').trim().toUpperCase()
  if (normalized.length < 3 || normalized.length > 32) throw authError('TC veya pasaport numarası geçersiz', 400, 'invalid_identifier')
  const resident = db.prepare(`
    SELECT p.id, p.full_name, p.kiosk_pin, p.pin_attempts
    FROM personnel p
    WHERE p.check_out_date IS NULL
      AND (UPPER(COALESCE(p.tc_no,''))=? OR UPPER(COALESCE(p.passport_no,''))=?)
    LIMIT 1
  `).get(normalized, normalized)
  if (!resident) throw authError('Bilgiler doğrulanamadı', 401, 'invalid_credentials')

  const assignment = db.prepare(`
    SELECT room_id FROM room_assignments
    WHERE personnel_id=? AND check_out_at IS NULL
    LIMIT 1
  `).get(resident.id)
  if (!assignment) throw authError('Aktif oda kaydı bulunamadı', 403, 'no_active_room')
  if (location.location_type === 'room' && assignment.room_id !== location.room_id) {
    throw authError('Bu PIN bu odaya ait değil', 403, 'room_mismatch')
  }
  return resident
}

function ensurePermanentPin(resident, pin) {
  const db = getDB()
  if (!resident.kiosk_pin) throw authError('PIN tanımlı değil. Yöneticinizden PIN alın.', 403, 'pin_missing')
  const temporary = db.prepare(`
    SELECT id FROM kiosk_pin_issuances
    WHERE principal_kind='personnel' AND principal_id=?
      AND revoked_at IS NULL AND completed_at IS NULL
    ORDER BY id DESC LIMIT 1
  `).get(resident.id)
  if (temporary) throw authError('Önce ana kiosktan kalıcı PIN belirleyin', 423, 'permanent_pin_required')
  if (!/^\d{4}$/.test(String(pin || '')) || !bcrypt.compareSync(String(pin), resident.kiosk_pin)) {
    db.prepare('UPDATE personnel SET pin_attempts=COALESCE(pin_attempts,0)+1 WHERE id=?').run(resident.id)
    const attempts = db.prepare('SELECT pin_attempts FROM personnel WHERE id=?').get(resident.id)?.pin_attempts || 0
    if (attempts % FAILED_PIN_WARN_AT === 0) {
      logger.warn({ personnelId: resident.id, attempts }, '[RoomPortal] Üst üste hatalı PIN denemesi')
    }
    throw authError('Bilgiler doğrulanamadı', 401, 'invalid_credentials')
  }
  db.prepare('UPDATE personnel SET pin_attempts=0, pin_locked_until=NULL WHERE id=?').run(resident.id)
}

function maskedName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'Sakin'
  return [parts[0], ...parts.slice(1).map(part => `${part[0]}.`)].join(' ')
}

export function authenticatePortalResident({ token, identifier, pin, ip }) {
  const resolved = resolveLocationToken(token)
  if (!resolved) throw authError('QR kodu bulunamadı', 404, 'unknown_qr')
  if (resolved.qr_status !== 'active' || !resolved.is_active) throw authError('QR kodu artık geçerli değil', 410, 'inactive_qr')
  const settings = getPortalSettings()
  if (!settings.location_portal_enabled) throw authError('Oda hizmet portalı şu anda kapalı', 503, 'portal_disabled')

  let resident
  try {
    resident = findResident(resolved, identifier)
    ensurePermanentPin(resident, pin)
  } catch (error) {
    recordPortalEvent({
      locationId: resolved.location_id,
      qrCodeId: resolved.qr_id,
      eventType: 'auth',
      result: 'rejected',
      ip,
      metadata: { code: error.code || 'auth_failed' },
    })
    throw error
  }

  const sessionToken = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + PORTAL_SESSION_MINUTES * 60_000)
    .toISOString().slice(0, 19).replace('T', ' ')
  const db = getDB()
  const sessionId = db.prepare(`
    INSERT INTO location_portal_sessions(
      location_id, personnel_id, token_hash, created_ip_hash, expires_at
    ) VALUES(?,?,?,?,?)
  `).run(resolved.location_id, resident.id, sha256(sessionToken), portalIpHash(ip), expiresAt).lastInsertRowid
  recordPortalEvent({
    locationId: resolved.location_id,
    qrCodeId: resolved.qr_id,
    eventType: 'auth',
    actorMode: 'resident_pin',
    actorPersonnelId: resident.id,
    result: 'completed',
    ip,
  })
  return {
    session_token: sessionToken,
    expires_at: new Date(`${expiresAt.replace(' ', 'T')}Z`).toISOString(),
    resident: { display_name: maskedName(resident.full_name) },
    session_id: sessionId,
  }
}

export function verifyPortalSession(sessionToken, locationId) {
  const value = String(sessionToken || '')
  if (value.length < 43 || value.length > 64) return null
  const db = getDB()
  const session = db.prepare(`
    SELECT s.id, s.location_id, s.personnel_id, s.expires_at,
           p.full_name, p.check_out_date, sl.location_type, sl.room_id
    FROM location_portal_sessions s
    JOIN personnel p ON p.id=s.personnel_id
    JOIN service_locations sl ON sl.id=s.location_id
    WHERE s.token_hash=? AND s.location_id=? AND s.revoked_at IS NULL
      AND s.expires_at > datetime('now')
      AND p.check_out_date IS NULL AND sl.is_active=1
  `).get(sha256(value), Number(locationId))
  if (!session) return null
  const assignment = db.prepare(`
    SELECT room_id FROM room_assignments
    WHERE personnel_id=? AND check_out_at IS NULL LIMIT 1
  `).get(session.personnel_id)
  if (!assignment || (session.location_type === 'room' && assignment.room_id !== session.room_id)) return null
  db.prepare("UPDATE location_portal_sessions SET last_used_at=datetime('now') WHERE id=?").run(session.id)
  return session
}

function validateIdempotency(actionType, clientRequestId) {
  const action = String(actionType || '').trim()
  const requestId = String(clientRequestId || '').trim()
  if (action.length < 2 || action.length > 64) throw authError('Geçersiz işlem türü', 400, 'invalid_action')
  if (requestId.length < 8 || requestId.length > 100 || !/^[A-Za-z0-9._:-]+$/.test(requestId)) {
    throw authError('Geçersiz client_request_id', 400, 'invalid_client_request_id')
  }
  return { action, requestId }
}

function parsePublicPayload(value) {
  try { return JSON.parse(value || '{}') }
  catch { return {} }
}

function publicReceipt(row) {
  return {
    receipt: row.receipt_code,
    action: row.action_type,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    summary: parsePublicPayload(row.public_payload),
    location: row.display_name ? { display_name: row.display_name, type: row.location_type } : undefined,
  }
}

export function createOrGetPortalReceipt({ locationId, actionType, clientRequestId, eventId = null, status = 'accepted', publicPayload = {} }) {
  const { action, requestId } = validateIdempotency(actionType, clientRequestId)
  if (!RECEIPT_STATUS.has(status)) throw authError('Geçersiz makbuz durumu', 400, 'invalid_receipt_status')
  const db = getDB()
  const existing = db.prepare(`
    SELECT * FROM location_portal_receipts
    WHERE location_id=? AND action_type=? AND client_request_id=?
  `).get(Number(locationId), action, requestId)
  if (existing) return { receipt: publicReceipt(existing), replayed: true }

  const receiptCode = randomBytes(18).toString('base64url')
  const payload = safeMetadata(publicPayload)
  try {
    db.prepare(`
      INSERT INTO location_portal_receipts(
        receipt_code, location_id, event_id, action_type,
        client_request_id, status, public_payload
      ) VALUES(?,?,?,?,?,?,?)
    `).run(receiptCode, Number(locationId), eventId, action, requestId, status, payload)
  } catch (error) {
    if (!String(error.message).includes('UNIQUE')) throw error
    const raced = db.prepare(`
      SELECT * FROM location_portal_receipts
      WHERE location_id=? AND action_type=? AND client_request_id=?
    `).get(Number(locationId), action, requestId)
    return { receipt: publicReceipt(raced), replayed: true }
  }
  const created = db.prepare('SELECT * FROM location_portal_receipts WHERE receipt_code=?').get(receiptCode)
  return { receipt: publicReceipt(created), replayed: false }
}

export function updatePortalReceipt(receiptCode, status, publicPayload = {}) {
  if (!RECEIPT_STATUS.has(status)) throw authError('Geçersiz makbuz durumu', 400, 'invalid_receipt_status')
  const result = getDB().prepare(`
    UPDATE location_portal_receipts
    SET status=?, public_payload=?, updated_at=datetime('now')
    WHERE receipt_code=?
  `).run(status, safeMetadata(publicPayload), String(receiptCode))
  if (!result.changes) throw authError('Takip kaydı bulunamadı', 404, 'receipt_not_found')
  return getPublicPortalReceipt(receiptCode)
}

export function getPublicPortalReceipt(receiptCode) {
  const value = String(receiptCode || '').trim()
  if (value.length < 22 || value.length > 64) return null
  const row = getDB().prepare(`
    SELECT r.*, sl.display_name, sl.location_type
    FROM location_portal_receipts r
    JOIN service_locations sl ON sl.id=r.location_id
    WHERE r.receipt_code=?
  `).get(value)
  return row ? publicReceipt(row) : null
}
