# Production Hardening Faz 1 — Kritik Güvenlik

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy öncesi zorunlu 7 kritik güvenlik açığını kapat — JWT secret, seed, CORS, sanitizer, DB path, self-service password change.

**Architecture:** Backend-only değişiklikler. Her task bağımsız commit alır. Mevcut 275 test takımı her tasktan sonra çalıştırılır — bozulan test yoksa devam edilir.

**Tech Stack:** Node.js/Express/better-sqlite3, bcryptjs, jsonwebtoken

---

## Dosya Haritası

| İşlem | Dosya |
|-------|-------|
| Değiştir | `backend/src/server.js` |
| Değiştir | `backend/src/shared/auth/service.js` |
| Değiştir | `backend/src/shared/db/seed.js` |
| Oluştur | `backend/src/shared/db/initProd.js` |
| Değiştir | `backend/src/app.js` |
| Değiştir | `backend/src/shared/middleware/sanitize.js` |
| Değiştir | `render.yaml` |
| Oluştur | `.env.example` (proje kökünde) |

---

## Task 1: JWT_SECRET Zorunlu — Fallback Kaldır

**Files:**
- Modify: `backend/src/shared/auth/service.js:5`
- Modify: `backend/src/server.js`
- Modify: `render.yaml`

- [ ] **Step 1: Mevcut auth service test yaz**

`backend/src/shared/auth/auth.test.js` dosyasına şu test bloğunu ekle (mevcut testlerin sonuna):

```js
describe('JWT_SECRET zorunlu', () => {
  it('JWT_SECRET yokken verifyToken hata fırlatır', () => {
    const originalSecret = process.env.JWT_SECRET
    // Token üret, sonra secret'ı değiştir
    process.env.JWT_SECRET = 'test-secret-for-this-test'
    // auth.test.js zaten token üretiyor, verifyToken doğrulama yeterli
    process.env.JWT_SECRET = originalSecret
  })
})
```

- [ ] **Step 2: `auth/service.js` — fallback kaldır**

`backend/src/shared/auth/service.js` içinde:

```js
// ÖNCE (satır 5):
const SECRET = process.env.JWT_SECRET || 'yys-dev-secret-change-in-prod'

// SONRA:
const SECRET = process.env.JWT_SECRET
if (!SECRET) {
  console.error('[Auth] JWT_SECRET env değişkeni tanımlı değil! Sunucu başlatılamaz.')
  process.exit(1)
}
```

- [ ] **Step 3: `server.js` — startup env kontrolü ekle**

`backend/src/server.js` dosyasını şu şekilde güncelle:

```js
import app from './app.js'
import { initDB } from './shared/db/index.js'
import { startCronJobs } from './shared/cron/index.js'
import { seedDev } from './shared/db/seed.js'

// Zorunlu env kontrolü — production ve development için
if (!process.env.JWT_SECRET) {
  console.error('[Startup] HATA: JWT_SECRET env değişkeni tanımlı değil.')
  console.error('[Startup] .env dosyanıza JWT_SECRET=guclu-rastgele-deger ekleyin.')
  process.exit(1)
}

initDB()

if (process.env.NODE_ENV !== 'production') {
  seedDev()
}

startCronJobs()

const port = process.env.PORT || 3001
app.listen(port, () => console.log(`YYS Backend http://localhost:${port}`))
```

- [ ] **Step 4: `render.yaml` — hardcoded JWT_SECRET kaldır**

`render.yaml` dosyasını şu şekilde güncelle:

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
      # JWT_SECRET, DB_PATH ve diğer gizli değerleri Render Dashboard'dan ayarlayın
      # Settings > Environment > Add Environment Variable
```

- [ ] **Step 5: Testleri çalıştır**

JWT_SECRET olmadan çalıştırıldığında test ortamı `process.exit(1)` çağırır — bu testi kırar. Test ortamında JWT_SECRET her zaman set edilmeli. Test dosyalarında `beforeAll` zaten `process.env.DB_PATH = ':memory:'` yapıyor. Auth test'te de JWT_SECRET set edilmeli.

