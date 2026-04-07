# Laundry Multi-Color, Patterns & Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Çamaşır modülünde "dizi bekleniyor" bug'ını düzelt, premium parçalara çoklu renk + desen seçimi ekle, parça listesine seçim/toplu işlem desteği getir.

**Architecture:** Backend `sanitizeBody` middleware array body'yi bozuyor → tek satır fix. Frontend'de shared `ColorPatternPicker` component çıkarılır, üç modal bunu kullanır. DB şeması değişmez: `color` kolonu comma-separated string olarak devam eder (`"Mavi, Sarı"`), `pattern` kolonu tek veya çoklu desen adı saklar.

**Tech Stack:** React, @tanstack/react-query, Express.js, SQLite (better-sqlite3), Vitest (backend tests only)

---

## File Map

| Durum | Dosya | Değişiklik |
|-------|-------|-----------|
| Modify | `backend/src/shared/middleware/sanitize.js` | `sanitizeObject` → `sanitizeValue` (bug fix) |
| Create | `frontend/src/modules/laundry/components/ColorPatternPicker.jsx` | Paylaşılan renk+desen seçici |
| Modify | `frontend/src/modules/laundry/components/PremiumGarmentList.jsx` | Seçim checkboxları + yeni picker + detay görünümü |
| Modify | `frontend/src/modules/laundry/components/NewItemModal.jsx` | Premium inline form → yeni picker |
| Modify | `frontend/src/modules/laundry/components/PremiumIntakeModal.jsx` | GarmentRow → yeni picker |

---

### Task 1: sanitizeBody Bug Fix

**Files:**
- Modify: `backend/src/shared/middleware/sanitize.js:31-35`
- Test: `backend/src/modules/laundry/laundry.test.js`

**Problem:** `sanitizeBody` satır 32'de `sanitizeObject(req.body)` çağırıyor. Ama `sanitizeObject` bir `{}` döndürür — array değil. JSON array body gönderilince `req.body = {0: item0, 1: item1}` oluyor ve route'taki `Array.isArray(req.body)` → `false` → `"Dizi bekleniyor"` hatası.

**Fix:** `sanitizeValue` zaten hem array hem object'i doğru handle eder (satır 9-15).

- [ ] **Step 1: Mevcut testlerin geçtiğini doğrula**

```bash
cd backend && npx vitest run
```
Expected: tüm testler PASS

- [ ] **Step 2: Bug fix uygula**

`backend/src/shared/middleware/sanitize.js` dosyasının `sanitizeBody` fonksiyonunu değiştir:

```js
export function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeValue(req.body)  // array ve object her ikisini de düzgün işler
  }
  next()
}
```

- [ ] **Step 3: Testlerin hâlâ geçtiğini doğrula**

```bash
cd backend && npx vitest run
```
Expected: tüm testler PASS (regression yok)

- [ ] **Step 4: Commit**

```bash
cd "C:\Users\hrync\OneDrive\Masaüstü\test claude"
git add backend/src/shared/middleware/sanitize.js
git commit -m "fix: sanitizeBody array body'yi object'e çeviriyor — sanitizeValue ile düzelt"
```

---

### Task 2: ColorPatternPicker Bileşeni Oluştur

**Files:**
- Create: `frontend/src/modules/laundry/components/ColorPatternPicker.jsx`

Bu component üç modal tarafından kullanılır. Props:
- `colors: string[]` — seçili renk adları
- `pattern: string` — seçili desen adı (`''` veya `'Çizgili'` vb.)
- `onChange: ({colors, pattern}) => void`
- `compact?: boolean` — küçük görünüm (PremiumIntakeModal tablo satırı için)

- [ ] **Step 1: Component dosyasını oluştur**

`frontend/src/modules/laundry/components/ColorPatternPicker.jsx`:

