# Kiosk Redesign v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kiosk ana ekranını yeniden düzenle — Makineye Yükle kaldır, Torba Topla → Ütü (garment tik doğrulama), Teslim formu tek akışa geçir (M1/M2/M3/S1/S2/S3/C/Diğer + file adedi + imza), Premium otomatik, GarmentPicker 13 renk + 6 görsel desen.

**Architecture:** 3 katman: (1) DB migration — delivered_name/file_count sütunları, (2) Backend — ironing-complete + deliver endpoint'leri, (3) Frontend — GarmentPicker yeniden yazım + IroningView yeni bileşen + DeliverView yeniden yazım + ana ekran düzeni.

**Tech Stack:** better-sqlite3, Express, React, @tanstack/react-query, Vitest/supertest

---

## File Map

| Dosya | Değişiklik |
|-------|-----------|
| `backend/src/shared/db/index.js` | v9 migration: `delivered_name TEXT`, `file_count INTEGER` |
| `backend/src/modules/self-service/routes.js` | `PATCH /bags/:id/ironing-complete` ekle; `POST /bags/:id/deliver` ekle |
| `backend/src/modules/self-service/self-service.test.js` | ironing-complete + deliver testleri |
| `frontend/src/modules/laundry-kiosk/GarmentPicker.jsx` | 13 renk swatch + 6 CSS desen + yeni garment kartı |
| `frontend/src/modules/laundry-kiosk/LaundryKioskPage.jsx` | Ana ekran düzeni (2+3 grid), CollectView→IroningView, DeliverView yeniden yazım |

---

## Task 1: DB Migration — delivered_name + file_count

**Files:**
- Modify: `backend/src/shared/db/index.js` (son try/catch bloğunun hemen altı)

- [ ] **Step 1: Migration satırlarını ekle**

`backend/src/shared/db/index.js` dosyasında garments_json migration'ının (son satır, `try { db.exec(\`ALTER TABLE laundry_items ADD COLUMN garments_json TEXT\`)`) hemen altına ekle:

```js
  // ── Laundry v9 — deliver tracking kolonları ──────────────────────────────
  try { db.exec(`ALTER TABLE laundry_items ADD COLUMN delivered_name TEXT`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] delivered_name:', e.message) }
  try { db.exec(`ALTER TABLE laundry_items ADD COLUMN file_count INTEGER DEFAULT NULL`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] file_count:', e.message) }
```

- [ ] **Step 2: Migration çalıştığını doğrula**

```bash
cd backend && node -e "
import('./src/shared/db/index.js').then(m => {
  m.initDB()
  const db = m.getDB()
  const cols = db.prepare(\"PRAGMA table_info(laundry_items)\").all().map(c => c.name)
  console.log('delivered_name:', cols.includes('delivered_name'))
  console.log('file_count:', cols.includes('file_count'))
})"
```

Beklenen çıktı:
```
delivered_name: true
file_count: true
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/shared/db/index.js
git commit -m "feat: laundry v9 migration — delivered_name + file_count kolonları"
```

---

## Task 2: Backend — ironing-complete + deliver endpoint'leri + testler

**Files:**
- Modify: `backend/src/modules/self-service/routes.js`
- Modify: `backend/src/modules/self-service/self-service.test.js`

- [ ] **Step 1: Test yaz (önce fail)**

`self-service.test.js` dosyasındaki `describe('Laundry Kiosk endpoints', ...)` bloğunun kapanış `})` parantezinden önce şunu ekle:

```js
  it('POST /laundry-kiosk/bags/:id/ironing-complete — ironing olmayan torba 400 döner', async () => {
    // Önce bir torba oluştur (pending_collection)
    const adminToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
    const roomRes = await request(app).get('/api/self-service/laundry-kiosk/blocks')
    // Seed'de A bloğu ve 101 odası var
    const bagRes = await request(app)
      .post('/api/self-service/laundry-kiosk/bag')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ block: 'A', room_no: '101', item_count: 2 })
    expect(bagRes.status).toBe(201)
    const bagId = bagRes.body.id
    // status = pending_collection, ironing-complete reddedilmeli
    const res = await request(app)
      .post(`/api/self-service/laundry-kiosk/bags/${bagId}/ironing-complete`)
      .set('Authorization', `Bearer ${avsToken}`)
      .send({})
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('POST /laundry-kiosk/bags/:id/deliver — delivered_name ve file_count zorunlu', async () => {
    const bagRes = await request(app)
      .post('/api/self-service/laundry-kiosk/bag')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ block: 'A', room_no: '101', item_count: 1 })
    const bagId = bagRes.body.id
    // delivered_name olmadan
    const res = await request(app)
      .post(`/api/self-service/laundry-kiosk/bags/${bagId}/deliver`)
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ file_count: 2 })
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })
```

- [ ] **Step 2: Testlerin fail ettiğini doğrula**

```bash
cd backend && npx vitest run src/modules/self-service/self-service.test.js
```

Beklenen: 2 yeni test FAIL (endpoint 404 dönüyor)

- [ ] **Step 3: ironing-complete endpoint'i ekle**

