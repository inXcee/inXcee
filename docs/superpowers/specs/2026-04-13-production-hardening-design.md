# Production Hardening — Tasarım Dokümanı

**Tarih:** 2026-04-13  
**Kapsam:** YYS uygulamasını VPS'e deploy öncesi production-ready hale getirme — 38 güvenlik/güvenilirlik/kalite sorunu + kiosk PIN sistemi

---

## Genel Yaklaşım

4 fazlı düzeltme planı. Her faz kendi içinde test edilip commit'lenir. Faz 1 tamamlanmadan deploy yapılmaz. VPS + SQLite mimarisi korunur (15-50 eş zamanlı kullanıcı için yeterli). JWT localStorage'da kalır; XSS koruması Helmet CSP ile sağlanır.

---

## Faz 1 — Kritik Güvenlik

### C1: JWT_SECRET Hardcoded Fallback Kaldırılır

**Dosya:** `backend/src/shared/auth/service.js`

`const SECRET = process.env.JWT_SECRET || 'yys-dev-secret-change-in-prod'` satırı kaldırılır. Yerine server başlangıcında `JWT_SECRET` yoksa `process.exit(1)` ile hata verilir.

`render.yaml`'daki hardcoded `JWT_SECRET: yys-render-secret-2026` satırı kaldırılır, `# Set via Render dashboard environment variables` yorumuyla değiştirilir.

`backend/src/server.js`'de startup'ta zorunlu env kontrolü:
```js
const REQUIRED_ENV = ['JWT_SECRET']
const missing = REQUIRED_ENV.filter(k => !process.env[k])
if (missing.length) {
  console.error('[Startup] Eksik env değişkenleri:', missing.join(', '))
  process.exit(1)
}
```

### C2: seedDev() Production'da Çalışmaz

**Dosya:** `backend/src/server.js`

`seedDev()` çağrısı `if (process.env.NODE_ENV !== 'production')` bloğuna alınır. Production için `initProdDB()` fonksiyonu eklenir — yalnızca admin kullanıcı yoksa güçlü rastgele şifreli bir `campus_manager` oluşturur ve şifreyi console'a yazar (tek seferlik).

### C3: CORS Whitelist

**Dosya:** `backend/src/app.js`

`origin: true` kaldırılır. `ALLOWED_ORIGIN` env değişkeninden okuma:
```js
origin: process.env.ALLOWED_ORIGIN
  ? process.env.ALLOWED_ORIGIN.split(',')
  : ['http://localhost:5173', 'http://localhost:5174']
```

### C4: CSP ile XSS Koruması (localStorage korunur)

Helmet.js kurulur (Faz 3 M5 ile birlikte). CSP policy React + recharts + inline style uyumlu şekilde yapılandırılır. localStorage'daki JWT XSS'e karşı CSP kalkanıyla korunur.

### C5: SQLite Kalıcı Path

**Dosya:** `backend/src/shared/db/index.js`, `render.yaml`, `api/index.js`

`DB_PATH` default değeri `/tmp/yys.db` → `/var/data/yys.db` olarak değiştirilir. `render.yaml`'daki `/tmp/yys.db` kaldırılır. `.env.example`'a `DB_PATH=/var/data/yys.db` eklenir.

### C6: Self-Service Şifre Değiştirme

**Yeni endpoint:** `PATCH /api/auth/password`

Kendi token'ı ile giriş yapmış kullanıcı mevcut şifresini doğrulayıp yeni şifre belirleyebilir. Payload: `{ currentPassword, newPassword }`. Yeni şifre min 8 karakter zorunlu.

Frontend: Kullanıcı header dropdown'ına "Şifre Değiştir" modal'ı eklenir.

### C7: Sanitizer Whitelist Standardizasyonu

**Dosya:** `backend/src/shared/middleware/sanitize.js`

Skip listesi tüm base64/binary alanları kapsayacak şekilde genişletilir:
```js
const SKIP_FIELDS = [
  'digital_signature', 'photo_url', 'photo_before',
  'signature_data', 'occupant_signature', 'intake_signature',
  'photo_after', 'damage_photo'
]
```

---

## Faz 2 — Yüksek Öncelik

### H1: Global Error Handler

**Dosya:** `backend/src/server.js`, `backend/src/app.js`

Express error-handling middleware eklenir:
```js
app.use((err, req, res, next) => {
  console.error('[Express]', err.stack)
  res.status(err.status || 500).json({ error: 'Sunucu hatası' })
})
```

Node.js global handlers:
```js
process.on('unhandledRejection', (reason) => {
  console.error('[UnhandledRejection]', reason)
})
process.on('uncaughtException', (err) => {
  console.error('[UncaughtException]', err)
  process.exit(1)
})
```