```jsx
const COLOR_PALETTE = [
  { name: 'Beyaz',     hex: '#f0f0f0' },
  { name: 'Siyah',     hex: '#222222' },
  { name: 'Gri',       hex: '#888888' },
  { name: 'Füme',      hex: '#4a4a4a' },
  { name: 'Lacivert',  hex: '#1a2e5e' },
  { name: 'Mavi',      hex: '#2563eb' },
  { name: 'Açık Mavi', hex: '#7ec8e3' },
  { name: 'Kırmızı',   hex: '#dc2626' },
  { name: 'Yeşil',     hex: '#16a34a' },
  { name: 'Sarı',      hex: '#eab308' },
  { name: 'Turuncu',   hex: '#ea580c' },
  { name: 'Kahve',     hex: '#92400e' },
  { name: 'Bej',       hex: '#d4b896' },
  { name: 'Mor',       hex: '#7c3aed' },
  { name: 'Pembe',     hex: '#ec4899' },
]

const PATTERNS = [
  { name: 'Çizgili', icon: '▤' },
  { name: 'Kareli',  icon: '▦' },
  { name: 'Desenli', icon: '✦' },
  { name: 'Renkli',  icon: '◈' },
]

/** Renk adından hex döner, bilinmiyorsa '#888' */
export function colorHex(name) {
  return COLOR_PALETTE.find(c => c.name === name)?.hex ?? '#888'
}

/** Comma-separated string'i renk array'ine çevirir */
export function parseColors(colorStr) {
  if (!colorStr) return []
  return colorStr.split(',').map(s => s.trim()).filter(Boolean)
}

/** Renk array'ini + deseni görsel olarak gösterir (readonly, display only) */
export function ColorPatternDisplay({ color, pattern, style = {} }) {
  const colors = parseColors(color)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexWrap: 'wrap', ...style }}>
      {colors.map(c => (
        <span
          key={c}
          title={c}
          style={{
            width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
            background: colorHex(c),
            border: '1px solid rgba(255,255,255,0.2)',
            display: 'inline-block',
          }}
        />
      ))}
      {colors.length > 0 && (
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>
          {colors.join(', ')}
        </span>
      )}
      {pattern && (
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 9,
          padding: '1px 5px', borderRadius: 3,
          background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)',
          color: '#818cf8',
        }}>
          {PATTERNS.find(p => p.name === pattern)?.icon} {pattern}
        </span>
      )}
    </span>
  )
}

export default function ColorPatternPicker({ colors = [], pattern = '', onChange, compact = false }) {
  const toggle = (colorName) => {
    const next = colors.includes(colorName)
      ? colors.filter(c => c !== colorName)
      : [...colors, colorName]
    onChange({ colors: next, pattern })
  }

  const togglePattern = (name) => {
    onChange({ colors, pattern: pattern === name ? '' : name })
  }

  const dotSize = compact ? 18 : 22
  const gap = compact ? 3 : 4

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 4 : 6 }}>
      {/* Renk dotları */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap, alignItems: 'center' }}>
        {COLOR_PALETTE.map(col => {
          const active = colors.includes(col.name)
          return (
            <button
              key={col.name}
              title={col.name}
              onClick={() => toggle(col.name)}
              style={{
                width: dotSize, height: dotSize,
                borderRadius: '50%', padding: 0, cursor: 'pointer',
                background: col.hex, flexShrink: 0,
                border: `2px solid ${active ? 'var(--accent)' : 'rgba(255,255,255,0.08)'}`,
                boxShadow: active ? '0 0 0 2px rgba(240,165,0,0.4)' : 'none',
                outline: 'none', transition: 'all 0.1s',
                transform: active ? 'scale(1.15)' : 'scale(1)',
              }}
            />
          )
        })}
      </div>

      {/* Desen butonları */}
      <div style={{ display: 'flex', gap, flexWrap: 'wrap', alignItems: 'center' }}>
        {!compact && (
          <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: 1 }}>
            DESEN:
          </span>
        )}
        {PATTERNS.map(pat => {
          const active = pattern === pat.name
          return (
            <button
              key={pat.name}
              onClick={() => togglePattern(pat.name)}
              style={{
                padding: compact ? '2px 7px' : '3px 10px',
                borderRadius: 12, cursor: 'pointer',
                background: active ? 'rgba(99,102,241,0.15)' : 'var(--surface)',
                border: `1px solid ${active ? 'rgba(99,102,241,0.5)' : 'var(--border)'}`,
                color: active ? '#818cf8' : 'var(--text3)',
                fontFamily: 'var(--mono)', fontSize: compact ? 9 : 10,
                outline: 'none', transition: 'all 0.1s',
              }}
            >
              {pat.icon} {pat.name}
            </button>
          )
        })}
      </div>

      {/* Seçili özet */}
      {(colors.length > 0 || pattern) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          {colors.map(c => (
            <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 3,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 4, padding: '2px 6px',
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%', background: colorHex(c), flexShrink: 0,
              }} />
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text2)' }}>{c}</span>
              <button onClick={() => toggle(c)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text3)', fontSize: 10, padding: 0, lineHeight: 1,
              }}>×</button>
            </span>
          ))}
          {pattern && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3,
              background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
              borderRadius: 4, padding: '2px 6px',
            }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: '#818cf8' }}>
                {PATTERNS.find(p => p.name === pattern)?.icon} {pattern}
              </span>
              <button onClick={() => togglePattern(pattern)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text3)', fontSize: 10, padding: 0, lineHeight: 1,
              }}>×</button>
            </span>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd "C:\Users\hrync\OneDrive\Masaüstü\test claude"
git add frontend/src/modules/laundry/components/ColorPatternPicker.jsx
git commit -m "feat: ColorPatternPicker — çoklu renk + desen seçici bileşeni"
```

---

### Task 3: PremiumGarmentList — Seçim + Yeni Picker + Gelişmiş Detay

**Files:**
- Modify: `frontend/src/modules/laundry/components/PremiumGarmentList.jsx`

Bu dosya tamamen yeniden yazılır. Değişiklikler:
1. `emptyForm()` → `colors: [], pattern: ''` ekle, `color: ''` kaldır
2. Inline form'da ColorPatternPicker kullan
3. Her satıra seçim checkbox'ı ekle
4. Header'a "Tümünü Seç" + bulk action bar
5. `g.color` comma-separated'ı parse edip renkli dotlar göster
6. `g.pattern` badge olarak göster

- [ ] **Step 1: Dosyayı tamamen yeniden yaz**

`frontend/src/modules/laundry/components/PremiumGarmentList.jsx` içeriği:

