# Puantaj Pro B1 — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add progressive Turkish tax calculation, SGK/unemployment/stamp-tax deductions, employer costs, cumulative YTD gross, leave-type breakdown, day-breakdown endpoint, and CSV export to the shifts/puantaj backend.

**Architecture:** Pure helper functions (`calcTax`, `workDaysInMonth`, `getYtdGross`) are added to `service.js`; `getPuantaj` SQL query in `queries.js` gains a leave-type breakdown join; financial calculations happen in `puantajService` after fetching raw data; two new routes (CSV export registered before `:staffId/days` to prevent Express shadowing) are added to `routes.js`.

**Tech Stack:** Node.js/Express, SQLite/better-sqlite3 (sync API), Vitest + Supertest

**Spec:** `docs/superpowers/specs/2026-03-24-puantaj-pro-design.md`

---

## File Map

| File | Change |
|---|---|
| `backend/src/modules/shifts/service.js` | Add `calcTax`, `workDaysInMonth`, `round2`, `getYtdGross`; rewrite `puantajService`; add `staffDayBreakdownService`, `puantajCsvService` |
| `backend/src/modules/shifts/queries.js` | Extend `getPuantaj` with leave-type join; add `getStaffDayBreakdown`, `getPuantajCsv` |
| `backend/src/modules/shifts/routes.js` | Add `GET /puantaj/export/csv` (before `:staffId` routes), `GET /puantaj/:staffId/days` |
| `backend/src/modules/shifts/shifts.test.js` | Add `calcTax` unit tests, `workDaysInMonth` tests, endpoint integration tests |

---

## Task 1: Pure helper functions — `calcTax`, `workDaysInMonth`, `round2`

These are pure functions with no DB dependency. TDD first.

**Files:**
- Modify: `backend/src/modules/shifts/service.js` (add at top, before exports)
- Modify: `backend/src/modules/shifts/shifts.test.js` (add new describe block)

- [ ] **Step 1: Write failing tests**

Add a new `describe` block at the bottom of `shifts.test.js`:

```js
import { calcTax, workDaysInMonth } from '../modules/shifts/service.js'

describe('calcTax — Turkish progressive income tax', () => {
  it('returns 0 for 0 gross', () => {
    expect(calcTax(0)).toBe(0)
  })

  it('taxes 110,000 TL entirely at 15%', () => {
    expect(calcTax(110_000)).toBe(16_500)
  })

  it('taxes 230,000 TL in two brackets', () => {
    // 110,000 × 0.15 = 16,500; 120,000 × 0.20 = 24,000; total = 40,500
    expect(calcTax(230_000)).toBe(40_500)
  })

  it('calculates marginal tax for 150,000 TL', () => {
    // 110,000 × 0.15 = 16,500; 40,000 × 0.20 = 8,000; total = 24,500
    expect(calcTax(150_000)).toBe(24_500)
  })

  it('handles amounts above top bracket', () => {
    // 110k×0.15 + 120k×0.20 + 640k×0.27 + 2,130k×0.35 + 500k×0.40
    // = 16,500 + 24,000 + 172,800 + 745,500 + 200,000 = 1,158,800
    expect(calcTax(3_500_000)).toBe(1_158_800)
  })
})

describe('workDaysInMonth', () => {
  it('March 2024 has 26 non-Sunday days', () => {
    // March 2024: 31 days, 5 Sundays (3,10,17,24,31) → 26
    expect(workDaysInMonth(2024, 3)).toBe(26)
  })

  it('February 2024 (leap) has 25 non-Sunday days', () => {
    // Feb 2024: 29 days, 4 Sundays (4,11,18,25) → 25
    expect(workDaysInMonth(2024, 2)).toBe(25)
  })

  it('January 2024 has 27 non-Sunday days', () => {
    // Jan 2024: 31 days, 4 Sundays (7,14,21,28) → 27
    expect(workDaysInMonth(2024, 1)).toBe(27)
  })
})
```

- [ ] **Step 2: Run tests — verify they FAIL**

```bash
cd backend && npx vitest run src/modules/shifts/shifts.test.js 2>&1 | tail -20
```
Expected: `calcTax is not a function` or similar import error.

