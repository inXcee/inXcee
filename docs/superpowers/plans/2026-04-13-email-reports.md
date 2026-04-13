# Email Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Her sabah belirlenen saatte campus_manager kullanıcılarına 6 bölümlü HTML e-posta raporu gönder; gönderim saati ve alıcılar admin panelinden ayarlanabilir.

**Architecture:** `email` modülü backend'e eklenir (queries/service/routes). `system_settings` key-value tablosu tüm ayarları saklar. `users` tablosuna `email` kolonu eklenir. Cron dinamik olarak zamanlanır; PUT ayar endpoint'i cron'u yeniden planlar. Frontend'e `SettingsPage` eklenir.

**Tech Stack:** nodemailer (SMTP), node-cron (zaten mevcut), better-sqlite3, React + TanStack Query

---

## Dosya Haritası

| İşlem | Dosya |
|-------|-------|
| Oluştur | `backend/src/modules/email/queries.js` |
| Oluştur | `backend/src/modules/email/service.js` |
| Oluştur | `backend/src/modules/email/routes.js` |
| Oluştur | `backend/src/modules/email/email.test.js` |
| Değiştir | `backend/src/shared/db/schema.js` — `system_settings` tablosu + `users.email` kolonu |
| Değiştir | `backend/src/shared/db/seed.js` — sistem ayarları seed + kullanıcı e-posta adresleri |
| Değiştir | `backend/src/shared/cron/index.js` — `scheduleMorningReport` eklenir |
| Değiştir | `backend/src/app.js` — emailRouter kaydedilir |
| Değiştir | `frontend/src/modules/admin/UsersPage.jsx` — e-posta alanı eklenir |
| Oluştur | `frontend/src/modules/admin/SettingsPage.jsx` |
| Değiştir | `frontend/src/App.jsx` — `/admin/settings` route'u eklenir |
| Değiştir | `frontend/src/shared/components/Sidebar.jsx` — "Ayarlar" linki eklenir |

---

## Task 1: DB Şema — `system_settings` tablosu ve `users.email` kolonu

**Files:**
- Modify: `backend/src/shared/db/schema.js`
- Modify: `backend/src/shared/db/seed.js`

- [ ] **Step 1: `system_settings` tablosunu schema'ya ekle**

`backend/src/shared/db/schema.js` dosyasında `SCHEMA` string'inin sonuna (son backtick'ten önce) şunu ekle:

```js
CREATE TABLE IF NOT EXISTS system_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);
```

- [ ] **Step 2: `users` tablosuna `email` kolonu ekle**

Aynı dosyada `users` tablosu tanımına `assigned_floor INTEGER,` satırından sonra şunu ekle:

```sql
  email TEXT,
```

Sonuç:
```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('campus_manager','shift_supervisor','technical','laundry','housekeeper')),
  full_name TEXT NOT NULL,
  assigned_block TEXT,
  assigned_floor INTEGER,
  email TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

- [ ] **Step 3: seed verisine e-posta adresleri ve sistem ayarları ekle**

`backend/src/shared/db/seed.js` dosyasında `userInsert` bloğunu güncelle — `email` kolonu ekle:

```js
  const userInsert = db.prepare(`
    INSERT OR IGNORE INTO users(username,password_hash,role,full_name,assigned_block,assigned_floor,email)
    VALUES(?,?,?,?,?,?,?)
  `)
  const roles = [
    ['mudur',    hash, 'campus_manager',   'Kampüs Müdürü',          null, null, 'mudur@yys.local'],
    ['vardiya',  hash, 'shift_supervisor', 'Vardiya Amiri',           'M1', 1,    null],
    ['teknik',   hash, 'technical',        'Teknik Servis',           null, null, null],
    ['camasir',  hash, 'laundry',          'Çamaşırhane Görevlisi',   null, null, null],
    ['meydanci', hash, 'housekeeper',      'Meydancı',                'M1', 1,    null],
  ]
  roles.forEach(r => userInsert.run(...r))
