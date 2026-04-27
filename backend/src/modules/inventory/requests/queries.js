import { getDB } from '../../../shared/db/index.js'

export function listRequests({ status, requesterId } = {}) {
  const db = getDB()
  const where = []
  const params = []
  if (status) { where.push('r.status = ?'); params.push(status) }
  if (requesterId) { where.push('r.requester_id = ?'); params.push(requesterId) }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : ''
  return db.prepare(`
    SELECT r.*,
      i.item_name, i.unit, i.quantity as available_qty,
      u.username as requester_name, u.full_name as requester_full_name,
      a.username as approver_name,
      s.name as preferred_supplier_name
    FROM inventory_requests r
    JOIN inventory i ON i.id = r.item_id
    JOIN users u ON u.id = r.requester_id
    LEFT JOIN users a ON a.id = r.approved_by
    LEFT JOIN suppliers s ON s.id = r.preferred_supplier_id
    ${whereSql}
    ORDER BY r.created_at DESC
    LIMIT 200
  `).all(...params)
}

export function getById(id) {
  return getDB().prepare('SELECT * FROM inventory_requests WHERE id = ?').get(id)
}

export function create(data, userId) {
  const r = getDB().prepare(`
    INSERT INTO inventory_requests(requester_id, item_id, quantity, reason, preferred_supplier_id)
    VALUES(?,?,?,?,?)
  `).run(userId, data.item_id, +data.quantity, data.reason || null, data.preferred_supplier_id || null)
  return r.lastInsertRowid
}

export function approve(id, userId) {
  return getDB().prepare(`
    UPDATE inventory_requests
    SET status = 'approved', approved_by = ?, decision_at = datetime('now')
    WHERE id = ? AND status = 'pending'
  `).run(userId, id)
}

export function reject(id, reason, userId) {
  return getDB().prepare(`
    UPDATE inventory_requests
    SET status = 'rejected', approved_by = ?, decision_at = datetime('now'), rejection_reason = ?
    WHERE id = ? AND status = 'pending'
  `).run(userId, reason || null, id)
}

export function setFulfilled(id, checkoutId) {
  return getDB().prepare(`
    UPDATE inventory_requests
    SET status = 'fulfilled', fulfillment_checkout_id = ?
    WHERE id = ?
  `).run(checkoutId, id)
}

export function cancel(id, requesterId) {
  return getDB().prepare(`
    UPDATE inventory_requests
    SET status = 'cancelled'
    WHERE id = ? AND requester_id = ? AND status = 'pending'
  `).run(id, requesterId)
}
