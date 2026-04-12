# Raporlama Sistemi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dashboard'a 4 metrikli trend grafikleri ekle ve Rapor sayfasını özet sayılar + açılır detay tablosu ile interaktif hale getir.

**Architecture:** Backend'e `/api/dashboard/trends` (yeni) ve `/api/reports/:type/data` (yeni JSON endpoint'ler, PDF'ler korunur) eklenir. Frontend'de recharts ile TrendChartsSection (DashboardPage altına) ve ReportsPage güncellenir.

**Tech Stack:** SQLite recursive CTE, Express, React Query (`useQuery`), recharts `AreaChart` / `LineChart`

---

## Dosya Haritası

**Oluşturulacak:**
- `frontend/src/modules/dashboard/TrendCard.jsx` — tek metrik grafik kartı
- `frontend/src/modules/dashboard/TrendChartsSection.jsx` — 4 kart + zaman toggle

**Değiştirilecek:**
- `backend/src/modules/dashboard/queries.js` — `getTrends(metrics, days)` eklenir
- `backend/src/modules/dashboard/routes.js` — `/trends` endpoint eklenir
- `backend/src/modules/dashboard/dashboard.test.js` — trends testleri eklenir
- `backend/src/modules/reports/routes.js` — 4 adet `/data` endpoint eklenir
- `backend/src/modules/reports/reports.test.js` — JSON endpoint testleri eklenir
- `frontend/src/modules/dashboard/DashboardPage.jsx` — TrendChartsSection import + render
- `frontend/src/modules/reports/ReportsPage.jsx` — interaktif kartlar

---

## Task 1: getTrends query fonksiyonu

**Files:**
- Modify: `backend/src/modules/dashboard/queries.js`
- Test: `backend/src/modules/dashboard/dashboard.test.js`

- [ ] **Step 1: Başarısız testi yaz**

`backend/src/modules/dashboard/dashboard.test.js` dosyasının sonuna ekle:

```js
import { getTrends } from './queries.js'

describe('getTrends', () => {
  it('returns all 4 metrics for 7 days', () => {
    const result = getTrends(['occupancy', 'sla', 'housekeeping', 'checkins'], 7)
    expect(result).toHaveProperty('occupancy')
    expect(result).toHaveProperty('sla')
    expect(result).toHaveProperty('housekeeping')
    expect(result).toHaveProperty('checkins')
    expect(result.occupancy).toHaveLength(7)
    expect(result.sla).toHaveLength(7)
    expect(result.housekeeping).toHaveLength(7)
    expect(result.checkins).toHaveLength(7)
  })

  it('each occupancy point has date and value', () => {
    const result = getTrends(['occupancy'], 7)
    const point = result.occupancy[0]
    expect(point).toHaveProperty('date')
    expect(point).toHaveProperty('value')
    expect(typeof point.value).toBe('number')
  })

  it('each checkins point has date, in, out', () => {
    const result = getTrends(['checkins'], 7)
    const point = result.checkins[0]
    expect(point).toHaveProperty('date')
    expect(point).toHaveProperty('in')
    expect(point).toHaveProperty('out')
  })

  it('ignores unknown metric names', () => {
    const result = getTrends(['occupancy', 'unknown_metric'], 7)
    expect(result).toHaveProperty('occupancy')
    expect(result).not.toHaveProperty('unknown_metric')
  })

  it('respects days=30', () => {
    const result = getTrends(['housekeeping'], 30)
    expect(result.housekeeping).toHaveLength(30)
  })
})
```

- [ ] **Step 2: Testi çalıştır — başarısız olduğunu doğrula**

```bash
cd backend && npx vitest run src/modules/dashboard/dashboard.test.js
```

Beklenen: `getTrends is not a function` hatası

- [ ] **Step 3: getTrends fonksiyonunu yaz**

`backend/src/modules/dashboard/queries.js` dosyasına sona ekle:

```js
export function getTrends(metrics, days = 30) {
  const db = getDB()
  const n = Math.max(1, Math.min(90, Number(days) || 30))

  const dateSeries = db.prepare(`
    WITH RECURSIVE dates(d) AS (
      SELECT date('now', '-' || (? - 1) || ' days')
      UNION ALL
      SELECT date(d, '+1 day') FROM dates WHERE d < date('now')
    )
    SELECT d FROM dates
  `).all(n).map(r => r.d)

  const result = {}
  const allowed = ['occupancy', 'sla', 'housekeeping', 'checkins']

  for (const metric of metrics) {
    if (!allowed.includes(metric)) continue

    if (metric === 'occupancy') {
      const totalBeds = db.prepare(
        `SELECT COALESCE(SUM(active_beds), 1) as t FROM rooms WHERE status='active'`
      ).get().t
      result.occupancy = dateSeries.map(d => ({
        date: d,
        value: Math.round(
          db.prepare(
            `SELECT COUNT(*) as c FROM room_assignments
             WHERE date(created_at) <= ? AND (check_out_at IS NULL OR date(check_out_at) > ?)`
          ).get(d, d).c * 100 / totalBeds
        ),
      }))
    }

    if (metric === 'sla') {
      result.sla = dateSeries.map(d => {
        const row = db.prepare(
          `SELECT
            COUNT(*) as total,
            COUNT(CASE WHEN sla_deadline IS NULL OR sla_deadline >= closed_at THEN 1 END) as ontime
           FROM maintenance_requests
           WHERE status='done' AND date(closed_at) = ?`
        ).get(d)
        return {
          date: d,
          value: row.total === 0 ? 100 : Math.round(row.ontime * 100 / row.total),
        }
      })
    }

    if (metric === 'housekeeping') {
      result.housekeeping = dateSeries.map(d => {
        const row = db.prepare(
          `SELECT
            COUNT(*) as total,
            COUNT(CASE WHEN completed_at IS NOT NULL THEN 1 END) as done
           FROM cleaning_tasks
           WHERE DATE(scheduled_at) = ?`
        ).get(d)
        return {
          date: d,
          value: row.total === 0 ? 100 : Math.round(row.done * 100 / row.total),
        }
      })
    }

    if (metric === 'checkins') {
      result.checkins = dateSeries.map(d => ({
        date: d,
        in: db.prepare(`SELECT COUNT(*) as c FROM personnel WHERE date(check_in_date) = ?`).get(d).c,
        out: db.prepare(`SELECT COUNT(*) as c FROM personnel WHERE date(check_out_date) = ?`).get(d).c,
      }))
    }
  }

  return result
}
```

- [ ] **Step 4: Testleri çalıştır — geçtiğini doğrula**

```bash
cd backend && npx vitest run src/modules/dashboard/dashboard.test.js
```

Beklenen: tüm testler PASS

- [ ] **Step 5: Commit**

```bash
cd backend && git add src/modules/dashboard/queries.js src/modules/dashboard/dashboard.test.js
git commit -m "feat: getTrends query — 4 metrik günlük trend verisi"
```

---

## Task 2: /api/dashboard/trends endpoint

**Files:**
- Modify: `backend/src/modules/dashboard/routes.js`
- Test: `backend/src/modules/dashboard/dashboard.test.js`

- [ ] **Step 1: HTTP testini yaz**

`dashboard.test.js` içindeki `describe('Dashboard', ...)` bloğuna ekle:

```js
it('returns trends for default metrics', async () => {
  const res = await request(app)
    .get('/api/dashboard/trends?days=7')
    .set('Authorization', `Bearer ${token}`)
  expect(res.status).toBe(200)
  expect(res.body).toHaveProperty('occupancy')
  expect(res.body).toHaveProperty('sla')
  expect(res.body).toHaveProperty('housekeeping')
  expect(res.body).toHaveProperty('checkins')
  expect(res.body.occupancy).toHaveLength(7)
})

it('returns only requested metrics', async () => {
  const res = await request(app)
    .get('/api/dashboard/trends?metrics=occupancy,sla&days=7')
    .set('Authorization', `Bearer ${token}`)
  expect(res.status).toBe(200)
  expect(res.body).toHaveProperty('occupancy')
  expect(res.body).toHaveProperty('sla')
  expect(res.body).not.toHaveProperty('housekeeping')
})

it('rejects unauthenticated trends request', async () => {
  const res = await request(app).get('/api/dashboard/trends')
  expect(res.status).toBe(401)
})
```

