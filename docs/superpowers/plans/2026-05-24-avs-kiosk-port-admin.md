# AVS Kiosk Kardeşten Taşıma + Feedback Yönetimi (P3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AVS çalışanına QR kart, bildirdiği arızaların durumu, geri bildirim gönderimi; yöneticiye gelen geri bildirimleri görme/çözme.

**Architecture:** Backend: `avs-self-service/routes.js`'e 3 kiosk endpoint; yeni `feedback` modülü (admin GET+PATCH, `requireRole`); 1 idempotent kolon migration (`feedback.resolved_at`). Frontend: kiosk QR sekmesi + Hızlı Arıza/Profil alt-bölümleri; admin `FeedbackPage` (Ayarlar sekmesi).

**Tech Stack:** Express + better-sqlite3 + vitest/supertest; React + react-query + Tailwind; `qrcode` lib (mevcut dep) QR render.

**Spec:** `docs/superpowers/specs/2026-05-24-avs-kiosk-port-admin-design.md`

---

## File Structure

**Backend:**
- Modify: `backend/src/modules/avs-self-service/routes.js` — `GET /my-qr`, `GET /my-maintenance`, `POST /feedback`
- Modify: `backend/src/modules/avs-self-service/avs-self-service.test.js` — testler
- Modify: `backend/src/shared/db/index.js` — `feedback.resolved_at` ALTER
- Create: `backend/src/modules/feedback/routes.js` — admin GET `/` + PATCH `/:id/resolve`
- Create: `backend/src/modules/feedback/feedback.test.js`
- Modify: `backend/src/app.js` — feedbackRouter import + mount

**Frontend:**
- Modify: `frontend/src/shared/i18n/dict.js` — yeni etiketler (tr/en/ar)
- Modify: `frontend/src/modules/avs-self-service/AvsSelfServicePage.jsx` — QR sekmesi, my-maintenance, feedback formu
- Create: `frontend/src/modules/admin/FeedbackPage.jsx`
- Modify: `frontend/src/App.jsx` — FeedbackPage lazy import + `/settings/feedback` route
- Modify: `frontend/src/modules/admin/SettingsLayout.jsx` — YÖNETİM grubuna sekme

---

## Task 1: Migration — `feedback.resolved_at`

**Files:**
- Modify: `backend/src/shared/db/index.js` (feedback `CREATE TABLE` bloğundan sonra)

- [ ] **Step 1: Idempotent ALTER ekle**

`db/index.js`'te feedback tablosunu oluşturan `try { db.exec(`CREATE TABLE IF NOT EXISTS feedback (...)`) } catch...` bloğunun HEMEN ARDINA ekle:

```js
  try { db.exec('ALTER TABLE feedback ADD COLUMN resolved_at TEXT') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) logger.error('[Migration] feedback.resolved_at:', e.message) }
```

- [ ] **Step 2: Kolon eklendi doğrula**

Run: `cd backend && node -e "process.env.DB_PATH=':memory:'; const {initDB,getDB}=await import('./src/shared/db/index.js'); initDB(); console.log(getDB().prepare('PRAGMA table_info(feedback)').all().map(c=>c.name).join(','))" --input-type=module`
Expected: çıktıda `resolved_at` görünür.

- [ ] **Step 3: Commit**

```bash
git add backend/src/shared/db/index.js
git commit -m "feat(feedback): resolved_at kolonu (idempotent migration)"
```

---

## Task 2: Kiosk — `GET /my-qr`

**Files:**
- Modify: `backend/src/modules/avs-self-service/routes.js`
- Test: `backend/src/modules/avs-self-service/avs-self-service.test.js`

- [ ] **Step 1: Failing test ekle**

```js
describe('AVS Self-Service — my-qr', () => {
  it('staff qr_token döner', async () => {
    const db = getDB()
    db.prepare("UPDATE staff SET qr_token='QR-TEST-TOKEN' WHERE id=?").run(workerId)
    const res = await request(app).get('/api/avs-self-service/my-qr')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(res.body.qr_token).toBe('QR-TEST-TOKEN')
    expect(res.body.full_name).toBeTruthy()
  })
})
```