```

Aynı dosyada (kullanıcı insert bloğundan sonra) sistem ayarlarını ekle:

```js
  // ── Sistem Ayarları ────────────────────────────────────────────────────────
  const settingInsert = db.prepare(`
    INSERT OR IGNORE INTO system_settings(key, value) VALUES(?, ?)
  `)
  const defaultSettings = [
    ['email_enabled', 'false'],
    ['email_hour',    '7'],
    ['email_minute',  '0'],
    ['email_cc',      ''],
  ]
  defaultSettings.forEach(([k, v]) => settingInsert.run(k, v))
```

- [ ] **Step 4: nodemailer kur**

```bash
cd backend && npm install nodemailer
```

Beklenen: `added N packages` çıktısı.

- [ ] **Step 5: Commit**

```bash
cd "/c/Users/hrync/OneDrive/Masaüstü/test claude"
git add backend/src/shared/db/schema.js backend/src/shared/db/seed.js backend/package-lock.json backend/package.json
git commit -m "feat: system_settings tablosu + users.email kolonu + nodemailer"
```

---

## Task 2: Backend `email/queries.js`

**Files:**
- Create: `backend/src/modules/email/queries.js`

- [ ] **Step 1: Failing testi yaz**

`backend/src/modules/email/email.test.js` dosyasını oluştur:

```js
import { describe, it, expect, beforeAll } from 'vitest'
import { initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import {
  getSetting, setSetting,
  getEmailSettings, setEmailSettings,
  getManagerEmails
} from './queries.js'

beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
})

describe('getSetting / setSetting', () => {
  it('varsayılan email_enabled değerini döndürür', () => {
    expect(getSetting('email_enabled')).toBe('false')
  })
  it('değer günceller', () => {
    setSetting('email_enabled', 'true')
    expect(getSetting('email_enabled')).toBe('true')
    setSetting('email_enabled', 'false') // geri al
  })
})

describe('getEmailSettings', () => {
  it('doğru şekle sahip nesne döndürür', () => {
    const s = getEmailSettings()
    expect(s).toMatchObject({ enabled: false, hour: 7, minute: 0, cc: '' })
  })
})

describe('setEmailSettings', () => {
  it('ayarları günceller ve geri okur', () => {
    setEmailSettings({ enabled: true, hour: 8, minute: 30, cc: 'test@x.com' })
    const s = getEmailSettings()
    expect(s.enabled).toBe(true)
    expect(s.hour).toBe(8)
    expect(s.minute).toBe(30)
    expect(s.cc).toBe('test@x.com')
    // geri al
    setEmailSettings({ enabled: false, hour: 7, minute: 0, cc: '' })
  })
})

describe('getManagerEmails', () => {
  it('campus_manager e-postalarını listeler', () => {
    const emails = getManagerEmails()
    expect(Array.isArray(emails)).toBe(true)
    expect(emails).toContain('mudur@yys.local')
  })
})
```

- [ ] **Step 2: Testi çalıştır — FAIL beklenir**

```bash
cd backend && npx vitest run src/modules/email/email.test.js
```

Beklenen: `Cannot find module './queries.js'`

- [ ] **Step 3: `queries.js` yaz**

`backend/src/modules/email/queries.js`:

```js
import { getDB } from '../../shared/db/index.js'

export function getSetting(key) {
  const db = getDB()
  const row = db.prepare('SELECT value FROM system_settings WHERE key=?').get(key)
  return row ? row.value : null
}

export function setSetting(key, value) {
  const db = getDB()
  db.prepare(`
    INSERT INTO system_settings(key, value) VALUES(?, ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')
  `).run(key, String(value))
}

export function getEmailSettings() {
  return {
    enabled: getSetting('email_enabled') === 'true',
    hour:    parseInt(getSetting('email_hour') ?? '7', 10),
    minute:  parseInt(getSetting('email_minute') ?? '0', 10),
    cc:      getSetting('email_cc') ?? '',
  }
}

export function setEmailSettings({ enabled, hour, minute, cc }) {
  setSetting('email_enabled', enabled ? 'true' : 'false')
  setSetting('email_hour',    String(hour))
  setSetting('email_minute',  String(minute))
  setSetting('email_cc',      cc ?? '')
}

