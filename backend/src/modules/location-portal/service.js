import { createHash, randomBytes } from 'node:crypto'
import { getDB } from '../../shared/db/index.js'

export const PORTAL_SETTING_KEYS = Object.freeze([
  'location_portal_enabled',
  'location_portal_fault_enabled',
  'location_portal_laundry_enabled',
  'location_portal_cleaning_enabled',
  'location_portal_survey_enabled',
  'location_portal_fault_pin_required',
  'location_portal_laundry_pin_required',
  'location_portal_cleaning_review_pin_required',
])

const COMMON_AREAS = Object.freeze([
  { code: 'corridor', label: 'Koridor' },
  { code: 'toilet', label: 'Tuvalet / WC' },
  { code: 'bathroom', label: 'Banyo' },
  { code: 'stairs', label: 'Merdiven' },
])

function digestToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function generateToken() {
  return randomBytes(32).toString('base64url')
}

function publicTokenRecord(row) {
  if (!row) return null
  return {
    id: row.id,
    location_id: row.location_id,
    token: row.token,
    path: `/r/${row.token}`,
    status: row.status,
    created_at: row.created_at,
    rotated_from_id: row.rotated_from_id,
  }
}

export function getPortalSettings() {
  const placeholders = PORTAL_SETTING_KEYS.map(() => '?').join(',')
  const rows = getDB().prepare(
    `SELECT key, value FROM system_settings WHERE key IN (${placeholders})`
  ).all(...PORTAL_SETTING_KEYS)
  const values = new Map(rows.map(row => [row.key, row.value]))
  return Object.fromEntries(PORTAL_SETTING_KEYS.map(key => [key, values.get(key) === '1']))
}

export function updatePortalSettings(patch) {
  const entries = Object.entries(patch || {})
  if (entries.length === 0) {
    const error = new Error('En az bir ayar gerekli')
    error.statusCode = 400
    throw error
  }
  for (const [key, value] of entries) {
    if (!PORTAL_SETTING_KEYS.includes(key)) {
      const error = new Error(`Bilinmeyen ayar: ${key}`)
      error.statusCode = 400
      throw error
    }
    if (typeof value !== 'boolean') {
      const error = new Error(`${key} boolean olmalı`)
      error.statusCode = 400
      throw error
    }
  }

  const db = getDB()
  const write = db.prepare(`
    INSERT INTO system_settings(key, value, updated_at)
    VALUES(?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')
  `)
  db.transaction(() => {
    for (const [key, value] of entries) write.run(key, value ? '1' : '0')
  })()
  return getPortalSettings()
}

