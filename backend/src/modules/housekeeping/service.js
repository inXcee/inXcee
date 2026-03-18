import * as q from './queries.js'
import { createNotification } from '../../shared/notifications/service.js'
import { logAudit } from '../../shared/audit.js'

export const generateDailyTasksService  = q.generateDailyTasks
export const getTasksService            = q.getTasks
export const getDNDRoomsService         = q.getDNDRooms

export function completeFloorTasksService(block, floor, date, userId) {
  q.completeFloorTasks(block, floor, date, userId)
  logAudit(userId, 'floor_complete', 'housekeeping', null, `${block} Kat ${floor} - ${date}`)
  createNotification({
    message: `${block} Kat ${floor} tüm temizlikler tamamlandı`,
    type: 'info',
    module: 'housekeeping',
    target_role: 'campus_manager',
  })
}

export function completeTaskService(taskId, userId, checklist) {
  q.completeTask(taskId, userId, checklist)
  logAudit(userId, 'task_complete', 'housekeeping', taskId)
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
    message: `Temizlik ekibinden arıza bildirimi: ${location} — ${description}`,
    type: 'warning',
    module: 'housekeeping',
    target_role: 'technical',
  })
  return id
}

export const getStaffService    = q.getStaff
export const createStaffService = q.createStaff
export const updateStaffService = q.updateStaff
export const deleteStaffService = q.deleteStaff
