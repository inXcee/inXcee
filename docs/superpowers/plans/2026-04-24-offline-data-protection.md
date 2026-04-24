# Offline Veri Koruma Implementation Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** IndexedDB tabanlı offline queue (mobile, foto blob desteği) + desktop form draft auto-save.

**Architecture:** `offlineDB.js` — tek utility modülü, 3 IndexedDB store (`offline_queue`, `offline_blobs`, `form_drafts`). Mobile eylemleri per-item drain ile kuyruğa alır. Desktop formlar `useDraft` hook + `DraftBanner` bileşeni ile 800ms debounce taslak kaydeder. Eski `offlineQueue.js` (localStorage) silinir.

**Tech Stack:** IndexedDB (native), fake-indexeddb (test), React hooks, vitest

---

## Task 1: fake-indexeddb kur + offlineDB testlerini yaz (başarısız olmalı)

**Files:**
- Create: `frontend/src/shared/utils/offlineDB.test.js`

- [ ] **Adım 1: fake-indexeddb'yi frontend'e yükle**

```bash
cd frontend && npm install -D fake-indexeddb
```

Beklenen: `fake-indexeddb` paketinin `package.json` devDependencies'e eklenmesi.

- [ ] **Adım 2: Test dosyasını yaz**

`frontend/src/shared/utils/offlineDB.test.js` oluştur:

```js
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  enqueue, getQueue, dequeue, updateRetries,
  getBlob, saveDraft, loadDraft, clearDraft,
  _resetForTests,
} from './offlineDB.js'

beforeEach(async () => {
  await _resetForTests()
})

describe('enqueue / getQueue / dequeue', () => {
  it('item ekler ve siler', async () => {
    const id = await enqueue('complete_task', { taskId: 42 })
    const q = await getQueue()
    expect(q).toHaveLength(1)
    expect(q[0]).toMatchObject({ type: 'complete_task', payload: { taskId: 42 }, retries: 0, blobIds: [] })
    await dequeue(id)
    expect(await getQueue()).toHaveLength(0)
  })

  it('birden fazla item sırayla eklenir', async () => {
    await enqueue('complete_task', { taskId: 1 })
    await enqueue('skip_task', { taskId: 2, reason: 'meşgul' })
    const q = await getQueue()
    expect(q).toHaveLength(2)
    expect(q[0].type).toBe('complete_task')
    expect(q[1].type).toBe('skip_task')
  })
})

describe('updateRetries', () => {
  it('retry sayısını günceller', async () => {
    const id = await enqueue('complete_task', { taskId: 1 })
    await updateRetries(id, 2)
    const q = await getQueue()
    expect(q[0].retries).toBe(2)
  })
})

describe('blob desteği', () => {
  it('blob ile enqueue eder, getBlob döner, dequeue blob\'u da siler', async () => {
    const blob = new Blob(['foto'], { type: 'image/jpeg' })
    const id = await enqueue('fault_report', { location: 'A1' }, [blob])
    const q = await getQueue()
    expect(q[0].blobIds).toHaveLength(1)
    const fetched = await getBlob(q[0].blobIds[0])
    expect(fetched).toBe(blob)
    const blobId = q[0].blobIds[0]
    await dequeue(id)
    expect(await getBlob(blobId)).toBeNull()
  })
})

describe('form_drafts', () => {
  it('draft kaydeder ve yükler', async () => {
    await saveDraft('draft:checkin', { full_name: 'Ali', company: 'ABC' })
    const data = await loadDraft('draft:checkin')
    expect(data).toEqual({ full_name: 'Ali', company: 'ABC' })
  })

  it('yoksa null döner', async () => {
    expect(await loadDraft('draft:yok')).toBeNull()
  })

  it('clearDraft siler', async () => {
    await saveDraft('draft:test', { x: 1 })
    await clearDraft('draft:test')
    expect(await loadDraft('draft:test')).toBeNull()
  })
})
```

- [ ] **Adım 3: Testlerin başarısız olduğunu doğrula**

```bash
cd backend && npx vitest run ../frontend/src/shared/utils/offlineDB.test.js 2>&1 | tail -20
```

Beklenen: `Cannot find module './offlineDB.js'` veya benzeri import hatası.

---

## Task 2: offlineDB.js utility yaz (testleri geçir)

**Files:**
- Create: `frontend/src/shared/utils/offlineDB.js`

- [ ] **Adım 1: offlineDB.js yaz**

`frontend/src/shared/utils/offlineDB.js` oluştur:

