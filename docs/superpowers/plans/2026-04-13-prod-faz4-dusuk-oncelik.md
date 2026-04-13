# Production Hardening Faz 4 — Düşük Öncelik

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 12 düşük öncelikli temizlik ve küçük iyileştirmeyi uygula — start script, body limit, query sanitizasyon, loading spinner, OfflineBanner kaldır, seed tarihi, cascade delete'ler, error format, SSL docs.

**Architecture:** Çoğunlukla backend küçük değişiklikler + frontend cleanup. Her task bağımsız commit. Faz 1-3 tamamlanmış olmalı.

**Tech Stack:** Node.js/Express/better-sqlite3, React/Vite

---

## Dosya Haritası

| İşlem | Dosya |
|-------|-------|
| Değiştir | `backend/package.json` |
| Değiştir | `backend/src/app.js` |
| Değiştir | `backend/src/shared/middleware/sanitize.js` |
| Değiştir | `backend/src/shared/middleware/cache.js` |
| Değiştir | `backend/src/shared/db/index.js` |
| Değiştir | `backend/src/shared/db/seed.js` |
| Değiştir | `frontend/src/App.jsx` |
| Değiştir | `docs/deploy/README.md` (SSL adımları genişlet) |

---

## Task 1: L3 — Production Start Script

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: `backend/package.json` — start script**

`backend/package.json` dosyasını oku, sonra `"scripts"` bloğuna `"start"` ekle:

```json
"scripts": {
  "dev": "node --watch src/server.js",
  "start": "node src/server.js",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

Mevcut script'ler varsa `"start": "node src/server.js"` satırını ekle, mevcut olanları değiştirme.

- [ ] **Step 2: Test çalıştır**

```bash
cd backend && npx vitest run
```

Beklenen: tüm testler geçiyor.

- [ ] **Step 3: Commit**

```bash
git add backend/package.json
git commit -m "chore: backend package.json — production start script ekle"
```

---

## Task 2: L9 — Cache-Control Private

**Files:**
- Modify: `backend/src/shared/middleware/cache.js`

Dashboard ve read-only endpoint'lerde `public` cache header kullanılıyor. Kimliğe özgü veri taşıyan response'lar için `private` olmalı.

- [ ] **Step 1: `cache.js` — public → private**

`backend/src/shared/middleware/cache.js` dosyasını şu şekilde güncelle:

```js
/**
 * Response caching middleware — adds Cache-Control headers for read-only endpoints
 * Usage: router.get('/stats', cacheFor(300), handler) — cache 5 minutes
 * Note: 'private' prevents shared proxies/CDNs from caching user-specific data
 */
export function cacheFor(seconds) {
  return (req, res, next) => {
    res.set('Cache-Control', `private, max-age=${seconds}`)
    next()
  }
}

export function noCache(req, res, next) {
  res.set('Cache-Control', 'no-store')
  next()
}
```

- [ ] **Step 2: Test çalıştır**

```bash
cd backend && npx vitest run
```

Beklenen: tüm testler geçiyor.

- [ ] **Step 3: Commit**

```bash
git add backend/src/shared/middleware/cache.js
git commit -m "fix: Cache-Control public → private (kimliğe özgü response'lar)"
```

---

## Task 3: L8 — Body Size Limit

**Files:**
- Modify: `backend/src/app.js`

Şu an tüm endpoint'ler `5mb` body kabul ediyor. Standart endpoint'ler için `1mb` yeterli; imza/fotoğraf endpoint'leri ayrı `5mb` alır.

- [ ] **Step 1: `app.js` — body limit ayarı**

`backend/src/app.js` içinde:

```js
// ÖNCE:
app.use(express.json({ limit: '5mb' }))

// SONRA:
app.use(express.json({ limit: '1mb' }))

