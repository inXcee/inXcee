# Gelişmiş Kıyafet Girişi — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kiosk kıyafet girişini emoji grid + çoklu renk/desen seçimi + yönetilebilir tip kataloğu ile yeniden tasarlamak.

**Architecture:** Yeni `laundry_garment_types` DB tablosu tipları saklar. Backend CRUD endpoint'leri sağlar. Frontend'de `GarmentPicker` bileşeni her iki kıyafet giriş noktasında (`BagForm` premium bölümü ve `GarmentForm`) kullanılır. Admin yönetimi `LaundrySettings`'e eklenir.

**Tech Stack:** better-sqlite3, Express, React (inline styles — proje genelinde Tailwind yerine inline style kullanılıyor), @tanstack/react-query, Vitest + supertest

---

## Dosya Haritası

| Dosya | Değişiklik |
|-------|-----------|
| `backend/src/shared/db/index.js` | v7 migration: `laundry_garment_types` tablosu + seed data |
| `backend/src/modules/laundry/queries.js` | garment type CRUD sorguları eklenir |
| `backend/src/modules/laundry/routes.js` | `/garment-types` endpoint'leri eklenir |
| `backend/src/modules/laundry/laundry.test.js` | garment type testleri eklenir |
| `frontend/src/modules/laundry/api.js` | garmentType API metodları eklenir |
| `frontend/src/modules/laundry-kiosk/GarmentPicker.jsx` | **YENİ** — emoji grid bileşeni |
| `frontend/src/modules/laundry-kiosk/LaundryKioskPage.jsx` | `BagForm` ve `GarmentForm` güncellenir |
| `frontend/src/modules/laundry/LaundrySettings.jsx` | `GarmentTypesAdmin` bölümü eklenir |

---

## Task 1: DB Migration — `laundry_garment_types` Tablosu

**Files:**
- Modify: `backend/src/shared/db/index.js` (initDB fonksiyonu sonuna ekle)
- Test: `backend/src/modules/laundry/laundry.test.js`

- [ ] **Adım 1: Testi yaz**

`laundry.test.js` dosyasının sonuna ekle:

```js
describe('Garment Types', () => {
  it('laundry_garment_types tablosu oluşturuldu', () => {
    const db = getDB()
    const tbl = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='laundry_garment_types'").get()
    expect(tbl).toBeTruthy()
  })

  it('seed tipleri mevcut', () => {
    const db = getDB()
    const rows = db.prepare("SELECT * FROM laundry_garment_types WHERE is_active=1 ORDER BY sort_order").all()
    expect(rows.length).toBeGreaterThanOrEqual(7)
    expect(rows[0].emoji).toBeTruthy()
    expect(rows[0].name).toBeTruthy()
  })
})
```

- [ ] **Adım 2: Testi çalıştır — FAIL bekleniyor**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js --reporter=verbose 2>&1 | tail -20
```

Beklenen: `laundry_garment_types tablosu oluşturuldu` FAIL

- [ ] **Adım 3: Migration'ı ekle**

`backend/src/shared/db/index.js` içindeki `initDB()` fonksiyonunun en sonuna (son `try` bloğunun ardından, `return db` satırından önce) ekle:

```js
  // ── Laundry v7 — kıyafet tip kataloğu ────────────────────────────────────
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS laundry_garment_types (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      emoji      TEXT,
      image_url  TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active  INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
  } catch(e) { if (!e.message?.includes('already exists')) console.error('[Migration] garment_types:', e.message) }

  try {
    const gtCount = db.prepare('SELECT COUNT(*) as c FROM laundry_garment_types').get()
    if (gtCount.c === 0) {
      db.exec(`INSERT INTO laundry_garment_types(name, emoji, sort_order) VALUES
        ('Gömlek',      '👔', 1),
        ('Pantolon',    '👖', 2),
        ('Tişört',      '👕', 3),
        ('Kazak',       '🧣', 4),
        ('Mont',        '🧥', 5),
        ('Elbise',      '👗', 6),
        ('İç Çamaşır',  '🩲', 7),
        ('Çorap',       '🧤', 8),
        ('Şort',        '🩳', 9),
        ('Pijama',      '🌙', 10),
        ('Havlu',       '🪣', 11),
        ('Takım Elbise','🤵', 12)`)
    }
  } catch(e) { if (!e.message?.includes('already exists')) console.error('[Migration] garment_types seed:', e.message) }
```

- [ ] **Adım 4: Testi çalıştır — PASS bekleniyor**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js --reporter=verbose 2>&1 | tail -20
```

Beklenen: `Garment Types` describe bloğundaki 2 test PASS

- [ ] **Adım 5: Tüm testleri çalıştır**