```js
const DB_NAME = 'yys-db'
const DB_VERSION = 1
let _db = null

function openDB() {
  if (_db) return Promise.resolve(_db)
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = ({ target }) => {
      const db = target.result
      if (!db.objectStoreNames.contains('offline_queue'))
        db.createObjectStore('offline_queue', { keyPath: 'id', autoIncrement: true })
      if (!db.objectStoreNames.contains('offline_blobs'))
        db.createObjectStore('offline_blobs', { keyPath: 'id', autoIncrement: true })
      if (!db.objectStoreNames.contains('form_drafts'))
        db.createObjectStore('form_drafts', { keyPath: 'key' })
    }
    req.onsuccess = ({ target }) => { _db = target.result; resolve(_db) }
    req.onerror = () => reject(req.error)
  })
}

function p(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function enqueue(type, payload, blobs = []) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const stores = blobs.length > 0 ? ['offline_queue', 'offline_blobs'] : ['offline_queue']
    const tx = db.transaction(stores, 'readwrite')
    const qStore = tx.objectStore('offline_queue')

    if (blobs.length === 0) {
      const req = qStore.add({ type, payload, blobIds: [], ts: Date.now(), retries: 0 })
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
      return
    }

    const bStore = tx.objectStore('offline_blobs')
    const blobIds = []
    let pending = blobs.length

    blobs.forEach(blob => {
      const req = bStore.add({ blob })
      req.onsuccess = () => {
        blobIds.push(req.result)
        if (--pending === 0) {
          const qReq = qStore.add({ type, payload, blobIds, ts: Date.now(), retries: 0 })
          qReq.onsuccess = () => resolve(qReq.result)
          qReq.onerror = () => reject(qReq.error)
        }
      }
      req.onerror = () => reject(req.error)
    })
  })
}

export async function dequeue(id) {
  const db = await openDB()
  const item = await new Promise((resolve, reject) => {
    const tx = db.transaction('offline_queue', 'readonly')
    const req = tx.objectStore('offline_queue').get(id)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  if (!item) return
  await new Promise((resolve, reject) => {
    const stores = item.blobIds.length > 0 ? ['offline_queue', 'offline_blobs'] : ['offline_queue']
    const tx = db.transaction(stores, 'readwrite')
    item.blobIds.forEach(bid => tx.objectStore('offline_blobs').delete(bid))
    tx.objectStore('offline_queue').delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getQueue() {
  const db = await openDB()
  return p(db.transaction('offline_queue', 'readonly').objectStore('offline_queue').getAll())
}

export async function getBlob(id) {
  const db = await openDB()
  const record = await p(db.transaction('offline_blobs', 'readonly').objectStore('offline_blobs').get(id))
  return record?.blob ?? null
}

export async function updateRetries(id, retries) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_queue', 'readwrite')
    const store = tx.objectStore('offline_queue')
    const getReq = store.get(id)
    getReq.onsuccess = () => {
      if (!getReq.result) { resolve(); return }
      const putReq = store.put({ ...getReq.result, retries })
      putReq.onsuccess = () => resolve()
      putReq.onerror = () => reject(putReq.error)
    }
    getReq.onerror = () => reject(getReq.error)
  })
}

export async function saveDraft(key, data) {
  const db = await openDB()
  return p(db.transaction('form_drafts', 'readwrite').objectStore('form_drafts').put({ key, data, ts: Date.now() }))
}

export async function loadDraft(key) {
  const db = await openDB()
  const record = await p(db.transaction('form_drafts', 'readonly').objectStore('form_drafts').get(key))
  return record?.data ?? null
}

export async function clearDraft(key) {
  const db = await openDB()
  return p(db.transaction('form_drafts', 'readwrite').objectStore('form_drafts').delete(key))
}

// Yalnızca testlerde kullan — modül state'ini ve DB'yi sıfırlar
export function _resetForTests() {
  return new Promise(resolve => {
    if (_db) { _db.close(); _db = null }
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}
```

- [ ] **Adım 2: Testleri çalıştır, hepsinin geçtiğini doğrula**

```bash
cd backend && npx vitest run ../frontend/src/shared/utils/offlineDB.test.js 2>&1 | tail -20
```

Beklenen:
```
✓ frontend/src/shared/utils/offlineDB.test.js (7 tests)
Test Files  1 passed (1)
Tests       7 passed (7)
```

- [ ] **Adım 3: Commit**

