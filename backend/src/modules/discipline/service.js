import * as q from './queries.js'
import { logAudit } from '../../shared/audit.js'

export const searchPersonnelService     = q.searchPersonnel
export const getPersonnelByIdService    = q.getPersonnelById
export const getRecordsService          = q.getRecords
export const getBlacklistedService      = q.getBlacklisted
export const getStatsService            = q.getStats
export const getReasonSuggestionsService = q.getReasonSuggestions

export function addRecordService(data) {
  const result = q.addRecord(data)
  logAudit(data.createdBy, 'discipline_card', 'discipline', data.personnelId, `${data.cardType} kart — ${data.reason}`)
  return result
}

export function deleteRecordService(recordId, userId) {
  q.deleteRecord(recordId)
  logAudit(userId, 'discipline_delete', 'discipline', recordId)
}

export function addToBlacklistService(personnelId, reason, userId) {
  q.addToBlacklist(personnelId, reason, userId)
  logAudit(userId, 'blacklist_add', 'discipline', personnelId, reason)
}

export function removeFromBlacklistService(personnelId, userId) {
  q.removeFromBlacklist(personnelId)
  logAudit(userId, 'blacklist_remove', 'discipline', personnelId)
}
