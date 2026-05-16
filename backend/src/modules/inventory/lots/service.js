import * as q from './queries.js'
import { logAudit } from '../../../shared/audit.js'

export const list = (itemId) => q.listLotsForItem(itemId)
export const expiring = (days) => q.listExpiring(days)
export const expirePastLots = () => q.expirePastLots()

export function create(data, userId) {
  if (!data?.item_id || !data?.quantity || +data.quantity <= 0) throw new Error('Urun ve miktar gerekli')
  const id = q.createLot(data, userId)
  logAudit(userId, 'lot_create', 'inventory', id, `${data.item_id} x${data.quantity}`)
  return id
}

export function setStatus(lotId, status, userId) {
  const r = q.setLotStatus(lotId, status)
  logAudit(userId, 'lot_status_change', 'inventory', lotId, `-> ${status}`)
  return r
}
