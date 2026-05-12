import { getDB } from '../../shared/db/index.js'

// Kullanıcının bildirim alabileceği modüller. Yeni bildirim modülü eklerken buraya ekleyin.
export const NOTIFICATION_MODULES = [
  { key: 'maintenance', label: 'Arıza/Bakım' },
  { key: 'laundry',     label: 'Çamaşırhane' },
  { key: 'housekeeping', label: 'Temizlik' },
  { key: 'discipline',  label: 'Disiplin' },
  { key: 'checkin',     label: 'Giriş/Çıkış' },
  { key: 'inventory',   label: 'Envanter' },
  { key: 'shifts',      label: 'Vardiya' },
  { key: 'sla',         label: 'SLA Uyarıları' },
  { key: 'announcement', label: 'Duyurular' },
  { key: 'system',      label: 'Sistem' },
  { key: 'room_history', label: 'Oda Değişikliği' },
]

export function getUserPreferencesService(userId) {
  const db = getDB()
  const rows = db.prepare(
    'SELECT module, enabled FROM notification_preferences WHERE user_id = ?'
  ).all(userId)
  const map = new Map(rows.map(r => [r.module, !!r.enabled]))

  return NOTIFICATION_MODULES.map(m => ({
    module: m.key,
    label: m.label,
    enabled: map.has(m.key) ? map.get(m.key) : true, // varsayılan açık
  }))
}

export function setUserPreferencesService(userId, prefs) {
  if (!Array.isArray(prefs)) return { error: 'Geçersiz format', status: 400 }
  const validKeys = new Set(NOTIFICATION_MODULES.map(m => m.key))
  const db = getDB()
  const upsert = db.prepare(`
    INSERT INTO notification_preferences(user_id, module, enabled, updated_at)
    VALUES(?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, module) DO UPDATE SET enabled=excluded.enabled, updated_at=datetime('now')
  `)
  const tx = db.transaction((items) => {
    for (const p of items) {
      if (!validKeys.has(p.module)) continue
      upsert.run(userId, p.module, p.enabled ? 1 : 0)
    }
  })
  tx(prefs)
  return { ok: true }
}

// Bir kullanıcının verilen modül için bildirim alıp almadığını kontrol et
// (legacy — in_app kanalına denk)
export function isNotificationEnabledForUser(userId, module) {
  return isChannelEnabledForUser(userId, module, 'in_app', 'info')
}

// ── A→Z Faz 5: v2 tercih sistemi ─────────────────────────────────────────────

export const NOTIFICATION_CHANNELS = ['in_app', 'desktop', 'push', 'whatsapp']
export const SEVERITY_RANK = { info: 0, warning: 1, critical: 2 }

// Açık v2 tercih satırını döner (yoksa null) — explicit-opt-in kontrolü için
export function getChannelPreferenceRow(userId, module, channel) {
  if (!userId || !module || !channel) return null
  const db = getDB()
  try {
    return db.prepare(`
      SELECT enabled, min_severity FROM notification_preferences_v2
      WHERE user_id=? AND module=? AND channel=?
    `).get(userId, module, channel) || null
  } catch { return null }
}

// channel için bu kullanıcının bu modülden bildirim alıp almadığını kontrol et
export function isChannelEnabledForUser(userId, module, channel, severity = 'info') {
  if (!module || !userId) return true
  const db = getDB()
  try {
    // V2 tercih var mı?
    const v2 = db.prepare(`
      SELECT enabled, min_severity FROM notification_preferences_v2
      WHERE user_id=? AND module=? AND channel=?
    `).get(userId, module, channel)
    if (v2) {
      if (!v2.enabled) return false
      if (SEVERITY_RANK[severity] < SEVERITY_RANK[v2.min_severity]) return false
      return true
    }
    // V2 yoksa eski tablo (in_app eşdeğeri)
    const v1 = db.prepare('SELECT enabled FROM notification_preferences WHERE user_id=? AND module=?').get(userId, module)
    if (v1) return !!v1.enabled
    return true // varsayılan açık
  } catch {
    return true
  }
}

