import fs from 'fs'
import path from 'path'
import { getDB } from '../../shared/db/index.js'

export const HOUSEKEEPING_PHOTO_RETENTION_KEY = 'housekeeping_photo_retention_days'
export const HOUSEKEEPING_PHOTO_RETENTION_OPTIONS = [3, 7]

export function getHousekeepingPhotoRetentionDays() {
  const row = getDB().prepare('SELECT value FROM system_settings WHERE key=?')
    .get(HOUSEKEEPING_PHOTO_RETENTION_KEY)
  const value = Number(row?.value)
  return HOUSEKEEPING_PHOTO_RETENTION_OPTIONS.includes(value) ? value : 7
}

export function setHousekeepingPhotoRetentionDays(days) {
  const value = Number(days)
  if (!HOUSEKEEPING_PHOTO_RETENTION_OPTIONS.includes(value)) {
    throw new Error('Fotoğraf saklama süresi yalnızca 3 veya 7 gün olabilir')
  }
  getDB().prepare(`
    INSERT INTO system_settings(key, value) VALUES(?, ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')
  `).run(HOUSEKEEPING_PHOTO_RETENTION_KEY, String(value))
  return value
}

function localUploadPath(photoUrl, uploadsDir) {
  if (!photoUrl || !photoUrl.startsWith('/uploads/')) return null
  const filename = path.basename(decodeURIComponent(photoUrl.slice('/uploads/'.length)))
  if (!filename) return null
  const root = path.resolve(uploadsDir)
  const candidate = path.resolve(root, filename)
  if (path.dirname(candidate) !== root) return null
  return candidate
}

export function cleanupHousekeepingPhotos({
  uploadsDir = process.env.UPLOADS_DIR || 'uploads',
  now = new Date(),
  retentionDays = getHousekeepingPhotoRetentionDays(),
} = {}) {
  const days = HOUSEKEEPING_PHOTO_RETENTION_OPTIONS.includes(Number(retentionDays))
    ? Number(retentionDays)
    : getHousekeepingPhotoRetentionDays()
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  const cutoffSql = cutoff.toISOString().replace('T', ' ').slice(0, 19)
  const db = getDB()
  const expired = db.prepare(`
    SELECT id, photo_url
    FROM cleaning_tasks
    WHERE photo_url IS NOT NULL
      AND COALESCE(completed_at, scheduled_at) < ?
  `).all(cutoffSql)

  let filesDeleted = 0
  let referencesCleared = 0
  let taskPhotosDeleted = 0
  let orphanFilesDeleted = 0
  const errors = []
  const touchedTasks = new Set()
  const clearReference = db.prepare('UPDATE cleaning_tasks SET photo_url=NULL WHERE id=?')

  // 1) Eski tekil kapak referansları (geriye uyum: tablo satırı olmayan photo_url'ler)
  for (const item of expired) {
    const filePath = localUploadPath(item.photo_url, uploadsDir)
    try {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
        filesDeleted++
      }
      clearReference.run(item.id)
      referencesCleared++
      touchedTasks.add(item.id)
    } catch (error) {
      errors.push({ task_id: item.id, message: error.message })
    }
  }

  // 2) Çoklu fotoğraf tablosu: yükleme tarihine göre süresi dolanları sil (dosya + satır)
  const expiredPhotos = db.prepare(`
    SELECT id, task_id, photo_url FROM cleaning_task_photos WHERE uploaded_at < ?
  `).all(cutoffSql)
  const deletePhotoRow = db.prepare('DELETE FROM cleaning_task_photos WHERE id=?')
  for (const item of expiredPhotos) {
    const filePath = localUploadPath(item.photo_url, uploadsDir)
    try {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
        filesDeleted++
      }
      deletePhotoRow.run(item.id)
      taskPhotosDeleted++
      touchedTasks.add(item.task_id)
    } catch (error) {
      errors.push({ photo_id: item.id, message: error.message })
    }
  }

  // 3) Etkilenen görevlerin kapağını (photo_url) tablodaki kalan ilk fotoğrafa resenkronla
  const resyncCover = db.prepare(`
    UPDATE cleaning_tasks SET photo_url=(
      SELECT photo_url FROM cleaning_task_photos WHERE task_id=? ORDER BY sort_order, id LIMIT 1
    ) WHERE id=?
  `)
  for (const taskId of touchedTasks) {
    try { resyncCover.run(taskId, taskId) } catch (error) { errors.push({ task_id: taskId, message: error.message }) }
  }

  // 4) Yetim dosyalar: HİÇBİR referansı (kapak VEYA çoklu tablo) olmayan + süresi dolan housekeeping-* dosyaları
  const root = path.resolve(uploadsDir)
  if (fs.existsSync(root)) {
    const referencedNames = new Set([
      ...db.prepare('SELECT photo_url FROM cleaning_tasks WHERE photo_url IS NOT NULL').all().map(row => path.basename(row.photo_url)),
      ...db.prepare('SELECT photo_url FROM cleaning_task_photos').all().map(row => path.basename(row.photo_url)),
    ])
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.startsWith('housekeeping-')) continue
      if (referencedNames.has(entry.name)) continue
      const filePath = path.resolve(root, entry.name)
      try {
        if (fs.statSync(filePath).mtime < cutoff) {
          fs.unlinkSync(filePath)
          orphanFilesDeleted++
        }
      } catch (error) {
        errors.push({ file: entry.name, message: error.message })
      }
    }
  }

  return {
    retention_days: days,
    cutoff: cutoff.toISOString(),
    files_deleted: filesDeleted,
    references_cleared: referencesCleared,
    task_photos_deleted: taskPhotosDeleted,
    orphan_files_deleted: orphanFilesDeleted,
    errors,
  }
}