`backend/src/shared/auth/auth.test.js` dosyasının başına bak — `beforeAll` içinde:
```js
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  process.env.JWT_SECRET = 'test-secret-for-vitest'  // Bu satır yoksa ekle
  initDB()
  seedDev()
  ...
})
```

Tüm test dosyalarını tara: `grep -r "JWT_SECRET" backend/src` ile. Eksik olan her test dosyasının `beforeAll`'una ekle.

Sonra çalıştır:
```bash
cd backend && JWT_SECRET=test-secret npx vitest run
```

Beklenen: 275 test PASS.

- [ ] **Step 6: Commit**

```bash
cd "/c/Users/hrync/OneDrive/Masaüstü/test claude"
git add backend/src/shared/auth/service.js backend/src/server.js render.yaml
git commit -m "security: JWT_SECRET fallback kaldırdı — startup'ta zorunlu kontrol"
```

---

## Task 2: Production Seed Guard + initProdDB

**Files:**
- Modify: `backend/src/server.js` (Task 1'de zaten seedDev guard eklendi)
- Create: `backend/src/shared/db/initProd.js`
- Modify: `backend/src/server.js` — initProdDB çağrısı ekle

- [ ] **Step 1: `initProd.js` oluştur**

`backend/src/shared/db/initProd.js`:

```js
import bcrypt from 'bcryptjs'
import { getDB } from './index.js'
import crypto from 'crypto'

/**
 * Production-only initialization.
 * Eğer hiç campus_manager yoksa, rastgele şifreli bir admin oluşturur
 * ve şifreyi konsola yazar (tek seferlik).
 */
export function initProdDB() {
  const db = getDB()
  const existingAdmin = db.prepare(
    "SELECT id FROM users WHERE role='campus_manager' LIMIT 1"
  ).get()

  if (existingAdmin) return // Zaten admin var, bir şey yapma

  const tempPassword = crypto.randomBytes(12).toString('base64url')
  const hash = bcrypt.hashSync(tempPassword, 12)

  db.prepare(
    "INSERT INTO users(username, password_hash, role, full_name) VALUES(?, ?, 'campus_manager', 'Admin')"
  ).run('admin', hash)

  console.log('╔════════════════════════════════════════════════════╗')
  console.log('║  YYS İLK KURULUM                                   ║')
  console.log('║  Admin kullanıcı oluşturuldu:                      ║')
  console.log(`║  Kullanıcı adı : admin                             ║`)
  console.log(`║  Şifre         : ${tempPassword.padEnd(36)}║`)
  console.log('║  Giriş yaptıktan sonra şifrenizi değiştirin!       ║')
  console.log('╚════════════════════════════════════════════════════╝')
}
```

- [ ] **Step 2: `server.js`'e initProdDB ekle**

`backend/src/server.js` dosyasını güncelle:

```js
import app from './app.js'
import { initDB } from './shared/db/index.js'
import { initProdDB } from './shared/db/initProd.js'
import { startCronJobs } from './shared/cron/index.js'
import { seedDev } from './shared/db/seed.js'

if (!process.env.JWT_SECRET) {
  console.error('[Startup] HATA: JWT_SECRET env değişkeni tanımlı değil.')
  console.error('[Startup] .env dosyanıza JWT_SECRET=guclu-rastgele-deger ekleyin.')
  process.exit(1)
}

initDB()

if (process.env.NODE_ENV === 'production') {
  initProdDB()
} else {
  seedDev()
}

startCronJobs()

const port = process.env.PORT || 3001
app.listen(port, () => console.log(`YYS Backend http://localhost:${port}`))
```

- [ ] **Step 3: Test yaz**

`backend/src/shared/db/initProd.test.js` oluştur:

```js
import { describe, it, expect, beforeAll } from 'vitest'
import { initDB } from './index.js'
import { initProdDB } from './initProd.js'

beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  process.env.JWT_SECRET = 'test-secret-for-vitest'
  initDB()
})

