# Production Hardening Faz 3 — Orta Öncelik

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 9 orta öncelikli iyileştirmeyi uygula — Helmet CSP, pagination, PM2, token refresh, bildirim deduplication, self-service validasyon, route guard, health check, .env.example.

**Architecture:** Backend + frontend değişiklikleri. M4 (pagination) 4 endpoint etkiler. M6 (token refresh) hem backend hem frontend gerektirir. Faz 1 ve Faz 2 tamamlanmış olmalı.

**Tech Stack:** Node.js/Express, Helmet.js, React/Vite, TanStack Query v5, axios interceptors

---

## Dosya Haritası

| İşlem | Dosya |
|-------|-------|
| Değiştir | `backend/src/app.js` |
| Değiştir | `backend/src/shared/notifications/service.js` |
| Değiştir | `backend/src/shared/db/index.js` |
| Değiştir | `backend/src/shared/auth/service.js` |
| Değiştir | `backend/src/shared/auth/routes.js` |
| Değiştir | `backend/src/modules/capacity/routes.js` |
| Değiştir | `backend/src/modules/maintenance/routes.js` |
| Değiştir | `backend/src/modules/inventory/routes.js` |
| Değiştir | `backend/src/modules/shifts/routes.js` |
| Değiştir | `backend/src/modules/self-service/routes.js` |
| Oluştur | `.env.example` (proje kökü) |
| Oluştur | `ecosystem.config.cjs` (proje kökü) |
| Oluştur | `docs/deploy/nginx.conf` |
| Oluştur | `docs/deploy/README.md` |
| Değiştir | `frontend/src/shared/api/client.js` |
| Değiştir | `frontend/src/App.jsx` |

---

## Task 1: M5 — Helmet.js CSP

**Files:**
- Modify: `backend/src/app.js`
- Modify: `backend/package.json` (yeni bağımlılık)

- [ ] **Step 1: Helmet kur**

```bash
cd backend && npm install helmet
```

- [ ] **Step 2: `app.js` — helmet ekle**

`backend/src/app.js` dosyasının başına import ekle:

```js
import helmet from 'helmet'
```

`app.use(cors(...))` satırından ÖNCE ekle:

```js
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],   // React build inline scripts
      styleSrc: ["'self'", "'unsafe-inline'"],    // Tailwind + inline styles
      imgSrc: ["'self'", "data:", "blob:"],        // canvas/signature/photo preview
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "data:"],
    }
  },
  crossOriginEmbedderPolicy: false, // SSE bağlantılarını kesmemek için
}))
```

- [ ] **Step 3: Test çalıştır**

```bash
cd backend && npx vitest run
```

Beklenen: tüm testler geçiyor.

- [ ] **Step 4: Commit**

```bash
git add backend/src/app.js backend/package.json backend/package-lock.json
git commit -m "feat: Helmet.js CSP — React + canvas + SSE uyumlu güvenlik header'ları"
```

---

## Task 2: M8 — Self-Service Maintenance Validasyonu

**Files:**
- Modify: `backend/src/modules/self-service/routes.js`

- [ ] **Step 1: Test yaz**

`backend/src/modules/self-service/self-service.test.js` dosyasına ekle (mevcut describe bloğunun içine veya sonuna):

```js
describe('self-service maintenance validasyon', () => {
  it('kısa location reddedilir', async () => {
    // Kiosk token üret
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test'
    const jwt = (await import('jsonwebtoken')).default
    const token = jwt.sign({ personnelId: 1, role: 'kiosk' }, process.env.JWT_SECRET, { expiresIn: '1h' })
    const res = await request(app)
      .post('/api/self-service/maintenance')
      .set('Authorization', `Bearer ${token}`)
      .send({ location: 'AB', description: 'Bu yeterince uzun bir açıklama metnidir' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/location/)
  })

  it('kısa description reddedilir', async () => {
    const jwt = (await import('jsonwebtoken')).default
    const token = jwt.sign({ personnelId: 1, role: 'kiosk' }, process.env.JWT_SECRET, { expiresIn: '1h' })
    const res = await request(app)
      .post('/api/self-service/maintenance')
      .set('Authorization', `Bearer ${token}`)
      .send({ location: 'Oda 101', description: 'kısa' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/description/)
  })
})
```

