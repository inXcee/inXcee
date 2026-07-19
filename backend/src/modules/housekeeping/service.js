import * as q from './queries.js'
import { createNotification } from '../../shared/notifications/service.js'
import { EVENT_KINDS } from '../../shared/notifications/events.js'
import { logAudit } from '../../shared/audit.js'
import {
  cleanupHousekeepingPhotos,
  getHousekeepingPhotoRetentionDays,
  setHousekeepingPhotoRetentionDays,
  removeHousekeepingPhotoFile,
} from './photo-retention.js'

export const generateDailyTasksService  = q.generateDailyTasks
export const getTasksService            = q.getTasks
export const getDNDRoomsService         = q.getDNDRooms

export const getFloorTaskPreviewService = q.getFloorTaskPreview
export const getTaskHistoryService       = q.getTaskHistory

export function getPhotoOverviewService(filters = {}) {
  const retentionDays = getHousekeepingPhotoRetentionDays()
  const periodDays = Math.max(1, Math.min(retentionDays, Number(filters.days) || retentionDays))
  const items = q.getPhotoOverview({ ...filters, days: periodDays })
  const summary = items.reduce((totals, item) => {
    totals.total++
    if (item.skipped) totals.skipped++
    else if (item.completed_at) {
      totals.completed++
      if (item.photo_url) totals.with_photo++
      else totals.without_photo++
    } else totals.pending++
    return totals
  }, { total: 0, completed: 0, with_photo: 0, without_photo: 0, pending: 0, skipped: 0 })
  return { retention_days: retentionDays, period_days: periodDays, summary, items }
}

export function getPhotoRetentionPolicyService() {
  return { retention_days: getHousekeepingPhotoRetentionDays(), options: [3, 7] }
}

export function setPhotoRetentionPolicyService(days, userId) {
  const retentionDays = setHousekeepingPhotoRetentionDays(days)
  logAudit(userId, 'photo_retention_update', 'housekeeping', null, `${retentionDays} gün`)
  return { retention_days: retentionDays, options: [3, 7] }
}

export function cleanupHousekeepingPhotosService(options) {
  return cleanupHousekeepingPhotos(options)
}

export function completeFloorTasksService(block, floor, date, userId) {
  const count = q.completeFloorTasks(block, floor, date, userId)
  logAudit(userId, 'floor_complete', 'housekeeping', null, `${block} Kat ${floor} - ${date} (${count} görev)`)
  createNotification({
    message: `🧹 ${block} Kat ${floor} tüm temizlikler tamamlandı (${count} görev)`,
    event_kind: EVENT_KINDS.HOUSEKEEPING_TASK_COMPLETED,
    target_role: 'campus_manager',
  })
  return count
}

export function completeTaskService(taskId, userId, checklist, viaQr = false, photoUrl = null) {
  q.completeTask(taskId, userId, checklist, viaQr, photoUrl)
  logAudit(userId, 'task_complete', 'housekeeping', taskId, viaQr ? 'via_qr' : photoUrl ? 'with_photo' : null)
}

// ── Çoklu fotoğraf servisleri ─────────────────────────────────────────────────
export const listTaskPhotosService = q.listTaskPhotos

export function addTaskPhotosService(taskId, photos, userId) {
  const added = q.addTaskPhotos(taskId, photos, userId)
  if (added.length) logAudit(userId, 'task_photos_add', 'housekeeping', taskId, `${added.length} foto`)
  return added
}

export function updateTaskPhotoService(taskId, photoId, patch, userId) {
  const row = q.updateTaskPhoto(taskId, photoId, patch)
  if (!row) throw Object.assign(new Error('Fotoğraf bulunamadı'), { statusCode: 404 })
  logAudit(userId, 'task_photo_update', 'housekeeping', taskId, `#${photoId}`)
  return row
}

export function deleteTaskPhotoService(taskId, photoId, userId) {
  const row = q.deleteTaskPhoto(taskId, photoId)
  if (!row) throw Object.assign(new Error('Fotoğraf bulunamadı'), { statusCode: 404 })
  removeHousekeepingPhotoFile(row.photo_url)
  logAudit(userId, 'task_photo_delete', 'housekeeping', taskId, `#${photoId}`)
  return { ok: true }
}

export const uncompleteTaskService = q.uncompleteTask

export function skipTaskService(taskId, reason, userId) {
  q.skipTask(taskId, reason, userId)
  logAudit(userId, 'task_skip', 'housekeeping', taskId, reason)
}

export const unskipTaskService     = q.unskipTask

export const getRoomWithFaultsService = q.getRoomWithFaults
export const toggleNoCleanService     = q.toggleNoClean
export const updateRoomNotesService   = q.updateRoomNotes

export function reportFaultService(location, description, userId, priority, photoBefore) {
  const id = q.reportFault(location, description, userId, priority, photoBefore)
  logAudit(userId, 'fault_report', 'housekeeping', id, `${location}: ${description}`)
  createNotification({
    message: `⚠ Temizlik ekibinden arıza bildirimi: ${location} — ${description}`,
    event_kind: EVENT_KINDS.HOUSEKEEPING_DEFICIENCY,
    target_role: 'technical',
    entity_type: 'housekeeping_fault', entity_id: id,
  })
  return id
}

export const getStaffService    = q.getStaff
export const createStaffService = q.createStaff
export const updateStaffService = q.updateStaff
export const deleteStaffService = q.deleteStaff
