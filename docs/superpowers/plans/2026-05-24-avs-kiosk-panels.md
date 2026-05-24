# AVS Kiosk Panel Boşlukları (P2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AVS kiosk panellerinin fonksiyonel boşluklarını kapat: Servisim'e servis saati+sürücü+harita, Görevlerim'e "tamamla" aksiyonu, Hızlı Arıza'ya fotoğraf.

**Architecture:** Şema değişikliği YOK. Backend: `avs-self-service/routes.js`'te 1 endpoint zenginleştir (my-transport), 1 yeni endpoint (tasks/:id/complete), 1 endpoint'e multer ekle (maintenance). Frontend: `AvsSelfServicePage.jsx`'te 3 panel güncellemesi. Backend testleri zorunlu (vitest).

**Tech Stack:** Express + better-sqlite3 + vitest/supertest (backend), React + react-query + Tailwind (frontend). Foto: mevcut `shared/uploads/middleware.js` (`upload`, `verifyMagicBytes`).

**Spec:** `docs/superpowers/specs/2026-05-24-avs-kiosk-panels-design.md`

---

## File Structure

**Değişen dosyalar:**
- `backend/src/modules/avs-self-service/routes.js` — my-transport zenginleştir, POST /tasks/:id/complete ekle, POST /maintenance'a multer
- `backend/src/modules/avs-self-service/avs-self-service.test.js` — transport schedule, task-complete (200/403), maintenance regresyon testleri
- `frontend/src/modules/avs-self-service/AvsSelfServicePage.jsx` — Servisim/Görevlerim/Hızlı Arıza panelleri + useQueryClient + faultPhoto state
- `frontend/src/shared/i18n/dict.js` — `avs_kiosk` grubuna transport/tasks/fault yeni etiketleri (tr/en/ar)

---

## Task 1: Backend — `my-transport` zenginleştir (saat + sürücü + plaka)

**Files:**
- Modify: `backend/src/modules/avs-self-service/routes.js` (my-transport endpoint)
- Test: `backend/src/modules/avs-self-service/avs-self-service.test.js`

- [ ] **Step 1: Failing test ekle**

Test dosyasının sonuna ekle. (Global `beforeAll` zaten worker'a `pickup_point_id` atıyor — onu route'a bağlıyoruz.)

```js
describe('AVS Self-Service — my-transport schedule', () => {
  it('bugünkü route_assignment ile servis saati + sürücü döner', async () => {
    const db = getDB()
    const { pickup_point_id } = db.prepare('SELECT pickup_point_id FROM staff WHERE id=?').get(workerId)
    const route = db.prepare(`INSERT INTO routes(name, vehicle_plate, driver_name, driver_phone)
      VALUES('Sabah-1','34 ABC 34','Veli Şoför','5551112233')`).run()
    const stop = db.prepare(`INSERT INTO route_stops(route_id, pickup_point_id, scheduled_time)
      VALUES(?,?,'07:30')`).run(route.lastInsertRowid, pickup_point_id)
    db.prepare(`INSERT INTO route_assignments(route_id, stop_id, staff_id, work_date)
      VALUES(?,?,?,date('now'))`).run(route.lastInsertRowid, stop.lastInsertRowid, workerId)

    const res = await request(app).get('/api/avs-self-service/my-transport')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(res.body.schedule).not.toBeNull()
    expect(res.body.schedule.time).toBe('07:30')
    expect(res.body.schedule.driver_name).toBe('Veli Şoför')
    expect(res.body.schedule.plate).toBe('34 ABC 34')
    expect(res.body.pickup).not.toBeNull() // geriye uyumlu
  })
})
```

- [ ] **Step 2: Testi çalıştır, fail gör**

Run: `cd backend && npx vitest run src/modules/avs-self-service/avs-self-service.test.js -t "schedule"`
Expected: FAIL — `res.body.schedule` undefined.

- [ ] **Step 3: my-transport'u zenginleştir**

`routes.js`'te mevcut `/my-transport` endpoint gövdesini şununla değiştir:

