import { getDB } from '../../../shared/db/index.js'

export function listSuppliers(activeOnly = false) {
  const db = getDB()
  const where = activeOnly ? 'WHERE is_active = 1' : ''
  return db.prepare(`SELECT * FROM suppliers ${where} ORDER BY name`).all()
}

export function getSupplierById(id) {
  return getDB().prepare('SELECT * FROM suppliers WHERE id = ?').get(id)
}

export function getSupplierByName(name) {
  return getDB().prepare('SELECT * FROM suppliers WHERE name = ?').get(name)
}

export function createSupplier(data) {
  const db = getDB()
  const r = db.prepare(`
    INSERT INTO suppliers(name, tax_no, contact_name, phone, email, address, payment_term, default_lead_time_days, notes)
    VALUES(?,?,?,?,?,?,?,?,?)
  `).run(
    data.name,
    data.tax_no || null,
    data.contact_name || null,
    data.phone || null,
    data.email || null,
    data.address || null,
    data.payment_term || 'cash',
    data.default_lead_time_days ?? 7,
    data.notes || null,
  )
  return r.lastInsertRowid
}

export function updateSupplier(id, data) {
  return getDB().prepare(`
    UPDATE suppliers
    SET name=?, tax_no=?, contact_name=?, phone=?, email=?, address=?, payment_term=?, default_lead_time_days=?, notes=?, is_active=?
    WHERE id=?
  `).run(
    data.name,
    data.tax_no || null,
    data.contact_name || null,
    data.phone || null,
    data.email || null,
    data.address || null,
    data.payment_term || 'cash',
    data.default_lead_time_days ?? 7,
    data.notes || null,
    data.is_active ?? 1,
    id,
  )
}

export function softDeleteSupplier(id) {
  return getDB().prepare('UPDATE suppliers SET is_active = 0 WHERE id = ?').run(id)
}

export function getOrCreateSupplierByName(name) {
  if (!name) return null
  const existing = getSupplierByName(name)
  if (existing) return existing.id
  return createSupplier({ name })
}

export function recordSupplierPrice(supplierId, itemId, unitPrice, source, sourceRefId) {
  if (!supplierId || !itemId || !unitPrice || unitPrice <= 0) return
  return getDB().prepare(`
    INSERT INTO supplier_prices(supplier_id, item_id, unit_price, source, source_ref_id)
    VALUES(?,?,?,?,?)
  `).run(supplierId, itemId, unitPrice, source, sourceRefId || null)
}

export function getPriceHistory(supplierId, itemId) {
  const db = getDB()
  const params = [supplierId]
  let where = 'WHERE sp.supplier_id = ?'
  if (itemId) { where += ' AND sp.item_id = ?'; params.push(itemId) }
  return db.prepare(`
    SELECT sp.*, i.item_name, i.unit
    FROM supplier_prices sp
    JOIN inventory i ON i.id = sp.item_id
    ${where}
    ORDER BY sp.effective_from DESC
    LIMIT 200
  `).all(...params)
}

export function getSupplierScorecard(supplierId) {
  const db = getDB()
  const totalReceipts = db.prepare('SELECT COUNT(*) as n, COALESCE(SUM(total_value),0) as total FROM goods_receipts WHERE supplier_id = ?').get(supplierId)
  const lastReceipt = db.prepare('SELECT receipt_no, receipt_date, total_value FROM goods_receipts WHERE supplier_id = ? ORDER BY receipt_date DESC LIMIT 1').get(supplierId)
  const itemCount = db.prepare('SELECT COUNT(DISTINCT item_id) as n FROM supplier_prices WHERE supplier_id = ?').get(supplierId)
  return {
    receipt_count: totalReceipts.n,
    total_value: totalReceipts.total,
    last_receipt: lastReceipt || null,
    distinct_items: itemCount.n,
  }
}
