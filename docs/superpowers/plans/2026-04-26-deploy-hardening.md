# Deploy Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Production'a deploy edilmeden önce kritik güvenlik açıklarını, eksik rate limit'leri, veri kaybı riskini ve önemli sağlamlık sorunlarını gidermek.

**Architecture:** Her task bağımsız, kendi commit'i var — birbirini bozmaz. Phase 1 kritik deploy blokerları, Phase 2 güvenlik/sağlamlık, Phase 3 frontend'i kapsar.

**Tech Stack:** Node.js/Express backend, better-sqlite3, React/Vite frontend, Render (cloud), PM2 (process manager)

---

## Phase 1 — Kritik Deploy Blokerları

---

### Task 1: render.yaml — Persistent Disk + TRUST_PROXY

**Files:**
- Modify: `render.yaml`

**Sorun:** `DB_PATH=/tmp/yys.db` — Render her restart/deploy'da `/tmp` siler → TÜM VERİ KAYBI. `TRUST_PROXY` eksik → rate limiting IP'leri yanlış tespit eder.

- [ ] **Step 1: render.yaml'ı güncelle**

`render.yaml` dosyasını tam olarak şöyle yaz (mevcut dosyanın yerini al):

```yaml
services:
  - type: web
    name: inxcee-backend
    runtime: node
    buildCommand: cd backend && npm install
    startCommand: cd backend && node src/server.js
    envVars:
      - key: NODE_ENV
        value: production
      - key: DB_PATH
        value: /var/data/yys.db
      - key: TRUST_PROXY
        value: "1"
      # JWT_SECRET — Render Dashboard > Settings > Environment Variables'dan ayarlayın
      # ALLOWED_ORIGIN — örn: https://yourdomain.vercel.app,https://www.yourdomain.com
    autoDeploy: true
    disk:
      name: yys-data
      mountPath: /var/data
      sizeGB: 1
```

- [ ] **Step 2: db/index.js'deki yorum satırını doğrula**

`backend/src/shared/db/index.js` satır 21'deki yorumun `/var/data/yys.db` yazdığını kontrol et (zaten doğru, değişiklik yok).

- [ ] **Step 3: Commit**

```bash
git add render.yaml
git commit -m "fix: render persistent disk + TRUST_PROXY — /tmp veri kaybı riski giderildi"
```

---

### Task 2: app.js — Reports Router Rate Limit + ALLOWED_ORIGIN Zorunlu

**Files:**
- Modify: `backend/src/app.js:180` ve `backend/src/app.js:30-32`

**Sorun 1:** `/api/reports` router'ına hiç rate limit uygulanmıyor (satır 180).
**Sorun 2:** `ALLOWED_ORIGIN` env set edilmezse production'da localhost'a fallback yapıyor.

- [ ] **Step 1: app.js'i düzenle — iki değişiklik birden**

`backend/src/app.js` dosyasında satır 30-32'yi şöyle değiştir:

```javascript
// Mevcut:
const allowedOrigins = process.env.ALLOWED_ORIGIN
  ? process.env.ALLOWED_ORIGIN.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:5174']
```

Bunu şununla değiştir:

```javascript
if (process.env.NODE_ENV === 'production' && !process.env.ALLOWED_ORIGIN) {
  console.error('[Startup] HATA: ALLOWED_ORIGIN env değişkeni production\'da zorunludur.')
  console.error('[Startup] Render Dashboard\'a ALLOWED_ORIGIN=https://yourdomain.com ekleyin.')
  process.exit(1)
}

const allowedOrigins = process.env.ALLOWED_ORIGIN
  ? process.env.ALLOWED_ORIGIN.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:5174']
```

Sonra satır 180'i değiştir:

```javascript
// Mevcut:
app.use('/api/reports', reportsRouter)

// Yeni:
app.use('/api/reports', readLimiter, reportsRouter)
```

- [ ] **Step 2: Test — manuel doğrulama**

```bash
cd backend && node -e "
process.env.NODE_ENV = 'production'
// ALLOWED_ORIGIN set edilmeden import
import('./src/app.js').catch(() => console.log('OK: process.exit(1) çağrıldı'))
"
```

Beklenen çıktı: `HATA: ALLOWED_ORIGIN env değişkeni production'da zorunludur.`

- [ ] **Step 3: Testleri çalıştır**