- [ ] **Step 3: Add pure functions to `service.js`**

Add at the very top of `service.js`, before any imports (or right after imports), before any export:

```js
// ── Tax helpers (2024 brackets — update annually per GIB tebliği) ──
// TODO: Her yıl GİB tebliğine göre güncelle
const TAX_BRACKETS = [
  { limit: 110_000,   rate: 0.15 },
  { limit: 230_000,   rate: 0.20 },
  { limit: 870_000,   rate: 0.27 },
  { limit: 3_000_000, rate: 0.35 },
  { limit: Infinity,  rate: 0.40 },
]

export function calcTax(ytdGross) {
  let tax = 0
  let prev = 0
  for (const { limit, rate } of TAX_BRACKETS) {
    if (ytdGross <= prev) break
    const slice = Math.min(ytdGross, limit) - prev
    tax += slice * rate
    prev = limit
  }
  return Math.round(tax * 100) / 100
}

export function workDaysInMonth(year, month) {
  const days = new Date(year, month, 0).getDate()
  let count = 0
  for (let d = 1; d <= days; d++) {
    if (new Date(year, month - 1, d).getDay() !== 0) count++
  }
  return count
}

function round2(x) {
  return Math.round(x * 100) / 100
}
```

- [ ] **Step 4: Run tests — verify they PASS**

