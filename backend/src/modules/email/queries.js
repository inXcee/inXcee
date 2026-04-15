import { getDB } from '../../shared/db/index.js'

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
  const daysRaw = getSetting('email_days') ?? '1,2,3,4,5'
  const sectionsRaw = getSetting('email_sections') ?? 'occupancy,housekeeping,maintenance,laundry,checkinout'
  return {
    enabled:  getSetting('email_enabled') === 'true',
    hour:     parseInt(getSetting('email_hour') ?? '7', 10),
    minute:   parseInt(getSetting('email_minute') ?? '0', 10),
    cc:       getSetting('email_cc') ?? '',
    days:     daysRaw.split(',').map(Number),
    sections: sectionsRaw.split(','),
    smtp: {
      host:  getSetting('smtp_host') ?? '',
      port:  parseInt(getSetting('smtp_port') ?? '587', 10) || 587,
      user:  getSetting('smtp_user') ?? '',
      pass:  getSetting('smtp_pass') ?? '',
      from:  getSetting('smtp_from') ?? '',
    },
  }
}

export function setEmailSettings({ enabled, hour, minute, cc, days, sections, smtp }) {
  setSetting('email_enabled', enabled ? 'true' : 'false')
  setSetting('email_hour',    String(hour))
  setSetting('email_minute',  String(minute))
  setSetting('email_cc',      cc ?? '')
  if (Array.isArray(days))    setSetting('email_days',     days.join(','))
  if (Array.isArray(sections)) setSetting('email_sections', sections.join(','))
  if (smtp) {
    if (smtp.host !== undefined) setSetting('smtp_host', smtp.host)
    if (smtp.port !== undefined) setSetting('smtp_port', smtp.port)
    if (smtp.user !== undefined) setSetting('smtp_user', smtp.user)
    if (smtp.from !== undefined) setSetting('smtp_from', smtp.from)
    // pass yalnızca boş değilse yaz (maskelenmiş "●●●●" göndermemek için)
    if (smtp.pass && smtp.pass !== '●●●●') setSetting('smtp_pass', smtp.pass)
  }
}

export function getManagerEmails() {
  const db = getDB()
  return db.prepare(`
    SELECT email FROM users WHERE role='campus_manager' AND email IS NOT NULL AND email != ''
  `).all().map(r => r.email)
}

export function logEmailSend({ recipients, status, errorMsg }) {
  const db = getDB()
  db.prepare(`
    INSERT INTO email_log(recipients, status, error_msg) VALUES(?,?,?)
  `).run(recipients, status, errorMsg || null)
}

export function getEmailLog(limit = 30) {
  return getDB().prepare(`
    SELECT id, sent_at, recipients, status, error_msg FROM email_log ORDER BY sent_at DESC LIMIT ?
  `).all(limit)
}
