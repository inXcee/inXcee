# Observability & Job Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** YYS backend'e Sentry error tracking, Prometheus `/metrics` endpoint ve SQLite tabanlı job queue (push notifications için) ekle.

**Architecture:** Üç bağımsız altyapı modülü, hepsi `backend/src/shared/` altında. Her biri env-driven ve `NODE_ENV=test` ortamında devre dışı (regresyon yok). Mevcut Express middleware order'ı korunur, mevcut testler dokunulmaz.

**Tech Stack:** Node.js 22, Express 4, better-sqlite3, vitest, ESM. Yeni paketler: `@sentry/node@^9`, `prom-client@^15`. Queue için ek paket yok.

**Spec:** [`docs/superpowers/specs/2026-05-22-observability-and-jobs-design.md`](../specs/2026-05-22-observability-and-jobs-design.md)

---

## File Structure

### Yeni dosyalar
- `backend/src/shared/sentry.js` — Sentry init + helper'lar + PII scrubbing
- `backend/src/shared/sentry.test.js` — sentry.js testleri
- `backend/src/shared/metrics.js` — prom-client registry + HTTP middleware
- `backend/src/shared/metrics.test.js` — metrics.js testleri
- `backend/src/shared/jobs/index.js` — enqueue + worker tick logic
- `backend/src/shared/jobs/handlers.js` — handler map (push.send)
- `backend/src/shared/jobs/jobs.test.js` — queue altyapı testleri
- `backend/src/shared/jobs/handlers.test.js` — handler testleri

### Değişen dosyalar
- `backend/package.json` — yeni deps
- `backend/src/app.js` — Sentry middleware'leri + metrics middleware + /api/system/metrics route
- `backend/src/server.js` — initSentry, startWorker, SIGTERM handler'da stopWorker
- `backend/src/modules/system/routes.js` — `/metrics` endpoint
- `backend/src/shared/notifications/push.js` — `sendPushToUser`/`sendPushToRole` queue'ya enqueue eder
- `backend/src/shared/db/index.js` — `job_queue` tablosu ALTER pattern'ine eklenir
- `.env.example` — yeni env değişkenleri
- `CLAUDE.md` — "Observability" bölümü

---

## Phase 1 — Sentry Error Tracking

### Task 1.1: Install @sentry/node

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Install dependency**

```bash
cd C:/Users/hrync/Desktop/inXcee/backend && npm install @sentry/node@^9
```

Expected: yeni satır `"@sentry/node": "^9.x.x"` `dependencies` altına eklenir.

- [ ] **Step 2: Verify import works**

```bash
cd C:/Users/hrync/Desktop/inXcee/backend && node -e "import('@sentry/node').then(m => console.log('ok', typeof m.init))"
```

Expected: `ok function`

- [ ] **Step 3: Commit**

```bash
cd C:/Users/hrync/Desktop/inXcee && git add backend/package.json backend/package-lock.json && git -c user.email="berkayinxce@gmail.com" -c user.name="Berkay" commit --author="Berkay <berkayinxce@gmail.com>" -m "chore(deps): add @sentry/node for error tracking"
```

---

### Task 1.2: Create sentry.js with PII scrubbing

**Files:**
- Create: `backend/src/shared/sentry.js`
- Test: `backend/src/shared/sentry.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// backend/src/shared/sentry.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('sentry', () => {
  beforeEach(() => {
    vi.resetModules()
    delete process.env.SENTRY_DSN
  })

  it('initSentry no-op when NODE_ENV=test', async () => {
    process.env.NODE_ENV = 'test'
    process.env.SENTRY_DSN = 'https://abc@o1.ingest.sentry.io/2'
    const sentry = await import('./sentry.js')
    expect(sentry.initSentry()).toBe(false)
  })

  it('initSentry no-op when SENTRY_DSN missing', async () => {
    process.env.NODE_ENV = 'production'
    delete process.env.SENTRY_DSN
    const sentry = await import('./sentry.js')
    expect(sentry.initSentry()).toBe(false)
  })

  it('captureError no-op when not initialized', async () => {
    const sentry = await import('./sentry.js')
    expect(() => sentry.captureError(new Error('boom'))).not.toThrow()
  })

  it('beforeSend scrubs PII fields', async () => {
    const sentry = await import('./sentry.js')
    const event = {
      request: {
        data: { password: 'secret', name: 'Ali' },
        headers: { authorization: 'Bearer xxx', 'user-agent': 'test' },
        cookies: 'session=abc',
      },
      user: { id: 'u1', ip_address: '1.2.3.4', email: 'a@b.com', username: 'ali' },
      tags: { module: 'checkin' },
    }
    const out = sentry._scrubEvent(event)
    expect(out.request.data).toBeUndefined()
    expect(out.request.headers).toBeUndefined()
    expect(out.request.cookies).toBeUndefined()
    expect(out.user.ip_address).toBeUndefined()
    expect(out.user.email).toBeUndefined()
    expect(out.user.username).toBeUndefined()
    expect(out.user.id).toBe('u1')
    expect(out.tags.module).toBe('checkin')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd C:/Users/hrync/Desktop/inXcee/backend && npx vitest run src/shared/sentry.test.js
```

Expected: FAIL with `Cannot find module './sentry.js'`.

- [ ] **Step 3: Write the implementation**