- [ ] **Step 2: Fail gör**

Run: `cd backend && npx vitest run src/modules/avs-self-service/avs-self-service.test.js -t "my-qr"`
Expected: FAIL (404).

- [ ] **Step 3: Endpoint ekle**

`routes.js`'te `/my-info`'dan sonra:

```js
// QR kart — staff.qr_token (yoklama/giriş okutması)
avsSelfServiceRouter.get('/my-qr', requireAvsKiosk, (req, res) => {
  try {
    const db = getDB()
    const s = db.prepare('SELECT qr_token, full_name FROM staff WHERE id=?').get(req.user.workerId)
    res.json({ qr_token: s?.qr_token || null, full_name: s?.full_name || null })
  } catch (e) { logger.error('[avs my-qr]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})
```

- [ ] **Step 4: Geç**

Run: `cd backend && npx vitest run src/modules/avs-self-service/avs-self-service.test.js -t "my-qr"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/avs-self-service/
git commit -m "feat(avs-kiosk): GET my-qr — staff QR token"
```

---

## Task 3: Kiosk — `GET /my-maintenance` (audit_log join)

**Files:**
- Modify: `backend/src/modules/avs-self-service/routes.js`
- Test: `backend/src/modules/avs-self-service/avs-self-service.test.js`

- [ ] **Step 1: Failing test ekle**

(Worker'ın bir arıza bildirdiğini önce oluştur — P2 endpoint'i ile.)

```js
describe('AVS Self-Service — my-maintenance', () => {
  it('kendi bildirdiği arızalar listelenir', async () => {
    // Önce bir arıza bildir (audit_log workerId yazılır)
    await request(app).post('/api/avs-self-service/maintenance')
      .set('Authorization', `Bearer ${avsToken}`)
      .field('location', 'M1 Test Konum')
      .field('description', 'my-maintenance testi için arıza kaydı')
    const res = await request(app).get('/api/avs-self-service/my-maintenance')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.some(m => m.location === 'M1 Test Konum')).toBe(true)
  })
})
```

- [ ] **Step 2: Fail gör**

Run: `cd backend && npx vitest run src/modules/avs-self-service/avs-self-service.test.js -t "my-maintenance"`
Expected: FAIL (404).

- [ ] **Step 3: Endpoint ekle**

`routes.js`'te `/my-tasks` veya `/maintenance` yakınına:

```js
// Bildirdiğim arızalar — audit_log üzerinden (AVS reporter null, workerId audit'te)
avsSelfServiceRouter.get('/my-maintenance', requireAvsKiosk, (req, res) => {
  try {
    const db = getDB()
    const rows = db.prepare(`
      SELECT m.id, m.location, m.description, m.status, m.priority, m.opened_at, m.closed_at
      FROM maintenance_requests m
      JOIN audit_log a ON a.target_id = m.id
        AND a.action = 'kiosk_avs_maintenance'
        AND json_extract(a.detail, '$.workerId') = ?
      ORDER BY m.opened_at DESC LIMIT 20
    `).all(req.user.workerId)
    res.json(rows)
  } catch (e) { logger.error('[avs my-maintenance]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})
```

- [ ] **Step 4: Geç**

Run: `cd backend && npx vitest run src/modules/avs-self-service/avs-self-service.test.js -t "my-maintenance"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/avs-self-service/
git commit -m "feat(avs-kiosk): GET my-maintenance — bildirdigim arizalar (audit_log)"
```

---

## Task 4: Kiosk — `POST /feedback`

**Files:**
- Modify: `backend/src/modules/avs-self-service/routes.js`
- Test: `backend/src/modules/avs-self-service/avs-self-service.test.js`

- [ ] **Step 1: Failing test ekle**