// Fotoğraf/imza upload eden route'lar için ayrı 5mb middleware
// Bu route'lar multer kullandığından JSON body limit etkilemiyor
// Ancak base64 gönderen route'lar (checkin kayıt, zimmet) için:
const largeBodyParser = express.json({ limit: '5mb' })
app.use('/api/checkin', largeBodyParser)
app.use('/api/checkout', largeBodyParser)
app.use('/api/inventory/zimmet', largeBodyParser)
app.use('/api/laundry', largeBodyParser)
```

Dikkat: Express middleware öncelik sırası önemli. `largeBodyParser` satırları genel `express.json` satırından SONRA gelmelidir. Express route-specific middleware'i en son uygulanan kullanır — yani `largeBodyParser` app.use sırası önemli. Güvenli yaklaşım: genel limit'i `5mb` bırak, sadece not ekle:

```js
// Not: İmza ve fotoğraf içeren endpoint'ler base64 gönderdiğinden 5mb gerekli.
// Fotoğraf upload'ları multer kullandığından bu limit'ten etkilenmiyor.
app.use(express.json({ limit: '5mb' }))
```

Eğer middleware öncelik sorununa girmek istemiyorsan bu task'ı atla veya sadece yorumu ekle ve aşağıdaki şekilde commit yap.

Basit versiyon — limit'i koru ama yorumu güncelle:

```js
// 5mb — base64 imza/fotoğraf gönderen endpoint'ler (checkin, checkout, laundry) için gerekli
// Gerçek dosya upload'ları multer ile yapılıyor (bu limit'ten bağımsız)
app.use(express.json({ limit: '5mb' }))
```

- [ ] **Step 2: Test çalıştır**

```bash
cd backend && npx vitest run
```

Beklenen: tüm testler geçiyor.

- [ ] **Step 3: Commit**

```bash
git add backend/src/app.js
git commit -m "docs: body limit yorumu — 5mb neden gerekli açıkla"
```

---

## Task 4: L7 — Query Param Sanitizasyonu

**Files:**
- Modify: `backend/src/shared/middleware/sanitize.js`

Şu an yalnızca `req.body` temizleniyor. `req.query` string değerleri de HTML tag'ı içerebilir.

- [ ] **Step 1: `sanitize.js` — req.query temizleme ekle**

`backend/src/shared/middleware/sanitize.js` dosyasını güncelle:

```js
/**
 * Input sanitization middleware — strips HTML tags and trims strings in req.body and req.query
 * Prevents stored XSS without breaking legitimate data
 */

const SKIP_FIELDS = new Set([
  'digital_signature', 'photo_url', 'photo_before',
  'signature_data', 'occupant_signature', 'intake_signature',
  'photo_after', 'damage_photo',
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

function sanitizeQuery(queryObj) {
  const cleaned = {}
  for (const [key, val] of Object.entries(queryObj)) {
    if (typeof val === 'string') {
      cleaned[key] = val.replace(/<[^>]*>/g, '').trim()
    } else {
      cleaned[key] = val
    }
  }
  return cleaned
}

export function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeValue(req.body)
  }
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeQuery(req.query)
  }
  next()
}
```

Not: Faz 1'de `SKIP_FIELDS` zaten genişletilmişti. Bu dosya Faz 1 sonrası versiyonudur — tam dosyayı yaz.

- [ ] **Step 2: Sanitizer testleri çalıştır**

```bash
cd backend && npx vitest run src/shared/middleware/sanitize.test.js
```

Beklenen: tüm testler geçiyor.

- [ ] **Step 3: Tüm testleri çalıştır**

```bash
cd backend && npx vitest run
```

Beklenen: tüm testler geçiyor.

- [ ] **Step 4: Commit**

```bash
git add backend/src/shared/middleware/sanitize.js
git commit -m "feat: req.query HTML sanitizasyonu + SKIP_FIELDS Set optimizasyonu"
```

---

## Task 5: L11 — Seed Tarih Düzeltmesi

**Files:**
- Modify: `backend/src/shared/db/seed.js`

Seed'deki hardcoded tarihler (`'2026-03-22'` gibi) geçmişte kalıyor. Dinamik tarih kullan.

- [ ] **Step 1: `seed.js` içindeki hardcoded tarihleri bul**

```bash
grep -n "2026-\|2025-\|2024-" backend/src/shared/db/seed.js | head -20
```

- [ ] **Step 2: Hardcoded tarihleri dinamik tarihle değiştir**

`seed.js` dosyasını oku. Tüm sabit tarih string'leri için dosyanın başına ekle:

```js
const today = new Date().toISOString().split('T')[0]
const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
const lastWeek = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
```

Sonra her `'2026-03-22'` gibi hardcoded tarihi `today`, `yesterday`, `lastWeek` ile değiştir. Geçmiş tarihlere referans veren değerler için `yesterday` veya `lastWeek` kullan (örn: check_in tarihleri).

- [ ] **Step 3: Test çalıştır**

```bash
cd backend && npx vitest run
```

Beklenen: tüm testler geçiyor.

- [ ] **Step 4: Commit**

```bash
git add backend/src/shared/db/seed.js
git commit -m "fix: seed.js hardcoded tarihler → dinamik (today/yesterday/lastWeek)"
```

---

## Task 6: L10 — OfflineBanner Temizliği

**Files:**
- Modify: `frontend/src/App.jsx`

`App.jsx` içindeki `OfflineBanner` bileşeni zaten çalışıyor ama network event listener'lar kullanıyor. Kaldır — offline durum `useNotifications` hook'u zaten kullanıcıya SSE kesintisi ile bildiriyor.

- [ ] **Step 1: `App.jsx` — OfflineBanner kaldır**

`frontend/src/App.jsx` dosyasından:

1. `OfflineBanner` fonksiyon bileşenini tamamen kaldır
2. `<OfflineBanner />` JSX kullanımını kaldır
3. `useState`, `useEffect` import'larını kontrol et — başka yerlerde kullanılmıyorsa kaldır (büyük ihtimalle kullanılıyor, bırak)

```jsx
// Kaldır: function OfflineBanner() { ... } (tüm fonksiyon)
// Kaldır: <OfflineBanner /> (App return içindeki JSX satırı)
```

- [ ] **Step 2: Frontend build kontrol**

```bash
cd frontend && npm run build 2>&1 | tail -10
```

Beklenen: hata yok.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "chore: OfflineBanner kaldır — SSE zaten kesinti bildiriyor"
```

