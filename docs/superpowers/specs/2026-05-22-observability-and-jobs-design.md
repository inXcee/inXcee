# Observability & Job Queue — Design

**Tarih:** 2026-05-22
**Durum:** Onaylandı, uygulamaya geçildi
**Kapsam:** YYS backend için 3 yeni altyapı parçası — Sentry error tracking, Prometheus metrics endpoint, SQLite tabanlı job queue (push notifications için).

---

## 1. Motivasyon

YYS production'da uçuyor (`avskamp.com`) ama görünürlük zayıf:

- **Hata izleme yok.** `pino` logları var ama bir kullanıcı 500 görse haberimiz olmuyor.
- **Performans metriği yok.** Hangi endpoint yavaş, event loop ne durumda, DB query'leri ne kadar — bilmiyoruz.
- **Toplu bildirim request'i bloke ediyor.** `web-push` çağrıları senkron; 100 personele bildirim atan bir route bir sürü saniye request'i kilitler.

Bu spec üçünü minimal/odaklı şekilde çözer.

## 2. Ortak Prensipler

- **Test ortamında devre dışı.** `NODE_ENV=test` olduğunda Sentry init no-op, metrics endpoint çalışır ama scrape karşılığı sıfır, job worker başlamaz. Mevcut testlerde regresyon olmasın.
- **Env-driven, graceful degradation.** `SENTRY_DSN`, `METRICS_TOKEN`, `JOB_WORKER_ENABLED` env yoksa ilgili feature kapanır, uygulama açılmaya devam eder.
- **KVKK uyumu.** Hiçbir feature'da kişisel veri (isim, TC, telefon, oda no, request body) dış servise gitmez. Sentry'de payload scrubbing; metrics zaten label bazlı, PII yok; job_queue lokal DB'de kalır.
- **Mevcut patterns'e uy.** `backend/src/shared/` altına yeni modüller; ESM, named exports, `getDB()` pattern'i.

## 3. Faz 1 — Sentry Error Tracking

### 3.1 Hedef
Production'daki yakalanmamış hatalar ve `next(err)` ile gelen hatalar otomatik Sentry'ye gitsin. Local/test ortamında hiçbir şey gitmesin.

### 3.2 Bağımlılık
- `@sentry/node@^9` (Express 4 ile uyumlu son major)

### 3.3 Dosyalar
- **`backend/src/shared/sentry.js`** (yeni)
  - `initSentry()` — `SENTRY_DSN` yoksa veya `NODE_ENV=test` ise no-op döner. Aksi halde `Sentry.init({ dsn, environment, tracesSampleRate: 0.05, beforeSend })`.
  - `captureError(err, ctx?)` — manuel kullanım için (`ctx` = `{ userId, module }`).
  - `requestHandler()` / `errorHandler()` — Express middleware'leri re-export.
  - **PII scrubbing `beforeSend`:** `event.request.data`, `event.request.cookies`, `event.request.headers`, `event.user.ip_address`, `event.user.email`, `event.user.username` silinir. `event.user.id` ve `event.tags.module` kalır.

- **`backend/src/app.js`** (mevcut)
  - Helmet'ten sonra, route'lardan ÖNCE: `app.use(Sentry.requestHandler())`.
  - Route'lardan SONRA, mevcut error handler'dan ÖNCE: `app.use(Sentry.errorHandler())`.

- **`backend/src/server.js`** (mevcut)
  - Boot'ta `initSentry()` çağrısı (express app oluşmadan önce).

- **`.env.example`** — `SENTRY_DSN=` satırı eklenir.

### 3.4 Konfig
```
SENTRY_DSN=https://...@o123.ingest.sentry.io/456
SENTRY_ENVIRONMENT=production  # opsiyonel, default NODE_ENV
SENTRY_TRACES_SAMPLE_RATE=0.05  # opsiyonel, default 0
```

### 3.5 Test
`backend/src/shared/sentry.test.js`:
- `initSentry()` test ortamında `Sentry.init` çağırmaz.
- `captureError` test ortamında no-op.
- `beforeSend` event'ten `request.data`, `request.headers`, `user.ip_address` siler ama `user.id` ve `tags.module` korur.

### 3.6 Deploy notu
sentry.io'da yeni proje aç (Node platform), DSN'i prod `.env`'ye ekle, `pm2 reload yys-backend --update-env`.

---

## 4. Faz 2 — Prometheus `/api/system/metrics`

### 4.1 Hedef
Default Node.js metrikleri + her HTTP endpoint için latency histogram'ı + DB query süresi histogram'ı dışarı açılır. Bearer token ile korunur.

