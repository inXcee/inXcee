# AVS Kiosk İzin Talebi (P4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development veya superpowers:executing-plans. Checkbox (`- [ ]`) ile takip.

**Goal:** AVS çalışanı kiosktan izin bakiyesini görür, talep oluşturur, taleplerinin durumunu izler.

**Architecture:** Backend `avs-self-service/routes.js`'e 2 endpoint, `shifts/service.js` servislerini reuse (DRY). Frontend `AvsSelfServicePage.jsx`'e "İzin" sekmesi. Şema YOK, admin onayı mevcut (`shifts PATCH /leave/:id`).

**Tech Stack:** Express + better-sqlite3 + vitest/supertest; React + react-query + Tailwind.

**Spec:** `docs/superpowers/specs/2026-05-24-avs-kiosk-leave-design.md`

---

## File Structure

- Modify: `backend/src/modules/avs-self-service/routes.js` — `GET /my-leave`, `POST /my-leave` + import
- Modify: `backend/src/modules/avs-self-service/avs-self-service.test.js` — testler
- Modify: `frontend/src/shared/i18n/dict.js` — `nav.leave` + `leave` grubu (tr/en/ar)
- Modify: `frontend/src/modules/avs-self-service/AvsSelfServicePage.jsx` — İzin sekmesi

---

## Task 1: Backend — `GET /my-leave` + `POST /my-leave`

**Files:**
- Modify: `backend/src/modules/avs-self-service/routes.js`
- Test: `backend/src/modules/avs-self-service/avs-self-service.test.js`

- [ ] **Step 1: Failing testleri ekle**

Test dosyasının sonuna:

