

# Çamaşırhane Kapsamlı Geliştirme — İmplementasyon Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Çamaşırhane modülüne batch işlemler, ütü aşaması, parça tik kontrol, arşiv ve WhatsApp SLA bildirimi eklemek.

**Architecture:** 5 bağımsız faz — her faz kendi DB migration + backend + frontend + test döngüsüne sahip. Her faz bir commit ile kapanır. Mevcut `try/catch ALTER` migration pattern'i korunur, yeni tablolar `index.js`'e eklenir.

**Tech Stack:** Node.js/Express, better-sqlite3, React/Vite, Vitest

---

## Dosya Haritası

### Backend (değişecek)
- `backend/src/shared/db/index.js` — DB migration (ALTER + CREATE TABLE)
- `backend/src/modules/laundry/queries.js` — SQL sorguları
- `backend/src/modules/laundry/service.js` — iş mantığı
- `backend/src/modules/laundry/routes.js` — yeni endpoint'ler
- `backend/src/modules/laundry/whatsapp.js` — SLA mesaj fonksiyonu
- `backend/src/modules/laundry/sla.js` — WhatsApp SLA tetikleyici
- `backend/src/modules/laundry/laundry.test.js` — testler

### Frontend (değişecek)
- `frontend/src/modules/laundry/LaundryHub.jsx`
- `frontend/src/modules/laundry/LaundrySettings.jsx`
- `frontend/src/modules/laundry/components/ItemCard.jsx`
- `frontend/src/modules/laundry/components/NewItemModal.jsx`
- `frontend/src/modules/laundry/components/MachineManagerPanel.jsx`

### Frontend (yeni)
- `frontend/src/modules/laundry/components/BatchAssignModal.jsx`
- `frontend/src/modules/laundry/components/ItemVerificationModal.jsx`
- `frontend/src/modules/laundry/components/ArchiveTable.jsx`
- `frontend/src/modules/laundry/components/ArchiveDetailPanel.jsx`

---

## FAZ 1 — Batch İşlemler + Makine Bakım UI + Oda Gruplama

### Task 1: DB Migration — Faz 1 (batch endpoint'leri mevcut şemayla çalışır, ek migration yok)

Bu fazda yeni tablo gerekmez. Geç.

---

### Task 2: Backend — batch-assign ve batch-lost servisleri

**Files:**
- Modify: `backend/src/modules/laundry/service.js`
- Modify: `backend/src/modules/laundry/routes.js`
- Modify: `backend/src/modules/laundry/laundry.test.js`

- [x] **Step 1: Testi yaz (önce başarısız olacak)**

`laundry.test.js` sonuna ekle:

```javascript
describe('batch-assign', () => {
  test('birden fazla dirty item tek makinaya atanır', () => {
    const db = getDB()
    const room = db.prepare("SELECT id FROM rooms LIMIT 1").get()
    const machine = db.prepare("SELECT id FROM laundry_machines WHERE status='idle' LIMIT 1").get()

    const id1 = q.insertItemQuery({ room_id: room.id, item_count: 2, created_by: 1 })
    const id2 = q.insertItemQuery({ room_id: room.id, item_count: 1, created_by: 1 })

    const result = batchAssignService([id1, id2], machine.id, null, 1)
    expect(result.success).toHaveLength(2)
    expect(result.failed).toHaveLength(0)

    const item1 = q.getItemQuery(id1)
    expect(item1.status).toBe('washing')
    expect(item1.machine_id).toBe(machine.id)
  })

  test('maintenance makinaya assign reddedilir', () => {
    const db = getDB()
    const room = db.prepare("SELECT id FROM rooms LIMIT 1").get()
    db.prepare("INSERT INTO laundry_machines(name,type,status) VALUES('TestM','washer','maintenance')").run()
    const machine = db.prepare("SELECT id FROM laundry_machines WHERE status='maintenance' LIMIT 1").get()
    const id1 = q.insertItemQuery({ room_id: room.id, item_count: 1, created_by: 1 })

    const result = batchAssignService([id1], machine.id, null, 1)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].error).toMatch(/bakımda|maintenance/i)
  })
})

describe('batch-lost', () => {
  test('dirty/washing/ready itemlar kayıp işaretlenir', () => {
    const db = getDB()
    const room = db.prepare("SELECT id FROM rooms LIMIT 1").get()
    const id1 = q.insertItemQuery({ room_id: room.id, item_count: 1, created_by: 1 })
    const id2 = q.insertItemQuery({ room_id: room.id, item_count: 1, created_by: 1 })

    const result = batchLostService([id1, id2], 'test notu', 1)
    expect(result.success).toHaveLength(2)
    expect(q.getItemQuery(id1).status).toBe('lost')
  })

  test('delivered item kayıp işaretlenemez', () => {
    const db = getDB()
    const room = db.prepare("SELECT id FROM rooms LIMIT 1").get()
    const id1 = q.insertItemQuery({ room_id: room.id, item_count: 1, created_by: 1 })
    db.prepare("UPDATE laundry_items SET status='delivered' WHERE id=?").run(id1)

    const result = batchLostService([id1], null, 1)
    expect(result.failed).toHaveLength(1)
  })
})
```

- [x] **Step 2: Testi çalıştır — başarısız olmalı**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js
```

Beklenen: `batchAssignService is not a function` hatası

- [x] **Step 3: service.js'e batchAssignService ve batchLostService ekle**

`service.js` içinde `batchDeliverService`'den sonra ekle:

```javascript
export function batchAssignService(itemIds, machineId, timerMinutes, userId) {
  if (!Array.isArray(itemIds) || !itemIds.length) throw new Error('En az 1 kayıt seçilmeli')
  const machine = q.getMachineQuery(machineId)
  if (!machine) throw new Error('Makine bulunamadı')
  if (machine.status === 'maintenance') throw new Error('Makine bakımda — atama yapılamaz')
  if (machine.status === 'running') throw new Error('Makine meşgul — atama yapılamaz')

  const success = []
  const failed = []
  for (const id of itemIds) {
    try {
      advanceItemService(id, { machine_id: machineId, timer_minutes: timerMinutes }, userId)
      success.push(id)
    } catch (e) {
      failed.push({ id, error: e.message })
    }
  }
  return { success, failed }
}