```bash
cd backend && npx vitest run src/modules/shifts/shifts.test.js 2>&1 | tail -20
```
Expected: all `calcTax` and `workDaysInMonth` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/shifts/service.js backend/src/modules/shifts/shifts.test.js
git commit -m "feat: add calcTax and workDaysInMonth pure helpers with tests"
```

---

## Task 2: `getYtdGross` DB helper

Queries January through (month-1) gross for cumulative tax calculation.

**Files:**
- Modify: `backend/src/modules/shifts/service.js` (add `getYtdGross` function)
- Modify: `backend/src/modules/shifts/shifts.test.js` (integration test)

- [ ] **Step 1: Write failing test**

Add to `shifts.test.js` inside the existing `describe('Leave & Overtime (staff_id)', ...)` block or as a new describe:

```js
describe('getYtdGross', () => {
  it('returns 0 for January (no prior months)', async () => {
    // Any staff_id, month=1 means no prior months → ytdGross=0
    // We test via the puantaj endpoint: no previous months means ytd_gross === gross for January
    const staffRes = await request(app).get('/api/shifts/staff').set('Authorization', `Bearer ${shiftToken}`)
    const staffId = staffRes.body[0]?.id
    if (!staffId) return

    const res = await request(app)
      .get('/api/shifts/puantaj?month=2026-01')
      .set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    // For Jan, ytd_gross = gross (no prior months)
    const row = res.body.find(r => r.id === staffId)
    if (row && row.gross !== undefined) {
      expect(row.ytd_gross).toBe(row.gross)
    }
  })
})
```

Note: This test will fail until Task 3 is complete (puantaj endpoint doesn't return `ytd_gross` yet). That's OK — it will pass after Task 3.

- [ ] **Step 2: Add `getYtdGross` to `service.js`**

Add right after `round2`, before `puantajService`:

```js
function getYtdGross(db, staffId, year, month) {
  // month is 1-based. Returns gross from Jan 1 to (month-01) exclusive.
  // Must mirror puantajService pay logic: only 'worked'/'overtime' days + annual/emergency leave are paid.
  if (month <= 1) return 0
  const janStart = `${year}-01-01`
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`

  const staff = db.prepare('SELECT salary FROM staff WHERE id = ?').get(staffId)
  const salary = staff?.salary || 0
  if (salary === 0) return 0

  const dailyRate = salary / 30

  // Worked days (worked + overtime statuses only — on_leave excluded here)
  const sch = db.prepare(`
    SELECT COALESCE(COUNT(CASE WHEN status IN ('worked','overtime') THEN 1 END), 0) as worked_days
    FROM shift_schedule
    WHERE staff_id = ? AND work_date >= ? AND work_date < ?
  `).get(staffId, janStart, monthStart)

  // Paid leave days: only annual + emergency (matching puantajService leave_pay rule)
  const lv = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN leave_type IN ('annual','emergency') THEN total_days ELSE 0 END), 0) as paid_leave_days
    FROM leave_requests
    WHERE staff_id = ? AND status = 'approved'
      AND start_date >= ? AND start_date < ?
  `).get(staffId, janStart, monthStart)

  const ot = db.prepare(`
    SELECT COALESCE(SUM(hours), 0) as hours
    FROM overtime_records
    WHERE staff_id = ? AND work_date >= ? AND work_date < ?
  `).get(staffId, janStart, monthStart)

  return (
    dailyRate * ((sch?.worked_days || 0) + (lv?.paid_leave_days || 0)) +
    (dailyRate / 8) * 1.5 * (ot?.hours || 0)
  )
}
```

Note: `getYtdGross` receives `db` as first arg (sync pattern, avoids re-calling `getDB()` in a loop).

- [ ] **Step 3: Commit (helper is private, tested indirectly via Task 3)**

```bash
git add backend/src/modules/shifts/service.js
git commit -m "feat: add getYtdGross helper for cumulative YTD income"
```

---

## Task 3: Enhanced `getPuantaj` query + rewritten `puantajService`

Extends the SQL to include leave-type breakdown, then computes all financial fields in the service layer.

**Files:**
- Modify: `backend/src/modules/shifts/queries.js` (replace `getPuantaj`)
- Modify: `backend/src/modules/shifts/service.js` (rewrite `puantajService`)
- Modify: `backend/src/modules/shifts/shifts.test.js` (add puantaj endpoint tests)

- [ ] **Step 1: Write failing tests for the enhanced endpoint**

Add to `shifts.test.js`:

```js
describe('Enhanced GET /shifts/puantaj', () => {
  it('returns 200 with valid month', async () => {
    const res = await request(app)
      .get('/api/shifts/puantaj?month=2026-03')
      .set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('returns 400 without month param', async () => {
    const res = await request(app)
      .get('/api/shifts/puantaj')
      .set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid month format', async () => {
    const res = await request(app)
      .get('/api/shifts/puantaj?month=2026/03')
      .set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(400)
  })

  it('each row has all required financial fields', async () => {
    const res = await request(app)
      .get('/api/shifts/puantaj?month=2026-03')
      .set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    if (res.body.length === 0) return // seed may have no data for this month
    const row = res.body[0]
    const required = [
      'annual_leave_days', 'sick_leave_days', 'emergency_leave_days', 'other_leave_days',
      'daily_rate', 'base_pay', 'overtime_pay', 'leave_pay', 'gross',
      'ssi_worker', 'unemployment_worker', 'income_tax', 'stamp_tax',
      'total_deductions', 'net',
      'ssi_employer', 'unemployment_employer', 'employer_total_cost',
      'attend_rate', 'work_days_in_month', 'ytd_gross', 'ytd_tax',
    ]
    required.forEach(field => {
      expect(row).toHaveProperty(field)
      expect(typeof row[field]).toBe('number')
    })
  })

  it('net equals gross minus total_deductions', async () => {
    const res = await request(app)
      .get('/api/shifts/puantaj?month=2026-03')
      .set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    res.body.forEach(row => {
      expect(row.net).toBeCloseTo(row.gross - row.total_deductions, 1)
    })
  })
})
```

- [ ] **Step 2: Run tests — verify they FAIL**

```bash
cd backend && npx vitest run src/modules/shifts/shifts.test.js --reporter=verbose 2>&1 | grep -E "FAIL|PASS|✓|✗|×" | tail -30
```
Expected: new tests FAIL (400 test will fail because route currently returns 200 with fallback month).

- [ ] **Step 3: Replace `getPuantaj` in `queries.js`**

Replace the entire `getPuantaj` function (lines 662–702) with:

```js
export function getPuantaj(monthStart, monthEnd, deptId) {
  const db = getDB()
  let query = `
    SELECT
      s.id, s.full_name, s.position, s.salary, s.gender, s.tc_no, s.department_id,
      d.name as dept_name, d.color_class as dept_color,
      COALESCE(sch.worked_days, 0) as worked_days,
      COALESCE(sch.scheduled_days, 0) as scheduled_days,
      COALESCE(sch.leave_days, 0) as leave_days,
      COALESCE(sch.absent_days, 0) as absent_days,
      COALESCE(sch.total_days, 0) as total_days,
      COALESCE(ot.overtime_hours, 0) as overtime_hours,
      COALESCE(ot.overtime_count, 0) as overtime_count,
      COALESCE(lv.annual_days, 0) as annual_leave_days,
      COALESCE(lv.sick_days, 0) as sick_leave_days,
      COALESCE(lv.emergency_days, 0) as emergency_leave_days,
      COALESCE(lv.other_days, 0) as other_leave_days
    FROM staff s
    LEFT JOIN departments d ON d.id = s.department_id
    LEFT JOIN (
      SELECT staff_id,
        COUNT(CASE WHEN status IN ('worked','overtime') THEN 1 END) as worked_days,
        COUNT(CASE WHEN status='scheduled' THEN 1 END) as scheduled_days,
        COUNT(CASE WHEN status='on_leave' THEN 1 END) as leave_days,
        COUNT(CASE WHEN status='absent' THEN 1 END) as absent_days,
        COUNT(*) as total_days
      FROM shift_schedule
      WHERE work_date BETWEEN ? AND ?
      GROUP BY staff_id
    ) sch ON sch.staff_id = s.id
    LEFT JOIN (
      SELECT staff_id,
        COALESCE(SUM(hours), 0) as overtime_hours,
        COUNT(*) as overtime_count
      FROM overtime_records
      WHERE work_date BETWEEN ? AND ?
      GROUP BY staff_id
    ) ot ON ot.staff_id = s.id
    LEFT JOIN (
      SELECT staff_id,
        COALESCE(SUM(CASE WHEN leave_type='annual' THEN total_days ELSE 0 END), 0) as annual_days,
        COALESCE(SUM(CASE WHEN leave_type='sick' THEN total_days ELSE 0 END), 0) as sick_days,
        COALESCE(SUM(CASE WHEN leave_type='emergency' THEN total_days ELSE 0 END), 0) as emergency_days,
        COALESCE(SUM(CASE WHEN leave_type NOT IN ('annual','sick','emergency') THEN total_days ELSE 0 END), 0) as other_days
      FROM leave_requests
      WHERE status = 'approved' AND start_date <= ? AND end_date >= ?
      GROUP BY staff_id
    ) lv ON lv.staff_id = s.id
    WHERE s.is_active = 1
  `
  const params = [monthStart, monthEnd, monthStart, monthEnd, monthEnd, monthStart]
  if (deptId) { query += ' AND s.department_id = ?'; params.push(deptId) }
  query += ' ORDER BY d.name, s.full_name'
  return db.prepare(query).all(...params)
}
```

- [ ] **Step 4: Rewrite `puantajService` in `service.js`**

Replace the existing `puantajService` function (currently at the bottom of service.js):

```js
export function puantajService(month, deptId) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    throw Object.assign(new Error('month parametresi YYYY-MM formatında gereklidir'), { statusCode: 400 })
  }
  const [year, mon] = month.split('-').map(Number)
  const monthStart = `${year}-${String(mon).padStart(2, '0')}-01`
  const lastDay = new Date(year, mon, 0).getDate()
  const monthEnd = `${year}-${String(mon).padStart(2, '0')}-${lastDay}`
  const wdm = workDaysInMonth(year, mon)
  const db = getDB()

  const rows = getPuantaj(monthStart, monthEnd, deptId)

  return rows.map(row => {
    const salary = row.salary || 0
    const dailyRate = salary / 30
    const basePay = round2(dailyRate * (row.worked_days || 0))
    const overtimePay = round2((dailyRate / 8) * 1.5 * (row.overtime_hours || 0))
    const leavePay = round2(dailyRate * ((row.annual_leave_days || 0) + (row.emergency_leave_days || 0)))
    const gross = round2(basePay + overtimePay + leavePay)

    const ytdGrossPrev = getYtdGross(db, row.id, year, mon)
    const ytdGross = round2(ytdGrossPrev + gross)

    const ssiWorker = round2(gross * 0.14)
    const unemploymentWorker = round2(gross * 0.01)
    const incomeTax = round2(calcTax(ytdGross) - calcTax(ytdGrossPrev))
    const stampTax = round2(gross * 0.00759)
    const totalDeductions = round2(ssiWorker + unemploymentWorker + incomeTax + stampTax)
    const net = round2(gross - totalDeductions)

    const ssiEmployer = round2(gross * 0.205)
    const unemploymentEmployer = round2(gross * 0.02)
    const employerTotalCost = round2(gross + ssiEmployer + unemploymentEmployer)

    const attendRate = wdm > 0 ? Math.round(((row.worked_days || 0) / wdm) * 100) : 0

    return {
      ...row,
      daily_rate: round2(dailyRate),
      base_pay: basePay,
      overtime_pay: overtimePay,
      leave_pay: leavePay,
      gross,
      ssi_worker: ssiWorker,
      unemployment_worker: unemploymentWorker,
      income_tax: incomeTax,
      stamp_tax: stampTax,
      total_deductions: totalDeductions,
      net,
      ssi_employer: ssiEmployer,
      unemployment_employer: unemploymentEmployer,
      employer_total_cost: employerTotalCost,
      attend_rate: attendRate,
      work_days_in_month: wdm,
      ytd_gross: ytdGross,
      ytd_tax: round2(calcTax(ytdGross)),
    }
  })
}
```

- [ ] **Step 5: Update `puantaj` route in `routes.js` to validate month and handle 400**

Find the existing puantaj route (around line 198):
```js
shiftsRouter.get('/puantaj', ...allStaff, (req, res) => {
  const month = req.query.month || new Date().toISOString().substring(0, 7)
  res.json(puantajService(month, req.query.dept_id || null))
})
```

Replace with:
```js
shiftsRouter.get('/puantaj', ...allStaff, (req, res) => {
  try {
    const { month, dept_id } = req.query
    if (!month) return res.status(400).json({ error: 'month parametresi YYYY-MM formatında gereklidir' })
    res.json(puantajService(month, dept_id || null))
  } catch (e) {
    res.status(e.statusCode || 400).json({ error: e.message })
  }
})
```

Also add `puantajService` to the import in `routes.js` — it's already imported, no change needed.

- [ ] **Step 6: Add `getDB` import to `service.js` if not already present**

Check the top of `service.js` — add `import { getDB } from '../../shared/db/index.js'` if missing. (The existing code doesn't import `getDB` directly since all DB calls go through `queries.js`. The new `getYtdGross` needs it directly.)

Add after the existing import line:
```js
import { getDB } from '../../shared/db/index.js'
```

- [ ] **Step 7: Run all tests**

```bash
cd backend && npx vitest run src/modules/shifts/shifts.test.js --reporter=verbose 2>&1 | tail -30
```
Expected: all existing tests PASS + all new puantaj tests PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/shifts/queries.js backend/src/modules/shifts/service.js backend/src/modules/shifts/routes.js backend/src/modules/shifts/shifts.test.js
git commit -m "feat: enhanced puantaj endpoint — progressive tax, SGK, employer cost, YTD"
```

