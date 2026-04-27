import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { getDB } from '../../shared/db/index.js'
import * as service from './service.js'
import { paginate } from '../../shared/paginate.js'
import { suppliersRouter } from './suppliers/routes.js'
import { poRouter } from './purchase-orders/routes.js'

export const inventoryRouter = Router()
inventoryRouter.use('/suppliers', suppliersRouter)
inventoryRouter.use('/po', poRouter)
const mgrAccess = requireRole('campus_manager', 'shift_supervisor', 'laundry', 'housekeeper')
const editAccess = requireRole('campus_manager', 'shift_supervisor')

// ── Stats & Dashboard ───────────────────────────────────────────────────────
inventoryRouter.get('/stats', ...mgrAccess, (req, res) => {
  try { res.json(service.getStats()) }
  catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

inventoryRouter.get('/movements/recent', ...mgrAccess, (req, res) => {
  try { res.json(service.getRecentMovements(+req.query.limit || 30)) }
  catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

// ── Forecast ─────────────────────────────────────────────────────────────────
inventoryRouter.get('/forecast', ...mgrAccess, (req, res) => {
  try { res.json(service.getForecast(req.user.id)) }
  catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

// ── CRUD ────────────────────────────────────────────────────────────────────
inventoryRouter.get('/', ...mgrAccess, (req, res) => {
  if (req.query.search) return res.json(service.search(req.query.search))
  if (req.query.page || req.query.limit) {
    const { page, limit, offset } = paginate(req)
    const db = getDB()
    let countQ = 'SELECT COUNT(*) as c FROM inventory'
    const params = []
    if (req.query.category) { countQ += ' WHERE category=?'; params.push(req.query.category) }
    const total = db.prepare(countQ).get(...params).c
    const data = service.listItemsPaginated(req.query.category, limit, offset)
    return res.json({ data, total, page, limit })
  }
  res.json(service.listItems(req.query.category))
})

inventoryRouter.post('/', ...editAccess, (req, res) => {
  try {
    const { item_name, unit, category } = req.body
    if (!item_name || !unit || !category) return res.status(400).json({ error: 'Ad, birim ve kategori gerekli' })
    const id = service.addItem(req.body, req.user.id)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

inventoryRouter.put('/:id', ...editAccess, (req, res) => {
  try {
    service.editItem(+req.params.id, req.body, req.user.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

inventoryRouter.delete('/:id', ...editAccess, (req, res) => {
  try {
    service.removeItem(+req.params.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Stock Adjust ────────────────────────────────────────────────────────────
inventoryRouter.patch('/:id/adjust', ...editAccess, (req, res) => {
  try {
    const { delta, reason } = req.body
    if (!delta || delta === 0) return res.status(400).json({ error: 'Miktar degisimi gerekli' })
    const result = service.adjustStock(+req.params.id, delta, reason, req.user.id)
    if (result.error) return res.status(result.status).json({ error: result.error })
    res.json(result)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Item Movements ──────────────────────────────────────────────────────────
inventoryRouter.get('/:id/movements', ...mgrAccess, (req, res) => {
  try { res.json(service.getItemMovements(+req.params.id, +req.query.limit || 50)) }
  catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

// ── Bulk Stock Count ────────────────────────────────────────────────────────
inventoryRouter.post('/bulk-count', ...editAccess, (req, res) => {
  try {
    const { items } = req.body
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Sayim verisi gerekli' })
    const result = service.bulkStockCount(items, req.user.id)
    res.json(result)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── CSV Export ──────────────────────────────────────────────────────────────
inventoryRouter.get('/export/csv', ...mgrAccess, (req, res) => {
  try {
    const items = service.listItems(req.query.category)
    const header = 'Urun Adi,Kategori,Miktar,Birim,Esik,Konum,Birim Fiyat,Son Guncelleme'
    const rows = items.map(i =>
      `"${i.item_name}","${i.category}",${i.quantity},"${i.unit}",${i.reorder_threshold},"${i.location || ''}",${i.unit_price || 0},"${i.last_updated || ''}"`
    )
    res.set('Content-Type', 'text/csv; charset=utf-8')
    res.set('Content-Disposition', `attachment; filename=envanter_${new Date().toISOString().slice(0,10)}.csv`)
    res.send('\ufeff' + header + '\n' + rows.join('\n'))
  } catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

// ── Personnel Search (for checkout) ─────────────────────────────────────────
inventoryRouter.get('/personnel/search', ...mgrAccess, (req, res) => {
  try {
    if (!req.query.q || req.query.q.length < 2) return res.json([])
    res.json(service.searchPersonnel(req.query.q))
  } catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

// ── Checkout (Malzeme Teslim) ───────────────────────────────────────────────
inventoryRouter.get('/checkouts/active', ...mgrAccess, (req, res) => {
  try { res.json(service.getActiveCheckouts()) }
  catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

inventoryRouter.get('/checkouts/history', ...mgrAccess, (req, res) => {
  try { res.json(service.getCheckoutHistory(+req.query.limit || 50)) }
  catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

inventoryRouter.get('/checkouts/personnel/:id', ...mgrAccess, (req, res) => {
  try { res.json(service.getPersonnelCheckouts(+req.params.id)) }
  catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

inventoryRouter.post('/checkout', ...editAccess, (req, res) => {
  try {
    const { item_id, personnel_id, quantity, note } = req.body
    if (!item_id || !personnel_id || !quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Urun, personel ve miktar gerekli' })
    }
    const result = service.checkoutToPersonnel(item_id, personnel_id, quantity, note, req.user.id)
    res.json(result)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

inventoryRouter.post('/return/:id', ...editAccess, (req, res) => {
  try {
    const result = service.returnFromPersonnel(+req.params.id, req.body.quantity, req.user.id)
    res.json(result)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Goods Receipts (Mal Giris) ────────────────────────────────────────────────
inventoryRouter.get('/receipts', ...mgrAccess, (req, res) => {
  try { res.json(service.getReceipts(+req.query.limit || 50)) }
  catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

inventoryRouter.get('/receipts/:id', ...mgrAccess, (req, res) => {
  try {
    const receipt = service.getReceiptDetail(+req.params.id)
    if (!receipt) return res.status(404).json({ error: 'Kayit bulunamadi' })
    res.json(receipt)
  } catch (e) { console.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

inventoryRouter.post('/receipts', ...editAccess, (req, res) => {
  try {
    const { supplier, invoice_no, receipt_date, notes, items } = req.body
    if (!supplier) return res.status(400).json({ error: 'Tedarikci gerekli' })
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'En az bir kalem gerekli' })
    const result = service.createReceipt(supplier, invoice_no, receipt_date || new Date().toISOString().slice(0, 10), notes, items, req.user.id)
    res.status(201).json(result)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

inventoryRouter.delete('/receipts/:id', ...editAccess, (req, res) => {
  try {
    service.deleteReceipt(+req.params.id, req.user.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})
