# L2: Son İşlemler + Geri Alma (Ctrl+Z) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Çamaşırhane modülüne session bazlı undo stack ekle — her işlem sonrası "Geri Al" toast, Ctrl+Z ile açılan 10-kayıt geçmiş paneli.

**Architecture:** Frontend Zustand store'da LIFO stack (max 10), her mutation `onSuccess`'te push. Toast ve panel, store'daki `undo()` fonksiyonunu çağırır. Backend'de mevcut `revertItem` genişletilir + `deleteDamage` endpoint'i eklenir.

**Tech Stack:** React, Zustand, React Query (`@tanstack/react-query`), Express, better-sqlite3, vitest

---

## Dosya Haritası

| Dosya | Değişiklik |
|-------|-----------|
| `backend/src/modules/laundry/service.js` | `revertItemService` genişlet + `deleteDamageService` ekle |
| `backend/src/modules/laundry/queries.js` | `deleteDamageQuery` ekle |
| `backend/src/modules/laundry/routes.js` | `DELETE /damages/:id` ekle |
| `backend/src/modules/laundry/laundry.test.js` | Yeni revert + damage delete testleri |
| `frontend/src/shared/store/useUndoStore.js` | **YENİ** — Zustand undo stack store |
| `frontend/src/shared/store/toastStore.js` | `addToast` → `onUndo` callback desteği |
| `frontend/src/shared/components/ToastContainer.jsx` | "Geri Al" butonu render |
| `frontend/src/modules/laundry/components/UndoPanel.jsx` | **YENİ** — floating Ctrl+Z paneli |
| `frontend/src/modules/laundry/api.js` | `deleteDamage` ekle |
| `frontend/src/modules/laundry/LaundryHub.jsx` | Undo store wire + UndoPanel + Ctrl+Z |

---

## Task 1: Backend — revertItemService Genişlet + deleteDamage

**Files:**
- Modify: `backend/src/modules/laundry/service.js:242-277`
- Modify: `backend/src/modules/laundry/queries.js`
- Modify: `backend/src/modules/laundry/routes.js`

- [ ] **Step 1: `queries.js`'e `deleteDamageQuery` ekle**

