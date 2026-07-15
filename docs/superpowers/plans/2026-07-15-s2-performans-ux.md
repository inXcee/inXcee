# S2 — Performans & UX Sprint (Vardiya) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vardiya modülünde 4 performans/UX düzeltmesi: YTD N+1 sorgusunun toplulaştırılması, puantaj takviminin satır-memo'lanması, loading/indirme/not-modalı tutarlılığı ve bordro sayfalarına hızlı nav erişimi.

**Architecture:** 4 bağımsız faz; F1 backend (service.js), F2-F4 frontend (PuantajTab/LeaveTab/OvertimeTab/ShiftsPage). F1 ve F2 **davranış-koruyucu** performans refactor'ları — mevcut testler regresyon guard'ı. Migration yok. Su modülü dosyalarına dokunulmaz.

**Tech Stack:** Node.js (ESM) + better-sqlite3 + Vitest (backend); React 18 + TanStack Query + Vitest/jsdom (frontend).

**Referans spec:** `docs/superpowers/specs/2026-07-15-s2-performans-ux-design.md`

**Keşif düzeltmeleri (plana işlendi):** (1) `operationsDashboardService` puantajService'i tek kez çağırıyor — F1 kapsamı yalnız bulk YTD; (2) PayrollPage indirmeleri zaten toast'lu — F3'te tek indirme düzeltmesi `PuantajTab.downloadCsv`; (3) 3 sayfa /settings altında zaten linkli — F4 "hızlı erişim" ekler, yeni route eklemez.

---

## Task 1 (F1): `getYtdGross` Toplu Sorgu

`puantajService` (service.js:2823-2910) map içinde satır 2849'da her personel için `getYtdGross(db, row.id, year, mon)` çağırıyor; `getYtdGross` (service.js:57-105, module-private) personel başına 4 sorgu çalıştırıyor. Tek çağıran bu map. Çözüm: aynı 4 sorgunun `GROUP BY staff_id`'li toplu hali `getYtdGrossBulk` + map'ten okuma. Eski fonksiyon export edilip eşdeğerlik testinin referans oracle'ı olur.

**Files:**
- Modify: `backend/src/modules/shifts/service.js` (satır 57: `function getYtdGross` → `export function getYtdGross`; yeni `getYtdGrossBulk` hemen ardına; satır 2849 civarı puantajService düzenlemesi)
- Test: `backend/src/modules/shifts/ytd-bulk.test.js` (Create)

- [ ] **Step 1: Başarısız (henüz import edilemeyen) testi yaz**

Create `backend/src/modules/shifts/ytd-bulk.test.js`:

```js
import { beforeAll, describe, expect, it } from 'vitest'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { getYtdGross, getYtdGrossBulk, puantajService } from './service.js'

let ids = []
let paidCodeId, unpaidCodeId

beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const db = getDB()
  const insStaff = db.prepare("INSERT INTO staff(full_name,is_active,salary) VALUES(?,1,?)")
  ids = [
    insStaff.run('YTD Personel A', 30000).lastInsertRowid,
    insStaff.run('YTD Personel B', 45000).lastInsertRowid,
    insStaff.run('YTD Personel C', 0).lastInsertRowid, // maaşsız — 0 dönmeli
  ]
  paidCodeId = db.prepare(`INSERT INTO puantaj_codes(code,label,status,leave_type,is_paid,sgk_day_factor,day_multiplier,hour_multiplier,is_active)
    VALUES('YÜ','Ytd Ucretli','on_leave','annual',1,1,1,1,1)`).run().lastInsertRowid
  unpaidCodeId = db.prepare(`INSERT INTO puantaj_codes(code,label,status,leave_type,is_paid,sgk_day_factor,day_multiplier,hour_multiplier,is_active)
    VALUES('YZ','Ytd Ucretsiz','on_leave','unpaid',0,0,0,0,1)`).run().lastInsertRowid

  const ins = db.prepare(`INSERT INTO shift_schedule(staff_id,work_date,status,leave_type,puantaj_code_id,leave_hours) VALUES(?,?,?,?,?,?)`)
  // A: Ocak 3 worked + 1 off + 1 ücretli izin; Şubat 2 worked + 1 ücretsiz izin + 4 saatlik ücretli izin
  ins.run(ids[0], '2026-01-05', 'worked', null, null, null)
  ins.run(ids[0], '2026-01-06', 'worked', null, null, null)
  ins.run(ids[0], '2026-01-07', 'worked', null, null, null)
  ins.run(ids[0], '2026-01-11', 'off', null, null, null)
  ins.run(ids[0], '2026-01-12', 'on_leave', 'annual', paidCodeId, null)
  ins.run(ids[0], '2026-02-02', 'worked', null, null, null)
  ins.run(ids[0], '2026-02-03', 'worked', null, null, null)
  ins.run(ids[0], '2026-02-04', 'on_leave', 'unpaid', unpaidCodeId, null)
  ins.run(ids[0], '2026-02-05', 'on_leave', 'annual', paidCodeId, 4)
  // B: Ocak 2 worked + 3 saat FM
  ins.run(ids[1], '2026-01-08', 'worked', null, null, null)
  ins.run(ids[1], '2026-01-09', 'worked', null, null, null)
  db.prepare("INSERT INTO overtime_records(staff_id,work_date,hours,reason) VALUES(?,?,?,?)")
    .run(ids[1], '2026-01-15', 3, 'ytd test')
  // C: maaşsız ama çalışmış
  ins.run(ids[2], '2026-01-05', 'worked', null, null, null)
})

describe('F1 — getYtdGrossBulk tekil getYtdGross ile birebir eşdeğer', () => {
  it('mart ayı için tüm test personelinde bulk === tekil', () => {
    const db = getDB()
    const bulk = getYtdGrossBulk(db, 2026, 3)
    for (const id of ids) {
      const single = getYtdGross(db, id, 2026, 3)
      expect(bulk.get(id) || 0).toBeCloseTo(single, 6)
    }
  })

  it('el hesabı doğru: A personeli Mart YTD', () => {
    // dailyRate = 1000; Oca-Şub: 5 worked + 1 off + (1 tam + 4/8=0.5 saatlik) ücretli izin = 7.5 birim
    // ücretsiz izin katılmaz → 1000 * 7.5 = 7500
    const db = getDB()
    expect(getYtdGrossBulk(db, 2026, 3).get(ids[0])).toBeCloseTo(7500, 2)
  })

  it('ocak için boş map (önceki ay yok)', () => {
    expect(getYtdGrossBulk(getDB(), 2026, 1).size).toBe(0)
  })

  it('puantajService şubat ytd_gross alanı tekil hesapla tutarlı', () => {
    const db = getDB()
    const rows = puantajService('2026-02')
    for (const id of [ids[0], ids[1]]) {
      const row = rows.find(r => r.id === id)
      const prev = getYtdGross(db, id, 2026, 2)
      expect(row.ytd_gross).toBeCloseTo(Math.round((prev + row.gross) * 100) / 100, 2)
    }
  })
})
```

- [ ] **Step 2: Testin başarısız olduğunu doğrula**

Run: `cd backend && npx vitest run src/modules/shifts/ytd-bulk.test.js`
Expected: FAIL — `getYtdGross`/`getYtdGrossBulk` export edilmediği için import hatası.

- [ ] **Step 3: `getYtdGross`'u export et ve `getYtdGrossBulk`'u ekle**

service.js satır 57'deki `function getYtdGross(db, staffId, year, month) {` satırını `export function getYtdGross(db, staffId, year, month) {` yap. Fonksiyonun kapanışından hemen SONRA (calcTax'tan önce) ekle:

```js
// getYtdGross'un toplu hali — tüm personelin yıl başından ay başına (exclusive)
// YTD brütünü 4 sabit sorguyla hesaplar (personel başına sorgu çalıştırmaz).
// Sorgular getYtdGross'un birebir GROUP BY staff_id'li karşılıkları — ikisi
// aynı sonucu vermek ZORUNDA (bkz. ytd-bulk.test.js eşdeğerlik testi).
// Dönüş: Map<staffId, ytdGross> (maaşsız/aktivitesiz personel map'te yer almaz → 0 kabul edilir)
export function getYtdGrossBulk(db, year, month) {
  const map = new Map()
  if (month <= 1) return map
  const janStart = `${year}-01-01`
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`

  const salaries = new Map(db.prepare('SELECT id, salary FROM staff').all().map(r => [r.id, r.salary || 0]))

  const schRows = db.prepare(`
    SELECT staff_id,
      COALESCE(COUNT(CASE WHEN status IN ('worked','overtime') THEN 1 END), 0) as worked_days,
      COALESCE(COUNT(CASE WHEN status = 'off' THEN 1 END), 0) as off_days
    FROM shift_schedule
    WHERE work_date >= ? AND work_date < ?
    GROUP BY staff_id
  `).all(janStart, monthStart)

  const lvRows = db.prepare(`
    SELECT ss.staff_id,
      COALESCE(SUM(CASE WHEN ss.status='on_leave' AND COALESCE(pc.is_paid,0)=1 THEN
        CASE WHEN COALESCE(ss.leave_hours,0)>0
          THEN (ss.leave_hours/8.0)*COALESCE(pc.hour_multiplier,0)
          ELSE COALESCE(pc.day_multiplier,0)
        END ELSE 0 END),0) as paid_leave_units
    FROM shift_schedule ss
    LEFT JOIN puantaj_codes pc ON pc.id=COALESCE(ss.puantaj_code_id, (
      SELECT fallback_pc.id FROM puantaj_codes fallback_pc
      WHERE fallback_pc.is_active=1 AND fallback_pc.status=ss.status
        AND (ss.status!='on_leave' OR fallback_pc.leave_type=ss.leave_type)
      ORDER BY fallback_pc.is_builtin DESC, fallback_pc.sort_order, fallback_pc.id LIMIT 1
    ))
    WHERE ss.work_date>=? AND ss.work_date<?
    GROUP BY ss.staff_id
  `).all(janStart, monthStart)

  const otRows = db.prepare(`
    SELECT staff_id, COALESCE(SUM(hours), 0) as hours
    FROM overtime_records
    WHERE work_date >= ? AND work_date < ?
    GROUP BY staff_id
  `).all(janStart, monthStart)

  const schMap = new Map(schRows.map(r => [r.staff_id, r]))
  const lvMap = new Map(lvRows.map(r => [r.staff_id, r.paid_leave_units || 0]))
  const otMap = new Map(otRows.map(r => [r.staff_id, r.hours || 0]))

  for (const [id, salary] of salaries) {
    if (salary === 0) continue
    const sch = schMap.get(id)
    const units = (sch?.worked_days || 0) + (sch?.off_days || 0) + (lvMap.get(id) || 0)
    const hours = otMap.get(id) || 0
    if (units === 0 && hours === 0) continue
    const dailyRate = salary / 30
    map.set(id, dailyRate * units + (dailyRate / 8) * 1.5 * hours)
  }
  return map
}
```

ÖNEMLİ: `lvRows` sorgusundaki fallback puantaj_codes alt-sorgusu, mevcut `getYtdGross`'taki (satır ~75-90) ile karakteri karakterine aynı olmalı — yaz-madan önce mevcut tekil sorguyu oku ve doğrula; fark varsa TEKİL olan esas alınır.

- [ ] **Step 4: `puantajService`'te map'ten oku**

puantajService içinde `const rows = getPuantaj(monthStart, monthEnd, deptId)` satırından sonra ekle:
```js
  const ytdMap = getYtdGrossBulk(db, year, mon)
```
ve satır ~2849'daki `const ytdGrossPrev = getYtdGross(db, row.id, year, mon)` satırını şununla değiştir:
```js
    const ytdGrossPrev = ytdMap.get(row.id) || 0
```

- [ ] **Step 5: F1 testinin geçtiğini doğrula**

Run: `cd backend && npx vitest run src/modules/shifts/ytd-bulk.test.js`
Expected: PASS (4/4)

- [ ] **Step 6: Regresyon — YTD/vergi/bordro testleri**

Run: `cd backend && npx vitest run src/modules/shifts/`
Expected: tüm shifts test dosyaları PASS (özellikle shifts.test.js:1247 getYtdGross describe'ı, 1057+ Enhanced GET puantaj, 1474-1487 off_days).

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/shifts/service.js backend/src/modules/shifts/ytd-bulk.test.js
git commit -m "perf: batch YTD gross computation in puantaj service

puantajService personel basina 4 sorgu calistiran getYtdGross'u map
icinde cagiriyordu (N personel = 4N sorgu). getYtdGrossBulk ayni
hesabi GROUP BY staff_id ile 4 sabit sorguda yapar; esdegerlik testi
tekil fonksiyonla birebir ayni sonucu garantiler.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2 (F2): Puantaj Takvimi Satır Memo'su

`PuantajCalendarView` (PuantajTab.jsx:1232-2020) N×31 hücreyi tek bileşende inline render ediyor; `activeCell`/`anchor`/`failedSaves` değişince TÜM grid yeniden çiziliyor; tfoot toplamı (satır 1977-1980) her render'da O(gün×personel×gün). Çözüm: personel satırını `React.memo`'lu `PuantajRow`'a çıkar (hücreler satır içinde kalır — satır-seviye memo aktif hücre hareketinde yalnız 2 satırı yeniden çizer), handler'ları ref-tabanlı zamansız closure'lara çevir, tfoot'u `useMemo`'ya al.

**Files:**
- Modify: `frontend/src/modules/shifts/tabs/PuantajTab.jsx` (yalnız PuantajCalendarView bölgesi, ~1232-2020)

**Kritik davranış sözleşmesi (değişmemeli):** hücre tıkla→kod uygula, Shift+tık dikdörtgen, paint modu, sağ tık→gün detay editörü, Ctrl+Z undo, kaydedilemeyen hücre `!` + banner, satır doldur butonu, D gün başlığı→döküm, title zenginliği, onaylı gün confirm'i. Smoke guard: puantaj.smoke.test.jsx:101, 133, 207, 246.

- [ ] **Step 1: Parent'ta ucuz memo'ları ekle**

PuantajCalendarView içinde şu dört değeri `useMemo`'ya al (mevcut ifadeleri AYNEN koruyarak):
```jsx
  const dayNumbers = useMemo(() => /* mevcut Array.from ifadesi (satır 1298) */, [y, m])
  const sundayDays = useMemo(() => /* mevcut new Set(...) ifadesi (satır 1334) */, [y, m])
  const selectionRect = useMemo(
    () => (anchor && activeCell ? normalizeRect(anchor, activeCell) : null),
    [anchor, activeCell]
  )
  const columnTotals = useMemo(() => dayNumbers.map(d => {
    const dayStr = String(d).padStart(2, '0')
    const col = summarizeColumn(filtered.map(r => (dayData[r.id] || []).find(x => x.date.endsWith(`-${dayStr}`))))
    return { d, col, leaveTotal: col.leave + col.off }
  }), [dayNumbers, filtered, dayData])
