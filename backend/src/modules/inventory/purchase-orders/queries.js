import { getDB } from '../../../shared/db/index.js'

export function generatePoNo() {
  const db = getDB()
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const seq = db.prepare(`SELECT COUNT(*)+1 as n FROM purchase_orders WHERE po_no LIKE ?`).get(`PO-${today}-%`).n
  return `PO-${today}-${String(seq).padStart(3, '0')}`
}

export function listPOs(status) {
  const db = getDB()
  const where = status ? 'WHERE po.status = ?' : ''
  const params = status ? [status] : []
  return db.prepare(`
    SELECT po.*, s.name as supplier_name, u.username as created_by_name,
      (SELECT COUNT(*) FROM purchase_order_items WHERE po_id = po.id) as item_count
    FROM purchase_orders po
    JOIN suppliers s ON s.id = po.supplier_id
    JOIN users u ON u.id = po.created_by
    ${where}
    ORDER BY po.created_at DESC
    LIMIT 200
  `).all(...params)
}

export function getPODetail(id) {
  const db = getDB()
  const po = db.prepare(`
    SELECT po.*, s.name as supplier_name, s.phone as supplier_phone, s.email as supplier_email,
           u.username as created_by_name
    FROM purchase_orders po
    JOIN suppliers s ON s.id = po.supplier_id
    JOIN users u ON u.id = po.created_by
    WHERE po.id = ?
  `).get(id)
  if (!po) return null
  po.items = db.prepare(`
    SELECT poi.*, i.item_name, i.unit
    FROM purchase_order_items poi
    JOIN inventory i ON i.id = poi.item_id
    WHERE poi.po_id = ?
  `).all(id)
  return po
}

export function createPO(supplierId, expectedDate, notes, items, userId) {
  const db = getDB()
  const poNo = generatePoNo()
  let total = 0
  const tx = db.transaction(() => {
    const r = db.prepare(`
      INSERT INTO purchase_orders(po_no, supplier_id, expected_date, notes, created_by)
      VALUES(?,?,?,?,?)
    `).run(poNo, supplierId, expectedDate || null, notes || null, userId)
    const poId = r.lastInsertRowid
    for (const it of items) {
      const qty = +it.qty_ordered
      const price = +it.unit_price || 0
      total += qty * price
      db.prepare(`
        INSERT INTO purchase_order_items(po_id, item_id, qty_ordered, unit_price)
        VALUES(?,?,?,?)
      `).run(poId, it.item_id, qty, price)
    }
    db.prepare('UPDATE purchase_orders SET total_value=? WHERE id=?').run(total, poId)
    return { id: poId, po_no: poNo, total_value: total }
  })
  return tx()
}

export function setStatus(id, status) {
  const db = getDB()
  const valid = ['draft', 'sent', 'partial_received', 'received', 'cancelled']
  if (!valid.includes(status)) throw new Error('Gecersiz durum')
  const extra = status === 'sent' ? ", sent_at = datetime('now')" : status === 'received' ? ", received_at = datetime('now')" : ''
  db.prepare(`UPDATE purchase_orders SET status = ?${extra} WHERE id = ?`).run(status, id)
}