```js
describe('AVS Self-Service — feedback', () => {
  it('geçerli geri bildirim 201 + audit_log', async () => {
    const res = await request(app).post('/api/avs-self-service/feedback')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ type: 'suggestion', message: 'Servis saatleri biraz daha erken olabilir mi acaba' })
    expect(res.status).toBe(201)
    expect(res.body.ok).toBe(true)
    const db = getDB()
    const audit = db.prepare("SELECT * FROM audit_log WHERE action='kiosk_avs_feedback' AND target_id=?").get(res.body.id)
    expect(audit).toBeTruthy()
  })
  it('kısa mesaj 400', async () => {
    const res = await request(app).post('/api/avs-self-service/feedback')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ type: 'complaint', message: 'kısa' })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Fail gör**

Run: `cd backend && npx vitest run src/modules/avs-self-service/avs-self-service.test.js -t "feedback"`
Expected: FAIL (404).

- [ ] **Step 3: Endpoint ekle**

```js
// Geri bildirim — AVS çalışanı (personnel_id null, workerId audit'te)
avsSelfServiceRouter.post('/feedback', requireAvsKiosk, (req, res) => {
  const { type, message } = req.body
  if (!['complaint', 'suggestion', 'other'].includes(type))
    return res.status(400).json({ error: 'Geçersiz tip' })
  if (!message || message.trim().length < 20)
    return res.status(400).json({ error: 'Mesaj en az 20 karakter olmalıdır' })
  try {
    const db = getDB()
    const r = db.prepare('INSERT INTO feedback(personnel_id, type, message) VALUES(NULL,?,?)').run(type, message.trim())
    db.prepare(`INSERT INTO audit_log(user_id, action, module, target_id, detail)
      VALUES(NULL, 'kiosk_avs_feedback', 'avs-self-service', ?, ?)`).run(r.lastInsertRowid, JSON.stringify({ workerId: req.user.workerId }))
    res.status(201).json({ ok: true, id: r.lastInsertRowid })
  } catch (e) { logger.error('[avs feedback]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})
```

- [ ] **Step 4: Geç + modül regresyon**

Run: `cd backend && npx vitest run src/modules/avs-self-service/avs-self-service.test.js`
Expected: PASS (tüm AVS testleri).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/avs-self-service/
git commit -m "feat(avs-kiosk): POST feedback — geri bildirim (audit_log workerId)"
```

---

## Task 5: Admin — `feedback` modülü (GET liste + PATCH resolve)

**Files:**
- Create: `backend/src/modules/feedback/routes.js`
- Create: `backend/src/modules/feedback/feedback.test.js`
- Modify: `backend/src/app.js`

- [ ] **Step 1: Failing test oluştur**

`backend/src/modules/feedback/feedback.test.js`:

```js
import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let mgrToken, laundryToken

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  mgrToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  laundryToken = (await request(app).post('/api/auth/login').send({ username: 'camasir', password: 'admin123' })).body.token
  // Bir feedback + audit (AVS) ekle
  const db = getDB()
  const r = db.prepare("INSERT INTO feedback(personnel_id, type, message) VALUES(NULL,'suggestion','Admin görünüm testi için geri bildirim mesajı')").run()
  db.prepare("INSERT INTO audit_log(user_id, action, module, target_id, detail) VALUES(NULL,'kiosk_avs_feedback','avs-self-service',?,?)").run(r.lastInsertRowid, JSON.stringify({ workerId: 1 }))
})

describe('Feedback admin', () => {
  it('campus_manager listeyi görür', async () => {
    const res = await request(app).get('/api/feedback').set('Authorization', `Bearer ${mgrToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.some(f => f.type === 'suggestion')).toBe(true)
    expect(res.body[0]).toHaveProperty('source_name')
  })
  it('yetkisiz rol (laundry) 403', async () => {
    const res = await request(app).get('/api/feedback').set('Authorization', `Bearer ${laundryToken}`)
    expect(res.status).toBe(403)
  })
  it('resolve çözüldü işaretler', async () => {
    const list = (await request(app).get('/api/feedback').set('Authorization', `Bearer ${mgrToken}`)).body
    const id = list[0].id
    const res = await request(app).patch(`/api/feedback/${id}/resolve`).set('Authorization', `Bearer ${mgrToken}`).send({ resolved: true })
    expect(res.status).toBe(200)
    const after = getDB().prepare('SELECT resolved_at FROM feedback WHERE id=?').get(id)
    expect(after.resolved_at).toBeTruthy()
  })
})
```

- [ ] **Step 2: Fail gör**

Run: `cd backend && npx vitest run src/modules/feedback/feedback.test.js`
Expected: FAIL (404 — route yok).

- [ ] **Step 3: Modülü oluştur**

`backend/src/modules/feedback/routes.js`:

```js
import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { getDB } from '../../shared/db/index.js'
import { logger } from '../../shared/logger.js'