```bash
git add frontend/src/shared/utils/offlineDB.js frontend/src/shared/utils/offlineDB.test.js frontend/package-lock.json frontend/package.json
git commit -m "feat: IndexedDB offline utility — queue, blob, draft store"
```

---

## Task 3: MobileLayout drain yeniden yaz

**Files:**
- Modify: `frontend/src/modules/mobile/shared/MobileLayout.jsx`

- [ ] **Adım 1: Import'ları güncelle**

`MobileLayout.jsx` dosyasının başındaki importları şöyle güncelle:

```js
import { useState, useEffect, useCallback } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useMobileAuth } from '../auth/useMobileAuth.js'
import { useMobileSSE } from '../../../shared/hooks/useMobileSSE.js'
import { getQueue, dequeue, updateRetries, getBlob } from '../../../shared/utils/offlineDB.js'
import { useToastStore } from '../../../shared/store/toastStore.js'
import { useMobilePrefs } from '../../../shared/store/mobilePrefsStore.js'
```

- [ ] **Adım 2: `pendingCount` ve drain useEffect'i değiştir**

Mevcut `const [pendingCount, setPendingCount] = useState(() => getQueue().length)` satırını ve drain `useEffect`'ini (satır 19–51) şununla değiştir:

```js
const { addToast } = useToastStore()
const [pendingCount, setPendingCount] = useState(0)

useEffect(() => {
  getQueue().then(q => setPendingCount(q.length)).catch(() => {})
}, [])

useEffect(() => {
  if (!isOnline) return

  async function replayItem(item, token) {
    const headers = { Authorization: `Bearer ${token}` }
    const ok = r => { if (!r.ok) throw new Error(r.status) }
    if (item.type === 'complete_task') {
      ok(await fetch(`/api/housekeeping/tasks/${item.payload.taskId}/complete`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklist: item.payload.checklist ?? [] }),
      }))
    } else if (item.type === 'skip_task') {
      ok(await fetch(`/api/housekeeping/tasks/${item.payload.taskId}/skip`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: item.payload.reason }),
      }))
    } else if (item.type === 'fault_report') {
      const fd = new FormData()
      fd.append('location', item.payload.location)
      fd.append('description', item.payload.description)
      fd.append('priority', item.payload.priority)
      if (item.blobIds?.length > 0) {
        const blob = await getBlob(item.blobIds[0])
        if (blob) fd.append('photo', blob, 'photo.jpg')
      }
      ok(await fetch('/api/housekeeping/fault-report', { method: 'POST', headers, body: fd }))
    } else if (item.type === 'quick_fault') {
      ok(await fetch('/api/maintenance/requests', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(item.payload),
      }))
    }
  }

  async function drain() {
    const queue = await getQueue()
    if (queue.length === 0) return
    const { token } = useMobileAuth.getState()
    for (const item of queue) {
      try {
        await replayItem(item, token)
        await dequeue(item.id)
        if (item.type === 'complete_task' || item.type === 'skip_task') {
          qc.invalidateQueries({ queryKey: ['mobile-hk-tasks'] })
        }
        if (item.type === 'quick_fault') {
          qc.invalidateQueries({ queryKey: ['mobile-tech-requests'] })
        }
      } catch {
        if (item.retries >= 2) {
          addToast(`Çevrimdışı işlem gönderilemedi — silindi (${item.type})`, 'error')
          await dequeue(item.id)
        } else {
          await updateRetries(item.id, item.retries + 1)
        }
      }
    }
    setPendingCount(0)
  }

  drain().catch(() => {})
}, [isOnline])
```

- [ ] **Adım 3: Backend testlerini çalıştır**

```bash
cd backend && npx vitest run 2>&1 | tail -10
```

Beklenen: `372 passed` (veya mevcut sayı).

- [ ] **Adım 4: Commit**

```bash
git add frontend/src/modules/mobile/shared/MobileLayout.jsx
git commit -m "feat: mobile drain — per-item retry, IndexedDB, 4 eylem tipi"
```

---

## Task 4: HousekeeperHome — enqueue import güncelle

**Files:**
- Modify: `frontend/src/modules/mobile/housekeeper/HousekeeperHome.jsx`

- [ ] **Adım 1: Import'u değiştir**

Satır 7'deki:
```js
import { enqueue } from '../../../shared/utils/offlineQueue.js'
```
şunu ile değiştir:
```js
import { enqueue } from '../../../shared/utils/offlineDB.js'
```

- [ ] **Adım 2: enqueue çağrısını güncelle (checklist yok, boş geç)**

