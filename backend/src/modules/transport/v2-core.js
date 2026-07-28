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