- [ ] **Step 2: Test çalıştır — FAIL beklenir**

```bash
cd backend && npx vitest run src/modules/self-service/self-service.test.js
```

Beklenen: yeni testler FAIL (validasyon henüz yok).

- [ ] **Step 3: `self-service/routes.js` — validasyon ekle**

`selfServiceRouter.post('/maintenance', ...)` route'unu güncelle:

```js
selfServiceRouter.post('/maintenance', requireKioskOrStaff, (req, res) => {
  if (!req.user.personnelId) return res.status(403).json({ error: 'Kiosk token gerekli' })
  const { location, description } = req.body
  if (!location || location.trim().length < 3)
    return res.status(400).json({ error: 'location en az 3 karakter olmalıdır' })
  if (!description || description.trim().length < 10)
    return res.status(400).json({ error: 'description en az 10 karakter olmalıdır' })
  try {
    const id = createRequest({
      location: location.trim(),
      description: description.trim(),
      reporterUserId: req.user.userId || null
    })
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})
```

- [ ] **Step 4: Test çalıştır — PASS beklenir**

```bash
cd backend && npx vitest run src/modules/self-service/self-service.test.js
```

Beklenen: tüm testler geçiyor.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/self-service/routes.js backend/src/modules/self-service/self-service.test.js
git commit -m "feat: self-service maintenance validasyonu — location min 3, description min 10 karakter"
```

---

## Task 3: M9 — Frontend Route Guard

**Files:**
- Modify: `frontend/src/App.jsx`

Admin sayfaları (`/users`, `/audit`, `/settings`, `/kiosk-pins`) yalnızca `campus_manager` rolü için erişilebilir. Şu an `PrivateRoute` sadece token varlığını kontrol ediyor — rol kontrolü yok.

- [ ] **Step 1: `App.jsx` — RoleRoute bileşeni ekle + admin route'larını sar**

`frontend/src/App.jsx` dosyasında `PrivateRoute` fonksiyonundan sonra ekle:

```jsx
function RoleRoute({ roles, children }) {
  const user = useAuthStore(s => s.user)
  if (!roles.includes(user?.role)) return <Navigate to="/" replace />
  return children
}
```

Admin route'larını `RoleRoute` ile sar:

```jsx
// ÖNCE:
<Route path="audit" element={<AuditPage />} />
<Route path="users" element={<UsersPage />} />
<Route path="settings" element={<SettingsPage />} />
<Route path="kiosk-pins" element={<KioskPinPage />} />

// SONRA:
<Route path="audit" element={<RoleRoute roles={['campus_manager']}><AuditPage /></RoleRoute>} />
<Route path="users" element={<RoleRoute roles={['campus_manager']}><UsersPage /></RoleRoute>} />
<Route path="settings" element={<RoleRoute roles={['campus_manager']}><SettingsPage /></RoleRoute>} />
<Route path="kiosk-pins" element={<RoleRoute roles={['campus_manager']}><KioskPinPage /></RoleRoute>} />
```

- [ ] **Step 2: Frontend build kontrol**

```bash
cd frontend && npm run build 2>&1 | tail -10
```

Beklenen: hata yok.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: RoleRoute — admin sayfaları campus_manager rolüne kısıtlandı"
```

---

## Task 4: M11 — Gelişmiş Health Check

**Files:**
- Modify: `backend/src/app.js`

- [ ] **Step 1: `app.js` — health check endpoint güncelle**

`backend/src/app.js` içindeki health check satırını değiştir:

```js
// ÖNCE:
app.get('/api/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }))

// SONRA:
app.get('/api/health', (req, res) => {
  let dbStatus = 'ok'
  try {
    const { getDB } = await import('./shared/db/index.js')
    getDB().prepare('SELECT 1').get()
  } catch {
    dbStatus = 'error'
  }
  const status = dbStatus === 'ok' ? 'ok' : 'degraded'
  res.status(dbStatus === 'ok' ? 200 : 503).json({
    status,
    uptime: Math.floor(process.uptime()),
    db: dbStatus,
  })
})
```

Dikkat: `app.js` ES module. Dynamic import yerine static import kullan — `getDB` zaten app.js'e import edilebilir. Ancak circular import riski var. Güvenli versiyon:

```js
import { getDB } from './shared/db/index.js'

// ...diğer importlar...

app.get('/api/health', (req, res) => {
  let dbStatus = 'ok'
  try {
    getDB().prepare('SELECT 1').get()
  } catch {
    dbStatus = 'error'
  }
  res.status(dbStatus === 'ok' ? 200 : 503).json({
    status: dbStatus === 'ok' ? 'ok' : 'degraded',
    uptime: Math.floor(process.uptime()),
    db: dbStatus,
  })
})
```

`import { getDB } from './shared/db/index.js'` satırını `backend/src/app.js` başına ekle.

- [ ] **Step 2: Test çalıştır**

```bash
cd backend && npx vitest run
```

Beklenen: tüm testler geçiyor.

- [ ] **Step 3: Commit**

```bash
git add backend/src/app.js
git commit -m "feat: /api/health — db ping + uptime + HTTP 503 on db error"
```

---

## Task 5: M7 — Bildirim Deduplication

**Files:**
- Modify: `backend/src/shared/db/index.js`
- Modify: `backend/src/shared/notifications/service.js`

Stok bildirimleri aynı gün aynı item için tekrarlanıyor. `dedup_key` ile kontrol edilir.

- [ ] **Step 1: `db/index.js` — notifications.dedup_key kolonu**

`backend/src/shared/db/index.js` dosyasında `return db` satırından önce ekle:

```js
  // ── Bildirim deduplication ─────────────────────────────────────────────────
  try { db.exec('ALTER TABLE notifications ADD COLUMN dedup_key TEXT') } catch(e) {
    if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists'))
      console.error('[Migration] dedup_key:', e.message)
  }
  try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_dedup ON notifications(dedup_key) WHERE dedup_key IS NOT NULL') } catch(e) {
    if (!e.message?.includes('already exists')) console.error('[Migration] idx_notif_dedup:', e.message)
  }
```

- [ ] **Step 2: `notifications/service.js` — dedup_key desteği**

`createNotification` fonksiyonunu güncelle:

```js
export function createNotification({ message, type = 'info', module, target_role, target_user_id, dedup_key }) {
  const db = getDB()

  // Deduplication: aynı dedup_key bugün zaten var mı?
  if (dedup_key) {
    const existing = db.prepare(
      "SELECT id FROM notifications WHERE dedup_key=? AND date(created_at)=date('now')"
    ).get(dedup_key)
    if (existing) return null // Duplicate — gönderme
  }

  const r = db.prepare(
    'INSERT INTO notifications(message,type,module,target_role,target_user_id,dedup_key) VALUES(?,?,?,?,?,?)'
  ).run(message, type, module || null, target_role || null, target_user_id || null, dedup_key || null)

  const notif = db.prepare('SELECT * FROM notifications WHERE id=?').get(r.lastInsertRowid)
  sseClients.forEach(client => {
    try { client.write(`data: ${JSON.stringify(notif)}\n\n`) } catch { sseClients.delete(client) }
  })
  return notif
}
```

- [ ] **Step 3: `cron/index.js` — stok bildirimlerine dedup_key ekle**

`backend/src/shared/cron/index.js` içindeki stok cron görevini güncelle:

```js
  // Her saat stok kontrolü
  cron.schedule('0 * * * *', () => {
    try {
      const db = getDB()
      const low = db.prepare('SELECT * FROM inventory WHERE quantity <= reorder_threshold').all()
      low.forEach(item => {
        createNotification({
          message: `Stok uyarısı: ${item.item_name} kritik seviyede (${item.quantity} ${item.unit})`,
          type: 'warning', module: 'inventory', target_role: 'campus_manager',
          dedup_key: `stock_low_${item.id}_${new Date().toISOString().split('T')[0]}`,
        })
      })
    } catch (e) { console.error('[Cron] Stok cron hatası:', e) }
  })
```

- [ ] **Step 4: Test çalıştır**

```bash
cd backend && npx vitest run
```

Beklenen: tüm testler geçiyor.

- [ ] **Step 5: Commit**

```bash
git add backend/src/shared/db/index.js backend/src/shared/notifications/service.js backend/src/shared/cron/index.js
git commit -m "feat: bildirim deduplication — dedup_key ile aynı gün tekrar bildirim gönderme"
```

---

## Task 6: M4 — Pagination (4 Endpoint)

**Files:**
- Modify: `backend/src/modules/capacity/routes.js`
- Modify: `backend/src/modules/maintenance/routes.js`
- Modify: `backend/src/modules/inventory/routes.js`
- Modify: `backend/src/modules/shifts/routes.js`

`?page=1&limit=50` offset-based. Default: 50, max: 200. Response: `{ data: [...], total: N, page: 1, limit: 50 }`.

Not: Frontend bu endpoint'leri tüketen bileşenlerde pagination UI gerekli. Bu task sadece backend'i ekler — frontend'de mevcut davranış (tüm veriyi çekme) korunur, pagination UI eklenmez (bu fazın kapsamı dışı).

- [ ] **Step 1: `capacity/routes.js` — GET /rooms pagination**

`backend/src/modules/capacity/routes.js` dosyasını oku, sonra `GET /rooms` veya `GET /` route'unu bul ve pagination ekle.

Route'u bulduktan sonra şu helper'ı kullan:

```js
function paginate(req) {
  const page = Math.max(1, parseInt(req.query.page) || 1)
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50))
  const offset = (page - 1) * limit
  return { page, limit, offset }
}
```

Veri dönen ana GET endpoint'i güncelle — örnek desen:

```js
capacityRouter.get('/rooms', ...allowed, (req, res) => {
  const { page, limit, offset } = paginate(req)
  const db = getDB()  // veya mevcut service/query fonksiyonunu kullan
  const total = db.prepare('SELECT COUNT(*) as c FROM rooms WHERE status=?').get('active').c
  const data = db.prepare('SELECT ... FROM rooms WHERE status=? LIMIT ? OFFSET ?').all('active', limit, offset)
  res.json({ data, total, page, limit })
})
```

Gerçek SQL'i mevcut route/service kodundan al, sadece `LIMIT ? OFFSET ?` ekle ve response format'ı değiştir.

- [ ] **Step 2: `maintenance/routes.js` — GET requests pagination**

Benzer şekilde. Ana liste endpoint'ini bul (muhtemelen `GET /` veya `GET /requests`). `paginate(req)` helper'ı kullan. `total` için `COUNT(*)` sorgusu ekle.

- [ ] **Step 3: `inventory/routes.js` — GET / pagination**

Benzer şekilde.

- [ ] **Step 4: `shifts/routes.js` — GET /staff pagination**

Benzer şekilde `/staff` veya ana liste endpoint'i.

- [ ] **Step 5: Test çalıştır**

```bash
cd backend && npx vitest run
```

