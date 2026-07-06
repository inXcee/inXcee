# AVS Kiosk Envanter Çıkış (Zimmet) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AVS personeli (Temizlik/Teknik/Çamaşırhane) ürün aldığında AVS kiosktan stoktan hızlı zimmet düşümü yapsın; kim ne aldı yapısal kayda geçsin.

**Architecture:** `avs-self-service` modülüne 4 yeni endpoint (mevcut `inventory` servisini reuse — `checkoutToStaff`, `getStaffCheckouts`). `created_by` için login edilemez `avs_kiosk_system` sistem kullanıcısı; gerçek "kim aldı" = `inventory_checkouts.staff_id`. Departman→kategori bazlı erişim. Frontend `AvsSelfServicePage`'e koşullu "📦 Malzeme" sekmesi (mevcut "Daha fazla" overflow'a düşer). **Şema değişikliği yok.**

**Tech Stack:** Express + better-sqlite3 (backend), Vitest + supertest (test), React + @tanstack/react-query + Tailwind (frontend).

**Spec:** `docs/superpowers/specs/2026-05-27-avs-kiosk-inventory-design.md`

---

## Doğrulanmış Kod Gerçekleri

- `checkoutToStaff(itemId, staffId, qty, note, userId, fromLocationId=null)` — `backend/src/modules/inventory/service.js:155`. AVS staff için: `staff WHERE id=? AND is_active=1` kontrolü, stok düşer, `inventory_checkouts(staff_id)` + `stock_movements type='out'` yazar, lot/lokasyon işler. Yetersiz stok → throw; `track_locations` + `fromLocationId` yoksa → throw.
- `getStaffCheckouts(staffId)` — `service.js:187` → `SELECT ic.*, i.item_name, i.unit, i.category ... WHERE ic.staff_id=? AND ic.returned_at IS NULL`.
- `inventory` kolonları: `id, item_name, quantity, unit, reorder_threshold, category, track_locations` (track_locations migration ile eklendi, admin kullanıyor).
- `inventory_stock_by_location(item_id, location_id, quantity)` + `inventory_locations(id, name, block, is_active)`.
- `users` CHECK: role ∈ ('campus_manager','shift_supervisor','technical','laundry','housekeeper'); `password_hash NOT NULL`.
- `routes.js` mevcut import'ları (satır 1-8): `Router, requireAvsKiosk, getDB, createRequest, changeStaffKioskPin, logger, upload+verifyMagicBytes, createLeaveService/leaveListService/leaveBalanceService`. Mount: `app.js:308` `app.use('/api/avs-self-service', writeLimiter, avsSelfServiceRouter)`.
- Test `beforeAll` (`avs-self-service.test.js:10-46`): `mudur` admin → `POST /api/avs-workers` ile worker → PIN `0000` → worker **Temizlik** departmanı + `assigned_block='M1'` → `avs-login` ile `avsToken`. `workerId` ve `avsToken` global.
- Frontend (`AvsSelfServicePage.jsx`): `TAB_KEYS` (satır 12-22, 9 sekme), `avsApi` (satır 76), `myInfo` query (satır 142-144) **zaten var**, `BottomNav` çağrısı (satır ~694) `moreLabel` ile. `handleLogout` (satır 53-66) tüm form state'lerini sıfırlıyor.

> **Spec'ten sapma (YAGNI):** Spec frontend'de ayrı `departmentToCategory` saf fonksiyonu öngörüyordu. `GET /my-info` artık `inventory_category` döndürdüğü için frontend mapping yapmaz — doğrudan `myInfo.inventory_category` kullanılır. Mapping mantığı backend `inventory-helpers.js` + testiyle kapsanır. Frontend mapping fonksiyonu ve testi **eklenmez**.

---

# PHASE 1 — Backend: helper'lar + items endpoint (TDD)

### Task 1: `inventory-helpers.js` — departman→kategori + sistem kullanıcısı

**Files:**
- Create: `backend/src/modules/avs-self-service/inventory-helpers.js`
- Test: `backend/src/modules/avs-self-service/inventory-helpers.test.js`

- [ ] **Step 1: Failing test yaz**

`backend/src/modules/avs-self-service/inventory-helpers.test.js`:

