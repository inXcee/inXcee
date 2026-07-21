import { getDB } from '../../shared/db/index.js'

// Kayıtlı SMTP şifresi/anahtarı yerine dönen maske. İstemci bunu geri gönderirse
// "değiştirme" demektir; gerçek değer DB'de kalır.
export const SMTP_PASS_MASK = '●●●●'

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
      // Şifre/anahtar tarayıcıya ASLA açık gitmez; kayıtlıysa maske döner.
      // Maske geri gönderilirse setEmailSettings onu yok sayar (mevcut değer korunur).
      pass:  getSetting('smtp_pass') ? SMTP_PASS_MASK : '',
      pass_set: Boolean(getSetting('smtp_pass')),
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
    // pass yalnızca boş değilse ve maske değilse yaz (mevcut anahtar silinmesin)
    if (smtp.pass && smtp.pass !== SMTP_PASS_MASK) setSetting('smtp_pass', String(smtp.pass).trim())
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

// ── Faz 32: Özel e-posta şablonları (kullanıcı tanımlı) ──
export function listCustomTemplates() {
  return getDB().prepare('SELECT id, category, name, subject, body FROM email_templates ORDER BY id DESC').all()
}

export function createCustomTemplate({ category, name, subject, body }, userId) {
  return getDB().prepare(`
    INSERT INTO email_templates(category, name, subject, body, created_by) VALUES(?,?,?,?,?)
  `).run(category, name, subject || '', body || '', userId || null).lastInsertRowid
}

export function updateCustomTemplate(id, { category, name, subject, body }) {
  const r = getDB().prepare(`
    UPDATE email_templates SET category=?, name=?, subject=?, body=? WHERE id=?
  `).run(category, name, subject || '', body || '', id)
  return r.changes > 0
}

export function deleteCustomTemplate(id) {
  return getDB().prepare('DELETE FROM email_templates WHERE id=?').run(id).changes > 0
}

// ── Faz 33: Ek dosya arşivi ──
export function listAttachments() {
  return getDB().prepare(`
    SELECT id, name, category, original_name, mime, size, updated_at FROM email_attachments ORDER BY category, name
  `).all()
}

export function getAttachment(id) {
  return getDB().prepare('SELECT * FROM email_attachments WHERE id=?').get(id)
}

export function getAttachmentsByIds(ids) {
  if (!ids.length) return []
  const ph = ids.map(() => '?').join(',')
  return getDB().prepare(`SELECT * FROM email_attachments WHERE id IN (${ph})`).all(...ids)
}

export function createAttachment({ name, category, storedName, originalName, mime, size }, userId) {
  return getDB().prepare(`
    INSERT INTO email_attachments(name, category, stored_name, original_name, mime, size, created_by)
    VALUES(?,?,?,?,?,?,?)
  `).run(name, category || 'genel', storedName, originalName, mime || null, size || 0, userId || null).lastInsertRowid
}

export function updateAttachmentMeta(id, { name, category }) {
  return getDB().prepare(`
    UPDATE email_attachments SET name=?, category=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
  `).run(name, category || 'genel', id).changes > 0
}

export function replaceAttachmentFile(id, { storedName, originalName, mime, size }) {
  return getDB().prepare(`
    UPDATE email_attachments SET stored_name=?, original_name=?, mime=?, size=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
  `).run(storedName, originalName, mime || null, size || 0, id).changes > 0
}

export function deleteAttachment(id) {
  const row = getAttachment(id)
  if (row) getDB().prepare('DELETE FROM email_attachments WHERE id=?').run(id)
  return row
}

// Bilinen kişiler — hızlı alıcı otomatik tamamlama (yöneticiler + firma yetkilileri)
export function getKnownContacts() {
  const db = getDB()
  const contacts = new Map()
  const add = (email, label) => {
    if (!email || !email.includes('@')) return
    if (!contacts.has(email)) contacts.set(email, { email, label: label || email })
  }
  db.prepare("SELECT email, username FROM users WHERE email IS NOT NULL AND email != ''")
    .all().forEach(r => add(r.email, `${r.username} (yönetim)`))
  try {
    db.prepare("SELECT name, contact_email FROM companies WHERE contact_email IS NOT NULL AND contact_email != ''")
      .all().forEach(r => add(r.contact_email, r.name))
  } catch { /* companies tablosu/kolonu yoksa atla */ }
  return [...contacts.values()]
}