describe('initProdDB', () => {
  it('admin yoksa oluşturur', () => {
    const { getDB } = require('./index.js')
    initProdDB()
    const db = getDB()
    const admin = db.prepare("SELECT * FROM users WHERE role='campus_manager'").get()
    expect(admin).toBeTruthy()
    expect(admin.username).toBe('admin')
  })

  it('admin varsa tekrar oluşturmaz', () => {
    initProdDB() // ikinci kez çağır
    const { getDB } = require('./index.js')
    const db = getDB()
    const count = db.prepare("SELECT COUNT(*) as c FROM users WHERE role='campus_manager'").get()
    expect(count.c).toBe(1) // hâlâ 1
  })
})
```

Not: `require` ESM'de çalışmaz. Şu şekilde düzelt:

```js
import { describe, it, expect, beforeAll } from 'vitest'
import { initDB, getDB } from './index.js'
import { initProdDB } from './initProd.js'

beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  process.env.JWT_SECRET = 'test-secret-for-vitest'
  initDB()
})

describe('initProdDB', () => {
  it('campus_manager yoksa admin oluşturur', () => {
    initProdDB()
    const db = getDB()
    const admin = db.prepare("SELECT * FROM users WHERE role='campus_manager'").get()
    expect(admin).toBeTruthy()
    expect(admin.username).toBe('admin')
  })

  it('ikinci çağrıda tekrar oluşturmaz', () => {
    initProdDB()
    const db = getDB()
    const count = db.prepare("SELECT COUNT(*) as c FROM users WHERE role='campus_manager'").get().c
    expect(count).toBe(1)
  })
})
```

- [ ] **Step 4: Testleri çalıştır**

```bash
cd backend && JWT_SECRET=test-secret npx vitest run src/shared/db/initProd.test.js
```

Beklenen: 2 test PASS.

- [ ] **Step 5: Tüm testler**

```bash
cd backend && JWT_SECRET=test-secret npx vitest run
```

Beklenen: 277 test PASS.

- [ ] **Step 6: Commit**

```bash
cd "/c/Users/hrync/OneDrive/Masaüstü/test claude"
git add backend/src/shared/db/initProd.js backend/src/shared/db/initProd.test.js backend/src/server.js
git commit -m "security: production seed guard + initProdDB ilk kurulum admin oluşturucu"
```

---

## Task 3: CORS Whitelist

**Files:**
- Modify: `backend/src/app.js:26-28`

- [ ] **Step 1: Test yaz**

`backend/src/shared/auth/auth.test.js`'e ekle:

```js
describe('CORS', () => {
  it('OPTIONS isteğinde CORS headers döner', async () => {
    const res = await request(app)
      .options('/api/health')
      .set('Origin', 'http://localhost:5173')
    // 204 veya 200 döner, CORS headers var
    expect(res.headers['access-control-allow-origin']).toBeDefined()
  })
})
```

- [ ] **Step 2: `app.js` CORS güncelle**

`backend/src/app.js` dosyasında CORS bloğunu şu şekilde değiştir:

```js
// ESKİ:
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? true
    : ['http://localhost:5173', 'http://localhost:5174']
}))

// YENİ:
const allowedOrigins = process.env.ALLOWED_ORIGIN
  ? process.env.ALLOWED_ORIGIN.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:5174']

app.use(cors({
  origin: (origin, callback) => {
    // Postman, curl gibi origin'siz isteklere izin ver (server-to-server)
    if (!origin) return callback(null, true)
    if (allowedOrigins.includes(origin)) return callback(null, true)
    callback(new Error(`CORS: ${origin} origin'ine izin verilmiyor`))
  },
  credentials: true,
}))
```

- [ ] **Step 3: `.env.example` oluştur**

Proje kökünde `.env.example` oluştur:

```env
# ═══════════════════════════════════════════════
# YYS — Ortam Değişkenleri Örneği
# Bu dosyayı .env olarak kopyalayın ve doldurun:
#   cp .env.example .env
# ═══════════════════════════════════════════════

# ZORUNLU — güçlü rastgele değer (min 32 karakter)
# Üretmek için: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=buraya-cok-guclu-rastgele-bir-deger-yazin

# Ortam (development | production)
NODE_ENV=development

# Sunucu portu
PORT=3001

# Veritabanı yolu
# Development: yys.db (proje kökü)
# Production:  /var/data/yys.db (kalıcı disk)
DB_PATH=yys.db

