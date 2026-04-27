import { getDB } from '../../shared/db/index.js'

export function getAllItems(category) {
  const db = getDB()
  let q = 'SELECT * FROM inventory'
  const params = []
  if (category) { q += ' WHERE category=?'; params.push(category) }
  q += ' ORDER BY category, item_name'
  return db.prepare(q).all(...params)
}

export function getAllItemsPaginated(category, limit, offset) {
  const db = getDB()
  let q = 'SELECT * FROM inventory'
  const params = []
  if (category) { q += ' WHERE category=?'; params.push(category) }
  q += ' ORDER BY category, item_name LIMIT ? OFFSET ?'
  params.push(limit, offset)
  return db.prepare(q).all(...params)
}

export function searchItems(query) {
  const db = getDB()
  return db.prepare("SELECT * FROM inventory WHERE item_name LIKE ? ORDER BY category, item_name")
    .all(`%${query}%`)
}

export function createItem(d) {
  const db = getDB()
  const r = db.prepare(
    `INSERT INTO inventory(item_name, quantity, unit, reorder_threshold, category, location, unit_price,
      sku, preferred_supplier_id, lead_time_days, safety_stock_days, track_lots, track_expiry, track_locations)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    d.item_name, d.quantity || 0, d.unit, d.reorder_threshold || 0, d.category, d.location || null, d.unit_price || 0,
    d.sku || null,
    d.preferred_supplier_id || null,
    d.lead_time_days ?? 7,
    d.safety_stock_days ?? 3,
    d.track_lots ? 1 : 0,
    d.track_expiry ? 1 : 0,
    d.track_locations ? 1 : 0,
  )
  return r.lastInsertRowid
}

export function updateItem(id, d) {
  const db = getDB()
  db.prepare(`
    UPDATE inventory SET item_name=?, quantity=?, unit=?, reorder_threshold=?, category=?, location=?, unit_price=?,
      sku=?, preferred_supplier_id=?, lead_time_days=?, safety_stock_days=?,
      track_lots=?, track_expiry=?, track_locations=?,
      last_updated=datetime('now')
    WHERE id=?
  `).run(
    d.item_name, d.quantity, d.unit, d.reorder_threshold || 0, d.category, d.location || null, d.unit_price || 0,
    d.sku || null,
    d.preferred_supplier_id || null,
    d.lead_time_days ?? 7,
    d.safety_stock_days ?? 3,
    d.track_lots ? 1 : 0,
    d.track_expiry ? 1 : 0,
    d.track_locations ? 1 : 0,
    id,
  )
}

export function deleteItem(id) {
  const db = getDB()
  db.prepare('DELETE FROM inventory WHERE id=?').run(id)
}

export function getItemById(id) {
  const db = getDB()
  return db.prepare('SELECT * FROM inventory WHERE id=?').get(id)
}

export function adjustQuantity(id, newQty) {
  const db = getDB()
  db.prepare("UPDATE inventory SET quantity=?, last_updated=datetime('now') WHERE id=?").run(newQty, id)
}

// ── Stock Movements ─────────────────────────────────────────────────────────

export function addMovement(itemId, type, delta, quantityAfter, reason, userId) {
  const db = getDB()
  db.prepare(
    'INSERT INTO stock_movements(item_id,type,delta,quantity_after,reason,created_by) VALUES(?,?,?,?,?,?)'
  ).run(itemId, type, delta, quantityAfter, reason || null, userId)
}

export function getMovements(itemId, limit = 50) {
  const db = getDB()
  return db.prepare(`
    SELECT sm.*, u.username, i.item_name, i.unit
    FROM stock_movements sm
    JOIN users u ON u.id = sm.created_by
    JOIN inventory i ON i.id = sm.item_id
    WHERE sm.item_id = ?
    ORDER BY sm.created_at DESC
    LIMIT ?
  `).all(itemId, limit)
}

export function getRecentMovements(limit = 30) {
  const db = getDB()
  return db.prepare(`
    SELECT sm.*, u.username, i.item_name, i.unit
    FROM stock_movements sm
    JOIN users u ON u.id = sm.created_by
    JOIN inventory i ON i.id = sm.item_id
    ORDER BY sm.created_at DESC
    LIMIT ?
  `).all(limit)
}

export function getStats() {
  const db = getDB()
  const totals = db.prepare(`
    SELECT
      COUNT(*) as total_items,
      SUM(CASE WHEN reorder_threshold > 0 AND quantity <= reorder_threshold THEN 1 ELSE 0 END) as low_stock,
      SUM(quantity * unit_price) as total_value,
      SUM(CASE WHEN quantity = 0 THEN 1 ELSE 0 END) as out_of_stock
    FROM inventory
  `).get()

  const byCategory = db.prepare(`
    SELECT category, COUNT(*) as count, SUM(quantity * unit_price) as value
    FROM inventory GROUP BY category ORDER BY value DESC
  `).all()

  const recentMovementCount = db.prepare(`
    SELECT COUNT(*) as count FROM stock_movements
    WHERE created_at >= datetime('now', '-24 hours')
  `).get()

  const activeCheckouts = db.prepare(`
    SELECT COUNT(*) as count FROM inventory_checkouts WHERE returned_at IS NULL
  `).get()

  return { ...totals, by_category: byCategory, movements_24h: recentMovementCount.count, active_checkouts: activeCheckouts.count }
}

export function bulkCount(items, userId) {
  const db = getDB()
  const results = { updated: 0, skipped: 0, errors: [] }
  const tx = db.transaction(() => {
    for (const { id, counted_qty } of items) {
      const item = db.prepare('SELECT * FROM inventory WHERE id=?').get(id)
      if (!item) { results.errors.push(`ID ${id}: Urun bulunamadi`); continue }
      const delta = counted_qty - item.quantity
      if (delta === 0) { results.skipped++; continue }
      db.prepare("UPDATE inventory SET quantity=?, last_updated=datetime('now') WHERE id=?").run(counted_qty, id)
      db.prepare(
        'INSERT INTO stock_movements(item_id,type,delta,quantity_after,reason,created_by) VALUES(?,?,?,?,?,?)'
      ).run(id, 'count', delta, counted_qty, `Sayim: ${item.quantity} -> ${counted_qty}`, userId)
      results.updated++
    }
  })
  tx()
  return results
}

// ── Personnel Checkout (Malzeme Teslim) ─────────────────────────────────────

export function searchPersonnel(query) {
  const db = getDB()
  return db.prepare(`
    SELECT p.id, p.full_name, p.company, p.job_title, p.phone_number,
      r.block, r.room_no
    FROM personnel p
    LEFT JOIN room_assignments ra ON ra.personnel_id = p.id AND ra.check_out_at IS NULL
    LEFT JOIN rooms r ON r.id = ra.room_id
    WHERE p.full_name LIKE ? OR p.company LIKE ? OR p.phone_number LIKE ?
    ORDER BY p.full_name
    LIMIT 20
  `).all(`%${query}%`, `%${query}%`, `%${query}%`)
}

export function checkoutItem(itemId, personnelId, qty, note, userId) {
  const db = getDB()
  const item = db.prepare('SELECT * FROM inventory WHERE id=?').get(itemId)
  if (!item) throw new Error('Urun bulunamadi')
  if (item.quantity < qty) throw new Error(`Yetersiz stok: ${item.quantity} ${item.unit} mevcut`)

  const newQty = item.quantity - qty
  const tx = db.transaction(() => {
    db.prepare("UPDATE inventory SET quantity=?, last_updated=datetime('now') WHERE id=?").run(newQty, itemId)
    db.prepare(
      'INSERT INTO inventory_checkouts(item_id,personnel_id,quantity,note,created_by) VALUES(?,?,?,?,?)'
    ).run(itemId, personnelId, qty, note || null, userId)
    db.prepare(
      'INSERT INTO stock_movements(item_id,type,delta,quantity_after,reason,created_by) VALUES(?,?,?,?,?,?)'
    ).run(itemId, 'out', -qty, newQty, `Teslim: ${note || '-'}`, userId)
  })
  tx()
  return { ok: true, quantity: newQty }
}

export function returnItem(checkoutId, returnQty, userId) {
  const db = getDB()
  const co = db.prepare(`
    SELECT ic.*, i.quantity as current_qty, i.item_name, i.unit
    FROM inventory_checkouts ic
    JOIN inventory i ON i.id = ic.item_id
    WHERE ic.id = ?
  `).get(checkoutId)
  if (!co) throw new Error('Teslim kaydı bulunamadi')
  if (co.returned_at) throw new Error('Bu teslim zaten iade edildi')

  const maxReturn = co.quantity - co.returned_qty
  const qty = returnQty || maxReturn
  if (qty > maxReturn) throw new Error(`Maksimum iade: ${maxReturn}`)

  const newQty = co.current_qty + qty
  const fullyReturned = (co.returned_qty + qty) >= co.quantity

  const tx = db.transaction(() => {
    db.prepare("UPDATE inventory SET quantity=?, last_updated=datetime('now') WHERE id=?").run(newQty, co.item_id)
    if (fullyReturned) {
      db.prepare("UPDATE inventory_checkouts SET returned_qty=quantity, returned_at=datetime('now') WHERE id=?").run(checkoutId)
    } else {
      db.prepare("UPDATE inventory_checkouts SET returned_qty=returned_qty+? WHERE id=?").run(qty, checkoutId)
    }
    db.prepare(
      'INSERT INTO stock_movements(item_id,type,delta,quantity_after,reason,created_by) VALUES(?,?,?,?,?,?)'
    ).run(co.item_id, 'in', qty, newQty, `Iade: ${co.item_name}`, userId)
  })
  tx()
  return { ok: true, quantity: newQty }
}

export function getActiveCheckouts() {
  const db = getDB()
  return db.prepare(`
    SELECT ic.id, ic.quantity, ic.returned_qty, ic.note, ic.checked_out_at,
      i.item_name, i.unit, i.category,
      p.full_name as personnel_name, p.company,
      r.block, r.room_no,
      u.username as given_by
    FROM inventory_checkouts ic
    JOIN inventory i ON i.id = ic.item_id
    JOIN personnel p ON p.id = ic.personnel_id
    LEFT JOIN room_assignments ra ON ra.personnel_id = p.id AND ra.check_out_at IS NULL
    LEFT JOIN rooms r ON r.id = ra.room_id
    JOIN users u ON u.id = ic.created_by
    WHERE ic.returned_at IS NULL
    ORDER BY ic.checked_out_at DESC
  `).all()
}

export function getCheckoutHistory(limit = 50) {
  const db = getDB()
  return db.prepare(`
    SELECT ic.id, ic.quantity, ic.returned_qty, ic.note, ic.checked_out_at, ic.returned_at,
      i.item_name, i.unit,
      p.full_name as personnel_name, p.company,
      u.username as given_by
    FROM inventory_checkouts ic
    JOIN inventory i ON i.id = ic.item_id
    JOIN personnel p ON p.id = ic.personnel_id
    JOIN users u ON u.id = ic.created_by
    ORDER BY ic.checked_out_at DESC
    LIMIT ?
  `).all(limit)
}

export function getPersonnelCheckouts(personnelId) {
  const db = getDB()
  return db.prepare(`
    SELECT ic.*, i.item_name, i.unit, i.category
    FROM inventory_checkouts ic
    JOIN inventory i ON i.id = ic.item_id
    WHERE ic.personnel_id = ? AND ic.returned_at IS NULL
    ORDER BY ic.checked_out_at DESC
  `).all(personnelId)
}

// ── Goods Receipts (Mal Giris) ──────────────────────────────────────────────

export function generateReceiptNo() {
  const db = getDB()
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const last = db.prepare(
    "SELECT receipt_no FROM goods_receipts WHERE receipt_no LIKE ? ORDER BY id DESC LIMIT 1"
  ).get(`MG-${today}-%`)
  const seq = last ? parseInt(last.receipt_no.split('-')[2]) + 1 : 1
  return `MG-${today}-${String(seq).padStart(3, '0')}`
}

export function createReceipt(supplier, invoiceNo, receiptDate, notes, items, userId) {
  const db = getDB()
  const receiptNo = generateReceiptNo()
  let totalValue = 0

  const tx = db.transaction(() => {
    // suppliers tablosunda var mi? yoksa olustur
    let supplierId = null
    if (supplier) {
      const existing = db.prepare('SELECT id FROM suppliers WHERE name = ?').get(supplier)
      if (existing) supplierId = existing.id
      else {
        const insRes = db.prepare('INSERT INTO suppliers(name) VALUES(?)').run(supplier)
        supplierId = insRes.lastInsertRowid
      }
    }

    const r = db.prepare(
      'INSERT INTO goods_receipts(receipt_no,supplier,supplier_id,invoice_no,receipt_date,notes,created_by) VALUES(?,?,?,?,?,?,?)'
    ).run(receiptNo, supplier, supplierId, invoiceNo || null, receiptDate, notes || null, userId)
    const receiptId = r.lastInsertRowid

    for (const item of items) {
      const inv = db.prepare('SELECT * FROM inventory WHERE id=?').get(item.item_id)
      if (!inv) throw new Error(`Urun bulunamadi: ID ${item.item_id}`)

      const qty = item.quantity
      const price = item.unit_price || inv.unit_price || 0
      totalValue += qty * price

      db.prepare(
        'INSERT INTO goods_receipt_items(receipt_id,item_id,quantity,unit_price) VALUES(?,?,?,?)'
      ).run(receiptId, item.item_id, qty, price)

      const newQty = inv.quantity + qty
      db.prepare("UPDATE inventory SET quantity=?, last_updated=datetime('now') WHERE id=?").run(newQty, item.item_id)

      if (price > 0 && price !== inv.unit_price) {
        db.prepare("UPDATE inventory SET unit_price=?, last_updated=datetime('now') WHERE id=?").run(price, item.item_id)
      }

      db.prepare(
        'INSERT INTO stock_movements(item_id,type,delta,quantity_after,reason,created_by) VALUES(?,?,?,?,?,?)'
      ).run(item.item_id, 'in', qty, newQty, `Mal giris: ${receiptNo} (${supplier})`, userId)

      // Tedarikci fiyat gecmisi (sadece supplier varsa)
      if (supplierId && price > 0) {
        db.prepare(
          'INSERT INTO supplier_prices(supplier_id,item_id,unit_price,source,source_ref_id) VALUES(?,?,?,?,?)'
        ).run(supplierId, item.item_id, price, 'goods_receipt', receiptId)
      }
    }

    db.prepare('UPDATE goods_receipts SET total_value=? WHERE id=?').run(totalValue, receiptId)
    return { id: receiptId, receipt_no: receiptNo, total_value: totalValue }
  })

  return tx()
}

export function getReceipts(limit = 50) {
  const db = getDB()
  return db.prepare(`
    SELECT gr.*, u.username as created_by_name,
      (SELECT COUNT(*) FROM goods_receipt_items WHERE receipt_id = gr.id) as item_count
    FROM goods_receipts gr
    JOIN users u ON u.id = gr.created_by
    ORDER BY gr.created_at DESC
    LIMIT ?
  `).all(limit)
}

export function getReceiptDetail(id) {
  const db = getDB()
  const receipt = db.prepare(`
    SELECT gr.*, u.username as created_by_name
    FROM goods_receipts gr
    JOIN users u ON u.id = gr.created_by
    WHERE gr.id = ?
  `).get(id)
  if (!receipt) return null

  const items = db.prepare(`
    SELECT gri.*, i.item_name, i.unit, i.category
    FROM goods_receipt_items gri
    JOIN inventory i ON i.id = gri.item_id
    WHERE gri.receipt_id = ?
    ORDER BY gri.id
  `).all(id)

  return { ...receipt, items }
}

export function deleteReceipt(id) {
  const db = getDB()
  db.prepare('DELETE FROM goods_receipts WHERE id=?').run(id)
}

// ── Forecast (Tahmin) ───────────────────────────────────────────────────────

export function getForecast() {
  const db = getDB()
  return db.prepare(`
    SELECT
      i.id,
      i.item_name,
      i.quantity,
      i.unit,
      i.category,
      ROUND(SUM(CASE WHEN sm.type='out' AND sm.delta < 0 THEN ABS(sm.delta) ELSE 0 END) / 14.0, 4) as daily_avg,
      CASE
        WHEN ROUND(SUM(CASE WHEN sm.type='out' AND sm.delta < 0 THEN ABS(sm.delta) ELSE 0 END) / 14.0, 4) > 0
        THEN ROUND(i.quantity / (ROUND(SUM(CASE WHEN sm.type='out' AND sm.delta < 0 THEN ABS(sm.delta) ELSE 0 END) / 14.0, 4)), 1)
        ELSE NULL
      END as days_left
    FROM inventory i
    LEFT JOIN stock_movements sm ON sm.item_id = i.id
      AND sm.created_at >= datetime('now', '-14 days')
    GROUP BY i.id
    HAVING daily_avg > 0 AND days_left <= 7
    ORDER BY days_left ASC
  `).all()
}

export function recentForecastNotify() {
  const db = getDB()
  return db.prepare(`
    SELECT id FROM audit_log
    WHERE action='inventory_forecast_notify'
      AND created_at >= datetime('now', '-24 hours')
    LIMIT 1
  `).get()
}