### 4.2 Bağımlılık
- `prom-client@^15`

### 4.3 Dosyalar
- **`backend/src/shared/metrics.js`** (yeni)
  - Bir `Registry` oluştur, `collectDefaultMetrics({ register })` ile Node metrics ekle.
  - Custom metrics:
    - `http_request_duration_seconds` (histogram, labels: `method, route, status_code`, buckets: `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]`).
    - `http_requests_total` (counter, same labels).
    - `db_query_duration_seconds` (histogram, labels: `operation` — sadece slow query'lerde ölçeriz, hot path'te değil).
    - `job_queue_size{status}` (gauge — Faz 3 ile dolar).
  - Export: `register`, `httpMetricsMiddleware`, `observeDbQuery(op, ms)`.

- **`backend/src/app.js`** (mevcut)
  - Helmet'ten sonra: `app.use(httpMetricsMiddleware)`. Middleware route eşleştikten SONRA `req.route?.path` veya path-normalize ile etiket çıkarır (kardinaliteyi düşük tut: `/users/:id`, `/users/123` değil).

- **`backend/src/modules/system/routes.js`** (mevcut)
  - `GET /api/system/metrics` ekle. Auth: `authMiddleware`'in dışında tut, ayrı bir `Bearer ${process.env.METRICS_TOKEN}` kontrolü. Yoksa veya yanlış → 401. Doğru → `register.metrics()` döner, `Content-Type: register.contentType`.

### 4.4 Path normalization (kardinalite)
Express `req.route.path` mount-relative pattern verir (`/:id`). Tam pattern için `req.baseUrl + req.route.path` kullan. 404'lerde `req.route` undefined → label `unknown`. UUID/sayı pattern'i regex'le `:id` ile değişt — sadece eşleşmeyen path'ler için.

### 4.5 Konfig
```
METRICS_TOKEN=<random 32 byte hex>
```
Token yoksa endpoint 503 döner (feature kapalı).

### 4.6 Test
`backend/src/shared/metrics.test.js`:
- `httpMetricsMiddleware` request sonrası histogram'a kayıt atar.
- `GET /api/system/metrics` yanlış token → 401.
- Doğru token → 200, `text/plain; version=0.0.4; charset=utf-8`, içerikte `# HELP` satırları.
- `METRICS_TOKEN` yoksa → 503.