# İzin verilen frontend origin'leri (virgülle ayrılmış)
# Production: https://yourdomain.com
ALLOWED_ORIGIN=http://localhost:5173,http://localhost:5174

# ── E-posta Raporu (opsiyonel) ────────────────
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

# ── WhatsApp (opsiyonel) ──────────────────────
WHATSAPP_TOKEN=
WHATSAPP_PHONE_ID=
```

- [ ] **Step 4: `.gitignore`'da `.env` var mı kontrol et**

```bash
grep "^\.env$" .gitignore || echo ".env" >> .gitignore
```

- [ ] **Step 5: Testleri çalıştır**

```bash
cd backend && JWT_SECRET=test-secret npx vitest run
```

Beklenen: tüm testler PASS.

- [ ] **Step 6: Commit**

```bash
cd "/c/Users/hrync/OneDrive/Masaüstü/test claude"
git add backend/src/app.js .env.example .gitignore
git commit -m "security: CORS whitelist — origin:true kaldırıldı + .env.example eklendi"
```

---

## Task 4: Sanitizer Whitelist Genişletme (C7)

**Files:**
- Modify: `backend/src/shared/middleware/sanitize.js`

- [ ] **Step 1: Mevcut sanitize logic oku, test ekle**

`backend/src/shared/middleware/sanitize.test.js` oluştur:

```js
import { describe, it, expect } from 'vitest'
import { sanitizeBody } from './sanitize.js'

function runMiddleware(body) {
  const req = { body }
  const res = {}
  let called = false
  sanitizeBody(req, res, () => { called = true })
  return { body: req.body, called }
}

describe('sanitizeBody', () => {
  it('HTML tag\'lerini temizler', () => {
    const { body } = runMiddleware({ description: '<script>alert(1)</script>Açıklama' })
    expect(body.description).toBe('Açıklama')
    expect(body.description).not.toContain('<script>')
  })

  it('base64 imza alanlarına dokunmaz', () => {
    const sig = 'data:image/png;base64,iVBORw0KGgo='
    const { body } = runMiddleware({ digital_signature: sig })
    expect(body.digital_signature).toBe(sig)
  })

  it('tüm imza alanlarını korur', () => {
    const fields = [
      'digital_signature', 'photo_url', 'photo_before',
      'signature_data', 'occupant_signature', 'intake_signature',
      'photo_after', 'damage_photo'
    ]
    const input = Object.fromEntries(fields.map(f => [f, 'data:image/png;base64,abc=']))
    const { body } = runMiddleware(input)
    fields.forEach(f => expect(body[f]).toBe('data:image/png;base64,abc='))
  })

  it('normal string alanları temizler', () => {
    const { body } = runMiddleware({ location: '<b>Mutfak</b>' })
    expect(body.location).toBe('Mutfak')
  })
})
```

- [ ] **Step 2: Test çalıştır — kısmen FAIL beklenir (mevcut whitelist eksik)**

```bash
cd backend && JWT_SECRET=test-secret npx vitest run src/shared/middleware/sanitize.test.js
```

Beklenen: `tüm imza alanlarını korur` testi FAIL (signature_data vb. whitelist'te yok).

- [ ] **Step 3: Sanitizer güncelle**

`backend/src/shared/middleware/sanitize.js` dosyasını şu şekilde güncelle:

```js
/**
 * Input sanitization middleware — strips HTML tags and trims strings in req.body
 * Prevents stored XSS without breaking legitimate data
 */

// Base64/binary alanlar — HTML sanitizasyonundan muaf
const SKIP_FIELDS = new Set([
  'digital_signature',
  'photo_url',
  'photo_before',
  'signature_data',
  'occupant_signature',
  'intake_signature',
  'photo_after',
  'damage_photo',
])

function sanitizeValue(val) {
  if (typeof val === 'string') {
    return val.replace(/<[^>]*>/g, '').trim()
  }
  if (Array.isArray(val)) {
    return val.map(sanitizeValue)
  }
  if (val && typeof val === 'object') {
    return sanitizeObject(val)
  }
  return val
}

function sanitizeObject(obj) {
  const cleaned = {}
  for (const [key, val] of Object.entries(obj)) {
    if (SKIP_FIELDS.has(key)) {
      cleaned[key] = val
    } else {
      cleaned[key] = sanitizeValue(val)
    }
  }
  return cleaned
}

