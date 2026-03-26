# Çamaşırhane Modülü Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mevcut QR torba sistemini kaldırıp kişisel çamaşır parça takibi (dirty→washing→ready→delivered), makine yönetimi, SLA motoru ve WhatsApp bildirimiyle tam donanımlı laundry modülü yaz.

**Architecture:** Backend `backend/src/modules/laundry/` — routes/service/queries/sla/whatsapp. Frontend `frontend/src/modules/laundry/` — React Query + lazy-loaded pages. DB: 6 yeni tablo (`laundry_items`, `laundry_machines`, `laundry_queue`, `laundry_deliveries`, `laundry_damages`, `laundry_sla_config`, `laundry_history`) migration ile eklenir.

**Tech Stack:** Express, better-sqlite3, node-cron, multer (upload zaten var), React 18, @tanstack/react-query, zustand, axios

---

## ÖNEMLI: Mevcut Durum

`backend/src/modules/laundry/` — queries.js, service.js, routes.js **tamamen değiştirilecek** (QR torba sistemi kaldırılıyor).
`frontend/src/modules/laundry/LaundryPage.jsx` — **tamamen değiştirilecek**.
`QRScanner.jsx`, `DistributionRoute.jsx` — silinecek.
Mevcut `laundry_bags` ve `machines` tabloları — dokunulmayacak (geçmiş veri korunur).
Yeni `laundry_machines` tablosu ayrı olarak oluşturulacak.

Test kullanıcısı: `camasir/admin123` (role: `laundry`)

---

## FAZ 1 — DB Migration + Çekirdek CRUD

### Task 1: DB Migration — 7 yeni tablo

**Files:**
- Modify: `backend/src/shared/db/index.js`

- [ ] **Step 1: Mevcut index.js sonuna migration ekle**

`backend/src/shared/db/index.js` dosyasındaki `initDB()` fonksiyonunun sonuna ekle:

```javascript
  // Laundry v2 — kişisel parça takibi
  try { db.exec(`CREATE TABLE IF NOT EXISTS laundry_machines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'washer' CHECK(type IN ('washer','dryer')),
    status TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle','running','done','maintenance')),
    timer_end TEXT,
    capacity_kg REAL DEFAULT 10,
    maintenance_notes TEXT
  )`) } catch(_) {}

  try { db.exec(`CREATE TABLE IF NOT EXISTS laundry_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER REFERENCES rooms(id),
    status TEXT NOT NULL DEFAULT 'dirty' CHECK(status IN ('dirty','washing','ready','delivered','lost')),
    machine_id INTEGER REFERENCES laundry_machines(id),
    urgent INTEGER NOT NULL DEFAULT 0,
    item_count INTEGER NOT NULL DEFAULT 1,
    item_details TEXT,
    shelf_location TEXT,
    photo_url TEXT,
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`) } catch(_) {}

  try { db.exec(`CREATE TABLE IF NOT EXISTS laundry_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES laundry_items(id) ON DELETE CASCADE,
    machine_id INTEGER REFERENCES laundry_machines(id),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal','urgent')),
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`) } catch(_) {}

  try { db.exec(`CREATE TABLE IF NOT EXISTS laundry_deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES laundry_items(id),
    delivered_to TEXT NOT NULL,
    signature_data TEXT,
    delivered_by INTEGER REFERENCES users(id),
    delivered_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`) } catch(_) {}

  try { db.exec(`CREATE TABLE IF NOT EXISTS laundry_damages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES laundry_items(id),
    photo_url TEXT,
    description TEXT NOT NULL,
    reported_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`) } catch(_) {}

  try { db.exec(`CREATE TABLE IF NOT EXISTS laundry_sla_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stage TEXT NOT NULL UNIQUE CHECK(stage IN ('dirty','washing','ready')),
    warning_hours REAL NOT NULL DEFAULT 24,
    critical_hours REAL NOT NULL DEFAULT 48,
    updated_by INTEGER REFERENCES users(id),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`) } catch(_) {}

  try { db.exec(`CREATE TABLE IF NOT EXISTS laundry_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES laundry_items(id),
    from_status TEXT,
    to_status TEXT NOT NULL,
    action_by INTEGER REFERENCES users(id),
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`) } catch(_) {}

  // SLA default config
  try { db.exec(`INSERT OR IGNORE INTO laundry_sla_config(stage,warning_hours,critical_hours) VALUES
    ('dirty',24,48),('washing',1,2),('ready',24,48)`) } catch(_) {}

  // Seed makineler (ilk kurulum)
  try {
    const mCount = db.prepare('SELECT COUNT(*) as c FROM laundry_machines').get()
    if (mCount.c === 0) {
      db.exec(`INSERT INTO laundry_machines(name,type) VALUES
        ('Makine 1','washer'),('Makine 2','washer'),('Makine 3','washer'),('Kurutucu 1','dryer')`)
    }
  } catch(_) {}
```

- [ ] **Step 2: Migration'ı test et**

```bash
cd backend && node -e "import('./src/shared/db/index.js').then(m=>{m.initDB();const db=m.getDB();console.log(db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'laundry%'\").all())})"
```

Beklenen: `laundry_machines`, `laundry_items`, `laundry_queue`, `laundry_deliveries`, `laundry_damages`, `laundry_sla_config`, `laundry_history` listesi.

- [ ] **Step 3: Commit**

```bash
cd backend && git add src/shared/db/index.js && git commit -m "feat: laundry v2 — DB migration 7 yeni tablo"
```

---

### Task 2: Backend — queries.js

**Files:**
- Overwrite: `backend/src/modules/laundry/queries.js`

- [ ] **Step 1: Failing test yaz** (`backend/src/modules/laundry/laundry.test.js` başına ekle)

```javascript
import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token, managerId

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const r = await request(app).post('/api/auth/login').send({ username: 'camasir', password: 'admin123' })
  token = r.body.token
})

describe('Laundry queries', () => {
  it('creates item and reads it back', async () => {
    const db = getDB()
    const room = db.prepare("SELECT id FROM rooms LIMIT 1").get()
    const userId = db.prepare("SELECT id FROM users WHERE role='laundry' LIMIT 1").get()
    const { insertItemQuery, getItemQuery } = await import('./queries.js')
    const id = insertItemQuery({ room_id: room.id, item_count: 3, notes: 'test', created_by: userId.id })
    const item = getItemQuery(id)
    expect(item.status).toBe('dirty')
    expect(item.item_count).toBe(3)
  })
})
```

- [ ] **Step 2: Test çalıştır — FAIL bekleniyor**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js
```

- [ ] **Step 3: queries.js'i yaz**

`backend/src/modules/laundry/queries.js` içeriğini tamamen değiştir:

```javascript
import { getDB } from '../../shared/db/index.js'

// ── Items ─────────────────────────────────────────────────────────────────
export function insertItemQuery({ room_id, item_count = 1, item_details, notes, urgent = 0, created_by }) {
  const db = getDB()
  const r = db.prepare(`
    INSERT INTO laundry_items(room_id,item_count,item_details,notes,urgent,created_by,updated_at)
    VALUES(?,?,?,?,?,?,datetime('now'))
  `).run(room_id, item_count, item_details || null, notes || null, urgent ? 1 : 0, created_by)
  return r.lastInsertRowid
}

export function getItemQuery(id) {
  const db = getDB()
  return db.prepare(`
    SELECT li.*, r.block, r.room_no, r.floor,
           u.full_name as created_by_name,
           m.name as machine_name
    FROM laundry_items li
    LEFT JOIN rooms r ON r.id = li.room_id
    LEFT JOIN users u ON u.id = li.created_by
    LEFT JOIN laundry_machines m ON m.id = li.machine_id
    WHERE li.id = ?
  `).get(id)
}

