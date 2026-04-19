# AVS Çamaşırhane Kiosk & Hızlı Doluluk — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AVS çalışanları için ayrı bir varlık + çamaşırhane kiosk (`/laundry-kiosk`) + check-in'de hızlı oda doluluk girişi.

**Architecture:** DB migration önce (avs_workers tablosu + is_placeholder kolonu), ardından backend (CRUD + auth + kiosk endpoint'leri), ardından frontend. Her faz kendi commit'iyle teslim edilir.

**Tech Stack:** Node.js + Express + better-sqlite3 + bcryptjs + jsonwebtoken (backend), React + TanStack Query + Tailwind (frontend), Vitest + supertest (test)

---

## Dosya Haritası

**Oluşturulacak:**
- `backend/src/modules/avs-workers/routes.js`
- `backend/src/modules/avs-workers/queries.js`
- `backend/src/modules/avs-workers/avs-workers.test.js`
- `frontend/src/modules/admin/AvsWorkersPage.jsx`
- `frontend/src/modules/laundry-kiosk/LaundryKioskPage.jsx`

**Değiştirilecek:**
- `backend/src/shared/db/index.js` — 2 migration ekle
- `backend/src/shared/auth/service.js` — searchAvsWorkers + loginAvsKiosk
- `backend/src/shared/auth/routes.js` — /avs-search + /avs-login
- `backend/src/shared/auth/middleware.js` — requireAvsKiosk
- `backend/src/modules/self-service/routes.js` — 9 laundry-kiosk endpoint
- `backend/src/modules/self-service/self-service.test.js` — avs kiosk testleri
- `backend/src/modules/checkin/queries.js` — insertPlaceholderBatch
- `backend/src/modules/checkin/routes.js` — POST /placeholder-batch
- `backend/src/modules/checkin/checkin.test.js` — placeholder testleri
- `backend/src/app.js` — avsWorkersRouter mount
- `frontend/src/App.jsx` — 2 yeni route
- `frontend/src/shared/components/Sidebar.jsx` — AVS linki
- `frontend/src/modules/checkin/CheckinPage.jsx` — Hızlı Doluluk butonu + modal

---

## Task 1: DB Migration

**Files:**
- Modify: `backend/src/shared/db/index.js`

- [ ] **Step 1: initDB() içinde son migration bloğundan sonra 2 try/catch ekle**

`backend/src/shared/db/index.js` dosyasında, son `try { db.exec(`CREATE TABLE IF NOT EXISTS email_log` ... }` bloğundan hemen sonra:

```js
try { db.exec(`CREATE TABLE IF NOT EXISTS avs_workers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name  TEXT NOT NULL,
  role_label TEXT,
  kiosk_pin  TEXT,
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
)`) } catch(e) { console.error('[Migration] avs_workers:', e.message) }
try { db.exec('ALTER TABLE personnel ADD COLUMN is_placeholder INTEGER DEFAULT 0') }
  catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
```

- [ ] **Step 2: Migration'ın temiz çalıştığını doğrula**

```bash
cd backend && node -e "import('./src/shared/db/index.js').then(m=>m.initDB()).then(()=>console.log('OK'))"
```

Beklenen çıktı: `OK` (hata mesajı yok)

- [ ] **Step 3: Commit**

```bash
git add backend/src/shared/db/index.js
git commit -m "feat: faz1 DB migration — avs_workers tablosu ve personnel.is_placeholder kolonu"
```

---

## Task 2: AVS Workers Backend (CRUD)

**Files:**
- Create: `backend/src/modules/avs-workers/queries.js`
- Create: `backend/src/modules/avs-workers/routes.js`
- Create: `backend/src/modules/avs-workers/avs-workers.test.js`
- Modify: `backend/src/app.js`

- [ ] **Step 1: Test dosyasını yaz**

`backend/src/modules/avs-workers/avs-workers.test.js`:

```js
import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  token = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
})

describe('AVS Workers', () => {
  it('campus_manager olmayan erişemez', async () => {
    const t = (await request(app).post('/api/auth/login').send({ username: 'vardiya', password: 'admin123' })).body.token
    const res = await request(app).get('/api/avs-workers').set('Authorization', `Bearer ${t}`)
    expect(res.status).toBe(403)
  })

  it('GET / boş liste döner', async () => {
    const res = await request(app).get('/api/avs-workers').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('POST / yeni çalışan ekler', async () => {
    const res = await request(app).post('/api/avs-workers')
      .set('Authorization', `Bearer ${token}`)
      .send({ full_name: 'Ahmet Kaya', role_label: 'Çamaşırhane' })
    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('id')
    expect(res.body.full_name).toBe('Ahmet Kaya')
  })

  it('POST / kısa isim reddedilir', async () => {
    const res = await request(app).post('/api/avs-workers')
      .set('Authorization', `Bearer ${token}`)
      .send({ full_name: 'A' })
    expect(res.status).toBe(400)
  })

  it('PUT /:id/pin PIN atar', async () => {
    const created = await request(app).post('/api/avs-workers')
      .set('Authorization', `Bearer ${token}`)
      .send({ full_name: 'Test Worker' })
    const res = await request(app).put(`/api/avs-workers/${created.body.id}/pin`)
      .set('Authorization', `Bearer ${token}`)
      .send({ new_pin: '1234' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('PUT /:id/pin hatalı PIN reddedilir', async () => {
    const created = await request(app).post('/api/avs-workers')
      .set('Authorization', `Bearer ${token}`)
      .send({ full_name: 'Pin Test Worker' })
    const res = await request(app).put(`/api/avs-workers/${created.body.id}/pin`)
      .set('Authorization', `Bearer ${token}`)
      .send({ new_pin: 'abcd' })
    expect(res.status).toBe(400)
  })

  it('PUT /:id/toggle aktif/pasif değiştirir', async () => {
    const created = await request(app).post('/api/avs-workers')
      .set('Authorization', `Bearer ${token}`)
      .send({ full_name: 'Toggle Worker' })
    const res = await request(app).put(`/api/avs-workers/${created.body.id}/toggle`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.is_active).toBe(0)
  })

  it('DELETE /:id siler', async () => {
    const created = await request(app).post('/api/avs-workers')
      .set('Authorization', `Bearer ${token}`)
      .send({ full_name: 'Delete Worker' })
    const res = await request(app).delete(`/api/avs-workers/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Testi çalıştır — FAIL olmalı (modül yok)**

```bash
cd backend && npx vitest run src/modules/avs-workers/avs-workers.test.js
```

Beklenen: FAIL (cannot find module)

- [ ] **Step 3: queries.js oluştur**

`backend/src/modules/avs-workers/queries.js`:

```js
import { getDB } from '../../shared/db/index.js'
import bcrypt from 'bcryptjs'

const SAFE_COLS = 'id, full_name, role_label, is_active, created_at, kiosk_pin IS NOT NULL as has_pin'

export function listWorkers() {
  return getDB().prepare(`SELECT ${SAFE_COLS} FROM avs_workers ORDER BY full_name`).all()
}

export function getWorker(id) {
  return getDB().prepare(`SELECT ${SAFE_COLS} FROM avs_workers WHERE id=?`).get(id)
}

export function createWorker({ full_name, role_label }) {
  const r = getDB().prepare('INSERT INTO avs_workers(full_name, role_label) VALUES(?,?)').run(full_name, role_label || null)
  return r.lastInsertRowid
}

export function updateWorker(id, { full_name, role_label }) {
  getDB().prepare('UPDATE avs_workers SET full_name=?, role_label=? WHERE id=?').run(full_name, role_label || null, id)
}

export function setWorkerPin(id, pin) {
  const hash = bcrypt.hashSync(pin, 10)
  getDB().prepare('UPDATE avs_workers SET kiosk_pin=? WHERE id=?').run(hash, id)
}

export function toggleWorker(id) {
  getDB().prepare('UPDATE avs_workers SET is_active = 1 - is_active WHERE id=?').run(id)
  return getDB().prepare('SELECT is_active FROM avs_workers WHERE id=?').get(id)
}

export function deleteWorker(id) {
  return getDB().prepare('DELETE FROM avs_workers WHERE id=?').run(id).changes > 0
}
```

- [ ] **Step 4: routes.js oluştur**

`backend/src/modules/avs-workers/routes.js`:

```js
import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { listWorkers, getWorker, createWorker, updateWorker, setWorkerPin, toggleWorker, deleteWorker } from './queries.js'

export const avsWorkersRouter = Router()
const adminOnly = requireRole('campus_manager')

avsWorkersRouter.get('/', ...adminOnly, (req, res) => {
  try { res.json(listWorkers()) }
  catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

avsWorkersRouter.post('/', ...adminOnly, (req, res) => {
  const { full_name, role_label } = req.body
  if (!full_name || full_name.trim().length < 2) return res.status(400).json({ error: 'Ad en az 2 karakter olmalı' })
  try {
    const id = createWorker({ full_name: full_name.trim(), role_label: role_label?.trim() || null })
    res.status(201).json(getWorker(id))
  } catch (e) { res.status(400).json({ error: e.message }) }
})

avsWorkersRouter.put('/:id', ...adminOnly, (req, res) => {
  const { full_name, role_label } = req.body
  if (!full_name || full_name.trim().length < 2) return res.status(400).json({ error: 'Ad en az 2 karakter olmalı' })
  const w = getWorker(Number(req.params.id))
  if (!w) return res.status(404).json({ error: 'Çalışan bulunamadı' })
  updateWorker(Number(req.params.id), { full_name: full_name.trim(), role_label: role_label?.trim() || null })
  res.json(getWorker(Number(req.params.id)))
})

avsWorkersRouter.put('/:id/pin', ...adminOnly, (req, res) => {
  const { new_pin } = req.body
  if (!new_pin || !/^\d{4}$/.test(new_pin)) return res.status(400).json({ error: 'PIN 4 haneli rakam olmalı' })
  const w = getWorker(Number(req.params.id))
  if (!w) return res.status(404).json({ error: 'Çalışan bulunamadı' })
  setWorkerPin(Number(req.params.id), new_pin)
  res.json({ ok: true })
})

avsWorkersRouter.put('/:id/toggle', ...adminOnly, (req, res) => {
  const w = getWorker(Number(req.params.id))
  if (!w) return res.status(404).json({ error: 'Çalışan bulunamadı' })
  const result = toggleWorker(Number(req.params.id))
  res.json({ is_active: result.is_active })
})

avsWorkersRouter.delete('/:id', ...adminOnly, (req, res) => {
  const deleted = deleteWorker(Number(req.params.id))
  if (!deleted) return res.status(404).json({ error: 'Çalışan bulunamadı' })
  res.json({ ok: true })
})
```

