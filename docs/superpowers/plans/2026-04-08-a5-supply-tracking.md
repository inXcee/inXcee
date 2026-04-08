# A5: Deterjan Stok Takibi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Çamaşırhanede yönetici tanımlı ürün listesi (deterjan vb.), makine bazlı otomatik tüketim, manuel düzeltme ve 2 seviyeli (uyarı/kritik) stok takibi.

**Architecture:** 3 yeni tablo (`laundry_supplies`, `laundry_machine_supplies`, `laundry_supply_log`). `advanceItemService` washing'e geçişte otomatik stok düşer. Settings'te yeni "Stok" sekmesi, LaundryHub'da eşik ihlali olan ürünleri gösteren ince widget.

**Tech Stack:** Express, better-sqlite3, React, Zustand, React Query, vitest

---

## Dosya Haritası

| Dosya | Değişiklik |
|-------|-----------|
| `backend/src/shared/db/index.js` | Migration: 3 yeni tablo |
| `backend/src/modules/laundry/queries.js` | Supply CRUD + log sorguları |
| `backend/src/modules/laundry/service.js` | Supply service fonksiyonları + `advanceItemService` güncelleme |
| `backend/src/modules/laundry/routes.js` | Supply route'ları |
| `backend/src/modules/laundry/laundry.test.js` | Supply testleri |
| `frontend/src/modules/laundry/api.js` | Supply API metodları |
| `frontend/src/modules/laundry/components/SupplyWidget.jsx` | **YENİ** — LaundryHub stok uyarı widget'ı |
| `frontend/src/modules/laundry/components/SupplySettings.jsx` | **YENİ** — Settings stok yönetim sekmesi |
| `frontend/src/modules/laundry/LaundrySettings.jsx` | "Stok" sekmesi entegrasyonu |
| `frontend/src/modules/laundry/LaundryHub.jsx` | SupplyWidget entegrasyonu |

---

## Task 1: DB Migration — 3 Yeni Tablo

**Files:**
- Modify: `backend/src/shared/db/index.js`

- [ ] **Step 1: `initDB` fonksiyonuna migration ekle**

`backend/src/shared/db/index.js` dosyasında `initDB` fonksiyonu içinde mevcut try/catch migration blokları var. Aynı pattern'la sonuna ekle:

```js
// laundry_supplies
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS laundry_supplies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'kg',
      current_stock REAL NOT NULL DEFAULT 0,
      warning_threshold REAL NOT NULL DEFAULT 0,
      critical_threshold REAL NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)
} catch(_) {}

// laundry_machine_supplies
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS laundry_machine_supplies (
      machine_id INTEGER NOT NULL REFERENCES laundry_machines(id) ON DELETE CASCADE,
      supply_id  INTEGER NOT NULL REFERENCES laundry_supplies(id) ON DELETE CASCADE,
      per_wash_amount REAL NOT NULL DEFAULT 0.1,
      PRIMARY KEY (machine_id, supply_id)
    )
  `)
} catch(_) {}

// laundry_supply_log
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS laundry_supply_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supply_id  INTEGER NOT NULL REFERENCES laundry_supplies(id),
      delta      REAL NOT NULL,
      reason     TEXT NOT NULL,
      item_id    INTEGER,
      machine_id INTEGER,
      note       TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)
} catch(_) {}
```

- [ ] **Step 2: Migration'ı doğrula**

```bash
cd backend && node -e "
import('./src/shared/db/index.js').then(m => {
  m.initDB()
  const db = m.getDB()
  const tables = db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'laundry_supply%'\").all()
  console.log('Tables:', tables.map(t => t.name))
})
"
```

Expected output: `Tables: [ 'laundry_supplies', 'laundry_machine_supplies', 'laundry_supply_log' ]`

- [ ] **Step 3: Commit**

```bash
git add backend/src/shared/db/index.js
git commit -m "feat: A5 supply DB migration — laundry_supplies, machine_supplies, supply_log"
```

---

## Task 2: Backend Queries

**Files:**
- Modify: `backend/src/modules/laundry/queries.js`

- [ ] **Step 1: Supply queries dosyasının sonuna ekle**

`backend/src/modules/laundry/queries.js` dosyasının en sonuna:

```js
// ═══════════════════════════════════════════════════════════════════════════
// SUPPLIES
// ═══════════════════════════════════════════════════════════════════════════

