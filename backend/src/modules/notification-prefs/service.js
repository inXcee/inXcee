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
export function isNotificationEnabledForUser(userId, module) {
  if (!module || !userId) return true
  const db = getDB()
  try {
    const row = db.prepare(
      'SELECT enabled FROM notification_preferences WHERE user_id = ? AND module = ?'
    ).get(userId, module)
    if (!row) return true // varsayılan açık
    return !!row.enabled
  } catch {
    return true // tablo yoksa veya hata → açık varsay
  }
}