```bash
cd backend && npx vitest run
```

Beklenen: tüm testler geçmeli (testler NODE_ENV=test olduğu için production check çalışmaz).

- [ ] **Step 4: Commit**

```bash
git add backend/src/app.js
git commit -m "fix: reports router rate limit eksikti + ALLOWED_ORIGIN production'da zorunlu"
```

---

### Task 3: checkin/routes.js — CSV Import Satır Limiti

**Files:**
- Modify: `backend/src/modules/checkin/routes.js:136`

**Sorun:** `POST /api/checkin/import-csv` endpoint'inde `rows` array boyutu kontrol edilmiyor. 100k satır gönderilirse 100k DB insert çalışır, server çöker.

- [ ] **Step 1: Test yaz**

`backend/src/modules/checkin/checkin.test.js` dosyasına şu testi ekle (mevcut testlerin sonuna):

```javascript
it('CSV import 1001 satırda 400 döner', async () => {
  const rows = Array.from({ length: 1001 }, (_, i) => ({ full_name: `Test Person ${i}` }))
  const res = await request(app)
    .post('/api/checkin/import-csv')
    .set('Authorization', `Bearer ${token}`)
    .send({ rows })
  expect(res.status).toBe(400)
  expect(res.body.error).toMatch(/1000/)
})
```

- [ ] **Step 2: Testi çalıştır — FAIL görmeli**

```bash
cd backend && npx vitest run src/modules/checkin/checkin.test.js
```

Beklenen: son test FAIL (henüz limit yok).

- [ ] **Step 3: Implementasyon**

`backend/src/modules/checkin/routes.js` satır 136'yı şöyle değiştir:

```javascript
// Mevcut:
if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'Veri bulunamadı' })

// Yeni:
if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'Veri bulunamadı' })
if (rows.length > 1000) return res.status(400).json({ error: 'Maksimum 1000 satır import edilebilir' })
```

- [ ] **Step 4: Testi çalıştır — PASS**

```bash
cd backend && npx vitest run src/modules/checkin/checkin.test.js
```

Beklenen: tüm testler geçmeli.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/checkin/routes.js backend/src/modules/checkin/checkin.test.js
git commit -m "fix: CSV import maks 1000 satır limiti — sunucu overload koruması"
```

---

### Task 4: db/index.js — SQLite WAL Mode + Performance Pragmas

**Files:**
- Modify: `backend/src/shared/db/index.js:24` (initDB fonksiyonu içi, DB açıldıktan hemen sonra)

**Sorun:** WAL mode kapalı → concurrent read/write'da locking sorunları, crash recovery yavaş. Busy timeout yok → "database is locked" hataları.

- [ ] **Step 1: initDB içine pragma'ları ekle**

`backend/src/shared/db/index.js` dosyasında `db = new Database(path)` satırından hemen sonra (satır 24-25 arası) şunu ekle:

```javascript
  db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')
  db.pragma('synchronous = NORMAL')
  db.exec(SCHEMA)