```jsx
import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'
import ColorPatternPicker, { ColorPatternDisplay, parseColors } from './ColorPatternPicker.jsx'

const GARMENT_TYPES = [
  'Pantolon','Gömlek','T-Shirt','Kazak','Sweat','Mont','Ceket',
  'Hırka','Polar','Etek','Elbise','Şort','Atlet','İç Çamaşırı',
  'Çorap','Havlu','Yatak Çarşafı','Yastık Kılıfı','Diğer',
]
const SIZES = ['XS','S','M','L','XL','XXL','3XL','36','38','40','42','44','46','48']

const STATUS_LABEL = { received:'Alındı', ironing:'Ütüde', ready:'Hazır', delivered:'Teslim', lost:'Kayıp' }
const STATUS_COLOR = { received:'#f59e0b', ironing:'#6366f1', ready:'#10b981', delivered:'#64748b', lost:'#ef4444' }

function Badge({ status }) {
  const c = STATUS_COLOR[status] || '#64748b'
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 4, fontSize: 9,
      fontFamily: 'var(--mono)', background: c + '18', border: `1px solid ${c}30`, color: c,
      flexShrink: 0,
    }}>
      {STATUS_LABEL[status] || status}
    </span>
  )
}

function emptyForm() {
  return { garment_type: '', brand: '', model: '', size: '', colors: [], pattern: '', condition_notes: '' }
}

export default function PremiumGarmentList({ item }) {
  const qc = useQueryClient()
  const [form, setForm] = useState(emptyForm())
  const [showForm, setShowForm] = useState(false)
  const [deliveredTo, setDeliveredTo] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [bulkDeliverTo, setBulkDeliverTo] = useState('')
  const brandRef = useRef(null)

  const { data: garments = [], isLoading } = useQuery({
    queryKey: ['premium-garments', item.id],
    queryFn: () => laundryApi.getPremiumGarments(item.id),
    staleTime: 10_000,
  })

  const addMut = useMutation({
    mutationFn: () => laundryApi.addPremiumGarments(item.id, [{
      garment_type: form.garment_type,
      brand: form.brand || undefined,
      model: form.model || undefined,
      size: form.size || undefined,
      color: form.colors.join(', ') || undefined,
      pattern: form.pattern || undefined,
      condition_notes: form.condition_notes || undefined,
    }]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['premium-garments', item.id] })
      qc.invalidateQueries({ queryKey: ['laundry-items'] })
      setForm(emptyForm())
      brandRef.current?.focus()
    },
  })

  const advanceMut = useMutation({
    mutationFn: (id) => laundryApi.advancePremiumGarment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['premium-garments', item.id] })
      qc.invalidateQueries({ queryKey: ['laundry-items'] })
    },
  })

  const bulkMut = useMutation({
    mutationFn: ({ ids, to_status }) => laundryApi.bulkAdvancePremiumGarments(item.id, ids, to_status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['premium-garments', item.id] })
      qc.invalidateQueries({ queryKey: ['laundry-items'] })
      setSelected(new Set())
    },
  })

  const deliverMut = useMutation({
    mutationFn: (to) => laundryApi.bulkDeliverPremiumGarments(
      item.id,
      readyGarments.map(g => g.id),
      to
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['premium-garments', item.id] })
      qc.invalidateQueries({ queryKey: ['laundry-items'] })
      setDeliveredTo('')
    },
  })

  const bulkDeliverMut = useMutation({
    mutationFn: ({ ids, to }) => laundryApi.bulkDeliverPremiumGarments(item.id, ids, to),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['premium-garments', item.id] })
      qc.invalidateQueries({ queryKey: ['laundry-items'] })
      setSelected(new Set())
      setBulkDeliverTo('')
    },
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const canAdd = !!form.garment_type

  const ironingGarments = garments.filter(g => g.status === 'ironing')
  const readyGarments   = garments.filter(g => g.status === 'ready')
  const activeGarments  = garments.filter(g => g.status !== 'lost')
  const allIroned       = activeGarments.length > 0 && ironingGarments.length === 0 && readyGarments.length > 0
  const hasIroning      = ironingGarments.length > 0

  // Seçim helpers
  const selectableIds = garments.filter(g => g.status !== 'delivered' && g.status !== 'lost').map(g => g.id)
  const allSelected   = selectableIds.length > 0 && selectableIds.every(id => selected.has(id))
  const toggleSelect  = (id) => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const toggleAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(selectableIds))
  }
  const selectedArray = [...selected]
  const selectedReadyIds  = selectedArray.filter(id => garments.find(g => g.id === id)?.status === 'ready')
  const selectedIroningIds = selectedArray.filter(id => garments.find(g => g.id === id)?.status === 'ironing')

  const inp = {
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 5,
    color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 11, padding: '5px 8px',
    outline: 'none', width: '100%',
  }
  const sel = { ...inp, cursor: 'pointer' }

  return (
    <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 10 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {selectableIds.length > 0 && (
            <button
              onClick={toggleAll}
              title={allSelected ? 'Seçimi Kaldır' : 'Tümünü Seç'}
              style={{
                width: 18, height: 18, borderRadius: 4, flexShrink: 0, cursor: 'pointer',
                border: `2px solid ${allSelected ? 'var(--accent)' : 'var(--border)'}`,
                background: allSelected ? 'var(--accent)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: allSelected ? '#000' : 'var(--text3)', fontSize: 10,
              }}
            >
              {allSelected ? '✓' : ''}
            </button>
          )}
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1 }}>
            KIYAFETler {garments.length > 0 && `(${garments.length})`}
          </span>
          {hasIroning && (
            <span style={{
              fontFamily: 'var(--mono)', fontSize: 9, color: '#6366f1',
              background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)',
              padding: '1px 8px', borderRadius: 4,
            }}>ütüde: {ironingGarments.length}</span>
          )}
          {allIroned && (
            <span style={{
              fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--green)',
              background: 'rgba(39,201,106,0.1)', border: '1px solid rgba(39,201,106,0.25)',
              padding: '1px 8px', borderRadius: 4,
            }}>✓ Tümü Hazır</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {hasIroning && (
            <button
              onClick={() => bulkMut.mutate({ ids: ironingGarments.map(g => g.id), to_status: 'ready' })}
              disabled={bulkMut.isPending}
              style={{
                padding: '3px 10px', borderRadius: 5,
                border: '1px solid rgba(39,201,106,0.4)', background: 'rgba(39,201,106,0.1)',
                color: 'var(--green)', fontFamily: 'var(--mono)', fontSize: 9, cursor: 'pointer', fontWeight: 700,
              }}
            >
              {bulkMut.isPending ? '...' : `✓ Tümünü Hazır (${ironingGarments.length})`}
            </button>
          )}
          <button
            onClick={() => setShowForm(s => !s)}
            style={{
              padding: '2px 10px', borderRadius: 5,
              border: `1px solid ${showForm ? 'rgba(240,165,0,0.4)' : 'var(--border)'}`,
              background: showForm ? 'rgba(240,165,0,0.08)' : 'transparent',
              color: showForm ? 'var(--accent)' : 'var(--text3)',
              fontFamily: 'var(--mono)', fontSize: 9, cursor: 'pointer',
            }}
          >
            {showForm ? '✕ Kapat' : '+ Parça Ekle'}
          </button>
        </div>
      </div>

      {/* ── Bulk Action Bar ── */}
      {selected.size > 0 && (
        <div style={{
          marginBottom: 10, padding: '8px 12px', borderRadius: 7,
          background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.2)',
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)', fontWeight: 700 }}>
            {selected.size} seçili
          </span>
          {selectedIroningIds.length > 0 && (
            <button
              onClick={() => bulkMut.mutate({ ids: selectedIroningIds, to_status: 'ready' })}
              disabled={bulkMut.isPending}
              style={{
                padding: '3px 10px', borderRadius: 5, cursor: 'pointer',
                border: '1px solid rgba(39,201,106,0.4)', background: 'rgba(39,201,106,0.1)',
                color: 'var(--green)', fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700,
              }}
            >
              ✓ Hazır Yap ({selectedIroningIds.length})
            </button>
          )}
          {selectedReadyIds.length > 0 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                value={bulkDeliverTo}
                onChange={e => setBulkDeliverTo(e.target.value)}
                placeholder="Teslim alan..."
                onKeyDown={e => { if (e.key === 'Enter' && bulkDeliverTo.trim()) bulkDeliverMut.mutate({ ids: selectedReadyIds, to: bulkDeliverTo.trim() }) }}
                style={{ ...inp, width: 130, fontSize: 10, padding: '3px 8px' }}
              />
              <button
                onClick={() => { if (bulkDeliverTo.trim()) bulkDeliverMut.mutate({ ids: selectedReadyIds, to: bulkDeliverTo.trim() }) }}
                disabled={!bulkDeliverTo.trim() || bulkDeliverMut.isPending}
                style={{
                  padding: '3px 10px', borderRadius: 5, cursor: 'pointer', flexShrink: 0,
                  border: '1px solid rgba(100,116,139,0.4)', background: 'rgba(100,116,139,0.1)',
                  color: '#94a3b8', fontFamily: 'var(--mono)', fontSize: 9,
                }}
              >
                Teslim Et ({selectedReadyIds.length})
              </button>
            </div>
          )}
          <button
            onClick={() => setSelected(new Set())}
            style={{
              marginLeft: 'auto', padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 9,
            }}
          >
            ✕ Seçimi Kaldır
          </button>
        </div>
      )}

      {/* ── Inline Add Form ── */}
      {showForm && (
        <div style={{
          background: 'var(--surface2)', border: '1px solid rgba(240,165,0,0.15)',
          borderRadius: 8, padding: 12, marginBottom: 10,
        }}>
          {/* Tip */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 5, letterSpacing: 1 }}>TİP *</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {GARMENT_TYPES.map(t => (
                <button key={t} onClick={() => { set('garment_type', t); brandRef.current?.focus() }}
                  style={{
                    padding: '3px 10px', borderRadius: 12,
                    border: `1px solid ${form.garment_type === t ? 'rgba(240,165,0,0.5)' : 'var(--border)'}`,
                    background: form.garment_type === t ? 'rgba(240,165,0,0.12)' : 'transparent',
                    color: form.garment_type === t ? 'var(--accent)' : 'var(--text3)',
                    fontFamily: 'var(--mono)', fontSize: 9, cursor: 'pointer', transition: 'all 0.1s',
                  }}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Marka / Model / Beden */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6, marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 8, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 3 }}>MARKA</div>
              <input ref={brandRef} style={inp} value={form.brand}
                onChange={e => set('brand', e.target.value)} placeholder="örn: Adidas"
                onKeyDown={e => e.key === 'Enter' && canAdd && addMut.mutate()} />
            </div>
            <div>
              <div style={{ fontSize: 8, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 3 }}>MODEL</div>
              <input style={inp} value={form.model}
                onChange={e => set('model', e.target.value)} placeholder="örn: Track Suit"
                onKeyDown={e => e.key === 'Enter' && canAdd && addMut.mutate()} />
            </div>
            <div>
              <div style={{ fontSize: 8, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 3 }}>BEDEN</div>
              <select style={{ ...sel, width: 68 }} value={form.size} onChange={e => set('size', e.target.value)}>
                <option value="">-</option>
                {SIZES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Renk + Desen */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 8, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 5, letterSpacing: 1 }}>RENK & DESEN</div>
            <ColorPatternPicker
              colors={form.colors}
              pattern={form.pattern}
              onChange={({ colors, pattern }) => setForm(f => ({ ...f, colors, pattern }))}
            />
          </div>

          {/* Not */}
          <div style={{ marginBottom: 8 }}>
            <input style={{ ...inp, fontSize: 10 }} value={form.condition_notes}
              onChange={e => set('condition_notes', e.target.value)} placeholder="Not (opsiyonel)"
              onKeyDown={e => e.key === 'Enter' && canAdd && addMut.mutate()} />
          </div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button onClick={() => addMut.mutate()} disabled={!canAdd || addMut.isPending}
              style={{
                padding: '6px 18px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: canAdd ? 'var(--accent)' : 'var(--surface)',
                color: canAdd ? '#000' : 'var(--text3)',
                fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700,
                opacity: addMut.isPending ? 0.6 : 1,
              }}>
              {addMut.isPending ? '...' : '+ Ekle (Enter)'}
            </button>
            <button onClick={() => setForm(emptyForm())} style={{
              padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--text3)',
              fontFamily: 'var(--mono)', fontSize: 10, cursor: 'pointer',
            }}>Temizle</button>
            {addMut.error && (
              <span style={{ fontSize: 9, color: 'var(--red)', fontFamily: 'var(--mono)' }}>
                {addMut.error.response?.data?.error || addMut.error.message}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Garment List ── */}
      {isLoading ? (
        <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>yükleniyor...</div>
      ) : garments.length === 0 ? (
        <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', padding: '4px 0' }}>
          Henüz kıyafet eklenmedi.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {garments.map(g => {
            const isIroning   = g.status === 'ironing'
            const isReady     = g.status === 'ready'
            const isDelivered = g.status === 'delivered'
            const isLost      = g.status === 'lost'
            const isSelectable = !isDelivered && !isLost
            const isSelected  = selected.has(g.id)
            const gColors     = parseColors(g.color)

            return (
              <div key={g.id} style={{
                borderRadius: 7,
                background: isIroning ? 'rgba(99,102,241,0.06)' : isReady ? 'rgba(16,185,129,0.04)' : 'var(--surface2)',
                border: `1px solid ${isSelected ? 'rgba(240,165,0,0.4)' : isIroning ? 'rgba(99,102,241,0.25)' : isReady ? 'rgba(16,185,129,0.2)' : 'var(--border)'}`,
                overflow: 'hidden',
                transition: 'border-color 0.15s',
              }}>
                {/* Ana satır */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px' }}>

                  {/* Seçim checkbox */}
                  {isSelectable && (
                    <button
                      onClick={() => toggleSelect(g.id)}
                      style={{
                        width: 18, height: 18, borderRadius: 4, flexShrink: 0, cursor: 'pointer',
                        border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                        background: isSelected ? 'var(--accent)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: isSelected ? '#000' : 'transparent', fontSize: 10, outline: 'none',
                        transition: 'all 0.1s',
                      }}
                    >✓</button>
                  )}
                  {!isSelectable && (
                    <div style={{ width: 18, height: 18, flexShrink: 0 }} />
                  )}

                  {/* Ütü checkbox (ironing için) */}
                  {isIroning && (
                    <button
                      onClick={() => advanceMut.mutate(g.id)}
                      disabled={advanceMut.isPending}
                      title="Ütülendi olarak işaretle"
                      style={{
                        width: 24, height: 24, borderRadius: 5, flexShrink: 0,
                        border: '2px solid rgba(99,102,241,0.5)',
                        background: 'rgba(99,102,241,0.08)',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#6366f1', fontSize: 13, fontWeight: 900, outline: 'none',
                        transition: 'all 0.15s',
                      }}
                    >
                      {advanceMut.isPending ? '·' : ''}
                    </button>
                  )}
                  {isReady && (
                    <div style={{
                      width: 24, height: 24, borderRadius: 5, flexShrink: 0,
                      border: '2px solid rgba(16,185,129,0.5)',
                      background: 'rgba(16,185,129,0.12)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--green)', fontSize: 13, fontWeight: 900,
                    }}>✓</div>
                  )}
                  {isDelivered && (
                    <div style={{
                      width: 24, height: 24, borderRadius: 5, flexShrink: 0,
                      border: '2px solid rgba(100,116,139,0.3)',
                      background: 'rgba(100,116,139,0.08)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#64748b', fontSize: 11,
                    }}>✓✓</div>
                  )}
                  {isLost && (
                    <div style={{
                      width: 24, height: 24, borderRadius: 5, flexShrink: 0,
                      border: '2px solid rgba(239,68,68,0.3)',
                      background: 'rgba(239,68,68,0.08)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#ef4444', fontSize: 11,
                    }}>✕</div>
                  )}

                  {/* Kod */}
                  <span style={{
                    fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700,
                    padding: '2px 7px', borderRadius: 4, flexShrink: 0,
                    background: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.2)',
                    color: 'var(--accent)', letterSpacing: 0.5,
                  }}>
                    {g.garment_code}
                  </span>

                  {/* Tip */}
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)', fontWeight: 600, flexShrink: 0 }}>
                    {g.garment_type}
                  </span>

                  <Badge status={g.status} />

                  {/* Renkler (inline, kompakt) */}
                  {gColors.length > 0 && (
                    <span style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
                      {gColors.slice(0, 4).map(c => (
                        <span key={c} title={c} style={{
                          width: 10, height: 10, borderRadius: '50%',
                          background: (() => {
                            const palette = [
                              { name: 'Beyaz', hex: '#f0f0f0' },{ name: 'Siyah', hex: '#222222' },
                              { name: 'Gri', hex: '#888888' },{ name: 'Füme', hex: '#4a4a4a' },
                              { name: 'Lacivert', hex: '#1a2e5e' },{ name: 'Mavi', hex: '#2563eb' },
                              { name: 'Açık Mavi', hex: '#7ec8e3' },{ name: 'Kırmızı', hex: '#dc2626' },
                              { name: 'Yeşil', hex: '#16a34a' },{ name: 'Sarı', hex: '#eab308' },
                              { name: 'Turuncu', hex: '#ea580c' },{ name: 'Kahve', hex: '#92400e' },
                              { name: 'Bej', hex: '#d4b896' },{ name: 'Mor', hex: '#7c3aed' },
                              { name: 'Pembe', hex: '#ec4899' },
                            ]
                            return palette.find(p => p.name === c)?.hex || '#888'
                          })(),
                          border: '1px solid rgba(255,255,255,0.15)', flexShrink: 0,
                        }} />
                      ))}
                    </span>
                  )}

                  {/* İlerlet butonu (received) */}
                  {g.status === 'received' && (
                    <button onClick={() => advanceMut.mutate(g.id)} disabled={advanceMut.isPending}
                      style={{
                        marginLeft: 'auto', padding: '2px 10px', borderRadius: 4, border: 'none', cursor: 'pointer',
                        background: 'var(--accent)', color: '#000',
                        fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, flexShrink: 0,
                      }}>→</button>
                  )}
                </div>

                {/* Detay satırı */}
                {(g.brand || g.model || g.size || g.color || g.pattern || g.condition_notes) && (
                  <div style={{
                    display: 'flex', flexWrap: 'wrap', gap: 6, padding: '5px 10px 8px 52px',
                    borderTop: `1px solid ${isIroning ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.04)'}`,
                    alignItems: 'center',
                  }}>
                    {g.brand && (
                      <span style={{
                        fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)',
                        background: 'var(--surface)', border: '1px solid var(--border)',
                        borderRadius: 4, padding: '2px 8px',
                      }}>{g.brand}</span>
                    )}
                    {g.model && (
                      <span style={{
                        fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)',
                        background: 'var(--surface)', border: '1px solid var(--border)',
                        borderRadius: 4, padding: '2px 8px',
                      }}>{g.model}</span>
                    )}
                    {g.size && (
                      <span style={{
                        fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: 'var(--text2)',
                        background: 'var(--surface)', border: '1px solid var(--border)',
                        borderRadius: 4, padding: '2px 8px',
                      }}>{g.size}</span>
                    )}
                    {g.color && (
                      <ColorPatternDisplay color={g.color} pattern={g.pattern} />
                    )}
                    {g.pattern && !g.color && (
                      <ColorPatternDisplay color="" pattern={g.pattern} />
                    )}
                    {g.condition_notes && (
                      <span style={{
                        fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', fontStyle: 'italic',
                        padding: '2px 4px',
                      }}>{g.condition_notes}</span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Teslim Et bölümü — tüm garments hazır olunca ── */}
      {allIroned && readyGarments.length > 0 && (
        <div style={{
          marginTop: 10, padding: '10px 12px', borderRadius: 8,
          background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.25)',
        }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--green)', fontWeight: 700, marginBottom: 8, letterSpacing: 1 }}>
            ✓ TÜM PARÇALAR HAZIR — TESLİM ET
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="form-input"
              value={deliveredTo}
              onChange={e => setDeliveredTo(e.target.value)}
              placeholder="Teslim alan adı..."
              style={{ flex: 1, fontSize: 11 }}
              onKeyDown={e => { if (e.key === 'Enter' && deliveredTo.trim()) deliverMut.mutate(deliveredTo.trim()) }}
            />
            <button
              onClick={() => deliverMut.mutate(deliveredTo.trim())}
              disabled={!deliveredTo.trim() || deliverMut.isPending}
              style={{
                padding: '7px 16px', borderRadius: 6, cursor: 'pointer', flexShrink: 0,
                background: deliveredTo.trim() ? 'var(--green)' : 'var(--surface)',
                border: `1px solid ${deliveredTo.trim() ? 'var(--green)' : 'var(--border)'}`,
                color: deliveredTo.trim() ? '#000' : 'var(--text3)',
                fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700,
                transition: 'all 0.15s',
              }}
            >
              {deliverMut.isPending ? '...' : `✓ Teslim Et (${readyGarments.length})`}
            </button>
          </div>
          {deliverMut.isError && (
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--red)', marginTop: 6 }}>
              {deliverMut.error?.response?.data?.error || 'Hata oluştu'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Backend testlerinin geçtiğini doğrula (regression check)**

```bash
cd backend && npx vitest run
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
cd "C:\Users\hrync\OneDrive\Masaüstü\test claude"
git add frontend/src/modules/laundry/components/PremiumGarmentList.jsx
git commit -m "feat: PremiumGarmentList — seçim checkbox + bulk işlem + çoklu renk/desen görünümü"
```

---

### Task 4: NewItemModal — Premium Inline Form Güncelleme

**Files:**
- Modify: `frontend/src/modules/laundry/components/NewItemModal.jsx`

Premium inline form'da `gForm.color` → `gForm.colors[]` + `gForm.pattern` ve ColorPatternPicker ekle.

- [ ] **Step 1: Import ekle**

Dosyanın en üstüne (diğer importların altına) ekle:

```js
import ColorPatternPicker from './ColorPatternPicker.jsx'
```

- [ ] **Step 2: `gForm` başlangıç state'ini güncelle**

Değiştirilecek satır (şu an `line ~163`):
```js
const [gForm, setGForm] = useState({ color: '', brand: '', model: '', size: '', condition_notes: '' })
```
Yeni hali:
```js
const [gForm, setGForm] = useState({ colors: [], pattern: '', brand: '', model: '', size: '', condition_notes: '' })
```

- [ ] **Step 3: `addPremiumRow` fonksiyonunu güncelle**

Şu an (line ~229-241):
```js
const canAddPremium = !!gType && !!gForm.color
const addPremiumRow = () => {
  if (!canAddPremium) return
  setPremiumRows(prev => [...prev, {
    garment_type: gType,
    color: gForm.color,
    brand: gForm.brand || undefined,
    model: gForm.model || undefined,
    size: gForm.size || undefined,
    condition_notes: gForm.condition_notes || undefined,
  }])
  setGType('')
  setGForm({ color: '', brand: '', model: '', size: '', condition_notes: '' })
  setTimeout(() => colorRef.current?.focus(), 30)
}
```

Yeni hali:
```js
const canAddPremium = !!gType
const addPremiumRow = () => {
  if (!canAddPremium) return
  setPremiumRows(prev => [...prev, {
    garment_type: gType,
    color: gForm.colors.length > 0 ? gForm.colors.join(', ') : undefined,
    pattern: gForm.pattern || undefined,
    brand: gForm.brand || undefined,
    model: gForm.model || undefined,
    size: gForm.size || undefined,
    condition_notes: gForm.condition_notes || undefined,
  }])
  setGType('')
  setGForm({ colors: [], pattern: '', brand: '', model: '', size: '', condition_notes: '' })
}
```

(Not: `colorRef` artık gerekli değil ama varolan `useRef(null)` bırakılabilir, sadece kullanılmaz.)

- [ ] **Step 4: Renk bölümünü ColorPatternPicker ile değiştir**

Premium inline formdaki renk bölümü (şu an `line ~470-502`), tüm `{/* Renk */}` div'i şununla değiştir:

```jsx
{/* Renk & Desen */}
<div style={{ marginBottom: 8 }}>
  <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: 1, marginBottom: 4 }}>
    RENK & DESEN
  </div>
  <ColorPatternPicker
    colors={gForm.colors}
    pattern={gForm.pattern}
    onChange={({ colors, pattern }) => setGForm(f => ({ ...f, colors, pattern }))}
  />
</div>
```

- [ ] **Step 5: premiumRow listesindeki renk gösterimini güncelle**

Eklenen parçalar listesinde renk dot'u göstergesi (line ~412-417):

Şu an:
```jsx
<span style={{
  width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
  background: COLOR_PALETTE.find(c => c.name === g.color)?.hex || '#888',
  border: '1px solid rgba(255,255,255,0.15)',
}} title={g.color} />
<span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{g.color}</span>
```

Yeni hali — `g.color` artık comma-separated olabilir:
```jsx
{g.color && g.color.split(', ').map(c => (
  <span key={c} style={{
    width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
    background: COLOR_PALETTE.find(cp => cp.name === c)?.hex || '#888',
    border: '1px solid rgba(255,255,255,0.15)',
  }} title={c} />
))}
{g.color && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{g.color}</span>}
{g.pattern && (
  <span style={{
    fontFamily: 'var(--mono)', fontSize: 9, color: '#818cf8',
    background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)',
    borderRadius: 3, padding: '1px 5px',
  }}>{g.pattern}</span>
)}
```

- [ ] **Step 6: Commit**

```bash
cd "C:\Users\hrync\OneDrive\Masaüstü\test claude"
git add frontend/src/modules/laundry/components/NewItemModal.jsx
git commit -m "feat: NewItemModal premium form — ColorPatternPicker ile çoklu renk+desen"
```

---

### Task 5: PremiumIntakeModal — GarmentRow Güncelleme

**Files:**
- Modify: `frontend/src/modules/laundry/components/PremiumIntakeModal.jsx`

`GarmentRow` tablo bileşeninde renk `<input>`'u yerine ColorPatternPicker kullan. Tablo responsive olmayacak kadar dar olacağı için compact mode kullan.

- [ ] **Step 1: Import ekle**

```js
import ColorPatternPicker from './ColorPatternPicker.jsx'
```

- [ ] **Step 2: `emptyRow` güncelle**

```js
function emptyRow() {
  return { garment_type: '', brand: '', model: '', size: '', colors: [], pattern: '', condition_notes: '' }
}
```

- [ ] **Step 3: `GarmentRow` bileşenini güncelle**

Şu an (line ~13-44):
```jsx
function GarmentRow({ row, idx, onChange, onRemove }) {
  return (
    <tr>
      ...
      <td><input className="form-input" style={{ fontSize: 10, width: 80 }} value={row.color} onChange={e => onChange(idx, 'color', e.target.value)} placeholder="Renk" /></td>
      ...
    </tr>
  )
}
```

Tüm `GarmentRow` fonksiyonunu yeniden yaz:

```jsx
function GarmentRow({ row, idx, onChange, onRemove }) {
  return (
    <tr>
      <td>
        <select
          value={row.garment_type}
          onChange={e => onChange(idx, 'garment_type', e.target.value)}
          style={{ width: '100%', fontFamily: 'var(--mono)', fontSize: 10, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 6px', color: 'var(--text)' }}
        >
          <option value="">Seç...</option>
          {GARMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </td>
      <td><input className="form-input" style={{ fontSize: 10 }} value={row.brand} onChange={e => onChange(idx, 'brand', e.target.value)} placeholder="Marka" /></td>
      <td><input className="form-input" style={{ fontSize: 10 }} value={row.model} onChange={e => onChange(idx, 'model', e.target.value)} placeholder="Model" /></td>
      <td>
        <select
          value={row.size}
          onChange={e => onChange(idx, 'size', e.target.value)}
          style={{ width: 70, fontFamily: 'var(--mono)', fontSize: 10, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 6px', color: 'var(--text)' }}
        >
          <option value="">-</option>
          {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </td>
      <td style={{ minWidth: 200 }}>
        <ColorPatternPicker
          colors={row.colors || []}
          pattern={row.pattern || ''}
          compact
          onChange={({ colors, pattern }) => {
            onChange(idx, 'colors', colors)
            onChange(idx, 'pattern', pattern)
          }}
        />
      </td>
      <td><input className="form-input" style={{ fontSize: 10 }} value={row.condition_notes} onChange={e => onChange(idx, 'condition_notes', e.target.value)} placeholder="Not" /></td>
      <td>
        <button onClick={() => onRemove(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14, padding: '0 4px' }}>✕</button>
      </td>
    </tr>
  )
}
```

- [ ] **Step 4: Tablo header'ını güncelle**

`Renk` header'ını `Renk & Desen` olarak değiştir:
```jsx
<th style={{ minWidth: 200 }}>Renk & Desen</th>
```

- [ ] **Step 5: `save` mutationFn'de colors → color dönüştür**

Şu an (line ~62-65):
```js
mutationFn: () => {
  const valid = rows.filter(r => r.garment_type)
  if (!valid.length) throw new Error('En az bir parça tipi seçilmeli')
  return laundryApi.addPremiumGarments(item.id, valid)
},
```

Yeni hali:
```js
mutationFn: () => {
  const valid = rows.filter(r => r.garment_type).map(r => ({
    garment_type: r.garment_type,
    brand: r.brand || undefined,
    model: r.model || undefined,
    size: r.size || undefined,
    color: r.colors?.length > 0 ? r.colors.join(', ') : undefined,
    pattern: r.pattern || undefined,
    condition_notes: r.condition_notes || undefined,
  }))
  if (!valid.length) throw new Error('En az bir parça tipi seçilmeli')
  return laundryApi.addPremiumGarments(item.id, valid)
},
```

- [ ] **Step 6: Commit**

```bash
cd "C:\Users\hrync\OneDrive\Masaüstü\test claude"
git add frontend/src/modules/laundry/components/PremiumIntakeModal.jsx
git commit -m "feat: PremiumIntakeModal — GarmentRow ColorPatternPicker ile renk+desen seçimi"
```

---

### Task 6: Final Doğrulama

- [ ] **Step 1: Backend testleri**

```bash
cd backend && npx vitest run
```
Expected: tüm testler PASS

- [ ] **Step 2: Manuel test — bug fix**

1. Uygulamayı aç (http://localhost:5174)
2. `camasir/admin123` ile giriş yap
3. Premium bloktan bir kayıt oluştur (ör. A blok varsa)
4. Premium parça kaydetmeyi dene
5. "Dizi bekleniyor" hatası artık çıkmamalı, parçalar kaydedilmeli

- [ ] **Step 3: Manuel test — çoklu renk**

1. Yeni premium kayıt formunu aç
2. Tip seç → Renk & Desen bölümünde birden fazla renk seç (ör. Mavi + Sarı)
3. Çizgili desen seç
4. Parça ekle → listede renk dotları ve desen badge'i görünmeli

- [ ] **Step 4: Manuel test — seçim + bulk**

1. PremiumGarmentList'te birden fazla parça olan bir kayıt aç
2. Checkbox'lara tıkla → seçim çubuğu açılmalı
3. "Tümünü Seç" çalışmalı
4. Seçili ütüdekiler için "Hazır Yap" butonu görünmeli

- [ ] **Step 5: Final commit**

```bash
cd "C:\Users\hrync\OneDrive\Masaüstü\test claude"
git add .
git commit -m "chore: laundry multicolor+pattern+selection feature complete"
```
