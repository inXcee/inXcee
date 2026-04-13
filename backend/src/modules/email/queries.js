import { getDB } from '../../shared/db/index.js'

/** @returns {string|null} stored value, or null if key does not exist */
export function getSetting(key) {
  const db = getDB()
  const row = db.prepare('SELECT value FROM system_settings WHERE key=?').get(key)
  return row ? row.value : null
}

export function setSetting(key, value) {
  const db = getDB()
  db.prepare(`
    INSERT INTO system_settings(key, value) VALUES(?, ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')
  `).run(key, String(value))
}

export function getEmailSettings() {
  return {
    enabled: getSetting('email_enabled') === 'true',
    hour:    parseInt(getSetting('email_hour') ?? '7', 10),
    minute:  parseInt(getSetting('email_minute') ?? '0', 10),
    cc:      getSetting('email_cc') ?? '',
  }
}

export function setEmailSettings({ enabled, hour, minute, cc }) {
  setSetting('email_enabled', enabled ? 'true' : 'false')
  setSetting('email_hour',    String(hour))
  setSetting('email_minute',  String(minute))
  setSetting('email_cc',      cc ?? '')
}

export function getManagerEmails() {
  const db = getDB()
  return db.prepare(`
    SELECT email FROM users WHERE role='campus_manager' AND email IS NOT NULL AND email != ''
  `).all().map(r => r.email)
}