```

- [ ] **Step 2: Testleri çalıştır**

```bash
cd backend && npx vitest run
```

Beklenen: tüm testler geçmeli (`:memory:` DB'de WAL desteklenmez ama hata fırlatmaz — sessizce devam eder).

- [ ] **Step 3: Commit**

```bash
git add backend/src/shared/db/index.js
git commit -m "perf: SQLite WAL mode + busy_timeout — concurrent access + crash recovery"
```

---

## Phase 2 — Güvenlik & Sağlamlık

---

### Task 5: ecosystem.config.cjs — PM2 Memory Guard + Log Config

**Files:**
- Modify: `ecosystem.config.cjs`

**Sorun:** PM2'de `max_memory_restart` tanımlı değil → memory leak'de process crash'e kadar gider. Log format eksik.

- [ ] **Step 1: ecosystem.config.cjs'i güncelle**

```javascript
module.exports = {
  apps: [{
    name: 'yys-backend',
    script: 'backend/src/server.js',
    interpreter: 'node',
    instances: 1,
    max_memory_restart: '500M',
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001,
    },
    error_file: 'logs/backend-error.log',
    out_file: 'logs/backend-out.log',
    time: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
  }]
}
```

- [ ] **Step 2: Commit**

```bash
git add ecosystem.config.cjs
git commit -m "chore: PM2 max_memory_restart 500M + log date format"
```

---

### Task 6: auth/service.js + db/index.js — PIN Brute Force Koruması

**Files:**
- Modify: `backend/src/shared/db/index.js` (migration ekle — sonuna)
- Modify: `backend/src/shared/auth/service.js` (loginKiosk, loginKioskById, loginAvsKiosk)

**Sorun:** 4 haneli PIN = 10.000 kombinasyon. Rate limit 20/15dk → TC numarası biliniyorsa teorik brute force mümkün. 5 hatalı denemede hesap 15 dakika kilitlenmeli.

- [ ] **Step 1: Migration'ı db/index.js sonuna ekle**

`backend/src/shared/db/index.js` dosyasının sonuna, `return db` satırından önce:

```javascript
  // ── PIN lockout koruması ───────────────────────────────────────────────────
  try { db.exec('ALTER TABLE personnel ADD COLUMN pin_attempts INTEGER DEFAULT 0') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] pin_attempts:', e.message) }
  try { db.exec('ALTER TABLE personnel ADD COLUMN pin_locked_until TEXT') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] pin_locked_until:', e.message) }
  try { db.exec('ALTER TABLE avs_workers ADD COLUMN pin_attempts INTEGER DEFAULT 0') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] avs_workers.pin_attempts:', e.message) }
  try { db.exec('ALTER TABLE avs_workers ADD COLUMN pin_locked_until TEXT') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] avs_workers.pin_locked_until:', e.message) }

  return db
```

- [ ] **Step 2: Test yaz**

`backend/src/shared/auth/auth.test.js` dosyası varsa ekle, yoksa `backend/src/shared/auth/auth.test.js` oluştur:

```javascript
import { describe, it, expect, beforeEach } from 'vitest'
import { initDB } from '../db/index.js'
import { loginKioskById } from './service.js'
import { getDB } from '../db/index.js'
import bcrypt from 'bcryptjs'

beforeEach(() => {
  process.env.DB_PATH = ':memory:'
  process.env.JWT_SECRET = 'test-secret-for-testing-only'
  initDB()
  const db = getDB()
  const hash = bcrypt.hashSync('1234', 10)
  db.prepare("INSERT INTO personnel(id, full_name, kiosk_pin, pin_attempts) VALUES(999, 'Test', ?, 0)").run(hash)
})