```javascript
// backend/src/shared/sentry.js
// Sentry error tracking — env-driven, test ortaminda no-op.
// PII scrubbing: request.data, headers, cookies, user.ip_address/email/username silinir.

import * as Sentry from '@sentry/node'
import { logger } from './logger.js'

let initialized = false

export function _scrubEvent(event) {
  if (event.request) {
    delete event.request.data
    delete event.request.headers
    delete event.request.cookies
  }
  if (event.user) {
    delete event.user.ip_address
    delete event.user.email
    delete event.user.username
  }
  return event
}

export function initSentry() {
  if (process.env.NODE_ENV === 'test') return false
  if (!process.env.SENTRY_DSN) {
    logger.info('[Sentry] SENTRY_DSN yok — error tracking devre disi')
    return false
  }
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
    beforeSend: _scrubEvent,
  })
  initialized = true
  logger.info('[Sentry] error tracking aktif')
  return true
}

export function captureError(err, ctx = {}) {
  if (!initialized) return
  Sentry.withScope(scope => {
    if (ctx.userId) scope.setUser({ id: String(ctx.userId) })
    if (ctx.module) scope.setTag('module', ctx.module)
    Sentry.captureException(err)
  })
}

// Express middleware'leri — uygulama tarafindan dogrudan kullanilir
export const requestHandler = () => Sentry.Handlers.requestHandler({
  ip: false,
  request: ['method', 'url', 'query_string'],  // body/headers HARIC
  user: ['id'],
})

export const errorHandler = () => Sentry.Handlers.errorHandler({
  shouldHandleError: (err) => {
    const status = err.status || err.statusCode || 500
    return status >= 500  // sadece sunucu hatalari Sentry'ye
  },
})
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd C:/Users/hrync/Desktop/inXcee/backend && npx vitest run src/shared/sentry.test.js
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd C:/Users/hrync/Desktop/inXcee && git add backend/src/shared/sentry.js backend/src/shared/sentry.test.js && git -c user.email="berkayinxce@gmail.com" -c user.name="Berkay" commit --author="Berkay <berkayinxce@gmail.com>" -m "feat(observability): Sentry helper with PII scrubbing"
```

---

### Task 1.3: Wire Sentry into app.js and server.js

**Files:**
- Modify: `backend/src/app.js` (import + 2 middleware satırı)
- Modify: `backend/src/server.js` (initSentry çağrısı)

- [ ] **Step 1: Add initSentry call to server.js**

`backend/src/server.js` — import bölümünün altına ekle (line 6'dan sonra):

```javascript
import { initSentry } from './shared/sentry.js'
```

ve `initDB()` çağrısından ÖNCE (line 23'ten önce):

```javascript
initSentry()
```

- [ ] **Step 2: Add Sentry middleware to app.js**

`backend/src/app.js` — import bölümüne ekle (line 13'ten sonra):

```javascript
import * as sentry from './shared/sentry.js'
```

`app.use(compression(...))` çağrısından ÖNCE (line 100'den önce) Sentry request handler ekle:

```javascript
// Sentry request handler — diger middleware'lerden ONCE olmali ki context yakalansin
app.use(sentry.requestHandler())
```

404 handler'dan ÖNCE, mevcut global error handler'dan ÖNCE (line 308'den önce) Sentry error handler ekle:

```javascript
// Sentry error handler — kendi error handler'imizdan ONCE, sadece 5xx'i Sentry'ye gonderir
app.use(sentry.errorHandler())
```

- [ ] **Step 3: Run all backend tests to verify no regression**

```bash
cd C:/Users/hrync/Desktop/inXcee/backend && npx vitest run
```

Expected: tüm testler PASS (Sentry test ortamında no-op olduğu için hiçbir mevcut test etkilenmez).

- [ ] **Step 4: Verify server boots locally**

```bash
cd C:/Users/hrync/Desktop/inXcee/backend && timeout 5 node --env-file=../.env src/server.js 2>&1 | head -20 || true
```

Expected: `[Sentry] SENTRY_DSN yok — error tracking devre disi` log satırı + `YYS Backend http://localhost:3001` satırı.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/hrync/Desktop/inXcee && git add backend/src/app.js backend/src/server.js && git -c user.email="berkayinxce@gmail.com" -c user.name="Berkay" commit --author="Berkay <berkayinxce@gmail.com>" -m "feat(observability): wire Sentry middleware into Express app"
```

---

### Task 1.4: Update .env.example

**Files:**
- Modify: `backend/.env.example` (yoksa kontrol et — `.env.example` veya `.env.local.example` olabilir)

- [ ] **Step 1: Locate .env.example**

```bash
cd C:/Users/hrync/Desktop/inXcee && ls -la .env* backend/.env* 2>/dev/null
```

Beklenen dosya: `.env.example` (root) veya `backend/.env.example`. Yoksa atla.

- [ ] **Step 2: Append Sentry env vars**

`.env.example` dosyasının sonuna ekle:

```
# Observability — Sentry error tracking
# SENTRY_DSN bos birakilirsa error tracking devre disi kalir
SENTRY_DSN=
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.05
```

- [ ] **Step 3: Commit**

```bash
cd C:/Users/hrync/Desktop/inXcee && git add .env.example backend/.env.example 2>/dev/null; git -c user.email="berkayinxce@gmail.com" -c user.name="Berkay" commit --author="Berkay <berkayinxce@gmail.com>" -m "docs: document Sentry env vars in .env.example" || echo "no .env.example found, skipped"
```

---

## Phase 2 — Prometheus `/api/system/metrics`

### Task 2.1: Install prom-client

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Install dependency**

```bash
cd C:/Users/hrync/Desktop/inXcee/backend && npm install prom-client@^15
```

- [ ] **Step 2: Verify import**

```bash
cd C:/Users/hrync/Desktop/inXcee/backend && node -e "import('prom-client').then(m => console.log('ok', typeof m.Registry))"
```

Expected: `ok function`

- [ ] **Step 3: Commit**

```bash
cd C:/Users/hrync/Desktop/inXcee && git add backend/package.json backend/package-lock.json && git -c user.email="berkayinxce@gmail.com" -c user.name="Berkay" commit --author="Berkay <berkayinxce@gmail.com>" -m "chore(deps): add prom-client for metrics endpoint"
```

---

### Task 2.2: Create metrics.js with HTTP middleware

**Files:**
- Create: `backend/src/shared/metrics.js`
- Test: `backend/src/shared/metrics.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// backend/src/shared/metrics.test.js
import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import supertest from 'supertest'
import { register, httpMetricsMiddleware, observeDbQuery, _resetForTests } from './metrics.js'

beforeEach(() => {
  _resetForTests()
})

describe('metrics registry', () => {
  it('exposes default node metrics', async () => {
    const text = await register.metrics()
    expect(text).toContain('process_cpu_user_seconds_total')
    expect(text).toContain('nodejs_eventloop_lag_seconds')
  })

  it('http histogram defined', async () => {
    const text = await register.metrics()
    expect(text).toContain('# HELP http_request_duration_seconds')
    expect(text).toContain('# TYPE http_request_duration_seconds histogram')
  })
})

describe('httpMetricsMiddleware', () => {
  it('records request after route match', async () => {
    const app = express()
    app.use(httpMetricsMiddleware)
    app.get('/users/:id', (req, res) => res.json({ id: req.params.id }))
    await supertest(app).get('/users/42').expect(200)
    const text = await register.metrics()
    // Label route normalize edildi — :id ile, 42 ile degil
    expect(text).toMatch(/http_requests_total\{[^}]*route="\/users\/:id"[^}]*\}\s+1/)
  })

  it('uses "unknown" route for 404s', async () => {
    const app = express()
    app.use(httpMetricsMiddleware)
    app.use((req, res) => res.status(404).end())
    await supertest(app).get('/nope').expect(404)
    const text = await register.metrics()
    expect(text).toMatch(/http_requests_total\{[^}]*route="unknown"[^}]*\}\s+1/)
  })
})

describe('observeDbQuery', () => {
  it('records duration', async () => {
    observeDbQuery('select', 0.123)
    const text = await register.metrics()
    expect(text).toContain('# TYPE db_query_duration_seconds histogram')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd C:/Users/hrync/Desktop/inXcee/backend && npx vitest run src/shared/metrics.test.js
```

Expected: FAIL with `Cannot find module './metrics.js'`.

- [ ] **Step 3: Write the implementation**

```javascript
// backend/src/shared/metrics.js
// Prometheus metrics — prom-client kullanir.
// Endpoint expozisyonu: backend/src/modules/system/routes.js icinde Bearer token korumali.

import { Registry, collectDefaultMetrics, Histogram, Counter, Gauge } from 'prom-client'

export const register = new Registry()

let defaultsRegistered = false
function ensureDefaults() {
  if (defaultsRegistered) return
  collectDefaultMetrics({ register })
  defaultsRegistered = true
}

let httpDuration, httpTotal, dbDuration, jobQueueSize

function defineMetrics() {
  ensureDefaults()
  httpDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request latency in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [register],
  })
  httpTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
    registers: [register],
  })
  dbDuration = new Histogram({
    name: 'db_query_duration_seconds',
    help: 'DB query duration in seconds (sampled, slow path only)',
    labelNames: ['operation'],
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2],
    registers: [register],
  })
  jobQueueSize = new Gauge({
    name: 'job_queue_size',
    help: 'Number of jobs in queue by status',
    labelNames: ['status'],
    registers: [register],
  })
}
defineMetrics()

