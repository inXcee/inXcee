import * as q from './queries.js'
import { createNotification, broadcastOccupancy } from '../../shared/notifications/service.js'
import { EVENT_KINDS } from '../../shared/notifications/events.js'
import { logAudit } from '../../shared/audit.js'
import { getDB } from '../../shared/db/index.js'

export const lookupService             = q.lookupPerson
export const searchByNameService       = q.searchByName
export const searchResidentsService    = q.searchResidents
export const suggestRoomService        = q.suggestRoom
export const getCompanyDistributionService = q.getCompanyDistribution
export const getJobDistributionService = q.getJobDistribution
export const getCompanyPersonnelService = q.getCompanyPersonnel
export const setShiftService           = q.setShift
export const getCompanySuggestionsService = q.getCompanySuggestions
export const getJobSuggestionsService  = q.getJobSuggestions
export const getAvailableRoomsService  = q.getAvailableRooms
export const getOverallStatsService    = q.getOverallStats
export const getPersonnelZimmetService = q.getPersonnelZimmet
export const returnZimmetService       = q.returnZimmet
export const returnAllZimmetService    = q.returnAllZimmet
export const getUnreturnedZimmetService = q.getUnreturnedZimmet

export function zimmetService(personnelId, items, userId) {
  q.addZimmet(personnelId, items, userId)
  const itemCount = Array.isArray(items) ? items.length : 0
  logAudit(userId, 'zimmet_create', 'checkin', personnelId, `${itemCount} kalem zimmet eklendi`)
}

export function signZimmetService(personnelId, signature, userId) {
  q.signZimmet(personnelId, signature)
  logAudit(userId, 'zimmet_sign', 'checkin', personnelId, 'zimmet imza alindi')
}

export function registerService(data, userId) {
  const existing = q.lookupPerson(data.tc_no, data.passport_no)
  if (existing) return { id: existing.id, existing: true }
  const id = q.insertPersonnel({ ...data, created_by: userId })
  createNotification({
    message: `👤 Yeni personel kaydı: ${data.full_name}${data.company ? ' (' + data.company + ')' : ''}`,
    event_kind: EVENT_KINDS.CHECKIN_DONE,
    target_role: 'shift_supervisor',
    entity_type: 'personnel', entity_id: id,
  })
  logAudit(userId, 'personnel_register', 'checkin', id, data.full_name)
  return { id, existing: false }
}

export function updatePhotoService(personnelId, photoUrl) {
  const db = getDB()
  db.prepare('UPDATE personnel SET photo_url=? WHERE id=?').run(photoUrl, personnelId)
}

export function assignRoomService(personnelId, roomId, userId) {
  const db = getDB()
  const person = db.prepare('SELECT full_name FROM personnel WHERE id=?').get(personnelId)
  const room = db.prepare('SELECT block, room_no FROM rooms WHERE id=?').get(roomId)
  const bedNo = q.assignRoom(personnelId, roomId, userId)
  logAudit(userId, 'room_assign', 'checkin', personnelId, `${person?.full_name || '?'} → ${room?.block || '?'}-${room?.room_no || '?'} yatak ${bedNo}`)
  createNotification({
    message: `🛏 Oda atama: ${person?.full_name || '?'} → ${room?.block || '?'}-${room?.room_no || '?'} yatak ${bedNo}`,
    event_kind: EVENT_KINDS.ROOM_HISTORY_CHANGE,
    target_role: 'campus_manager',
    entity_type: 'personnel', entity_id: personnelId,
  })
  broadcastOccupancy()
  return bedNo
}
