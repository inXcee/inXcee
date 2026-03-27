# Çamaşırhane Modülü v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mevcut QR torba sistemini kaldırıp kişisel çamaşır parça takibi (dirty→washing→ready→delivered), makine yönetimi, kuyruk sistemi, fotoğraf/hasar kaydı, SLA motoru, WhatsApp bildirimi ve premium dashboard ile tam donanımlı laundry modülü yaz.

**Architecture:** Backend `backend/src/modules/laundry/` — routes/service/queries/sla/whatsapp. Frontend `frontend/src/modules/laundry/` — React Query + lazy-loaded pages. 7 yeni tablo migration ile eklenir. Mevcut CSS tasarım sistemi kullanılır (`var(--accent)`, `.panel`, `.btn`, `.badge`, `.filter-chip`, `.data-table`, `.kpi-card`, `.prog-bar`, `.form-input`).

**Tech Stack:** Express, better-sqlite3, node-cron, multer (upload zaten var), React 18, @tanstack/react-query, zustand, axios

---

## KRİTİK: Tasarım Sistemi Kuralları

Frontend kodunda **mutlaka** mevcut CSS class'ları ve değişkenlerini kullan:

| Değişken/Class | Değer | Kullanım |
|---|---|---|
| `var(--accent)` | `#f0a500` (amber/gold) | Primary accent renk |
| `var(--accent-hover)` | `#ffb720` | Hover state |
| `var(--accent-glow)` | `rgba(240,165,0,0.35)` | Glow efektleri |
| `var(--surface)` | `#0f1319` | Panel arka planı |
| `var(--surface2)` | `#161c26` | İç panel/input bg |
| `var(--border)` | `#232d3f` | Kenarlıklar |
| `var(--text)` / `var(--text2)` / `var(--text3)` | `#dde4f0` / `#7a8ba8` / `#3d4e6a` | Metin renkleri |
| `var(--green)` | `#27c96a` | Başarı/ready |
| `var(--red)` | `#e74c3c` | Hata/critical |
| `var(--blue)` | `#3b8cf0` | Bilgi |
| `.panel` + `.panel-header` + `.panel-body` | — | Kart konteyneri |
| `.btn` + `.btn-primary` / `.btn-ghost` / `.btn-danger` / `.btn-sm` / `.btn-xs` | — | Butonlar |
| `.badge-green` / `.badge-amber` / `.badge-red` / `.badge-blue` / `.badge-gray` | — | Durum rozetleri |
| `.filter-chip` + `.filter-chip.active` | — | Filtre sekmeleri |
| `.data-table` + `th` / `td` | — | Tablolar |
| `.kpi-card` | — | KPI kartları |
| `.prog-bar` + `.prog-fill` + `.prog-green` / `.prog-amber` / `.prog-red` | — | Progress bar |
| `.form-input` / `.form-select` / `.form-textarea` / `.form-label` | — | Form elemanları |
| `.alert-danger` / `.alert-warn` / `.alert-info` / `.alert-success` | — | Uyarılar |
| `.empty-state` + `.empty-icon` + `.empty-title` + `.empty-sub` | — | Boş durumlar |
| `.sect` + `.sect-title` + `.sect-line` | — | Bölüm ayırıcıları |
| `.live-dot` | — | Canlı animasyonlu nokta |
| `.fade-up` / `.fade-up-1` / `.fade-up-2` / `.fade-up-3` | — | Giriş animasyonları |
| Font: `var(--display)` = `'Bebas Neue'` | — | Başlıklar |
| Font: `var(--mono)` = `'IBM Plex Mono'` | — | Etiketler, badge'ler |
| Font: `var(--sans)` = `'IBM Plex Sans'` | — | Body metin |

**YASAK:** Hardcoded `#6366f1`, `#818cf8`, `#a5b4fc`, `#8b5cf6` (indigo/mor) renk kullanımı. Bunlar yerine `var(--accent)`, `var(--blue)`, `var(--purple)` gibi CSS değişkenleri kullan.

---

## ÖNEMLI: Mevcut Durum

`backend/src/modules/laundry/` — queries.js, service.js, routes.js **tamamen değiştirilecek** (QR torba sistemi kaldırılıyor).
`frontend/src/modules/laundry/LaundryPage.jsx` — **tamamen değiştirilecek**.
`QRScanner.jsx`, `DistributionRoute.jsx` — silinecek.
Mevcut `laundry_bags` ve `machines` tabloları — dokunulmayacak (geçmiş veri korunur).
Yeni `laundry_machines` tablosu ayrı olarak oluşturulacak.

Test kullanıcısı: `camasir/admin123` (role: `laundry`)
Görüntüleme: `mudur/admin123` (role: `campus_manager`), `vardiya/admin123` (role: `shift_supervisor`)

---

## Dosya Haritası

### Backend — Oluşturulacak/Değiştirilecek
```
backend/src/shared/db/index.js              — Modify: 7 yeni tablo migration
backend/src/modules/laundry/queries.js      — Overwrite: items, machines, queue, damage, SLA, reports
backend/src/modules/laundry/service.js      — Overwrite: state machine, kuyruk, hasar, toplu işlem
backend/src/modules/laundry/routes.js       — Overwrite: 20+ endpoint, yetki matrisi
backend/src/modules/laundry/sla.js          — Create: SLA ihlal kontrolü + makine zamanlayıcı
backend/src/modules/laundry/whatsapp.js     — Create: Meta Cloud API entegrasyonu
backend/src/modules/laundry/laundry.test.js — Create: kapsamlı test suite
backend/src/shared/cron/index.js            — Modify: laundry SLA cron ekleme
```

### Frontend — Oluşturulacak/Değiştirilecek
```
frontend/src/modules/laundry/api.js                   — Create: tüm API çağrıları
frontend/src/modules/laundry/LaundryPage.jsx           — Overwrite: ana sayfa + filtreler
frontend/src/modules/laundry/LaundryDashboard.jsx      — Create: KPI + kanban + makine panel
frontend/src/modules/laundry/LaundryReport.jsx         — Create: raporlama + CSV
frontend/src/modules/laundry/LaundrySettings.jsx       — Create: SLA + makine ayarları
frontend/src/modules/laundry/components/ItemCard.jsx   — Create: çamaşır kayıt kartı
frontend/src/modules/laundry/components/NewItemModal.jsx — Create: yeni kayıt formu
frontend/src/modules/laundry/components/DeliveryModal.jsx — Create: teslim akışı + imza
frontend/src/modules/laundry/components/MachineStrip.jsx  — Create: makine durumu şeridi
frontend/src/modules/laundry/components/DamageModal.jsx   — Create: hasar kaydı + fotoğraf
frontend/src/modules/laundry/components/QueuePanel.jsx    — Create: sıra yönetimi
frontend/src/modules/laundry/components/SlaAlert.jsx      — Create: SLA ihlal bileşeni
frontend/src/App.jsx                                   — Modify: 3 yeni route
```

### Silinecek
```
frontend/src/modules/laundry/QRScanner.jsx
frontend/src/modules/laundry/DistributionRoute.jsx
```

---

## FAZ 1 — DB Migration + Çekirdek Backend

### Task 1: DB Migration — 7 yeni tablo + seed

**Files:**
- Modify: `backend/src/shared/db/index.js`

- [ ] **Step 1: Mevcut index.js'i oku ve migration bloğunu bul**

`backend/src/shared/db/index.js` dosyasını oku. `initDB()` fonksiyonunun sonundaki son `try { db.exec(...)  } catch(_) {}` bloğunu bul. Yeni tabloları bunun altına ekleyeceğiz.

- [ ] **Step 2: Migration kodunu ekle**

`initDB()` fonksiyonunun sonuna (son mevcut migration'dan sonra, fonksiyon kapanmadan önce) ekle:

```javascript
  // ═══════════════════════════════════════════════════════
  // Laundry v2 — Kişisel Parça Takibi
  // ═══════════════════════════════════════════════════════

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

  // SLA varsayılan konfigürasyon
  try { db.exec(`INSERT OR IGNORE INTO laundry_sla_config(stage,warning_hours,critical_hours) VALUES
    ('dirty',24,48),('washing',1,2),('ready',24,48)`) } catch(_) {}

  // Varsayılan makineler (ilk kurulumda seed)
  try {
    const mCount = db.prepare('SELECT COUNT(*) as c FROM laundry_machines').get()
    if (mCount.c === 0) {
      db.exec(`INSERT INTO laundry_machines(name,type,capacity_kg) VALUES
        ('Makine 1','washer',10),('Makine 2','washer',10),('Makine 3','washer',8),('Kurutucu 1','dryer',10)`)
    }
  } catch(_) {}

  // Performans indeksleri
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_laundry_items_status ON laundry_items(status)`) } catch(_) {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_laundry_items_room ON laundry_items(room_id)`) } catch(_) {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_laundry_items_updated ON laundry_items(updated_at)`) } catch(_) {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_laundry_queue_position ON laundry_queue(position)`) } catch(_) {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_laundry_history_item ON laundry_history(item_id)`) } catch(_) {}
```

- [ ] **Step 3: Migration'ı test et**

```bash
cd backend && node -e "import('./src/shared/db/index.js').then(m=>{m.initDB();const db=m.getDB();const tables=db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'laundry%' ORDER BY name\").all();console.log('Tablolar:',tables.map(t=>t.name));const idx=db.prepare(\"SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_laundry%'\").all();console.log('Indexler:',idx.map(i=>i.name));const mc=db.prepare('SELECT * FROM laundry_machines').all();console.log('Makineler:',mc.length);const sla=db.prepare('SELECT * FROM laundry_sla_config').all();console.log('SLA config:',sla)})"
```

Beklenen çıktı:
- 7 tablo: `laundry_damages`, `laundry_deliveries`, `laundry_history`, `laundry_items`, `laundry_machines`, `laundry_queue`, `laundry_sla_config`
- 5 index: `idx_laundry_items_status`, `idx_laundry_items_room`, `idx_laundry_items_updated`, `idx_laundry_queue_position`, `idx_laundry_history_item`
- 4 makine (3 washer + 1 dryer)
- 3 SLA config satırı (dirty, washing, ready)

- [ ] **Step 4: Commit**

```bash
git add backend/src/shared/db/index.js && git commit -m "feat: laundry v2 — DB migration 7 yeni tablo + indeksler + seed"
```

---

### Task 2: Backend — queries.js (tüm SQL sorguları)

**Files:**
- Overwrite: `backend/src/modules/laundry/queries.js`

- [ ] **Step 1: Failing test yaz**

`backend/src/modules/laundry/laundry.test.js` dosyasını oluştur:

```javascript
import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token, userId, roomId

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const r = await request(app).post('/api/auth/login').send({ username: 'camasir', password: 'admin123' })
  token = r.body.token
  const db = getDB()
  userId = db.prepare("SELECT id FROM users WHERE role='laundry' LIMIT 1").get().id
  roomId = db.prepare("SELECT id FROM rooms LIMIT 1").get().id
})

describe('Laundry queries', () => {
  it('item oluşturur ve geri okur', async () => {
    const { insertItemQuery, getItemQuery } = await import('./queries.js')
    const id = insertItemQuery({ room_id: roomId, item_count: 3, notes: 'test', created_by: userId })
    expect(id).toBeTruthy()
    const item = getItemQuery(id)
    expect(item.status).toBe('dirty')
    expect(item.item_count).toBe(3)
    expect(item.room_no).toBeTruthy()
  })

  it('item listeler ve filtreler', async () => {
    const { listItemsQuery } = await import('./queries.js')
    const all = listItemsQuery()
    expect(all.length).toBeGreaterThan(0)
    expect(all[0]).toHaveProperty('hours_in_status')
    const dirty = listItemsQuery({ status: 'dirty' })
    expect(dirty.every(i => i.status === 'dirty')).toBe(true)
  })

  it('makine CRUD çalışıyor', async () => {
    const { listMachinesQuery, getMachineQuery, insertMachineQuery, updateMachineQuery } = await import('./queries.js')
    const machines = listMachinesQuery()
    expect(machines.length).toBe(4)
    const newId = insertMachineQuery({ name: 'Test Makine', type: 'washer', capacity_kg: 5 })
    const m = getMachineQuery(newId)
    expect(m.name).toBe('Test Makine')
    updateMachineQuery(newId, { status: 'running' })
    expect(getMachineQuery(newId).status).toBe('running')
  })

  it('SLA config varsayılan değerlerle döner', async () => {
    const { getSlaConfigQuery } = await import('./queries.js')
    const configs = getSlaConfigQuery()
    expect(configs.length).toBe(3)
    const dirty = configs.find(c => c.stage === 'dirty')
    expect(dirty.warning_hours).toBe(24)
    expect(dirty.critical_hours).toBe(48)
  })

  it('queue — sıraya ekler ve pozisyon doğru', async () => {
    const { insertItemQuery, addToQueueQuery, getQueueQuery, removeFromQueueQuery } = await import('./queries.js')
    const id1 = insertItemQuery({ room_id: roomId, item_count: 1, created_by: userId })
    const id2 = insertItemQuery({ room_id: roomId, item_count: 1, urgent: 1, created_by: userId })
    addToQueueQuery({ item_id: id1, priority: 'normal' })
    addToQueueQuery({ item_id: id2, priority: 'urgent' })
    const queue = getQueueQuery()
    // urgent olan en önde olmalı
    expect(queue[0].priority).toBe('urgent')
    removeFromQueueQuery(queue[0].id)
  })

  it('damage — hasar kaydı oluşturur', async () => {
    const { insertItemQuery, insertDamageQuery, getDamagesForItemQuery } = await import('./queries.js')
    const itemId = insertItemQuery({ room_id: roomId, item_count: 1, created_by: userId })
    insertDamageQuery({ item_id: itemId, description: 'Leke var', reported_by: userId })
    const damages = getDamagesForItemQuery(itemId)
    expect(damages.length).toBe(1)
    expect(damages[0].description).toBe('Leke var')
  })

  it('stats — istatistik sorgusu hata vermez', async () => {
    const { getStatsQuery } = await import('./queries.js')
    const stats = getStatsQuery({})
    expect(stats).toHaveProperty('by_status')
    expect(stats).toHaveProperty('delivered_today')
    expect(stats).toHaveProperty('avg_hours')
    expect(stats).toHaveProperty('sla_violations')
    // tarih filtreli
    const filtered = getStatsQuery({ from_date: '2026-01-01', to_date: '2026-12-31' })
    expect(filtered).toHaveProperty('by_status')
  })

  it('history — kayıt geçmişi eklenir ve okunur', async () => {
    const { insertItemQuery, insertHistoryQuery, getItemHistoryQuery } = await import('./queries.js')
    const itemId = insertItemQuery({ room_id: roomId, item_count: 1, created_by: userId })
    insertHistoryQuery({ item_id: itemId, from_status: null, to_status: 'dirty', action_by: userId })
    insertHistoryQuery({ item_id: itemId, from_status: 'dirty', to_status: 'washing', action_by: userId })
    const history = getItemHistoryQuery(itemId)
    expect(history.length).toBe(2)
    expect(history[0].to_status).toBe('dirty')
  })
})
```

- [ ] **Step 2: Test çalıştır — FAIL bekleniyor**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js
```

