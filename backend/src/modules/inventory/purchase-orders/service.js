import * as q from './queries.js'
import { logAudit } from '../../../shared/audit.js'
import { createNotification } from '../../../shared/notifications/service.js'

export const list = (status) => q.listPOs(status)
export const get = (id) => q.getPODetail(id)

export function create(data, userId) {
  if (!data?.supplier_id) throw new Error('Tedarikci secin')
  if (!Array.isArray(data.items) || data.items.length === 0) throw new Error('En az bir kalem gerekli')
  const r = q.createPO(data.supplier_id, data.expected_date, data.notes, data.items, userId)
  logAudit(userId, 'po_create', 'inventory', r.id, `${r.po_no} — ${data.items.length} kalem`)
  return r
}

export function changeStatus(id, status, userId) {
  q.setStatus(id, status)
  logAudit(userId, 'po_status', 'inventory', id, `Durum: ${status}`)
}

export function receive(id, items, userId) {
  if (!Array.isArray(items) || items.length === 0) throw new Error('En az bir kalem gerekli')
  const r = q.receivePO(id, items, userId)
  const po = q.getPODetail(id)
  logAudit(userId, 'po_receive', 'inventory', id, `${po.po_no} — durum: ${r.status}`)
  if (r.status === 'partial_received') {
    createNotification({
      message: `PO kismen teslim: ${po.po_no} (${po.supplier_name})`,
      type: 'info', module: 'inventory', target_role: 'campus_manager',
    })
  }
  return r
}

export function draftFromLowStock(userId) {
  const r = q.draftFromLowStock(userId)
  if (r.created?.length > 0) {
    logAudit(userId, 'po_draft_auto', 'inventory', null, `${r.created.length} taslak PO`)
  }
  return r
}
