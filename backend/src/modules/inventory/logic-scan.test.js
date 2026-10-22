// Envanter mantık taraması (Eki 2026) — her test düzeltme öncesi kırmızıydı.
import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { buildMonthlyReport } from './analytics/routes.js'

let token, db, userId, staffId, deptName
const auth = () => ({ Authorization: `Bearer ${token}` })

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  db = getDB()
  const res = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
  token = res.body.token
  userId = db.prepare("SELECT id FROM users WHERE username='mudur'").get().id
  const dept = db.prepare('SELECT id, name FROM departments ORDER BY id LIMIT 1').get()
  deptName = dept.name
  staffId = db.prepare(`
    INSERT INTO staff(full_name, role_label, position, department_id, is_active)
    VALUES('Tarama Personel', 'Kat', 'Kat', ?, 1)
  `).run(dept.id).lastInsertRowid
})

async function newItem(extra = {}) {
  const res = await request(app).post('/api/inventory').set(auth())
    .send({ item_name: `Tarama ${Math.random().toString(36).slice(2, 8)}`, unit: 'adet', category: 'general', quantity: 0, ...extra })
  expect(res.status).toBe(201)
  return res.body.id
}
const qtyOf = (id) => db.prepare('SELECT quantity FROM inventory WHERE id=?').get(id).quantity

async function receipt(items) {
  const res = await request(app).post('/api/inventory/receipts').set(auth())
    .send({ supplier: 'Tarama Tedarik', items })
  expect(res.status).toBe(201)
  return res.body.id
}

describe('Mal giriş fişi silme', () => {
  it('aynı üründen aynı miktarda başka fiş varken lokasyon stoğu iki kez düşülmez', async () => {
    const loc = await request(app).post('/api/inventory/locations').set(auth()).send({ name: 'Tarama Depo' })
    const locId = loc.body.id
    const itemId = await newItem({ track_locations: 1 })
    await receipt([{ item_id: itemId, quantity: 10, location_id: locId }])
    const second = await receipt([{ item_id: itemId, quantity: 10, location_id: locId }])
    expect(qtyOf(itemId)).toBe(20)

    const del = await request(app).delete(`/api/inventory/receipts/${second}`).set(auth())
    expect(del.status).toBe(200)
    expect(qtyOf(itemId)).toBe(10)
    const loc2 = db.prepare('SELECT quantity FROM inventory_stock_by_location WHERE item_id=? AND location_id=?').get(itemId, locId)
    expect(loc2.quantity).toBe(10)
    const reversals = db.prepare("SELECT COUNT(*) c FROM stock_movements WHERE item_id=? AND reason LIKE 'Mal giris iptal%'").get(itemId).c
    expect(reversals).toBe(1)
  })

  it('fişte aynı ürün iki kalemse ikisi de geri alınır', async () => {
    const itemId = await newItem()
    const id = await receipt([{ item_id: itemId, quantity: 5 }, { item_id: itemId, quantity: 7 }])
    expect(qtyOf(itemId)).toBe(12)
    const del = await request(app).delete(`/api/inventory/receipts/${id}`).set(auth())
    expect(del.status).toBe(200)
    expect(qtyOf(itemId)).toBe(0)
  })

  it('girişin stoğu kullanılmışsa silme reddedilir, stok sessizce 0a kırpılmaz', async () => {
    const itemId = await newItem()
    const id = await receipt([{ item_id: itemId, quantity: 10 }])
    const co = await request(app).post('/api/inventory/checkout').set(auth())
      .send({ item_id: itemId, staff_id: staffId, quantity: 8 })
    expect(co.status).toBe(200)
    const del = await request(app).delete(`/api/inventory/receipts/${id}`).set(auth())
    expect(del.status).toBe(400)
    expect(qtyOf(itemId)).toBe(2)
    expect(db.prepare('SELECT 1 FROM goods_receipts WHERE id=?').get(id)).toBeTruthy()
  })

  it('lot takipli üründe fişin açtığı lot da kapanır', async () => {
    const itemId = await newItem({ track_lots: 1 })
    const id = await receipt([{ item_id: itemId, quantity: 6, lot_no: 'L-TARAMA' }])
    const del = await request(app).delete(`/api/inventory/receipts/${id}`).set(auth())
    expect(del.status).toBe(200)
    const lot = db.prepare("SELECT quantity, status FROM inventory_lots WHERE item_id=? AND lot_no='L-TARAMA'").get(itemId)
    expect(lot).toMatchObject({ quantity: 0, status: 'depleted' })
  })
})

describe('Teslim iadesi miktar doğrulaması', () => {
  async function checkout(itemId, qty) {
    const res = await request(app).post('/api/inventory/checkout').set(auth())
      .send({ item_id: itemId, staff_id: staffId, quantity: qty })
    expect(res.status).toBe(200)
    return db.prepare('SELECT id FROM inventory_checkouts WHERE item_id=? ORDER BY id DESC').get(itemId).id
  }

  it('metin miktar stokla birleştirilmez ("47" + "1")', async () => {
    const itemId = await newItem({ quantity: 50 })
    const coId = await checkout(itemId, 3)
    const res = await request(app).post(`/api/inventory/return/${coId}`).set(auth()).send({ quantity: '1' })
    expect(res.status).toBe(200)
    expect(qtyOf(itemId)).toBe(48)
  })

  it('negatif iade stoktan düşmez', async () => {
    const itemId = await newItem({ quantity: 20 })
    const coId = await checkout(itemId, 5)
    const res = await request(app).post(`/api/inventory/return/${coId}`).set(auth()).send({ quantity: -4 })
    expect(res.status).toBe(400)
    expect(qtyOf(itemId)).toBe(15)
    expect(db.prepare('SELECT returned_qty FROM inventory_checkouts WHERE id=?').get(coId).returned_qty).toBe(0)
  })
})