```js
import { describe, it, expect, beforeAll } from 'vitest'
import { initDB, getDB } from '../../shared/db/index.js'
import { departmentToInventoryCategory, getKioskSystemUserId } from './inventory-helpers.js'

beforeAll(() => { process.env.DB_PATH = ':memory:'; initDB() })

describe('departmentToInventoryCategory', () => {
  it('Temizlik → housekeeping', () => expect(departmentToInventoryCategory('Temizlik')).toBe('housekeeping'))
  it('Teknik → maintenance', () => expect(departmentToInventoryCategory('Teknik')).toBe('maintenance'))
  it('Çamaşırhane → laundry', () => expect(departmentToInventoryCategory('Çamaşırhane')).toBe('laundry'))
  it('bilinmeyen departman → null', () => expect(departmentToInventoryCategory('Güvenlik')).toBeNull())
  it('boş/null → null', () => {
    expect(departmentToInventoryCategory('')).toBeNull()
    expect(departmentToInventoryCategory(null)).toBeNull()
  })
})

describe('getKioskSystemUserId', () => {
  it('idempotent geçerli id döner ve hesap login edilemez', () => {
    const id1 = getKioskSystemUserId()
    const id2 = getKioskSystemUserId()
    expect(id1).toBe(id2)
    expect(Number.isInteger(id1)).toBe(true)
    const u = getDB().prepare('SELECT username, password_hash FROM users WHERE id=?').get(id1)
    expect(u.username).toBe('avs_kiosk_system')
    expect(u.password_hash).toBe('!')
  })
})
```

- [ ] **Step 2: Testi çalıştır, fail gör**

Run: `cd backend && npx vitest run src/modules/avs-self-service/inventory-helpers.test.js`
Expected: FAIL — `inventory-helpers.js` yok (import hatası).

- [ ] **Step 3: Helper dosyasını oluştur**

`backend/src/modules/avs-self-service/inventory-helpers.js`:

```js
import { getDB } from '../../shared/db/index.js'

// Departman ADINA göre envanter kategorisi (id sırası prod'da değişebilir).
// Eşleşme yoksa null → envanter erişimi yok.
export function departmentToInventoryCategory(deptName) {
  const n = (deptName || '').toLowerCase()
  if (n.includes('temizlik')) return 'housekeeping'
  if (n.includes('teknik')) return 'maintenance'
  if (n.includes('çama') || n.includes('cama')) return 'laundry'
  return null
}

// created_by için login edilemez sistem kullanıcısı (idempotent).
// password_hash='!' geçerli bcrypt değil → bu hesapla login imkansız.
// Gerçek "kim aldı" = inventory_checkouts.staff_id; bu sadece "kaydeden".
export function getKioskSystemUserId() {
  const db = getDB()
  db.prepare(`INSERT OR IGNORE INTO users(username, password_hash, role, full_name)
              VALUES('avs_kiosk_system', '!', 'housekeeper', 'AVS Kiosk Sistemi')`).run()
  return db.prepare("SELECT id FROM users WHERE username='avs_kiosk_system'").get().id
}
```

- [ ] **Step 4: Testi çalıştır, geç**