export const feedbackRouter = Router()

// Liste — gönderen adı (personnel ya da AVS worker audit'ten)
feedbackRouter.get('/', requireRole('campus_manager', 'shift_supervisor'), (req, res) => {
  try {
    const db = getDB()
    const { type, resolved } = req.query
    let sql = `
      SELECT f.id, f.type, f.message, f.created_at, f.resolved_at,
        COALESCE(p.full_name, s.full_name, 'Anonim') AS source_name
      FROM feedback f
      LEFT JOIN personnel p ON p.id = f.personnel_id
      LEFT JOIN audit_log a ON a.action='kiosk_avs_feedback' AND a.target_id = f.id
      LEFT JOIN staff s ON s.id = json_extract(a.detail, '$.workerId')
      WHERE 1=1`
    const params = []
    if (type) { sql += ' AND f.type = ?'; params.push(type) }
    if (resolved === '1') sql += ' AND f.resolved_at IS NOT NULL'
    else if (resolved === '0') sql += ' AND f.resolved_at IS NULL'
    sql += ' ORDER BY f.created_at DESC LIMIT 200'
    res.json(db.prepare(sql).all(...params))
  } catch (e) { logger.error('[feedback list]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Çözüldü/açık işaretle
feedbackRouter.patch('/:id/resolve', requireRole('campus_manager', 'shift_supervisor'), (req, res) => {
  try {
    const db = getDB()
    const resolved = req.body?.resolved !== false
    db.prepare(`UPDATE feedback SET resolved_at = ${resolved ? "datetime('now')" : 'NULL'} WHERE id=?`).run(Number(req.params.id))
    res.json({ ok: true })
  } catch (e) { logger.error('[feedback resolve]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})
```

- [ ] **Step 4: app.js'e mount et**

`backend/src/app.js` import bloğuna (diğer router importlarının yanına):

```js
import { feedbackRouter } from './modules/feedback/routes.js'
```

Mount satırına (mevcut `app.use('/api/surveys', writeLimiter, surveysRouter)` yakınına):

```js
app.use('/api/feedback', writeLimiter, feedbackRouter)
```

- [ ] **Step 5: Geç**

Run: `cd backend && npx vitest run src/modules/feedback/feedback.test.js`
Expected: PASS (3 test).

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/feedback/ backend/src/app.js
git commit -m "feat(feedback): admin liste + resolve endpoint'leri (requireRole)"
```

---

## Task 6: Backend tam regresyon

**Files:** (yok)

- [ ] **Step 1: Tüm backend**

Run: `cd backend && npx vitest run 2>&1 | tail -5`
Expected: PASS (yeni endpoint'ler + feedback modülü, regresyon yok).

---

## Task 7: i18n — yeni etiketler (tr/en/ar)

**Files:**
- Modify: `frontend/src/shared/i18n/dict.js` — her dilin `avs_kiosk` grubu

- [ ] **Step 1: Üç dile ekle**

Her dilin `avs_kiosk` grubunda: `nav`'a `qr` ekle; yeni `qr`, `my_faults`, `feedback` alt grupları ekle.

`tr`: `nav`'a `qr: 'QR'`; ve gruba:
```js
    qr: { hint: 'Yoklama/giriş için okutun', none: 'QR tanımlı değil. Yöneticine başvur.' },
    my_faults: { title: 'Bildirdiklerim', none: 'Henüz arıza bildirmedin' },
    feedback: { title: 'Geri Bildirim', complaint: 'Şikayet', suggestion: 'Öneri', other: 'Diğer', placeholder: 'Mesajın (en az 20 karakter)', submit: 'Gönder', success: 'Geri bildirimin alındı, teşekkürler.' },
```
`en`: `nav.qr: 'QR'`; 
```js
    qr: { hint: 'Scan for attendance/entry', none: 'No QR assigned. Contact your manager.' },
    my_faults: { title: 'My Reports', none: 'No faults reported yet' },
    feedback: { title: 'Feedback', complaint: 'Complaint', suggestion: 'Suggestion', other: 'Other', placeholder: 'Your message (min 20 chars)', submit: 'Send', success: 'Your feedback was received, thank you.' },
```
`ar`: `nav.qr: 'QR'`;
```js
    qr: { hint: 'امسح للحضور/الدخول', none: 'لا QR مُعرّف. راجع مديرك.' },
    my_faults: { title: 'بلاغاتي', none: 'لا أعطال مبلّغة بعد' },
    feedback: { title: 'ملاحظات', complaint: 'شكوى', suggestion: 'اقتراح', other: 'أخرى', placeholder: 'رسالتك (20 حرفًا على الأقل)', submit: 'إرسال', success: 'تم استلام ملاحظتك، شكرًا.' },
```

- [ ] **Step 2: Build doğrula**

Run: `npm run build -w frontend 2>&1 | tail -3`
Expected: `✓ built`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/shared/i18n/dict.js
git commit -m "feat(i18n): avs_kiosk qr/my_faults/feedback etiketleri (tr/en/ar)"
```

---

## Task 8: Kiosk frontend — QR sekmesi

**Files:**
- Modify: `frontend/src/modules/avs-self-service/AvsSelfServicePage.jsx`

- [ ] **Step 1: TAB_KEYS'e QR ekle**

`TAB_KEYS` dizisine `profile`'dan SONRA ekle:

```jsx
  { key: 'qr',            icon: '🪪', i18n: 'avs_kiosk.nav.qr' },
```

- [ ] **Step 2: QR query + render state**

`myInfo` query yakınına:

```jsx
  const { data: qrData } = useQuery({
    queryKey: ['avs-qr', avsToken],
    queryFn: () => avsApi.get('/avs-self-service/my-qr').then(r => r.data),
    enabled: !!avsToken && activeTab === 'qr',
  })
  const [qrImg, setQrImg] = useState(null)
  useEffect(() => {
    if (qrData?.qr_token) {
      import('qrcode').then(m => m.default.toDataURL(qrData.qr_token, { width: 240, margin: 1 }).then(setQrImg).catch(() => setQrImg(null)))
    } else { setQrImg(null) }
  }, [qrData])
```

- [ ] **Step 3: QR paneli ekle**

Profil panelinden sonra (kapanış `</div>`'den önce, BottomNav'dan önce):

```jsx
      {activeTab === 'qr' && (
        <div className="bg-slate-900 rounded-2xl p-6 text-center">
          {!qrData ? (
            <KioskSkeleton rows={1} />
          ) : qrData.qr_token ? (
            <>
              {qrImg && <img src={qrImg} alt="QR" className="mx-auto w-56 h-56 bg-white p-3 rounded-2xl" />}
              <div className="mt-4 font-semibold text-slate-200">{qrData.full_name}</div>
              <div className="text-xs text-slate-500 mt-1">{t('avs_kiosk.qr.hint')}</div>
            </>
          ) : (
            <div className="text-slate-400 text-sm py-8">{t('avs_kiosk.qr.none')}</div>
          )}
        </div>
      )}
```

- [ ] **Step 4: Build doğrula**

Run: `npm run build -w frontend 2>&1 | tail -3`
Expected: `✓ built`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/avs-self-service/AvsSelfServicePage.jsx
git commit -m "feat(avs-kiosk): QR kart sekmesi (qrcode render)"
```

---

## Task 9: Kiosk frontend — Bildirdiğim Arızalar + Geri Bildirim

**Files:**
- Modify: `frontend/src/modules/avs-self-service/AvsSelfServicePage.jsx`

- [ ] **Step 1: my-maintenance query + feedback state/mutation**

Query'ler arasına:

```jsx
  const { data: myFaults = [] } = useQuery({
    queryKey: ['avs-my-maint', avsToken],
    queryFn: () => avsApi.get('/avs-self-service/my-maintenance').then(r => r.data),
    enabled: !!avsToken && activeTab === 'quick_fault',
  })
```

`submitFault`'un `onSuccess`'ine `myFaults` invalidate ekle — mevcut `onSuccess` gövdesinin sonuna:

```jsx
      queryClient.invalidateQueries({ queryKey: ['avs-my-maint', avsToken] })
```

Feedback state + mutation (faultPhoto yakınına / mutation'lar arasına):

```jsx
  const [fbForm, setFbForm] = useState({ type: 'suggestion', message: '' })
  const [fbSuccess, setFbSuccess] = useState(false)
  const submitFeedback = useMutation({
    mutationFn: () => avsApi.post('/avs-self-service/feedback', fbForm),
    onSuccess: () => { setFbSuccess(true); setFbForm({ type: 'suggestion', message: '' }) },
  })
```

- [ ] **Step 2: Hızlı Arıza paneline "Bildirdiklerim" listesi**

Hızlı Arıza panelinin EN DIŞ `<div>`'inin kapanışından hemen önce (form bittikten sonra) ekle:

```jsx
          {myFaults.length > 0 && (
            <div className="mt-4 border-t border-slate-800 pt-4">
              <h3 className="text-sm font-medium text-slate-400 mb-2">{t('avs_kiosk.my_faults.title')}</h3>
              <div className="space-y-2">
                {myFaults.map(m => (
                  <div key={m.id} className="bg-slate-800 rounded-xl px-3 py-2 flex justify-between items-center">
                    <span className="text-sm text-slate-200 truncate">{m.location}</span>
                    <span className={`text-xs font-medium ${m.status === 'closed' ? 'text-green-400' : m.status === 'open' ? 'text-amber-400' : 'text-blue-400'}`}>{m.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
```

> Not: Bu blok Hızlı Arıza panelinin `{faultSuccess ? (...) : (<>...</>)}` yapısının DIŞINDA, panel kökündeki kartın içinde olmalı ki başarı ekranında da liste görünsün. Panel kökü `<div className="bg-slate-900 rounded-2xl p-5 space-y-4">` — listeyi bu div'in son child'ı yap.

- [ ] **Step 3: Profil paneline Geri Bildirim bölümü**

Profil panelinin (PIN değiştir kartından sonra) son `</div>`'inden önce ekle:

```jsx
          <div className="bg-slate-900 rounded-2xl p-5 space-y-4">
            <h2 className="font-medium text-slate-300">{t('avs_kiosk.feedback.title')}</h2>
            {fbSuccess ? (
              <div className="text-center py-4">
                <div className="text-3xl mb-2">🙏</div>
                <div className="text-green-400 text-sm">{t('avs_kiosk.feedback.success')}</div>
                <button onClick={() => setFbSuccess(false)} className="mt-3 text-xs text-blue-400">{t('avs_kiosk.feedback.title')}</button>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  {[['complaint', t('avs_kiosk.feedback.complaint')], ['suggestion', t('avs_kiosk.feedback.suggestion')], ['other', t('avs_kiosk.feedback.other')]].map(([val, lbl]) => (
                    <button key={val} type="button" onClick={() => setFbForm(p => ({ ...p, type: val }))}
                      className={`flex-1 py-2 rounded-xl text-xs font-medium ${fbForm.type === val ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'}`}>{lbl}</button>
                  ))}
                </div>
                <textarea value={fbForm.message} onChange={e => setFbForm(p => ({ ...p, message: e.target.value }))}
                  rows={3} placeholder={t('avs_kiosk.feedback.placeholder')}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-blue-500" />
                <button onClick={() => submitFeedback.mutate()} disabled={submitFeedback.isPending || fbForm.message.trim().length < 20}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-xl py-3 text-sm font-medium">
                  {submitFeedback.isPending ? t('avs_kiosk.loading') : t('avs_kiosk.feedback.submit')}
                </button>
              </>
            )}
          </div>
```

- [ ] **Step 4: Build doğrula**

Run: `npm run build -w frontend 2>&1 | tail -3`
Expected: `✓ built`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/avs-self-service/AvsSelfServicePage.jsx
git commit -m "feat(avs-kiosk): Bildirdiklerim listesi + Profil geri bildirim formu"
```

---

## Task 10: Admin — FeedbackPage + route + sekme

**Files:**
- Create: `frontend/src/modules/admin/FeedbackPage.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/modules/admin/SettingsLayout.jsx`

- [ ] **Step 1: FeedbackPage oluştur**

`frontend/src/modules/admin/FeedbackPage.jsx`:

```jsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'

const TYPE_LABEL = { complaint: 'Şikayet', suggestion: 'Öneri', other: 'Diğer' }

export default function FeedbackPage() {
  const qc = useQueryClient()
  const [type, setType] = useState('')
  const [resolved, setResolved] = useState('0')

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['feedback', type, resolved],
    queryFn: () => {
      const p = new URLSearchParams()
      if (type) p.set('type', type)
      if (resolved) p.set('resolved', resolved)
      return api.get(`/feedback?${p.toString()}`).then(r => r.data)
    },
  })

  const resolveMut = useMutation({
    mutationFn: ({ id, val }) => api.patch(`/feedback/${id}/resolve`, { resolved: val }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feedback'] }),
  })

  const openCount = items.filter(f => !f.resolved_at).length

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-lg font-semibold">Geri Bildirim {resolved === '0' && openCount > 0 ? `(${openCount} açık)` : ''}</h1>
        <div className="flex gap-2 text-sm">
          <select value={type} onChange={e => setType(e.target.value)} className="border rounded-lg px-2 py-1">
            <option value="">Tüm tipler</option>
            <option value="complaint">Şikayet</option>
            <option value="suggestion">Öneri</option>
            <option value="other">Diğer</option>
          </select>
          <select value={resolved} onChange={e => setResolved(e.target.value)} className="border rounded-lg px-2 py-1">
            <option value="0">Açık</option>
            <option value="1">Çözüldü</option>
            <option value="">Tümü</option>
          </select>
        </div>
      </div>

      {isLoading ? <div className="text-slate-500 text-sm">Yükleniyor…</div>
        : items.length === 0 ? <div className="text-slate-500 text-sm">Kayıt yok</div>
        : (
          <div className="space-y-2">
            {items.map(f => (
              <div key={f.id} className="border rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-100">{TYPE_LABEL[f.type] || f.type}</span>
                    <span className="text-sm font-medium">{f.source_name}</span>
                  </div>
                  <span className="text-xs text-slate-400">{new Date(f.created_at).toLocaleString('tr-TR')}</span>
                </div>
                <div className="text-sm text-slate-700 whitespace-pre-line">{f.message}</div>
                <div className="mt-2">
                  <button onClick={() => resolveMut.mutate({ id: f.id, val: !f.resolved_at })} disabled={resolveMut.isPending}
                    className={`text-xs rounded-lg px-3 py-1 ${f.resolved_at ? 'bg-slate-100 text-slate-500' : 'bg-green-600 text-white'}`}>
                    {f.resolved_at ? '↩ Tekrar aç' : '✓ Çözüldü'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  )
}
```

- [ ] **Step 2: App.jsx route + lazy import**

Lazy import (diğer admin lazy import'larının yanına):

```jsx
const FeedbackPage = lazy(() => import('./modules/admin/FeedbackPage.jsx'))
```

`<Route path="settings" element={...SettingsLayout...}>` çocukları arasına (örn `surveys` route'unun yanına):

```jsx
              <Route path="feedback" element={<RoleRoute roles={['campus_manager','shift_supervisor']}><FeedbackPage /></RoleRoute>} />
```

- [ ] **Step 3: SettingsLayout sekmesi**

`SettingsLayout.jsx` YÖNETİM grubunun `tabs` dizisine (Memnuniyet/`surveys` yakınına) ekle:

```js
      { to: '/settings/feedback',            label: 'Geri Bildirim',      icon: '💬', roles: MGMT },
```

- [ ] **Step 4: Build doğrula**

Run: `npm run build -w frontend 2>&1 | tail -3`
Expected: `✓ built`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/admin/FeedbackPage.jsx frontend/src/App.jsx frontend/src/modules/admin/SettingsLayout.jsx
git commit -m "feat(admin): FeedbackPage — kiosk geri bildirim yonetimi (liste+filtre+resolve)"
```

---

## Task 11: Final doğrulama

**Files:** (yok)

- [ ] **Step 1: Backend tüm suite**

Run: `cd backend && npx vitest run 2>&1 | tail -5`
Expected: PASS.

- [ ] **Step 2: Frontend build + e2e regresyon**

Run: `npm run build -w frontend 2>&1 | tail -3` → `✓ built`
Run: `npm run test:e2e -w frontend -- e2e/avs-kiosk-ux.spec.js --reporter=list 2>&1 | grep -vE "^\[WebServer\]" | tail -8` → `1 passed`

- [ ] **Step 3: Manuel smoke (`npm run dev`)**

- [ ] Kiosk: QR sekmesi token'lı worker'da QR çiziyor (yoklama için)
- [ ] Hızlı Arıza: arıza gönder → "Bildirdiklerim" listesinde durumla görünüyor
- [ ] Profil: geri bildirim gönder → başarı
- [ ] Admin: `mudur` → Ayarlar → Geri Bildirim → gönderilen feedback gönderen adıyla görünüyor → "Çözüldü" toggle çalışıyor

- [ ] **Step 4: Özet**

```bash
git status && git log --oneline main..HEAD
```

---

## Self-Review Notları

- **Spec kapsamı:** QR (Task 2+8), my-maintenance (Task 3+9), feedback gönder (Task 4+9), feedback admin (Task 5+10), migration (Task 1), i18n (Task 7) → spec'in tüm uygulanabilir maddeleri + yönetim tarafı karşılandı. Düşürülenler (disiplin/çamaşır) plana alınmadı.
- **Şema:** tek idempotent kolon `feedback.resolved_at` (Task 1), geriye uyumlu.
- **Tip/şekil tutarlılığı:** my-qr `{qr_token,full_name}` (Task 2↔8); my-maintenance dizi `{id,location,status,...}` (Task 3↔9); feedback POST `{type,message}`→`{ok,id}` (Task 4↔9); admin GET `{id,type,message,created_at,resolved_at,source_name}` (Task 5↔10); PATCH `{resolved}` (Task 5↔10). Eşleşiyor.
- **Doğrulanmış:** `requireRole` (`shared/auth/middleware.js:43`), `MGMT=['campus_manager','shift_supervisor']` (SettingsLayout:4), `RoleRoute` App.jsx'te kullanımda, `qrcode` dep mevcut, `staff.qr_token` + `feedback` tabloları var, `json_extract` SQLite'ta destekli.