`onError` içindeki satır 48'i doğrula — değişiklik gerekmeyebilir:
```js
if (!navigator.onLine) enqueue('complete_task', { taskId })
```
Bu HousekeeperHome'da checklist olmadan "hızlı tamamlama" — `checklist: []` olarak bırak, doğru.

- [ ] **Adım 3: Commit**

```bash
git add frontend/src/modules/mobile/housekeeper/HousekeeperHome.jsx
git commit -m "fix: HousekeeperHome — offlineDB import güncelle"
```

---

## Task 5: TaskDetail — complete + skip offline queue

**Files:**
- Modify: `frontend/src/modules/mobile/housekeeper/TaskDetail.jsx`

- [ ] **Adım 1: Import ekle**

Dosyanın başına ekle:
```js
import { enqueue } from '../../../shared/utils/offlineDB.js'
```

- [ ] **Adım 2: completeMut'a onError ekle**

Mevcut `completeMut` tanımını (satır 45–48) şununla değiştir:
```js
const completeMut = useMutation({
  mutationFn: () => mobileApi.post(`/housekeeping/tasks/${id}/complete`, { checklist }),
  onSuccess: () => { qc.invalidateQueries({ queryKey: ['mobile-hk-tasks'] }); navigate(-1) },
  onError: () => {
    if (!navigator.onLine) {
      enqueue('complete_task', { taskId: id, checklist })
      navigate(-1)
    }
  },
})
```

- [ ] **Adım 3: skipMut'a onError ekle**

Mevcut `skipMut` tanımını (satır 50–53) şununla değiştir:
```js
const skipMut = useMutation({
  mutationFn: () => mobileApi.patch(`/housekeeping/tasks/${id}/skip`, { reason: skipReason }),
  onSuccess: () => { qc.invalidateQueries({ queryKey: ['mobile-hk-tasks'] }); navigate(-1) },
  onError: () => {
    if (!navigator.onLine) {
      enqueue('skip_task', { taskId: id, reason: skipReason })
      navigate(-1)
    }
  },
})
```

- [ ] **Adım 4: Commit**

```bash
git add frontend/src/modules/mobile/housekeeper/TaskDetail.jsx
git commit -m "feat: TaskDetail — complete + skip offline queue"
```

---

## Task 6: FaultReport — foto blob offline queue

**Files:**
- Modify: `frontend/src/modules/mobile/housekeeper/FaultReport.jsx`

- [ ] **Adım 1: Import ekle**

Dosyanın başına ekle:
```js
import { enqueue } from '../../../shared/utils/offlineDB.js'
```

- [ ] **Adım 2: `isQueued` state ekle + mutation'ı güncelle**

Mevcut `mutation` tanımını ve `success` state'ini şununla değiştir:

```js
const [success, setSuccess] = useState(false)
const [isQueued, setIsQueued] = useState(false)

const mutation = useMutation({
  mutationFn: async () => {
    const fd = new FormData()
    fd.append('location', form.location)
    fd.append('description', form.description)
    fd.append('priority', form.priority)
    if (photo) fd.append('photo', await compressImage(photo))
    return mobileApi.post('/housekeeping/fault-report', fd)
  },
  onSuccess: () => { navigator.vibrate?.([20, 60, 20]); setSuccess(true) },
  onError: async () => {
    if (!navigator.onLine) {
      const blobs = photo ? [await compressImage(photo)] : []
      await enqueue('fault_report', { location: form.location, description: form.description, priority: form.priority }, blobs)
      setIsQueued(true)
      setSuccess(true)
    }
  },
})
```

- [ ] **Adım 3: Success ekranına isQueued mesajı ekle**

Mevcut success `return` bloğunu şununla değiştir:

```js
if (success) return (
  <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', textAlign: 'center' }}>
    <div style={{ fontSize: '56px', marginBottom: '16px' }}>{isQueued ? '📴' : '✅'}</div>
    <h2 style={{ fontWeight: 700, margin: '0 0 8px' }}>
      {isQueued ? 'Çevrimdışı Kaydedildi' : 'Arıza Bildirildi'}
    </h2>
    <p style={{ color: '#6b7280', margin: '0 0 32px' }}>
      {isQueued ? 'İnternet gelince otomatik gönderilecek' : 'Teknik ekip bilgilendirildi'}
    </p>
    <button onClick={reset} style={submitBtn('#3b82f6', true)}>Yeni Bildirim Yap</button>
  </div>
)
```

- [ ] **Adım 4: `reset` fonksiyonuna `isQueued` sıfırlama ekle**

