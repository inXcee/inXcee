import fs from 'node:fs'
import path from 'node:path'
import { listWaybillPhotoUrls } from './queries.js'

const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_ORPHAN_GRACE_DAYS = 7
const DEFAULT_REPORT_RETENTION_DAYS = 730

function positiveDays(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function uploadsRoot(uploadsDir) {
  return path.resolve(uploadsDir || process.env.UPLOADS_DIR || 'uploads')
}

export function uploadFilePathFromUrl(url, { uploadsDir } = {}) {
  if (typeof url !== 'string' || !url.startsWith('/uploads/')) return null
  const relative = url.slice('/uploads/'.length)
  if (!relative || relative.includes('/') || relative.includes('\\') || path.basename(relative) !== relative) return null
  const root = uploadsRoot(uploadsDir)
  const candidate = path.resolve(root, relative)
  return path.dirname(candidate) === root ? candidate : null
}

export function removeUploadFile(url, options = {}) {
  const filePath = uploadFilePathFromUrl(url, options)
  if (!filePath) return { status: 'ignored', file_path: null }
  try {
    fs.unlinkSync(filePath)
    return { status: 'deleted', file_path: filePath }
  } catch (error) {
    if (error.code === 'ENOENT') return { status: 'missing', file_path: filePath }
    return { status: 'failed', file_path: filePath, error: error.message }
  }
}

function deleteExpiredFiles(dir, cutoffMs, predicate) {
  const result = { deleted: 0, errors: [] }
  if (!fs.existsSync(dir)) return result
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !predicate(entry.name)) continue
    const filePath = path.join(dir, entry.name)
    try {
      if (fs.statSync(filePath).mtimeMs >= cutoffMs) continue
      fs.unlinkSync(filePath)
      result.deleted += 1
    } catch (error) {
      result.errors.push({ file: entry.name, error: error.message })
    }
  }
  return result
}

export function cleanupWaterFiles({
  now = new Date(),
  uploadsDir,
  orphanGraceDays = positiveDays(process.env.WATER_UPLOAD_ORPHAN_GRACE_DAYS, DEFAULT_ORPHAN_GRACE_DAYS),
  reportRetentionDays = positiveDays(process.env.UPLOAD_REPORT_RETENTION_DAYS, DEFAULT_REPORT_RETENTION_DAYS),
  referencedUrls,
} = {}) {
  const root = uploadsRoot(uploadsDir)
  const nowMs = now instanceof Date ? now.getTime() : Number(now)
  const references = new Set((referencedUrls || listWaybillPhotoUrls())
    .map(url => uploadFilePathFromUrl(url, { uploadsDir: root }))
    .filter(Boolean)
    .map(filePath => path.basename(filePath)))

  const orphanResult = deleteExpiredFiles(
    root,
    nowMs - positiveDays(orphanGraceDays, DEFAULT_ORPHAN_GRACE_DAYS) * DAY_MS,
    name => name.startsWith('water-waybill-') && !references.has(name),
  )
  const reportResult = deleteExpiredFiles(
    path.join(root, 'reports'),
    nowMs - positiveDays(reportRetentionDays, DEFAULT_REPORT_RETENTION_DAYS) * DAY_MS,
    name => name.toLowerCase().endsWith('.pdf'),
  )

  return {
    orphan_files_deleted: orphanResult.deleted,
    reports_deleted: reportResult.deleted,
    errors: [...orphanResult.errors, ...reportResult.errors],
    orphan_grace_days: positiveDays(orphanGraceDays, DEFAULT_ORPHAN_GRACE_DAYS),
    report_retention_days: positiveDays(reportRetentionDays, DEFAULT_REPORT_RETENTION_DAYS),
  }
}
