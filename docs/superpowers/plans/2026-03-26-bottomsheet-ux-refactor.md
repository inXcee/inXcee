# BottomSheet UX Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert 4 SidePanel/ModalOverlay usages to BottomSheet so Çizelge (VARDIYA ATA, HAFTA DOLDUR) and Personel (edit/new form) panels all slide up from the bottom, matching the existing Puantaj and StaffDetailPanel patterns.

**Architecture:** All changes are in a single file (`ShiftsPage.jsx`). Three new function components are inserted before their respective parent tabs: `CellAssignSheet`, `WeekFillSheet`, `StaffFormSheet`. The old SidePanel and ModalOverlay call sites are replaced with these components. No backend changes.

**Tech Stack:** React 18, @tanstack/react-query, CSS variables, existing `BottomSheet` component (line 145 of ShiftsPage.jsx)

**Spec:** `docs/superpowers/specs/2026-03-26-bottomsheet-ux-refactor-design.md`

---

## File Map

| File | Change |
|---|---|
| `frontend/src/modules/shifts/ShiftsPage.jsx` | Add 3 new components; replace 2 SidePanel usages + 1 ModalOverlay usage; clean up `rect` from 2 setter call sites |

---

## Reading Before Starting

Before writing any code, verify the current state:

```bash
grep -n "setCellPopover\|setWeekFillPopover\|SidePanel\|showForm && " frontend/src/modules/shifts/ShiftsPage.jsx | head -30
```

Key line numbers (verify these match — file may have shifted):
- `BottomSheet` component: ~line 145
- `setCellPopover(` open call: ~line 1759
- `setWeekFillPopover(` open call (weekly): ~line 1767
- `setWeekFillPopover(` open call (daily/DailyView): ~line 2561
- `cellPopover &&` SidePanel render: ~line 2213
- `weekFillPopover &&` SidePanel render: ~line 2275
- `showForm &&` ModalOverlay render: ~line 1207

---

## Task 1: CellAssignSheet — VARDIYA ATA as BottomSheet

**Files:**
- Modify: `frontend/src/modules/shifts/ShiftsPage.jsx`

### Step 1: Add `CellAssignSheet` function before the `ScheduleTab` comment

Find the line with `// ═══` comment immediately before `function ScheduleTab`. Insert this function just above that comment:

```jsx
function CellAssignSheet({ cellPopover, setCellPopover, shiftDefs, assignCell, deleteShift, formatDate, shortDay, shiftColor }) {
  const [error, setError] = useState(null)

  useEffect(() => {
    const onEsc = e => { if (e.key === 'Escape') setCellPopover(null) }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [setCellPopover])

  return (
    <BottomSheet onClose={() => setCellPopover(null)}>
      <div style={{ padding: '0 20px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: '16px', letterSpacing: '1px' }}>📅 VARDIYA ATA</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>
              {cellPopover.personName} · {formatDate(cellPopover.date)} {shortDay(cellPopover.date)}
            </div>
          </div>
          <button onClick={() => setCellPopover(null)} className="btn btn-ghost btn-sm">✕</button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '4px' }}>VARDIYA SEÇ</div>
        {shiftDefs.map(s => {
          const isActive = cellPopover.existing?.shift_def_id === s.id && cellPopover.existing?.status !== 'on_leave'
          const sc = shiftColor(s.color_class)
          return (
            <button key={s.id}
              onClick={() => { setError(null); assignCell.mutate({ staffId: cellPopover.staffId, deptId: cellPopover.deptId, shiftDefId: s.id, date: cellPopover.date, status: 'scheduled' }, { onError: () => setError('Vardiya atanamadı. Tekrar deneyin.') }) }}
              disabled={assignCell.isPending}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: '8px', textAlign: 'left',
                fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--sans)',
                border: `2px solid ${isActive ? sc.text : 'var(--border)'}`,
                background: isActive ? sc.bg : 'var(--surface2)',
                color: isActive ? sc.text : 'var(--text2)',
              }}>
              <span style={{ fontWeight: 600 }}>{s.name}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', marginLeft: '8px', opacity: .6 }}>
                {s.start_hour}:00–{s.end_hour === 24 ? '00' : s.end_hour}:00
              </span>
              {isActive && <span style={{ float: 'right', fontSize: '10px' }}>✓ Aktif</span>}
            </button>
          )
        })}
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          <button
            onClick={() => { setError(null); assignCell.mutate({ staffId: cellPopover.staffId, deptId: cellPopover.deptId, shiftDefId: null, date: cellPopover.date, status: 'on_leave' }, { onError: () => setError('İşlem başarısız. Tekrar deneyin.') }) }}
            disabled={assignCell.isPending}
            style={{
              flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer',
              border: `2px solid ${cellPopover.existing?.status === 'on_leave' ? 'var(--teal)' : 'var(--border)'}`,
              background: cellPopover.existing?.status === 'on_leave' ? 'rgba(26,188,156,.12)' : 'var(--surface2)',
              color: cellPopover.existing?.status === 'on_leave' ? 'var(--teal)' : 'var(--text2)',
              fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 600,
            }}>
            İZİN {cellPopover.existing?.status === 'on_leave' && '✓'}
          </button>
          {cellPopover.existing && (
            <button
              onClick={() => { setError(null); deleteShift.mutate({ staffId: cellPopover.staffId, date: cellPopover.date }, { onError: () => setError('Silme başarısız. Tekrar deneyin.') }) }}
              disabled={deleteShift.isPending}
              style={{
                flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer',
                border: '2px solid var(--border)', background: 'var(--surface2)',
                color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 600,
              }}>
              KALDIR
            </button>
          )}
        </div>
        {error && <div style={{ color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: '10px', marginTop: '4px' }}>{error}</div>}
      </div>
    </BottomSheet>
  )
}
```