- [ ] **Step 5: app.js'e router ekle**

`backend/src/app.js` dosyasında import bölümüne ekle:

```js
import { avsWorkersRouter } from './modules/avs-workers/routes.js'
```

`app.use('/api/announcements', writeLimiter, announcementsRouter)` satırından sonra:

```js
app.use('/api/avs-workers', writeLimiter, avsWorkersRouter)
```

- [ ] **Step 6: Testleri çalıştır — PASS olmalı**

```bash
cd backend && npx vitest run src/modules/avs-workers/avs-workers.test.js
```

Beklenen: 7 test PASS

- [ ] **Step 7: Tüm testlerin geçtiğini doğrula**

```bash
cd backend && npx vitest run
```

Beklenen: tüm testler PASS

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/avs-workers/ backend/src/app.js
git commit -m "feat: faz2 AVS workers CRUD backend"
```

---

## Task 3: AVS Auth (search + login + middleware)

**Files:**
- Modify: `backend/src/shared/auth/service.js`
- Modify: `backend/src/shared/auth/routes.js`
- Modify: `backend/src/shared/auth/middleware.js`

- [ ] **Step 1: Test yaz — auth endpoint'leri için**

`backend/src/modules/avs-workers/avs-workers.test.js` dosyasının sonuna ekle:

```js
describe('AVS Auth', () => {
  it('GET /auth/avs-search boş query için boş array döner', async () => {
    const res = await request(app).get('/api/auth/avs-search?q=a')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('POST /auth/avs-login PIN tanımlı değilse 403', async () => {
    const w = await request(app).post('/api/avs-workers')
      .set('Authorization', `Bearer ${token}`)
      .send({ full_name: 'Auth Test Worker' })
    const res = await request(app).post('/api/auth/avs-login')
      .send({ worker_id: w.body.id, pin: '1234' })
    expect(res.status).toBe(403)
  })

  it('POST /auth/avs-login doğru PIN ile token döner', async () => {
    const w = await request(app).post('/api/avs-workers')
      .set('Authorization', `Bearer ${token}`)
      .send({ full_name: 'Login Test Worker' })
    await request(app).put(`/api/avs-workers/${w.body.id}/pin`)
      .set('Authorization', `Bearer ${token}`)
      .send({ new_pin: '5678' })
    const res = await request(app).post('/api/auth/avs-login')
      .send({ worker_id: w.body.id, pin: '5678' })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('token')
  })

  it('POST /auth/avs-login yanlış PIN ile 401', async () => {
    const w = await request(app).post('/api/avs-workers')
      .set('Authorization', `Bearer ${token}`)
      .send({ full_name: 'Wrong Pin Worker' })
    await request(app).put(`/api/avs-workers/${w.body.id}/pin`)
      .set('Authorization', `Bearer ${token}`)
      .send({ new_pin: '9999' })
    const res = await request(app).post('/api/auth/avs-login')
      .send({ worker_id: w.body.id, pin: '0000' })
    expect(res.status).toBe(401)
  })

  it('POST /auth/avs-login pasif çalışan 401', async () => {
    const w = await request(app).post('/api/avs-workers')
      .set('Authorization', `Bearer ${token}`)
      .send({ full_name: 'Inactive Worker' })
    await request(app).put(`/api/avs-workers/${w.body.id}/pin`)
      .set('Authorization', `Bearer ${token}`)
      .send({ new_pin: '1111' })
    await request(app).put(`/api/avs-workers/${w.body.id}/toggle`)
      .set('Authorization', `Bearer ${token}`)
    const res = await request(app).post('/api/auth/avs-login')
      .send({ worker_id: w.body.id, pin: '1111' })
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: auth/service.js'e fonksiyonlar ekle**

`backend/src/shared/auth/service.js` dosyasında `export function setKioskPin` satırından hemen önce:

```js
export function searchAvsWorkers(q) {
  const db = getDB()
  return db.prepare(
    `SELECT id, full_name, role_label, kiosk_pin IS NOT NULL as has_pin
     FROM avs_workers WHERE is_active=1 AND full_name LIKE ?
     ORDER BY full_name LIMIT 10`
  ).all(`%${q}%`)
}

export function loginAvsKiosk(workerId, pin) {
  const db = getDB()
  const w = db.prepare('SELECT * FROM avs_workers WHERE id=? AND is_active=1').get(workerId)
  if (!w) return { error: 'Çalışan bulunamadı veya pasif', status: 401 }
  if (!w.kiosk_pin) return { error: 'PIN tanımlı değil. Yöneticinizden PIN alın.', status: 403 }
  if (!bcrypt.compareSync(pin, w.kiosk_pin)) return { error: 'PIN hatalı', status: 401 }
  const token = jwt.sign(
    { workerId: w.id, role: 'avs_kiosk', full_name: w.full_name },
    SECRET,
    { expiresIn: '4h' }
  )
  return { token, worker: { id: w.id, full_name: w.full_name, role_label: w.role_label } }
}
```

- [ ] **Step 3: auth/routes.js'e endpoint'ler ekle**

`backend/src/shared/auth/routes.js` dosyasının import satırını güncelle:

```js
import { login, loginKiosk, loginKioskById, searchKioskPersonnel, loginAvsKiosk, searchAvsWorkers, changeOwnPassword, refreshToken } from './service.js'
```

`authRouter.get('/kiosk-config', ...)` satırından sonra ekle:

```js
authRouter.get('/avs-search', (req, res) => {
  const q = (req.query.q || '').trim()
  if (q.length < 2) return res.json([])
  res.json(searchAvsWorkers(q))
})

authRouter.post('/avs-login', (req, res) => {
  const { worker_id, pin } = req.body
  if (!worker_id || !pin) return res.status(400).json({ error: 'worker_id ve pin gerekli' })
  const result = loginAvsKiosk(Number(worker_id), pin)
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.json(result)
})
```

- [ ] **Step 4: middleware.js'e requireAvsKiosk ekle**

`backend/src/shared/auth/middleware.js` dosyasının sonuna ekle:

```js
export function requireAvsKiosk(req, res, next) {
  const h = req.headers.authorization
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token gerekli' })
  try {
    req.user = verifyToken(h.slice(7))
    if (req.user.role !== 'avs_kiosk') return res.status(403).json({ error: 'AVS kiosk token gerekli' })
    next()
  } catch {
    res.status(401).json({ error: 'Geçersiz token' })
  }
}
```

- [ ] **Step 5: Testleri çalıştır — PASS olmalı**

```bash
cd backend && npx vitest run src/modules/avs-workers/avs-workers.test.js
```

Beklenen: 12 test PASS

- [ ] **Step 6: Tüm testler**

```bash
cd backend && npx vitest run
```

Beklenen: tüm testler PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/shared/auth/service.js backend/src/shared/auth/routes.js backend/src/shared/auth/middleware.js
git commit -m "feat: faz3 AVS kiosk auth — search, login, requireAvsKiosk middleware"
```

---

## Task 4: Laundry Kiosk Backend Endpoint'leri

**Files:**
- Modify: `backend/src/modules/self-service/routes.js`
- Modify: `backend/src/modules/self-service/self-service.test.js`

- [ ] **Step 1: Test yaz — kiosk endpoint'leri için**

`backend/src/modules/self-service/self-service.test.js` dosyasının sonuna ekle:

```js
import jwt from 'jsonwebtoken'

describe('Laundry Kiosk endpoints', () => {
  let avsToken

  beforeAll(async () => {
    // AVS worker oluştur ve PIN ata
    const adminToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
    const w = (await request(app).post('/api/avs-workers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ full_name: 'Kiosk Test Worker' })).body
    await request(app).put(`/api/avs-workers/${w.id}/pin`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ new_pin: '0000' })
    const loginRes = await request(app).post('/api/auth/avs-login').send({ worker_id: w.id, pin: '0000' })
    avsToken = loginRes.body.token
  })

  it('GET /laundry-kiosk/blocks token gerektirmez', async () => {
    const res = await request(app).get('/api/self-service/laundry-kiosk/blocks')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('GET /laundry-kiosk/room-persons AVS token olmadan 401', async () => {
    const res = await request(app).get('/api/self-service/laundry-kiosk/room-persons?block=A&room_no=101')
    expect(res.status).toBe(401)
  })

  it('GET /laundry-kiosk/room-persons AVS token ile çalışır', async () => {
    const res = await request(app)
      .get('/api/self-service/laundry-kiosk/room-persons?block=A&room_no=101')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('GET /laundry-kiosk/bags AVS token ile çalışır', async () => {
    const res = await request(app)
      .get('/api/self-service/laundry-kiosk/bags')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('PUT /laundry-kiosk/bags/:id/status geçersiz durum reddedilir', async () => {
    const res = await request(app)
      .put('/api/self-service/laundry-kiosk/bags/1/status')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ status: 'invalid_status' })
    expect(res.status).toBe(400)
  })

  it('GET /laundry-kiosk/machines AVS token ile çalışır', async () => {
    const res = await request(app)
      .get('/api/self-service/laundry-kiosk/machines')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('Kiosk token (role:kiosk) laundry-kiosk endpoint\'lerine erişemez', async () => {
    const kioskToken = jwt.sign({ personnelId: 1, role: 'kiosk' }, process.env.JWT_SECRET, { expiresIn: '1h' })
    const res = await request(app)
      .get('/api/self-service/laundry-kiosk/machines')
      .set('Authorization', `Bearer ${kioskToken}`)
    expect(res.status).toBe(403)
  })
})
```

- [ ] **Step 2: self-service/routes.js'e import'ları ekle**

Dosyanın başında mevcut import'lardan sonra:

```js
import { requireAvsKiosk } from '../../shared/auth/middleware.js'
import { insertItemQuery, updateItemStatusQuery, listMachinesQuery, addToQueueQuery } from '../laundry/queries.js'
```

- [ ] **Step 3: 9 laundry-kiosk endpoint'ini routes.js'e ekle**

`backend/src/modules/self-service/routes.js` dosyasının sonuna (son endpoint'ten sonra) ekle:

```js
// ── Laundry Kiosk (AVS çalışanları) ──────────────────────────────────────

selfServiceRouter.get('/laundry-kiosk/blocks', (req, res) => {
  try {
    const db = getDB()
    const blocks = db.prepare('SELECT DISTINCT block FROM rooms ORDER BY block').all().map(r => r.block)
    res.json(blocks)
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

selfServiceRouter.get('/laundry-kiosk/room-persons', requireAvsKiosk, (req, res) => {
  const { block, room_no } = req.query
  if (!block || !room_no) return res.status(400).json({ error: 'block ve room_no gerekli' })
  try {
    const db = getDB()
    const persons = db.prepare(`
      SELECT p.id, p.full_name, p.company
      FROM room_assignments ra
      JOIN rooms r ON r.id = ra.room_id
      JOIN personnel p ON p.id = ra.personnel_id
      WHERE r.block=? AND r.room_no=? AND ra.check_out_at IS NULL AND p.check_out_date IS NULL
      ORDER BY p.full_name
    `).all(block, room_no)
    res.json(persons)
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

selfServiceRouter.post('/laundry-kiosk/bag', requireAvsKiosk, (req, res) => {
  const { block, room_no, personnel_id, item_count, is_premium, notes, urgent, intake_signature, clothing_items } = req.body
  if (!block || !room_no) return res.status(400).json({ error: 'block ve room_no gerekli' })
  const count = Number(item_count)
  if (!count || count < 1 || count > 8) return res.status(400).json({ error: 'Geçersiz adet (1-8)' })
  try {
    const db = getDB()
    const room = db.prepare('SELECT id FROM rooms WHERE block=? AND room_no=?').get(block, room_no)
    if (!room) return res.status(404).json({ error: 'Oda bulunamadı' })
    const intake_name = personnel_id
      ? db.prepare('SELECT full_name FROM personnel WHERE id=?').get(Number(personnel_id))?.full_name
      : null
    const id = insertItemQuery({
      room_id: room.id,
      item_count: count,
      is_premium: is_premium ? 1 : 0,
      notes: notes || null,
      urgent: urgent ? 1 : 0,
      intake_signature: intake_signature || null,
      intake_name: intake_name || null,
      clothing_items: clothing_items ? JSON.stringify(clothing_items) : null,
      created_by: null,
    })
    res.status(201).json({ id })
  } catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

selfServiceRouter.get('/laundry-kiosk/bags', requireAvsKiosk, (req, res) => {
  const { block, room_no, status } = req.query
  try {
    const db = getDB()
    let q = `SELECT li.id, li.status, li.item_count, li.urgent, li.is_premium, li.needs_ironing,
                    li.created_at, li.intake_name, r.block, r.room_no
             FROM laundry_items li JOIN rooms r ON r.id = li.room_id WHERE 1=1`
    const params = []
    if (block)   { q += ' AND r.block=?';   params.push(block) }
    if (room_no) { q += ' AND r.room_no=?'; params.push(room_no) }
    if (status)  { q += ' AND li.status=?'; params.push(status) }
    else         { q += ` AND li.status NOT IN ('delivered','lost')` }
    q += ' ORDER BY li.urgent DESC, li.created_at ASC LIMIT 50'
    res.json(db.prepare(q).all(...params))
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

selfServiceRouter.put('/laundry-kiosk/bags/:id/status', requireAvsKiosk, (req, res) => {
  const { status } = req.body
  const ALLOWED = ['collected', 'washing', 'ready', 'delivered']
  if (!ALLOWED.includes(status)) return res.status(400).json({ error: 'Geçersiz durum (collected, washing, ready, delivered)' })
  try {
    updateItemStatusQuery(Number(req.params.id), status)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

selfServiceRouter.put('/laundry-kiosk/bags/:id/ironing', requireAvsKiosk, (req, res) => {
  const { needs_ironing } = req.body
  try {
    const db = getDB()
    db.prepare("UPDATE laundry_items SET needs_ironing=?, updated_at=datetime('now') WHERE id=?")
      .run(needs_ironing ? 1 : 0, Number(req.params.id))
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

selfServiceRouter.post('/laundry-kiosk/garment', requireAvsKiosk, (req, res) => {
  const { block, room_no, personnel_id, clothing_items, intake_signature } = req.body
  if (!block || !room_no) return res.status(400).json({ error: 'block ve room_no gerekli' })
  if (!Array.isArray(clothing_items) || clothing_items.length === 0)
    return res.status(400).json({ error: 'En az 1 kıyafet gerekli' })
  try {
    const db = getDB()
    const room = db.prepare('SELECT id FROM rooms WHERE block=? AND room_no=?').get(block, room_no)
    if (!room) return res.status(404).json({ error: 'Oda bulunamadı' })
    const intake_name = personnel_id
      ? db.prepare('SELECT full_name FROM personnel WHERE id=?').get(Number(personnel_id))?.full_name
      : null
    const total = clothing_items.reduce((s, c) => s + (Number(c.count) || 1), 0)
    const id = insertItemQuery({
      room_id: room.id,
      item_count: total,
      is_premium: 1,
      clothing_items: JSON.stringify(clothing_items),
      intake_name: intake_name || null,
      intake_signature: intake_signature || null,
      created_by: null,
    })
    res.status(201).json({ id })
  } catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

selfServiceRouter.get('/laundry-kiosk/machines', requireAvsKiosk, (req, res) => {
  try { res.json(listMachinesQuery()) }
  catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

selfServiceRouter.put('/laundry-kiosk/machines/:id/assign', requireAvsKiosk, (req, res) => {
  const { item_id } = req.body
  if (!item_id) return res.status(400).json({ error: 'item_id gerekli' })
  try {
    addToQueueQuery({ item_id: Number(item_id), machine_id: Number(req.params.id) })
    updateItemStatusQuery(Number(item_id), 'washing', { machine_id: Number(req.params.id) })
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})
```

- [ ] **Step 4: Testleri çalıştır — PASS olmalı**

```bash
cd backend && npx vitest run src/modules/self-service/self-service.test.js
```

Beklenen: tüm testler PASS

- [ ] **Step 5: Tüm testler**

```bash
cd backend && npx vitest run
```

Beklenen: tüm testler PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/self-service/routes.js backend/src/modules/self-service/self-service.test.js
git commit -m "feat: faz4 laundry kiosk backend — 9 endpoint (bag, status, garment, machine, blocks)"
```

---

## Task 5: Check-in Placeholder Batch

**Files:**
- Modify: `backend/src/modules/checkin/queries.js`
- Modify: `backend/src/modules/checkin/routes.js`
- Modify: `backend/src/modules/checkin/checkin.test.js`

- [ ] **Step 1: Test yaz**

`backend/src/modules/checkin/checkin.test.js` dosyasının sonuna ekle:

```js
describe('Placeholder batch', () => {
  it('POST /checkin/placeholder-batch oda bulunamadıysa hata', async () => {
    const res = await request(app)
      .post('/api/checkin/placeholder-batch')
      .set('Authorization', `Bearer ${token}`)
      .send({ room_id: 99999, count: 2 })
    expect(res.status).toBe(400)
  })

  it('POST /checkin/placeholder-batch geçerli oda ile çalışır', async () => {
    // Seed'den gelen ilk odayı bul
    const rooms = await request(app)
      .get('/api/checkin/available-rooms')
      .set('Authorization', `Bearer ${token}`)
    const firstRoom = rooms.body[0]
    if (!firstRoom) return // seed'de oda yoksa test atlanır

    const res = await request(app)
      .post('/api/checkin/placeholder-batch')
      .set('Authorization', `Bearer ${token}`)
      .send({ room_id: firstRoom.room_id, count: 1 })
    expect(res.status).toBe(201)
    expect(Array.isArray(res.body.ids)).toBe(true)
    expect(res.body.ids).toHaveLength(1)
  })

  it('POST /checkin/placeholder-batch count 0 reddedilir', async () => {
    const res = await request(app)
      .post('/api/checkin/placeholder-batch')
      .set('Authorization', `Bearer ${token}`)
      .send({ room_id: 1, count: 0 })
    expect(res.status).toBe(400)
  })

  it('yetkisiz kullanıcı 403 alır', async () => {
    const laundryToken = (await request(app).post('/api/auth/login').send({ username: 'camasir', password: 'admin123' })).body.token
    const res = await request(app)
      .post('/api/checkin/placeholder-batch')
      .set('Authorization', `Bearer ${laundryToken}`)
      .send({ room_id: 1, count: 1 })
    expect(res.status).toBe(403)
  })
})
```

- [ ] **Step 2: checkin/queries.js'e fonksiyon ekle**

`backend/src/modules/checkin/queries.js` dosyasının sonuna ekle:

```js
export function insertPlaceholderBatch(roomId, count, assignedBy) {
  const db = getDB()
  const room = db.prepare('SELECT * FROM rooms WHERE id=?').get(roomId)
  if (!room) throw new Error('Oda bulunamadı')
  const current = db.prepare('SELECT COUNT(*) as c FROM room_assignments WHERE room_id=? AND check_out_at IS NULL').get(roomId)
  const available = room.active_beds - current.c
  if (count > available) throw new Error(`Sadece ${available} yatak müsait`)
  const ids = []
  for (let i = 0; i < count; i++) {
    const r = db.prepare(`
      INSERT INTO personnel(full_name, is_placeholder, check_in_date)
      VALUES('Anonim', 1, datetime('now'))
    `).run()
    const bedNo = current.c + i + 1
    db.prepare(`
      INSERT INTO room_assignments(personnel_id, room_id, bed_no, assigned_by)
      VALUES(?,?,?,?)
    `).run(r.lastInsertRowid, roomId, bedNo, assignedBy || null)
    ids.push(r.lastInsertRowid)
  }
  return ids
}
```

- [ ] **Step 3: checkin/routes.js'e endpoint ekle**

`backend/src/modules/checkin/routes.js` dosyasındaki import satırına `insertPlaceholderBatch` ekle:

```js
import { ..., insertPlaceholderBatch } from './queries.js'
```

(Mevcut import'a sadece `, insertPlaceholderBatch` ekle — tüm import satırını görmek için dosyayı oku)

Sonrasında, dosyanın son endpoint'inden sonra:

```js
checkinRouter.post('/placeholder-batch', ...allowed, (req, res) => {
  const { room_id, count } = req.body
  if (!room_id || !count || count < 1 || count > 10)
    return res.status(400).json({ error: 'room_id ve count (1-10) gerekli' })
  try {
    const ids = insertPlaceholderBatch(Number(room_id), Number(count), req.user.id)
    res.status(201).json({ ids })
  } catch (e) { res.status(400).json({ error: e.message }) }
})
```

- [ ] **Step 4: Testleri çalıştır — PASS olmalı**

```bash
cd backend && npx vitest run src/modules/checkin/checkin.test.js
```

Beklenen: tüm testler PASS

- [ ] **Step 5: Tüm testler**

```bash
cd backend && npx vitest run
```

Beklenen: tüm testler PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/checkin/queries.js backend/src/modules/checkin/routes.js backend/src/modules/checkin/checkin.test.js
git commit -m "feat: faz5 checkin placeholder-batch — hızlı anonim oda doluluk girişi"
```

---

## Task 6: AVS Workers Admin Sayfası (Frontend)

**Files:**
- Create: `frontend/src/modules/admin/AvsWorkersPage.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/shared/components/Sidebar.jsx`

- [ ] **Step 1: AvsWorkersPage.jsx oluştur**

`frontend/src/modules/admin/AvsWorkersPage.jsx`:

```jsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'

export default function AvsWorkersPage() {
  const qc = useQueryClient()
  const [selected, setSelected] = useState(null)
  const [editForm, setEditForm] = useState({ full_name: '', role_label: '' })
  const [pinInput, setPinInput] = useState('')
  const [showPinField, setShowPinField] = useState(false)
  const [addForm, setAddForm] = useState({ full_name: '', role_label: '' })
  const [showAdd, setShowAdd] = useState(false)
  const [toast, setToast] = useState(null)

  const { data: workers = [], isLoading } = useQuery({
    queryKey: ['avs-workers'],
    queryFn: () => api.get('/avs-workers').then(r => r.data),
  })

  const save = useMutation({
    mutationFn: ({ id, body }) => api.put(`/avs-workers/${id}`, body),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['avs-workers'] })
      showToast('Kaydedildi', 'success')
      const updated = { ...selected, ...editForm }
      setSelected(updated)
    },
    onError: e => showToast(e.response?.data?.error ?? 'Hata', 'error'),
  })

  const setPin = useMutation({
    mutationFn: ({ id, pin }) => api.put(`/avs-workers/${id}/pin`, { new_pin: pin }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['avs-workers'] }); showToast('PIN güncellendi', 'success'); setPinInput(''); setShowPinField(false) },
    onError: e => showToast(e.response?.data?.error ?? 'Hata', 'error'),
  })

  const toggle = useMutation({
    mutationFn: id => api.put(`/avs-workers/${id}/toggle`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['avs-workers'] }); showToast('Durum güncellendi', 'success') },
    onError: e => showToast(e.response?.data?.error ?? 'Hata', 'error'),
  })

  const add = useMutation({
    mutationFn: body => api.post('/avs-workers', body),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['avs-workers'] })
      showToast('Çalışan eklendi', 'success')
      setShowAdd(false)
      setAddForm({ full_name: '', role_label: '' })
      setSelected(res.data)
      setEditForm({ full_name: res.data.full_name, role_label: res.data.role_label || '' })
    },
    onError: e => showToast(e.response?.data?.error ?? 'Hata', 'error'),
  })

  function showToast(msg, type) { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  function selectWorker(w) {
    setSelected(w)
    setEditForm({ full_name: w.full_name, role_label: w.role_label || '' })
    setShowPinField(false)
    setPinInput('')
    setShowAdd(false)
  }

  if (isLoading) return <div style={{ padding: '32px' }}>Yükleniyor...</div>

  return (
    <div style={{ padding: '24px', display: 'flex', gap: '24px', height: 'calc(100vh - 60px)', overflow: 'hidden' }}>
      {/* Sol — Liste */}
      <div style={{ width: '260px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
        <h2 style={{ fontSize: '20px', letterSpacing: '3px', marginBottom: '4px' }}>AVS ÇALIŞANLARI</h2>
        <p style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginBottom: '8px', letterSpacing: '2px' }}>
          KİOSK ERİŞİM LİSTESİ
        </p>

        {workers.map(w => (
          <div key={w.id} onClick={() => selectWorker(w)}
            style={{
              padding: '12px 14px', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.15s',
              background: selected?.id === w.id ? 'rgba(var(--accent-rgb, 240,165,0),.15)' : 'var(--surface)',
              border: `1px solid ${selected?.id === w.id ? 'var(--accent)' : 'var(--border)'}`,
            }}>
            <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text)', marginBottom: '2px' }}>{w.full_name}</div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {w.role_label && <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>{w.role_label}</span>}
              <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: w.is_active ? '#22c55e' : '#ef4444' }}>
                {w.is_active ? '● Aktif' : '● Pasif'}
              </span>
            </div>
          </div>
        ))}

        {!showAdd && (
          <button onClick={() => { setShowAdd(true); setSelected(null) }}
            style={{ marginTop: '8px', padding: '10px', borderRadius: '8px', border: '1px dashed var(--border)',
              background: 'transparent', color: 'var(--text3)', cursor: 'pointer', fontSize: '13px' }}>
            + Yeni Çalışan Ekle
          </button>
        )}

        {showAdd && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: '8px', padding: '12px' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginBottom: '8px' }}>YENİ ÇALIŞAN</div>
            <input className="form-input" placeholder="Ad Soyad" value={addForm.full_name}
              onChange={e => setAddForm(f => ({ ...f, full_name: e.target.value }))}
              style={{ marginBottom: '6px' }} />
            <input className="form-input" placeholder="Rol (ör. Çamaşırhane)" value={addForm.role_label}
              onChange={e => setAddForm(f => ({ ...f, role_label: e.target.value }))}
              style={{ marginBottom: '8px' }} />
            <div style={{ display: 'flex', gap: '6px' }}>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', fontSize: '12px' }}
                disabled={add.isPending || addForm.full_name.trim().length < 2}
                onClick={() => add.mutate({ full_name: addForm.full_name.trim(), role_label: addForm.role_label.trim() || null })}>
                {add.isPending ? 'Ekleniyor...' : 'Ekle'}
              </button>
              <button className="btn btn-ghost" style={{ fontSize: '12px' }} onClick={() => setShowAdd(false)}>İptal</button>
            </div>
          </div>
        )}
      </div>

      {/* Sağ — Detay Paneli */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {toast && (
          <div style={{ padding: '10px 16px', marginBottom: '16px', borderRadius: '6px',
            background: toast.type === 'success' ? '#dcfce7' : '#fee2e2',
            color: toast.type === 'success' ? '#166534' : '#991b1b',
            border: `1px solid ${toast.type === 'success' ? '#86efac' : '#fca5a5'}` }}>
            {toast.msg}
          </div>
        )}

        {!selected && (
          <div style={{ color: 'var(--text3)', padding: '40px', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: '12px' }}>
            Sol listeden bir çalışan seçin
          </div>
        )}

        {selected && (
          <div className="panel">
            <div style={{ height: '2px', background: 'var(--accent)' }} />
            <div className="panel-header">
              <div>
                <div className="panel-title">{selected.full_name}</div>
                <div className="panel-subtitle">
                  {selected.role_label || 'Rol belirtilmemiş'} ·
                  <span style={{ color: selected.is_active ? '#22c55e' : '#ef4444', marginLeft: '6px' }}>
                    {selected.is_active ? 'Aktif' : 'Pasif'}
                  </span>
                </div>
              </div>
            </div>
            <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Düzenleme */}
              <div>
                <label className="form-label">AD SOYAD</label>
                <input className="form-input" value={editForm.full_name}
                  onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">ROL ETİKETİ</label>
                <input className="form-input" placeholder="ör. Çamaşırhane, Ütü" value={editForm.role_label}
                  onChange={e => setEditForm(f => ({ ...f, role_label: e.target.value }))} />
              </div>
              <button className="btn btn-primary"
                disabled={save.isPending || editForm.full_name.trim().length < 2}
                onClick={() => save.mutate({ id: selected.id, body: { full_name: editForm.full_name.trim(), role_label: editForm.role_label.trim() || null } })}>
                {save.isPending ? 'Kaydediliyor...' : 'Kaydet'}
              </button>

              <hr style={{ border: 'none', borderTop: '1px solid var(--border)' }} />

              {/* PIN */}
              <div>
                <label className="form-label">KİOSK PIN {selected.has_pin ? '(✓ Tanımlı)' : '(Tanımlı Değil)'}</label>
                {!showPinField ? (
                  <button className="btn btn-secondary" onClick={() => setShowPinField(true)}>
                    {selected.has_pin ? 'PIN Sıfırla' : 'PIN Ata'}
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input type="password" inputMode="numeric" maxLength={4} className="form-input"
                      placeholder="4 haneli PIN" value={pinInput}
                      onChange={e => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      style={{ maxWidth: '140px', textAlign: 'center', letterSpacing: '6px', fontSize: '18px' }} />
                    <button className="btn btn-primary"
                      disabled={pinInput.length !== 4 || setPin.isPending}
                      onClick={() => setPin.mutate({ id: selected.id, pin: pinInput })}>
                      {setPin.isPending ? '...' : 'Onayla'}
                    </button>
                    <button className="btn btn-ghost" onClick={() => { setShowPinField(false); setPinInput('') }}>İptal</button>
                  </div>
                )}
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid var(--border)' }} />

              {/* Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button className="btn btn-ghost"
                  style={{ borderColor: selected.is_active ? '#ef4444' : '#22c55e', color: selected.is_active ? '#ef4444' : '#22c55e' }}
                  disabled={toggle.isPending}
                  onClick={() => toggle.mutate(selected.id)}>
                  {toggle.isPending ? '...' : selected.is_active ? 'Pasif Et' : 'Aktif Et'}
                </button>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>
                  Eklenme: {new Date(selected.created_at).toLocaleDateString('tr-TR')}
                </span>
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: App.jsx'e route ekle**

`frontend/src/App.jsx` dosyasında:

`const KioskPinPage = lazy(...)` satırından sonra ekle:

```js
const AvsWorkersPage = lazy(() => import('./modules/admin/AvsWorkersPage.jsx'))
```

`<Route path="announcements" ...` satırından sonra ekle:

```jsx
<Route path="avs-workers" element={<RoleRoute roles={['campus_manager']}><AvsWorkersPage /></RoleRoute>} />
```

- [ ] **Step 3: Sidebar'a link ekle**

`frontend/src/shared/components/Sidebar.jsx` dosyasında `{ to: '/announcements', ... }` satırından sonra ekle:

```js
{ to: '/avs-workers', icon: '👷', label: 'AVS Çalışanları', roles: ['campus_manager'] },
```

- [ ] **Step 4: Dev server'da kontrol et**

http://localhost:5174 → Admin → AVS Çalışanları

Kontrol:
- Sol listede çalışan yok (başlangıç boş)
- "Yeni Çalışan Ekle" ile ekleme çalışıyor
- Eklenen kişi listede görünüyor, seçince sağ panel açılıyor
- PIN ata çalışıyor
- Pasif et çalışıyor

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/admin/AvsWorkersPage.jsx frontend/src/App.jsx frontend/src/shared/components/Sidebar.jsx
git commit -m "feat: faz6 AVS çalışanları admin sayfası"
```

---

## Task 7: Çamaşırhane Kiosk Frontend

**Files:**
- Create: `frontend/src/modules/laundry-kiosk/LaundryKioskPage.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: LaundryKioskPage.jsx oluştur**

`frontend/src/modules/laundry-kiosk/LaundryKioskPage.jsx`:

```jsx
import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import SignatureCanvas from 'react-signature-canvas'

const GARMENT_TYPES = ['Gömlek', 'Pantolon', 'Tişört', 'Kazak', 'Mont', 'Takım Elbise', 'Diğer']

export default function LaundryKioskPage() {
  const [avsToken, setAvsToken] = useState(null)
  const [workerInfo, setWorkerInfo] = useState(null)
  const [loginError, setLoginError] = useState('')
  const [nameQuery, setNameQuery] = useState('')
  const [nameResults, setNameResults] = useState([])
  const [selectedWorker, setSelectedWorker] = useState(null)
  const [pinInput, setPinInput] = useState('')
  const [activeAction, setActiveAction] = useState(null) // null | 'bag' | 'ready' | 'garment' | 'deliver' | 'iron' | 'machine'
  const searchRef = useRef(null)

  const kioskApi = {
    get: url => api.get(url, { headers: { Authorization: `Bearer ${avsToken}` } }),
    post: (url, data) => api.post(url, data, { headers: { Authorization: `Bearer ${avsToken}` } }),
    put: (url, data) => api.put(url, data, { headers: { Authorization: `Bearer ${avsToken}` } }),
  }

  const handleNameSearch = async val => {
    setNameQuery(val)
    setSelectedWorker(null)
    clearTimeout(searchRef.current)
    if (val.length < 2) { setNameResults([]); return }
    searchRef.current = setTimeout(async () => {
      try {
        const res = await api.get(`/auth/avs-search?q=${encodeURIComponent(val)}`)
        setNameResults(res.data)
      } catch { setNameResults([]) }
    }, 300)
  }

  const handleLogin = async e => {
    e.preventDefault(); setLoginError('')
    if (!selectedWorker) return setLoginError('Listeden bir kişi seçin')
    try {
      const res = await api.post('/auth/avs-login', { worker_id: selectedWorker.id, pin: pinInput })
      setAvsToken(res.data.token)
      setWorkerInfo(res.data.worker)
    } catch (err) { setLoginError(err.response?.data?.error || 'Giriş başarısız') }
  }

  // ─── Login Ekranı ───────────────────────────────────────────────────────────
  if (!avsToken) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="text-5xl mb-4">🧺</div>
            <h1 className="text-2xl font-bold text-slate-100">Çamaşırhane</h1>
            <p className="text-slate-500 text-sm mt-1">AVS Personel Girişi</p>
          </div>
          <form onSubmit={handleLogin} className="bg-slate-900 rounded-2xl p-6 space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-2">İsimle Ara</label>
              <input type="text" value={nameQuery} onChange={e => handleNameSearch(e.target.value)}
                placeholder="En az 2 karakter..."
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:border-blue-500"
                autoFocus />
            </div>
            {nameResults.length > 0 && !selectedWorker && (
              <div className="bg-slate-800 rounded-xl overflow-hidden">
                {nameResults.map(w => (
                  <button key={w.id} type="button"
                    onClick={() => { setSelectedWorker(w); setNameResults([]) }}
                    disabled={!w.has_pin}
                    className={`w-full text-left px-4 py-3 hover:bg-slate-700 border-b border-slate-700 last:border-0 transition-colors ${!w.has_pin ? 'opacity-40 cursor-not-allowed' : ''}`}>
                    <div className="text-sm text-slate-200 font-medium">{w.full_name}</div>
                    <div className="text-xs text-slate-500">{w.role_label || '—'}{!w.has_pin ? ' · PIN tanımlı değil' : ''}</div>
                  </button>
                ))}
              </div>
            )}
            {selectedWorker && (
              <div className="flex items-center justify-between bg-slate-800 rounded-xl px-4 py-3">
                <div>
                  <div className="text-sm text-slate-200 font-medium">{selectedWorker.full_name}</div>
                  <div className="text-xs text-slate-500">{selectedWorker.role_label || '—'}</div>
                </div>
                <button type="button" onClick={() => { setSelectedWorker(null); setNameQuery(''); setPinInput('') }}
                  className="text-xs text-slate-500 hover:text-slate-300">Değiştir</button>
              </div>
            )}
            {selectedWorker && (
              <div>
                <label className="block text-sm text-slate-400 mb-2">PIN (4 hane)</label>
                <input type="password" inputMode="numeric" maxLength={4} value={pinInput}
                  onChange={e => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 text-center text-2xl tracking-widest focus:outline-none focus:border-amber-500"
                  placeholder="····" autoFocus />
              </div>
            )}
            {loginError && <div className="text-red-400 text-sm text-center">{loginError}</div>}
            <button type="submit" disabled={!selectedWorker || pinInput.length !== 4}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-xl py-3 font-medium transition-colors">
              Giriş Yap
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ─── Ana Ekran / Aksiyon Ekranı ────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col max-w-lg mx-auto p-4">
      <div className="flex items-center justify-between py-4 mb-4">
        <div>
          <div className="font-semibold text-slate-100">{workerInfo?.full_name}</div>
          {workerInfo?.role_label && <div className="text-xs text-slate-500">{workerInfo.role_label}</div>}
        </div>
        <div className="flex gap-2">
          {activeAction && (
            <button onClick={() => setActiveAction(null)}
              className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1 bg-slate-800 rounded-lg">
              ← Geri
            </button>
          )}
          <button onClick={() => { setAvsToken(null); setWorkerInfo(null); setActiveAction(null) }}
            className="text-xs text-slate-500 hover:text-slate-300 px-3 py-1 bg-slate-800 rounded-lg">
            Çıkış
          </button>
        </div>
      </div>

      {!activeAction && (
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: 'bag',     icon: '🧺', label: 'Torba Al',        color: 'bg-blue-800 hover:bg-blue-700' },
            { key: 'ready',   icon: '✅', label: 'Hazır İşaretle',   color: 'bg-emerald-800 hover:bg-emerald-700' },
            { key: 'garment', icon: '👔', label: 'Kıyafet Gir',      color: 'bg-purple-800 hover:bg-purple-700' },
            { key: 'deliver', icon: '🚚', label: 'Teslim Et',         color: 'bg-amber-800 hover:bg-amber-700' },
            { key: 'iron',    icon: '🔥', label: 'Ütü',               color: 'bg-cyan-800 hover:bg-cyan-700' },
            { key: 'machine', icon: '⚙️', label: 'Makine',            color: 'bg-slate-700 hover:bg-slate-600' },
          ].map(a => (
            <button key={a.key} onClick={() => setActiveAction(a.key)}
              className={`${a.color} text-white rounded-2xl p-6 flex flex-col items-center gap-2 transition-colors`}>
              <span className="text-4xl">{a.icon}</span>
              <span className="text-sm font-semibold">{a.label}</span>
            </button>
          ))}
        </div>
      )}

      {activeAction === 'bag'     && <BagForm kioskApi={kioskApi} onDone={() => setActiveAction(null)} />}
      {activeAction === 'ready'   && <StatusUpdateView kioskApi={kioskApi} targetStatus="ready"     label="Hazır İşaretle" onDone={() => setActiveAction(null)} />}
      {activeAction === 'deliver' && <DeliverView kioskApi={kioskApi} onDone={() => setActiveAction(null)} />}
      {activeAction === 'garment' && <GarmentForm kioskApi={kioskApi} onDone={() => setActiveAction(null)} />}
      {activeAction === 'iron'    && <IronView kioskApi={kioskApi} onDone={() => setActiveAction(null)} />}
      {activeAction === 'machine' && <MachineView kioskApi={kioskApi} onDone={() => setActiveAction(null)} />}
    </div>
  )
}

// ── Shared: Blok + Oda seçici ─────────────────────────────────────────────────
function RoomSelector({ kioskApi, onRoomSelect }) {
  const [block, setBlock] = useState('')
  const [roomNo, setRoomNo] = useState('')
  const [persons, setPersons] = useState([])

  const { data: blocks = [] } = useQuery({
    queryKey: ['kiosk-blocks'],
    queryFn: () => api.get('/self-service/laundry-kiosk/blocks').then(r => r.data),
    staleTime: 60000,
  })

  useEffect(() => {
    if (block && roomNo.length >= 1) {
      kioskApi.get(`/self-service/laundry-kiosk/room-persons?block=${block}&room_no=${roomNo}`)
        .then(r => setPersons(r.data))
        .catch(() => setPersons([]))
    }
  }, [block, roomNo])

  useEffect(() => {
    if (block) onRoomSelect({ block, room_no: roomNo, persons })
  }, [block, roomNo, persons])

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-slate-400 mb-2">BLOK</label>
        <div className="flex gap-2 flex-wrap">
          {blocks.map(b => (
            <button key={b} type="button" onClick={() => setBlock(b)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${block === b ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
              {b}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-2">ODA NO</label>
        <input type="text" inputMode="numeric" value={roomNo} onChange={e => setRoomNo(e.target.value)}
          placeholder="ör. 205"
          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:border-blue-500" />
      </div>
      {persons.length > 0 && (
        <div className="text-xs text-slate-500">{persons.length} kişi bulundu</div>
      )}
    </div>
  )
}

// ── Torba Al ──────────────────────────────────────────────────────────────────
function BagForm({ kioskApi, onDone }) {
  const sigRef = useRef(null)
  const [block, setBlock] = useState('')
  const [roomNo, setRoomNo] = useState('')
  const [persons, setPersons] = useState([])
  const [selectedPerson, setSelectedPerson] = useState(null)
  const [itemCount, setItemCount] = useState(1)
  const [isPremium, setIsPremium] = useState(false)
  const [garmentItems, setGarmentItems] = useState([{ type: 'Gömlek', count: 1 }])
  const [notes, setNotes] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const { data: blocks = [] } = useQuery({
    queryKey: ['kiosk-blocks'],
    queryFn: () => api.get('/self-service/laundry-kiosk/blocks').then(r => r.data),
    staleTime: 60000,
  })

  useEffect(() => {
    if (block && roomNo) {
      kioskApi.get(`/self-service/laundry-kiosk/room-persons?block=${block}&room_no=${roomNo}`)
        .then(r => { setPersons(r.data); setSelectedPerson(null) })
        .catch(() => setPersons([]))
    }
  }, [block, roomNo])

  async function handleSubmit() {
    setError('')
    if (!block || !roomNo) return setError('Blok ve oda no gerekli')
    const sig = sigRef.current?.isEmpty() ? null : sigRef.current?.toDataURL()
    try {
      await kioskApi.post('/self-service/laundry-kiosk/bag', {
        block, room_no: roomNo,
        personnel_id: selectedPerson?.id || null,
        item_count: itemCount,
        is_premium: isPremium,
        clothing_items: isPremium ? garmentItems : null,
        notes: notes || null,
        urgent,
        intake_signature: sig,
      })
      setSuccess(true)
    } catch (e) { setError(e.response?.data?.error || 'Hata oluştu') }
  }

  if (success) return (
    <div className="text-center py-12">
      <div className="text-5xl mb-4">✅</div>
      <div className="text-green-400 font-medium text-lg">Torba kaydedildi!</div>
      <button onClick={onDone} className="mt-6 text-blue-400 text-sm">Ana Ekrana Dön</button>
    </div>
  )

  return (
    <div className="bg-slate-900 rounded-2xl p-5 space-y-4">
      <h2 className="font-semibold text-slate-300 text-lg">🧺 Torba Al</h2>

      {/* Blok */}
      <div>
        <label className="block text-xs text-slate-400 mb-2">BLOK</label>
        <div className="flex gap-2 flex-wrap">
          {blocks.map(b => (
            <button key={b} type="button" onClick={() => setBlock(b)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${block === b ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
              {b}
            </button>
          ))}
        </div>
      </div>

      {/* Oda No */}
      <div>
        <label className="block text-xs text-slate-400 mb-2">ODA NO</label>
        <input type="text" inputMode="numeric" value={roomNo} onChange={e => setRoomNo(e.target.value)}
          placeholder="ör. 205"
          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:border-blue-500" />
      </div>

      {/* Kişi */}
      {persons.length > 0 && (
        <div>
          <label className="block text-xs text-slate-400 mb-2">KİŞİ (opsiyonel)</label>
          <div className="space-y-1">
            <button type="button" onClick={() => setSelectedPerson(null)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${!selectedPerson ? 'bg-slate-700 text-slate-200' : 'bg-slate-800 text-slate-400'}`}>
              Kişisiz
            </button>
            {persons.map(p => (
              <button key={p.id} type="button" onClick={() => setSelectedPerson(p)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${selectedPerson?.id === p.id ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
                {p.full_name} {p.company ? `· ${p.company}` : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Adet */}
      <div>
        <label className="block text-xs text-slate-400 mb-2">ADET</label>
        <div className="flex gap-2">
          {[1,2,3,4,5,6,7,8].map(n => (
            <button key={n} type="button" onClick={() => setItemCount(n)}
              className={`w-10 h-10 rounded-xl text-sm font-bold transition-colors ${itemCount === n ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Premium toggle */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setIsPremium(v => !v)}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${isPremium ? 'bg-purple-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
          👔 Premium Kıyafet
        </button>
        {isPremium && <span className="text-xs text-purple-400">Kıyafet detayı gerekli</span>}
      </div>

      {/* Premium kıyafet detayları */}
      {isPremium && (
        <div className="space-y-2">
          {garmentItems.map((g, i) => (
            <div key={i} className="flex gap-2">
              <select value={g.type} onChange={e => setGarmentItems(items => items.map((it, idx) => idx === i ? { ...it, type: e.target.value } : it))}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100">
                {GARMENT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
              <input type="number" min={1} max={20} value={g.count}
                onChange={e => setGarmentItems(items => items.map((it, idx) => idx === i ? { ...it, count: Number(e.target.value) } : it))}
                className="w-16 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 text-center" />
              {garmentItems.length > 1 && (
                <button type="button" onClick={() => setGarmentItems(items => items.filter((_, idx) => idx !== i))}
                  className="text-red-400 px-2">✕</button>
              )}
            </div>
          ))}
          <button type="button" onClick={() => setGarmentItems(items => [...items, { type: 'Gömlek', count: 1 }])}
            className="text-xs text-blue-400">+ Kıyafet Ekle</button>
        </div>
      )}

      {/* Not + Acil */}
      <div>
        <label className="block text-xs text-slate-400 mb-2">NOT (opsiyonel)</label>
        <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Özel not..."
          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500" />
      </div>
      <label className="flex items-center gap-3 cursor-pointer">
        <input type="checkbox" checked={urgent} onChange={e => setUrgent(e.target.checked)} className="w-4 h-4 accent-amber-500" />
        <span className="text-sm text-amber-400 font-medium">⚡ Acil</span>
      </label>

      {/* İmza */}
      <div>
        <label className="block text-xs text-slate-400 mb-2">İMZA</label>
        <div className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700">
          <SignatureCanvas ref={sigRef} penColor="#e2e8f0" canvasProps={{ width: 400, height: 140, className: 'w-full' }} />
        </div>
        <button type="button" onClick={() => sigRef.current?.clear()} className="mt-1 text-xs text-slate-500">Temizle</button>
      </div>

      {error && <div className="text-red-400 text-sm">{error}</div>}
      <button onClick={handleSubmit}
        className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-xl py-3 font-medium">
        Kaydet
      </button>
    </div>
  )
}

// ── Hazır İşaretle / Genel Durum Güncelle ─────────────────────────────────────
function StatusUpdateView({ kioskApi, targetStatus, label, onDone }) {
  const [block, setBlock] = useState('')
  const [roomNo, setRoomNo] = useState('')
  const [bags, setBags] = useState([])
  const [success, setSuccess] = useState(false)

  const { data: blocks = [] } = useQuery({
    queryKey: ['kiosk-blocks'],
    queryFn: () => api.get('/self-service/laundry-kiosk/blocks').then(r => r.data),
    staleTime: 60000,
  })

  async function search() {
    if (!block) return
    const params = new URLSearchParams({ block })
    if (roomNo) params.set('room_no', roomNo)
    const res = await kioskApi.get(`/self-service/laundry-kiosk/bags?${params}`)
    setBags(res.data)
  }

  async function update(id) {
    await kioskApi.put(`/self-service/laundry-kiosk/bags/${id}/status`, { status: targetStatus })
    setBags(bags => bags.filter(b => b.id !== id))
    setSuccess(true); setTimeout(() => setSuccess(false), 2000)
  }

  const STATUS_LABEL = { collected: 'Toplandı', washing: 'Yıkanıyor', ready: 'Hazır', delivered: 'Teslim Edildi' }

  return (
    <div className="bg-slate-900 rounded-2xl p-5 space-y-4">
      <h2 className="font-semibold text-slate-300 text-lg">{label}</h2>
      {success && <div className="text-green-400 text-sm">✓ Güncellendi</div>}
      <div>
        <label className="block text-xs text-slate-400 mb-2">BLOK</label>
        <div className="flex gap-2 flex-wrap">
          {blocks.map(b => (
            <button key={b} type="button" onClick={() => setBlock(b)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${block === b ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
              {b}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <input value={roomNo} onChange={e => setRoomNo(e.target.value)} placeholder="Oda (opsiyonel)"
          className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500" />
        <button onClick={search} className="bg-blue-700 text-white px-4 rounded-xl text-sm">Ara</button>
      </div>
      {bags.length === 0 && <div className="text-slate-500 text-sm">Torba bulunamadı</div>}
      {bags.map(b => (
        <div key={b.id} className="bg-slate-800 rounded-xl p-3 flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-200 font-medium">{b.block} — {b.room_no}</div>
            <div className="text-xs text-slate-500">
              {b.item_count} torba · {STATUS_LABEL[b.status] || b.status}
              {b.urgent ? ' · ⚡ Acil' : ''}
              {b.intake_name ? ` · ${b.intake_name}` : ''}
            </div>
          </div>
          <button onClick={() => update(b.id)}
            className="bg-emerald-700 text-white px-3 py-1 rounded-lg text-xs font-medium">
            {label}
          </button>
        </div>
      ))}
    </div>
  )
}

// ── Teslim Et ─────────────────────────────────────────────────────────────────
function DeliverView({ kioskApi, onDone }) {
  const sigRef = useRef(null)
  const [bags, setBags] = useState([])
  const [block, setBlock] = useState('')
  const [selectedBag, setSelectedBag] = useState(null)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const { data: blocks = [] } = useQuery({
    queryKey: ['kiosk-blocks'],
    queryFn: () => api.get('/self-service/laundry-kiosk/blocks').then(r => r.data),
    staleTime: 60000,
  })

  async function searchReady() {
    const res = await kioskApi.get(`/self-service/laundry-kiosk/bags?status=ready${block ? `&block=${block}` : ''}`)
    setBags(res.data)
  }

  async function deliver() {
    if (!selectedBag) return
    setError('')
    const sig = sigRef.current?.isEmpty() ? null : sigRef.current?.toDataURL()
    try {
      await kioskApi.put(`/self-service/laundry-kiosk/bags/${selectedBag.id}/status`, { status: 'delivered' })
      setSuccess(true); setSelectedBag(null); setBags(bags => bags.filter(b => b.id !== selectedBag.id))
      setTimeout(() => setSuccess(false), 2000)
    } catch (e) { setError(e.response?.data?.error || 'Hata') }
  }

  return (
    <div className="bg-slate-900 rounded-2xl p-5 space-y-4">
      <h2 className="font-semibold text-slate-300 text-lg">🚚 Teslim Et</h2>
      {success && <div className="text-green-400 text-sm">✓ Teslim edildi</div>}
      <div>
        <label className="block text-xs text-slate-400 mb-2">BLOK (opsiyonel)</label>
        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={() => setBlock('')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors ${!block ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
            Tümü
          </button>
          {blocks.map(b => (
            <button key={b} type="button" onClick={() => setBlock(b)}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors ${block === b ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
              {b}
            </button>
          ))}
        </div>
      </div>
      <button onClick={searchReady} className="w-full bg-slate-700 text-slate-200 rounded-xl py-2 text-sm">Hazır Torbaları Getir</button>
      {bags.map(b => (
        <div key={b.id} onClick={() => setSelectedBag(b)}
          className={`bg-slate-800 rounded-xl p-3 cursor-pointer border transition-colors ${selectedBag?.id === b.id ? 'border-blue-500' : 'border-transparent'}`}>
          <div className="text-sm text-slate-200 font-medium">{b.block} — {b.room_no}</div>
          <div className="text-xs text-slate-500">{b.item_count} torba{b.intake_name ? ` · ${b.intake_name}` : ''}</div>
        </div>
      ))}
      {selectedBag && (
        <>
          <div>
            <label className="block text-xs text-slate-400 mb-2">TESLİM İMZASI</label>
            <div className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700">
              <SignatureCanvas ref={sigRef} penColor="#e2e8f0" canvasProps={{ width: 400, height: 140, className: 'w-full' }} />
            </div>
            <button type="button" onClick={() => sigRef.current?.clear()} className="mt-1 text-xs text-slate-500">Temizle</button>
          </div>
          {error && <div className="text-red-400 text-sm">{error}</div>}
          <button onClick={deliver} className="w-full bg-amber-600 hover:bg-amber-500 text-white rounded-xl py-3 font-medium">
            Teslim Onayla
          </button>
        </>
      )}
    </div>
  )
}

// ── Kıyafet Gir ───────────────────────────────────────────────────────────────
function GarmentForm({ kioskApi, onDone }) {
  const sigRef = useRef(null)
  const [block, setBlock] = useState('')
  const [roomNo, setRoomNo] = useState('')
  const [persons, setPersons] = useState([])
  const [selectedPerson, setSelectedPerson] = useState(null)
  const [items, setItems] = useState([{ type: 'Gömlek', count: 1 }])
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const { data: blocks = [] } = useQuery({
    queryKey: ['kiosk-blocks'],
    queryFn: () => api.get('/self-service/laundry-kiosk/blocks').then(r => r.data),
    staleTime: 60000,
  })

  useEffect(() => {
    if (block && roomNo) {
      kioskApi.get(`/self-service/laundry-kiosk/room-persons?block=${block}&room_no=${roomNo}`)
        .then(r => { setPersons(r.data); setSelectedPerson(null) })
        .catch(() => setPersons([]))
    }
  }, [block, roomNo])

  async function submit() {
    setError('')
    if (!block || !roomNo) return setError('Blok ve oda no gerekli')
    const sig = sigRef.current?.isEmpty() ? null : sigRef.current?.toDataURL()
    try {
      await kioskApi.post('/self-service/laundry-kiosk/garment', {
        block, room_no: roomNo,
        personnel_id: selectedPerson?.id || null,
        clothing_items: items,
        intake_signature: sig,
      })
      setSuccess(true)
    } catch (e) { setError(e.response?.data?.error || 'Hata') }
  }

  if (success) return (
    <div className="text-center py-12">
      <div className="text-5xl mb-4">✅</div>
      <div className="text-green-400 font-medium text-lg">Kıyafetler kaydedildi!</div>
      <button onClick={onDone} className="mt-6 text-blue-400 text-sm">Ana Ekrana Dön</button>
    </div>
  )

  return (
    <div className="bg-slate-900 rounded-2xl p-5 space-y-4">
      <h2 className="font-semibold text-slate-300 text-lg">👔 Kıyafet Gir</h2>
      <div>
        <label className="block text-xs text-slate-400 mb-2">BLOK</label>
        <div className="flex gap-2 flex-wrap">
          {blocks.map(b => (
            <button key={b} type="button" onClick={() => setBlock(b)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${block === b ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
              {b}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-2">ODA NO</label>
        <input value={roomNo} onChange={e => setRoomNo(e.target.value)} placeholder="ör. 205"
          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:border-blue-500" />
      </div>
      {persons.length > 0 && (
        <div>
          <label className="block text-xs text-slate-400 mb-2">KİŞİ</label>
          <div className="space-y-1">
            {persons.map(p => (
              <button key={p.id} type="button" onClick={() => setSelectedPerson(p)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${selectedPerson?.id === p.id ? 'bg-purple-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
                {p.full_name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="space-y-2">
        <label className="block text-xs text-slate-400">KIYAFETler</label>
        {items.map((g, i) => (
          <div key={i} className="flex gap-2">
            <select value={g.type} onChange={e => setItems(its => its.map((it, idx) => idx === i ? { ...it, type: e.target.value } : it))}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100">
              {GARMENT_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
            <input type="number" min={1} max={20} value={g.count}
              onChange={e => setItems(its => its.map((it, idx) => idx === i ? { ...it, count: Number(e.target.value) } : it))}
              className="w-16 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 text-center" />
            {items.length > 1 && (
              <button type="button" onClick={() => setItems(its => its.filter((_, idx) => idx !== i))} className="text-red-400 px-2">✕</button>
            )}
          </div>
        ))}
        <button type="button" onClick={() => setItems(its => [...its, { type: 'Gömlek', count: 1 }])} className="text-xs text-blue-400">+ Ekle</button>
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-2">İMZA</label>
        <div className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700">
          <SignatureCanvas ref={sigRef} penColor="#e2e8f0" canvasProps={{ width: 400, height: 140, className: 'w-full' }} />
        </div>
        <button type="button" onClick={() => sigRef.current?.clear()} className="mt-1 text-xs text-slate-500">Temizle</button>
      </div>
      {error && <div className="text-red-400 text-sm">{error}</div>}
      <button onClick={submit} className="w-full bg-purple-700 hover:bg-purple-600 text-white rounded-xl py-3 font-medium">Kaydet</button>
    </div>
  )
}

// ── Ütü ───────────────────────────────────────────────────────────────────────
function IronView({ kioskApi, onDone }) {
  const [bags, setBags] = useState([])
  const [block, setBlock] = useState('')
  const [success, setSuccess] = useState(false)

  const { data: blocks = [] } = useQuery({
    queryKey: ['kiosk-blocks'],
    queryFn: () => api.get('/self-service/laundry-kiosk/blocks').then(r => r.data),
    staleTime: 60000,
  })

  async function search() {
    const res = await kioskApi.get(`/self-service/laundry-kiosk/bags${block ? `?block=${block}` : ''}`)
    setBags(res.data)
  }

  async function toggleIron(bag) {
    await kioskApi.put(`/self-service/laundry-kiosk/bags/${bag.id}/ironing`, { needs_ironing: !bag.needs_ironing })
    setBags(bags => bags.map(b => b.id === bag.id ? { ...b, needs_ironing: !bag.needs_ironing } : b))
    setSuccess(true); setTimeout(() => setSuccess(false), 2000)
  }

  return (
    <div className="bg-slate-900 rounded-2xl p-5 space-y-4">
      <h2 className="font-semibold text-slate-300 text-lg">🔥 Ütü</h2>
      {success && <div className="text-green-400 text-sm">✓ Güncellendi</div>}
      <div>
        <label className="block text-xs text-slate-400 mb-2">BLOK (opsiyonel)</label>
        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={() => setBlock('')}
            className={`px-3 py-2 rounded-xl text-xs font-bold ${!block ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'}`}>Tümü</button>
          {blocks.map(b => (
            <button key={b} type="button" onClick={() => setBlock(b)}
              className={`px-3 py-2 rounded-xl text-xs font-bold ${block === b ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'}`}>{b}</button>
          ))}
        </div>
      </div>
      <button onClick={search} className="w-full bg-slate-700 text-slate-200 rounded-xl py-2 text-sm">Torbaları Getir</button>
      {bags.map(b => (
        <div key={b.id} className="bg-slate-800 rounded-xl p-3 flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-200 font-medium">{b.block} — {b.room_no}</div>
            <div className="text-xs text-slate-500">{b.item_count} adet{b.intake_name ? ` · ${b.intake_name}` : ''}</div>
          </div>
          <button onClick={() => toggleIron(b)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${b.needs_ironing ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-400'}`}>
            {b.needs_ironing ? '🔥 Ütü Var' : 'Ütü Yok'}
          </button>
        </div>
      ))}
    </div>
  )
}

// ── Makine ───────────────────────────────────────────────────────────────────
function MachineView({ kioskApi, onDone }) {
  const [machines, setMachines] = useState([])
  const [bags, setBags] = useState([])
  const [selectedBag, setSelectedBag] = useState(null)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    kioskApi.get('/self-service/laundry-kiosk/machines').then(r => setMachines(r.data)).catch(() => {})
    kioskApi.get('/self-service/laundry-kiosk/bags?status=collected').then(r => setBags(r.data)).catch(() => {})
  }, [])

  async function assign(machineId) {
    if (!selectedBag) return setError('Önce bir torba seçin')
    setError('')
    try {
      await kioskApi.put(`/self-service/laundry-kiosk/machines/${machineId}/assign`, { item_id: selectedBag.id })
      setBags(bags => bags.filter(b => b.id !== selectedBag.id))
      setSelectedBag(null); setSuccess(true); setTimeout(() => setSuccess(false), 2000)
    } catch (e) { setError(e.response?.data?.error || 'Hata') }
  }

  return (
    <div className="bg-slate-900 rounded-2xl p-5 space-y-4">
      <h2 className="font-semibold text-slate-300 text-lg">⚙️ Makine</h2>
      {success && <div className="text-green-400 text-sm">✓ Makineye atandı</div>}
      {error && <div className="text-red-400 text-sm">{error}</div>}
      <div>
        <label className="block text-xs text-slate-400 mb-2">TORBA SEÇ (Toplandı durumundakiler)</label>
        {bags.length === 0 && <div className="text-slate-500 text-sm">Toplanmış torba yok</div>}
        {bags.map(b => (
          <button key={b.id} type="button" onClick={() => setSelectedBag(b)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm mb-1 transition-colors ${selectedBag?.id === b.id ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
            {b.block} — {b.room_no} · {b.item_count} adet{b.intake_name ? ` · ${b.intake_name}` : ''}
          </button>
        ))}
      </div>
      {selectedBag && (
        <div>
          <label className="block text-xs text-slate-400 mb-2">MAKİNE SEÇ</label>
          {machines.map(m => (
            <button key={m.id} type="button" onClick={() => assign(m.id)}
              className="w-full text-left px-3 py-2 rounded-lg text-sm mb-1 bg-slate-800 text-slate-300 hover:bg-cyan-800 hover:text-white transition-colors">
              {m.name} · {m.type === 'washer' ? '🫧 Çamaşır' : '💨 Kurutucu'} · {m.active_items || 0} aktif
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: react-signature-canvas paketini kontrol et / ekle**

```bash
cd "/c/Users/hrync/OneDrive/Masaüstü/test claude/frontend" && npm ls react-signature-canvas 2>/dev/null | head -3
```

Eğer yüklü değilse:

```bash
npm install react-signature-canvas
```

- [ ] **Step 3: App.jsx'e route ekle**

`frontend/src/App.jsx` dosyasında:

`const AnnouncementsPage = lazy(...)` satırından sonra ekle:

```js
const LaundryKioskPage = lazy(() => import('./modules/laundry-kiosk/LaundryKioskPage.jsx'))
```

`<Route path="/kiosk" element={<SelfServicePage />} />` satırından sonra ekle:

```jsx
<Route path="/laundry-kiosk" element={<LaundryKioskPage />} />
```

- [ ] **Step 4: Dev server'da test et**

http://localhost:5174/laundry-kiosk

Kontrol:
- Login ekranı görünüyor
- İsim arama çalışıyor (AVS Çalışanları sayfasından önce bir çalışan ekle ve PIN ata)
- Login sonrası 6 büyük buton görünüyor
- Torba Al formu: blok seç → oda gir → kişi listesi yükleniyor → adet → imza → kaydet
- Hazır İşaretle: ara → listede torbalar görünüyor → güncelle

- [ ] **Step 5: Backend testleri**

```bash
cd "/c/Users/hrync/OneDrive/Masaüstü/test claude/backend" && npx vitest run
```

Beklenen: tüm testler PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/modules/laundry-kiosk/ frontend/src/App.jsx
git commit -m "feat: faz7 çamaşırhane kiosk frontend — 6 işlem ekranı"
```

---

## Task 8: Check-in Hızlı Doluluk Frontend

**Files:**
- Modify: `frontend/src/modules/checkin/CheckinPage.jsx`

- [ ] **Step 1: CheckinPage.jsx'de quickFill state ve modal ekle**

`CheckinPage.jsx` dosyasında `useState` import'larının olduğu bölümde, mevcut state tanımlamalarından hemen sonra (örneğin `const [step, setStep] = useState(0)` gibi satırların yanına) ekle:

```js
const [quickFillRoom, setQuickFillRoom] = useState(null)  // { room_id, room_no, block, active_beds, current_count }
const [quickFillCount, setQuickFillCount] = useState(1)
const [quickFillLoading, setQuickFillLoading] = useState(false)
```

- [ ] **Step 2: handleQuickFill fonksiyonunu ekle**

`handleAssignRoom` fonksiyonunun hemen altına ekle:

```js
async function handleQuickFill() {
  if (!quickFillRoom || quickFillCount < 1) return
  setQuickFillLoading(true)
  try {
    await api.post('/checkin/placeholder-batch', { room_id: quickFillRoom.room_id, count: quickFillCount })
    setQuickFillRoom(null)
    qc.invalidateQueries({ queryKey: ['available-rooms'] })
    qc.invalidateQueries({ queryKey: ['checkin-stats'] })
  } catch (e) {
    alert(e.response?.data?.error || 'Hata oluştu')
  } finally {
    setQuickFillLoading(false)
  }
}
```

- [ ] **Step 3: RoomPicker bileşenine onQuickFill prop ekle**

`RoomPicker` fonksiyon tanımını bul (`function RoomPicker({ onSelect, selectedRoom, suggestedRoom })`) ve prop ekle:

```js
function RoomPicker({ onSelect, selectedRoom, suggestedRoom, onQuickFill }) {
```

Her oda kartının (`<div key={r.room_id}`) hemen sonrasına (closing `</div>` öncesine değil, kartın render'ından sonra) — aslında oda kartının içine küçük bir buton eklemek yerine, `RoomPicker` bileşeninin en altında (Legend'dan önce) şu satırı ekle:

```jsx
{onQuickFill && selectedRoom && (
  <button
    onClick={e => { e.stopPropagation(); onQuickFill(selectedRoom) }}
    style={{
      marginTop: '8px', padding: '6px 12px', borderRadius: '6px', border: 'none',
      background: 'rgba(59,130,246,.15)', color: '#60a5fa', cursor: 'pointer',
      fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '1px',
    }}>
    ⚡ HIZLI EKLE — {selectedRoom.block} {selectedRoom.room_no}
  </button>
)}
```

- [ ] **Step 4: RoomPicker kullanımlarına prop geç**

Dosyada `<RoomPicker` kullanıldığı yerde (step 2 / ODA ATAMASI paneli), `onQuickFill` prop'u ekle:

```jsx
<RoomPicker
  suggestedRoom={suggestedRoom}
  selectedRoom={selectedRoom}
  onSelect={setSelectedRoom}
  onQuickFill={r => { setQuickFillRoom(r); setQuickFillCount(1) }}
/>
```

- [ ] **Step 5: Hızlı Ekle modalını ekle**

`CheckinPage` return'ünün en sonuna (son `</div>` öncesine) ekle:

```jsx
{quickFillRoom && (
  <div style={{
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
  }}>
    <div className="panel" style={{ width: '100%', maxWidth: '360px' }}>
      <div style={{ height: '2px', background: 'var(--accent)' }} />
      <div className="panel-header">
        <div>
          <div className="panel-title">HIZLI DOLULUK</div>
          <div className="panel-subtitle">{quickFillRoom.block} BLOK — ODA {quickFillRoom.room_no}</div>
        </div>
      </div>
      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)' }}>
          Mevcut: {quickFillRoom.current_count}/{quickFillRoom.active_beds} kişi
        </div>
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginBottom: '8px' }}>
            KAÇ KİŞİ EKLENECEK?
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {Array.from({ length: Math.max(0, quickFillRoom.active_beds - quickFillRoom.current_count) }, (_, i) => i + 1).map(n => (
              <button key={n} onClick={() => setQuickFillCount(n)}
                style={{
                  width: '44px', height: '44px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                  fontFamily: 'var(--display)', fontSize: '18px', fontWeight: 700,
                  background: quickFillCount === n ? 'var(--accent)' : 'var(--surface2)',
                  color: quickFillCount === n ? '#000' : 'var(--text)',
                }}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text4)' }}>
          {quickFillCount} adet "Anonim" kayıt oluşturulur. Detaylar sonra doldurulabilir.
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setQuickFillRoom(null)} className="btn btn-ghost">İptal</button>
          <button onClick={handleQuickFill} disabled={quickFillLoading}
            className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
            {quickFillLoading ? 'Ekleniyor...' : `✓ ${quickFillCount} Kişi Ekle`}
          </button>
        </div>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 6: Dev server'da test et**

http://localhost:5174 → Check-in → ODA ATAMASI adımına geç → Bir oda seç → "⚡ HIZLI EKLE" butonu görünmeli → Tıkla → Modal açılmalı → Sayı seç → Ekle → Oda doluluk sayısı güncellenmeli

- [ ] **Step 7: Tüm backend testleri**

```bash
cd "/c/Users/hrync/OneDrive/Masaüstü/test claude/backend" && npx vitest run
```

Beklenen: tüm testler PASS

- [ ] **Step 8: Final commit**

```bash
git add frontend/src/modules/checkin/CheckinPage.jsx
git commit -m "feat: faz8 check-in hızlı doluluk — anonim placeholder batch girişi"
```