```bash
cd backend && npx vitest run 2>&1 | tail -5
```

Beklenen: tüm testler geçer

- [ ] **Adım 6: Commit**

```bash
cd .. && git add backend/src/shared/db/index.js backend/src/modules/laundry/laundry.test.js
git commit -m "feat: laundry v7 — garment types katalog tablosu + seed"
```

---

## Task 2: Backend Queries + Routes — Garment Types CRUD

**Files:**
- Modify: `backend/src/modules/laundry/queries.js`
- Modify: `backend/src/modules/laundry/routes.js`
- Test: `backend/src/modules/laundry/laundry.test.js`

- [ ] **Adım 1: Testi yaz**

`laundry.test.js` — `Garment Types` describe bloğuna ekle:

```js
  it('GET /laundry/garment-types aktif tipleri döner', async () => {
    const res = await request(app)
      .get('/api/laundry/garment-types')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThan(0)
    expect(res.body[0]).toHaveProperty('id')
    expect(res.body[0]).toHaveProperty('name')
    expect(res.body[0]).toHaveProperty('emoji')
    expect(res.body[0]).toHaveProperty('sort_order')
  })

  it('POST /laundry/garment-types yeni tip ekler', async () => {
    const res = await request(app)
      .post('/api/laundry/garment-types')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Bornoz', emoji: '🛁', sort_order: 99 })
    expect(res.status).toBe(201)
    expect(res.body.name).toBe('Bornoz')
    expect(res.body.id).toBeTruthy()
  })

  it('PATCH /laundry/garment-types/:id günceller', async () => {
    const db = getDB()
    const existing = db.prepare('SELECT id FROM laundry_garment_types LIMIT 1').get()
    const res = await request(app)
      .patch(`/api/laundry/garment-types/${existing.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Gömlek (güncellendi)' })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('Gömlek (güncellendi)')
  })

  it('GET /laundry/garment-types/all pasifler dahil döner', async () => {
    const db = getDB()
    const first = db.prepare('SELECT id FROM laundry_garment_types LIMIT 1').get()
    db.prepare("UPDATE laundry_garment_types SET is_active=0 WHERE id=?").run(first.id)
    const res = await request(app)
      .get('/api/laundry/garment-types/all')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.some(t => t.is_active === 0)).toBe(true)
    // restore
    db.prepare("UPDATE laundry_garment_types SET is_active=1 WHERE id=?").run(first.id)
  })
```

- [ ] **Adım 2: Testi çalıştır — FAIL bekleniyor**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js --reporter=verbose 2>&1 | grep -E "PASS|FAIL|garment-types" | head -20
```

Beklenen: GET/POST/PATCH endpoint testleri 404 ile FAIL

- [ ] **Adım 3: Queries ekle**

`backend/src/modules/laundry/queries.js` dosyasının sonuna ekle:

```js
// ═══════════════════════════════════════════════════════════════════════════
// GARMENT TYPES
// ═══════════════════════════════════════════════════════════════════════════

export function listGarmentTypesQuery(includeInactive = false) {
  const db = getDB()
  if (includeInactive) {
    return db.prepare(`SELECT * FROM laundry_garment_types ORDER BY sort_order ASC, id ASC`).all()
  }
  return db.prepare(`SELECT * FROM laundry_garment_types WHERE is_active=1 ORDER BY sort_order ASC, id ASC`).all()
}

export function insertGarmentTypeQuery({ name, emoji, image_url, sort_order = 0 }) {
  const db = getDB()
  const r = db.prepare(`
    INSERT INTO laundry_garment_types(name, emoji, image_url, sort_order)
    VALUES(?, ?, ?, ?)
  `).run(name, emoji || null, image_url || null, sort_order)
  return db.prepare(`SELECT * FROM laundry_garment_types WHERE id=?`).get(r.lastInsertRowid)
}

export function updateGarmentTypeQuery(id, { name, emoji, image_url, sort_order, is_active }) {
  const db = getDB()
  const current = db.prepare(`SELECT * FROM laundry_garment_types WHERE id=?`).get(id)
  if (!current) return null
  db.prepare(`
    UPDATE laundry_garment_types
    SET name=?, emoji=?, image_url=?, sort_order=?, is_active=?
    WHERE id=?
  `).run(
    name ?? current.name,
    emoji !== undefined ? emoji : current.emoji,
    image_url !== undefined ? image_url : current.image_url,
    sort_order ?? current.sort_order,
    is_active !== undefined ? (is_active ? 1 : 0) : current.is_active,
    id
  )
  return db.prepare(`SELECT * FROM laundry_garment_types WHERE id=?`).get(id)
}

export function reorderGarmentTypesQuery(items) {
  const db = getDB()
  const update = db.prepare(`UPDATE laundry_garment_types SET sort_order=? WHERE id=?`)
  const tx = db.transaction(() => {
    for (const { id, sort_order } of items) {
      update.run(sort_order, id)
    }
  })
  tx()
}
```