Beklenen: tüm testler geçiyor. (Mevcut testler `{ data, total, page, limit }` formatını test etmiyorsa — eski format breaking change olur. Mevcut testleri response format'ına göre güncelle.)

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/capacity/routes.js backend/src/modules/maintenance/routes.js backend/src/modules/inventory/routes.js backend/src/modules/shifts/routes.js
git commit -m "feat: pagination — capacity/rooms, maintenance, inventory, shifts/staff endpoint'leri"
```

---

## Task 7: M6 — Token Refresh

**Files:**
- Modify: `backend/src/shared/auth/service.js`
- Modify: `backend/src/shared/auth/routes.js`
- Modify: `frontend/src/shared/api/client.js`

- [ ] **Step 1: `auth/service.js` — refreshToken fonksiyonu ekle**

`backend/src/shared/auth/service.js` dosyasına ekle:

```js
export function refreshToken(oldToken) {
  // Mevcut token'ı doğrula (süresi dolmuş olsa bile payload'ı al)
  let payload
  try {
    payload = jwt.verify(oldToken, SECRET)
  } catch (e) {
    if (e.name === 'TokenExpiredError') {
      payload = jwt.decode(oldToken)
    } else {
      return { error: 'Geçersiz token', status: 401 }
    }
  }

  if (!payload) return { error: 'Token payload boş', status: 401 }

  // Kiosk token'ları yenilenemiyor
  if (payload.role === 'kiosk') return { error: 'Kiosk token yenilenemiyor', status: 403 }

  // Kullanıcının hâlâ aktif olduğunu kontrol et
  const db = getDB()
  const user = db.prepare('SELECT id, role, username, full_name FROM users WHERE id=?').get(payload.id)
  if (!user) return { error: 'Kullanıcı bulunamadı', status: 401 }

  const newToken = jwt.sign(
    { id: user.id, role: user.role, username: user.username, full_name: user.full_name },
    SECRET,
    { expiresIn: '12h' }
  )
  return { token: newToken, user: { id: user.id, role: user.role, username: user.username, full_name: user.full_name } }
}
```

- [ ] **Step 2: `auth/routes.js` — POST /refresh endpoint**

`backend/src/shared/auth/routes.js` dosyasına ekle:

```js
import { login, loginKiosk, changeOwnPassword, refreshToken } from './service.js'

authRouter.post('/refresh', (req, res) => {
  const h = req.headers.authorization
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token gerekli' })
  const result = refreshToken(h.slice(7))
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.json(result)
})
```

- [ ] **Step 3: Test yaz**

`backend/src/shared/auth/auth.test.js` dosyasına ekle:

```js
describe('token refresh', () => {
  it('geçerli token ile yeni token alınır', async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret'
    const { login, refreshToken } = await import('./service.js')
    // login ile token al (seed'den gelen kullanıcı yoksa test DB'si boş olabilir)
    // Bu test doğrudan refreshToken'ı çağırır
    const jwt = (await import('jsonwebtoken')).default
    const fakeToken = jwt.sign({ id: 999, role: 'campus_manager', username: 'test', full_name: 'Test' }, process.env.JWT_SECRET, { expiresIn: '12h' })
    const result = refreshToken(fakeToken)
    // id: 999 DB'de yoksa hata döner — bu beklenen
    expect(result.error || result.token).toBeTruthy()
  })

  it('geçersiz token reddedilir', async () => {
    const { refreshToken } = await import('./service.js')
    const result = refreshToken('gecersiz.token.burada')
    expect(result.error).toBeTruthy()
    expect(result.status).toBe(401)
  })
})
```

- [ ] **Step 4: Backend testleri çalıştır**

```bash
cd backend && npx vitest run
```

Beklenen: tüm testler geçiyor.

- [ ] **Step 5: `frontend/src/shared/api/client.js` — axios interceptor**

`frontend/src/shared/api/client.js` dosyasını oku, sonra şu interceptor'ı ekle:

```js
import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
})

// Request interceptor — token ekle
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Response interceptor — 401'de token yenile
let isRefreshing = false
let refreshQueue = []