```
tfoot render'ını (satır 1977-1993) `columnTotals.map(({ d, col, leaveTotal }) => ...)` kullanacak şekilde değiştir — görsel çıktı birebir aynı.

- [ ] **Step 2: Handler'ları zamansız (ref-tabanlı) yap**

State okuyan handler closure'ları satır bileşenine geçince bayatlamasın diye, mevcut `failedSavesRef` desenini (satır 1235) genişlet:
```jsx
  const activeCellRef = useRef(activeCell); activeCellRef.current = activeCell
  const anchorRef = useRef(anchor); anchorRef.current = anchor
  const entryModeRef = useRef(entryMode); entryModeRef.current = entryMode
  const dayDataRef = useRef(dayData); dayDataRef.current = dayData
```
Sonra `clickCell`, `beginPaint`, `enterPaint`, `applyChanges`, `entryFor`, `applyCell`, `applyRow`, `applyActionToSelection`, `handleGridKeyDown` gövdelerinde doğrudan `activeCell`/`anchor`/`entryMode`/`dayData` okuyan yerleri ilgili `.current` okumasına çevir (set* çağrıları aynı kalır). Örn. clickCell'deki Shift dalı `anchorRef.current`, beginPaint `entryModeRef.current === 'paint'`, entryFor `dayDataRef.current[...]`. Bu değişiklik tek başına davranış-nötr — Step 3'ten önce testle doğrula:

Run: `cd frontend && npx vitest run src/modules/shifts/tabs/puantaj.smoke.test.jsx`
Expected: PASS (mevcut 9+ test)

- [ ] **Step 3: `PuantajRow` memo bileşenini çıkar**

Satır render bloğunu (1780-1965, `{filtered.map((r, rowIdx) => {...})}` gövdesi) modül seviyesinde (PuantajCalendarView DIŞINDA, dosya içinde) yeni bileşene taşı:

```jsx
const PuantajRow = React.memo(function PuantajRow({
  r, rowIdx, days, month, dayNumbers, canEdit, selectedAction,
  sundayDays, holidayMap, holidayDays,
  activeDay,        // number | null — yalnız bu satır aktifse gün no
  selRange,         // 'd1-d2' string | null — seçim bu satırı kapsıyorsa
  busyKey,          // bu satırın meşgul günleri: '05,12' gibi string ('' = yok)
  failedKey,        // bu satırın kaydedilemeyen günleri: aynı format
  onPersonClick, onApplyRow, onCellClick, onCellMouseDown, onCellMouseEnter, onCellContextMenu,
}) {
  const dayMap = {}
  days.forEach(d => { dayMap[d.date.split('-')[2]] = d })
  const rowStats = summarizeCalendarDays(days)
  const rowFmHours = days.reduce((s, dd) => s + (dd.overtime_hours || 0), 0)
  const rowHolidayWorked = days.filter(dd => holidayMap.has(dd.date) && ['worked','overtime'].includes(dd.status)).length
  const busySet = new Set(busyKey ? busyKey.split(',') : [])
  const failedSet = new Set(failedKey ? failedKey.split(',') : [])
  const [selFrom, selTo] = selRange ? selRange.split('-').map(Number) : [null, null]
  return (
    <tr key={r.id}>
      {/* MEVCUT sticky personel <td> JSX'i AYNEN buraya (1790-1867) — onPersonClick(r) ve onApplyRow(r) çağrılarıyla */}
      {dayNumbers.map(d => {
        const dayStr = String(d).padStart(2, '0')
        const entry = dayMap[dayStr]
        const date = `${month}-${dayStr}`
        /* MEVCUT hücre hesapları AYNEN (1869-1890): status, meta, hours, holidayName, hasDayDetail, title */
        const busy = busySet.has(dayStr)
        const saveFailed = failedSet.has(dayStr)
        const isActive = activeDay === d
        const inSelection = selFrom != null && d >= selFrom && d <= selTo
        return (
          /* MEVCUT <td>+<button> JSX'i AYNEN (1892-1961), handler'lar prop üzerinden:
             onContextMenu={e => { e.preventDefault(); onCellContextMenu(r, date, entry) }}
             onMouseDown={e => onCellMouseDown(r, d, entry, e)}
             onMouseEnter={e => { onCellMouseEnter(r, d, entry); if (canEdit) e.currentTarget.style.filter = 'brightness(1.12)' }}
             onClick={e => onCellClick(r, d, entry, rowIdx, e)} */
        )
      })}
      {/* MEVCUT satır sonu özet td'leri varsa AYNEN */}
    </tr>
  )
}, (prev, next) =>
  prev.days === next.days &&
  prev.activeDay === next.activeDay &&
  prev.selRange === next.selRange &&
  prev.busyKey === next.busyKey &&
  prev.failedKey === next.failedKey &&
  prev.canEdit === next.canEdit &&
  prev.selectedAction === next.selectedAction &&
  prev.month === next.month &&
  prev.dayNumbers === next.dayNumbers &&
  prev.sundayDays === next.sundayDays &&
  prev.holidayMap === next.holidayMap &&
  prev.holidayDays === next.holidayDays &&
  prev.r === next.r && prev.rowIdx === next.rowIdx
  // handler prop'ları KASITLI karşılaştırılmıyor — hepsi ref-tabanlı zamansız closure (Step 2)
)
```

Kaynak dosyada `React` default import var mı kontrol et; yoksa `import { memo, ... } from 'react'` mevcut importuna uy (`memo(...)` kullan). `isInRect`/`normalizeRect` satır-içi mantığı `selRange`/`inSelection` hesabına birebir çevrildi — `isInRect(selectionRect, rowIdx, d)` semantiğiyle aynı sonucu verdiğini normalizeRect tanımından doğrula (rect satır aralığı + gün aralığı; satır kapsaması parent'ta `selRange` üretilirken uygulanır).

- [ ] **Step 4: Parent'ta satırları PuantajRow ile render et**

`{filtered.map((r, rowIdx) => ...)}` bloğunu şununla değiştir:
```jsx
  {filtered.map((r, rowIdx) => {
    const days = dayData[r.id] || EMPTY_DAYS
    const rowPrefix = `${r.id}-${month}-`
    const busyKey = updatingKeys ? [...updatingKeys].filter(k => k.startsWith(rowPrefix)).map(k => k.slice(-2)).sort().join(',') : ''
    const failedKey = Object.keys(failedSaves).filter(k => k.startsWith(rowPrefix)).map(k => k.slice(-2)).sort().join(',')
    const activeDay = activeCell?.row === rowIdx ? activeCell.day : null
    const selRange = selectionRect && rowIdx >= selectionRect.r1 && rowIdx <= selectionRect.r2
      ? `${selectionRect.d1}-${selectionRect.d2}` : null
    return <PuantajRow key={r.id} r={r} rowIdx={rowIdx} days={days} month={month} dayNumbers={dayNumbers}
      canEdit={canEdit} selectedAction={selectedAction} sundayDays={sundayDays} holidayMap={holidayMap} holidayDays={holidayDays}
      activeDay={activeDay} selRange={selRange} busyKey={busyKey} failedKey={failedKey}
      onPersonClick={onPersonClick} onApplyRow={applyRow} onCellClick={clickCell}
      onCellMouseDown={beginPaint} onCellMouseEnter={enterPaint}
      onCellContextMenu={(staff, date, entry) => setCellEditor({ staff, date, entry })} />
  })}