export function listItemsQuery({ status, urgent, sla_only } = {}) {
  const db = getDB()
  let where = "li.status != 'delivered'"
  const params = []
  if (status) { where += ' AND li.status = ?'; params.push(status) }
  if (urgent) { where += ' AND li.urgent = 1' }
  if (sla_only) {
    where += ` AND (
      SELECT CASE
        WHEN li.status='dirty' THEN (julianday('now') - julianday(li.created_at)) * 24
        WHEN li.status='washing' THEN (julianday('now') - julianday(li.updated_at)) * 24
        WHEN li.status='ready' THEN (julianday('now') - julianday(li.updated_at)) * 24
        ELSE 0
      END
    ) >= (SELECT warning_hours FROM laundry_sla_config WHERE stage = li.status LIMIT 1)`
  }
  return db.prepare(`
    SELECT li.*, r.block, r.room_no,
           u.full_name as created_by_name,
           m.name as machine_name,
           CASE
             WHEN li.status IN ('dirty','washing','ready')
             THEN ROUND((julianday('now') - julianday(li.updated_at)) * 24, 1)
             ELSE NULL
           END as hours_in_status
    FROM laundry_items li
    LEFT JOIN rooms r ON r.id = li.room_id
    LEFT JOIN users u ON u.id = li.created_by
    LEFT JOIN laundry_machines m ON m.id = li.machine_id
    WHERE ${where}
    ORDER BY li.urgent DESC, li.updated_at ASC
  `).all(...params)
}

export function updateItemStatusQuery(id, status, extra = {}) {
  const db = getDB()
  const sets = ["status=?", "updated_at=datetime('now')"]
  const vals = [status]
  if (extra.machine_id !== undefined) { sets.push('machine_id=?'); vals.push(extra.machine_id) }
  if (extra.shelf_location !== undefined) { sets.push('shelf_location=?'); vals.push(extra.shelf_location) }
  vals.push(id)
  db.prepare(`UPDATE laundry_items SET ${sets.join(',')} WHERE id=?`).run(...vals)
}

export function deleteItemQuery(id) {
  const db = getDB()
  db.prepare("DELETE FROM laundry_items WHERE id=? AND status='dirty'").run(id)
}

// ── Machines ──────────────────────────────────────────────────────────────
export function listMachinesQuery() {
  const db = getDB()
  return db.prepare('SELECT * FROM laundry_machines ORDER BY type, name').all()
}

export function getMachineQuery(id) {
  const db = getDB()
  return db.prepare('SELECT * FROM laundry_machines WHERE id=?').get(id)
}

export function updateMachineQuery(id, fields) {
  const db = getDB()
  const sets = Object.keys(fields).map(k => `${k}=?`)
  db.prepare(`UPDATE laundry_machines SET ${sets.join(',')} WHERE id=?`).run(...Object.values(fields), id)
}

export function insertMachineQuery({ name, type = 'washer', capacity_kg = 10 }) {
  const db = getDB()
  return db.prepare('INSERT INTO laundry_machines(name,type,capacity_kg) VALUES(?,?,?)').run(name, type, capacity_kg).lastInsertRowid
}

// ── Deliveries ────────────────────────────────────────────────────────────
export function insertDeliveryQuery({ item_id, delivered_to, signature_data, delivered_by }) {
  const db = getDB()
  db.prepare(`
    INSERT INTO laundry_deliveries(item_id,delivered_to,signature_data,delivered_by)
    VALUES(?,?,?,?)
  `).run(item_id, delivered_to, signature_data || null, delivered_by)
}

// ── History ───────────────────────────────────────────────────────────────
export function insertHistoryQuery({ item_id, from_status, to_status, action_by, notes }) {
  const db = getDB()
  db.prepare(`
    INSERT INTO laundry_history(item_id,from_status,to_status,action_by,notes)
    VALUES(?,?,?,?,?)
  `).run(item_id, from_status || null, to_status, action_by, notes || null)
}

// ── SLA ───────────────────────────────────────────────────────────────────
export function getSlaConfigQuery() {
  const db = getDB()
  return db.prepare('SELECT * FROM laundry_sla_config ORDER BY stage').all()
}

export function upsertSlaConfigQuery({ stage, warning_hours, critical_hours, updated_by }) {
  const db = getDB()
  db.prepare(`
    INSERT INTO laundry_sla_config(stage,warning_hours,critical_hours,updated_by,updated_at)
    VALUES(?,?,?,?,datetime('now'))
    ON CONFLICT(stage) DO UPDATE SET
      warning_hours=excluded.warning_hours,
      critical_hours=excluded.critical_hours,
      updated_by=excluded.updated_by,
      updated_at=excluded.updated_at
  `).run(stage, warning_hours, critical_hours, updated_by)
}

export function getSlaViolationsQuery() {
  const db = getDB()
  return db.prepare(`
    SELECT li.*, r.block, r.room_no,
      sc.warning_hours, sc.critical_hours,
      ROUND((julianday('now') - julianday(li.updated_at)) * 24, 1) as hours_in_status,
      CASE
        WHEN ROUND((julianday('now') - julianday(li.updated_at)) * 24, 1) >= sc.critical_hours THEN 'critical'
        ELSE 'warning'
      END as sla_level
    FROM laundry_items li
    LEFT JOIN rooms r ON r.id = li.room_id
    LEFT JOIN laundry_sla_config sc ON sc.stage = li.status
    WHERE li.status IN ('dirty','washing','ready')
      AND sc.warning_hours IS NOT NULL
      AND ROUND((julianday('now') - julianday(li.updated_at)) * 24, 1) >= sc.warning_hours
    ORDER BY hours_in_status DESC
  `).all()
}

// ── Reports ───────────────────────────────────────────────────────────────
export function getStatsQuery({ from_date, to_date } = {}) {
  const db = getDB()
  const dateFilter = from_date && to_date
    ? `AND li.created_at BETWEEN '${from_date}' AND '${to_date}'`
    : ''
  return {
    by_status: db.prepare(`
      SELECT status, COUNT(*) as count FROM laundry_items
      WHERE status != 'delivered' GROUP BY status
    `).all(),
    delivered_today: db.prepare(`
      SELECT COUNT(*) as count FROM laundry_deliveries
      WHERE date(delivered_at) = date('now')
    `).get(),
    avg_hours: db.prepare(`
      SELECT li.status,
        ROUND(AVG((julianday('now') - julianday(li.updated_at)) * 24), 1) as avg_h
      FROM laundry_items li
      WHERE li.status IN ('dirty','washing','ready')
      GROUP BY li.status
    `).all(),
    sla_violations: db.prepare(`
      SELECT COUNT(*) as count FROM laundry_items li
      LEFT JOIN laundry_sla_config sc ON sc.stage = li.status
      WHERE li.status IN ('dirty','washing','ready')
        AND ROUND((julianday('now') - julianday(li.updated_at)) * 24, 1) >= sc.warning_hours
    `).get(),
  }
}
```

- [ ] **Step 4: Testi çalıştır — PASS bekleniyor**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/laundry/queries.js src/modules/laundry/laundry.test.js && git commit -m "feat: laundry queries — items, machines, SLA, delivery, history"
```

---

### Task 3: Backend — service.js + state machine

**Files:**
- Overwrite: `backend/src/modules/laundry/service.js`