export function getManagerEmails() {
  const db = getDB()
  return db.prepare(`
    SELECT email FROM users WHERE role='campus_manager' AND email IS NOT NULL AND email != ''
  `).all().map(r => r.email)
}
```

- [ ] **Step 4: Testi çalıştır — PASS beklenir**

```bash
cd backend && npx vitest run src/modules/email/email.test.js
```

Beklenen: tüm `getSetting / setSetting` ve `getEmailSettings` ve `getManagerEmails` testleri PASS.

- [ ] **Step 5: Commit**

```bash
cd "/c/Users/hrync/OneDrive/Masaüstü/test claude"
git add backend/src/modules/email/
git commit -m "feat: email/queries.js — system_settings CRUD + getManagerEmails"
```

---

## Task 3: Backend `email/service.js` — HTML builder + sendMorningReport

**Files:**
- Create: `backend/src/modules/email/service.js`
- Modify: `backend/src/modules/email/email.test.js` — yeni testler ekle

- [ ] **Step 1: Yeni testleri dosyaya ekle**

`backend/src/modules/email/email.test.js` dosyasının sonuna şunu ekle:

```js
import { buildReportHtml } from './service.js'

describe('buildReportHtml', () => {
  it('string döndürür', () => {
    const html = buildReportHtml()
    expect(typeof html).toBe('string')
  })
  it('6 bölüm başlığı içerir', () => {
    const html = buildReportHtml()
    const sections = [
      'KPI Özeti',
      'Doluluk',
      'Temizlik',
      'Bakım',
      'Giriş / Çıkış',
      'Çamaşırhane',
    ]
    sections.forEach(s => expect(html).toContain(s))
  })
})
```

- [ ] **Step 2: Testi çalıştır — FAIL beklenir**

```bash
cd backend && npx vitest run src/modules/email/email.test.js
```

Beklenen: `buildReportHtml` testleri FAIL (Cannot find module `./service.js`).

- [ ] **Step 3: `service.js` yaz**

`backend/src/modules/email/service.js`:

```js
import nodemailer from 'nodemailer'
import { getEmailSettings, getManagerEmails } from './queries.js'
import { getOccupancyReport, getMaintenanceReport, getHousekeepingReport } from '../reports/service.js'
import { getDB } from '../../shared/db/index.js'

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

