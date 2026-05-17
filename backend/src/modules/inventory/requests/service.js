import * as q from './queries.js'
import { getDB } from '../../../shared/db/index.js'
import { logAudit } from '../../../shared/audit.js'
import { createNotification } from '../../../shared/notifications/service.js'

export const list = (opts) => q.listRequests(opts)

export function create(data, userId) {
  if (!data?.item_id || !data?.quantity || +data.quantity <= 0) throw new Error('Urun ve miktar gerekli')
  const item = getDB().prepare('SELECT item_name FROM inventory WHERE id = ?').get(data.item_id)
  if (!item) throw new Error('Urun bulunamadi')
  const id = q.create(data, userId)
  logAudit(userId, 'inv_request_create', 'inventory', id, `${item.item_name} x${data.quantity}`)
  createNotification({
    message: `Yeni malzeme talebi: ${item.item_name} x${data.quantity}`,
    type: 'info', module: 'inventory', target_role: 'campus_manager',
  })
  return id
}

export function approve(id, userId) {
  const req = q.getById(id)
  if (!req) throw new Error('Talep bulunamadi')
  if (req.status !== 'pending') throw new Error('Sadece bekleyen talep onaylanabilir')
  const r = q.approve(id, userId)
  if (r.changes === 0) throw new Error('Onay basarisiz')
  logAudit(userId, 'inv_request_approve', 'inventory', id, '')
  createNotification({
    message: 'Malzeme talebiniz onaylandi',
    type: 'info', module: 'inventory', target_user_id: req.requester_id,
  })
}

export function reject(id, reason, userId) {
  const req = q.getById(id)
  if (!req) throw new Error('Talep bulunamadi')
  if (req.status !== 'pending') throw new Error('Sadece bekleyen talep reddedilebilir')
  const r = q.reject(id, reason, userId)
  if (r.changes === 0) throw new Error('Red basarisiz')
  logAudit(userId, 'inv_request_reject', 'inventory', id, reason || '')
  createNotification({
    message: `Malzeme talebiniz reddedildi${reason ? `: ${reason}` : ''}`,
    type: 'warning', module: 'inventory', target_user_id: req.requester_id,
  })
}

export function fulfill(id, staffId, userId) {
  const db = getDB()
  const req = q.getById(id)
  if (!req) throw new Error('Talep bulunamadi')
  if (req.status !== 'approved') throw new Error('Sadece onayli talep teslim edilebilir')
  if (!staffId) throw new Error('AVS personeli sec')
  const staff = db.prepare('SELECT id FROM staff WHERE id=? AND is_active=1').get(staffId)
  if (!staff) throw new Error('AVS personeli bulunamadi veya pasif')

  const inv = db.prepare('SELECT * FROM inventory WHERE id = ?').get(req.item_id)
  if (!inv) throw new Error('Urun bulunamadi')
  if (inv.quantity < req.quantity) throw new Error('Yetersiz stok')

  let checkoutId
  const tx = db.transaction(() => {
    const newQty = inv.quantity - req.quantity
    db.prepare("UPDATE inventory SET quantity = ?, last_updated = datetime('now') WHERE id = ?").run(newQty, inv.id)

    const co = db.prepare(`
      INSERT INTO inventory_checkouts(item_id, staff_id, quantity, note, request_id, created_by)
      VALUES(?,?,?,?,?,?)
    `).run(inv.id, staffId, req.quantity, `Talep #${id}`, id, userId)
    checkoutId = co.lastInsertRowid

    db.prepare(`
      INSERT INTO stock_movements(item_id, type, delta, quantity_after, reason, created_by)
      VALUES(?, 'request_fulfill', ?, ?, ?, ?)
    `).run(inv.id, -req.quantity, newQty, `Talep #${id} karsilandi`, userId)

    q.setFulfilled(id, checkoutId)
  })
  tx()

  logAudit(userId, 'inv_request_fulfill', 'inventory', id, `Cikti: ${req.quantity} ${inv.unit}`)
  createNotification({
    message: `Malzeme talebiniz karsilandi (${req.quantity} ${inv.unit})`,
    type: 'info', module: 'inventory', target_user_id: req.requester_id,
  })
  return { checkout_id: checkoutId }
}

export function cancel(id, userId) {
  const req = q.getById(id)
  if (!req) throw new Error('Talep bulunamadi')
  if (req.requester_id !== userId) throw new Error('Sadece talep sahibi iptal edebilir')
  const r = q.cancel(id, userId)
  if (r.changes === 0) throw new Error('Sadece bekleyen talep iptal edilebilir')
  logAudit(userId, 'inv_request_cancel', 'inventory', id, '')
}