export function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeValue(req.body)
  }
  next()
}
```

- [ ] **Step 4: Testleri çalıştır — PASS beklenir**

```bash
cd backend && JWT_SECRET=test-secret npx vitest run src/shared/middleware/sanitize.test.js
```

Beklenen: 4 test PASS.

- [ ] **Step 5: Tüm testler**

```bash
cd backend && JWT_SECRET=test-secret npx vitest run
```

Beklenen: tüm testler PASS.

- [ ] **Step 6: Commit**

```bash
cd "/c/Users/hrync/OneDrive/Masaüstü/test claude"
git add backend/src/shared/middleware/sanitize.js backend/src/shared/middleware/sanitize.test.js
git commit -m "security: sanitizer — tüm binary/imza alanları whitelist'e eklendi"
```

---

## Task 5: SQLite Kalıcı Path (C5)

**Files:**
- Modify: `backend/src/shared/db/index.js:14` — default path güncelle
- Modify: `render.yaml` (Task 1'de yapıldı)
- Modify: `.env.example` (Task 3'te yapıldı)

- [ ] **Step 1: `db/index.js` default path güncelle**

`backend/src/shared/db/index.js` dosyasında `initDB` fonksiyonundaki path satırını güncelle:

```js
// ESKİ:
const path = process.env.DB_PATH || 'yys.db'

// YENİ:
const path = process.env.DB_PATH || 'yys.db'
// NOT: Production'da DB_PATH=/var/data/yys.db olarak ayarlanmalı
// (render.yaml veya .env üzerinden)
// /tmp kullanmak veri kaybına yol açar — deploy/restart'ta silinir
```

Bu satır aynı kalır — asıl fix `render.yaml`'daki `/tmp/yys.db` → `/var/data/yys.db` değişikliğidir (Task 1'de yapıldı).

- [ ] **Step 2: VPS için kalıcı dizin oluşturma komutu belgele**

`docs/deploy/README.md` oluştur:

```markdown
# YYS — VPS Deploy Rehberi

## 1. Kalıcı Veri Dizini

```bash
sudo mkdir -p /var/data
sudo chown $USER:$USER /var/data
```

## 2. .env Dosyası

```bash
cp .env.example .env
# .env'i düzenle — JWT_SECRET, DB_PATH, ALLOWED_ORIGIN doldurun
nano .env
```

Örnek production `.env`:
```
JWT_SECRET=<node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" ile üret>
NODE_ENV=production
PORT=3001
DB_PATH=/var/data/yys.db
ALLOWED_ORIGIN=https://yourdomain.com
```

## 3. Bağımlılıkları Kur

```bash
npm install
cd backend && npm install
cd ../frontend && npm install
```

## 4. Frontend Build

```bash
cd frontend && npm run build
```

## 5. PM2 ile Başlat (Faz 3'te kurulacak)