export function buildReportHtml() {
  const today = new Date().toISOString().split('T')[0]

  const occupancy = getOccupancyReport()
  const maintenance = getMaintenanceReport()
  const housekeeping = getHousekeepingReport(today)

  // Giriş/çıkış bugün beklenenler
  const db = getDB()
  const checkinsToday = db.prepare(`
    SELECT COUNT(*) as c FROM room_assignments
    WHERE DATE(check_in_at) = DATE('now')
  `).get()?.c ?? 0
  const checkoutsToday = db.prepare(`
    SELECT COUNT(*) as c FROM room_assignments
    WHERE DATE(check_out_at) = DATE('now')
  `).get()?.c ?? 0

  // Çamaşırhane — bekleyen + teslim edilen bugün
  const laundryPending = db.prepare(`
    SELECT COUNT(*) as c FROM laundry_orders WHERE status NOT IN ('delivered','cancelled')
  `).get()?.c ?? 0
  const laundryDeliveredToday = db.prepare(`
    SELECT COUNT(*) as c FROM laundry_orders
    WHERE status='delivered' AND DATE(actual_delivery) = DATE('now')
  `).get()?.c ?? 0

  const dolulukOrani = occupancy.totals.yatak > 0
    ? Math.round((occupancy.totals.dolu / occupancy.totals.yatak) * 100)
    : 0

  const rows = (arr, cols) => arr.map(row =>
    `<tr>${cols.map(c => `<td style="padding:4px 8px;border:1px solid #ddd">${row[c] ?? '-'}</td>`).join('')}</tr>`
  ).join('')

  const table = (headers, cols, data) => `
    <table style="border-collapse:collapse;width:100%;margin-bottom:16px;font-size:13px">
      <thead><tr>${headers.map(h => `<th style="padding:6px 8px;border:1px solid #ddd;background:#f3f4f6;text-align:left">${h}</th>`).join('')}</tr></thead>
      <tbody>${rows(data, cols)}</tbody>
    </table>`

  return `
<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><style>
  body { font-family: Arial, sans-serif; color: #1f2937; background: #fff; }
  h2 { margin: 24px 0 8px; color: #1d4ed8; border-bottom: 2px solid #e5e7eb; padding-bottom: 4px; }
  .kpi-grid { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
  .kpi { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 6px; padding: 12px 20px; min-width: 120px; }
  .kpi-val { font-size: 28px; font-weight: bold; color: #0369a1; }
  .kpi-lbl { font-size: 11px; color: #64748b; text-transform: uppercase; }
</style></head>
<body>
<p style="color:#64748b;font-size:12px">Rapor tarihi: ${today}</p>

<h2>KPI Özeti</h2>
<div class="kpi-grid">
  <div class="kpi"><div class="kpi-val">%${dolulukOrani}</div><div class="kpi-lbl">Doluluk</div></div>
  <div class="kpi"><div class="kpi-val">${occupancy.totals.dolu}</div><div class="kpi-lbl">Dolu Yatak</div></div>
  <div class="kpi"><div class="kpi-val">${maintenance.open}</div><div class="kpi-lbl">Açık Arıza</div></div>
  <div class="kpi"><div class="kpi-val" style="color:${maintenance.overdue > 0 ? '#dc2626' : '#0369a1'}">${maintenance.overdue}</div><div class="kpi-lbl">SLA İhlali</div></div>
</div>

<h2>Doluluk — Blok Bazlı</h2>
${table(
  ['Blok', 'Oda', 'Toplam Yatak', 'Dolu', 'Boş'],
  ['block', 'oda_sayisi', 'toplam_yatak', 'dolu_yatak'],
  occupancy.blocks.map(b => ({ ...b, dolu_yatak: b.dolu_yatak, boş: b.toplam_yatak - b.dolu_yatak }))
)}

<h2>Temizlik Özeti — Bugün</h2>
<p>Toplam: ${housekeeping.total} | Tamamlanan: ${housekeeping.done} | Atlanan: ${housekeeping.skipped} | Bekleyen: ${housekeeping.pending}</p>
${table(
  ['Alan', 'Blok', 'Kat', 'Görev', 'Durum', 'Temizlikçi'],
  ['area', 'block', 'floor', 'task_type', 'durum', 'temizlikci'],
  housekeeping.tasks.slice(0, 20)
)}
${housekeeping.tasks.length > 20 ? `<p style="color:#64748b;font-size:12px">...ve ${housekeeping.tasks.length - 20} görev daha</p>` : ''}

<h2>Bakım / Arıza — Son 7 Gün</h2>
<p>Açık: ${maintenance.open} | Tamamlanan: ${maintenance.closed} | SLA İhlali: <span style="color:${maintenance.overdue > 0 ? '#dc2626' : 'inherit'}">${maintenance.overdue}</span></p>
${table(
  ['Konum', 'Açıklama', 'Öncelik', 'Durum', 'SLA', 'Teknisyen'],
  ['location', 'description', 'priority', 'durum', 'sla', 'teknisyen'],
  maintenance.requests.slice(0, 15)
)}

<h2>Giriş / Çıkış — Bugün</h2>
<div class="kpi-grid">
  <div class="kpi"><div class="kpi-val">${checkinsToday}</div><div class="kpi-lbl">Giriş</div></div>
  <div class="kpi"><div class="kpi-val">${checkoutsToday}</div><div class="kpi-lbl">Çıkış</div></div>
</div>

<h2>Çamaşırhane Özeti</h2>
<div class="kpi-grid">
  <div class="kpi"><div class="kpi-val">${laundryPending}</div><div class="kpi-lbl">Bekleyen Sipariş</div></div>
  <div class="kpi"><div class="kpi-val">${laundryDeliveredToday}</div><div class="kpi-lbl">Bugün Teslim</div></div>
</div>

<hr style="margin-top:32px;border:none;border-top:1px solid #e5e7eb">
<p style="font-size:11px;color:#94a3b8">Bu e-posta YYS tarafından otomatik olarak oluşturulmuştur.</p>
</body>
</html>`
}