---

## Task 4: CSV export endpoint

**Important:** This route must be registered BEFORE `GET /puantaj/:staffId/days` in `routes.js` to prevent Express treating `export` as a `staffId` parameter.

**Files:**
- Modify: `backend/src/modules/shifts/queries.js` (add `getPuantajCsv`)
- Modify: `backend/src/modules/shifts/service.js` (add `puantajCsvService`)
- Modify: `backend/src/modules/shifts/routes.js` (add route BEFORE day-breakdown route)
- Modify: `backend/src/modules/shifts/shifts.test.js` (add CSV endpoint tests)

- [ ] **Step 1: Write failing test**

```js
describe('GET /shifts/puantaj/export/csv', () => {
  it('returns 400 without month', async () => {
    const res = await request(app)
      .get('/api/shifts/puantaj/export/csv')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(400)
  })

  it('returns CSV with correct content-type', async () => {
    const res = await request(app)
      .get('/api/shifts/puantaj/export/csv?month=2026-03')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/csv/)
    expect(res.headers['content-disposition']).toMatch(/puantaj-2026-03\.csv/)
  })

  it('CSV starts with UTF-8 BOM and correct header', async () => {
    const res = await request(app)
      .get('/api/shifts/puantaj/export/csv?month=2026-03')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(res.status).toBe(200)
    // BOM: \uFEFF
    expect(res.text.startsWith('\uFEFF')).toBe(true)
    const firstLine = res.text.replace('\uFEFF', '').split('\n')[0]
    expect(firstLine).toContain('TC No')
    expect(firstLine).toContain('Ad Soyad')
    expect(firstLine).toContain('Brüt')
    expect(firstLine).toContain('Net')
  })
})
```

