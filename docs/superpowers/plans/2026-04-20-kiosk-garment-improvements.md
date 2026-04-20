# Kiosk Garment Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 5 iyileştirme — torba bırak direkt dirty, M/S dışı blok kıyafet girişi ütüye, GarmentPicker çoklu renk + manuel giriş, IroningView tam detay, Hub garments_json görünümü.

**Architecture:** Backend routes.js'te 2 küçük fix; GarmentPicker format güncellemesi (single color → colors array, manual entry); IroningView + Hub display güncelleme. Yeni garments_json item formatı v2: `{type_id, type_name, emoji, count, colors: [{key, label}], pattern, pattern_label}` — eski format backward-compat helper ile desteklenir.

**Tech Stack:** better-sqlite3, Express, React (inline styles), @tanstack/react-query, Vitest + supertest

---

## File Map

| Dosya | Değişiklik |
|-------|-----------|
| `backend/src/modules/self-service/routes.js` | `POST /bag` → status dirty; `POST /garment` → M/S-dışı blok → ironing, garments_json kaydet |
| `backend/src/modules/self-service/self-service.test.js` | 3 yeni test: bag→dirty, garment M/S→dirty, garment C→ironing |
| `frontend/src/modules/laundry-kiosk/GarmentPicker.jsx` | çoklu renk (colors array), manuel tip girişi |
| `frontend/src/modules/laundry-kiosk/LaundryKioskPage.jsx` | IroningView: colors array + tam detay display |
| `frontend/src/modules/laundry/LaundryHub.jsx` | ExpandedSection Row 2 meta + ExpandedSection body: garments_json display |

---

## Task 1: Backend — bag direkt dirty + garment blok kontrolü + testler

**Files:**
- Modify: `backend/src/modules/self-service/routes.js`
- Modify: `backend/src/modules/self-service/self-service.test.js`

- [ ] **Step 1: Testleri yaz (önce fail)**

`self-service.test.js` dosyasında `describe('Laundry Kiosk endpoints', ...)` bloğunun **kapanış `})` parantezinden önce** şunu ekle:

```js
  it('POST /laundry-kiosk/bag — direkt dirty olur (pending_collection değil)', async () => {
    const res = await request(app)
      .post('/api/self-service/laundry-kiosk/bag')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({ block: 'A', room_no: '101', item_count: 1 })
    expect(res.status).toBe(201)
    const db = getDB()
    const item = db.prepare('SELECT status FROM laundry_items WHERE id=?').get(res.body.id)
    expect(item.status).toBe('dirty')
  })

  it('POST /laundry-kiosk/garment — M1 blok dirty olur', async () => {
    const res = await request(app)
      .post('/api/self-service/laundry-kiosk/garment')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({
        block: 'M1', room_no: '101',
        clothing_items: [{ type_id: 1, type_name: 'Gömlek', emoji: '👔', count: 1, colors: [], pattern: 'solid', pattern_label: 'Düz' }],
      })
    expect(res.status).toBe(201)
    const db = getDB()
    const item = db.prepare('SELECT status, needs_ironing FROM laundry_items WHERE id=?').get(res.body.id)
    expect(item.status).toBe('dirty')
    expect(item.needs_ironing).toBe(0)
  })

  it('POST /laundry-kiosk/garment — A blok (M/S dışı) ironing olur', async () => {
    const res = await request(app)
      .post('/api/self-service/laundry-kiosk/garment')
      .set('Authorization', `Bearer ${avsToken}`)
      .send({
        block: 'A', room_no: '101',
        clothing_items: [{ type_id: 1, type_name: 'Gömlek', emoji: '👔', count: 1, colors: [], pattern: 'solid', pattern_label: 'Düz' }],
      })
    expect(res.status).toBe(201)
    const db = getDB()
    const item = db.prepare('SELECT status, needs_ironing FROM laundry_items WHERE id=?').get(res.body.id)
    expect(item.status).toBe('ironing')
    expect(item.needs_ironing).toBe(1)
  })
```

