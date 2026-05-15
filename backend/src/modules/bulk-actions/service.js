import * as q from './queries.js'
import { logAudit } from '../../shared/audit.js'
import { broadcastOccupancy } from '../../shared/notifications/service.js'

export function listActivePersonnelService(filters) {
  return q.listActivePersonnel(filters)
}

export function bulkTransferService(ids, target, userId) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { error: 'En az bir personel seçin', status: 400 }
  }
  if (ids.length > 100) {
    return { error: 'Tek seferde en fazla 100 personel', status: 400 }
  }
  if (!target?.target_block && !target?.target_room_id) {
    return { error: 'Hedef blok veya oda gerekli', status: 400 }
  }
  const cleanIds = [...new Set(ids.map(Number).filter(Number.isInteger))]
  try {
    const result = q.bulkTransferTx(cleanIds, target, userId)
    if (result.success.length > 0) {
      logAudit(userId, 'bulk_transfer', 'room_assignments', null,
        `${result.success.length} kisi transfer (${target.target_room_id ? 'oda#'+target.target_room_id : 'blok '+target.target_block})`)
      try { broadcastOccupancy() } catch {}
    }
    return result
  } catch (e) {
    return { error: e.message, status: 400 }
  }
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