- [ ] **Step 2: Run tests — verify they FAIL**

```bash
cd backend && npx vitest run src/modules/shifts/shifts.test.js -t "CSV" 2>&1 | tail -10
```
Expected: FAIL (route not yet defined).

- [ ] **Step 3: Add `puantajCsvService` to `service.js`**

Add after `puantajService`:

```js
export function puantajCsvService(month, deptId) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    throw Object.assign(new Error('month parametresi YYYY-MM formatında gereklidir'), { statusCode: 400 })
  }
  const rows = puantajService(month, deptId)

  const headers = [
    'TC No', 'Ad Soyad', 'Departman',
    'İş Günü', 'Çalıştı', 'İzin(Yıllık)', 'İzin(Acil)', 'İzin(Hastalık)', 'İzin(Diğer)',
    'Devamsız', 'Mesai(s)',
    'Brüt', 'SGK İşçi', 'İşsizlik İşçi', 'Gelir Vergisi', 'Damga Vergisi', 'Net',
    'İşveren SGK', 'İşveren İşsizlik', 'Toplam Maliyet',
  ]

  const escape = (v) => {
    const s = v == null ? '—' : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }

  const lines = [
    '\uFEFF' + headers.join(','),
    ...rows.map(r => [
      r.tc_no || '—',
      r.full_name,
      r.dept_name || '—',
      r.work_days_in_month,
      r.worked_days,
      r.annual_leave_days,
      r.emergency_leave_days,
      r.sick_leave_days,
      r.other_leave_days,
      r.absent_days,
      r.overtime_hours,
      r.gross,
      r.ssi_worker,
      r.unemployment_worker,
      r.income_tax,
      r.stamp_tax,
      r.net,
      r.ssi_employer,
      r.unemployment_employer,
      r.employer_total_cost,
    ].map(escape).join(',')),
  ]

  return lines.join('\r\n')
}
```