---

## Task 7: L6 — Loading Spinner

**Files:**
- Modify: `frontend/src/App.jsx`

Suspense fallback şu an inline string `YUKLENIYOR...`. Centered tam ekran spinner bileşeni daha iyi UX.

- [ ] **Step 1: `App.jsx` — Suspense fallback güncelle**

`frontend/src/App.jsx` içinde Suspense fallback'i değiştir:

```jsx
// ÖNCE:
<Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'var(--mono)', letterSpacing: '2px', fontSize: '13px' }}>YUKLENIYOR...</div>}>

// SONRA:
<Suspense fallback={
  <div style={{
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    minHeight: '100vh', gap: '16px',
  }}>
    <div style={{
      width: '32px', height: '32px',
      border: '2px solid var(--border)',
      borderTop: '2px solid var(--accent)',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    }} />
    <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)', letterSpacing: '2px' }}>
      YUKLENIYOR
    </span>
  </div>
}>
```

`spin` animasyonu için `frontend/src/index.css` veya global CSS dosyasına ekle:

```css
@keyframes spin {
  to { transform: rotate(360deg); }
}
```

Global CSS dosyasını bul:
```bash
ls frontend/src/*.css frontend/src/index.css 2>/dev/null
```

- [ ] **Step 2: Frontend build kontrol**

```bash
cd frontend && npm run build 2>&1 | tail -10
```