- [ ] **Step 2: Testlerin fail ettiğini doğrula**

```bash
cd backend && npx vitest run src/modules/self-service/self-service.test.js 2>&1 | tail -15
```

Beklenen: 3 yeni test FAIL (bag testi dirty bekliyor ama pending_collection geliyor; garment testleri 404 veya yanlış status).

- [ ] **Step 3: routes.js — bag endpoint'ini güncelle**

`backend/src/modules/self-service/routes.js` dosyasında `selfServiceRouter.post('/laundry-kiosk/bag', ...)` içindeki `insertItemQuery` çağrısında `status: 'pending_collection'` satırını bul ve `status: 'dirty'` yap:

```js
    const id = insertItemQuery({
      room_id: room.id,
      item_count: count,
      status: 'dirty',
      is_premium: is_premium ? 1 : 0,
      notes: notes || null,
      urgent: urgent ? 1 : 0,
      intake_signature: intake_signature || null,
      intake_name: intake_name || null,
      clothing_items: clothing_items ? JSON.stringify(clothing_items) : null,
      garments_json: garments && garments.length > 0 ? JSON.stringify(garments) : null,
      created_by: null,
    })
```

- [ ] **Step 4: routes.js — garment endpoint'ini güncelle**

Aynı dosyada `selfServiceRouter.post('/laundry-kiosk/garment', ...)` bloğunu tamamen değiştir. Mevcut:

```js
selfServiceRouter.post('/laundry-kiosk/garment', requireAvsKiosk, (req, res) => {
  const { block, room_no, personnel_id, clothing_items, intake_signature } = req.body
  if (!block || !room_no) return res.status(400).json({ error: 'block ve room_no gerekli' })
  if (!Array.isArray(clothing_items) || clothing_items.length === 0)
    return res.status(400).json({ error: 'En az 1 kıyafet gerekli' })
  try {
    const db = getDB()
    const room = db.prepare('SELECT id FROM rooms WHERE block=? AND room_no=?').get(block, room_no)
    if (!room) return res.status(404).json({ error: 'Oda bulunamadı' })
    const intake_name = personnel_id
      ? db.prepare('SELECT full_name FROM personnel WHERE id=?').get(Number(personnel_id))?.full_name
      : null
    const total = clothing_items.reduce((s, c) => s + (Number(c.count) || 1), 0)
    const id = insertItemQuery({
      room_id: room.id,
      item_count: total,
      is_premium: 1,
      clothing_items: JSON.stringify(clothing_items),
      intake_name: intake_name || null,
      intake_signature: intake_signature || null,
      created_by: null,
    })
    res.status(201).json({ id })
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})
```

Yerine şunu yaz:

```js
const MS_BLOCKS = new Set(['M1', 'M2', 'M3', 'S1', 'S2', 'S3'])

selfServiceRouter.post('/laundry-kiosk/garment', requireAvsKiosk, (req, res) => {
  const { block, room_no, personnel_id, clothing_items, intake_signature } = req.body
  if (!block || !room_no) return res.status(400).json({ error: 'block ve room_no gerekli' })
  if (!Array.isArray(clothing_items) || clothing_items.length === 0)
    return res.status(400).json({ error: 'En az 1 kıyafet gerekli' })
  try {
    const db = getDB()
    const room = db.prepare('SELECT id FROM rooms WHERE block=? AND room_no=?').get(block, room_no)
    if (!room) return res.status(404).json({ error: 'Oda bulunamadı' })
    const intake_name = personnel_id
      ? db.prepare('SELECT full_name FROM personnel WHERE id=?').get(Number(personnel_id))?.full_name
      : null
    const total = clothing_items.reduce((s, c) => s + (Number(c.count) || 1), 0)
    const isMS = MS_BLOCKS.has(block.toUpperCase())
    const itemStatus = isMS ? 'dirty' : 'ironing'
    const id = insertItemQuery({
      room_id: room.id,
      item_count: total,
      status: itemStatus,
      needs_ironing: isMS ? 0 : 1,
      is_premium: 1,
      garments_json: JSON.stringify(clothing_items),
      intake_name: intake_name || null,
      intake_signature: intake_signature || null,
      created_by: null,
    })
    res.status(201).json({ id })
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})
```