- [ ] **Step 4: Add CSV route to `routes.js` — BEFORE the `:staffId` routes section**

Find the existing puantaj route block and add the CSV route IMMEDIATELY after the existing `GET /puantaj` route and BEFORE any new `:staffId` routes:

```js
// ── Puantaj CSV Export (must be before /:staffId routes) ──
shiftsRouter.get('/puantaj/export/csv', ...allStaff, (req, res) => {
  try {
    const { month, dept_id } = req.query
    if (!month) return res.status(400).json({ error: 'month parametresi YYYY-MM formatında gereklidir' })
    const csv = puantajCsvService(month, dept_id || null)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="puantaj-${month}.csv"`)
    res.send(csv)
  } catch (e) {
    res.status(e.statusCode || 400).json({ error: e.message })
  }
})
```

Also add `puantajCsvService` to the import in `routes.js`:
```js
import {
  // ... existing imports ...
  puantajCsvService,
  // ...
} from './service.js'
```

- [ ] **Step 5: Run tests**

```bash
cd backend && npx vitest run src/modules/shifts/shifts.test.js 2>&1 | tail -20
```
Expected: CSV tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/shifts/queries.js backend/src/modules/shifts/service.js backend/src/modules/shifts/routes.js backend/src/modules/shifts/shifts.test.js
git commit -m "feat: puantaj CSV export endpoint with UTF-8 BOM"
```