- [ ] **Adım 4: Routes ekle**

`backend/src/modules/laundry/routes.js` dosyasına:

4a. Import ekle (dosyanın `import` bölümüne, `collectItemQuery` satırının yanına):

```js
import { collectItemQuery, listGarmentTypesQuery, insertGarmentTypeQuery, updateGarmentTypeQuery, reorderGarmentTypesQuery } from './queries.js'
```

4b. Dosyanın sonuna (en son `export` veya `laundryRouter` bloğunun sonuna) yeni endpoint'leri ekle:

```js
// ═══════════════════════════════════════════════════════════════════════════
// GARMENT TYPES
// ═══════════════════════════════════════════════════════════════════════════

laundryRouter.get('/garment-types', ...laundryRead, (req, res) => {
  try {
    res.json(listGarmentTypesQuery(false))
  } catch(e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

laundryRouter.get('/garment-types/all', ...laundryFull, (req, res) => {
  try {
    res.json(listGarmentTypesQuery(true))
  } catch(e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

laundryRouter.post('/garment-types', ...laundryFull, (req, res) => {
  try {
    const { name, emoji, image_url, sort_order } = req.body
    if (!name) return res.status(400).json({ error: 'İsim zorunlu' })
    const result = insertGarmentTypeQuery({ name, emoji, image_url, sort_order })
    res.status(201).json(result)
  } catch(e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

laundryRouter.patch('/garment-types/:id', ...laundryFull, (req, res) => {
  try {
    const { name, emoji, image_url, sort_order, is_active } = req.body
    const result = updateGarmentTypeQuery(+req.params.id, { name, emoji, image_url, sort_order, is_active })
    if (!result) return res.status(404).json({ error: 'Bulunamadı' })
    res.json(result)
  } catch(e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

laundryRouter.post('/garment-types/reorder', ...laundryFull, (req, res) => {
  try {
    const { items } = req.body
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items array gerekli' })
    reorderGarmentTypesQuery(items)
    res.json({ ok: true })
  } catch(e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})
```

- [ ] **Adım 5: Testi çalıştır — PASS bekleniyor**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js --reporter=verbose 2>&1 | grep -E "✓|✗|PASS|FAIL" | tail -20
```

Beklenen: `Garment Types` describe bloğu 6 test PASS

- [ ] **Adım 6: Tüm testleri çalıştır**

```bash
cd backend && npx vitest run 2>&1 | tail -5
```

Beklenen: tüm testler geçer

- [ ] **Adım 7: Commit**

```bash
cd .. && git add backend/src/modules/laundry/queries.js backend/src/modules/laundry/routes.js backend/src/modules/laundry/laundry.test.js
git commit -m "feat: garment types CRUD — queries + routes"
```

---

## Task 3: Frontend API + `GarmentPicker` Bileşeni

**Files:**
- Modify: `frontend/src/modules/laundry/api.js`
- Create: `frontend/src/modules/laundry-kiosk/GarmentPicker.jsx`

- [ ] **Adım 1: Frontend API metodlarını ekle**

`frontend/src/modules/laundry/api.js` dosyasında `// ── Photo Upload` bölümünden önce ekle:

```js
  // ── Garment Types ──────────────────────────────────────────────────────────
  getGarmentTypes: () => api.get('/laundry/garment-types').then(r => r.data),
  getGarmentTypesAll: () => api.get('/laundry/garment-types/all').then(r => r.data),
  createGarmentType: (data) => api.post('/laundry/garment-types', data).then(r => r.data),
  updateGarmentType: (id, data) => api.patch(`/laundry/garment-types/${id}`, data).then(r => r.data),
  reorderGarmentTypes: (items) => api.post('/laundry/garment-types/reorder', { items }).then(r => r.data),
```

- [ ] **Adım 2: `GarmentPicker.jsx` dosyasını oluştur**

`frontend/src/modules/laundry-kiosk/GarmentPicker.jsx` yeni dosyası oluştur:

