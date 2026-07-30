import fs from 'fs'
import path from 'path'
import { getDB } from '../../shared/db/index.js'

// Çamaşır fotoğrafları KANIT niteliğindedir (hasar/istisna itirazı) — referanslı
// dosyalar hiç silinmez. Temizlik yalnızca YETİM dosyaları hedefler: yükleme
// tamamlandı ama kayıt oluşmadı (istek yarıda kesildi, doğrulama 400 döndü,
// torba silindi). Bunlar hiçbir tabloda görünmediği için başka türlü birikir.
export const LAUNDRY_ORPHAN_RETENTION_DAYS = 7

// KISIT: yalnızca `laundry-` önekli dosyalar taranır. Önek eklenmeden önce
// yüklenmiş eski dosyalar diğer modüllerin dosyalarından güvenle ayırt
// edilemediği için kapsam dışıdır (tek seferlik elle temizlik gerekir).
const PREFIX = 'laundry-'

function localUploadPath(photoUrl, uploadsDir) {
  if (!photoUrl || !photoUrl.startsWith('/uploads/')) return null
  const filename = path.basename(decodeURIComponent(photoUrl.slice('/uploads/'.length)))
  if (!filename) return null
  const root = path.resolve(uploadsDir)
  const candidate = path.resolve(root, filename)
  if (path.dirname(candidate) !== root) return null
  return candidate
}

// Tek bir yükleme dosyasını güvenli şekilde diskten kaldırır (uploads dizini dışına çıkamaz).
export function removeLaundryPhotoFile(photoUrl, uploadsDir = process.env.UPLOADS_DIR || 'uploads') {
  const filePath = localUploadPath(photoUrl, uploadsDir)
  if (!filePath) return false
  try {
    if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); return true }
  } catch { /* ignore */ }
  return false
}

// Referans kaynakları: torba giriş fotosu, kıyafet istisnası, hasar kaydı.
function referencedFileNames(db) {
  const names = new Set()
  const collect = (rows) => {
    for (const row of rows) {
      if (row.photo_url) names.add(path.basename(row.photo_url))
    }
  }
  collect(db.prepare('SELECT photo_url FROM laundry_items WHERE photo_url IS NOT NULL').all())
  collect(db.prepare('SELECT photo_url FROM laundry_garment_exceptions WHERE photo_url IS NOT NULL').all())
  collect(db.prepare('SELECT photo_url FROM laundry_damages WHERE photo_url IS NOT NULL').all())
  return names
}

export function cleanupLaundryPhotos({
  uploadsDir = process.env.UPLOADS_DIR || 'uploads',
  now = new Date(),
  retentionDays = LAUNDRY_ORPHAN_RETENTION_DAYS,
} = {}) {
  const days = Number(retentionDays) > 0 ? Number(retentionDays) : LAUNDRY_ORPHAN_RETENTION_DAYS
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  const root = path.resolve(uploadsDir)
  const errors = []
  let orphanFilesDeleted = 0

  if (!fs.existsSync(root)) {
    return { retention_days: days, cutoff: cutoff.toISOString(), orphan_files_deleted: 0, errors }
  }

  const referenced = referencedFileNames(getDB())
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.startsWith(PREFIX)) continue
    if (referenced.has(entry.name)) continue
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

  return {
    retention_days: days,
    cutoff: cutoff.toISOString(),
    orphan_files_deleted: orphanFilesDeleted,
    errors,
  }
}