### H2: Eksik writeLimiter'lar

**Dosya:** `backend/src/app.js`

`writeLimiter` şu route'lara eklenir: `/api/capacity`, `/api/self-service`, `/api/notifications`, `/api/whatsapp`. Dashboard, room-history ve reports read-only olduğundan eklenmez.

### H3: SSE Bağlantı Limiti

**Dosya:** `backend/src/shared/notifications/service.js`

Max 100 eş zamanlı SSE bağlantısı limiti. Limit aşılırsa eski bağlantı kapatılır (FIFO). Bağlantı koptuğunda `res.on('close')` ile Set'ten çıkarılır (zaten var — kontrol edilecek).

### H4: File Upload Magic Bytes Doğrulama

**Bağımlılık:** `file-type` paketi eklenir

`uploads/middleware.js`'de MIME type kontrolüne ek olarak dosyanın ilk byte'ları okunarak gerçek format doğrulanır. İzin verilen formatlar: `image/jpeg`, `image/png`, `image/webp`. Diğerleri reddedilir.

### H5: Uploads Güvenlik Headers

**Dosya:** `backend/src/app.js`

`express.static('uploads')` yerine:
```js
app.use('/uploads', (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Disposition', 'attachment')
  next()
}, express.static('uploads'))
```

### H6: requireKioskOrStaff Middleware Düzeltmesi

**Dosya:** `backend/src/shared/auth/middleware.js`

`requireKioskOrStaff` kiosk rolünü de kabul edecek şekilde düzeltilir. Kiosk JWT payload'ında `role: 'kiosk'` bulunur. Normal staff da kabul edilir.

### H7: Kiosk PIN Sistemi

**DB değişikliği:** `personnel` tablosuna `kiosk_pin TEXT` kolonu eklenir (hashed).

**Yeni endpoint'ler:**
- `POST /api/auth/kiosk-login` — `{ tc_no, pin }` ile giriş, kiosk JWT döner
- `POST /api/self-service/set-pin` — personel kendi PIN'ini belirler (kiosk token ile)
- `PATCH /api/users/:id/kiosk-pin` — admin personele PIN atar (campus_manager)

