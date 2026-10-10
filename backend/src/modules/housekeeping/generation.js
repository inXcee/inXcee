import { getDB } from '../../shared/db/index.js'
import { logAudit } from '../../shared/audit.js'

// Günlük görev üretimi aç/kapa (10 Eki 2026): ekip temizliği kâğıtla takip ederken
// cron her gün ~1000 görev üretip hiçbiri kapanmıyordu. Kapalıyken 05:50 cron'u
// görev üretmez; elle "Günlük görev üret" (POST /tasks/generate-daily) çalışmaya devam eder.
export const DAILY_GENERATION_KEY = 'housekeeping_daily_generation'

export function isDailyGenerationEnabled() {
  const row = getDB().prepare('SELECT value FROM system_settings WHERE key=?').get(DAILY_GENERATION_KEY)
  return row?.value !== 'off'
}

export function setDailyGenerationEnabled(enabled, userId = null) {
  const value = enabled ? 'on' : 'off'
  getDB().prepare(`
    INSERT INTO system_settings(key, value) VALUES(?, ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')
  `).run(DAILY_GENERATION_KEY, value)
  logAudit(userId, 'housekeeping_generation_toggle', 'housekeeping', null, value)
  return getDailyGenerationStatus()
}

export function getDailyGenerationStatus() {
  const row = getDB().prepare('SELECT value, updated_at FROM system_settings WHERE key=?').get(DAILY_GENERATION_KEY)
  return { enabled: row?.value !== 'off', updated_at: row?.updated_at || null }
}

// Hiç dokunulmamış (yapılmamış, atlanmamış, fotoğrafı/değerlendirmesi olmayan) eski görevleri
// arşiv tablosuna taşır. `before` = YYYY-MM-DD; o günden ÖNCEKİ görevler (bugün hariç) taşınır.
export function archiveUntouchedTasks(before, userId = null) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(before))) throw new Error('Tarih YYYY-MM-DD olmalı')
  const db = getDB()
  const where = `
    completed_at IS NULL AND COALESCE(skipped,0)=0 AND photo_url IS NULL
    AND DATE(scheduled_at) < ?
    AND NOT EXISTS (SELECT 1 FROM cleaning_task_photos p WHERE p.task_id=cleaning_tasks.id)
    AND NOT EXISTS (SELECT 1 FROM cleaning_task_reviews r WHERE r.task_id=cleaning_tasks.id)`
  const moved = db.transaction(() => {
    db.prepare(`
      INSERT INTO cleaning_tasks_archive(id, area, block, floor, task_type, scheduled_at, assigned_to, qr_location)
      SELECT id, area, block, floor, task_type, scheduled_at, assigned_to, qr_location
      FROM cleaning_tasks WHERE ${where}
    `).run(before)
    return db.prepare(`DELETE FROM cleaning_tasks WHERE ${where}`).run(before).changes
  })()
  logAudit(userId, 'housekeeping_archive_untouched', 'housekeeping', null, `${before} öncesi ${moved} görev`)
  return { moved, before }
}