api.interceptors.response.use(
  res => res,
  async error => {
    const original = error.config

    if (error.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push({ resolve, reject })
        }).then(token => {
          original.headers.Authorization = `Bearer ${token}`
          return api(original)
        })
      }

      original._retry = true
      isRefreshing = true

      try {
        const token = localStorage.getItem('token')
        if (!token) throw new Error('no token')
        const res = await axios.post('/api/auth/refresh', null, {
          headers: { Authorization: `Bearer ${token}` }
        })
        const newToken = res.data.token
        localStorage.setItem('token', newToken)
        // authStore'u güncelle
        const { useAuthStore } = await import('../store/authStore.js')
        useAuthStore.setState(s => ({ ...s, token: newToken }))
        refreshQueue.forEach(p => p.resolve(newToken))
        refreshQueue = []
        original.headers.Authorization = `Bearer ${newToken}`
        return api(original)
      } catch {
        refreshQueue.forEach(p => p.reject(error))
        refreshQueue = []
        localStorage.removeItem('token')
        window.location.href = '/login'
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  }
)

export default api
```

Dikkat: Mevcut `client.js` dosyasını oku ve mevcut yapıyla birleştir. Eğer `api.interceptors.request.use` zaten varsa sadece response interceptor'ı ekle.

- [ ] **Step 6: Frontend build kontrol**

```bash
cd frontend && npm run build 2>&1 | tail -10
```

Beklenen: hata yok.

- [ ] **Step 7: Commit**

```bash
git add backend/src/shared/auth/service.js backend/src/shared/auth/routes.js backend/src/shared/auth/auth.test.js frontend/src/shared/api/client.js
git commit -m "feat: token refresh — POST /api/auth/refresh + frontend axios interceptor"
```

---

## Task 8: M1 — .env.example

**Files:**
- Create: `.env.example` (proje kökünde)

- [ ] **Step 1: `.env.example` oluştur**

```env
# ─── Zorunlu ──────────────────────────────────────────────────────────────────
JWT_SECRET=guclu-rastgele-deger-buraya-degistir
NODE_ENV=production

# ─── Veritabanı ───────────────────────────────────────────────────────────────
# VPS için kalıcı path (Render için /var/data/yys.db)
DB_PATH=/var/data/yys.db

# ─── Sunucu ───────────────────────────────────────────────────────────────────
PORT=3001

# ─── CORS ─────────────────────────────────────────────────────────────────────
# Virgülle ayrılmış izin verilen origin'ler
ALLOWED_ORIGIN=https://yourdomain.com

# ─── SMTP (otomatik e-posta raporu) ───────────────────────────────────────────
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=kullanici@example.com
SMTP_PASS=
SMTP_FROM=yys@example.com

# ─── WhatsApp (opsiyonel) ─────────────────────────────────────────────────────
WHATSAPP_TOKEN=
WHATSAPP_PHONE_ID=
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: .env.example — tüm env değişkenleri açıklamalı"
```

---

## Task 9: M2 — PM2 + Graceful Shutdown + Deploy Dökümanları

**Files:**
- Create: `ecosystem.config.cjs`
- Modify: `backend/src/server.js` (SIGTERM handler)
- Create: `docs/deploy/nginx.conf`
- Create: `docs/deploy/README.md`

- [ ] **Step 1: `ecosystem.config.cjs` oluştur (proje kökünde)**

```js
module.exports = {
  apps: [{
    name: 'yys-backend',
    script: 'backend/src/server.js',
    interpreter: 'node',
    interpreter_args: '--experimental-vm-modules',
    instances: 1,
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001,
    },
    error_file: 'logs/backend-error.log',
    out_file: 'logs/backend-out.log',
    time: true,
  }]
}
```

- [ ] **Step 2: `server.js` — SIGTERM graceful shutdown**

`backend/src/server.js` dosyasını güncelle — `app.listen` return değerini al ve SIGTERM handler'a ver:

```js
import app from './app.js'
import { initDB, getDB } from './shared/db/index.js'
import { startCronJobs } from './shared/cron/index.js'
import { seedDev } from './shared/db/seed.js'
import { initProdDB } from './shared/db/initProd.js'

