import { getDB } from '../../shared/db/index.js'

export function getAllItems(category) {
  const db = getDB()
  let q = 'SELECT * FROM inventory'
  const params = []
  if (category) { q += ' WHERE category=?'; params.push(category) }
  q += ' ORDER BY category, item_name'
  return db.prepare(q).all(...params)
}

export function createItem({ item_name, quantity, unit, reorder_threshold, category }) {
  const db = getDB()
  const r = db.prepare(
    'INSERT INTO inventory(item_name,quantity,unit,reorder_threshold,category) VALUES(?,?,?,?,?)'
  ).run(item_name, quantity || 0, unit, reorder_threshold || 0, category)
  return r.lastInsertRowid
}

export function updateItem(id, { item_name, quantity, unit, reorder_threshold, category }) {
  const db = getDB()
  db.prepare(`
    UPDATE inventory SET item_name=?,quantity=?,unit=?,reorder_threshold=?,category=?,last_updated=datetime('now')
    WHERE id=?
  `).run(item_name, quantity, unit, reorder_threshold || 0, category, id)
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