// Sessiz saat kontrolü — true = bildirim baskılansın
export function isQuietHours(userId, severity = 'info') {
  if (!userId) return false
  const db = getDB()
  try {
    const row = db.prepare('SELECT * FROM notification_quiet_hours WHERE user_id=?').get(userId)
    if (!row || !row.enabled) return false
    if (severity === 'critical' && row.allow_critical) return false
    const now = new Date()
    const mins = now.getHours() * 60 + now.getMinutes()
    const { start_minute: s, end_minute: e } = row
    if (s === e) return false
    if (s < e) return mins >= s && mins < e
    // Gece aşırı: 22:00→08:00 gibi
    return mins >= s || mins < e
  } catch { return false }
}

export function getPreferencesV2Service(userId) {
  const db = getDB()
  const rows = db.prepare('SELECT module, channel, enabled, min_severity FROM notification_preferences_v2 WHERE user_id=?').all(userId)
  const map = new Map()
  for (const r of rows) map.set(`${r.module}|${r.channel}`, r)
  // Eski v1'i de matrix'e yedir (in_app)
  const v1Rows = db.prepare('SELECT module, enabled FROM notification_preferences WHERE user_id=?').all(userId)
  const v1Map = new Map(v1Rows.map(r => [r.module, !!r.enabled]))
  // Tüm modüller × kanallar için varsayılan açık
  const result = []
  for (const m of NOTIFICATION_MODULES) {
    for (const ch of NOTIFICATION_CHANNELS) {
      const key = `${m.key}|${ch}`
      const row = map.get(key)
      const defaultEnabled = v1Map.has(m.key) && ch === 'in_app' ? v1Map.get(m.key) : true
      result.push({
        module: m.key, label: m.label,
        channel: ch,
        enabled: row ? !!row.enabled : defaultEnabled,
        min_severity: row?.min_severity || 'info',
      })
    }
  }
  return result
}

export function setPreferencesV2Service(userId, prefs) {
  if (!Array.isArray(prefs)) return { error: 'Geçersiz format', status: 400 }
  const validMods = new Set(NOTIFICATION_MODULES.map(m => m.key))
  const validChans = new Set(NOTIFICATION_CHANNELS)
  const validSev = new Set(Object.keys(SEVERITY_RANK))
  const db = getDB()
  const upsert = db.prepare(`
    INSERT INTO notification_preferences_v2(user_id, module, channel, enabled, min_severity, updated_at)
    VALUES(?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, module, channel) DO UPDATE SET
      enabled=excluded.enabled,
      min_severity=excluded.min_severity,
      updated_at=datetime('now')
  `)
  const tx = db.transaction((items) => {
    for (const p of items) {
      if (!validMods.has(p.module) || !validChans.has(p.channel)) continue
      const sev = validSev.has(p.min_severity) ? p.min_severity : 'info'
      upsert.run(userId, p.module, p.channel, p.enabled ? 1 : 0, sev)
    }
  })
  tx(prefs)
  return { ok: true }
}

export function getQuietHoursService(userId) {
  const db = getDB()
  const row = db.prepare('SELECT start_minute, end_minute, enabled, allow_critical FROM notification_quiet_hours WHERE user_id=?').get(userId)
  return row || { start_minute: 22*60, end_minute: 8*60, enabled: 0, allow_critical: 1 }
}

export function setQuietHoursService(userId, { start_minute, end_minute, enabled, allow_critical }) {
  const s = Math.max(0, Math.min(1439, parseInt(start_minute, 10) || 0))
  const e = Math.max(0, Math.min(1439, parseInt(end_minute, 10) || 0))
  const db = getDB()
  db.prepare(`
    INSERT INTO notification_quiet_hours(user_id, start_minute, end_minute, enabled, allow_critical, updated_at)
    VALUES(?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      start_minute=excluded.start_minute,
      end_minute=excluded.end_minute,
      enabled=excluded.enabled,
      allow_critical=excluded.allow_critical,
      updated_at=datetime('now')
  `).run(userId, s, e, enabled ? 1 : 0, allow_critical ? 1 : 0)
  return { ok: true }
}