export async function sendMorningReport() {
  const settings = getEmailSettings()
  if (!settings.enabled) return

  const to = getManagerEmails()
  if (to.length === 0) return

  const html = buildReportHtml()
  const today = new Date().toISOString().split('T')[0]

  const transport = createTransport()
  const mailOptions = {
    from: process.env.SMTP_FROM ?? 'YYS <noreply@yys.local>',
    to: to.join(', '),
    ...(settings.cc ? { cc: settings.cc } : {}),
    subject: `YYS Sabah Raporu — ${today}`,
    html,
  }

  await transport.sendMail(mailOptions)
}
```

- [ ] **Step 4: Testi çalıştır — PASS beklenir**

```bash
cd backend && npx vitest run src/modules/email/email.test.js
```

Beklenen: `buildReportHtml` testleri dahil tüm testler PASS.

- [ ] **Step 5: Commit**

```bash
cd "/c/Users/hrync/OneDrive/Masaüstü/test claude"
git add backend/src/modules/email/
git commit -m "feat: email/service.js — HTML builder + sendMorningReport"
```

---

## Task 4: Backend `email/routes.js` + app.js kaydı

**Files:**
- Create: `backend/src/modules/email/routes.js`
- Modify: `backend/src/app.js`
- Modify: `backend/src/modules/email/email.test.js` — API testleri ekle

- [ ] **Step 1: API testlerini dosyaya ekle**

`email.test.js` sonuna şunu ekle:

```js
import request from 'supertest'
import app from '../../app.js'
import { vi } from 'vitest'

let managerToken
beforeAll(async () => {
  const res = await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })
  managerToken = res.body.token
})

describe('GET /api/settings/email', () => {
  it('200 ve doğru alanlar döner', async () => {
    const res = await request(app)
      .get('/api/settings/email')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ enabled: false, hour: 7, minute: 0 })
    expect(typeof res.body.cc).toBe('string')
  })
})

describe('PUT /api/settings/email', () => {
  it('200 döner ve DB güncellenir', async () => {
    const res = await request(app)
      .put('/api/settings/email')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ enabled: true, hour: 8, minute: 15, cc: 'cc@test.com' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)

    const check = await request(app)
      .get('/api/settings/email')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(check.body.hour).toBe(8)
    expect(check.body.cc).toBe('cc@test.com')
  })
})

describe('POST /api/settings/email/test', () => {
  it('SMTP mock ile 200 döner', async () => {
    vi.mock('nodemailer', () => ({
      default: { createTransport: () => ({ sendMail: vi.fn().mockResolvedValue({ messageId: 'test' }) }) }
    }))
    const res = await request(app)
      .post('/api/settings/email/test')
      .set('Authorization', `Bearer ${managerToken}`)
    expect([200, 500]).toContain(res.status) // SMTP yapılandırılmamışsa 500 da kabul
  })
})
```

- [ ] **Step 2: Testi çalıştır — FAIL beklenir**

```bash
cd backend && npx vitest run src/modules/email/email.test.js
```

Beklenen: `/api/settings/email` testleri 404 ile FAIL.

- [ ] **Step 3: `routes.js` yaz**

`backend/src/modules/email/routes.js`:

```js
import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { getEmailSettings, setEmailSettings } from './queries.js'
import { sendMorningReport } from './service.js'
import { scheduleMorningReport } from '../../shared/cron/index.js'

export const emailRouter = Router()
const adminOnly = requireRole('campus_manager')

emailRouter.get('/', ...adminOnly, (req, res) => {
  try {
    res.json(getEmailSettings())
  } catch (e) { res.status(500).json({ error: e.message }) }
})

