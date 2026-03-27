# LaundryHub Yeniden Tasarım — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `LaundryPage` + `LaundryDashboard`'u tek `LaundryHub` bileşeninde birleştir; tüm `prompt()`/`confirm()` kullanımlarını modal ile değiştir; makine timer backend'de set edilsin; MachineStrip hataları düzeltilsin; SSE ile gerçek zamanlı invalidation eklensin.

**Architecture:** Backend minimal değişiklik (timer_minutes support + timer_started_at column). Frontend: 5 yeni bileşen (AssignModal, ShelfModal, LostModal, MachineManagerPanel, LaundryHub), 1 yeni hook (useLaundrySSE), 2 mevcut bileşen güncellendi (ItemCard, MachineStrip), 1 routing değişikliği (App.jsx).

**Tech Stack:** React 18, TanStack Query v5, Zustand, Express.js, better-sqlite3, Vitest + supertest

---

## Dosya Haritası

```
YENİ:
  frontend/src/modules/laundry/LaundryHub.jsx
  frontend/src/modules/laundry/components/AssignModal.jsx
  frontend/src/modules/laundry/components/ShelfModal.jsx
  frontend/src/modules/laundry/components/LostModal.jsx
  frontend/src/modules/laundry/components/MachineManagerPanel.jsx
  frontend/src/shared/hooks/useLaundrySSE.js

GÜNCELLENEN:
  backend/src/shared/db/index.js          — timer_started_at kolonu ALTER TABLE
  backend/src/modules/laundry/queries.js  — timer_started_at allowed fields
  backend/src/modules/laundry/service.js  — timer_end + timer_started_at dirty→washing
  backend/src/modules/laundry/routes.js   — timer_minutes parametresi
  backend/src/modules/laundry/laundry.test.js — yeni test case
  frontend/src/modules/laundry/components/ItemCard.jsx    — modal entegrasyonu
  frontend/src/modules/laundry/components/MachineStrip.jsx — hata düzeltmeleri
  frontend/src/App.jsx                    — routing güncelleme

SİLİNECEK:
  frontend/src/modules/laundry/LaundryPage.jsx
  frontend/src/modules/laundry/LaundryDashboard.jsx
```

---

## Task 1: Backend — timer_minutes + timer_started_at

**Files:**
- Modify: `backend/src/shared/db/index.js`
- Modify: `backend/src/modules/laundry/queries.js`
- Modify: `backend/src/modules/laundry/service.js`
- Modify: `backend/src/modules/laundry/routes.js`
- Test: `backend/src/modules/laundry/laundry.test.js`

- [ ] **Step 1: `db/index.js`'e ALTER TABLE ekle**