Run: `cd backend && npx vitest run src/modules/avs-self-service/inventory-helpers.test.js`
Expected: PASS (7 test).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/avs-self-service/inventory-helpers.js backend/src/modules/avs-self-service/inventory-helpers.test.js
git commit -m "feat(avs-kiosk): inventory-helpers — dept->category + kiosk system user"
```

---

### Task 2: `GET /inventory/items` (departman gating) (TDD)

**Files:**
- Modify: `backend/src/modules/avs-self-service/routes.js`
- Test: `backend/src/modules/avs-self-service/avs-self-service.test.js`

- [ ] **Step 1: Failing test ekle**

Test dosyasının sonuna ekle. Temizlik worker housekeeping+general görmeli, başka kategori görmemeli. (beforeAll'da seed envanteri varsa kullanılır; deterministik olması için testte iki ürün ekliyoruz.)

```js
describe('AVS Self-Service — inventory/items', () => {
  it('AVS token olmadan 401', async () => {
    const res = await request(app).get('/api/avs-self-service/inventory/items')
    expect(res.status).toBe(401)
  })

  it('Temizlik worker → housekeeping + general döner, maintenance dönmez', async () => {
    const db = getDB()
    db.prepare(`INSERT INTO inventory(item_name,quantity,unit,category) VALUES('Deterjan',50,'paket','housekeeping')`).run()
    db.prepare(`INSERT INTO inventory(item_name,quantity,unit,category) VALUES('Çöp Poşeti',100,'adet','general')`).run()
    db.prepare(`INSERT INTO inventory(item_name,quantity,unit,category) VALUES('Matkap Ucu',10,'adet','maintenance')`).run()
    const res = await request(app).get('/api/avs-self-service/inventory/items')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(res.body.category).toBe('housekeeping')
    const names = res.body.items.map(i => i.item_name)
    expect(names).toContain('Deterjan')
    expect(names).toContain('Çöp Poşeti')
    expect(names).not.toContain('Matkap Ucu')
  })

  it('Eşleşmeyen departmanlı worker → 403', async () => {
    const db = getDB()
    // Yeni worker: Güvenlik departmanı
    const w2 = (await request(app).post('/api/avs-workers')
      .set('Authorization', `Bearer ${(await request(app).post('/api/auth/login').send({ username:'mudur', password:'admin123' })).body.token}`)
      .send({ full_name: 'Guvenlik Worker' })).body
    const guvenlikId = db.prepare("SELECT id FROM departments WHERE name='Güvenlik'").get().id
    db.prepare('UPDATE staff SET department_id=? WHERE id=?').run(guvenlikId, w2.id)
    const adminToken = (await request(app).post('/api/auth/login').send({ username:'mudur', password:'admin123' })).body.token
    await request(app).put(`/api/avs-workers/${w2.id}/pin`).set('Authorization', `Bearer ${adminToken}`).send({ new_pin: '1111' })
    const token2 = (await request(app).post('/api/auth/avs-login').send({ worker_id: w2.id, pin: '1111' })).body.token
    const res = await request(app).get('/api/avs-self-service/inventory/items')
      .set('Authorization', `Bearer ${token2}`)
    expect(res.status).toBe(403)
  })
})
```

- [ ] **Step 2: Testi çalıştır, fail gör**

Run: `cd backend && npx vitest run src/modules/avs-self-service/avs-self-service.test.js -t "inventory/items"`
Expected: FAIL (404 — route yok).

- [ ] **Step 3: Import + endpoint ekle**

`routes.js` import bloğuna (satır 8'den sonra) ekle:

```js
import { checkoutToStaff, getStaffCheckouts } from '../inventory/service.js'
import { departmentToInventoryCategory, getKioskSystemUserId } from './inventory-helpers.js'
```

`routes.js` içine (mevcut endpoint'lerin sonuna, `menu/today`'den sonra) ekle:

```js
// ── Envanter (çıkış/zimmet) ──────────────────────────────────────────────
// Worker'ın departman kategorisindeki + general ürünler
avsSelfServiceRouter.get('/inventory/items', requireAvsKiosk, (req, res) => {
  try {
    const db = getDB()
    const staff = db.prepare(`
      SELECT d.name as dept_name FROM staff s
      LEFT JOIN departments d ON d.id = s.department_id WHERE s.id = ?
    `).get(req.user.workerId)
    const category = departmentToInventoryCategory(staff?.dept_name)
    if (!category) return res.status(403).json({ error: 'Envanter erişiminiz yok' })
    const items = db.prepare(`
      SELECT id, item_name, category, quantity, unit, reorder_threshold, track_locations
      FROM inventory WHERE category IN (?, 'general')
      ORDER BY category, item_name
    `).all(category)
    res.json({ category, items })
  } catch (e) { logger.error('[avs inventory items]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})
```

- [ ] **Step 4: Testi çalıştır, geç**

Run: `cd backend && npx vitest run src/modules/avs-self-service/avs-self-service.test.js -t "inventory/items"`
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/avs-self-service/routes.js backend/src/modules/avs-self-service/avs-self-service.test.js
git commit -m "feat(avs-kiosk): GET inventory/items — department-gated item list"
```

---

# PHASE 2 — Backend: checkout + locations + my-checkouts + my-info (TDD)

### Task 3: `POST /inventory/checkout` (TDD)

**Files:**
- Modify: `backend/src/modules/avs-self-service/routes.js`
- Test: `backend/src/modules/avs-self-service/avs-self-service.test.js`

- [ ] **Step 1: Failing test ekle**

```js
describe('AVS Self-Service — inventory/checkout', () => {
  it('geçerli checkout → stok düşer, staff_id kaydı + stock_movement out + audit', async () => {
    const db = getDB()
    const item = db.prepare(`INSERT INTO inventory(item_name,quantity,unit,category) VALUES('Eldiven',30,'kutu','housekeeping')`).run()
    const itemId = item.lastInsertRowid
    const res = await request(app).post('/api/avs-self-service/inventory/checkout')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ item_id: itemId, quantity: 2, note: 'M1 kat 1' })
    expect(res.status).toBe(201)
    expect(res.body.quantity).toBe(28)
    const co = db.prepare('SELECT * FROM inventory_checkouts WHERE item_id=? AND staff_id=?').get(itemId, workerId)
    expect(co).toBeTruthy()
    expect(co.quantity).toBe(2)
    const mv = db.prepare("SELECT * FROM stock_movements WHERE item_id=? AND type='out'").get(itemId)
    expect(mv).toBeTruthy()
    const audit = db.prepare("SELECT * FROM audit_log WHERE action='kiosk_avs_inventory_checkout' AND target_id=?").get(itemId)
    expect(audit).toBeTruthy()
  })

  it('yetersiz stok → 400', async () => {
    const db = getDB()
    const item = db.prepare(`INSERT INTO inventory(item_name,quantity,unit,category) VALUES('Az Stok',1,'adet','housekeeping')`).run()
    const res = await request(app).post('/api/avs-self-service/inventory/checkout')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ item_id: item.lastInsertRowid, quantity: 5 })
    expect(res.status).toBe(400)
  })

  it('kategori dışı ürün → 403', async () => {
    const db = getDB()
    const item = db.prepare(`INSERT INTO inventory(item_name,quantity,unit,category) VALUES('Teknik Parça',10,'adet','maintenance')`).run()
    const res = await request(app).post('/api/avs-self-service/inventory/checkout')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ item_id: item.lastInsertRowid, quantity: 1 })
    expect(res.status).toBe(403)
  })

  it('geçersiz miktar → 400', async () => {
    const db = getDB()
    const item = db.prepare(`INSERT INTO inventory(item_name,quantity,unit,category) VALUES('Gecerli Urun',10,'adet','housekeeping')`).run()
    const res = await request(app).post('/api/avs-self-service/inventory/checkout')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ item_id: item.lastInsertRowid, quantity: 0 })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Testi çalıştır, fail gör**

Run: `cd backend && npx vitest run src/modules/avs-self-service/avs-self-service.test.js -t "inventory/checkout"`
Expected: FAIL (404).

- [ ] **Step 3: Endpoint ekle**

`routes.js`, items endpoint'inin altına:

```js
// Ürün al (stoktan zimmet düşümü) — staff_id = workerId, created_by = sistem
avsSelfServiceRouter.post('/inventory/checkout', requireAvsKiosk, (req, res) => {
  const { item_id, quantity, note, from_location_id } = req.body
  const qty = Number(quantity)
  if (!item_id || !Number.isFinite(qty) || qty <= 0)
    return res.status(400).json({ error: 'Geçerli ürün ve miktar gerekli' })
  try {
    const db = getDB()
    const staff = db.prepare(`
      SELECT d.name as dept_name FROM staff s
      LEFT JOIN departments d ON d.id = s.department_id WHERE s.id = ?
    `).get(req.user.workerId)
    const category = departmentToInventoryCategory(staff?.dept_name)
    if (!category) return res.status(403).json({ error: 'Envanter erişiminiz yok' })
    const item = db.prepare('SELECT id, category FROM inventory WHERE id = ?').get(item_id)
    if (!item) return res.status(404).json({ error: 'Ürün bulunamadı' })
    if (item.category !== category && item.category !== 'general')
      return res.status(403).json({ error: 'Bu ürüne erişiminiz yok' })

    const systemUserId = getKioskSystemUserId()
    const result = checkoutToStaff(
      item_id, req.user.workerId, qty, note?.trim() || null, systemUserId, from_location_id || null
    )
    db.prepare(`INSERT INTO audit_log(user_id, action, module, target_id, detail)
                VALUES(NULL, 'kiosk_avs_inventory_checkout', 'avs-self-service', ?, ?)`)
      .run(item_id, JSON.stringify({ workerId: req.user.workerId, quantity: qty }))
    res.status(201).json(result)
  } catch (e) {
    // checkoutToStaff throw: yetersiz stok / lokasyon gerekli
    logger.error('[avs inventory checkout]', e)
    res.status(400).json({ error: e.message })
  }
})
```

- [ ] **Step 4: Testi çalıştır, geç**

Run: `cd backend && npx vitest run src/modules/avs-self-service/avs-self-service.test.js -t "inventory/checkout"`
Expected: PASS (4 test).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/avs-self-service/routes.js backend/src/modules/avs-self-service/avs-self-service.test.js
git commit -m "feat(avs-kiosk): POST inventory/checkout — stock-out to staff + audit"
```

---

### Task 4: `GET /inventory/items/:id/locations` (TDD)

**Files:**
- Modify: `backend/src/modules/avs-self-service/routes.js`
- Test: `backend/src/modules/avs-self-service/avs-self-service.test.js`

- [ ] **Step 1: Failing test ekle**

```js
describe('AVS Self-Service — inventory item locations', () => {
  it('lokasyon stoğu olan ürün için stoklu lokasyonları döner', async () => {
    const db = getDB()
    const item = db.prepare(`INSERT INTO inventory(item_name,quantity,unit,category,track_locations) VALUES('Lokasyonlu',20,'adet','housekeeping',1)`).run()
    const itemId = item.lastInsertRowid
    const loc = db.prepare(`INSERT INTO inventory_locations(name, block) VALUES('Depo A','M1')`).run()
    db.prepare(`INSERT INTO inventory_stock_by_location(item_id, location_id, quantity) VALUES(?,?,?)`)
      .run(itemId, loc.lastInsertRowid, 20)
    const res = await request(app).get(`/api/avs-self-service/inventory/items/${itemId}/locations`)
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.some(l => l.name === 'Depo A' && l.quantity === 20)).toBe(true)
  })
})
```

- [ ] **Step 2: Testi çalıştır, fail gör**

Run: `cd backend && npx vitest run src/modules/avs-self-service/avs-self-service.test.js -t "item locations"`
Expected: FAIL (404).

- [ ] **Step 3: Endpoint ekle**

`routes.js`, checkout endpoint'inin altına:

```js
// Lokasyon-takipli ürün için stoklu kaynak lokasyonlar
avsSelfServiceRouter.get('/inventory/items/:id/locations', requireAvsKiosk, (req, res) => {
  try {
    const rows = getDB().prepare(`
      SELECT isbl.location_id, il.name, il.block, isbl.quantity
      FROM inventory_stock_by_location isbl
      JOIN inventory_locations il ON il.id = isbl.location_id
      WHERE isbl.item_id = ? AND isbl.quantity > 0 AND il.is_active = 1
      ORDER BY il.block, il.name
    `).all(req.params.id)
    res.json(rows)
  } catch (e) { logger.error('[avs item locations]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})
```

- [ ] **Step 4: Testi çalıştır, geç**

Run: `cd backend && npx vitest run src/modules/avs-self-service/avs-self-service.test.js -t "item locations"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/avs-self-service/routes.js backend/src/modules/avs-self-service/avs-self-service.test.js
git commit -m "feat(avs-kiosk): GET inventory item locations for location-tracked items"
```

---

### Task 5: `GET /inventory/my-checkouts` (TDD)

**Files:**
- Modify: `backend/src/modules/avs-self-service/routes.js`
- Test: `backend/src/modules/avs-self-service/avs-self-service.test.js`

- [ ] **Step 1: Failing test ekle**

> Not: Task 3 checkout testi 'Eldiven' x2'yi workerId'ye zimmetledi; bu testte yeni bir kalem ekleyip kendi varlığını doğruluyoruz (test sırası bağımsız olsun diye kendi verisini yaratır).

```js
describe('AVS Self-Service — inventory/my-checkouts', () => {
  it('worker açık zimmetlerini döner', async () => {
    const db = getDB()
    const item = db.prepare(`INSERT INTO inventory(item_name,quantity,unit,category) VALUES('Bez',40,'paket','housekeeping')`).run()
    await request(app).post('/api/avs-self-service/inventory/checkout')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ item_id: item.lastInsertRowid, quantity: 3 })
    const res = await request(app).get('/api/avs-self-service/inventory/my-checkouts')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.some(c => c.item_name === 'Bez' && c.quantity === 3)).toBe(true)
  })
})
```

- [ ] **Step 2: Testi çalıştır, fail gör**

Run: `cd backend && npx vitest run src/modules/avs-self-service/avs-self-service.test.js -t "my-checkouts"`
Expected: FAIL (404).

- [ ] **Step 3: Endpoint ekle**

`routes.js`, locations endpoint'inin altına:

```js
// Aldıklarım — açık (iade edilmemiş) zimmetler
avsSelfServiceRouter.get('/inventory/my-checkouts', requireAvsKiosk, (req, res) => {
  try {
    res.json(getStaffCheckouts(req.user.workerId))
  } catch (e) { logger.error('[avs my-checkouts]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})
```

- [ ] **Step 4: Testi çalıştır, geç**

Run: `cd backend && npx vitest run src/modules/avs-self-service/avs-self-service.test.js -t "my-checkouts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/avs-self-service/routes.js backend/src/modules/avs-self-service/avs-self-service.test.js
git commit -m "feat(avs-kiosk): GET inventory/my-checkouts — worker's open checkouts"
```

---

### Task 6: `/my-info`'ya `inventory_category` ekle (TDD)

**Files:**
- Modify: `backend/src/modules/avs-self-service/routes.js` (mevcut `/my-info`, satır 13-29)
- Test: `backend/src/modules/avs-self-service/avs-self-service.test.js`

- [ ] **Step 1: Failing test ekle**

```js
describe('AVS Self-Service — my-info inventory_category', () => {
  it('Temizlik worker my-info → inventory_category=housekeeping', async () => {
    const res = await request(app).get('/api/avs-self-service/my-info')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(res.body.inventory_category).toBe('housekeeping')
  })
})
```

- [ ] **Step 2: Testi çalıştır, fail gör**

Run: `cd backend && npx vitest run src/modules/avs-self-service/avs-self-service.test.js -t "my-info inventory_category"`
Expected: FAIL (`inventory_category` undefined).

- [ ] **Step 3: `/my-info` response'unu genişlet**

`routes.js` mevcut `/my-info` route'unda `res.json(w)` satırını şununla değiştir:

```js
    res.json({ ...w, inventory_category: departmentToInventoryCategory(w.department_name) })
```

- [ ] **Step 4: Testi çalıştır, geç**

Run: `cd backend && npx vitest run src/modules/avs-self-service/avs-self-service.test.js -t "my-info inventory_category"`
Expected: PASS.

- [ ] **Step 5: Tüm modül + backend regresyon**

Run: `cd backend && npx vitest run src/modules/avs-self-service/avs-self-service.test.js`
Expected: PASS (mevcut 27 + yeni ~11 test).

Run: `cd backend && npx vitest run`
Expected: PASS (tüm suite — yeni modül + sistem kullanıcısı mevcut testleri bozmadı).

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/avs-self-service/routes.js backend/src/modules/avs-self-service/avs-self-service.test.js
git commit -m "feat(avs-kiosk): expose inventory_category in my-info"
```

---

# PHASE 3 — Frontend: i18n + sekme + envanter paneli

### Task 7: i18n — `nav.inventory` + `inventory` grubu (tr/en/ar)

**Files:**
- Modify: `frontend/src/shared/i18n/dict.js`

`dict.js` üç dil objesi içerir; her birinde `nav: {...}` (kısa etiketler) ve `avs_kiosk` altında alt gruplar var. Aşağıdaki ekler her üç dile yapılır.

- [ ] **Step 1: `nav` gruplarına `inventory` ekle**

TR `nav` (`more: 'Daha fazla',` satırından sonra):
```js
      inventory: 'Malzeme',
```
EN `nav` (`more: 'More',` sonrası):
```js
      inventory: 'Supplies',
```
AR `nav` (`more: 'المزيد',` sonrası):
```js
      inventory: 'المستلزمات',
```

- [ ] **Step 2: Her dile `inventory` grubu ekle**

TR `avs_kiosk` altında (mevcut `meals: {...}` grubunun yanına):
```js
    inventory: {
      title: 'Malzeme Al', search: 'Ürün ara…', quantity: 'Miktar', note: 'Not (opsiyonel)',
      take: 'Aldım', mine: 'Aldıklarım', out_of_stock: 'Tükendi', stock: 'stok',
      location: 'Kaynak konum', choose_location: 'Konum seç',
      none_items: 'Ürün bulunamadı', none_mine: 'Henüz bir şey almadın',
      success: 'Alındı, stoktan düşüldü.', error: 'İşlem başarısız', no_access: 'Envanter erişiminiz yok',
    },
```
EN `avs_kiosk` altında:
```js
    inventory: {
      title: 'Take Supplies', search: 'Search item…', quantity: 'Quantity', note: 'Note (optional)',
      take: 'Take', mine: 'My items', out_of_stock: 'Out of stock', stock: 'in stock',
      location: 'Source location', choose_location: 'Choose location',
      none_items: 'No items found', none_mine: 'Nothing taken yet',
      success: 'Taken, stock updated.', error: 'Operation failed', no_access: 'No inventory access',
    },
```
AR `avs_kiosk` altında:
```js
    inventory: {
      title: 'أخذ المستلزمات', search: 'ابحث عن منتج…', quantity: 'الكمية', note: 'ملاحظة (اختياري)',
      take: 'أخذت', mine: 'ما أخذته', out_of_stock: 'نفد', stock: 'متوفر',
      location: 'الموقع المصدر', choose_location: 'اختر موقعًا',
      none_items: 'لا توجد منتجات', none_mine: 'لم تأخذ شيئًا بعد',
      success: 'تم الأخذ وتحديث المخزون.', error: 'فشلت العملية', no_access: 'لا صلاحية للمخزون',
    },
```

- [ ] **Step 3: Build doğrula**

Run: `cd frontend && npx vite build 2>&1 | tail -5`
Expected: Build başarılı (dict.js parse hatası yok).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/shared/i18n/dict.js
git commit -m "feat(avs-kiosk): i18n for inventory tab (tr/en/ar)"
```

---

### Task 8: Koşullu "Malzeme" sekmesi + envanter paneli

**Files:**
- Modify: `frontend/src/modules/avs-self-service/AvsSelfServicePage.jsx`

- [ ] **Step 1: `TAB_KEYS`'e inventory ekle (10. sekme)**

`TAB_KEYS` dizisinin sonuna (`meals` satırından sonra):
```js
  { key: 'inventory',     icon: '📦', i18n: 'avs_kiosk.nav.inventory' },
```

- [ ] **Step 2: Envanter state'leri ekle**

`pinForm` state tanımının (satır ~50) hemen altına:
```js
  // Envanter
  const [invSearch, setInvSearch] = useState('')
  const [invSelected, setInvSelected] = useState(null)
  const [invQty, setInvQty] = useState(1)
  const [invNote, setInvNote] = useState('')
  const [invLocation, setInvLocation] = useState('')
  const [invMsg, setInvMsg] = useState({ type: '', text: '' })
```

- [ ] **Step 3: `handleLogout`'a envanter reset ekle**

`handleLogout` içinde (`setPinForm(...)` satırının yanına):
```js
    setInvSearch(''); setInvSelected(null); setInvQty(1); setInvNote(''); setInvLocation('')
    setInvMsg({ type: '', text: '' })
```

- [ ] **Step 4: Query + mutation ekle**

`myInfo` query'sinin (satır ~142) altına:
```js
  const hasInventory = !!myInfo?.inventory_category
  const { data: invData } = useQuery({
    queryKey: ['avs-inventory-items', avsToken],
    queryFn: () => avsApi.get('/avs-self-service/inventory/items').then(r => r.data),
    enabled: !!avsToken && activeTab === 'inventory' && hasInventory,
  })
  const { data: myCheckouts = [] } = useQuery({
    queryKey: ['avs-my-checkouts', avsToken],
    queryFn: () => avsApi.get('/avs-self-service/inventory/my-checkouts').then(r => r.data),
    enabled: !!avsToken && activeTab === 'inventory' && hasInventory,
  })
  const { data: invLocations = [] } = useQuery({
    queryKey: ['avs-item-locations', invSelected?.id],
    queryFn: () => avsApi.get(`/avs-self-service/inventory/items/${invSelected.id}/locations`).then(r => r.data),
    enabled: !!avsToken && !!invSelected?.track_locations,
  })
  const submitCheckout = useMutation({
    mutationFn: () => avsApi.post('/avs-self-service/inventory/checkout', {
      item_id: invSelected.id,
      quantity: invQty,
      note: invNote || undefined,
      from_location_id: invSelected?.track_locations ? Number(invLocation) : undefined,
    }),
    onSuccess: () => {
      setInvMsg({ type: 'ok', text: t('avs_kiosk.inventory.success') })
      setInvSelected(null); setInvQty(1); setInvNote(''); setInvLocation('')
      queryClient.invalidateQueries({ queryKey: ['avs-inventory-items'] })
      queryClient.invalidateQueries({ queryKey: ['avs-my-checkouts'] })
    },
    onError: (err) => setInvMsg({ type: 'err', text: err.response?.data?.error || t('avs_kiosk.inventory.error') }),
  })
```

- [ ] **Step 5: Sekme listesini koşullu yap**

`BottomNav` çağrısındaki `tabs={TAB_KEYS.map(...)}` ifadesini, sekme map'ini koşullu filtreleyecek şekilde değiştir. `BottomNav`'dan hemen önce bir değişken tanımla (return JSX içinde, `<BottomNav` satırından önce mümkün değilse map'i inline filtrele). Mevcut:
```jsx
      <BottomNav
        tabs={TAB_KEYS.map(tb => ({ key: tb.key, icon: tb.icon, label: t(tb.i18n), badge: tb.key === 'announcements' ? unreadCount : 0 }))}
        active={activeTab} onChange={setActiveTab} moreLabel={t('avs_kiosk.nav.more')} />
```
Şununla değiştir:
```jsx
      <BottomNav
        tabs={TAB_KEYS
          .filter(tb => tb.key !== 'inventory' || hasInventory)
          .map(tb => ({ key: tb.key, icon: tb.icon, label: t(tb.i18n), badge: tb.key === 'announcements' ? unreadCount : 0 }))}
        active={activeTab} onChange={setActiveTab} moreLabel={t('avs_kiosk.nav.more')} />
```

- [ ] **Step 6: Envanter paneli JSX ekle**

`meals` panelinin (`{activeTab === 'meals' && (...)}`) hemen ardına, `<BottomNav`'dan önce:

```jsx
      {activeTab === 'inventory' && hasInventory && (
        <div className="space-y-4 pb-4">
          <h2 className="font-medium text-slate-300">{t('avs_kiosk.inventory.title')}</h2>

          {/* Seçili ürün formu */}
          {invSelected ? (
            <div className="bg-slate-900 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-medium text-slate-100">{invSelected.item_name}</div>
                <button onClick={() => { setInvSelected(null); setInvLocation('') }}
                  className="text-xs text-slate-500">{t('avs_kiosk.change')}</button>
              </div>
              <div className="text-xs text-slate-500">{invSelected.quantity} {invSelected.unit} {t('avs_kiosk.inventory.stock')}</div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">{t('avs_kiosk.inventory.quantity')}</label>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setInvQty(q => Math.max(1, q - 1))}
                    className="w-10 h-10 rounded-xl bg-slate-800 text-slate-200 text-xl">−</button>
                  <span className="text-xl text-slate-100 w-10 text-center">{invQty}</span>
                  <button type="button" onClick={() => setInvQty(q => Math.min(invSelected.quantity, q + 1))}
                    className="w-10 h-10 rounded-xl bg-slate-800 text-slate-200 text-xl">+</button>
                </div>
              </div>

              {invSelected.track_locations ? (
                <div>
                  <label className="block text-sm text-slate-400 mb-1">{t('avs_kiosk.inventory.location')}</label>
                  <select value={invLocation} onChange={e => setInvLocation(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100">
                    <option value="">{t('avs_kiosk.inventory.choose_location')}</option>
                    {invLocations.map(l => (
                      <option key={l.location_id} value={l.location_id}>
                        {l.block ? `${l.block} · ` : ''}{l.name} ({l.quantity})
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div>
                <label className="block text-sm text-slate-400 mb-1">{t('avs_kiosk.inventory.note')}</label>
                <input type="text" value={invNote} onChange={e => setInvNote(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100" />
              </div>

              <button type="button" disabled={submitCheckout.isPending || (invSelected.track_locations && !invLocation)}
                onClick={() => { setInvMsg({ type: '', text: '' }); submitCheckout.mutate() }}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-xl py-3 font-medium">
                {t('avs_kiosk.inventory.take')}
              </button>
            </div>
          ) : (
            <>
              <input type="text" value={invSearch} onChange={e => setInvSearch(e.target.value)}
                placeholder={t('avs_kiosk.inventory.search')}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-100" />
              <div className="space-y-2">
                {!invData ? (
                  <div className="bg-slate-900 rounded-2xl p-5 text-slate-500 text-sm">{t('avs_kiosk.loading')}</div>
                ) : (() => {
                  const filtered = (invData.items || []).filter(i =>
                    i.item_name.toLowerCase().includes(invSearch.toLowerCase()))
                  if (filtered.length === 0)
                    return <div className="bg-slate-900 rounded-2xl p-5 text-slate-400 text-sm">{t('avs_kiosk.inventory.none_items')}</div>
                  return filtered.map(i => {
                    const out = i.quantity <= 0
                    return (
                      <button key={i.id} type="button" disabled={out}
                        onClick={() => { setInvSelected(i); setInvQty(1); setInvNote(''); setInvLocation(''); setInvMsg({ type: '', text: '' }) }}
                        className={`w-full text-left bg-slate-900 rounded-xl px-4 py-3 flex justify-between items-center ${out ? 'opacity-50' : 'hover:bg-slate-800'}`}>
                        <span className="text-sm text-slate-200">{i.item_name}</span>
                        <span className={`text-xs ${out ? 'text-red-400' : 'text-slate-500'}`}>
                          {out ? t('avs_kiosk.inventory.out_of_stock') : `${i.quantity} ${i.unit}`}
                        </span>
                      </button>
                    )
                  })
                })()}
              </div>
            </>
          )}

          {invMsg.text && (
            <div className={`text-sm text-center ${invMsg.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>{invMsg.text}</div>
          )}

          {/* Aldıklarım */}
          <div>
            <h3 className="text-sm font-medium text-slate-400 mb-2">{t('avs_kiosk.inventory.mine')}</h3>
            {myCheckouts.length === 0 ? (
              <div className="bg-slate-900 rounded-2xl p-4 text-slate-500 text-sm">{t('avs_kiosk.inventory.none_mine')}</div>
            ) : (
              <div className="space-y-2">
                {myCheckouts.map(c => (
                  <div key={c.id} className="bg-slate-900 rounded-xl px-4 py-2 flex justify-between text-sm">
                    <span className="text-slate-200">{c.item_name}</span>
                    <span className="text-slate-500">{c.quantity} {c.unit}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
```

- [ ] **Step 7: Build doğrula**

Run: `cd frontend && npx vite build 2>&1 | tail -5`
Expected: Build başarılı.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/modules/avs-self-service/AvsSelfServicePage.jsx
git commit -m "feat(avs-kiosk): inventory tab — item list, checkout, my-items, locations"
```

---

### Task 9: Dev'de manuel doğrulama + pre-deploy

**Files:** (yok — doğrulama)

- [ ] **Step 1: Dev başlat ve akışı doğrula**

Run: `npm run dev` (root). Tarayıcı: `http://localhost:5173/avs-kiosk` (veya 5174).
- `mudur/admin123` panelden bir AVS worker'a Temizlik departmanı ata + PIN ver + housekeeping/general envanter ürünleri olduğundan emin ol.
- Kioskta o worker ile giriş → "Daha fazla" → "📦 Malzeme" sekmesi görünür.
- Ürün seç → miktar + (gerekirse) konum + not → "Aldım" → başarı mesajı, "Aldıklarım"da görünür, ürün stoğu düşer.
- Eşleşmeyen departmanlı (ör. Güvenlik) worker'da "Malzeme" sekmesi **görünmez**.

Expected: Akış sorunsuz, JS/console hatası yok.

- [ ] **Step 2: Pre-deploy kontrol**

Run: `bash scripts/deploy/pre-deploy-check.sh`
Expected: Backend tüm suite + frontend build geçer ("TÜM KONTROLLER GEÇTİ").

- [ ] **Step 3: (Manuel doğrulama sonrası) commit gerekmez — kod zaten commit'li**

---

## Self-Review Notu

- **Spec kapsamı:** items (Task 2), checkout (Task 3), locations (Task 4), my-checkouts (Task 5), my-info genişletme (Task 6), sistem kullanıcısı + dept→kategori (Task 1), i18n (Task 7), koşullu sekme + panel (Task 8), doğrulama (Task 9) — tüm spec maddeleri kapsandı.
- **Frontend mapping fonksiyonu** bilinçli olarak çıkarıldı (backend `inventory_category` döndürüyor — YAGNI; yukarıda gerekçe).
- **Tip tutarlılığı:** `checkoutToStaff(itemId, staffId, qty, note, userId, fromLocationId)` imzası Task 3'te birebir; `getStaffCheckouts` çıktısı (`item_name, unit, quantity`) Task 5 ve Task 8 panelinde tutarlı; `inventory_category` Task 6 (backend) ↔ Task 8 (`myInfo.inventory_category`) tutarlı.
- **Şema değişikliği yok** — yalnızca idempotent `INSERT OR IGNORE` ile sistem kullanıcısı satırı.