`backend/src/modules/self-service/routes.js` dosyasında son `selfServiceRouter.put('/laundry-kiosk/bags/:id/ironing', ...)` bloğunun hemen altına ekle:

```js
selfServiceRouter.post('/laundry-kiosk/bags/:id/ironing-complete', requireAvsKiosk, (req, res) => {
  try {
    const db = getDB()
    const item = db.prepare('SELECT id, status FROM laundry_items WHERE id=?').get(Number(req.params.id))
    if (!item) return res.status(404).json({ error: 'Torba bulunamadı' })
    if (item.status !== 'ironing') return res.status(400).json({ error: 'Torba ironing durumunda değil' })
    db.prepare("UPDATE laundry_items SET status='ready', updated_at=datetime('now') WHERE id=?")
      .run(item.id)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})
```

- [ ] **Step 4: deliver endpoint'i ekle**

`ironing-complete` bloğunun hemen altına ekle:

```js
selfServiceRouter.post('/laundry-kiosk/bags/:id/deliver', requireAvsKiosk, (req, res) => {
  const { delivered_name, file_count, signature } = req.body
  if (!delivered_name || !delivered_name.trim()) return res.status(400).json({ error: 'delivered_name gerekli' })
  const fc = Number(file_count)
  if (!fc || fc < 1) return res.status(400).json({ error: 'file_count en az 1 olmalı' })
  try {
    const db = getDB()
    const item = db.prepare('SELECT id, status FROM laundry_items WHERE id=?').get(Number(req.params.id))
    if (!item) return res.status(404).json({ error: 'Torba bulunamadı' })
    if (item.status !== 'ready') return res.status(400).json({ error: 'Torba ready durumunda değil' })
    db.prepare(`
      UPDATE laundry_items
      SET status='delivered', delivered_name=?, file_count=?, occupant_signature=?, updated_at=datetime('now')
      WHERE id=?
    `).run(delivered_name.trim(), fc, signature || null, item.id)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})
```

- [ ] **Step 5: Testleri çalıştır**

```bash
cd backend && npx vitest run src/modules/self-service/self-service.test.js
```

Beklenen: Tüm testler PASS. İroning-complete testi bagId var ama status pending_collection → 400. Deliver testi delivered_name yok → 400.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/self-service/routes.js backend/src/modules/self-service/self-service.test.js
git commit -m "feat: kiosk ironing-complete + deliver endpoint'leri"
```

---

## Task 3: GarmentPicker — 13 renk swatch + 6 CSS desen

**Files:**
- Modify: `frontend/src/modules/laundry-kiosk/GarmentPicker.jsx`

Bu task `GarmentPicker.jsx` dosyasını tamamen yeniden yazar. Yeni özellikler:
- 13 renk yuvarlak swatch (hex renkli daireler + isim)
- 6 desen CSS görsel önizleme kartları
- Kıyafet kartında renk chip (renkli daire + isim) + desen chip (mini CSS önizleme + isim)
- Yeni veri yapısı: `{type_id, type_name, emoji, count, color, color_label, pattern, pattern_label}`

- [ ] **Step 1: GarmentPicker.jsx dosyasını tamamen yeniden yaz**

```jsx
import { useState } from 'react'

const COLORS = [
  { key: 'white',   label: 'Beyaz',    hex: '#f8fafc', chipBg: '#f1f5f9', chipText: '#1e293b' },
  { key: 'black',   label: 'Siyah',    hex: '#0f172a', chipBg: '#1e293b', chipText: '#e2e8f0' },
  { key: 'gray',    label: 'Gri',      hex: '#94a3b8', chipBg: '#334155', chipText: '#e2e8f0' },
  { key: 'navy',    label: 'Lacivert', hex: '#1d4ed8', chipBg: '#1e3a5f', chipText: '#93c5fd' },
  { key: 'blue',    label: 'Mavi',     hex: '#3b82f6', chipBg: '#1e3a5f', chipText: '#93c5fd' },
  { key: 'red',     label: 'Kırmızı',  hex: '#dc2626', chipBg: '#7f1d1d', chipText: '#fca5a5' },
  { key: 'green',   label: 'Yeşil',    hex: '#16a34a', chipBg: '#14532d', chipText: '#86efac' },
  { key: 'yellow',  label: 'Sarı',     hex: '#ca8a04', chipBg: '#422006', chipText: '#fde68a' },
  { key: 'orange',  label: 'Turuncu',  hex: '#ea580c', chipBg: '#431407', chipText: '#fed7aa' },
  { key: 'purple',  label: 'Mor',      hex: '#7c3aed', chipBg: '#3b0764', chipText: '#ddd6fe' },
  { key: 'pink',    label: 'Pembe',    hex: '#db2777', chipBg: '#500724', chipText: '#fbcfe8' },
  { key: 'brown',   label: 'Kahve',    hex: '#92400e', chipBg: '#451a03', chipText: '#fed7aa' },
  { key: 'charcoal',label: 'Füme',     hex: '#4b5563', chipBg: '#1f2937', chipText: '#d1d5db' },
]

