# Kayıp Parça Tazminat Takip — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kayıp kıyafet kaydına tahmini TL değeri + not eklemek ve arşiv tablosunda görüntülemek.

**Architecture:** `laundry_items` tablosuna 2 kolon (ALTER TABLE). Yeni `PATCH /items/:id/compensation` endpoint. Arşiv tablosunda "TAZMİNAT" kolonu + `CompensationModal.jsx`.

**Tech Stack:** SQLite (better-sqlite3), Express, React, @tanstack/react-query

---

## Dosya Haritası

| Değişim | Dosya | Ne yapılıyor |
|---------|-------|-------------|
| Modify | `backend/src/shared/db/index.js` | 2 ALTER TABLE ekle |
| Modify | `backend/src/modules/laundry/queries.js` | `updateCompensationQuery` ekle |
| Modify | `backend/src/modules/laundry/service.js` | `setCompensationService` ekle |
| Modify | `backend/src/modules/laundry/routes.js` | `PATCH /items/:id/compensation` ekle |
| Modify | `backend/src/modules/laundry/laundry.test.js` | 3 yeni test ekle |
| Modify | `frontend/src/modules/laundry/api.js` | `setCompensation` ekle |
| Create | `frontend/src/modules/laundry/components/CompensationModal.jsx` | Yeni modal |
| Modify | `frontend/src/modules/laundry/components/ArchiveTable.jsx` | TAZMİNAT kolonu |

---

## Task 1: DB Migration

**Files:**
- Modify: `backend/src/shared/db/index.js`

- [ ] **Step 1: Migration satırlarını ekle**

`backend/src/shared/db/index.js` dosyasında `laundry_items` ile ilgili son `try { db.exec('ALTER TABLE laundry_items ...') } catch(_) {}` bloklarından hemen sonrasına (yaklaşık satır 316 civarı, `laundry_items_v4b` bloğunun altına) ekle:

```js
try { db.exec(`ALTER TABLE laundry_items ADD COLUMN compensation_value REAL DEFAULT NULL`) } catch(_) {}
try { db.exec(`ALTER TABLE laundry_items ADD COLUMN compensation_note TEXT DEFAULT NULL`) } catch(_) {}
```

- [ ] **Step 2: DB başlatılabildiğini doğrula**

```bash
cd backend && node -e "import('./src/shared/db/index.js').then(m=>m.initDB()).then(()=>console.log('OK'))"
```

Beklenen çıktı: `OK` (hata yok)

- [ ] **Step 3: Commit**

```bash
git add backend/src/shared/db/index.js
git commit -m "feat: compensation_value + compensation_note kolonları laundry_items'a eklendi"
```

---

## Task 2: Backend — Query + Service + Route + Testler

**Files:**
- Modify: `backend/src/modules/laundry/queries.js`
- Modify: `backend/src/modules/laundry/service.js`
- Modify: `backend/src/modules/laundry/routes.js`
- Modify: `backend/src/modules/laundry/laundry.test.js`

- [ ] **Step 1: Önce testleri yaz (TDD)**

`backend/src/modules/laundry/laundry.test.js` dosyasında en alttaki `describe` bloğunun ardına yeni bir describe ekle:

```js
describe('compensation', () => {
  let id

  beforeEach(() => {
    // lost item oluştur
    const created = createItemService({ room_id: roomId, item_count: 2 }, userId)
    lostItemService(created.id, { notes: 'Test' }, userId)
    id = created.id
  })

  it('lost item'a tazminat değeri kaydedilir', async () => {
    const res = await request(app)
      .patch(`/api/laundry/items/${id}/compensation`)
      .set('Authorization', `Bearer ${token}`)
      .send({ value: 1250, note: 'Sakin beyanı' })
    expect(res.status).toBe(200)
    expect(res.body.compensation_value).toBe(1250)
    expect(res.body.compensation_note).toBe('Sakin beyanı')
  })

  it('lost olmayan item → 400', async () => {
    const other = createItemService({ room_id: roomId, item_count: 1 }, userId)
    const res = await request(app)
      .patch(`/api/laundry/items/${other.id}/compensation`)
      .set('Authorization', `Bearer ${token}`)
      .send({ value: 500 })
    expect(res.status).toBe(400)
  })

  it('negatif değer → 400', async () => {
    const res = await request(app)
      .patch(`/api/laundry/items/${id}/compensation`)
      .set('Authorization', `Bearer ${token}`)
      .send({ value: -100 })
    expect(res.status).toBe(400)
  })
})
```

> Not: `createItemService`, `lostItemService`, `roomId`, `userId`, `token` zaten test dosyasında import edilmiş durumda — mevcut describe bloklarını referans al.