// Test helper: yeniden init et (vitest isolated runs)
export function _resetForTests() {
  register.resetMetrics()
}

function normalizeRoute(req) {
  if (!req.route) return 'unknown'
  // baseUrl router mount path'i + route.path = full pattern (/api/users/:id gibi)
  return (req.baseUrl || '') + req.route.path
}

export function httpMetricsMiddleware(req, res, next) {
  const start = process.hrtime.bigint()
  res.on('finish', () => {
    const seconds = Number(process.hrtime.bigint() - start) / 1e9
    const labels = {
      method: req.method,
      route: normalizeRoute(req),
      status_code: String(res.statusCode),
    }
    httpDuration.observe(labels, seconds)
    httpTotal.inc(labels)
  })
  next()
}

export function observeDbQuery(operation, seconds) {
  dbDuration.observe({ operation }, seconds)
}

export function setJobQueueSize(status, count) {
  jobQueueSize.set({ status }, count)
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd C:/Users/hrync/Desktop/inXcee/backend && npx vitest run src/shared/metrics.test.js
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd C:/Users/hrync/Desktop/inXcee && git add backend/src/shared/metrics.js backend/src/shared/metrics.test.js && git -c user.email="berkayinxce@gmail.com" -c user.name="Berkay" commit --author="Berkay <berkayinxce@gmail.com>" -m "feat(observability): prom-client registry and HTTP metrics middleware"
```

---

### Task 2.3: Add `/api/system/metrics` endpoint

**Files:**
- Modify: `backend/src/modules/system/routes.js`
- Test: `backend/src/modules/system/system.test.js` (yeni)

- [ ] **Step 1: Write the failing test**

```javascript
// backend/src/modules/system/system.test.js
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import supertest from 'supertest'

let app

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  process.env.NODE_ENV = 'test'
  const { initDB } = await import('../../shared/db/index.js')
  initDB()
  const mod = await import('../../app.js')
  app = mod.default
})

