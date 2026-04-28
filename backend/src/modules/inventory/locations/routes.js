import { Router } from 'express'
import { requireRole } from '../../../shared/auth/middleware.js'
import { getDB } from '../../../shared/db/index.js'
import { logAudit } from '../../../shared/audit.js'

export const locationsRouter = Router()
const mgr = requireRole('campus_manager', 'shift_supervisor')

locationsRouter.get('/', ...mgr, (req, res) => {
  try {
    const where = req.query.active === '1' ? 'WHERE is_active = 1' : ''
    res.json(getDB().prepare(`SELECT * FROM inventory_locations ${where} ORDER BY block, name`).all())
  } catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatasi' }) }
})

locationsRouter.post('/', ...mgr, (req, res) => {
  try {
    const { name, block, notes } = req.body
    if (!name) return res.status(400).json({ error: 'Ad gerekli' })
    const r = getDB().prepare('INSERT INTO inventory_locations(name, block, notes) VALUES(?,?,?)')
      .run(name, block || null, notes || null)
    logAudit(req.user.id, 'location_create', 'inventory', r.lastInsertRowid, name)
    res.status(201).json({ id: r.lastInsertRowid })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

locationsRouter.put('/:id', ...mgr, (req, res) => {
  try {
    const { name, block, notes, is_active } = req.body
    if (!name) return res.status(400).json({ error: 'Ad gerekli' })
    getDB().prepare('UPDATE inventory_locations SET name=?, block=?, notes=?, is_active=? WHERE id=?')
      .run(name, block || null, notes || null, is_active ?? 1, +req.params.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

locationsRouter.delete('/:id', ...mgr, (req, res) => {
  try {
    getDB().prepare('UPDATE inventory_locations SET is_active = 0 WHERE id = ?').run(+req.params.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// POST /transfer — body: { item_id, from_location_id, to_location_id, quantity, reason }
locationsRouter.post('/transfer', ...mgr, (req, res) => {
  try {
    const db = getDB()
    const { item_id, from_location_id, to_location_id, quantity, reason } = req.body
    if (!item_id || !to_location_id || !quantity || +quantity <= 0) {
      return res.status(400).json({ error: 'Urun, hedef lokasyon ve miktar gerekli' })
    }
    if (from_location_id === to_location_id) {
      return res.status(400).json({ error: 'Kaynak ve hedef ayni olamaz' })
    }
    const item = db.prepare('SELECT * FROM inventory WHERE id = ?').get(+item_id)
    if (!item) return res.status(404).json({ error: 'Urun bulunamadi' })

    const tx = db.transaction(() => {
      if (item.track_locations && from_location_id) {
        const fromStock = db.prepare('SELECT quantity FROM inventory_stock_by_location WHERE item_id=? AND location_id=?').get(+item_id, +from_location_id)
        if (!fromStock || fromStock.quantity < +quantity) {
          throw new Error(`Kaynak lokasyonda yetersiz stok`)
        }
        db.prepare('UPDATE inventory_stock_by_location SET quantity = quantity - ? WHERE item_id=? AND location_id=?')
          .run(+quantity, +item_id, +from_location_id)
        const toExists = db.prepare('SELECT 1 FROM inventory_stock_by_location WHERE item_id=? AND location_id=?').get(+item_id, +to_location_id)
        if (toExists) {
          db.prepare('UPDATE inventory_stock_by_location SET quantity = quantity + ? WHERE item_id=? AND location_id=?')
            .run(+quantity, +item_id, +to_location_id)
        } else {
          db.prepare('INSERT INTO inventory_stock_by_location(item_id, location_id, quantity) VALUES(?,?,?)')
            .run(+item_id, +to_location_id, +quantity)
        }
      }
      // Transfer hareketi her durumda kayit edilir (ic stok degismez, yer transferi)
      db.prepare(`
        INSERT INTO stock_movements(item_id, type, delta, quantity_after, reason, from_location_id, to_location_id, created_by)
        VALUES(?, 'transfer', 0, ?, ?, ?, ?, ?)
      `).run(+item_id, item.quantity, reason || null, from_location_id || null, +to_location_id, req.user.id)
    })
    tx()
    logAudit(req.user.id, 'inventory_transfer', 'inventory', +item_id,
      `${item.item_name}: ${quantity} ${item.unit} (${from_location_id || '-'} -> ${to_location_id})`)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})