- [ ] **Step 2: Testi çalıştır — başarısız olduğunu doğrula**

```bash
cd backend && npx vitest run src/modules/dashboard/dashboard.test.js
```

Beklenen: `expected 404 to be 200` hatası

- [ ] **Step 3: Route'u ekle**

`backend/src/modules/dashboard/routes.js` dosyasındaki import satırını güncelle:

```js
import { getKPI, getHeatmap, getProjection, getBedOccupancy, getAuditLog, exportPersonnel, exportOccupancy, exportMaintenance, getTrends } from './queries.js'
```

Ardından `dashboardRouter.get('/bed-occupancy', ...)` bloğunun hemen **altına** ekle:

```js
dashboardRouter.get('/trends', ...mgmt, cacheFor(300), (req, res) => {
  try {
    const days = Math.max(7, Math.min(90, Number(req.query.days) || 30))
    const allMetrics = ['occupancy', 'sla', 'housekeeping', 'checkins']
    const metrics = req.query.metrics
      ? req.query.metrics.split(',').filter(m => allMetrics.includes(m))
      : allMetrics
    res.json(getTrends(metrics, days))
  } catch (e) { res.status(500).json({ error: e.message }) }
})
```

- [ ] **Step 4: Testleri çalıştır — geçtiğini doğrula**

```bash
cd backend && npx vitest run src/modules/dashboard/dashboard.test.js
```

Beklenen: tüm testler PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/dashboard/routes.js backend/src/modules/dashboard/dashboard.test.js
git commit -m "feat: GET /api/dashboard/trends endpoint"
```

---

## Task 3: Rapor JSON endpoint'leri

**Files:**
- Modify: `backend/src/modules/reports/routes.js`
- Modify: `backend/src/modules/reports/reports.test.js`

- [ ] **Step 1: Testleri yaz**

`backend/src/modules/reports/reports.test.js` dosyasını şu şekilde güncelle — mevcut `import`'ların hemen altına ekle:

```js
import request from 'supertest'
import app from '../../app.js'

