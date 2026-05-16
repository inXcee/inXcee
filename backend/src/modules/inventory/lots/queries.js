import { getDB } from '../../../shared/db/index.js'

export function listLotsForItem(itemId) {
  return getDB().prepare(`
    SELECT l.*, s.name as supplier_name
    FROM inventory_lots l
    LEFT JOIN suppliers s ON s.id = l.supplier_id
    WHERE l.item_id = ?
    ORDER BY l.received_at DESC
  `).all(itemId)
}

export function setLotStatus(lotId, status) {
  const valid = ['active', 'depleted', 'expired', 'damaged']
  if (!valid.includes(status)) throw new Error('Gecersiz durum')
  const db = getDB()
  const lot = db.prepare('SELECT * FROM inventory_lots WHERE id=?').get(lotId)
  if (!lot) throw new Error('Lot bulunamadi')

  // Hasarli/expired isaretlenirse stoktan dus
  if ((status === 'damaged' || status === 'expired') && lot.status === 'active' && lot.quantity > 0) {
    const tx = db.transaction(() => {
      db.prepare('UPDATE inventory_lots SET status=?, quantity=0 WHERE id=?').run(status, lotId)
      const inv = db.prepare('SELECT quantity, item_name, unit FROM inventory WHERE id=?').get(lot.item_id)
      const newQty = Math.max(0, inv.quantity - lot.quantity)
      db.prepare("UPDATE inventory SET quantity=?, last_updated=datetime('now') WHERE id=?").run(newQty, lot.item_id)
      db.prepare(
        'INSERT INTO stock_movements(item_id,type,delta,quantity_after,reason,lot_id,created_by) VALUES(?,?,?,?,?,?,?)'
      ).run(lot.item_id, status === 'damaged' ? 'damage' : 'loss', -lot.quantity, newQty,
        `Lot ${status === 'damaged' ? 'hasarli' : 'SKT gecti'}: ${lot.lot_no || `#${lot.id}`}`,
        lotId, 1)
    })
    tx()
  } else {
    db.prepare('UPDATE inventory_lots SET status=? WHERE id=?').run(status, lotId)
  }
  return { ok: true }
}

// SKT gecmis active lotlari otomatik expired isaretle
export function expirePastLots() {
  const db = getDB()
  const due = db.prepare(`
    SELECT id FROM inventory_lots
    WHERE status = 'active' AND expiry_date IS NOT NULL AND expiry_date < date('now')
  `).all()
  for (const { id } of due) {
    try { setLotStatus(id, 'expired') } catch (e) { console.error('[expirePastLots]', id, e.message) }
  }
  return due.length
}

export function createLot(data) {
  const r = getDB().prepare(`
    INSERT INTO inventory_lots(item_id, lot_no, quantity, expiry_date, supplier_id, unit_cost)
    VALUES(?,?,?,?,?,?)
  `).run(data.item_id, data.lot_no || null, +data.quantity, data.expiry_date || null, data.supplier_id || null, +data.unit_cost || 0)
  return r.lastInsertRowid
}

export function listExpiring(daysAhead = 30) {
  return getDB().prepare(`
    SELECT l.*, i.item_name, i.unit, s.name as supplier_name,
      CAST(julianday(l.expiry_date) - julianday('now') AS INTEGER) as days_left
    FROM inventory_lots l
    JOIN inventory i ON i.id = l.item_id
    LEFT JOIN suppliers s ON s.id = l.supplier_id
    WHERE l.status = 'active'
      AND l.expiry_date IS NOT NULL
      AND l.expiry_date <= date('now', '+' || ? || ' days')
    ORDER BY l.expiry_date
  `).all(daysAhead)
}

// FIFO: track_lots=1 urunlerde stok cikisinda en eski active lot'tan tuket.
// Birden fazla lot tuketildiyse her birine ayri stock_movements yazar.
export function consumeFIFO(itemId, qtyToConsume, type, reason, userId) {
  const db = getDB()
  let remaining = qtyToConsume
  const consumed = []

  const lots = db.prepare(`
    SELECT * FROM inventory_lots
    WHERE item_id = ? AND status = 'active'
    ORDER BY received_at ASC, id ASC
  `).all(itemId)

  for (const lot of lots) {
    if (remaining <= 0) break
    const take = Math.min(lot.quantity, remaining)
    const newLotQty = lot.quantity - take
    const newStatus = newLotQty <= 0 ? 'depleted' : 'active'
    db.prepare('UPDATE inventory_lots SET quantity = ?, status = ? WHERE id = ?').run(newLotQty, newStatus, lot.id)

    const inv = db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(itemId)
    db.prepare(`
      INSERT INTO stock_movements(item_id, type, delta, quantity_after, reason, lot_id, created_by)
      VALUES(?, ?, ?, ?, ?, ?, ?)
    `).run(itemId, type, -take, inv.quantity, reason, lot.id, userId)

    consumed.push({ lot_id: lot.id, lot_no: lot.lot_no, qty: take })
    remaining -= take
  }

  return { consumed, remaining }
}