```js
function reset() {
  setForm({ location: '', description: '', priority: 'medium' })
  setPhoto(null)
  setSuccess(false)
  setIsQueued(false)
}
```

- [ ] **Adım 5: Commit**

```bash
git add frontend/src/modules/mobile/housekeeper/FaultReport.jsx
git commit -m "feat: FaultReport — foto blob offline queue"
```

---

## Task 7: QuickFault — offline queue

**Files:**
- Modify: `frontend/src/modules/mobile/technician/QuickFault.jsx`

- [ ] **Adım 1: Import + state ekle**

Dosyanın başına ekle:
```js
import { enqueue } from '../../../shared/utils/offlineDB.js'
```

`const [success, setSuccess] = useState(null)` satırından sonra ekle:
```js
const [isQueued, setIsQueued] = useState(false)
```

- [ ] **Adım 2: mutation'a onError ekle**

Mevcut `mutation` tanımını şununla değiştir:
```js
const mutation = useMutation({
  mutationFn: () => mobileApi.post('/maintenance/requests', form),
  onSuccess: res => {
    setSuccess(res.data.id)
    qc.invalidateQueries({ queryKey: ['mobile-tech-requests'] })
  },
  onError: async () => {
    if (!navigator.onLine) {
      await enqueue('quick_fault', form)
      setIsQueued(true)
      setSuccess('offline')
    }
  },
})
```

- [ ] **Adım 3: Success ekranına isQueued mesajı ekle**

Mevcut success `return` bloğunu şununla değiştir:
```js
if (success) return (
  <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', textAlign: 'center' }}>
    <div style={{ fontSize: '56px', marginBottom: '16px' }}>{isQueued ? '📴' : '🔧'}</div>
    <h2 style={{ fontWeight: 700, margin: '0 0 8px' }}>
      {isQueued ? 'Çevrimdışı Kaydedildi' : 'Talep Oluşturuldu'}
    </h2>
    {!isQueued && <p style={{ color: '#6b7280', margin: '0 0 4px' }}>Talep #{success}</p>}
    <p style={{ color: '#9ca3af', fontSize: '13px', margin: '0 0 32px' }}>
      {isQueued ? 'İnternet gelince otomatik gönderilecek' : 'Talep sisteme kaydedildi'}
    </p>
    <button onClick={reset} style={submitBtn('#3b82f6', true)}>Yeni Talep Oluştur</button>
  </div>
)
```

- [ ] **Adım 4: `reset` fonksiyonuna isQueued sıfırlama ekle**

```js
function reset() {
  setForm({ location: '', description: '', priority: 'medium' })
  setSuccess(null)
  setIsQueued(false)
}
```

- [ ] **Adım 5: Commit**

```bash
git add frontend/src/modules/mobile/technician/QuickFault.jsx
git commit -m "feat: QuickFault — offline queue"
```

---

## Task 8: Eski offlineQueue.js'i kaldır

**Files:**
- Delete: `frontend/src/shared/utils/offlineQueue.js`

- [ ] **Adım 1: Kalan import var mı kontrol et**

```bash
grep -r "offlineQueue" frontend/src --include="*.js" --include="*.jsx"
```

