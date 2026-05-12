import * as q from './queries.js'
import { logAudit } from '../../shared/audit.js'
import { createNotification } from '../../shared/notifications/service.js'
import { EVENT_KINDS } from '../../shared/notifications/events.js'
import { getDB } from '../../shared/db/index.js'

export const searchPersonnelService     = q.searchPersonnel
export const getPersonnelByIdService    = q.getPersonnelById
export function getRecordsService(personnelId, filters) { return q.getRecords(personnelId, filters) }
export const getBlacklistedService      = q.getBlacklisted
export function getStatsService(filters) { return q.getStats(filters) }
export const getReasonSuggestionsService = q.getReasonSuggestions

export function addRecordService(data) {
  const result = q.addRecord(data)
  logAudit(data.createdBy, 'discipline_card', 'discipline', data.personnelId, `${data.cardType} kart — ${data.reason}`)
  const person = getDB().prepare('SELECT full_name FROM personnel WHERE id=?').get(data.personnelId)
  const cardEmoji = data.cardType === 'red' ? '🟥' : data.cardType === 'yellow' ? '🟨' : '⚠'
  const sev = data.cardType === 'red' ? 'critical' : 'warning'
  createNotification({
    message: `${cardEmoji} Disiplin: ${person?.full_name || '?'} — ${data.reason}`,
    event_kind: EVENT_KINDS.DISCIPLINE_RECORD_CREATED,
    severity: sev,
    target_role: 'campus_manager',
    entity_type: 'discipline_record',
    entity_id: result?.id || data.personnelId,
  })
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