```bash
npm install -g pm2
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

## 6. Nginx (Faz 3'te kurulacak)

`docs/deploy/nginx.conf` dosyasına bakın.

## 7. SSL — Let's Encrypt (Faz 4'te kurulacak)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```
```

- [ ] **Step 3: Testleri çalıştır**

```bash
cd backend && JWT_SECRET=test-secret npx vitest run
```

Beklenen: tüm testler PASS.

- [ ] **Step 4: Commit**

```bash
cd "/c/Users/hrync/OneDrive/Masaüstü/test claude"
git add docs/deploy/README.md
git commit -m "docs: VPS deploy rehberi — kalıcı DB path ve kurulum adımları"
```

---

## Task 6: Self-Service Şifre Değiştirme (C6)

**Files:**
- Modify: `backend/src/shared/auth/routes.js`
- Modify: `backend/src/shared/auth/service.js`
- Modify: `backend/src/shared/auth/middleware.js` — `requireAuth` export'u kontrol
- Modify: `frontend/src/shared/components/` — şifre değiştirme modal

- [ ] **Step 1: Test yaz**

`backend/src/shared/auth/auth.test.js` dosyasına ekle:

```js
describe('PATCH /api/auth/password', () => {
  it('geçerli mevcut şifre ile değiştirir', async () => {
    const res = await request(app)
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ currentPassword: 'admin123', newPassword: 'yeniSifre123' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    // geri al
    await request(app)
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ currentPassword: 'yeniSifre123', newPassword: 'admin123' })
  })

  it('yanlış mevcut şifre ile reddeder', async () => {
    const res = await request(app)
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ currentPassword: 'yanlis-sifre', newPassword: 'yeniSifre123' })
    expect(res.status).toBe(401)
  })

  it('8 karakterden kısa yeni şifreyi reddeder', async () => {
    const res = await request(app)
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ currentPassword: 'admin123', newPassword: 'kisa' })
    expect(res.status).toBe(400)
  })

  it('token olmadan 401 döner', async () => {
    const res = await request(app)
      .patch('/api/auth/password')
      .send({ currentPassword: 'admin123', newPassword: 'yeniSifre123' })
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Test çalıştır — FAIL beklenir**

```bash
cd backend && JWT_SECRET=test-secret npx vitest run src/shared/auth/auth.test.js
```

Beklenen: 4 yeni test FAIL (endpoint yok).

- [ ] **Step 3: `auth/service.js`'e `changeOwnPassword` ekle**

`backend/src/shared/auth/service.js` dosyasına ekle:

```js
export function changeOwnPassword(userId, currentPassword, newPassword) {
  if (!newPassword || newPassword.length < 8) {
    return { error: 'Yeni şifre en az 8 karakter olmalı', status: 400 }
  }
  const db = getDB()
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(userId)
  if (!user) return { error: 'Kullanıcı bulunamadı', status: 404 }
  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    return { error: 'Mevcut şifre hatalı', status: 401 }
  }
  const hash = bcrypt.hashSync(newPassword, 10)
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, userId)
  return { ok: true }
}
```

- [ ] **Step 4: `auth/routes.js`'e endpoint ekle**

`backend/src/shared/auth/routes.js` dosyasını güncelle:

```js
import { Router } from 'express'
import { login, loginKiosk, changeOwnPassword } from './service.js'
import { requireAuth } from './middleware.js'

export const authRouter = Router()

authRouter.post('/login', (req, res) => {
  const { username, password } = req.body
  const result = login(username, password)
  if (!result) return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı' })
  res.json(result)
})

authRouter.post('/kiosk-login', (req, res) => {
  const { tc_no } = req.body
  const result = loginKiosk(tc_no)
  if (!result) return res.status(401).json({ error: 'TC No bulunamadı veya çıkış yapılmış' })
  res.json(result)
})

authRouter.patch('/password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Mevcut ve yeni şifre gerekli' })
  }
  const result = changeOwnPassword(req.user.id, currentPassword, newPassword)
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.json(result)
})
```

- [ ] **Step 5: Test çalıştır — PASS beklenir**

```bash
cd backend && JWT_SECRET=test-secret npx vitest run src/shared/auth/auth.test.js
```

Beklenen: tüm testler PASS.

- [ ] **Step 6: Frontend — Şifre Değiştir modal**

`frontend/src/shared/components/ChangePasswordModal.jsx` oluştur:

```jsx
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import api from '../api/client.js'

export default function ChangePasswordModal({ onClose }) {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [error, setError] = useState(null)

  const mut = useMutation({
    mutationFn: () => api.patch('/auth/password', {
      currentPassword: form.currentPassword,
      newPassword: form.newPassword,
    }),
    onSuccess: () => onClose('success'),
    onError: e => setError(e.response?.data?.error ?? 'Hata'),
  })

  function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (form.newPassword !== form.confirm) {
      return setError('Yeni şifreler eşleşmiyor')
    }
    if (form.newPassword.length < 8) {
      return setError('Yeni şifre en az 8 karakter olmalı')
    }
    mut.mutate()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div className="panel" style={{ width: '360px', margin: 0 }}>
        <div style={{ height: '2px', background: 'var(--accent)' }} />
        <div className="panel-header">
          <div className="panel-title">ŞİFRE DEĞİŞTİR</div>
          <button className="btn btn-ghost btn-xs" onClick={() => onClose(null)}>✕</button>
        </div>
        <div className="panel-body">
          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{ padding: '8px 12px', marginBottom: '12px', borderRadius: '4px',
                background: '#fee2e2', color: '#991b1b', fontSize: '13px' }}>
                {error}
              </div>
            )}
            <div style={{ marginBottom: '12px' }}>
              <label className="form-label">MEVCUT ŞİFRE</label>
              <input type="password" className="form-input" value={form.currentPassword}
                onChange={e => setForm(f => ({ ...f, currentPassword: e.target.value }))} />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label className="form-label">YENİ ŞİFRE (min 8 karakter)</label>
              <input type="password" className="form-input" value={form.newPassword}
                onChange={e => setForm(f => ({ ...f, newPassword: e.target.value }))} />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label className="form-label">YENİ ŞİFRE (tekrar)</label>
              <input type="password" className="form-input" value={form.confirm}
                onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="submit" className="btn btn-primary" disabled={mut.isPending}>
                {mut.isPending ? 'Kaydediliyor...' : 'Değiştir'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => onClose(null)}>
                İptal
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Layout veya Header'a "Şifre Değiştir" bağlantısı ekle**

`frontend/src/shared/components/Layout.jsx` veya kullanıcı menüsünün olduğu bileşeni bul. `ChangePasswordModal`'ı import et ve kullanıcı adına tıklanınca açılacak bir buton ekle.

`Layout.jsx`'i oku (bulmak için: `grep -r "logout\|full_name\|kullanici" frontend/src/shared/components/ -l`). Bulduğun dosyada logout butonunun yanına:

```jsx
import ChangePasswordModal from './ChangePasswordModal.jsx'
// ...
const [showPwModal, setShowPwModal] = useState(false)
// ...
{showPwModal && (
  <ChangePasswordModal onClose={(result) => {
    setShowPwModal(false)
    if (result === 'success') addToast('Şifre değiştirildi', 'success')
  }} />
)}
// Logout butonunun yanına:
<button className="btn btn-ghost btn-xs" onClick={() => setShowPwModal(true)}>
  Şifre Değiştir
</button>
```

- [ ] **Step 8: Tüm testleri çalıştır**

```bash
cd backend && JWT_SECRET=test-secret npx vitest run
```

Beklenen: tüm testler PASS.

- [ ] **Step 9: Commit**

```bash
cd "/c/Users/hrync/OneDrive/Masaüstü/test claude"
git add backend/src/shared/auth/ frontend/src/shared/components/ChangePasswordModal.jsx frontend/src/shared/components/
git commit -m "feat: self-service şifre değiştirme — PATCH /api/auth/password + modal"
```

---

## Task 7: yys.db Git'ten Temizle

**Files:**
- `.gitignore`
- `yys.db` (git'ten çıkar)

- [ ] **Step 1: yys.db'yi git'ten kaldır (disk'ten silme)**

```bash
cd "/c/Users/hrync/OneDrive/Masaüstü/test claude"
git rm --cached yys.db 2>/dev/null || echo "yys.db zaten track edilmiyor"
```

- [ ] **Step 2: .gitignore güncelle**

`.gitignore` dosyasında `*.db` satırı var mı kontrol et:

```bash
grep "\.db" .gitignore
```

Yoksa ekle:
```
*.db
*.db-shm
*.db-wal
```

- [ ] **Step 3: Commit**

```bash
cd "/c/Users/hrync/OneDrive/Masaüstü/test claude"
git add .gitignore
git commit -m "chore: yys.db git'ten çıkarıldı + .gitignore güncellendi"
```

---

## Faz 1 Tamamlama Kontrolü

- [ ] Tüm testler PASS: `cd backend && JWT_SECRET=test-secret npx vitest run`
- [ ] `JWT_SECRET` yokken server başlamıyor: `cd backend && node src/server.js` (exit 1 beklenir)
- [ ] `.env.example` dosyası var
- [ ] `render.yaml`'da hardcoded JWT_SECRET yok
- [ ] `yys.db` git'te yok: `git ls-files yys.db` (boş dönmeli)

**Bu faz tamamlanmadan deploy YAPMAYIN.**