- [ ] **Step 1: Test ekle** (laundry.test.js'e describe bloğu ekle)

```javascript
describe('State machine', () => {
  let itemId

  it('creates dirty item', async () => {
    const res = await request(app)
      .post('/api/laundry/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ room_id: 1, item_count: 2, notes: 'test' })
    expect(res.status).toBe(201)
    expect(res.body.id).toBeTruthy()
    itemId = res.body.id
  })

  it('rejects advance without machine when going to washing', async () => {
    const res = await request(app)
      .patch(`/api/laundry/items/${itemId}/advance`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
    expect(res.status).toBe(400)
  })

  it('advances dirty → washing with machine', async () => {
    const res = await request(app)
      .patch(`/api/laundry/items/${itemId}/advance`)
      .set('Authorization', `Bearer ${token}`)
      .send({ machine_id: 1 })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('washing')
  })

  it('advances washing → ready with shelf', async () => {
    const res = await request(app)
      .patch(`/api/laundry/items/${itemId}/advance`)
      .set('Authorization', `Bearer ${token}`)
      .send({ shelf_location: '2. Kat' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ready')
  })

  it('delivers with name', async () => {
    const res = await request(app)
      .patch(`/api/laundry/items/${itemId}/deliver`)
      .set('Authorization', `Bearer ${token}`)
      .send({ delivered_to: 'Ahmet Yılmaz' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('delivered')
  })

  it('rejects delivery without name', async () => {
    const res = await request(app)
      .patch(`/api/laundry/items/${itemId}/deliver`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Test çalıştır — FAIL bekleniyor**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js
```

- [ ] **Step 3: service.js yaz**

`backend/src/modules/laundry/service.js` içeriğini tamamen değiştir:

```javascript
import * as q from './queries.js'
import { createNotification } from '../../shared/notifications/service.js'
import { logAudit } from '../../shared/audit.js'

const TRANSITIONS = {
  dirty: 'washing',
  washing: 'ready',
  ready: 'delivered',
}

export function createItemService({ room_id, item_count, item_details, notes, urgent }, userId) {
  if (!room_id) throw new Error('Oda seçilmeli')
  if (!item_count || item_count < 1) throw new Error('Parça adedi en az 1 olmalı')
  const id = q.insertItemQuery({ room_id, item_count, item_details, notes, urgent, created_by: userId })
  logAudit(userId, 'laundry_create', 'laundry', id, `${item_count} parça`)
  return q.getItemQuery(id)
}

export function advanceItemService(id, { machine_id, shelf_location }, userId) {
  const item = q.getItemQuery(id)
  if (!item) throw new Error('Kayıt bulunamadı')
  if (!TRANSITIONS[item.status]) throw new Error(`${item.status} durumundan ilerlenemez`)

  const nextStatus = TRANSITIONS[item.status]
  const extra = {}

  if (nextStatus === 'washing') {
    if (!machine_id) throw new Error('Makine seçilmeli')
    extra.machine_id = machine_id
    // Makineyi çalışır yap
    q.updateMachineQuery(machine_id, { status: 'running', timer_end: null })
  }

  if (nextStatus === 'ready') {
    extra.shelf_location = shelf_location || null
    // Makineyi serbest bırak
    if (item.machine_id) q.updateMachineQuery(item.machine_id, { status: 'done', timer_end: null })
    // SSE bildirimi
    createNotification({
      message: `${item.block || '?'} ${item.room_no || '?'} — ${item.item_count} parça rafta hazır`,
      type: 'info',
      module: 'laundry',
      target_role: 'laundry',
    })
  }

  q.updateItemStatusQuery(id, nextStatus, extra)
  q.insertHistoryQuery({ item_id: id, from_status: item.status, to_status: nextStatus, action_by: userId })
  logAudit(userId, 'laundry_advance', 'laundry', id, `${item.status} → ${nextStatus}`)

  return q.getItemQuery(id)
}

export function deliverItemService(id, { delivered_to, signature_data }, userId) {
  if (!delivered_to || !delivered_to.trim()) throw new Error('Teslim alanın adı zorunlu')
  const item = q.getItemQuery(id)
  if (!item) throw new Error('Kayıt bulunamadı')
  if (item.status !== 'ready') throw new Error('Sadece rafta hazır kayıtlar teslim edilebilir')

  q.insertDeliveryQuery({ item_id: id, delivered_to: delivered_to.trim(), signature_data, delivered_by: userId })
  q.updateItemStatusQuery(id, 'delivered')
  q.insertHistoryQuery({ item_id: id, from_status: 'ready', to_status: 'delivered', action_by: userId, notes: `Teslim: ${delivered_to}` })
  logAudit(userId, 'laundry_deliver', 'laundry', id, `→ ${delivered_to}`)

  return q.getItemQuery(id)
}

export function lostItemService(id, { notes }, userId) {
  const item = q.getItemQuery(id)
  if (!item) throw new Error('Kayıt bulunamadı')
  q.updateItemStatusQuery(id, 'lost')
  q.insertHistoryQuery({ item_id: id, from_status: item.status, to_status: 'lost', action_by: userId, notes })
  logAudit(userId, 'laundry_lost', 'laundry', id, notes || '')
  return q.getItemQuery(id)
}

export function deleteItemService(id, userId) {
  const item = q.getItemQuery(id)
  if (!item) throw new Error('Kayıt bulunamadı')
  if (item.status !== 'dirty') throw new Error('Sadece sepetteki kayıtlar silinebilir')
  q.deleteItemQuery(id)
  logAudit(userId, 'laundry_delete', 'laundry', id, '')
}

export const listItemsService     = q.listItemsQuery
export const getItemService       = q.getItemQuery
export const listMachinesService  = q.listMachinesQuery
export const getMachineService    = q.getMachineQuery
export const createMachineService = ({ name, type, capacity_kg }, userId) => {
  const id = q.insertMachineQuery({ name, type, capacity_kg })
  logAudit(userId, 'machine_create', 'laundry', id, name)
  return q.getMachineQuery(id)
}
export const updateMachineService = (id, fields, userId) => {
  q.updateMachineQuery(id, fields)
  logAudit(userId, 'machine_update', 'laundry', id, JSON.stringify(fields))
  return q.getMachineQuery(id)
}
export const getSlaConfigService      = q.getSlaConfigQuery
export const upsertSlaConfigService   = q.upsertSlaConfigQuery
export const getSlaViolationsService  = q.getSlaViolationsQuery
export const getStatsService          = q.getStatsQuery
```

- [ ] **Step 4: Test çalıştır — PASS bekleniyor**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/laundry/service.js src/modules/laundry/laundry.test.js && git commit -m "feat: laundry service — state machine, teslim, kayıp"
```

---

### Task 4: Backend — routes.js

**Files:**
- Overwrite: `backend/src/modules/laundry/routes.js`

- [ ] **Step 1: Route testleri ekle** (laundry.test.js'e)

```javascript
describe('Laundry routes — yetki', () => {
  it('401 token yok', async () => {
    const res = await request(app).get('/api/laundry/items')
    expect(res.status).toBe(401)
  })

  it('403 yanlış rol', async () => {
    const r2 = await request(app).post('/api/auth/login').send({ username: 'teknik', password: 'admin123' })
    const res = await request(app)
      .get('/api/laundry/items')
      .set('Authorization', `Bearer ${r2.body.token}`)
    expect(res.status).toBe(403)
  })

  it('200 laundry rolü items listesi', async () => {
    const res = await request(app)
      .get('/api/laundry/items')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('200 machines listesi', async () => {
    const res = await request(app)
      .get('/api/laundry/machines')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Test çalıştır — FAIL bekleniyor**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js
```

- [ ] **Step 3: routes.js yaz**

`backend/src/modules/laundry/routes.js` içeriğini tamamen değiştir:

```javascript
import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import * as svc from './service.js'

export const laundryRouter = Router()

const laundryFull = requireRole('laundry')
const laundryRead = requireRole('laundry', 'shift_supervisor', 'campus_manager')
const slaWrite    = requireRole('laundry', 'campus_manager')

// ── Items ──────────────────────────────────────────────────────────────────
laundryRouter.get('/items', ...laundryRead, (req, res) => {
  try {
    const { status, urgent, sla_only } = req.query
    res.json(svc.listItemsService({
      status: status || undefined,
      urgent: urgent === '1',
      sla_only: sla_only === '1',
    }))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

laundryRouter.get('/items/:id', ...laundryRead, (req, res) => {
  const item = svc.getItemService(+req.params.id)
  if (!item) return res.status(404).json({ error: 'Kayıt bulunamadı' })
  res.json(item)
})

laundryRouter.post('/items', ...laundryFull, (req, res) => {
  try {
    const item = svc.createItemService(req.body, req.user.id)
    res.status(201).json(item)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.patch('/items/:id/advance', ...laundryFull, (req, res) => {
  try {
    const item = svc.advanceItemService(+req.params.id, req.body, req.user.id)
    res.json(item)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.patch('/items/:id/deliver', ...laundryFull, (req, res) => {
  try {
    const item = svc.deliverItemService(+req.params.id, req.body, req.user.id)
    res.json(item)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.patch('/items/:id/lost', ...laundryFull, (req, res) => {
  try {
    const item = svc.lostItemService(+req.params.id, req.body, req.user.id)
    res.json(item)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.delete('/items/:id', ...laundryFull, (req, res) => {
  try {
    svc.deleteItemService(+req.params.id, req.user.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Machines ───────────────────────────────────────────────────────────────
laundryRouter.get('/machines', ...laundryRead, (req, res) => {
  res.json(svc.listMachinesService())
})

laundryRouter.post('/machines', ...laundryFull, (req, res) => {
  try {
    const m = svc.createMachineService(req.body, req.user.id)
    res.status(201).json(m)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.patch('/machines/:id', ...laundryFull, (req, res) => {
  try {
    const allowed = ['status', 'timer_end', 'maintenance_notes', 'name', 'capacity_kg']
    const fields = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)))
    if (!Object.keys(fields).length) return res.status(400).json({ error: 'Güncellenecek alan yok' })
    const m = svc.updateMachineService(+req.params.id, fields, req.user.id)
    res.json(m)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── SLA ────────────────────────────────────────────────────────────────────
laundryRouter.get('/sla-config', ...laundryRead, (req, res) => {
  res.json(svc.getSlaConfigService())
})

laundryRouter.put('/sla-config', ...slaWrite, (req, res) => {
  try {
    const { stage, warning_hours, critical_hours } = req.body
    if (!stage || !warning_hours || !critical_hours) return res.status(400).json({ error: 'stage, warning_hours, critical_hours zorunlu' })
    svc.upsertSlaConfigService({ stage, warning_hours: +warning_hours, critical_hours: +critical_hours, updated_by: req.user.id })
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.get('/sla/violations', ...laundryRead, (req, res) => {
  res.json(svc.getSlaViolationsService())
})

// ── Reports ────────────────────────────────────────────────────────────────
laundryRouter.get('/reports/stats', ...laundryRead, (req, res) => {
  res.json(svc.getStatsService(req.query))
})

laundryRouter.get('/reports/export', ...laundryRead, (req, res) => {
  try {
    const items = svc.listItemsService({})
    const csv = [
      'ID,Blok,Oda,Durum,Parça,Acil,Oluşturulma',
      ...items.map(i => [i.id, i.block||'', i.room_no||'', i.status, i.item_count, i.urgent?'Evet':'Hayır', i.created_at].join(','))
    ].join('\n')
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="laundry-export.csv"')
    res.send('\uFEFF' + csv)
  } catch (e) { res.status(500).json({ error: e.message }) }
})
```

- [ ] **Step 4: Tüm testleri çalıştır — PASS bekleniyor**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/laundry/routes.js src/modules/laundry/laundry.test.js && git commit -m "feat: laundry routes — items, machines, SLA, reports, yetki matrisi"
```

---

## FAZ 2 — Makine Zamanlayıcı + SLA Cron

### Task 5: SLA motoru + cron entegrasyonu

**Files:**
- Create: `backend/src/modules/laundry/sla.js`
- Modify: `backend/src/shared/cron/index.js`

- [ ] **Step 1: sla.js yaz**

`backend/src/modules/laundry/sla.js` oluştur:

```javascript
import { getDB } from '../../shared/db/index.js'
import { createNotification } from '../../shared/notifications/service.js'

export function checkSlaViolations() {
  const db = getDB()
  const violations = db.prepare(`
    SELECT li.id, li.status, r.block, r.room_no, li.item_count,
      ROUND((julianday('now') - julianday(li.updated_at)) * 24, 1) as hours,
      sc.warning_hours, sc.critical_hours
    FROM laundry_items li
    LEFT JOIN rooms r ON r.id = li.room_id
    LEFT JOIN laundry_sla_config sc ON sc.stage = li.status
    WHERE li.status IN ('dirty','washing','ready')
      AND sc.warning_hours IS NOT NULL
      AND ROUND((julianday('now') - julianday(li.updated_at)) * 24, 1) >= sc.warning_hours
  `).all()

  for (const v of violations) {
    const isCritical = v.hours >= v.critical_hours
    const level = isCritical ? 'critical' : 'warning'
    const label = { dirty: 'Kirli sepette', washing: 'Makinede', ready: 'Rafta hazır' }[v.status]

    createNotification({
      message: `SLA ${isCritical ? '🔴 KRİTİK' : '🟡 UYARI'}: ${v.block||'?'} ${v.room_no||'?'} — ${label} ${v.hours} saattir`,
      type: isCritical ? 'critical' : 'warning',
      module: 'laundry',
      target_role: isCritical ? null : 'shift_supervisor',
    })
  }

  return violations.length
}

export function checkMachineTimers() {
  const db = getDB()
  const done = db.prepare(`
    SELECT * FROM laundry_machines
    WHERE status='running'
      AND timer_end IS NOT NULL
      AND datetime('now') >= datetime(timer_end)
  `).all()

  for (const m of done) {
    db.prepare("UPDATE laundry_machines SET status='done' WHERE id=?").run(m.id)
    createNotification({
      message: `⚙️ ${m.name} tamamlandı — çamaşırları rafa kaldırın`,
      type: 'info',
      module: 'laundry',
      target_role: 'laundry',
    })
  }

  return done.length
}
```

- [ ] **Step 2: cron/index.js'e laundry cronları ekle**

`backend/src/shared/cron/index.js` dosyasındaki `startCronJobs` fonksiyonuna ekle:

```javascript
  // Laundry — her 15 dakikada SLA kontrolü
  cron.schedule('*/15 * * * *', () => {
    try {
      const { checkSlaViolations, checkMachineTimers } = await import('../../modules/laundry/sla.js')
      checkSlaViolations()
      checkMachineTimers()
    } catch (e) { console.error('[Cron] Laundry SLA hatası:', e) }
  })
```

Not: `cron/index.js` dosyası ESM (`type: module`) kullandığından dynamic import kullan. Dosyanın başına static import eklemek daha temiz — `import` satırını dosya başına al:

```javascript
import { checkSlaViolations, checkMachineTimers } from '../../modules/laundry/sla.js'
```

Ve cron body'de:
```javascript
cron.schedule('*/15 * * * *', () => {
  try { checkSlaViolations(); checkMachineTimers() }
  catch (e) { console.error('[Cron] Laundry SLA hatası:', e) }
})
```

- [ ] **Step 3: SLA test yaz ve çalıştır**

laundry.test.js'e ekle:

```javascript
describe('SLA engine', () => {
  it('checkSlaViolations fonksiyon hata vermez', async () => {
    const { checkSlaViolations } = await import('./sla.js')
    expect(() => checkSlaViolations()).not.toThrow()
  })

  it('checkMachineTimers fonksiyon hata vermez', async () => {
    const { checkMachineTimers } = await import('./sla.js')
    expect(() => checkMachineTimers()).not.toThrow()
  })
})
```

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js
```

- [ ] **Step 4: Commit**

```bash
git add src/modules/laundry/sla.js src/shared/cron/index.js src/modules/laundry/laundry.test.js && git commit -m "feat: laundry SLA motoru + makine zamanlayıcı cron"
```

---

## FAZ 3 — Frontend

### Task 6: Frontend API client + store

**Files:**
- Create: `frontend/src/modules/laundry/api.js`

- [ ] **Step 1: api.js oluştur**

`frontend/src/modules/laundry/api.js` oluştur:

```javascript
import api from '../../shared/api/client.js'

export const laundryApi = {
  // Items
  getItems: (params = {}) => api.get('/laundry/items', { params }).then(r => r.data),
  getItem: (id) => api.get(`/laundry/items/${id}`).then(r => r.data),
  createItem: (data) => api.post('/laundry/items', data).then(r => r.data),
  advanceItem: (id, data) => api.patch(`/laundry/items/${id}/advance`, data).then(r => r.data),
  deliverItem: (id, data) => api.patch(`/laundry/items/${id}/deliver`, data).then(r => r.data),
  lostItem: (id, data) => api.patch(`/laundry/items/${id}/lost`, data).then(r => r.data),
  deleteItem: (id) => api.delete(`/laundry/items/${id}`).then(r => r.data),
  // Machines
  getMachines: () => api.get('/laundry/machines').then(r => r.data),
  createMachine: (data) => api.post('/laundry/machines', data).then(r => r.data),
  updateMachine: (id, data) => api.patch(`/laundry/machines/${id}`, data).then(r => r.data),
  // SLA
  getSlaConfig: () => api.get('/laundry/sla-config').then(r => r.data),
  updateSlaConfig: (data) => api.put('/laundry/sla-config', data).then(r => r.data),
  getSlaViolations: () => api.get('/laundry/sla/violations').then(r => r.data),
  // Reports
  getStats: (params) => api.get('/laundry/reports/stats', { params }).then(r => r.data),
  exportCsv: () => api.get('/laundry/reports/export', { responseType: 'blob' }).then(r => r.data),
}
```

- [ ] **Step 2: Commit**

```bash
cd frontend && git add src/modules/laundry/api.js && git commit -m "feat: laundry frontend API client"
```

---

### Task 7: Frontend — LaundryPage (ana ekran)

**Files:**
- Overwrite: `frontend/src/modules/laundry/LaundryPage.jsx`
- Delete: `frontend/src/modules/laundry/QRScanner.jsx`, `frontend/src/modules/laundry/DistributionRoute.jsx`
- Create: `frontend/src/modules/laundry/components/ItemCard.jsx`
- Create: `frontend/src/modules/laundry/components/NewItemModal.jsx`
- Create: `frontend/src/modules/laundry/components/DeliveryModal.jsx`
- Create: `frontend/src/modules/laundry/components/MachineStrip.jsx`

- [ ] **Step 1: QRScanner.jsx ve DistributionRoute.jsx sil**

```bash
cd frontend && rm src/modules/laundry/QRScanner.jsx src/modules/laundry/DistributionRoute.jsx
```

- [ ] **Step 2: MachineStrip.jsx oluştur**

`frontend/src/modules/laundry/components/MachineStrip.jsx`:

```jsx
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

const STATUS_COLOR = { idle: '#34d399', running: '#f59e0b', done: '#ef4444', maintenance: '#475569' }
const STATUS_LABEL = { idle: 'Boş', running: 'Çalışıyor', done: 'BİTTİ!', maintenance: 'Bakım' }

export default function MachineStrip({ machines = [] }) {
  const qc = useQueryClient()
  const setTimer = useMutation({
    mutationFn: ({ id, minutes }) => {
      const end = new Date(Date.now() + minutes * 60000).toISOString()
      return laundryApi.updateMachine(id, { status: 'running', timer_end: end })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['laundry-machines'] }),
  })

  if (!machines.length) return null

  return (
    <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '0 0 6px', marginBottom: '14px' }}>
      {machines.map(m => {
        const color = STATUS_COLOR[m.status] || '#64748b'
        const minutesLeft = m.timer_end
          ? Math.max(0, Math.round((new Date(m.timer_end) - Date.now()) / 60000))
          : null

        return (
          <div key={m.id} style={{
            flexShrink: 0, minWidth: '90px',
            background: 'var(--surface)',
            border: `1px solid ${color}33`,
            borderTop: `2px solid ${color}`,
            borderRadius: '10px', padding: '10px 12px',
            position: 'relative',
          }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color, marginBottom: '4px' }}>
              {m.name}
            </div>
            <div style={{ fontSize: '18px', fontWeight: 900, color: m.status === 'done' ? '#ef4444' : 'var(--text)', lineHeight: 1 }}>
              {m.status === 'running' && minutesLeft !== null
                ? `${String(Math.floor(minutesLeft / 60)).padStart(2,'0')}:${String(minutesLeft % 60).padStart(2,'0')}`
                : STATUS_LABEL[m.status]}
            </div>
            {m.status === 'idle' && (
              <button
                onClick={() => setTimer.mutate({ id: m.id, minutes: 45 })}
                style={{
                  marginTop: '6px', fontSize: '9px', padding: '3px 8px',
                  background: 'rgba(99,102,241,0.15)', color: '#818cf8',
                  border: '1px solid rgba(99,102,241,0.2)', borderRadius: '6px', cursor: 'pointer',
                }}
              >
                Başlat 45dk
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: ItemCard.jsx oluştur**

`frontend/src/modules/laundry/components/ItemCard.jsx`:

```jsx
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

const STATUS = {
  dirty:     { label: '🧺 Sepette',    color: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
  washing:   { label: '🔄 Yıkanıyor', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  ready:     { label: '✅ Rafta Hazır', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  lost:      { label: '❓ Kayıp',       color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
}

export default function ItemCard({ item, machines = [], onDeliver }) {
  const qc = useQueryClient()

  const advance = useMutation({
    mutationFn: (data) => laundryApi.advanceItem(item.id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['laundry-items'] }),
  })

  const markLost = useMutation({
    mutationFn: () => laundryApi.lostItem(item.id, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['laundry-items'] }),
  })

  const st = STATUS[item.status] || STATUS.dirty
  const isSla = item.hours_in_status > 24

  return (
    <div style={{
      background: 'rgba(255,255,255,0.025)',
      border: `1px solid ${item.urgent ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.07)'}`,
      borderLeft: `3px solid ${item.urgent ? '#ef4444' : st.color}`,
      borderRadius: '12px', padding: '12px 14px', position: 'relative',
    }}>
      {item.urgent && (
        <div style={{ fontSize: '9px', fontWeight: 700, color: '#f87171', marginBottom: '5px', letterSpacing: '0.05em' }}>
          ⚡ ACİL
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '5px' }}>
        <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.2px' }}>
          {item.block || '?'} · {item.room_no || '?'}
        </div>
        <span style={{
          fontSize: '9px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px',
          background: st.bg, color: st.color,
        }}>
          {st.label}
        </span>
      </div>

      <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {item.created_by_name && <span>{item.created_by_name}</span>}
        <span>{item.item_count} parça</span>
        {item.machine_name && <span>· {item.machine_name}</span>}
        {item.shelf_location && <span>· Raf: {item.shelf_location}</span>}
        {item.hours_in_status && (
          <span style={{ color: isSla ? '#f87171' : '#475569' }}>
            {isSla && '⚠️ '}{item.hours_in_status}s
          </span>
        )}
      </div>

      {item.notes && (
        <div style={{ fontSize: '10px', color: '#475569', marginTop: '4px', fontStyle: 'italic' }}>
          {item.notes}
        </div>
      )}

      {item.status !== 'lost' && (
        <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
          {item.status === 'dirty' && (
            <AdvanceSelect
              label="Makineye At"
              machines={machines.filter(m => m.status === 'idle')}
              onSelect={(machine_id) => advance.mutate({ machine_id })}
              loading={advance.isPending}
            />
          )}
          {item.status === 'washing' && (
            <AdvanceShelf
              onConfirm={(shelf_location) => advance.mutate({ shelf_location })}
              loading={advance.isPending}
            />
          )}
          {item.status === 'ready' && (
            <button
              onClick={() => onDeliver(item)}
              style={btnStyle('primary')}
            >
              📦 Teslim Et
            </button>
          )}
          <button
            onClick={() => { if (confirm('Kayıp işaretle?')) markLost.mutate() }}
            style={btnStyle('ghost')}
          >
            Kayıp
          </button>
        </div>
      )}
      {advance.isError && (
        <div style={{ fontSize: '10px', color: '#f87171', marginTop: '4px' }}>
          {advance.error?.response?.data?.error || 'Hata'}
        </div>
      )}
    </div>
  )
}

function btnStyle(type) {
  return {
    padding: '5px 12px', borderRadius: '8px', cursor: 'pointer',
    fontSize: '10px', fontWeight: 700,
    background: type === 'primary' ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
    color: type === 'primary' ? '#a5b4fc' : '#64748b',
    border: type === 'primary' ? '1px solid rgba(99,102,241,0.25)' : '1px solid rgba(255,255,255,0.07)',
  }
}

function AdvanceSelect({ machines, onSelect, loading }) {
  if (!machines.length) return (
    <span style={{ fontSize: '10px', color: '#475569', padding: '5px 0' }}>Boş makine yok</span>
  )
  return (
    <select
      onChange={e => e.target.value && onSelect(+e.target.value)}
      defaultValue=""
      disabled={loading}
      style={{
        padding: '5px 10px', borderRadius: '8px', fontSize: '10px', fontWeight: 700,
        background: 'rgba(99,102,241,0.15)', color: '#a5b4fc',
        border: '1px solid rgba(99,102,241,0.25)', cursor: 'pointer',
      }}
    >
      <option value="">Makineye At ▾</option>
      {machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
    </select>
  )
}

function AdvanceShelf({ onConfirm, loading }) {
  return (
    <button
      onClick={() => {
        const shelf = prompt('Raf konumu (örn: 2. Kat):')
        if (shelf !== null) onConfirm(shelf)
      }}
      disabled={loading}
      style={btnStyle('primary')}
    >
      Rafa Koy
    </button>
  )
}
```

- [ ] **Step 4: NewItemModal.jsx oluştur**

`frontend/src/modules/laundry/components/NewItemModal.jsx`:

```jsx
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'
import api from '../../../shared/api/client.js'

export default function NewItemModal({ onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ room_id: '', item_count: 1, notes: '', urgent: false })

  const { data: rooms = [] } = useQuery({
    queryKey: ['rooms-list'],
    queryFn: () => api.get('/checkin/available-rooms').then(r => r.data).catch(() => []),
  })

  const create = useMutation({
    mutationFn: () => laundryApi.createItem(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['laundry-items'] }); onClose() },
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: '#0d1424', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '16px', padding: '24px', width: '340px', maxWidth: '90vw',
      }}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: '#f1f5f9', marginBottom: '18px' }}>
          + Yeni Çamaşır Kaydı
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={labelStyle}>Oda</label>
            <select
              value={form.room_id}
              onChange={e => set('room_id', +e.target.value)}
              style={inputStyle}
            >
              <option value="">Oda seç...</option>
              {rooms.map(r => (
                <option key={r.room_id || r.id} value={r.room_id || r.id}>
                  {r.block} - {r.room_no}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Parça Adedi</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button onClick={() => set('item_count', Math.max(1, form.item_count - 1))} style={countBtn}>−</button>
              <span style={{ fontSize: '20px', fontWeight: 800, color: '#f1f5f9', minWidth: '30px', textAlign: 'center' }}>
                {form.item_count}
              </span>
              <button onClick={() => set('item_count', form.item_count + 1)} style={countBtn}>+</button>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Notlar</label>
            <input
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Açıklama..."
              style={inputStyle}
            />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.urgent}
              onChange={e => set('urgent', e.target.checked)}
            />
            <span style={{ fontSize: '12px', color: '#f87171', fontWeight: 600 }}>⚡ ACİL işaretle</span>
          </label>
        </div>

        {create.isError && (
          <div style={{ fontSize: '11px', color: '#f87171', marginTop: '10px' }}>
            {create.error?.response?.data?.error || 'Hata oluştu'}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', marginTop: '18px' }}>
          <button
            onClick={() => create.mutate()}
            disabled={!form.room_id || create.isPending}
            style={{
              flex: 1, padding: '10px', borderRadius: '10px', border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white',
              fontWeight: 700, fontSize: '12px',
              opacity: !form.room_id ? 0.5 : 1,
            }}
          >
            {create.isPending ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '10px 16px', borderRadius: '10px', cursor: 'pointer',
              background: 'rgba(255,255,255,0.05)', color: '#64748b',
              border: '1px solid rgba(255,255,255,0.08)', fontSize: '12px',
            }}
          >
            İptal
          </button>
        </div>
      </div>
    </div>
  )
}

const labelStyle = { fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '5px' }
const inputStyle = { width: '100%', padding: '8px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#f1f5f9', fontSize: '12px' }
const countBtn = { width: '28px', height: '28px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.06)', color: '#94a3b8', fontSize: '16px', cursor: 'pointer' }
```

- [ ] **Step 5: DeliveryModal.jsx oluştur**

`frontend/src/modules/laundry/components/DeliveryModal.jsx`:

```jsx
import { useState, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

export default function DeliveryModal({ item, onClose }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [signing, setSigning] = useState(false)
  const canvasRef = useRef()
  const drawing = useRef(false)

  const deliver = useMutation({
    mutationFn: () => {
      const sig = signing && canvasRef.current ? canvasRef.current.toDataURL() : undefined
      return laundryApi.deliverItem(item.id, { delivered_to: name, signature_data: sig })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['laundry-items'] }); onClose() },
  })

  const startDraw = (e) => {
    drawing.current = true
    const ctx = canvasRef.current.getContext('2d')
    const rect = canvasRef.current.getBoundingClientRect()
    ctx.beginPath()
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top)
  }
  const draw = (e) => {
    if (!drawing.current) return
    const ctx = canvasRef.current.getContext('2d')
    const rect = canvasRef.current.getBoundingClientRect()
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top)
    ctx.strokeStyle = '#f1f5f9'; ctx.lineWidth = 2; ctx.stroke()
  }
  const stopDraw = () => { drawing.current = false }
  const clearSig = () => {
    const ctx = canvasRef.current.getContext('2d')
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#0d1424', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '24px', width: '360px', maxWidth: '90vw' }}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: '#f1f5f9', marginBottom: '4px' }}>📦 Teslim Et</div>
        <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '18px' }}>
          {item.block} · {item.room_no} — {item.item_count} parça
        </div>

        <div style={{ marginBottom: '14px' }}>
          <label style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '5px' }}>
            Teslim Alan İsim *
          </label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ad Soyad..."
            autoFocus
            style={{ width: '100%', padding: '9px 11px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: '#f1f5f9', fontSize: '13px' }}
          />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: signing ? '10px' : '18px' }}>
          <input type="checkbox" checked={signing} onChange={e => setSigning(e.target.checked)} />
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>İmza al (opsiyonel)</span>
        </label>

        {signing && (
          <div style={{ marginBottom: '14px' }}>
            <canvas
              ref={canvasRef} width={312} height={100}
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', display: 'block', cursor: 'crosshair', touchAction: 'none' }}
              onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
            />
            <button onClick={clearSig} style={{ fontSize: '9px', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', marginTop: '4px' }}>Temizle</button>
          </div>
        )}

        {deliver.isError && (
          <div style={{ fontSize: '11px', color: '#f87171', marginBottom: '10px' }}>
            {deliver.error?.response?.data?.error || 'Hata'}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => deliver.mutate()}
            disabled={!name.trim() || deliver.isPending}
            style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', fontWeight: 700, fontSize: '12px', opacity: !name.trim() ? 0.5 : 1 }}
          >
            {deliver.isPending ? 'Kaydediliyor...' : '✓ Teslim Onayla'}
          </button>
          <button onClick={onClose} style={{ padding: '10px 16px', borderRadius: '10px', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', color: '#64748b', border: '1px solid rgba(255,255,255,0.08)', fontSize: '12px' }}>
            İptal
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: LaundryPage.jsx yaz**

`frontend/src/modules/laundry/LaundryPage.jsx` içeriğini tamamen değiştir:

```jsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { laundryApi } from './api.js'
import MachineStrip from './components/MachineStrip.jsx'
import ItemCard from './components/ItemCard.jsx'
import NewItemModal from './components/NewItemModal.jsx'
import DeliveryModal from './components/DeliveryModal.jsx'

const FILTERS = [
  { key: 'all',     label: 'Tümü' },
  { key: 'dirty',   label: '🧺 Sepet' },
  { key: 'washing', label: '🔄 Yıkanan' },
  { key: 'ready',   label: '✅ Hazır' },
  { key: 'urgent',  label: '⚡ Acil' },
  { key: 'sla',     label: '⚠️ SLA' },
  { key: 'lost',    label: '❓ Kayıp' },
]

export default function LaundryPage() {
  const [filter, setFilter] = useState('all')
  const [showNew, setShowNew] = useState(false)
  const [deliverItem, setDeliverItem] = useState(null)

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['laundry-items', filter],
    queryFn: () => {
      if (filter === 'urgent') return laundryApi.getItems({ urgent: '1' })
      if (filter === 'sla')    return laundryApi.getItems({ sla_only: '1' })
      if (filter === 'all')    return laundryApi.getItems()
      return laundryApi.getItems({ status: filter })
    },
    refetchInterval: 30000,
  })

  const { data: machines = [] } = useQuery({
    queryKey: ['laundry-machines'],
    queryFn: laundryApi.getMachines,
    refetchInterval: 15000,
  })

  const { data: violations = [] } = useQuery({
    queryKey: ['laundry-sla'],
    queryFn: laundryApi.getSlaViolations,
    refetchInterval: 60000,
  })

  const counts = {
    dirty:   items.filter(i => i.status === 'dirty').length,
    washing: items.filter(i => i.status === 'washing').length,
    ready:   items.filter(i => i.status === 'ready').length,
    lost:    items.filter(i => i.status === 'lost').length,
  }

  return (
    <div style={{ maxWidth: '860px', position: 'relative', zIndex: 1 }} className="fade-up">

      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.5px' }}>
            🧺 Çamaşırhane
          </h1>
          {violations.length > 0 && (
            <div style={{ fontSize: '11px', color: '#f87171', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444', display: 'inline-block' }}></span>
              {violations.length} SLA ihlali var
            </div>
          )}
        </div>
        <button
          onClick={() => setShowNew(true)}
          style={{
            padding: '9px 16px', borderRadius: '10px', border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: 'white', fontWeight: 700, fontSize: '12px',
            boxShadow: '0 4px 14px rgba(99,102,241,0.35)',
          }}
        >
          + Yeni Kayıt
        </button>
      </div>

      {/* KPI STRIP */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px', marginBottom: '16px' }}>
        {[
          { label: 'Sepette',  value: counts.dirty,   color: '#818cf8' },
          { label: 'Yıkanan', value: counts.washing,  color: '#fbbf24' },
          { label: 'Hazır',   value: counts.ready,    color: '#34d399' },
          { label: 'SLA',     value: violations.length, color: '#f87171' },
        ].map(s => (
          <div key={s.label} style={{
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '10px', padding: '10px 12px', textAlign: 'center',
            borderTop: `2px solid ${s.color}`,
          }}>
            <div style={{ fontSize: '22px', fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: '9px', color: '#475569', marginTop: '3px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* MACHINE STRIP */}
      <MachineStrip machines={machines} />

      {/* FILTER TABS */}
      <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', marginBottom: '12px', paddingBottom: '2px' }}>
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              flexShrink: 0, padding: '5px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '11px', fontWeight: 600,
              background: filter === f.key ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.03)',
              color: filter === f.key ? '#a5b4fc' : '#64748b',
              border: filter === f.key ? '1px solid rgba(99,102,241,0.25)' : '1px solid transparent',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ITEM LIST */}
      {isLoading ? (
        <div style={{ color: '#475569', padding: '20px', textAlign: 'center' }}>Yükleniyor...</div>
      ) : items.length === 0 ? (
        <div style={{ color: '#475569', padding: '30px', textAlign: 'center', fontSize: '13px' }}>Kayıt yok</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {items.map(item => (
            <ItemCard
              key={item.id}
              item={item}
              machines={machines}
              onDeliver={setDeliverItem}
            />
          ))}
        </div>
      )}

      {showNew && <NewItemModal onClose={() => setShowNew(false)} />}
      {deliverItem && <DeliveryModal item={deliverItem} onClose={() => setDeliverItem(null)} />}
    </div>
  )
}
```

- [ ] **Step 7: Frontend'i başlat ve kontrol et**

```bash
cd frontend && npm run dev
```

Tarayıcıda `/laundry` rotasına git. Hata olmadan sayfa açılmalı, makine strip + KPI kartları + boş liste görünmeli.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/modules/laundry/ && git commit -m "feat: laundry frontend — LaundryPage, ItemCard, NewItemModal, DeliveryModal, MachineStrip"
```

---

## FAZ 4 — WhatsApp + Raporlama

### Task 8: WhatsApp entegrasyonu

**Files:**
- Create: `backend/src/modules/laundry/whatsapp.js`

- [ ] **Step 1: whatsapp.js oluştur**

`backend/src/modules/laundry/whatsapp.js`:

```javascript
import { getDB } from '../../shared/db/index.js'
import { createNotification } from '../../shared/notifications/service.js'

/**
 * Oda sakininin telefon numarasını sorgular ve WhatsApp mesajı gönderir.
 * Fire-and-forget: hata olsa bile item akışı durmuyor.
 */
export async function notifyItemReady(itemId) {
  if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_ID) return

  try {
    const db = getDB()
    const item = db.prepare(`
      SELECT li.item_count, r.block, r.room_no,
             p.phone_number, p.full_name
      FROM laundry_items li
      LEFT JOIN rooms r ON r.id = li.room_id
      LEFT JOIN room_assignments ra ON ra.room_id = r.id AND ra.check_out_at IS NULL
      LEFT JOIN personnel p ON p.id = ra.personnel_id
      WHERE li.id = ?
      LIMIT 1
    `).get(itemId)

    if (!item?.phone_number) return

    const phone = item.phone_number.replace(/\D/g, '')
    const msg = `Merhaba${item.full_name ? ' ' + item.full_name.split(' ')[0] : ''}! 🧺\n\nOda ${item.block}-${item.room_no} — ${item.item_count} parça çamaşırınız rafta hazır. Lütfen teslim alınız.`

    const res = await fetch(
      `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone,
          type: 'text',
          text: { body: msg },
        }),
      }
    )

    if (!res.ok) {
      const err = await res.text()
      console.error('[WhatsApp] Gönderim hatası:', err)
    }
  } catch (e) {
    console.error('[WhatsApp] Hata:', e.message)
  }
}
```

- [ ] **Step 2: service.js'te notifyItemReady çağır**

`backend/src/modules/laundry/service.js` dosyasının başına import ekle:

```javascript
import { notifyItemReady } from './whatsapp.js'
```

`advanceItemService` içinde `if (nextStatus === 'ready')` bloğuna ekle:

```javascript
    // WhatsApp bildirimi — fire and forget
    notifyItemReady(id).catch(() => {})
```

- [ ] **Step 3: Test (mock)**

laundry.test.js'e ekle:

```javascript
describe('WhatsApp', () => {
  it('WHATSAPP_TOKEN olmadan hata vermiyor', async () => {
    delete process.env.WHATSAPP_TOKEN
    const { notifyItemReady } = await import('./whatsapp.js')
    await expect(notifyItemReady(999)).resolves.toBeUndefined()
  })
})
```

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js
```

- [ ] **Step 4: Commit**

```bash
git add src/modules/laundry/whatsapp.js src/modules/laundry/service.js src/modules/laundry/laundry.test.js && git commit -m "feat: laundry WhatsApp bildirimi — rafta hazır olunca oda sakinini bildir"
```

---

### Task 9: Frontend — LaundryReport + LaundrySettings

**Files:**
- Create: `frontend/src/modules/laundry/LaundryReport.jsx`
- Create: `frontend/src/modules/laundry/LaundrySettings.jsx`

- [ ] **Step 1: LaundryReport.jsx oluştur**

`frontend/src/modules/laundry/LaundryReport.jsx`:

```jsx
import { useQuery } from '@tanstack/react-query'
import { laundryApi } from './api.js'

export default function LaundryReport() {
  const { data: stats } = useQuery({
    queryKey: ['laundry-stats'],
    queryFn: laundryApi.getStats,
  })

  const { data: violations = [] } = useQuery({
    queryKey: ['laundry-violations'],
    queryFn: laundryApi.getSlaViolations,
  })

  const exportCsv = async () => {
    const blob = await laundryApi.exportCsv()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `camasir-${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!stats) return <div style={{ color: '#475569', padding: '20px' }}>Yükleniyor...</div>

  return (
    <div style={{ maxWidth: '760px' }} className="fade-up">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text)' }}>📊 Raporlar</h1>
        <button
          onClick={exportCsv}
          style={{ padding: '7px 14px', borderRadius: '8px', background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(16,185,129,0.2)', cursor: 'pointer', fontSize: '11px', fontWeight: 700 }}
        >
          CSV İndir
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px', marginBottom: '20px' }}>
        <StatCard label="Bugün Teslim" value={stats.delivered_today?.count || 0} color="#34d399" />
        <StatCard label="SLA İhlali" value={stats.sla_violations?.count || 0} color="#f87171" />
        <StatCard label="Aktif Kayıt" value={stats.by_status?.reduce((a,b) => a + b.count, 0) || 0} color="#818cf8" />
      </div>

      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
          Durum Dağılımı
        </div>
        {(stats.by_status || []).map(s => (
          <div key={s.status} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '12px' }}>
            <span style={{ color: '#94a3b8' }}>{s.status}</span>
            <span style={{ fontWeight: 700, color: '#f1f5f9' }}>{s.count}</span>
          </div>
        ))}
      </div>

      {violations.length > 0 && (
        <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '12px', padding: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#f87171', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
            ⚠️ Aktif SLA İhlalleri
          </div>
          {violations.map(v => (
            <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(239,68,68,0.1)', fontSize: '12px' }}>
              <span style={{ color: '#f1f5f9' }}>{v.block} {v.room_no} — {v.status}</span>
              <span style={{ color: v.sla_level === 'critical' ? '#f87171' : '#fbbf24', fontWeight: 700 }}>{v.hours_in_status}s</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderTop: `2px solid ${color}`, borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
      <div style={{ fontSize: '26px', fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '9px', color: '#475569', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
    </div>
  )
}
```

- [ ] **Step 2: LaundrySettings.jsx oluştur**

`frontend/src/modules/laundry/LaundrySettings.jsx`:

```jsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from './api.js'

const STAGE_LABELS = { dirty: '🧺 Kirli Sepette', washing: '🔄 Yıkanıyor', ready: '✅ Rafta Hazır' }

export default function LaundrySettings() {
  const qc = useQueryClient()
  const { data: configs = [] } = useQuery({ queryKey: ['laundry-sla-config'], queryFn: laundryApi.getSlaConfig })

  const update = useMutation({
    mutationFn: laundryApi.updateSlaConfig,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['laundry-sla-config'] }),
  })

  return (
    <div style={{ maxWidth: '560px' }} className="fade-up">
      <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text)', marginBottom: '20px' }}>⚙️ SLA Ayarları</h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {configs.map(cfg => (
          <SlaRow key={cfg.stage} config={cfg} onSave={(data) => update.mutate(data)} saving={update.isPending} />
        ))}
      </div>
    </div>
  )
}

function SlaRow({ config, onSave, saving }) {
  const [warn, setWarn] = useState(config.warning_hours)
  const [crit, setCrit] = useState(config.critical_hours)
  const dirty = warn !== config.warning_hours || crit !== config.critical_hours

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', padding: '14px 16px' }}>
      <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', marginBottom: '10px' }}>
        {STAGE_LABELS[config.stage]}
      </div>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: '9px', color: '#fbbf24', fontWeight: 700, display: 'block', marginBottom: '4px' }}>🟡 UYARI (saat)</label>
          <input
            type="number" min="0.5" step="0.5" value={warn}
            onChange={e => setWarn(+e.target.value)}
            style={{ width: '70px', padding: '6px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '7px', color: '#fbbf24', fontSize: '13px', fontWeight: 700 }}
          />
        </div>
        <div>
          <label style={{ fontSize: '9px', color: '#f87171', fontWeight: 700, display: 'block', marginBottom: '4px' }}>🔴 KRİTİK (saat)</label>
          <input
            type="number" min="1" step="0.5" value={crit}
            onChange={e => setCrit(+e.target.value)}
            style={{ width: '70px', padding: '6px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '7px', color: '#f87171', fontSize: '13px', fontWeight: 700 }}
          />
        </div>
        {dirty && (
          <button
            onClick={() => onSave({ stage: config.stage, warning_hours: warn, critical_hours: crit })}
            disabled={saving}
            style={{ padding: '7px 14px', borderRadius: '8px', background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.25)', cursor: 'pointer', fontSize: '11px', fontWeight: 700 }}
          >
            Kaydet
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: App.jsx route'larını ekle**

`frontend/src/App.jsx` dosyasına lazy import ekle (mevcut laundry import'larının yanına):

```javascript
const LaundryReport   = lazy(() => import('./modules/laundry/LaundryReport.jsx'))
const LaundrySettings = lazy(() => import('./modules/laundry/LaundrySettings.jsx'))
```

Route'ları ekle (laundry route'unun altına):

```jsx
<Route path="laundry/report" element={<LaundryReport />} />
<Route path="laundry/settings" element={<LaundrySettings />} />
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/modules/laundry/ frontend/src/App.jsx && git commit -m "feat: laundry report, settings — SLA config UI + CSV export"
```

---

## FAZ 5 — Son Testler + Smoke

### Task 10: Tüm testler + smoke

- [ ] **Step 1: Tüm backend testlerini çalıştır**

```bash
cd backend && npx vitest run
```

Beklenen: tüm test dosyaları PASS. Herhangi bir modül kırılmışsa düzelt.

- [ ] **Step 2: Dev sunucusunu başlat ve manuel kontrol**

```bash
npm run dev
```

Kontrol listesi:
- `/laundry` — sayfa açılıyor, makine strip görünüyor
- `+ Yeni Kayıt` → modal açılıyor, oda seçilebiliyor, kayıt oluşturuluyor
- `Makineye At` → durum washing oluyor
- `Rafa Koy` → durum ready oluyor
- `Teslim Et` → isim giriliyor, teslim tamamlanıyor
- `GET /api/laundry/sla/violations` — JSON dönüyor
- `GET /api/laundry/reports/export` — CSV indiriyor

- [ ] **Step 3: Final commit**

```bash
cd backend && npx vitest run && cd .. && git add -A && git commit -m "feat: laundry v2 modülü tamamlandı — full-stack personal item tracking"
```

---

## Kapsam Dışı (Sonraki Plan)

`laundry_queue` tablosu migration ile oluşturuluyor ama queue API + QueuePanel UI bu plana sığmadı. Faz 4 (fotoğraf + sıra) ayrı bir plan ile uygulanacak.

---

## Özet Dosya Listesi

| Dosya | İşlem |
|-------|-------|
| `backend/src/shared/db/index.js` | Modify — 7 tablo migration |
| `backend/src/modules/laundry/queries.js` | Overwrite |
| `backend/src/modules/laundry/service.js` | Overwrite |
| `backend/src/modules/laundry/routes.js` | Overwrite |
| `backend/src/modules/laundry/sla.js` | Create |
| `backend/src/modules/laundry/whatsapp.js` | Create |
| `backend/src/modules/laundry/laundry.test.js` | Overwrite |
| `backend/src/shared/cron/index.js` | Modify |
| `frontend/src/modules/laundry/api.js` | Create |
| `frontend/src/modules/laundry/LaundryPage.jsx` | Overwrite |
| `frontend/src/modules/laundry/LaundryReport.jsx` | Create |
| `frontend/src/modules/laundry/LaundrySettings.jsx` | Create |
| `frontend/src/modules/laundry/components/ItemCard.jsx` | Create |
| `frontend/src/modules/laundry/components/NewItemModal.jsx` | Create |
| `frontend/src/modules/laundry/components/DeliveryModal.jsx` | Create |
| `frontend/src/modules/laundry/components/MachineStrip.jsx` | Create |
| `frontend/src/modules/laundry/QRScanner.jsx` | Delete |
| `frontend/src/modules/laundry/DistributionRoute.jsx` | Delete |
| `frontend/src/App.jsx` | Modify — 2 yeni route |