```jsx
import { useState } from 'react'

const COLORS = ['Beyaz', 'Mavi', 'Siyah', 'Gri', 'Kırmızı', 'Yeşil', 'Sarı', 'Mor', 'Bej', 'Kahve']
const PATTERNS = ['Çizgili', 'Kareli', 'Desenli', 'Renkli']

const COLOR_BG = {
  'Beyaz': '#e2e8f0', 'Mavi': '#1d4ed8', 'Siyah': '#0f172a', 'Gri': '#475569',
  'Kırmızı': '#dc2626', 'Yeşil': '#15803d', 'Sarı': '#ca8a04', 'Mor': '#7c3aed',
  'Bej': '#d6b88a', 'Kahve': '#78350f',
}
const COLOR_TEXT = { 'Beyaz': '#1e293b', 'Bej': '#1e293b' }

// garmentTypes: [{id, name, emoji, image_url}]
// value: [{type_id, type_name, emoji, image_url, colors: [], count}]
// onChange: (newValue) => void
export default function GarmentPicker({ garmentTypes = [], value = [], onChange }) {
  const [selectedType, setSelectedType] = useState(null) // garmentType object
  const [selectedColors, setSelectedColors] = useState([])
  const [count, setCount] = useState(1)
  const [editIndex, setEditIndex] = useState(null)

  function selectType(type) {
    setSelectedType(type)
    setSelectedColors([])
    setCount(1)
    setEditIndex(null)
  }

  function toggleColor(c) {
    setSelectedColors(prev =>
      prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
    )
  }

  function addGarment() {
    if (!selectedType) return
    const entry = {
      type_id: selectedType.id,
      type_name: selectedType.name,
      emoji: selectedType.emoji,
      image_url: selectedType.image_url,
      colors: selectedColors,
      count,
    }
    if (editIndex !== null) {
      const next = value.map((g, i) => i === editIndex ? entry : g)
      onChange(next)
      setEditIndex(null)
    } else {
      onChange([...value, entry])
    }
    setSelectedType(null)
    setSelectedColors([])
    setCount(1)
  }

  function removeGarment(i) {
    onChange(value.filter((_, idx) => idx !== i))
  }

  function editGarment(i) {
    const g = value[i]
    const type = garmentTypes.find(t => t.id === g.type_id) || {
      id: g.type_id, name: g.type_name, emoji: g.emoji, image_url: g.image_url
    }
    setSelectedType(type)
    setSelectedColors(g.colors || [])
    setCount(g.count)
    setEditIndex(i)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Emoji Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {garmentTypes.map(type => (
          <button key={type.id} type="button" onClick={() => selectType(type)}
            style={{
              background: selectedType?.id === type.id ? '#1e3a5f' : '#1e293b',
              border: `2px solid ${selectedType?.id === type.id ? '#3b82f6' : 'transparent'}`,
              borderRadius: 12, padding: '12px 4px', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minHeight: 72,
            }}>
            {type.image_url
              ? <img src={type.image_url} alt={type.name} style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 4 }} />
              : <span style={{ fontSize: 28 }}>{type.emoji || '👔'}</span>
            }
            <span style={{ fontSize: 10, color: selectedType?.id === type.id ? '#93c5fd' : '#94a3b8', textAlign: 'center', lineHeight: 1.2 }}>
              {type.name}
            </span>
          </button>
        ))}
      </div>

      {/* Color + Count panel (tip seçilince açılır) */}
      {selectedType && (
        <div style={{ background: '#0f172a', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, color: '#94a3b8', letterSpacing: 1 }}>RENK / DESEN</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {COLORS.map(c => (
              <button key={c} type="button" onClick={() => toggleColor(c)}
                style={{
                  padding: '4px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  background: selectedColors.includes(c) ? (COLOR_BG[c] || c) : '#1e293b',
                  color: selectedColors.includes(c) ? (COLOR_TEXT[c] || '#fff') : '#64748b',
                  outline: selectedColors.includes(c) ? '2px solid #3b82f6' : 'none',
                }}>
                {c}
              </button>
            ))}
            {PATTERNS.map(p => (
              <button key={p} type="button" onClick={() => toggleColor(p)}
                style={{
                  padding: '4px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  background: selectedColors.includes(p) ? '#4c1d95' : '#1e293b',
                  color: selectedColors.includes(p) ? '#c4b5fd' : '#64748b',
                  outline: selectedColors.includes(p) ? '2px solid #7c3aed' : 'none',
                }}>
                {p}
              </button>
            ))}
          </div>

          <div style={{ fontSize: 12, color: '#94a3b8', letterSpacing: 1, marginTop: 2 }}>ADET</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button type="button" onClick={() => setCount(c => Math.max(1, c - 1))}
              style={{ width: 40, height: 40, borderRadius: 10, border: 'none', background: '#1e293b', color: '#e2e8f0', fontSize: 20, cursor: 'pointer', fontWeight: 700 }}>
              −
            </button>
            <span style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9', minWidth: 32, textAlign: 'center' }}>{count}</span>
            <button type="button" onClick={() => setCount(c => c + 1)}
              style={{ width: 40, height: 40, borderRadius: 10, border: 'none', background: '#1e293b', color: '#e2e8f0', fontSize: 20, cursor: 'pointer', fontWeight: 700 }}>
              ＋
            </button>
          </div>

          <button type="button" onClick={addGarment}
            style={{ padding: '10px', borderRadius: 10, border: 'none', background: '#1d4ed8', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', marginTop: 4 }}>
            {editIndex !== null ? '✓ Güncelle' : '＋ Ekle'}
          </button>
        </div>
      )}

      {/* Seçilen kıyafetler listesi */}
      {value.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 1 }}>EKLENEN KIYAFETLERtop</div>
          {value.map((g, i) => (
            <div key={i} style={{ background: '#1e293b', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
              {g.image_url
                ? <img src={g.image_url} alt={g.type_name} style={{ width: 24, height: 24, objectFit: 'contain' }} />
                : <span style={{ fontSize: 20 }}>{g.emoji || '👔'}</span>
              }
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>{g.type_name} × {g.count}</div>
                {g.colors?.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                    {g.colors.map(c => (
                      <span key={c} style={{ fontSize: 10, background: '#0f172a', color: '#94a3b8', padding: '1px 6px', borderRadius: 4 }}>{c}</span>
                    ))}
                  </div>
                )}
              </div>
              <button type="button" onClick={() => editGarment(i)}
                style={{ background: 'transparent', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: 14, padding: '4px 6px' }}>✏</button>
              <button type="button" onClick={() => removeGarment(i)}
                style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14, padding: '4px 6px' }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Adım 3: Commit**

```bash
git add frontend/src/modules/laundry/api.js frontend/src/modules/laundry-kiosk/GarmentPicker.jsx
git commit -m "feat: GarmentPicker bileşeni + garment types API metodları"
```

---

## Task 4: Kiosk — `BagForm` ve `GarmentForm` Entegrasyonu

**Files:**
- Modify: `frontend/src/modules/laundry-kiosk/LaundryKioskPage.jsx`

- [ ] **Adım 1: Import'ları ekle**

`LaundryKioskPage.jsx` dosyasının en üstüne, mevcut import'lara ekle:

```js
import { useQuery } from '@tanstack/react-query'
import GarmentPicker from './GarmentPicker.jsx'
import { laundryApi } from '../laundry/api.js'
```

Not: `useQuery` zaten mevcut, ikinci kez import etme. Sadece `GarmentPicker` ve `laundryApi` import'larını ekle.

- [ ] **Adım 2: `useGarmentTypes` hook'u ekle**

Dosyanın `useBlocks` fonksiyonunun hemen altına ekle:

```js
function useGarmentTypes() {
  return useQuery({
    queryKey: ['garment-types'],
    queryFn: laundryApi.getGarmentTypes,
    staleTime: 300000,
  }).data ?? []
}
```

- [ ] **Adım 3: `BagForm`'u güncelle**

`BagForm` fonksiyonunun içinde:

3a. State değişikliği — `garmentItems` state'ini değiştir:

```js
// ESKİ:
const [garmentItems, setGarmentItems] = useState([{ type: 'Gömlek', count: 1 }])