```js
avsSelfServiceRouter.get('/my-transport', requireAvsKiosk, (req, res) => {
  try {
    const db = getDB()
    const staff = db.prepare('SELECT pickup_point_id FROM staff WHERE id=?').get(req.user.workerId)
    const pickup = staff?.pickup_point_id ? db.prepare(`
      SELECT name, district, neighborhood, notes, lat, lng
      FROM pickup_points WHERE id = ?
    `).get(staff.pickup_point_id) : null

    // Servis programı: önce bugünün ataması, yoksa durağın aktif route_stop'u
    let schedule = db.prepare(`
      SELECT rs.scheduled_time AS time, r.name AS route_name,
             r.driver_name, r.driver_phone, r.vehicle_plate AS plate
      FROM route_assignments ra
      JOIN routes r ON r.id = ra.route_id
      LEFT JOIN route_stops rs ON rs.id = ra.stop_id
      WHERE ra.staff_id = ? AND ra.work_date = date('now')
      LIMIT 1
    `).get(req.user.workerId)

    if (!schedule && staff?.pickup_point_id) {
      schedule = db.prepare(`
        SELECT rs.scheduled_time AS time, r.name AS route_name,
               r.driver_name, r.driver_phone, r.vehicle_plate AS plate
        FROM route_stops rs
        JOIN routes r ON r.id = rs.route_id AND r.is_active = 1
        WHERE rs.pickup_point_id = ?
        ORDER BY rs.id LIMIT 1
      `).get(staff.pickup_point_id)
    }

    res.json({ pickup, schedule: schedule || null })
  } catch (e) { logger.error('[avs my-transport]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})
```

- [ ] **Step 4: Testi çalıştır, geç**

Run: `cd backend && npx vitest run src/modules/avs-self-service/avs-self-service.test.js -t "schedule"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/avs-self-service/
git commit -m "feat(avs-kiosk): my-transport servis saati + surucu + plaka (route_assignments)"
```

---

## Task 2: Backend — `POST /tasks/:id/complete` (blok-scope, idempotent)

**Files:**
- Modify: `backend/src/modules/avs-self-service/routes.js`
- Test: `backend/src/modules/avs-self-service/avs-self-service.test.js`

- [ ] **Step 1: Failing test ekle**