```js
describe('AVS Self-Service — my-leave', () => {
  it('GET balance + requests döner', async () => {
    const res = await request(app).get('/api/avs-self-service/my-leave')
      .set('Authorization', `Bearer ${avsToken}`)
    expect(res.status).toBe(200)
    expect(res.body.balance).toHaveProperty('annual_total')
    expect(Array.isArray(res.body.requests)).toBe(true)
  })
  it('POST geçerli talep 201 + pending + staff_id=worker + total_days', async () => {
    const res = await request(app).post('/api/avs-self-service/my-leave')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ leave_type: 'annual', start_date: '2026-07-01', end_date: '2026-07-05', reason: 'tatil' })
    expect(res.status).toBe(201)
    const row = getDB().prepare('SELECT * FROM leave_requests WHERE id=?').get(res.body.id)
    expect(row.status).toBe('pending')
    expect(row.staff_id).toBe(workerId)
    expect(row.total_days).toBe(5)
  })
  it('POST body staff_id farklı olsa da workerId yazılır (güvenlik)', async () => {
    const res = await request(app).post('/api/avs-self-service/my-leave')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ leave_type: 'sick', start_date: '2026-08-01', end_date: '2026-08-02', staff_id: 999999 })
    expect(res.status).toBe(201)
    const row = getDB().prepare('SELECT staff_id FROM leave_requests WHERE id=?').get(res.body.id)
    expect(row.staff_id).toBe(workerId)
  })
  it('bitiş<başlangıç 400', async () => {
    const res = await request(app).post('/api/avs-self-service/my-leave')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ leave_type: 'annual', start_date: '2026-07-05', end_date: '2026-07-01' })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Fail gör**

Run: `cd backend && npx vitest run src/modules/avs-self-service/avs-self-service.test.js -t "my-leave"`
Expected: FAIL (404).

- [ ] **Step 3: Import ekle**

`routes.js` import bloğuna:

```js
import { createLeaveService, leaveListService, leaveBalanceService } from '../shifts/service.js'
```

- [ ] **Step 4: Endpoint'leri ekle**

`routes.js` sonuna (feedback endpoint'inden sonra):

```js
// İzin — bakiye + kendi talepleri
avsSelfServiceRouter.get('/my-leave', requireAvsKiosk, (req, res) => {
  try {
    res.json({
      balance: leaveBalanceService(req.user.workerId),
      requests: leaveListService({ staff_id: req.user.workerId }),
    })
  } catch (e) { logger.error('[avs my-leave]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// İzin talebi oluştur — daima kendisi için (staff_id zorlanır)
avsSelfServiceRouter.post('/my-leave', requireAvsKiosk, (req, res) => {
  try {
    const id = createLeaveService({
      leave_type: req.body.leave_type,
      start_date: req.body.start_date,
      end_date: req.body.end_date,
      reason: req.body.reason || null,
      staff_id: req.user.workerId,
    })
    getDB().prepare(`INSERT INTO audit_log(user_id, action, module, target_id, detail)
      VALUES(NULL, 'kiosk_avs_leave', 'avs-self-service', ?, ?)`).run(id, JSON.stringify({ workerId: req.user.workerId }))
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})
```

- [ ] **Step 5: Geç**

Run: `cd backend && npx vitest run src/modules/avs-self-service/avs-self-service.test.js -t "my-leave"`
Expected: PASS (4 test).

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/avs-self-service/
git commit -m "feat(avs-kiosk): my-leave — izin bakiye + talep (shifts servisleri reuse)"
```

---

## Task 2: Backend tam regresyon

**Files:** (yok)

- [ ] **Step 1: Tüm backend**

Run: `cd backend && npx vitest run 2>&1 | tail -5`
Expected: PASS (izin endpoint'leri mevcut testleri bozmadı).

---

## Task 3: i18n — izin etiketleri (tr/en/ar)

**Files:**
- Modify: `frontend/src/shared/i18n/dict.js`

- [ ] **Step 1: Üç dile ekle**

Her dilin `avs_kiosk` grubunda: `nav`'a `leave` ekle; yeni `leave` grubu ekle.

`tr` — nav'a `leave: 'İzin'`; ve grup:
```js
    leave: {
      title: 'İzin', balance_remaining: 'Kalan yıllık izin', days: 'gün',
      sick_used: 'Kullanılan hastalık', emergency_used: 'Kullanılan acil',
      type: 'İzin tipi', type_annual: 'Yıllık', type_sick: 'Hastalık', type_emergency: 'Acil', type_other: 'Diğer',
      start: 'Başlangıç', end: 'Bitiş', reason: 'Sebep (opsiyonel)',
      submit: 'Talep Oluştur', success: 'İzin talebin alındı, onay bekliyor.',
      my_requests: 'Taleplerim', none: 'Henüz izin talebin yok',
      status_pending: 'Beklemede', status_approved: 'Onaylandı', status_rejected: 'Reddedildi',
    },
```
`en` — nav'a `leave: 'Leave'`; ve grup:
```js
    leave: {
      title: 'Leave', balance_remaining: 'Annual leave left', days: 'days',
      sick_used: 'Sick used', emergency_used: 'Emergency used',
      type: 'Leave type', type_annual: 'Annual', type_sick: 'Sick', type_emergency: 'Emergency', type_other: 'Other',
      start: 'Start', end: 'End', reason: 'Reason (optional)',
      submit: 'Submit Request', success: 'Your leave request was received, pending approval.',
      my_requests: 'My Requests', none: 'No leave requests yet',
      status_pending: 'Pending', status_approved: 'Approved', status_rejected: 'Rejected',
    },
```
`ar` — nav'a `leave: 'إجازة'`; ve grup:
```js
    leave: {
      title: 'إجازة', balance_remaining: 'الإجازة السنوية المتبقية', days: 'يوم',
      sick_used: 'مرضية مستخدمة', emergency_used: 'طارئة مستخدمة',
      type: 'نوع الإجازة', type_annual: 'سنوية', type_sick: 'مرضية', type_emergency: 'طارئة', type_other: 'أخرى',
      start: 'البداية', end: 'النهاية', reason: 'السبب (اختياري)',
      submit: 'إنشاء طلب', success: 'تم استلام طلب إجازتك، بانتظار الموافقة.',
      my_requests: 'طلباتي', none: 'لا طلبات إجازة بعد',
      status_pending: 'قيد الانتظار', status_approved: 'مقبول', status_rejected: 'مرفوض',
    },
```

- [ ] **Step 2: Build doğrula**

Run: `npm run build -w frontend 2>&1 | tail -3`
Expected: `✓ built`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/shared/i18n/dict.js
git commit -m "feat(i18n): avs_kiosk leave etiketleri (tr/en/ar)"
```

---

## Task 4: Frontend — İzin sekmesi

**Files:**
- Modify: `frontend/src/modules/avs-self-service/AvsSelfServicePage.jsx`

- [ ] **Step 1: TAB_KEYS'e İzin ekle**

`qr` satırından SONRA:

```jsx
  { key: 'leave',         icon: '🌴', i18n: 'avs_kiosk.nav.leave' },
```

- [ ] **Step 2: Query + state + mutation**

Diğer query'lerin yanına:

```jsx
  const { data: leaveData } = useQuery({
    queryKey: ['avs-leave', avsToken],
    queryFn: () => avsApi.get('/avs-self-service/my-leave').then(r => r.data),
    enabled: !!avsToken && activeTab === 'leave',
  })
  const [leaveForm, setLeaveForm] = useState({ leave_type: 'annual', start_date: '', end_date: '', reason: '' })
  const [leaveSuccess, setLeaveSuccess] = useState(false)
  const submitLeave = useMutation({
    mutationFn: () => avsApi.post('/avs-self-service/my-leave', leaveForm),
    onSuccess: () => { setLeaveSuccess(true); setLeaveForm({ leave_type: 'annual', start_date: '', end_date: '', reason: '' }); queryClient.invalidateQueries({ queryKey: ['avs-leave', avsToken] }) },
    onError: (err) => setLeaveError(err.response?.data?.error || t('avs_kiosk.fault.error')),
  })
  const [leaveError, setLeaveError] = useState('')
```

> Not: `setLeaveError` kullanımdan ÖNCE tanımlanmalı — `leaveError` state'ini `submitLeave`'den ÖNCE bildir. Sıralama: `leaveForm`, `leaveSuccess`, `leaveError` state'leri, sonra `submitLeave` mutation.

Düzeltilmiş sıra:

```jsx
  const { data: leaveData } = useQuery({
    queryKey: ['avs-leave', avsToken],
    queryFn: () => avsApi.get('/avs-self-service/my-leave').then(r => r.data),
    enabled: !!avsToken && activeTab === 'leave',
  })
  const [leaveForm, setLeaveForm] = useState({ leave_type: 'annual', start_date: '', end_date: '', reason: '' })
  const [leaveSuccess, setLeaveSuccess] = useState(false)
  const [leaveError, setLeaveError] = useState('')
  const submitLeave = useMutation({
    mutationFn: () => avsApi.post('/avs-self-service/my-leave', leaveForm),
    onSuccess: () => { setLeaveSuccess(true); setLeaveError(''); setLeaveForm({ leave_type: 'annual', start_date: '', end_date: '', reason: '' }); queryClient.invalidateQueries({ queryKey: ['avs-leave', avsToken] }) },
    onError: (err) => setLeaveError(err.response?.data?.error || t('avs_kiosk.fault.error')),
  })
```

- [ ] **Step 3: İzin paneli ekle**

QR panelinden sonra (BottomNav'dan önce):

```jsx
      {activeTab === 'leave' && (
        <div className="space-y-4">
          <div className="bg-slate-900 rounded-2xl p-5">
            <div className="text-xs text-slate-500">{t('avs_kiosk.leave.balance_remaining')}</div>
            <div className="text-3xl font-bold text-green-400">
              {leaveData?.balance ? (leaveData.balance.annual_total - leaveData.balance.annual_used) : '—'} <span className="text-base text-slate-400">{t('avs_kiosk.leave.days')}</span>
            </div>
            {leaveData?.balance && (
              <div className="text-xs text-slate-500 mt-2">
                {t('avs_kiosk.leave.sick_used')}: {leaveData.balance.sick_used} · {t('avs_kiosk.leave.emergency_used')}: {leaveData.balance.emergency_used}
              </div>
            )}
          </div>

          <div className="bg-slate-900 rounded-2xl p-5 space-y-4">
            {leaveSuccess ? (
              <div className="text-center py-4">
                <div className="text-3xl mb-2">🌴</div>
                <div className="text-green-400 text-sm">{t('avs_kiosk.leave.success')}</div>
                <button onClick={() => setLeaveSuccess(false)} className="mt-3 text-xs text-blue-400">{t('avs_kiosk.leave.title')}</button>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">{t('avs_kiosk.leave.type')}</label>
                  <select value={leaveForm.leave_type} onChange={e => setLeaveForm(p => ({ ...p, leave_type: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100">
                    <option value="annual">{t('avs_kiosk.leave.type_annual')}</option>
                    <option value="sick">{t('avs_kiosk.leave.type_sick')}</option>
                    <option value="emergency">{t('avs_kiosk.leave.type_emergency')}</option>
                    <option value="other">{t('avs_kiosk.leave.type_other')}</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-sm text-slate-400 mb-2">{t('avs_kiosk.leave.start')}</label>
                    <input type="date" value={leaveForm.start_date} onChange={e => setLeaveForm(p => ({ ...p, start_date: e.target.value }))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-3 text-sm text-slate-100" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm text-slate-400 mb-2">{t('avs_kiosk.leave.end')}</label>
                    <input type="date" value={leaveForm.end_date} onChange={e => setLeaveForm(p => ({ ...p, end_date: e.target.value }))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-3 text-sm text-slate-100" />
                  </div>
                </div>
                <textarea value={leaveForm.reason} onChange={e => setLeaveForm(p => ({ ...p, reason: e.target.value }))}
                  rows={2} placeholder={t('avs_kiosk.leave.reason')}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100" />
                {leaveError && <div className="text-red-400 text-sm text-center">{leaveError}</div>}
                <button onClick={() => submitLeave.mutate()} disabled={submitLeave.isPending || !leaveForm.start_date || !leaveForm.end_date}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-xl py-3 text-sm font-medium">
                  {submitLeave.isPending ? t('avs_kiosk.loading') : t('avs_kiosk.leave.submit')}
                </button>
              </>
            )}
          </div>

          <div>
            <h3 className="text-sm font-medium text-slate-400 mb-2">{t('avs_kiosk.leave.my_requests')}</h3>
            {!leaveData?.requests?.length ? (
              <div className="bg-slate-900 rounded-2xl p-4 text-slate-500 text-sm">{t('avs_kiosk.leave.none')}</div>
            ) : (
              <div className="space-y-2">
                {leaveData.requests.map(r => {
                  const color = r.status === 'approved' ? 'text-green-400' : r.status === 'rejected' ? 'text-red-400' : 'text-amber-400'
                  const statusLabel = t('avs_kiosk.leave.status_' + r.status)
                  return (
                    <div key={r.id} className="bg-slate-900 rounded-xl px-4 py-3 flex justify-between items-center">
                      <div>
                        <div className="text-sm text-slate-200">{t('avs_kiosk.leave.type_' + r.leave_type, r.leave_type)}</div>
                        <div className="text-xs text-slate-500">{r.start_date} → {r.end_date} ({r.total_days} {t('avs_kiosk.leave.days')})</div>
                      </div>
                      <span className={`text-xs font-medium ${color}`}>{statusLabel}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
```

> Not: `t('avs_kiosk.leave.type_'+r.leave_type, r.leave_type)` — annual/sick/emergency için etiket var; maternity/paternity vb. için fallback ham değer. `status_'+r.status` üç durum tanımlı (pending/approved/rejected — şema enum'ı tam bunlar).

- [ ] **Step 4: Build doğrula**

Run: `npm run build -w frontend 2>&1 | tail -3`
Expected: `✓ built`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/avs-self-service/AvsSelfServicePage.jsx
git commit -m "feat(avs-kiosk): Izin sekmesi — bakiye + talep formu + taleplerim"
```

---

## Task 5: Final doğrulama

**Files:** (yok)

- [ ] **Step 1: Backend tüm suite**

Run: `cd backend && npx vitest run 2>&1 | tail -5`
Expected: PASS.

- [ ] **Step 2: Frontend build + e2e regresyon**

Run: `npm run build -w frontend 2>&1 | tail -3` → `✓ built`
Run: `npm run test:e2e -w frontend -- e2e/avs-kiosk-ux.spec.js --reporter=list 2>&1 | grep -vE "^\[WebServer\]" | tail -8` → `1 passed`

- [ ] **Step 3: Manuel smoke (`npm run dev`)**

- [ ] İzin sekmesi: bakiye görünüyor; talep oluştur (tip+tarih) → "Taleplerim"de "Beklemede"
- [ ] Admin (`mudur`) mevcut izin yönetiminde talebi görüp onaylayabiliyor → kioskta "Onaylandı"

- [ ] **Step 4: Özet**

```bash
git status && git log --oneline main..HEAD
```

---

## Self-Review Notları

- **Spec kapsamı:** GET /my-leave (Task 1), POST /my-leave + güvenlik staff_id zorlama (Task 1), İzin sekmesi bakiye+form+liste (Task 4), i18n (Task 3), backend test (Task 1-2) → spec karşılandı. Admin onay dokunulmadı (mevcut).
- **Şema yok:** doğrulandı (`leave_requests`/`leave_balance` + `getLeaveBalance` default oluşturur).
- **DRY:** `createLeaveService`/`leaveListService`/`leaveBalanceService` reuse — iş mantığı tek yerde (shifts).
- **Tip/şekil tutarlılığı:** GET `{balance:{annual_total,annual_used,sick_used,emergency_used,year}, requests:[{id,leave_type,start_date,end_date,total_days,status,...}]}` (Task 1 ↔ 4); POST `{leave_type,start_date,end_date,reason}`→`{id}` (Task 1 ↔ 4 mutation). status enum pending/approved/rejected, leave_type annual/sick/emergency/... — i18n `status_*`/`type_*` + fallback (Task 3 ↔ 4).
- **Güvenlik:** POST'ta `staff_id` daima `req.user.workerId` (body yok sayılır) — test ile doğrulanıyor (Task 1 Step 1 üçüncü test).