Not: `MS_BLOCKS` const'ını `selfServiceRouter.post('/laundry-kiosk/garment', ...)` satırının hemen üstüne ekle.

- [ ] **Step 5: Tüm testleri çalıştır**

```bash
cd backend && npx vitest run src/modules/self-service/self-service.test.js 2>&1 | tail -15
```

Beklenen: Tüm testler PASS. Mevcut ironing-complete ve deliver testleri de geçmeli (bag dirty oluyor, ironing-complete ve deliver endpoint'leri hala 400 döndürüyor çünkü status dirty≠ironing ve dirty≠ready).

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/self-service/routes.js backend/src/modules/self-service/self-service.test.js
git commit -m "feat: kiosk bag→dirty, garment M/S-dışı→ironing otomatik"
```

---

## Task 2: GarmentPicker — çoklu renk + manuel tip girişi

**Files:**
- Modify: `frontend/src/modules/laundry-kiosk/GarmentPicker.jsx`

Değişiklikler: (1) `selectedColor` → `selectedColors` array, (2) `addGarment` çıktısında `colors: [{key, label}]` array, (3) grid sonuna manuel giriş inputu, (4) `ColorChips` bileşeni renk dizisi kabul eder.

- [ ] **Step 1: GarmentPicker.jsx dosyasını tamamen yeniden yaz**

```jsx
import { useState } from 'react'

const COLORS = [
  { key: 'white',    label: 'Beyaz',    hex: '#f8fafc', chipBg: '#f1f5f9', chipText: '#1e293b' },
  { key: 'black',    label: 'Siyah',    hex: '#0f172a', chipBg: '#1e293b', chipText: '#e2e8f0' },
  { key: 'gray',     label: 'Gri',      hex: '#94a3b8', chipBg: '#334155', chipText: '#e2e8f0' },
  { key: 'navy',     label: 'Lacivert', hex: '#1d4ed8', chipBg: '#1e3a5f', chipText: '#93c5fd' },
  { key: 'blue',     label: 'Mavi',     hex: '#3b82f6', chipBg: '#1e3a5f', chipText: '#93c5fd' },
  { key: 'red',      label: 'Kırmızı',  hex: '#dc2626', chipBg: '#7f1d1d', chipText: '#fca5a5' },
  { key: 'green',    label: 'Yeşil',    hex: '#16a34a', chipBg: '#14532d', chipText: '#86efac' },
  { key: 'yellow',   label: 'Sarı',     hex: '#ca8a04', chipBg: '#422006', chipText: '#fde68a' },
  { key: 'orange',   label: 'Turuncu',  hex: '#ea580c', chipBg: '#431407', chipText: '#fed7aa' },
  { key: 'purple',   label: 'Mor',      hex: '#7c3aed', chipBg: '#3b0764', chipText: '#ddd6fe' },
  { key: 'pink',     label: 'Pembe',    hex: '#db2777', chipBg: '#500724', chipText: '#fbcfe8' },
  { key: 'brown',    label: 'Kahve',    hex: '#92400e', chipBg: '#451a03', chipText: '#fed7aa' },
  { key: 'charcoal', label: 'Füme',     hex: '#4b5563', chipBg: '#1f2937', chipText: '#d1d5db' },
]

const PATTERNS = [
  { key: 'solid',     label: 'Düz',         css: { background: '#475569' } },
  { key: 'striped-h', label: 'Çizgili',      css: { backgroundImage: 'repeating-linear-gradient(0deg,#dc2626 0px,#dc2626 4px,#f8fafc 4px,#f8fafc 10px)' } },
  { key: 'striped-v', label: 'Dikey Çizgi',  css: { backgroundImage: 'repeating-linear-gradient(90deg,#1d4ed8 0px,#1d4ed8 4px,#f8fafc 4px,#f8fafc 10px)' } },
  { key: 'checked',   label: 'Kareli',       css: { backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 7px,rgba(148,163,184,0.4) 7px,rgba(148,163,184,0.4) 8px),repeating-linear-gradient(90deg,transparent,transparent 7px,rgba(148,163,184,0.4) 7px,rgba(148,163,184,0.4) 8px)', backgroundColor: '#1e3a5f' } },
  { key: 'plaid',     label: 'Ekose',        css: { backgroundImage: 'repeating-linear-gradient(0deg,rgba(220,38,38,.7),rgba(220,38,38,.7) 3px,transparent 3px,transparent 12px),repeating-linear-gradient(90deg,rgba(29,78,216,.7),rgba(29,78,216,.7) 3px,transparent 3px,transparent 12px),repeating-linear-gradient(0deg,rgba(22,163,74,.4),rgba(22,163,74,.4) 12px,transparent 12px,transparent 24px)', backgroundColor: '#f8fafc' } },
  { key: 'colorful',  label: 'Renkli/Baskı', css: { background: 'conic-gradient(#7c3aed 0deg 60deg,#ec4899 60deg 120deg,#f59e0b 120deg 180deg,#10b981 180deg 240deg,#3b82f6 240deg 300deg,#ef4444 300deg 360deg)' } },
]

function PatternBox({ pattern, size = 40 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: 6, overflow: 'hidden', flexShrink: 0, ...pattern.css }} />
  )
}