`backend/src/modules/laundry/queries.js` dosyasının sonuna (export'lar bölümünden önce) ekle:

```js
export function deleteDamageQuery(damageId) {
  const db = getDB()
  const r = db.prepare(`DELETE FROM laundry_damages WHERE id = ?`).run(damageId)
  return r.changes > 0
}
```

- [ ] **Step 2: `service.js`'de `revertItemService` validReverts'i genişlet**

`backend/src/modules/laundry/service.js` dosyasında `revertItemService` fonksiyonunu bul (satır ~242). `validReverts` satırını şu şekilde değiştir:

```js
// ÖNCE:
const validReverts = { washing: ['dirty'], ready: ['washing', 'dirty'] }

// SONRA:
const validReverts = {
  washing:   ['dirty'],
  ironing:   ['dirty'],
  ready:     ['washing', 'dirty', 'lost'],
  delivered: ['ready'],
  lost:      ['dirty'],
}
```

- [ ] **Step 3: `revertItemService`'de `delivered → ready` ve `lost → dirty` mantığı ekle**

Aynı fonksiyonda `if (item.status === 'ready' && targetStatus === 'dirty')` bloğunun hemen ardına ekle:

```js
if (item.status === 'delivered' && targetStatus === 'ready') {
  // Teslim geri alınır — imza logu laundry_history'de kalır
  // extra yok, sadece status değişir
}

if (item.status === 'lost' && targetStatus === 'dirty') {
  // Kayıp geri alınır
  extra.shelf_location = null
}

if (item.status === 'ready' && targetStatus === 'lost') {
  // Bulunan geri alınır (found undo)
  extra.shelf_location = null
}

if (item.status === 'ironing' && targetStatus === 'dirty') {
  // ironing → dirty: önceki makine zaten serbest bırakılmıştı
}
```

- [ ] **Step 4: `service.js`'e `deleteDamageService` ekle**

`reportDamageService` fonksiyonunun hemen altına:

```js
export function deleteDamageService(damageId, userId) {
  const db = getDB()
  const damage = db.prepare(`SELECT * FROM laundry_damages WHERE id = ?`).get(damageId)
  if (!damage) throw new Error('Hasar kaydı bulunamadı')
  const ok = q.deleteDamageQuery(damageId)
  if (!ok) throw new Error('Hasar silinemedi')
  logAudit(userId, 'laundry_damage_delete', 'laundry', damageId, 'Geri alındı')
}
```

- [ ] **Step 5: `routes.js`'e `DELETE /damages/:id` ekle**

`routes.js`'de hasar routes bloğuna (laundryRouter.post('/items/:id/damages' satırının altına):

```js
laundryRouter.delete('/damages/:id', ...laundryFull, (req, res) => {
  try {
    svc.deleteDamageService(+req.params.id, req.user.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})
```

---

## Task 2: Backend Testleri

**Files:**
- Modify: `backend/src/modules/laundry/laundry.test.js`

- [ ] **Step 1: Yeni describe bloğunu dosyaya ekle**

`laundry.test.js` sonuna şu bloğu ekle:

```js
describe('Undo — revert genişletilmiş', () => {
  it('delivered → ready geri alınır', () => {
    const { revertItemService, createItemService, advanceItemService, deliverItemService } = require('./service.js')
    // createItemService zaten import'lu — yukardaki import satırına bak
    const id = createItemService({ room_id: roomId, item_count: 1 }, userId).id
    const db = getDB()
    const machineId = db.prepare("SELECT id FROM laundry_machines LIMIT 1").get()?.id
    if (!machineId) return // makine yoksa skip
    advanceItemService(id, { machine_id: machineId }, userId)
    advanceItemService(id, {}, userId) // → ready
    deliverItemService(id, { delivered_to: 'Test' }, userId)
    const reverted = revertItemService(id, 'ready', userId)
    expect(reverted.status).toBe('ready')
  })

  it('lost → dirty geri alınır', () => {
    const { revertItemService, createItemService, lostItemService } = require('./service.js')
    const id = createItemService({ room_id: roomId, item_count: 1 }, userId).id
    lostItemService(id, {}, userId)
    const reverted = revertItemService(id, 'dirty', userId)
    expect(reverted.status).toBe('dirty')
  })

  it('damage silinir', () => {
    const { reportDamageService, deleteDamageService, createItemService } = require('./service.js')
    const id = createItemService({ room_id: roomId, item_count: 1 }, userId).id
    reportDamageService(id, { description: 'Test hasar' }, userId)
    const db = getDB()
    const damage = db.prepare(`SELECT id FROM laundry_damages WHERE item_id = ? LIMIT 1`).get(id)
    expect(damage).toBeTruthy()
    deleteDamageService(damage.id, userId)
    const after = db.prepare(`SELECT id FROM laundry_damages WHERE id = ?`).get(damage.id)
    expect(after).toBeUndefined()
  })
})
```

**Not:** `service.js` import'u dosyanın başında zaten ES module `import` ile yapılıyor. `lostItemService` ve `deleteDamageService`'i üstteki import satırına ekle.

- [ ] **Step 2: Testleri çalıştır**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js
```

Expected: Tüm testler PASS (yeni 3 test dahil)

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/laundry/service.js backend/src/modules/laundry/queries.js backend/src/modules/laundry/routes.js backend/src/modules/laundry/laundry.test.js
git commit -m "feat: revertItem genişlet (delivered/lost/ironing) + deleteDamage endpoint"
```

---

## Task 3: Frontend — useUndoStore

**Files:**
- Create: `frontend/src/shared/store/useUndoStore.js`

- [ ] **Step 1: Store dosyasını oluştur**

```js
// frontend/src/shared/store/useUndoStore.js
import { create } from 'zustand'

let _nextId = 1

export const useUndoStore = create((set, get) => ({
  stack: [], // [{ id, label, timestamp, undo }], max 10, LIFO

  push({ label, undo }) {
    const entry = { id: _nextId++, label, timestamp: Date.now(), undo }
    set(s => ({ stack: [entry, ...s.stack].slice(0, 10) }))
    return entry.id
  },

  remove(id) {
    set(s => ({ stack: s.stack.filter(e => e.id !== id) }))
  },

  peek() {
    return get().stack[0] || null
  },

  clear() {
    set({ stack: [] })
  },
}))
```

- [ ] **Step 2: Manuel test — browser console'da kontrol**

Sonraki task'larda UI bağlanacak. Şimdi store'un export edildiğini doğrulamak yeterli. Build hatasız geçmeli:

```bash
cd frontend && npx vite build --mode development 2>&1 | tail -5
```

Expected: No errors (warnings ok)

---

## Task 4: Toast Store — onUndo Callback Desteği

**Files:**
- Modify: `frontend/src/shared/store/toastStore.js`
- Modify: `frontend/src/shared/components/ToastContainer.jsx`

- [ ] **Step 1: `toastStore.js`'i güncelle**

Mevcut `addToast(message, type)` imzasını değiştirmeden, opsiyonel 3. parametre olarak `onUndo` ekle:

```js
// frontend/src/shared/store/toastStore.js
import { create } from 'zustand'

let toastId = 0

export const useToastStore = create(set => ({
  toasts: [],
  addToast: (message, type = 'error', onUndo = null) => {
    const id = ++toastId
    set(s => ({ toasts: [...s.toasts, { id, message, type, onUndo }] }))
    setTimeout(() => {
      set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }))
    }, 5000)
  },
  removeToast: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}))
```

- [ ] **Step 2: `ToastContainer.jsx`'i güncelle — "Geri Al" butonu**

```jsx
// frontend/src/shared/components/ToastContainer.jsx
import { useToastStore } from '../store/toastStore.js'

const TYPE_STYLES = {
  error:   { background: 'var(--red)',               color: '#fff' },
  warning: { background: 'var(--amber, #f0a500)',    color: '#000' },
  success: { background: 'var(--green)',              color: '#fff' },
  info:    { background: 'var(--surface3)',           color: 'var(--text)' },
}

export default function ToastContainer() {
  const toasts     = useToastStore(s => s.toasts)
  const removeToast = useToastStore(s => s.removeToast)

  if (toasts.length === 0) return null

  return (
    <div style={{
      position: 'fixed', bottom: '20px', right: '20px', zIndex: 10000,
      display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '420px',
    }}>
      {toasts.map(t => (
        <div
          key={t.id}
          style={{
            ...TYPE_STYLES[t.type] || TYPE_STYLES.error,
            padding: '10px 16px',
            borderRadius: '6px',
            fontFamily: 'var(--mono)',
            fontSize: '12px',
            letterSpacing: '0.5px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            animation: 'fadeIn 0.2s ease',
            display: 'flex', alignItems: 'center', gap: 10,
          }}
        >
          <span style={{ flex: 1, cursor: 'pointer' }} onClick={() => removeToast(t.id)}>
            {t.message}
          </span>
          {t.onUndo && (
            <button
              onClick={(e) => { e.stopPropagation(); t.onUndo(); removeToast(t.id) }}
              style={{
                background: 'rgba(255,255,255,0.25)', border: 'none',
                borderRadius: 4, padding: '2px 8px', cursor: 'pointer',
                fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700,
                color: 'inherit', whiteSpace: 'nowrap',
              }}
            >
              ↩ Geri Al
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Görsel kontrol**

Dev server çalışıyorsa herhangi bir sayfada toast görünümü bozulmadığını kontrol et. Mevcut toast'lar hâlâ çalışmalı.

---

## Task 5: UndoPanel Bileşeni

**Files:**
- Create: `frontend/src/modules/laundry/components/UndoPanel.jsx`

- [ ] **Step 1: Bileşeni oluştur**

```jsx
// frontend/src/modules/laundry/components/UndoPanel.jsx
import { useUndoStore } from '../../../shared/store/useUndoStore.js'
import { useToastStore } from '../../../shared/store/toastStore.js'

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return `${diff} sn önce`
  const m = Math.floor(diff / 60)
  return `${m} dk önce`
}