describe('PIN lockout', () => {
  it('5 hatalı denemede hesap kilitlenir', () => {
    for (let i = 0; i < 5; i++) {
      loginKioskById(999, '0000')
    }
    const result = loginKioskById(999, '1234')
    expect(result.status).toBe(429)
    expect(result.error).toMatch(/kilitlendi/)
  })

  it('doğru PIN ile giriş başarılı ve attempts sıfırlanır', () => {
    const result = loginKioskById(999, '1234')
    expect(result.token).toBeDefined()
    const p = getDB().prepare('SELECT pin_attempts FROM personnel WHERE id=999').get()
    expect(p.pin_attempts).toBe(0)
  })

  it('hatalı PIN attempts artırır', () => {
    loginKioskById(999, '0000')
    const p = getDB().prepare('SELECT pin_attempts FROM personnel WHERE id=999').get()
    expect(p.pin_attempts).toBe(1)
  })
})
```

- [ ] **Step 3: Testi çalıştır — FAIL görmeli**

```bash
cd backend && npx vitest run src/shared/auth/auth.test.js
```

Beklenen: FAIL (henüz lockout mantığı yok).

- [ ] **Step 4: auth/service.js'i güncelle**

`backend/src/shared/auth/service.js` dosyasında `loginKioskById` fonksiyonunu şöyle değiştir:

```javascript
export function loginKioskById(personnelId, pin) {
  const db = getDB()
  const p = db.prepare('SELECT * FROM personnel WHERE id=? AND check_out_date IS NULL').get(personnelId)
  if (!p) return { error: 'Personel bulunamadı veya çıkış yapılmış', status: 401 }
  if (!p.kiosk_pin) return { error: 'PIN tanımlı değil. Yöneticinizden PIN alın.', status: 403 }

  if (p.pin_locked_until && new Date(p.pin_locked_until) > new Date()) {
    return { error: 'Çok fazla hatalı deneme. Hesap 15 dakika kilitlendi.', status: 429 }
  }

  if (!bcrypt.compareSync(pin, p.kiosk_pin)) {
    const attempts = (p.pin_attempts || 0) + 1
    if (attempts >= 5) {
      const lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString()
      db.prepare('UPDATE personnel SET pin_attempts=?, pin_locked_until=? WHERE id=?').run(attempts, lockedUntil, p.id)
      return { error: 'Çok fazla hatalı deneme. Hesap 15 dakika kilitlendi.', status: 429 }
    }
    db.prepare('UPDATE personnel SET pin_attempts=? WHERE id=?').run(attempts, p.id)
    return { error: 'PIN hatalı', status: 401 }
  }

  db.prepare('UPDATE personnel SET pin_attempts=0, pin_locked_until=NULL WHERE id=?').run(p.id)
  const token = jwt.sign(
    { personnelId: p.id, role: 'kiosk', full_name: p.full_name },
    SECRET,
    { expiresIn: '1h' }
  )
  return { token, personnel: { id: p.id, full_name: p.full_name } }
}
```

`loginKiosk` (TC no ile) fonksiyonunu da aynı mantıkla güncelle:

```javascript
export function loginKiosk(tcNo, pin) {
  const db = getDB()
  const p = db.prepare('SELECT * FROM personnel WHERE tc_no=? AND check_out_date IS NULL').get(tcNo)
  if (!p) return { error: 'TC No bulunamadı veya çıkış yapılmış', status: 401 }
  if (!p.kiosk_pin) return { error: 'PIN tanımlı değil. Yöneticinizden PIN alın.', status: 403 }

  if (p.pin_locked_until && new Date(p.pin_locked_until) > new Date()) {
    return { error: 'Çok fazla hatalı deneme. Hesap 15 dakika kilitlendi.', status: 429 }
  }

  if (!bcrypt.compareSync(pin, p.kiosk_pin)) {
    const attempts = (p.pin_attempts || 0) + 1
    if (attempts >= 5) {
      const lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString()
      db.prepare('UPDATE personnel SET pin_attempts=?, pin_locked_until=? WHERE id=?').run(attempts, lockedUntil, p.id)
      return { error: 'Çok fazla hatalı deneme. Hesap 15 dakika kilitlendi.', status: 429 }
    }
    db.prepare('UPDATE personnel SET pin_attempts=? WHERE id=?').run(attempts, p.id)
    return { error: 'PIN hatalı', status: 401 }
  }

  db.prepare('UPDATE personnel SET pin_attempts=0, pin_locked_until=NULL WHERE id=?').run(p.id)
  const token = jwt.sign(
    { personnelId: p.id, role: 'kiosk', full_name: p.full_name },
    SECRET,
    { expiresIn: '1h' }
  )
  return { token, personnel: { id: p.id, full_name: p.full_name } }
}
```

`loginAvsKiosk` fonksiyonunu da aynı mantıkla güncelle (tablo: `avs_workers`):

```javascript
export function loginAvsKiosk(workerId, pin) {
  const db = getDB()
  const w = db.prepare('SELECT * FROM avs_workers WHERE id=? AND is_active=1').get(workerId)
  if (!w) return { error: 'Çalışan bulunamadı veya pasif', status: 401 }
  if (!w.kiosk_pin) return { error: 'PIN tanımlı değil. Yöneticinizden PIN alın.', status: 403 }

  if (w.pin_locked_until && new Date(w.pin_locked_until) > new Date()) {
    return { error: 'Çok fazla hatalı deneme. Hesap 15 dakika kilitlendi.', status: 429 }
  }

  if (!bcrypt.compareSync(pin, w.kiosk_pin)) {
    const attempts = (w.pin_attempts || 0) + 1
    if (attempts >= 5) {
      const lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString()
      db.prepare('UPDATE avs_workers SET pin_attempts=?, pin_locked_until=? WHERE id=?').run(attempts, lockedUntil, w.id)
      return { error: 'Çok fazla hatalı deneme. Hesap 15 dakika kilitlendi.', status: 429 }
    }
    db.prepare('UPDATE avs_workers SET pin_attempts=? WHERE id=?').run(attempts, w.id)
    return { error: 'PIN hatalı', status: 401 }
  }

  db.prepare('UPDATE avs_workers SET pin_attempts=0, pin_locked_until=NULL WHERE id=?').run(w.id)
  const token = jwt.sign(
    { workerId: w.id, role: 'avs_kiosk', full_name: w.full_name },
    SECRET,
    { expiresIn: '4h' }
  )
  return { token, worker: { id: w.id, full_name: w.full_name, role_label: w.role_label } }
}
```

- [ ] **Step 5: Testleri çalıştır — PASS**

```bash
cd backend && npx vitest run src/shared/auth/auth.test.js
```

Beklenen: tüm 3 test geçmeli.

- [ ] **Step 6: Tüm testler**

```bash
cd backend && npx vitest run
```

Beklenen: tüm testler geçmeli.

- [ ] **Step 7: Commit**

```bash
git add backend/src/shared/db/index.js backend/src/shared/auth/service.js backend/src/shared/auth/auth.test.js
git commit -m "feat: PIN brute force koruması — 5 hatalı denemede 15dk hesap kilidi"
```

---

### Task 7: discipline/routes.js — Audit Logging

**Files:**
- Modify: `backend/src/modules/discipline/routes.js`

**Sorun:** Disiplin kayıtları (sarı/kırmızı kart) ve kara liste işlemleri audit log'a yazılmıyor. Compliance riski.

- [ ] **Step 1: import ekle ve logAudit çağrılarını ekle**

`backend/src/modules/discipline/routes.js` dosyasının başına import ekle:

```javascript
import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { logAudit } from '../../shared/audit.js'
import * as svc from './service.js'
```

Sonra `POST /records` route'una (satır 30 civarı) `res.status(201).json` satırından önce:

```javascript
    const result = svc.addRecordService({
      personnelId: personnel_id,
      cardType: card_type,
      reason: reason.trim(),
      createdBy: req.user.id
    })
    logAudit(req.user.id, `discipline_${card_type}_card`, 'discipline', personnel_id, reason.trim())
    res.status(201).json({ ok: true, discipline_points: result.discipline_points })