export function listSuppliesQuery(includeInactive = false) {
  const db = getDB()
  const where = includeInactive ? '' : 'WHERE s.is_active = 1'
  return db.prepare(`
    SELECT s.*,
      (SELECT json_group_array(json_object(
        'machine_id', ms.machine_id,
        'machine_name', m.name,
        'per_wash_amount', ms.per_wash_amount
      ))
      FROM laundry_machine_supplies ms
      JOIN laundry_machines m ON m.id = ms.machine_id
      WHERE ms.supply_id = s.id
      ) as machine_links_json
    FROM laundry_supplies s
    ${where}
    ORDER BY s.name ASC
  `).all().map(row => ({
    ...row,
    machine_links: row.machine_links_json ? JSON.parse(row.machine_links_json) : [],
  }))
}

export function getSupplyQuery(id) {
  const db = getDB()
  return db.prepare(`SELECT * FROM laundry_supplies WHERE id = ?`).get(id)
}

export function insertSupplyQuery({ name, unit, current_stock, warning_threshold, critical_threshold }) {
  const db = getDB()
  const r = db.prepare(`
    INSERT INTO laundry_supplies(name, unit, current_stock, warning_threshold, critical_threshold)
    VALUES(?, ?, ?, ?, ?)
  `).run(name, unit || 'kg', current_stock || 0, warning_threshold || 0, critical_threshold || 0)
  return r.lastInsertRowid
}