describe('Toplu sayım doğrulaması', () => {
  it('negatif ya da sayı olmayan sayım stoğa yazılmaz', async () => {
    const a = await newItem({ quantity: 10 })
    const b = await newItem({ quantity: 10 })
    const res = await request(app).post('/api/inventory/bulk-count').set(auth())
      .send({ items: [{ id: a, counted_qty: -5 }, { id: b, counted_qty: 'abc' }] })
    expect(res.status).toBe(200)
    expect(res.body.updated).toBe(0)
    expect(res.body.errors).toHaveLength(2)
    expect(qtyOf(a)).toBe(10)
    expect(qtyOf(b)).toBe(10)
  })
})

describe('Ürün düzenleme ile miktar değişimi', () => {
  it('hareket defterine sayım satırı düşer', async () => {
    const itemId = await newItem({ quantity: 10 })
    const res = await request(app).put(`/api/inventory/${itemId}`).set(auth())
      .send({ item_name: 'Tarama Duzen', unit: 'adet', category: 'general', quantity: 14 })
    expect(res.status).toBe(200)
    expect(qtyOf(itemId)).toBe(14)
    const mv = db.prepare("SELECT type, delta, quantity_after FROM stock_movements WHERE item_id=? ORDER BY id DESC").get(itemId)
    expect(mv).toMatchObject({ type: 'count', delta: 4, quantity_after: 14 })
  })
})

describe('Satın alma siparişi elle durum geçişi', () => {
  it("PATCH ile 'received' yazılamaz (stok girmeden kapanırdı)", async () => {
    const sup = await request(app).post('/api/inventory/suppliers').set(auth()).send({ name: 'Tarama PO Ted' })
    const itemId = await newItem()
    const po = await request(app).post('/api/inventory/po').set(auth())
      .send({ supplier_id: sup.body.id, items: [{ item_id: itemId, qty_ordered: 5, unit_price: 1 }] })
    expect(po.status).toBe(201)
    const bad = await request(app).patch(`/api/inventory/po/${po.body.id}/status`).set(auth()).send({ status: 'received' })
    expect(bad.status).toBe(400)
    expect(db.prepare('SELECT status FROM purchase_orders WHERE id=?').get(po.body.id).status).toBe('draft')

    const sent = await request(app).patch(`/api/inventory/po/${po.body.id}/status`).set(auth()).send({ status: 'sent' })
    expect(sent.status).toBe(200)
    const recv = await request(app).post(`/api/inventory/po/${po.body.id}/receive`).set(auth())
      .send({ items: [{ po_item_id: db.prepare('SELECT id FROM purchase_order_items WHERE po_id=?').get(po.body.id).id, qty_received_now: 5 }] })
    expect(recv.body.status).toBe('received')
    const reopen = await request(app).patch(`/api/inventory/po/${po.body.id}/status`).set(auth()).send({ status: 'cancelled' })
    expect(reopen.status).toBe(400)
  })
})

describe('Envanter CSV', () => {
  it('ortak güvenli yardımcıdan geçer (formül + tırnak)', async () => {
    await newItem({ item_name: '=HYPERLINK("http://x","y")' })
    const res = await request(app).get('/api/inventory/export/csv').set(auth())
    expect(res.status).toBe(200)
    expect(res.text).toContain(`"'=HYPERLINK(""http://x"",""y"")"`)
  })
})

describe('Envanter analitiği', () => {
  it('aylık rapor ayın son gününü içerir', () => {
    const itemId = db.prepare('SELECT id FROM inventory LIMIT 1').get().id
    db.prepare(`INSERT INTO stock_movements(item_id,type,delta,quantity_after,reason,created_by,created_at)
      VALUES(?, 'out', -3, 0, 'tarama', ?, '2025-01-31 12:00:00')`).run(itemId, userId)
    expect(buildMonthlyReport('2025-01').movements.total_out).toBe(3)
  })

  it('aylık rapor İstanbul ayına göre keser (UTC 28 Şub 22:30 = 1 Mart)', () => {
    const itemId = db.prepare('SELECT id FROM inventory LIMIT 1').get().id
    db.prepare(`INSERT INTO stock_movements(item_id,type,delta,quantity_after,reason,created_by,created_at)
      VALUES(?, 'out', -5, 0, 'tarama', ?, '2025-02-28 22:30:00')`).run(itemId, userId)
    expect(buildMonthlyReport('2025-03').movements.total_out).toBe(5)
    expect(buildMonthlyReport('2025-02').movements.total_out || 0).toBe(0)
  })

  it('departman tüketimi AVS personeli (staff) teslimlerini sayar', async () => {
    const itemId = await newItem({ quantity: 30, unit_price: 10 })
    const co = await request(app).post('/api/inventory/checkout').set(auth())
      .send({ item_id: itemId, staff_id: staffId, quantity: 4 })
    expect(co.status).toBe(200)
    const res = await request(app).get('/api/inventory/analytics/department-consumption?days=30').set(auth())
    expect(res.status).toBe(200)
    const row = res.body.rows.find(r => r.department === deptName && r.category === 'general')
    expect(row?.total_qty).toBeGreaterThanOrEqual(4)
  })
})