**Kiosk login akışı:**
1. TC no girilir → personel bulunur
2. PIN girilir → bcrypt ile doğrulanır
3. PIN yoksa: "Yöneticinizden PIN alın" mesajı
4. Doğruysa: kiosk-scoped JWT (1 saatlik, sınırlı claim'ler)

**Admin UI:** UsersPage benzeri bir "Kiosk PIN Yönetimi" bölümü — personel aranır, PIN atanır veya sıfırlanır.

**Self-service PIN değiştirme:** Kiosk giriş sonrası mevcut PIN + yeni PIN ile değiştirilir.

### H8: Migration Hata Loglama

**Dosya:** `backend/src/shared/db/index.js`

Tüm `catch(_) {}` blokları → `catch(e) { if (!e.message.includes('duplicate column')) console.error('[Migration]', e.message) }` olarak güncellenir. Gerçek hatalar loglanır, "already exists" hataları susturulur.

---

## Faz 3 — Orta Öncelik

### M1: .env.example

Proje kökünde `.env.example` oluşturulur, tüm env değişkenleri açıklamalı:

```env
# Zorunlu
JWT_SECRET=guclu-rastgele-deger-buraya
NODE_ENV=production

# Veritabanı
DB_PATH=/var/data/yys.db

# Sunucu
PORT=3001

# CORS
ALLOWED_ORIGIN=https://yourdomain.com

# SMTP (e-posta raporu)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

# WhatsApp (opsiyonel)
WHATSAPP_TOKEN=
WHATSAPP_PHONE_ID=
```

### M2: PM2 + Graceful Shutdown + Nginx

**`ecosystem.config.js`** proje kökünde:
```js
module.exports = {
  apps: [{
    name: 'yys-backend',
    script: 'backend/src/server.js',
    instances: 1,
    env_production: { NODE_ENV: 'production', PORT: 3001 }
  }]
}
```

**SIGTERM handler** `server.js`'e eklenir — aktif bağlantılar beklenir, DB kapanır.

**`nginx.conf`** örneği `docs/deploy/nginx.conf`'a eklenir: reverse proxy (3001 → 80/443), static file serving (frontend build), gzip, SSL hazırlığı.

**`docs/deploy/README.md`**: Adım adım VPS kurulum rehberi (Node.js, PM2, nginx, Let's Encrypt).

### M4: Pagination (4 kritik endpoint)

`?page=1&limit=50` offset-based. Default limit: 50, max: 200.

Etkilenen endpoint'ler:
- `GET /api/capacity/rooms`
- `GET /api/maintenance/requests`
- `GET /api/inventory`
- `GET /api/shifts/staff`

Response format: `{ data: [...], total: N, page: 1, limit: 50 }`

Frontend: İlgili sayfalara basit pagination UI eklenir.

### M5: Helmet.js

```js
import helmet from 'helmet'
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],   // React
      styleSrc: ["'self'", "'unsafe-inline'"],    // inline styles
      imgSrc: ["'self'", "data:", "blob:"],        // canvas/signature
      connectSrc: ["'self'"]
    }
  }
}))
```

### M6: Token Refresh

**Yeni endpoint:** `POST /api/auth/refresh`

Mevcut geçerli token ile yeni token alınır (sliding window). Token'ın kalan süresi 2 saatin altına düşünce frontend otomatik yeniler. `api/client.js`'de axios interceptor ile şeffaf yenileme.

### M7: Bildirim Deduplication

**DB değişikliği:** `notifications` tablosuna `dedup_key TEXT` kolonu. Stok bildirimi `dedup_key = 'stock_low_<item_id>_<date>'` kullanır. Aynı gün aynı item için ikinci bildirim oluşturulmaz.

### M8: Self-Service Maintenance Validasyonu

**Dosya:** `backend/src/modules/self-service/routes.js`

`location` min 3 karakter, `description` min 10 karakter zorunluluğu eklenir.

### M9: Frontend Route Guard

**Yeni bileşen:** `RoleRoute` — yetkisiz rolü `/` ana sayfaya yönlendirir.

```jsx
function RoleRoute({ roles, children }) {
  const { user } = useAuthStore()
  if (!roles.includes(user?.role)) return <Navigate to="/" replace />
  return children
}
```

Admin sayfaları (`/users`, `/audit`, `/settings`) `RoleRoute` ile sarmalanır.

### M11: Gelişmiş Health Check

`GET /api/health` yanıtına eklenir:
```json
{
  "status": "ok",
  "uptime": 3600,
  "db": "ok",
  "cronJobs": 5
}
```

DB ping: basit `SELECT 1` sorgusu. Hata varsa `"db": "error"` ve HTTP 503.

---

## Faz 4 — Düşük Öncelik

### L2: yys.db Git'ten Çıkarılır
`git rm --cached yys.db` + `.gitignore` doğrulanır.

### L3: Production Start Script
`backend/package.json`'a `"start": "node src/server.js"` eklenir.

### L4: CASCADE Deletes
`room_assignments`, `discipline_records`, `zimmet`, `notifications`, `shifts` tablolarında ilgili foreign key'lere `ON DELETE CASCADE` migration'ı eklenir.

### L5: Error Format Standardizasyonu
Tüm service fonksiyonları `{ error, status }` nesne yerine exception throw edecek şekilde güncellenir. Route'lar tek tip `{ error: string }` döner.

### L6: Loading Spinner
`App.jsx` Suspense fallback'i: tam ekran centered spinner bileşeni.

### L7: Query Param Sanitizasyonu
`sanitize.js` middleware `req.query` string değerlerini de temizler.

### L8: Body Limit
`express.json({ limit: '5mb' })` → `'1mb'`. İmza/fotoğraf endpoint'leri için `'5mb'` ayrı middleware olarak sadece ilgili route'lara uygulanır.

### L9: Cache-Control Private
Dashboard cache middleware'inde `public` → `private`.

### L10: Service Worker
Boşsa kaldırılır. `OfflineBanner` bileşeni de kaldırılır.

### L11: Seed Tarih Düzeltmesi
`seed.js`'deki hardcoded `'2026-03-22'` → `new Date().toISOString().split('T')[0]`.

### L12: HTTPS / SSL
`docs/deploy/README.md`'de Certbot + Let's Encrypt kurulum adımları. Nginx config'e SSL bloku eklenir.

### L1: Test Coverage
`notifications/service.js`, `cron/index.js` için temel birim testleri. Whatsapp mock testi.

---

## Kapsam Dışı

- PostgreSQL geçişi (VPS + SQLite yeterli)
- OAuth / SSO entegrasyonu
- Multi-tenant yapı
- Mobile uygulama

---

## Özet

| Faz | Sorun Sayısı | Tahmini Commit Sayısı |
|-----|-------------|----------------------|
| 1 — Kritik Güvenlik | 7 | ~10 |
| 2 — Yüksek Öncelik | 8 | ~12 |
| 3 — Orta Öncelik | 11 | ~15 |
| 4 — Düşük Öncelik | 12 | ~10 |
| **Toplam** | **38 + kiosk PIN** | **~47** |