describe('GET /api/system/metrics', () => {
  beforeEach(() => {
    delete process.env.METRICS_TOKEN
  })

  it('returns 503 when METRICS_TOKEN not set', async () => {
    await supertest(app).get('/api/system/metrics').expect(503)
  })

  it('returns 401 when token missing', async () => {
    process.env.METRICS_TOKEN = 'secret123'
    await supertest(app).get('/api/system/metrics').expect(401)
  })

  it('returns 401 when token wrong', async () => {
    process.env.METRICS_TOKEN = 'secret123'
    await supertest(app)
      .get('/api/system/metrics')
      .set('Authorization', 'Bearer wrong')
      .expect(401)
  })

  it('returns 200 with prom-text when token correct', async () => {
    process.env.METRICS_TOKEN = 'secret123'
    const res = await supertest(app)
      .get('/api/system/metrics')
      .set('Authorization', 'Bearer secret123')
      .expect(200)
    expect(res.headers['content-type']).toContain('text/plain')
    expect(res.text).toContain('# HELP')
    expect(res.text).toContain('http_request_duration_seconds')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd C:/Users/hrync/Desktop/inXcee/backend && npx vitest run src/modules/system/system.test.js
```

Expected: FAIL — endpoint döner 404 (henüz yok).

- [ ] **Step 3: Implement the endpoint**

`backend/src/modules/system/routes.js` dosyasını oku ve **mevcut içeriği koruyarak** sonuna ekle:

```javascript
import { register } from '../../shared/metrics.js'

// /api/system/metrics — Prometheus scrape endpoint
// Bearer token ile korunur. auth middleware'ini ATLAR (admin login gerektirmez).
// nginx tarafinda public acilmamalidir; token ek bir savunma katmani.
systemRouter.get('/metrics', async (req, res) => {
  const token = process.env.METRICS_TOKEN
  if (!token) return res.status(503).json({ error: 'metrics disabled' })
  const auth = req.headers.authorization
  if (!auth || auth !== `Bearer ${token}`) return res.status(401).json({ error: 'unauthorized' })
  try {
    res.set('Content-Type', register.contentType)
    res.end(await register.metrics())
  } catch (e) {
    logger.error('[Metrics]', e)
    res.status(500).end('metrics error')
  }
})
```

**Önemli:** Bu route mevcut `app.js`'de `app.use('/api/system', readLimiter, systemRouter)` ile mount ediliyor. readLimiter yüksek (600/dk) — scrape için yeterli. `requireRole('campus_manager')` mevcut admin guard'ı bu route'a uygulanmıyor (sadece `/info` route'unda var). Bizim route ayrı bearer token kontrolünü kendi yapıyor.

- [ ] **Step 4: Wire HTTP metrics middleware in app.js**

`backend/src/app.js` — `sentry.requestHandler()` çağrısından SONRA, `compression()` çağrısından ÖNCE ekle:

```javascript
import { httpMetricsMiddleware } from './shared/metrics.js'
// ...mevcut importlardan sonra

// (sentry.requestHandler()'dan sonra)
app.use(httpMetricsMiddleware)
```

- [ ] **Step 5: Run tests**

```bash
cd C:/Users/hrync/Desktop/inXcee/backend && npx vitest run src/modules/system/system.test.js
```

Expected: PASS (4 tests).

- [ ] **Step 6: Run full backend test suite**

```bash
cd C:/Users/hrync/Desktop/inXcee/backend && npx vitest run
```

Expected: tüm testler PASS.

- [ ] **Step 7: Commit**

```bash
cd C:/Users/hrync/Desktop/inXcee && git add backend/src/modules/system/routes.js backend/src/modules/system/system.test.js backend/src/app.js && git -c user.email="berkayinxce@gmail.com" -c user.name="Berkay" commit --author="Berkay <berkayinxce@gmail.com>" -m "feat(observability): /api/system/metrics endpoint with bearer token"
```

---

### Task 2.4: Update .env.example for METRICS_TOKEN

**Files:**
- Modify: `.env.example` (Task 1.4'te bulunan yer)

- [ ] **Step 1: Append metrics env**

`.env.example` dosyasının sonuna ekle:

```
# Observability — Prometheus metrics
# METRICS_TOKEN bos birakilirsa /api/system/metrics endpoint'i 503 doner (devre disi)
# Uretmek icin: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
METRICS_TOKEN=
```

- [ ] **Step 2: Commit**

```bash
cd C:/Users/hrync/Desktop/inXcee && git add .env.example backend/.env.example 2>/dev/null; git -c user.email="berkayinxce@gmail.com" -c user.name="Berkay" commit --author="Berkay <berkayinxce@gmail.com>" -m "docs: document METRICS_TOKEN in .env.example" || echo "no .env.example, skipped"
```

---

## Phase 3 — Job Queue (push notifications)

### Task 3.1: Add `job_queue` table

**Files:**
- Modify: `backend/src/shared/db/index.js`

- [ ] **Step 1: Add CREATE TABLE to db init**

`backend/src/shared/db/index.js` içinde mevcut `try { db.exec(\`CREATE TABLE IF NOT EXISTS cleaning_staff...` benzeri ALTER bloklarının ARASINA ekle (alfabetik sıra şart değil, sona ekle):

```javascript
try {
  db.exec(`CREATE TABLE IF NOT EXISTS job_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    run_after INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    last_error TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`)
  db.exec("CREATE INDEX IF NOT EXISTS idx_job_queue_pickup ON job_queue(status, run_after)")
} catch (e) {
  if (!e.message?.includes('already exists')) logger.error('[Migration] job_queue:', e.message)
}
```

- [ ] **Step 2: Verify with a smoke test**

```bash
cd C:/Users/hrync/Desktop/inXcee/backend && node -e "
process.env.DB_PATH = ':memory:';
import('./src/shared/db/index.js').then(m => {
  m.initDB();
  const r = m.getDB().prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name='job_queue'\").get();
  console.log(r ? 'job_queue OK' : 'MISSING');
});
"
```

Expected: `job_queue OK`

- [ ] **Step 3: Run all backend tests (regression check)**

```bash
cd C:/Users/hrync/Desktop/inXcee/backend && npx vitest run
```

Expected: tüm testler PASS.

- [ ] **Step 4: Commit**

```bash
cd C:/Users/hrync/Desktop/inXcee && git add backend/src/shared/db/index.js && git -c user.email="berkayinxce@gmail.com" -c user.name="Berkay" commit --author="Berkay <berkayinxce@gmail.com>" -m "feat(jobs): job_queue table with status+run_after index"
```

---

### Task 3.2: Create jobs/index.js with enqueue + worker

**Files:**
- Create: `backend/src/shared/jobs/index.js`
- Create: `backend/src/shared/jobs/handlers.js` (sadece skeleton, gerçek handler Task 3.3'te)
- Test: `backend/src/shared/jobs/jobs.test.js`

- [ ] **Step 1: Write handlers.js skeleton (boş map)**

```javascript
// backend/src/shared/jobs/handlers.js
// Job handler map: { 'job.type': async (payload, ctx) => result }
// Yeni handler eklemek icin bu map'e satir ekle, baska bir yere dokunmadan.

export const handlers = {}
```

- [ ] **Step 2: Write the failing test**

```javascript
// backend/src/shared/jobs/jobs.test.js
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { initDB, getDB } from '../db/index.js'
import { enqueue, tickOnce, getStats } from './index.js'
import { handlers } from './handlers.js'

beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  process.env.NODE_ENV = 'test'
  initDB()
})

beforeEach(() => {
  getDB().exec('DELETE FROM job_queue')
  // Reset test handlers
  for (const k of Object.keys(handlers)) delete handlers[k]
})

describe('enqueue', () => {
  it('inserts a pending job', () => {
    const id = enqueue('test.echo', { msg: 'hi' })
    expect(id).toBeGreaterThan(0)
    const row = getDB().prepare('SELECT * FROM job_queue WHERE id=?').get(id)
    expect(row.status).toBe('pending')
    expect(row.attempts).toBe(0)
    expect(JSON.parse(row.payload)).toEqual({ msg: 'hi' })
  })

  it('honors runAfter option', () => {
    const future = Math.floor(Date.now() / 1000) + 3600
    const id = enqueue('test.echo', {}, { runAfter: future })
    const row = getDB().prepare('SELECT run_after FROM job_queue WHERE id=?').get(id)
    expect(row.run_after).toBe(future)
  })
})

describe('tickOnce', () => {
  it('processes a pending job and marks done', async () => {
    handlers['test.echo'] = async (payload) => ({ echoed: payload.msg })
    const id = enqueue('test.echo', { msg: 'hello' })
    const processed = await tickOnce()
    expect(processed).toBe(true)
    const row = getDB().prepare('SELECT status FROM job_queue WHERE id=?').get(id)
    expect(row.status).toBe('done')
  })

  it('returns false when no pending jobs', async () => {
    const processed = await tickOnce()
    expect(processed).toBe(false)
  })

  it('retries on handler error with backoff', async () => {
    handlers['test.fail'] = async () => { throw new Error('boom') }
    const id = enqueue('test.fail', {})
    await tickOnce()
    const row = getDB().prepare('SELECT * FROM job_queue WHERE id=?').get(id)
    expect(row.status).toBe('pending')
    expect(row.attempts).toBe(1)
    expect(row.last_error).toContain('boom')
    expect(row.run_after).toBeGreaterThan(Math.floor(Date.now() / 1000))
  })

  it('marks failed after max_attempts', async () => {
    handlers['test.fail'] = async () => { throw new Error('boom') }
    const id = enqueue('test.fail', {}, { maxAttempts: 2 })
    // Attempt 1 — run_after ileri kayar
    await tickOnce()
    // Attempt 2 icin run_after'i geri al
    getDB().prepare("UPDATE job_queue SET run_after=strftime('%s','now') WHERE id=?").run(id)
    await tickOnce()
    const row = getDB().prepare('SELECT status, attempts FROM job_queue WHERE id=?').get(id)
    expect(row.status).toBe('failed')
    expect(row.attempts).toBe(2)
  })

  it('throws DONE_PERMANENT to mark done without retry', async () => {
    handlers['test.permfail'] = async () => {
      const e = new Error('subscription gone')
      e.permanent = true
      throw e
    }
    const id = enqueue('test.permfail', {})
    await tickOnce()
    const row = getDB().prepare('SELECT status, attempts FROM job_queue WHERE id=?').get(id)
    expect(row.status).toBe('done')
    expect(row.attempts).toBe(1)
  })
})

describe('getStats', () => {
  it('returns counts by status', () => {
    enqueue('test.x', {})
    enqueue('test.x', {})
    const stats = getStats()
    expect(stats.pending).toBe(2)
    expect(stats.done).toBe(0)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd C:/Users/hrync/Desktop/inXcee/backend && npx vitest run src/shared/jobs/jobs.test.js
```

Expected: FAIL — `Cannot find module './index.js'`.

- [ ] **Step 4: Write jobs/index.js implementation**

```javascript
// backend/src/shared/jobs/index.js
// SQLite tabanli is queue. Tek worker varsayilir (PM2 instances:1).
// Handler hata firlatirsa retry (exponential backoff). err.permanent=true ise retry yok.

import { getDB } from '../db/index.js'
import { logger } from '../logger.js'
import { handlers } from './handlers.js'

let workerTimer = null
let workerRunning = false

export function enqueue(type, payload, opts = {}) {
  const db = getDB()
  const runAfter = opts.runAfter ?? Math.floor(Date.now() / 1000)
  const maxAttempts = opts.maxAttempts ?? 3
  const result = db.prepare(`
    INSERT INTO job_queue(type, payload, run_after, max_attempts)
    VALUES(?,?,?,?)
  `).run(type, JSON.stringify(payload), runAfter, maxAttempts)
  return result.lastInsertRowid
}

// Tek bir tick: bir is varsa onu islet, true don. Yoksa false.
export async function tickOnce() {
  const db = getDB()
  const now = Math.floor(Date.now() / 1000)

  // Atomik claim: BEGIN IMMEDIATE ile write lock al, en eski pending'i isaretle
  let job
  const tx = db.transaction(() => {
    job = db.prepare(`
      SELECT id, type, payload, attempts, max_attempts
      FROM job_queue
      WHERE status='pending' AND run_after <= ?
      ORDER BY run_after ASC, id ASC
      LIMIT 1
    `).get(now)
    if (!job) return
    db.prepare(`
      UPDATE job_queue
      SET status='processing', attempts=attempts+1, updated_at=strftime('%s','now')
      WHERE id=?
    `).run(job.id)
  })
  tx.immediate()
  if (!job) return false

  const handler = handlers[job.type]
  if (!handler) {
    db.prepare(`
      UPDATE job_queue SET status='failed', last_error=?, updated_at=strftime('%s','now') WHERE id=?
    `).run(`No handler for type: ${job.type}`, job.id)
    logger.error('[Jobs] handler yok:', job.type)
    return true
  }

  let payload
  try { payload = JSON.parse(job.payload) }
  catch { payload = {} }

  try {
    await handler(payload)
    db.prepare(`
      UPDATE job_queue SET status='done', updated_at=strftime('%s','now'), last_error=NULL WHERE id=?
    `).run(job.id)
    return true
  } catch (err) {
    const attempts = job.attempts + 1
    const message = err?.message || String(err)
    if (err?.permanent) {
      // Kalici hata (orn. subscription gone) — is bitti say, retry yok
      db.prepare(`
        UPDATE job_queue SET status='done', last_error=?, updated_at=strftime('%s','now') WHERE id=?
      `).run(message, job.id)
      return true
    }
    if (attempts >= job.max_attempts) {
      db.prepare(`
        UPDATE job_queue SET status='failed', last_error=?, updated_at=strftime('%s','now') WHERE id=?
      `).run(message, job.id)
      return true
    }
    // Exponential backoff: 30s * 2^attempts
    const backoff = 30 * Math.pow(2, attempts)
    db.prepare(`
      UPDATE job_queue SET status='pending', last_error=?, run_after=strftime('%s','now') + ?, updated_at=strftime('%s','now') WHERE id=?
    `).run(message, backoff, job.id)
    return true
  }
}

export function startWorker(opts = {}) {
  if (process.env.NODE_ENV === 'test') return
  if (process.env.JOB_WORKER_ENABLED === 'false') {
    logger.info('[Jobs] worker JOB_WORKER_ENABLED=false ile devre disi')
    return
  }
  if (workerTimer) return
  const intervalMs = Number(opts.intervalMs || process.env.JOB_WORKER_INTERVAL_MS || 2000)
  const loop = async () => {
    if (workerRunning) return
    workerRunning = true
    try {
      // Bir tick'te birden cok is varsa hepsini bos zamanda al
      while (await tickOnce()) { /* repeat */ }
    } catch (e) {
      logger.error('[Jobs] worker tick hatasi:', e)
    } finally {
      workerRunning = false
    }
  }
  workerTimer = setInterval(loop, intervalMs)
  logger.info({ intervalMs }, '[Jobs] worker basladi')
}

export function stopWorker() {
  if (workerTimer) {
    clearInterval(workerTimer)
    workerTimer = null
  }
}

export function getStats() {
  const db = getDB()
  const rows = db.prepare("SELECT status, COUNT(*) AS n FROM job_queue GROUP BY status").all()
  const out = { pending: 0, processing: 0, done: 0, failed: 0 }
  for (const r of rows) out[r.status] = r.n
  return out
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd C:/Users/hrync/Desktop/inXcee/backend && npx vitest run src/shared/jobs/jobs.test.js
```

Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
cd C:/Users/hrync/Desktop/inXcee && git add backend/src/shared/jobs/ && git -c user.email="berkayinxce@gmail.com" -c user.name="Berkay" commit --author="Berkay <berkayinxce@gmail.com>" -m "feat(jobs): SQLite job queue core (enqueue, tickOnce, worker)"
```

---

### Task 3.3: Implement push.send handler

**Files:**
- Modify: `backend/src/shared/jobs/handlers.js`
- Test: `backend/src/shared/jobs/handlers.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// backend/src/shared/jobs/handlers.test.js
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { initDB, getDB } from '../db/index.js'

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}))

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  process.env.NODE_ENV = 'test'
  process.env.VAPID_PUBLIC_KEY = 'pub'
  process.env.VAPID_PRIVATE_KEY = 'priv'
  initDB()
})

beforeEach(() => {
  getDB().exec('DELETE FROM push_subscriptions')
})

describe('push.send handler', () => {
  it('sends notification to subscription', async () => {
    const webpush = (await import('web-push')).default
    webpush.sendNotification.mockResolvedValue({ statusCode: 201 })
    const { handlers } = await import('./handlers.js')

    getDB().prepare(`
      INSERT INTO push_subscriptions(id, user_id, endpoint, p256dh_key, auth_key)
      VALUES(1, 1, 'https://e.x/1', 'p1', 'a1')
    `).run()

    await handlers['push.send']({ subscriptionId: 1, payload: { title: 'hi' } })
    expect(webpush.sendNotification).toHaveBeenCalledOnce()
    const [sub, json] = webpush.sendNotification.mock.calls[0]
    expect(sub.endpoint).toBe('https://e.x/1')
    expect(JSON.parse(json)).toEqual({ title: 'hi' })
  })

  it('deletes subscription and throws permanent on 410', async () => {
    const webpush = (await import('web-push')).default
    const err = new Error('Gone')
    err.statusCode = 410
    webpush.sendNotification.mockRejectedValue(err)
    const { handlers } = await import('./handlers.js')

    getDB().prepare(`
      INSERT INTO push_subscriptions(id, user_id, endpoint, p256dh_key, auth_key)
      VALUES(2, 1, 'https://e.x/2', 'p2', 'a2')
    `).run()

    let caught
    try { await handlers['push.send']({ subscriptionId: 2, payload: {} }) }
    catch (e) { caught = e }
    expect(caught?.permanent).toBe(true)
    const row = getDB().prepare('SELECT * FROM push_subscriptions WHERE id=2').get()
    expect(row).toBeUndefined()
  })

  it('throws (retry) on transient error', async () => {
    const webpush = (await import('web-push')).default
    webpush.sendNotification.mockRejectedValue(new Error('network'))
    const { handlers } = await import('./handlers.js')

    getDB().prepare(`
      INSERT INTO push_subscriptions(id, user_id, endpoint, p256dh_key, auth_key)
      VALUES(3, 1, 'https://e.x/3', 'p3', 'a3')
    `).run()

    let caught
    try { await handlers['push.send']({ subscriptionId: 3, payload: {} }) }
    catch (e) { caught = e }
    expect(caught?.message).toBe('network')
    expect(caught?.permanent).toBeUndefined()
  })

  it('throws permanent if subscription not found in DB', async () => {
    const { handlers } = await import('./handlers.js')
    let caught
    try { await handlers['push.send']({ subscriptionId: 9999, payload: {} }) }
    catch (e) { caught = e }
    expect(caught?.permanent).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd C:/Users/hrync/Desktop/inXcee/backend && npx vitest run src/shared/jobs/handlers.test.js
```

Expected: FAIL (handler yok).

- [ ] **Step 3: Implement push.send handler**

`backend/src/shared/jobs/handlers.js`'i tamamen değiştir:

```javascript
// backend/src/shared/jobs/handlers.js
// Job handler map: { 'job.type': async (payload, ctx) => result }
// Hata firlatirsa retry edilir. err.permanent=true ise retry edilmez (is bitti say).

import webpush from 'web-push'
import { getDB } from '../db/index.js'
import { logger } from '../logger.js'

const PUBLIC = process.env.VAPID_PUBLIC_KEY
const PRIVATE = process.env.VAPID_PRIVATE_KEY
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:berkayinxce@gmail.com'
if (PUBLIC && PRIVATE) {
  try { webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE) }
  catch (e) { logger.error('[Jobs/push] VAPID hata:', e.message) }
}

function permanentError(message) {
  const e = new Error(message)
  e.permanent = true
  return e
}

async function sendPushJob({ subscriptionId, payload }) {
  const db = getDB()
  const sub = db.prepare(
    'SELECT id, endpoint, p256dh_key, auth_key FROM push_subscriptions WHERE id=?'
  ).get(subscriptionId)
  if (!sub) throw permanentError('subscription not found')

  const json = typeof payload === 'string' ? payload : JSON.stringify(payload)
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh_key, auth: sub.auth_key } },
      json,
    )
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) {
      db.prepare('DELETE FROM push_subscriptions WHERE id=?').run(sub.id)
      throw permanentError(`subscription gone (${e.statusCode})`)
    }
    throw e  // transient — retry
  }
}

