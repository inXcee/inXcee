# Laundry Records, Reports & Archive Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a rich "Tümü" tab to Kayıtlar (with premium indicator + expandable premium garment list), and apply visual improvements to Raporlar and Arşiv.

**Architecture:** One new React component (`AllRecordsTab.jsx`) is added and wired into the existing `FullRecordsView` in `LaundryHub.jsx`. A single backend field (`premium_garment_count`) is added to `listItemsQuery`. Reports and Archive receive CSS-level polish only.

**Tech Stack:** React 18, @tanstack/react-query, SQLite (better-sqlite3), Vitest

---

## File Map

| File | Action | What changes |
|---|---|---|
| `backend/src/modules/laundry/queries.js` | Modify | Add `premium_garment_count` subquery to `listItemsQuery` |
| `backend/src/modules/laundry/laundry.test.js` | Modify | Add test for `premium_garment_count` field |
| `frontend/src/modules/laundry/components/AllRecordsTab.jsx` | Create | New component: full item list with premium badge + accordion |
| `frontend/src/modules/laundry/LaundryHub.jsx` | Modify | Add tab nav to `FullRecordsView`: [★ Tümü \| Filtrele] |
| `frontend/src/modules/laundry/LaundryReport.jsx` | Modify | Visual polish: stat card heights, layout |
| `frontend/src/modules/laundry/components/ArchiveTable.jsx` | Modify | Visual polish: row height, numeric alignment |

---

## Task 1: Backend — Add `premium_garment_count` to `listItemsQuery`

**Files:**
- Modify: `backend/src/modules/laundry/queries.js` (around line 138)
- Modify: `backend/src/modules/laundry/laundry.test.js`

- [ ] **Step 1: Write the failing test**

Open `backend/src/modules/laundry/laundry.test.js` and add this test after the existing `'item listeler ve filtreler'` test (around line 41):

```js
it('listItemsQuery returns premium_garment_count field', async () => {
  const { listItemsQuery, insertItemQuery, insertPremiumGarmentsQuery } = await import('./queries.js')

  // Insert a new item
  const itemId = insertItemQuery({ room_id: 1, item_count: 1, intake_name: 'PremTest' })

  // Before any premium garments: count should be 0
  let items = listItemsQuery({ status: 'dirty' })
  const before = items.find(i => i.id === itemId)
  expect(before).toBeTruthy()
  expect(before.premium_garment_count).toBe(0)

  // After adding a premium garment: count should be 1
  insertPremiumGarmentsQuery(itemId, [{ garment_type: 'Pantolon', brand: null, model: null, size: null, color: null, pattern: null, condition_notes: null }])
  items = listItemsQuery({ status: 'dirty' })
  const after = items.find(i => i.id === itemId)
  expect(after.premium_garment_count).toBe(1)
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js
```

Expected: FAIL — `Cannot read properties of undefined` or `expected undefined to be 0` because `premium_garment_count` doesn't exist yet.

- [ ] **Step 3: Add `premium_garment_count` subquery to `listItemsQuery`**

In `backend/src/modules/laundry/queries.js`, locate the `listItemsQuery` function (around line 123). Find the line:

```js
           li.clothing_items,
           (SELECT COUNT(*) FROM laundry_items li2
```

Replace with:

```js
           li.clothing_items,
           (SELECT COUNT(*) FROM premium_garments WHERE item_id = li.id) as premium_garment_count,
           (SELECT COUNT(*) FROM laundry_items li2
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js
```

Expected: All tests PASS.

- [ ] **Step 5: Run full backend test suite**

```bash
cd backend && npx vitest run
```

Expected: All tests pass (no regressions).

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/laundry/queries.js backend/src/modules/laundry/laundry.test.js
git commit -m "feat: premium_garment_count field in listItemsQuery"
```

---

## Task 2: Create `AllRecordsTab.jsx`

**Files:**
- Create: `frontend/src/modules/laundry/components/AllRecordsTab.jsx`

This component renders a rich list of laundry items: premium ★ badge, clothing types, and an inline expandable accordion showing premium garments.

- [ ] **Step 1: Create the file**

Create `frontend/src/modules/laundry/components/AllRecordsTab.jsx` with this content:

```jsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { laundryApi } from '../api.js'
import { CLOTHING_ICONS } from './NewItemModal.jsx'
import { ColorPatternDisplay, parseColors, colorHex } from './ColorPatternPicker.jsx'

const STATUS_LABELS = {
  dirty: 'Sepette', washing: 'Yıkanıyor', ironing: 'Ütüde',
  ready: 'Rafta', delivered: 'Teslim', lost: 'Kayıp',
}
const STATUS_COLORS = {
  dirty: 'var(--accent)', washing: 'var(--blue)', ironing: '#6366f1',
  ready: 'var(--green)', delivered: 'var(--teal)', lost: 'var(--red)',
}