### Step 2: Replace SidePanel render with `CellAssignSheet`

Find (~line 2213):
```jsx
{cellPopover && (
  <SidePanel
    title="VARDIYA ATA"
    subtitle={`${cellPopover.personName} · ${formatDate(cellPopover.date)} ${shortDay(cellPopover.date)}`}
    icon="&#128197;"
    onClose={() => setCellPopover(null)}
    width={300}
    anchorRect={cellPopover.rect}
  >
```

Replace the entire `{cellPopover && ( <SidePanel ...> ... </SidePanel> )}` block with:

```jsx
{cellPopover && (
  <CellAssignSheet
    cellPopover={cellPopover}
    setCellPopover={setCellPopover}
    shiftDefs={shiftDefs}
    assignCell={assignCell}
    deleteShift={deleteShift}
    formatDate={formatDate}
    shortDay={shortDay}
    shiftColor={shiftColor}
  />
)}
```

### Step 3: Remove `rect` from `setCellPopover` opener

Find (~line 1759):
```js
setCellPopover({ staffId: person.id, deptId: person.dept_id, date, personName: person.full_name, rect, existing })
```

Replace with:
```js
setCellPopover({ staffId: person.id, deptId: person.dept_id, date, personName: person.full_name, existing })
```

### Step 4: Build check

```bash
cd frontend && npm run build 2>&1 | grep -E "error|Error" | grep -v "node_modules" | head -10
```

Expected: no errors.

### Step 5: Commit

```bash
git add frontend/src/modules/shifts/ShiftsPage.jsx
git commit -m "feat: VARDIYA ATA — SidePanel → BottomSheet (CellAssignSheet)"
```

---

## Task 2: WeekFillSheet — HAFTA DOLDUR as BottomSheet

**Files:**
- Modify: `frontend/src/modules/shifts/ShiftsPage.jsx`

### Step 1: Add `WeekFillSheet` function right before `CellAssignSheet`

Insert before `CellAssignSheet`:

```jsx
function WeekFillSheet({ weekFillPopover, setWeekFillPopover, shiftDefs, weekFillDef, setWeekFillDef, weekFillOffDay, setWeekFillOffDay, fillWeek, weekStart, weekEnd, formatDate, shiftColor }) {
  const [error, setError] = useState(null)

  useEffect(() => {
    const onEsc = e => { if (e.key === 'Escape') setWeekFillPopover(null) }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [setWeekFillPopover])

  const DAY_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

  return (
    <BottomSheet onClose={() => setWeekFillPopover(null)}>
      <div style={{ padding: '0 20px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: '16px', letterSpacing: '1px' }}>📆 HAFTA DOLDUR</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>
              {weekFillPopover.person.full_name} · {formatDate(weekStart)}–{formatDate(weekEnd)}
            </div>
          </div>
          <button onClick={() => setWeekFillPopover(null)} className="btn btn-ghost btn-sm">✕</button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '8px' }}>VARDIYA SEÇ</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {shiftDefs.map(s => {
              const active = weekFillDef === s.id.toString()
              const sc = shiftColor(s.color_class)
              return (
                <button key={s.id} onClick={() => setWeekFillDef(s.id.toString())}
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: '8px', textAlign: 'left',
                    fontSize: '13px', cursor: 'pointer',
                    border: `2px solid ${active ? sc.text : 'var(--border)'}`,
                    background: active ? sc.bg : 'var(--surface2)',
                    color: active ? sc.text : 'var(--text2)',
                  }}>
                  <span style={{ fontWeight: 600 }}>{s.name}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', marginLeft: '8px', opacity: .7 }}>
                    {s.start_hour}:00–{s.end_hour === 24 ? '00:00' : `${s.end_hour}:00`}
                  </span>
                  {active && <span style={{ float: 'right', fontSize: '10px' }}>✓</span>}
                </button>
              )
            })}
          </div>
        </div>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '8px' }}>İZİN GÜNÜ</div>
          <div style={{ display: 'flex', gap: '4px' }}>
            {DAY_LABELS.map((lbl, i) => (
              <button key={i} onClick={() => setWeekFillOffDay(i)}
                style={{
                  flex: 1, padding: '8px 2px', borderRadius: '6px', cursor: 'pointer',
                  border: `2px solid ${weekFillOffDay === i ? 'var(--teal)' : 'var(--border)'}`,
                  background: weekFillOffDay === i ? 'rgba(26,188,156,.12)' : 'var(--surface2)',
                  color: weekFillOffDay === i ? 'var(--teal)' : 'var(--text3)',
                  fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 600, textAlign: 'center',
                }}>
                {lbl}
              </button>
            ))}
          </div>
        </div>
        <button className="btn btn-primary" style={{ width: '100%', opacity: !weekFillDef ? 0.5 : 1 }}
          disabled={!weekFillDef || fillWeek.isPending}
          onClick={() => {
            setError(null)
            fillWeek.mutate(
              { staffId: weekFillPopover.person.id, deptId: weekFillPopover.person.dept_id, shiftDefId: parseInt(weekFillDef), offDayIdx: weekFillOffDay },
              { onError: () => setError('Hafta doldurulamadı. Tekrar deneyin.') }
            )
          }}>
          {fillWeek.isPending ? 'Dolduruluyor...' : '6 Gün Doldur + 1 İzin'}
        </button>
        {error && <div style={{ color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: '10px', marginTop: '8px' }}>{error}</div>}
      </div>
    </BottomSheet>
  )
}
```

### Step 2: Replace SidePanel render with `WeekFillSheet`

Find (~line 2275):
```jsx
{weekFillPopover && (
  <SidePanel
    title="HAFTA DOLDUR"
    ...
  >
    ...
  </SidePanel>
)}
```

Replace the entire block with:

```jsx
{weekFillPopover && (
  <WeekFillSheet
    weekFillPopover={weekFillPopover}
    setWeekFillPopover={setWeekFillPopover}
    shiftDefs={shiftDefs}
    weekFillDef={weekFillDef}
    setWeekFillDef={setWeekFillDef}
    weekFillOffDay={weekFillOffDay}
    setWeekFillOffDay={setWeekFillOffDay}
    fillWeek={fillWeek}
    weekStart={weekStart}
    weekEnd={weekEnd}
    formatDate={formatDate}
    shiftColor={shiftColor}
  />
)}
```

### Step 3: Remove `rect` from both `setWeekFillPopover` opener call sites

**Call site 1** (~line 1767, weekly view):

Find:
```js
setWeekFillPopover({ person, rect })
```

Replace with:
```js
setWeekFillPopover({ person })
```

**Call site 2** (~line 2561, DailyView component):

Find:
```js
setWeekFillPopover({ person: { id: s.id, full_name: s.full_name, dept_id: s.department_id, dept_name: s.dept_name }, rect: fakeRect })
```

Replace with:
```js
setWeekFillPopover({ person: { id: s.id, full_name: s.full_name, dept_id: s.department_id, dept_name: s.dept_name } })
```

Also check whether `fakeRect` is now unused — if the only use was this setter, delete the `fakeRect` construction too.

### Step 4: Build check

```bash
cd frontend && npm run build 2>&1 | grep -E "error|Error" | grep -v "node_modules" | head -10
```

Expected: no errors.

### Step 5: Commit

```bash
git add frontend/src/modules/shifts/ShiftsPage.jsx
git commit -m "feat: HAFTA DOLDUR — SidePanel → BottomSheet (WeekFillSheet)"
```

---

## Task 3: StaffFormSheet — Personel edit/new form as BottomSheet