export default function UndoPanel({ onClose }) {
  const stack      = useUndoStore(s => s.stack)
  const remove     = useUndoStore(s => s.remove)
  const addToast   = useToastStore(s => s.addToast)

  const handleUndo = async (entry) => {
    try {
      await entry.undo()
      remove(entry.id)
      addToast(`Geri alındı: ${entry.label}`, 'success')
    } catch (err) {
      addToast(err.message || 'Geri alma başarısız', 'error')
    }
  }

  return (
    <div style={{
      position: 'fixed', bottom: 80, right: 20, zIndex: 9999,
      background: 'var(--surface2)', border: '1px solid var(--border)',
      borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      width: 340, maxHeight: 420, display: 'flex', flexDirection: 'column',
      fontFamily: 'var(--mono)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', borderBottom: '1px solid var(--border)',
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', letterSpacing: 1 }}>
          SON İŞLEMLER
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 9, color: 'var(--text3)' }}>Ctrl+Z</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14, lineHeight: 1 }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Liste */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {stack.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 11 }}>
            Henüz işlem yok
          </div>
        ) : stack.map(entry => (
          <div
            key={entry.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 14px', borderBottom: '1px solid var(--border)',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {entry.label}
              </div>
              <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 2 }}>
                {timeAgo(entry.timestamp)}
              </div>
            </div>
            <button
              onClick={() => handleUndo(entry)}
              style={{
                background: 'var(--surface3)', border: '1px solid var(--border)',
                borderRadius: 4, padding: '3px 10px', cursor: 'pointer',
                fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)',
                whiteSpace: 'nowrap', fontWeight: 700,
              }}
            >
              ↩ Geri Al
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

