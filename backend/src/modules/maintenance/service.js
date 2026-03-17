import * as q from './queries.js'
import { createNotification } from '../../shared/notifications/service.js'

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