**Files:**
- Modify: `frontend/src/modules/shifts/ShiftsPage.jsx`

### Step 1: Find the existing form state and handlers inside `StaffTab`

Before writing the new component, verify these identifiers exist inside `StaffTab`:
```bash
grep -n "const \[form\|setForm\|handleSubmit\|createMut\|updateMut\|BLOOD_TYPES" frontend/src/modules/shifts/ShiftsPage.jsx | head -15
```

Note the exact names — they are passed as props to `StaffFormSheet`.

### Step 2: Add `StaffFormSheet` function before `StaffTab`

Find the `// ═══` comment immediately before `function StaffTab`. Insert this function just above that comment:

```jsx
function StaffFormSheet({ editStaff, form, setForm, handleSubmit, createMut, updateMut, departments, onClose }) {
  const [tab, setTab] = useState('temel')
  const [error, setError] = useState(null)

  useEffect(() => {
    const onEsc = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [onClose])

  const isPending = createMut.isPending || updateMut.isPending
  const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', '0+', '0-']

  const inputStyle = { marginBottom: 0 }

  return (
    <BottomSheet onClose={onClose}>
      {/* Header */}
      <div style={{ padding: '0 20px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '10px' }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: '16px', letterSpacing: '1px' }}>
            {editStaff ? '✏️ PERSONEL DÜZENLE' : '➕ YENİ PERSONEL'}
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
        </div>
        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          {[['temel', 'Temel Bilgiler'], ['detay', 'Detaylar']].map(([id, label]) => (
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
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {tab === 'temel' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label className="form-label">Ad Soyad *</label>
              <input className="form-input" style={inputStyle} value={form.full_name || ''}
                onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">TC Kimlik No</label>
              <input className="form-input" style={inputStyle} value={form.tc_no || ''} maxLength={11}
                onChange={e => setForm(p => ({ ...p, tc_no: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Telefon</label>
              <input className="form-input" style={inputStyle} type="tel" value={form.phone || ''} placeholder="05XX XXX XXXX"
                onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">E-posta</label>
              <input className="form-input" style={inputStyle} type="email" value={form.email || ''}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Pozisyon</label>
              <input className="form-input" style={inputStyle} value={form.position || ''} placeholder="Örneğin: Güvenlik Görevlisi"
                onChange={e => setForm(p => ({ ...p, position: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Departman</label>
              <select className="form-select" value={form.department_id || ''}
                onChange={e => setForm(p => ({ ...p, department_id: e.target.value }))}>
                <option value="">Departman seçin...</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">İşe Giriş Tarihi</label>
              <input type="date" className="form-input" style={inputStyle} value={form.hire_date || ''}
                onChange={e => setForm(p => ({ ...p, hire_date: e.target.value }))} />
            </div>
            {editStaff && (
              <div>
                <label className="form-label">Durum</label>
                <select className="form-select" value={form.is_active ? '1' : '0'}
                  onChange={e => setForm(p => ({ ...p, is_active: parseInt(e.target.value) }))}>
                  <option value="1">Aktif</option>
                  <option value="0">Pasif</option>
                </select>
              </div>
            )}
          </div>
        )}

        {tab === 'detay' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label className="form-label">Doğum Tarihi</label>
              <input type="date" className="form-input" style={inputStyle} value={form.birth_date || ''}
                onChange={e => setForm(p => ({ ...p, birth_date: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Adres</label>
              <input className="form-input" style={inputStyle} value={form.address || ''}
                onChange={e => setForm(p => ({ ...p, address: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Acil Durum Kişisi</label>
              <input className="form-input" style={inputStyle} value={form.emergency_contact || ''}
                onChange={e => setForm(p => ({ ...p, emergency_contact: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Acil Durum Telefonu</label>
              <input className="form-input" style={inputStyle} type="tel" value={form.emergency_phone || ''}
                onChange={e => setForm(p => ({ ...p, emergency_phone: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Kan Grubu</label>
              <select className="form-select" value={form.blood_type || ''}
                onChange={e => setForm(p => ({ ...p, blood_type: e.target.value }))}>
                <option value="">Seçin...</option>
                {BLOOD_TYPES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Cinsiyet</label>
              <select className="form-select" value={form.gender || 'male'}
                onChange={e => setForm(p => ({ ...p, gender: e.target.value }))}>
                <option value="male">Erkek</option>
                <option value="female">Kadın</option>
              </select>
            </div>
            <div>
              <label className="form-label">Maaş (TL)</label>
              <input type="number" className="form-input" style={inputStyle} value={form.salary || ''}
                onChange={e => setForm(p => ({ ...p, salary: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Notlar</label>
              <textarea className="form-textarea" value={form.notes || ''} rows={3}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                style={{ minHeight: '60px' }} />
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', gap: '8px' }}>
        {error && <div style={{ color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: '10px', marginBottom: '8px' }}>{error}</div>}
        <button className="btn btn-primary" style={{ flex: 1, opacity: !form.full_name ? 0.5 : 1 }}
          disabled={!form.full_name || isPending}
          onClick={() => {
            setError(null)
            handleSubmit({ onError: () => setError('Kaydedilemedi. Tekrar deneyin.') })
          }}>
          {isPending ? 'Kaydediliyor...' : editStaff ? 'Güncelle' : 'Kaydet'}
        </button>
        <button className="btn btn-ghost" onClick={onClose}>İptal</button>
      </div>
    </BottomSheet>
  )
}
```

