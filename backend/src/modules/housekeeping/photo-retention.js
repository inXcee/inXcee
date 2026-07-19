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
  let orphanFilesDeleted = 0
  const errors = []
  const clearReference = db.prepare('UPDATE cleaning_tasks SET photo_url=NULL WHERE id=?')

  for (const item of expired) {
    const filePath = localUploadPath(item.photo_url, uploadsDir)
    try {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
        filesDeleted++
      }
      clearReference.run(item.id)
      referencesCleared++
    } catch (error) {
      errors.push({ task_id: item.id, message: error.message })
    }
  }

  const root = path.resolve(uploadsDir)
  if (fs.existsSync(root)) {
    const referencedNames = new Set(db.prepare(`
      SELECT photo_url FROM cleaning_tasks WHERE photo_url IS NOT NULL
    `).all().map(row => path.basename(row.photo_url)))
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
    orphan_files_deleted: orphanFilesDeleted,
    errors,
  }
}