Beklenen: FAIL — `queries.js` henüz yeni fonksiyonları export etmiyor.

- [ ] **Step 3: queries.js'i yaz**

`backend/src/modules/laundry/queries.js` dosyasının **tüm içeriğini** aşağıdakiyle değiştir:

```javascript
import { getDB } from '../../shared/db/index.js'

// ═══════════════════════════════════════════════════════════════════════════
// ITEMS
// ═══════════════════════════════════════════════════════════════════════════

export function insertItemQuery({ room_id, item_count = 1, item_details, notes, urgent = 0, photo_url, created_by }) {
  const db = getDB()
  const r = db.prepare(`
    INSERT INTO laundry_items(room_id, item_count, item_details, notes, urgent, photo_url, created_by, updated_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(room_id, item_count, item_details || null, notes || null, urgent ? 1 : 0, photo_url || null, created_by)
  return r.lastInsertRowid
}

export function getItemQuery(id) {
  const db = getDB()
  return db.prepare(`
    SELECT li.*,
           r.block, r.room_no, r.floor,
           u.full_name as created_by_name,
           m.name as machine_name,
           (SELECT COUNT(*) FROM laundry_damages WHERE item_id = li.id) as damage_count
    FROM laundry_items li
    LEFT JOIN rooms r ON r.id = li.room_id
    LEFT JOIN users u ON u.id = li.created_by
    LEFT JOIN laundry_machines m ON m.id = li.machine_id
    WHERE li.id = ?
  `).get(id)
}

export function listItemsQuery({ status, urgent, sla_only, search } = {}) {
  const db = getDB()
  const conditions = ["li.status != 'delivered'"]
  const params = []

  if (status) { conditions.push('li.status = ?'); params.push(status) }
  if (urgent) { conditions.push('li.urgent = 1') }
  if (search) {
    conditions.push("(r.block || ' ' || r.room_no LIKE ? OR li.notes LIKE ?)")
    params.push(`%${search}%`, `%${search}%`)
  }
  if (sla_only) {
    conditions.push(`(
      SELECT CASE
        WHEN li.status='dirty' THEN (julianday('now') - julianday(li.created_at)) * 24
        WHEN li.status IN ('washing','ready') THEN (julianday('now') - julianday(li.updated_at)) * 24
        ELSE 0
      END
    ) >= COALESCE((SELECT warning_hours FROM laundry_sla_config WHERE stage = li.status LIMIT 1), 9999)`)
  }

  const where = conditions.join(' AND ')
  return db.prepare(`
    SELECT li.*,
           r.block, r.room_no,
           u.full_name as created_by_name,
           m.name as machine_name,
           CASE
             WHEN li.status IN ('dirty','washing','ready')
             THEN ROUND((julianday('now') - julianday(COALESCE(li.updated_at, li.created_at))) * 24, 1)
             ELSE NULL
           END as hours_in_status,
           (SELECT COUNT(*) FROM laundry_damages WHERE item_id = li.id) as damage_count
    FROM laundry_items li
    LEFT JOIN rooms r ON r.id = li.room_id
    LEFT JOIN users u ON u.id = li.created_by
    LEFT JOIN laundry_machines m ON m.id = li.machine_id
    WHERE ${where}
    ORDER BY li.urgent DESC, li.updated_at ASC
  `).all(...params)
}

export function listAllItemsQuery({ status, from_date, to_date } = {}) {
  const db = getDB()
  const conditions = []
  const params = []
  if (status) { conditions.push('li.status = ?'); params.push(status) }
  if (from_date) { conditions.push('li.created_at >= ?'); params.push(from_date) }
  if (to_date) { conditions.push('li.created_at <= ?'); params.push(to_date) }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''
  return db.prepare(`
    SELECT li.*, r.block, r.room_no, u.full_name as created_by_name
    FROM laundry_items li
    LEFT JOIN rooms r ON r.id = li.room_id
    LEFT JOIN users u ON u.id = li.created_by
    ${where}
    ORDER BY li.created_at DESC
  `).all(...params)
}

export function updateItemStatusQuery(id, status, extra = {}) {
  const db = getDB()
  const sets = ["status = ?", "updated_at = datetime('now')"]
  const vals = [status]
  if (extra.machine_id !== undefined) { sets.push('machine_id = ?'); vals.push(extra.machine_id) }
  if (extra.shelf_location !== undefined) { sets.push('shelf_location = ?'); vals.push(extra.shelf_location) }
  if (extra.photo_url !== undefined) { sets.push('photo_url = ?'); vals.push(extra.photo_url) }
  vals.push(id)
  db.prepare(`UPDATE laundry_items SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
}

export function deleteItemQuery(id) {
  const db = getDB()
  const result = db.prepare("DELETE FROM laundry_items WHERE id = ? AND status = 'dirty'").run(id)
  return result.changes > 0
}

// ═══════════════════════════════════════════════════════════════════════════
// MACHINES
// ═══════════════════════════════════════════════════════════════════════════

export function listMachinesQuery() {
  const db = getDB()
  return db.prepare(`
    SELECT lm.*,
           (SELECT COUNT(*) FROM laundry_items WHERE machine_id = lm.id AND status = 'washing') as active_items
    FROM laundry_machines lm
    ORDER BY lm.type, lm.name
  `).all()
}

export function getMachineQuery(id) {
  const db = getDB()
  return db.prepare('SELECT * FROM laundry_machines WHERE id = ?').get(id)
}

export function insertMachineQuery({ name, type = 'washer', capacity_kg = 10 }) {
  const db = getDB()
  return db.prepare('INSERT INTO laundry_machines(name, type, capacity_kg) VALUES(?, ?, ?)').run(name, type, capacity_kg).lastInsertRowid
}

export function updateMachineQuery(id, fields) {
  const db = getDB()
  const allowed = ['name', 'type', 'status', 'timer_end', 'capacity_kg', 'maintenance_notes']
  const entries = Object.entries(fields).filter(([k]) => allowed.includes(k))
  if (!entries.length) return
  const sets = entries.map(([k]) => `${k} = ?`)
  const vals = entries.map(([, v]) => v)
  db.prepare(`UPDATE laundry_machines SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id)
}

export function deleteMachineQuery(id) {
  const db = getDB()
  const hasActive = db.prepare("SELECT COUNT(*) as c FROM laundry_items WHERE machine_id = ? AND status = 'washing'").get(id)
  if (hasActive.c > 0) return false
  db.prepare('DELETE FROM laundry_machines WHERE id = ?').run(id)
  return true
}

// ═══════════════════════════════════════════════════════════════════════════
// QUEUE (FIFO + Urgent Priority)
// ═══════════════════════════════════════════════════════════════════════════

export function getQueueQuery(machineId) {
  const db = getDB()
  const where = machineId ? 'AND lq.machine_id = ?' : ''
  const params = machineId ? [machineId] : []
  return db.prepare(`
    SELECT lq.*, li.room_id, li.item_count, li.urgent, li.notes,
           r.block, r.room_no
    FROM laundry_queue lq
    LEFT JOIN laundry_items li ON li.id = lq.item_id
    LEFT JOIN rooms r ON r.id = li.room_id
    WHERE 1=1 ${where}
    ORDER BY lq.priority DESC, lq.position ASC
  `).all(...params)
}

export function addToQueueQuery({ item_id, machine_id, priority = 'normal' }) {
  const db = getDB()
  if (priority === 'urgent') {
    // Urgent: pozisyon 1'e koy, diğerlerini kaydır
    db.prepare('UPDATE laundry_queue SET position = position + 1').run()
    db.prepare(`
      INSERT INTO laundry_queue(item_id, machine_id, priority, position)
      VALUES(?, ?, 'urgent', 1)
    `).run(item_id, machine_id || null)
  } else {
    // Normal: sona ekle
    const max = db.prepare('SELECT COALESCE(MAX(position), 0) as m FROM laundry_queue').get()
    db.prepare(`
      INSERT INTO laundry_queue(item_id, machine_id, priority, position)
      VALUES(?, ?, 'normal', ?)
    `).run(item_id, machine_id || null, max.m + 1)
  }
}

export function removeFromQueueQuery(queueId) {
  const db = getDB()
  db.prepare('DELETE FROM laundry_queue WHERE id = ?').run(queueId)
}

export function removeItemFromQueueQuery(itemId) {
  const db = getDB()
  db.prepare('DELETE FROM laundry_queue WHERE item_id = ?').run(itemId)
}

// ═══════════════════════════════════════════════════════════════════════════
// DELIVERIES
// ═══════════════════════════════════════════════════════════════════════════

export function insertDeliveryQuery({ item_id, delivered_to, signature_data, delivered_by }) {
  const db = getDB()
  db.prepare(`
    INSERT INTO laundry_deliveries(item_id, delivered_to, signature_data, delivered_by)
    VALUES(?, ?, ?, ?)
  `).run(item_id, delivered_to, signature_data || null, delivered_by)
}

export function getDeliveryForItemQuery(itemId) {
  const db = getDB()
  return db.prepare(`
    SELECT ld.*, u.full_name as delivered_by_name
    FROM laundry_deliveries ld
    LEFT JOIN users u ON u.id = ld.delivered_by
    WHERE ld.item_id = ?
  `).get(itemId)
}

// ═══════════════════════════════════════════════════════════════════════════
// DAMAGES
// ═══════════════════════════════════════════════════════════════════════════

export function insertDamageQuery({ item_id, photo_url, description, reported_by }) {
  const db = getDB()
  db.prepare(`
    INSERT INTO laundry_damages(item_id, photo_url, description, reported_by)
    VALUES(?, ?, ?, ?)
  `).run(item_id, photo_url || null, description, reported_by)
}

export function getDamagesForItemQuery(itemId) {
  const db = getDB()
  return db.prepare(`
    SELECT ld.*, u.full_name as reported_by_name
    FROM laundry_damages ld
    LEFT JOIN users u ON u.id = ld.reported_by
    WHERE ld.item_id = ?
    ORDER BY ld.created_at DESC
  `).all(itemId)
}

// ═══════════════════════════════════════════════════════════════════════════
// HISTORY
// ═══════════════════════════════════════════════════════════════════════════

export function insertHistoryQuery({ item_id, from_status, to_status, action_by, notes }) {
  const db = getDB()
  db.prepare(`
    INSERT INTO laundry_history(item_id, from_status, to_status, action_by, notes)
    VALUES(?, ?, ?, ?, ?)
  `).run(item_id, from_status || null, to_status, action_by, notes || null)
}

export function getItemHistoryQuery(itemId) {
  const db = getDB()
  return db.prepare(`
    SELECT lh.*, u.full_name as action_by_name
    FROM laundry_history lh
    LEFT JOIN users u ON u.id = lh.action_by
    WHERE lh.item_id = ?
    ORDER BY lh.created_at ASC
  `).all(itemId)
}

// ═══════════════════════════════════════════════════════════════════════════
// SLA CONFIG + VIOLATIONS
// ═══════════════════════════════════════════════════════════════════════════

export function getSlaConfigQuery() {
  const db = getDB()
  return db.prepare('SELECT * FROM laundry_sla_config ORDER BY stage').all()
}

export function upsertSlaConfigQuery({ stage, warning_hours, critical_hours, updated_by }) {
  const db = getDB()
  db.prepare(`
    INSERT INTO laundry_sla_config(stage, warning_hours, critical_hours, updated_by, updated_at)
    VALUES(?, ?, ?, ?, datetime('now'))
    ON CONFLICT(stage) DO UPDATE SET
      warning_hours = excluded.warning_hours,
      critical_hours = excluded.critical_hours,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `).run(stage, warning_hours, critical_hours, updated_by)
}

export function getSlaViolationsQuery() {
  const db = getDB()
  return db.prepare(`
    SELECT li.*, r.block, r.room_no,
      sc.warning_hours, sc.critical_hours,
      ROUND((julianday('now') - julianday(COALESCE(li.updated_at, li.created_at))) * 24, 1) as hours_in_status,
      CASE
        WHEN ROUND((julianday('now') - julianday(COALESCE(li.updated_at, li.created_at))) * 24, 1) >= sc.critical_hours THEN 'critical'
        ELSE 'warning'
      END as sla_level
    FROM laundry_items li
    LEFT JOIN rooms r ON r.id = li.room_id
    LEFT JOIN laundry_sla_config sc ON sc.stage = li.status
    WHERE li.status IN ('dirty','washing','ready')
      AND sc.warning_hours IS NOT NULL
      AND ROUND((julianday('now') - julianday(COALESCE(li.updated_at, li.created_at))) * 24, 1) >= sc.warning_hours
    ORDER BY hours_in_status DESC
  `).all()
}

// ═══════════════════════════════════════════════════════════════════════════
// REPORTS / STATS (parametreli — SQL injection yok)
// ═══════════════════════════════════════════════════════════════════════════

export function getStatsQuery({ from_date, to_date } = {}) {
  const db = getDB()

  const by_status = db.prepare(`
    SELECT status, COUNT(*) as count FROM laundry_items
    WHERE status != 'delivered' GROUP BY status
  `).all()

  const delivered_today = db.prepare(`
    SELECT COUNT(*) as count FROM laundry_deliveries
    WHERE date(delivered_at) = date('now')
  `).get()

  const avg_hours = db.prepare(`
    SELECT li.status,
      ROUND(AVG((julianday('now') - julianday(COALESCE(li.updated_at, li.created_at))) * 24), 1) as avg_h
    FROM laundry_items li
    WHERE li.status IN ('dirty','washing','ready')
    GROUP BY li.status
  `).all()

  const sla_violations = db.prepare(`
    SELECT COUNT(*) as count FROM laundry_items li
    LEFT JOIN laundry_sla_config sc ON sc.stage = li.status
    WHERE li.status IN ('dirty','washing','ready')
      AND ROUND((julianday('now') - julianday(COALESCE(li.updated_at, li.created_at))) * 24, 1)
        >= COALESCE(sc.warning_hours, 9999)
  `).get()

  // Tarih aralığı filtreli istatistik
  let period_total = { count: 0 }
  let period_delivered = { count: 0 }
  if (from_date && to_date) {
    period_total = db.prepare(`
      SELECT COUNT(*) as count FROM laundry_items
      WHERE created_at >= ? AND created_at <= ?
    `).get(from_date, to_date)
    period_delivered = db.prepare(`
      SELECT COUNT(*) as count FROM laundry_deliveries
      WHERE delivered_at >= ? AND delivered_at <= ?
    `).get(from_date, to_date)
  }

  // Makine kullanım istatistikleri
  const machine_stats = db.prepare(`
    SELECT lm.name, lm.type, lm.status,
      (SELECT COUNT(*) FROM laundry_items WHERE machine_id = lm.id AND status = 'washing') as active_loads
    FROM laundry_machines lm ORDER BY lm.type, lm.name
  `).all()

  return { by_status, delivered_today, avg_hours, sla_violations, period_total, period_delivered, machine_stats }
}
```

- [ ] **Step 4: Testi çalıştır — PASS bekleniyor**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js
```

