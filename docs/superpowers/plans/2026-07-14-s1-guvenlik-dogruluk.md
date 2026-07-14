# S1 — Güvenlik & Doğruluk Sprint (Vardiya) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vardiya (shifts) modülündeki üç güvenlik/doğruluk açığını kapat: yetki-dışı PII erişimi, kod-etkisiz puantaj raporları ve engellenmemiş geçersiz onay geçişleri.

**Architecture:** Üç bağımsız faz (F1 route yetki, F2 sorgu tutarlılığı, F3 durum-geçiş guard'ları). Her faz kendi TDD döngüsü + ayrı commit. Yeni migration/tablo/kolon YOK. Değişiklikler yalnız `routes.js` (yetki), `queries.js` (sorgu + guard) ve `service.js` (guard).

**Tech Stack:** Node.js (ESM), Express, better-sqlite3, Vitest + Supertest. Testler `:memory:` DB + `seedDev()` kullanır.

**Referans spec:** `docs/superpowers/specs/2026-07-14-s1-guvenlik-dogruluk-design.md`

**Önemli düzeltme (uygulama öncesi doğrulandı):** F2 bir PARA hatası DEĞİL. Net maaş/banka CSV/bordro PDF zaten `puantajService`→`getPuantaj` üzerinden kod-farkında (`leavePay = dailyRate * paid_leave_units`, service.js:2622 civarı). Kod etkilerini yok sayan yalnızca iki JSON rapor ucu: `/payroll-export` (`getPayrollExport`) ve `/payroll-detailed` (`getPayrollDetailed`). F2 bu iki raporu föy ile tutarlı hâle getirir (rapor-tutarlılığı düzeltmesi).

---

## Dosya Haritası

- `backend/src/modules/shifts/routes.js` — F1: 6 route'un yetki middleware'i `allStaff` → `managerOrSupervisor`.
- `backend/src/modules/shifts/queries.js` — F2: yeni `puantajUnitsSubquery()` yardımcısı; `getPuantaj`, `getPayrollExport`, `getPayrollDetailed` bunu paylaşır. F3: `approveLeaveRequest` + `reviewOvertimeRequest` guard'ları.
- `backend/src/modules/shifts/service.js` — F3: `updatePuantajPeriodApprovalService` içinde `approve` yalnız `submitted`'dan.
- `backend/src/modules/shifts/shifts-authz.test.js` — F1 testi (YENİ).
- `backend/src/modules/shifts/payroll-code-effects.test.js` — F2 testi (YENİ).
- `backend/src/modules/shifts/approval-transitions.test.js` — F3 testi (YENİ).

Test dosyalarının hepsi mevcut `attendance-reconciliation.test.js` kalıbını izler: `process.env.DB_PATH=':memory:'` → `initDB()` → `seedDev()` → `mudur`/`vardiya`/`teknik` login. Seed kullanıcıları: `mudur` (campus_manager), `vardiya` (shift_supervisor), `teknik` (technical), `camasir` (laundry), `meydanci` (housekeeper) — hepsi parola `admin123`.

---

## Task 1 (F1): Route Yetki Açıklarını Kapat

Altı endpoint `allStaff = [requireAuth]` ile korunuyor — herhangi bir geçerli token (technical/laundry/housekeeper, hatta kiosk) erişebiliyor. `GET /staff/:id/detail` maaş/TC/IBAN döndürüyor (PII); `POST /leave` ve `/swaps` gövdeden `staff_id`/`requester_id` alıyor (IDOR); `/attendance/events|checkin|checkout` serbest kart olayı enjeksiyonuna açık. Tek gerçek çağıran mobil amir (supervisor) olduğu ve mevcut testler müdür/amir token'ı kullandığı için hepsini `managerOrSupervisor`'a çekmek yeterli — yeni middleware gerekmez.

**Files:**
- Test: `backend/src/modules/shifts/shifts-authz.test.js` (Create)
- Modify: `backend/src/modules/shifts/routes.js` (satır 86, 563, 684, 748, 757, 1045)

- [ ] **Step 1: Başarısız testi yaz**

Create `backend/src/modules/shifts/shifts-authz.test.js`:

```js
import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let lowToken // technical — yönetim rolü değil
let staffId

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  lowToken = (await request(app).post('/api/auth/login').send({ username: 'teknik', password: 'admin123' })).body.token
  const db = getDB()
  staffId = db.prepare("INSERT INTO staff(full_name,is_active,salary,tc_no) VALUES('Test Personel',1,30000,'12345678901')").run().lastInsertRowid
})

describe('F1 — shifts yetki korumaları (düşük yetkili rol 403 almalı)', () => {
  const auth = req => req.set('Authorization', `Bearer ${lowToken}`)

  it('GET /staff/:id/detail düşük yetkiliye kapalı (PII)', async () => {
    const res = await auth(request(app).get(`/api/shifts/staff/${staffId}/detail`))
    expect(res.status).toBe(403)
  })

  it('POST /leave düşük yetkiliye kapalı (IDOR)', async () => {
    const res = await auth(request(app).post('/api/shifts/leave'))
      .send({ staff_id: staffId, leave_type: 'annual', start_date: '2026-07-20', end_date: '2026-07-21' })
    expect(res.status).toBe(403)
  })

  it('POST /swaps düşük yetkiliye kapalı', async () => {
    const res = await auth(request(app).post('/api/shifts/swaps')).send({})
    expect(res.status).toBe(403)
  })

  it('POST /attendance/events düşük yetkiliye kapalı', async () => {
    const res = await auth(request(app).post('/api/shifts/attendance/events'))
      .send({ staff_id: staffId, external_event_id: 'x1', event_type: 'check_in', occurred_at: new Date().toISOString() })
    expect(res.status).toBe(403)
  })

  it('POST /attendance/checkin düşük yetkiliye kapalı', async () => {
    const res = await auth(request(app).post('/api/shifts/attendance/checkin')).send({ staff_id: staffId })
    expect(res.status).toBe(403)
  })

  it('POST /attendance/checkout düşük yetkiliye kapalı', async () => {
    const res = await auth(request(app).post('/api/shifts/attendance/checkout')).send({ log_id: 1 })
    expect(res.status).toBe(403)
  })
})
```

- [ ] **Step 2: Testin başarısız olduğunu doğrula**

Run: `cd backend && npx vitest run src/modules/shifts/shifts-authz.test.js`
Expected: FAIL — uçlar şu an `allStaff` olduğu için 200/400/404 dönüyor, 403 değil.

- [ ] **Step 3: Route yetkilerini değiştir**

`backend/src/modules/shifts/routes.js` içinde şu 6 satırda `...allStaff` → `...managerOrSupervisor` yap (yalnız bu 6 uç; başka `allStaff` uçlarına DOKUNMA):

- Satır 86: `shiftsRouter.get('/staff/:id/detail', ...allStaff, ...)` → `...managerOrSupervisor`
- Satır 563: `shiftsRouter.post('/leave', ...allStaff, ...)` → `...managerOrSupervisor`
- Satır 684: `shiftsRouter.post('/attendance/events', ...allStaff, ...)` → `...managerOrSupervisor`
- Satır 748: `shiftsRouter.post('/attendance/checkin', ...allStaff, ...)` → `...managerOrSupervisor`
- Satır 757: `shiftsRouter.post('/attendance/checkout', ...allStaff, ...)` → `...managerOrSupervisor`
- Satır 1045: `shiftsRouter.post('/swaps', ...allStaff, ...)` → `...managerOrSupervisor`

Not: `...` spread korunmalı (`managerOrSupervisor` bir dizidir). Satır numaraları değişmişse `grep -n "'/staff/:id/detail'\|'/leave'\|'/swaps'\|'/attendance/events'\|'/attendance/checkin'\|'/attendance/checkout'" routes.js` ile bul.

- [ ] **Step 4: Testin geçtiğini doğrula**

Run: `cd backend && npx vitest run src/modules/shifts/shifts-authz.test.js`
Expected: PASS (6/6)

- [ ] **Step 5: Regresyon — mevcut attendance/operations testleri hâlâ geçiyor**

Run: `cd backend && npx vitest run src/modules/shifts/attendance-reconciliation.test.js src/modules/shifts/operations-dashboard.test.js`
Expected: PASS (bu testler müdür/amir token'ı kullanıyor, etkilenmez)

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/shifts/routes.js backend/src/modules/shifts/shifts-authz.test.js
git commit -m "fix: restrict shifts PII/IDOR endpoints to management roles

/staff/:id/detail (maas/TC/IBAN), /leave, /swaps, /attendance
events/checkin/checkout artik yalniz campus_manager+shift_supervisor.
Onceden allStaff idi; herhangi bir gecerli token erisebiliyordu.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2 (F2): Puantaj Raporlarını Kod-Etkileriyle Hizala

`getPayrollExport` ve `getPayrollDetailed` gün sayılarını ham `status` COUNT ile üretiyor; `sgk_days` kaba `worked+overtime + on_leave+off` sayımı (çarpansız). Föy (`getPuantaj`) ise `puantaj_code` etkilerini uyguluyor. `getPuantaj`'ın kod-farkında alt-sorgusu paylaşılan bir yardımcıya çıkarılır ve üç fonksiyon da kullanır → föy ile raporlar aynı hesaptan beslenir. `sgk_days = worked_days + off_days + sgk_day_units`.

**Files:**
- Test: `backend/src/modules/shifts/payroll-code-effects.test.js` (Create)
- Modify: `backend/src/modules/shifts/queries.js` (yeni `puantajUnitsSubquery`; `getPuantaj` ~3569-3604; `getPayrollDetailed` 711-751; `getPayrollExport` 754-783)

- [ ] **Step 1: Başarısız testi yaz**

Create `backend/src/modules/shifts/payroll-code-effects.test.js`:

```js
import { beforeAll, describe, expect, it } from 'vitest'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { getPayrollDetailed, getPuantaj } from './queries.js'

let staffId, unpaidCodeId, paidCodeId

beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const db = getDB()
  staffId = db.prepare("INSERT INTO staff(full_name,is_active,salary) VALUES('F2 Personel',1,30000)").run().lastInsertRowid
  // Ücretsiz izin kodu: is_paid=0, sgk_day_factor=0 → bordroya/SGK'ya katılmamalı
  unpaidCodeId = db.prepare(`INSERT INTO puantaj_codes(code,label,status,leave_type,is_paid,sgk_day_factor,day_multiplier,hour_multiplier,is_active)
    VALUES('ÜT','Ucretsiz Test','on_leave','unpaid',0,0,0,0,1)`).run().lastInsertRowid
  // Ücretli izin kodu: is_paid=1, sgk_day_factor=1, day_multiplier=1
  paidCodeId = db.prepare(`INSERT INTO puantaj_codes(code,label,status,leave_type,is_paid,sgk_day_factor,day_multiplier,hour_multiplier,is_active)
    VALUES('ÜP','Ucretli Test','on_leave','annual',1,1,1,1,1)`).run().lastInsertRowid

  const ins = db.prepare(`INSERT INTO shift_schedule(staff_id,work_date,status,leave_type,puantaj_code_id) VALUES(?,?,?,?,?)`)
  // 2 çalışılan gün
  ins.run(staffId, '2026-07-01', 'worked', null, null)
  ins.run(staffId, '2026-07-02', 'worked', null, null)
  // 1 hafta tatili (off)
  ins.run(staffId, '2026-07-06', 'off', null, null)
  // 3 ücretsiz izin günü (is_paid=0, sgk_day_factor=0)
  ins.run(staffId, '2026-07-03', 'on_leave', 'unpaid', unpaidCodeId)
  ins.run(staffId, '2026-07-04', 'on_leave', 'unpaid', unpaidCodeId)
  ins.run(staffId, '2026-07-05', 'on_leave', 'unpaid', unpaidCodeId)
  // 1 ücretli izin günü (sgk_day_factor=1)
  ins.run(staffId, '2026-07-07', 'on_leave', 'annual', paidCodeId)
})

describe('F2 — bordro raporu puantaj kod etkilerini yansıtır', () => {
  it('sgk_days ücretsiz izni saymaz, ücretli izni sayar', () => {
    const row = getPayrollDetailed('2026-07').find(r => r.id === staffId)
    // worked(2) + off(1) + sgk_day_units(ücretli izin 1 * 1.0 = 1) = 4
    // Eski kaba hesap 2 + (3 ücretsiz + 1 ücretli + 1 off) = 7 verirdi.
    expect(row.sgk_days).toBe(4)
  })

  it('föy (getPuantaj) ile bordro raporu aynı worked/sgk birimlerini verir', () => {
    const foy = getPuantaj('2026-07-01', '2026-07-31').find(r => r.id === staffId)
    const bordro = getPayrollDetailed('2026-07').find(r => r.id === staffId)
    expect(bordro.worked_days).toBe(foy.worked_days)
    expect(bordro.sgk_days).toBe((foy.worked_days || 0) + (foy.off_days || 0) + (foy.sgk_day_units || 0))
  })
})
```

- [ ] **Step 2: Testin başarısız olduğunu doğrula**

Run: `cd backend && npx vitest run src/modules/shifts/payroll-code-effects.test.js`
Expected: FAIL — `sgk_days` şu an 7 (kaba sayım), 4 değil.

- [ ] **Step 3: Paylaşılan alt-sorgu yardımcısını ekle**

`backend/src/modules/shifts/queries.js` içinde `getPuantaj`'tan HEMEN ÖNCE (satır 3535 civarı, `export function getPuantaj` satırının üstüne) ekle:

```js
// Puantaj kod-etkili gün birimleri alt-sorgusu — föy (getPuantaj) ve bordro
// raporları (getPayrollExport/getPayrollDetailed) tek kaynaktan beslensin diye.
// Placeholder sırası: (monthStart, monthEndInclusive) — ss.work_date BETWEEN.
export function puantajUnitsSubquery() {
  return `
    SELECT ss.staff_id,
      MAX(ss.dept_id) as snapshot_dept_id,
      COUNT(CASE WHEN ss.status IN ('worked','overtime') THEN 1 END) as worked_days,
      COUNT(CASE WHEN ss.status='scheduled' THEN 1 END) as scheduled_days,
      COUNT(CASE WHEN ss.status='on_leave' THEN 1 END) as leave_days,
      COUNT(CASE WHEN ss.status='absent' THEN 1 END) as absent_days,
      COUNT(CASE WHEN ss.status='off' THEN 1 END) as off_days,
      COUNT(*) as total_days,
      COUNT(CASE WHEN ss.status='on_leave' AND COALESCE(ss.leave_type, lr.leave_type)='annual' THEN 1 END) as annual_leave_days,
      COUNT(CASE WHEN ss.status='on_leave' AND COALESCE(ss.leave_type, lr.leave_type)='sick' THEN 1 END) as sick_leave_days,
      COUNT(CASE WHEN ss.status='on_leave' AND COALESCE(ss.leave_type, lr.leave_type)='emergency' THEN 1 END) as emergency_leave_days,
      COUNT(CASE WHEN ss.status='on_leave' AND (COALESCE(ss.leave_type, lr.leave_type) IS NULL OR COALESCE(ss.leave_type, lr.leave_type) NOT IN ('annual','sick','emergency')) THEN 1 END) as other_leave_days,
      SUM(CASE WHEN ss.status='on_leave' AND COALESCE(pc.is_paid, 0)=1 THEN
        CASE WHEN COALESCE(ss.leave_hours, 0)>0
          THEN (ss.leave_hours / 8.0) * COALESCE(pc.hour_multiplier, 0)
          ELSE COALESCE(pc.day_multiplier, 0)
        END ELSE 0 END) as paid_leave_units,
      SUM(CASE WHEN ss.status='on_leave' THEN COALESCE(pc.sgk_day_factor, 0) ELSE 0 END) as sgk_day_units,
      COUNT(CASE WHEN ss.status='on_leave' AND COALESCE(pc.requires_document,0)=1
        AND ss.attachment_url IS NULL
        AND NOT EXISTS(SELECT 1 FROM leave_documents ld WHERE ld.schedule_id=ss.id OR ld.leave_request_id=lr.id)
        THEN 1 END) as missing_required_documents
    FROM shift_schedule ss
    LEFT JOIN leave_requests lr ON lr.staff_id = ss.staff_id
      AND lr.status = 'approved'
      AND ss.work_date BETWEEN lr.start_date AND lr.end_date
    LEFT JOIN puantaj_codes pc ON pc.id=COALESCE(ss.puantaj_code_id, (
      SELECT fallback_pc.id FROM puantaj_codes fallback_pc
      WHERE fallback_pc.is_active=1 AND fallback_pc.status=ss.status
        AND (ss.status!='on_leave' OR fallback_pc.leave_type=COALESCE(ss.leave_type, lr.leave_type))
      ORDER BY fallback_pc.is_builtin DESC, fallback_pc.sort_order, fallback_pc.id LIMIT 1
    ))
    WHERE ss.work_date BETWEEN ? AND ?
    GROUP BY ss.staff_id`
}
```

- [ ] **Step 4: `getPuantaj`'ı yardımcıyı kullanacak şekilde refactor et**

`getPuantaj` içinde (satır ~3569-3604) `LEFT JOIN (` ile `) sch ON sch.staff_id = s.id` arasındaki tüm inline alt-sorguyu şununla değiştir:

```js
    LEFT JOIN (
      ${puantajUnitsSubquery()}
    ) sch ON sch.staff_id = s.id
```

Params DEĞİŞMEZ (alt-sorgunun `BETWEEN ? AND ?`'i hâlâ aynı konumda `monthStart, monthEnd` alıyor). Bu adım davranış-koruyucu refactor'dır.

- [ ] **Step 5: `getPuantaj` regresyonunu doğrula**

Run: `cd backend && npx vitest run src/modules/shifts/shifts.test.js -t puantaj`
Expected: PASS (mevcut puantaj testleri geçmeli — refactor davranışı değiştirmedi)

- [ ] **Step 6: `getPayrollDetailed`'ı yeniden yaz**

`getPayrollDetailed` (satır 711-751) gövdesini şununla değiştir:

```js
export function getPayrollDetailed(yearMonth) {
  const db = getDB()
  const start = `${yearMonth}-01`
  const endDate = new Date(start)
  endDate.setMonth(endDate.getMonth() + 1)
  const end = endDate.toISOString().slice(0, 10)
  const endInclusive = new Date(endDate.getTime() - 86400000).toISOString().slice(0, 10)

  return db.prepare(`
    SELECT s.id, s.full_name, s.tc_no, s.salary, s.position,
      d.name as dept_name,
      COALESCE(u.worked_days, 0) as worked_days,
      COALESCE(u.absent_days, 0) as absent_days,
      COALESCE(u.leave_days, 0) as leave_days,
      COALESCE(u.paid_leave_units, 0) as paid_leave_units,
      COALESCE((SELECT SUM(hours) FROM overtime_records
        WHERE staff_id = s.id AND work_date >= ? AND work_date < ?), 0) as overtime_hours,
      COALESCE((SELECT COUNT(*) FROM shift_schedule ss
        JOIN holidays h ON h.date = ss.work_date
        WHERE ss.staff_id = s.id AND ss.status IN ('worked','overtime') AND ss.work_date >= ? AND ss.work_date < ?), 0) as holiday_days,
      COALESCE((SELECT SUM(CASE WHEN h.multiplier IS NULL THEN 1 ELSE h.multiplier END) FROM shift_schedule ss
        LEFT JOIN holidays h ON h.date = ss.work_date
        WHERE ss.staff_id = s.id AND ss.status IN ('worked','overtime') AND ss.work_date >= ? AND ss.work_date < ?), 0) as weighted_days,
      COALESCE((SELECT SUM(amount) FROM payroll_deductions
        WHERE staff_id = s.id AND period = ?), 0) as total_deductions,
      COALESCE(u.off_days, 0) as off_days,
      -- B5: SGK gün = çalışılan + hafta tatili + izin (sgk_day_factor ile ağırlıklı)
      (COALESCE(u.worked_days, 0) + COALESCE(u.off_days, 0) + COALESCE(u.sgk_day_units, 0)) as sgk_days
    FROM staff s
    LEFT JOIN departments d ON d.id = s.department_id
    LEFT JOIN (
      ${puantajUnitsSubquery()}
    ) u ON u.staff_id = s.id
    WHERE s.is_active = 1
    ORDER BY d.name, s.full_name
  `).all(start, end, start, end, start, end, yearMonth, start, endInclusive)
}
```

- [ ] **Step 7: `getPayrollExport`'u yeniden yaz**

`getPayrollExport` (satır 754-783) gövdesini şununla değiştir:

```js
// H4 V7 — Bordro export (kişi başı aylık özet) — puantaj kod etkileriyle
export function getPayrollExport(yearMonth) {
  const db = getDB()
  const start = `${yearMonth}-01`
  const endDate = new Date(start)
  endDate.setMonth(endDate.getMonth() + 1)
  const end = endDate.toISOString().slice(0, 10)
  const endInclusive = new Date(endDate.getTime() - 86400000).toISOString().slice(0, 10)

  return db.prepare(`
    SELECT s.id, s.full_name, s.tc_no, s.salary, s.position,
      d.name as dept_name,
      COALESCE(u.worked_days, 0) as worked_days,
      COALESCE(u.absent_days, 0) as absent_days,
      COALESCE(u.leave_days, 0) as leave_days,
      COALESCE(u.paid_leave_units, 0) as paid_leave_units,
      COALESCE(u.off_days, 0) as off_days,
      COALESCE((SELECT SUM(hours) FROM overtime_records
        WHERE staff_id = s.id AND work_date >= ? AND work_date < ?), 0) as overtime_hours,
      COALESCE((SELECT COUNT(*) FROM shift_schedule ss
        JOIN holidays h ON h.date = ss.work_date
        WHERE ss.staff_id = s.id AND ss.status IN ('worked','overtime') AND ss.work_date >= ? AND ss.work_date < ?), 0) as holiday_days,
      (COALESCE(u.worked_days, 0) + COALESCE(u.off_days, 0) + COALESCE(u.sgk_day_units, 0)) as sgk_days
    FROM staff s
    LEFT JOIN departments d ON d.id = s.department_id
    LEFT JOIN (
      ${puantajUnitsSubquery()}
    ) u ON u.staff_id = s.id
    WHERE s.is_active = 1
    ORDER BY d.name, s.full_name
  `).all(start, end, start, end, start, endInclusive)
}
```

- [ ] **Step 8: F2 testinin geçtiğini doğrula**

Run: `cd backend && npx vitest run src/modules/shifts/payroll-code-effects.test.js`
Expected: PASS (2/2)

- [ ] **Step 9: Bordro regresyon testleri**

Run: `cd backend && npx vitest run src/modules/shifts/shifts.test.js -t "bordro"`
Expected: PASS (mevcut payroll/bank-transfer/PDF testleri geçmeli). Kırmızı çıkan bir assertion varsa: eski testin kaba `sgk_days`/`leave_days` beklentisini kod-etkili değere göre güncelle (yalnızca değişen davranış F2'nin amacı olan raporlarda; PDF/net testleri değişmemeli çünkü onlar zaten `getPuantaj` kullanıyor).

- [ ] **Step 10: Commit**

```bash
git add backend/src/modules/shifts/queries.js backend/src/modules/shifts/payroll-code-effects.test.js
git commit -m "fix: align payroll reports with puantaj code effects

getPayrollExport/getPayrollDetailed artik getPuantaj ile ayni
puantajUnitsSubquery() kaynagini kullanir; sgk_days = worked + off +
sgk_day_units (carpanli). Ucretsiz izin artik SGK gunune sayilmaz.
Net maas/banka CSV/PDF zaten puantajService uzerinden dogruydu.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3 (F3): Onay State Machine Guard'ları

Üç geçersiz geçiş engellenmemiş: (1) dönem onayı `draft→approved` doğrudan geçebiliyor (submit atlanıyor), (2) `approveLeaveRequest` ve (3) `reviewOvertimeRequest` zaten o durumda olan talebi tekrar işleyebiliyor. Meşru `approved→rejected` geri-alma geçişi korunmalı; bu yüzden guard "aynı duruma tekrar geçiş" ve "approve için submit ön-koşulu" olarak dar tutulur.

**Files:**
- Test: `backend/src/modules/shifts/approval-transitions.test.js` (Create)
- Modify: `backend/src/modules/shifts/service.js` (`updatePuantajPeriodApprovalService`, satır 648), `backend/src/modules/shifts/queries.js` (`approveLeaveRequest` satır 910, `reviewOvertimeRequest` satır 1216)

- [ ] **Step 1: Başarısız testi yaz**

Create `backend/src/modules/shifts/approval-transitions.test.js`:

```js
import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let managerToken, staffId

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  managerToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  const db = getDB()
  staffId = db.prepare("INSERT INTO staff(full_name,is_active,salary) VALUES('F3 Personel',1,30000)").run().lastInsertRowid
})

const auth = req => req.set('Authorization', `Bearer ${managerToken}`)

describe('F3 — onay durum geçiş guard\'ları', () => {
  it('dönem onayı submit olmadan approve edilemez (draft→approved 409)', async () => {
    const res = await auth(request(app).patch('/api/shifts/puantaj/approval/period'))
      .send({ period: '2026-08', action: 'approve' })
    expect(res.status).toBe(409)
  })

  it('zaten onaylı izin tekrar onaylanamaz (409)', async () => {
    const db = getDB()
    const id = db.prepare(`INSERT INTO leave_requests(staff_id,leave_type,start_date,end_date,total_days,status,version)
      VALUES(?,'annual','2026-08-10','2026-08-11',2,'approved',1)`).run(staffId).lastInsertRowid
    const res = await auth(request(app).patch(`/api/shifts/leave/${id}`)).send({ status: 'approved' })
    expect(res.status).toBe(409)
  })

  it('zaten onaylı mesai talebi tekrar approve edilemez (409)', async () => {
    const db = getDB()
    const id = db.prepare(`INSERT INTO overtime_requests(staff_id,work_date,requested_hours,reason,status,version)
      VALUES(?,'2026-08-12',3,'test','approved',1)`).run(staffId).lastInsertRowid
    const res = await auth(request(app).patch(`/api/shifts/overtime/requests/${id}`)).send({ status: 'approved' })
    expect(res.status).toBe(409)
  })
})
```

- [ ] **Step 2: Testin başarısız olduğunu doğrula**

Run: `cd backend && npx vitest run src/modules/shifts/approval-transitions.test.js`
Expected: FAIL — şu an guard olmadığı için üçü de 200 dönüyor.

Not: Route yolları farklıysa doğrula — `grep -n "approval/period\|patch('/leave\|overtime/requests" backend/src/modules/shifts/routes.js`.

- [ ] **Step 3: Dönem onayı guard'ını ekle**

`backend/src/modules/shifts/service.js` içinde `updatePuantajPeriodApprovalService`'te (satır ~659, `if (!status) throw ...` satırından SONRA, `if (['lock','reopen']...` satırından ÖNCE) ekle:

```js
  if (action === 'approve') {
    const current = getPuantajPeriodApproval(cleanPeriod, scope.deptScope)
    if ((current?.status || 'draft') !== 'submitted') {
      throw Object.assign(new Error('Onay için önce dönemi gönderin (submitted olmalı).'), { statusCode: 409 })
    }
  }
```

(`getPuantajPeriodApproval` service.js:21'de zaten import edilmiş — ek import gerekmez.)

- [ ] **Step 4: `approveLeaveRequest` guard'ını ekle**

`backend/src/modules/shifts/queries.js` içinde `approveLeaveRequest`'te (satır ~913, `if (!req) throw ...` satırından SONRA) ekle:

```js
  if (req.status === status) {
    throw Object.assign(new Error(`İzin talebi zaten '${status}' durumunda.`), {
      statusCode: 409,
      details: { current_status: req.status },
    })
  }
```

- [ ] **Step 5: `reviewOvertimeRequest` guard'ını ekle**

`backend/src/modules/shifts/queries.js` içinde `reviewOvertimeRequest`'te (satır ~1219, `if (!request) throw ...` satırından SONRA) ekle:

```js
  if (request.status === data.status) {
    throw Object.assign(new Error(`Mesai talebi zaten '${data.status}' durumunda.`), {
      statusCode: 409,
      details: { current_status: request.status },
    })
  }
```

- [ ] **Step 6: F3 testinin geçtiğini doğrula**

Run: `cd backend && npx vitest run src/modules/shifts/approval-transitions.test.js`
Expected: PASS (3/3)

- [ ] **Step 7: Regresyon — onay/izin/mesai akış testleri**

Run: `cd backend && npx vitest run src/modules/shifts/shifts.test.js src/modules/shifts/puantaj-request-workflow.test.js`
Expected: PASS. Kırmızı çıkarsa: geçerli geçişleri (pending→approved, submitted→approved, approved→rejected geri-alma) kırmadığını doğrula; guard yalnız aynı-duruma-tekrar ve submit'siz approve'u engellemeli.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/shifts/service.js backend/src/modules/shifts/queries.js backend/src/modules/shifts/approval-transitions.test.js
git commit -m "fix: guard invalid approval state transitions

Donem onayi artik yalniz submitted'dan approve edilir; izin ve mesai
talepleri ayni duruma tekrar gecirilemez (409). Approved->rejected
geri-alma gecisi korunur.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Bitiş: Tam Suite + Deploy

- [ ] **Step 1: Tüm backend testleri**

Run: `cd backend && npx vitest run`
Expected: PASS (tümü yeşil, regresyon yok)

- [ ] **Step 2: Frontend build (kırılmadığını doğrula)**

Run: `cd frontend && npm run build`
Expected: Temiz build

- [ ] **Step 3: Push + deploy**

Kullanıcı "push/deploy et" onayı verince:
```bash
git push origin main
ssh -p 2222 root@avskamp.com "cd /opt/avskamp && bash scripts/deploy/update.sh"
```
Deploy sonrası prod smoke + login akışı doğrulanır (CLAUDE.md DB kuralı — bu sprint migration eklemiyor, yine de login test edilir).

## Başarı Kriterleri

- F1: 6 endpoint düşük-yetkili token → 403 (`shifts-authz.test.js` 6/6).
- F2: föy ve bordro raporu aynı worked/sgk birimlerini verir; ücretsiz izin SGK'ya sayılmaz (`payroll-code-effects.test.js` 2/2).
- F3: 3 geçersiz geçiş → 409, geçerli geçişler + `approved→rejected` geri-alma korunur (`approval-transitions.test.js` 3/3).
- `npx vitest run` tam yeşil; frontend build temiz.
- Her faz ayrı semantic commit.