## Task 6: api.js — deleteDamage Ekle

**Files:**
- Modify: `frontend/src/modules/laundry/api.js`

- [ ] **Step 1: `deleteDamage` metodunu ekle**

`laundryApi` objesinde `reportDamage` satırının hemen altına:

```js
deleteDamage: (damageId) => api.delete(`/laundry/damages/${damageId}`).then(r => r.data),
```

---

## Task 7: LaundryHub — Undo Wiring

**Files:**
- Modify: `frontend/src/modules/laundry/LaundryHub.jsx`

Bu task'ta LaundryHub'daki mutation'lara undo push eklenir ve UndoPanel entegre edilir.

- [ ] **Step 1: Import'ları ekle**

`LaundryHub.jsx` dosyasının import bölümüne:

```js
import { useUndoStore }  from '../../shared/store/useUndoStore.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import UndoPanel         from './components/UndoPanel.jsx'
```

- [ ] **Step 2: Store hook'larını ekle**

`LaundryHub` fonksiyonunun başında (diğer `useState`/`useQuery` satırlarının yanına):

```js
const pushUndo   = useUndoStore(s => s.push)
const removeUndo = useUndoStore(s => s.remove)
const addToast   = useToastStore(s => s.addToast)
const [undoPanelOpen, setUndoPanelOpen] = useState(false)
```

- [ ] **Step 3: Ctrl+Z keyboard listener ekle**

