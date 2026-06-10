import * as q from './queries.js'
import { createNotification } from '../../shared/notifications/service.js'
import { EVENT_KINDS } from '../../shared/notifications/events.js'
import { logAudit } from '../../shared/audit.js'

export const generateDailyTasksService  = q.generateDailyTasks
export const getTasksService            = q.getTasks
export const getDNDRoomsService         = q.getDNDRooms

export const getFloorTaskPreviewService = q.getFloorTaskPreview
export const getTaskHistoryService       = q.getTaskHistory

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

export function completeTaskService(taskId, userId, checklist, viaQr = false) {
  q.completeTask(taskId, userId, checklist, viaQr)
  logAudit(userId, 'task_complete', 'housekeeping', taskId, viaQr ? 'via_qr' : null)
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