`laundry_machines` tablosuna `timer_started_at` kolonu ekle. `initDB` fonksiyonunda mevcut `try { db.exec(...) } catch(_) {}` bloklarının **sonrasına** (yaklaşık satır 287'den sonra) şu bloğu ekle:

```js
try {
  db.exec(`ALTER TABLE laundry_machines ADD COLUMN timer_started_at TEXT`)
} catch(_) {}
```

- [ ] **Step 2: `queries.js`'te allowed fields güncelle**

`updateMachineQuery` fonksiyonundaki `allowed` dizisine `timer_started_at` ekle:

```js
// Öncesi:
const allowed = ['name', 'type', 'status', 'timer_end', 'capacity_kg', 'maintenance_notes']
// Sonrası:
const allowed = ['name', 'type', 'status', 'timer_end', 'timer_started_at', 'capacity_kg', 'maintenance_notes']
```

- [ ] **Step 3: `service.js` — `advanceItemService` güncelle**

`advanceItemService` fonksiyonundaki `nextStatus === 'washing'` bloğunu şöyle güncelle. `payload` parametresinde `timer_minutes` alanı da destructure edilecek şekilde fonksiyon imzasını değiştir:

```js
export function advanceItemService(id, { machine_id, shelf_location, timer_minutes }, userId) {
  const item = q.getItemQuery(id)
  if (!item) throw new Error('Kayıt bulunamadı')
  if (!TRANSITIONS[item.status]) throw new Error(`"${item.status}" durumundan ilerlenemez`)

  const nextStatus = TRANSITIONS[item.status]
  const extra = {}

  if (nextStatus === 'washing') {
    if (!machine_id) throw new Error('Makine seçilmeli')
    extra.machine_id = machine_id
    const now = new Date()
    const timerEnd = (timer_minutes && timer_minutes > 0)
      ? new Date(now.getTime() + timer_minutes * 60000).toISOString()
      : null
    q.updateMachineQuery(machine_id, {
      status: 'running',
      timer_end: timerEnd,
      timer_started_at: timerEnd ? now.toISOString() : null,
    })
    q.removeItemFromQueueQuery(id)
  }

  if (nextStatus === 'ready') {
    extra.shelf_location = shelf_location || null
    if (item.machine_id) {
      q.updateMachineQuery(item.machine_id, { status: 'done' })
    }
    createNotification({
      message: `${item.block || '?'} ${item.room_no || '?'} — ${item.item_count} parça rafta hazır`,
      type: 'info',
      module: 'laundry',
      target_role: 'laundry',
    })
    notifyItemReady(id).catch(() => {})
  }

  q.updateItemStatusQuery(id, nextStatus, extra)
  q.insertHistoryQuery({ item_id: id, from_status: item.status, to_status: nextStatus, action_by: userId })
  logAudit(userId, 'laundry_advance', 'laundry', id, `${item.status} → ${nextStatus}`)

  return q.getItemQuery(id)
}
```

- [ ] **Step 4: `routes.js` — advance endpoint güncelle**

`PATCH /items/:id/advance` handler'ını şöyle güncelle (timer_minutes destructure edilsin):

```js
laundryRouter.patch('/items/:id/advance', ...laundryFull, (req, res) => {
  try {
    const { machine_id, shelf_location, timer_minutes } = req.body
    const item = svc.advanceItemService(
      +req.params.id,
      { machine_id, shelf_location, timer_minutes: timer_minutes ? +timer_minutes : null },
      req.user.id
    )
    res.json(item)
  } catch (e) { res.status(400).json({ error: e.message }) }
})
```

- [ ] **Step 5: Test yaz — timer_minutes → machine.timer_end**

`laundry.test.js` dosyasındaki `describe('State machine', ...)` bloğuna şu testi ekle (mevcut `'dirty → washing: machine_id ile OK'` testinden **sonra**):

```js
it('dirty → washing: timer_minutes verilince machine.timer_end set edilir', async () => {
  const db = getDB()
  // Yeni bir item oluştur
  const itemRes = await request(app)
    .post('/api/laundry/items')
    .set('Authorization', `Bearer ${token}`)
    .send({ room_id: roomId, item_count: 1, notes: 'timer test' })
  expect(itemRes.status).toBe(201)
  const newItemId = itemRes.body.id

  const machine = db.prepare("SELECT id FROM laundry_machines WHERE status='idle' LIMIT 1").get()
  const before = new Date()

  const res = await request(app)
    .patch(`/api/laundry/items/${newItemId}/advance`)
    .set('Authorization', `Bearer ${token}`)
    .send({ machine_id: machine.id, timer_minutes: 45 })

  expect(res.status).toBe(200)
  expect(res.body.status).toBe('washing')

  const m = db.prepare('SELECT timer_end, timer_started_at FROM laundry_machines WHERE id=?').get(machine.id)
  expect(m.timer_end).toBeTruthy()
  expect(m.timer_started_at).toBeTruthy()

  const timerEnd = new Date(m.timer_end)
  const timerStarted = new Date(m.timer_started_at)
  const diffMinutes = (timerEnd - timerStarted) / 60000
  expect(Math.round(diffMinutes)).toBe(45)
})
```

- [ ] **Step 6: Testi çalıştır — FAIL bekleniyor**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js
```

Beklenen: `timer_minutes verilince machine.timer_end set edilir` FAIL (henüz kod yazılmadı gibi davranıyoruz — ama adımlar sıralı yazıldığı için bu test zaten geçecek. Geçerse devam et.)

- [ ] **Step 7: Tüm testleri çalıştır — tümü PASS**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js
```

Beklenen: Tüm testler PASS. Eğer herhangi biri FAIL ise, hata mesajını oku ve ilgili adımı düzelt.

- [ ] **Step 8: Commit**

```bash
git add backend/src/shared/db/index.js \
        backend/src/modules/laundry/queries.js \
        backend/src/modules/laundry/service.js \
        backend/src/modules/laundry/routes.js \
        backend/src/modules/laundry/laundry.test.js
git commit -m "feat: laundry — timer_minutes + timer_started_at backend desteği

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: MachineStrip — Bug Düzeltmeleri

**Files:**
- Modify: `frontend/src/modules/laundry/components/MachineStrip.jsx`

- [ ] **Step 1: `machine_type` → `type` düzelt**

`MachineCard` bileşeninde `m.machine_type` kullanan iki satırı bul:

```js
// Mevcut (yanlış):
const typeLabel = m.machine_type === 'dryer' ? 'D' : 'W'
const typeColor = m.machine_type === 'dryer' ? 'var(--accent2)' : 'var(--blue)'

// Düzeltilmiş:
const typeLabel = m.type === 'dryer' ? 'D' : 'W'
const typeColor = m.type === 'dryer' ? 'var(--accent2)' : 'var(--blue)'
```

- [ ] **Step 2: Timer interval 30s → 1s**

`MachineCard`'da `setInterval` satırını bul ve güncelle:

```js
// Mevcut:
const id = setInterval(() => setNow(Date.now()), 30000)

// Düzeltilmiş:
const id = setInterval(() => setNow(Date.now()), 1000)
```

- [ ] **Step 3: `totalMinutes` gerçek değerden hesapla**

`RingTimer`'a `totalMinutes` props olarak geçmek yerine, `MachineCard`'da `timer_started_at`'tan hesapla. `minutesLeft` hesaplandıktan hemen sonra ekle:

```js
// Mevcut (değiştirilecek):
// Estimate total from timer_end and a rough start — default to 45 if unknown
const totalMinutes = 45

// Düzeltilmiş:
const totalMinutes = m.timer_started_at && m.timer_end
  ? Math.round((new Date(m.timer_end) - new Date(m.timer_started_at)) / 60000)
  : 60
```

- [ ] **Step 4: Görsel test**

`npm run dev` çalışıyorsa tarayıcıda `/laundry/dashboard` aç. Çalışan bir makine varsa ring timer'ın saniye bazlı güncellendiğini gözlemle. Makine tipi etiketinin D/W olarak doğru göründüğünü kontrol et.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/laundry/components/MachineStrip.jsx
git commit -m "fix: MachineStrip — type field, 1s timer tick, timer_started_at hesabı

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: AssignModal — Makineye At

**Files:**
- Create: `frontend/src/modules/laundry/components/AssignModal.jsx`

- [ ] **Step 1: Dosyayı oluştur**

```jsx
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

const overlay = { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
const panel  = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, width: '100%', maxWidth: 420, boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }
const hdr    = { padding: '18px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'var(--display)', fontSize: 16, letterSpacing: 3, color: 'var(--text)', borderBottom: '1px solid var(--border)' }
const sec    = { padding: '14px 20px 0' }
const lbl    = { fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }
const ftr    = { padding: '14px 20px 20px', display: 'flex', gap: 8 }
const cancel = { padding: '10px 20px', borderRadius: 8, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text2)', fontFamily: 'var(--mono)', fontSize: 11 }

const PRESETS = [30, 45, 60, 90]

export default function AssignModal({ item, machines, onClose }) {
  const qc = useQueryClient()
  const [machineId, setMachineId] = useState(null)
  const [preset, setPreset]       = useState(45)
  const [custom, setCustom]       = useState('')
  const [useCustom, setUseCustom] = useState(false)

  const timerMinutes = useCustom ? parseInt(custom) || 0 : preset

  const advance = useMutation({
    mutationFn: () => laundryApi.advanceItem(item.id, { machine_id: machineId, timer_minutes: timerMinutes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['laundry-items'] })
      qc.invalidateQueries({ queryKey: ['laundry-machines'] })
      onClose()
    },
  })

  const canSubmit = machineId && timerMinutes > 0 && !advance.isPending

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={panel}>

        {/* Header */}
        <div style={hdr}>
          <span>MAKİNEYE AT</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14 }}>✕</button>
        </div>
        <div style={{ padding: '4px 20px 0', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>
          {item.block} · {item.room_no} — {item.item_count} parça
        </div>

        {/* Makine seçimi */}
        <div style={sec}>
          <div style={lbl}>Makine Seç</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {machines.length === 0 && (
              <div style={{ padding: 12, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', textAlign: 'center' }}>
                Boş makine yok
              </div>
            )}
            {machines.map(m => {
              const idle = m.status === 'idle'
              const selected = machineId === m.id
              return (
                <button key={m.id}
                  onClick={() => idle && setMachineId(m.id)}
                  disabled={!idle}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', borderRadius: 8, cursor: idle ? 'pointer' : 'not-allowed',
                    background: selected ? 'rgba(99,102,241,0.12)' : 'var(--surface2)',
                    border: `1px solid ${selected ? 'rgba(99,102,241,0.4)' : 'var(--border)'}`,
                    opacity: idle ? 1 : 0.45, transition: 'all 0.15s',
                  }}
                >
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text)' }}>{m.name}</span>
                  <span style={{
                    fontFamily: 'var(--mono)', fontSize: 9,
                    color: idle ? 'var(--green)' : 'var(--red)',
                    background: idle ? 'rgba(16,185,129,0.1)' : 'rgba(231,76,60,0.1)',
                    padding: '2px 8px', borderRadius: 4,
                  }}>
                    {idle ? `boş · ${m.capacity_kg}kg` : m.status}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Süre seçimi */}
        <div style={sec}>
          <div style={lbl}>Süre</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {PRESETS.map(min => {
              const active = !useCustom && preset === min
              return (
                <button key={min}
                  onClick={() => { setPreset(min); setUseCustom(false) }}
                  style={{
                    padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
                    fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700,
                    background: active ? 'var(--accent)' : 'var(--surface2)',
                    color: active ? '#000' : 'var(--text2)',
                    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                    transition: 'all 0.15s',
                  }}
                >
                  {min}dk
                </button>
              )
            })}
            <input
              type="number" min="1" max="300" placeholder="Özel"
              value={custom}
              onClick={() => setUseCustom(true)}
              onChange={e => { setCustom(e.target.value); setUseCustom(true) }}
              style={{
                width: 72, padding: '7px 10px', borderRadius: 8,
                background: useCustom ? 'rgba(99,102,241,0.08)' : 'var(--surface2)',
                border: `1px solid ${useCustom ? 'rgba(99,102,241,0.4)' : 'var(--border)'}`,
                color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 11, outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={ftr}>
          <button onClick={onClose} style={cancel}>İptal</button>
          <button
            onClick={() => advance.mutate()}
            disabled={!canSubmit}
            style={{
              flex: 1, padding: 10, borderRadius: 8, border: 'none',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              background: canSubmit ? 'var(--accent)' : 'var(--surface2)',
              color: canSubmit ? '#000' : 'var(--text3)',
              fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700,
              transition: 'all 0.15s', opacity: advance.isPending ? 0.6 : 1,
            }}
          >
            {advance.isPending ? '...' : 'Makineye At →'}
          </button>
        </div>

        {advance.isError && (
          <div style={{ padding: '0 20px 12px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--red)' }}>
            {advance.error?.response?.data?.error || 'Hata oluştu'}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/modules/laundry/components/AssignModal.jsx
git commit -m "feat: AssignModal — makine seçimi + timer süresi

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: ShelfModal — Rafa Koy

**Files:**
- Create: `frontend/src/modules/laundry/components/ShelfModal.jsx`

- [ ] **Step 1: Dosyayı oluştur**

```jsx
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

const overlay = { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
const panel  = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, width: '100%', maxWidth: 360, boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }
const hdr    = { padding: '18px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'var(--display)', fontSize: 16, letterSpacing: 3, color: 'var(--text)', borderBottom: '1px solid var(--border)' }
const lbl    = { fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }
const cancel = { padding: '10px 20px', borderRadius: 8, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text2)', fontFamily: 'var(--mono)', fontSize: 11 }

export default function ShelfModal({ item, onClose }) {
  const qc = useQueryClient()
  const [location, setLocation] = useState('')

  const advance = useMutation({
    mutationFn: () => laundryApi.advanceItem(item.id, { shelf_location: location }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['laundry-items'] })
      qc.invalidateQueries({ queryKey: ['laundry-machines'] })
      onClose()
    },
  })

  const handleKey = e => {
    if (e.key === 'Enter') advance.mutate()
    if (e.key === 'Escape') onClose()
  }

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={panel}>
        <div style={hdr}>
          <span>RAFA KOY</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14 }}>✕</button>
        </div>
        <div style={{ padding: '4px 20px 0', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>
          {item.block} · {item.room_no} — {item.machine_name || 'makine'}
        </div>
        <div style={{ padding: '16px 20px 0' }}>
          <div style={lbl}>Raf Konumu</div>
          <input
            autoFocus
            className="form-input"
            style={{ width: '100%', padding: '10px 14px', fontSize: 13, borderRadius: 8 }}
            value={location}
            onChange={e => setLocation(e.target.value)}
            onKeyDown={handleKey}
            placeholder="örn: 2. Kat A-3"
          />
        </div>
        <div style={{ padding: '16px 20px 20px', display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={cancel}>İptal</button>
          <button
            onClick={() => advance.mutate()}
            disabled={advance.isPending}
            style={{
              flex: 1, padding: 10, borderRadius: 8, border: 'none', cursor: 'pointer',
              background: 'var(--accent)', color: '#000',
              fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700,
              opacity: advance.isPending ? 0.6 : 1,
            }}
          >
            {advance.isPending ? '...' : 'Rafa Koy →'}
          </button>
        </div>
        {advance.isError && (
          <div style={{ padding: '0 20px 12px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--red)' }}>
            {advance.error?.response?.data?.error || 'Hata oluştu'}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/modules/laundry/components/ShelfModal.jsx
git commit -m "feat: ShelfModal — raf konumu modalı

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: LostModal — Kayıp İşaretle

**Files:**
- Create: `frontend/src/modules/laundry/components/LostModal.jsx`

- [ ] **Step 1: Dosyayı oluştur**

```jsx
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

const overlay = { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
const panel  = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, width: '100%', maxWidth: 380, boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }
const hdr    = { padding: '18px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'var(--display)', fontSize: 16, letterSpacing: 3, color: 'var(--text)', borderBottom: '1px solid var(--border)' }
const lbl    = { fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }
const cancel = { padding: '10px 20px', borderRadius: 8, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text2)', fontFamily: 'var(--mono)', fontSize: 11 }

export default function LostModal({ item, onClose }) {
  const qc = useQueryClient()
  const [notes, setNotes] = useState('')

  const markLost = useMutation({
    mutationFn: () => laundryApi.lostItem(item.id, { notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['laundry-items'] })
      qc.invalidateQueries({ queryKey: ['laundry-machines'] })
      onClose()
    },
  })

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={panel}>
        <div style={hdr}>
          <span>KAYIP İŞARETLE</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14 }}>✕</button>
        </div>
        <div style={{ padding: '4px 20px 0', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>
          {item.block} · {item.room_no} — {item.item_count} parça · {item.status}
        </div>
        <div style={{ padding: '16px 20px 0' }}>
          <div style={lbl}>Açıklama (opsiyonel)</div>
          <textarea
            autoFocus
            className="form-input"
            style={{ width: '100%', padding: '10px 14px', fontSize: 12, borderRadius: 8, resize: 'vertical', minHeight: 80 }}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Kayıp nedeni veya ek bilgi..."
          />
        </div>
        <div style={{ padding: '16px 20px 20px', display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={cancel}>İptal</button>
          <button
            onClick={() => markLost.mutate()}
            disabled={markLost.isPending}
            style={{
              flex: 1, padding: 10, borderRadius: 8, cursor: 'pointer',
              background: 'rgba(231,76,60,0.12)', color: 'var(--red)',
              border: '1px solid rgba(231,76,60,0.3)',
              fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700,
              opacity: markLost.isPending ? 0.6 : 1,
            }}
          >
            {markLost.isPending ? '...' : 'Kayıp İşaretle →'}
          </button>
        </div>
        {markLost.isError && (
          <div style={{ padding: '0 20px 12px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--red)' }}>
            {markLost.error?.response?.data?.error || 'Hata oluştu'}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/modules/laundry/components/LostModal.jsx
git commit -m "feat: LostModal — kayıp işaretleme modalı

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: MachineManagerPanel

**Files:**
- Create: `frontend/src/modules/laundry/components/MachineManagerPanel.jsx`

- [ ] **Step 1: Dosyayı oluştur**

```jsx
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

const overlay = { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
const panel  = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, width: '100%', maxWidth: 460, boxShadow: '0 24px 64px rgba(0,0,0,0.5)', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }
const hdr    = { padding: '18px 20px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'var(--display)', fontSize: 16, letterSpacing: 3, color: 'var(--text)', borderBottom: '1px solid var(--border)', flexShrink: 0 }

const STATUS_COLOR = { idle: 'var(--text3)', running: 'var(--accent)', done: 'var(--red)', maintenance: 'var(--text4)' }

export default function MachineManagerPanel({ machines, onClose }) {
  const qc = useQueryClient()
  const [showAdd, setShowAdd]     = useState(false)
  const [newName, setNewName]     = useState('')
  const [newType, setNewType]     = useState('washer')
  const [newKg, setNewKg]         = useState('10')

  const create = useMutation({
    mutationFn: () => laundryApi.createMachine({ name: newName.trim(), type: newType, capacity_kg: parseFloat(newKg) || 10 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['laundry-machines'] })
      setShowAdd(false); setNewName(''); setNewType('washer'); setNewKg('10')
    },
  })

  const update = useMutation({
    mutationFn: ({ id, fields }) => laundryApi.updateMachine(id, fields),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['laundry-machines'] }),
  })

  const remove = useMutation({
    mutationFn: (id) => laundryApi.deleteMachine(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['laundry-machines'] }),
  })

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={panel}>

        {/* Header */}
        <div style={hdr}>
          <span>MAKİNELER</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowAdd(s => !s)} style={{
              padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
              background: 'rgba(99,102,241,0.1)', color: 'var(--accent)',
              border: '1px solid rgba(99,102,241,0.25)',
              fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700,
            }}>+ Ekle</button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16 }}>✕</button>
          </div>
        </div>

        {/* Add form */}
        {showAdd && (
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                autoFocus className="form-input"
                style={{ flex: 2, minWidth: 140, padding: '8px 12px', fontSize: 12, borderRadius: 8 }}
                placeholder="Makine adı"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && newName.trim() && create.mutate()}
              />
              <select className="form-input"
                style={{ flex: 1, minWidth: 90, padding: '8px 10px', fontSize: 12, borderRadius: 8 }}
                value={newType} onChange={e => setNewType(e.target.value)}
              >
                <option value="washer">Çamaşır</option>
                <option value="dryer">Kurutucu</option>
              </select>
              <input type="number" min="1" max="20" className="form-input"
                style={{ width: 70, padding: '8px 10px', fontSize: 12, borderRadius: 8 }}
                placeholder="kg" value={newKg} onChange={e => setNewKg(e.target.value)}
              />
              <button
                onClick={() => newName.trim() && create.mutate()}
                disabled={!newName.trim() || create.isPending}
                style={{ padding: '8px 14px', borderRadius: 8, cursor: 'pointer', background: 'var(--accent)', color: '#000', border: 'none', fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700 }}
              >
                {create.isPending ? '...' : 'Kaydet'}
              </button>
            </div>
            {create.isError && (
              <div style={{ marginTop: 6, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--red)' }}>
                {create.error?.response?.data?.error || 'Hata'}
              </div>
            )}
          </div>
        )}

        {/* Machine list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {machines.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>
              Makine yok — yukarıdan ekle
            </div>
          ) : machines.map(m => {
            const canDelete = m.active_items === 0 && m.status !== 'running'
            const inMaint   = m.status === 'maintenance'
            return (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text)', marginBottom: 2 }}>
                    {m.name}
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', display: 'flex', gap: 8 }}>
                    <span>{m.type === 'washer' ? 'Çamaşır' : 'Kurutucu'}</span>
                    <span>{m.capacity_kg}kg</span>
                    <span style={{ color: STATUS_COLOR[m.status] || 'var(--text3)' }}>{m.status}</span>
                    {m.active_items > 0 && <span style={{ color: 'var(--accent)' }}>{m.active_items} yıkama</span>}
                  </div>
                </div>
                <button
                  onClick={() => update.mutate({ id: m.id, fields: { status: inMaint ? 'idle' : 'maintenance' } })}
                  disabled={m.status === 'running' || update.isPending}
                  style={{
                    padding: '5px 10px', borderRadius: 6, cursor: m.status === 'running' ? 'not-allowed' : 'pointer',
                    fontFamily: 'var(--mono)', fontSize: 9,
                    background: inMaint ? 'rgba(16,185,129,0.1)' : 'var(--surface2)',
                    color: inMaint ? 'var(--green)' : 'var(--text3)',
                    border: `1px solid ${inMaint ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`,
                    opacity: m.status === 'running' ? 0.4 : 1,
                  }}
                >
                  {inMaint ? 'Aktif Et' : 'Bakım'}
                </button>
                <button
                  onClick={() => canDelete && remove.mutate(m.id)}
                  disabled={!canDelete || remove.isPending}
                  title={!canDelete ? 'Aktif yıkama var veya çalışıyor' : 'Makineyi sil'}
                  style={{
                    padding: '5px 8px', borderRadius: 6, cursor: canDelete ? 'pointer' : 'not-allowed',
                    background: 'transparent', fontFamily: 'var(--mono)', fontSize: 10,
                    color: canDelete ? 'var(--red)' : 'var(--text4)',
                    border: `1px solid ${canDelete ? 'rgba(231,76,60,0.3)' : 'var(--border)'}`,
                    opacity: canDelete ? 1 : 0.35,
                  }}
                >
                  ✕
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/modules/laundry/components/MachineManagerPanel.jsx
git commit -m "feat: MachineManagerPanel — makine ekle/bakım/sil UI

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 7: ItemCard — Modal Entegrasyonu

**Files:**
- Modify: `frontend/src/modules/laundry/components/ItemCard.jsx`

- [ ] **Step 1: Import'ları ekle**

Dosyanın en üstüne (mevcut import satırlarından sonra) ekle:

```js
import AssignModal from './AssignModal.jsx'
import ShelfModal  from './ShelfModal.jsx'
import LostModal   from './LostModal.jsx'
```

- [ ] **Step 2: Modal state'lerini ekle**

`ItemCard` fonksiyon içinde, `expanded` state'inden hemen sonra:

```js
const [assignOpen, setAssignOpen] = useState(false)
const [shelfOpen,  setShelfOpen]  = useState(false)
const [lostOpen,   setLostOpen]   = useState(false)
const [deleteStep, setDeleteStep] = useState(false) // iki adımlı silme
```

- [ ] **Step 3: `advance` ve `markLost` mutation'larını kaldır**

`ItemCard`'da artık `advance` ve `markLost` mutation'larına gerek yok — bunları modallar yönetiyor. Şu satırları **sil**:

```js
const advance = useMutation({
  mutationFn: (data) => laundryApi.advanceItem(item.id, data),
  onSuccess: () => qc.invalidateQueries({ queryKey: ['laundry-items'] }),
})
const markLost = useMutation({
  mutationFn: () => laundryApi.lostItem(item.id, {}),
  onSuccess: () => qc.invalidateQueries({ queryKey: ['laundry-items'] }),
})
```

`deleteItem` mutation'ı **koru** (delete hâlâ ItemCard'da yönetiliyor).

- [ ] **Step 4: Aksiyonlar bölümünü güncelle**

Mevcut aksiyonlar bölümünü (`{/* ── Aksiyonlar ── */}` altındaki div) şöyle değiştir:

```jsx
{/* ── Aksiyonlar ── */}
{item.status !== 'lost' && item.status !== 'delivered' && (
  <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
    {item.status === 'dirty' && (
      <button
        className="lc-action-btn primary"
        onClick={() => setAssignOpen(true)}
      >
        ⚙ Makineye At
      </button>
    )}
    {item.status === 'washing' && (
      <button
        className="lc-action-btn primary"
        onClick={() => setShelfOpen(true)}
      >
        ▣ Rafa Koy
      </button>
    )}
    {item.status === 'ready' && (
      <button className="lc-action-btn success" onClick={() => onDeliver(item)}>
        ✓ Teslim Et
      </button>
    )}
    {onDamage && (
      <button className="lc-action-btn ghost" onClick={() => onDamage(item)}>
        ⚠ Hasar
      </button>
    )}
    <button
      className="lc-action-btn ghost"
      style={{ flex: 'none', padding: '8px 12px' }}
      onClick={() => { setExpanded(!expanded); setDeleteStep(false) }}
    >
      {expanded ? '▲' : '▾'}
    </button>
  </div>
)}
```

- [ ] **Step 5: Genişletilmiş bölümü güncelle**

Mevcut `{/* ── Genişletilmiş ── */}` bölümünü şöyle değiştir (confirm() → modal + iki-adımlı silme):

```jsx
{expanded && (
  <div style={{ display: 'flex', gap: 6, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
    <button className="lc-action-btn ghost"
      style={{ fontSize: 9 }}
      onClick={() => setLostOpen(true)}
    >
      Kayıp İşaretle
    </button>
    {item.status === 'dirty' && (
      deleteStep ? (
        <button className="lc-action-btn danger"
          style={{ fontSize: 9 }}
          onClick={() => { deleteItem.mutate(); setDeleteStep(false) }}
        >
          Emin misin? Sil
        </button>
      ) : (
        <button className="lc-action-btn danger"
          style={{ fontSize: 9 }}
          onClick={() => setDeleteStep(true)}
        >
          Sil
        </button>
      )
    )}
  </div>
)}
```

- [ ] **Step 6: Hata mesajı bölümünü kaldır**

Mevcut `advance.isError` bloğunu **sil** (artık advance mutation yok):

```jsx
// Bu bloğu sil:
{advance.isError && (
  <div className="alert alert-danger" ...>
    {advance.error?.response?.data?.error || 'İşlem hatası'}
  </div>
)}
```

- [ ] **Step 7: Modalleri render et**

`ItemCard` bileşeninin return'ünün en dış `<div>`'inden hemen önce (ya da içinde en sona):

```jsx
{/* ── Modals ── */}
{assignOpen && (
  <AssignModal
    item={item}
    machines={machines}
    onClose={() => setAssignOpen(false)}
  />
)}
{shelfOpen && (
  <ShelfModal
    item={item}
    onClose={() => setShelfOpen(false)}
  />
)}
{lostOpen && (
  <LostModal
    item={item}
    onClose={() => setLostOpen(false)}
  />
)}
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src/modules/laundry/components/ItemCard.jsx
git commit -m "refactor: ItemCard — prompt/confirm → modal entegrasyonu

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 8: useLaundrySSE Hook

**Files:**
- Create: `frontend/src/shared/hooks/useLaundrySSE.js`

- [ ] **Step 1: Dosyayı oluştur**

```js
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../store/authStore.js'
import { useToastStore } from '../store/toastStore.js'

/**
 * LaundryHub'a mount olduğunda SSE'ye bağlanır.
 * module=laundry olan bildirimleri dinler, query cache'i invalidate eder,
 * önemli olaylar için toast gösterir.
 *
 * NOT: Sistemde zaten useNotifications (NotificationBell, Sidebar) çalışıyor.
 * Bu hook ayrı bir EventSource açar — SSE server bunu destekler.
 */
export function useLaundrySSE() {
  const qc       = useQueryClient()
  const token    = useAuthStore(s => s.token)
  const addToast = useToastStore(s => s.addToast)

  useEffect(() => {
    if (!token) return

    const es = new EventSource(`/api/notifications/stream?token=${token}`)

    es.onmessage = (e) => {
      try {
        const notif = JSON.parse(e.data)
        if (notif.module !== 'laundry') return

        const type = notif.type // 'info' | 'warning' | 'critical'

        // Cache invalidation
        if (type === 'critical' || type === 'warning') {
          qc.invalidateQueries({ queryKey: ['laundry-sla'] })
        }
        if (type === 'info') {
          qc.invalidateQueries({ queryKey: ['laundry-items'] })
          qc.invalidateQueries({ queryKey: ['laundry-machines'] })
        }
        // Her zaman stats güncelle
        qc.invalidateQueries({ queryKey: ['laundry-stats'] })

        // Toast
        const toastType = type === 'critical' ? 'error' : type === 'warning' ? 'warning' : 'info'
        addToast(notif.message, toastType)
      } catch {}
    }

    es.onerror = () => es.close()

    return () => es.close()
  }, [token, qc, addToast])
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/shared/hooks/useLaundrySSE.js
git commit -m "feat: useLaundrySSE — laundry SSE query invalidation hook

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 9: LaundryHub

**Files:**
- Create: `frontend/src/modules/laundry/LaundryHub.jsx`

Bu bileşen `LaundryPage` + `LaundryDashboard`'un birleşimi. İçeriden `KanbanCard` ve `KanbanCol` bileşenlerini de tanımlar.

- [ ] **Step 1: Dosyayı oluştur**

```jsx
import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from './api.js'
import { useLaundrySSE } from '../../shared/hooks/useLaundrySSE.js'

import MachineStrip       from './components/MachineStrip.jsx'
import SlaAlert           from './components/SlaAlert.jsx'
import ItemCard           from './components/ItemCard.jsx'
import NewItemModal       from './components/NewItemModal.jsx'
import DeliveryModal      from './components/DeliveryModal.jsx'
import DamageModal        from './components/DamageModal.jsx'
import AssignModal        from './components/AssignModal.jsx'
import ShelfModal         from './components/ShelfModal.jsx'
import LostModal          from './components/LostModal.jsx'
import MachineManagerPanel from './components/MachineManagerPanel.jsx'

// ── WA link helper ─────────────────────────────────────────────
function waLink(phone) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  const normalized = digits.startsWith('0') ? '90' + digits.slice(1) : digits
  return `https://wa.me/${normalized}`
}

// ── KanbanCard ─────────────────────────────────────────────────
function KanbanCard({ item, machines, onDeliver, onDamage }) {
  const [assignOpen, setAssignOpen] = useState(false)
  const [shelfOpen,  setShelfOpen]  = useState(false)
  const [lostOpen,   setLostOpen]   = useState(false)
  const [expanded,   setExpanded]   = useState(false)

  const isSlaWarn = item.hours_in_status > 24
  const isSlaRed  = item.hours_in_status > 48
  const isUrgent  = item.urgent === 1
  const phone     = item.phone_number
  const wa        = waLink(phone)

  const borderColor = isUrgent ? 'var(--red)'
    : item.status === 'washing' ? 'var(--blue)'
    : item.status === 'ready'   ? 'var(--green)'
    : 'var(--accent)'

  return (
    <div style={{
      background: 'var(--surface2)',
      border: `1px solid ${isUrgent ? 'rgba(231,76,60,0.3)' : isSlaRed ? 'rgba(231,76,60,0.15)' : 'var(--border)'}`,
      borderLeft: `2px solid ${borderColor}`,
      borderRadius: 8, padding: '10px 12px',
      transition: 'transform 0.15s, box-shadow 0.15s',
    }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.25)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
    >
      {/* Row 1: oda + badges */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontFamily: 'var(--display)', fontSize: 16, letterSpacing: 2, color: 'var(--text)', lineHeight: 1 }}>
          {item.block} · {item.room_no}
        </span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {isUrgent && <span className="badge badge-red" style={{ fontSize: 7 }}>ACİL</span>}
          {isSlaRed && <span style={{ fontFamily: 'var(--mono)', fontSize: 7, color: 'var(--red)', fontWeight: 700 }}>{item.hours_in_status}s</span>}
          {isSlaWarn && !isSlaRed && <span style={{ fontFamily: 'var(--mono)', fontSize: 7, color: 'var(--accent)', fontWeight: 700 }}>{item.hours_in_status}s</span>}
          {item.damage_count > 0 && <span className="badge badge-amber" style={{ fontSize: 7 }}>⚠{item.damage_count}</span>}
        </div>
      </div>

      {/* Row 2: meta */}
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginBottom: 8, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span>{item.item_count} parça</span>
        {item.occupant_name && <span style={{ color: 'var(--text2)' }}>· {item.occupant_name}</span>}
        {item.machine_name && <span>· ⚙ {item.machine_name}</span>}
        {item.shelf_location && <span>· ▣ {item.shelf_location}</span>}
        {item.notes && <span style={{ color: 'var(--text2)', fontStyle: 'italic' }}>· {item.notes}</span>}
      </div>

      {/* Phone */}
      {phone && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
          padding: '4px 8px', borderRadius: 6,
          background: 'rgba(37,211,102,0.06)', border: '1px solid rgba(37,211,102,0.15)',
        }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)', flex: 1 }}>📱 {phone}</span>
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              padding: '2px 8px', borderRadius: 4,
              background: 'rgba(37,211,102,0.12)', border: '1px solid rgba(37,211,102,0.3)',
              color: '#25d366', fontFamily: 'var(--mono)', fontSize: 8, fontWeight: 700,
              textDecoration: 'none', letterSpacing: 0.5,
            }}>
              WA →
            </a>
          )}
        </div>
      )}

      {/* Actions */}
      {item.status !== 'lost' && item.status !== 'delivered' && (
        <div style={{ display: 'flex', gap: 5 }}>
          {item.status === 'dirty' && (
            <button onClick={() => setAssignOpen(true)} style={{
              flex: 1, padding: '5px 8px', borderRadius: 6,
              background: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.25)',
              color: 'var(--accent)', fontFamily: 'var(--mono)', fontSize: 9,
              cursor: 'pointer', fontWeight: 700,
            }}>
              ⚙ Makineye At…
            </button>
          )}
          {item.status === 'washing' && (
            <button onClick={() => setShelfOpen(true)} style={{
              flex: 1, padding: '5px 8px', borderRadius: 6,
              background: 'rgba(59,140,240,0.08)', border: '1px solid rgba(59,140,240,0.25)',
              color: 'var(--blue)', fontFamily: 'var(--mono)', fontSize: 9,
              cursor: 'pointer', fontWeight: 700,
            }}>
              ▣ Rafa Koy →
            </button>
          )}
          {item.status === 'ready' && (
            <button onClick={() => onDeliver(item)} style={{
              flex: 1, padding: '5px 8px', borderRadius: 6,
              background: 'rgba(39,201,106,0.08)', border: '1px solid rgba(39,201,106,0.25)',
              color: 'var(--green)', fontFamily: 'var(--mono)', fontSize: 9,
              cursor: 'pointer', fontWeight: 700,
            }}>
              ✓ Teslim Et →
            </button>
          )}
          {onDamage && (
            <button onClick={() => onDamage(item)} style={{
              padding: '5px 8px', borderRadius: 6,
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 9, cursor: 'pointer',
            }}>⚠</button>
          )}
          <button onClick={() => setExpanded(s => !s)} style={{
            padding: '5px 8px', borderRadius: 6,
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 9, cursor: 'pointer',
          }}>
            {expanded ? '▲' : '▾'}
          </button>
        </div>
      )}

      {/* Expanded */}
      {expanded && (
        <div style={{ display: 'flex', gap: 5, marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
          <button onClick={() => setLostOpen(true)} style={{
            flex: 1, padding: '4px 6px', borderRadius: 5,
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 8, cursor: 'pointer',
          }}>Kayıp</button>
        </div>
      )}

      {/* Modals */}
      {assignOpen && <AssignModal item={item} machines={machines} onClose={() => setAssignOpen(false)} />}
      {shelfOpen  && <ShelfModal  item={item} onClose={() => setShelfOpen(false)} />}
      {lostOpen   && <LostModal   item={item} onClose={() => setLostOpen(false)} />}
    </div>
  )
}

// ── KanbanCol ──────────────────────────────────────────────────
function KanbanCol({ title, color, items, machines, onDeliver, onDamage }) {
  return (
    <div style={{
      flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column',
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderTop: `2px solid ${color}`, borderRadius: 10, overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid var(--border)',
        background: `linear-gradient(135deg, ${color}0d, transparent)`,
      }}>
        <span style={{ fontFamily: 'var(--display)', fontSize: 13, letterSpacing: 3, color }}>{title}</span>
        <span style={{ fontFamily: 'var(--display)', fontSize: 26, letterSpacing: 1, color, lineHeight: 1 }}>
          {items.length}
        </span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 520 }}>
        {items.length === 0 ? (
          <div style={{ padding: '28px 0', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)' }}>
            boş
          </div>
        ) : items.map(item => (
          <KanbanCard key={item.id} item={item} machines={machines} onDeliver={onDeliver} onDamage={onDamage} />
        ))}
      </div>
    </div>
  )
}

// ── Filter config ──────────────────────────────────────────────
const FILTERS = [
  { key: 'all',     label: 'Tümü',    dot: null },
  { key: 'dirty',   label: 'Sepet',   dot: 'var(--accent)' },
  { key: 'washing', label: 'Yıkama',  dot: 'var(--blue)' },
  { key: 'ready',   label: 'Hazır',   dot: 'var(--green)' },
  { key: 'urgent',  label: 'Acil',    dot: 'var(--red)' },
  { key: 'sla',     label: 'SLA',     dot: 'var(--red)' },
  { key: 'lost',    label: 'Kayıp',   dot: 'var(--text3)' },
]

// ── LaundryHub ─────────────────────────────────────────────────
export default function LaundryHub({ defaultView = 'kanban' }) {
  useLaundrySSE()

  const [view,         setView]         = useState(defaultView)
  const [filter,       setFilter]       = useState('all')
  const [search,       setSearch]       = useState('')
  const [showNew,      setShowNew]      = useState(false)
  const [deliverItem,  setDeliverItem]  = useState(null)
  const [damageItem,   setDamageItem]   = useState(null)
  const [showMachines, setShowMachines] = useState(true)
  const [showMgr,      setShowMgr]      = useState(false)
  const [batchMode,    setBatchMode]    = useState(false)
  const [selectedIds,  setSelectedIds]  = useState(new Set())

  const { data: allItems = [] } = useQuery({
    queryKey: ['laundry-items', 'all'],
    queryFn: () => laundryApi.getItems({}),
    refetchInterval: 20000,
  })
  const { data: machines = [] } = useQuery({
    queryKey: ['laundry-machines'],
    queryFn: laundryApi.getMachines,
    refetchInterval: 15000,
  })
  const { data: violations = [] } = useQuery({
    queryKey: ['laundry-sla'],
    queryFn: laundryApi.getSlaViolations,
    refetchInterval: 60000,
  })
  const { data: stats } = useQuery({
    queryKey: ['laundry-stats'],
    queryFn: () => laundryApi.getStats({}),
    refetchInterval: 60000,
  })

  // Filtered items for both views
  const { data: listItems = [], isLoading } = useQuery({
    queryKey: ['laundry-items', filter, search],
    queryFn: () => {
      const params = {}
      if (filter === 'urgent') params.urgent = '1'
      else if (filter === 'sla') params.sla_only = '1'
      else if (filter !== 'all') params.status = filter
      if (search) params.search = search
      return laundryApi.getItems(params)
    },
    refetchInterval: 20000,
  })

  // Kanban: always use allItems filtered by status (no extra filter applied)
  const kanbanItems = useMemo(() => {
    let list = allItems
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(i =>
        `${i.block} ${i.room_no} ${i.notes || ''} ${i.occupant_name || ''}`.toLowerCase().includes(q)
      )
    }
    return list
  }, [allItems, search])

  const dirty   = kanbanItems.filter(i => i.status === 'dirty')
  const washing = kanbanItems.filter(i => i.status === 'washing')
  const ready   = kanbanItems.filter(i => i.status === 'ready')

  const counts = {
    dirty:   allItems.filter(i => i.status === 'dirty').length,
    washing: allItems.filter(i => i.status === 'washing').length,
    ready:   allItems.filter(i => i.status === 'ready').length,
    sla:     violations.length,
    lost:    allItems.filter(i => i.status === 'lost').length,
  }
  const activeTotal = counts.dirty + counts.washing + counts.ready

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleBatchDeliver = () => {
    const name = prompt('Toplu teslim — alıcı adı:')
    if (!name) return
    laundryApi.batchDeliver({ item_ids: [...selectedIds], delivered_to: name })
      .then(() => { setSelectedIds(new Set()); setBatchMode(false) })
  }

  const today = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <div style={{ maxWidth: view === 'kanban' ? 1200 : 880, position: 'relative', zIndex: 1 }} className="fade-up">

      {/* ── HEADER ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 30, letterSpacing: 5, color: 'var(--text)', lineHeight: 1, marginBottom: 4 }}>
            ÇAMAŞIRHANE
          </h1>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 0.5 }}>
            {today}
            {activeTotal > 0 && <span style={{ marginLeft: 10 }}>· {activeTotal} aktif</span>}
            {violations.length > 0 && (
              <span style={{ color: 'var(--red)', marginLeft: 10 }}>· {violations.length} SLA ihlali</span>
            )}
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)} style={{ letterSpacing: 1 }}>
          + Yeni Kayıt
        </button>
      </div>

      {/* ── SLA ── */}
      <SlaAlert violations={violations} />

      {/* ── KPI STRIP ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'Sepette',      value: counts.dirty,                         color: 'var(--accent)', sub: activeTotal > 0 ? (counts.dirty / activeTotal) * 100 : 0 },
          { label: 'Yıkaniyor',    value: counts.washing,                       color: 'var(--blue)',   sub: activeTotal > 0 ? (counts.washing / activeTotal) * 100 : 0 },
          { label: 'Rafta Hazır',  value: counts.ready,                         color: 'var(--green)',  sub: activeTotal > 0 ? (counts.ready / activeTotal) * 100 : 0 },
          { label: 'SLA İhlali',   value: violations.length,                    color: 'var(--red)',    sub: null },
          { label: 'Bugün Teslim', value: stats?.delivered_today?.count ?? 0,   color: 'var(--teal)',   sub: null },
        ].map(s => (
          <div key={s.label} style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderTop: `2px solid ${s.color}`, borderRadius: 10,
            padding: '14px 14px 12px', position: 'relative', overflow: 'hidden',
            transition: 'transform 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={e => e.currentTarget.style.transform = ''}
          >
            <div style={{ position: 'absolute', top: -20, right: -20, width: 70, height: 70, borderRadius: '50%', background: s.color, opacity: 0.04 }} />
            <div style={{ fontFamily: 'var(--display)', fontSize: 44, letterSpacing: 2, color: s.color, lineHeight: 1, marginBottom: 6 }}>
              {s.value}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 2 }}>
              {s.label}
            </div>
            {s.sub != null && (
              <div style={{ marginTop: 8, height: 2, background: 'var(--border)', borderRadius: 1, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, s.sub)}%`, background: s.color, opacity: 0.6, borderRadius: 1, transition: 'width 0.8s ease' }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── MAKİNELER ── */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: showMachines ? 10 : 0 }}>
          <button onClick={() => setShowMachines(s => !s)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 2, padding: 0,
          }}>
            <span style={{ transition: 'transform 0.2s', display: 'inline-block', transform: showMachines ? 'rotate(90deg)' : '' }}>›</span>
            MAKİNELER
          </button>
          {machines.filter(m => m.status === 'running').length > 0 && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)' }}>
              {machines.filter(m => m.status === 'running').length} çalışıyor
            </span>
          )}
          {machines.filter(m => m.status === 'done').length > 0 && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--red)' }}>
              · {machines.filter(m => m.status === 'done').length} bekleniyor
            </span>
          )}
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <button onClick={() => setShowMgr(true)} style={{
            padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: 1,
          }}>
            Yönet
          </button>
        </div>
        {showMachines && <MachineStrip machines={machines} hideHeader />}
      </div>

      {/* ── TOOLBAR: SEARCH + FILTERS + VIEW TOGGLE ── */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center',
        position: 'sticky', top: 0, zIndex: 10,
        background: 'var(--bg)', paddingTop: 6, paddingBottom: 6,
      }}>
        <input
          className="form-input"
          style={{ width: 200, padding: '6px 11px', fontSize: 11 }}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Ara (oda, kişi, not)…"
        />
        <div style={{ display: 'flex', gap: 4, flex: 1, overflowX: 'auto' }}>
          {FILTERS.map(f => {
            const cnt = f.key === 'all' ? null
              : f.key === 'sla' ? violations.length
              : counts[f.key] > 0 ? counts[f.key] : null
            return (
              <button key={f.key}
                className={`filter-chip ${filter === f.key ? 'active' : ''}`}
                onClick={() => setFilter(f.key)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}
              >
                {f.dot && (
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: filter === f.key ? f.dot : 'var(--text3)', flexShrink: 0 }} />
                )}
                {f.label}
                {cnt != null && cnt > 0 && (
                  <span style={{
                    background: filter === f.key ? f.dot + '33' : 'var(--surface3)',
                    color: filter === f.key ? f.dot : 'var(--text3)',
                    borderRadius: 10, padding: '0 5px', fontSize: 9, fontWeight: 700,
                  }}>{cnt}</span>
                )}
              </button>
            )
          })}
        </div>
        {search && (
          <button className="btn btn-ghost btn-xs" onClick={() => setSearch('')}>✕</button>
        )}
        {/* View toggle */}
        <div style={{ display: 'flex', gap: 0, background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden', flexShrink: 0 }}>
          {[
            { key: 'kanban', label: '⊞' },
            { key: 'liste',  label: '≡' },
          ].map(v => (
            <button key={v.key}
              onClick={() => setView(v.key)}
              style={{
                padding: '6px 12px', cursor: 'pointer', border: 'none',
                background: view === v.key ? 'var(--accent)' : 'transparent',
                color: view === v.key ? '#000' : 'var(--text3)',
                fontFamily: 'var(--mono)', fontSize: 13,
                transition: 'all 0.15s',
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
        {/* Batch mode (sadece liste view) */}
        {view === 'liste' && (
          <>
            {batchMode && selectedIds.size > 0 && (
              <button className="btn btn-sm" style={{ background: 'var(--green)', color: '#000' }} onClick={handleBatchDeliver}>
                Toplu Teslim ({selectedIds.size})
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => { setBatchMode(!batchMode); setSelectedIds(new Set()) }}>
              {batchMode ? 'İptal' : 'Toplu'}
            </button>
          </>
        )}
      </div>

      {/* ── CONTENT ── */}
      {view === 'kanban' ? (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <KanbanCol title="KİRLİ SEPET"  color="var(--accent)" items={dirty}   machines={machines} onDeliver={setDeliverItem} onDamage={setDamageItem} />
          <KanbanCol title="YIKANIYOR"    color="var(--blue)"   items={washing} machines={machines} onDeliver={setDeliverItem} onDamage={setDamageItem} />
          <KanbanCol title="RAFTA HAZIR"  color="var(--green)"  items={ready}   machines={machines} onDeliver={setDeliverItem} onDamage={setDamageItem} />
        </div>
      ) : (
        <div>
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ height: 100, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, opacity: 0.4 - i * 0.1 }} />
              ))}
            </div>
          ) : listItems.length === 0 ? (
            <div className="panel" style={{ padding: '48px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🧺</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 18, letterSpacing: 3, color: 'var(--text2)', marginBottom: 8 }}>
                {filter !== 'all' ? 'SONUÇ YOK' : 'KAYIT YOK'}
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
                {filter !== 'all' ? 'Bu filtre için kayıt yok' : 'Henüz kayıt oluşturulmamış'}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {listItems.map((item, idx) => (
                <div key={item.id} className={`fade-up-${Math.min(idx, 4)}`}>
                  <ItemCard
                    item={item}
                    machines={machines}
                    onDeliver={setDeliverItem}
                    onDamage={setDamageItem}
                    selected={selectedIds.has(item.id)}
                    onSelect={batchMode ? toggleSelect : undefined}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── MODALS ── */}
      {showNew      && <NewItemModal onClose={() => setShowNew(false)} />}
      {deliverItem  && <DeliveryModal item={deliverItem} onClose={() => setDeliverItem(null)} />}
      {damageItem   && <DamageModal   item={damageItem}  onClose={() => setDamageItem(null)} />}
      {showMgr      && <MachineManagerPanel machines={machines} onClose={() => setShowMgr(false)} />}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/modules/laundry/LaundryHub.jsx
git commit -m "feat: LaundryHub — LaundryPage + LaundryDashboard birleşimi

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 10: App.jsx Routing + Temizlik

**Files:**
- Modify: `frontend/src/App.jsx`
- Delete: `frontend/src/modules/laundry/LaundryPage.jsx`
- Delete: `frontend/src/modules/laundry/LaundryDashboard.jsx`

- [ ] **Step 1: App.jsx'te import'ları değiştir**

Şu iki satırı bul:
```js
const LaundryPage = lazy(() => import('./modules/laundry/LaundryPage.jsx'))
const LaundryDashboard = lazy(() => import('./modules/laundry/LaundryDashboard.jsx'))
```

İkisini birden şununla değiştir:
```js
const LaundryHub = lazy(() => import('./modules/laundry/LaundryHub.jsx'))
```

- [ ] **Step 2: App.jsx'te route'ları güncelle**

Şu iki satırı bul:
```jsx
<Route path="laundry/dashboard" element={<LaundryDashboard />} />
<Route path="laundry/list" element={<LaundryPage />} />
```

İkisini şununla değiştir:
```jsx
<Route path="laundry/dashboard" element={<LaundryHub defaultView="kanban" />} />
<Route path="laundry/list"      element={<LaundryHub defaultView="liste"  />} />
```

- [ ] **Step 3: Eski dosyaları sil**

```bash
rm "frontend/src/modules/laundry/LaundryPage.jsx"
rm "frontend/src/modules/laundry/LaundryDashboard.jsx"
```

- [ ] **Step 4: Frontend'i başlat ve smoke test**

```bash
npm run dev
```

Tarayıcıda:
- `http://localhost:5173/laundry/dashboard` → Kanban view yükleniyor mu?
- `http://localhost:5173/laundry/list` → Liste view yükleniyor mu?
- View toggle çalışıyor mu (⊞ / ≡)?
- "Yönet" butonu → MachineManagerPanel açılıyor mu?
- KPI strip 5 kart gösteriyor mu?
- Bir dirty item'da "Makineye At" → AssignModal açılıyor mu?
- Bir washing item'da "Rafa Koy" → ShelfModal açılıyor mu?
- "Kayıp İşaretle" → LostModal açılıyor mu?

- [ ] **Step 5: Backend testleri çalıştır**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js
```

Beklenen: Tümü PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.jsx
git rm frontend/src/modules/laundry/LaundryPage.jsx
git rm frontend/src/modules/laundry/LaundryDashboard.jsx
git commit -m "refactor: laundry routing → LaundryHub, eski sayfalar kaldırıldı

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Self-Review Notları

### Spec coverage kontrol:
| Spec gereksinimi | Task |
|-----------------|------|
| LaundryPage + LaundryDashboard → LaundryHub | Task 9, Task 10 |
| prompt() → AssignModal (dirty→washing) | Task 3, Task 7, Task 9 |
| prompt() → ShelfModal (washing→ready) | Task 4, Task 7, Task 9 |
| confirm() → LostModal | Task 5, Task 7, Task 9 |
| confirm(sil) → iki adımlı | Task 7 |
| MachineManagerPanel | Task 6 |
| MachineStrip type fix | Task 2 |
| MachineStrip timer 1s | Task 2 |
| MachineStrip totalMinutes | Task 2 |
| timer_end backend'de set | Task 1 |
| timer_started_at kolonu | Task 1 |
| SSE → query invalidation | Task 8 |
| defaultView prop (routing) | Task 9, Task 10 |
| KPI strip oran bar | Task 9 |
| "Makineleri Yönet" butonu | Task 9 |
| View toggle kanban/liste | Task 9 |
| Batch seçim (liste) | Task 9 |

Tüm gereksinimler karşılanıyor. ✓
