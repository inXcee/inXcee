import { getDB } from '../../shared/db/index.js'

const REVISION_KEY = 'transport_revision'
const FEATURE_KEY = 'transport_v2_enabled'

export function getTransportRevision() {
  const row = getDB().prepare('SELECT value FROM system_settings WHERE key=?').get(REVISION_KEY)
  return Number.parseInt(row?.value || '0', 10) || 0
}

export function bumpTransportRevision() {
  const db = getDB()
  db.prepare(`
    INSERT INTO system_settings(key, value, updated_at)
    VALUES(?, '1', datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value = CAST(system_settings.value AS INTEGER) + 1,
      updated_at = datetime('now')
  `).run(REVISION_KEY)
  return getTransportRevision()
}

export function isTransportV2Enabled() {
  const row = getDB().prepare('SELECT value FROM system_settings WHERE key=?').get(FEATURE_KEY)
  return row?.value === '1' || row?.value === 'true'
}

export function setTransportV2Enabled(enabled) {
  getDB().prepare(`
    INSERT INTO system_settings(key, value, updated_at)
    VALUES(?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = datetime('now')
  `).run(FEATURE_KEY, enabled ? '1' : '0')
  return isTransportV2Enabled()
}

const REQUIRED_TABLES = [
  'transport_vehicles',
  'transport_drivers',
  'transport_resource_unavailability',
  'transport_trip_templates',
  'transport_trips',
  'transport_trip_assignments',
  'transport_trip_events',
  'transport_trip_access_tokens',
  'transport_scan_events',
]

export function getTransportV2Status() {
  const db = getDB()
  const available = new Set(db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'transport_%'
  `).all().map(row => row.name))
  const missingTables = REQUIRED_TABLES.filter(name => !available.has(name))
  const legacyAssignments = db.prepare('SELECT COUNT(*) AS count FROM route_assignments').get().count
  const mirroredAssignments = missingTables.includes('transport_trip_assignments')
    ? 0
    : db.prepare(`
      SELECT COUNT(*) AS count FROM transport_trip_assignments
      WHERE legacy_assignment_id IS NOT NULL
    `).get().count
  const foreignKeyViolations = db.pragma('foreign_key_check').length
  const blockers = []
  if (missingTables.length) blockers.push(`${missingTables.length} V2 tablosu eksik`)
  if (legacyAssignments !== mirroredAssignments) {
    blockers.push(`Legacy atama paritesi bozuk: ${legacyAssignments}/${mirroredAssignments}`)
  }
  if (foreignKeyViolations) blockers.push(`${foreignKeyViolations} foreign key ihlali`)

  return {
    enabled: isTransportV2Enabled(),
    transport_revision: getTransportRevision(),
    legacy_writes_enabled: !isTransportV2Enabled(),
    ready: blockers.length === 0,
    blockers,
    readiness: {
      missing_tables: missingTables,
      foreign_key_violations: foreignKeyViolations,
      legacy_assignments: legacyAssignments,
      mirrored_assignments: mirroredAssignments,
      routes: db.prepare('SELECT COUNT(*) AS count FROM routes').get().count,
      stops: db.prepare('SELECT COUNT(*) AS count FROM pickup_points').get().count,
      vehicles: missingTables.includes('transport_vehicles')
        ? 0 : db.prepare('SELECT COUNT(*) AS count FROM transport_vehicles').get().count,
      drivers: missingTables.includes('transport_drivers')
        ? 0 : db.prepare('SELECT COUNT(*) AS count FROM transport_drivers').get().count,
      active_staff: db.prepare('SELECT COUNT(*) AS count FROM staff WHERE is_active=1').get().count,
      staff_without_stop: db.prepare(`
        SELECT COUNT(*) AS count FROM staff WHERE is_active=1 AND pickup_point_id IS NULL
      `).get().count,
    },
  }
}

export function changeTransportV2Status(enabled) {
  const db = getDB()
  const status = getTransportV2Status()
  if (enabled && !status.ready) {
    const error = new Error('Transport V2 henüz etkinleştirilemez')
    error.status = 409
    error.details = status
    throw error
  }
  return db.transaction(() => {
    setTransportV2Enabled(enabled)
    bumpTransportRevision()
    return getTransportV2Status()
  })()
}

export function rejectLegacyTransportWrite(req, res, next) {
  if (!isTransportV2Enabled()) return next()
  return res.status(410).json({
    error: 'Legacy servis yazma akışı kapatıldı; V2 sefer uçlarını kullanın',
    code: 'TRANSPORT_V2_REQUIRED',
    transport_revision: getTransportRevision(),
  })
}