Beklenen: Sonuç yok (tüm import'lar değiştirildi).

- [ ] **Adım 2: Dosyayı sil**

```bash
git rm frontend/src/shared/utils/offlineQueue.js
```

- [ ] **Adım 3: Commit**

```bash
git commit -m "chore: eski offlineQueue.js (localStorage) kaldır"
```

---

## Task 9: DraftBanner bileşeni + useDraft hook

**Files:**
- Create: `frontend/src/shared/components/DraftBanner.jsx`
- Create: `frontend/src/shared/hooks/useDraft.js`

- [ ] **Adım 1: DraftBanner bileşenini yaz**

`frontend/src/shared/components/DraftBanner.jsx` oluştur:

```jsx
export default function DraftBanner({ hasDraft, onRestore, onDiscard }) {
  if (!hasDraft) return null
  return (
    <div style={{
      background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '8px',
      padding: '10px 14px', marginBottom: '16px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      fontSize: '13px',
    }}>
      <span style={{ color: '#92400e' }}>📋 Kaydedilmemiş taslak var</span>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={onDiscard}
          style={{ background: 'none', border: '1px solid #d97706', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', color: '#92400e', fontSize: '12px' }}>
          Temizle
        </button>
        <button
          onClick={onRestore}
          style={{ background: '#f59e0b', border: 'none', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', color: '#fff', fontSize: '12px', fontWeight: 600 }}>
          Devam Et
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Adım 2: useDraft hook'u yaz**

`frontend/src/shared/hooks/useDraft.js` oluştur:

```js
import { useEffect, useRef, useCallback, useState } from 'react'
import { saveDraft, loadDraft, clearDraft } from '../utils/offlineDB.js'

// key       — IndexedDB draft anahtarı ('draft:checkin' gibi)
// state     — form state objesi
// setState  — form state setter'ı
// initState — formun başlangıç state'i; bu değerle aynıysa draft kaydedilmez
export function useDraft(key, state, setState, initState) {
  const [hasDraft, setHasDraft] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    loadDraft(key).then(data => { if (data) setHasDraft(true) }).catch(() => {})
  }, [key])

  useEffect(() => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      if (JSON.stringify(state) === JSON.stringify(initState)) {
        clearDraft(key).catch(() => {})
        return
      }
      saveDraft(key, state).catch(() => {})
    }, 800)
    return () => clearTimeout(timerRef.current)
  }, [key, state, initState])

  const restoreDraft = useCallback(async () => {
    try {
      const data = await loadDraft(key)
      if (data) { setState(data); setHasDraft(false) }
    } catch {}
  }, [key, setState])

  const discardDraft = useCallback(() => {
    clearDraft(key).catch(() => {})
    setHasDraft(false)
  }, [key])

  const onSubmitSuccess = useCallback(() => {
    clearDraft(key).catch(() => {})
    setHasDraft(false)
  }, [key])

  return { hasDraft, restoreDraft, discardDraft, onSubmitSuccess }
}
```

- [ ] **Adım 3: Backend testlerini çalıştır**

```bash
cd backend && npx vitest run 2>&1 | tail -10
```

Beklenen: tüm testler geçer.

- [ ] **Adım 4: Commit**

```bash
git add frontend/src/shared/components/DraftBanner.jsx frontend/src/shared/hooks/useDraft.js
git commit -m "feat: DraftBanner bileşeni + useDraft hook"
```

---

## Task 10: AnnouncementsPage — useDraft

**Files:**
- Modify: `frontend/src/modules/admin/AnnouncementsPage.jsx`

- [ ] **Adım 1: Import'ları ekle**

Dosyanın başına ekle:
```js
import { useDraft } from '../../shared/hooks/useDraft.js'
import DraftBanner from '../../shared/components/DraftBanner.jsx'
```

- [ ] **Adım 2: initState sabiti + useDraft hook ekle**

`const [form, setForm] = useState({ title:'', body:'', expires_at:'' })` satırından sonra ekle:
```js
const INIT_FORM = { title: '', body: '', expires_at: '' }
const { hasDraft, restoreDraft, discardDraft, onSubmitSuccess } = useDraft('draft:announcement', form, setForm, INIT_FORM)
```

`useState` tanımını da düzelt — başlangıç değeri `INIT_FORM`'u referans etmesi için sabit olarak dışarı çıkar (ya da satır içinde bırak, fark etmez).

- [ ] **Adım 3: mutation onSuccess'e onSubmitSuccess ekle**

Mevcut `onSuccess`:
```js
onSuccess: () => {
  setForm({ title:'', body:'', expires_at:'' })
  qc.invalidateQueries(...)
}
```

Şununla değiştir:
```js
onSuccess: () => {
  onSubmitSuccess()
  setForm(INIT_FORM)
  qc.invalidateQueries({ queryKey: ['admin-announcements'] })
}
```

- [ ] **Adım 4: Form'un üstüne DraftBanner ekle**

Form alanlarının hemen üstüne (JSX içinde `<input value={form.title}...` öncesine):
```jsx
<DraftBanner hasDraft={hasDraft} onRestore={restoreDraft} onDiscard={discardDraft} />
```

- [ ] **Adım 5: Commit**

```bash
git add frontend/src/modules/admin/AnnouncementsPage.jsx
git commit -m "feat: AnnouncementsPage — form draft auto-save"
```

---

## Task 11: MaintenancePage — useDraft (yeni arıza formu)

**Files:**
- Modify: `frontend/src/modules/maintenance/MaintenancePage.jsx`

- [ ] **Adım 1: Import'ları ekle**

```js
import { useDraft } from '../../shared/hooks/useDraft.js'
import DraftBanner from '../../shared/components/DraftBanner.jsx'
```

- [ ] **Adım 2: useDraft hook ekle**

`const [form, setForm] = useState({ location: '', description: '', priority: 'medium' })` satırından (satır ~984) hemen sonra:
```js
const INIT_MAINTENANCE = { location: '', description: '', priority: 'medium' }
const { hasDraft, restoreDraft, discardDraft, onSubmitSuccess } = useDraft('draft:maintenance', form, setForm, INIT_MAINTENANCE)
```

- [ ] **Adım 3: Submit mutation onSuccess'e ekle**

Yeni arıza form mutation'ının `onSuccess` içine `onSubmitSuccess()` ekle (satır ~1030):
```js
onSuccess: () => {
  onSubmitSuccess()
  setShowForm(false)
  setForm(INIT_MAINTENANCE)
  // mevcut invalidate çağrıları
}
```

- [ ] **Adım 4: Form JSX'inin üstüne DraftBanner ekle**

`showForm && (...)` bloğunun içinde, form alanlarının hemen üstüne:
```jsx
<DraftBanner hasDraft={hasDraft} onRestore={restoreDraft} onDiscard={discardDraft} />
```

- [ ] **Adım 5: Commit**

```bash
git add frontend/src/modules/maintenance/MaintenancePage.jsx
git commit -m "feat: MaintenancePage — yeni arıza form draft auto-save"
```

---

## Task 12: DisciplinePage — useDraft

**Files:**
- Modify: `frontend/src/modules/discipline/DisciplinePage.jsx`

- [ ] **Adım 1: Import'ları ekle**

```js
import { useDraft } from '../../shared/hooks/useDraft.js'
import DraftBanner from '../../shared/components/DraftBanner.jsx'
```

- [ ] **Adım 2: useDraft hook ekle**

`const [cardForm, setCardForm] = useState({ card_type: 'yellow', reason: '' })` satırından sonra:
```js
const INIT_CARD = { card_type: 'yellow', reason: '' }
const { hasDraft, restoreDraft, discardDraft, onSubmitSuccess } = useDraft('draft:discipline', cardForm, setCardForm, INIT_CARD)
```

- [ ] **Adım 3: Kart verme mutation'ına onSubmitSuccess ekle**

Kart verme mutation `onSuccess` içine:
```js
onSuccess: () => {
  onSubmitSuccess()
  setCardForm(INIT_CARD)
  // mevcut kodlar
}
```

- [ ] **Adım 4: DraftBanner ekle**

Kart formu alanlarının üstüne:
```jsx
<DraftBanner hasDraft={hasDraft} onRestore={restoreDraft} onDiscard={discardDraft} />
```

- [ ] **Adım 5: Commit**

```bash
git add frontend/src/modules/discipline/DisciplinePage.jsx
git commit -m "feat: DisciplinePage — ceza kartı form draft auto-save"
```

---

## Task 13: CheckinPage — useDraft (formData)

**Files:**
- Modify: `frontend/src/modules/checkin/CheckinPage.jsx`

- [ ] **Adım 1: Import'ları ekle**

```js
import { useDraft } from '../../shared/hooks/useDraft.js'
import DraftBanner from '../../shared/components/DraftBanner.jsx'
```

- [ ] **Adım 2: useDraft hook ekle**

`const [formData, setFormData] = useState({...})` satırından (satır ~423) sonra:
```js
const INIT_FORM_DATA = { full_name: '', company: '', job_title: '', preferred_block: '', phone_number: '', emergency_name: '', emergency_phone: '' }
const { hasDraft, restoreDraft, discardDraft, onSubmitSuccess } = useDraft('draft:checkin', formData, setFormData, INIT_FORM_DATA)
```

- [ ] **Adım 3: Başarılı check-in sonrası onSubmitSuccess çağır**

Personel kayıt mutation'ının `onSuccess` içine (formu sıfırladığı yer):
```js
onSubmitSuccess()
setFormData(INIT_FORM_DATA)
```

- [ ] **Adım 4: Form adım 1'de DraftBanner göster**

`step === 0` ya da `step === 1` olduğunda kişisel bilgi form alanlarının üstüne:
```jsx
<DraftBanner hasDraft={hasDraft} onRestore={restoreDraft} onDiscard={discardDraft} />
```

- [ ] **Adım 5: Commit**

```bash
git add frontend/src/modules/checkin/CheckinPage.jsx
git commit -m "feat: CheckinPage — kişisel bilgi form draft auto-save"
```

---

## Task 14: ZimmetForm — useDraft (imza hariç)

**Files:**
- Modify: `frontend/src/modules/checkin/ZimmetForm.jsx`

- [ ] **Adım 1: Import'ları ekle**

```js
import { useDraft } from '../../shared/hooks/useDraft.js'
import DraftBanner from '../../shared/components/DraftBanner.jsx'
```

- [ ] **Adım 2: useDraft hook ekle**

`export default function ZimmetForm({ personnelId, onDone })` fonksiyonunun içine, `items` state tanımından hemen sonra:
```js
const INIT_ITEMS = DEFAULT_ITEMS.map(i => ({ ...i, checked: true }))
const { hasDraft, restoreDraft, discardDraft, onSubmitSuccess } = useDraft(
  `draft:zimmet:${personnelId}`,
  items,
  setItems,
  INIT_ITEMS,
)
```

Not: `INIT_ITEMS` referans eşitliği için her render'da yeniden oluşturulmamalı. `useMemo` kullan:
```js
const INIT_ITEMS = useMemo(() => DEFAULT_ITEMS.map(i => ({ ...i, checked: true })), [])
```
Ve `useDraft`'ın dördüncü parametresine bunu ver.

`useMemo` import'u yoksa ekle: `import { useState, useRef, useMemo } from 'react'`

- [ ] **Adım 3: Submit sonrası onSubmitSuccess çağır**

Zimmet kaydedildiğinde (imza POST'u onSuccess):
```js
onSubmitSuccess()
```

- [ ] **Adım 4: DraftBanner göster**

Checklist öncesine (form başına):
```jsx
<DraftBanner hasDraft={hasDraft} onRestore={restoreDraft} onDiscard={discardDraft} />
```

- [ ] **Adım 5: Commit**

```bash
git add frontend/src/modules/checkin/ZimmetForm.jsx
git commit -m "feat: ZimmetForm — zimmet listesi draft auto-save"
```

---

## Task 15: InventoryPage — useDraft (yeni stok kalemi)

**Files:**
- Modify: `frontend/src/modules/inventory/InventoryPage.jsx`

- [ ] **Adım 1: Import'ları ekle**

Dosyanın üstüne (mevcut import'ların yanına):
```js
import { useDraft } from '../../shared/hooks/useDraft.js'
import DraftBanner from '../../shared/components/DraftBanner.jsx'
```

- [ ] **Adım 2: ItemForm alt bileşenine useDraft ekle**

`ItemForm` fonksiyonu içinde `const [f, sf] = useState(...)` satırından sonra. `item` prop'u olmayan (yeni kayıt) durumda çalışır:
```js
const INIT_F = { item_name: '', quantity: 0, unit: 'adet', reorder_threshold: 0, category: 'general', location: '', unit_price: 0 }
const draftKey = item?.id ? null : 'draft:inventory:new-item'
const { hasDraft, restoreDraft, discardDraft, onSubmitSuccess } = useDraft(
  draftKey ?? 'draft:inventory:new-item',
  f,
  sf,
  item || INIT_F,
)
```

- [ ] **Adım 3: Submit mutation'ına onSubmitSuccess ekle**

`ItemForm` içindeki kayıt mutation `onSuccess`'ine:
```js
onSubmitSuccess()
```

- [ ] **Adım 4: Yeni kayıt modunda DraftBanner göster**

`ItemForm` JSX'inde, form alanlarının üstüne:
```jsx
{!item?.id && <DraftBanner hasDraft={hasDraft} onRestore={restoreDraft} onDiscard={discardDraft} />}
```

- [ ] **Adım 5: Commit**

```bash
git add frontend/src/modules/inventory/InventoryPage.jsx
git commit -m "feat: InventoryPage — yeni stok kalemi form draft auto-save"
```

---

## Task 16: Tüm testleri çalıştır + son doğrulama

- [ ] **Adım 1: Backend test suite**

```bash
cd backend && npx vitest run 2>&1 | tail -10
```

Beklenen: tüm testler geçer (`372 passed` ya da mevcut sayı).

- [ ] **Adım 2: offlineDB unit testleri**

```bash
cd backend && npx vitest run ../frontend/src/shared/utils/offlineDB.test.js 2>&1 | tail -10
```

Beklenen: `7 passed`.

- [ ] **Adım 3: offlineQueue referansı kalmadığını doğrula**

```bash
grep -r "offlineQueue" frontend/src --include="*.js" --include="*.jsx"
```

Beklenen: sonuç yok.

- [ ] **Adım 4: Final commit**

```bash
git add -A
git status
```

Uncommitted değişiklik yoksa işlem tamamdır.