export function receivePO(id, items, userId) {
  const db = getDB()
  const tx = db.transaction(() => {
    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id)
    if (!po) throw new Error('PO bulunamadi')
    if (po.status === 'received' || po.status === 'cancelled') throw new Error('Bu PO icin teslim alinamaz')

    for (const it of items) {
      const poItem = db.prepare('SELECT * FROM purchase_order_items WHERE id = ? AND po_id = ?').get(it.po_item_id, id)
      if (!poItem) throw new Error(`PO satiri bulunamadi: ${it.po_item_id}`)
      const qty = +it.qty_received_now
      if (!qty || qty <= 0) continue
      const remaining = poItem.qty_ordered - poItem.qty_received
      if (qty > remaining) throw new Error(`${poItem.item_id}: kalan ${remaining}, talep ${qty}`)

      // PO kalan miktari
      db.prepare('UPDATE purchase_order_items SET qty_received = qty_received + ? WHERE id = ?').run(qty, poItem.id)

      // Inventory + last unit_price guncelle
      const inv = db.prepare('SELECT * FROM inventory WHERE id = ?').get(poItem.item_id)
      const newQty = inv.quantity + qty
      db.prepare("UPDATE inventory SET quantity = ?, last_updated = datetime('now') WHERE id = ?").run(newQty, poItem.item_id)
      if (poItem.unit_price > 0 && poItem.unit_price !== inv.unit_price) {
        db.prepare('UPDATE inventory SET unit_price = ? WHERE id = ?').run(poItem.unit_price, poItem.item_id)
      }

      // track_lots ise lot insert
      let lotId = null
      if (inv.track_lots) {
        const lotIns = db.prepare(`
          INSERT INTO inventory_lots(item_id, lot_no, quantity, expiry_date, supplier_id, unit_cost)
          VALUES(?,?,?,?,?,?)
        `).run(
          poItem.item_id,
          it.lot_no || null,
          qty,
          it.expiry_date || null,
          po.supplier_id,
          poItem.unit_price || 0,
        )
        lotId = lotIns.lastInsertRowid
      }

      db.prepare(`
        INSERT INTO stock_movements(item_id, type, delta, quantity_after, reason, lot_id, created_by)
        VALUES(?, 'po_receive', ?, ?, ?, ?, ?)
      `).run(poItem.item_id, qty, newQty, `PO teslim: ${po.po_no}`, lotId, userId)

      // supplier_prices kayit
      if (poItem.unit_price > 0) {
        db.prepare(`
          INSERT INTO supplier_prices(supplier_id, item_id, unit_price, source, source_ref_id)
          VALUES(?,?,?,?,?)
        `).run(po.supplier_id, poItem.item_id, poItem.unit_price, 'po', id)
      }
    }

    // PO durumu: tum satirlar tamamlandi mi?
    const remaining = db.prepare(`
      SELECT SUM(qty_ordered - qty_received) as r FROM purchase_order_items WHERE po_id = ?
    `).get(id).r
    let newStatus
    if (remaining <= 0) newStatus = 'received'
    else newStatus = 'partial_received'
    const extra = newStatus === 'received' ? ", received_at = datetime('now')" : ''
    db.prepare(`UPDATE purchase_orders SET status = ?${extra} WHERE id = ?`).run(newStatus, id)

    return { status: newStatus, remaining }
  })
  return tx()
}

export function draftFromLowStock(userId) {
  const db = getDB()
  const lowItems = db.prepare(`
    SELECT i.*, COALESCE(
      (SELECT SUM(ABS(delta)) / 14.0 FROM stock_movements
       WHERE item_id = i.id AND type IN ('out','request_fulfill') AND created_at > datetime('now','-14 days')),
      0
    ) as daily_avg
    FROM inventory i
    WHERE i.reorder_threshold > 0 AND i.quantity <= i.reorder_threshold
  `).all()

  if (lowItems.length === 0) return { created: [], reason: 'Dusuk stok urun yok' }

  // Group by preferred_supplier_id (null grubu = atama yok)
  const groups = {}
  for (const it of lowItems) {
    const key = it.preferred_supplier_id || 'null'
    if (!groups[key]) groups[key] = []
    const lead = it.lead_time_days || 7
    const safety = it.safety_stock_days || 3
    let suggestedQty = Math.ceil((it.daily_avg * (lead + safety)) - it.quantity)
    if (suggestedQty <= 0) suggestedQty = Math.max(it.reorder_threshold * 2 - it.quantity, 1)
    groups[key].push({ item_id: it.id, qty_ordered: suggestedQty, unit_price: it.unit_price || 0, item_name: it.item_name, unit: it.unit })
  }

  const created = []
  for (const [supKey, items] of Object.entries(groups)) {
    if (supKey === 'null') {
      created.push({ supplier_id: null, items, message: 'Tedarikci atanmamis — atama gerekli' })
      continue
    }
    const r = createPO(+supKey, null, 'Otomatik: dusuk stok', items, userId)
    created.push({ ...r, supplier_id: +supKey, items })
  }
  return { created }
}