const PATTERNS = [
  { key: 'solid',     label: 'Düz',          css: { background: '#475569' } },
  { key: 'striped-h', label: 'Çizgili',       css: { backgroundImage: 'repeating-linear-gradient(0deg,#dc2626 0px,#dc2626 4px,#f8fafc 4px,#f8fafc 10px)' } },
  { key: 'striped-v', label: 'Dikey Çizgi',   css: { backgroundImage: 'repeating-linear-gradient(90deg,#1d4ed8 0px,#1d4ed8 4px,#f8fafc 4px,#f8fafc 10px)' } },
  { key: 'checked',   label: 'Kareli',        css: { backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 7px,rgba(148,163,184,0.4) 7px,rgba(148,163,184,0.4) 8px),repeating-linear-gradient(90deg,transparent,transparent 7px,rgba(148,163,184,0.4) 7px,rgba(148,163,184,0.4) 8px)', backgroundColor: '#1e3a5f' } },
  { key: 'plaid',     label: 'Ekose',         css: { backgroundImage: 'repeating-linear-gradient(0deg,rgba(220,38,38,.7),rgba(220,38,38,.7) 3px,transparent 3px,transparent 12px),repeating-linear-gradient(90deg,rgba(29,78,216,.7),rgba(29,78,216,.7) 3px,transparent 3px,transparent 12px),repeating-linear-gradient(0deg,rgba(22,163,74,.4),rgba(22,163,74,.4) 12px,transparent 12px,transparent 24px)', backgroundColor: '#f8fafc' } },
  { key: 'colorful',  label: 'Renkli/Baskı',  css: { background: 'conic-gradient(#7c3aed 0deg 60deg,#ec4899 60deg 120deg,#f59e0b 120deg 180deg,#10b981 180deg 240deg,#3b82f6 240deg 300deg,#ef4444 300deg 360deg)' } },
]

function PatternBox({ pattern, size = 40 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 6, overflow: 'hidden', flexShrink: 0,
      ...pattern.css,
    }} />
  )
}

function ColorChip({ colorKey }) {
  const c = COLORS.find(x => x.key === colorKey)
  if (!c) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: c.chipBg, borderRadius: 20, padding: '3px 8px' }}>
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.hex, display: 'inline-block', flexShrink: 0 }} />
      <span style={{ color: c.chipText, fontSize: 10 }}>{c.label}</span>
    </span>
  )
}

function PatternChip({ patternKey }) {
  const p = PATTERNS.find(x => x.key === patternKey)
  if (!p) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#1e293b', border: '1px solid #334155', borderRadius: 20, padding: '3px 8px' }}>
      <span style={{ width: 14, height: 10, borderRadius: 2, overflow: 'hidden', display: 'inline-block', flexShrink: 0, ...p.css }} />
      <span style={{ color: '#94a3b8', fontSize: 10 }}>{p.label}</span>
    </span>
  )
}