const PG_STATUS_LABELS = { received: 'Alındı', ironing: 'Ütüde', ready: 'Hazır', delivered: 'Teslim', lost: 'Kayıp' }
const PG_STATUS_COLORS = { received: '#f59e0b', ironing: '#6366f1', ready: '#10b981', delivered: '#64748b', lost: '#ef4444' }

function formatDuration(item) {
  const start = new Date(item.created_at)
  const end = (item.status === 'delivered' || item.status === 'lost')
    ? new Date(item.updated_at)
    : new Date()
  const ms = Math.max(0, end - start)
  const hours = Math.floor(ms / 3600000)
  const mins = Math.floor((ms % 3600000) / 60000)
  return hours > 0 ? `${hours}s ${mins}dk` : `${mins}dk`
}

function PremiumAccordion({ itemId }) {
  const { data: garments = [], isLoading } = useQuery({
    queryKey: ['premium-garments', itemId],
    queryFn: () => laundryApi.getPremiumGarments(itemId),
    staleTime: 10_000,
  })

  if (isLoading) {
    return (
      <div style={{ padding: '8px 0', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
        Yükleniyor...
      </div>
    )
  }

  return (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {garments.map(g => {
        const pgColor = PG_STATUS_COLORS[g.status] || '#64748b'
        return (
          <div key={g.id} style={{
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            padding: '6px 10px', background: 'var(--surface)',
            border: '1px solid var(--border)', borderRadius: 6,
          }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)', fontWeight: 600 }}>
              {g.garment_code}
            </span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text)' }}>
              {g.garment_type}
            </span>
            {g.brand && (
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{g.brand}</span>
            )}
            {g.model && (
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{g.model}</span>
            )}
            {g.size && (
              <span style={{
                fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text2)',
                background: 'var(--surface2)', padding: '1px 6px', borderRadius: 4,
                border: '1px solid var(--border)',
              }}>{g.size}</span>
            )}
            {g.color && (
              <span style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                {parseColors(g.color).map((c, i) => (
                  <span key={i} style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: colorHex(c), border: '1px solid rgba(0,0,0,0.15)',
                    display: 'inline-block', flexShrink: 0,
                  }} title={c} />
                ))}
              </span>
            )}
            {g.pattern && (
              <span style={{
                fontFamily: 'var(--mono)', fontSize: 9, color: '#7c3aed',
                background: 'rgba(124,58,237,0.08)', padding: '1px 5px', borderRadius: 3,
              }}>{g.pattern}</span>
            )}
            <span style={{
              marginLeft: 'auto', padding: '2px 7px', borderRadius: 4, fontSize: 9,
              fontFamily: 'var(--mono)', background: pgColor + '18',
              border: `1px solid ${pgColor}30`, color: pgColor, flexShrink: 0,
            }}>
              {PG_STATUS_LABELS[g.status] || g.status}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default function AllRecordsTab() {
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  const { data: rawItems = [], isLoading } = useQuery({
    queryKey: ['laundry-all-records', statusFilter, search],
    queryFn: () => {
      const params = {}
      if (statusFilter !== 'all') params.status = statusFilter
      if (search) params.search = search
      return laundryApi.getItems(params)
    },
    refetchInterval: 30_000,
  })

  // Sort newest first (listItemsQuery sorts by updated_at ASC for kanban — override here)
  const items = [...rawItems].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  return (
    <div>
      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="form-input"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Oda no veya isim..."
          style={{ flex: '1 1 180px', minWidth: 140 }}
        />
        <select
          className="form-input"
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setExpandedId(null) }}
          style={{ width: 150 }}
        >
          <option value="all">Tüm Aktif</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* List */}
      {isLoading ? (
        <div style={{ padding: 20, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
          Yükleniyor...
        </div>
      ) : items.length === 0 ? (
        <div className="panel" style={{ padding: '32px', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>Kayıt bulunamadı</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map(item => {
            let cl = []
            try { cl = item.clothing_items ? JSON.parse(item.clothing_items) : [] } catch {}
            const isPremium = (item.premium_garment_count || 0) > 0
            const isExpanded = expandedId === item.id
            const statusColor = STATUS_COLORS[item.status] || 'var(--border)'

            return (
              <div key={item.id} style={{
                background: 'var(--surface)',
                border: `1px solid ${isPremium ? 'rgba(245,158,11,0.25)' : 'var(--border)'}`,
                borderLeft: `3px solid ${statusColor}`,
                borderRadius: 8, padding: '12px 16px',
              }}>
                {/* Line 1: Room · Person · Count · Status · Duration */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: cl.length > 0 ? 6 : 0 }}>
                  <span style={{ fontFamily: 'var(--display)', fontSize: 15, letterSpacing: 2, color: 'var(--text)' }}>
                    {item.block} · {item.room_no}
                  </span>
                  {isPremium && (
                    <span style={{ color: '#f59e0b', fontSize: 13, lineHeight: 1 }} title="Premium parça içeriyor">★</span>
                  )}
                  {item.intake_name && (
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)' }}>
                      {item.intake_name}
                    </span>
                  )}
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
                    {item.item_count} parça
                  </span>
                  <span style={{
                    padding: '2px 8px', borderRadius: 4, fontSize: 9, fontFamily: 'var(--mono)',
                    background: statusColor + '18', border: `1px solid ${statusColor}30`, color: statusColor,
                  }}>
                    {STATUS_LABELS[item.status] || item.status}
                  </span>
                  <span style={{
                    fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginLeft: 'auto',
                  }}>
                    {formatDuration(item)}
                  </span>
                </div>

                {/* Line 2: Clothing types */}
                {cl.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: isPremium ? 6 : 0 }}>
                    {cl.map((c, i) => (
                      <span key={i} style={{
                        fontFamily: 'var(--mono)', fontSize: 9, padding: '2px 8px',
                        background: 'var(--surface2)', border: '1px solid var(--border)',
                        borderRadius: 12, color: 'var(--text2)',
                      }}>
                        {CLOTHING_ICONS[c.type] || ''} {c.qty > 1 ? `${c.qty}× ` : ''}{c.type}
                      </span>
                    ))}
                  </div>
                )}

                {/* Premium accordion trigger */}
                {isPremium && (
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                      fontFamily: 'var(--mono)', fontSize: 9, color: '#f59e0b',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    {isExpanded ? '▲' : '▼'} {item.premium_garment_count} premium parça
                  </button>
                )}

                {/* Premium accordion content */}
                {isPremium && isExpanded && <PremiumAccordion itemId={item.id} />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify no import errors**

The file imports:
- `CLOTHING_ICONS` from `./NewItemModal.jsx` — this is already exported from that file (check: `export { CLOTHING_ICONS }` or named export)
- `ColorPatternDisplay, parseColors, colorHex` from `./ColorPatternPicker.jsx` — all exported

Run the frontend dev server to verify no errors:

```bash
cd frontend && npm run dev
```

Navigate to Çamaşırhane → Kayıtlar. No console errors expected (the component isn't wired yet, so it won't render). Stop the server.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/modules/laundry/components/AllRecordsTab.jsx
git commit -m "feat: AllRecordsTab component with premium badge and accordion"
```

---

## Task 3: Add Tabs to `FullRecordsView` in `LaundryHub.jsx`

**Files:**
- Modify: `frontend/src/modules/laundry/LaundryHub.jsx` (lines 777–927)

Add `AllRecordsTab` import and a two-tab nav at the top of `FullRecordsView`:
- **★ Tümü** — renders `<AllRecordsTab />`
- **Filtrele** — renders the existing FullRecordsView content (filter chips + list)

- [ ] **Step 1: Add the import**

At the top of `LaundryHub.jsx`, after the existing imports (around line 36), add:

```js
import AllRecordsTab from './components/AllRecordsTab.jsx'
```

- [ ] **Step 2: Add tab state and tab nav to FullRecordsView**

Locate `function FullRecordsView()` (line 778). Replace:

```js
function FullRecordsView() {
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
```

with:

```js
function FullRecordsView() {
  const [recordsTab, setRecordsTab] = useState('all')
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
```

- [ ] **Step 3: Add tab nav and conditional render**

Locate the `return (` inside `FullRecordsView` (line 798). Replace:

```js
  return (
    <div>
      {/* Filters */}
```

with:

```js
  return (
    <div>
      {/* Tab nav */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {[
          { key: 'all', label: '★ Tümü' },
          { key: 'filtered', label: '≡ Filtrele' },
        ].map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setRecordsTab(t.key)}
            style={{
              padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1,
              color: recordsTab === t.key ? 'var(--accent)' : 'var(--text3)',
              borderBottom: recordsTab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {recordsTab === 'all' ? (
        <AllRecordsTab />
      ) : (
        <>
      {/* Filters */}
```

- [ ] **Step 4: Close the conditional block**

The `<>` fragment opened in Step 3 needs to be closed. Find the end of `FullRecordsView` — specifically the closing of the items list ternary followed by the outer div close. This is unique because it ends the function:

Find this string (the last few lines before `// ── LaundryHub`):

```js
        </div>
      )}
    </div>
  )
}

// ── LaundryHub
```

Replace with:

```js
        </div>
      )}
        </>
      )}
    </div>
  )
}

// ── LaundryHub
```

- [ ] **Step 5: Verify in browser**

```bash
cd frontend && npm run dev
```

Navigate to Çamaşırhane → Kayıtlar section. Verify:
1. Two tabs appear: "★ Tümü" and "≡ Filtrele"
2. "★ Tümü" tab shows AllRecordsTab with filter bar (search + status dropdown)
3. Items with `premium_garment_count > 0` show a ★ gold badge
4. Clicking ▼ on a premium item expands the accordion showing premium garments
5. "≡ Filtrele" tab shows the original filter chips and list
6. No console errors

Stop the server.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/modules/laundry/LaundryHub.jsx
git commit -m "feat: Tümü tab in Kayıtlar with AllRecordsTab"
```

---

## Task 4: Visual Improvements to `LaundryReport.jsx`

**Files:**
- Modify: `frontend/src/modules/laundry/LaundryReport.jsx`

Three targeted changes: stat card equal heights, premium section consistent card style, and explicit grid alignment.

- [ ] **Step 1: Fix stat card grid alignment**

Locate the summary cards grid (around line 130):

```js
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
```

Replace with:

```js
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16, alignItems: 'stretch' }}>
```

- [ ] **Step 2: Make each stat card a flex column so content stretches**

Locate the kpi-card div (around line 139):

```js
              <div key={s.label} className="kpi-card panel" style={{ padding: '10px 12px', textAlign: 'center', borderTop: `2px solid ${s.color}` }}>
```

Replace with:

```js
              <div key={s.label} className="kpi-card panel" style={{ padding: '10px 12px', textAlign: 'center', borderTop: `2px solid ${s.color}`, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
```

- [ ] **Step 3: Verify in browser**

```bash
cd frontend && npm run dev
```

Navigate to Çamaşırhane → Raporlar. Verify stat cards are equal height and properly aligned. Stop server.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/modules/laundry/LaundryReport.jsx
git commit -m "fix: stat card equal height in LaundryReport"
```

---

## Task 5: Visual Improvements to `ArchiveTable.jsx`

**Files:**
- Modify: `frontend/src/modules/laundry/components/ArchiveTable.jsx`

Three targeted changes: increased row height, numeric column right-alignment, and filter bar on single line.

- [ ] **Step 1: Increase row padding**

Locate the `td` style object (around line 43):

```js
  const td = {
    fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)',
    padding: '9px 10px', borderBottom: '1px solid var(--border)',
  }
```

Replace with:

```js
  const td = {
    fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)',
    padding: '12px 10px', borderBottom: '1px solid var(--border)',
  }
```

- [ ] **Step 2: Right-align PARÇA and SÜRE columns**

Locate the table body rows. Find the PARÇA cell (around line 130):

```js
                <td style={{ ...td, color: 'var(--accent)' }}>{item.item_count}</td>
```

Replace with:

```js
                <td style={{ ...td, color: 'var(--accent)', textAlign: 'right' }}>{item.item_count}</td>
```

Find the SÜRE cell (around line 133):

```js
                <td style={td}>{item.total_hours != null ? `${item.total_hours}s` : '—'}</td>
```

Replace with:

```js
                <td style={{ ...td, textAlign: 'right' }}>{item.total_hours != null ? `${item.total_hours}s` : '—'}</td>
```

Also right-align the PARÇA and SÜRE headers. Locate the `th` mapping (around line 107):

```js
              {['ODA', 'TESLİM EDEN', 'PARÇA', 'GİRİŞ', 'TESLİM', 'SÜRE', 'DURUM', 'DOĞRULAMA'].map(h => (
                <th key={h} style={th}>{h}</th>
              ))}
```

Replace with:

```js
              {['ODA', 'TESLİM EDEN', 'PARÇA', 'GİRİŞ', 'TESLİM', 'SÜRE', 'DURUM', 'DOĞRULAMA'].map(h => (
                <th key={h} style={{ ...th, textAlign: ['PARÇA', 'SÜRE'].includes(h) ? 'right' : 'left' }}>{h}</th>
              ))}
```

- [ ] **Step 3: Ensure filter bar stays single-line on desktop**

Locate the filter bar container (around line 51):

```js
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 8,
        padding: '12px 16px', background: 'var(--surface2)',
        border: '1px solid var(--border)', borderRadius: 10,
      }}>
```

Replace with:

```js
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
        padding: '12px 16px', background: 'var(--surface2)',
        border: '1px solid var(--border)', borderRadius: 10,
      }}>
```

- [ ] **Step 4: Verify in browser**

```bash
cd frontend && npm run dev
```

Navigate to Çamaşırhane → Arşiv. Verify:
1. Table rows are taller (padding 12px)
2. PARÇA and SÜRE columns are right-aligned (both header and cells)
3. Filter bar elements align vertically centered
4. No layout breaks

Stop server.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/laundry/components/ArchiveTable.jsx
git commit -m "fix: row height and numeric alignment in ArchiveTable"
```