export function batchLostService(itemIds, notes, userId) {
  if (!Array.isArray(itemIds) || !itemIds.length) throw new Error('En az 1 kayıt seçilmeli')
  const success = []
  const failed = []
  for (const id of itemIds) {
    try {
      lostItemService(id, { notes }, userId)
      success.push(id)
    } catch (e) {
      failed.push({ id, error: e.message })
    }
  }
  return { success, failed }
}
```

- [x] **Step 4: Test importlarını güncelle**

`laundry.test.js` başındaki import satırına `batchAssignService` ve `batchLostService` ekle:

```javascript
// laundry.test.js dosyasının başındaki service import satırına ekle:
// (dosyada zaten `import { advanceItemService, lostItemService, ... } from './service.js'` vardır)
import {
  createItemService, advanceItemService, deliverItemService, batchDeliverService,
  lostItemService, revertItemService, deleteItemService, reportDamageService,
  createMachineService, updateMachineService, deleteMachineService,
  addToQueueService, removeFromQueueService, upsertSlaConfigService,
  listAllItemsService, markFoundService, getPersonHistoryService,
  batchAssignService,
  batchLostService,
} from './service.js'
```

- [x] **Step 5: routes.js'e endpoint'leri ekle**

`/items/batch-deliver` route'undan hemen önce ekle:

```javascript
laundryRouter.post('/items/batch-assign', ...laundryFull, (req, res) => {
  try {
    const { item_ids, machine_id, timer_minutes } = req.body
    if (!Array.isArray(item_ids) || !machine_id) {
      return res.status(400).json({ error: 'item_ids[] ve machine_id zorunlu' })
    }
    const result = svc.batchAssignService(item_ids, +machine_id, timer_minutes ? +timer_minutes : null, req.user.id)
    res.json(result)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.post('/items/batch-lost', ...laundryFull, (req, res) => {
  try {
    const { item_ids, notes } = req.body
    if (!Array.isArray(item_ids)) return res.status(400).json({ error: 'item_ids[] zorunlu' })
    const result = svc.batchLostService(item_ids, notes, req.user.id)
    res.json(result)
  } catch (e) { res.status(400).json({ error: e.message }) }
})
```

- [x] **Step 6: Testleri çalıştır — geçmeli**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js
```

Beklenen: Tüm testler PASS

---

### Task 3: Frontend — Batch seçim UI + BatchAssignModal

**Files:**
- Create: `frontend/src/modules/laundry/components/BatchAssignModal.jsx`
- Modify: `frontend/src/modules/laundry/LaundryHub.jsx`
- Modify: `frontend/src/modules/laundry/components/ItemCard.jsx`
- Modify: `frontend/src/modules/laundry/api.js`

- [x] **Step 1: api.js'e batch endpoint'leri ekle**

```javascript
export const batchAssign = (item_ids, machine_id, timer_minutes) =>
  api.post('/laundry/items/batch-assign', { item_ids, machine_id, timer_minutes })

export const batchLost = (item_ids, notes) =>
  api.post('/laundry/items/batch-lost', { item_ids, notes })
```

- [x] **Step 2: BatchAssignModal.jsx oluştur**

```jsx
import { useState } from 'react'
import { useLaundryMachines } from '../hooks/useLaundry'
import { batchAssign } from '../api'

export default function BatchAssignModal({ selectedIds, onClose, onSuccess }) {
  const { data: machines = [] } = useLaundryMachines()
  const [machineId, setMachineId] = useState('')
  const [timer, setTimer] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const available = machines.filter(m => m.status === 'idle')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!machineId) return setError('Makine seçilmeli')
    setLoading(true)
    try {
      const res = await batchAssign(selectedIds, +machineId, timer ? +timer : null)
      onSuccess(res)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">{selectedIds.length} Parçayı Makineye Ata</h3>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="form-label">Makine</label>
            <select className="form-select" value={machineId} onChange={e => setMachineId(e.target.value)}>
              <option value="">Seç...</option>
              {available.map(m => (
                <option key={m.id} value={m.id}>{m.name} ({m.type})</option>
              ))}
            </select>
            {available.length === 0 && (
              <p className="text-sm text-red-500 mt-1">Boş makine yok</p>
            )}
          </div>
          <div>
            <label className="form-label">Timer (dakika, opsiyonel)</label>
            <input type="number" className="form-input" min="1" max="240"
              value={timer} onChange={e => setTimer(e.target.value)} placeholder="60" />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn-secondary" onClick={onClose}>İptal</button>
            <button type="submit" className="btn-primary" disabled={loading || !machineId}>
              {loading ? 'Atanıyor...' : 'Ata'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [x] **Step 3: ItemCard.jsx'e batch checkbox ekle**

`ItemCard.jsx`'te kart container div'ine `group` class'ı ekle ve üst köşeye checkbox koy:

```jsx
// Props'a ekle: isSelected, onToggleSelect, batchMode
// Kart container'ının başına:
{batchMode && (
  <div className="absolute top-2 left-2 z-10">
    <input
      type="checkbox"
      checked={isSelected}
      onChange={() => onToggleSelect(item.id)}
      onClick={e => e.stopPropagation()}
      className="w-4 h-4 rounded accent-blue-500"
    />
  </div>
)}
```

- [x] **Step 4: LaundryHub.jsx'e batch state ve floating bar ekle**

`LaundryHub.jsx` içine state ekle:

```jsx
const [selectedIds, setSelectedIds] = useState([])
const [batchMode, setBatchMode] = useState(false)
const [showBatchAssign, setShowBatchAssign] = useState(false)
const [showBatchLostConfirm, setShowBatchLostConfirm] = useState(false)

function toggleSelect(id) {
  setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
}

function handleBatchLost() {
  batchLost(selectedIds, null)
    .then(() => { setSelectedIds([]); setBatchMode(false); queryClient.invalidateQueries(['laundry-items']) })
}
```

Kanban header'ına ekle:
```jsx
<button
  className={`btn-sm ${batchMode ? 'btn-active' : 'btn-secondary'}`}
  onClick={() => { setBatchMode(b => !b); setSelectedIds([]) }}
>
  {batchMode ? `✓ ${selectedIds.length} seçili` : 'Toplu İşlem'}
</button>
```

Floating action bar (kanban altına):
```jsx
{batchMode && selectedIds.length > 0 && (
  <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white rounded-full px-6 py-3 flex gap-4 items-center shadow-xl z-50">
    <span className="text-sm font-medium">{selectedIds.length} kart seçildi</span>
    <button className="btn-sm bg-blue-500 hover:bg-blue-600 text-white rounded-full px-4"
      onClick={() => setShowBatchAssign(true)}>Makineye Ata</button>
    <button className="btn-sm bg-red-500 hover:bg-red-600 text-white rounded-full px-4"
      onClick={() => setShowBatchLostConfirm(true)}>Kayıp İşaretle</button>
    <button className="btn-sm text-gray-300 hover:text-white"
      onClick={() => { setSelectedIds([]); setBatchMode(false) }}>İptal</button>
  </div>
)}

{showBatchAssign && (
  <BatchAssignModal
    selectedIds={selectedIds}
    onClose={() => setShowBatchAssign(false)}
    onSuccess={() => {
      setShowBatchAssign(false); setSelectedIds([]); setBatchMode(false)
      queryClient.invalidateQueries(['laundry-items'])
    }}
  />
)}
```

- [x] **Step 5: Commit**

```bash
cd "$(git rev-parse --show-toplevel)" && git add backend/src/modules/laundry/service.js backend/src/modules/laundry/routes.js backend/src/modules/laundry/laundry.test.js frontend/src/modules/laundry/api.js frontend/src/modules/laundry/components/BatchAssignModal.jsx frontend/src/modules/laundry/LaundryHub.jsx frontend/src/modules/laundry/components/ItemCard.jsx && git commit -m "feat: laundry batch assign/lost — API + UI"
```

---

### Task 4: Backend — Makine bakım UI servisi

Mevcut `PATCH /laundry/machines/:id` zaten `status` ve `maintenance_notes` güncelleyebiliyor. Sadece frontend kısmı eksik.

**Files:**
- Modify: `frontend/src/modules/laundry/components/MachineManagerPanel.jsx`

- [x] **Step 1: MachineManagerPanel.jsx'e bakım toggle ekle**

Her makine kartında (status gösteriminin yanına) ekle:

```jsx
// machineId için bakım durumunu toggle eden handler:
function handleMaintenanceToggle(machine) {
  const isMaint = machine.status === 'maintenance'
  if (isMaint) {
    // Aktif et
    updateMachine(machine.id, { status: 'idle', maintenance_notes: null })
      .then(() => queryClient.invalidateQueries(['laundry-machines']))
  } else {
    // Bakıma al — not iste
    const note = window.prompt('Bakım notu (opsiyonel):')
    if (note === null) return // iptal
    updateMachine(machine.id, { status: 'maintenance', maintenance_notes: note || null })
      .then(() => queryClient.invalidateQueries(['laundry-machines']))
  }
}
```

Makine kart badge'ine ekle:
```jsx
{machine.status === 'maintenance' && (
  <span className="badge badge-red">Bakımda</span>
)}
<button
  className={`btn-xs ${machine.status === 'maintenance' ? 'btn-green' : 'btn-orange'}`}
  onClick={() => handleMaintenanceToggle(machine)}
>
  {machine.status === 'maintenance' ? 'Aktif Et' : 'Bakıma Al'}
</button>
{machine.maintenance_notes && (
  <p className="text-xs text-gray-500 mt-1 italic">{machine.maintenance_notes}</p>
)}
```

`api.js`'e ekle (yoksa):
```javascript
export const updateMachine = (id, data) => api.patch(`/laundry/machines/${id}`, data)
```

- [x] **Step 2: Commit**

```bash
git add frontend/src/modules/laundry/components/MachineManagerPanel.jsx frontend/src/modules/laundry/api.js && git commit -m "feat: makine bakım UI toggle"
```

---

### Task 5: Frontend — Oda bazlı kanban gruplama

**Files:**
- Modify: `frontend/src/modules/laundry/LaundryHub.jsx`

- [x] **Step 1: LaundryHub.jsx'e gruplama toggle ekle**

```jsx
const [groupByRoom, setGroupByRoom] = useState(
  () => localStorage.getItem('laundry_group_by_room') === '1'
)

function toggleGroupByRoom() {
  setGroupByRoom(v => {
    localStorage.setItem('laundry_group_by_room', v ? '0' : '1')
    return !v
  })
}
```

Kanban header'ına:
```jsx
<button
  className={`btn-sm ${groupByRoom ? 'btn-active' : 'btn-secondary'}`}
  onClick={toggleGroupByRoom}
>
  {groupByRoom ? '📦 Odaya Göre' : '📦 Odaya Göre Grupla'}
</button>
```

Kanban sütununda item render'ını değiştir — `groupByRoom` aktifken:

```jsx
function renderColumn(items) {
  if (!groupByRoom) return items.map(item => <ItemCard key={item.id} item={item} ... />)

  // Odaya göre grupla
  const groups = {}
  for (const item of items) {
    const key = item.room_no ? `${item.block}-${item.room_no}` : 'Bilinmiyor'
    if (!groups[key]) groups[key] = []
    groups[key].push(item)
  }

  return Object.entries(groups).map(([roomKey, roomItems]) => (
    <div key={roomKey} className="mb-4">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 py-1 border-b border-gray-200 mb-2">
        {roomKey} <span className="text-gray-400">({roomItems.length})</span>
      </div>
      {roomItems.map(item => <ItemCard key={item.id} item={item} ... />)}
    </div>
  ))
}
```

- [x] **Step 2: Commit**

```bash
git add frontend/src/modules/laundry/LaundryHub.jsx && git commit -m "feat: kanban oda bazlı gruplama toggle"
```

---

## FAZ 2 — Çamaşır Girme Detaylandırma + Ütü Aşaması

### Task 6: DB Migration — Faz 2

**Files:**
- Modify: `backend/src/shared/db/index.js`

- [x] **Step 1: index.js'e migration ekle**

`initDB()` fonksiyonu içinde mevcut `// ── Laundry v3 ...` bloğundan sonra ekle:

```javascript
// ── Laundry v4 — ütü aşaması + intake detay ──────────────────────────────
try { db.exec(`ALTER TABLE laundry_items ADD COLUMN needs_ironing INTEGER DEFAULT 0`) } catch(_) {}
try { db.exec(`ALTER TABLE laundry_items ADD COLUMN occupant_signature TEXT`) } catch(_) {}
try { db.exec(`ALTER TABLE laundry_damages ADD COLUMN at_intake INTEGER DEFAULT 0`) } catch(_) {}
// ironing statüsü: status CHECK constraint yeni tablo olmadan enforced edilemez (SQLite kısıtı)
// Uygulama katmanında kontrol edilir
```

- [x] **Step 2: Migration'ı test et**

```bash
cd backend && node -e "import('./src/shared/db/index.js').then(m=>m.initDB()).then(()=>console.log('OK'))"
```

Beklenen: `OK`

---

### Task 7: Backend — ironing state machine + intake detay

**Files:**
- Modify: `backend/src/modules/laundry/service.js`
- Modify: `backend/src/modules/laundry/queries.js`
- Modify: `backend/src/modules/laundry/laundry.test.js`

- [x] **Step 1: Test yaz**

```javascript
describe('ironing state machine', () => {
  test('needs_ironing=1 ise ready→ironing geçişi yapılır', () => {
    const db = getDB()
    const room = db.prepare("SELECT id FROM rooms LIMIT 1").get()
    const machine = db.prepare("SELECT id FROM laundry_machines WHERE status='idle' LIMIT 1").get()

    const id = q.insertItemQuery({ room_id: room.id, item_count: 2, needs_ironing: 1, created_by: 1 })
    // dirty → washing
    advanceItemService(id, { machine_id: machine.id }, 1)
    // washing → ready (ironing gerekli olduğu için ready değil ironing olmalı)
    advanceItemService(id, { shelf_location: 'A1' }, 1)
    const item = q.getItemQuery(id)
    expect(item.status).toBe('ironing')
  })

  test('needs_ironing=0 ise washing→ready normal akış', () => {
    const db = getDB()
    const room = db.prepare("SELECT id FROM rooms LIMIT 1").get()
    const machine = db.prepare("SELECT id FROM laundry_machines WHERE status='idle' LIMIT 1").get()

    const id = q.insertItemQuery({ room_id: room.id, item_count: 1, needs_ironing: 0, created_by: 1 })
    advanceItemService(id, { machine_id: machine.id }, 1)
    advanceItemService(id, { shelf_location: 'B2' }, 1)
    expect(q.getItemQuery(id).status).toBe('ready')
  })

  test('ironing → ready geçişi advanceItemService ile yapılır', () => {
    const db = getDB()
    const room = db.prepare("SELECT id FROM rooms LIMIT 1").get()
    const machine = db.prepare("SELECT id FROM laundry_machines WHERE status='idle' LIMIT 1").get()

    const id = q.insertItemQuery({ room_id: room.id, item_count: 1, needs_ironing: 1, created_by: 1 })
    advanceItemService(id, { machine_id: machine.id }, 1)
    advanceItemService(id, {}, 1) // washing → ironing
    advanceItemService(id, {}, 1) // ironing → ready
    expect(q.getItemQuery(id).status).toBe('ready')
  })
})
```

- [x] **Step 2: Testi çalıştır — başarısız olmalı**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js 2>&1 | tail -20
```

- [x] **Step 3: queries.js'de insertItemQuery'ye needs_ironing ekle**

`insertItemQuery` fonksiyonunu bul ve `needs_ironing` parametresini ekle:

```javascript
export function insertItemQuery({ room_id, item_count, item_details, notes, urgent, photo_url,
  phone_override, intake_name, intake_signature, clothing_items, needs_ironing, created_by }) {
  const db = getDB()
  const result = db.prepare(`
    INSERT INTO laundry_items(room_id, item_count, item_details, notes, urgent, photo_url,
      phone_override, intake_name, intake_signature, clothing_items, needs_ironing, created_by, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
  `).run(room_id, item_count, item_details||null, notes||null, urgent?1:0, photo_url||null,
    phone_override||null, intake_name||null, intake_signature||null,
    clothing_items ? (typeof clothing_items === 'string' ? clothing_items : JSON.stringify(clothing_items)) : null,
    needs_ironing ? 1 : 0, created_by)
  return result.lastInsertRowid
}
```

- [x] **Step 4: service.js'de TRANSITIONS ve advanceItemService'i güncelle**

```javascript
const TRANSITIONS = {
  dirty: 'washing',
  washing: 'ready',      // needs_ironing=1 ise 'ironing' olur — advanceItemService'de override
  ironing: 'ready',
  ready: 'delivered',
}
```

`advanceItemService` içinde `nextStatus` belirlendikten sonra override ekle:

```javascript
let nextStatus = TRANSITIONS[item.status]
if (!nextStatus) throw new Error(`"${item.status}" durumundan ilerlenemez`)

// ironing override: washing → ready yerine washing → ironing (needs_ironing=1 ise)
if (item.status === 'washing' && item.needs_ironing) {
  nextStatus = 'ironing'
}
```

- [x] **Step 5: service.js'de createItemService'e needs_ironing ekle**

```javascript
export function createItemService({ room_id, item_count, item_details, notes, urgent, photo_url,
  phone_override, intake_name, intake_signature, clothing_items, needs_ironing }, userId) {
  if (!room_id) throw new Error('Oda seçilmeli')
  if (!item_count || item_count < 1) throw new Error('Parça adedi en az 1 olmalı')

  const id = q.insertItemQuery({ room_id, item_count, item_details, notes, urgent, photo_url,
    phone_override, intake_name, intake_signature, clothing_items, needs_ironing, created_by: userId })
  // ... geri kalan aynı
```

- [x] **Step 6: Testleri çalıştır — geçmeli**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js
```

---

### Task 8: Frontend — NewItemModal intake detaylandırma + ütü toggle

**Files:**
- Modify: `frontend/src/modules/laundry/components/NewItemModal.jsx`

- [x] **Step 1: NewItemModal.jsx'te her kıyafet satırına renk + not alanı ekle**

Kıyafet satırı render'ını bul (clothing_items array'ini map eden kısım) ve her satıra ekle:

```jsx
// Mevcut { type, count } yapısını { type, count, color, note } olarak genişlet
// Her clothing row'da:
<div className="flex gap-2 items-start flex-wrap">
  {/* mevcut type seçici */}
  {/* mevcut count input */}
  <input
    type="text"
    className="form-input w-24 text-sm"
    placeholder="Renk"
    value={item.color || ''}
    onChange={e => updateClothingItem(idx, 'color', e.target.value)}
    maxLength={20}
  />
  <input
    type="text"
    className="form-input flex-1 text-sm"
    placeholder="Not (düğme eksik...)"
    value={item.note || ''}
    onChange={e => updateClothingItem(idx, 'note', e.target.value)}
    maxLength={60}
  />
</div>
```

- [x] **Step 2: Ütü checkbox ekle**

Form'da submit butonundan önce:

```jsx
<label className="flex items-center gap-2 cursor-pointer">
  <input
    type="checkbox"
    className="w-4 h-4 rounded accent-indigo-500"
    checked={needsIroning}
    onChange={e => setNeedsIroning(e.target.checked)}
  />
  <span className="text-sm font-medium text-gray-700">Ütü gerekiyor</span>
</label>
```

State ekle: `const [needsIroning, setNeedsIroning] = useState(false)`

Submit'te: `needs_ironing: needsIroning ? 1 : 0` ekle.

- [x] **Step 3: Kanban'a Ütü sütunu ekle**

`LaundryHub.jsx`'te `COLUMNS` veya sütun listesini bul. `ironing` sütununu ekle:

```javascript
const STATUSES = [
  { key: 'dirty', label: 'Kirli Sepet' },
  { key: 'washing', label: 'Yıkamada' },
  { key: 'ready', label: 'Rafta Hazır' },
  { key: 'ironing', label: 'Ütüde', hideIfEmpty: true },  // boşsa gizlenir
  // delivered sütunu gösterilmiyor (arşive taşındı)
]
```

`hideIfEmpty: true` ise ve o sütunda item yoksa sütunu render etme.

- [x] **Step 4: ItemCard.jsx'e ütü badge ekle**

```jsx
{item.needs_ironing === 1 && (
  <span className="badge badge-indigo text-xs">🧺 Ütü</span>
)}
```

- [x] **Step 5: Commit**

```bash
git add backend/src/shared/db/index.js backend/src/modules/laundry/service.js backend/src/modules/laundry/queries.js backend/src/modules/laundry/laundry.test.js frontend/src/modules/laundry/components/NewItemModal.jsx frontend/src/modules/laundry/components/ItemCard.jsx frontend/src/modules/laundry/LaundryHub.jsx && git commit -m "feat: laundry ütü aşaması + intake renk/not/ütü toggle"
```

---

## FAZ 3 — Parça Tik Kontrol Sistemi

### Task 9: DB Migration — laundry_verifications

**Files:**
- Modify: `backend/src/shared/db/index.js`

- [x] **Step 1: index.js'e tablo ekle**

`initDB()` içinde Laundry v4 bloğundan sonra:

```javascript
// ── Laundry v5 — parça doğrulama ─────────────────────────────────────────
try { db.exec(`CREATE TABLE IF NOT EXISTS laundry_verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES laundry_items(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK(stage IN ('washing_to_ready','ironing_to_ready','delivery')),
  verified_by TEXT NOT NULL,
  verified_at TEXT NOT NULL DEFAULT (datetime('now')),
  items_json TEXT NOT NULL,
  missing_notes TEXT,
  all_present INTEGER NOT NULL DEFAULT 1,
  UNIQUE(item_id, stage)
)`) } catch(_) {}

try { db.exec(`CREATE INDEX IF NOT EXISTS idx_laundry_verif_item ON laundry_verifications(item_id)`) } catch(_) {}
```

- [x] **Step 2: Migration test**

```bash
cd backend && node -e "import('./src/shared/db/index.js').then(m=>m.initDB()).then(db=>{ const r=db.prepare('SELECT name FROM sqlite_master WHERE name=?').get('laundry_verifications'); console.log(r?'OK':'FAIL') })"
```

---

### Task 10: Backend — verification endpoint

**Files:**
- Modify: `backend/src/modules/laundry/queries.js`
- Modify: `backend/src/modules/laundry/service.js`
- Modify: `backend/src/modules/laundry/routes.js`
- Modify: `backend/src/modules/laundry/laundry.test.js`

- [x] **Step 1: Test yaz**

```javascript
describe('verification', () => {
  test('washing_to_ready aşaması kaydedilir', () => {
    const db = getDB()
    const room = db.prepare("SELECT id FROM rooms LIMIT 1").get()
    const id = q.insertItemQuery({ room_id: room.id, item_count: 2, created_by: 1 })

    const items = [
      { name: 'Gömlek', count: 1, checked: true },
      { name: 'Pantolon', count: 1, checked: true },
    ]
    const result = createVerificationService(id, {
      stage: 'washing_to_ready',
      items,
      all_present: true,
      missing_notes: null,
    }, 'test_user')

    expect(result.all_present).toBe(1)
    expect(result.item_id).toBe(id)
  })

  test('aynı item+stage için ikinci kayıt hata verir', () => {
    const db = getDB()
    const room = db.prepare("SELECT id FROM rooms LIMIT 1").get()
    const id = q.insertItemQuery({ room_id: room.id, item_count: 1, created_by: 1 })
    const payload = { stage: 'washing_to_ready', items: [{ name: 'X', count: 1, checked: true }], all_present: true, missing_notes: null }
    createVerificationService(id, payload, 'user1')
    expect(() => createVerificationService(id, payload, 'user1')).toThrow()
  })

  test('eksik parça varsa missing_notes zorunlu', () => {
    const db = getDB()
    const room = db.prepare("SELECT id FROM rooms LIMIT 1").get()
    const id = q.insertItemQuery({ room_id: room.id, item_count: 2, created_by: 1 })
    expect(() => createVerificationService(id, {
      stage: 'washing_to_ready',
      items: [{ name: 'A', count: 1, checked: false }],
      all_present: false,
      missing_notes: null,
    }, 'user1')).toThrow(/not.*zorunlu/i)
  })
})
```

- [x] **Step 2: Testi çalıştır — başarısız olmalı**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js 2>&1 | tail -15
```

- [x] **Step 3: queries.js'e insertVerificationQuery ve getVerificationsForItemQuery ekle**

```javascript
export function insertVerificationQuery({ item_id, stage, verified_by, items_json, missing_notes, all_present }) {
  const db = getDB()
  const result = db.prepare(`
    INSERT INTO laundry_verifications(item_id, stage, verified_by, items_json, missing_notes, all_present)
    VALUES (?,?,?,?,?,?)
  `).run(item_id, stage, verified_by,
    typeof items_json === 'string' ? items_json : JSON.stringify(items_json),
    missing_notes || null,
    all_present ? 1 : 0)
  return db.prepare('SELECT * FROM laundry_verifications WHERE id=?').get(result.lastInsertRowid)
}

export function getVerificationsForItemQuery(itemId) {
  const db = getDB()
  return db.prepare('SELECT * FROM laundry_verifications WHERE item_id=? ORDER BY verified_at').all(itemId)
}
```

- [x] **Step 4: service.js'e createVerificationService ekle**

```javascript
export function createVerificationService(itemId, { stage, items, all_present, missing_notes }, verifiedBy) {
  const item = q.getItemQuery(itemId)
  if (!item) throw new Error('Kayıt bulunamadı')
  if (!all_present && !missing_notes?.trim()) throw new Error('Eksik parça varsa not zorunlu')

  return q.insertVerificationQuery({
    item_id: itemId,
    stage,
    verified_by: verifiedBy,
    items_json: items,
    missing_notes: missing_notes?.trim() || null,
    all_present,
  })
}

export const getVerificationsService = q.getVerificationsForItemQuery
```

- [x] **Step 5: routes.js'e endpoint ekle**

`/items/:id/damages` route'undan sonra:

```javascript
laundryRouter.post('/items/:id/verify', ...laundryFull, (req, res) => {
  try {
    const { stage, items, all_present, missing_notes } = req.body
    if (!stage || !items) return res.status(400).json({ error: 'stage ve items zorunlu' })
    const result = svc.createVerificationService(+req.params.id, { stage, items, all_present, missing_notes }, req.user.username || req.user.id)
    res.status(201).json(result)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

laundryRouter.get('/items/:id/verifications', ...laundryRead, (req, res) => {
  res.json(svc.getVerificationsService(+req.params.id))
})
```

- [x] **Step 6: Testleri çalıştır**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js
```

---

### Task 11: Frontend — ItemVerificationModal

**Files:**
- Create: `frontend/src/modules/laundry/components/ItemVerificationModal.jsx`
- Modify: `frontend/src/modules/laundry/LaundryHub.jsx`
- Modify: `frontend/src/modules/laundry/components/ItemCard.jsx`
- Modify: `frontend/src/modules/laundry/api.js`

- [x] **Step 1: api.js'e verification endpoint ekle**

```javascript
export const createVerification = (itemId, data) =>
  api.post(`/laundry/items/${itemId}/verify`, data)

export const getVerifications = (itemId) =>
  api.get(`/laundry/items/${itemId}/verifications`)
```

- [x] **Step 2: ItemVerificationModal.jsx oluştur**

```jsx
import { useState } from 'react'
import { createVerification } from '../api'

export default function ItemVerificationModal({ item, stage, onClose, onSuccess }) {
  const clothing = JSON.parse(item.clothing_items || '[]')
  const [checkedMap, setCheckedMap] = useState(() =>
    Object.fromEntries(clothing.map((c, i) => [i, true]))
  )
  const [missingNotes, setMissingNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const allChecked = Object.values(checkedMap).every(Boolean)
  const anyUnchecked = Object.values(checkedMap).some(v => !v)

  const stageLabel = {
    washing_to_ready: 'Yıkama → Raf',
    ironing_to_ready: 'Ütü → Raf',
    delivery: 'Teslim',
  }[stage]

  function toggle(idx) {
    setCheckedMap(prev => ({ ...prev, [idx]: !prev[idx] }))
  }

  async function handleSubmit(forceComplete = false) {
    if (anyUnchecked && !missingNotes.trim() && !forceComplete) {
      setError('Eksik parça varsa not girilmeli')
      return
    }
    setLoading(true)
    try {
      const items = clothing.map((c, i) => ({
        name: `${c.type}${c.color ? ' (' + c.color + ')' : ''}`,
        count: c.count,
        checked: checkedMap[i],
      }))
      await createVerification(item.id, {
        stage,
        items,
        all_present: allChecked,
        missing_notes: missingNotes.trim() || null,
      })
      onSuccess()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box max-w-md" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Parça Kontrol — {item.intake_name || `Oda ${item.room_no}`}</h3>
        <p className="text-xs text-gray-500 mb-3">Aşama: {stageLabel}</p>

        {clothing.length === 0 ? (
          <p className="text-sm text-gray-500 mb-4">Kıyafet listesi girilmemiş — doğrulama atlanabilir.</p>
        ) : (
          <div className="flex flex-col gap-2 mb-4">
            {clothing.map((c, i) => (
              <label key={i} className={`flex items-center gap-3 p-2 rounded cursor-pointer border ${checkedMap[i] ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                <input
                  type="checkbox"
                  checked={checkedMap[i]}
                  onChange={() => toggle(i)}
                  className="w-4 h-4 accent-green-500"
                />
                <span className="text-sm flex-1">
                  {c.type}{c.color ? <span className="text-gray-400"> · {c.color}</span> : null}
                  <span className="font-medium ml-1">× {c.count}</span>
                  {c.note && <span className="text-xs text-gray-400 ml-2 italic">({c.note})</span>}
                </span>
              </label>
            ))}
          </div>
        )}

        {anyUnchecked && (
          <div className="mb-4">
            <label className="form-label">⚠ Eksik parça notu</label>
            <textarea
              className="form-input w-full text-sm"
              rows={2}
              value={missingNotes}
              onChange={e => setMissingNotes(e.target.value)}
              placeholder="Hangi parça eksik, nerede olabilir..."
            />
          </div>
        )}

        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button className="btn-secondary" onClick={onClose}>İptal</button>
          {anyUnchecked && (
            <button className="btn-warning" disabled={loading || !missingNotes.trim()}
              onClick={() => handleSubmit(false)}>
              Eksikle Devam Et
            </button>
          )}
          <button className="btn-primary" disabled={loading || (!allChecked && !missingNotes.trim())}
            onClick={() => handleSubmit(true)}>
            {allChecked ? 'Tümünü Onayla' : 'Onayla'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [x] **Step 3: LaundryHub.jsx'te advance geçişinde verification modal tetikle**

`washing → ready` ve `ironing → ready` geçişlerinde önce doğrulama aç:

```jsx
// advanceItem handler'ında:
function handleAdvance(item) {
  const needsVerif = (item.status === 'washing' && !item.needs_ironing) ||
                     item.status === 'ironing'
  if (needsVerif && item.clothing_items) {
    const stage = item.status === 'washing' ? 'washing_to_ready' : 'ironing_to_ready'
    setVerificationTarget({ item, stage })
    return
  }
  // normal advance
  advanceItem(item.id, {}).then(() => queryClient.invalidateQueries(['laundry-items']))
}
```

```jsx
{verificationTarget && (
  <ItemVerificationModal
    item={verificationTarget.item}
    stage={verificationTarget.stage}
    onClose={() => setVerificationTarget(null)}
    onSuccess={() => {
      setVerificationTarget(null)
      advanceItem(verificationTarget.item.id, {})
        .then(() => queryClient.invalidateQueries(['laundry-items']))
    }}
  />
)}
```

- [x] **Step 4: ItemCard.jsx'e doğrulama rozeti ekle**

```jsx
{item.all_present === 1 && (
  <span className="badge badge-green text-xs" title="Tüm parçalar doğrulandı">✓ Doğrulandı</span>
)}
{item.all_present === 0 && (
  <span className="badge badge-orange text-xs" title={item.missing_notes}>⚠ Eksik</span>
)}
```

`getItemQuery`'ye `all_present` ve `missing_notes` JOIN ekle (`laundry_verifications` son kaydından).

- [x] **Step 5: queries.js getItemQuery güncelle**

```javascript
// queries.js içindeki getItemQuery fonksiyonunu tamamen şu hale getir:
export function getItemQuery(id) {
  const db = getDB()
  return db.prepare(`
    SELECT li.*,
      r.block, r.room_no,
      p.phone_number, p.full_name,
      lv.all_present, lv.missing_notes
    FROM laundry_items li
    LEFT JOIN rooms r ON r.id = li.room_id
    LEFT JOIN room_assignments ra ON ra.room_id = r.id AND ra.check_out_at IS NULL
    LEFT JOIN personnel p ON p.id = ra.personnel_id
    LEFT JOIN laundry_verifications lv ON lv.item_id = li.id
      AND lv.stage IN ('washing_to_ready','ironing_to_ready')
      AND lv.rowid = (
        SELECT MAX(rowid) FROM laundry_verifications
        WHERE item_id = li.id AND stage IN ('washing_to_ready','ironing_to_ready')
      )
    WHERE li.id = ?
  `).get(id)
}
```

- [x] **Step 6: Commit**

```bash
git add backend/src/shared/db/index.js backend/src/modules/laundry/queries.js backend/src/modules/laundry/service.js backend/src/modules/laundry/routes.js backend/src/modules/laundry/laundry.test.js frontend/src/modules/laundry/components/ItemVerificationModal.jsx frontend/src/modules/laundry/LaundryHub.jsx frontend/src/modules/laundry/components/ItemCard.jsx frontend/src/modules/laundry/api.js && git commit -m "feat: parça tik kontrol sistemi (laundry_verifications)"
```

---

## FAZ 4 — Arşiv Sekmesi + Tarih Filtresi

### Task 12: Backend — archive endpoint + CSV güncelleme

**Files:**
- Modify: `backend/src/modules/laundry/queries.js`
- Modify: `backend/src/modules/laundry/service.js`
- Modify: `backend/src/modules/laundry/routes.js`
- Modify: `backend/src/modules/laundry/laundry.test.js`

- [x] **Step 1: Test yaz**

```javascript
describe('archive', () => {
  test('delivered itemlar listelenir', () => {
    const db = getDB()
    const room = db.prepare("SELECT id FROM rooms LIMIT 1").get()
    const id = q.insertItemQuery({ room_id: room.id, item_count: 1, created_by: 1 })
    db.prepare("UPDATE laundry_items SET status='delivered' WHERE id=?").run(id)

    const result = archiveItemsQuery({})
    expect(result.items.some(i => i.id === id)).toBe(true)
  })

  test('tarih filtresi çalışır', () => {
    const result = archiveItemsQuery({ from: '2020-01-01', to: '2020-01-02' })
    expect(Array.isArray(result.items)).toBe(true)
  })

  test('pagination çalışır', () => {
    const r1 = archiveItemsQuery({ page: 1, limit: 2 })
    expect(r1.items.length).toBeLessThanOrEqual(2)
    expect(typeof r1.total).toBe('number')
  })
})
```

- [x] **Step 2: queries.js'e archiveItemsQuery ekle**

```javascript
export function archiveItemsQuery({ from, to, status, room, search, page = 1, limit = 50 }) {
  const db = getDB()
  const conditions = [`li.status IN ('delivered','lost')`]
  const params = []

  if (status) {
    conditions.push(`li.status = ?`)
    params.push(status)
  }
  if (from) { conditions.push(`date(li.created_at) >= date(?)`); params.push(from) }
  if (to)   { conditions.push(`date(li.created_at) <= date(?)`); params.push(to) }
  if (room) { conditions.push(`(r.block || '-' || r.room_no) = ?`); params.push(room) }
  if (search) {
    conditions.push(`(r.room_no LIKE ? OR li.intake_name LIKE ?)`)
    params.push(`%${search}%`, `%${search}%`)
  }

  const where = conditions.join(' AND ')
  const offset = (page - 1) * limit

  const total = db.prepare(`
    SELECT COUNT(*) as c FROM laundry_items li
    LEFT JOIN rooms r ON r.id = li.room_id
    WHERE ${where}
  `).get(...params).c

  const items = db.prepare(`
    SELECT li.*,
      r.block, r.room_no,
      ld.delivered_to, ld.delivered_at,
      ROUND((julianday(COALESCE(ld.delivered_at, li.updated_at)) - julianday(li.created_at)) * 24, 1) as total_hours,
      lv.all_present
    FROM laundry_items li
    LEFT JOIN rooms r ON r.id = li.room_id
    LEFT JOIN laundry_deliveries ld ON ld.item_id = li.id
    LEFT JOIN laundry_verifications lv ON lv.item_id = li.id AND lv.stage = 'washing_to_ready'
    WHERE ${where}
    ORDER BY li.updated_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset)

  return { items, total, page, limit }
}
```

- [x] **Step 3: service.js'e export ekle**

```javascript
export function archiveItemsService(filters) {
  return q.archiveItemsQuery(filters)
}
```

- [x] **Step 4: routes.js'e endpoint ekle**

`/items/batch-deliver` route'undan önce (static routes before dynamic ones):

```javascript
laundryRouter.get('/items/archive', ...laundryRead, (req, res) => {
  try {
    const { from, to, status, room, search, page, limit } = req.query
    res.json(svc.archiveItemsService({
      from, to, status, room, search,
      page: page ? +page : 1,
      limit: limit ? Math.min(+limit, 100) : 50,
    }))
  } catch (e) { res.status(500).json({ error: e.message }) }
})
```

- [x] **Step 5: CSV export'a yeni parametreler ekle**

`routes.js` içinde export route'u güncelle:

```javascript
laundryRouter.get('/reports/export', ...laundryRead, (req, res) => {
  try {
    const { from, to, status, include_verifications } = req.query
    const allItems = svc.listAllItemsService({ from, to, status })
    const baseHeader = 'ID,Blok,Oda,Durum,Parça,Acil,Notlar,Oluşturulma,Ütü'
    const verifHeader = include_verifications === '1' ? ',Doğrulandı,Eksik Not' : ''
    const header = baseHeader + verifHeader

    const rows = allItems.map(i => {
      const base = [
        i.id, i.block||'', i.room_no||'', i.status, i.item_count,
        i.urgent ? 'Evet' : 'Hayır',
        (i.notes||'').replace(/,/g,';').replace(/\n/g,' '),
        i.created_at,
        i.needs_ironing ? 'Evet' : 'Hayır',
      ]
      if (include_verifications === '1') {
        base.push(i.all_present === 1 ? 'Evet' : i.all_present === 0 ? 'Hayır' : '')
        base.push((i.missing_notes||'').replace(/,/g,';'))
      }
      return base.join(',')
    })

    const csv = [header, ...rows].join('\n')
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="camasir-${new Date().toISOString().slice(0,10)}.csv"`)
    res.send('\uFEFF' + csv)
  } catch (e) { res.status(500).json({ error: e.message }) }
})
```

- [x] **Step 6: Testleri çalıştır**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js
```

---

### Task 13: Frontend — Arşiv sekmesi + ArchiveTable + ArchiveDetailPanel

**Files:**
- Create: `frontend/src/modules/laundry/components/ArchiveTable.jsx`
- Create: `frontend/src/modules/laundry/components/ArchiveDetailPanel.jsx`
- Modify: `frontend/src/modules/laundry/LaundryHub.jsx`
- Modify: `frontend/src/modules/laundry/api.js`

- [x] **Step 1: api.js'e archive endpoint ekle**

```javascript
export const getArchive = (params) =>
  api.get('/laundry/items/archive', { params })
```

- [x] **Step 2: ArchiveTable.jsx oluştur**

```jsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getArchive } from '../api'

export default function ArchiveTable({ onSelectItem }) {
  const [filters, setFilters] = useState({ from: '', to: '', status: '', search: '', page: 1 })
  const { data, isLoading } = useQuery({
    queryKey: ['laundry-archive', filters],
    queryFn: () => getArchive(filters),
  })

  function setFilter(key, value) {
    setFilters(f => ({ ...f, [key]: value, page: 1 }))
  }

  const items = data?.items || []
  const total = data?.total || 0
  const totalPages = Math.ceil(total / 50)

  return (
    <div className="flex flex-col gap-4">
      {/* Filtre bar */}
      <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-lg">
        <input type="date" className="form-input text-sm" value={filters.from}
          onChange={e => setFilter('from', e.target.value)} placeholder="Başlangıç" />
        <input type="date" className="form-input text-sm" value={filters.to}
          onChange={e => setFilter('to', e.target.value)} placeholder="Bitiş" />
        <select className="form-select text-sm" value={filters.status}
          onChange={e => setFilter('status', e.target.value)}>
          <option value="">Tüm Durumlar</option>
          <option value="delivered">Teslim Edildi</option>
          <option value="lost">Kayıp</option>
        </select>
        <input type="search" className="form-input text-sm flex-1 min-w-32"
          value={filters.search} onChange={e => setFilter('search', e.target.value)}
          placeholder="Oda no veya isim..." />
        <div className="flex gap-1">
          {['Bugün','Bu Hafta','Bu Ay'].map((label, i) => (
            <button key={label} className="btn-xs btn-secondary"
              onClick={() => {
                const now = new Date()
                const from = new Date(now)
                if (i === 0) from.setDate(now.getDate())
                if (i === 1) from.setDate(now.getDate() - 7)
                if (i === 2) from.setDate(1)
                setFilters(f => ({ ...f, from: from.toISOString().slice(0,10), to: now.toISOString().slice(0,10), page: 1 }))
              }}
            >{label}</button>
          ))}
        </div>
      </div>

      {/* Tablo */}
      {isLoading ? (
        <div className="text-center py-8 text-gray-400">Yükleniyor...</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500 uppercase">
                  <th className="py-2 px-3">Oda</th>
                  <th className="py-2 px-3">Kişi</th>
                  <th className="py-2 px-3">Parça</th>
                  <th className="py-2 px-3">Giriş</th>
                  <th className="py-2 px-3">Teslim</th>
                  <th className="py-2 px-3">Süre</th>
                  <th className="py-2 px-3">Durum</th>
                  <th className="py-2 px-3">Doğrulama</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id} className="border-b hover:bg-gray-50 cursor-pointer"
                    onClick={() => onSelectItem(item)}>
                    <td className="py-2 px-3 font-medium">{item.block}-{item.room_no}</td>
                    <td className="py-2 px-3">{item.intake_name || '—'}</td>
                    <td className="py-2 px-3">{item.item_count}</td>
                    <td className="py-2 px-3 text-gray-500">{item.created_at?.slice(0,10)}</td>
                    <td className="py-2 px-3 text-gray-500">{item.delivered_at?.slice(0,10) || '—'}</td>
                    <td className="py-2 px-3">{item.total_hours ? `${item.total_hours}s` : '—'}</td>
                    <td className="py-2 px-3">
                      <span className={`badge ${item.status === 'delivered' ? 'badge-green' : 'badge-red'}`}>
                        {item.status === 'delivered' ? 'Teslim' : 'Kayıp'}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      {item.all_present === 1 && <span className="text-green-600 text-xs">✓</span>}
                      {item.all_present === 0 && <span className="text-orange-500 text-xs">⚠</span>}
                      {item.all_present == null && <span className="text-gray-300 text-xs">—</span>}
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-8 text-gray-400">Kayıt bulunamadı</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex justify-center gap-2">
              <button className="btn-sm btn-secondary" disabled={filters.page <= 1}
                onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}>←</button>
              <span className="text-sm py-1">{filters.page} / {totalPages} ({total} kayıt)</span>
              <button className="btn-sm btn-secondary" disabled={filters.page >= totalPages}
                onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}>→</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

- [x] **Step 3: ArchiveDetailPanel.jsx oluştur**

```jsx
import { useQuery } from '@tanstack/react-query'
import { getItemHistory, getVerifications } from '../api'

export default function ArchiveDetailPanel({ item, onClose }) {
  const { data: history = [] } = useQuery({
    queryKey: ['laundry-history', item.id],
    queryFn: () => getItemHistory(item.id),
  })
  const { data: verifications = [] } = useQuery({
    queryKey: ['laundry-verifications', item.id],
    queryFn: () => getVerifications(item.id),
  })

  const clothing = JSON.parse(item.clothing_items || '[]')

  return (
    <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-2xl z-50 overflow-y-auto">
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold">{item.block}-{item.room_no} — #{item.id}</h3>
        <button className="text-gray-400 hover:text-gray-600 text-xl" onClick={onClose}>×</button>
      </div>
      <div className="p-4 flex flex-col gap-5">
        {/* Özet */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div><span className="text-gray-500">Kişi:</span> {item.intake_name || '—'}</div>
          <div><span className="text-gray-500">Parça:</span> {item.item_count}</div>
          <div><span className="text-gray-500">Giriş:</span> {item.created_at?.slice(0,16)}</div>
          <div><span className="text-gray-500">Teslim:</span> {item.delivered_at?.slice(0,16) || '—'}</div>
          {item.total_hours && <div><span className="text-gray-500">Süre:</span> {item.total_hours}s</div>}
        </div>

        {/* Kıyafet listesi */}
        {clothing.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Kıyafetler</h4>
            <ul className="flex flex-col gap-1">
              {clothing.map((c, i) => (
                <li key={i} className="text-sm flex gap-2">
                  <span>{c.type} × {c.count}</span>
                  {c.color && <span className="text-gray-400">{c.color}</span>}
                  {c.note && <span className="text-gray-400 italic">({c.note})</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Doğrulama */}
        {verifications.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Parça Doğrulama</h4>
            {verifications.map(v => (
              <div key={v.id} className={`rounded p-2 text-sm mb-1 ${v.all_present ? 'bg-green-50' : 'bg-orange-50'}`}>
                <div className="flex justify-between">
                  <span>{v.stage === 'washing_to_ready' ? 'Yıkama sonrası' : 'Ütü sonrası'}</span>
                  <span>{v.all_present ? '✓ Tam' : '⚠ Eksik'}</span>
                </div>
                {v.missing_notes && <p className="text-xs text-gray-500 mt-1">{v.missing_notes}</p>}
                <p className="text-xs text-gray-400">{v.verified_by} · {v.verified_at?.slice(0,16)}</p>
              </div>
            ))}
          </div>
        )}

        {/* Geçmiş */}
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Geçmiş</h4>
          <div className="flex flex-col gap-1">
            {history.map(h => (
              <div key={h.id} className="text-xs flex gap-2 items-start">
                <span className="text-gray-400 shrink-0">{h.created_at?.slice(0,16)}</span>
                <span className="text-gray-600">
                  {h.from_status ? `${h.from_status} → ` : ''}{h.to_status}
                  {h.notes ? <span className="text-gray-400"> · {h.notes}</span> : null}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [x] **Step 4: LaundryHub.jsx'e Arşiv sekmesi ekle**

`LaundryHub.jsx` başına tab state ekle:

```jsx
const [activeTab, setActiveTab] = useState('kanban') // 'kanban' | 'archive' | 'reports'
const [archiveSelectedItem, setArchiveSelectedItem] = useState(null)
```

Tab bar:
```jsx
<div className="flex gap-1 border-b mb-4">
  {[['kanban','Kanban'],['archive','Arşiv'],['reports','Raporlar']].map(([key,label]) => (
    <button key={key}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${activeTab === key ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500'}`}
      onClick={() => setActiveTab(key)}>
      {label}
    </button>
  ))}
</div>
```

Ana render:
```jsx
{activeTab === 'kanban' && <KanbanView ... />}
{activeTab === 'archive' && (
  <div className="relative">
    <ArchiveTable onSelectItem={setArchiveSelectedItem} />
    {archiveSelectedItem && (
      <ArchiveDetailPanel item={archiveSelectedItem} onClose={() => setArchiveSelectedItem(null)} />
    )}
  </div>
)}
{activeTab === 'reports' && <LaundryReport />}
```

- [x] **Step 5: Commit**

```bash
git add backend/src/modules/laundry/queries.js backend/src/modules/laundry/service.js backend/src/modules/laundry/routes.js backend/src/modules/laundry/laundry.test.js frontend/src/modules/laundry/components/ArchiveTable.jsx frontend/src/modules/laundry/components/ArchiveDetailPanel.jsx frontend/src/modules/laundry/LaundryHub.jsx frontend/src/modules/laundry/api.js && git commit -m "feat: laundry arşiv sekmesi + tarih filtresi + CSV güncelleme"
```

---

## FAZ 5 — WhatsApp SLA Bildirimi

### Task 14: DB Migration — laundry_sla_notifications + laundry_global_settings

**Files:**
- Modify: `backend/src/shared/db/index.js`

- [x] **Step 1: index.js'e tablo ekle**

```javascript
// ── Laundry v6 — SLA WhatsApp bildirimleri ───────────────────────────────
try { db.exec(`CREATE TABLE IF NOT EXISTS laundry_sla_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES laundry_items(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  phone TEXT NOT NULL,
  UNIQUE(item_id, stage, date(sent_at))
)`) } catch(_) {}

try { db.exec(`CREATE TABLE IF NOT EXISTS laundry_global_settings (
  key TEXT PRIMARY KEY,
  value TEXT
)`) } catch(_) {}

try { db.exec(`ALTER TABLE laundry_sla_config ADD COLUMN whatsapp_notify INTEGER DEFAULT 0`) } catch(_) {}
```

- [x] **Step 2: Migration test**

```bash
cd backend && node -e "import('./src/shared/db/index.js').then(m=>m.initDB()).then(db=>{ const r=db.prepare('SELECT name FROM sqlite_master WHERE name=?').get('laundry_sla_notifications'); console.log(r?'OK':'FAIL') })"
```

---

### Task 15: Backend — SLA WhatsApp fonksiyonu + sla.js entegrasyonu

**Files:**
- Modify: `backend/src/modules/laundry/whatsapp.js`
- Modify: `backend/src/modules/laundry/sla.js`
- Modify: `backend/src/modules/laundry/laundry.test.js`

- [x] **Step 1: Test yaz**

```javascript
describe('SLA WhatsApp notification dedup', () => {
  test('whatsapp_notify=0 ise bildirim gönderilmez', () => {
    const db = getDB()
    // whatsapp_notify=0 (default), herhangi bir fonksiyon çağrısı sendWhatsApp'ı çağırmamalı
    // Bu testi mock ile değil, DB state ile doğrula
    db.prepare("UPDATE laundry_sla_config SET whatsapp_notify=0").run()
    // SLA kritik item oluştur
    const room = db.prepare("SELECT id FROM rooms LIMIT 1").get()
    const id = q.insertItemQuery({ room_id: room.id, item_count: 1, created_by: 1 })
    db.prepare("UPDATE laundry_items SET updated_at=datetime('now','-100 hours') WHERE id=?").run(id)

    // shouldSendSlaWhatsApp false döndürmeli
    const result = shouldSendSlaNotification(db, id, 'dirty')
    expect(result).toBe(false)
  })

  test('aynı item+stage için günde 1 kez gönderilir', () => {
    const db = getDB()
    db.prepare("UPDATE laundry_sla_config SET whatsapp_notify=1").run()
    db.prepare("INSERT OR IGNORE INTO laundry_global_settings VALUES('sla_notify_phone','905001234567')").run()
    const room = db.prepare("SELECT id FROM rooms LIMIT 1").get()
    const id = q.insertItemQuery({ room_id: room.id, item_count: 1, created_by: 1 })

    // İlk kontrol — gönderilmeli
    const first = shouldSendSlaNotification(db, id, 'dirty')
    expect(first).toBe(true)

    // Kayıt ekle (gönderilmiş gibi)
    db.prepare("INSERT INTO laundry_sla_notifications(item_id,stage,phone) VALUES(?,?,'905001234567')").run(id, 'dirty')

    // İkinci kontrol — gönderilmemeli
    const second = shouldSendSlaNotification(db, id, 'dirty')
    expect(second).toBe(false)
  })
})
```

- [x] **Step 2: Testi çalıştır — başarısız olmalı**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js 2>&1 | tail -15
```

- [x] **Step 3: whatsapp.js'e SLA mesaj fonksiyonu ekle**

```javascript
export async function sendSlaAlert(itemId, hours, db) {
  if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_ID) return

  try {
    const phoneRow = db.prepare("SELECT value FROM laundry_global_settings WHERE key='sla_notify_phone'").get()
    if (!phoneRow?.value) return

    const item = db.prepare(`
      SELECT li.status, li.item_count, li.intake_name, r.block, r.room_no
      FROM laundry_items li
      LEFT JOIN rooms r ON r.id = li.room_id
      WHERE li.id = ?
    `).get(itemId)
    if (!item) return

    const statusLabel = { dirty: 'Kirli sepette', washing: 'Makinede', ready: 'Rafta bekliyor' }[item.status] || item.status

    const msg = `🚨 SLA Kritik: ${item.block||'?'}-${item.room_no||'?'}\nDurum: ${statusLabel}\nBekleme: ${hours} saat\nParça: ${item.item_count}\n${item.intake_name ? 'Sorumlu: ' + item.intake_name : ''}`

    await sendWhatsApp(phoneRow.value, msg)

    db.prepare("INSERT OR IGNORE INTO laundry_sla_notifications(item_id,stage,phone) VALUES(?,?,?)")
      .run(itemId, item.status, phoneRow.value)
  } catch (e) {
    console.error('[WhatsApp SLA] Hata:', e.message)
  }
}
```

- [x] **Step 4: shouldSendSlaNotification yardımcı fonksiyon ekle (whatsapp.js'e)**

```javascript
export function shouldSendSlaNotification(db, itemId, stage) {
  const config = db.prepare("SELECT whatsapp_notify FROM laundry_sla_config WHERE stage=?").get(stage)
  if (!config?.whatsapp_notify) return false

  const alreadySent = db.prepare(`
    SELECT id FROM laundry_sla_notifications
    WHERE item_id=? AND stage=? AND date(sent_at)=date('now')
  `).get(itemId, stage)
  return !alreadySent
}
```

- [x] **Step 5: sla.js'e WhatsApp entegrasyonu ekle**

`checkSlaViolations` fonksiyonunu güncelle:

```javascript
import { sendSlaAlert, shouldSendSlaNotification } from './whatsapp.js'

export async function checkSlaViolations() {
  const db = getDB()
  const violations = db.prepare(`
    SELECT li.id, li.status, li.item_count,
           r.block, r.room_no,
           ROUND((julianday('now') - julianday(COALESCE(li.updated_at, li.created_at))) * 24, 1) as hours,
           sc.warning_hours, sc.critical_hours
    FROM laundry_items li
    LEFT JOIN rooms r ON r.id = li.room_id
    LEFT JOIN laundry_sla_config sc ON sc.stage = li.status
    WHERE li.status IN ('dirty','washing','ready')
      AND sc.warning_hours IS NOT NULL
      AND ROUND((julianday('now') - julianday(COALESCE(li.updated_at, li.created_at))) * 24, 1) >= sc.warning_hours
  `).all()

  for (const v of violations) {
    const isCritical = v.hours >= v.critical_hours
    const label = { dirty: 'Kirli sepette', washing: 'Makinede', ready: 'Rafta hazır' }[v.status]

    createNotification({
      message: `SLA ${isCritical ? 'KRİTİK' : 'UYARI'}: ${v.block || '?'} ${v.room_no || '?'} — ${label} ${v.hours} saattir`,
      type: isCritical ? 'critical' : 'warning',
      module: 'laundry',
      target_role: isCritical ? null : 'shift_supervisor',
    })

    // Kritik ihlalde WhatsApp — günde 1 kez
    if (isCritical && shouldSendSlaNotification(db, v.id, v.status)) {
      sendSlaAlert(v.id, v.hours, db).catch(() => {})
    }
  }

  return violations.length
}
```

`checkSlaViolations` artık async olduğu için cron dosyasındaki çağrıyı kontrol et.

- [x] **Step 6: Testleri çalıştır**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js
```

---

### Task 16: Frontend — SLA WhatsApp ayarları

**Files:**
- Modify: `frontend/src/modules/laundry/LaundrySettings.jsx`
- Modify: `frontend/src/modules/laundry/api.js`
- Modify: `backend/src/modules/laundry/routes.js`

- [x] **Step 1: routes.js'e global settings endpoint'leri ekle**

```javascript
// SLA global settings
laundryRouter.get('/settings', ...laundryRead, (req, res) => {
  try {
    const db = getDB()
    const rows = db.prepare('SELECT key, value FROM laundry_global_settings').all()
    const settings = Object.fromEntries(rows.map(r => [r.key, r.value]))
    res.json(settings)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

laundryRouter.put('/settings', ...slaWrite, (req, res) => {
  try {
    const db = getDB()
    const { key, value } = req.body
    if (!key) return res.status(400).json({ error: 'key zorunlu' })
    db.prepare('INSERT OR REPLACE INTO laundry_global_settings(key,value) VALUES(?,?)').run(key, value)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})
```

- [x] **Step 2: api.js'e settings endpoint ekle**

```javascript
export const getLaundrySettings = () => api.get('/laundry/settings')
export const updateLaundrySetting = (key, value) => api.put('/laundry/settings', { key, value })
export const updateSlaConfig = (stage, data) => api.put('/laundry/sla-config', { stage, ...data })
```

- [x] **Step 3: LaundrySettings.jsx'e SLA bildirim bölümü ekle**

Mevcut SLA bölümünden sonra ekle:

```jsx
// State
const [notifyPhone, setNotifyPhone] = useState('')
const { data: globalSettings } = useQuery({
  queryKey: ['laundry-global-settings'],
  queryFn: getLaundrySettings,
})
useEffect(() => {
  if (globalSettings?.sla_notify_phone) {
    setNotifyPhone(globalSettings.sla_notify_phone)
  }
}, [globalSettings])

// UI (SLA kartlarının altına)
<div className="card p-4 mt-4">
  <h3 className="font-semibold mb-3">SLA WhatsApp Bildirimleri</h3>
  <p className="text-sm text-gray-500 mb-3">
    Kritik SLA ihlali tespit edildiğinde belirtilen numaraya WhatsApp mesajı gönderilir (günde 1 kez).
  </p>
  <div className="flex flex-col gap-3">
    {slaConfig.map(cfg => (
      <label key={cfg.stage} className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={cfg.whatsapp_notify === 1}
          onChange={e => updateSlaConfig(cfg.stage, { whatsapp_notify: e.target.checked ? 1 : 0, warning_hours: cfg.warning_hours, critical_hours: cfg.critical_hours })
            .then(() => queryClient.invalidateQueries(['laundry-sla-config']))
          }
          className="w-4 h-4 accent-green-500"
        />
        <span className="text-sm capitalize">{cfg.stage} aşaması kritik ihlali</span>
      </label>
    ))}
    <div className="flex gap-2 items-center mt-2">
      <input
        type="tel"
        className="form-input flex-1"
        placeholder="905xxxxxxxxx"
        value={notifyPhone}
        onChange={e => setNotifyPhone(e.target.value)}
      />
      <button className="btn-primary"
        onClick={() => updateLaundrySetting('sla_notify_phone', notifyPhone)
          .then(() => queryClient.invalidateQueries(['laundry-global-settings']))
        }>
        Kaydet
      </button>
    </div>
  </div>
</div>
```

- [x] **Step 4: Tüm testleri çalıştır**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js
```

Beklenen: Tüm testler PASS

- [x] **Step 5: Final commit**

```bash
git add backend/src/shared/db/index.js backend/src/modules/laundry/whatsapp.js backend/src/modules/laundry/sla.js backend/src/modules/laundry/routes.js backend/src/modules/laundry/laundry.test.js frontend/src/modules/laundry/LaundrySettings.jsx frontend/src/modules/laundry/api.js && git commit -m "feat: WhatsApp SLA kritik bildirimi + global settings"
```

---

## Tüm Fazları Çalıştırma Doğrulaması

Her faz sonrası:

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js
```

Son kontrol:
```bash
npm run dev
```

Tarayıcıda:
1. Yeni çamaşır ekle — ütü seçeneği ve renk/not alanları görünüyor mu?
2. 2+ kirli kart seç — floating bar çıkıyor mu?
3. Makine bakım toggle çalışıyor mu?
4. Oda gruplama toggle çalışıyor mu?
5. Arşiv sekmesi açılıyor mu?
6. LaundrySettings'te SLA bildirim toggle'ları var mı?