- [ ] **Step 5: Commit**

```bash
cd backend && git add src/modules/laundry/queries.js src/modules/laundry/laundry.test.js && git commit -m "feat: laundry queries — items, machines, queue, damage, SLA, reports"
```

---

### Task 3: Backend — service.js (state machine + iş mantığı)

**Files:**
- Overwrite: `backend/src/modules/laundry/service.js`

- [ ] **Step 1: State machine testlerini ekle**

`laundry.test.js` dosyasına ekle:

```javascript
describe('State machine', () => {
  let itemId

  it('yeni item oluşturur (dirty)', async () => {
    const res = await request(app)
      .post('/api/laundry/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ room_id: roomId, item_count: 2, notes: 'state test' })
    expect(res.status).toBe(201)
    expect(res.body.status).toBe('dirty')
    itemId = res.body.id
  })

  it('dirty → washing: machine_id olmadan REJECT', async () => {
    const res = await request(app)
      .patch(`/api/laundry/items/${itemId}/advance`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('Makine')
  })

  it('dirty → washing: machine_id ile OK', async () => {
    const db = getDB()
    const machine = db.prepare("SELECT id FROM laundry_machines WHERE status='idle' LIMIT 1").get()
    const res = await request(app)
      .patch(`/api/laundry/items/${itemId}/advance`)
      .set('Authorization', `Bearer ${token}`)
      .send({ machine_id: machine.id })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('washing')
    // Makine running olmalı
    const m = db.prepare('SELECT status FROM laundry_machines WHERE id=?').get(machine.id)
    expect(m.status).toBe('running')
  })

  it('washing → ready: shelf_location ile OK', async () => {
    const res = await request(app)
      .patch(`/api/laundry/items/${itemId}/advance`)
      .set('Authorization', `Bearer ${token}`)
      .send({ shelf_location: '2. Kat Raf A' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ready')
    expect(res.body.shelf_location).toBe('2. Kat Raf A')
  })

  it('ready → delivered: isim olmadan REJECT', async () => {
    const res = await request(app)
      .patch(`/api/laundry/items/${itemId}/deliver`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('zorunlu')
  })

  it('ready → delivered: isim ile OK', async () => {
    const res = await request(app)
      .patch(`/api/laundry/items/${itemId}/deliver`)
      .set('Authorization', `Bearer ${token}`)
      .send({ delivered_to: 'Ahmet Yılmaz' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('delivered')
  })

  it('delivered itemdan advance REJECT', async () => {
    const res = await request(app)
      .patch(`/api/laundry/items/${itemId}/advance`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
    expect(res.status).toBe(400)
  })

  it('herhangi durumdan → lost', async () => {
    // Yeni item oluştur
    const create = await request(app)
      .post('/api/laundry/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ room_id: roomId, item_count: 1 })
    const res = await request(app)
      .patch(`/api/laundry/items/${create.body.id}/lost`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: 'Bulunamadı' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('lost')
  })

  it('sadece dirty olan silinebilir', async () => {
    const create = await request(app)
      .post('/api/laundry/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ room_id: roomId, item_count: 1 })
    // Dirty → silebilir
    const del = await request(app)
      .delete(`/api/laundry/items/${create.body.id}`)
      .set('Authorization', `Bearer ${token}`)
    expect(del.status).toBe(200)
  })

  it('toplu teslim çalışıyor', async () => {
    // 2 tane ready item oluştur
    const ids = []
    for (let i = 0; i < 2; i++) {
      const c = await request(app).post('/api/laundry/items').set('Authorization', `Bearer ${token}`).send({ room_id: roomId, item_count: 1 })
      const db = getDB()
      const machine = db.prepare("SELECT id FROM laundry_machines WHERE status='idle' LIMIT 1").get()
      if (machine) {
        await request(app).patch(`/api/laundry/items/${c.body.id}/advance`).set('Authorization', `Bearer ${token}`).send({ machine_id: machine.id })
        await request(app).patch(`/api/laundry/items/${c.body.id}/advance`).set('Authorization', `Bearer ${token}`).send({ shelf_location: 'Raf' })
        ids.push(c.body.id)
      }
    }
    if (ids.length >= 2) {
      const res = await request(app)
        .post('/api/laundry/items/batch-deliver')
        .set('Authorization', `Bearer ${token}`)
        .send({ item_ids: ids, delivered_to: 'Mehmet Kaya' })
      expect(res.status).toBe(200)
      expect(res.body.delivered).toBe(ids.length)
    }
  })
})
```

- [ ] **Step 2: Test çalıştır — FAIL bekleniyor**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js
```

- [ ] **Step 3: service.js yaz**

`backend/src/modules/laundry/service.js` dosyasının **tüm içeriğini** aşağıdakiyle değiştir:

```javascript
import * as q from './queries.js'
import { createNotification } from '../../shared/notifications/service.js'
import { logAudit } from '../../shared/audit.js'

// ═══════════════════════════════════════════════════════════════════════════
// STATE MACHINE
// ═══════════════════════════════════════════════════════════════════════════

const TRANSITIONS = {
  dirty: 'washing',
  washing: 'ready',
  ready: 'delivered',
}

// ═══════════════════════════════════════════════════════════════════════════
// ITEM CRUD
// ═══════════════════════════════════════════════════════════════════════════

export function createItemService({ room_id, item_count, item_details, notes, urgent, photo_url }, userId) {
  if (!room_id) throw new Error('Oda seçilmeli')
  if (!item_count || item_count < 1) throw new Error('Parça adedi en az 1 olmalı')

  const id = q.insertItemQuery({ room_id, item_count, item_details, notes, urgent, photo_url, created_by: userId })
  q.insertHistoryQuery({ item_id: id, from_status: null, to_status: 'dirty', action_by: userId, notes: `${item_count} parça kayıt` })

  // Acil ise otomatik kuyruğa ekle
  if (urgent) {
    q.addToQueueQuery({ item_id: id, priority: 'urgent' })
  }

  logAudit(userId, 'laundry_create', 'laundry', id, `${item_count} parça`)
  return q.getItemQuery(id)
}

