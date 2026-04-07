import * as q from './queries.js'
import { createNotification, broadcastOccupancy } from '../../shared/notifications/service.js'
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
export const signZimmetService         = q.signZimmet
export const zimmetService             = q.addZimmet
export const getPersonnelZimmetService = q.getPersonnelZimmet
export const returnZimmetService       = q.returnZimmet
export const returnAllZimmetService    = q.returnAllZimmet
export const getUnreturnedZimmetService = q.getUnreturnedZimmet

export function registerService(data, userId) {
  const existing = q.lookupPerson(data.tc_no, data.passport_no)
  if (existing) return { id: existing.id, existing: true }
  const id = q.insertPersonnel(data)
  createNotification({
    message: `Yeni personel kaydı: ${data.full_name}${data.company ? ' (' + data.company + ')' : ''}`,
    type: 'info',
    module: 'checkin',
    target_role: 'shift_supervisor',
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
  broadcastOccupancy()
  return bedNo
}