// colors: [{key, label}]
function ColorChips({ colors = [] }) {
  return (
    <>
      {colors.map(c => {
        const meta = COLORS.find(x => x.key === c.key)
        if (!meta) return null
        return (
          <span key={c.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: meta.chipBg, borderRadius: 20, padding: '3px 8px' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: meta.hex, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ color: meta.chipText, fontSize: 10 }}>{meta.label}</span>
          </span>
        )
      })}
    </>
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
// value: [{type_id, type_name, emoji, count, colors: [{key, label}], pattern, pattern_label}]
// onChange: (newValue) => void
export default function GarmentPicker({ garmentTypes = [], value = [], onChange }) {
  const [selectedType, setSelectedType]       = useState(null)
  const [selectedColors, setSelectedColors]   = useState([])   // array of color keys
  const [selectedPattern, setSelectedPattern] = useState('solid')
  const [count, setCount]                     = useState(1)
  const [editIndex, setEditIndex]             = useState(null)
  const [customType, setCustomType]           = useState('')

  function selectType(type) {
    setSelectedType(type)
    setSelectedColors([])
    setSelectedPattern('solid')
    setCount(1)
    setEditIndex(null)
  }

  function toggleColor(key) {
    setSelectedColors(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  function selectCustomType() {
    const name = customType.trim()
    if (!name) return
    selectType({ id: null, name, emoji: '👕' })
    setCustomType('')
  }

  function addGarment() {
    if (!selectedType) return
    const patternObj = PATTERNS.find(p => p.key === selectedPattern)
    const colors = selectedColors.map(k => {
      const meta = COLORS.find(c => c.key === k)
      return { key: k, label: meta?.label || k }
    })
    const entry = {
      type_id: selectedType.id,
      type_name: selectedType.name,
      emoji: selectedType.emoji || '👔',
      count,
      colors,
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
    setSelectedColors([])
    setSelectedPattern('solid')
    setCount(1)
  }

  function removeGarment(i) {
    onChange(value.filter((_, idx) => idx !== i))
  }

  function editGarment(i) {
    const g = value[i]
    const type = garmentTypes.find(t => t.id === g.type_id)
      || { id: g.type_id, name: g.type_name, emoji: g.emoji }
    setSelectedType(type)
    // backward compat: old items have color/color_label strings
    const cols = g.colors?.map(c => c.key) ?? (g.color ? [g.color] : [])
    setSelectedColors(cols)
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

        {/* Seçili custom tip gösterimi */}
        {selectedType?.id === null && (
          <div style={{
            background: '#1e3a5f', border: '2px solid #3b82f6',
            borderRadius: 12, padding: '12px 4px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minHeight: 72,
          }}>
            <span style={{ fontSize: 22 }}>✏️</span>
            <span style={{ fontSize: 10, color: '#93c5fd', textAlign: 'center', lineHeight: 1.2 }}>{selectedType.name}</span>
          </div>
        )}
      </div>

      {/* Manuel giriş */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={customType}
          onChange={e => setCustomType(e.target.value)}
          placeholder="Listede yoksa yazın..."
          style={{
            flex: 1, background: '#1e293b', border: `1px solid ${customType.trim() ? '#3b82f6' : '#334155'}`,
            borderRadius: 10, padding: '10px 14px', color: '#f1f5f9', fontSize: 13, outline: 'none',
          }}
          onKeyDown={e => { if (e.key === 'Enter') selectCustomType() }}
        />
        <button type="button" onClick={selectCustomType} disabled={!customType.trim()}
          style={{
            padding: '10px 16px', borderRadius: 10, border: 'none',
            background: customType.trim() ? '#1d4ed8' : '#1e293b',
            color: customType.trim() ? '#fff' : '#475569',
            fontWeight: 700, fontSize: 14, cursor: customType.trim() ? 'pointer' : 'default',
          }}>
          + Ekle
        </button>
      </div>

      {/* Renk + Desen + Adet paneli */}
      {selectedType && (
        <div style={{ background: '#0f172a', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Renk paleti — çoklu seçim */}
          <div>
            <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 1, marginBottom: 8 }}>
              RENK {selectedColors.length > 1 && <span style={{ color: '#38bdf8', fontWeight: 700 }}>({selectedColors.length} renk)</span>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
              {COLORS.map(c => {
                const isSelected = selectedColors.includes(c.key)
                return (
                  <button key={c.key} type="button" onClick={() => toggleColor(c.key)}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', background: c.hex,
                      border: `2px solid ${isSelected ? '#38bdf8' : '#334155'}`,
                      outline: isSelected ? '2px solid #38bdf8' : 'none',
                      outlineOffset: 2,
                      boxShadow: isSelected ? '0 0 0 3px rgba(56,189,248,0.25)' : 'none',
                    }} />
                    <span style={{ fontSize: 9, color: isSelected ? '#38bdf8' : '#475569', textAlign: 'center', lineHeight: 1.2 }}>{c.label}</span>
                  </button>
                )
              })}
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
            // backward compat: old items have color/color_label strings
            const colors = g.colors ?? (g.color ? [{ key: g.color, label: g.color_label || g.color }] : [])
            return (
              <div key={i} style={{ background: '#1e293b', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <PatternBox pattern={patternObj} size={48} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>
                    {g.emoji || '👔'} {g.type_name} × {g.count}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    <ColorChips colors={colors} />
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
git commit -m "feat: GarmentPicker — çoklu renk seçimi + manuel tip girişi"
```

---

## Task 3: IroningView — tam garment detay görünümü

**Files:**
- Modify: `frontend/src/modules/laundry-kiosk/LaundryKioskPage.jsx`

IroningView içindeki garment listesi bölümünü güncelle. Eski format (`color_label`) ve yeni format (`colors` array) desteklenecek.

- [ ] **Step 1: IroningView içindeki garment render bölümünü değiştir**

`LaundryKioskPage.jsx` içinde şu bölümü bul (satır ~526-552):

```jsx
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
```

Şununla değiştir:

```jsx
          {garments.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {garments.map((g, i) => {
                // backward compat: old format has color/color_label strings, new has colors array
                const colors = g.colors ?? (g.color ? [{ key: g.color, label: g.color_label || g.color }] : [])
                const IRONING_COLORS = {
                  white: '#f8fafc', black: '#0f172a', gray: '#94a3b8', navy: '#1d4ed8',
                  blue: '#3b82f6', red: '#dc2626', green: '#16a34a', yellow: '#ca8a04',
                  orange: '#ea580c', purple: '#7c3aed', pink: '#db2777', brown: '#92400e', charcoal: '#4b5563',
                }
                return (
                  <div key={i} onClick={() => toggleTick(i)}
                    style={{
                      background: ticked[i] ? '#052e16' : '#1e293b', borderRadius: 10, padding: '12px 14px',
                      cursor: 'pointer', border: `1px solid ${ticked[i] ? '#22c55e' : '#334155'}`,
                      transition: 'all 0.15s',
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {/* Tik butonu */}
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                        background: ticked[i] ? '#15803d' : '#0f172a',
                        border: `2px solid ${ticked[i] ? '#22c55e' : '#475569'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontSize: 18, fontWeight: 700,
                        transition: 'all 0.15s',
                      }}>
                        {ticked[i] ? '✓' : ''}
                      </div>
                      {/* Kıyafet başlık */}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, color: ticked[i] ? '#86efac' : '#e2e8f0', fontWeight: 600 }}>
                          {g.emoji || '👔'} {g.type_name}
                          {g.count > 1 && (
                            <span style={{ fontSize: 12, color: '#64748b', marginLeft: 6 }}>× {g.count}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* Renk + desen detay */}
                    {(colors.length > 0 || (g.pattern && g.pattern !== 'solid')) && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 8, marginLeft: 44, flexWrap: 'wrap', alignItems: 'center' }}>
                        {colors.map(c => (
                          <span key={c.key} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            background: '#0f172a', borderRadius: 20, padding: '3px 8px',
                            border: '1px solid #334155',
                          }}>
                            <span style={{
                              width: 10, height: 10, borderRadius: '50%',
                              background: IRONING_COLORS[c.key] || '#888',
                              display: 'inline-block', flexShrink: 0,
                              border: c.key === 'white' ? '1px solid #475569' : 'none',
                            }} />
                            <span style={{ color: '#94a3b8', fontSize: 10 }}>{c.label}</span>
                          </span>
                        ))}
                        {g.pattern && g.pattern !== 'solid' && g.pattern_label && (
                          <span style={{
                            fontSize: 10, color: '#64748b',
                            background: '#0f172a', borderRadius: 20, padding: '3px 8px',
                            border: '1px solid #334155',
                          }}>
                            {g.pattern_label}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
              <div style={{ fontSize: 12, color: tickedCount === garments.length ? '#22c55e' : '#64748b', fontWeight: tickedCount === garments.length ? 700 : 400 }}>
                {tickedCount === garments.length ? '✓ Tümü doğrulandı' : `${tickedCount}/${garments.length} doğrulandı`}
              </div>
            </div>
          )}
```

- [ ] **Step 2: Backend testleri çalıştır (kısmi kontrol)**

```bash
cd backend && npx vitest run src/modules/self-service/self-service.test.js 2>&1 | tail -8
```

Beklenen: Tüm testler PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/modules/laundry-kiosk/LaundryKioskPage.jsx
git commit -m "feat: IroningView — çoklu renk + desen detayları, geliştirilmiş tik UI"
```

---

## Task 4: Hub — garments_json kanban kartında görüntüle

**Files:**
- Modify: `frontend/src/modules/laundry/LaundryHub.jsx`

İki yerde değişiklik:
1. **Row 2 meta** (satır ~311-317): `clothing_items` preview yanına `garments_json` preview ekle
2. **ExpandedSection body** (satır ~74-97): `garments_json` için zengin görünüm (renk swatchları + desen)

- [ ] **Step 1: ExpandedSection içindeki clothing_items bölümünü güncelle**

`LaundryHub.jsx` içinde `function ExpandedSection` içinde şu bölümü bul (satır ~74-97):

```jsx
      {/* Kıyafet detayı */}
      {item.clothing_items && (() => {
        try {
          const cl = JSON.parse(item.clothing_items)
          return (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: 1, marginBottom: 4 }}>KIYAFETler</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {cl.map((c, i) => (
                  <span key={i} style={{
                    padding: '2px 8px', borderRadius: 12, fontSize: 9, fontFamily: 'var(--mono)',
                    background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)',
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}>
                    {CLOTHING_ICONS[c.type] || ''} {c.qty}× {c.type}
                    {c.color && (
                      <span style={{
                        width: 10, height: 10, borderRadius: '50%',
                        background: COLOR_MAP[c.color] || '#888',
                        border: '1px solid rgba(255,255,255,0.2)',
                        flexShrink: 0, display: 'inline-block',
                      }} title={c.color} />
                    )}
                  </span>
                ))}</div>
```

Bu bloğu şununla değiştir (tam blok — kapanış `})()}` dahil — kaç satır olduğuna dikkat et, sadece `{/* Kıyafet detayı */}` yorumundan başlayıp ilk `})()}` kapanışına kadar):

```jsx
      {/* Kıyafet detayı — garments_json (yeni format) öncelikli, clothing_items fallback */}
      {(() => {
        const GARMENT_COLOR_HEX = {
          white: '#f8fafc', black: '#0f172a', gray: '#94a3b8', navy: '#1d4ed8',
          blue: '#3b82f6', red: '#dc2626', green: '#16a34a', yellow: '#ca8a04',
          orange: '#ea580c', purple: '#7c3aed', pink: '#db2777', brown: '#92400e', charcoal: '#4b5563',
        }
        if (item.garments_json) {
          try {
            const gs = JSON.parse(item.garments_json)
            if (!Array.isArray(gs) || gs.length === 0) return null
            return (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: 1, marginBottom: 4 }}>KIYAFETler ({gs.length})</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {gs.map((g, i) => {
                    const colors = g.colors ?? (g.color ? [{ key: g.color, label: g.color_label || g.color }] : [])
                    return (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                        padding: '4px 8px', borderRadius: 6,
                        background: 'var(--surface)', border: '1px solid var(--border)',
                      }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text)', fontWeight: 600, flexShrink: 0 }}>
                          {g.emoji || '👔'} {g.type_name}
                        </span>
                        {g.count > 1 && (
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', flexShrink: 0 }}>×{g.count}</span>
                        )}
                        {colors.map(c => (
                          <span key={c.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                            <span style={{
                              width: 10, height: 10, borderRadius: '50%',
                              background: GARMENT_COLOR_HEX[c.key] || '#888',
                              border: c.key === 'white' ? '1px solid rgba(255,255,255,0.3)' : 'none',
                              display: 'inline-block',
                            }} title={c.label} />
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{c.label}</span>
                          </span>
                        ))}
                        {g.pattern && g.pattern !== 'solid' && g.pattern_label && (
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', fontStyle: 'italic' }}>{g.pattern_label}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          } catch { return null }
        }
        if (item.clothing_items) {
          try {
            const cl = JSON.parse(item.clothing_items)
            return (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: 1, marginBottom: 4 }}>KIYAFETler</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {cl.map((c, i) => (
                    <span key={i} style={{
                      padding: '2px 8px', borderRadius: 12, fontSize: 9, fontFamily: 'var(--mono)',
                      background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)',
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}>
                      {CLOTHING_ICONS[c.type] || ''} {c.qty}× {c.type}
                      {c.color && (
                        <span style={{
                          width: 10, height: 10, borderRadius: '50%',
                          background: COLOR_MAP[c.color] || '#888',
                          border: '1px solid rgba(255,255,255,0.2)',
                          flexShrink: 0, display: 'inline-block',
                        }} title={c.color} />
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )
          } catch { return null }
        }
        return null
      })()}
```

- [ ] **Step 2: Row 2 meta içindeki clothing_items preview'i güncelle**

Aynı dosyada `KanbanCard` bileşeni içinde Row 2 bölümündeki şu satırları bul (satır ~311-317):

```jsx
        {item.clothing_items && (() => {
          try {
            const cl = JSON.parse(item.clothing_items)
            const preview = cl.slice(0, 2).map(c => `${CLOTHING_ICONS[c.type] || ''}${c.qty} ${c.type}`).join(' · ')
            return <span style={{ color: 'var(--text2)' }}>· {preview}{cl.length > 2 ? ` +${cl.length - 2}` : ''}</span>
          } catch { return null }
        })()}
```

Şununla değiştir:

```jsx
        {(item.garments_json || item.clothing_items) && (() => {
          try {
            if (item.garments_json) {
              const gs = JSON.parse(item.garments_json)
              if (!Array.isArray(gs) || gs.length === 0) return null
              const preview = gs.slice(0, 2).map(g => `${g.emoji || ''}${g.count > 1 ? `${g.count}× ` : ''}${g.type_name}`).join(' · ')
              return <span style={{ color: 'var(--text2)' }}>· {preview}{gs.length > 2 ? ` +${gs.length - 2}` : ''}</span>
            }
            const cl = JSON.parse(item.clothing_items)
            const preview = cl.slice(0, 2).map(c => `${CLOTHING_ICONS[c.type] || ''}${c.qty} ${c.type}`).join(' · ')
            return <span style={{ color: 'var(--text2)' }}>· {preview}{cl.length > 2 ? ` +${cl.length - 2}` : ''}</span>
          } catch { return null }
        })()}
```

- [ ] **Step 3: Backend testleri çalıştır**

```bash
cd backend && npx vitest run 2>&1 | tail -8
```

Beklenen: Tüm testler PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/modules/laundry/LaundryHub.jsx
git commit -m "feat: Hub kanban — garments_json renk/desen detayları göster"
```

---

## Task 5: Smoke test — doğrulama

- [ ] **Step 1: Dev sunucuyu başlat (çalışmıyorsa)**

```bash
npm run dev
```

- [ ] **Step 2: Backend son kontrol**

```bash
cd backend && npx vitest run 2>&1 | tail -8
```

Beklenen: Tüm testler PASS.

- [ ] **Step 3: Kiosk — Torba Bırak doğrula**

`http://localhost:5174` → kiosk → Torba Bırak → torba kaydet → Hub kanban'da direkt "Kirli" sütununda görünüyor mu?

- [ ] **Step 4: Kiosk — Kıyafet Gir M1 blok doğrula**

Kiosk → Kıyafet Gir → blok M1 → kıyafet ekle → kaydet → Hub'da "Kirli" sütununda görünüyor mu? (dirty)

- [ ] **Step 5: Kiosk — Kıyafet Gir C/A blok doğrula**

Kiosk → Kıyafet Gir → blok A (veya C) → kıyafet ekle → kaydet → Hub'da "Ütüleniyor" sütununda görünüyor mu? (ironing)

- [ ] **Step 6: GarmentPicker çoklu renk doğrula**

Kiosk → Torba Bırak → Premium Kıyafet aç → kıyafet tipi seç → birden fazla renk seç (ikisi mavi kenarlı oluyor mu?) → + Ekle → kıyafet kartında iki renk chip görünüyor mu?

- [ ] **Step 7: GarmentPicker manuel giriş doğrula**

Kiosk → kıyafet girişi → "Listede yoksa yazın..." alanına yaz → + Ekle → ✏️ tile seçili olarak görünüyor mu? → renk/desen seç → ekle → listede görünüyor mu?

- [ ] **Step 8: IroningView detay doğrula**

Kiosk → Ütü → ironing torbasına gir → kıyafet listesinde renk swatch + desen etiketi görünüyor mu?

- [ ] **Step 9: Hub garments_json doğrula**

Hub kanban → garments_json olan kart → ExpandedSection (▾) aç → kıyafetler renk swatch + desen ile görünüyor mu?