**Important:** The `handleSubmit` in the existing StaffTab code does NOT accept an options object with `onError`. Before the next step, check how `handleSubmit` is defined:

```bash
grep -n "handleSubmit\|const handleSubmit\|function handleSubmit" frontend/src/modules/shifts/ShiftsPage.jsx | head -10
```

If `handleSubmit` calls `createMut.mutate(...)` or `updateMut.mutate(...)` directly without an options argument, you need to either:
- Pass `onError` through the call (add `onError` option to the mutate call inside `handleSubmit`), OR
- Simplify the footer button to call the mutation directly without `onError` (just omit the error callback)

For simplicity if handleSubmit doesn't support options: replace the footer button onClick with:
```jsx
onClick={() => { setError(null); handleSubmit() }}
```
And add `onError` to the mutation calls in `handleSubmit` itself:
```js
createMut.mutate(payload, { onError: () => { /* will show in sheet */ } })
```

### Step 3: Replace ModalOverlay render with `StaffFormSheet`

Find (~line 1207):
```jsx
{showForm && (
  <ModalOverlay onClose={() => { setShowForm(false); setEditStaff(null) }} wide>
    <h3 ...>
    ...
  </ModalOverlay>
)}
```

Replace the entire `{showForm && ( <ModalOverlay ...> ... </ModalOverlay> )}` block with:

```jsx
{showForm && (
  <StaffFormSheet
    editStaff={editStaff}
    form={form}
    setForm={setForm}
    handleSubmit={handleSubmit}
    createMut={createMut}
    updateMut={updateMut}
    departments={departments}
    onClose={() => { setShowForm(false); setEditStaff(null) }}
  />
)}
```

### Step 4: Build check

```bash
cd frontend && npm run build 2>&1 | grep -E "error|Error" | grep -v "node_modules" | head -10
```

Expected: no errors.

### Step 5: Backend test sanity check

```bash
cd backend && npx vitest run 2>&1 | tail -5
```

Expected: all tests pass (no backend changes made, this is a sanity check).

### Step 6: Commit

```bash
git add frontend/src/modules/shifts/ShiftsPage.jsx
git commit -m "feat: Personel form — ModalOverlay → BottomSheet with Temel/Detaylar tabs (StaffFormSheet)"
```

---

## Manual Verification Checklist

After all 3 tasks:

- [ ] Çizelge: hücreye tıklayınca BottomSheet alttan gelir
- [ ] Çizelge: BottomSheet'ten vardiya atanınca hücre güncellenir ve panel kapanır
- [ ] Çizelge: KALDIR butonu yalnızca mevcut vardiya varken görünür
- [ ] Çizelge: ↓ butonuna tıklayınca HAFTA DOLDUR BottomSheet gelir
- [ ] Çizelge: 6 gün doldur çalışır, panel kapanır
- [ ] Çizelge: Günlük görünümden de ↓ tıklayınca aynı BottomSheet gelir
- [ ] Personel: Düzenle butonuna tıklayınca 2 sekmeli BottomSheet gelir
- [ ] Personel: Temel/Detaylar sekmeleri arasında geçiş çalışır
- [ ] Personel: Kaydet çalışır, panel kapanır, kart güncellenir
- [ ] Personel: Yeni Personel butonu BottomSheet açar, boş form
- [ ] Tüm paneller: Esc ile kapanır, backdrop click ile kapanır
- [ ] StaffDetailPanel, BordroDetailSheet hâlâ çalışıyor (dokunulmadı)
