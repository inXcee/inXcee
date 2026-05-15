import * as q from './queries.js'
import { logAudit } from '../../shared/audit.js'
import { broadcastOccupancy } from '../../shared/notifications/service.js'

export function listActivePersonnelService(filters) {
  return q.listActivePersonnel(filters)
}

export function bulkCheckoutService(ids, userId) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { error: 'En az bir personel seçin', status: 400 }
  }
  if (ids.length > 100) {
    return { error: 'Tek seferde en fazla 100 personel', status: 400 }
  }
  const cleanIds = [...new Set(ids.map(Number).filter(Number.isInteger))]
  const result = q.bulkCheckoutTx(cleanIds)
  if (result.success.length > 0) {
    logAudit(userId, 'bulk_checkout', 'checkout', null, `${result.success.length} kisi cikis, ${result.skipped.length} atlanan`)
    try { broadcastOccupancy() } catch {}
  }
  return result
}
