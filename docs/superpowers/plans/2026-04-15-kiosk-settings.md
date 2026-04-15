# Kiosk & Ayarlar Geliştirmesi — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kiosk self-servis sistemine 3 yeni sekme + 2 sekme genişletmesi ekle; ayarlar sayfasını gün seçimi, bölüm seçimi, SMTP UI, önizleme ve gönderim geçmişiyle zenginleştir.

**Architecture:** DB migration önce (yeni tablolar + kolonlar), ardından backend endpoint'leri, ardından frontend bileşenleri. Her faz kendi commit'iyle teslim edilir ve testler geçmeden bir sonraki faza geçilmez.

**Tech Stack:** Node.js + Express + better-sqlite3 (backend), React + TanStack Query + Tailwind (frontend), Vitest + supertest (test)

---

## Dosya Haritası

**Oluşturulacak:**
- `backend/src/modules/announcements/routes.js` — admin duyuru CRUD
- `backend/src/modules/announcements/queries.js` — duyuru SQL sorguları

**Değiştirilecek:**
- `backend/src/shared/db/index.js` — 5 migration eklenecek
- `backend/src/modules/self-service/routes.js` — 4 yeni endpoint + my-info + maintenance güncelleme
- `backend/src/modules/self-service/self-service.test.js` — yeni endpoint testleri
- `backend/src/modules/maintenance/queries.js` — `createRequest` reporter_personnel_id eklenecek
- `backend/src/modules/email/queries.js` — days, sections, smtp, log query'leri
- `backend/src/modules/email/service.js` — section filter, day filter, log, SMTP DB
- `backend/src/modules/email/routes.js` — preview + log endpoint'leri
- `backend/src/modules/email/email.test.js` — yeni test'ler
- `backend/src/app.js` — announcements router mount
- `frontend/src/modules/self-service/SelfServicePage.jsx` — 6 sekme
- `frontend/src/modules/admin/SettingsPage.jsx` — 6 bölüm

---

## Task 1: DB Migration

**Files:**
- Modify: `backend/src/shared/db/index.js`

- [ ] **Step 1: Mevcut migration bloklarının en altına 5 try/catch ekle**

`initDB()` fonksiyonundaki son try/catch bloğundan sonra şunları ekle:

```js
// Faz 1 migrations
try { db.exec('ALTER TABLE personnel ADD COLUMN expected_departure TEXT') }
  catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
try { db.exec('ALTER TABLE maintenance_requests ADD COLUMN reporter_personnel_id INTEGER REFERENCES personnel(id)') }
  catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
try { db.exec(`CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT
)`) } catch(e) { console.error('[Migration] announcements:', e.message) }
try { db.exec(`CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  personnel_id INTEGER REFERENCES personnel(id),
  type TEXT NOT NULL CHECK(type IN ('complaint','suggestion','other')),
  message TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
)`) } catch(e) { console.error('[Migration] feedback:', e.message) }
try { db.exec(`CREATE TABLE IF NOT EXISTS email_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sent_at TEXT DEFAULT (datetime('now')),
  recipients TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('success','error')),
  error_msg TEXT
)`) } catch(e) { console.error('[Migration] email_log:', e.message) }
```

- [ ] **Step 2: Backend'i başlat ve migration'ların hatasız çalıştığını doğrula**

```bash
cd backend && node -e "import('./src/shared/db/index.js').then(m=>m.initDB()).then(()=>console.log('OK'))"
```

Beklenen çıktı: `OK` (hata yok)

- [ ] **Step 3: Commit**

```bash
git add backend/src/shared/db/index.js
git commit -m "feat: faz1 DB migration — announcements, feedback, email_log, expected_departure, reporter_personnel_id"
```

---

## Task 2: Backend — Kiosk Endpoint'leri

**Files:**
- Modify: `backend/src/modules/self-service/routes.js`
- Modify: `backend/src/modules/maintenance/queries.js`
- Modify: `backend/src/modules/self-service/self-service.test.js`

- [ ] **Step 1: Önce test yaz — yeni endpoint'ler için**

`backend/src/modules/self-service/self-service.test.js` dosyasına ekle (mevcut describe bloklarının altına):

```js
import jwt from 'jsonwebtoken'

// kiosk token yardımcısı — dosya başında tanımlıysa tekrar tanımlama
function makeKioskToken(personnelId = 1) {
  return jwt.sign({ personnelId, role: 'kiosk' }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' })
}

describe('GET /api/self-service/my-maintenance', () => {
  it('kiosk token ile 200 ve dizi döner', async () => {
    const res = await request(app)
      .get('/api/self-service/my-maintenance')
      .set('Authorization', `Bearer ${makeKioskToken(1)}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
  it('staff token ile 403 döner', async () => {
    const res = await request(app)
      .get('/api/self-service/my-maintenance')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(403)
  })
})