// YENİ:
const [garmentItems, setGarmentItems] = useState([])
```

3b. `useGarmentTypes` hook'unu ekle — diğer hook çağrılarının yanına:

```js
const garmentTypes = useGarmentTypes()
```

3c. `handleSubmit` fonksiyonundaki `clothing_items` alanını güncelle:

```js
// ESKİ:
clothing_items: isPremium ? garmentItems : null,

// YENİ:
clothing_items: isPremium && garmentItems.length > 0 ? garmentItems : null,
```

3d. `BagForm` JSX'inde `{isPremium && ...}` bloğunu bul ve içini tamamen değiştir:

```jsx
{isPremium && (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 1, textTransform: 'uppercase' }}>Kıyafetler</div>
    <GarmentPicker
      garmentTypes={garmentTypes}
      value={garmentItems}
      onChange={setGarmentItems}
    />
  </div>
)}
```

- [ ] **Adım 4: `GarmentForm`'u tamamen yeniden yaz**

`GarmentForm` fonksiyonunu (`// ── Kıyafet Gir` yorum satırından başlayarak) aşağıdakiyle değiştir:

```jsx
// ── Kıyafet Gir ───────────────────────────────────────────────────────────────
function GarmentForm({ kioskApi, onDone }) {
  const sigRef = useRef(null)
  const blocks = useBlocks()
  const garmentTypes = useGarmentTypes()
  const [block, setBlock] = useState('')
  const [roomNo, setRoomNo] = useState('')
  const [persons, setPersons] = useState([])
  const [selectedPerson, setSelectedPerson] = useState(null)
  const [garments, setGarments] = useState([])
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (block && roomNo) {
      kioskApi.get(`/self-service/laundry-kiosk/room-persons?block=${block}&room_no=${roomNo}`)
        .then(r => { setPersons(r.data); setSelectedPerson(null) })
        .catch(() => setPersons([]))
    }
  }, [block, roomNo])

  async function submit() {
    setError('')
    if (!block || !roomNo) return setError('Blok ve oda no gerekli')
    if (garments.length === 0) return setError('En az bir kıyafet ekleyin')
    const sig = sigRef.current?.isEmpty() ? null : sigRef.current?.toDataURL()
    try {
      await kioskApi.post('/self-service/laundry-kiosk/garment', {
        block, room_no: roomNo, personnel_id: selectedPerson?.id || null,
        clothing_items: garments, intake_signature: sig,
      })
      setSuccess(true)
    } catch (e) { setError(e.response?.data?.error || 'Hata') }
  }

  if (success) return (
    <div style={{ textAlign: 'center', padding: '48px 0' }}>
      <div style={{ fontSize: 56 }}>✅</div>
      <div style={{ color: '#4ade80', fontWeight: 600, fontSize: 18, marginTop: 12 }}>Kıyafetler kaydedildi!</div>
      <button onClick={onDone} style={{ ...btn('#1e293b', '#60a5fa'), marginTop: 24 }}>Ana Ekrana Dön</button>
    </div>
  )

  return (
    <div style={card}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: '#cbd5e1', margin: 0 }}>👔 Kıyafet Gir</h2>
      <div><label style={lbl}>Blok</label><BlockPicker blocks={blocks} block={block} setBlock={setBlock} /></div>
      <div><label style={lbl}>Oda No</label>
        <input value={roomNo} onChange={e => setRoomNo(e.target.value)} placeholder="ör. 205" style={input} />
      </div>
      {persons.length > 0 && (
        <div>
          <label style={lbl}>Kişi</label>
          {persons.map(p => (
            <button key={p.id} type="button" onClick={() => setSelectedPerson(p)}
              style={{ ...btn(selectedPerson?.id === p.id ? '#6d28d9' : '#1e293b', selectedPerson?.id === p.id ? '#fff' : '#94a3b8'), width: '100%', textAlign: 'left', marginBottom: 4 }}>
              {p.full_name}
            </button>
          ))}
        </div>
      )}
      <div>
        <label style={lbl}>Kıyafetler</label>
        {garmentTypes.length === 0
          ? <div style={{ color: '#475569', fontSize: 12 }}>Yükleniyor...</div>
          : <GarmentPicker garmentTypes={garmentTypes} value={garments} onChange={setGarments} />
        }
      </div>
      <div><label style={lbl}>İmza</label><SigPad sigRef={sigRef} /></div>
      {error && <div style={{ color: '#f87171', fontSize: 13 }}>{error}</div>}
      <button onClick={submit} disabled={garments.length === 0}
        style={{ ...btn(garments.length === 0 ? '#1e293b' : '#6d28d9', garments.length === 0 ? '#475569' : '#fff'), padding: 14 }}>
        Kaydet
      </button>
    </div>
  )
}
```

