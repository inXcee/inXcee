# Puantaj Pro B2 — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `PuantajTab` in `ShiftsPage.jsx` with 3 view modes (LIST/CALENDAR/SUMMARY), a Bordro Detay BottomSheet with 3 tabs, and printable bordro slip.

**Architecture:** `PuantajTab` is replaced in-place inside `ShiftsPage.jsx` (the file is already large; no split needed). The existing `BottomSheet` component (already in `ShiftsPage.jsx` from the staff-detail-panel sprint) is reused for the bordro detail panel. All styling uses `var(--*)` CSS variables. A `COMPANY_NAME` constant is hardcoded in the component.

**Tech Stack:** React 18, @tanstack/react-query (`useQuery`), CSS variables, `createPortal` (already imported)

**Prerequisite:** B1 backend must be deployed — the enhanced `GET /shifts/puantaj` must return the new financial fields (`gross`, `net`, `income_tax`, etc.).

**Spec:** `docs/superpowers/specs/2026-03-24-puantaj-pro-design.md`

---

## File Map

| File | Change |
|---|---|
| `frontend/src/modules/shifts/ShiftsPage.jsx` | Replace `PuantajTab` function (~lines 3047–3377) with new implementation |
| `frontend/src/index.css` | Add `@media print` rules and `.bordro-slip` styles |

---

## Reading Before Starting

Before writing any code, read:
- Lines 3047–3380 of `frontend/src/modules/shifts/ShiftsPage.jsx` (current PuantajTab — understand what to replace)
- The `BottomSheet` component in `ShiftsPage.jsx` (grep for `function BottomSheet`) — reuse it
- `frontend/src/index.css` (understand existing CSS vars and animation classes)

---

## Task 1: View mode selector + LIST skeleton

Replace the existing `PuantajTab` with a skeleton that has the 3-mode selector and the enhanced list structure. No financial detail yet — just structure.

**Files:**
- Modify: `frontend/src/modules/shifts/ShiftsPage.jsx` (replace PuantajTab)

- [ ] **Step 1: Read current PuantajTab to understand what to replace**

Read `ShiftsPage.jsx` lines 3045–3380. Note:
- The function starts at line 3047
- It ends somewhere around line 3377 (before the nav items array)
- The current query key is `['puantaj', month, deptFilter]`

- [ ] **Step 2: Replace PuantajTab with new implementation**

Find the comment `//  PuantajTab — Monthly Timesheet / Payroll` and replace everything from there to the closing `}` of the PuantajTab function with:

```jsx
// ═══════════════════════════════════════════════════════════════════════════════
//  PuantajTab — Professional Payroll / Monthly Timesheet
// ═══════════════════════════════════════════════════════════════════════════════
const COMPANY_NAME = 'YYS Kampüs' // TODO: Şirket adını burada güncelle

function PuantajTab({ departments }) {
  const today = new Date()
  const [month, setMonth] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`)
  const [deptFilter, setDeptFilter] = useState('')
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState('list') // 'list' | 'calendar' | 'summary'
  const [showEmployer, setShowEmployer] = useState(false)
  const [selectedRow, setSelectedRow] = useState(null) // row object for bordro detail
  const [sortBy, setSortBy] = useState('name')

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['puantaj', month, deptFilter],
    queryFn: () => {
      const params = { month }
      if (deptFilter) params.dept_id = deptFilter
      return api.get('/shifts/puantaj', { params }).then(r => r.data)
    },
  })

  const [y, m] = month.split('-').map(Number)

  const formatMoney = (val) => {
    if (val == null || val === 0) return '—'
    return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val) + ' ₺'
  }

  const filtered = useMemo(() => {
    let list = rows
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(r => r.full_name?.toLowerCase().includes(q) || r.dept_name?.toLowerCase().includes(q))
    }
    return [...list].sort((a, b) => {
      if (sortBy === 'worked') return (b.worked_days || 0) - (a.worked_days || 0)
      if (sortBy === 'absent') return (b.absent_days || 0) - (a.absent_days || 0)
      if (sortBy === 'net') return (b.net || 0) - (a.net || 0)
      return (a.full_name || '').localeCompare(b.full_name || '', 'tr')
    })
  }, [rows, search, sortBy])

  const totals = useMemo(() => filtered.reduce((acc, r) => ({
    worked: acc.worked + (r.worked_days || 0),
    leave: acc.leave + (r.leave_days || 0),
    absent: acc.absent + (r.absent_days || 0),
    overtime_hours: acc.overtime_hours + (r.overtime_hours || 0),
    gross: acc.gross + (r.gross || 0),
    net: acc.net + (r.net || 0),
    employer_total_cost: acc.employer_total_cost + (r.employer_total_cost || 0),
  }), { worked: 0, leave: 0, absent: 0, overtime_hours: 0, gross: 0, net: 0, employer_total_cost: 0 }),
  [filtered])

  const monthLabel = new Date(y, m - 1, 1).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }).toUpperCase()

  const prevMonth = () => {
    const d = new Date(y, m - 2, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const nextMonth = () => {
    const d = new Date(y, m, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const downloadCsv = async () => {
    try {
      const params = { month }
      if (deptFilter) params.dept_id = deptFilter
      const res = await api.get('/shifts/puantaj/export/csv', { params, responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `puantaj-${month}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('CSV indirme hatası', e)
    }
  }

  return (
    <div className="fade-up">
      {/* Top bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
        <button className="btn btn-ghost btn-sm" onClick={prevMonth}>←</button>
        <span style={{ fontFamily: 'var(--display)', fontSize: '14px', letterSpacing: '1px' }}>{monthLabel}</span>
        <button className="btn btn-ghost btn-sm" onClick={nextMonth}>→</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setMonth(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`)}>Bu Ay</button>

        <select className="form-select" value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
          style={{ width: 'auto', minWidth: '150px', fontSize: '11px', padding: '5px 11px' }}>
          <option value="">Tüm Departmanlar</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <input className="form-input" placeholder="Ara..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ width: '150px', fontSize: '11px', padding: '5px 11px' }} />

        {/* View mode */}
        <div style={{ display: 'flex', gap: '2px', background: 'var(--surface2)', borderRadius: '8px', padding: '2px', border: '1px solid var(--border)' }}>
          {[['list','📋 LİSTE'],['calendar','📅 TAKVİM'],['summary','🏢 ÖZET']].map(([id, label]) => (
            <button key={id} onClick={() => setViewMode(id)}
              style={{
                padding: '4px 10px', borderRadius: '6px', fontSize: '10px', fontFamily: 'var(--mono)',
                letterSpacing: '0.5px', border: 'none', cursor: 'pointer',
                background: viewMode === id ? 'var(--accent)' : 'transparent',
                color: viewMode === id ? '#000' : 'var(--text3)',
              }}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowEmployer(v => !v)}
            style={{ fontSize: '10px' }}>
            💼 {showEmployer ? 'Maliyet Gizle' : 'Maliyet Göster'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={downloadCsv} style={{ fontSize: '10px' }}>
            ⬇ CSV İndir
          </button>
        </div>
      </div>

      {/* Mode content */}
      {viewMode === 'list' && (
        <PuantajListView
          filtered={filtered} totals={totals} isLoading={isLoading}
          month={month} monthLabel={monthLabel}
          showEmployer={showEmployer} sortBy={sortBy} setSortBy={setSortBy}
          formatMoney={formatMoney} onRowClick={setSelectedRow}
        />
      )}
      {viewMode === 'calendar' && (
        <PuantajCalendarView filtered={filtered} month={month} y={y} m={m} isLoading={isLoading} />
      )}
      {viewMode === 'summary' && (
        <PuantajSummaryView filtered={filtered} formatMoney={formatMoney} />
      )}

      {/* Bordro detail bottom sheet */}
      {selectedRow && (
        <BordroDetailSheet
          row={selectedRow} month={month} monthLabel={monthLabel}
          formatMoney={formatMoney}
          onClose={() => setSelectedRow(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify no syntax errors**

```bash
cd frontend && npm run build 2>&1 | tail -20
```
Expected: build succeeds (the sub-components don't exist yet, so there will be errors — that's OK at this stage if they're "not defined" errors. If there are parse/syntax errors, fix them first).

Actually: stop at syntax errors only. "PuantajListView is not defined" is expected and acceptable.

- [ ] **Step 4: Commit skeleton**

```bash
git add frontend/src/modules/shifts/ShiftsPage.jsx
git commit -m "feat: PuantajTab skeleton — 3-mode selector, CSV download, bordro sheet placeholder"
```

---

## Task 2: LIST view component

**Files:**
- Modify: `frontend/src/modules/shifts/ShiftsPage.jsx` (add `PuantajListView` function before `PuantajTab`)

- [ ] **Step 1: Add `PuantajListView` function before `PuantajTab`**

Insert this function right before the `// PuantajTab` comment line:

```jsx
function PuantajListView({ filtered, totals, isLoading, month, monthLabel, showEmployer, sortBy, setSortBy, formatMoney, onRowClick }) {
  const SORTS = [{ id: 'name', label: 'AD' }, { id: 'worked', label: 'ÇALIŞTI' }, { id: 'absent', label: 'DEVAMSIZ' }, { id: 'net', label: 'NET' }]

  if (isLoading) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text3)' }}>Yükleniyor...</div>
  if (filtered.length === 0) return (
    <div className="empty-state">
      <div className="empty-icon">📋</div>
      <div className="empty-title">KAYIT YOK</div>
      <div className="empty-desc">Bu ay için puantaj verisi bulunamadı.</div>
    </div>
  )

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">PUANTAJ TABLOSU</div>
          <div className="panel-subtitle">{filtered.length} personel · {monthLabel}</div>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {SORTS.map(s => (
            <button key={s.id} className={`filter-chip ${sortBy === s.id ? 'active' : ''}`}
              onClick={() => setSortBy(s.id)} style={{ fontSize: '9px', padding: '3px 8px' }}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="panel-body" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="data-table" style={{ fontSize: '11px' }}>
          <thead>
            <tr>
              <th style={{ position: 'sticky', left: 0, background: 'var(--surface2)', zIndex: 2, minWidth: '140px' }}>AD SOYAD</th>
              <th>DEPT</th>
              <th style={{ textAlign: 'center' }}>DEVAM %</th>
              <th style={{ textAlign: 'center', color: 'var(--green)' }}>İŞ</th>
              <th style={{ textAlign: 'center', color: 'var(--purple)' }}>İZİN TÜRÜ</th>
              <th style={{ textAlign: 'center', color: 'var(--red)' }}>YOK</th>
              <th style={{ textAlign: 'center', color: 'var(--accent)' }}>MESAİ</th>
              <th style={{ textAlign: 'right' }}>BRÜT</th>
              <th style={{ textAlign: 'right' }}>KESİNTİ</th>
              <th style={{ textAlign: 'right', color: 'var(--green)' }}>NET</th>
              {showEmployer && <th style={{ textAlign: 'right', color: 'var(--teal)' }}>İŞVEREN MAL.</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} onClick={() => onRowClick(r)}
                style={{ cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}>
                <td style={{ position: 'sticky', left: 0, background: 'var(--surface)', fontWeight: '600', zIndex: 1 }}>
                  {r.full_name}
                  {r.position && <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '1px' }}>{r.position}</div>}
                </td>
                <td>
                  <span style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px', background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                    {r.dept_name || '—'}
                  </span>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                    <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: 'var(--surface3)', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, r.attend_rate || 0)}%`, height: '100%', background: (r.attend_rate || 0) >= 80 ? 'var(--green)' : (r.attend_rate || 0) >= 50 ? 'var(--accent)' : 'var(--red)' }} />
                    </div>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>%{r.attend_rate || 0}</span>
                  </div>
                </td>
                <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', color: 'var(--green)' }}>{r.worked_days || 0}</td>
                <td style={{ textAlign: 'center' }}>
                  <div style={{ display: 'flex', gap: '2px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    {(r.annual_leave_days || 0) > 0 && <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: 'rgba(59,130,246,.15)', color: 'var(--blue)' }}>Y:{r.annual_leave_days}</span>}
                    {(r.sick_leave_days || 0) > 0 && <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: 'rgba(239,68,68,.15)', color: 'var(--red)' }}>H:{r.sick_leave_days}</span>}
                    {(r.emergency_leave_days || 0) > 0 && <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: 'rgba(234,179,8,.15)', color: 'var(--accent)' }}>A:{r.emergency_leave_days}</span>}
                    {(r.annual_leave_days || 0) === 0 && (r.sick_leave_days || 0) === 0 && (r.emergency_leave_days || 0) === 0 && <span style={{ color: 'var(--text3)', fontSize: '10px' }}>—</span>}
                  </div>
                </td>
                <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', color: 'var(--red)' }}>{r.absent_days || 0}</td>
                <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{r.overtime_hours ? `${r.overtime_hours}s` : '—'}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: '11px' }}>{formatMoney(r.gross)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--red)' }}
                  title={r.total_deductions ? `SGK: ${r.ssi_worker} ₺ | GV: ${r.income_tax} ₺ | DV: ${r.stamp_tax} ₺` : ''}>
                  {formatMoney(r.total_deductions)}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: '12px', fontWeight: '700', color: 'var(--green)' }}>{formatMoney(r.net)}</td>
                {showEmployer && <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--teal)' }}>{formatMoney(r.employer_total_cost)}</td>}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: '700', borderTop: '2px solid var(--border)', background: 'var(--surface2)' }}>
              <td colSpan={showEmployer ? 10 : 9} style={{ paddingLeft: '12px', fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px' }}>
                TOPLAM — {filtered.length} kişi
              </td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--green)', fontWeight: '700' }}>{formatMoney(totals.net)}</td>
              {showEmployer && <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--teal)' }}>{formatMoney(totals.employer_total_cost)}</td>}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build check**

```bash
cd frontend && npm run build 2>&1 | grep -E "error|Error" | head -10
```
Expected: no errors for `PuantajListView` (still may have errors for Calendar, Summary, BordroDetailSheet).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/modules/shifts/ShiftsPage.jsx
git commit -m "feat: PuantajTab LIST view with leave-type chips, deduction tooltip, employer toggle"
```

---

## Task 3: ÖZET (summary) + TAKVİM (calendar) views

**Files:**
- Modify: `frontend/src/modules/shifts/ShiftsPage.jsx`

- [ ] **Step 1: Add `PuantajSummaryView` before `PuantajTab`**

```jsx
function PuantajSummaryView({ filtered, formatMoney }) {
  const byDept = useMemo(() => {
    const map = {}
    filtered.forEach(r => {
      const key = r.dept_name || 'Departmansız'
      if (!map[key]) map[key] = { name: key, staff: 0, worked: 0, absent: 0, overtime: 0, leave: 0, gross: 0, net: 0, employer: 0 }
      const d = map[key]
      d.staff++
      d.worked += r.worked_days || 0
      d.absent += r.absent_days || 0
      d.overtime += r.overtime_hours || 0
      d.leave += r.leave_days || 0
      d.gross += r.gross || 0
      d.net += r.net || 0
      d.employer += r.employer_total_cost || 0
    })
    return Object.values(map)
  }, [filtered])

  if (byDept.length === 0) return (
    <div className="empty-state">
      <div className="empty-icon">🏢</div>
      <div className="empty-title">KAYIT YOK</div>
    </div>
  )

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
      {byDept.map(d => (
        <div key={d.name} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: '13px', letterSpacing: '1px' }}>{d.name}</div>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', background: 'var(--surface2)', padding: '2px 6px', borderRadius: '4px' }}>{d.staff} kişi</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
            {[
              ['Çalışılan', `${d.worked} gün`, 'var(--green)'],
              ['Devamsız', `${d.absent} gün`, 'var(--red)'],
              ['Mesai', `${d.overtime}s`, 'var(--accent)'],
              ['İzin', `${d.leave} gün`, 'var(--purple)'],
            ].map(([label, val, color]) => (
              <div key={label} style={{ background: 'var(--surface2)', borderRadius: '6px', padding: '6px 8px' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)' }}>{label}</div>
                <div style={{ fontFamily: 'var(--display)', fontSize: '14px', color, marginTop: '2px' }}>{val}</div>
              </div>
            ))}
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
              <span style={{ color: 'var(--text3)' }}>Brüt Toplam</span>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: '600' }}>{formatMoney(d.gross)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
              <span style={{ color: 'var(--text3)' }}>Net Toplam</span>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: '700', color: 'var(--green)' }}>{formatMoney(d.net)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
              <span style={{ color: 'var(--text3)' }}>İşveren Maliyeti</span>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--teal)' }}>{formatMoney(d.employer)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Add `PuantajCalendarView` before `PuantajTab`**

```jsx
function PuantajCalendarView({ filtered, month, y, m, isLoading }) {
  const queryClient = useQueryClient()
  const [dayData, setDayData] = useState({}) // staffId → days array

  const daysInMonth = new Date(y, m, 0).getDate()
  const dayNumbers = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  // When calendar view loads, lazy-fetch day breakdowns for all staff
  useEffect(() => {
    filtered.forEach(r => {
      if (dayData[r.id]) return // already loaded
      api.get(`/shifts/puantaj/${r.id}/days`, { params: { month } })
        .then(res => setDayData(prev => ({ ...prev, [r.id]: res.data })))
        .catch(() => {})
    })
  }, [filtered, month]) // eslint-disable-line react-hooks/exhaustive-deps

  const STATUS_COLORS = {
    worked: { bg: 'var(--green)', text: '#fff' },
    absent: { bg: 'transparent', text: 'var(--red)' },
    on_leave: { bg: 'rgba(167,139,250,.2)', text: 'var(--purple)' },
    overtime: { bg: 'rgba(240,165,0,.2)', text: 'var(--accent)' },
    scheduled: { bg: 'var(--surface3)', text: 'var(--text3)' },
    sunday: { bg: 'transparent', text: 'var(--border)' },
    no_record: { bg: 'transparent', text: 'transparent' },
  }

  const STATUS_SYMBOL = { worked: '▓', absent: '✗', on_leave: 'İ', overtime: 'M', scheduled: '·', sunday: '', no_record: '' }

  // Sunday indices (day of week for day 1)
  const sundayDays = new Set(dayNumbers.filter(d => new Date(y, m - 1, d).getDay() === 0))

  if (isLoading) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text3)' }}>Yükleniyor...</div>

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: '10px', width: 'max-content' }}>
        <thead>
          <tr>
            <th style={{ position: 'sticky', left: 0, background: 'var(--surface)', zIndex: 2, minWidth: '140px', padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
              PERSONEL
            </th>
            {dayNumbers.map(d => (
              <th key={d} style={{
                width: '24px', textAlign: 'center', padding: '4px 0',
                borderBottom: '1px solid var(--border)',
                color: sundayDays.has(d) ? 'var(--accent)' : 'var(--text3)',
                fontFamily: 'var(--mono)', fontSize: '9px',
              }}>{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map(r => {
            const days = dayData[r.id] || []
            const dayMap = {}
            days.forEach(d => { dayMap[d.date.split('-')[2]] = d })

            return (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ position: 'sticky', left: 0, background: 'var(--surface)', padding: '4px 8px', fontWeight: '500', zIndex: 1 }}>
                  <div>{r.full_name}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)' }}>{r.dept_name}</div>
                </td>
                {dayNumbers.map(d => {
                  const dayStr = String(d).padStart(2, '0')
                  const entry = dayMap[dayStr]
                  const status = entry?.status || (sundayDays.has(d) ? 'sunday' : 'no_record')
                  const c = STATUS_COLORS[status] || STATUS_COLORS.no_record
                  const sym = STATUS_SYMBOL[status] || ''
                  return (
                    <td key={d} title={entry?.shift_name || entry?.leave_type || status}
                      style={{
                        width: '24px', textAlign: 'center', padding: '2px 0',
                        background: c.bg, color: c.text,
                        fontSize: status === 'worked' ? '11px' : '12px',
                      }}>
                      {sym}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 3: Add `useQueryClient` to imports**

Find the React Query import line in ShiftsPage.jsx:
```js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
```
If `useQueryClient` is not already there, add it.

Also add `useEffect` to React imports if not present:
```js
import { useState, useEffect, useCallback, useMemo } from 'react'
```

- [ ] **Step 4: Build check**

```bash
cd frontend && npm run build 2>&1 | grep -E "^.*error" | head -10
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/shifts/ShiftsPage.jsx
git commit -m "feat: PuantajTab ÖZET and TAKVİM view modes"
```

---

## Task 4: Bordro Detay BottomSheet (3 tabs)

**Files:**
- Modify: `frontend/src/modules/shifts/ShiftsPage.jsx`

- [ ] **Step 1: Add `BordroDetailSheet` before `PuantajTab`**

```jsx
function BordroDetailSheet({ row, month, monthLabel, formatMoney, onClose }) {
  const [tab, setTab] = useState('hesap') // 'hesap' | 'gun' | 'ytd'

  const { data: days = [], isFetching: daysLoading } = useQuery({
    queryKey: ['puantaj-days', row.id, month],
    queryFn: () => api.get(`/shifts/puantaj/${row.id}/days`, { params: { month } }).then(r => r.data),
    enabled: tab === 'gun',
  })

  useEffect(() => {
    const onEsc = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [onClose])

  const TABS = [['hesap', '💰 HESAP'], ['gun', '📅 GÜN DÖKÜMÜ'], ['ytd', '📈 YIL']]

  const [y, m] = month.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()

  // Mini calendar grid helpers
  const firstDow = new Date(y, m - 1, 1).getDay() // 0=Sun
  const startPad = firstDow === 0 ? 6 : firstDow - 1 // make Mon=0

  const DAY_STATUS_STYLE = {
    worked:    { bg: 'var(--green)',            color: '#fff' },
    absent:    { bg: 'rgba(239,68,68,.15)',     color: 'var(--red)' },
    on_leave:  { bg: 'rgba(167,139,250,.15)',   color: 'var(--purple)' },
    overtime:  { bg: 'rgba(240,165,0,.15)',     color: 'var(--accent)' },
    scheduled: { bg: 'var(--surface3)',         color: 'var(--text3)' },
    sunday:    { bg: 'transparent',            color: 'var(--border)' },
    no_record: { bg: 'transparent',            color: 'transparent' },
  }

  return (
    <BottomSheet onClose={onClose}>
      {/* Dept color band */}
      <div style={{ height: '3px', background: 'var(--accent)', flexShrink: 0 }} />

      {/* Header */}
      <div style={{ padding: '14px 20px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '1px' }}>{row.full_name}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>
              {row.position || '—'} · {row.dept_name || '—'} · {monthLabel}
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, marginTop: '12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{
              flex: 1, padding: '8px 4px', border: 'none', background: 'transparent', cursor: 'pointer',
              fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '0.5px',
              color: tab === id ? 'var(--accent)' : 'var(--text3)',
              borderBottom: tab === id ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: '-1px',
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

        {/* HESAP PUSULASI */}
        {tab === 'hesap' && (
          <div>
            {/* Pay components */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '8px' }}>ÜCRET BİLEŞENLERİ</div>
              {[
                ['Temel Ücret', formatMoney(row.base_pay)],
                ['Ücretli İzin', formatMoney(row.leave_pay)],
                ['Fazla Mesai', formatMoney(row.overtime_pay)],
              ].map(([label, val]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: '12px' }}>
                  <span style={{ color: 'var(--text2)' }}>{label}</span>
                  <span style={{ fontFamily: 'var(--mono)' }}>{val}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontWeight: '700', fontSize: '13px' }}>
                <span>BRÜT TOPLAM</span>
                <span style={{ fontFamily: 'var(--mono)' }}>{formatMoney(row.gross)}</span>
              </div>
            </div>

            {/* Deductions */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '8px' }}>KESİNTİLER</div>
              {[
                ['SGK İşçi (%14)', formatMoney(row.ssi_worker)],
                ['İşsizlik İşçi (%1)', formatMoney(row.unemployment_worker)],
                ['Gelir Vergisi', formatMoney(row.income_tax)],
                ['Damga Vergisi (%0.759)', formatMoney(row.stamp_tax)],
              ].map(([label, val]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: '12px' }}>
                  <span style={{ color: 'var(--text2)' }}>{label}</span>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--red)' }}>−{val}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '12px', color: 'var(--text3)' }}>
                <span>TOPLAM KESİNTİ</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--red)' }}>−{formatMoney(row.total_deductions)}</span>
              </div>
            </div>

            {/* Net */}
            <div style={{ background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.2)', borderRadius: '10px', padding: '12px 16px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '1px', color: 'var(--text3)' }}>NET ELE GEÇEN</span>
              <span style={{ fontFamily: 'var(--display)', fontSize: '22px', color: 'var(--green)', letterSpacing: '1px' }}>{formatMoney(row.net)}</span>
            </div>

            {/* Employer cost */}
            <div style={{ background: 'var(--surface2)', borderRadius: '8px', padding: '10px 14px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '6px' }}>İŞVEREN MALİYETİ</div>
              {[
                ['SGK İşveren (%20.5)', formatMoney(row.ssi_employer)],
                ['İşsizlik İşveren (%2)', formatMoney(row.unemployment_employer)],
              ].map(([label, val]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '3px 0' }}>
                  <span style={{ color: 'var(--text3)' }}>{label}</span>
                  <span style={{ fontFamily: 'var(--mono)' }}>{val}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700', fontSize: '12px', marginTop: '4px', paddingTop: '6px', borderTop: '1px solid var(--border)' }}>
                <span>TOPLAM İŞVEREN MALİYETİ</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--teal)' }}>{formatMoney(row.employer_total_cost)}</span>
              </div>
            </div>

            {/* Print button */}
            <div style={{ marginTop: '16px', textAlign: 'center' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => window.print()} style={{ fontSize: '11px' }}>
                🖨 Bordro Fişi Yazdır
              </button>
            </div>

            {/* Hidden print slip */}
            <BordroSlip row={row} month={month} monthLabel={monthLabel} />
          </div>
        )}

        {/* GÜN DÖKÜMÜ */}
        {tab === 'gun' && (
          <div>
            {daysLoading ? (
              <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '20px' }}>Yükleniyor...</div>
            ) : (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '8px' }}>
                  {['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'].map(d => (
                    <div key={d} style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', padding: '2px 0' }}>{d}</div>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px' }}>
                  {Array.from({ length: startPad }, (_, i) => <div key={`pad-${i}`} />)}
                  {days.map((d, i) => {
                    if (d.status === 'sunday') return <div key={i} style={{ aspectRatio: '1', borderRadius: '4px' }} />
                    const s = DAY_STATUS_STYLE[d.status] || DAY_STATUS_STYLE.no_record
                    const dayNum = parseInt(d.date.split('-')[2])
                    return (
                      <div key={i} title={d.shift_name || d.leave_type || d.status}
                        style={{ aspectRatio: '1', borderRadius: '4px', background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontFamily: 'var(--mono)', color: s.color, border: '1px solid var(--border)' }}>
                        {dayNum}
                      </div>
                    )
                  })}
                </div>
                <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {[['worked','Çalıştı','var(--green)'],['absent','Devamsız','var(--red)'],['on_leave','İzin','var(--purple)'],['overtime','Mesai','var(--accent)']].map(([s,label,color]) => (
                    <span key={s} style={{ fontSize: '9px', display: 'flex', alignItems: 'center', gap: '3px', color: 'var(--text3)' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: color, display: 'inline-block' }} />
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* YIL BAZLARI */}
        {tab === 'ytd' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ background: 'var(--surface2)', borderRadius: '8px', padding: '12px 14px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '8px' }}>YILBAŞINDAN BU AYA</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text2)' }}>Kümülatif Brüt</span>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: '700' }}>{formatMoney(row.ytd_gross)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', color: 'var(--text2)' }}>Kümülatif Vergi</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--red)' }}>{formatMoney(row.ytd_tax)}</span>
              </div>
            </div>
            {/* Tax bracket bar */}
            <div style={{ background: 'var(--surface2)', borderRadius: '8px', padding: '12px 14px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '10px' }}>GELİR VERGİSİ DİLİMİ</div>
              {[
                [110_000, '%15'],
                [230_000, '%20'],
                [870_000, '%27'],
                [3_000_000, '%35'],
                [Infinity, '%40'],
              ].map(([limit, rate], i) => {
                const prev = [0, 110_000, 230_000, 870_000, 3_000_000][i]
                const ytd = row.ytd_gross || 0
                const inBracket = ytd > prev
                const current = ytd > prev && ytd <= (limit === Infinity ? Number.MAX_SAFE_INTEGER : limit)
                return (
                  <div key={rate} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', width: '28px', color: current ? 'var(--accent)' : 'var(--text3)' }}>{rate}</span>
                    <div style={{ flex: 1, height: '6px', borderRadius: '3px', background: 'var(--surface3)', overflow: 'hidden' }}>
                      {inBracket && (
                        <div style={{
                          height: '100%', borderRadius: '3px',
                          background: current ? 'var(--accent)' : 'var(--green)',
                          width: current ? `${Math.min(100, ((ytd - prev) / (Math.min(limit === Infinity ? ytd : limit, ytd) - prev || 1)) * 100)}%` : '100%',
                        }} />
                      )}
                    </div>
                    {current && <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--accent)' }}>← şu an</span>}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  )
}
```

- [ ] **Step 2: Build check**

```bash
cd frontend && npm run build 2>&1 | grep "error" | head -10
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/modules/shifts/ShiftsPage.jsx
git commit -m "feat: Bordro Detay BottomSheet — HESAP PUSULASI, GÜN DÖKÜMÜ, YIL BAZLARI tabs"
```

---

## Task 5: Bordro print slip + `@media print` CSS

**Files:**
- Modify: `frontend/src/modules/shifts/ShiftsPage.jsx` (add `BordroSlip` component)
- Modify: `frontend/src/index.css` (add print styles)

- [ ] **Step 1: Add `BordroSlip` component before `BordroDetailSheet`**

```jsx
function BordroSlip({ row, month, monthLabel }) {
  const [y] = month.split('-').map(Number)
  const maskTc = (tc) => tc ? `${tc.slice(0,3)}*****${tc.slice(-3)}` : '—'
  const fmt = (v) => v ? new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + ' ₺' : '0,00 ₺'

  return (
    <div className="bordro-slip">
      <div className="bordro-header">
        <div style={{ fontWeight: '700', fontSize: '14px' }}>{COMPANY_NAME}</div>
        <div style={{ textAlign: 'center', fontWeight: '700', fontSize: '14px' }}>ÜCRET BORDROSU</div>
        <div style={{ textAlign: 'right', fontSize: '12px' }}>Dönem: {monthLabel}</div>
      </div>
      <div className="bordro-divider" />
      <div className="bordro-info">
        <div><span>Ad Soyad:</span> <strong>{row.full_name?.toUpperCase()}</strong></div>
        <div><span>Sicil:</span> <strong>#{row.id}</strong></div>
        <div><span>Departman:</span> <strong>{(row.dept_name || '—').toUpperCase()}</strong></div>
        <div><span>TC:</span> <strong>{maskTc(row.tc_no)}</strong></div>
      </div>
      <div className="bordro-divider" />
      <div className="bordro-row">
        <span>DEVAM:</span>
        <span>İş Günü {row.work_days_in_month} │ Çalıştı {row.worked_days || 0} │ İzin {row.leave_days || 0} │ Devamsız {row.absent_days || 0}</span>
      </div>
      <div className="bordro-divider" />
      <div className="bordro-section-title">ÜCRET BİLEŞENLERİ</div>
      <div className="bordro-line"><span>Temel Ücret ({row.worked_days || 0} × {fmt(row.daily_rate)})</span><span>{fmt(row.base_pay)}</span></div>
      <div className="bordro-line"><span>Ücretli İzin ({(row.annual_leave_days || 0) + (row.emergency_leave_days || 0)} × {fmt(row.daily_rate)})</span><span>{fmt(row.leave_pay)}</span></div>
      <div className="bordro-line"><span>Fazla Mesai ({row.overtime_hours || 0}s × 1.5)</span><span>{fmt(row.overtime_pay)}</span></div>
      <div className="bordro-line bordro-total"><span>BRÜT TOPLAM</span><span>{fmt(row.gross)}</span></div>
      <div className="bordro-divider" />
      <div className="bordro-section-title">KESİNTİLER</div>
      <div className="bordro-line"><span>SGK İşçi (%14)</span><span>−{fmt(row.ssi_worker)}</span></div>
      <div className="bordro-line"><span>İşsizlik İşçi (%1)</span><span>−{fmt(row.unemployment_worker)}</span></div>
      <div className="bordro-line"><span>Gelir Vergisi</span><span>−{fmt(row.income_tax)}</span></div>
      <div className="bordro-line"><span>Damga Vergisi (%0.759)</span><span>−{fmt(row.stamp_tax)}</span></div>
      <div className="bordro-line bordro-total"><span>TOPLAM KESİNTİ</span><span>−{fmt(row.total_deductions)}</span></div>
      <div className="bordro-divider" />
      <div className="bordro-line bordro-net"><span>NET ELE GEÇEN:</span><span>{fmt(row.net)}</span></div>
      <div className="bordro-divider" />
      <div className="bordro-line" style={{ fontSize: '10px' }}>
        <span>İşveren SGK (%20.5): {fmt(row.ssi_employer)} │ İşveren İşsizlik: {fmt(row.unemployment_employer)}</span>
      </div>
      <div className="bordro-line bordro-total"><span>TOPLAM İŞVEREN MALİYETİ:</span><span>{fmt(row.employer_total_cost)}</span></div>
      <div className="bordro-divider" />
      <div className="bordro-footer">
        <span>İmza: _______________</span>
        <span>Tarih: ___/___/{y}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add print CSS to `frontend/src/index.css`**

Append at the very end of `index.css`:

```css
/* ── Bordro Print Slip ────────────────────────────────────────────────── */
.bordro-slip {
  /* Hidden on screen via visibility so print can override without display:none ancestor problem */
  visibility: hidden;
  position: absolute;
  pointer-events: none;
  font-family: 'Courier New', monospace;
  font-size: 11px;
  color: #000;
  background: #fff;
  padding: 20px;
  max-width: 600px;
  page-break-after: always;
}
.bordro-slip * { visibility: hidden; }
.bordro-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
.bordro-divider { border-top: 1px solid #000; margin: 6px 0; }
.bordro-info { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 16px; margin: 6px 0; }
.bordro-info span { color: #555; }
.bordro-section-title { font-weight: bold; font-size: 10px; letter-spacing: 1px; margin: 4px 0; }
.bordro-line { display: flex; justify-content: space-between; padding: 2px 0; }
.bordro-row { display: flex; gap: 8px; padding: 4px 0; font-size: 10px; }
.bordro-total { font-weight: bold; padding-top: 4px; }
.bordro-net { font-size: 14px; font-weight: bold; padding: 6px 0; }
.bordro-footer { display: flex; justify-content: space-between; padding-top: 12px; }

@media print {
  /* Use visibility pattern: hide everything, then show slip and its descendants.
     Avoids display:none ancestor problem — visibility:hidden preserves layout tree. */
  body * { visibility: hidden; }
  .bordro-slip,
  .bordro-slip * { visibility: visible; }
  .bordro-slip {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
  }
  @page { margin: 15mm; }
}
```

- [ ] **Step 3: Final build**

```bash
cd frontend && npm run build 2>&1 | tail -10
```
Expected: build SUCCEEDS, no errors.

- [ ] **Step 4: Full backend test run (sanity)**

```bash
cd backend && npx vitest run 2>&1 | tail -10
```
Expected: all tests PASS.

- [ ] **Step 5: Final commit**

```bash
git add frontend/src/modules/shifts/ShiftsPage.jsx frontend/src/index.css
git commit -m "feat: BordroSlip component + @media print styles for payroll printing"
```