describe('GET /api/self-service/my-discipline', () => {
  it('kiosk token ile 200 ve dizi döner', async () => {
    const res = await request(app)
      .get('/api/self-service/my-discipline')
      .set('Authorization', `Bearer ${makeKioskToken(1)}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})

describe('GET /api/self-service/announcements', () => {
  it('kiosk token ile 200 ve dizi döner', async () => {
    const res = await request(app)
      .get('/api/self-service/announcements')
      .set('Authorization', `Bearer ${makeKioskToken(1)}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})

describe('POST /api/self-service/feedback', () => {
  it('geçerli veriyle 201 döner', async () => {
    const res = await request(app)
      .post('/api/self-service/feedback')
      .set('Authorization', `Bearer ${makeKioskToken(1)}`)
      .send({ type: 'suggestion', message: 'Bu yeterince uzun bir öneri metnidir.', anonymous: false })
    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('id')
  })
  it('kısa mesaj 400 döner', async () => {
    const res = await request(app)
      .post('/api/self-service/feedback')
      .set('Authorization', `Bearer ${makeKioskToken(1)}`)
      .send({ type: 'complaint', message: 'kisa', anonymous: false })
    expect(res.status).toBe(400)
  })
  it('anonymous=true ise personnel_id kaydedilmez', async () => {
    const res = await request(app)
      .post('/api/self-service/feedback')
      .set('Authorization', `Bearer ${makeKioskToken(1)}`)
      .send({ type: 'other', message: 'Anonim bir geri bildirim metnidir.', anonymous: true })
    expect(res.status).toBe(201)
  })
  it('geçersiz type 400 döner', async () => {
    const res = await request(app)
      .post('/api/self-service/feedback')
      .set('Authorization', `Bearer ${makeKioskToken(1)}`)
      .send({ type: 'invalid', message: 'Bu yeterince uzun bir mesajdır.', anonymous: false })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/self-service/my-info expected_departure', () => {
  it('my-info yanıtında expected_departure alanı bulunur', async () => {
    const res = await request(app)
      .get('/api/self-service/my-info')
      .set('Authorization', `Bearer ${makeKioskToken(1)}`)
    expect(res.status).toBe(200)
    expect('expected_departure' in res.body).toBe(true)
  })
})
```

- [ ] **Step 2: Testlerin başarısız olduğunu doğrula**

```bash
cd backend && npx vitest run src/modules/self-service/self-service.test.js
```

Beklenen: birçok test FAIL (endpoint'ler henüz yok)

- [ ] **Step 3: `maintenance/queries.js` — createRequest'e reporter_personnel_id ekle**

`createRequest` fonksiyonunu şöyle güncelle:

```js
export function createRequest({ location, description, priority, reporterUserId, reporterPersonnelId, photoBefore, waitReason }) {
  const db = getDB()
  const slaHours = priority === 'high' ? 4 : priority === 'low' ? 72 : 24
  const r = db.prepare(`
    INSERT INTO maintenance_requests(location,description,priority,reporter_user_id,reporter_personnel_id,photo_before,wait_reason,sla_deadline)
    VALUES(?,?,?,?,?,?,?,datetime('now','+${slaHours} hours'))
  `).run(location, description, priority || 'medium', reporterUserId || null, reporterPersonnelId || null, photoBefore || null, waitReason || null)
  return r.lastInsertRowid
}
```

- [ ] **Step 4: `self-service/routes.js` — 4 yeni endpoint ekle + my-info güncelle + maintenance güncelle**

Dosyanın tüm içeriğini şununla değiştir:

```js
import { Router } from 'express'
import { requireKioskOrStaff } from '../../shared/auth/middleware.js'
import { getDB } from '../../shared/db/index.js'
import { createRequest } from '../maintenance/queries.js'
import { changeKioskPin } from '../../shared/auth/service.js'

export const selfServiceRouter = Router()

selfServiceRouter.get('/my-info', requireKioskOrStaff, (req, res) => {
  if (!req.user.personnelId) return res.status(403).json({ error: 'Kiosk token gerekli' })
  try {
    const db = getDB()
    const p = db.prepare(`
      SELECT id, full_name, company, hometown, check_in_date, discipline_points, expected_departure
      FROM personnel WHERE id=?
    `).get(req.user.personnelId)
    const assignment = db.prepare(`
      SELECT r.block, r.floor, r.room_no, ra.bed_no
      FROM room_assignments ra JOIN rooms r ON r.id=ra.room_id
      WHERE ra.personnel_id=? AND ra.check_out_at IS NULL
    `).get(req.user.personnelId)
    res.json({ ...p, room: assignment || null })
  } catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

selfServiceRouter.get('/laundry-status', requireKioskOrStaff, (req, res) => {
  if (!req.user.personnelId) return res.status(403).json({ error: 'Kiosk token gerekli' })
  try {
    const db = getDB()
    const assignment = db.prepare(`
      SELECT room_id FROM room_assignments WHERE personnel_id=? AND check_out_at IS NULL
    `).get(req.user.personnelId)
    if (!assignment) return res.json([])
    const bags = db.prepare('SELECT * FROM laundry_bags WHERE room_id=? ORDER BY collected_at DESC LIMIT 10').all(assignment.room_id)
    res.json(bags)
  } catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

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
      reporterUserId: req.user.userId || null,
      reporterPersonnelId: req.user.personnelId,
    })
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

selfServiceRouter.post('/set-pin', requireKioskOrStaff, (req, res) => {
  if (!req.user.personnelId) return res.status(403).json({ error: 'Kiosk token gerekli' })
  const { currentPin, newPin } = req.body
  if (!currentPin || !newPin) return res.status(400).json({ error: 'Mevcut ve yeni PIN gerekli' })
  const result = changeKioskPin(req.user.personnelId, currentPin, newPin)
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.json(result)
})

selfServiceRouter.get('/my-maintenance', requireKioskOrStaff, (req, res) => {
  if (!req.user.personnelId) return res.status(403).json({ error: 'Kiosk token gerekli' })
  try {
    const db = getDB()
    const rows = db.prepare(`
      SELECT id, location, description, status, priority, opened_at, closed_at
      FROM maintenance_requests
      WHERE reporter_personnel_id=?
      ORDER BY opened_at DESC LIMIT 20
    `).all(req.user.personnelId)
    res.json(rows)
  } catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

selfServiceRouter.get('/my-discipline', requireKioskOrStaff, (req, res) => {
  if (!req.user.personnelId) return res.status(403).json({ error: 'Kiosk token gerekli' })
  try {
    const db = getDB()
    const rows = db.prepare(`
      SELECT id, card_type, reason, created_at
      FROM discipline_records
      WHERE personnel_id=?
      ORDER BY created_at DESC
    `).all(req.user.personnelId)
    res.json(rows)
  } catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

selfServiceRouter.get('/announcements', requireKioskOrStaff, (req, res) => {
  try {
    const db = getDB()
    const rows = db.prepare(`
      SELECT id, title, body, created_at
      FROM announcements
      WHERE expires_at IS NULL OR expires_at > datetime('now')
      ORDER BY created_at DESC
    `).all()
    res.json(rows)
  } catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

selfServiceRouter.post('/feedback', requireKioskOrStaff, (req, res) => {
  if (!req.user.personnelId) return res.status(403).json({ error: 'Kiosk token gerekli' })
  const { type, message, anonymous } = req.body
  if (!['complaint', 'suggestion', 'other'].includes(type))
    return res.status(400).json({ error: 'Geçersiz tip (complaint, suggestion, other)' })
  if (!message || message.trim().length < 20)
    return res.status(400).json({ error: 'Mesaj en az 20 karakter olmalıdır' })
  try {
    const db = getDB()
    const r = db.prepare(`
      INSERT INTO feedback(personnel_id, type, message) VALUES(?,?,?)
    `).run(anonymous ? null : req.user.personnelId, type, message.trim())
    res.status(201).json({ id: r.lastInsertRowid })
  } catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})
```

- [ ] **Step 5: Testleri çalıştır ve geçtiğini doğrula**

```bash
cd backend && npx vitest run src/modules/self-service/self-service.test.js
```

Beklenen: tüm testler PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/self-service/routes.js backend/src/modules/self-service/self-service.test.js backend/src/modules/maintenance/queries.js
git commit -m "feat: faz2 kiosk backend — my-maintenance, my-discipline, announcements, feedback endpoint'leri"
```

---

## Task 3: Backend — Admin Duyuru CRUD

**Files:**
- Create: `backend/src/modules/announcements/queries.js`
- Create: `backend/src/modules/announcements/routes.js`
- Modify: `backend/src/app.js`

- [ ] **Step 1: `announcements/queries.js` oluştur**

```js
import { getDB } from '../../shared/db/index.js'

export function getAll() {
  return getDB().prepare('SELECT * FROM announcements ORDER BY created_at DESC').all()
}

export function create({ title, body, expiresAt, createdBy }) {
  const r = getDB().prepare(`
    INSERT INTO announcements(title, body, expires_at, created_by) VALUES(?,?,?,?)
  `).run(title, body, expiresAt || null, createdBy)
  return r.lastInsertRowid
}

export function remove(id) {
  return getDB().prepare('DELETE FROM announcements WHERE id=?').run(id)
}
```

- [ ] **Step 2: `announcements/routes.js` oluştur**

```js
import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { getAll, create, remove } from './queries.js'

export const announcementsRouter = Router()
const adminOnly = requireRole('campus_manager')

announcementsRouter.get('/', ...adminOnly, (req, res) => {
  try { res.json(getAll()) }
  catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

announcementsRouter.post('/', ...adminOnly, (req, res) => {
  const { title, body, expires_at } = req.body
  if (!title || title.trim().length < 2) return res.status(400).json({ error: 'Başlık gerekli' })
  if (!body || body.trim().length < 5) return res.status(400).json({ error: 'İçerik gerekli' })
  try {
    const id = create({ title: title.trim(), body: body.trim(), expiresAt: expires_at || null, createdBy: req.user.userId })
    res.status(201).json({ id })
  } catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

announcementsRouter.delete('/:id', ...adminOnly, (req, res) => {
  try {
    remove(parseInt(req.params.id, 10))
    res.json({ ok: true })
  } catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})
```

- [ ] **Step 3: `app.js`'e router'ı ekle**

`import { emailRouter }` satırından sonra:
```js
import { announcementsRouter } from './modules/announcements/routes.js'
```

`app.use('/api/settings/email', ...)` satırından sonra:
```js
app.use('/api/announcements', writeLimiter, announcementsRouter)
```

- [ ] **Step 4: Backend'i başlat, duyuru endpointini hızlı kontrol et**

```bash
cd backend && npx vitest run src/modules/self-service/self-service.test.js
```

Beklenen: PASS (önceki testler bozulmamış)

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/announcements/ backend/src/app.js
git commit -m "feat: faz3 admin duyuru CRUD endpoint'leri"
```

---

## Task 4: Backend — E-Posta Ayarları Genişletme

**Files:**
- Modify: `backend/src/modules/email/queries.js`
- Modify: `backend/src/modules/email/service.js`
- Modify: `backend/src/modules/email/routes.js`
- Modify: `backend/src/modules/email/email.test.js`

- [ ] **Step 1: Test yaz — yeni ayarlar için**

`email.test.js`'e ekle (mevcut describe bloklarının altına):

```js
describe('days & sections settings', () => {
  it('varsayılan days hafta içi döner', () => {
    const s = getEmailSettings()
    expect(s.days).toEqual([1, 2, 3, 4, 5])
  })
  it('varsayılan sections 5 bölüm döner', () => {
    const s = getEmailSettings()
    expect(s.sections).toContain('occupancy')
    expect(s.sections).toContain('maintenance')
  })
  it('setEmailSettings days kaydeder', () => {
    setEmailSettings({ enabled: false, hour: 7, minute: 0, cc: '', days: [1, 2, 3], sections: ['occupancy', 'maintenance'] })
    const s = getEmailSettings()
    expect(s.days).toEqual([1, 2, 3])
    expect(s.sections).toEqual(['occupancy', 'maintenance'])
    // geri al
    setEmailSettings({ enabled: false, hour: 7, minute: 0, cc: '', days: [1,2,3,4,5], sections: ['occupancy','housekeeping','maintenance','laundry','checkinout'] })
  })
})

describe('buildReportHtml section filter', () => {
  it('yalnızca seçili bölümleri içerir', () => {
    const html = buildReportHtml(['occupancy'])
    expect(html).toContain('Doluluk')
    expect(html).not.toContain('Çamaşırhane')
  })
})

describe('GET /api/settings/email/preview', () => {
  it('200 ve HTML string döner', async () => {
    const res = await request(app)
      .get('/api/settings/email/preview')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/html/)
  })
})

describe('GET /api/settings/email/log', () => {
  it('200 ve dizi döner', async () => {
    const res = await request(app)
      .get('/api/settings/email/log')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})
```

- [ ] **Step 2: Testlerin başarısız olduğunu doğrula**

```bash
cd backend && npx vitest run src/modules/email/email.test.js
```

Beklenen: yeni testler FAIL

- [ ] **Step 3: `email/queries.js` güncelle**

Tüm dosyayı şununla değiştir:

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
  const daysRaw = getSetting('email_days') ?? '1,2,3,4,5'
  const sectionsRaw = getSetting('email_sections') ?? 'occupancy,housekeeping,maintenance,laundry,checkinout'
  return {
    enabled:  getSetting('email_enabled') === 'true',
    hour:     parseInt(getSetting('email_hour') ?? '7', 10),
    minute:   parseInt(getSetting('email_minute') ?? '0', 10),
    cc:       getSetting('email_cc') ?? '',
    days:     daysRaw.split(',').map(Number),
    sections: sectionsRaw.split(','),
    smtp: {
      host:  getSetting('smtp_host') ?? '',
      port:  getSetting('smtp_port') ?? '',
      user:  getSetting('smtp_user') ?? '',
      pass:  getSetting('smtp_pass') ?? '',
      from:  getSetting('smtp_from') ?? '',
    },
  }
}

export function setEmailSettings({ enabled, hour, minute, cc, days, sections, smtp }) {
  setSetting('email_enabled', enabled ? 'true' : 'false')
  setSetting('email_hour',    String(hour))
  setSetting('email_minute',  String(minute))
  setSetting('email_cc',      cc ?? '')
  if (Array.isArray(days))    setSetting('email_days',     days.join(','))
  if (Array.isArray(sections)) setSetting('email_sections', sections.join(','))
  if (smtp) {
    if (smtp.host !== undefined) setSetting('smtp_host', smtp.host)
    if (smtp.port !== undefined) setSetting('smtp_port', smtp.port)
    if (smtp.user !== undefined) setSetting('smtp_user', smtp.user)
    if (smtp.from !== undefined) setSetting('smtp_from', smtp.from)
    // pass yalnızca boş değilse yaz (maskelenmiş "●●●●" göndermemek için)
    if (smtp.pass && smtp.pass !== '●●●●') setSetting('smtp_pass', smtp.pass)
  }
}

export function getManagerEmails() {
  const db = getDB()
  return db.prepare(`
    SELECT email FROM users WHERE role='campus_manager' AND email IS NOT NULL AND email != ''
  `).all().map(r => r.email)
}

export function logEmailSend({ recipients, status, errorMsg }) {
  const db = getDB()
  db.prepare(`
    INSERT INTO email_log(recipients, status, error_msg) VALUES(?,?,?)
  `).run(recipients, status, errorMsg || null)
}

export function getEmailLog(limit = 30) {
  return getDB().prepare(`
    SELECT id, sent_at, recipients, status, error_msg FROM email_log ORDER BY sent_at DESC LIMIT ?
  `).all(limit)
}
```

- [ ] **Step 4: `email/service.js` güncelle**

```js
import nodemailer from 'nodemailer'
import { getEmailSettings, getManagerEmails, getSetting, logEmailSend } from './queries.js'
import { getOccupancyReport, getMaintenanceReport, getHousekeepingReport } from '../reports/service.js'
import { getDB } from '../../shared/db/index.js'

function createTransport() {
  // DB'deki SMTP ayarları varsa öncelikli, yoksa .env fallback
  const host = getSetting('smtp_host') || process.env.SMTP_HOST
  const port = parseInt(getSetting('smtp_port') || process.env.SMTP_PORT || '587', 10)
  const user = getSetting('smtp_user') || process.env.SMTP_USER
  const pass = getSetting('smtp_pass') || process.env.SMTP_PASS
  return nodemailer.createTransport({
    host, port,
    secure: port === 465,
    auth: { user, pass },
  })
}

export function buildReportHtml(sections) {
  // sections: string[] | undefined — undefined ise DB'den oku
  const activeSections = sections ?? (getSetting('email_sections') ?? 'occupancy,housekeeping,maintenance,laundry,checkinout').split(',')
  const has = (s) => activeSections.includes(s)

  const today = new Date().toISOString().split('T')[0]
  const occupancy   = has('occupancy')   ? getOccupancyReport()           : null
  const maintenance = has('maintenance') ? getMaintenanceReport()          : null
  const housekeeping = has('housekeeping') ? getHousekeepingReport(today)  : null

  const db = getDB()
  const checkinsToday = has('checkinout') ? (db.prepare(`SELECT COUNT(*) as c FROM room_assignments WHERE DATE(assigned_at)=DATE('now')`).get()?.c ?? 0) : 0
  const checkoutsToday = has('checkinout') ? (db.prepare(`SELECT COUNT(*) as c FROM room_assignments WHERE DATE(check_out_at)=DATE('now')`).get()?.c ?? 0) : 0
  const laundryPending = has('laundry') ? (db.prepare(`SELECT COUNT(*) as c FROM laundry_items WHERE status NOT IN ('delivered','lost')`).get()?.c ?? 0) : 0
  const laundryDeliveredToday = has('laundry') ? (db.prepare(`SELECT COUNT(*) as c FROM laundry_items WHERE status='delivered' AND DATE(updated_at)=DATE('now')`).get()?.c ?? 0) : 0

  const dolulukOrani = occupancy
    ? (occupancy.totals.yatak > 0 ? Math.round((occupancy.totals.dolu / occupancy.totals.yatak) * 100) : 0)
    : 0

  const rows = (arr, cols) => arr.map(row =>
    `<tr>${cols.map(c => `<td style="padding:4px 8px;border:1px solid #ddd">${row[c] ?? '-'}</td>`).join('')}</tr>`
  ).join('')

  const table = (headers, cols, data) => `
    <table style="border-collapse:collapse;width:100%;margin-bottom:16px;font-size:13px">
      <thead><tr>${headers.map(h => `<th style="padding:6px 8px;border:1px solid #ddd;background:#f3f4f6;text-align:left">${h}</th>`).join('')}</tr></thead>
      <tbody>${rows(data, cols)}</tbody>
    </table>`

  return `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><style>
  body{font-family:Arial,sans-serif;color:#1f2937;background:#fff}
  h2{margin:24px 0 8px;color:#1d4ed8;border-bottom:2px solid #e5e7eb;padding-bottom:4px}
  .kpi-grid{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px}
  .kpi{background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px;padding:12px 20px;min-width:120px}
  .kpi-val{font-size:28px;font-weight:bold;color:#0369a1}
  .kpi-lbl{font-size:11px;color:#64748b;text-transform:uppercase}
</style></head><body>
<p style="color:#64748b;font-size:12px">Rapor tarihi: ${today}</p>

${has('occupancy') && occupancy ? `
<h2>KPI Özeti</h2>
<div class="kpi-grid">
  <div class="kpi"><div class="kpi-val">%${dolulukOrani}</div><div class="kpi-lbl">Doluluk</div></div>
  <div class="kpi"><div class="kpi-val">${occupancy.totals.dolu}</div><div class="kpi-lbl">Dolu Yatak</div></div>
  ${maintenance ? `<div class="kpi"><div class="kpi-val">${maintenance.open}</div><div class="kpi-lbl">Açık Arıza</div></div>
  <div class="kpi"><div class="kpi-val" style="color:${maintenance.overdue>0?'#dc2626':'#0369a1'}">${maintenance.overdue}</div><div class="kpi-lbl">SLA İhlali</div></div>` : ''}
</div>
<h2>Doluluk — Blok Bazlı</h2>
${table(['Blok','Oda','Toplam Yatak','Dolu','Boş'],['block','oda_sayisi','toplam_yatak','dolu_yatak','bos'],
  occupancy.blocks.map(b=>({...b,bos:b.toplam_yatak-b.dolu_yatak})))}
` : ''}

${has('housekeeping') && housekeeping ? `
<h2>Temizlik Özeti — Bugün</h2>
<p>Toplam: ${housekeeping.total} | Tamamlanan: ${housekeeping.done} | Atlanan: ${housekeeping.skipped} | Bekleyen: ${housekeeping.pending}</p>
${table(['Alan','Blok','Kat','Görev','Durum','Temizlikçi'],['area','block','floor','task_type','durum','temizlikci'],housekeeping.tasks.slice(0,20))}
${housekeeping.tasks.length>20?`<p style="color:#64748b;font-size:12px">...ve ${housekeeping.tasks.length-20} görev daha</p>`:''}
` : ''}

${has('maintenance') && maintenance ? `
<h2>Bakım / Arıza — Son 7 Gün</h2>
<p>Açık: ${maintenance.open} | Tamamlanan: ${maintenance.closed} | SLA İhlali: <span style="color:${maintenance.overdue>0?'#dc2626':'inherit'}">${maintenance.overdue}</span></p>
${table(['Konum','Açıklama','Öncelik','Durum','SLA','Teknisyen'],['location','description','priority','durum','sla','teknisyen'],maintenance.requests.slice(0,15))}
` : ''}

${has('checkinout') ? `
<h2>Giriş / Çıkış — Bugün</h2>
<div class="kpi-grid">
  <div class="kpi"><div class="kpi-val">${checkinsToday}</div><div class="kpi-lbl">Giriş</div></div>
  <div class="kpi"><div class="kpi-val">${checkoutsToday}</div><div class="kpi-lbl">Çıkış</div></div>
</div>
` : ''}

${has('laundry') ? `
<h2>Çamaşırhane Özeti</h2>
<div class="kpi-grid">
  <div class="kpi"><div class="kpi-val">${laundryPending}</div><div class="kpi-lbl">Bekleyen Sipariş</div></div>
  <div class="kpi"><div class="kpi-val">${laundryDeliveredToday}</div><div class="kpi-lbl">Bugün Teslim</div></div>
</div>
` : ''}

<hr style="margin-top:32px;border:none;border-top:1px solid #e5e7eb">
<p style="font-size:11px;color:#94a3b8">Bu e-posta YYS tarafından otomatik olarak oluşturulmuştur.</p>
</body></html>`
}

export async function sendMorningReport() {
  const settings = getEmailSettings()
  if (!settings.enabled) return

  // Gün kontrolü — JS getDay(): 0=Pazar,1=Pzt,...,6=Cmt
  const todayDay = new Date().getDay()
  if (!settings.days.includes(todayDay)) return

  const to = getManagerEmails()
  if (to.length === 0) return

  const from = getSetting('smtp_from') || process.env.SMTP_FROM || 'YYS <noreply@yys.local>'
  const html = buildReportHtml()
  const today = new Date().toISOString().split('T')[0]
  const transport = createTransport()

  try {
    await transport.sendMail({
      from,
      to: to.join(', '),
      ...(settings.cc ? { cc: settings.cc } : {}),
      subject: `YYS Sabah Raporu — ${today}`,
      html,
    })
    logEmailSend({ recipients: to.join(', '), status: 'success' })
  } catch (e) {
    logEmailSend({ recipients: to.join(', '), status: 'error', errorMsg: e.message })
    console.error('[Email] SMTP gönderim hatası:', e.message)
    throw e
  }
}
```

- [ ] **Step 5: `email/routes.js` güncelle**

```js
import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { getEmailSettings, setEmailSettings, getEmailLog } from './queries.js'
import { sendMorningReport, buildReportHtml } from './service.js'
import { scheduleMorningReport } from '../../shared/cron/index.js'

export const emailRouter = Router()
const adminOnly = requireRole('campus_manager')

emailRouter.get('/', ...adminOnly, (req, res) => {
  try { res.json(getEmailSettings()) }
  catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

emailRouter.put('/', ...adminOnly, (req, res) => {
  try {
    const { enabled, hour, minute, cc, days, sections, smtp } = req.body
    if (typeof hour !== 'number' || hour < 0 || hour > 23)
      return res.status(400).json({ error: 'Geçersiz saat (0-23)' })
    if (![0,15,30,45].includes(minute))
      return res.status(400).json({ error: 'Dakika 0, 15, 30 veya 45 olmalı' })
    if (Array.isArray(days) && (days.length === 0 || days.some(d => d < 0 || d > 6)))
      return res.status(400).json({ error: 'Geçersiz gün seçimi' })
    setEmailSettings({ enabled: !!enabled, hour, minute, cc: cc ?? '', days, sections, smtp })
    scheduleMorningReport()
    res.json({ ok: true })
  } catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

emailRouter.get('/preview', ...adminOnly, (req, res) => {
  try {
    const html = buildReportHtml()
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(html)
  } catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

emailRouter.get('/log', ...adminOnly, (req, res) => {
  try { res.json(getEmailLog()) }
  catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

emailRouter.post('/test', ...adminOnly, async (req, res) => {
  try {
    await sendMorningReport()
    res.json({ ok: true })
  } catch (e) { console.error('[Route]', e); res.status(500).json({ error: e.message }) }
})
```

- [ ] **Step 6: Testleri çalıştır**

```bash
cd backend && npx vitest run src/modules/email/email.test.js
```

Beklenen: tüm testler PASS (mevcut + yeniler)

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/email/
git commit -m "feat: faz4 e-posta backend — gün/bölüm filtresi, SMTP DB, önizleme, gönderim logu"
```

---

## Task 5: Frontend — Kiosk 6 Sekme

**Files:**
- Modify: `frontend/src/modules/self-service/SelfServicePage.jsx`

- [ ] **Step 1: Tüm dosyayı şununla değiştir**

```jsx
import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import api from '../../shared/api/client.js'

const STATUS_LABELS = { clean:'Temiz', dirty:'Kirli', collected:'Toplandı', washing:'Yıkanıyor', ready:'Hazır', distributed:'Teslim Edildi' }
const STATUS_COLORS = { clean:'text-green-400', dirty:'text-red-400', collected:'text-yellow-400', washing:'text-blue-400', ready:'text-green-400', distributed:'text-slate-400' }
const MAINT_STATUS = { open:'Bekliyor', assigned:'Atandı', in_progress:'Devam Ediyor', review:'İncelemede', done:'Tamamlandı' }
const MAINT_STATUS_COLOR = { open:'text-yellow-400', assigned:'text-blue-400', in_progress:'text-blue-400', review:'text-purple-400', done:'text-green-400' }
const CARD_COLOR = { yellow:'text-yellow-400 border-yellow-400', red:'text-red-400 border-red-400' }

const TABS = [
  { key:'info',        label:'👤 Bilgilerim' },
  { key:'laundry',     label:'🧺 Çamaşır' },
  { key:'maintenance', label:'🔧 Arıza' },
  { key:'announcements', label:'📢 Duyurular' },
  { key:'discipline',  label:'⚠️ Disiplin' },
  { key:'feedback',    label:'💬 Şikayet' },
]

export default function SelfServicePage() {
  const [tcNo, setTcNo]   = useState('')
  const [pin, setPin]     = useState('')
  const [kioskToken, setKioskToken] = useState(null)
  const [loginError, setLoginError] = useState('')
  const [activeTab, setActiveTab]   = useState('info')

  // Arıza alt mod: 'report' | 'track'
  const [maintMode, setMaintMode] = useState('report')
  const [maintForm, setMaintForm] = useState({ location:'', description:'' })
  const [maintSuccess, setMaintSuccess] = useState(false)

  // Şikayet formu
  const [fbForm, setFbForm] = useState({ type:'suggestion', message:'', anonymous:false })
  const [fbSuccess, setFbSuccess] = useState(false)

  // Okunmamış duyuru takibi
  const [readIds, setReadIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('kiosk_read_ann') || '[]') } catch { return [] }
  })

  const kioskApi = {
    get: (url) => api.get(url, { headers: { Authorization: `Bearer ${kioskToken}` } }),
    post: (url, data) => api.post(url, data, { headers: { Authorization: `Bearer ${kioskToken}` } }),
  }

  const handleLogin = async (e) => {
    e.preventDefault(); setLoginError('')
    try {
      const res = await api.post('/auth/kiosk-login', { tc_no: tcNo, pin })
      setKioskToken(res.data.token)
    } catch (err) { setLoginError(err.response?.data?.error || 'Giriş başarısız') }
  }

  const { data: myInfo } = useQuery({
    queryKey: ['kiosk-info', kioskToken],
    queryFn: () => kioskApi.get('/self-service/my-info').then(r => r.data),
    enabled: !!kioskToken,
  })
  const { data: laundryStatus = [] } = useQuery({
    queryKey: ['kiosk-laundry', kioskToken],
    queryFn: () => kioskApi.get('/self-service/laundry-status').then(r => r.data),
    enabled: !!kioskToken && activeTab === 'laundry',
  })
  const { data: myMaint = [] } = useQuery({
    queryKey: ['kiosk-maint', kioskToken],
    queryFn: () => kioskApi.get('/self-service/my-maintenance').then(r => r.data),
    enabled: !!kioskToken && activeTab === 'maintenance' && maintMode === 'track',
  })
  const { data: announcements = [] } = useQuery({
    queryKey: ['kiosk-ann', kioskToken],
    queryFn: () => kioskApi.get('/self-service/announcements').then(r => r.data),
    enabled: !!kioskToken && activeTab === 'announcements',
  })
  const { data: discipline = [] } = useQuery({
    queryKey: ['kiosk-disc', kioskToken],
    queryFn: () => kioskApi.get('/self-service/my-discipline').then(r => r.data),
    enabled: !!kioskToken && activeTab === 'discipline',
  })

  const submitMaint = useMutation({
    mutationFn: () => kioskApi.post('/self-service/maintenance', maintForm),
    onSuccess: () => { setMaintSuccess(true); setMaintForm({ location:'', description:'' }) },
  })
  const submitFb = useMutation({
    mutationFn: () => kioskApi.post('/self-service/feedback', fbForm),
    onSuccess: () => { setFbSuccess(true); setFbForm({ type:'suggestion', message:'', anonymous:false }) },
  })

  // Okundu işaretleme
  useEffect(() => {
    if (activeTab === 'announcements' && announcements.length > 0) {
      const ids = [...new Set([...readIds, ...announcements.map(a => a.id)])]
      setReadIds(ids)
      localStorage.setItem('kiosk_read_ann', JSON.stringify(ids))
    }
  }, [activeTab, announcements])

  const unreadCount = announcements.filter(a => !readIds.includes(a.id)).length
  const openMaintCount = myMaint.filter(m => m.status !== 'done').length

  function daysLeft(dateStr) {
    if (!dateStr) return null
    const diff = Math.ceil((new Date(dateStr) - new Date()) / 86400000)
    return diff
  }

  // ─── Login ─────────────────────────────────────────────────
  if (!kioskToken) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-10">
            <div className="text-5xl mb-4">🏨</div>
            <h1 className="text-2xl font-bold text-slate-100">Personel Self-Servis</h1>
            <p className="text-slate-500 text-sm mt-2">TC kimlik numaranızı girerek giriş yapın</p>
          </div>
          <form onSubmit={handleLogin} className="bg-slate-900 rounded-2xl p-6 space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-2">TC Kimlik No</label>
              <input type="text" value={tcNo} onChange={e => setTcNo(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-lg text-slate-100 text-center font-mono tracking-widest focus:outline-none focus:border-blue-500"
                maxLength={11} autoFocus />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-2">PIN (4 hane)</label>
              <input type="password" inputMode="numeric" maxLength={4} value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g,'').slice(0,4))}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 text-center text-2xl tracking-widest focus:outline-none focus:border-amber-500"
                placeholder="····" required />
            </div>
            {loginError && <div className="text-red-400 text-sm text-center">{loginError}</div>}
            <button type="submit" disabled={tcNo.length < 11 || pin.length !== 4}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-xl py-3 text-base font-medium transition-colors">
              Giriş Yap
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ─── Ana Ekran ──────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col max-w-lg mx-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between py-4 mb-4">
        <div>
          <div className="font-semibold text-slate-100">{myInfo?.full_name}</div>
          {myInfo?.room && (
            <div className="text-xs text-slate-500">{myInfo.room.block} Blok - Oda {myInfo.room.room_no} · Yatak {myInfo.room.bed_no}</div>
          )}
        </div>
        <button onClick={() => setKioskToken(null)} className="text-xs text-slate-500 hover:text-slate-300 px-3 py-1 bg-slate-800 rounded-lg">Çıkış</button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {TABS.map(t => {
          let badge = null
          if (t.key === 'announcements' && unreadCount > 0) badge = unreadCount
          if (t.key === 'maintenance' && openMaintCount > 0) badge = openMaintCount
          return (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`relative flex-shrink-0 py-2 px-3 rounded-xl text-xs font-medium transition-colors whitespace-nowrap ${activeTab === t.key ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
              {t.label}
              {badge ? (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{badge}</span>
              ) : null}
            </button>
          )
        })}
      </div>

      {/* ── Tab: Bilgilerim ── */}
      {activeTab === 'info' && myInfo && (
        <div className="space-y-4">
          <div className="bg-slate-900 rounded-2xl p-5 space-y-3">
            <h2 className="font-medium text-slate-300">Kişisel Bilgiler</h2>
            {[
              { label:'Şirket',       value: myInfo.company },
              { label:'Giriş Tarihi', value: myInfo.check_in_date ? new Date(myInfo.check_in_date).toLocaleDateString('tr-TR') : '-' },
              { label:'Disiplin Puanı', value: myInfo.discipline_points ?? 0 },
            ].map(item => (
              <div key={item.label} className="flex justify-between text-sm">
                <span className="text-slate-500">{item.label}</span>
                <span className={`font-medium ${item.label === 'Disiplin Puanı' && item.value >= 3 ? 'text-red-400' : 'text-slate-200'}`}>{item.value || '-'}</span>
              </div>
            ))}
          </div>
          {myInfo.room && (
            <div className="bg-slate-900 rounded-2xl p-5">
              <h2 className="font-medium text-slate-300 mb-3">Oda Bilgisi</h2>
              <div className="text-3xl font-bold text-blue-400">{myInfo.room.block} — {myInfo.room.room_no}</div>
              <div className="text-sm text-slate-500 mt-1">Kat {myInfo.room.floor} · Yatak {myInfo.room.bed_no}</div>
            </div>
          )}
          {myInfo.expected_departure && (() => {
            const days = daysLeft(myInfo.expected_departure)
            const urgent = days !== null && days <= 7
            return (
              <div className={`rounded-2xl p-5 border ${urgent ? 'bg-red-950 border-red-800' : 'bg-slate-900 border-slate-800'}`}>
                <h2 className="font-medium text-slate-300 mb-2">📅 Tahmini Çıkış</h2>
                <div className={`text-xl font-bold ${urgent ? 'text-red-400' : 'text-green-400'}`}>
                  {new Date(myInfo.expected_departure).toLocaleDateString('tr-TR')}
                </div>
                {days !== null && <div className="text-sm text-slate-500 mt-1">{days > 0 ? `${days} gün kaldı` : days === 0 ? 'Bugün' : 'Geçti'}</div>}
              </div>
            )
          })()}
        </div>
      )}

      {/* ── Tab: Çamaşır ── */}
      {activeTab === 'laundry' && (
        <div className="bg-slate-900 rounded-2xl p-5 space-y-3">
          <h2 className="font-medium text-slate-300 mb-2">Çamaşır Torbası Durumu</h2>
          {laundryStatus.length === 0 ? (
            <div className="text-slate-500 text-sm">Çamaşır kaydı yok</div>
          ) : laundryStatus.map(bag => (
            <div key={bag.id} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
              <div className="text-xs text-slate-500">{bag.collected_at ? new Date(bag.collected_at).toLocaleDateString('tr-TR') : 'Son Torba'}</div>
              <span className={`text-sm font-medium ${STATUS_COLORS[bag.status]}`}>{STATUS_LABELS[bag.status]}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Tab: Arıza ── */}
      {activeTab === 'maintenance' && (
        <div className="bg-slate-900 rounded-2xl p-5 space-y-4">
          <div className="flex gap-2">
            <button onClick={() => setMaintMode('report')}
              className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors ${maintMode === 'report' ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
              Bildir
            </button>
            <button onClick={() => setMaintMode('track')}
              className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors ${maintMode === 'track' ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
              Takibim {openMaintCount > 0 ? `(${openMaintCount})` : ''}
            </button>
          </div>

          {maintMode === 'report' && (
            maintSuccess ? (
              <div className="text-center py-6">
                <div className="text-4xl mb-3">✅</div>
                <div className="text-green-400 font-medium">Arıza kaydınız iletildi</div>
                <button onClick={() => setMaintSuccess(false)} className="mt-4 text-xs text-blue-400">Yeni Bildirim</button>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Konum</label>
                  <input value={maintForm.location} onChange={e => setMaintForm(p => ({...p, location:e.target.value}))}
                    placeholder="Oda 101, Banyo vb."
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Açıklama</label>
                  <textarea value={maintForm.description} onChange={e => setMaintForm(p => ({...p, description:e.target.value}))}
                    rows={4} placeholder="Arızayı açıklayın..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-blue-500" />
                </div>
                <button onClick={() => submitMaint.mutate()}
                  disabled={submitMaint.isPending || !maintForm.location || !maintForm.description}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-xl py-3 text-sm font-medium">
                  {submitMaint.isPending ? 'Gönderiliyor...' : 'Gönder'}
                </button>
              </>
            )
          )}

          {maintMode === 'track' && (
            <div className="space-y-3">
              {myMaint.length === 0 ? (
                <div className="text-slate-500 text-sm">Henüz arıza bildirimi yok</div>
              ) : myMaint.map(m => (
                <div key={m.id} className="bg-slate-800 rounded-xl p-3">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-sm text-slate-200 font-medium">{m.location}</span>
                    <span className={`text-xs font-medium ${MAINT_STATUS_COLOR[m.status] || 'text-slate-400'}`}>{MAINT_STATUS[m.status] || m.status}</span>
                  </div>
                  <div className="text-xs text-slate-500 truncate">{m.description}</div>
                  <div className="text-xs text-slate-600 mt-1">{new Date(m.opened_at).toLocaleDateString('tr-TR')}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Duyurular ── */}
      {activeTab === 'announcements' && (
        <div className="space-y-3">
          {announcements.length === 0 ? (
            <div className="bg-slate-900 rounded-2xl p-5 text-slate-500 text-sm">Aktif duyuru yok</div>
          ) : announcements.map(a => (
            <div key={a.id} className="bg-slate-900 rounded-2xl p-5">
              <div className="font-medium text-slate-200 mb-2">{a.title}</div>
              <div className="text-sm text-slate-400 whitespace-pre-line">{a.body}</div>
              <div className="text-xs text-slate-600 mt-3">{new Date(a.created_at).toLocaleDateString('tr-TR')}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Tab: Disiplin ── */}
      {activeTab === 'discipline' && (
        <div className="bg-slate-900 rounded-2xl p-5 space-y-3">
          <div className="flex justify-between items-center mb-2">
            <h2 className="font-medium text-slate-300">Disiplin Geçmişi</h2>
            <span className={`text-sm font-bold ${(myInfo?.discipline_points ?? 0) >= 3 ? 'text-red-400' : 'text-slate-400'}`}>
              Toplam: {myInfo?.discipline_points ?? 0} puan
            </span>
          </div>
          {discipline.length === 0 ? (
            <div className="text-center py-6">
              <div className="text-3xl mb-2">✅</div>
              <div className="text-green-400 text-sm font-medium">Temiz sicil</div>
            </div>
          ) : discipline.map(d => (
            <div key={d.id} className={`border rounded-xl p-3 ${CARD_COLOR[d.card_type] || 'border-slate-700'}`}>
              <div className="flex justify-between items-center mb-1">
                <span className={`text-xs font-bold uppercase ${d.card_type === 'red' ? 'text-red-400' : 'text-yellow-400'}`}>
                  {d.card_type === 'red' ? '🟥 Kırmızı Kart' : '🟨 Sarı Kart'}
                </span>
                <span className="text-xs text-slate-500">{new Date(d.created_at).toLocaleDateString('tr-TR')}</span>
              </div>
              <div className="text-sm text-slate-300">{d.reason}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Tab: Şikayet/Öneri ── */}
      {activeTab === 'feedback' && (
        <div className="bg-slate-900 rounded-2xl p-5 space-y-4">
          <h2 className="font-medium text-slate-300">Şikayet / Öneri</h2>
          {fbSuccess ? (
            <div className="text-center py-6">
              <div className="text-4xl mb-3">📨</div>
              <div className="text-green-400 font-medium">Geri bildiriminiz alındı</div>
              <button onClick={() => setFbSuccess(false)} className="mt-4 text-xs text-blue-400">Yeni Gönder</button>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                {[['suggestion','💡 Öneri'],['complaint','⚠️ Şikayet'],['other','📝 Diğer']].map(([val,lbl]) => (
                  <button key={val} onClick={() => setFbForm(p=>({...p,type:val}))}
                    className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors ${fbForm.type===val ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
                    {lbl}
                  </button>
                ))}
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-2">Mesajınız</label>
                <textarea value={fbForm.message} onChange={e => setFbForm(p=>({...p,message:e.target.value}))}
                  rows={5} placeholder="En az 20 karakter..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-blue-500" />
                <div className={`text-xs mt-1 ${fbForm.message.length < 20 ? 'text-red-400' : 'text-slate-500'}`}>
                  {fbForm.message.length}/20 min
                </div>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={fbForm.anonymous} onChange={e => setFbForm(p=>({...p,anonymous:e.target.checked}))}
                  className="w-4 h-4 rounded accent-blue-500" />
                <span className="text-sm text-slate-400">Anonim gönder</span>
              </label>
              <button onClick={() => submitFb.mutate()}
                disabled={submitFb.isPending || fbForm.message.length < 20}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-xl py-3 text-sm font-medium">
                {submitFb.isPending ? 'Gönderiliyor...' : 'Gönder'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Dev server'da kiosk sayfasını aç ve test et**

http://localhost:5174 → Self-Servis sayfasına git → kiosk girişi yap (seed'den TC no ve PIN ile)  
Kontrol listesi:
- 6 sekmenin göründüğü
- Bilgilerim'de çıkış tarihi kartının göründüğü (null ise gizli)
- Arıza sekmesinde Bildir/Takibim geçişi
- Duyurular sekmesinde rozet mantığı
- Disiplin sekmesinde "Temiz sicil" mesajı (kayıt yoksa)
- Şikayet formunun 20 karakter validasyonu

- [ ] **Step 3: Commit**

```bash
git add frontend/src/modules/self-service/SelfServicePage.jsx
git commit -m "feat: faz5 kiosk frontend — 6 sekme (duyurular, disiplin, şikayet, arıza takibi, çıkış tarihi)"
```

---

## Task 6: Frontend — Ayarlar Sayfası 6 Bölüm

**Files:**
- Modify: `frontend/src/modules/admin/SettingsPage.jsx`

- [ ] **Step 1: Tüm dosyayı şununla değiştir**

```jsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'

const DAYS = ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt']
const MINUTES = [0, 15, 30, 45]
const SECTIONS = [
  { key:'occupancy',   label:'Doluluk' },
  { key:'housekeeping',label:'Temizlik' },
  { key:'maintenance', label:'Arıza' },
  { key:'laundry',     label:'Çamaşır' },
  { key:'checkinout',  label:'Giriş/Çıkış' },
]

function Panel({ title, children }) {
  return (
    <div className="panel" style={{ marginBottom: '20px' }}>
      <div style={{ height:'2px', background:'var(--accent)' }} />
      <div className="panel-header"><div className="panel-title">{title}</div></div>
      <div className="panel-body">{children}</div>
    </div>
  )
}

export default function SettingsPage() {
  const qc = useQueryClient()
  const [toast, setToast] = useState(null)
  const [showSmtpPass, setShowSmtpPass] = useState(false)
  const [previewHtml, setPreviewHtml] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['email-settings'],
    queryFn: () => api.get('/settings/email').then(r => r.data),
  })
  const { data: emailLog = [] } = useQuery({
    queryKey: ['email-log'],
    queryFn: () => api.get('/settings/email/log').then(r => r.data),
  })

  const [form, setForm] = useState(null)
  const current = form ?? data

  const save = useMutation({
    mutationFn: body => api.put('/settings/email', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['email-settings'] }); setForm(null); showToast('Ayarlar kaydedildi','success') },
    onError: e => showToast(e.response?.data?.error ?? 'Hata','error'),
  })
  const testSend = useMutation({
    mutationFn: () => api.post('/settings/email/test'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['email-log'] }); showToast('Test e-postası gönderildi','success') },
    onError: e => showToast(e.response?.data?.error ?? 'Gönderim hatası','error'),
  })

  function showToast(msg, type) { setToast({ msg, type }); setTimeout(() => setToast(null), 3500) }

  function patch(obj) { setForm(f => ({ ...(f ?? data), ...obj })) }
  function patchSmtp(obj) { setForm(f => ({ ...(f ?? data), smtp: { ...(f ?? data)?.smtp, ...obj } })) }

  function toggleDay(idx) {
    const days = current?.days ?? [1,2,3,4,5]
    patch({ days: days.includes(idx) ? days.filter(d => d !== idx) : [...days, idx].sort((a,b) => a-b) })
  }
  function toggleSection(key) {
    const sections = current?.sections ?? SECTIONS.map(s => s.key)
    patch({ sections: sections.includes(key) ? sections.filter(s => s !== key) : [...sections, key] })
  }

  async function handlePreview() {
    setPreviewLoading(true)
    try {
      const res = await api.get('/settings/email/preview', { responseType:'text' })
      setPreviewHtml(res.data)
    } catch(e) { showToast('Önizleme yüklenemedi','error') }
    finally { setPreviewLoading(false) }
  }

  function handleSave(e) {
    e.preventDefault()
    const days = current.days ?? [1,2,3,4,5]
    if (days.length === 0) return showToast('En az 1 gün seçilmeli','error')
    save.mutate({
      enabled: current.enabled,
      hour:    parseInt(current.hour, 10),
      minute:  parseInt(current.minute, 10),
      cc:      current.cc ?? '',
      days,
      sections: current.sections ?? SECTIONS.map(s => s.key),
      smtp: current.smtp ?? {},
    })
  }

  if (isLoading || !current) return <div style={{ padding:'32px' }}>Yükleniyor...</div>

  return (
    <div style={{ padding:'24px', maxWidth:'600px' }}>
      <h2 style={{ fontSize:'24px', letterSpacing:'4px', marginBottom:'4px' }}>AYARLAR</h2>
      <p style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--text3)', marginBottom:'24px', letterSpacing:'2px' }}>
        E-POSTA RAPORU KONFIGURASYONU
      </p>

      {toast && (
        <div style={{ padding:'10px 16px', marginBottom:'16px', borderRadius:'6px',
          background: toast.type==='success' ? '#dcfce7' : '#fee2e2',
          color: toast.type==='success' ? '#166534' : '#991b1b',
          border: `1px solid ${toast.type==='success' ? '#86efac' : '#fca5a5'}` }}>
          {toast.msg}
        </div>
      )}

      <form onSubmit={handleSave}>
        {/* Bölüm 1: Zamanlama */}
        <Panel title="ZAMANLAMA">
          <div style={{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'16px' }}>
            <label style={{ fontSize:'13px', fontWeight:600 }}>E-posta Raporu</label>
            <button type="button" onClick={() => patch({ enabled: !current.enabled })}
              style={{ width:'44px', height:'24px', borderRadius:'12px', border:'none', cursor:'pointer',
                background: current.enabled ? 'var(--accent)' : '#cbd5e1', position:'relative', transition:'background 0.2s' }}>
              <span style={{ position:'absolute', top:'3px', left: current.enabled ? '22px' : '3px',
                width:'18px', height:'18px', borderRadius:'50%', background:'#fff', transition:'left 0.2s', display:'block' }} />
            </button>
            <span style={{ fontSize:'12px', color:'#64748b' }}>{current.enabled ? 'Aktif' : 'Kapalı'}</span>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'16px' }}>
            <div>
              <label className="form-label">GÖNDERİM SAATİ (0-23)</label>
              <input type="number" min="0" max="23" className="form-input"
                value={current.hour} onChange={e => patch({ hour: e.target.value })} />
            </div>
            <div>
              <label className="form-label">DAKİKA</label>
              <select className="form-select" value={current.minute}
                onChange={e => patch({ minute: parseInt(e.target.value, 10) })}>
                {MINUTES.map(m => <option key={m} value={m}>{String(m).padStart(2,'0')}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="form-label">CC ADRESİ (OPSİYONEL)</label>
            <input type="email" className="form-input" placeholder="cc@ornek.com"
              value={current.cc ?? ''} onChange={e => patch({ cc: e.target.value })} />
          </div>
        </Panel>

        {/* Bölüm 2: Gün Seçimi */}
        <Panel title="GÜN SEÇİMİ">
          <p style={{ fontSize:'12px', color:'#64748b', marginBottom:'12px' }}>Hangi günler rapor gönderilsin?</p>
          <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
            {DAYS.map((d, i) => {
              const selected = (current.days ?? [1,2,3,4,5]).includes(i)
              return (
                <button key={i} type="button" onClick={() => toggleDay(i)}
                  style={{ padding:'6px 12px', borderRadius:'8px', border:'none', cursor:'pointer', fontSize:'13px', fontWeight:600,
                    background: selected ? 'var(--accent)' : '#e2e8f0', color: selected ? '#fff' : '#64748b', transition:'all 0.15s' }}>
                  {d}
                </button>
              )
            })}
          </div>
        </Panel>

        {/* Bölüm 3: Rapor Bölümleri */}
        <Panel title="RAPOR BÖLÜMLERİ">
          <p style={{ fontSize:'12px', color:'#64748b', marginBottom:'12px' }}>E-postaya hangi bölümler dahil edilsin?</p>
          <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
            {SECTIONS.map(({ key, label }) => {
              const selected = (current.sections ?? SECTIONS.map(s => s.key)).includes(key)
              return (
                <button key={key} type="button" onClick={() => toggleSection(key)}
                  style={{ padding:'6px 14px', borderRadius:'8px', border:'none', cursor:'pointer', fontSize:'13px', fontWeight:600,
                    background: selected ? '#dcfce7' : '#e2e8f0', color: selected ? '#166534' : '#64748b', transition:'all 0.15s' }}>
                  {selected ? '✓ ' : ''}{label}
                </button>
              )
            })}
          </div>
        </Panel>

        {/* Bölüm 4: SMTP */}
        <Panel title="SMTP AYARLARI">
          <p style={{ fontSize:'12px', color:'#64748b', marginBottom:'12px' }}>Boş bırakılırsa .env ayarları kullanılır.</p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'12px' }}>
            <div>
              <label className="form-label">HOST</label>
              <input className="form-input" placeholder="smtp.gmail.com"
                value={current.smtp?.host ?? ''} onChange={e => patchSmtp({ host: e.target.value })} />
            </div>
            <div>
              <label className="form-label">PORT</label>
              <input type="number" className="form-input" placeholder="587"
                value={current.smtp?.port ?? ''} onChange={e => patchSmtp({ port: e.target.value })} />
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'12px' }}>
            <div>
              <label className="form-label">KULLANICI</label>
              <input className="form-input" placeholder="user@ornek.com"
                value={current.smtp?.user ?? ''} onChange={e => patchSmtp({ user: e.target.value })} />
            </div>
            <div>
              <label className="form-label">ŞİFRE</label>
              <div style={{ position:'relative' }}>
                <input type={showSmtpPass ? 'text' : 'password'} className="form-input"
                  placeholder="●●●●" style={{ paddingRight:'36px' }}
                  value={current.smtp?.pass ?? ''} onChange={e => patchSmtp({ pass: e.target.value })} />
                <button type="button" onClick={() => setShowSmtpPass(v => !v)}
                  style={{ position:'absolute', right:'8px', top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#94a3b8', fontSize:'14px' }}>
                  {showSmtpPass ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
          </div>
          <div>
            <label className="form-label">FROM ADRESİ</label>
            <input className="form-input" placeholder="YYS <noreply@yys.local>"
              value={current.smtp?.from ?? ''} onChange={e => patchSmtp({ from: e.target.value })} />
          </div>
        </Panel>

        {/* Kaydet + Test butonları */}
        <div style={{ display:'flex', gap:'8px', marginBottom:'24px' }}>
          <button type="submit" className="btn btn-primary" disabled={save.isPending}>
            {save.isPending ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
          <button type="button" className="btn btn-secondary" disabled={testSend.isPending} onClick={() => testSend.mutate()}>
            {testSend.isPending ? 'Gönderiliyor...' : 'Test Gönder'}
          </button>
        </div>
      </form>

      {/* Bölüm 5: Önizleme */}
      <Panel title="E-POSTA ÖNİZLEME">
        <button type="button" className="btn btn-secondary" onClick={handlePreview} disabled={previewLoading}>
          {previewLoading ? 'Yükleniyor...' : '👁️ Önizle'}
        </button>
        {previewHtml && (
          <div style={{ marginTop:'16px', border:'1px solid #e2e8f0', borderRadius:'8px', overflow:'hidden' }}>
            <iframe srcDoc={previewHtml} style={{ width:'100%', height:'500px', border:'none' }} title="E-posta önizleme" />
          </div>
        )}
      </Panel>

      {/* Bölüm 6: Gönderim Geçmişi */}
      <Panel title="GÖNDERİM GEÇMİŞİ">
        {emailLog.length === 0 ? (
          <p style={{ fontSize:'13px', color:'#94a3b8' }}>Henüz gönderim yok</p>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid #e2e8f0' }}>
                <th style={{ padding:'6px 8px', textAlign:'left', color:'#64748b' }}>Tarih</th>
                <th style={{ padding:'6px 8px', textAlign:'left', color:'#64748b' }}>Alıcı</th>
                <th style={{ padding:'6px 8px', textAlign:'left', color:'#64748b' }}>Durum</th>
              </tr>
            </thead>
            <tbody>
              {emailLog.map(row => (
                <tr key={row.id} style={{ borderBottom:'1px solid #f1f5f9' }}>
                  <td style={{ padding:'6px 8px', color:'#475569' }}>{new Date(row.sent_at).toLocaleString('tr-TR')}</td>
                  <td style={{ padding:'6px 8px', color:'#475569', maxWidth:'180px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{row.recipients}</td>
                  <td style={{ padding:'6px 8px' }}>
                    {row.status === 'success'
                      ? <span style={{ color:'#16a34a', fontWeight:600 }}>✓ Başarılı</span>
                      : <span style={{ color:'#dc2626', fontWeight:600 }} title={row.error_msg}>✗ Hata</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  )
}
```

- [ ] **Step 2: Dev server'da ayarlar sayfasını aç ve test et**

http://localhost:5174 → Admin → Ayarlar  
Kontrol listesi:
- 6 bölümün görünmesi
- Gün toggle butonlarının çalışması
- Bölüm toggle'larının çalışması
- SMTP şifre maskesi ve göster/gizle butonu
- Önizle butonu iframe'i yüklemesi
- Gönderim geçmişi tablosu (henüz boşsa "Henüz gönderim yok")
- Kaydet butonunun çalışması

- [ ] **Step 3: Tüm backend testleri çalıştır**

```bash
cd backend && npx vitest run
```

Beklenen: tüm testler PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/modules/admin/SettingsPage.jsx
git commit -m "feat: faz6 ayarlar frontend — gün/bölüm seçimi, SMTP UI, önizleme, gönderim geçmişi"
```

---

## Task 7: Frontend — Admin Duyuru Yönetimi

**Files:**
- Create: `frontend/src/modules/admin/AnnouncementsPage.jsx`
- Modify: `frontend/src/App.jsx` (veya router dosyası)

- [ ] **Step 1: Router dosyasını bul**

```bash
grep -rn "SettingsPage\|Route\|router" frontend/src/App.jsx frontend/src/main.jsx 2>/dev/null | head -20
```

- [ ] **Step 2: `AnnouncementsPage.jsx` oluştur**

```jsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'

export default function AnnouncementsPage() {
  const qc = useQueryClient()
  const [toast, setToast] = useState(null)
  const [form, setForm] = useState({ title:'', body:'', expires_at:'' })

  const { data: list = [], isLoading } = useQuery({
    queryKey: ['admin-announcements'],
    queryFn: () => api.get('/announcements').then(r => r.data),
  })

  const create = useMutation({
    mutationFn: body => api.post('/announcements', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-announcements'] })
      setForm({ title:'', body:'', expires_at:'' })
      showToast('Duyuru oluşturuldu','success')
    },
    onError: e => showToast(e.response?.data?.error ?? 'Hata','error'),
  })
  const remove = useMutation({
    mutationFn: id => api.delete(`/announcements/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-announcements'] }); showToast('Duyuru silindi','success') },
    onError: e => showToast(e.response?.data?.error ?? 'Hata','error'),
  })

  function showToast(msg, type) { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim() || !form.body.trim()) return showToast('Başlık ve içerik gerekli','error')
    create.mutate({ title: form.title.trim(), body: form.body.trim(), expires_at: form.expires_at || null })
  }

  if (isLoading) return <div style={{ padding:'32px' }}>Yükleniyor...</div>

  return (
    <div style={{ padding:'24px', maxWidth:'700px' }}>
      <h2 style={{ fontSize:'24px', letterSpacing:'4px', marginBottom:'4px' }}>DUYURULAR</h2>
      <p style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--text3)', marginBottom:'24px', letterSpacing:'2px' }}>
        KİOSK DUYURU YÖNETİMİ
      </p>

      {toast && (
        <div style={{ padding:'10px 16px', marginBottom:'16px', borderRadius:'6px',
          background: toast.type==='success' ? '#dcfce7' : '#fee2e2',
          color: toast.type==='success' ? '#166534' : '#991b1b',
          border: `1px solid ${toast.type==='success' ? '#86efac' : '#fca5a5'}` }}>
          {toast.msg}
        </div>
      )}

      {/* Yeni Duyuru Formu */}
      <div className="panel" style={{ marginBottom:'24px' }}>
        <div style={{ height:'2px', background:'var(--accent)' }} />
        <div className="panel-header"><div className="panel-title">YENİ DUYURU</div></div>
        <div className="panel-body">
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom:'12px' }}>
              <label className="form-label">BAŞLIK</label>
              <input className="form-input" placeholder="Duyuru başlığı" maxLength={100}
                value={form.title} onChange={e => setForm(f => ({...f, title:e.target.value}))} />
            </div>
            <div style={{ marginBottom:'12px' }}>
              <label className="form-label">İÇERİK</label>
              <textarea className="form-input" rows={4} placeholder="Duyuru metni..."
                value={form.body} onChange={e => setForm(f => ({...f, body:e.target.value}))}
                style={{ resize:'vertical' }} />
            </div>
            <div style={{ marginBottom:'16px' }}>
              <label className="form-label">BİTİŞ TARİHİ (OPSİYONEL)</label>
              <input type="datetime-local" className="form-input"
                value={form.expires_at} onChange={e => setForm(f => ({...f, expires_at:e.target.value}))} />
              <p style={{ fontSize:'11px', color:'#94a3b8', marginTop:'4px' }}>Boş bırakılırsa duyuru süresiz görünür</p>
            </div>
            <button type="submit" className="btn btn-primary" disabled={create.isPending}>
              {create.isPending ? 'Oluşturuluyor...' : 'Duyuru Oluştur'}
            </button>
          </form>
        </div>
      </div>

      {/* Duyuru Listesi */}
      <div className="panel">
        <div style={{ height:'2px', background:'var(--accent)' }} />
        <div className="panel-header"><div className="panel-title">MEVCUT DUYURULAR ({list.length})</div></div>
        <div className="panel-body">
          {list.length === 0 ? (
            <p style={{ color:'#94a3b8', fontSize:'13px' }}>Henüz duyuru yok</p>
          ) : list.map(a => {
            const expired = a.expires_at && new Date(a.expires_at) < new Date()
            return (
              <div key={a.id} style={{ borderBottom:'1px solid #f1f5f9', paddingBottom:'16px', marginBottom:'16px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:600, color: expired ? '#94a3b8' : '#1e293b', marginBottom:'4px' }}>
                      {a.title}
                      {expired && <span style={{ marginLeft:'8px', fontSize:'11px', color:'#94a3b8', fontWeight:'normal' }}>(süresi doldu)</span>}
                    </div>
                    <div style={{ fontSize:'13px', color:'#64748b', marginBottom:'6px', whiteSpace:'pre-line' }}>{a.body}</div>
                    <div style={{ fontSize:'11px', color:'#94a3b8' }}>
                      {new Date(a.created_at).toLocaleString('tr-TR')}
                      {a.expires_at && ` · ${new Date(a.expires_at).toLocaleDateString('tr-TR')} tarihinde sona erer`}
                    </div>
                  </div>
                  <button onClick={() => remove.mutate(a.id)} disabled={remove.isPending}
                    style={{ marginLeft:'16px', background:'#fee2e2', color:'#dc2626', border:'none', borderRadius:'6px',
                      padding:'6px 12px', cursor:'pointer', fontSize:'12px', fontWeight:600 }}>
                    Sil
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Router'a AnnouncementsPage'i ekle**

Router dosyasını okuduğuna göre SettingsPage'in nasıl eklendiğini bul ve aynı pattern ile AnnouncementsPage'i ekle. Genellikle şöyle:

```jsx
import AnnouncementsPage from './modules/admin/AnnouncementsPage.jsx'
// ... route tanımında:
// { path: '/announcements', element: <AnnouncementsPage /> }
// veya sidebar nav'a da ekle
```

- [ ] **Step 4: Sayfayı tarayıcıda aç ve test et**

- Yeni duyuru oluştur → kiosk'ta görünüyor mu?
- Bitiş tarihi olmayan duyuru süresiz görünüyor mu?
- Duyuru sil → listeden kalkıyor mu?
- Kiosk self-servis'te Duyurular sekmesinde rozet çalışıyor mu?

- [ ] **Step 5: Tüm testleri çalıştır**

```bash
cd backend && npx vitest run
```

Beklenen: tüm testler PASS

- [ ] **Step 6: Son commit**

```bash
git add frontend/src/modules/admin/AnnouncementsPage.jsx frontend/src/App.jsx
git commit -m "feat: faz7 admin duyuru yönetimi — oluştur, listele, sil"
```