- [ ] **Step 2: Testlerin şimdilik başarısız olduğunu doğrula**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js 2>&1 | tail -20
```

Beklenen: `compensation` describe'ındaki testler FAIL (route yok)

- [ ] **Step 3: Query ekle**

`backend/src/modules/laundry/queries.js` dosyasında `deleteDamageQuery` fonksiyonundan sonrasına ekle:

```js
export function updateCompensationQuery(id, value, note) {
  getDB().prepare(
    `UPDATE laundry_items SET compensation_value=?, compensation_note=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).run(value, note ?? null, id)
}
```

- [ ] **Step 4: Service ekle**

`backend/src/modules/laundry/service.js` dosyasında `lostItemService` fonksiyonundan sonrasına ekle:

```js
export function setCompensationService(id, { value, note }, userId) {
  if (value === undefined || value === null) throw new Error('Değer zorunlu')
  if (value < 0) throw new Error('Değer negatif olamaz')
  const item = q.getItemQuery(id)
  if (!item) throw new Error('Kayıt bulunamadı')
  if (item.status !== 'lost') throw new Error('Tazminat sadece kayıp kıyafetler için girilebilir')
  q.updateCompensationQuery(id, value, note)
  return q.getItemQuery(id)
}
```

- [ ] **Step 5: Route ekle**

`backend/src/modules/laundry/routes.js` dosyasında `PATCH /items/:id/lost` route'undan hemen sonrasına ekle:

```js
laundryRouter.patch('/items/:id/compensation', ...laundryFull, (req, res) => {
  try {
    const item = svc.setCompensationService(+req.params.id, req.body, req.user.id)
    res.json(item)
  } catch (e) { res.status(400).json({ error: e.message }) }
})
```

- [ ] **Step 6: Testleri çalıştır — geçmeli**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js 2>&1 | tail -20
```

Beklenen: `compensation` describe'ındaki 3 test PASS. Toplam test sayısı artmalı.

- [ ] **Step 7: Tüm testler**

```bash
cd backend && npx vitest run 2>&1 | tail -5
```

Beklenen: Tüm testler geçiyor, 0 fail.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/laundry/queries.js \
        backend/src/modules/laundry/service.js \
        backend/src/modules/laundry/routes.js \
        backend/src/modules/laundry/laundry.test.js
git commit -m "feat: setCompensation endpoint + service + query + testler"
```

---

## Task 3: Frontend — API + Modal + ArchiveTable

**Files:**
- Modify: `frontend/src/modules/laundry/api.js`
- Create: `frontend/src/modules/laundry/components/CompensationModal.jsx`
- Modify: `frontend/src/modules/laundry/components/ArchiveTable.jsx`

- [ ] **Step 1: API metodunu ekle**

`frontend/src/modules/laundry/api.js` dosyasında `getArchive` satırından sonrasına ekle:

```js
setCompensation: (id, data) => api.patch(`/laundry/items/${id}/compensation`, data).then(r => r.data),
```

- [ ] **Step 2: CompensationModal.jsx oluştur**

`frontend/src/modules/laundry/components/CompensationModal.jsx` dosyasını oluştur:

```jsx
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

const overlay = {
  position: 'fixed', inset: 0, zIndex: 1000,
  background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
}
const panel = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 14, width: '100%', maxWidth: 380,
  boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
}
const hdr = {
  padding: '18px 20px 12px',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  fontFamily: 'var(--display)', fontSize: 16, letterSpacing: 3,
  color: 'var(--text)', borderBottom: '1px solid var(--border)',
}
const lbl = {
  fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)',
  letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8,
}

export default function CompensationModal({ item, onClose }) {
  const qc = useQueryClient()
  const [value, setValue] = useState(item.compensation_value ?? '')
  const [note, setNote] = useState(item.compensation_note ?? '')

  const save = useMutation({
    mutationFn: () => laundryApi.setCompensation(item.id, {
      value: parseFloat(value),
      note: note.trim() || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['laundry-archive'] })
      onClose()
    },
  })

  const isValid = value !== '' && !isNaN(parseFloat(value)) && parseFloat(value) >= 0

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={panel}>
        <div style={hdr}>
          <span>TAZMİNAT GİRİŞİ</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14 }}>✕</button>
        </div>

        <div style={{ padding: '8px 20px 0', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>
          {item.block} · {item.room_no} — {item.item_count} parça
        </div>

        <div style={{ padding: '16px 20px 0' }}>
          <div style={lbl}>Tahmini Değer (TL) *</div>
          <input
            autoFocus
            type="number"
            min="0"
            step="0.01"
            className="form-input"
            style={{ width: '100%', padding: '10px 14px', fontSize: 13, borderRadius: 8 }}
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="0.00"
          />
        </div>

        <div style={{ padding: '12px 20px 0' }}>
          <div style={lbl}>Not (opsiyonel)</div>
          <textarea
            className="form-input"
            style={{ width: '100%', padding: '10px 14px', fontSize: 12, borderRadius: 8, resize: 'vertical', minHeight: 60 }}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Sakin beyanı, tahmini marka değeri..."
          />
        </div>

        <div style={{ padding: '16px 20px 20px', display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{
            padding: '10px 20px', borderRadius: 8, cursor: 'pointer',
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--text2)', fontFamily: 'var(--mono)', fontSize: 11,
          }}>İptal</button>
          <button
            onClick={() => save.mutate()}
            disabled={!isValid || save.isPending}
            style={{
              flex: 1, padding: 10, borderRadius: 8, cursor: isValid ? 'pointer' : 'not-allowed',
              background: isValid ? 'rgba(39,201,106,0.12)' : 'var(--surface2)',
              color: isValid ? 'var(--green)' : 'var(--text4)',
              border: `1px solid ${isValid ? 'rgba(39,201,106,0.3)' : 'var(--border)'}`,
              fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700,
              opacity: save.isPending ? 0.6 : 1,
            }}
          >
            {save.isPending ? '...' : 'Kaydet →'}
          </button>
        </div>

        {save.isError && (
          <div style={{ padding: '0 20px 12px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--red)' }}>
            {save.error?.response?.data?.error || 'Hata oluştu'}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: ArchiveTable.jsx güncelle**

`frontend/src/modules/laundry/components/ArchiveTable.jsx` dosyasında 3 yerde değişiklik yap:

**3a) Import ekle** — `import { laundryApi } from '../api.js'` satırından sonrasına tek satır ekle:
```jsx
import CompensationModal from './CompensationModal.jsx'
```

**3b) State ekle** — `const [filters, setFilters] = useState(...)` satırının hemen altına:
```jsx
const [compensationItem, setCompensationItem] = useState(null)
```

**3c) Tablo başlığına TAZMİNAT kolonu ekle** — mevcut `['ODA', 'TESLİM EDEN', 'PARÇA', 'GİRİŞ', 'TESLİM', 'SÜRE', 'DURUM', 'DOĞRULAMA']` dizisini güncelle:
```jsx
{['ODA', 'TESLİM EDEN', 'PARÇA', 'GİRİŞ', 'TESLİM', 'SÜRE', 'DURUM', 'DOĞRULAMA', 'TAZMİNAT'].map(h => (
  <th key={h} style={{ ...th, textAlign: ['PARÇA', 'SÜRE'].includes(h) ? 'right' : 'left' }}>{h}</th>
))}
```

**3d) Her satıra TAZMİNAT hücresi ekle** — `</tr>` kapanışından önce, DOĞRULAMA `<td>` bloğundan sonrasına:
```jsx
<td style={td} onClick={e => { if (item.status === 'lost') { e.stopPropagation(); setCompensationItem(item) } }}>
  {item.status === 'lost' ? (
    item.compensation_value != null ? (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 8px', borderRadius: 4, fontSize: 9, cursor: 'pointer',
        background: 'rgba(39,201,106,0.1)', border: '1px solid rgba(39,201,106,0.25)',
        color: 'var(--green)', fontWeight: 700,
      }}>
        ₺{Number(item.compensation_value).toLocaleString('tr-TR')}
      </span>
    ) : (
      <span style={{
        display: 'inline-flex', alignItems: 'center',
        padding: '2px 8px', borderRadius: 4, fontSize: 9, cursor: 'pointer',
        background: 'var(--surface2)', border: '1px solid var(--border)',
        color: 'var(--text3)',
      }}>
        + Değer Gir
      </span>
    )
  ) : null}
</td>
```

**3e) Modal'ı render et** — return içinde `</div>` kapanışından önce (bileşenin en altına):
```jsx
{compensationItem && (
  <CompensationModal item={compensationItem} onClose={() => setCompensationItem(null)} />
)}
```

- [ ] **Step 4: Dev server'da manuel doğrula**

```bash
cd "C:\Users\hrync\OneDrive\Masaüstü\test claude" && npm run dev
```

1. Çamaşırhane → Kayıtlar/Arşiv sekmesine git
2. Kayıp statüsünde bir kayıt bul — "TAZMİNAT" kolonunda `+ Değer Gir` görünmeli
3. Tıkla → modal açılmalı
4. Değer gir, kaydet → kolon `₺X.XXX` badge'e dönmeli
5. Badge'e tekrar tıkla → önceki değer dolu gelip düzenlenebilmeli

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/laundry/api.js \
        frontend/src/modules/laundry/components/CompensationModal.jsx \
        frontend/src/modules/laundry/components/ArchiveTable.jsx
git commit -m "feat: kayıp parça tazminat takibi — CompensationModal + ArchiveTable kolonu"
```