- [ ] **Adım 5: Eski `GARMENT_TYPES` sabitini sil**

Dosyanın başındaki şu satırı sil (artık kullanılmıyor):

```js
const GARMENT_TYPES = ['Gömlek', 'Pantolon', 'Tişört', 'Kazak', 'Mont', 'Takım Elbise', 'Diğer']
```

- [ ] **Adım 6: Tarayıcıda test et**

```bash
cd .. && npm run dev
```

- `/laundry-kiosk` → Giriş yap → "Kıyafet Gir" → Emoji grid görünüyor mu?
- Bir emoji tıkla → Renk/desen chip'leri + adet açılıyor mu?
- "＋ Ekle" → Özet listede görünüyor mu?
- Düzenleme (✏) ve silme (✕) çalışıyor mu?
- "Torba Al" → Premium aç → GarmentPicker çıkıyor mu?

- [ ] **Adım 7: Commit**

```bash
git add frontend/src/modules/laundry-kiosk/LaundryKioskPage.jsx
git commit -m "feat: kiosk GarmentPicker entegrasyonu — BagForm + GarmentForm"
```

---

## Task 5: Admin Yönetim Paneli — `LaundrySettings`

**Files:**
- Modify: `frontend/src/modules/laundry/LaundrySettings.jsx`

- [ ] **Adım 1: Import'ları ekle**

`LaundrySettings.jsx` dosyasının başındaki import satırlarına ekle:

```js
import { useRef } from 'react'
import { laundryApi } from './api.js'
```

Not: `useState, useEffect, useMemo, useQuery, useMutation, useQueryClient` zaten mevcut.

- [ ] **Adım 2: `GarmentTypesAdmin` bileşenini ekle**

`LaundrySettings.jsx` dosyasının export default fonksiyonundan **önce** yeni bileşeni ekle:

```jsx
function GarmentTypesAdmin() {
  const qc = useQueryClient()
  const fileRef = useRef(null)
  const [form, setForm] = useState({ name: '', emoji: '' })
  const [uploading, setUploading] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const { data: types = [], isLoading } = useQuery({
    queryKey: ['garment-types-all'],
    queryFn: laundryApi.getGarmentTypesAll,
  })

  async function uploadImage(file) {
    setUploading(true)
    try {
      const url = await laundryApi.uploadPhoto(file)
      setImageUrl(url.url || url)
    } catch { setError('Resim yüklenemedi') } finally { setUploading(false) }
  }

  async function createType() {
    if (!form.name) return setError('İsim zorunlu')
    setSaving(true); setError('')
    try {
      await laundryApi.createGarmentType({ name: form.name, emoji: form.emoji || null, image_url: imageUrl || null })
      setForm({ name: '', emoji: '' }); setImageUrl('')
      qc.invalidateQueries({ queryKey: ['garment-types-all'] })
      qc.invalidateQueries({ queryKey: ['garment-types'] })
    } catch(e) { setError(e.response?.data?.error || 'Hata') } finally { setSaving(false) }
  }

  async function toggleActive(type) {
    await laundryApi.updateGarmentType(type.id, { is_active: type.is_active ? 0 : 1 })
    qc.invalidateQueries({ queryKey: ['garment-types-all'] })
    qc.invalidateQueries({ queryKey: ['garment-types'] })
  }

  async function moveOrder(type, dir) {
    const sorted = [...types].sort((a, b) => a.sort_order - b.sort_order)
    const idx = sorted.findIndex(t => t.id === type.id)
    const swap = sorted[idx + dir]
    if (!swap) return
    await laundryApi.reorderGarmentTypes([
      { id: type.id, sort_order: swap.sort_order },
      { id: swap.id, sort_order: type.sort_order },
    ])
    qc.invalidateQueries({ queryKey: ['garment-types-all'] })
    qc.invalidateQueries({ queryKey: ['garment-types'] })
  }

  async function saveEdit(id) {
    setSaving(true); setError('')
    try {
      await laundryApi.updateGarmentType(id, editForm)
      setEditId(null); setEditForm({})
      qc.invalidateQueries({ queryKey: ['garment-types-all'] })
      qc.invalidateQueries({ queryKey: ['garment-types'] })
    } catch(e) { setError(e.response?.data?.error || 'Hata') } finally { setSaving(false) }
  }

  if (isLoading) return <div style={{ color: '#64748b', fontSize: 13 }}>Yükleniyor...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#94a3b8', letterSpacing: 1 }}>KIYAFETTİP KATALOĞUsec</h3>

      {/* Yeni tip ekleme */}
      <div style={{ background: 'var(--bg2)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Yeni Tip Ekle</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="İsim (örn. Bornoz)"
            className="form-input" style={{ flex: 1, minWidth: 120 }} />
          <input value={form.emoji} onChange={e => setForm(f => ({ ...f, emoji: e.target.value }))}
            placeholder="Emoji (örn. 🛁)"
            className="form-input" style={{ width: 80 }} />
          <button onClick={() => fileRef.current?.click()}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px dashed #475569', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 12 }}>
            {uploading ? '...' : imageUrl ? '✓ Resim' : '📷 Resim'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => e.target.files[0] && uploadImage(e.target.files[0])} />
        </div>
        {error && <div style={{ color: '#f87171', fontSize: 12 }}>{error}</div>}
        <button onClick={createType} disabled={saving || !form.name}
          className="btn-primary" style={{ alignSelf: 'flex-start', padding: '6px 18px', fontSize: 13 }}>
          Ekle
        </button>
      </div>

      {/* Tip listesi */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[...types].sort((a, b) => a.sort_order - b.sort_order).map((type, idx, arr) => (
          <div key={type.id} style={{
            background: 'var(--bg2)', borderRadius: 10, padding: '10px 12px',
            display: 'flex', alignItems: 'center', gap: 10,
            opacity: type.is_active ? 1 : 0.45,
          }}>
            {type.image_url
              ? <img src={type.image_url} alt={type.name} style={{ width: 28, height: 28, objectFit: 'contain', borderRadius: 4 }} />
              : <span style={{ fontSize: 22 }}>{type.emoji || '•'}</span>
            }
            {editId === type.id ? (
              <div style={{ flex: 1, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <input value={editForm.name ?? type.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  className="form-input" style={{ width: 130, padding: '4px 8px', fontSize: 13 }} />
                <input value={editForm.emoji ?? type.emoji ?? ''} onChange={e => setEditForm(f => ({ ...f, emoji: e.target.value }))}
                  className="form-input" style={{ width: 60, padding: '4px 8px', fontSize: 13 }} placeholder="Emoji" />
                <button onClick={() => saveEdit(type.id)} disabled={saving}
                  style={{ padding: '4px 12px', borderRadius: 6, border: 'none', background: '#1d4ed8', color: '#fff', fontSize: 12, cursor: 'pointer' }}>
                  Kaydet
                </button>
                <button onClick={() => { setEditId(null); setEditForm({}) }}
                  style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: 'transparent', color: '#64748b', fontSize: 12, cursor: 'pointer' }}>
                  İptal
                </button>
              </div>
            ) : (
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>{type.name}</span>
                {!type.is_active && <span style={{ fontSize: 10, color: '#64748b', marginLeft: 8 }}>(gizli)</span>}
              </div>
            )}
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => moveOrder(type, -1)} disabled={idx === 0}
                style={{ padding: '3px 7px', borderRadius: 6, border: 'none', background: '#1e293b', color: idx === 0 ? '#334155' : '#94a3b8', cursor: 'pointer', fontSize: 12 }}>↑</button>
              <button onClick={() => moveOrder(type, 1)} disabled={idx === arr.length - 1}
                style={{ padding: '3px 7px', borderRadius: 6, border: 'none', background: '#1e293b', color: idx === arr.length - 1 ? '#334155' : '#94a3b8', cursor: 'pointer', fontSize: 12 }}>↓</button>
              <button onClick={() => { setEditId(type.id); setEditForm({}) }}
                style={{ padding: '3px 8px', borderRadius: 6, border: 'none', background: '#1e293b', color: '#60a5fa', cursor: 'pointer', fontSize: 12 }}>✏</button>
              <button onClick={() => toggleActive(type)}
                style={{ padding: '3px 8px', borderRadius: 6, border: 'none', background: '#1e293b', color: type.is_active ? '#f87171' : '#4ade80', cursor: 'pointer', fontSize: 12 }}>
                {type.is_active ? 'Gizle' : 'Göster'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Adım 3: `GarmentTypesAdmin`'i `LaundrySettings` export'una ekle**

`LaundrySettings.jsx` export default fonksiyonu içinde, diğer bölümlerin sonuna (örneğin `SupplySettings`'ten sonra) ekle. Mevcut return JSX'inde son `</div>` veya bölüm kapanışından önce:

```jsx
<div style={{ marginTop: 32 }}>
  <GarmentTypesAdmin />
