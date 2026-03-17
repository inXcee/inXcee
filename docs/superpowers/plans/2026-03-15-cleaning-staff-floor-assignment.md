# Cleaning Staff Floor Assignment Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Personel" tab to the Housekeeping page showing cleaning staff assigned per block/floor, with ability to add/remove staff and assign them to floors.

**Architecture:** New `cleaning_staff` DB table, CRUD endpoints on the housekeeping router, new `StaffTab` component rendered as a tab within HousekeepingPage.

**Tech Stack:** SQLite (better-sqlite3), Express, React, TanStack Query, Axios

---

## Chunk 1: Backend — DB + API

### Task 1: Add `cleaning_staff` table to schema

**Files:**
- Modify: `backend/src/shared/db/schema.js`
- Modify: `backend/src/shared/db/index.js` (migration for existing DBs)

- [ ] **Step 1: Add table to schema.js**

Add before the closing backtick in `SCHEMA`:

```sql
CREATE TABLE IF NOT EXISTS cleaning_staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  phone TEXT,
  assigned_block TEXT,
  assigned_floor INTEGER,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

- [ ] **Step 2: Add migration in index.js**

Add after the existing `try/catch` migration blocks in `initDB()`:

```js
try { db.exec(`CREATE TABLE IF NOT EXISTS cleaning_staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  phone TEXT,
  assigned_block TEXT,
  assigned_floor INTEGER,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`) } catch(_) {}
```

- [ ] **Step 3: Add seed data in seed.js**

Add at the end of `seedDev()`:

```js
const staffInsert = db.prepare(`
  INSERT OR IGNORE INTO cleaning_staff(id,full_name,phone,assigned_block,assigned_floor)
  VALUES(?,?,?,?,?)
`)
staffInsert.run(1, 'Ayşe Yılmaz', '05551112233', 'M1', 1)
staffInsert.run(2, 'Fatma Demir', '05552223344', 'M1', 2)
staffInsert.run(3, 'Zeynep Kaya', '05553334455', 'M2', 1)
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/shared/db/schema.js backend/src/shared/db/index.js backend/src/shared/db/seed.js
git commit -m "feat: add cleaning_staff table schema and seed data"
```

### Task 2: Add staff queries

**Files:**
- Modify: `backend/src/modules/housekeeping/queries.js`

- [ ] **Step 1: Add CRUD query functions**

Append to `queries.js`:

```js
export function getStaff(block) {
  const db = getDB()
  let q = 'SELECT * FROM cleaning_staff WHERE is_active=1'
  const params = []
  if (block) { q += ' AND assigned_block=?'; params.push(block) }
  q += ' ORDER BY assigned_block, assigned_floor, full_name'
  return db.prepare(q).all(...params)
}

export function createStaff(fullName, phone) {
  const db = getDB()
  return db.prepare(
    'INSERT INTO cleaning_staff(full_name,phone) VALUES(?,?)'
  ).run(fullName, phone || null).lastInsertRowid
}

export function updateStaff(id, data) {
  const db = getDB()
  const sets = []
  const params = []
  if (data.full_name !== undefined)      { sets.push('full_name=?');      params.push(data.full_name) }
  if (data.phone !== undefined)          { sets.push('phone=?');          params.push(data.phone || null) }
  if (data.assigned_block !== undefined) { sets.push('assigned_block=?'); params.push(data.assigned_block) }
  if (data.assigned_floor !== undefined) { sets.push('assigned_floor=?'); params.push(data.assigned_floor) }
  if (sets.length === 0) return
  params.push(id)
  db.prepare(`UPDATE cleaning_staff SET ${sets.join(',')} WHERE id=?`).run(...params)
}