---

## Task 5: Day breakdown endpoint — `GET /puantaj/:staffId/days`

**Important:** This route is registered AFTER the CSV route.

**Files:**
- Modify: `backend/src/modules/shifts/queries.js` (add `getStaffDayBreakdown`)
- Modify: `backend/src/modules/shifts/service.js` (add `staffDayBreakdownService`)
- Modify: `backend/src/modules/shifts/routes.js` (add route AFTER CSV route)
- Modify: `backend/src/modules/shifts/shifts.test.js` (add tests)

- [ ] **Step 1: Write failing tests**

```js
describe('GET /shifts/puantaj/:staffId/days', () => {
  let existingStaffId

  beforeAll(async () => {
    const staffRes = await request(app).get('/api/shifts/staff').set('Authorization', `Bearer ${shiftToken}`)
    existingStaffId = staffRes.body[0]?.id
  })

  it('returns 400 without month', async () => {
    const res = await request(app)
      .get(`/api/shifts/puantaj/${existingStaffId}/days`)
      .set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(400)
  })

  it('returns 400 for non-numeric staffId', async () => {
    const res = await request(app)
      .get('/api/shifts/puantaj/notanumber/days?month=2026-03')
      .set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(400)
  })

  it('returns array with one entry per day of the month', async () => {
    if (!existingStaffId) return
    const res = await request(app)
      .get(`/api/shifts/puantaj/${existingStaffId}/days?month=2026-03`)
      .set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    // March 2026 has 31 days
    expect(res.body.length).toBe(31)
  })

  it('each entry has date, day_of_week, and status', async () => {
    if (!existingStaffId) return
    const res = await request(app)
      .get(`/api/shifts/puantaj/${existingStaffId}/days?month=2026-03`)
      .set('Authorization', `Bearer ${shiftToken}`)
    expect(res.status).toBe(200)
    res.body.forEach(entry => {
      expect(entry).toHaveProperty('date')
      expect(entry).toHaveProperty('day_of_week')
      expect(entry).toHaveProperty('status')
      expect(['worked','absent','on_leave','overtime','scheduled','sunday','no_record']).toContain(entry.status)
    })
  })

  it('Sundays have status sunday', async () => {
    if (!existingStaffId) return
    const res = await request(app)
      .get(`/api/shifts/puantaj/${existingStaffId}/days?month=2026-03`)
      .set('Authorization', `Bearer ${shiftToken}`)
    // March 1 2026 is a Sunday (day_of_week=0)
    const march1 = res.body.find(e => e.date === '2026-03-01')
    expect(march1).toBeDefined()
    expect(march1.status).toBe('sunday')
  })
})
```

- [ ] **Step 2: Run tests — verify they FAIL**

```bash
cd backend && npx vitest run src/modules/shifts/shifts.test.js -t "days" 2>&1 | tail -10
```

- [ ] **Step 3: Add `getStaffDayBreakdown` to `queries.js`**

Add at the bottom of `queries.js`:

```js
export function getStaffDayBreakdown(staffId, monthStart, monthEnd) {
  const db = getDB()
  return db.prepare(`
    SELECT
      ss.work_date as date,
      ss.status,
      sd.name as shift_name,
      sd.start_hour,
      sd.end_hour,
      lr.leave_type,
      ot.hours as overtime_hours
    FROM shift_schedule ss
    LEFT JOIN shift_definitions sd ON sd.id = ss.shift_def_id
    LEFT JOIN leave_requests lr ON lr.staff_id = ss.staff_id
      AND lr.status = 'approved'
      AND ss.work_date BETWEEN lr.start_date AND lr.end_date
    LEFT JOIN overtime_records ot ON ot.staff_id = ss.staff_id
      AND ot.work_date = ss.work_date
    WHERE ss.staff_id = ? AND ss.work_date BETWEEN ? AND ?
    ORDER BY ss.work_date
  `).all(staffId, monthStart, monthEnd)
}
```