</div>
```

- [ ] **Adım 4: Tarayıcıda test et**

- LaundryHub → ⚙ Ayarlar → sayfanın sonunda "Kıyafet Tipleri" bölümü görünüyor mu?
- Yeni tip ekle → listede çıkıyor mu?
- ↑/↓ sıralama çalışıyor mu?
- ✏ düzenleme kaydediliyor mu?
- Gizle/Göster toggle çalışıyor mu?
- Kiosk açık bırak, tip ekledikten sonra tarayıcıyı yenile → yeni tip grid'de görünüyor mu?

- [ ] **Adım 5: Commit**

```bash
git add frontend/src/modules/laundry/LaundrySettings.jsx
git commit -m "feat: garment types admin paneli — LaundrySettings'e kıyafet tip yönetimi"
```

---

## Self-Review — Spec Karşılaştırması

| Spec Maddesi | Task |
|-------------|------|
| `laundry_garment_types` tablosu | Task 1 |
| Seed: 11+ başlangıç tipi | Task 1 |
| GET/POST/PATCH/reorder endpoints | Task 2 |
| Auth: read=laundryRead, write=laundryFull | Task 2 |
| `GarmentPicker`: emoji grid 4 sütun | Task 3 |
| Çoklu renk + 4 desen seçimi | Task 3 |
| Adet +/− | Task 3 |
| Özet liste: düzenle + sil | Task 3 |
| BagForm premium bölümünde GarmentPicker | Task 4 |
| GarmentForm tamamen yeniden yazıldı | Task 4 |
| Admin: ekle / sıralama / inline edit / gizle | Task 5 |
| Resim yükleme (mevcut upload endpoint) | Task 5 |
| `clothing_items` mevcut kolon kullanıldı (garments_json yerine — eşdeğer, gereksiz migration'dan kaçınır) | Task 1 |