export function deleteStaff(id) {
  const db = getDB()
  db.prepare('UPDATE cleaning_staff SET is_active=0 WHERE id=?').run(id)
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/housekeeping/queries.js
git commit -m "feat: add cleaning_staff CRUD queries"
```

### Task 3: Add staff service + routes

**Files:**
- Modify: `backend/src/modules/housekeeping/service.js`
- Modify: `backend/src/modules/housekeeping/routes.js`

- [ ] **Step 1: Add service exports in service.js**

Append to `service.js`:

```js
export const getStaffService    = q.getStaff
export const createStaffService = q.createStaff
export const updateStaffService = q.updateStaff
export const deleteStaffService = q.deleteStaff
```

- [ ] **Step 2: Add routes in routes.js**

Add a new role array and routes after existing routes (before the closing of the file):

```js
const staffAccess = requireRole('campus_manager', 'shift_supervisor', 'housekeeper')

housekeepingRouter.get('/staff', ...staffAccess, (req, res) => {
  res.json(svc.getStaffService(req.query.block))
})

housekeepingRouter.post('/staff', ...staffAccess, (req, res) => {
  try {
    const id = svc.createStaffService(req.body.full_name, req.body.phone)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

housekeepingRouter.put('/staff/:id', ...staffAccess, (req, res) => {
  svc.updateStaffService(+req.params.id, req.body)
  res.json({ ok: true })
})

housekeepingRouter.delete('/staff/:id', ...staffAccess, (req, res) => {
  svc.deleteStaffService(+req.params.id)
  res.json({ ok: true })
})
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/housekeeping/service.js backend/src/modules/housekeeping/routes.js
git commit -m "feat: add cleaning staff API endpoints"
```

## Chunk 2: Frontend — Staff Tab

### Task 4: Add StaffTab component

**Files:**
- Create: `frontend/src/modules/housekeeping/StaffTab.jsx`

- [ ] **Step 1: Create StaffTab.jsx**

This component renders:
- Block selector chips (M1-S3)
- For each floor (1, 2): a card showing assigned staff with name+phone
- "Personel Ekle" button opening an inline form (full_name + phone)
- Each staff card has: assign/reassign dropdown (block+floor), remove button
- Unassigned staff shown in a separate section at the bottom

Full component code:

```jsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'

const ALL_BLOCKS = ['M1','M2','M3','S1','S2','S3']

export default function StaffTab() {
  const qc = useQueryClient()
  const [block, setBlock] = useState('M1')
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [editingId, setEditingId] = useState(null)

  const { data: allStaff = [] } = useQuery({
    queryKey: ['cleaning-staff'],
    queryFn: () => api.get('/housekeeping/staff').then(r => r.data),
  })

  const inv = () => qc.invalidateQueries({ queryKey: ['cleaning-staff'] })

  const createMut = useMutation({
    mutationFn: (data) => api.post('/housekeeping/staff', data),
    onSuccess: () => { inv(); setShowAdd(false); setNewName(''); setNewPhone('') },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/housekeeping/staff/${id}`, data),
    onSuccess: () => { inv(); setEditingId(null) },
  })

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/housekeeping/staff/${id}`),
    onSuccess: inv,
  })

  const blockStaff = allStaff.filter(s => s.assigned_block === block)
  const unassigned = allStaff.filter(s => !s.assigned_block)

  const floorStaff = (floor) => blockStaff.filter(s => s.assigned_floor === floor)

  return (
    <div className="fade-up" style={{ position: 'relative', zIndex: 1 }}>
      {/* Block selector */}
      <div style={{ display: 'flex', gap: '5px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {ALL_BLOCKS.map(b => {
          const count = allStaff.filter(s => s.assigned_block === b).length
          return (
            <button key={b}
              onClick={() => setBlock(b)}
              className={`filter-chip${block === b ? ' active' : ''}`}
              style={{ fontFamily: 'var(--display)', fontSize: '13px', letterSpacing: '1px' }}>
              {b}
              {count > 0 && <span style={{ marginLeft: '5px', fontSize: '9px', opacity: 0.7 }}>{count}</span>}
            </button>
          )
        })}
        <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }}
          onClick={() => setShowAdd(true)}>
          + YENİ PERSONEL
        </button>
      </div>

      {/* Add staff form */}
      {showAdd && (
        <div className="panel fade-up-1" style={{ marginBottom: '16px' }}>
          <div style={{ height: '2px', background: 'linear-gradient(90deg,var(--green),var(--teal))' }} />
          <div style={{ padding: '16px 20px' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '2px', marginBottom: '12px' }}>
              YENİ PERSONEL EKLE
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: 1, minWidth: '180px' }}>
                <label style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', display: 'block', marginBottom: '4px' }}>AD SOYAD</label>
                <input className="form-input" value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="Ad Soyad" />
              </div>
              <div style={{ flex: 1, minWidth: '140px' }}>
                <label style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', display: 'block', marginBottom: '4px' }}>TELEFON</label>
                <input className="form-input" value={newPhone} onChange={e => setNewPhone(e.target.value)}
                  placeholder="05XX XXX XX XX" />
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button className="btn btn-primary btn-sm"
                  disabled={!newName.trim() || createMut.isPending}
                  onClick={() => createMut.mutate({ full_name: newName.trim(), phone: newPhone.trim() })}>
                  {createMut.isPending ? '...' : 'KAYDET'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => { setShowAdd(false); setNewName(''); setNewPhone('') }}>
                  İPTAL
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floor cards */}
      {[1, 2].map(floor => {
        const staff = floorStaff(floor)
        return (
          <div key={floor} className="panel fade-up-1" style={{ marginBottom: '16px' }}>
            <div style={{ height: '2px', background: floor === 1
              ? 'linear-gradient(90deg,var(--blue),var(--purple))'
              : 'linear-gradient(90deg,var(--purple),var(--teal))' }} />
            <div className="panel-header">
              <div>
                <div className="panel-title">{block} BLOK — KAT {floor}</div>
                <div className="panel-subtitle">
                  {staff.length} PERSONEL ATANMIŞ
                </div>
              </div>
            </div>
            <div className="panel-body">
              {staff.length === 0 ? (
                <div className="empty-state" style={{ padding: '20px 0' }}>
                  <div className="empty-icon" style={{ fontSize: '28px' }}>◈</div>
                  <div className="empty-sub">Bu kata henüz personel atanmamış</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {staff.map(s => (
                    <StaffCard key={s.id} staff={s} editing={editingId === s.id}
                      onEdit={() => setEditingId(s.id)}
                      onCancelEdit={() => setEditingId(null)}
                      onUpdate={(data) => updateMut.mutate({ id: s.id, ...data })}
                      onDelete={() => deleteMut.mutate(s.id)}
                      updating={updateMut.isPending}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })}

      {/* Unassigned staff */}
      {unassigned.length > 0 && (
        <div className="panel fade-up-1" style={{ marginBottom: '16px' }}>
          <div style={{ height: '2px', background: 'linear-gradient(90deg,var(--accent),var(--red))' }} />
          <div className="panel-header">
            <div>
              <div className="panel-title">ATANMAMIŞ PERSONEL</div>
              <div className="panel-subtitle">{unassigned.length} personel henüz bir kata atanmamış</div>
            </div>
          </div>
          <div className="panel-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {unassigned.map(s => (
                <StaffCard key={s.id} staff={s} editing={editingId === s.id}
                  onEdit={() => setEditingId(s.id)}
                  onCancelEdit={() => setEditingId(null)}
                  onUpdate={(data) => updateMut.mutate({ id: s.id, ...data })}
                  onDelete={() => deleteMut.mutate(s.id)}
                  updating={updateMut.isPending}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StaffCard({ staff, editing, onEdit, onCancelEdit, onUpdate, onDelete, updating }) {
  const [assignBlock, setAssignBlock] = useState(staff.assigned_block || '')
  const [assignFloor, setAssignFloor] = useState(staff.assigned_floor || 1)

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px',
      background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px',
    }}>
      {/* Avatar circle */}
      <div style={{
        width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
        background: 'linear-gradient(135deg,var(--accent),var(--purple))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--display)', fontSize: '14px', color: '#fff',
      }}>
        {staff.full_name.charAt(0).toUpperCase()}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--sans)', fontSize: '13px', color: 'var(--text)', fontWeight: 600 }}>
          {staff.full_name}
        </div>
        {staff.phone && (
          <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginTop: '2px' }}>
            {staff.phone}
          </div>
        )}
      </div>

      {/* Assignment info or edit */}
      {editing ? (
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select className="form-select" value={assignBlock}
            onChange={e => setAssignBlock(e.target.value)}
            style={{ width: '70px', fontSize: '12px' }}>
            <option value="">—</option>
            {ALL_BLOCKS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <select className="form-select" value={assignFloor}
            onChange={e => setAssignFloor(+e.target.value)}
            style={{ width: '80px', fontSize: '12px' }}>
            <option value={1}>Kat 1</option>
            <option value={2}>Kat 2</option>
          </select>
          <button className="btn btn-primary btn-xs" disabled={updating}
            onClick={() => onUpdate({ assigned_block: assignBlock || null, assigned_floor: assignBlock ? assignFloor : null })}>
            {updating ? '...' : '✓'}
          </button>
          <button className="btn btn-ghost btn-xs" onClick={onCancelEdit}>✕</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {staff.assigned_block && (
            <span style={{
              fontFamily: 'var(--mono)', fontSize: '10px', padding: '3px 8px',
              background: 'rgba(99,102,241,.12)', border: '1px solid rgba(99,102,241,.3)',
              borderRadius: '4px', color: 'var(--accent)',
            }}>
              {staff.assigned_block} · KAT {staff.assigned_floor}
            </span>
          )}
          <button className="btn btn-ghost btn-xs" onClick={onEdit} title="Düzenle">✎</button>
          <button className="btn btn-ghost btn-xs" onClick={onDelete} title="Sil"
            style={{ color: 'var(--red)' }}>✕</button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/modules/housekeeping/StaffTab.jsx
git commit -m "feat: add StaffTab component for cleaning staff management"
```

### Task 5: Add tab navigation to HousekeepingPage

**Files:**
- Modify: `frontend/src/modules/housekeeping/HousekeepingPage.jsx`

- [ ] **Step 1: Add import and tab state**

At line 2, add:
```js
import StaffTab from './StaffTab.jsx'
```

Inside `HousekeepingPage()`, after the existing `useState` calls (around line 787), add:
```js
const [activeTab, setActiveTab] = useState('cleaning')
```

- [ ] **Step 2: Add tab switcher after the header div**

After the header `<div>` (the one with `<h1>HOUSEKEEPING</h1>`, ending around line 860), add tab buttons:

```jsx
{/* Tab switcher */}
<div style={{ display: 'flex', gap: '0', marginBottom: '20px', borderBottom: '1px solid var(--border)' }}>
  {[
    { id: 'cleaning', label: 'TEMİZLİK' },
    { id: 'staff', label: 'PERSONEL' },
  ].map(tab => (
    <button key={tab.id}
      onClick={() => setActiveTab(tab.id)}
      style={{
        fontFamily: 'var(--mono)', fontSize: '11px', letterSpacing: '2px',
        padding: '10px 20px', background: 'none', border: 'none', cursor: 'pointer',
        color: activeTab === tab.id ? 'var(--accent)' : 'var(--text3)',
        borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
        transition: 'all .2s',
      }}>
      {tab.label}
    </button>
  ))}
</div>
```

- [ ] **Step 3: Wrap existing content in tab conditional**

Wrap all content after the tab switcher (from the `ProgressStrip` through the `RoomDetailPanel`) in:
```jsx
{activeTab === 'cleaning' && (
  <>
    {/* ...existing cleaning content... */}
  </>
)}

{activeTab === 'staff' && <StaffTab />}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/modules/housekeeping/HousekeepingPage.jsx
git commit -m "feat: add tab navigation with Personel tab to HousekeepingPage"
```

### Task 6: Manual verification

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify the feature works**

1. Login as `mudur/admin123`
2. Navigate to Housekeeping page
3. Verify "TEMİZLİK" and "PERSONEL" tabs appear
4. Click "PERSONEL" tab
5. Verify block selector chips show
6. Click "+ YENİ PERSONEL" and add a staff member
7. Edit the staff member to assign to a block/floor
8. Verify staff appears under the correct floor card
9. Switch blocks and verify correct filtering
10. Delete a staff member

- [ ] **Step 3: Final commit if any fixes needed**