`LaundryHub` içinde `useEffect` ile (diğer `useEffect`'lerin yanına):

```js
useEffect(() => {
  const handleKey = async (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault()
      setUndoPanelOpen(prev => !prev)
    }
  }
  window.addEventListener('keydown', handleKey)
  return () => window.removeEventListener('keydown', handleKey)
}, [])
```

- [ ] **Step 4: advance mutation'a undo push ekle**

LaundryHub'da `advanceMutation` (useMutation ile tanımlı) bulun. `onSuccess` callback'i yoksa ekle, varsa içine ekle. Prevstatus'u mutate çağrısından önce cache'den al:

```js
// advanceMutation'ı KULLANIRKEN (handleAdvance veya DnD drop handler'da):
// Örn:
const handleAdvanceWithUndo = (itemId, extra = {}) => {
  const items = queryClient.getQueryData(['laundry-items']) || []
  const prev = items.find(i => i.id === itemId)
  const prevStatus = prev?.status
  const prevMachineId = prev?.machine_id

  advanceMutation.mutate({ id: itemId, ...extra }, {
    onSuccess: (newItem) => {
      const STATUS_TR = { washing: 'Yıkamaya atandı', ironing: 'Ütüye alındı', ready: 'Rafa alındı', delivered: 'Teslim edildi' }
      const label = `Oda ${newItem.room_no} — ${STATUS_TR[newItem.status] || newItem.status}`
      const entryId = pushUndo({
        label,
        undo: async () => {
          await laundryApi.revertItem(itemId, prevStatus)
          queryClient.invalidateQueries({ queryKey: ['laundry-items'] })
        },
      })
      addToast(label, 'success', async () => {
        try {
          await laundryApi.revertItem(itemId, prevStatus)
          queryClient.invalidateQueries({ queryKey: ['laundry-items'] })
          removeUndo(entryId)
          addToast('Geri alındı', 'info')
        } catch (err) {
          addToast(err.message || 'Geri alma başarısız', 'error')
        }
      })
    },
  })
}
```

**Not:** Mevcut `advanceMutation.mutate` çağrılarını `handleAdvanceWithUndo` çağrısıyla değiştir. LaundryHub'da advance çağrısı yapılan her yeri (ItemCard'dan callback, DnD drop) bul ve güncelle.

- [ ] **Step 5: deliver mutation'a undo push ekle**

Deliver mutation `onSuccess`'ine:

```js
onSuccess: (newItem) => {
  const label = `Oda ${newItem.room_no} — Teslim edildi`
  const entryId = pushUndo({
    label,
    undo: async () => {
      await laundryApi.revertItem(newItem.id, 'ready')
      queryClient.invalidateQueries({ queryKey: ['laundry-items'] })
    },
  })
  addToast(label, 'success', async () => {
    try {
      await laundryApi.revertItem(newItem.id, 'ready')
      queryClient.invalidateQueries({ queryKey: ['laundry-items'] })
      removeUndo(entryId)
      addToast('Teslim geri alındı', 'info')
    } catch (err) {
      addToast(err.message || 'Geri alma başarısız', 'error')
    }
  })
}
```

- [ ] **Step 6: create mutation'a undo push ekle**

Create mutation `onSuccess`'ine:

```js
onSuccess: (newItem) => {
  const label = `Yeni kayıt — Oda ${newItem.room_no} (${newItem.item_count} parça)`
  const entryId = pushUndo({
    label,
    undo: async () => {
      await laundryApi.deleteItem(newItem.id)
      queryClient.invalidateQueries({ queryKey: ['laundry-items'] })
    },
  })
  addToast(label, 'success', async () => {
    try {
      await laundryApi.deleteItem(newItem.id)
      queryClient.invalidateQueries({ queryKey: ['laundry-items'] })
      removeUndo(entryId)
      addToast('Kayıt silindi', 'info')
    } catch (err) {
      addToast(err.message || 'Geri alma başarısız', 'error')
    }
  })
}
```

- [ ] **Step 7: lost mutation'a undo push ekle**

Lost mutation `onSuccess`'ine:

```js
onSuccess: (newItem) => {
  const items = queryClient.getQueryData(['laundry-items']) || []
  const label = `Oda ${newItem.room_no} — Kayıp işaretlendi`
  const entryId = pushUndo({
    label,
    undo: async () => {
      await laundryApi.revertItem(newItem.id, 'dirty')
      queryClient.invalidateQueries({ queryKey: ['laundry-items'] })
    },
  })
  addToast(label, 'warning', async () => {
    try {
      await laundryApi.revertItem(newItem.id, 'dirty')
      queryClient.invalidateQueries({ queryKey: ['laundry-items'] })
      removeUndo(entryId)
      addToast('Kayıp geri alındı', 'info')
    } catch (err) {
      addToast(err.message || 'Geri alma başarısız', 'error')
    }
  })
}
```

- [ ] **Step 8: damage mutation'a undo push ekle**

Damage mutation `onSuccess`'ine (damage response'da yeni kaydın id'si olmalı — `damages` array'inin son elemanı):

```js
onSuccess: (damages, variables) => {
  const lastDamage = damages[damages.length - 1]
  if (!lastDamage) return
  const label = `Hasar kaydedildi — #${variables.itemId}`
  const entryId = pushUndo({
    label,
    undo: async () => {
      await laundryApi.deleteDamage(lastDamage.id)
      queryClient.invalidateQueries({ queryKey: ['laundry-items'] })
    },
  })
  addToast(label, 'warning', async () => {
    try {
      await laundryApi.deleteDamage(lastDamage.id)
      queryClient.invalidateQueries({ queryKey: ['laundry-items'] })
      removeUndo(entryId)
      addToast('Hasar kaydı silindi', 'info')
    } catch (err) {
      addToast(err.message || 'Geri alma başarısız', 'error')
    }
  })
}
```

- [ ] **Step 9: UndoPanel ve floating buton ekle**

LaundryHub'un return JSX'inde (en dış `div`'in içinde, diğer modal'larla aynı seviyede):

```jsx
{/* Undo Panel */}
{undoPanelOpen && <UndoPanel onClose={() => setUndoPanelOpen(false)} />}

{/* Floating Undo Button */}
<button
  onClick={() => setUndoPanelOpen(prev => !prev)}
  title="Son İşlemler (Ctrl+Z)"
  style={{
    position: 'fixed', bottom: 24, right: 24, zIndex: 9998,
    width: 40, height: 40, borderRadius: '50%',
    background: 'var(--surface2)', border: '1px solid var(--border)',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 16, color: 'var(--text2)',
  }}
>
  ↩
</button>
```

- [ ] **Step 10: Manuel test**

Dev server'ı başlat (`npm run dev`). Çamaşırhane sayfasını aç:
1. Yeni kayıt ekle → sağ altta "Yeni kayıt — Oda X" toast'ı ve "Geri Al" butonu görmeli
2. "Geri Al" tıkla → kayıt silinmeli, success toast gelmeli
3. Bir kayıt advance et → toast + geri al çalışmalı
4. Ctrl+Z → UndoPanel açılmalı, son 10 işlem listeli
5. Panel içindeki "↩ Geri Al" butonu çalışmalı

- [ ] **Step 11: Commit**

```bash
git add frontend/src/shared/store/useUndoStore.js frontend/src/shared/store/toastStore.js frontend/src/shared/components/ToastContainer.jsx frontend/src/modules/laundry/components/UndoPanel.jsx frontend/src/modules/laundry/api.js frontend/src/modules/laundry/LaundryHub.jsx
git commit -m "feat: L2 undo stack — toast + Ctrl+Z panel + mutation wiring"
```

---

## Self-Review Notları

- `revertItemService` genişletmesi mevcut testleri bozmaz: eski `validReverts` alt kümesi korunur ✓
- `deleteDamage` endpoint'i `laundryFull` yetkisi gerektirir — laundry + campus_manager ✓
- `useUndoStore` sayfa yenilenince sıfırlanır (Zustand persist yok) — spec ile uyumlu ✓
- Toast `onUndo` callback'i Zustand store'da fonksiyon olarak tutulabilir ✓
- Floating buton ToastContainer'la çakışmaması için `bottom: 24, right: 24` — ToastContainer `bottom: 20, right: 20` ama daha geniş → z-index farkıyla ayırt edilir ✓