- [ ] **Step 4: Add `staffDayBreakdownService` to `service.js`**

Add after `puantajCsvService`:

```js
export function staffDayBreakdownService(staffId, month) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    throw Object.assign(new Error('month parametresi YYYY-MM formatında gereklidir'), { statusCode: 400 })
  }
  if (!staffId || isNaN(Number(staffId))) {
    throw Object.assign(new Error('staffId sayısal olmalıdır'), { statusCode: 400 })
  }
  const [year, mon] = month.split('-').map(Number)
  const monthStart = `${year}-${String(mon).padStart(2, '0')}-01`
  const lastDay = new Date(year, mon, 0).getDate()
  const monthEnd = `${year}-${String(mon).padStart(2, '0')}-${lastDay}`

  // DB records for days that have schedule entries
  const dbRows = getStaffDayBreakdown(Number(staffId), monthStart, monthEnd)
  const dbMap = {}
  dbRows.forEach(r => { dbMap[r.date] = r })

  // Build full month array
  const result = []
  for (let d = 1; d <= lastDay; d++) {
    const date = `${year}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const dow = new Date(year, mon - 1, d).getDay() // 0=Sunday
    if (dow === 0) {
      result.push({ date, day_of_week: 0, status: 'sunday' })
      continue
    }
    const row = dbMap[date]
    if (!row) {
      result.push({ date, day_of_week: dow, status: 'no_record' })
      continue
    }
    const entry = { date, day_of_week: dow, status: row.status }
    if (row.shift_name) { entry.shift_name = row.shift_name; entry.start_hour = row.start_hour; entry.end_hour = row.end_hour }
    if (row.leave_type) entry.leave_type = row.leave_type
    if (row.overtime_hours) entry.overtime_hours = row.overtime_hours
    result.push(entry)
  }
  return result
}
```

Also add `getStaffDayBreakdown` to the imports at the top of `service.js`:
```js
import {
  // ... existing imports ...
  getStaffDayBreakdown,
} from './queries.js'
```

- [ ] **Step 5: Add route to `routes.js` — AFTER the CSV route**

Add immediately after the CSV route:

```js
// ── Puantaj day breakdown (after CSV route to avoid staffId='export') ──
shiftsRouter.get('/puantaj/:staffId/days', ...allStaff, (req, res) => {
  try {
    res.json(staffDayBreakdownService(req.params.staffId, req.query.month))
  } catch (e) {
    res.status(e.statusCode || 400).json({ error: e.message })
  }
})
```

Also add `staffDayBreakdownService` to the import in `routes.js`.

- [ ] **Step 6: Run ALL tests**

```bash
cd backend && npx vitest run src/modules/shifts/shifts.test.js --reporter=verbose 2>&1 | tail -40
```
Expected: ALL tests PASS. Note: `beforeAll` in the new describe block needs `async` — verify no setup issues.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/shifts/queries.js backend/src/modules/shifts/service.js backend/src/modules/shifts/routes.js backend/src/modules/shifts/shifts.test.js
git commit -m "feat: puantaj day breakdown endpoint with leave type and overtime"
```

---

## Task 6: Final test run + verify no regressions

- [ ] **Step 1: Run all backend tests**

```bash
cd backend && npx vitest run 2>&1 | tail -20
```
Expected: all existing tests PASS, no regressions.

- [ ] **Step 2: Smoke test the endpoints manually (optional)**

```bash
# Start dev server in background, then:
curl -s -X POST http://localhost:3001/api/auth/login -H "Content-Type: application/json" -d '{"username":"mudur","password":"admin123"}' | jq .token
# Use the token:
curl -s "http://localhost:3001/api/shifts/puantaj?month=2026-03" -H "Authorization: Bearer <token>" | jq '.[0] | {full_name, gross, net, income_tax, ytd_gross}'
curl -s "http://localhost:3001/api/shifts/puantaj/export/csv?month=2026-03" -H "Authorization: Bearer <token>" | head -3
```

- [ ] **Step 3: Commit if any fixes were needed**

```bash
git add -A && git commit -m "fix: B1 final adjustments"
```