```
Modül seviyesinde `const EMPTY_DAYS = []` sabiti ekle (memo referans kararlılığı). `selectionRect`'in alan adlarını (`r1/r2/d1/d2` vb.) `normalizeRect` tanımından doğrula ve uyarla; `updatingKeys` anahtar formatını (`${r.id}-${date}`) koddan teyit et — `slice(-2)` gün çıkarımı format değişirse kırılır, gerekirse `k.split('-').pop()` kullan.

`onCellContextMenu` inline arrow olduğu için kararsız — sorun değil, memo karşılaştırması handler'ları zaten yok sayıyor.

- [ ] **Step 5: Smoke + tam frontend testi**

Run: `cd frontend && npx vitest run src/modules/shifts/tabs/puantaj.smoke.test.jsx`
Expected: PASS — özellikle 246 ('calendar keeps edited code visible and marks it when save fails': failedKey akışı) ve 101 (hücre title'ları).

Run: `cd frontend && npx vitest run && npm run build`
Expected: tümü PASS + temiz build.

- [ ] **Step 6: Görsel doğrulama (dev server)**

Dev server'da (launch.json config'i varsa preview ile) puantaj takvimini aç: hücre tıkla→kod uygulanıyor, ok tuşları→aktif hücre geziyor, Shift+tık→dikdörtgen seçim, sağ tık→detay editörü. Konsol hatası yok. (Bu adım kontrolör tarafından da tekrarlanabilir; implementer en azından smoke'ların ötesinde bir kez elle doğrulamalı.)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/modules/shifts/tabs/PuantajTab.jsx
git commit -m "perf: memoize puantaj calendar rows

PuantajCalendarView satirlari React.memo'lu PuantajRow'a cikarildi;
handler'lar ref-tabanli zamansiz closure yapildi (bayat state yok),
aktif hucre/secim degisimi artik yalniz ilgili satirlari yeniden
cizer. tfoot gun toplamlari useMemo'ya alindi.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3 (F3): Loading / UX Tutarlılığı

Dört küçük, bağımsız düzeltme.

**Files:**
- Modify: `frontend/src/modules/shifts/tabs/LeaveTab.jsx` (satır 35-38 query, 153-159 tablo bloğu)
- Modify: `frontend/src/modules/shifts/tabs/OvertimeTab.jsx` (satır 43-50 query, 180-186 tablo bloğu)
- Modify: `frontend/src/modules/shifts/tabs/PuantajTab.jsx` (satır 3670-3684 downloadCsv; satır 207-214 askDayStatus + ilgili bileşene modal state)
- Modify: `backend/src/modules/shifts/routes.js` (satır 403, 533 console.error)
- Test: `frontend/src/modules/shifts/tabs/tabs.smoke.test.jsx` (skeleton assertion ekle)

- [ ] **Step 1: Skeleton — LeaveTab**

Import ekle: `import { SkeletonTable } from '../../../shared/components/Skeleton.jsx'`
Satır 35 query'sine `isLoading` ekle: `const { data: leaves = [], isLoading } = useQuery({...})`
Satır 154'teki ternary'i genişlet:
```jsx
          {isLoading ? (
            <div style={{ padding: 16 }}><SkeletonTable rows={5} cols={8} /></div>
          ) : leaves.length === 0 ? (
            <div className="empty-state">...</div>  /* mevcut AYNEN */
          ) : (
```

- [ ] **Step 2: Skeleton — OvertimeTab**

Aynı desen: import + `isLoading` destrukture + satır 181 ternary başına `isLoading ? <div style={{ padding: 16 }}><SkeletonTable rows={5} cols={9} /></div> :`.

- [ ] **Step 3: downloadCsv hata toast'ı**

PuantajTab.jsx downloadCsv catch bloğunu (satır 3681-3683) değiştir:
```jsx
    } catch {
      toastErr({ response: { data: { error: 'Puantaj CSV indirilemedi' } } })
    }
```
`toastErr` PuantajTab'ın `../shared.jsx` importunda var mı kontrol et; yoksa mevcut import satırına ekle. (toastErr imzası `e?.response?.data?.error || 'Hata'` okur — sarmalanmış obje bu yüzden.)

- [ ] **Step 4: window.prompt → ModalOverlay**

`askDayStatus` (satır 207-214) bulunduğu bileşende (PuantajApprovalView içinde; props satır 130) state ekle:
```jsx
  const [returnNote, setReturnNote] = useState(null) // { row, note } | null
```
`askDayStatus`'u değiştir:
```jsx
  const askDayStatus = (row, status) => {
    if (status === 'returned') { setReturnNote({ row, note: row.note || '' }); return }
    onDayStatus(row, status, row.note || '')
  }
```
Bileşenin return JSX'inin sonuna (mevcut modal desenlerinin yanına) ekle — LeaveTab review modalı (LeaveTab.jsx:269-284) birebir şablon:
```jsx
      {returnNote && (
        <ModalOverlay onClose={() => setReturnNote(null)}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: '17px', letterSpacing: '1px', margin: '0 0 6px' }}>GERİ GÖNDERME NOTU</h3>
          <div style={{ color: 'var(--text2)', fontSize: '12px', marginBottom: '14px' }}>{returnNote.row.date || returnNote.row.period || ''}</div>
          <textarea className="form-textarea" rows={3} autoFocus value={returnNote.note}
            onChange={e => setReturnNote(p => ({ ...p, note: e.target.value }))} />
          <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
            <button className="btn btn-primary" style={{ flex: 1 }}
              onClick={() => { onDayStatus(returnNote.row, 'returned', returnNote.note); setReturnNote(null) }}>Geri Gönder</button>
            <button className="btn btn-ghost" onClick={() => setReturnNote(null)}>Vazgeç</button>
          </div>
        </ModalOverlay>
      )}