```js
describe('AVS Self-Service — task complete', () => {
  it('kendi bloğundaki görevi tamamlar (200 + completed_at)', async () => {
    const db = getDB()
    // Global beforeAll M1'e cleaning_task ekledi; worker assigned_block='M1'
    const task = db.prepare("SELECT id FROM cleaning_tasks WHERE block='M1' AND completed_at IS NULL LIMIT 1").get()
    const res = await request(app).post(`/api/avs-self-service/tasks/${task.id}/complete`)
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.completed_at).toBeTruthy()
  })

  it('başka bloğun görevinde 403', async () => {
    const db = getDB()
    const other = db.prepare(`INSERT INTO cleaning_tasks(area, block, floor, task_type, scheduled_at)
      VALUES('Koridor','S1',1,'common_area',datetime('now'))`).run()
    const res = await request(app).post(`/api/avs-self-service/tasks/${other.lastInsertRowid}/complete`)
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(403)
  })

  it('olmayan görevde 404', async () => {
    const res = await request(app).post('/api/avs-self-service/tasks/999999/complete')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Testi çalıştır, fail gör**

Run: `cd backend && npx vitest run src/modules/avs-self-service/avs-self-service.test.js -t "task complete"`
Expected: FAIL (404 route yok / beklenenle uyumsuz).

- [ ] **Step 3: Endpoint'i ekle**

`routes.js`'te `/my-tasks` endpoint'inden sonra ekle:

```js
// Görev tamamla — sadece kendi assigned_block'undaki cleaning_task
avsSelfServiceRouter.post('/tasks/:id/complete', requireAvsKiosk, (req, res) => {
  try {
    const db = getDB()
    const task = db.prepare('SELECT id, block, completed_at FROM cleaning_tasks WHERE id=?').get(Number(req.params.id))
    if (!task) return res.status(404).json({ error: 'Görev bulunamadı' })
    const staff = db.prepare('SELECT assigned_block FROM staff WHERE id=?').get(req.user.workerId)
    if (!staff?.assigned_block || staff.assigned_block !== task.block)
      return res.status(403).json({ error: 'Bu görev sizin bloğunuza ait değil' })
    if (task.completed_at) return res.json({ ok: true, completed_at: task.completed_at })
    db.prepare("UPDATE cleaning_tasks SET completed_at=datetime('now') WHERE id=?").run(task.id)
    const updated = db.prepare('SELECT completed_at FROM cleaning_tasks WHERE id=?').get(task.id)
    db.prepare(`INSERT INTO audit_log(user_id, action, module, target_id, detail)
      VALUES(NULL, 'kiosk_avs_task_complete', 'avs-self-service', ?, ?)`).run(task.id, JSON.stringify({ workerId: req.user.workerId }))
    res.json({ ok: true, completed_at: updated.completed_at })
  } catch (e) { logger.error('[avs task complete]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})
```

- [ ] **Step 4: Testi çalıştır, geç**

Run: `cd backend && npx vitest run src/modules/avs-self-service/avs-self-service.test.js -t "task complete"`
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/avs-self-service/
git commit -m "feat(avs-kiosk): POST tasks/:id/complete — blok-scope gorev tamamlama"
```

---

## Task 3: Backend — `POST /maintenance`'a fotoğraf

**Files:**
- Modify: `backend/src/modules/avs-self-service/routes.js`
- Test: `backend/src/modules/avs-self-service/avs-self-service.test.js`

- [ ] **Step 1: Regresyon testi ekle (foto'suz hâlâ 201)**

```js
describe('AVS Self-Service — maintenance foto', () => {
  it('foto olmadan da 201 (regresyon)', async () => {
    const res = await request(app).post('/api/avs-self-service/maintenance')
      .set('Authorization', `Bearer ${avsToken}`)
      .field('location', 'M1 Kat 1')
      .field('description', 'Foto olmadan arıza bildirimi testi')
    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('id')
  })
})
```

> Not: multer eklenince endpoint multipart bekler; `.field()` (supertest) multipart gönderir, JSON `.send()` yerine. Foto'lu test opsiyonel (`.attach('photo', buffer, 'x.png')` gerçek görsel magic-byte ister) — şimdilik foto'suz regresyon yeterli.

- [ ] **Step 2: Testi çalıştır (şu an JSON kabul ediyor, multipart'ta da geçmeli ama önce mevcut hali doğrula)**

Run: `cd backend && npx vitest run src/modules/avs-self-service/avs-self-service.test.js -t "maintenance foto"`
Expected: PASS (mevcut endpoint `.field()` multipart body'sini de `req.body`'den okur — Express multipart'ı multer olmadan parse etmez, bu test multer EKLENDİKTEN sonra geçer). Eğer şu an FAIL ederse Step 3'ten sonra geçecek.

- [ ] **Step 3: Import + route'a multer ekle**

`routes.js` import bloğuna ekle (mevcut importların yanına):

```js
import { upload, verifyMagicBytes } from '../../shared/uploads/middleware.js'
```

`/maintenance` route imzasını değiştir ve `photoBefore` ekle. Mevcut:

```js
avsSelfServiceRouter.post('/maintenance', requireAvsKiosk, (req, res) => {
```

Yeni:

```js
avsSelfServiceRouter.post('/maintenance', requireAvsKiosk, upload.single('photo'), verifyMagicBytes, (req, res) => {
```

Ve `createRequest` çağrısına `photoBefore` ekle. Mevcut çağrı gövdesinde `const id = createRequest({ location: ..., description: ..., priority: ..., reporterUserId: null, reporterPersonnelId: null })` satırından ÖNCE:

```js
    const photoBefore = req.file ? '/uploads/' + req.file.filename : null
```

ve `createRequest({...})` objesine `photoBefore,` alanını ekle (diğer alanlar aynı kalır).

- [ ] **Step 4: Testi çalıştır, geç**

Run: `cd backend && npx vitest run src/modules/avs-self-service/avs-self-service.test.js -t "maintenance"`
Expected: PASS (foto regresyonu + mevcut maintenance testleri).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/avs-self-service/
git commit -m "feat(avs-kiosk): hizli arizaya foto (upload.single + verifyMagicBytes)"
```

---

## Task 4: Backend — tüm modül + regresyon

**Files:** (yok — doğrulama)

- [ ] **Step 1: AVS modül testleri**

Run: `cd backend && npx vitest run src/modules/avs-self-service/avs-self-service.test.js`
Expected: PASS — eski + yeni testler (transport/task/maintenance).

- [ ] **Step 2: Tüm backend regresyon**

Run: `cd backend && npx vitest run 2>&1 | tail -5`
Expected: PASS — yeni endpoint'ler mevcut testleri bozmadı.

---

## Task 5: i18n — yeni panel etiketleri (tr/en/ar)

**Files:**
- Modify: `frontend/src/shared/i18n/dict.js` — `avs_kiosk` grubu (tr/en/ar)

- [ ] **Step 1: Üç dile etiket ekle**

Her dilin `avs_kiosk` grubunda: `transport` objesine `time`/`driver`/`open_map` ekle (mevcut `none`/`stop` korunur), `tasks` objesine `complete`/`completing` ekle (mevcut korunur), `fault` objesine `add_photo`/`remove_photo`/`photo_added` ekle (mevcut korunur).

`tr`:
```js
    // transport grubuna: (mevcut none, stop korunur)
    transport: { none: 'Servis atanmamış. Yöneticine başvur.', stop: 'Durağım', time: 'Servis saati', driver: 'Şoför', open_map: '🗺 Haritada aç' },
    // tasks grubuna ekle:  complete, completing
    // fault grubuna ekle: add_photo, remove_photo, photo_added
```

Pratik uygulama — mevcut `transport`, `tasks`, `fault` objelerine şu anahtarları ekle (üzerine yazma, içine ekle):
- `tr`: `transport.time:'Servis saati'`, `transport.driver:'Şoför'`, `transport.open_map:'🗺 Haritada aç'`, `tasks.complete:'Tamamla'`, `tasks.completing:'Kaydediliyor…'`, `fault.add_photo:'📷 Fotoğraf ekle'`, `fault.remove_photo:'Kaldır'`, `fault.photo_added:'Fotoğraf eklendi'`
- `en`: `transport.time:'Pickup time'`, `transport.driver:'Driver'`, `transport.open_map:'🗺 Open in maps'`, `tasks.complete:'Complete'`, `tasks.completing:'Saving…'`, `fault.add_photo:'📷 Add photo'`, `fault.remove_photo:'Remove'`, `fault.photo_added:'Photo added'`
- `ar`: `transport.time:'وقت النقل'`, `transport.driver:'السائق'`, `transport.open_map:'🗺 افتح الخريطة'`, `tasks.complete:'إنهاء'`, `tasks.completing:'جارٍ الحفظ…'`, `fault.add_photo:'📷 أضف صورة'`, `fault.remove_photo:'إزالة'`, `fault.photo_added:'تمت إضافة الصورة'`

- [ ] **Step 2: Build doğrula**

Run: `npm run build -w frontend 2>&1 | tail -3`
Expected: `✓ built`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/shared/i18n/dict.js
git commit -m "feat(i18n): avs_kiosk transport/tasks/fault yeni etiketler (tr/en/ar)"
```

---

## Task 6: Frontend — Servisim paneli (saat + sürücü + harita)

**Files:**
- Modify: `frontend/src/modules/avs-self-service/AvsSelfServicePage.jsx` (Servisim paneli)

- [ ] **Step 1: Servisim panelini güncelle**

Servisim paneli (`activeTab === 'transport'`) içinde, `transportData.pickup` gösterilen kartın içine (durak adının ÜSTÜNE saat, ALTINA sürücü + harita) `schedule` bilgisini ekle. Panelin `transportData.pickup` render eden bloğunu şununla değiştir:

```jsx
            <div className="bg-slate-900 rounded-2xl p-5">
              {transportData.schedule?.time && (
                <div className="text-3xl font-bold text-blue-400 mb-1">🕐 {transportData.schedule.time}</div>
              )}
              <h2 className="font-medium text-slate-300 mb-1">📍 {t('avs_kiosk.transport.stop')}</h2>
              <div className="text-xl font-bold text-slate-100">{transportData.pickup.name}</div>
              {(transportData.pickup.district || transportData.pickup.neighborhood) && (
                <div className="text-sm text-slate-500 mt-1">
                  {transportData.pickup.district}{transportData.pickup.neighborhood ? ` · ${transportData.pickup.neighborhood}` : ''}
                </div>
              )}
              {transportData.schedule?.driver_name && (
                <div className="text-sm text-slate-400 mt-2">
                  {t('avs_kiosk.transport.driver')}: {transportData.schedule.driver_name}
                  {transportData.schedule.plate ? ` · ${transportData.schedule.plate}` : ''}
                  {transportData.schedule.driver_phone ? <a href={`tel:${transportData.schedule.driver_phone}`} className="text-blue-400 ml-2">{transportData.schedule.driver_phone}</a> : null}
                </div>
              )}
              {transportData.pickup.notes && (
                <div className="text-sm text-slate-400 mt-2 whitespace-pre-line">{transportData.pickup.notes}</div>
              )}
              {transportData.pickup.lat != null && transportData.pickup.lng != null && (
                <button onClick={() => window.open(`https://www.google.com/maps?q=${transportData.pickup.lat},${transportData.pickup.lng}`, '_blank')}
                  className="mt-4 w-full bg-slate-800 hover:bg-slate-700 text-blue-400 rounded-xl py-3 text-sm font-medium">
                  {t('avs_kiosk.transport.open_map')}
                </button>
              )}
            </div>
```

- [ ] **Step 2: Build doğrula**

Run: `npm run build -w frontend 2>&1 | tail -3`
Expected: `✓ built`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/modules/avs-self-service/AvsSelfServicePage.jsx
git commit -m "feat(avs-kiosk): Servisim — servis saati + surucu + harita linki"
```

---

## Task 7: Frontend — Görevlerim "Tamamla" + Hızlı Arıza foto

**Files:**
- Modify: `frontend/src/modules/avs-self-service/AvsSelfServicePage.jsx`

- [ ] **Step 1: useQueryClient + complete mutation + faultPhoto state**

Import satırını güncelle:

```jsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
```

Bileşen içinde, `const { t } = useTranslation()` yakınına:

```jsx
  const queryClient = useQueryClient()
```

`faultForm` state'inin yanına foto state'i:

```jsx
  const [faultPhoto, setFaultPhoto] = useState(null)
```

Görev tamamlama mutation'ı (diğer mutation'ların yanına):

```jsx
  const completeTask = useMutation({
    mutationFn: (taskId) => avsApi.post(`/avs-self-service/tasks/${taskId}/complete`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['avs-tasks', avsToken] }),
  })
```

- [ ] **Step 2: Görevlerim housekeeping kartına "Tamamla" butonu**

Housekeeping görev kartında (`tasksData.type === 'housekeeping'` map'i), mevcut `{task.completed_at && <span ...>Tamamlandı</span>}` koşulunu şununla değiştir:

```jsx
                  {task.completed_at ? (
                    <span className="text-xs text-green-400">✓ {t('avs_kiosk.tasks.done')}</span>
                  ) : (
                    <button onClick={() => completeTask.mutate(task.id)} disabled={completeTask.isPending}
                      className="text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-lg px-3 py-1.5">
                      {completeTask.isPending ? t('avs_kiosk.tasks.completing') : t('avs_kiosk.tasks.complete')}
                    </button>
                  )}
```

- [ ] **Step 3: Hızlı Arıza — foto input + FormData submit**

`submitFault` mutation'ını FormData gönderecek şekilde değiştir:

```jsx
  const submitFault = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.append('location', faultForm.location)
      fd.append('description', faultForm.description)
      fd.append('priority', faultForm.priority)
      if (faultPhoto) fd.append('photo', faultPhoto)
      return avsApi.post('/avs-self-service/maintenance', fd)
    },
    onSuccess: () => { setFaultSuccess(true); setFaultError(''); setFaultForm({ location: '', description: '', priority: 'medium' }); setFaultPhoto(null) },
    onError: (err) => setFaultError(err.response?.data?.error || t('avs_kiosk.fault.error')),
  })
```

Hızlı Arıza formunda, öncelik (`priority`) bloğundan SONRA, gönder butonundan ÖNCE foto alanını ekle:

```jsx
              <div>
                {faultPhoto ? (
                  <div className="flex items-center justify-between bg-slate-800 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-3">
                      <img src={URL.createObjectURL(faultPhoto)} alt="" className="w-12 h-12 rounded-lg object-cover" />
                      <span className="text-sm text-green-400">{t('avs_kiosk.fault.photo_added')}</span>
                    </div>
                    <button type="button" onClick={() => setFaultPhoto(null)} className="text-xs text-slate-400 hover:text-slate-200">{t('avs_kiosk.fault.remove_photo')}</button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 rounded-xl py-3 text-sm text-slate-300 cursor-pointer">
                    {t('avs_kiosk.fault.add_photo')}
                    <input type="file" accept="image/*" capture="environment" className="hidden"
                      onChange={e => setFaultPhoto(e.target.files?.[0] || null)} />
                  </label>
                )}
              </div>
```

- [ ] **Step 4: Build doğrula**

Run: `npm run build -w frontend 2>&1 | tail -3`
Expected: `✓ built`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/avs-self-service/AvsSelfServicePage.jsx
git commit -m "feat(avs-kiosk): Gorevlerim Tamamla butonu + Hizli Ariza foto (FormData)"
```

---

## Task 8: Final doğrulama

**Files:** (yok)

- [ ] **Step 1: Backend tüm suite**

Run: `cd backend && npx vitest run 2>&1 | tail -5`
Expected: PASS.

- [ ] **Step 2: Frontend build**

Run: `npm run build -w frontend 2>&1 | tail -3`
Expected: `✓ built`.

- [ ] **Step 3: Manuel smoke (`npm run dev`, `/avs-kiosk`)**

`mudur/admin123` ile worker'a PIN + (transport için) bir route/stop/assignment ata, sonra:
- [ ] Servisim'de saat + sürücü + "Haritada aç" görünüyor (atama varsa)
- [ ] Görevlerim'de housekeeping görevde "Tamamla" → tıkla → "✓ Tamamlandı"
- [ ] Hızlı Arıza'da foto ekle → önizleme → gönder → başarı; maintenance modülünde foto'lu talep

- [ ] **Step 4: Özet**

```bash
git status   # temiz
git log --oneline main..HEAD
```

Şema yok → P2 deploy diğer fazlarla veya tek başına gidebilir.

---

## Self-Review Notları

- **Spec kapsamı:** Servisim saat/sürücü/harita (Task 1+6), görev tamamlama (Task 2+7), arıza foto (Task 3+7), i18n (Task 5), backend test (Task 1-4), build (Task 5-7) → spec'in 3 maddesi + test karşılandı.
- **Şema yok:** doğrulandı — `route_assignments/route_stops.scheduled_time/routes`, `cleaning_tasks.completed_at`, foto pipeline mevcut.
- **Tip/şekil tutarlılığı:** my-transport dönüşü `{ pickup, schedule:{time,route_name,driver_name,driver_phone,plate}|null }` — backend (Task 1) ile frontend tüketimi (Task 6) eşleşiyor. `completeTask.mutate(task.id)` → endpoint `:id` (Task 2 ↔ 7). `fd.append('photo')` ↔ `upload.single('photo')` (Task 3 ↔ 7).
- **Bilinçli:** maintenance artık multipart — supertest testleri `.field()` kullanır (`.send()` değil); frontend FormData gönderir, axios Content-Type'ı set eder (avsApi elle header vermiyor).