export function syncServiceLocations() {
  const db = getDB()
  const roomUpsert = db.prepare(`
    INSERT INTO service_locations(
      location_type, source, room_id, block, floor, area_code,
      qr_location, display_name, is_active
    ) VALUES('room','rooms',?,?,?,NULL,?,?,1)
    ON CONFLICT(room_id) DO UPDATE SET
      block=excluded.block,
      floor=excluded.floor,
      qr_location=excluded.qr_location,
      display_name=excluded.display_name,
      is_active=1,
      updated_at=datetime('now')
  `)
  const commonUpsert = db.prepare(`
    INSERT INTO service_locations(
      location_type, source, room_id, block, floor, area_code,
      qr_location, display_name, is_active
    ) VALUES('common_area','housekeeping',NULL,?,?,?,?,?,1)
    ON CONFLICT(qr_location) DO UPDATE SET
      block=excluded.block,
      floor=excluded.floor,
      area_code=excluded.area_code,
      display_name=excluded.display_name,
      is_active=1,
      updated_at=datetime('now')
  `)

  db.transaction(() => {
    db.prepare("UPDATE service_locations SET is_active=0, updated_at=datetime('now') WHERE source IN ('rooms','housekeeping')").run()
    const rooms = db.prepare('SELECT id, block, floor, room_no FROM rooms ORDER BY id').all()
    for (const room of rooms) {
      roomUpsert.run(
        room.id,
        room.block,
        room.floor,
        `${room.block}-${room.room_no}`,
        `${room.block} Oda ${room.room_no}`,
      )
    }
    const floors = db.prepare("SELECT DISTINCT block, floor FROM rooms WHERE block LIKE 'M%' ORDER BY block, floor").all()
    for (const floor of floors) {
      for (const area of COMMON_AREAS) {
        commonUpsert.run(
          floor.block,
          floor.floor,
          area.code,
          `${floor.block}-${floor.floor}-${area.code}`,
          `${floor.block} ${floor.floor}. Kat ${area.label}`,
        )
      }
    }
  })()

  return db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN is_active=1 THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN location_type='room' AND is_active=1 THEN 1 ELSE 0 END) AS rooms,
      SUM(CASE WHEN location_type='common_area' AND is_active=1 THEN 1 ELSE 0 END) AS common_areas
    FROM service_locations
  `).get()
}

function normalizeFilters(filters = {}) {
  const normalized = {}
  if (filters.block !== undefined && filters.block !== '') {
    normalized.block = String(filters.block).trim()
    if (!normalized.block || normalized.block.length > 16) {
      const error = new Error('Geçersiz blok')
      error.statusCode = 400
      throw error
    }
  }
  if (filters.floor !== undefined && filters.floor !== '') {
    normalized.floor = Number(filters.floor)
    if (!Number.isInteger(normalized.floor) || normalized.floor < -10 || normalized.floor > 200) {
      const error = new Error('Geçersiz kat')
      error.statusCode = 400
      throw error
    }
  }
  if (filters.location_type !== undefined && filters.location_type !== '') {
    normalized.location_type = String(filters.location_type)
    if (!['room', 'common_area'].includes(normalized.location_type)) {
      const error = new Error('Geçersiz konum türü')
      error.statusCode = 400
      throw error
    }
  }
  return normalized
}

function locationWhere(filters, params, { activeOnly = false } = {}) {
  const clauses = []
  if (activeOnly) clauses.push('sl.is_active=1')
  if (filters.block) { clauses.push('sl.block=?'); params.push(filters.block) }
  if (filters.floor !== undefined) { clauses.push('sl.floor=?'); params.push(filters.floor) }
  if (filters.location_type) { clauses.push('sl.location_type=?'); params.push(filters.location_type) }
  return clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
}

export function listServiceLocations(query = {}) {
  const filters = normalizeFilters(query)
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1)
  const limit = Math.max(1, Math.min(500, Number.parseInt(query.limit, 10) || 100))
  const params = []
  const where = locationWhere(filters, params)
  const db = getDB()
  const total = db.prepare(`SELECT COUNT(*) AS count FROM service_locations sl ${where}`).get(...params).count
  const items = db.prepare(`
    SELECT sl.id, sl.location_type, sl.room_id, sl.block, sl.floor, sl.area_code,
           sl.qr_location, sl.display_name, sl.is_active, sl.updated_at,
           q.id AS qr_id, q.status AS qr_status, q.created_at AS qr_created_at,
           q.last_printed_at
    FROM service_locations sl
    LEFT JOIN location_qr_codes q ON q.location_id=sl.id AND q.status='active'
    ${where}
    ORDER BY sl.block, sl.floor,
      CASE sl.location_type WHEN 'room' THEN 0 ELSE 1 END,
      sl.display_name
    LIMIT ? OFFSET ?
  `).all(...params, limit, (page - 1) * limit)
  return { items, page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
}

function insertToken(db, locationId, userId, rotatedFromId = null) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = generateToken()
    try {
      const result = db.prepare(`
        INSERT INTO location_qr_codes(
          location_id, token, token_hash, created_by, rotated_from_id
        ) VALUES(?,?,?,?,?)
      `).run(locationId, token, digestToken(token), userId || null, rotatedFromId)
      return db.prepare('SELECT * FROM location_qr_codes WHERE id=?').get(result.lastInsertRowid)
    } catch (error) {
      if (!String(error.message).includes('token')) throw error
    }
  }
  throw new Error('Benzersiz QR tokenı üretilemedi')
}

export function generateMissingQrCodes(filters = {}, userId = null) {
  const normalized = normalizeFilters(filters)
  syncServiceLocations()
  const db = getDB()
  const params = []
  const where = locationWhere(normalized, params, { activeOnly: true })
  const missing = db.prepare(`
    SELECT sl.id
    FROM service_locations sl
    LEFT JOIN location_qr_codes q ON q.location_id=sl.id AND q.status='active'
    ${where}${where ? ' AND' : ' WHERE'} q.id IS NULL
    ORDER BY sl.id
  `).all(...params)
  db.transaction(() => {
    for (const location of missing) insertToken(db, location.id, userId)
  })()
  return { created: missing.length, active_locations: getActiveCoverage().active_locations }
}

export function rotateLocationQr(locationId, userId, reason = 'rotated') {
  const id = Number(locationId)
  if (!Number.isInteger(id) || id < 1) {
    const error = new Error('Geçersiz konum')
    error.statusCode = 400
    throw error
  }
  const db = getDB()
  return db.transaction(() => {
    const location = db.prepare('SELECT * FROM service_locations WHERE id=?').get(id)
    if (!location) {
      const error = new Error('Konum bulunamadı')
      error.statusCode = 404
      throw error
    }
    if (!location.is_active) {
      const error = new Error('Pasif konum için QR üretilemez')
      error.statusCode = 409
      throw error
    }
    const current = db.prepare("SELECT * FROM location_qr_codes WHERE location_id=? AND status='active'").get(id)
    if (current) {
      db.prepare(`
        UPDATE location_qr_codes
        SET status='revoked', revoked_by=?, revoked_at=datetime('now'), revoke_reason=?
        WHERE id=?
      `).run(userId || null, String(reason || 'rotated').slice(0, 200), current.id)
    }
    return publicTokenRecord(insertToken(db, id, userId, current?.id || null))
  })()
}

export function revokeLocationQr(locationId, userId, reason = 'revoked') {
  const id = Number(locationId)
  if (!Number.isInteger(id) || id < 1) {
    const error = new Error('Geçersiz konum')
    error.statusCode = 400
    throw error
  }
  const result = getDB().prepare(`
    UPDATE location_qr_codes
    SET status='revoked', revoked_by=?, revoked_at=datetime('now'), revoke_reason=?
    WHERE location_id=? AND status='active'
  `).run(userId || null, String(reason || 'revoked').slice(0, 200), id)
  if (!result.changes) {
    const error = new Error('Aktif QR bulunamadı')
    error.statusCode = 404
    throw error
  }
  return { revoked: true, location_id: id }
}

export function resolveLocationToken(token) {
  const value = String(token || '').trim()
  if (value.length < 43 || value.length > 64) return null
  return getDB().prepare(`
    SELECT q.id AS qr_id, q.status AS qr_status, q.revoked_at,
           sl.id AS location_id, sl.location_type, sl.room_id, sl.block, sl.floor,
           sl.area_code, sl.qr_location, sl.display_name, sl.is_active
    FROM location_qr_codes q
    JOIN service_locations sl ON sl.id=q.location_id
    WHERE q.token_hash=?
  `).get(digestToken(value)) || null
}

export function getActiveCoverage() {
  return getDB().prepare(`
    SELECT
      COUNT(*) AS active_locations,
      SUM(CASE WHEN q.id IS NOT NULL THEN 1 ELSE 0 END) AS qr_ready,
      SUM(CASE WHEN q.id IS NULL THEN 1 ELSE 0 END) AS qr_missing
    FROM service_locations sl
    LEFT JOIN location_qr_codes q ON q.location_id=sl.id AND q.status='active'
    WHERE sl.is_active=1
  `).get()
}

// Baskı föyü için: aktif QR'ı olan konumlar, sayfalama YOK (hepsi basılacak).
// listServiceLocations sayfalıyor; 1078 etiketi 100'er 100'er basmak işe yaramaz.
export function listPrintableQrCodes(filters = {}) {
  const normalized = normalizeFilters(filters)
  const params = []
  const where = locationWhere(normalized, params, { activeOnly: true })
  return getDB().prepare(`
    SELECT sl.id, sl.display_name, sl.block, sl.floor, sl.area_code, sl.location_type,
           q.token
    FROM service_locations sl
    JOIN location_qr_codes q ON q.location_id=sl.id AND q.status='active'
    ${where}
    ORDER BY sl.block, sl.floor,
      CASE sl.location_type WHEN 'room' THEN 0 ELSE 1 END,
      sl.display_name
  `).all(...params)
}