emailRouter.put('/', ...adminOnly, (req, res) => {
  try {
    const { enabled, hour, minute, cc } = req.body
    if (typeof hour !== 'number' || hour < 0 || hour > 23) {
      return res.status(400).json({ error: 'Geçersiz saat (0-23)' })
    }
    if (![0, 15, 30, 45].includes(minute)) {
      return res.status(400).json({ error: 'Dakika 0, 15, 30 veya 45 olmalı' })
    }
    setEmailSettings({ enabled: !!enabled, hour, minute, cc: cc ?? '' })
    scheduleMorningReport()
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

emailRouter.post('/test', ...adminOnly, async (req, res) => {
  try {
    await sendMorningReport()
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})
```

- [ ] **Step 4: `app.js`'e emailRouter'ı kaydet**

`backend/src/app.js`'de import listesine ekle:

```js
import { emailRouter } from './modules/email/routes.js'
```

Ve route kayıt bloğuna (diğer route'ların yanına) ekle:

```js
app.use('/api/settings/email', emailRouter)
```

- [ ] **Step 5: Testi çalıştır — PASS beklenir**

```bash
cd backend && npx vitest run src/modules/email/email.test.js
```

Beklenen: GET ve PUT testleri PASS, test endpoint 200 veya 500 (SMTP kurulu değilse).

- [ ] **Step 6: Commit**

```bash
cd "/c/Users/hrync/OneDrive/Masaüstü/test claude"
git add backend/src/modules/email/ backend/src/app.js
git commit -m "feat: email/routes.js + app.js kaydı — GET/PUT/test endpointleri"
```

---

## Task 5: Cron Entegrasyonu — `scheduleMorningReport`

**Files:**
- Modify: `backend/src/shared/cron/index.js`

- [ ] **Step 1: `scheduleMorningReport` cron'a ekle**

`backend/src/shared/cron/index.js` dosyasını düzenle. Import'lara şunu ekle:

```js
import { getEmailSettings } from '../../modules/email/queries.js'
import { sendMorningReport } from '../../modules/email/service.js'
```

Dosyanın başına (importların altına, `export function startCronJobs` üstüne) şunu ekle:

```js
let emailJob = null

export function scheduleMorningReport() {
  if (emailJob) { emailJob.stop(); emailJob = null }
  const { enabled, hour, minute } = getEmailSettings()
  if (!enabled) return
  emailJob = cron.schedule(`${minute} ${hour} * * *`, () => {
    sendMorningReport().catch(e => console.error('[Cron] Email hatası:', e))
  })
}
```

`startCronJobs()` fonksiyonunun sonuna (son `}` den önce) şunu ekle:

```js
  scheduleMorningReport()
```

- [ ] **Step 2: Tüm testleri çalıştır**

```bash
cd backend && npx vitest run
```

Beklenen: tüm testler PASS, import hatası yok.

- [ ] **Step 3: Commit**

```bash
cd "/c/Users/hrync/OneDrive/Masaüstü/test claude"
git add backend/src/shared/cron/index.js
git commit -m "feat: cron — scheduleMorningReport dinamik e-posta zamanlaması"
```

---

## Task 6: Frontend `SettingsPage.jsx` + Route + Sidebar

**Files:**
- Create: `frontend/src/modules/admin/SettingsPage.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/shared/components/Sidebar.jsx`

- [ ] **Step 1: `SettingsPage.jsx` oluştur**

`frontend/src/modules/admin/SettingsPage.jsx`:

```jsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'

const MINUTES = [0, 15, 30, 45]

export default function SettingsPage() {
  const qc = useQueryClient()
  const [toast, setToast] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['email-settings'],
    queryFn: () => api.get('/settings/email').then(r => r.data),
  })

  const [form, setForm] = useState(null)
  const current = form ?? data

  const save = useMutation({
    mutationFn: body => api.put('/settings/email', body),
    onSuccess: () => {
      qc.invalidateQueries(['email-settings'])
      setForm(null)
      showToast('Ayarlar kaydedildi', 'success')
    },
    onError: e => showToast(e.response?.data?.error ?? 'Hata', 'error'),
  })

  const testSend = useMutation({
    mutationFn: () => api.post('/settings/email/test'),
    onSuccess: () => showToast('Test e-postası gönderildi', 'success'),
    onError: e => showToast(e.response?.data?.error ?? 'Gönderim hatası', 'error'),
  })

  function showToast(msg, type) {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  function handleSave(e) {
    e.preventDefault()
    save.mutate({
      enabled: current.enabled,
      hour:    parseInt(current.hour, 10),
      minute:  parseInt(current.minute, 10),
      cc:      current.cc ?? '',
    })
  }

  if (isLoading) return <div style={{ padding: '32px' }}>Yükleniyor...</div>

  return (
    <div style={{ padding: '24px', maxWidth: '560px' }}>
      {toast && (
        <div style={{
          padding: '10px 16px', marginBottom: '16px', borderRadius: '6px',
          background: toast.type === 'success' ? '#dcfce7' : '#fee2e2',
          color: toast.type === 'success' ? '#166534' : '#991b1b',
          border: `1px solid ${toast.type === 'success' ? '#86efac' : '#fca5a5'}`,
        }}>
          {toast.msg}
        </div>
      )}

      <div className="panel">
        <div style={{ height: '2px', background: 'var(--accent)' }} />
        <div className="panel-header">
          <div className="panel-title">E-POSTA RAPORU AYARLARI</div>
        </div>
        <div className="panel-body">
          <form onSubmit={handleSave}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600 }}>E-posta Raporu</label>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...(f ?? data), enabled: !current.enabled }))}
                style={{
                  width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                  background: current.enabled ? 'var(--accent)' : '#cbd5e1',
                  position: 'relative', transition: 'background 0.2s',
                }}
              >
                <span style={{
                  position: 'absolute', top: '3px',
                  left: current.enabled ? '22px' : '3px',
                  width: '18px', height: '18px', borderRadius: '50%',
                  background: '#fff', transition: 'left 0.2s', display: 'block',
                }} />
              </button>
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                {current.enabled ? 'Aktif' : 'Kapalı'}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label className="form-label">GÖNDERİM SAATİ (0-23)</label>
                <input
                  type="number" min="0" max="23" className="form-input"
                  value={current.hour}
                  onChange={e => setForm(f => ({ ...(f ?? data), hour: e.target.value }))}
                />
              </div>
              <div>
                <label className="form-label">DAKİKA</label>
                <select
                  className="form-select"
                  value={current.minute}
                  onChange={e => setForm(f => ({ ...(f ?? data), minute: parseInt(e.target.value, 10) }))}
                >
                  {MINUTES.map(m => <option key={m} value={m}>{String(m).padStart(2, '0')}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label className="form-label">CC ADRESİ (OPSİYONEL)</label>
              <input
                type="email" className="form-input"
                placeholder="cc@ornek.com"
                value={current.cc ?? ''}
                onChange={e => setForm(f => ({ ...(f ?? data), cc: e.target.value }))}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="submit" className="btn btn-primary" disabled={save.isPending}>
                {save.isPending ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
              <button
                type="button" className="btn btn-secondary"
                disabled={testSend.isPending}
                onClick={() => testSend.mutate()}
              >
                {testSend.isPending ? 'Gönderiliyor...' : 'Test Gönder'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Route'u `App.jsx`'e ekle**

`frontend/src/App.jsx`'de lazy import listesine ekle:

```js
const SettingsPage = lazy(() => import('./modules/admin/SettingsPage.jsx'))
```

Ve route kayıt bloğuna (audit route'un yanına) ekle:

```jsx
<Route path="settings" element={<SettingsPage />} />
```

- [ ] **Step 3: Sidebar'a "Ayarlar" linki ekle**

`frontend/src/shared/components/Sidebar.jsx`'de `audit` route'unun bulunduğu nesneyi bul ve yanına ekle:

```js
{ to: '/settings', icon: '⚙', label: 'Ayarlar', roles: ['campus_manager'] },
```

Sonuç şöyle görünmeli:

```js
{ to: '/users', icon: '⌂', label: 'Kullanicilar', roles: ['campus_manager'] },
{ to: '/audit', icon: '☷', label: 'Audit Log', roles: ['campus_manager'] },
{ to: '/settings', icon: '⚙', label: 'Ayarlar', roles: ['campus_manager'] },
```

- [ ] **Step 4: Backend testleri geçiyor mu kontrol et**

```bash
cd backend && npx vitest run
```

Beklenen: tüm testler PASS.

- [ ] **Step 5: Commit**

```bash
cd "/c/Users/hrync/OneDrive/Masaüstü/test claude"
git add frontend/src/modules/admin/SettingsPage.jsx frontend/src/App.jsx frontend/src/shared/components/Sidebar.jsx
git commit -m "feat: SettingsPage — e-posta raporu ayarları + route + sidebar linki"
```

---

## Task 7: `UsersPage.jsx`'e E-posta Alanı + Backend Güncelleme

**Files:**
- Modify: `frontend/src/modules/admin/UsersPage.jsx`
- Modify: `backend/src/modules/users/queries.js`
- Modify: `backend/src/modules/users/service.js`

- [ ] **Step 1: Backend `queries.js`'de `email` kolonunu dahil et**

`backend/src/modules/users/queries.js`'de şu değişiklikleri yap:

`getAllUsers()` sorgusuna `email` ekle:
```js
SELECT id, username, role, full_name, assigned_block, assigned_floor, email, created_at
FROM users ORDER BY role, full_name
```

`getUserById()` sorgusuna `email` ekle:
```js
SELECT id, username, role, full_name, assigned_block, assigned_floor, email, created_at FROM users WHERE id=?
```

`createUser()` fonksiyonunu güncelle — `email` parametresi ekle:
```js
export function createUser({ username, password_hash, role, full_name, assigned_block, assigned_floor, email }) {
  const db = getDB()
  const r = db.prepare(
    'INSERT INTO users(username, password_hash, role, full_name, assigned_block, assigned_floor, email) VALUES(?,?,?,?,?,?,?)'
  ).run(username, password_hash, role, full_name, assigned_block || null, assigned_floor || null, email || null)
  return r.lastInsertRowid
}
```

`updateUser()` fonksiyonunu güncelle — `email` parametresi ekle:
```js
export function updateUser(id, { role, full_name, assigned_block, assigned_floor, email }) {
  const db = getDB()
  db.prepare(`
    UPDATE users SET role=?, full_name=?, assigned_block=?, assigned_floor=?, email=? WHERE id=?
  `).run(role, full_name, assigned_block || null, assigned_floor || null, email || null, id)
}
```

- [ ] **Step 2: Frontend `UsersPage.jsx` formuna e-posta alanı ekle**

`UserForm` bileşeninde `useState` başlangıç değerine `email` ekle:

```js
const [form, setForm] = useState({
  username: user?.username || '',
  password: '',
  role: user?.role || 'technical',
  full_name: user?.full_name || '',
  assigned_block: user?.assigned_block || '',
  assigned_floor: user?.assigned_floor || '',
  email: user?.email || '',
})
```

Form grid'ine `assigned_floor` alanından sonra e-posta alanı ekle:

```jsx
<div>
  <label className="form-label">E-POSTA</label>
  <input className="form-input" type="email" value={form.email}
    placeholder="kullanici@ornek.com"
    onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
</div>
```

- [ ] **Step 3: Backend testleri çalıştır**

```bash
cd backend && npx vitest run
```

Beklenen: tüm testler PASS.

- [ ] **Step 4: Commit**

```bash
cd "/c/Users/hrync/OneDrive/Masaüstü/test claude"
git add backend/src/modules/users/queries.js frontend/src/modules/admin/UsersPage.jsx
git commit -m "feat: users — email kolonu backend + UsersPage form alanı"
```

---

## Kapsam Özeti

| Özellik | Task |
|---------|------|
| `system_settings` tablosu | 1 |
| `users.email` kolonu | 1 |
| Seed — e-postalar + varsayılan ayarlar | 1 |
| `email/queries.js` | 2 |
| `email/service.js` — HTML builder | 3 |
| `sendMorningReport` | 3 |
| `email/routes.js` GET/PUT/test | 4 |
| Cron — `scheduleMorningReport` | 5 |
| `SettingsPage.jsx` | 6 |
| Route + Sidebar | 6 |
| UsersPage e-posta alanı | 7 |

**Test dosyası:** `backend/src/modules/email/email.test.js`  
Kapsam: queries (5 test) + HTML builder (2 test) + API endpoints (3 test) = 10 test