let token
```

`beforeAll` bloğunu şu şekilde güncelle (token'ı da al):

```js
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  db = getDB()
  token = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
})
```

Sonra dosyanın en altına yeni describe bloğu ekle:

```js
describe('Reports JSON endpoints', () => {
  it('GET /api/reports/housekeeping/data returns JSON summary', async () => {
    const date = new Date().toISOString().split('T')[0]
    const res = await request(app)
      .get(`/api/reports/housekeeping/data?date=${date}`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('total')
    expect(res.body).toHaveProperty('done')
    expect(res.body).toHaveProperty('skipped')
    expect(res.body).toHaveProperty('pending')
    expect(res.body).toHaveProperty('tasks')
    expect(Array.isArray(res.body.tasks)).toBe(true)
  })

  it('GET /api/reports/maintenance/data returns JSON summary', async () => {
    const res = await request(app)
      .get('/api/reports/maintenance/data')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('total')
    expect(res.body).toHaveProperty('open')
    expect(res.body).toHaveProperty('closed')
    expect(res.body).toHaveProperty('overdue')
    expect(res.body).toHaveProperty('requests')
    expect(Array.isArray(res.body.requests)).toBe(true)
  })

  it('GET /api/reports/occupancy/data returns JSON summary', async () => {
    const res = await request(app)
      .get('/api/reports/occupancy/data')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('totals')
    expect(res.body).toHaveProperty('blocks')
    expect(res.body).toHaveProperty('personnel')
  })

  it('GET /api/reports/discipline/data returns JSON summary', async () => {
    const res = await request(app)
      .get('/api/reports/discipline/data')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('total')
    expect(res.body).toHaveProperty('records')
    expect(Array.isArray(res.body.records)).toBe(true)
  })

  it('rejects unauthenticated data request', async () => {
    const res = await request(app).get('/api/reports/housekeeping/data')
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Testi çalıştır — başarısız olduğunu doğrula**

```bash
cd backend && npx vitest run src/modules/reports/reports.test.js
```

Beklenen: `expected 404 to be 200` hataları

- [ ] **Step 3: JSON route'larını ekle**

`backend/src/modules/reports/routes.js` dosyasında `reportsRouter.get('/housekeeping', ...)` bloğunun **hemen üstüne** şunu ekle:

```js
reportsRouter.get('/housekeeping/data', ...mgrAccess, (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0]
    res.json(service.getHousekeepingReport(date))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

reportsRouter.get('/maintenance/data', ...mgrAccess, (req, res) => {
  try { res.json(service.getMaintenanceReport()) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

reportsRouter.get('/occupancy/data', ...mgrAccess, (req, res) => {
  try { res.json(service.getOccupancyReport()) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

reportsRouter.get('/discipline/data', ...mgrAccess, (req, res) => {
  try { res.json(service.getDisciplineReport()) }
  catch (e) { res.status(500).json({ error: e.message }) }
})
```

- [ ] **Step 4: Tüm testleri çalıştır — geçtiğini doğrula**

```bash
cd backend && npx vitest run src/modules/reports/reports.test.js
```

Beklenen: tüm testler PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/reports/routes.js backend/src/modules/reports/reports.test.js
git commit -m "feat: rapor JSON endpoint'leri — /data routes"
```

---

## Task 4: recharts kurulumu + TrendCard bileşeni

**Files:**
- Create: `frontend/src/modules/dashboard/TrendCard.jsx`

- [ ] **Step 1: recharts'ı kur**

```bash
cd frontend && npm install recharts
```

Beklenen: `package.json` içinde `recharts` bağımlılığı görünür.

- [ ] **Step 2: TrendCard.jsx oluştur**

`frontend/src/modules/dashboard/TrendCard.jsx` dosyasını oluştur:

```jsx
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

const CONFIGS = {
  occupancy: {
    label: 'DOLULUK',
    unit: '%',
    color: 'var(--blue)',
    type: 'area',
    dataKey: 'value',
  },
  sla: {
    label: 'BAKIM SLA UYUMU',
    unit: '%',
    color: 'var(--green)',
    type: 'area',
    dataKey: 'value',
  },
  housekeeping: {
    label: 'TEMİZLİK TAMAMLAMA',
    unit: '%',
    color: 'var(--teal)',
    type: 'area',
    dataKey: 'value',
  },
  checkins: {
    label: 'GİRİŞ / ÇIKIŞ',
    unit: '',
    color: null,
    type: 'line2',
  },
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getDate()}/${d.getMonth() + 1}`
}

function getTrend(data, cfg) {
  if (!data || data.length < 2) return null
  const last = cfg.type === 'line2' ? (data[data.length - 1].in || 0) : (data[data.length - 1].value || 0)
  const prev = cfg.type === 'line2' ? (data[data.length - 2].in || 0) : (data[data.length - 2].value || 0)
  if (last > prev) return { arrow: '↑', color: 'var(--green)' }
  if (last < prev) return { arrow: '↓', color: 'var(--red)' }
  return { arrow: '→', color: 'var(--text3)' }
}

export default function TrendCard({ metric, data }) {
  const cfg = CONFIGS[metric]
  if (!cfg || !data || data.length === 0) return null

  const trend = getTrend(data, cfg)
  const lastPoint = data[data.length - 1]
  const displayValue = cfg.type === 'line2'
    ? `${lastPoint.in ?? 0} / ${lastPoint.out ?? 0}`
    : `${lastPoint.value ?? 0}${cfg.unit}`

  const tickFormatter = (v) => formatDate(v)

  return (
    <div className="panel" style={{ overflow: 'hidden' }}>
      <div style={{ height: '2px', background: cfg.color || 'linear-gradient(90deg,var(--green),var(--red))' }} />
      <div style={{ padding: '16px 18px 8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '2px' }}>
              {cfg.label}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '4px' }}>
              <span style={{ fontFamily: 'var(--display)', fontSize: '28px', color: cfg.color || 'var(--text)', lineHeight: 1 }}>
                {displayValue}
              </span>
              {trend && (
                <span style={{ fontFamily: 'var(--display)', fontSize: '18px', color: trend.color }}>
                  {trend.arrow}
                </span>
              )}
            </div>
          </div>
          {cfg.type === 'line2' && (
            <div style={{ display: 'flex', gap: '12px', fontSize: '9px', fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
              <span style={{ color: 'var(--green)' }}>● GİRİŞ</span>
              <span style={{ color: 'var(--red)' }}>● ÇIKIŞ</span>
            </div>
          )}
        </div>

        <ResponsiveContainer width="100%" height={80}>
          {cfg.type === 'line2' ? (
            <LineChart data={data} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" tickFormatter={tickFormatter} tick={{ fontSize: 8, fill: 'var(--text3)', fontFamily: 'var(--mono)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 8, fill: 'var(--text3)' }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '6px', fontFamily: 'var(--mono)', fontSize: '11px' }}
                labelFormatter={formatDate}
                formatter={(val, name) => [val, name === 'in' ? 'Giriş' : 'Çıkış']}
              />
              <Line type="monotone" dataKey="in" stroke="var(--green)" strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="out" stroke="var(--red)" strokeWidth={1.5} dot={false} />
            </LineChart>
          ) : (
            <AreaChart data={data} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
              <defs>
                <linearGradient id={`grad-${metric}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={cfg.color} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={cfg.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" tickFormatter={tickFormatter} tick={{ fontSize: 8, fill: 'var(--text3)', fontFamily: 'var(--mono)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 8, fill: 'var(--text3)' }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '6px', fontFamily: 'var(--mono)', fontSize: '11px' }}
                labelFormatter={formatDate}
                formatter={(val) => [`${val}%`]}
              />
              <Area type="monotone" dataKey="value" stroke={cfg.color} strokeWidth={1.5} fill={`url(#grad-${metric})`} dot={false} />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/modules/dashboard/TrendCard.jsx frontend/package.json frontend/package-lock.json
git commit -m "feat: TrendCard bileşeni + recharts kurulumu"
```

---

## Task 5: TrendChartsSection bileşeni

**Files:**
- Create: `frontend/src/modules/dashboard/TrendChartsSection.jsx`

- [ ] **Step 1: TrendChartsSection.jsx oluştur**

```jsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import TrendCard from './TrendCard.jsx'

const DAYS_OPTIONS = [
  { label: '7G', value: 7 },
  { label: '30G', value: 30 },
  { label: '90G', value: 90 },
]

const METRICS = ['occupancy', 'sla', 'housekeeping', 'checkins']

export default function TrendChartsSection() {
  const [days, setDays] = useState(30)

  const { data, isLoading } = useQuery({
    queryKey: ['trends', days],
    queryFn: () => api.get(`/dashboard/trends?days=${days}`).then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

  return (
    <div className="fade-up" style={{ marginTop: '24px' }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <div style={{ fontFamily: 'var(--display)', fontSize: '13px', letterSpacing: '3px', color: 'var(--text)' }}>
            TREND GRAFİKLERİ
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '2px' }}>
            MODÜL BAZLI PERFORMANS TRENDİ
          </div>
        </div>

        {/* Days toggle */}
        <div style={{ display: 'flex', gap: '4px', background: 'var(--surface2)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border)' }}>
          {DAYS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value)}
              style={{
                padding: '4px 12px',
                borderRadius: '5px',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--mono)',
                fontSize: '10px',
                letterSpacing: '1px',
                background: days === opt.value ? 'var(--surface4, var(--surface3))' : 'transparent',
                color: days === opt.value ? 'var(--text)' : 'var(--text3)',
                transition: 'all 0.15s',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Cards grid */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '40px', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)' }}>
          Yükleniyor...
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
          {METRICS.map(metric => (
            <TrendCard key={metric} metric={metric} data={data?.[metric]} />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/modules/dashboard/TrendChartsSection.jsx
git commit -m "feat: TrendChartsSection — zaman toggle + 4 metrik grid"
```

---

## Task 6: DashboardPage entegrasyonu

**Files:**
- Modify: `frontend/src/modules/dashboard/DashboardPage.jsx`

- [ ] **Step 1: Import ekle**

`DashboardPage.jsx` dosyasının import bloğuna ekle:

```js
import TrendChartsSection from './TrendChartsSection.jsx'
```

- [ ] **Step 2: TrendChartsSection'ı render et**

`DashboardPage.jsx` dosyasında ~556. satırdaki `BedOccupancyPanel` div bloğunu bul:

```jsx
      <div style={{ marginBottom: '28px' }} className="fade-up-2">
        <BedOccupancyPanel data={bedOccupancy} />
      </div>
```

Bu div'in hemen **altına** ekle:

```jsx
      {/* Trend Grafikleri */}
      <TrendChartsSection />
```

- [ ] **Step 3: Dev server'da görsel doğrulama**

```bash
cd .. && npm run dev
```

Tarayıcıda `/dashboard` aç, en aşağı scroll et. 4 grafik kartı görünmeli. 7G/30G/90G toggle'a tıkla, grafiklerin güncellenmesini doğrula. Konsol hatası olmamalı.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/modules/dashboard/DashboardPage.jsx
git commit -m "feat: dashboard trend grafikleri bölümü entegrasyonu"
```

---

## Task 7: İnteraktif ReportsPage

**Files:**
- Modify: `frontend/src/modules/reports/ReportsPage.jsx`

- [ ] **Step 1: ReportsPage.jsx'i güncelle**

Mevcut `ReportsPage.jsx` içeriğini tamamen şununla değiştir:

```jsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../../shared/store/authStore.js'
import api from '../../shared/api/client.js'

const API_BASE = '/api'

const REPORTS = [
  {
    id: 'housekeeping',
    title: 'Gunluk Temizlik Raporu',
    description: 'Temizlik gorevleri, tamamlanan ve atlanan isler',
    icon: '◈',
    color: 'var(--green)',
    endpoint: '/reports/housekeeping',
    dataEndpoint: '/reports/housekeeping/data',
    hasDate: true,
    summaryKeys: [
      { key: 'done', label: 'TAMAMLANDI', color: 'var(--green)' },
      { key: 'skipped', label: 'ATLANDI', color: 'var(--red)' },
      { key: 'pending', label: 'BEKLİYOR', color: 'var(--accent)' },
    ],
    tableColumns: ['Alan', 'Blok', 'Kat', 'Durum', 'Temizlikçi', 'Açıklama'],
    tableRow: t => [t.area, t.block || '-', t.floor || '-', t.durum, t.temizlikci, t.aciklama],
    dataKey: 'tasks',
  },
  {
    id: 'maintenance',
    title: 'Haftalik Bakim Ozeti',
    description: 'Son 7 gun — acik/kapanan talepler, SLA durumu',
    icon: '⚙',
    color: 'var(--blue)',
    endpoint: '/reports/maintenance',
    dataEndpoint: '/reports/maintenance/data',
    hasDate: false,
    summaryKeys: [
      { key: 'open', label: 'AÇIK', color: 'var(--red)' },
      { key: 'closed', label: 'KAPANDI', color: 'var(--green)' },
      { key: 'overdue', label: 'SLA AŞILDI', color: 'var(--accent)' },
    ],
    tableColumns: ['#', 'Konum', 'Öncelik', 'Durum', 'Teknisyen', 'SLA'],
    tableRow: r => [r.id, r.location, r.priority, r.durum, r.teknisyen, r.sla],
    dataKey: 'requests',
  },
  {
    id: 'occupancy',
    title: 'Aylik Doluluk Raporu',
    description: 'Blok bazli doluluk, firma bazli personel dagilimi',
    icon: '⊞',
    color: 'var(--purple)',
    endpoint: '/reports/occupancy',
    dataEndpoint: '/reports/occupancy/data',
    hasDate: false,
    summaryKeys: [
      { key: 'totals.dolu', label: 'DOLU YATAK', color: 'var(--accent)' },
      { key: 'totals.yatak', label: 'TOPLAM YATAK', color: 'var(--text)' },
      { key: 'totals.oda', label: 'TOPLAM ODA', color: 'var(--blue)' },
    ],
    tableColumns: ['Blok', 'Oda', 'Toplam Yatak', 'Dolu', 'Boş', 'Doluluk %'],
    tableRow: b => [
      b.block, b.oda_sayisi, b.toplam_yatak, b.dolu_yatak,
      b.toplam_yatak - b.dolu_yatak,
      `%${b.toplam_yatak ? Math.round(b.dolu_yatak / b.toplam_yatak * 100) : 0}`,
    ],
    dataKey: 'blocks',
  },
  {
    id: 'discipline',
    title: 'Aylik Disiplin Raporu',
    description: 'Son 30 gun — sari/kirmizi kart kayitlari',
    icon: '⚠',
    color: 'var(--accent)',
    endpoint: '/reports/discipline',
    dataEndpoint: '/reports/discipline/data',
    hasDate: false,
    summaryKeys: [
      { key: 'total', label: 'TOPLAM KART', color: 'var(--accent)' },
    ],
    tableColumns: ['Personel', 'Firma', 'Kart', 'Sebep', 'Yazan', 'Tarih'],
    tableRow: r => [
      r.full_name, r.company || '-',
      r.card_type === 'yellow' ? 'Sarı' : 'Kırmızı',
      (r.reason || '-').substring(0, 40),
      r.created_by_name || '-',
      r.created_at?.split('T')[0] || '-',
    ],
    dataKey: 'records',
  },
]

function getNestedValue(obj, key) {
  return key.split('.').reduce((o, k) => o?.[k], obj)
}

function ReportCard({ report, selectedDate }) {
  const token = useAuthStore(s => s.token)
  const [downloading, setDownloading] = useState(null)
  const [expanded, setExpanded] = useState(false)

  const queryKey = report.hasDate
    ? [report.id, 'data', selectedDate]
    : [report.id, 'data']

  const dataUrl = report.hasDate
    ? `${report.dataEndpoint}?date=${selectedDate}`
    : report.dataEndpoint

  const { data: reportData, isLoading } = useQuery({
    queryKey,
    queryFn: () => api.get(dataUrl).then(r => r.data),
    staleTime: 2 * 60 * 1000,
  })

  async function downloadPDF() {
    setDownloading(true)
    try {
      const url = report.hasDate
        ? `${API_BASE}${report.endpoint}?date=${selectedDate}`
        : `${API_BASE}${report.endpoint}`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `${report.id}-rapor-${selectedDate}.pdf`
      link.click()
      URL.revokeObjectURL(link.href)
    } catch (e) {
      alert('Rapor indirilemedi: ' + e.message)
    } finally {
      setDownloading(false)
    }
  }

  const rows = reportData ? (reportData[report.dataKey] || []) : []

  return (
    <div className="panel" style={{ overflow: 'hidden' }}>
      <div style={{ height: '3px', background: report.color }} />
      <div style={{ padding: '20px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '8px',
            background: `${report.color}22`, border: `1px solid ${report.color}44`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px',
          }}>
            {report.icon}
          </div>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: '14px', letterSpacing: '2px' }}>
              {report.title}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginTop: '2px' }}>
              {report.description}
            </div>
          </div>
        </div>

        {/* Summary numbers */}
        {isLoading ? (
          <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginBottom: '12px' }}>
            Yükleniyor...
          </div>
        ) : reportData ? (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
            {report.summaryKeys.map(sk => (
              <div key={sk.key} style={{
                flex: 1, minWidth: '60px',
                padding: '8px 10px', background: 'var(--surface2)',
                border: '1px solid var(--border)', borderRadius: '6px', textAlign: 'center',
              }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: '22px', color: sk.color, lineHeight: 1 }}>
                  {getNestedValue(reportData, sk.key) ?? '—'}
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '7px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '3px' }}>
                  {sk.label}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {/* Action buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: rows.length > 0 && expanded ? '12px' : '0' }}>
          <button
            onClick={() => setExpanded(v => !v)}
            style={{
              padding: '9px', background: 'var(--surface2)',
              border: '1px solid var(--border)', borderRadius: '6px',
              color: 'var(--text2)', fontFamily: 'var(--mono)', fontSize: '10px',
              letterSpacing: '1px', cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {expanded ? '▲ GİZLE' : '▼ DETAYLAR'}
          </button>
          <button
            onClick={downloadPDF}
            disabled={!!downloading}
            style={{
              padding: '9px',
              background: downloading ? 'var(--surface3)' : report.color,
              border: 'none', borderRadius: '6px',
              color: '#000', fontFamily: 'var(--mono)', fontSize: '10px',
              letterSpacing: '1px', cursor: downloading ? 'wait' : 'pointer',
              opacity: downloading ? 0.7 : 1, transition: 'all 0.15s',
            }}
          >
            {downloading ? 'İNDİRİLİYOR...' : 'PDF İNDİR'}
          </button>
        </div>

        {/* Expandable table */}
        {expanded && rows.length > 0 && (
          <div style={{ marginTop: '12px', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)', fontSize: '10px' }}>
              <thead>
                <tr>
                  {report.tableColumns.map(col => (
                    <th key={col} style={{
                      padding: '6px 8px', textAlign: 'left',
                      borderBottom: '1px solid var(--border)',
                      color: 'var(--text3)', letterSpacing: '1px', fontWeight: 'normal',
                    }}>
                      {col.toUpperCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)', opacity: 0.9 }}>
                    {report.tableRow(row).map((cell, j) => (
                      <td key={j} style={{ padding: '6px 8px', color: 'var(--text2)' }}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {expanded && rows.length === 0 && !isLoading && (
          <div style={{ marginTop: '12px', padding: '12px', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>
            Bu dönem için veri yok
          </div>
        )}
      </div>
    </div>
  )
}

export default function ReportsPage() {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0])

  return (
    <div>
      <div className="fade-up" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '28px', letterSpacing: '4px' }}>RAPORLAR</h2>
          <p style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '4px' }}>
            İNTERAKTİF RAPOR MERKEZİ
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px' }}>TARİH</label>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            style={{
              background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '6px',
              color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: '12px', padding: '6px 10px',
            }}
          />
        </div>
      </div>

      <div className="fade-up-1" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
        {REPORTS.map(report => (
          <ReportCard key={report.id} report={report} selectedDate={selectedDate} />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Dev server'da görsel doğrulama**

```bash
npm run dev
```

`/reports` sayfasını aç. Her kart:
- Özet sayıları yüklenmiş olmalı (Tamamlandı / Atlınan / Bekliyor)
- "▼ DETAYLAR" butonuna tıklayınca tablo açılmalı
- "PDF İNDİR" butonu çalışmalı
- Konsol hatası olmamalı

- [ ] **Step 3: Tüm backend testlerini çalıştır**

```bash
cd backend && npx vitest run
```

Beklenen: tüm testler PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/modules/reports/ReportsPage.jsx
git commit -m "feat: interaktif rapor sayfası — özet sayılar + açılır detay tablosu"
```

---

## Task 8: Final doğrulama

- [ ] **Step 1: Tüm backend testleri**

```bash
cd backend && npx vitest run
```

Beklenen: tüm testler PASS, hata yok.

- [ ] **Step 2: Dashboard trend doğrulama**

`/dashboard` sayfasını aç, en aşağı scroll et:
- 4 trend kartı görünmeli (Doluluk, SLA, Temizlik, Giriş/Çıkış)
- 7G / 30G / 90G toggle çalışmalı
- Her kart son değer + trend oku göstermeli

- [ ] **Step 3: Rapor sayfası doğrulama**

`/reports` sayfasını aç:
- Her kart özet sayıları göstermeli
- "▼ DETAYLAR" açılır tablo göstermeli
- "PDF İNDİR" çalışmalı
- Tarih değiştirince temizlik kartı yeniden yüklemeli

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "feat: raporlama sistemi tamamlandı — trend grafikleri + interaktif rapor sayfası"
```