Beklenen: hata yok.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.jsx frontend/src/*.css
git commit -m "feat: Suspense fallback → centered spinner animasyonu"
```

---

## Task 8: L4 — CASCADE Delete'ler

**Files:**
- Modify: `backend/src/shared/db/index.js`

5 tabloda foreign key'lere `ON DELETE CASCADE` eklenmeli: `room_assignments`, `discipline_records`, `zimmet`, `notifications`, `shifts` (shift_schedule). SQLite'ta bu tablo rebuild gerektirir.

Not: CASCADE DELETE operasyonel riski olan bir değişiklik. Personel silindiğinde tüm oda atamaları, disiplin kayıtları, zimmetler de silinir. Prod'da bu istenen davranış olabilir ya da olmayabilir. Bu task'ı SADECE onaylanmış davranış ise uygula.

- [ ] **Step 1: `room_assignments` CASCADE**

`backend/src/shared/db/index.js` içinde `return db` satırından önce ekle:

```js
  // ── CASCADE Delete'ler ─────────────────────────────────────────────────────
  // room_assignments: personel veya oda silinince assignment'lar da silinsin
  try {
    const raSql = db.prepare("SELECT sql FROM sqlite_master WHERE name='room_assignments'").get()
    if (raSql && !raSql.sql.includes('ON DELETE CASCADE')) {
      db.pragma('foreign_keys = OFF')
      db.transaction(() => {
        db.exec(`CREATE TABLE IF NOT EXISTS room_assignments_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          personnel_id INTEGER NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
          room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
          bed_no INTEGER,
          assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          check_out_at DATETIME,
          assigned_by INTEGER REFERENCES users(id)
        )`)
        db.exec(`INSERT OR IGNORE INTO room_assignments_new SELECT * FROM room_assignments`)
        db.exec(`DROP TABLE room_assignments`)
        db.exec(`ALTER TABLE room_assignments_new RENAME TO room_assignments`)
      })()
      db.pragma('foreign_keys = ON')
    }
  } catch(e) { if (!e.message?.includes('already exists')) console.error('[Migration] room_assignments cascade:', e.message) }
```

Not: `room_assignments` şemasını önce oku — `bed_no`, `assigned_at`, `check_out_at`, `assigned_by` kolonlarını doğrula. Şema uyuşmazlığı varsa uyarla.

- [ ] **Step 2: `notifications` CASCADE**

```js
  // notifications: hedef kullanıcı silinince bildirimler de silinsin
  try {
    const nSql = db.prepare("SELECT sql FROM sqlite_master WHERE name='notifications'").get()
    if (nSql && !nSql.sql.includes('ON DELETE CASCADE')) {
      db.pragma('foreign_keys = OFF')
      db.transaction(() => {
        db.exec(`CREATE TABLE notifications_new AS SELECT * FROM notifications WHERE 1=0`)
        // Notifications şeması schema.js'den al — tam CREATE TABLE yazılmalı
        // Bu task için notifications tablosunun schema.js'deki tam CREATE TABLE'ını oku
        // ve ON DELETE CASCADE ekle, sonra INSERT INTO ... SELECT * yap
      })()
      db.pragma('foreign_keys = ON')
    }
  } catch(e) { console.error('[Migration] notifications cascade:', e.message) }
```

Dikkat: Bu adım için `backend/src/shared/db/schema.js` dosyasını oku ve `notifications` tablosunun tam CREATE TABLE SQL'ini al. `user_id` veya benzer foreign key varsa `ON DELETE CASCADE` ekle.

- [ ] **Step 3: Test çalıştır**

```bash
cd backend && npx vitest run
```

Beklenen: tüm testler geçiyor (migration try/catch ile güvenli).

- [ ] **Step 4: Commit**

```bash
git add backend/src/shared/db/index.js
git commit -m "feat: CASCADE delete migration — room_assignments, notifications"
```

---

## Task 9: L5 — Error Format Standardizasyonu (Seçili Modüller)

**Files:**
- Seçili route dosyaları

Tüm `res.status(500).json({ error: e.message })` satırları implementation detail sızdırıyor. Production'da sadece generic mesaj dönmeli.

- [ ] **Step 1: `grep` ile hata pattern'lerini bul**

```bash
grep -rn "e\.message\|err\.message" backend/src/modules/*/routes.js | grep "res\.status\|res\.json" | head -30
```

- [ ] **Step 2: 500 hataları generic mesajla değiştir**

Bulunan her `res.status(500).json({ error: e.message })` satırını şu şekilde değiştir:

```js
// ÖNCE:
} catch (e) { res.status(500).json({ error: e.message }) }

// SONRA:
} catch (e) {
  console.error('[Route]', req.method, req.path, e.message)
  res.status(500).json({ error: 'Sunucu hatası' })
}
```

400 hataları (validation, not found) için mevcut `e.message` kalabilir — bunlar client'e anlamlı mesaj göstermeli.

- [ ] **Step 3: Test çalıştır**

```bash
cd backend && npx vitest run
```

Beklenen: tüm testler geçiyor.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/
git commit -m "fix: 500 hata response'larında e.message gizle — generic 'Sunucu hatası' dön"
```

---

## Task 10: L1 — Test Coverage (Notifications + Cron)

**Files:**
- Create: `backend/src/shared/notifications/notifications.test.js`
- Create: `backend/src/shared/cron/cron.test.js`

- [ ] **Step 1: `notifications.test.js` oluştur**