```

`DELETE /records/:id` route'una (satır 40 civarı):

```javascript
  try {
    svc.deleteRecordService(+req.params.id, req.user.id)
    logAudit(req.user.id, 'discipline_record_delete', 'discipline', +req.params.id, null)
    res.json({ ok: true })
```

`POST /blacklist` route'una:

```javascript
  svc.addToBlacklistService(req.body.personnel_id, req.body.reason.trim(), req.user.id)
  logAudit(req.user.id, 'blacklist_add', 'discipline', req.body.personnel_id, req.body.reason.trim())
  res.json({ ok: true })
```

`POST /blacklist/remove` route'una:

```javascript
  svc.removeFromBlacklistService(req.body.personnel_id, req.user.id)
  logAudit(req.user.id, 'blacklist_remove', 'discipline', req.body.personnel_id, null)
  res.json({ ok: true })
```

- [ ] **Step 2: Testleri çalıştır**

```bash
cd backend && npx vitest run
```

Beklenen: tüm testler geçmeli.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/discipline/routes.js
git commit -m "feat: disiplin modülü audit log — kart + kara liste işlemleri loglanıyor"
```

---

### Task 8: maintenance/routes.js — Audit Logging

**Files:**
- Modify: `backend/src/modules/maintenance/routes.js`

**Sorun:** Bakım talebi durum değişiklikleri, atamalar ve kapanışlar audit log'a yazılmıyor.

- [ ] **Step 1: import ekle ve kritik route'lara logAudit ekle**

`backend/src/modules/maintenance/routes.js` dosyasının başına:

```javascript
import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { upload, verifyMagicBytes } from '../../shared/uploads/middleware.js'
import { getDB } from '../../shared/db/index.js'
import { logAudit } from '../../shared/audit.js'
import * as svc from './service.js'
import { paginate } from '../../shared/paginate.js'
```

`POST /requests` (oluşturma) satır 27 civarında, `res.status(201).json({ id })` öncesinde:

```javascript
    const id = svc.createRequestService({ ... })
    logAudit(req.user.id, 'maintenance_create', 'maintenance', id, `${location}: ${description}`)
    res.status(201).json({ id })
```

`PATCH /requests/:id/assign` route'unda:

```javascript
    svc.assignRequestService(+req.params.id, +technician_id, req.user.id)
    logAudit(req.user.id, 'maintenance_assign', 'maintenance', +req.params.id, `teknisyen:${technician_id}`)
    res.json({ ok: true })
```

`PATCH /requests/:id/status` route'unda:

```javascript
    svc.updateStatusService(+req.params.id, status, req.user.id)
    logAudit(req.user.id, 'maintenance_status_change', 'maintenance', +req.params.id, status)
    res.json({ ok: true })
```

`PATCH /requests/:id/close` route'unda:

```javascript
  svc.closeRequestService(+req.params.id, photoUrl)
  logAudit(req.user.id, 'maintenance_close', 'maintenance', +req.params.id, null)
  res.json({ ok: true })
```

`DELETE /requests/:id` route'unda:

```javascript
  try {
    svc.deleteRequestService(+req.params.id)
    logAudit(req.user.id, 'maintenance_delete', 'maintenance', +req.params.id, null)
    res.json({ ok: true })
```

- [ ] **Step 2: Testleri çalıştır**

```bash
cd backend && npx vitest run
```

Beklenen: tüm testler geçmeli.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/maintenance/routes.js
git commit -m "feat: bakım modülü audit log — talep oluşturma/atama/durum/kapanış loglanıyor"
```

---

## Phase 3 — Frontend Düzeltmeleri

---

### Task 9: client.js — Refresh Queue Overflow Guard

**Files:**
- Modify: `frontend/src/shared/api/client.js:23`

**Sorun:** 401 hatası yağmurunda 100+ promise refreshQueue'ya dolabilir → memory bloat. Queue 10'u geçince hepsini reject etmeli.

- [ ] **Step 1: Overflow guard ekle**

`frontend/src/shared/api/client.js` satır 23'teki `if (isRefreshing)` bloğunu şöyle değiştir:

```javascript
// Mevcut:
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push({ resolve, reject })
        }).then(token => {
          original.headers.Authorization = `Bearer ${token}`
          return api(original)
        })
      }