export const handlers = {
  'push.send': sendPushJob,
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd C:/Users/hrync/Desktop/inXcee/backend && npx vitest run src/shared/jobs/handlers.test.js
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd C:/Users/hrync/Desktop/inXcee && git add backend/src/shared/jobs/handlers.js backend/src/shared/jobs/handlers.test.js && git -c user.email="berkayinxce@gmail.com" -c user.name="Berkay" commit --author="Berkay <berkayinxce@gmail.com>" -m "feat(jobs): push.send handler with permanent fail on 404/410"
```

---

### Task 3.4: Refactor push.js to enqueue

**Files:**
- Modify: `backend/src/shared/notifications/push.js`

Mevcut `sendPushToUser` ve `sendPushToRole` API'leri **aynı kalır** (callsite değişmez). İç akışta `webpush.sendNotification(...)` yerine `enqueue('push.send', ...)` çağırırlar.

- [ ] **Step 1: Modify push.js to enqueue**

`backend/src/shared/notifications/push.js`'i tamamen değiştir:

```javascript
// Web Push notification servisi.
//
// VAPID anahtarlari env'den okunur (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
// VAPID_SUBJECT). Anahtar yoksa push silently disabled.
//
// Gonderim: dogrudan webpush API'si yerine job_queue'ya enqueue edilir.
// Worker arka planda bireysel subscription'lari isler — request bloke olmaz.
// Eger NODE_ENV=test ise worker yok, ama enqueue calisir (testler queue'yi kontrol eder).

import { getDB } from '../db/index.js'
import { logger } from '../logger.js'
import { enqueue } from '../jobs/index.js'

const PUBLIC = process.env.VAPID_PUBLIC_KEY
const PRIVATE = process.env.VAPID_PRIVATE_KEY

let configured = false
if (PUBLIC && PRIVATE) {
  // VAPID setup handlers.js icinde yapilir; burada sadece flag.
  configured = true
}

export function isPushConfigured() {
  return configured
}

export function getVapidPublicKey() {
  return PUBLIC || null
}

export function saveSubscription({ userId, endpoint, p256dh, auth, userAgent }) {
  const db = getDB()
  db.prepare(`
    INSERT INTO push_subscriptions(user_id, endpoint, p256dh_key, auth_key, user_agent)
    VALUES(?,?,?,?,?)
    ON CONFLICT(endpoint) DO UPDATE SET
      user_id=excluded.user_id,
      p256dh_key=excluded.p256dh_key,
      auth_key=excluded.auth_key,
      user_agent=excluded.user_agent,
      last_seen_at=datetime('now')
  `).run(userId, endpoint, p256dh, auth, userAgent || null)
}

export function deleteSubscription(endpoint) {
  const db = getDB()
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').run(endpoint)
}

// Sync API korunur, ic akis enqueue. Donus deger: kac job enqueue edildi.
// Eski API "{sent, removed}" donuyordu — geriye uyumluluk icin shape korunur ama
// "sent" enqueue sayisini gosterir, "removed" her zaman 0 (worker hallediyor).
export async function sendPushToUser(userId, payload) {
  if (!configured) return { sent: 0, skipped: 'not_configured' }
  const db = getDB()
  const subs = db.prepare('SELECT id FROM push_subscriptions WHERE user_id=?').all(userId)
  for (const s of subs) enqueue('push.send', { subscriptionId: s.id, payload })
  return { sent: subs.length, removed: 0 }
}

export async function sendPushToRole(role, payload) {
  if (!configured) return { sent: 0, skipped: 'not_configured' }
  const db = getDB()
  const subs = db.prepare(`
    SELECT ps.id
    FROM push_subscriptions ps
    JOIN users u ON u.id = ps.user_id
    WHERE u.role=?
  `).all(role)
  for (const s of subs) enqueue('push.send', { subscriptionId: s.id, payload })
  return { sent: subs.length, removed: 0 }
}
```

- [ ] **Step 2: Run all backend tests (catch regressions)**

```bash
cd C:/Users/hrync/Desktop/inXcee/backend && npx vitest run
```

Expected: tüm testler PASS. notifications.test.js push çağrıldığını mock'luyor olabilir — kontrol et, gerekirse mock'u güncelle.

- [ ] **Step 3: If notifications tests fail, update mocks**

`backend/src/shared/notifications/notifications.test.js` — eğer `web-push` mock'luyorsa, artık push.js direk webpush çağırmıyor; mock'u kaldır veya `enqueue`'yu mock'la. Test'i oku ve uyarla. Sıklıkla testler push.js'i çağırıp döner — failed_attempts yoksa pas geçer.

- [ ] **Step 4: Commit**

```bash
cd C:/Users/hrync/Desktop/inXcee && git add backend/src/shared/notifications/push.js backend/src/shared/notifications/notifications.test.js 2>/dev/null; git -c user.email="berkayinxce@gmail.com" -c user.name="Berkay" commit --author="Berkay <berkayinxce@gmail.com>" -m "refactor(push): route notifications through job queue"
```

---

### Task 3.5: Start worker in server.js

**Files:**
- Modify: `backend/src/server.js`

- [ ] **Step 1: Add startWorker / stopWorker**

`backend/src/server.js` — import bölümüne ekle:

```javascript
import { startWorker, stopWorker } from './shared/jobs/index.js'
```

`startCronJobs()` çağrısından SONRA ekle:

```javascript
startWorker()
```

`SIGTERM` handler'ı içinde, `server.close(...)` çağrısından ÖNCE ekle:

```javascript
stopWorker()
```

- [ ] **Step 2: Verify server boots and worker starts**

```bash
cd C:/Users/hrync/Desktop/inXcee/backend && timeout 5 node --env-file=../.env src/server.js 2>&1 | head -20 || true
```

Expected: `[Jobs] worker basladi` log satırı görünür (`intervalMs: 2000`).

- [ ] **Step 3: Commit**

```bash
cd C:/Users/hrync/Desktop/inXcee && git add backend/src/server.js && git -c user.email="berkayinxce@gmail.com" -c user.name="Berkay" commit --author="Berkay <berkayinxce@gmail.com>" -m "feat(jobs): start worker on boot, stop on SIGTERM"
```

---

### Task 3.6: Update .env.example for jobs

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Append jobs env**

```
# Jobs — background worker for async tasks (push notifications)
# false ile worker tamamen kapanir (debug icin)
JOB_WORKER_ENABLED=true
JOB_WORKER_INTERVAL_MS=2000
```

- [ ] **Step 2: Commit**

```bash
cd C:/Users/hrync/Desktop/inXcee && git add .env.example backend/.env.example 2>/dev/null; git -c user.email="berkayinxce@gmail.com" -c user.name="Berkay" commit --author="Berkay <berkayinxce@gmail.com>" -m "docs: document JOB_WORKER env vars" || echo "no .env.example, skipped"
```

---

## Phase 4 — Documentation

### Task 4.1: Update CLAUDE.md with Observability section

**Files:**
- Modify: `CLAUDE.md` (repo root)

- [ ] **Step 1: Add section before "Deploy"**

`CLAUDE.md` — `## Deploy` bölümünün hemen ÖNCESİNE ekle:

```markdown
## Observability

- **Error tracking:** Sentry — `backend/src/shared/sentry.js`. DSN `.env`'de (`SENTRY_DSN`). Test ortamında no-op. PII scrubbing: body/headers/IP/email gönderilmez, sadece user.id + module tag.
- **Metrics:** `GET /api/system/metrics` — Bearer token (`METRICS_TOKEN`) ile korunur. prom-client + HTTP histogram. Endpoint `backend/src/shared/metrics.js`.
- **Job queue:** `backend/src/shared/jobs/` — SQLite tabanlı, push gönderimleri buradan. Yeni handler eklemek için `handlers.js`'e satır ekle:
  ```js
  export const handlers = {
    'push.send': sendPushJob,
    'mytype.do': async (payload) => { /* ... */ },
  }
  ```
  Sonra `enqueue('mytype.do', { ... })` ile çağrılır. Hata throw edilirse retry; `err.permanent=true` → kalıcı fail (retry yok).
```

- [ ] **Step 2: Commit**

```bash
cd C:/Users/hrync/Desktop/inXcee && git add CLAUDE.md && git -c user.email="berkayinxce@gmail.com" -c user.name="Berkay" commit --author="Berkay <berkayinxce@gmail.com>" -m "docs(claude): observability and jobs runbook"
```

---

### Task 4.2: Final smoke test + full test suite

- [ ] **Step 1: Run full backend test suite**

```bash
cd C:/Users/hrync/Desktop/inXcee/backend && npx vitest run
```

Expected: tüm testler PASS, hiçbiri SKIP/FAIL değil.

- [ ] **Step 2: Boot server with all envs set**

```bash
cd C:/Users/hrync/Desktop/inXcee/backend && SENTRY_DSN= METRICS_TOKEN=testtoken JOB_WORKER_ENABLED=true timeout 5 node --env-file=../.env src/server.js 2>&1 | head -30 || true
```

Expected: Hata yok, log'da şunlar görünür:
- `[Sentry] SENTRY_DSN yok — error tracking devre disi`
- `[Jobs] worker basladi`
- `YYS Backend http://localhost:3001`

- [ ] **Step 3: Smoke test metrics endpoint**

Server hala çalışırken (ayrı terminal'de veya `&` ile):

```bash
curl -s -H "Authorization: Bearer testtoken" http://localhost:3001/api/system/metrics | head -20
```

Expected: `# HELP` ile başlayan prom-text format çıktı.

- [ ] **Step 4: Cleanup (kill background server if used)**

```bash
# Eğer arkaplanda başlattıysan: pkill -f "node.*src/server.js"
```

---

## Final Notes for Deployment (not in plan execution)

Bu plan bittiğinde production'a deploy etmek için (kullanıcı kendi yapacak):

1. **sentry.io** → yeni Node projesi aç, DSN'i kopyala.
2. **METRICS_TOKEN üret:** `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
3. **Production `.env`'ye ekle:**
   ```
   SENTRY_DSN=<sentry'den>
   SENTRY_ENVIRONMENT=production
   SENTRY_TRACES_SAMPLE_RATE=0.05
   METRICS_TOKEN=<uretildi>
   JOB_WORKER_ENABLED=true
   ```
4. **Deploy:** `Scripts\deploy-yys.ps1` (memory'deki [yys-deploy-script])
5. **Doğrula:**
   - `curl https://avskamp.com/api/health` → 200
   - Sentry dashboard'da projeye gel ve "issues" boş olduğunu gör; manuel test error fırlat (geçici endpoint veya bilinçli hata)
   - `curl -H "Authorization: Bearer $METRICS_TOKEN" https://avskamp.com/api/system/metrics` → prom-text
   - PM2 logs'ta `[Jobs] worker basladi` görünmeli
   - Bir push notification tetikle, `job_queue` tablosunda pending → done geçişini SQL ile gözle

---

## Self-Review Checklist (filled in during plan write)

- [x] Spec coverage: Sentry (Faz 1), Metrics (Faz 2), Queue (Faz 3), Docs (Faz 4). Spec'teki tüm bölümler karşılandı.
- [x] No placeholders, no "TODO", no "implement later" — her step gerçek kod/komut içeriyor.
- [x] Type consistency: `enqueue`, `tickOnce`, `startWorker`, `stopWorker`, `handlers` map — tüm task'larda aynı isimler. `_scrubEvent` test'te ve impl'de tutarlı. `permanentError` helper'ı handler'da, test'te `err.permanent` kontrolü.
- [x] Test sıralaması TDD: her task'ta önce failing test → run → impl → run → commit.
- [x] Mevcut convention'lar takip edildi: ESM, named exports, `getDB()`, `:memory:` test DB, logger pattern, ALTER `try/catch` pattern.