```
`ModalOverlay` dosyada import'lu mu kontrol et (PuantajTab '../shared.jsx'ten başka bileşenler alıyor); değilse ekle. Eski davranıştaki gibi boş not geçerli (prompt'ta boş bırakılabiliyordu); İptal=Vazgeç.
NOT — davranış inceliği: eski `window.prompt` null dönünce (İptal) mutation ÇAĞRILMAZDI; yeni modalda Vazgeç de çağırmaz — birebir korunuyor. `askDayStatus`'un 'returned' DIŞI yolunda eski kod `row.note || ''` gönderiyordu — aynen korunuyor.

- [ ] **Step 5: console.error → logger**

routes.js satır 403: `console.error('[bank-transfer]', e)` → `logger.error('[bank-transfer]', e)`
routes.js satır 533: `console.error('[payslip/pdf]', e)` → `logger.error('[payslip/pdf]', e)`
(`logger` satır 7'de zaten import'lu.)

- [ ] **Step 6: Skeleton smoke testi**

tabs.smoke.test.jsx'e ekle (mevcut mock/renderWithProviders altyapısıyla):
```jsx
it('LeaveTab yüklenirken skeleton gösterir', async () => {
  api.get.mockImplementation(() => new Promise(() => {})) // hiç çözülmeyen istek
  const { container } = renderWithProviders(<LeaveTab departments={[]} />)
  await waitFor(() => expect(container.querySelectorAll('span').length).toBeGreaterThan(10)) // SkeletonTable shimmer span'ları
})
```
Mevcut mock deseni farklıysa (örn. api default mock'u), dosyadaki kalıba uyarla — amaç: query pending iken empty-state DEĞİL skeleton render'ı. Benzer bir test OvertimeTab için de ekle.

- [ ] **Step 7: Testler + build + backend suite**

Run: `cd frontend && npx vitest run && npm run build`
Expected: PASS + temiz build.
Run: `cd backend && npx vitest run src/modules/shifts/`
Expected: PASS (console.error değişikliği davranışsal olarak nötr).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/modules/shifts/tabs/LeaveTab.jsx frontend/src/modules/shifts/tabs/OvertimeTab.jsx frontend/src/modules/shifts/tabs/PuantajTab.jsx frontend/src/modules/shifts/tabs/tabs.smoke.test.jsx backend/src/modules/shifts/routes.js
git commit -m "fix: unify shifts loading, download and note UX

LeaveTab/OvertimeTab yuklenirken SkeletonTable gosterir; puantaj CSV
indirme hatasi artik toast'lanir; gun geri-gonderme notu window.prompt
yerine ModalOverlay ile alinir; routes.js console.error -> logger.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4 (F4): ShiftsPage Hızlı Sayfa Linkleri

Bordro Özet / Resmi Tatiller / Devamsızlık sayfaları `/settings/*` altında yaşıyor (App.jsx:385-387, RoleRoute MGMT korumalı) ama vardiya çalışma alanından erişilemiyorlar. ShiftsPage sol nav'ının altına ayrı "SAYFALAR" bölümü eklenir — `useNavigate` ile dış link; sekme state'ine (`?tab=`) karışmaz, route/rol yapısı değişmez.

**Files:**
- Modify: `frontend/src/modules/shifts/ShiftsPage.jsx`

- [ ] **Step 1: Link tanımları + navigate**

ShiftsPage.jsx'te `react-router-dom`'dan `useNavigate` import et (mevcut import satırını kontrol et/genişlet). NAV_ITEMS'ın (satır 19-28) altına ekle:
```js
const PAGE_LINKS = [
  { to: '/settings/payroll', icon: '💰', label: 'Bordro Özet' },
  { to: '/settings/holidays', icon: '🎉', label: 'Resmi Tatiller' },
  { to: '/settings/combined-absences', icon: '✗', label: 'Devamsızlık' },
]
```
Bileşen içinde: `const navigate = useNavigate()`

- [ ] **Step 2: Nav render'ına bölüm ekle**

`NAV_ITEMS.map(...)` bloğunun (satır 100-157) kapanışından hemen sonra, tarih footer'ından (satır 159) ÖNCE ekle — mevcut nav butonlarının stiliyle birebir aynı, yalnız aktif-durum stili yok + üstte ince ayraç:
```jsx
        <div style={{ borderTop: '1px solid var(--border)', margin: '8px 8px 4px', paddingTop: 6 }}>
          {navExpanded && <div style={{ fontSize: 9, letterSpacing: 2, color: 'var(--text2)', padding: '2px 10px 6px', fontFamily: 'var(--mono)' }}>SAYFALAR</div>}
          {PAGE_LINKS.map(item => (
            <button key={item.to} type="button" title={item.label} onClick={() => navigate(item.to)}
              style={{ /* NAV_ITEMS butonlarındaki stil objesini AYNEN kopyala; active=false hali:
                        background 'none', borderLeft '3px solid transparent' */ }}>
              <span style={{ fontSize: 18 }}>{item.icon}</span>
              {navExpanded && <span style={{ /* mevcut label stili AYNEN */ }}>{item.label.toUpperCase()}</span>}
            </button>
          ))}
        </div>