export function advanceItemService(id, { machine_id, shelf_location }, userId) {
  const item = q.getItemQuery(id)
  if (!item) throw new Error('Kayıt bulunamadı')
  if (!TRANSITIONS[item.status]) throw new Error(`"${item.status}" durumundan ilerlenemez`)

  const nextStatus = TRANSITIONS[item.status]
  const extra = {}

  if (nextStatus === 'washing') {
    if (!machine_id) throw new Error('Makine seçilmeli')
    extra.machine_id = machine_id
    // Makineyi çalışır yap
    q.updateMachineQuery(machine_id, { status: 'running' })
    // Kuyruktan çıkar (varsa)
    q.removeItemFromQueueQuery(id)
  }

  if (nextStatus === 'ready') {
    extra.shelf_location = shelf_location || null
    // Makineyi serbest bırak
    if (item.machine_id) {
      q.updateMachineQuery(item.machine_id, { status: 'done' })
    }
    // SSE: rafta hazır bildirimi
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
  q.insertHistoryQuery({ item_id: id, from_status: 'ready', to_status: 'delivered', action_by: userId, notes: `Teslim: ${delivered_to.trim()}` })
  logAudit(userId, 'laundry_deliver', 'laundry', id, `→ ${delivered_to.trim()}`)

  return q.getItemQuery(id)
}

export function batchDeliverService(itemIds, { delivered_to, signature_data }, userId) {
  if (!delivered_to || !delivered_to.trim()) throw new Error('Teslim alanın adı zorunlu')
  if (!Array.isArray(itemIds) || !itemIds.length) throw new Error('En az 1 kayıt seçilmeli')

  let delivered = 0
  const errors = []
  for (const id of itemIds) {
    try {
      deliverItemService(id, { delivered_to, signature_data }, userId)
      delivered++
    } catch (e) {
      errors.push({ id, error: e.message })
    }
  }
  return { delivered, errors }
}

export function lostItemService(id, { notes }, userId) {
  const item = q.getItemQuery(id)
  if (!item) throw new Error('Kayıt bulunamadı')
  if (item.status === 'delivered') throw new Error('Teslim edilmiş kayıt kayıp işaretlenemez')

  // Makinedeyse makineyi serbest bırak
  if (item.status === 'washing' && item.machine_id) {
    q.updateMachineQuery(item.machine_id, { status: 'idle' })
  }
  // Kuyruktaysa çıkar
  q.removeItemFromQueueQuery(id)

  q.updateItemStatusQuery(id, 'lost')
  q.insertHistoryQuery({ item_id: id, from_status: item.status, to_status: 'lost', action_by: userId, notes })
  logAudit(userId, 'laundry_lost', 'laundry', id, notes || '')

  createNotification({
    message: `⚠️ ${item.block || '?'} ${item.room_no || '?'} — ${item.item_count} parça KAYIP olarak işaretlendi`,
    type: 'warning',
    module: 'laundry',
    target_role: 'shift_supervisor',
  })

  return q.getItemQuery(id)
}

export function deleteItemService(id, userId) {
  const item = q.getItemQuery(id)
  if (!item) throw new Error('Kayıt bulunamadı')
  if (item.status !== 'dirty') throw new Error('Sadece sepetteki kayıtlar silinebilir')

  q.removeItemFromQueueQuery(id)
  const deleted = q.deleteItemQuery(id)
  if (!deleted) throw new Error('Silme işlemi başarısız')
  logAudit(userId, 'laundry_delete', 'laundry', id, '')
}

// ═══════════════════════════════════════════════════════════════════════════
// DAMAGE
// ═══════════════════════════════════════════════════════════════════════════

export function reportDamageService(itemId, { description, photo_url }, userId) {
  if (!description || !description.trim()) throw new Error('Hasar açıklaması zorunlu')
  const item = q.getItemQuery(itemId)
  if (!item) throw new Error('Kayıt bulunamadı')

  q.insertDamageQuery({ item_id: itemId, description: description.trim(), photo_url, reported_by: userId })
  q.insertHistoryQuery({ item_id: itemId, from_status: item.status, to_status: item.status, action_by: userId, notes: `Hasar: ${description.trim()}` })
  logAudit(userId, 'laundry_damage', 'laundry', itemId, description.trim())

  return q.getDamagesForItemQuery(itemId)
}

// ═══════════════════════════════════════════════════════════════════════════
// PASSTHROUGH SERVICES
// ═══════════════════════════════════════════════════════════════════════════

export const listItemsService       = q.listItemsQuery
export const getItemService         = q.getItemQuery
export const getItemHistoryService  = q.getItemHistoryQuery
export const getDamagesService      = q.getDamagesForItemQuery
export const listMachinesService    = q.listMachinesQuery
export const getMachineService      = q.getMachineQuery
export const getQueueService        = q.getQueueQuery
export const getSlaConfigService    = q.getSlaConfigQuery
export const getSlaViolationsService = q.getSlaViolationsQuery
export const getStatsService        = q.getStatsQuery

export function createMachineService({ name, type, capacity_kg }, userId) {
  if (!name || !name.trim()) throw new Error('Makine adı zorunlu')
  const id = q.insertMachineQuery({ name: name.trim(), type, capacity_kg })
  logAudit(userId, 'machine_create', 'laundry', id, name.trim())
  return q.getMachineQuery(id)
}

export function updateMachineService(id, fields, userId) {
  q.updateMachineQuery(id, fields)
  logAudit(userId, 'machine_update', 'laundry', id, JSON.stringify(fields))
  return q.getMachineQuery(id)
}

export function deleteMachineService(id, userId) {
  const ok = q.deleteMachineQuery(id)
  if (!ok) throw new Error('Aktif yıkama olan makine silinemez')
  logAudit(userId, 'machine_delete', 'laundry', id, '')
}

export function addToQueueService({ item_id, machine_id, priority }, userId) {
  const item = q.getItemQuery(item_id)
  if (!item) throw new Error('Kayıt bulunamadı')
  if (item.status !== 'dirty') throw new Error('Sadece sepetteki kayıtlar kuyruğa eklenebilir')
  q.addToQueueQuery({ item_id, machine_id, priority: item.urgent ? 'urgent' : (priority || 'normal') })
  logAudit(userId, 'queue_add', 'laundry', item_id, '')
}

export function removeFromQueueService(queueId, userId) {
  q.removeFromQueueQuery(queueId)
  logAudit(userId, 'queue_remove', 'laundry', queueId, '')
}

export function upsertSlaConfigService(data) {
  q.upsertSlaConfigQuery(data)
}

export function listAllItemsService(filters) {
  return q.listAllItemsQuery(filters)
}
```

- [ ] **Step 4: Test çalıştır — PASS bekleniyor**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js
```

- [ ] **Step 5: Commit**

```bash
cd backend && git add src/modules/laundry/service.js src/modules/laundry/laundry.test.js && git commit -m "feat: laundry service — state machine, batch deliver, queue, damage"
```

---

### Task 4: Backend — routes.js (20+ endpoint, yetki matrisi)

**Files:**
- Overwrite: `backend/src/modules/laundry/routes.js`

- [ ] **Step 1: Yetki testlerini ekle**

`laundry.test.js` dosyasına ekle:

```javascript
describe('Laundry routes — yetki kontrolleri', () => {
  it('401 — token yok', async () => {
    const res = await request(app).get('/api/laundry/items')
    expect(res.status).toBe(401)
  })

  it('403 — teknik rolü items göremez', async () => {
    const r = await request(app).post('/api/auth/login').send({ username: 'teknik', password: 'admin123' })
    const res = await request(app)
      .get('/api/laundry/items')
      .set('Authorization', `Bearer ${r.body.token}`)
    expect(res.status).toBe(403)
  })

  it('200 — shift_supervisor items listesi görür (sadece okuma)', async () => {
    const r = await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })
    const list = await request(app)
      .get('/api/laundry/items')
      .set('Authorization', `Bearer ${r.body.token}`)
    expect(list.status).toBe(200)
    // Ama oluşturma yapamaz
    const create = await request(app)
      .post('/api/laundry/items')
      .set('Authorization', `Bearer ${r.body.token}`)
      .send({ room_id: roomId, item_count: 1 })
    expect(create.status).toBe(403)
  })

  it('200 — laundry rolü items listesi + CRUD tam yetki', async () => {
    const list = await request(app)
      .get('/api/laundry/items')
      .set('Authorization', `Bearer ${token}`)
    expect(list.status).toBe(200)
    expect(Array.isArray(list.body)).toBe(true)
  })

  it('200 — machines listesi', async () => {
    const res = await request(app)
      .get('/api/laundry/machines')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThan(0)
  })

  it('200 — queue listesi', async () => {
    const res = await request(app)
      .get('/api/laundry/queue')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
  })

  it('200 — SLA config', async () => {
    const res = await request(app)
      .get('/api/laundry/sla-config')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.length).toBe(3)
  })

  it('200 — reports stats', async () => {
    const res = await request(app)
      .get('/api/laundry/reports/stats')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('by_status')
  })

  it('CSV export indirilebilir', async () => {
    const res = await request(app)
      .get('/api/laundry/reports/export')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/csv')
  })
})
```

- [ ] **Step 2: Test çalıştır — FAIL bekleniyor**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js
```

- [ ] **Step 3: routes.js yaz**

`backend/src/modules/laundry/routes.js` dosyasının **tüm içeriğini** aşağıdakiyle değiştir:

```javascript
import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import * as svc from './service.js'

export const laundryRouter = Router()

// Yetki seviyeleri
const laundryFull = requireRole('laundry')                                    // Tam yetki
const laundryRead = requireRole('laundry', 'shift_supervisor', 'campus_manager') // Okuma + raporlar
const slaWrite    = requireRole('laundry', 'campus_manager')                  // SLA ayarları

// ═══════════════════════════════════════════════════════════════════════════
// ITEMS
// ═══════════════════════════════════════════════════════════════════════════

laundryRouter.get('/items', ...laundryRead, (req, res) => {
  try {
    const { status, urgent, sla_only, search } = req.query
    res.json(svc.listItemsService({
      status: status || undefined,
      urgent: urgent === '1',
      sla_only: sla_only === '1',
      search: search || undefined,
    }))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

laundryRouter.get('/items/:id', ...laundryRead, (req, res) => {
  const item = svc.getItemService(+req.params.id)
  if (!item) return res.status(404).json({ error: 'Kayıt bulunamadı' })
  res.json(item)
})

laundryRouter.get('/items/:id/history', ...laundryRead, (req, res) => {
  res.json(svc.getItemHistoryService(+req.params.id))
})

laundryRouter.get('/items/:id/damages', ...laundryRead, (req, res) => {
  res.json(svc.getDamagesService(+req.params.id))
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

// Toplu teslim
laundryRouter.post('/items/batch-deliver', ...laundryFull, (req, res) => {
  try {
    const { item_ids, delivered_to, signature_data } = req.body
    const result = svc.batchDeliverService(item_ids, { delivered_to, signature_data }, req.user.id)
    res.json(result)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// Hasar kaydı
laundryRouter.post('/items/:id/damages', ...laundryFull, (req, res) => {
  try {
    const damages = svc.reportDamageService(+req.params.id, req.body, req.user.id)
    res.status(201).json(damages)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ═══════════════════════════════════════════════════════════════════════════
// MACHINES
// ═══════════════════════════════════════════════════════════════════════════

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
    const m = svc.updateMachineService(+req.params.id, req.body, req.user.id)
    res.json(m)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.delete('/machines/:id', ...laundryFull, (req, res) => {
  try {
    svc.deleteMachineService(+req.params.id, req.user.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ═══════════════════════════════════════════════════════════════════════════
// QUEUE
// ═══════════════════════════════════════════════════════════════════════════

laundryRouter.get('/queue', ...laundryRead, (req, res) => {
  res.json(svc.getQueueService(req.query.machine_id ? +req.query.machine_id : undefined))
})

laundryRouter.post('/queue', ...laundryFull, (req, res) => {
  try {
    svc.addToQueueService(req.body, req.user.id)
    res.status(201).json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.delete('/queue/:id', ...laundryFull, (req, res) => {
  try {
    svc.removeFromQueueService(+req.params.id, req.user.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ═══════════════════════════════════════════════════════════════════════════
// SLA
// ═══════════════════════════════════════════════════════════════════════════

laundryRouter.get('/sla-config', ...laundryRead, (req, res) => {
  res.json(svc.getSlaConfigService())
})

laundryRouter.put('/sla-config', ...slaWrite, (req, res) => {
  try {
    const { stage, warning_hours, critical_hours } = req.body
    if (!stage || warning_hours == null || critical_hours == null) {
      return res.status(400).json({ error: 'stage, warning_hours, critical_hours zorunlu' })
    }
    if (+critical_hours <= +warning_hours) {
      return res.status(400).json({ error: 'Kritik eşik uyarıdan büyük olmalı' })
    }
    svc.upsertSlaConfigService({ stage, warning_hours: +warning_hours, critical_hours: +critical_hours, updated_by: req.user.id })
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.get('/sla/violations', ...laundryRead, (req, res) => {
  res.json(svc.getSlaViolationsService())
})

// ═══════════════════════════════════════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════════════════════════════════════

laundryRouter.get('/reports/stats', ...laundryRead, (req, res) => {
  res.json(svc.getStatsService(req.query))
})

laundryRouter.get('/reports/export', ...laundryRead, (req, res) => {
  try {
    const items = svc.listAllItemsService(req.query)
    const header = 'ID,Blok,Oda,Durum,Parça,Acil,Notlar,Oluşturulma'
    const rows = items.map(i => [
      i.id,
      i.block || '',
      i.room_no || '',
      i.status,
      i.item_count,
      i.urgent ? 'Evet' : 'Hayır',
      (i.notes || '').replace(/,/g, ';').replace(/\n/g, ' '),
      i.created_at,
    ].join(','))
    const csv = [header, ...rows].join('\n')
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="camasir-${new Date().toISOString().slice(0,10)}.csv"`)
    res.send('\uFEFF' + csv)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ═══════════════════════════════════════════════════════════════════════════
// PHOTO UPLOAD (multer zaten mevcut)
// ═══════════════════════════════════════════════════════════════════════════

// NOT: Fotoğraf upload'u mevcut upload middleware'i kullanarak yapılır.
// Route'lar Task 11'de (Faz 4) eklenecek.
```

- [ ] **Step 4: Tüm testleri çalıştır — PASS bekleniyor**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js
```

- [ ] **Step 5: Commit**

```bash
cd backend && git add src/modules/laundry/routes.js src/modules/laundry/laundry.test.js && git commit -m "feat: laundry routes — 20+ endpoint, batch deliver, queue, damage, yetki matrisi"
```

---

## FAZ 2 — SLA Motoru + WhatsApp

### Task 5: SLA motoru + cron entegrasyonu

**Files:**
- Create: `backend/src/modules/laundry/sla.js`
- Modify: `backend/src/shared/cron/index.js`

- [ ] **Step 1: sla.js oluştur**

`backend/src/modules/laundry/sla.js`:

```javascript
import { getDB } from '../../shared/db/index.js'
import { createNotification } from '../../shared/notifications/service.js'

/**
 * SLA ihlallerini kontrol eder ve SSE bildirimi gönderir.
 * Her 15 dakikada cron ile çalışır.
 */
export function checkSlaViolations() {
  const db = getDB()
  const violations = db.prepare(`
    SELECT li.id, li.status, li.item_count,
           r.block, r.room_no,
           ROUND((julianday('now') - julianday(COALESCE(li.updated_at, li.created_at))) * 24, 1) as hours,
           sc.warning_hours, sc.critical_hours
    FROM laundry_items li
    LEFT JOIN rooms r ON r.id = li.room_id
    LEFT JOIN laundry_sla_config sc ON sc.stage = li.status
    WHERE li.status IN ('dirty','washing','ready')
      AND sc.warning_hours IS NOT NULL
      AND ROUND((julianday('now') - julianday(COALESCE(li.updated_at, li.created_at))) * 24, 1) >= sc.warning_hours
  `).all()

  for (const v of violations) {
    const isCritical = v.hours >= v.critical_hours
    const label = { dirty: 'Kirli sepette', washing: 'Makinede', ready: 'Rafta hazır' }[v.status]

    createNotification({
      message: `SLA ${isCritical ? 'KRİTİK' : 'UYARI'}: ${v.block || '?'} ${v.room_no || '?'} — ${label} ${v.hours} saattir`,
      type: isCritical ? 'critical' : 'warning',
      module: 'laundry',
      // Kritik: tüm roller, uyarı: laundry + supervisors
      target_role: isCritical ? null : 'shift_supervisor',
    })
  }

  return violations.length
}

/**
 * Süresi dolan makineleri 'done' olarak işaretler ve bildirim gönderir.
 */
export function checkMachineTimers() {
  const db = getDB()
  const done = db.prepare(`
    SELECT * FROM laundry_machines
    WHERE status = 'running'
      AND timer_end IS NOT NULL
      AND datetime('now') >= datetime(timer_end)
  `).all()

  for (const m of done) {
    db.prepare("UPDATE laundry_machines SET status = 'done' WHERE id = ?").run(m.id)
    createNotification({
      message: `${m.name} tamamlandı — çamaşırları rafa kaldırın`,
      type: 'info',
      module: 'laundry',
      target_role: 'laundry',
    })
  }

  return done.length
}
```

- [ ] **Step 2: cron/index.js'e laundry cronları ekle**

`backend/src/shared/cron/index.js` dosyasının başına import ekle:

```javascript
import { checkSlaViolations, checkMachineTimers } from '../../modules/laundry/sla.js'
```

`startCronJobs` fonksiyonunun body'sine ekle:

```javascript
  // Laundry — her 15 dakikada SLA kontrolü + makine zamanlayıcı
  cron.schedule('*/15 * * * *', () => {
    try {
      checkSlaViolations()
      checkMachineTimers()
    } catch (e) { console.error('[Cron] Laundry SLA hatası:', e.message) }
  })
```

- [ ] **Step 3: SLA testleri yaz**

`laundry.test.js`'e ekle:

```javascript
describe('SLA engine', () => {
  it('checkSlaViolations hata vermez', async () => {
    const { checkSlaViolations } = await import('./sla.js')
    const count = checkSlaViolations()
    expect(typeof count).toBe('number')
  })

  it('checkMachineTimers hata vermez', async () => {
    const { checkMachineTimers } = await import('./sla.js')
    const count = checkMachineTimers()
    expect(typeof count).toBe('number')
  })

  it('süresi dolan makine done olur', async () => {
    const db = getDB()
    // Bir makineye geçmiş tarih timer koy
    const machine = db.prepare("SELECT id FROM laundry_machines WHERE status='idle' LIMIT 1").get()
    if (machine) {
      db.prepare("UPDATE laundry_machines SET status='running', timer_end=datetime('now','-1 minute') WHERE id=?").run(machine.id)
      const { checkMachineTimers } = await import('./sla.js')
      const count = checkMachineTimers()
      expect(count).toBeGreaterThan(0)
      const m = db.prepare('SELECT status FROM laundry_machines WHERE id=?').get(machine.id)
      expect(m.status).toBe('done')
      // Temizle
      db.prepare("UPDATE laundry_machines SET status='idle', timer_end=NULL WHERE id=?").run(machine.id)
    }
  })
})
```

- [ ] **Step 4: Test çalıştır — PASS bekleniyor**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js
```

- [ ] **Step 5: Commit**

```bash
cd backend && git add src/modules/laundry/sla.js src/shared/cron/index.js src/modules/laundry/laundry.test.js && git commit -m "feat: laundry SLA motoru + makine zamanlayıcı cron"
```

---

### Task 6: WhatsApp entegrasyonu

**Files:**
- Create: `backend/src/modules/laundry/whatsapp.js`
- Modify: `backend/src/modules/laundry/service.js`

- [ ] **Step 1: whatsapp.js oluştur**

`backend/src/modules/laundry/whatsapp.js`:

```javascript
import { getDB } from '../../shared/db/index.js'

/**
 * Oda sakininin telefon numarasını sorgular ve WhatsApp mesajı gönderir.
 * Fire-and-forget: hata olursa akış durmaz, sadece loglanır.
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
    const firstName = item.full_name ? ' ' + item.full_name.split(' ')[0] : ''
    const msg = `Merhaba${firstName}!\n\nOda ${item.block}-${item.room_no} — ${item.item_count} parça çamaşırınız rafta hazır. Lütfen teslim alınız.`

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

- [ ] **Step 2: service.js'e WhatsApp entegrasyonu ekle**

`backend/src/modules/laundry/service.js` dosyasının başına import ekle:

```javascript
import { notifyItemReady } from './whatsapp.js'
```

`advanceItemService` fonksiyonundaki `if (nextStatus === 'ready')` bloğunun sonuna ekle:

```javascript
    // WhatsApp bildirimi — fire and forget
    notifyItemReady(id).catch(() => {})
```

- [ ] **Step 3: WhatsApp test ekle**

`laundry.test.js`'e ekle:

```javascript
describe('WhatsApp', () => {
  it('WHATSAPP_TOKEN olmadan hata vermiyor', async () => {
    delete process.env.WHATSAPP_TOKEN
    delete process.env.WHATSAPP_PHONE_ID
    const { notifyItemReady } = await import('./whatsapp.js')
    await expect(notifyItemReady(999)).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 4: Test çalıştır — PASS bekleniyor**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js
```

- [ ] **Step 5: Commit**

```bash
cd backend && git add src/modules/laundry/whatsapp.js src/modules/laundry/service.js src/modules/laundry/laundry.test.js && git commit -m "feat: laundry WhatsApp bildirimi — ready durumunda oda sakinine mesaj"
```

---

## FAZ 3 — Frontend Çekirdek

### Task 7: Frontend API client

**Files:**
- Create: `frontend/src/modules/laundry/api.js`

- [ ] **Step 1: api.js oluştur**

`frontend/src/modules/laundry/api.js`:

```javascript
import api from '../../shared/api/client.js'

export const laundryApi = {
  // ── Items ──────────────────────────────────────────────────────────────
  getItems: (params = {}) => api.get('/laundry/items', { params }).then(r => r.data),
  getItem: (id) => api.get(`/laundry/items/${id}`).then(r => r.data),
  getItemHistory: (id) => api.get(`/laundry/items/${id}/history`).then(r => r.data),
  getItemDamages: (id) => api.get(`/laundry/items/${id}/damages`).then(r => r.data),
  createItem: (data) => api.post('/laundry/items', data).then(r => r.data),
  advanceItem: (id, data) => api.patch(`/laundry/items/${id}/advance`, data).then(r => r.data),
  deliverItem: (id, data) => api.patch(`/laundry/items/${id}/deliver`, data).then(r => r.data),
  lostItem: (id, data) => api.patch(`/laundry/items/${id}/lost`, data).then(r => r.data),
  deleteItem: (id) => api.delete(`/laundry/items/${id}`).then(r => r.data),
  batchDeliver: (data) => api.post('/laundry/items/batch-deliver', data).then(r => r.data),
  reportDamage: (id, data) => api.post(`/laundry/items/${id}/damages`, data).then(r => r.data),

  // ── Machines ───────────────────────────────────────────────────────────
  getMachines: () => api.get('/laundry/machines').then(r => r.data),
  createMachine: (data) => api.post('/laundry/machines', data).then(r => r.data),
  updateMachine: (id, data) => api.patch(`/laundry/machines/${id}`, data).then(r => r.data),
  deleteMachine: (id) => api.delete(`/laundry/machines/${id}`).then(r => r.data),

  // ── Queue ──────────────────────────────────────────────────────────────
  getQueue: (machineId) => api.get('/laundry/queue', { params: machineId ? { machine_id: machineId } : {} }).then(r => r.data),
  addToQueue: (data) => api.post('/laundry/queue', data).then(r => r.data),
  removeFromQueue: (id) => api.delete(`/laundry/queue/${id}`).then(r => r.data),

  // ── SLA ────────────────────────────────────────────────────────────────
  getSlaConfig: () => api.get('/laundry/sla-config').then(r => r.data),
  updateSlaConfig: (data) => api.put('/laundry/sla-config', data).then(r => r.data),
  getSlaViolations: () => api.get('/laundry/sla/violations').then(r => r.data),

  // ── Reports ────────────────────────────────────────────────────────────
  getStats: (params) => api.get('/laundry/reports/stats', { params }).then(r => r.data),
  exportCsv: (params) => api.get('/laundry/reports/export', { params, responseType: 'blob' }).then(r => r.data),

  // ── Photo Upload ───────────────────────────────────────────────────────
  uploadPhoto: (file) => {
    const fd = new FormData()
    fd.append('photo', file)
    return api.post('/uploads/photo', fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(r => r.data)
  },
}
```

- [ ] **Step 2: Commit**

```bash
cd frontend && git add src/modules/laundry/api.js && git commit -m "feat: laundry frontend API client — tüm endpoint'ler"
```

---

### Task 8: Frontend — Component'ler (ItemCard, MachineStrip, SlaAlert)

**Files:**
- Create: `frontend/src/modules/laundry/components/ItemCard.jsx`
- Create: `frontend/src/modules/laundry/components/MachineStrip.jsx`
- Create: `frontend/src/modules/laundry/components/SlaAlert.jsx`

- [ ] **Step 1: SlaAlert.jsx oluştur**

`frontend/src/modules/laundry/components/SlaAlert.jsx`:

```jsx
export default function SlaAlert({ violations = [] }) {
  if (!violations.length) return null

  const criticalCount = violations.filter(v => v.sla_level === 'critical').length
  const warningCount = violations.length - criticalCount

  return (
    <div className={criticalCount > 0 ? 'alert alert-danger' : 'alert alert-warn'}
      style={{ marginBottom: 12 }}>
      <div className="live-dot" style={{ marginTop: 4, background: criticalCount > 0 ? 'var(--red)' : 'var(--accent)', boxShadow: criticalCount > 0 ? '0 0 8px var(--red)' : '0 0 8px var(--accent)' }} />
      <div>
        <div style={{ fontWeight: 700, fontSize: 12 }}>
          {criticalCount > 0 && `${criticalCount} KRİTİK`}
          {criticalCount > 0 && warningCount > 0 && ' · '}
          {warningCount > 0 && `${warningCount} uyarı`}
          {' '}SLA ihlali
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, marginTop: 3, opacity: 0.7 }}>
          {violations.slice(0, 3).map(v =>
            `${v.block || '?'} ${v.room_no || '?'} (${v.hours_in_status}s)`
          ).join(' · ')}
          {violations.length > 3 && ` +${violations.length - 3} daha`}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: MachineStrip.jsx oluştur**

`frontend/src/modules/laundry/components/MachineStrip.jsx`:

```jsx
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

const STATUS_MAP = {
  idle:        { label: 'Boş',       badgeClass: 'badge-green' },
  running:     { label: 'Çalışıyor', badgeClass: 'badge-amber' },
  done:        { label: 'BİTTİ!',    badgeClass: 'badge-red'   },
  maintenance: { label: 'Bakım',     badgeClass: 'badge-gray'  },
}

export default function MachineStrip({ machines = [] }) {
  const qc = useQueryClient()

  const setTimer = useMutation({
    mutationFn: ({ id, minutes }) => {
      const end = new Date(Date.now() + minutes * 60000).toISOString()
      return laundryApi.updateMachine(id, { status: 'running', timer_end: end })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['laundry-machines'] }),
  })

  const resetMachine = useMutation({
    mutationFn: (id) => laundryApi.updateMachine(id, { status: 'idle', timer_end: null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['laundry-machines'] }),
  })

  if (!machines.length) return null

  return (
    <div className="sect" style={{ marginBottom: 0 }}>
      <span className="sect-title">MAKİNELER</span>
      <span className="sect-line" />
    </div>
    && null || (
    <div style={{ marginBottom: 16 }}>
      <div className="sect">
        <span className="sect-title">MAKİNELER</span>
        <span className="sect-line" />
      </div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6 }}>
        {machines.map(m => {
          const s = STATUS_MAP[m.status] || STATUS_MAP.idle
          const minutesLeft = m.timer_end
            ? Math.max(0, Math.round((new Date(m.timer_end) - Date.now()) / 60000))
            : null

          return (
            <div key={m.id} className="panel" style={{
              flexShrink: 0, minWidth: 110, padding: '10px 12px',
              borderLeft: `3px solid ${m.status === 'running' ? 'var(--accent)' : m.status === 'done' ? 'var(--red)' : 'var(--border)'}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: 'var(--text2)' }}>
                  {m.name}
                </span>
                {m.status === 'running' && (
                  <span className="live-dot" style={{ width: 5, height: 5 }} />
                )}
              </div>

              {m.status === 'running' && minutesLeft !== null ? (
                <div style={{ fontFamily: 'var(--display)', fontSize: 22, letterSpacing: 2, color: 'var(--accent)' }}>
                  {String(Math.floor(minutesLeft / 60)).padStart(2, '0')}:{String(minutesLeft % 60).padStart(2, '0')}
                </div>
              ) : (
                <span className={`badge ${s.badgeClass}`}>{s.label}</span>
              )}

              {m.status === 'idle' && (
                <div style={{ marginTop: 8, display: 'flex', gap: 4 }}>
                  {[30, 45, 60].map(min => (
                    <button key={min} className="btn btn-ghost btn-xs"
                      onClick={() => setTimer.mutate({ id: m.id, minutes: min })}
                      disabled={setTimer.isPending}
                    >
                      {min}dk
                    </button>
                  ))}
                </div>
              )}

              {m.status === 'done' && (
                <button className="btn btn-primary btn-xs" style={{ marginTop: 8 }}
                  onClick={() => resetMachine.mutate(m.id)}>
                  Sıfırla
                </button>
              )}

              {m.active_items > 0 && (
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginTop: 4 }}>
                  {m.active_items} aktif yıkama
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
    )
  )
}
```

**DİKKAT:** Yukarıdaki JSX'teki `&& null ||` kısmı hatalı — aşağıdaki düzeltilmiş versiyon:

```jsx
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

const STATUS_MAP = {
  idle:        { label: 'Boş',       badgeClass: 'badge-green' },
  running:     { label: 'Çalışıyor', badgeClass: 'badge-amber' },
  done:        { label: 'BİTTİ!',    badgeClass: 'badge-red'   },
  maintenance: { label: 'Bakım',     badgeClass: 'badge-gray'  },
}

export default function MachineStrip({ machines = [] }) {
  const qc = useQueryClient()

  const setTimer = useMutation({
    mutationFn: ({ id, minutes }) => {
      const end = new Date(Date.now() + minutes * 60000).toISOString()
      return laundryApi.updateMachine(id, { status: 'running', timer_end: end })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['laundry-machines'] }),
  })

  const resetMachine = useMutation({
    mutationFn: (id) => laundryApi.updateMachine(id, { status: 'idle', timer_end: null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['laundry-machines'] }),
  })

  if (!machines.length) return null

  return (
    <div style={{ marginBottom: 16 }}>
      <div className="sect">
        <span className="sect-title">MAKİNELER</span>
        <span className="sect-line" />
      </div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6 }}>
        {machines.map(m => {
          const s = STATUS_MAP[m.status] || STATUS_MAP.idle
          const minutesLeft = m.timer_end
            ? Math.max(0, Math.round((new Date(m.timer_end) - Date.now()) / 60000))
            : null

          return (
            <div key={m.id} className="panel" style={{
              flexShrink: 0, minWidth: 110, padding: '10px 12px',
              borderLeft: `3px solid ${m.status === 'running' ? 'var(--accent)' : m.status === 'done' ? 'var(--red)' : 'var(--border)'}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: 'var(--text2)' }}>
                  {m.name}
                </span>
                {m.status === 'running' && (
                  <span className="live-dot" style={{ width: 5, height: 5 }} />
                )}
              </div>

              {m.status === 'running' && minutesLeft !== null ? (
                <div style={{ fontFamily: 'var(--display)', fontSize: 22, letterSpacing: 2, color: 'var(--accent)' }}>
                  {String(Math.floor(minutesLeft / 60)).padStart(2, '0')}:{String(minutesLeft % 60).padStart(2, '0')}
                </div>
              ) : (
                <span className={`badge ${s.badgeClass}`}>{s.label}</span>
              )}

              {m.status === 'idle' && (
                <div style={{ marginTop: 8, display: 'flex', gap: 4 }}>
                  {[30, 45, 60].map(min => (
                    <button key={min} className="btn btn-ghost btn-xs"
                      onClick={() => setTimer.mutate({ id: m.id, minutes: min })}
                      disabled={setTimer.isPending}
                    >
                      {min}dk
                    </button>
                  ))}
                </div>
              )}

              {m.status === 'done' && (
                <button className="btn btn-primary btn-xs" style={{ marginTop: 8 }}
                  onClick={() => resetMachine.mutate(m.id)}>
                  Sıfırla
                </button>
              )}

              {m.active_items > 0 && (
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginTop: 4 }}>
                  {m.active_items} aktif yıkama
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: ItemCard.jsx oluştur**

`frontend/src/modules/laundry/components/ItemCard.jsx`:

```jsx
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

const STATUS = {
  dirty:   { label: 'Sepette',     badgeClass: 'badge-amber' },
  washing: { label: 'Yıkanıyor',   badgeClass: 'badge-blue'  },
  ready:   { label: 'Rafta Hazır', badgeClass: 'badge-green' },
  lost:    { label: 'Kayıp',       badgeClass: 'badge-gray'  },
}

export default function ItemCard({ item, machines = [], onDeliver, onDamage, selected, onSelect }) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(false)

  const advance = useMutation({
    mutationFn: (data) => laundryApi.advanceItem(item.id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['laundry-items'] }),
  })

  const markLost = useMutation({
    mutationFn: () => laundryApi.lostItem(item.id, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['laundry-items'] }),
  })

  const deleteItem = useMutation({
    mutationFn: () => laundryApi.deleteItem(item.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['laundry-items'] }),
  })

  const st = STATUS[item.status] || STATUS.dirty
  const isSlaWarning = item.hours_in_status > 24
  const isSlaRed = item.hours_in_status > 48

  return (
    <div className="panel" style={{
      borderLeft: `3px solid ${item.urgent ? 'var(--red)' : item.status === 'ready' ? 'var(--green)' : 'var(--accent)'}`,
      transition: 'all 0.15s',
    }}>
      <div style={{ padding: '12px 14px' }}>
        {/* Üst satır: Oda + Durum + Seçim */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {onSelect && (
              <input type="checkbox" checked={selected}
                onChange={() => onSelect(item.id)}
                style={{ accentColor: 'var(--accent)' }} />
            )}
            <span style={{ fontFamily: 'var(--display)', fontSize: 16, letterSpacing: 2, color: 'var(--text)' }}>
              {item.block || '?'} · {item.room_no || '?'}
            </span>
            {item.urgent === 1 && (
              <span className="badge badge-red" style={{ fontSize: 8 }}>ACİL</span>
            )}
            {item.damage_count > 0 && (
              <span className="badge badge-amber" style={{ fontSize: 8 }}>HASAR {item.damage_count}</span>
            )}
          </div>
          <span className={`badge ${st.badgeClass}`}>{st.label}</span>
        </div>

        {/* Bilgi satırı */}
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span>{item.item_count} parça</span>
          {item.created_by_name && <span>{item.created_by_name}</span>}
          {item.machine_name && <span>{item.machine_name}</span>}
          {item.shelf_location && <span>Raf: {item.shelf_location}</span>}
          {item.hours_in_status != null && (
            <span style={{ color: isSlaRed ? 'var(--red)' : isSlaWarning ? 'var(--accent)' : 'var(--text3)' }}>
              {isSlaWarning && '! '}{item.hours_in_status}s
            </span>
          )}
        </div>

        {item.notes && (
          <div style={{ fontFamily: 'var(--sans)', fontSize: 11, color: 'var(--text2)', marginTop: 4, fontStyle: 'italic' }}>
            {item.notes}
          </div>
        )}

        {/* Aksiyonlar */}
        {item.status !== 'lost' && item.status !== 'delivered' && (
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {item.status === 'dirty' && (
              <MachineSelect
                machines={machines.filter(m => m.status === 'idle')}
                onSelect={(machine_id) => advance.mutate({ machine_id })}
                loading={advance.isPending}
              />
            )}
            {item.status === 'washing' && (
              <button className="btn btn-primary btn-sm"
                onClick={() => {
                  const shelf = prompt('Raf konumu (örn: 2. Kat):')
                  if (shelf !== null) advance.mutate({ shelf_location: shelf })
                }}
                disabled={advance.isPending}>
                Rafa Koy
              </button>
            )}
            {item.status === 'ready' && (
              <button className="btn btn-primary btn-sm" onClick={() => onDeliver(item)}>
                Teslim Et
              </button>
            )}
            {onDamage && (
              <button className="btn btn-ghost btn-sm" onClick={() => onDamage(item)}>
                Hasar
              </button>
            )}
            <button className="btn btn-ghost btn-sm"
              onClick={() => setExpanded(!expanded)}>
              {expanded ? 'Kapat' : '...'}
            </button>
          </div>
        )}

        {/* Genişletilmiş: Ek aksiyonlar */}
        {expanded && (
          <div style={{ display: 'flex', gap: 6, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <button className="btn btn-ghost btn-xs"
              onClick={() => { if (confirm('Kayıp olarak işaretle?')) markLost.mutate() }}>
              Kayıp
            </button>
            {item.status === 'dirty' && (
              <button className="btn btn-danger btn-xs"
                onClick={() => { if (confirm('Kaydı sil?')) deleteItem.mutate() }}>
                Sil
              </button>
            )}
          </div>
        )}

        {/* Hata mesajı */}
        {advance.isError && (
          <div className="alert alert-danger" style={{ marginTop: 8, padding: '6px 10px', fontSize: 11 }}>
            {advance.error?.response?.data?.error || 'İşlem hatası'}
          </div>
        )}
      </div>
    </div>
  )
}

function MachineSelect({ machines, onSelect, loading }) {
  if (!machines.length) {
    return <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>Boş makine yok</span>
  }
  return (
    <select className="form-select" style={{ width: 'auto', padding: '5px 10px', fontSize: 10 }}
      onChange={e => e.target.value && onSelect(+e.target.value)}
      defaultValue="" disabled={loading}>
      <option value="">Makineye At...</option>
      {machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
    </select>
  )
}
```

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/modules/laundry/components/ && git commit -m "feat: laundry components — ItemCard, MachineStrip, SlaAlert (CSS class'lar ile)"
```

---

### Task 9: Frontend — Modal'lar (NewItemModal, DeliveryModal, DamageModal)

**Files:**
- Create: `frontend/src/modules/laundry/components/NewItemModal.jsx`
- Create: `frontend/src/modules/laundry/components/DeliveryModal.jsx`
- Create: `frontend/src/modules/laundry/components/DamageModal.jsx`

- [ ] **Step 1: NewItemModal.jsx oluştur**

`frontend/src/modules/laundry/components/NewItemModal.jsx`:

```jsx
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'
import api from '../../../shared/api/client.js'

export default function NewItemModal({ onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ room_id: '', item_count: 1, notes: '', urgent: false, item_details: '' })

  const { data: rooms = [] } = useQuery({
    queryKey: ['rooms-list'],
    queryFn: () => api.get('/checkin/available-rooms').then(r => r.data).catch(() => []),
  })

  const create = useMutation({
    mutationFn: () => laundryApi.createItem({
      ...form,
      room_id: +form.room_id,
      urgent: form.urgent ? 1 : 0,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['laundry-items'] }); onClose() },
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="modal-overlay" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="panel fade-up" style={{ width: 380, maxWidth: '90vw' }}>
        <div className="panel-header">
          <span className="panel-title">YENİ ÇAMAŞIR KAYDI</span>
          <button className="btn btn-ghost btn-xs" onClick={onClose}>ESC</button>
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="form-label">ODA</label>
            <select className="form-select" value={form.room_id}
              onChange={e => set('room_id', e.target.value)}>
              <option value="">Oda seç...</option>
              {rooms.map(r => (
                <option key={r.room_id || r.id} value={r.room_id || r.id}>
                  {r.block} - {r.room_no}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">PARÇA ADEDİ</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="btn btn-ghost btn-sm"
                onClick={() => set('item_count', Math.max(1, form.item_count - 1))}>-</button>
              <span style={{ fontFamily: 'var(--display)', fontSize: 28, letterSpacing: 2, color: 'var(--text)', minWidth: 40, textAlign: 'center' }}>
                {form.item_count}
              </span>
              <button className="btn btn-ghost btn-sm"
                onClick={() => set('item_count', form.item_count + 1)}>+</button>
            </div>
          </div>

          <div>
            <label className="form-label">KIYAFET DETAYLARI (OPSİYONEL)</label>
            <input className="form-input" value={form.item_details}
              onChange={e => set('item_details', e.target.value)}
              placeholder="Örn: 2 tişört, 1 pantolon..." />
          </div>

          <div>
            <label className="form-label">NOTLAR</label>
            <input className="form-input" value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Açıklama..." />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.urgent}
              onChange={e => set('urgent', e.target.checked)}
              style={{ accentColor: 'var(--red)' }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--red)', fontWeight: 600 }}>
              ACİL İŞARETLE
            </span>
          </label>

          {create.isError && (
            <div className="alert alert-danger">
              {create.error?.response?.data?.error || 'Hata oluştu'}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" style={{ flex: 1 }}
              onClick={() => create.mutate()}
              disabled={!form.room_id || create.isPending}>
              {create.isPending ? 'Kaydediliyor...' : 'KAYDET'}
            </button>
            <button className="btn btn-ghost" onClick={onClose}>İptal</button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: DeliveryModal.jsx oluştur**

`frontend/src/modules/laundry/components/DeliveryModal.jsx`:

```jsx
import { useState, useRef, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

export default function DeliveryModal({ item, onClose }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [signing, setSigning] = useState(false)
  const canvasRef = useRef(null)
  const drawing = useRef(false)

  const deliver = useMutation({
    mutationFn: () => {
      const sig = signing && canvasRef.current ? canvasRef.current.toDataURL() : undefined
      return laundryApi.deliverItem(item.id, { delivered_to: name, signature_data: sig })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['laundry-items'] }); onClose() },
  })

  const getPos = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const touch = e.touches ? e.touches[0] : e
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top }
  }, [])

  const startDraw = useCallback((e) => {
    e.preventDefault()
    drawing.current = true
    const ctx = canvasRef.current.getContext('2d')
    const pos = getPos(e)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
  }, [getPos])

  const draw = useCallback((e) => {
    if (!drawing.current) return
    e.preventDefault()
    const ctx = canvasRef.current.getContext('2d')
    const pos = getPos(e)
    ctx.lineTo(pos.x, pos.y)
    ctx.strokeStyle = 'var(--text, #dde4f0)'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.stroke()
  }, [getPos])

  const stopDraw = useCallback(() => { drawing.current = false }, [])

  const clearSig = () => {
    const ctx = canvasRef.current.getContext('2d')
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="panel fade-up" style={{ width: 400, maxWidth: '90vw' }}>
        <div className="panel-header">
          <div>
            <span className="panel-title">TESLİM ET</span>
            <span className="panel-subtitle">
              {item.block} · {item.room_no} — {item.item_count} parça
            </span>
          </div>
          <button className="btn btn-ghost btn-xs" onClick={onClose}>ESC</button>
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="form-label">TESLİM ALAN İSİM *</label>
            <input className="form-input" value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ad Soyad..." autoFocus />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={signing}
              onChange={e => setSigning(e.target.checked)}
              style={{ accentColor: 'var(--accent)' }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)' }}>
              İMZA AL (OPSİYONEL)
            </span>
          </label>

          {signing && (
            <div>
              <canvas ref={canvasRef} width={360} height={120}
                style={{
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  borderRadius: 7, display: 'block', cursor: 'crosshair', touchAction: 'none', width: '100%',
                }}
                onMouseDown={startDraw} onMouseMove={draw}
                onMouseUp={stopDraw} onMouseLeave={stopDraw}
                onTouchStart={startDraw} onTouchMove={draw}
                onTouchEnd={stopDraw} />
              <button className="btn btn-ghost btn-xs" style={{ marginTop: 4 }}
                onClick={clearSig}>Temizle</button>
            </div>
          )}

          {deliver.isError && (
            <div className="alert alert-danger">
              {deliver.error?.response?.data?.error || 'Hata'}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm" style={{ flex: 1, background: 'var(--green)', color: '#000' }}
              onClick={() => deliver.mutate()}
              disabled={!name.trim() || deliver.isPending}>
              {deliver.isPending ? 'Kaydediliyor...' : 'TESLİM ONAYLA'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>İptal</button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: DamageModal.jsx oluştur**

`frontend/src/modules/laundry/components/DamageModal.jsx`:

```jsx
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

export default function DamageModal({ item, onClose }) {
  const qc = useQueryClient()
  const [description, setDescription] = useState('')
  const [photo, setPhoto] = useState(null)
  const [uploading, setUploading] = useState(false)

  const report = useMutation({
    mutationFn: async () => {
      let photo_url = null
      if (photo) {
        setUploading(true)
        try {
          const res = await laundryApi.uploadPhoto(photo)
          photo_url = res.url || res.path
        } finally {
          setUploading(false)
        }
      }
      return laundryApi.reportDamage(item.id, { description, photo_url })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['laundry-items'] })
      onClose()
    },
  })

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="panel fade-up" style={{ width: 380, maxWidth: '90vw' }}>
        <div className="panel-header">
          <div>
            <span className="panel-title">HASAR KAYDI</span>
            <span className="panel-subtitle">
              {item.block} · {item.room_no} — {item.item_count} parça
            </span>
          </div>
          <button className="btn btn-ghost btn-xs" onClick={onClose}>ESC</button>
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="form-label">HASAR AÇIKLAMASI *</label>
            <textarea className="form-textarea" value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Leke, yırtık, renk akması..." rows={3} />
          </div>

          <div>
            <label className="form-label">FOTOĞRAF (OPSİYONEL)</label>
            <input type="file" accept="image/*" capture="environment"
              onChange={e => setPhoto(e.target.files[0] || null)}
              className="form-input" style={{ padding: 6 }} />
            {photo && (
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginTop: 4 }}>
                {photo.name} ({(photo.size / 1024).toFixed(0)} KB)
              </div>
            )}
          </div>

          {report.isError && (
            <div className="alert alert-danger">
              {report.error?.response?.data?.error || 'Hata'}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm" style={{ flex: 1, background: 'var(--accent)', color: '#000' }}
              onClick={() => report.mutate()}
              disabled={!description.trim() || report.isPending || uploading}>
              {uploading ? 'Yükleniyor...' : report.isPending ? 'Kaydediliyor...' : 'HASAR KAYDET'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>İptal</button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/modules/laundry/components/ && git commit -m "feat: laundry modals — NewItemModal, DeliveryModal, DamageModal (touch + CSS classes)"
```

---

### Task 10: Frontend — LaundryPage (ana ekran)

**Files:**
- Overwrite: `frontend/src/modules/laundry/LaundryPage.jsx`
- Delete: `frontend/src/modules/laundry/QRScanner.jsx`, `frontend/src/modules/laundry/DistributionRoute.jsx`

- [ ] **Step 1: Eski dosyaları sil**

```bash
cd frontend && rm -f src/modules/laundry/QRScanner.jsx src/modules/laundry/DistributionRoute.jsx
```

- [ ] **Step 2: LaundryPage.jsx yaz**

`frontend/src/modules/laundry/LaundryPage.jsx` içeriğini tamamen değiştir:

```jsx
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { laundryApi } from './api.js'
import MachineStrip from './components/MachineStrip.jsx'
import ItemCard from './components/ItemCard.jsx'
import NewItemModal from './components/NewItemModal.jsx'
import DeliveryModal from './components/DeliveryModal.jsx'
import DamageModal from './components/DamageModal.jsx'
import SlaAlert from './components/SlaAlert.jsx'

const FILTERS = [
  { key: 'all',     label: 'Tümü' },
  { key: 'dirty',   label: 'Sepet' },
  { key: 'washing', label: 'Yıkanan' },
  { key: 'ready',   label: 'Hazır' },
  { key: 'urgent',  label: 'Acil' },
  { key: 'sla',     label: 'SLA' },
  { key: 'lost',    label: 'Kayıp' },
]

export default function LaundryPage() {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [deliverItem, setDeliverItem] = useState(null)
  const [damageItem, setDamageItem] = useState(null)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [batchMode, setBatchMode] = useState(false)

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['laundry-items', filter, search],
    queryFn: () => {
      const params = {}
      if (filter === 'urgent') params.urgent = '1'
      else if (filter === 'sla') params.sla_only = '1'
      else if (filter !== 'all') params.status = filter
      if (search) params.search = search
      return laundryApi.getItems(params)
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

  const counts = useMemo(() => ({
    dirty:   items.filter(i => i.status === 'dirty').length,
    washing: items.filter(i => i.status === 'washing').length,
    ready:   items.filter(i => i.status === 'ready').length,
    sla:     violations.length,
  }), [items, violations])

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleBatchDeliver = () => {
    const name = prompt('Toplu teslim — alıcı adı:')
    if (!name) return
    laundryApi.batchDeliver({ item_ids: [...selectedIds], delivered_to: name })
      .then(() => { setSelectedIds(new Set()); setBatchMode(false) })
  }

  return (
    <div style={{ maxWidth: 860, position: 'relative', zIndex: 1 }} className="fade-up">

      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 28, letterSpacing: 4, color: 'var(--text)' }}>
            ÇAMAŞIRHANE
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {batchMode && selectedIds.size > 0 && (
            <button className="btn btn-sm" style={{ background: 'var(--green)', color: '#000' }}
              onClick={handleBatchDeliver}>
              Toplu Teslim ({selectedIds.size})
            </button>
          )}
          <button className="btn btn-ghost btn-sm"
            onClick={() => { setBatchMode(!batchMode); setSelectedIds(new Set()) }}>
            {batchMode ? 'İptal' : 'Toplu'}
          </button>
          <button className="btn btn-primary"
            onClick={() => setShowNew(true)}>
            + Yeni Kayıt
          </button>
        </div>
      </div>

      {/* SLA ALERT */}
      <SlaAlert violations={violations} />

      {/* KPI STRIP */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'Sepette',  value: counts.dirty,   color: 'var(--accent)' },
          { label: 'Yıkanan', value: counts.washing, color: 'var(--blue)' },
          { label: 'Hazır',   value: counts.ready,   color: 'var(--green)' },
          { label: 'SLA',     value: counts.sla,     color: 'var(--red)' },
        ].map(s => (
          <div key={s.label} className="kpi-card panel" style={{ padding: '10px 12px', textAlign: 'center', borderTop: `2px solid ${s.color}` }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 26, letterSpacing: 2, color: s.color, lineHeight: 1 }}>
              {s.value}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* MACHINE STRIP */}
      <MachineStrip machines={machines} />

      {/* SEARCH + FILTER */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="form-input" style={{ width: 200, padding: '5px 10px', fontSize: 11 }}
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Ara (blok, oda, not)..." />
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', flex: 1 }}>
          {FILTERS.map(f => (
            <button key={f.key}
              className={`filter-chip ${filter === f.key ? 'active' : ''}`}
              onClick={() => setFilter(f.key)}>
              {f.label}
              {f.key !== 'all' && counts[f.key] > 0 && ` (${counts[f.key]})`}
            </button>
          ))}
        </div>
      </div>

      {/* ITEM LIST */}
      {isLoading ? (
        <div className="empty-state">
          <div className="empty-sub">Yükleniyor...</div>
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🧺</div>
          <div className="empty-title">KAYIT YOK</div>
          <div className="empty-sub">
            {filter !== 'all' ? 'Bu filtrede kayıt bulunamadı' : 'Henüz çamaşır kaydı yok'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((item, idx) => (
            <div key={item.id} className={`fade-up-${Math.min(idx, 4)}`}>
              <ItemCard
                item={item}
                machines={machines}
                onDeliver={setDeliverItem}
                onDamage={setDamageItem}
                selected={selectedIds.has(item.id)}
                onSelect={batchMode ? toggleSelect : undefined}
              />
            </div>
          ))}
        </div>
      )}

      {/* MODALS */}
      {showNew && <NewItemModal onClose={() => setShowNew(false)} />}
      {deliverItem && <DeliveryModal item={deliverItem} onClose={() => setDeliverItem(null)} />}
      {damageItem && <DamageModal item={damageItem} onClose={() => setDamageItem(null)} />}
    </div>
  )
}
```

- [ ] **Step 3: Frontend'i başlat ve kontrol et**

```bash
cd frontend && npm run dev
```

Tarayıcıda `/laundry` rotasına git. Kontrol:
- Sayfa hatasız açılıyor
- KPI kartları doğru renklerde (amber, blue, green, red)
- Makine şeridi gösteriliyor
- Filter chip'ler çalışıyor
- "Yeni Kayıt" butonu modal açıyor
- Tüm yazı tipleri doğru (Bebas Neue başlıklar, IBM Plex Mono etiketler)

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/modules/laundry/ && git commit -m "feat: laundry LaundryPage — premium UI, batch, search, filter (CSS design system)"
```

---

## FAZ 4 — Queue + Dashboard + Routes

### Task 11: Frontend — QueuePanel + LaundryDashboard

**Files:**
- Create: `frontend/src/modules/laundry/components/QueuePanel.jsx`
- Create: `frontend/src/modules/laundry/LaundryDashboard.jsx`

- [ ] **Step 1: QueuePanel.jsx oluştur**

`frontend/src/modules/laundry/components/QueuePanel.jsx`:

```jsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

export default function QueuePanel() {
  const qc = useQueryClient()
  const { data: queue = [] } = useQuery({
    queryKey: ['laundry-queue'],
    queryFn: () => laundryApi.getQueue(),
    refetchInterval: 15000,
  })

  const remove = useMutation({
    mutationFn: (id) => laundryApi.removeFromQueue(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['laundry-queue'] }),
  })

  if (!queue.length) {
    return (
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">YIKAMA KUYRUĞU</span>
        </div>
        <div className="panel-body">
          <div className="empty-state" style={{ padding: '20px 10px' }}>
            <div className="empty-sub">Kuyruk boş</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">YIKAMA KUYRUĞU</span>
        <span className="badge badge-amber">{queue.length} bekleyen</span>
      </div>
      <div className="panel-body" style={{ padding: 0 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Oda</th>
              <th>Parça</th>
              <th>Öncelik</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {queue.map((q, idx) => (
              <tr key={q.id}>
                <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>{idx + 1}</td>
                <td style={{ fontWeight: 600 }}>{q.block || '?'} · {q.room_no || '?'}</td>
                <td>{q.item_count}</td>
                <td>
                  <span className={q.priority === 'urgent' ? 'badge badge-red' : 'badge badge-gray'}>
                    {q.priority === 'urgent' ? 'ACİL' : 'Normal'}
                  </span>
                </td>
                <td>
                  <button className="btn btn-ghost btn-xs"
                    onClick={() => remove.mutate(q.id)}>
                    Çıkar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: LaundryDashboard.jsx oluştur**

`frontend/src/modules/laundry/LaundryDashboard.jsx`:

```jsx
import { useQuery } from '@tanstack/react-query'
import { laundryApi } from './api.js'
import MachineStrip from './components/MachineStrip.jsx'
import QueuePanel from './components/QueuePanel.jsx'
import SlaAlert from './components/SlaAlert.jsx'

export default function LaundryDashboard() {
  const { data: stats } = useQuery({
    queryKey: ['laundry-stats'],
    queryFn: () => laundryApi.getStats({}),
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

  const { data: items = [] } = useQuery({
    queryKey: ['laundry-items'],
    queryFn: () => laundryApi.getItems({}),
    refetchInterval: 30000,
  })

  const dirty = items.filter(i => i.status === 'dirty')
  const washing = items.filter(i => i.status === 'washing')
  const ready = items.filter(i => i.status === 'ready')

  return (
    <div style={{ maxWidth: 1000, position: 'relative', zIndex: 1 }} className="fade-up">
      <h1 style={{ fontFamily: 'var(--display)', fontSize: 28, letterSpacing: 4, color: 'var(--text)', marginBottom: 16 }}>
        DASHBOARD
      </h1>

      <SlaAlert violations={violations} />

      {/* KPI ROW */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 20 }}>
        {[
          { label: 'Sepette', value: dirty.length, color: 'var(--accent)' },
          { label: 'Yıkanan', value: washing.length, color: 'var(--blue)' },
          { label: 'Hazır', value: ready.length, color: 'var(--green)' },
          { label: 'SLA İhlal', value: violations.length, color: 'var(--red)' },
          { label: 'Bugün Teslim', value: stats?.delivered_today?.count || 0, color: 'var(--teal)' },
        ].map(s => (
          <div key={s.label} className="kpi-card panel" style={{ padding: '12px 14px', textAlign: 'center', borderTop: `2px solid ${s.color}` }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 32, letterSpacing: 2, color: s.color, lineHeight: 1 }}>
              {s.value}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', marginTop: 4, textTransform: 'uppercase', letterSpacing: 1.5 }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* MACHINES */}
      <MachineStrip machines={machines} />

      {/* KANBAN VIEW */}
      <div className="sect">
        <span className="sect-title">KANBAN</span>
        <span className="sect-line" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        <KanbanColumn title="SEPETTEKİ" items={dirty} color="var(--accent)" />
        <KanbanColumn title="YIKANAN" items={washing} color="var(--blue)" />
        <KanbanColumn title="HAZIR" items={ready} color="var(--green)" />
      </div>

      {/* QUEUE + SLA VIOLATIONS SIDE BY SIDE */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <QueuePanel />
        <ViolationsPanel violations={violations} />
      </div>

      {/* MACHINE STATS */}
      {stats?.machine_stats && (
        <>
          <div className="sect" style={{ marginTop: 20 }}>
            <span className="sect-title">MAKİNE DURUMU</span>
            <span className="sect-line" />
          </div>
          <div className="panel" style={{ marginBottom: 20 }}>
            <div className="panel-body" style={{ padding: 0 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Makine</th>
                    <th>Tip</th>
                    <th>Durum</th>
                    <th>Aktif Yıkama</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.machine_stats.map(m => (
                    <tr key={m.name}>
                      <td style={{ fontWeight: 600 }}>{m.name}</td>
                      <td><span className="badge badge-gray">{m.type === 'washer' ? 'Yıkama' : 'Kurutucu'}</span></td>
                      <td><span className={`badge ${m.status === 'idle' ? 'badge-green' : m.status === 'running' ? 'badge-amber' : m.status === 'done' ? 'badge-red' : 'badge-gray'}`}>{m.status}</span></td>
                      <td>{m.active_loads}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* AVG HOURS */}
      {stats?.avg_hours?.length > 0 && (
        <>
          <div className="sect">
            <span className="sect-title">ORT. BEKLEME</span>
            <span className="sect-line" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 20 }}>
            {stats.avg_hours.map(a => (
              <div key={a.status} className="panel" style={{ padding: '12px 14px', textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: 22, color: 'var(--text)', letterSpacing: 2 }}>
                  {a.avg_h || 0}s
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase' }}>
                  {a.status}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function KanbanColumn({ title, items, color }) {
  return (
    <div className="panel" style={{ borderTop: `2px solid ${color}` }}>
      <div className="panel-header" style={{ padding: '8px 14px' }}>
        <span className="panel-title" style={{ fontSize: 11 }}>{title}</span>
        <span className="badge badge-gray">{items.length}</span>
      </div>
      <div className="panel-body" style={{ padding: '8px 10px', maxHeight: 300, overflowY: 'auto' }}>
        {items.length === 0 ? (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', textAlign: 'center', padding: 10 }}>
            Boş
          </div>
        ) : items.map(item => (
          <div key={item.id} style={{
            padding: '6px 8px', marginBottom: 4, borderRadius: 6,
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderLeft: `2px solid ${item.urgent ? 'var(--red)' : color}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span style={{ fontWeight: 600 }}>{item.block} · {item.room_no}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>
                {item.item_count}p
              </span>
            </div>
            {item.hours_in_status != null && (
              <div style={{
                fontFamily: 'var(--mono)', fontSize: 9, marginTop: 2,
                color: item.hours_in_status > 24 ? 'var(--red)' : 'var(--text3)',
              }}>
                {item.hours_in_status}s
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function ViolationsPanel({ violations }) {
  return (
    <div className="panel" style={{ borderTop: '2px solid var(--red)' }}>
      <div className="panel-header">
        <span className="panel-title">SLA İHLALLERİ</span>
        {violations.length > 0 && <span className="badge badge-red">{violations.length}</span>}
      </div>
      <div className="panel-body" style={{ padding: 0, maxHeight: 300, overflowY: 'auto' }}>
        {violations.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
            İhlal yok
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Oda</th>
                <th>Durum</th>
                <th>Süre</th>
                <th>Seviye</th>
              </tr>
            </thead>
            <tbody>
              {violations.map(v => (
                <tr key={v.id}>
                  <td style={{ fontWeight: 600 }}>{v.block} {v.room_no}</td>
                  <td><span className="badge badge-gray">{v.status}</span></td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{v.hours_in_status}s</td>
                  <td>
                    <span className={v.sla_level === 'critical' ? 'badge badge-red' : 'badge badge-amber'}>
                      {v.sla_level === 'critical' ? 'KRİTİK' : 'UYARI'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/modules/laundry/ && git commit -m "feat: laundry QueuePanel + LaundryDashboard — kanban, KPI, makine stats"
```

---

### Task 12: Route + Photo Upload entegrasyonu

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `backend/src/modules/laundry/routes.js`
- Modify: `frontend/src/shared/components/Layout.jsx` (PAGE_TITLES)

- [ ] **Step 1: App.jsx'e yeni route'ları ekle**

`frontend/src/App.jsx` dosyasına lazy import ekle (mevcut laundry import'unun yanına):

```javascript
const LaundryDashboard = lazy(() => import('./modules/laundry/LaundryDashboard.jsx'))
const LaundryReport    = lazy(() => import('./modules/laundry/LaundryReport.jsx'))
const LaundrySettings  = lazy(() => import('./modules/laundry/LaundrySettings.jsx'))
```

Route'ları ekle (mevcut laundry route'unun altına, `<Route>` çocuk olarak veya sibling olarak):

```jsx
<Route path="laundry/dashboard" element={<LaundryDashboard />} />
<Route path="laundry/report" element={<LaundryReport />} />
<Route path="laundry/settings" element={<LaundrySettings />} />
```

- [ ] **Step 2: Layout.jsx'e sayfa başlıklarını ekle**

`frontend/src/shared/components/Layout.jsx` dosyasındaki `PAGE_TITLES` objesine ekle:

```javascript
'/laundry/dashboard': 'Dashboard',
'/laundry/report': 'Raporlar',
'/laundry/settings': 'Ayarlar',
```

- [ ] **Step 3: Backend routes.js'e fotoğraf upload endpoint'i ekle**

`backend/src/modules/laundry/routes.js` dosyasının başına import ekle:

```javascript
import { upload } from '../../shared/uploads/middleware.js'
```

Dosyanın sonuna (fotoğraf upload yorumunun yerine) ekle:

```javascript
// Fotoğraf upload (mevcut multer middleware kullanılıyor)
laundryRouter.post('/upload-photo', ...laundryFull, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fotoğraf yüklenmedi' })
  res.json({ path: `/uploads/${req.file.filename}`, filename: req.file.filename })
})
```

**Ayrıca** `api.js` dosyasındaki `uploadPhoto` fonksiyonunu güncelle — URL'i `/laundry/upload-photo` olarak değiştir:

```javascript
uploadPhoto: (file) => {
  const fd = new FormData()
  fd.append('photo', file)
  return api.post('/laundry/upload-photo', fd, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }).then(r => r.data)
},
```

- [ ] **Step 4: Frontend'i başlat ve tüm route'ları kontrol et**

```bash
npm run dev
```

Kontrol:
- `/laundry` — Ana sayfa, filtreler, makine strip
- `/laundry/dashboard` — Dashboard, kanban, KPI kartları
- `/laundry/report` — (Task 13'te oluşturulacak, 404 olabilir şimdilik)
- `/laundry/settings` — (Task 13'te oluşturulacak)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx frontend/src/shared/components/Layout.jsx frontend/src/modules/laundry/api.js backend/src/modules/laundry/routes.js && git commit -m "feat: laundry route'ları + fotoğraf upload endpoint"
```

---

## FAZ 5 — Raporlama + Ayarlar + Final

### Task 13: Frontend — LaundryReport + LaundrySettings

**Files:**
- Create: `frontend/src/modules/laundry/LaundryReport.jsx`
- Create: `frontend/src/modules/laundry/LaundrySettings.jsx`

- [ ] **Step 1: LaundryReport.jsx oluştur**

`frontend/src/modules/laundry/LaundryReport.jsx`:

```jsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { laundryApi } from './api.js'

export default function LaundryReport() {
  const [dateRange, setDateRange] = useState({ from: '', to: '' })

  const { data: stats } = useQuery({
    queryKey: ['laundry-stats', dateRange],
    queryFn: () => laundryApi.getStats({
      from_date: dateRange.from || undefined,
      to_date: dateRange.to || undefined,
    }),
  })

  const { data: violations = [] } = useQuery({
    queryKey: ['laundry-violations'],
    queryFn: laundryApi.getSlaViolations,
  })

  const exportCsv = async () => {
    const blob = await laundryApi.exportCsv(dateRange)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `camasir-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ maxWidth: 800, position: 'relative', zIndex: 1 }} className="fade-up">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontFamily: 'var(--display)', fontSize: 28, letterSpacing: 4, color: 'var(--text)' }}>
          RAPORLAR
        </h1>
        <button className="btn btn-sm" style={{ background: 'var(--green)', color: '#000' }}
          onClick={exportCsv}>
          CSV İndir
        </button>
      </div>

      {/* Date filter */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <span className="panel-title">TARİH FİLTRE</span>
        </div>
        <div className="panel-body" style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label className="form-label">BAŞLANGIÇ</label>
            <input type="date" className="form-input" style={{ width: 160 }}
              value={dateRange.from} onChange={e => setDateRange(d => ({ ...d, from: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">BİTİŞ</label>
            <input type="date" className="form-input" style={{ width: 160 }}
              value={dateRange.to} onChange={e => setDateRange(d => ({ ...d, to: e.target.value }))} />
          </div>
          <button className="btn btn-ghost btn-sm"
            onClick={() => setDateRange({ from: '', to: '' })}>
            Temizle
          </button>
        </div>
      </div>

      {!stats ? (
        <div className="empty-state">
          <div className="empty-sub">Yükleniyor...</div>
        </div>
      ) : (
        <>
          {/* KPI */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
            <StatCard label="Bugün Teslim" value={stats.delivered_today?.count || 0} color="var(--green)" />
            <StatCard label="SLA İhlali" value={stats.sla_violations?.count || 0} color="var(--red)" />
            <StatCard label="Aktif Kayıt" value={stats.by_status?.reduce((a, b) => a + b.count, 0) || 0} color="var(--accent)" />
          </div>

          {/* Tarih aralığı istatistikleri */}
          {dateRange.from && dateRange.to && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 20 }}>
              <StatCard label="Dönem Toplam" value={stats.period_total?.count || 0} color="var(--blue)" />
              <StatCard label="Dönem Teslim" value={stats.period_delivered?.count || 0} color="var(--teal)" />
            </div>
          )}

          {/* Durum Dağılımı */}
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-header">
              <span className="panel-title">DURUM DAĞILIMI</span>
            </div>
            <div className="panel-body" style={{ padding: 0 }}>
              <table className="data-table">
                <thead>
                  <tr><th>Durum</th><th>Adet</th><th>Dağılım</th></tr>
                </thead>
                <tbody>
                  {(stats.by_status || []).map(s => {
                    const total = stats.by_status.reduce((a, b) => a + b.count, 0) || 1
                    const pct = Math.round((s.count / total) * 100)
                    const colorMap = { dirty: 'amber', washing: 'blue', ready: 'green', lost: 'red' }
                    return (
                      <tr key={s.status}>
                        <td><span className={`badge badge-${colorMap[s.status] || 'gray'}`}>{s.status}</span></td>
                        <td style={{ fontWeight: 700 }}>{s.count}</td>
                        <td style={{ width: '40%' }}>
                          <div className="prog-bar" style={{ width: '100%' }}>
                            <div className={`prog-fill prog-${colorMap[s.status] || 'blue'}`}
                              style={{ width: `${pct}%` }} />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Ortalama Bekleme */}
          {stats.avg_hours?.length > 0 && (
            <div className="panel" style={{ marginBottom: 16 }}>
              <div className="panel-header">
                <span className="panel-title">ORT. BEKLEME SÜRESİ</span>
              </div>
              <div className="panel-body" style={{ padding: 0 }}>
                <table className="data-table">
                  <thead>
                    <tr><th>Durum</th><th>Ort. Saat</th></tr>
                  </thead>
                  <tbody>
                    {stats.avg_hours.map(a => (
                      <tr key={a.status}>
                        <td><span className="badge badge-gray">{a.status}</span></td>
                        <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>
                          {a.avg_h || 0}s
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SLA İhlalleri */}
          {violations.length > 0 && (
            <div className="panel" style={{ borderTop: '2px solid var(--red)' }}>
              <div className="panel-header">
                <span className="panel-title">AKTİF SLA İHLALLERİ</span>
                <span className="badge badge-red">{violations.length}</span>
              </div>
              <div className="panel-body" style={{ padding: 0 }}>
                <table className="data-table">
                  <thead>
                    <tr><th>Oda</th><th>Durum</th><th>Süre</th><th>Seviye</th></tr>
                  </thead>
                  <tbody>
                    {violations.map(v => (
                      <tr key={v.id}>
                        <td style={{ fontWeight: 600 }}>{v.block} {v.room_no}</td>
                        <td><span className="badge badge-gray">{v.status}</span></td>
                        <td style={{ fontFamily: 'var(--mono)' }}>{v.hours_in_status}s</td>
                        <td>
                          <span className={v.sla_level === 'critical' ? 'badge badge-red' : 'badge badge-amber'}>
                            {v.sla_level === 'critical' ? 'KRİTİK' : 'UYARI'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function StatCard({ label, value, color }) {
  return (
    <div className="kpi-card panel" style={{ padding: '14px 16px', textAlign: 'center', borderTop: `2px solid ${color}` }}>
      <div style={{ fontFamily: 'var(--display)', fontSize: 30, letterSpacing: 2, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', marginTop: 4, textTransform: 'uppercase', letterSpacing: 1.5 }}>{label}</div>
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

const STAGE_LABELS = { dirty: 'Kirli Sepette', washing: 'Yıkanıyor', ready: 'Rafta Hazır' }

export default function LaundrySettings() {
  const qc = useQueryClient()
  const { data: configs = [] } = useQuery({ queryKey: ['laundry-sla-config'], queryFn: laundryApi.getSlaConfig })
  const { data: machines = [] } = useQuery({ queryKey: ['laundry-machines'], queryFn: laundryApi.getMachines })

  const [newMachine, setNewMachine] = useState({ name: '', type: 'washer', capacity_kg: 10 })

  const addMachine = useMutation({
    mutationFn: () => laundryApi.createMachine(newMachine),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['laundry-machines'] }); setNewMachine({ name: '', type: 'washer', capacity_kg: 10 }) },
  })

  const delMachine = useMutation({
    mutationFn: (id) => laundryApi.deleteMachine(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['laundry-machines'] }),
  })

  return (
    <div style={{ maxWidth: 700, position: 'relative', zIndex: 1 }} className="fade-up">
      <h1 style={{ fontFamily: 'var(--display)', fontSize: 28, letterSpacing: 4, color: 'var(--text)', marginBottom: 20 }}>
        AYARLAR
      </h1>

      {/* SLA Config */}
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-header">
          <span className="panel-title">SLA EŞİKLERİ</span>
          <span className="panel-subtitle">Uyarı ve kritik saat eşikleri</span>
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {configs.map(cfg => (
            <SlaRow key={cfg.stage} config={cfg} />
          ))}
        </div>
      </div>

      {/* Machine Management */}
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-header">
          <span className="panel-title">MAKİNELER</span>
          <span className="badge badge-gray">{machines.length}</span>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          <table className="data-table">
            <thead>
              <tr><th>Ad</th><th>Tip</th><th>Kapasite</th><th>Durum</th><th></th></tr>
            </thead>
            <tbody>
              {machines.map(m => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 600 }}>{m.name}</td>
                  <td><span className="badge badge-gray">{m.type === 'washer' ? 'Yıkama' : 'Kurutucu'}</span></td>
                  <td>{m.capacity_kg} kg</td>
                  <td><span className={`badge ${m.status === 'idle' ? 'badge-green' : m.status === 'running' ? 'badge-amber' : 'badge-gray'}`}>{m.status}</span></td>
                  <td>
                    <button className="btn btn-danger btn-xs"
                      onClick={() => { if (confirm(`${m.name} silinsin mi?`)) delMachine.mutate(m.id) }}
                      disabled={delMachine.isPending}>
                      Sil
                    </button>
                  </td>
                </tr>
              ))}
              <tr>
                <td>
                  <input className="form-input" style={{ padding: '4px 8px', fontSize: 11 }}
                    value={newMachine.name} onChange={e => setNewMachine(m => ({ ...m, name: e.target.value }))}
                    placeholder="Makine adı..." />
                </td>
                <td>
                  <select className="form-select" style={{ padding: '4px 8px', fontSize: 11 }}
                    value={newMachine.type} onChange={e => setNewMachine(m => ({ ...m, type: e.target.value }))}>
                    <option value="washer">Yıkama</option>
                    <option value="dryer">Kurutucu</option>
                  </select>
                </td>
                <td>
                  <input type="number" className="form-input" style={{ padding: '4px 8px', fontSize: 11, width: 60 }}
                    value={newMachine.capacity_kg} onChange={e => setNewMachine(m => ({ ...m, capacity_kg: +e.target.value }))} />
                </td>
                <td colSpan={2}>
                  <button className="btn btn-primary btn-xs"
                    onClick={() => addMachine.mutate()}
                    disabled={!newMachine.name.trim() || addMachine.isPending}>
                    Ekle
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {delMachine.isError && (
        <div className="alert alert-danger">
          {delMachine.error?.response?.data?.error || 'Silme hatası'}
        </div>
      )}
    </div>
  )
}

function SlaRow({ config }) {
  const qc = useQueryClient()
  const [warn, setWarn] = useState(config.warning_hours)
  const [crit, setCrit] = useState(config.critical_hours)
  const dirty = warn !== config.warning_hours || crit !== config.critical_hours

  const save = useMutation({
    mutationFn: () => laundryApi.updateSlaConfig({ stage: config.stage, warning_hours: warn, critical_hours: crit }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['laundry-sla-config'] }),
  })

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ minWidth: 120 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: 'var(--text2)' }}>
          {STAGE_LABELS[config.stage]}
        </span>
      </div>
      <div>
        <label className="form-label" style={{ color: 'var(--accent)' }}>UYARI (saat)</label>
        <input type="number" min="0.5" step="0.5" value={warn}
          onChange={e => setWarn(+e.target.value)}
          className="form-input" style={{ width: 80, padding: '4px 8px', fontSize: 12, borderColor: 'rgba(240,165,0,0.3)' }} />
      </div>
      <div>
        <label className="form-label" style={{ color: 'var(--red)' }}>KRİTİK (saat)</label>
        <input type="number" min="1" step="0.5" value={crit}
          onChange={e => setCrit(+e.target.value)}
          className="form-input" style={{ width: 80, padding: '4px 8px', fontSize: 12, borderColor: 'rgba(231,76,60,0.3)' }} />
      </div>
      {dirty && (
        <button className="btn btn-primary btn-sm"
          onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? '...' : 'Kaydet'}
        </button>
      )}
      {save.isError && (
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--red)' }}>
          {save.error?.response?.data?.error || 'Hata'}
        </span>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Frontend'i test et**

```bash
cd frontend && npm run dev
```

Kontrol:
- `/laundry/report` — Rapor sayfası açılıyor, KPI + durum dağılımı + progress bar + CSV export
- `/laundry/settings` — SLA eşikleri düzenlenebiliyor, makine CRUD çalışıyor

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/modules/laundry/ && git commit -m "feat: laundry report + settings — SLA config, makine CRUD, CSV export, tarih filtresi"
```

---

### Task 14: Final testler + smoke

- [ ] **Step 1: Tüm backend testlerini çalıştır**

```bash
cd backend && npx vitest run
```

Beklenen: tüm test dosyaları PASS. Diğer modül testleri de kırılmamış olmalı.

- [ ] **Step 2: Laundry testlerini ayrıca çalıştır**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js --reporter=verbose
```

Beklenen: tüm describe blokları PASS:
- Laundry queries (7+ test)
- State machine (8+ test)
- Laundry routes — yetki kontrolleri (7+ test)
- SLA engine (3+ test)
- WhatsApp (1 test)

- [ ] **Step 3: Dev sunucusunu başlat ve tam smoke test**

```bash
npm run dev
```

Tam kontrol listesi:

**Login:**
- `camasir/admin123` ile giriş yap

**Ana Sayfa (`/laundry`):**
- [ ] Sayfa hatasız açılıyor
- [ ] KPI kartları doğru renklerde (amber/blue/green/red)
- [ ] Makine şeridi gösteriliyor (4 makine)
- [ ] Filter chip'ler çalışıyor ve `active` class'ı uygulanıyor
- [ ] Arama input'u çalışıyor
- [ ] Toplu seçim modu aktif olabiliyor

**Kayıt Oluşturma:**
- [ ] `+ Yeni Kayıt` → modal `.panel` class'ıyla açılıyor
- [ ] Oda seçimi `.form-select` ile çalışıyor
- [ ] Parça adedi artırılıp azaltılabiliyor
- [ ] Kayıt oluşturuluyor ve liste güncelleniyor

**State Machine:**
- [ ] `Makineye At` → select'ten makine seçimi → durum `washing` oluyor
- [ ] `Rafa Koy` → prompt → durum `ready` oluyor
- [ ] `Teslim Et` → DeliveryModal açılıyor → isim giriliyor → teslim tamamlanıyor
- [ ] İmza canvas'ı mouse + touch ile çalışıyor

**Dashboard (`/laundry/dashboard`):**
- [ ] Kanban view 3 sütun gösteriyor
- [ ] Queue paneli gösteriliyor
- [ ] SLA ihlalleri paneli gösteriliyor
- [ ] Makine durumu tablosu çalışıyor

**Rapor (`/laundry/report`):**
- [ ] Rapor sayfası açılıyor
- [ ] Tarih filtresi çalışıyor
- [ ] Progress bar'lar `prog-bar` + `prog-fill` class'larıyla render ediliyor
- [ ] CSV indirme butonu çalışıyor
- [ ] SLA ihlalleri tablosu gösteriliyor

**Ayarlar (`/laundry/settings`):**
- [ ] SLA eşikleri gösteriliyor ve düzenlenebiliyor
- [ ] Makine tablosu gösteriliyor
- [ ] Yeni makine ekleme çalışıyor
- [ ] Makine silme çalışıyor

**API Testleri (tarayıcı console veya curl):**
- [ ] `GET /api/laundry/sla/violations` — JSON array dönüyor
- [ ] `GET /api/laundry/queue` — JSON array dönüyor
- [ ] `GET /api/laundry/reports/stats` — İstatistik objesi dönüyor
- [ ] `GET /api/laundry/reports/export` — CSV dosyası indiriliyor

**Yetki Kontrolü:**
- [ ] `vardiya/admin123` ile giriş → `/laundry` → liste görülebiliyor ama CRUD butonları yok
- [ ] `teknik/admin123` ile giriş → `/laundry` → 403 hatası

- [ ] **Step 4: Final commit**

```bash
cd backend && npx vitest run && cd .. && git add -A && git commit -m "feat: laundry v2 — full-stack kişisel çamaşır takip modülü tamamlandı"
```

---

## Özet Dosya Listesi

| Dosya | İşlem |
|-------|-------|
| `backend/src/shared/db/index.js` | Modify — 7 tablo migration + indexler |
| `backend/src/modules/laundry/queries.js` | Overwrite — items, machines, queue, damage, SLA, reports |
| `backend/src/modules/laundry/service.js` | Overwrite — state machine, batch, queue, damage |
| `backend/src/modules/laundry/routes.js` | Overwrite — 20+ endpoint, yetki matrisi, upload |
| `backend/src/modules/laundry/sla.js` | Create — SLA ihlal + makine zamanlayıcı |
| `backend/src/modules/laundry/whatsapp.js` | Create — Meta Cloud API |
| `backend/src/modules/laundry/laundry.test.js` | Create/Overwrite — kapsamlı test suite |
| `backend/src/shared/cron/index.js` | Modify — laundry cron |
| `frontend/src/modules/laundry/api.js` | Create — tüm API çağrıları |
| `frontend/src/modules/laundry/LaundryPage.jsx` | Overwrite — ana sayfa + filtre + batch |
| `frontend/src/modules/laundry/LaundryDashboard.jsx` | Create — kanban + KPI + stats |
| `frontend/src/modules/laundry/LaundryReport.jsx` | Create — rapor + CSV + progress bar |
| `frontend/src/modules/laundry/LaundrySettings.jsx` | Create — SLA eşik + makine CRUD |
| `frontend/src/modules/laundry/components/ItemCard.jsx` | Create — kayıt kartı |
| `frontend/src/modules/laundry/components/NewItemModal.jsx` | Create — yeni kayıt |
| `frontend/src/modules/laundry/components/DeliveryModal.jsx` | Create — teslim + imza (touch) |
| `frontend/src/modules/laundry/components/DamageModal.jsx` | Create — hasar + fotoğraf |
| `frontend/src/modules/laundry/components/MachineStrip.jsx` | Create — makine durumu |
| `frontend/src/modules/laundry/components/QueuePanel.jsx` | Create — sıra yönetimi |
| `frontend/src/modules/laundry/components/SlaAlert.jsx` | Create — SLA uyarı |
| `frontend/src/modules/laundry/QRScanner.jsx` | Delete |
| `frontend/src/modules/laundry/DistributionRoute.jsx` | Delete |
| `frontend/src/App.jsx` | Modify — 3 yeni route |
| `frontend/src/shared/components/Layout.jsx` | Modify — PAGE_TITLES |