// garmentTypes: [{id, name, emoji, image_url}]
// value: [{type_id, type_name, emoji, count, color, color_label, pattern, pattern_label}]
// onChange: (newValue) => void
export default function GarmentPicker({ garmentTypes = [], value = [], onChange }) {
  const [selectedType, setSelectedType] = useState(null)
  const [selectedColor, setSelectedColor] = useState(null)
  const [selectedPattern, setSelectedPattern] = useState('solid')
  const [count, setCount] = useState(1)
  const [editIndex, setEditIndex] = useState(null)

  function selectType(type) {
    setSelectedType(type)
    setSelectedColor(null)
    setSelectedPattern('solid')
    setCount(1)
    setEditIndex(null)
  }

  function addGarment() {
    if (!selectedType) return
    const colorObj = COLORS.find(c => c.key === selectedColor)
    const patternObj = PATTERNS.find(p => p.key === selectedPattern)
    const entry = {
      type_id: selectedType.id,
      type_name: selectedType.name,
      emoji: selectedType.emoji,
      count,
      color: selectedColor || null,
      color_label: colorObj?.label || null,
      pattern: selectedPattern || null,
      pattern_label: patternObj?.label || null,
    }
    if (editIndex !== null) {
      onChange(value.map((g, i) => i === editIndex ? entry : g))
      setEditIndex(null)
    } else {
      onChange([...value, entry])
    }
    setSelectedType(null)
    setSelectedColor(null)
    setSelectedPattern('solid')
    setCount(1)
  }

  function removeGarment(i) {
    onChange(value.filter((_, idx) => idx !== i))
  }

  function editGarment(i) {
    const g = value[i]
    const type = garmentTypes.find(t => t.id === g.type_id) || { id: g.type_id, name: g.type_name, emoji: g.emoji }
    setSelectedType(type)
    setSelectedColor(g.color || null)
    setSelectedPattern(g.pattern || 'solid')
    setCount(g.count)
    setEditIndex(i)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Kıyafet tipi grid */}
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

      {/* Renk + Desen + Adet paneli */}
      {selectedType && (
        <div style={{ background: '#0f172a', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Renk paleti */}
          <div>
            <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 1, marginBottom: 8 }}>RENK</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
              {COLORS.map(c => (
                <button key={c.key} type="button" onClick={() => setSelectedColor(prev => prev === c.key ? null : c.key)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', background: c.hex,
                    border: `2px solid ${selectedColor === c.key ? '#38bdf8' : '#334155'}`,
                    outline: selectedColor === c.key ? '2px solid #38bdf8' : 'none',
                    outlineOffset: 2,
                  }} />
                  <span style={{ fontSize: 9, color: selectedColor === c.key ? '#38bdf8' : '#475569', textAlign: 'center', lineHeight: 1.2 }}>{c.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Desen seçici */}
          <div>
            <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 1, marginBottom: 8 }}>DESEN</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {PATTERNS.map(p => (
                <button key={p.key} type="button" onClick={() => setSelectedPattern(p.key)}
                  style={{
                    background: '#1e293b', borderRadius: 10, padding: '10px 6px', textAlign: 'center',
                    border: `2px solid ${selectedPattern === p.key ? '#3b82f6' : '#334155'}`,
                    cursor: 'pointer', outline: selectedPattern === p.key ? '2px solid #60a5fa' : 'none',
                    outlineOffset: 2,
                  }}>
                  <PatternBox pattern={p} size={40} />
                  <div style={{ fontSize: 10, color: selectedPattern === p.key ? '#60a5fa' : '#64748b', marginTop: 6, fontWeight: selectedPattern === p.key ? 700 : 400 }}>
                    {p.label}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Adet */}
          <div>
            <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 1, marginBottom: 8 }}>ADET</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button type="button" onClick={() => setCount(c => Math.max(1, c - 1))}
                style={{ width: 40, height: 40, borderRadius: 10, border: 'none', background: '#1e293b', color: '#e2e8f0', fontSize: 20, cursor: 'pointer', fontWeight: 700 }}>
                −
              </button>
              <span style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9', minWidth: 32, textAlign: 'center' }}>{count}</span>
              <button type="button" onClick={() => setCount(c => c + 1)}
                style={{ width: 40, height: 40, borderRadius: 10, border: 'none', background: '#1e293b', color: '#e2e8f0', fontSize: 20, cursor: 'pointer', fontWeight: 700 }}>
                +
              </button>
            </div>
          </div>

          <button type="button" onClick={addGarment}
            style={{ padding: '10px', borderRadius: 10, border: 'none', background: '#1d4ed8', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
            {editIndex !== null ? '✓ Güncelle' : '+ Ekle'}
          </button>
        </div>
      )}

      {/* Eklenen kıyafet listesi */}
      {value.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 1 }}>EKLENEN KIYAFETler ({value.length})</div>
          {value.map((g, i) => {
            const patternObj = PATTERNS.find(p => p.key === g.pattern) || PATTERNS[0]
            return (
              <div key={i} style={{ background: '#1e293b', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <PatternBox pattern={patternObj} size={48} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>
                    {g.emoji || '👔'} {g.type_name} × {g.count}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    {g.color && <ColorChip colorKey={g.color} />}
                    {g.pattern && g.pattern !== 'solid' && <PatternChip patternKey={g.pattern} />}
                  </div>
                </div>
                <button type="button" onClick={() => editGarment(i)}
                  style={{ background: 'transparent', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: 14, padding: '4px 6px' }}>✏</button>
                <button type="button" onClick={() => removeGarment(i)}
                  style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14, padding: '4px 6px' }}>✕</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/modules/laundry-kiosk/GarmentPicker.jsx
git commit -m "feat: GarmentPicker — 13 renk swatch + 6 CSS desen + yeni garment kartı"
```

---

## Task 4: IroningView — ironing torbalar + garment tik doğrulama

**Files:**
- Modify: `frontend/src/modules/laundry-kiosk/LaundryKioskPage.jsx`

Bu task 2 değişiklik yapar: (1) `CollectView` fonksiyonu silinip yerine `IroningView` eklenir, (2) ana ekrandaki `collect` action key → `ironing` olarak güncellenir.

- [ ] **Step 1: LaundryKioskPage.jsx içinde CollectView fonksiyonunu sil**

Dosyada `// ── Torba Topla ───────────────` yorum satırından başlayan `function CollectView({ kioskApi, onDone }) { ... }` bloğunu (satır 417-474 arası) tamamen sil.

- [ ] **Step 2: Silinen yere IroningView ekle**

Aynı yere (MachineView ile aynı bölge — `// ── Makineye Yükle` yorumundan önce) şunu ekle:

```jsx
// ── Ütü ──────────────────────────────────────────────────────────────────────
function IroningView({ kioskApi, onDone }) {
  const [bags, setBags] = useState([])
  const [selectedBag, setSelectedBag] = useState(null)
  const [garments, setGarments] = useState([])
  const [ticked, setTicked] = useState({})
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    try {
      const res = await kioskApi.get('/self-service/laundry-kiosk/bags?status=ironing')
      setBags(res.data)
    } catch { setError('Yüklenemedi') } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  function selectBag(bag) {
    setSelectedBag(bag)
    setError('')
    setTicked({})
    try {
      const parsed = bag.garments_json ? JSON.parse(bag.garments_json) : []
      setGarments(parsed)
    } catch { setGarments([]) }
  }

  function toggleTick(idx) {
    setTicked(prev => ({ ...prev, [idx]: !prev[idx] }))
  }

  const allTicked = garments.length > 0 && garments.every((_, i) => ticked[i])
  const tickedCount = Object.values(ticked).filter(Boolean).length

  async function complete() {
    if (!selectedBag || !allTicked) return
    setError('')
    try {
      await kioskApi.post(`/self-service/laundry-kiosk/bags/${selectedBag.id}/ironing-complete`, {})
      setSuccess(true)
      setBags(prev => prev.filter(b => b.id !== selectedBag.id))
      setSelectedBag(null)
      setTimeout(() => setSuccess(false), 2000)
    } catch (e) { setError(e.response?.data?.error || 'Hata') }
  }

  return (
    <div style={card}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: '#cbd5e1', margin: 0 }}>🫧 Ütü</h2>
      {success && <div style={{ color: '#4ade80', fontSize: 13 }}>✓ Torba hazıra alındı</div>}
      {error && <div style={{ color: '#f87171', fontSize: 13 }}>{error}</div>}

      {!selectedBag && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 12, color: '#64748b' }}>Ütülenecek torbalar ({bags.length})</div>
            <button onClick={load} style={{ ...btn('#334155', '#e2e8f0'), padding: '6px 12px', fontSize: 12 }} disabled={loading}>
              {loading ? '...' : '↻'}
            </button>
          </div>
          {bags.length === 0 && !loading && <div style={{ color: '#475569', fontSize: 13 }}>Ütülenecek torba yok</div>}
          {bags.map(b => (
            <div key={b.id} onClick={() => selectBag(b)}
              style={{ background: '#1e293b', borderRadius: 12, padding: 14, cursor: 'pointer', borderLeft: '3px solid #a78bfa' }}>
              <div style={{ fontSize: 11, color: '#a78bfa', fontFamily: 'monospace', marginBottom: 2 }}>{b.bag_no || `#${b.id}`}</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0' }}>{b.block} Blok — {b.room_no}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                {b.item_count} kıyafet{b.intake_name ? ` · ${b.intake_name}` : ''}
              </div>
            </div>
          ))}
        </>
      )}

      {selectedBag && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setSelectedBag(null)} style={{ ...btn('#1e293b', '#94a3b8'), padding: '6px 12px', fontSize: 12 }}>← Geri</button>
            <div style={{ fontSize: 13, color: '#a78bfa', fontFamily: 'monospace', fontWeight: 700 }}>{selectedBag.bag_no}</div>
            <div style={{ fontSize: 13, color: '#94a3b8' }}>{selectedBag.block} — {selectedBag.room_no}</div>
          </div>

          <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 1 }}>KIYAFETLERİ DOĞRULA</div>

          {garments.length === 0 && (
            <div style={{ color: '#475569', fontSize: 13 }}>Kıyafet bilgisi yok — tüm torbayı doğrulayarak devam edin</div>
          )}

          {garments.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {garments.map((g, i) => (
                <div key={i} onClick={() => toggleTick(i)}
                  style={{
                    background: '#1e293b', borderRadius: 10, padding: '10px 14px',
                    display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                    border: `1px solid ${ticked[i] ? '#22c55e' : '#334155'}`,
                  }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: ticked[i] ? '#15803d' : '#1e293b',
                    border: `2px solid ${ticked[i] ? '#22c55e' : '#475569'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 16, fontWeight: 700,
                  }}>
                    {ticked[i] ? '✓' : ''}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, color: '#e2e8f0', fontWeight: 500 }}>
                      {g.emoji || '👔'} {g.type_name} × {g.count}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                      {[g.color_label, g.pattern_label && g.pattern_label !== 'Düz' ? g.pattern_label : null].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                </div>
              ))}
              <div style={{ fontSize: 12, color: '#64748b' }}>{tickedCount}/{garments.length} doğrulandı</div>
            </div>
          )}

          <button onClick={complete}
            disabled={garments.length > 0 && !allTicked}
            style={{
              ...btn(garments.length > 0 && !allTicked ? '#1e293b' : '#15803d', garments.length > 0 && !allTicked ? '#475569' : '#fff'),
              padding: 14, fontSize: 14,
            }}>
            ✓ Ütü Tamamla — Hazıra Al
            {garments.length > 0 && !allTicked ? ` (${garments.length}/${garments.length} gerekli)` : ''}
          </button>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: routes.js'de garments_json'u bags sorgusuna ekle**

`routes.js` dosyasında `GET /laundry-kiosk/bags` sorgusunu bul (satır ~193):

```js
let q = `SELECT li.id, li.bag_no, li.status, li.item_count, li.urgent, li.is_premium, li.needs_ironing,
                li.created_at, li.intake_name, r.block, r.room_no
         FROM laundry_items li JOIN rooms r ON r.id = li.room_id WHERE 1=1`
```

Bunu şu şekilde güncelle (garments_json ekle):

```js
let q = `SELECT li.id, li.bag_no, li.status, li.item_count, li.urgent, li.is_premium, li.needs_ironing,
                li.created_at, li.intake_name, li.garments_json, r.block, r.room_no
         FROM laundry_items li JOIN rooms r ON r.id = li.room_id WHERE 1=1`
```

- [ ] **Step 4: Ana ekranda collect → ironing yap**

`LaundryKioskPage.jsx` içinde ana menü array'ini bul (satır ~229-250):

```js
{ key: 'collect', icon: '📦', label: 'Torba Topla',      bg: '#14532d' },
{ key: 'machine', icon: '⚙️', label: 'Makineye Yükle',   bg: '#1e293b' },
```

Bu iki satırı şu şekilde değiştir:

```js
{ key: 'ironing', icon: '🫧', label: 'Ütü',               bg: '#4a1d96' },
```

(Sadece `ironing` kalacak, `machine` kaldırılacak)

- [ ] **Step 5: action dispatch'te collect → ironing yap**

Aynı dosyada şu satırı bul:

```js
{activeAction === 'collect' && <CollectView kioskApi={kioskApi} onDone={() => setActiveAction(null)} />}
{activeAction === 'machine' && <MachineView kioskApi={kioskApi} onDone={() => setActiveAction(null)} />}
```

Bunu şu şekilde değiştir:

```js
{activeAction === 'ironing' && <IroningView kioskApi={kioskApi} onDone={() => setActiveAction(null)} />}
```

- [ ] **Step 6: Ana ekran grid düzenini güncelle**

Ana menü bölümünde `grid-template-columns: '1fr 1fr'` ile başlayan tek grid var. Bunu 2 satırlı yapıya çevir:

Şu kodu bul:

```js
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
  {[
    { key: 'bag',     icon: '🧺', label: 'Torba Bırak',     bg: '#1e3a5f' },
    { key: 'ironing', icon: '🫧', label: 'Ütü',               bg: '#4a1d96' },
    { key: 'deliver', icon: '🚚', label: 'Teslim Et',         bg: '#451a03' },
    { key: 'status',  icon: '📋', label: 'Durum Görüntüle',   bg: '#1c1917' },
    { key: 'garment', icon: '👔', label: 'Kıyafet Gir',       bg: '#3b0764' },
  ].map(a => (
    <button key={a.key} onClick={() => setActiveAction(a.key)}
```

Bu bölümü tamamen aşağıdakiyle değiştir:

```jsx
<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
  {/* Üst sıra: 2 büyük buton */}
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
    {[
      { key: 'bag',     icon: '🧺', label: 'Torba Bırak', bg: '#1e3a5f' },
      { key: 'ironing', icon: '🫧', label: 'Ütü',          bg: '#4a1d96' },
    ].map(a => (
      <button key={a.key} onClick={() => setActiveAction(a.key)}
        style={{
          background: a.bg, border: 'none', borderRadius: 16, padding: '28px 16px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          cursor: 'pointer', transition: 'opacity 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
      >
        <span style={{ fontSize: 40 }}>{a.icon}</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>{a.label}</span>
      </button>
    ))}
  </div>
  {/* Alt sıra: 3 küçük buton */}
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
    {[
      { key: 'deliver', icon: '🚚', label: 'Teslim Et',   bg: '#451a03' },
      { key: 'status',  icon: '📋', label: 'Durum',        bg: '#1c1917' },
      { key: 'garment', icon: '👔', label: 'Kıyafet Gir', bg: '#3b0764' },
    ].map(a => (
      <button key={a.key} onClick={() => setActiveAction(a.key)}
        style={{
          background: a.bg, border: 'none', borderRadius: 16, padding: '20px 6px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          cursor: 'pointer', transition: 'opacity 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
      >
        <span style={{ fontSize: 32 }}>{a.icon}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9', textAlign: 'center' }}>{a.label}</span>
      </button>
    ))}
  </div>
</div>
```

- [ ] **Step 7: Backend test çalıştır**

```bash
cd backend && npx vitest run src/modules/self-service/self-service.test.js
```

Beklenen: Tüm testler PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/modules/laundry-kiosk/LaundryKioskPage.jsx backend/src/modules/self-service/routes.js
git commit -m "feat: kiosk ana ekran 2+3 grid + IroningView (garment tik doğrulama)"
```

---

## Task 5: DeliverView — tek akış, blok seçici, file adedi, imza

**Files:**
- Modify: `frontend/src/modules/laundry-kiosk/LaundryKioskPage.jsx`

Bu task mevcut `DeliverView`, `StaffDeliverForm`, `ResidentDeliverForm` fonksiyonlarını siler ve tek akışlı yeni `DeliverView` ile değiştirir.

- [ ] **Step 1: Eski DeliverView, StaffDeliverForm, ResidentDeliverForm fonksiyonlarını sil**

Dosyada şu bölümleri tamamen sil:
- `// ── Teslim Et ─────────────────────────────────────────────────────────────────` ile başlayan `function DeliverView(...)` (tek blok)
- `function StaffDeliverForm(...)` 
- `function ResidentDeliverForm(...)`

(Bu 3 fonksiyon birlikte ~175 satır)

- [ ] **Step 2: Silinen yere yeni DeliverView ekle**

`// ── Kıyafet Gir` yorumunun hemen üstüne şunu ekle:

```jsx
// ── Teslim Et ─────────────────────────────────────────────────────────────────
const BLOCK_GROUPS = [
  { label: 'M Blokları', keys: ['M1', 'M2', 'M3'] },
  { label: 'S Blokları', keys: ['S1', 'S2', 'S3'] },
]
const SINGLE_BLOCKS = ['C']
const PREMIUM_BLOCKS = new Set(['C']) // Diğer de premium sayılır (block key'i 'other')

function isPremiumBlock(blockKey) {
  return blockKey === 'other' || PREMIUM_BLOCKS.has(blockKey)
}

function DeliverView({ kioskApi, onDone }) {
  const sigRef = useRef(null)
  const [selectedBlock, setSelectedBlock] = useState(null) // 'M1','M2','M3','S1','S2','S3','C','other'
  const [otherBlock, setOtherBlock] = useState('')
  const [roomNo, setRoomNo] = useState('')
  const [deliveredName, setDeliveredName] = useState('')
  const [bags, setBags] = useState([])
  const [selectedBag, setSelectedBag] = useState(null)
  const [fileCount, setFileCount] = useState(1)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const effectiveBlock = selectedBlock === 'other' ? otherBlock.trim() : selectedBlock
  const isPremium = selectedBlock ? isPremiumBlock(selectedBlock) : null

  useEffect(() => {
    setSelectedBag(null)
    setBags([])
    if (!effectiveBlock || !roomNo) return
    kioskApi.get(`/self-service/laundry-kiosk/bags?status=ready&block=${effectiveBlock}&room_no=${roomNo}`)
      .then(r => { setBags(r.data); if (r.data.length === 1) setSelectedBag(r.data[0]) })
      .catch(() => setBags([]))
  }, [effectiveBlock, roomNo])

  const canSubmit = effectiveBlock && roomNo.trim() && deliveredName.trim() && !sigRef.current?.isEmpty() && fileCount >= 1

  async function deliver() {
    setError('')
    if (!effectiveBlock || !roomNo.trim()) return setError('Blok ve oda no gerekli')
    if (!deliveredName.trim()) return setError('Ad soyad gerekli')
    if (!selectedBag) return setError('Torba seçilmedi')
    const sig = sigRef.current?.isEmpty() ? null : sigRef.current?.toDataURL()
    if (!sig) return setError('İmza gerekli')
    try {
      await kioskApi.post(`/self-service/laundry-kiosk/bags/${selectedBag.id}/deliver`, {
        delivered_name: deliveredName.trim(),
        file_count: fileCount,
        signature: sig,
      })
      setSuccess(true)
    } catch (e) { setError(e.response?.data?.error || 'Hata') }
  }

  if (success) return (
    <div style={{ textAlign: 'center', padding: '48px 0' }}>
      <div style={{ fontSize: 56 }}>✅</div>
      <div style={{ color: '#4ade80', fontWeight: 600, fontSize: 18, marginTop: 12 }}>Teslim tamamlandı!</div>
      <button onClick={onDone} style={{ ...btn('#1e293b', '#60a5fa'), marginTop: 24 }}>Ana Ekrana Dön</button>
    </div>
  )

  return (
    <div style={card}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: '#cbd5e1', margin: 0 }}>🚚 Teslim Et</h2>

      {/* Blok seçici */}
      <div>
        <label style={lbl}>Blok</label>
        {BLOCK_GROUPS.map(group => (
          <div key={group.label} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 9, color: '#475569', letterSpacing: 1, marginBottom: 4 }}>{group.label.toUpperCase()}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {group.keys.map(k => (
                <button key={k} type="button" onClick={() => setSelectedBlock(k)}
                  style={{
                    padding: '8px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
                    background: selectedBlock === k ? '#1d4ed8' : '#1e293b',
                    color: selectedBlock === k ? '#fff' : '#94a3b8',
                    fontWeight: 700, fontSize: 14,
                  }}>
                  {k}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          {SINGLE_BLOCKS.map(k => (
            <button key={k} type="button" onClick={() => setSelectedBlock(k)}
              style={{
                padding: '8px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: selectedBlock === k ? '#1d4ed8' : '#1e293b',
                color: selectedBlock === k ? '#fff' : '#94a3b8',
                fontWeight: 700, fontSize: 14,
              }}>
              {k}
            </button>
          ))}
          <button type="button" onClick={() => setSelectedBlock('other')}
            style={{
              padding: '8px 14px', borderRadius: 10, border: `1px dashed ${selectedBlock === 'other' ? '#3b82f6' : '#475569'}`,
              cursor: 'pointer', background: selectedBlock === 'other' ? '#1e3a5f' : '#1e293b',
              color: selectedBlock === 'other' ? '#93c5fd' : '#64748b', fontSize: 13,
            }}>
            Diğer…
          </button>
        </div>
        {selectedBlock === 'other' && (
          <input value={otherBlock} onChange={e => setOtherBlock(e.target.value)}
            placeholder="Blok adı girin (ör. B, D2…)"
            style={{ ...input, marginTop: 8 }} />
        )}
        {selectedBlock && (
          <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, background: isPremium ? '#3b0764' : '#1e3a5f', borderRadius: 20, padding: '4px 10px' }}>
            <span style={{ fontSize: 10, color: isPremium ? '#ddd6fe' : '#93c5fd' }}>
              {isPremium ? '🟣 Premium' : '⚪ Regular'}
            </span>
          </div>
        )}
      </div>

      {/* Oda No */}
      <div>
        <label style={lbl}>Oda No</label>
        <input type="text" inputMode="numeric" value={roomNo} onChange={e => setRoomNo(e.target.value)}
          placeholder="ör. 205" style={input} />
      </div>

      {/* Ad Soyad */}
      <div>
        <label style={lbl}>Ad Soyad</label>
        <input type="text" value={deliveredName} onChange={e => setDeliveredName(e.target.value)}
          placeholder="Teslim alan kişi" style={input} />
      </div>

      {/* Torbalar */}
      {(effectiveBlock && roomNo) && (
        <div>
          <label style={lbl}>Torba {effectiveBlock && roomNo ? `(${effectiveBlock}-${roomNo} hazır)` : ''}</label>
          {bags.length === 0
            ? <div style={{ color: '#475569', fontSize: 13 }}>Hazır torba bulunamadı</div>
            : bags.map(b => (
                <div key={b.id} onClick={() => setSelectedBag(b)}
                  style={{
                    background: '#1e293b', borderRadius: 10, padding: '10px 14px', marginBottom: 6, cursor: 'pointer',
                    border: `2px solid ${selectedBag?.id === b.id ? '#3b82f6' : '#334155'}`,
                  }}>
                  <div style={{ fontSize: 11, color: '#38bdf8', fontFamily: 'monospace' }}>{b.bag_no || `#${b.id}`}</div>
                  <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600 }}>
                    {b.item_count} parça{b.intake_name ? ` · ${b.intake_name}` : ''}
                    {b.is_premium ? ' · 🟣 Premium' : ' · ⚪ Regular'}
                  </div>
                </div>
              ))
          }
        </div>
      )}

      {/* File Adedi */}
      <div>
        <label style={lbl}>File Adedi</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" onClick={() => setFileCount(c => Math.max(1, c - 1))}
            style={{ width: 40, height: 40, borderRadius: 10, border: 'none', background: '#1e293b', color: '#f1f5f9', fontSize: 20, cursor: 'pointer', fontWeight: 700 }}>
            −
          </button>
          <span style={{ fontSize: 24, fontWeight: 800, color: '#f1f5f9', minWidth: 32, textAlign: 'center' }}>{fileCount}</span>
          <button type="button" onClick={() => setFileCount(c => c + 1)}
            style={{ width: 40, height: 40, borderRadius: 10, border: 'none', background: '#1e293b', color: '#f1f5f9', fontSize: 20, cursor: 'pointer', fontWeight: 700 }}>
            +
          </button>
        </div>
      </div>

      {/* İmza */}
      <div>
        <label style={lbl}>İmza</label>
        <SigPad sigRef={sigRef} />
      </div>

      {error && <div style={{ color: '#f87171', fontSize: 13 }}>{error}</div>}

      <button onClick={deliver}
        style={{ ...btn('#b45309'), padding: 14, fontSize: 15 }}>
        ✓ Teslim Et
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Backend test çalıştır**

```bash
cd backend && npx vitest run src/modules/self-service/self-service.test.js
```

Beklenen: Tüm testler PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/modules/laundry-kiosk/LaundryKioskPage.jsx
git commit -m "feat: DeliverView yeniden tasarım — M1/M2/M3/S1/S2/S3/C/Diğer + file adedi + imza"
```

---

## Task 6: Smoke test — kiosk UI manuel doğrulama

- [ ] **Step 1: Dev sunucuyu başlat**

```bash
npm run dev
```

- [ ] **Step 2: Kiosk sayfasını aç**

Tarayıcıda `http://localhost:5173` aç → Çamaşırhane / kiosk sayfasına git.

- [ ] **Step 3: Ana ekranı doğrula**

Beklenen: 5 buton görünür: Torba Bırak + Ütü (büyük üst 2), Teslim Et + Durum + Kıyafet Gir (küçük alt 3). Makineye Yükle YOK.

- [ ] **Step 4: GarmentPicker renk/desen doğrula**

Kıyafet Gir'e gir → blok ve oda seç → kıyafet tipi seç → 13 renk swatch görünüyor mu? 6 desen CSS önizleme görünüyor mu? Garment ekleyince kıyafet kartında renk chip + desen chip görünüyor mu?

- [ ] **Step 5: Ütü ekranını doğrula**

Ütü'ye gir → `ironing` statuslu torba varsa listede görünüyor mu? Torbaya tıklayınca garment listesi geliyor mu? Tümünü tikleyince buton aktifleşiyor mu?

- [ ] **Step 6: Teslim formu doğrula**

Teslim Et'e gir → M1/M2/M3 S1/S2/S3 C Diğer butonları görünüyor mu? M1 seçince "Regular" badge geliyor mu? C seçince "Premium" badge geliyor mu? File Adedi stepper çalışıyor mu? İmza alanı çiziliyor mu?

- [ ] **Step 7: Son commit**

```bash
cd backend && npx vitest run
```

Beklenen: Tüm testler PASS.

```bash
git add -A
git status
```

Değişmemiş dosya varsa commit atma. Değişen dosya yoksa plan tamamdır.
