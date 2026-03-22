import * as q from './queries.js'
import { createNotification } from '../../shared/notifications/service.js'
import { logAudit } from '../../shared/audit.js'

export function createRequestService(data) {
  const id = q.createRequest(data)
  createNotification({
    message: `Yeni arıza bildirimi: ${data.location} — ${data.description}`,
    type: data.priority === 'high' ? 'critical' : 'warning',
    module: 'maintenance',
    target_role: 'technical',
  })
  return id
}

export const getRequestsService = q.getRequests
export const getRequestByIdService = q.getRequestById

export function updateWaitReasonService(id, waitReason) {
  q.updateWaitReason(id, waitReason)
}

export function updateRequestPriorityService(id, priority) {
  q.updateRequestPriority(id, priority)
}

export function closeRequestService(id, photoUrl) {
  q.closeRequest(id, photoUrl)
  const req = q.getRequestById(id)
  createNotification({
    message: `Arıza #${id} (${req?.location || ''}) kapatıldı`,
    type: 'info',
    module: 'maintenance',
    target_role: 'campus_manager',
  })
}

export function reopenRequestService(id) {
  q.reopenRequest(id)
  createNotification({
    message: `Arıza #${id} yeniden açıldı`,
    type: 'warning',
    module: 'maintenance',
    target_role: 'technical',
  })
}

export function startRequestService(id, userId) {
  const changes = q.startRequest(id)
  if (!changes) throw new Error('Başlatılamadı — talep açık durumda değil')
  const req = q.getRequestById(id)
  createNotification({
    message: `Arıza #${id} (${req?.location || ''}) üzerinde çalışılmaya başlandı`,
    type: 'info',
    module: 'maintenance',
    target_role: 'technical',
  })
  logAudit(userId, 'start', 'maintenance', id, null)
}

export function updateStatusService(id, newStatus, userId) {
  const labels = { open: 'Açık', in_progress: 'Devam Ediyor', done: 'Tamamlandı' }
  const changes = q.updateStatus(id, newStatus)
  if (!changes) throw new Error('Durum güncellenemedi')
  const req = q.getRequestById(id)
  createNotification({
    message: `Arıza #${id} (${req?.location || ''}) durumu değişti: ${labels[newStatus] || newStatus}`,
    type: newStatus === 'done' ? 'info' : 'warning',
    module: 'maintenance',
    target_role: newStatus === 'done' ? 'campus_manager' : 'technical',
  })
  logAudit(userId, `status_${newStatus}`, 'maintenance', id, `Durum: ${labels[newStatus]}`)
}

export const deleteRequestService = q.deleteRequest
export const getStatsService = q.getStats
export const getLocationSuggestionsService = q.getLocationSuggestions

export const getTechniciansService = q.getTechnicians
export const getAvailableTechniciansService = q.getAvailableTechnicians
export const createTechnicianService = q.createTechnician
export const updateTechnicianService = q.updateTechnician
export const deleteTechnicianService = q.deleteTechnician

export const getCommentsService = q.getComments
export const addCommentService = q.addComment