export function updateSupplyQuery(id, { name, unit, warning_threshold, critical_threshold, is_active }) {
  const db = getDB()
  db.prepare(`
    UPDATE laundry_supplies
    SET name = COALESCE(?, name),
        unit = COALESCE(?, unit),
        warning_threshold = COALESCE(?, warning_threshold),
        critical_threshold = COALESCE(?, critical_threshold),
        is_active = COALESCE(?, is_active),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(name ?? null, unit ?? null, warning_threshold ?? null, critical_threshold ?? null, is_active ?? null, id)
  return db.prepare(`SELECT * FROM laundry_supplies WHERE id = ?`).get(id)
}

export function adjustStockQuery(supplyId, delta, { reason, item_id, machine_id, note, created_by }) {
  const db = getDB()
  // Stok 0'ın altına düşmez
  db.prepare(`
    UPDATE laundry_supplies
    SET current_stock = MAX(0, current_stock + ?),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(delta, supplyId)
  db.prepare(`
    INSERT INTO laundry_supply_log(supply_id, delta, reason, item_id, machine_id, note, created_by)
    VALUES(?, ?, ?, ?, ?, ?, ?)
  `).run(supplyId, delta, reason, item_id ?? null, machine_id ?? null, note ?? null, created_by ?? null)
  return db.prepare(`SELECT * FROM laundry_supplies WHERE id = ?`).get(supplyId)
}

export function setStockQuery(supplyId, newStock, userId) {
  const db = getDB()
  const current = db.prepare(`SELECT current_stock FROM laundry_supplies WHERE id = ?`).get(supplyId)
  if (!current) throw new Error('Ürün bulunamadı')
  const delta = newStock - current.current_stock
  return adjustStockQuery(supplyId, delta, { reason: 'manual_correction', note: 'Sayım düzeltmesi', created_by: userId })
}

export function getMachineSuppliesQuery(machine_id) {
  const db = getDB()
  return db.prepare(`
    SELECT ms.*, s.name, s.unit, s.current_stock
    FROM laundry_machine_supplies ms
    JOIN laundry_supplies s ON s.id = ms.supply_id
    WHERE ms.machine_id = ? AND s.is_active = 1
  `).all(machine_id)
}

export function upsertMachineSupplyQuery(machine_id, supply_id, per_wash_amount) {
  const db = getDB()
  db.prepare(`
    INSERT INTO laundry_machine_supplies(machine_id, supply_id, per_wash_amount)
    VALUES(?, ?, ?)
    ON CONFLICT(machine_id, supply_id) DO UPDATE SET per_wash_amount = excluded.per_wash_amount
  `).run(machine_id, supply_id, per_wash_amount)
}

export function deleteMachineSupplyQuery(machine_id, supply_id) {
  const db = getDB()
  db.prepare(`DELETE FROM laundry_machine_supplies WHERE machine_id = ? AND supply_id = ?`).run(machine_id, supply_id)
}

export function getSupplyLogQuery(supply_id, limit = 20) {
  const db = getDB()
  return db.prepare(`
    SELECT sl.*, u.full_name as user_name
    FROM laundry_supply_log sl
    LEFT JOIN users u ON u.id = sl.created_by
    WHERE sl.supply_id = ?
    ORDER BY sl.created_at DESC LIMIT ?
  `).all(supply_id, limit)
}

export function getAlertSuppliesQuery() {
  const db = getDB()
  return db.prepare(`
    SELECT * FROM laundry_supplies
    WHERE is_active = 1
      AND (current_stock <= critical_threshold OR current_stock <= warning_threshold)
    ORDER BY current_stock ASC
  `).all().map(s => ({
    ...s,
    alert_level: s.current_stock <= s.critical_threshold ? 'critical' : 'warning',
  }))
}
```

---

## Task 3: Backend Service

**Files:**
- Modify: `backend/src/modules/laundry/service.js`

- [ ] **Step 1: Supply import ekle**

`service.js` dosyasının başında `import * as q from './queries.js'` zaten var. Yeni query fonksiyonları otomatik dahil olacak.

- [ ] **Step 2: Supply service fonksiyonlarını dosyanın sonuna ekle**

```js
// ═══════════════════════════════════════════════════════════════════════════
// SUPPLIES
// ═══════════════════════════════════════════════════════════════════════════

export function listSuppliesService(includeInactive = false) {
  return q.listSuppliesQuery(includeInactive)
}

export function createSupplyService({ name, unit, current_stock, warning_threshold, critical_threshold }, userId) {
  if (!name || !name.trim()) throw new Error('Ürün adı zorunlu')
  if (warning_threshold >= critical_threshold && critical_threshold > 0) {
    throw new Error('Kritik eşik uyarı eşiğinden büyük olmalı')
  }
  const id = q.insertSupplyQuery({ name: name.trim(), unit, current_stock, warning_threshold, critical_threshold })
  logAudit(userId, 'supply_create', 'laundry', id, name.trim())
  return q.getSupplyQuery(id)
}

export function updateSupplyService(id, fields, userId) {
  const supply = q.getSupplyQuery(id)
  if (!supply) throw new Error('Ürün bulunamadı')
  const updated = q.updateSupplyQuery(id, fields)
  logAudit(userId, 'supply_update', 'laundry', id, JSON.stringify(fields))
  return updated
}

export function addStockService(supplyId, amount, note, userId) {
  if (!amount || amount <= 0) throw new Error('Miktar pozitif olmalı')
  const supply = q.getSupplyQuery(supplyId)
  if (!supply) throw new Error('Ürün bulunamadı')
  return q.adjustStockQuery(supplyId, +amount, { reason: 'manual_add', note, created_by: userId })
}

export function setStockService(supplyId, newStock, userId) {
  if (newStock < 0) throw new Error('Stok negatif olamaz')
  return q.setStockQuery(supplyId, +newStock, userId)
}

export function upsertMachineSupplyService(machine_id, supply_id, per_wash_amount, userId) {
  if (!machine_id || !supply_id) throw new Error('machine_id ve supply_id zorunlu')
  if (per_wash_amount < 0) throw new Error('Tüketim miktarı negatif olamaz')
  q.upsertMachineSupplyQuery(+machine_id, +supply_id, +per_wash_amount)
  logAudit(userId, 'machine_supply_upsert', 'laundry', machine_id, `supply:${supply_id} amount:${per_wash_amount}`)
}

export function deleteMachineSupplyService(machine_id, supply_id, userId) {
  q.deleteMachineSupplyQuery(+machine_id, +supply_id)
  logAudit(userId, 'machine_supply_delete', 'laundry', machine_id, `supply:${supply_id}`)
}

export function getSupplyLogService(supply_id) {
  return q.getSupplyLogQuery(+supply_id)
}

export function getAlertSuppliesService() {
  return q.getAlertSuppliesQuery()
}
```

- [ ] **Step 3: `advanceItemService` içinde otomatik tüketim ekle**

`advanceItemService` fonksiyonunda `if (nextStatus === 'washing')` bloğunda makine atandıktan hemen sonra (q.removeItemFromQueueQuery'den sonra) şunu ekle:

```js
// Washing'e geçişte: makineye bağlı ürünlerin stoğunu düş
const machineSupplies = q.getMachineSuppliesQuery(machine_id)
for (const ms of machineSupplies) {
  q.adjustStockQuery(ms.supply_id, -ms.per_wash_amount, {
    reason: 'wash_auto',
    item_id: id,
    machine_id: machine_id,
    created_by: userId,
  })
}
```

---

## Task 4: Backend Routes

**Files:**
- Modify: `backend/src/modules/laundry/routes.js`

- [ ] **Step 1: Supply route'larını ekle**

`routes.js` dosyasının sonuna (diğer route gruplarının ardından) ekle:

```js
// ═══════════════════════════════════════════════════════════════════════════
// SUPPLIES
// ═══════════════════════════════════════════════════════════════════════════

laundryRouter.get('/supplies', ...laundryRead, (req, res) => {
  try {
    res.json(svc.listSuppliesService(req.query.include_inactive === '1'))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

laundryRouter.get('/supplies/alerts', ...laundryRead, (req, res) => {
  try {
    res.json(svc.getAlertSuppliesService())
  } catch (e) { res.status(500).json({ error: e.message }) }
})

laundryRouter.post('/supplies', ...slaWrite, (req, res) => {
  try {
    const supply = svc.createSupplyService(req.body, req.user.id)
    res.status(201).json(supply)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.patch('/supplies/:id', ...slaWrite, (req, res) => {
  try {
    const supply = svc.updateSupplyService(+req.params.id, req.body, req.user.id)
    res.json(supply)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.post('/supplies/:id/add-stock', ...slaWrite, (req, res) => {
  try {
    const { amount, note } = req.body
    const supply = svc.addStockService(+req.params.id, amount, note, req.user.id)
    res.json(supply)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.post('/supplies/:id/set-stock', ...slaWrite, (req, res) => {
  try {
    const { new_stock } = req.body
    const supply = svc.setStockService(+req.params.id, new_stock, req.user.id)
    res.json(supply)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.get('/supplies/:id/log', ...laundryRead, (req, res) => {
  try {
    res.json(svc.getSupplyLogService(+req.params.id))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Makine-ürün bağlantıları
laundryRouter.put('/machines/:machine_id/supplies/:supply_id', ...slaWrite, (req, res) => {
  try {
    const { per_wash_amount } = req.body
    svc.upsertMachineSupplyService(+req.params.machine_id, +req.params.supply_id, per_wash_amount, req.user.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.delete('/machines/:machine_id/supplies/:supply_id', ...slaWrite, (req, res) => {
  try {
    svc.deleteMachineSupplyService(+req.params.machine_id, +req.params.supply_id, req.user.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})
```

---

## Task 5: Backend Testleri

**Files:**
- Modify: `backend/src/modules/laundry/laundry.test.js`

- [ ] **Step 1: Supply testlerini import satırına ekle**

`laundry.test.js` dosyasının en başındaki import satırında `service.js` import'una şunları ekle:
`createSupplyService`, `addStockService`, `setStockService`, `upsertMachineSupplyService`, `getAlertSuppliesService`

- [ ] **Step 2: Test bloğunu dosya sonuna ekle**

```js
describe('Supplies (A5)', () => {
  it('ürün oluşturur', () => {
    const supply = createSupplyService(
      { name: 'Test Deterjan', unit: 'kg', current_stock: 10, warning_threshold: 3, critical_threshold: 1 },
      userId
    )
    expect(supply.id).toBeTruthy()
    expect(supply.name).toBe('Test Deterjan')
    expect(supply.current_stock).toBe(10)
  })

  it('stok ekler', () => {
    const supply = createSupplyService(
      { name: 'Stok Testi', unit: 'kg', current_stock: 5, warning_threshold: 2, critical_threshold: 1 },
      userId
    )
    const updated = addStockService(supply.id, 3, 'Giriş testi', userId)
    expect(updated.current_stock).toBe(8)
  })

  it('stok 0 altına düşmez', () => {
    const supply = createSupplyService(
      { name: 'Sıfır Testi', unit: 'kg', current_stock: 0.5, warning_threshold: 1, critical_threshold: 0.5 },
      userId
    )
    const { adjustStockQuery } = require('./queries.js')
    adjustStockQuery(supply.id, -10, { reason: 'wash_auto', created_by: userId })
    const { getSupplyQuery } = require('./queries.js')
    const after = getSupplyQuery(supply.id)
    expect(after.current_stock).toBe(0)
  })

  it('stok düzeltmesi yapar', () => {
    const supply = createSupplyService(
      { name: 'Düzeltme Testi', unit: 'kg', current_stock: 7, warning_threshold: 2, critical_threshold: 1 },
      userId
    )
    const updated = setStockService(supply.id, 4, userId)
    expect(updated.current_stock).toBe(4)
  })

  it('alert ürünleri döner', () => {
    const supply = createSupplyService(
      { name: 'Kritik Ürün', unit: 'kg', current_stock: 0.3, warning_threshold: 2, critical_threshold: 1 },
      userId
    )
    const alerts = getAlertSuppliesService()
    const found = alerts.find(s => s.id === supply.id)
    expect(found).toBeTruthy()
    expect(found.alert_level).toBe('critical')
  })

  it('advance item otomatik stok düşürür', () => {
    const supply = createSupplyService(
      { name: 'Oto Tüketim', unit: 'kg', current_stock: 5, warning_threshold: 1, critical_threshold: 0.5 },
      userId
    )
    const db = getDB()
    const machine = db.prepare("SELECT id FROM laundry_machines LIMIT 1").get()
    if (!machine) return // makine yoksa skip
    upsertMachineSupplyService(machine.id, supply.id, 0.5, userId)
    const item = createItemService({ room_id: roomId, item_count: 1 }, userId)
    advanceItemService(item.id, { machine_id: machine.id }, userId)
    const { getSupplyQuery } = require('./queries.js')
    const after = getSupplyQuery(supply.id)
    expect(after.current_stock).toBe(4.5)
  })
})
```

- [ ] **Step 3: Testleri çalıştır**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js
```

Expected: Tüm testler PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/laundry/queries.js backend/src/modules/laundry/service.js backend/src/modules/laundry/routes.js backend/src/modules/laundry/laundry.test.js
git commit -m "feat: A5 supply backend — queries, service, routes, tests"
```

---

## Task 6: Frontend API

**Files:**
- Modify: `frontend/src/modules/laundry/api.js`

- [ ] **Step 1: Supply metodlarını `laundryApi`'ye ekle**

`laundryApi` objesinde son metodların ardından:

```js
// ── Supplies ───────────────────────────────────────────────────────────────
getSupplies: (includeInactive = false) =>
  api.get('/laundry/supplies', { params: includeInactive ? { include_inactive: 1 } : {} }).then(r => r.data),
getSupplyAlerts: () => api.get('/laundry/supplies/alerts').then(r => r.data),
createSupply: (data) => api.post('/laundry/supplies', data).then(r => r.data),
updateSupply: (id, data) => api.patch(`/laundry/supplies/${id}`, data).then(r => r.data),
addStock: (id, amount, note) => api.post(`/laundry/supplies/${id}/add-stock`, { amount, note }).then(r => r.data),
setStock: (id, new_stock) => api.post(`/laundry/supplies/${id}/set-stock`, { new_stock }).then(r => r.data),
getSupplyLog: (id) => api.get(`/laundry/supplies/${id}/log`).then(r => r.data),
setMachineSupply: (machine_id, supply_id, per_wash_amount) =>
  api.put(`/laundry/machines/${machine_id}/supplies/${supply_id}`, { per_wash_amount }).then(r => r.data),
deleteMachineSupply: (machine_id, supply_id) =>
  api.delete(`/laundry/machines/${machine_id}/supplies/${supply_id}`).then(r => r.data),
```

---

## Task 7: SupplyWidget Bileşeni

**Files:**
- Create: `frontend/src/modules/laundry/components/SupplyWidget.jsx`

- [ ] **Step 1: Bileşeni oluştur**

```jsx
// frontend/src/modules/laundry/components/SupplyWidget.jsx
import { useQuery } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

export default function SupplyWidget({ onNavigateSettings }) {
  const { data: alerts = [] } = useQuery({
    queryKey: ['supply-alerts'],
    queryFn: () => laundryApi.getSupplyAlerts(),
    refetchInterval: 60_000, // 1 dk'da bir yenile
  })

  if (alerts.length === 0) return null

  return (
    <div style={{
      display: 'flex', gap: 6, flexWrap: 'wrap', padding: '6px 0', marginBottom: 4,
    }}>
      {alerts.map(s => (
        <button
          key={s.id}
          onClick={onNavigateSettings}
          title={`${s.name}: ${s.current_stock} ${s.unit} — Stok Ayarlarına Git`}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: s.alert_level === 'critical' ? 'var(--red)' : 'var(--amber, #f0a500)',
            color: s.alert_level === 'critical' ? '#fff' : '#000',
            border: 'none', borderRadius: 4, padding: '3px 8px',
            fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700,
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          <span>{s.alert_level === 'critical' ? '🔴' : '🟡'}</span>
          <span>{s.name}: {s.current_stock} {s.unit}</span>
        </button>
      ))}
    </div>
  )
}
```

---

## Task 8: SupplySettings Bileşeni

**Files:**
- Create: `frontend/src/modules/laundry/components/SupplySettings.jsx`

- [ ] **Step 1: Bileşeni oluştur**

```jsx
// frontend/src/modules/laundry/components/SupplySettings.jsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

function SupplyForm({ onSave, onCancel, initial = {} }) {
  const [name, setName] = useState(initial.name || '')
  const [unit, setUnit] = useState(initial.unit || 'kg')
  const [warn, setWarn] = useState(initial.warning_threshold ?? '')
  const [crit, setCrit] = useState(initial.critical_threshold ?? '')
  const [err, setErr] = useState('')

  const handleSubmit = () => {
    setErr('')
    if (!name.trim()) { setErr('Ad zorunlu'); return }
    if (+crit <= +warn && +crit > 0) { setErr('Kritik eşik uyarıdan büyük olmalı'); return }
    onSave({ name: name.trim(), unit, warning_threshold: +warn, critical_threshold: +crit })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16, background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="form-input" placeholder="Ürün adı" value={name} onChange={e => setName(e.target.value)} style={{ flex: 2 }} />
        <select className="form-input" value={unit} onChange={e => setUnit(e.target.value)} style={{ flex: 1 }}>
          <option value="kg">kg</option>
          <option value="lt">lt</option>
          <option value="adet">adet</option>
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', minWidth: 60 }}>Uyarı ≤</label>
        <input className="form-input" type="number" min="0" step="0.1" value={warn} onChange={e => setWarn(e.target.value)} style={{ width: 80 }} />
        <label style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', minWidth: 60 }}>Kritik ≤</label>
        <input className="form-input" type="number" min="0" step="0.1" value={crit} onChange={e => setCrit(e.target.value)} style={{ width: 80 }} />
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>{unit}</span>
      </div>
      {err && <span style={{ color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: 10 }}>{err}</span>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" style={{ background: 'var(--accent)', color: '#000' }} onClick={handleSubmit}>Kaydet</button>
        <button className="btn btn-sm" onClick={onCancel}>İptal</button>
      </div>
    </div>
  )
}

function MachineLink({ supply, machines }) {
  const qc = useQueryClient()
  const [machineId, setMachineId] = useState('')
  const [amount, setAmount] = useState('0.1')

  const addMutation = useMutation({
    mutationFn: () => laundryApi.setMachineSupply(+machineId, supply.id, +amount),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplies'] }),
  })

  const delMutation = useMutation({
    mutationFn: (mid) => laundryApi.deleteMachineSupply(mid, supply.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplies'] }),
  })

  const linkedIds = (supply.machine_links || []).map(l => l.machine_id)
  const available = machines.filter(m => !linkedIds.includes(m.id))

  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1, marginBottom: 6 }}>MAKİNE BAĞLANTILARI</div>
      {(supply.machine_links || []).map(link => (
        <div key={link.machine_id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, flex: 1 }}>{link.machine_name}</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>{link.per_wash_amount} {supply.unit}/yıkama</span>
          <button onClick={() => delMutation.mutate(link.machine_id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 12 }}>✕</button>
        </div>
      ))}
      {available.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <select className="form-input" value={machineId} onChange={e => setMachineId(e.target.value)} style={{ flex: 1 }}>
            <option value="">Makine seç...</option>
            {available.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <input className="form-input" type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} style={{ width: 70 }} placeholder="miktar" />
          <button className="btn btn-sm" style={{ background: 'var(--accent)', color: '#000' }}
            onClick={() => { if (machineId) addMutation.mutate() }}
            disabled={!machineId || addMutation.isPending}
          >
            Ekle
          </button>
        </div>
      )}
    </div>
  )
}

function StockActions({ supply }) {
  const qc = useQueryClient()
  const [mode, setMode] = useState(null) // 'add' | 'set'
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')

  const addMut = useMutation({
    mutationFn: () => laundryApi.addStock(supply.id, +amount, note),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['supplies'] }); setMode(null); setAmount('') },
  })
  const setMut = useMutation({
    mutationFn: () => laundryApi.setStock(supply.id, +amount),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['supplies'] }); setMode(null); setAmount('') },
  })

  if (!mode) return (
    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
      <button className="btn btn-sm" style={{ background: 'var(--green)', color: '#fff' }} onClick={() => setMode('add')}>+ Stok Girişi</button>
      <button className="btn btn-sm" onClick={() => setMode('set')}>Sayım Düzeltme</button>
    </div>
  )

  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
      <input className="form-input" type="number" min="0" step="0.1" value={amount} onChange={e => setAmount(e.target.value)}
        placeholder={mode === 'add' ? 'Eklenecek miktar' : 'Yeni mevcut stok'} style={{ width: 140 }} />
      {mode === 'add' && (
        <input className="form-input" value={note} onChange={e => setNote(e.target.value)} placeholder="Not (isteğe bağlı)" style={{ flex: 1 }} />
      )}
      <button className="btn btn-sm" style={{ background: 'var(--accent)', color: '#000' }}
        onClick={() => mode === 'add' ? addMut.mutate() : setMut.mutate()}
        disabled={!amount || addMut.isPending || setMut.isPending}
      >
        {mode === 'add' ? 'Ekle' : 'Kaydet'}
      </button>
      <button className="btn btn-sm" onClick={() => setMode(null)}>İptal</button>
    </div>
  )
}

export default function SupplySettings() {
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState(null)
  const [logSupplyId, setLogSupplyId] = useState(null)

  const { data: supplies = [] } = useQuery({
    queryKey: ['supplies'],
    queryFn: () => laundryApi.getSupplies(true),
  })
  const { data: machines = [] } = useQuery({
    queryKey: ['machines'],
    queryFn: () => laundryApi.getMachines(),
  })
  const { data: log = [] } = useQuery({
    queryKey: ['supply-log', logSupplyId],
    queryFn: () => laundryApi.getSupplyLog(logSupplyId),
    enabled: !!logSupplyId,
  })

  const createMut = useMutation({
    mutationFn: (data) => laundryApi.createSupply(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['supplies'] }); setAdding(false) },
  })
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => laundryApi.updateSupply(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['supplies'] }); setEditId(null) },
  })
  const deactivateMut = useMutation({
    mutationFn: (id) => laundryApi.updateSupply(id, { is_active: 0 }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplies'] }),
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: 'var(--text2)', letterSpacing: 1 }}>STOK YÖNETİMİ</div>
        <button className="btn btn-sm" style={{ background: 'var(--accent)', color: '#000' }} onClick={() => setAdding(true)}>+ Ürün Ekle</button>
      </div>

      {adding && (
        <div style={{ marginBottom: 16 }}>
          <SupplyForm onSave={(data) => createMut.mutate(data)} onCancel={() => setAdding(false)} />
        </div>
      )}

      {supplies.map(s => (
        <div key={s.id} style={{
          background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8,
          padding: 14, marginBottom: 10,
          opacity: s.is_active ? 1 : 0.5,
        }}>
          {editId === s.id ? (
            <SupplyForm
              initial={s}
              onSave={(data) => updateMut.mutate({ id: s.id, data })}
              onCancel={() => setEditId(null)}
            />
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700 }}>{s.name}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginLeft: 8 }}>{s.unit}</span>
                  {!s.is_active && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginLeft: 8 }}>(pasif)</span>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{
                    fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700,
                    color: s.current_stock <= s.critical_threshold ? 'var(--red)'
                         : s.current_stock <= s.warning_threshold ? 'var(--amber, #f0a500)'
                         : 'var(--green)',
                  }}>
                    {s.current_stock} {s.unit}
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>
                    uyarı ≤ {s.warning_threshold} · kritik ≤ {s.critical_threshold}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn btn-sm" onClick={() => setEditId(s.id)}>Düzenle</button>
                  <button className="btn btn-sm" onClick={() => setLogSupplyId(logSupplyId === s.id ? null : s.id)}>Log</button>
                  {s.is_active && (
                    <button className="btn btn-sm" style={{ color: 'var(--red)' }} onClick={() => deactivateMut.mutate(s.id)}>Pasif</button>
                  )}
                </div>
              </div>

              <StockActions supply={s} />
              <MachineLink supply={s} machines={machines} />

              {logSupplyId === s.id && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1, marginBottom: 6 }}>SON HAREKETLER</div>
                  {log.length === 0 ? (
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>Hareket yok</div>
                  ) : log.map(l => (
                    <div key={l.id} style={{ display: 'flex', gap: 8, fontFamily: 'var(--mono)', fontSize: 10, marginBottom: 4 }}>
                      <span style={{ color: l.delta > 0 ? 'var(--green)' : 'var(--red)', minWidth: 50 }}>
                        {l.delta > 0 ? '+' : ''}{l.delta} {s.unit}
                      </span>
                      <span style={{ color: 'var(--text3)' }}>{l.reason}</span>
                      {l.note && <span style={{ color: 'var(--text2)' }}>{l.note}</span>}
                      <span style={{ color: 'var(--text3)', marginLeft: 'auto' }}>{l.created_at?.slice(0, 16)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  )
}
```

---

## Task 9: LaundrySettings — Stok Sekmesi

**Files:**
- Modify: `frontend/src/modules/laundry/LaundrySettings.jsx`

- [ ] **Step 1: Import ekle**

`LaundrySettings.jsx` dosyasının import bölümüne:

```js
import SupplySettings from './components/SupplySettings.jsx'
```

- [ ] **Step 2: Sekme listesine "Stok" ekle**

`LaundrySettings.jsx`'de sekme listesi (tab nav) bulunan yerde "Stok" sekmesini ekle. Mevcut sekme yapısını bul (örn. `['SLA', 'Bloklar', 'Kıyafet Tipleri']` gibi bir dizi veya state). "Stok"'u bu listeye ekle.

Sekme render kısmında:

```jsx
{activeTab === 'Stok' && <SupplySettings />}
```

- [ ] **Step 3: Görsel kontrol**

Settings açıkken "Stok" sekmesi görünmeli, ürün ekle/düzenle, stok giriş formu çalışmalı.

---

## Task 10: LaundryHub — SupplyWidget Entegrasyonu

**Files:**
- Modify: `frontend/src/modules/laundry/LaundryHub.jsx`

- [ ] **Step 1: Import ekle**

```js
import SupplyWidget from './components/SupplyWidget.jsx'
```

- [ ] **Step 2: MachineStrip'in hemen altına ekle**

LaundryHub JSX'inde `<MachineStrip .../>` bileşeninin hemen altına:

```jsx
<SupplyWidget onNavigateSettings={() => setActiveView('settings')} />
```

**Not:** `setActiveView` veya Settings'e geçişi sağlayan mevcut state/handler'ı kullan. Settings'e gidiş için farklı bir mekanizma varsa (örn. tab state, modal) onu kullan.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/modules/laundry/api.js frontend/src/modules/laundry/components/SupplyWidget.jsx frontend/src/modules/laundry/components/SupplySettings.jsx frontend/src/modules/laundry/LaundrySettings.jsx frontend/src/modules/laundry/LaundryHub.jsx
git commit -m "feat: A5 supply frontend — widget, settings tab, api"
```

---

## Manuel Test Listesi

1. Settings → "Stok" sekmesi açılır
2. "Deterjan" ürünü ekle (10 kg, uyarı: 3, kritik: 1)
3. Bir makineye bağla (0.1 kg/yıkama)
4. Çamaşır ekle → makineye ata → washing statüsüne geç → stok 9.9 kg olmalı
5. Stok giriş formu: +5 kg ekle → 14.9 olmalı
6. Sayım düzeltme: 2 kg set et → 2 olmalı
7. Stok 1 kg altına düşünce: LaundryHub'da kırmızı badge görünmeli
8. Stok 3 kg altına düşünce: sarı badge görünmeli
9. Badge tıklayınca Settings/Stok sekmesine gitmeli
10. Log paneli: hareketler tarih sırasıyla listelenmeli

---

## Self-Review Notları

- `adjustStockQuery` MAX(0, ...) clamp ile stok negatife düşmez ✓
- `getAlertSuppliesQuery` sadece `is_active = 1` ürünleri döner ✓
- Route yetkileri: okuma `laundryRead`, yazma `slaWrite` (campus_manager) ✓
- `advanceItemService` içindeki supply decrement `machine_id` null ise çalışmaz — ama washing'e geçişte machine_id zorunlu, zaten throw ediyor ✓
- SupplyWidget `refetchInterval: 60_000` ile her dk güncellenir ✓
- `machine_links_json` JSON parse hatası: boş array fallback var ✓