### 4.7 Deploy notu
`METRICS_TOKEN` üret (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`), prod `.env`'ye ekle. Scrape sonra konfigure edilir — şimdilik endpoint manuel `curl` ile doğrulanır.

---

## 5. Faz 3 — Job Queue (push notifications)

### 5.1 Hedef
Push notification gönderimi senkron HTTP request'inde bloke etmesin. Kalıcı queue, restart-safe, exponential backoff retry, expired subscription temizliği.

### 5.2 Bağımlılık
Yok — `better-sqlite3` + native timers yeterli.

### 5.3 Şema
```sql
CREATE TABLE IF NOT EXISTS job_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,           -- JSON
  status TEXT NOT NULL DEFAULT 'pending',  -- pending|processing|done|failed
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  run_after INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  last_error TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_job_queue_pickup ON job_queue(status, run_after);
```

Mevcut `shared/db/index.js` ALTER pattern'ine uyacak şekilde `CREATE TABLE IF NOT EXISTS` ile eklenir (migrations refactor TODO'su ayrı iş).

### 5.4 Dosyalar
- **`backend/src/shared/jobs/index.js`** (yeni)
  - `enqueue(type, payload, opts?)` — INSERT yapar, id döner. `opts.runAfter` (ms gecikme), `opts.maxAttempts`.
  - `startWorker()` — `NODE_ENV=test` veya `JOB_WORKER_ENABLED=false` ise no-op. Aksi halde `setInterval(2000, tick)`.
  - `tick()` — `BEGIN IMMEDIATE` içinde `SELECT id FROM job_queue WHERE status='pending' AND run_after<=NOW LIMIT 1`, varsa `UPDATE status='processing', attempts=attempts+1` (atomik claim). Sonra handler çağır, başarı → `done`, hata → `pending` + `run_after = NOW + 30 * 2^attempts`, `attempts >= max_attempts` ise `failed`.
  - `stopWorker()` — graceful shutdown için (`SIGTERM` handler'ı kullanır).
  - `getStats()` — pending/processing/failed sayıları (Faz 2 metrics gauge'ı için).

- **`backend/src/shared/jobs/handlers.js`** (yeni)
  - `export const handlers = { 'push.send': sendPushJob }`.
  - `sendPushJob({ subscriptionId, payload })` — DB'den subscription çek, `web-push` ile gönder. 410/404 statusCode → subscription'ı sil ve **kalıcı fail** at (retry değil, `status='done'` çünkü iş bitti). Diğer hatalar retry.

- **`backend/src/modules/push/routes.js` ve push gönderen yerler** (mevcut)
  - Doğrudan `webpush.sendNotification(...)` çağıran yerler → `enqueue('push.send', { subscriptionId, payload })`.
  - Endpoint hemen 202 Accepted döner.

- **`backend/src/server.js`** (mevcut)
  - Boot'ta `startWorker()`, `SIGTERM`/`SIGINT`'te `stopWorker()`.

- **`backend/src/shared/db/index.js`** (mevcut)
  - `CREATE TABLE IF NOT EXISTS job_queue ...` ALTER pattern'ine eklenir.

### 5.5 Idempotency / Race
Worker tek instance varsayımı (PM2'de `instances: 1` zaten). Çoklu instance gelirse `BEGIN IMMEDIATE` transaction yine doğru çalışır (SQLite'da write lock), ama performans düşer — bu spec'te tek worker varsayılır.

### 5.6 Konfig
```
JOB_WORKER_ENABLED=true  # default true, false ile worker kapanır
JOB_WORKER_INTERVAL_MS=2000  # opsiyonel, default 2000
```

### 5.7 Test
`backend/src/shared/jobs/jobs.test.js`:
- `enqueue` job ekler, status `pending`.
- Worker mock'lu handler ile `tick()` çalıştırıldığında: pending → done.
- Handler hata fırlatırsa: status `pending` kalır, `attempts++`, `run_after` ileri kayar.
- `max_attempts` dolarsa: status `failed`, `last_error` dolu.
- Test mode'da `startWorker()` no-op (interval yaratmaz).

`backend/src/shared/jobs/handlers.test.js`:
- `sendPushJob` 410 alırsa subscription DB'den silinir, handler hata fırlatmaz (kalıcı fail başarıyla işlendi).
- Network hatasında throw eder (retry path'i için).

### 5.8 Deploy notu
İlk deploy'da:
1. Migration otomatik (`CREATE TABLE IF NOT EXISTS`).
2. PM2 restart sonrası `pm2 logs yys-backend | grep "job worker"` ile worker başladığını doğrula.
3. Manuel test: bir push aboneliği üzerinden bildirim tetikle, `job_queue` tablosunda `pending → done` geçişini gözle.

---

## 6. Faz 4 — Memory & Dokümantasyon

- **`MEMORY.md`** (`C:\Users\hrync\.claude\projects\C--Users-hrync\memory\`)
  - `yys-todo.md`'den "observability eksik" maddesi varsa kaldır (yok, ama yeni audit maddeleri Sentry/metrics/queue olarak işaretlenir).
  - `yys-observability.md` (yeni memory) — Sentry projesi, DSN nerede, metrics endpoint nasıl scrape edilir, queue nasıl izlenir.
- **`yys-deploy-manual.md`** — Yeni env değişkenleri (`SENTRY_DSN`, `METRICS_TOKEN`, `JOB_WORKER_ENABLED`) listeye eklenir.
- **`CLAUDE.md`** (repo kökü) — "Observability" kısa bölüm: `/api/system/metrics` endpoint, Sentry init noktası, job queue handler eklemek için adım.

---

## 7. Commit Stratejisi

Her faz ayrı commit, conventional commits format:

1. `feat(observability): Sentry error tracking with PII scrubbing`
2. `feat(observability): Prometheus /metrics endpoint with HTTP histograms`
3. `feat(jobs): SQLite-backed job queue for push notifications`
4. `docs(observability): runbook and deploy notes`

Her commit kendi başına yeşil test geçer (CLAUDE.md zorunluluğu).

## 8. Out of Scope (bu spec'te yok)

- Grafana / Prometheus scraper kurulumu — endpoint açılır, dış scraper sonra konfigure edilir.
- Email/WhatsApp/PDF queue'ya alımı — sadece push bu fazda. Diğerleri `yys-todo.md`'ye eklenir.
- Migration framework — `CREATE TABLE IF NOT EXISTS` mevcut ALTER pattern'i ile gider. Migration refactor ayrı bir iş (yys-todo'da var).
- Distributed/multi-worker queue — tek PM2 instance varsayılır.
- Sentry performance tracing detaylı setup — sadece error tracking + minimal sampling.