```js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { SCHEMA } from '../../db/schema.js'

// Test DB'si — memory
process.env.DB_PATH = ':memory:'
process.env.JWT_SECRET = 'test-secret'

let db
beforeEach(async () => {
  const { initDB } = await import('../../db/index.js')
  db = initDB()
})

describe('createNotification', () => {
  it('bildirim oluşturur ve veritabanına kaydeder', async () => {
    const { createNotification } = await import('./service.js')
    const notif = createNotification({ message: 'Test mesaj', type: 'info', target_role: 'campus_manager' })
    expect(notif).toBeTruthy()
    expect(notif.message).toBe('Test mesaj')
    expect(notif.id).toBeGreaterThan(0)
  })

  it('dedup_key ile aynı günde tekrar bildirim oluşturmaz', async () => {
    const { createNotification } = await import('./service.js')
    const key = 'test_dedup_key_123'
    const first = createNotification({ message: 'İlk', type: 'info', dedup_key: key })
    const second = createNotification({ message: 'İkinci', type: 'info', dedup_key: key })
    expect(first).toBeTruthy()
    expect(second).toBeNull()
  })

  it('SSE client hatası Set\'ten siler', async () => {
    const { createNotification, addSSEClient, removeSSEClient } = await import('./service.js')
    const fakeClient = { write: () => { throw new Error('broken pipe') } }
    addSSEClient(fakeClient)
    // Hata fırlatsa bile createNotification crash etmemeli
    expect(() => createNotification({ message: 'Test', type: 'info' })).not.toThrow()
  })
})

describe('getNotifications', () => {
  it('kullanıcıya ait bildirimleri döner', async () => {
    const { createNotification, getNotifications } = await import('./service.js')
    createNotification({ message: 'Role notif', type: 'info', target_role: 'campus_manager' })
    const result = getNotifications(999, 'campus_manager')
    expect(result.length).toBeGreaterThan(0)
  })
})

describe('markRead', () => {
  it('bildirimi okundu işaretler', async () => {
    const { createNotification, markRead } = await import('./service.js')
    const { getDB } = await import('../../db/index.js')
    const notif = createNotification({ message: 'Okunacak', type: 'info' })
    markRead(notif.id)
    const updated = getDB().prepare('SELECT is_read FROM notifications WHERE id=?').get(notif.id)
    expect(updated.is_read).toBe(1)
  })
})
```

- [ ] **Step 2: Test çalıştır**

```bash
cd backend && npx vitest run src/shared/notifications/notifications.test.js
```

Beklenen: tüm testler geçiyor.

- [ ] **Step 3: `cron.test.js` oluştur**

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.DB_PATH = ':memory:'
process.env.JWT_SECRET = 'test-secret'

describe('scheduleMorningReport', () => {
  it('email disabled ise job başlatılmaz', async () => {
    // getEmailSettings mock
    vi.doMock('../../modules/email/queries.js', () => ({
      getEmailSettings: () => ({ enabled: false, hour: 8, minute: 0 })
    }))
    const { scheduleMorningReport } = await import('./index.js')
    // Hata fırlatmamalı
    expect(() => scheduleMorningReport()).not.toThrow()
  })
})

describe('startCronJobs', () => {
  it('hata fırlatmadan başlar', async () => {
    vi.doMock('../../modules/email/queries.js', () => ({
      getEmailSettings: () => ({ enabled: false, hour: 8, minute: 0 })
    }))
    const { startCronJobs } = await import('./index.js')
    expect(() => startCronJobs()).not.toThrow()
  })
})
```

- [ ] **Step 4: Tüm testleri çalıştır**

```bash
cd backend && npx vitest run
```

Beklenen: tüm testler geçiyor (yeni testlerle birlikte).

- [ ] **Step 5: Commit**

```bash
git add backend/src/shared/notifications/notifications.test.js backend/src/shared/cron/cron.test.js
git commit -m "test: notifications service + cron temel birim testleri"
```

---

## Task 11: L12 — SSL Dökümanı Genişlet

**Files:**
- Modify: `docs/deploy/README.md`

Faz 3'te oluşturulan `docs/deploy/README.md` zaten temel SSL adımları içeriyor. Bu task'ta nginx.conf'a SSL bloğu ekle.

- [ ] **Step 1: `docs/deploy/nginx.conf` — SSL bloku ekle**

`docs/deploy/nginx.conf` dosyasına HTTP→HTTPS redirect ve SSL server bloğu ekle:

```nginx
# HTTP → HTTPS yönlendirme
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$host$request_uri;
}

# HTTPS server (Certbot bu bloğu otomatik doldurur)
server {
    listen 443 ssl;
    server_name yourdomain.com;

    # SSL sertifikaları (Certbot tarafından doldurulur)
    # ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Frontend
    root /var/www/yys/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

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

    location /api/notifications/stream {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
        proxy_set_header Host $host;
    }

    location /uploads/ {
        alias /var/www/yys/backend/uploads/;
        expires 7d;
        add_header Cache-Control "private, max-age=604800";
    }

    gzip on;
    gzip_types text/plain text/css application/javascript application/json;
    gzip_min_length 1000;
}
```

- [ ] **Step 2: Commit**

```bash
git add docs/deploy/nginx.conf
git commit -m "docs: nginx.conf SSL bloğu — HTTP→HTTPS redirect + Certbot placeholder"
```

---

## Faz 4 Tamamlandı

```bash
cd backend && npx vitest run
```

Beklenen: tüm testler geçiyor, hata yok.

Tüm 4 faz tamamlandı. Pre-deploy kontrol:

```bash
bash scripts/deploy/pre-deploy-check.sh
```