// Yeni:
      if (isRefreshing) {
        if (refreshQueue.length >= 10) {
          refreshQueue.forEach(p => p.reject(new Error('Refresh queue dolu')))
          refreshQueue = []
          useAuthStore.getState().logout()
          return Promise.reject(error)
        }
        return new Promise((resolve, reject) => {
          refreshQueue.push({ resolve, reject })
        }).then(token => {
          original.headers.Authorization = `Bearer ${token}`
          return api(original)
        })
      }
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/shared/api/client.js
git commit -m "fix: refresh queue overflow guard — 10+ bekleyen 401 olursa logout"
```

---

### Task 10: ShiftsPage — Hardcoded Şirket Adını Kaldır

**Files:**
- Modify: `frontend/src/modules/shifts/ShiftsPage.jsx` (TODO yorum satırı)

**Sorun:** `COMPANY_NAME = 'YYS Kampüs'` hardcoded ve TODO yorum var. Production'da env variable'dan veya ayarlardan gelmeli.

- [ ] **Step 1: ShiftsPage'deki TODO'yu bul**

```bash
grep -n "COMPANY_NAME\|TODO.*şirket\|TODO.*Şirket" frontend/src/modules/shifts/ShiftsPage.jsx
```

- [ ] **Step 2: Hardcoded değeri env'den oku**

Bulunan satırda değişkeni şöyle güncelle (env variable yoksa fallback kalsın):

```javascript
// Mevcut:
const COMPANY_NAME = 'YYS Kampüs' // TODO: Şirket adını burada güncelle

// Yeni:
const COMPANY_NAME = import.meta.env.VITE_COMPANY_NAME || 'YYS Kampüs'
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/modules/shifts/ShiftsPage.jsx
git commit -m "chore: şirket adı VITE_COMPANY_NAME env'den — hardcoded TODO kaldırıldı"
```

---

## Tamamlama Kontrol Listesi

Deploy öncesi tüm tasklar bitince:

- [ ] `cd backend && npx vitest run` — tüm testler geçmeli
- [ ] `npm run build` (frontend) — build hatasız tamamlanmalı
- [ ] `render.yaml` içinde `disk:` bloğu var mı?
- [ ] Render Dashboard'da `JWT_SECRET` ve `ALLOWED_ORIGIN` set edildi mi?
- [ ] `DB_PATH=/var/data/yys.db` render.yaml'da mı?
- [ ] Deploy sonrası `GET /api/health` → `{ "status": "ok", "db": "ok" }` döndürüyor mu?
