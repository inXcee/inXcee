import * as q from './queries.js'
import { logAudit } from '../../../shared/audit.js'

export const list = (activeOnly) => q.listSuppliers(activeOnly)
export const get = (id) => q.getSupplierById(id)

export function create(data, userId) {
  if (!data?.name) throw new Error('Tedarikci adi gerekli')
  const id = q.createSupplier(data)
  logAudit(userId, 'supplier_create', 'inventory', id, data.name)
  return id
}

export function update(id, data, userId) {
  if (!data?.name) throw new Error('Tedarikci adi gerekli')
  const existing = q.getSupplierById(id)
  if (!existing) throw new Error('Tedarikci bulunamadi')
  q.updateSupplier(id, data)
  logAudit(userId, 'supplier_update', 'inventory', id, data.name)
}

export function remove(id, userId) {
  const existing = q.getSupplierById(id)
  if (!existing) throw new Error('Tedarikci bulunamadi')
  q.softDeleteSupplier(id)
  logAudit(userId, 'supplier_delete', 'inventory', id, existing.name)
}

export const priceHistory = (id, itemId) => q.getPriceHistory(id, itemId)
export const scorecard = (id) => q.getSupplierScorecard(id)
