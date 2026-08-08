import { getDB } from '../../shared/db/index.js'

export const PERSONNEL_EVENT_TYPES = Object.freeze([
  'tracking_started',
  'employment_started',
  'assignment_changed',
  'temporary_project_work',
  'shift_changed',
  'leave_changed',
  'overtime_changed',
  'absence_recorded',
  'offboarding_started',
  'employment_ended',
  'employment_restored',
])

const EVENT_TYPE_SET = new Set(PERSONNEL_EVENT_TYPES)
const REASON_REQUIRED = new Set([
  'assignment_changed',
  'shift_changed',
  'leave_changed',
  'overtime_changed',
  'offboarding_started',
  'employment_ended',
  'employment_restored',
])

function trackingError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode })
}

function requiredPositiveId(value, label) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) throw trackingError(`${label} gecersiz`)
  return parsed
}

function optionalPositiveId(value, label) {
  if (value === undefined || value === null || value === '') return null
  return requiredPositiveId(value, label)
}

function normalizeEffectiveAt(value) {
  const normalized = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.test(normalized)) {
    throw trackingError('Olay tarihi YYYY-MM-DD veya YYYY-MM-DD HH:mm:ss olmali')
  }
  return normalized
}

function normalizeSource(value) {
  if (value === undefined || value === null || value === '') return null
  const normalized = String(value).trim()
  if (!normalized || normalized.length > 80) throw trackingError('Olay kaynak bilgisi gecersiz')
  return normalized
}

function serializeJson(value, label) {
  if (value === undefined || value === null) return null
  try {
    return JSON.stringify(value)
  } catch {
    throw trackingError(`${label} JSON olarak kaydedilemedi`)
  }
}

function parseJson(value) {
  if (value === undefined || value === null) return null
  return JSON.parse(value)
}

function hydrateEvent(row) {
  if (!row) return row
  return {
    ...row,
    before: parseJson(row.before_json),
    after: parseJson(row.after_json),
    metadata: parseJson(row.metadata_json),
  }
}

export function recordPersonnelEvent({
  staffId,
  eventType,
  effectiveAt,
  sourceType = null,
  sourceId = null,
  before = null,
  after = null,
  reason = null,
  actorUserId = null,
  metadata = null,
}) {
  const db = getDB()
  const normalizedStaffId = requiredPositiveId(staffId, 'Personel kimligi')
  if (!EVENT_TYPE_SET.has(eventType)) throw trackingError('Personel olay turu desteklenmiyor')
  if (!db.prepare('SELECT 1 FROM staff WHERE id=?').get(normalizedStaffId)) {
    throw trackingError('Personel bulunamadi', 404)
  }

  const normalizedReason = String(reason || '').trim() || null
  if (REASON_REQUIRED.has(eventType) && !normalizedReason) {
    throw trackingError('Bu personel hareketi icin aciklama zorunlu')
  }

  const normalizedSourceType = normalizeSource(sourceType)
  const normalizedSourceId = normalizeSource(sourceId)
  if ((normalizedSourceType && !normalizedSourceId) || (!normalizedSourceType && normalizedSourceId)) {
    throw trackingError('Olay kaynak turu ve kimligi birlikte verilmelidir')
  }

  const save = db.transaction(() => {
    let revisionNo = 1
    if (normalizedSourceType) {
      revisionNo = Number(db.prepare(`
        SELECT COALESCE(MAX(revision_no), 0) + 1 AS revision_no
        FROM personnel_tracking_events
        WHERE source_type=? AND source_id=?
      `).get(normalizedSourceType, normalizedSourceId).revision_no)
    }

    const result = db.prepare(`
      INSERT INTO personnel_tracking_events(
        staff_id, event_type, effective_at, source_type, source_id, revision_no,
        before_json, after_json, reason, actor_user_id, metadata_json
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      normalizedStaffId,
      eventType,
      normalizeEffectiveAt(effectiveAt),
      normalizedSourceType,
      normalizedSourceId,
      revisionNo,
      serializeJson(before, 'Onceki deger'),
      serializeJson(after, 'Yeni deger'),
      normalizedReason,
      optionalPositiveId(actorUserId, 'Islemi yapan kullanici'),
      serializeJson(metadata, 'Olay metaverisi'),
    )
    return hydrateEvent(db.prepare('SELECT * FROM personnel_tracking_events WHERE id=?').get(result.lastInsertRowid))
  })

  return save()
}

export function getPersonnelEvent(id) {
  const eventId = requiredPositiveId(id, 'Olay kimligi')
  return hydrateEvent(getDB().prepare('SELECT * FROM personnel_tracking_events WHERE id=?').get(eventId))
}

export function listPersonnelEvents({
  staffId,
  eventTypes = [],
  from,
  to,
  sourceType,
  sourceId,
  limit = 100,
  offset = 0,
} = {}) {
  const where = ['1=1']
  const params = []

  if (staffId !== undefined) {
    where.push('staff_id=?')
    params.push(requiredPositiveId(staffId, 'Personel kimligi'))
  }
  if (eventTypes.length) {
    const normalizedTypes = [...new Set(eventTypes)]
    if (normalizedTypes.some(type => !EVENT_TYPE_SET.has(type))) throw trackingError('Personel olay turu desteklenmiyor')
    where.push(`event_type IN (${normalizedTypes.map(() => '?').join(',')})`)
    params.push(...normalizedTypes)
  }
  if (from) {
    where.push('date(effective_at) >= date(?)')
    params.push(normalizeEffectiveAt(from))
  }
  if (to) {
    where.push('date(effective_at) <= date(?)')
    params.push(normalizeEffectiveAt(to))
  }
  if (sourceType !== undefined || sourceId !== undefined) {
    const normalizedSourceType = normalizeSource(sourceType)
    const normalizedSourceId = normalizeSource(sourceId)
    if (!normalizedSourceType || !normalizedSourceId) throw trackingError('Olay kaynak turu ve kimligi birlikte verilmelidir')
    where.push('source_type=? AND source_id=?')
    params.push(normalizedSourceType, normalizedSourceId)
  }

  const normalizedLimit = Math.min(500, Math.max(1, Number(limit) || 100))
  const normalizedOffset = Math.max(0, Number(offset) || 0)
  const rows = getDB().prepare(`
    SELECT *
    FROM personnel_tracking_events
    WHERE ${where.join(' AND ')}
    ORDER BY effective_at DESC, id DESC
    LIMIT ? OFFSET ?
  `).all(...params, normalizedLimit, normalizedOffset)
  return rows.map(hydrateEvent)
}