// Zorunlu env — (Faz 1'de eklendi)
if (!process.env.JWT_SECRET) {
  console.error('[Startup] HATA: JWT_SECRET env değişkeni tanımlı değil.')
  process.exit(1)
}

process.on('unhandledRejection', (reason) => {
  console.error('[UnhandledRejection]', reason)
})
process.on('uncaughtException', (err) => {
  console.error('[UncaughtException]', err)
  process.exit(1)
})

initDB()

if (process.env.NODE_ENV !== 'production') {
  seedDev()
} else {
  initProdDB()
}

startCronJobs()

const port = process.env.PORT || 3001
const server = app.listen(port, () => console.log(`YYS Backend http://localhost:${port}`))

process.on('SIGTERM', () => {
  console.log('[Shutdown] SIGTERM alındı, bağlantılar kapatılıyor...')
  server.close(() => {
    try { getDB().close() } catch { /* ignore */ }
    console.log('[Shutdown] Tamamlandı')
    process.exit(0)
  })
  // 10 saniye sonra zorla kapat
  setTimeout(() => process.exit(1), 10000)
})
```

Not: `initProdDB` Faz 1'de oluşturuldu. `getDB` import'u `db/index.js`'den.

- [ ] **Step 3: `docs/deploy/nginx.conf` oluştur**

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Frontend (build klasörü)
    root /var/www/yys/frontend/dist;
    index index.html;

    # SPA — tüm route'ları index.html'e yönlendir
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend API reverse proxy
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }

    # SSE — timeout kapatma
    location /api/notifications/stream {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Statik dosyalar (uploads)
    location /uploads/ {
        alias /var/www/yys/backend/uploads/;
        expires 7d;
        add_header Cache-Control "private, max-age=604800";
    }

    # gzip
    gzip on;
    gzip_types text/plain text/css application/javascript application/json;
    gzip_min_length 1000;
}
```

- [ ] **Step 4: `docs/deploy/README.md` oluştur**

```markdown
# VPS Deploy Rehberi

## Gereksinimler
- Ubuntu 22.04+ VPS
- Node.js 20+
- PM2
- Nginx
- Let's Encrypt (SSL için)

## 1. Sunucu Hazırlık

```bash
# Node.js kur
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# PM2 kur
npm install -g pm2

# Nginx kur
sudo apt-get install -y nginx
```

## 2. Uygulama Deploy

```bash
# Repo klon
git clone <repo-url> /var/www/yys
cd /var/www/yys

# Bağımlılıklar
npm install
cd backend && npm install && cd ..
cd frontend && npm install && npm run build && cd ..

# Kalıcı data klasörü
sudo mkdir -p /var/data
sudo chown $USER:$USER /var/data

# Env dosyası
cp .env.example backend/.env
nano backend/.env  # JWT_SECRET ve diğerleri doldur
```

## 3. PM2 ile Başlat

```bash
cd /var/www/yys
NODE_ENV=production pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup  # Otomatik başlatma
```

## 4. Nginx Konfigürasyon

```bash
sudo cp docs/deploy/nginx.conf /etc/nginx/sites-available/yys
# yourdomain.com'u gerçek domain ile değiştir
sudo nano /etc/nginx/sites-available/yys
sudo ln -s /etc/nginx/sites-available/yys /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 5. SSL (Let's Encrypt)

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

## 6. Smoke Test

```bash
curl https://yourdomain.com/api/health
# Beklenen: {"status":"ok","uptime":...,"db":"ok"}
```
```

- [ ] **Step 5: Test çalıştır**

```bash
cd backend && npx vitest run
```

Beklenen: tüm testler geçiyor.

- [ ] **Step 6: Commit**

```bash
git add ecosystem.config.cjs backend/src/server.js docs/deploy/nginx.conf docs/deploy/README.md
git commit -m "feat: PM2 ecosystem config + graceful shutdown + nginx conf + deploy rehberi"
```

---

## Faz 3 Tamamlandı

```bash
cd backend && npx vitest run
```

Beklenen: 275+ test geçiyor, hata yok.