```
Stil objelerini soldaki mevcut butonlardan kopyala — görsel bütünlük bozulmasın. Collapsed halde yalnız ikon + `title` tooltip.

- [ ] **Step 3: Smoke doğrulama**

renderWithProviders router sağlıyor mu kontrol et (`frontend/src/test/renderWithProviders.jsx`). Sağlıyorsa yeni test dosyası `frontend/src/modules/shifts/shiftsnav.smoke.test.jsx`:
```jsx
// ShiftsPage'i mock api ile render et; nav'ı genişlet; SAYFALAR bölümü + 3 linkin varlığını assert et.
// navigate çağrısını test etmek için link butonuna tıkla ve window.location/route değişimini
// (MemoryRouter initialEntries ile) doğrula — router yardımcıları elveriyorsa.
```
renderWithProviders router sağlamıyorsa ve sarmak invaziv oluyorsa: testte MemoryRouter ile elle sar; o da mevcut mock düzenini bozuyorsa smoke testi atla ve Step 4 görsel doğrulamayı zorunlu tut (commit mesajına 'manuel doğrulandı' notu düş).

- [ ] **Step 4: Görsel doğrulama + tam test + build**

Dev server'da /shifts aç: SAYFALAR bölümü görünüyor, Bordro Özet tıklayınca /settings/payroll açılıyor, geri gelince sekme state'i korunuyor.
Run: `cd frontend && npx vitest run && npm run build`
Expected: PASS + temiz build.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/shifts/ShiftsPage.jsx frontend/src/modules/shifts/shiftsnav.smoke.test.jsx
git commit -m "feat: add quick page links to shifts nav

Bordro Ozet / Resmi Tatiller / Devamsizlik sayfalarina vardiya
calisma alanindan tek tik erisim (SAYFALAR bolumu). Route/rol
yapisi degismedi; linkler mevcut /settings/* rotalarina gider.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Ortak Kurallar (her task için)

- **Çalışma ağacı disiplini:** Repo'da paralel bir Codex süreci su modülünde çalışıyor olabilir. `git add` DAİMA yukarıdaki açık dosya yollarıyla — asla `git add -A`/`.` kullanma; water/* dosyalarına dokunma.
- **Backend değiştiyse** commit öncesi `cd backend && npx vitest run` tam suite; **frontend değiştiyse** `cd frontend && npx vitest run && npm run build`.
- Her task sonrası kontrolör: spec review → kalite review → temiz-SHA push (`git push origin <sha>:main`) → `ssh -p 2222 root@avskamp.com "cd /opt/avskamp && bash scripts/deploy/update.sh"` → smoke + login doğrulaması.

## Başarı Kriterleri

- F1: `ytd-bulk.test.js` 4/4; shifts backend suite yeşil; puantajService personel başına sorgu çalıştırmıyor.
- F2: puantaj.smoke 9+/9+ yeşil; aktif hücre hareketi yalnız ilgili satırları render ediyor (React DevTools/manuel); davranış birebir.
- F3: skeleton + CSV hata toast'ı + not modalı çalışıyor; `console.error` shifts routes'ta sıfır.
- F4: SAYFALAR bölümünden 3 sayfaya tek tık erişim.
- Her faz ayrı commit + ayrı deploy + prod smoke yeşil.
