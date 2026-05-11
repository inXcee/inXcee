# Çamaşırhane Kiosk v2 — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AVS Çamaşırhane Kiosk'unu v1'in sol-nav yapısı üstüne tek "Giriş" sekmesi (Torba Al + Kıyafet Gir birleşik), blok→oda grid seçimi, hızlı tip-arama + 1-tap kıyafet ekleme, koşullu imza, parça-tik bypass ve Durum sekmesi dashboard ile yenilemek.

**Architecture:** 4 yeni component dosyası (`RoomGridPicker`, `QuickGarmentInput`, `EntryForm`, `DashboardView`) + `GarmentChecklist` ve `LaundryKioskPage` modifiye. Mevcut tüm backend endpoint'leri yeterli (eklenti yok). Inline-style React pattern korunur.

**Tech Stack:** React 18, Vite, React Query, mevcut `frontend/src/shared/blocks.js` helper'ları, mevcut `/self-service/laundry-kiosk/*` endpoint'leri.

**Spec:** `docs/superpowers/specs/2026-05-12-laundry-kiosk-v2-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/src/modules/laundry-kiosk/GarmentChecklist.jsx` | MODIFY | `onToggleAll` prop + "Tümünü onayla / Hepsini kaldır" tek buton |
| `frontend/src/modules/laundry-kiosk/RoomGridPicker.jsx` | CREATE | Blok chip → oda grid → kişi seçimi. Aktif torbalar kırmızı işaret |
| `frontend/src/modules/laundry-kiosk/QuickGarmentInput.jsx` | CREATE | Mod A (tip-search + 1-tap ekle, kart düzenle) + Mod B (textarea + adet) toggle |
| `frontend/src/modules/laundry-kiosk/EntryForm.jsx` | CREATE | Tek "Giriş" form'u — RoomGridPicker + QuickGarmentInput + acil/not + imza (koşullu) + kaydet |
| `frontend/src/modules/laundry-kiosk/DashboardView.jsx` | CREATE | Bugünün aktif torbaları status-gruplu liste + filtre + auto-refresh + action butonları |
| `frontend/src/modules/laundry-kiosk/LaundryKioskPage.jsx` | MODIFY | TABS 5→4, `BagForm/GarmentForm/StatusView` fonksiyonları silinir, yeni dosyalar import edilir, `IroningView`+`DeliverView` `onToggleAll` ve imza-koşullu, navigate-focus state |

**SIGN_BLOCKS sabiti:** Yeni `frontend/src/modules/laundry-kiosk/constants.js` dosyasında `SIGN_BLOCKS = new Set(['M1','M2','M3','S1','S2','S3','G','C'])`. EntryForm + DeliverView import eder.

**Test:** Frontend için unit/component testi yok (codebase'de yerleşik değil). Her task sonunda `cd frontend && npx vite build` ve manuel dev server smoke. Backend testleri (`npx vitest run`) etkilenmez (backend değişmiyor).

---

## Task 1: GarmentChecklist'e "Tümünü Onayla" Butonu Ekle

**Files:**
- Modify: `frontend/src/modules/laundry-kiosk/GarmentChecklist.jsx`

- [ ] **Step 1: Component imzasına `onToggleAll` prop ekle**

Mevcut imza:
```jsx
export default function GarmentChecklist({ garments, ticked, onToggle, variant = 'default' }) {
```

Yeni:
```jsx
export default function GarmentChecklist({ garments, ticked, onToggle, onToggleAll, variant = 'default' }) {
```

- [ ] **Step 2: "Tümünü onayla / Hepsini kaldır" butonunu ekle**

Component'in ana `<div>` içinde, garments.map(...)'den ÖNCE şu bloku ekle (mevcut early-return guard'ından sonra):

```jsx
  if (!garments || garments.length === 0) return null

  const tickedCount = Object.values(ticked).filter(Boolean).length
  const allTicked = tickedCount === garments.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {onToggleAll && (
        <button type="button" onClick={() => onToggleAll(!allTicked)}
          style={{
            alignSelf: 'flex-start',
            padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: allTicked ? '#1e293b' : '#15803d',
            color: allTicked ? '#94a3b8' : '#fff',
            fontSize: 12, fontWeight: 700, letterSpacing: 0.5,
          }}>
          {allTicked ? '✕ Hepsini Kaldır' : '✓ Tümünü Onayla'}
        </button>
      )}
      {garments.map((g, i) => {
```

(Geri kalan render kodu aynen kalır — sadece bu buton bloku eklendi.)

- [ ] **Step 3: Build verify**

Run: `cd frontend && npx vite build`
Expected: Build başarılı, hata yok.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/modules/laundry-kiosk/GarmentChecklist.jsx
git commit -m "feat(laundry-kiosk): GarmentChecklist 'Tumunu Onayla' butonu"
```

---

## Task 2: `constants.js` — SIGN_BLOCKS Sabiti

**Files:**
- Create: `frontend/src/modules/laundry-kiosk/constants.js`

- [ ] **Step 1: Yeni dosya oluştur**

`frontend/src/modules/laundry-kiosk/constants.js`:

```js
// Imza zorunlu blok listesi. Bu blokların torba intake/delivery işlemlerinde
// imza canvas görünür ve zorunlu olur. Diğer bloklarda imza alınmaz.
export const SIGN_BLOCKS = new Set(['M1', 'M2', 'M3', 'S1', 'S2', 'S3', 'G', 'C'])

export function blockNeedsSignature(block) {
  return SIGN_BLOCKS.has(block)
}
```

- [ ] **Step 2: Build verify**

Run: `cd frontend && npx vite build`
Expected: Build başarılı (dosya henüz kullanılmıyor, sadece export ediliyor).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/modules/laundry-kiosk/constants.js
git commit -m "feat(laundry-kiosk): SIGN_BLOCKS sabiti (imza kosullu)"
```

---

## Task 3: `RoomGridPicker.jsx` — Blok / Oda / Kişi Seçici

**Files:**
- Create: `frontend/src/modules/laundry-kiosk/RoomGridPicker.jsx`

- [ ] **Step 1: Yeni dosyayı oluştur**

`frontend/src/modules/laundry-kiosk/RoomGridPicker.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { BLOCKS_BY_TYPE, BLOCK_BY_NAME, expectedRoomNos } from '../../shared/blocks.js'

// Bir bloğun tüm katlarındaki oda numaralarını düzleştir
function allRoomNos(blockName) {
  const cfg = BLOCK_BY_NAME[blockName]
  if (!cfg) return []
  const out = []
  for (let f = 1; f <= cfg.floors; f++) out.push(...expectedRoomNos(blockName, f))
  return out
}

// Props:
//   value: { block, room_no, person } | null
//   onChange: ({ block, room_no, person }) => void
//   kioskApi: { get, post, put }
export default function RoomGridPicker({ value, onChange, kioskApi }) {
  const block = value?.block || null
  const room_no = value?.room_no || null
  const person = value?.person || null

  const [activeBagRooms, setActiveBagRooms] = useState(new Set())
  const [persons, setPersons] = useState([])
  const [loadingPersons, setLoadingPersons] = useState(false)

  // Block changed → fetch active bags for that block
  useEffect(() => {
    if (!block) { setActiveBagRooms(new Set()); return }
    let cancelled = false
    kioskApi.get(`/self-service/laundry-kiosk/bags?block=${encodeURIComponent(block)}`)
      .then(r => {
        if (cancelled) return
        const rooms = new Set(r.data.map(b => b.room_no))
        setActiveBagRooms(rooms)
      })
      .catch(() => { if (!cancelled) setActiveBagRooms(new Set()) })
    return () => { cancelled = true }
  }, [block, kioskApi])

  // Room changed → fetch persons
  useEffect(() => {
    if (!block || !room_no) { setPersons([]); return }
    let cancelled = false
    setLoadingPersons(true)
    kioskApi.get(`/self-service/laundry-kiosk/room-persons?block=${encodeURIComponent(block)}&room_no=${encodeURIComponent(room_no)}`)
      .then(r => {
        if (cancelled) return
        setPersons(r.data)
        // Auto-select if exactly one person
        if (r.data.length === 1 && !person) {
          onChange({ block, room_no, person: r.data[0] })
        }
      })
      .catch(() => { if (!cancelled) setPersons([]) })
      .finally(() => { if (!cancelled) setLoadingPersons(false) })
    return () => { cancelled = true }
  }, [block, room_no])  // eslint-disable-line react-hooks/exhaustive-deps

  const blockGroups = [
    { label: 'M', keys: BLOCKS_BY_TYPE.M },
    { label: 'S', keys: BLOCKS_BY_TYPE.S },
    { label: 'Y', keys: BLOCKS_BY_TYPE.Y },
  ]

  const rooms = block ? allRoomNos(block) : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Block chips */}
      <div>
        <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 1, marginBottom: 8 }}>BLOK</div>
        {blockGroups.map(g => (
          <div key={g.label} style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 9, color: '#475569', letterSpacing: 1, marginBottom: 4 }}>{g.label}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {g.keys.map(k => (
                <button key={k} type="button" onClick={() => onChange({ block: k, room_no: null, person: null })}
                  style={{
                    padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: block === k ? '#1d4ed8' : '#1e293b',
                    color: block === k ? '#fff' : '#94a3b8',
                    fontWeight: 700, fontSize: 13,
                  }}>
                  {k}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Room grid */}
      {block && (
        <div>
          <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 1, marginBottom: 8 }}>
            ODA {activeBagRooms.size > 0 && (
              <span style={{ color: '#f87171', fontSize: 10 }}>· 🔴 {activeBagRooms.size} aktif</span>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
            {rooms.map(no => {
              const isActive = activeBagRooms.has(String(no))
              const isSelected = room_no === String(no)
              return (
                <button key={no} type="button" onClick={() => onChange({ block, room_no: String(no), person: null })}
                  style={{
                    padding: '10px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: isSelected ? '#1d4ed8' : '#1e293b',
                    color: isSelected ? '#fff' : '#cbd5e1',
                    fontWeight: 600, fontSize: 13,
                    position: 'relative',
                  }}>
                  {no}
                  {isActive && !isSelected && (
                    <span style={{
                      position: 'absolute', top: 2, right: 4,
                      width: 6, height: 6, borderRadius: '50%', background: '#f87171',
                    }} />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Persons */}
      {block && room_no && (
        <div>
          <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 1, marginBottom: 8 }}>KİŞİ</div>
          {loadingPersons && <div style={{ color: '#475569', fontSize: 12 }}>Yükleniyor…</div>}
          {!loadingPersons && persons.length === 0 && (
            <div style={{ color: '#475569', fontSize: 12, marginBottom: 6 }}>Bu odada kayıtlı kişi yok</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button type="button" onClick={() => onChange({ block, room_no, person: null })}
              style={{
                padding: '10px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: person === null ? '#334155' : '#1e293b',
                color: person === null ? '#e2e8f0' : '#64748b',
                fontWeight: 600, fontSize: 13, textAlign: 'left',
              }}>
              Kişisiz
            </button>
            {persons.map(p => (
              <button key={p.id} type="button" onClick={() => onChange({ block, room_no, person: p })}
                style={{
                  padding: '10px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: person?.id === p.id ? '#1d4ed8' : '#1e293b',
                  color: person?.id === p.id ? '#fff' : '#94a3b8',
                  fontWeight: 600, fontSize: 13, textAlign: 'left',
                }}>
                {p.full_name}{p.company ? ` · ${p.company}` : ''}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Build verify**

Run: `cd frontend && npx vite build`
Expected: Build başarılı.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/modules/laundry-kiosk/RoomGridPicker.jsx
git commit -m "feat(laundry-kiosk): RoomGridPicker — blok/oda grid/kisi secimi"
```

---

## Task 4: `QuickGarmentInput.jsx` — Hızlı Kıyafet Ekleme

**Files:**
- Create: `frontend/src/modules/laundry-kiosk/QuickGarmentInput.jsx`

- [ ] **Step 1: Yeni dosyayı oluştur**

`frontend/src/modules/laundry-kiosk/QuickGarmentInput.jsx`:

```jsx
import { useState, useRef, useEffect } from 'react'
import GarmentPicker from './GarmentPicker.jsx'

const DEFAULT_GARMENT = {
  count: 1,
  colors: [{ key: 'white', label: 'Beyaz' }],
  pattern: 'solid',
  pattern_label: 'Düz',
}

// Props:
//   garmentTypes: [{id, name, emoji, image_url}]
//   value: { mode: 'structured' | 'freetext', garments: [...], freeText: '', itemCount: 0 }
//   onChange: (next) => void  // partial update
export default function QuickGarmentInput({ garmentTypes = [], value, onChange }) {
  const mode = value?.mode || 'structured'
  const garments = value?.garments || []
  const freeText = value?.freeText || ''
  const itemCount = value?.itemCount || 0

  const [query, setQuery] = useState('')
  const [focusIdx, setFocusIdx] = useState(0)
  const [editIdx, setEditIdx] = useState(null)
  const inputRef = useRef(null)

  // Filter suggestions by query
  const suggestions = query.trim().length > 0
    ? garmentTypes.filter(t => t.name.toLowerCase().includes(query.toLowerCase()))
    : []
  const exactMatch = suggestions.find(s => s.name.toLowerCase() === query.toLowerCase().trim())

  useEffect(() => {
    setFocusIdx(0)
  }, [query])

  function addGarment(type) {
    const entry = {
      type_id: type.id,
      type_name: type.name,
      emoji: type.emoji || '👔',
      ...DEFAULT_GARMENT,
    }
    onChange({ ...value, mode: 'structured', garments: [...garments, entry] })
    setQuery('')
    inputRef.current?.focus()
  }

  function addCustom() {
    const name = query.trim()
    if (!name) return
    addGarment({ id: null, name, emoji: '👕' })
  }

  function handleKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (suggestions.length > 0) {
        addGarment(suggestions[focusIdx] || suggestions[0])
      } else if (query.trim().length > 0) {
        addCustom()
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusIdx(i => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Escape') {
      setQuery('')
    }
  }

  function removeGarment(i) {
    onChange({ ...value, garments: garments.filter((_, idx) => idx !== i) })
    if (editIdx === i) setEditIdx(null)
  }

  function toggleMode() {
    const targetMode = mode === 'structured' ? 'freetext' : 'structured'
    // Confirmation if data exists
    if (mode === 'structured' && garments.length > 0) {
      if (!window.confirm(`Eklenmiş ${garments.length} kıyafet kaybolacak. Devam?`)) return
    }
    if (mode === 'freetext' && freeText.trim().length > 0) {
      if (!window.confirm('Yazılan metin kaybolacak. Devam?')) return
    }
    onChange({ ...value, mode: targetMode, garments: [], freeText: '', itemCount: 0 })
    setQuery('')
    setEditIdx(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Mode toggle */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <input type="checkbox" checked={mode === 'freetext'} onChange={toggleMode} style={{ width: 16, height: 16 }} />
        <span style={{ fontSize: 12, color: '#94a3b8' }}>Hepsini metin olarak yaz</span>
      </label>

      {mode === 'structured' && (
        <>
          {/* Search input */}
          <div style={{ position: 'relative' }}>
            <input ref={inputRef} type="text" autoFocus value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Kıyafet tipi yaz veya öneriden seç…"
              style={{
                width: '100%', boxSizing: 'border-box',
                background: '#1e293b', border: '1px solid #334155',
                borderRadius: 10, padding: '12px 14px',
                color: '#f1f5f9', fontSize: 14, outline: 'none',
              }} />

            {/* Suggestion dropdown */}
            {query.trim().length > 0 && (
              <div style={{
                marginTop: 4, background: '#0f172a', borderRadius: 10,
                border: '1px solid #334155', maxHeight: 240, overflowY: 'auto',
              }}>
                {suggestions.map((s, i) => (
                  <button key={s.id} type="button" onClick={() => addGarment(s)}
                    onMouseEnter={() => setFocusIdx(i)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                      padding: '10px 14px', background: i === focusIdx ? '#1e293b' : 'transparent',
                      border: 'none', borderBottom: '1px solid #1e293b', color: '#e2e8f0',
                      cursor: 'pointer', fontSize: 14, textAlign: 'left',
                    }}>
                    <span style={{ fontSize: 18 }}>{s.emoji || '👔'}</span>
                    <span>{s.name}</span>
                  </button>
                ))}
                {!exactMatch && query.trim().length > 0 && (
                  <button type="button" onClick={addCustom}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                      padding: '10px 14px', background: 'transparent',
                      border: 'none', color: '#60a5fa',
                      cursor: 'pointer', fontSize: 13, fontStyle: 'italic', textAlign: 'left',
                    }}>
                    <span>+</span><span>"{query.trim()}" olarak ekle</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Added garments list */}
          {garments.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 1 }}>
                EKLENEN KIYAFETLER ({garments.length})
              </div>
              {garments.map((g, i) => (
                <div key={i} style={{
                  background: '#1e293b', borderRadius: 10, padding: '10px 12px',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>
                      {g.emoji || '👔'} {g.type_name} × {g.count}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                      {(g.colors || []).map(c => c.label).join(', ') || '—'}
                      {g.pattern && g.pattern !== 'solid' && g.pattern_label ? ` · ${g.pattern_label}` : ''}
                    </div>
                  </div>
                  <button type="button" onClick={() => setEditIdx(editIdx === i ? null : i)}
                    style={{ background: 'transparent', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: 16, padding: '4px 6px' }}>
                    ✏
                  </button>
                  <button type="button" onClick={() => removeGarment(i)}
                    style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, padding: '4px 6px' }}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Inline editor */}
          {editIdx !== null && garments[editIdx] && (
            <div style={{ background: '#0b1220', borderRadius: 10, padding: 12, border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 1, marginBottom: 8 }}>DÜZENLE</div>
              <GarmentPicker
                garmentTypes={garmentTypes}
                value={[garments[editIdx]]}
                onChange={(next) => {
                  // Replace at editIdx with updated entry (next is array of 1)
                  if (next.length > 0) {
                    const updated = [...garments]
                    updated[editIdx] = next[0]
                    onChange({ ...value, garments: updated })
                  }
                  setEditIdx(null)
                }}
              />
            </div>
          )}
        </>
      )}

      {mode === 'freetext' && (
        <>
          <textarea value={freeText}
            onChange={e => onChange({ ...value, freeText: e.target.value })}
            placeholder="ör. 3 gömlek, 2 pantolon, 1 ceket…"
            rows={4}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: '#1e293b', border: '1px solid #334155',
              borderRadius: 10, padding: '12px 14px',
              color: '#f1f5f9', fontSize: 14, outline: 'none', resize: 'vertical',
              fontFamily: 'inherit',
            }} />

          <div>
            <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 1, marginBottom: 8 }}>TOPLAM PARÇA</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[1,2,3,4,5,6,7,8].map(n => (
                <button key={n} type="button" onClick={() => onChange({ ...value, itemCount: n })}
                  style={{
                    width: 44, height: 44, borderRadius: 10, border: 'none', cursor: 'pointer',
                    background: itemCount === n ? '#1d4ed8' : '#1e293b',
                    color: itemCount === n ? '#fff' : '#64748b',
                    fontWeight: 700, fontSize: 15,
                  }}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Build verify**

Run: `cd frontend && npx vite build`
Expected: Build başarılı.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/modules/laundry-kiosk/QuickGarmentInput.jsx
git commit -m "feat(laundry-kiosk): QuickGarmentInput — Mod A search + Mod B textarea"
```

---

## Task 5: `EntryForm.jsx` — Birleşik Giriş Formu

**Files:**
- Create: `frontend/src/modules/laundry-kiosk/EntryForm.jsx`

- [ ] **Step 1: Yeni dosyayı oluştur**

`frontend/src/modules/laundry-kiosk/EntryForm.jsx`:

```jsx
import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { laundryApi } from '../laundry/api.js'
import RoomGridPicker from './RoomGridPicker.jsx'
import QuickGarmentInput from './QuickGarmentInput.jsx'
import { blockNeedsSignature } from './constants.js'

// ---- Signature pad (reused pattern) ----
function SigPad({ sigRef }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const [hasSig, setHasSig] = useState(false)

  useEffect(() => {
    if (sigRef) {
      sigRef.current = {
        isEmpty: () => !hasSig,
        toDataURL: () => canvasRef.current?.toDataURL(),
        clear: () => {
          canvasRef.current?.getContext('2d').clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
          setHasSig(false)
        },
      }
    }
  })

  const getPos = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const touch = e.touches ? e.touches[0] : e
    const scaleX = canvasRef.current.width / rect.width
    const scaleY = canvasRef.current.height / rect.height
    return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY }
  }, [])

  const startDraw = useCallback((e) => {
    e.preventDefault(); drawing.current = true
    const ctx = canvasRef.current.getContext('2d')
    const pos = getPos(e)
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y)
  }, [getPos])

  const draw = useCallback((e) => {
    if (!drawing.current) return
    e.preventDefault()
    const ctx = canvasRef.current.getContext('2d')
    const pos = getPos(e)
    ctx.lineTo(pos.x, pos.y)
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke()
    setHasSig(true)
  }, [getPos])

  const stopDraw = useCallback(() => { drawing.current = false }, [])

  return (
    <div>
      <canvas ref={canvasRef} width={400} height={140}
        style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, display: 'block', cursor: 'crosshair', touchAction: 'none', width: '100%' }}
        onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
        onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw}
      />
      {hasSig && (
        <button type="button" onClick={() => sigRef.current?.clear()}
          className="mt-1" style={{ marginTop: 4, fontSize: 11, color: '#64748b', background: 'transparent', border: 'none', cursor: 'pointer' }}>
          Temizle
        </button>
      )}
    </div>
  )
}

// ---- Main component ----
const lbl = { display: 'block', fontSize: 11, color: '#64748b', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }
const card = { background: '#0f172a', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }
const btnStyle = (bg, color = '#fff', disabled = false) => ({
  padding: '14px 20px', borderRadius: 12, border: 'none',
  background: disabled ? '#1e293b' : bg, color: disabled ? '#475569' : color,
  fontWeight: 700, fontSize: 15, cursor: disabled ? 'default' : 'pointer',
})

export default function EntryForm({ kioskApi }) {
  const sigRef = useRef(null)
  const [selection, setSelection] = useState({ block: null, room_no: null, person: null })
  const [garmentState, setGarmentState] = useState({ mode: 'structured', garments: [], freeText: '', itemCount: 0 })
  const [urgent, setUrgent] = useState(false)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(null) // { bag_no }

  const garmentTypes = useQuery({
    queryKey: ['garment-types'],
    queryFn: laundryApi.getGarmentTypes,
    staleTime: 300000,
  }).data ?? []

  const needsSig = selection.block ? blockNeedsSignature(selection.block) : false

  // Derived: effective item_count
  const derivedItemCount = garmentState.mode === 'structured'
    ? garmentState.garments.reduce((acc, g) => acc + (g.count || 1), 0)
    : garmentState.itemCount

  // Validation
  const canSubmit = (
    selection.block &&
    selection.room_no &&
    derivedItemCount > 0
  )

  function resetAll() {
    setSelection({ block: null, room_no: null, person: null })
    setGarmentState({ mode: 'structured', garments: [], freeText: '', itemCount: 0 })
    setUrgent(false)
    setNotes('')
    setError('')
    setSuccess(null)
    sigRef.current?.clear()
  }

  async function submit() {
    setError('')
    if (!selection.block || !selection.room_no) return setError('Blok ve oda seçin')
    if (derivedItemCount === 0) return setError('Kıyafet ekleyin veya parça sayısı seçin')

    let sig = null
    if (needsSig) {
      if (sigRef.current?.isEmpty()) return setError('İmza gerekli')
      sig = sigRef.current?.toDataURL()
    }

    const isPremium = garmentState.mode === 'structured' && garmentState.garments.length > 0
    const payload = {
      block: selection.block,
      room_no: selection.room_no,
      personnel_id: selection.person?.id || null,
      item_count: derivedItemCount,
      is_premium: isPremium,
      garments: isPremium ? garmentState.garments : null,
      notes: notes || (garmentState.mode === 'freetext' ? garmentState.freeText : null),
      urgent,
      intake_signature: sig,
    }

    setSubmitting(true)
    try {
      const res = await kioskApi.post('/self-service/laundry-kiosk/bag', payload)
      setSuccess({ bag_no: res.data.bag_no })
    } catch (e) {
      setError(e.response?.data?.error || 'Hata oluştu')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div style={{ ...card, textAlign: 'center' }}>
        <div style={{ fontSize: 56 }}>✅</div>
        <div style={{ color: '#4ade80', fontWeight: 700, fontSize: 18 }}>Torba kaydedildi!</div>
        {success.bag_no && (
          <div style={{ background: '#1e293b', borderRadius: 12, padding: '16px 24px', display: 'inline-block', alignSelf: 'center' }}>
            <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 2, marginBottom: 4 }}>TORBA NO</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#38bdf8', fontFamily: 'monospace', letterSpacing: 4 }}>{success.bag_no}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Torbayı görevliye teslim edin</div>
          </div>
        )}
        <button onClick={resetAll} style={btnStyle('#1e293b', '#60a5fa')}>+ Yeni Giriş</button>
      </div>
    )
  }

  return (
    <div style={card}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#cbd5e1', margin: 0 }}>🧺 Giriş</h2>

      {/* 1. Room/Person */}
      <RoomGridPicker value={selection} onChange={setSelection} kioskApi={kioskApi} />

      {/* 2. Garments */}
      <div>
        <label style={lbl}>Kıyafetler</label>
        <QuickGarmentInput garmentTypes={garmentTypes} value={garmentState} onChange={setGarmentState} />
      </div>

      {/* 3. Options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={urgent} onChange={e => setUrgent(e.target.checked)} style={{ width: 18, height: 18 }} />
          <span style={{ fontSize: 14, color: '#fbbf24', fontWeight: 600 }}>⚡ Acil</span>
        </label>
        {garmentState.mode === 'structured' && (
          <div>
            <label style={lbl}>Not (opsiyonel)</label>
            <input value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Özel not…"
              style={{ width: '100%', boxSizing: 'border-box', background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '10px 14px', color: '#f1f5f9', fontSize: 13, outline: 'none' }} />
          </div>
        )}
      </div>

      {/* 4. Signature (conditional) */}
      {needsSig && (
        <div>
          <label style={lbl}>İmza</label>
          <SigPad sigRef={sigRef} />
        </div>
      )}

      {error && <div style={{ color: '#f87171', fontSize: 13 }}>{error}</div>}

      <button onClick={submit} disabled={!canSubmit || submitting}
        style={btnStyle('#2563eb', '#fff', !canSubmit || submitting)}>
        {submitting ? 'Kaydediliyor…' : '✓ Torba Kaydet'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Build verify**

Run: `cd frontend && npx vite build`
Expected: Build başarılı.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/modules/laundry-kiosk/EntryForm.jsx
git commit -m "feat(laundry-kiosk): EntryForm — birlesik Giris formu"
```

---

## Task 6: `DashboardView.jsx` — Durum Sekmesi

**Files:**
- Create: `frontend/src/modules/laundry-kiosk/DashboardView.jsx`

- [ ] **Step 1: Yeni dosyayı oluştur**

`frontend/src/modules/laundry-kiosk/DashboardView.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { BLOCKS } from '../../shared/blocks.js'

const STATUS_GROUPS = [
  { key: 'pending_collection', label: '🧺 PENDING (toplanacak)', color: '#fbbf24' },
  { key: 'dirty',              label: '🧴 KİRLİ (yıkanmayı bekliyor)', color: '#94a3b8' },
  { key: 'washing',            label: '⚙ MAKİNEDE',              color: '#60a5fa' },
  { key: 'ironing',            label: '🫧 ÜTÜDE',                 color: '#a78bfa' },
  { key: 'ready',              label: '✓ HAZIR (teslim bekliyor)', color: '#4ade80' },
]

const card = { background: '#0f172a', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }

// Props:
//   kioskApi
//   onAction: (action, bag) => void   // action ∈ 'collect' | 'iron' | 'deliver'
export default function DashboardView({ kioskApi, onAction }) {
  const [bags, setBags] = useState([])
  const [loading, setLoading] = useState(false)
  const [filterBlock, setFilterBlock] = useState('all')
  const [collapsed, setCollapsed] = useState({})

  async function load() {
    setLoading(true)
    try {
      // Default endpoint (no status) returns all active (excludes delivered/lost)
      const url = filterBlock === 'all'
        ? '/self-service/laundry-kiosk/bags'
        : `/self-service/laundry-kiosk/bags?block=${encodeURIComponent(filterBlock)}`
      const res = await kioskApi.get(url)
      setBags(res.data)
    } catch {
      setBags([])
    } finally {
      setLoading(false)
    }
  }

  // Initial + filter change
  useEffect(() => { load() }, [filterBlock])  // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh every 30s
  useEffect(() => {
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [filterBlock])  // eslint-disable-line react-hooks/exhaustive-deps

  async function collect(bag) {
    if (!window.confirm(`${bag.bag_no || `#${bag.id}`} toplandı olarak işaretlenecek. Onayla?`)) return
    try {
      await kioskApi.post(`/self-service/laundry-kiosk/bags/${bag.id}/collect`, {})
      load()
    } catch (e) {
      window.alert(e.response?.data?.error || 'Hata')
    }
  }

  function actionButton(bag) {
    switch (bag.status) {
      case 'pending_collection':
        return <button onClick={() => collect(bag)} style={miniBtn('#15803d')}>Topla →</button>
      case 'ironing':
        return <button onClick={() => onAction('iron', bag)} style={miniBtn('#7c3aed')}>Tamamla →</button>
      case 'ready':
        return <button onClick={() => onAction('deliver', bag)} style={miniBtn('#b45309')}>Teslim →</button>
      default:
        return null
    }
  }

  const byStatus = STATUS_GROUPS.map(g => ({
    ...g,
    items: bags.filter(b => b.status === g.key),
  }))

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#cbd5e1', margin: 0 }}>📋 Bugünün Aktif Torbaları ({bags.length})</h2>
        <button onClick={load} disabled={loading} style={{ background: '#1e293b', border: 'none', color: '#94a3b8', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>
          {loading ? '…' : '↻ Yenile'}
        </button>
      </div>

      {/* Block filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: '#64748b', letterSpacing: 1 }}>BLOK</span>
        <select value={filterBlock} onChange={e => setFilterBlock(e.target.value)}
          style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '6px 10px', color: '#e2e8f0', fontSize: 13, outline: 'none' }}>
          <option value="all">Tüm Bloklar</option>
          {BLOCKS.map(b => <option key={b.block} value={b.block}>{b.block}</option>)}
        </select>
      </div>

      {bags.length === 0 && !loading && (
        <div style={{ color: '#475569', fontSize: 13, textAlign: 'center', padding: 20 }}>
          Aktif torba yok
        </div>
      )}

      {/* Status groups */}
      {byStatus.map(group => {
        if (group.items.length === 0) return null
        const isCollapsed = collapsed[group.key]
        return (
          <div key={group.key} style={{ background: '#1e293b', borderRadius: 10, padding: '10px 12px' }}>
            <button type="button" onClick={() => setCollapsed(c => ({ ...c, [group.key]: !c[group.key] }))}
              style={{ background: 'transparent', border: 'none', color: group.color, fontSize: 12, fontWeight: 700, letterSpacing: 1, padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{isCollapsed ? '▸' : '▾'}</span>
              <span>{group.label} ({group.items.length})</span>
            </button>
            {!isCollapsed && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                {group.items.map(b => (
                  <div key={b.id} style={{ background: '#0f172a', borderRadius: 8, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: '#38bdf8', fontFamily: 'monospace' }}>{b.bag_no || `#${b.id}`}</div>
                      <div style={{ fontSize: 13, color: '#e2e8f0' }}>
                        {b.block}-{b.room_no} · {b.item_count} parça
                        {b.is_premium ? ' · 🟣' : ''}
                        {b.urgent ? ' · ⚡' : ''}
                      </div>
                    </div>
                    {actionButton(b)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

const miniBtn = (bg) => ({
  padding: '6px 12px', borderRadius: 6, border: 'none', background: bg, color: '#fff',
  fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5,
})
```

- [ ] **Step 2: Build verify**

Run: `cd frontend && npx vite build`
Expected: Build başarılı.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/modules/laundry-kiosk/DashboardView.jsx
git commit -m "feat(laundry-kiosk): DashboardView — durum dashboard"
```

---

## Task 7: `LaundryKioskPage` Shell Güncellemesi

**Files:**
- Modify: `frontend/src/modules/laundry-kiosk/LaundryKioskPage.jsx`

Mevcut dosya ~990 satır. Sırasıyla şu değişiklikler yapılır.

- [ ] **Step 1: Import bloğunu güncelle**

Dosyanın en üstündeki import bloğu şu hale gelir (mevcut import'ların yanına ekle):

```jsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import GarmentPicker from './GarmentPicker.jsx'
import GarmentChecklist from './GarmentChecklist.jsx'
import EntryForm from './EntryForm.jsx'
import DashboardView from './DashboardView.jsx'
import { laundryApi } from '../laundry/api.js'
import { blockNeedsSignature } from './constants.js'
```

(Mevcut import'lardan kalan değişmez. `EntryForm`, `DashboardView`, `blockNeedsSignature` yeni eklendi.)

- [ ] **Step 2: Module-scope TABS array'ini güncelle**

Mevcut (5 sekme):
```jsx
const TABS = [
  { key: 'bag',     icon: '🧺', label: 'Torba Al' },
  { key: 'garment', icon: '👔', label: 'Kıyafet' },
  { key: 'ironing', icon: '🫧', label: 'Ütü' },
  { key: 'deliver', icon: '🚚', label: 'Teslim' },
  { key: 'status',  icon: '📋', label: 'Durum' },
]
const VALID_TABS = TABS.map(t => t.key)
```

Yeni (4 sekme):
```jsx
const TABS = [
  { key: 'entry',   icon: '🧺', label: 'Giriş' },
  { key: 'ironing', icon: '🫧', label: 'Ütü' },
  { key: 'deliver', icon: '🚚', label: 'Teslim' },
  { key: 'status',  icon: '📋', label: 'Durum' },
]
const VALID_TABS = TABS.map(t => t.key)
```

- [ ] **Step 3: `activeTab` initial state'i ve default'u güncelle**

`LaundryKioskPage` içindeki state declaration:

Mevcut:
```jsx
  const [activeTab, setActiveTab] = useState(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('tab')
    return VALID_TABS.includes(fromUrl) ? fromUrl : 'bag'
  })
```

Yeni:
```jsx
  const [activeTab, setActiveTab] = useState(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('tab')
    return VALID_TABS.includes(fromUrl) ? fromUrl : 'entry'
  })
  const [focusedBagId, setFocusedBagId] = useState(null)
```

(URL fallback 'bag' → 'entry'. Yeni `focusedBagId` state'i Dashboard'dan navigate olunca hangi torbayı highlight edeceğimizi tutar.)

- [ ] **Step 4: Çıkış butonundaki setActiveTab default'unu güncelle**

Şu satırı bul:
```jsx
        <button onClick={() => { setAvsToken(null); setWorkerInfo(null); setActiveTab('bag') }}
```

Şununla değiştir:
```jsx
        <button onClick={() => { setAvsToken(null); setWorkerInfo(null); setActiveTab('entry'); setFocusedBagId(null) }}
```

- [ ] **Step 5: Content area'daki conditional render'ı güncelle**

Mevcut (5 sekme):
```jsx
          {activeTab === 'bag'     && <BagForm     kioskApi={kioskApi} onDone={() => {}} />}
          {activeTab === 'garment' && <GarmentForm kioskApi={kioskApi} onDone={() => {}} />}
          {activeTab === 'ironing' && <IroningView kioskApi={kioskApi} onDone={() => {}} />}
          {activeTab === 'deliver' && <DeliverView kioskApi={kioskApi} onDone={() => {}} />}
          {activeTab === 'status'  && <StatusView  kioskApi={kioskApi} onDone={() => {}} />}
```

Yeni:
```jsx
          {activeTab === 'entry'   && <EntryForm   kioskApi={kioskApi} />}
          {activeTab === 'ironing' && <IroningView kioskApi={kioskApi} focusedBagId={focusedBagId} onConsumeFocus={() => setFocusedBagId(null)} />}
          {activeTab === 'deliver' && <DeliverView kioskApi={kioskApi} focusedBagId={focusedBagId} onConsumeFocus={() => setFocusedBagId(null)} />}
          {activeTab === 'status'  && <DashboardView kioskApi={kioskApi}
                                          onAction={(action, bag) => {
                                            if (action === 'iron')    { setFocusedBagId(bag.id); setActiveTab('ironing') }
                                            if (action === 'deliver') { setFocusedBagId(bag.id); setActiveTab('deliver') }
                                          }} />}
```

- [ ] **Step 6: Eski `BagForm`, `GarmentForm`, `StatusView` fonksiyonlarını sil**

Dosyada şu üç function definition'ı tamamen sil:
- `function BagForm({ kioskApi, onDone }) { ... }` — başından (`// ── Torba Al ──...` comment'i dahil) süre fonksiyonun kapanış `}` işaretine kadar
- `function GarmentForm({ kioskApi, onDone }) { ... }` — aynı şekilde
- `function StatusView({ kioskApi, onDone }) { ... }` — aynı şekilde

(Üst yorum bloklarını da sil — örn. `// ── Torba Al ──────────────...`, `// ── Kıyafet Gir ─────...`, `// ── Durum Görüntüle ─────...`)

`IroningView`, `DeliverView`, `MachineView` ve helper'lar (`useBlocks`, `useGarmentTypes`, `card`, `input`, `lbl`, `btn`, `BLOCK_GROUPS`, `STANDARD_BLOCKS`, `isPremiumBlock`, `SigPad`) **dosyada kalır**.

- [ ] **Step 7: `IroningView`'a `focusedBagId` + `onToggleAll` desteği ekle**

Mevcut `IroningView` imzası:
```jsx
function IroningView({ kioskApi, onDone }) {
```

Yeni:
```jsx
function IroningView({ kioskApi, focusedBagId, onConsumeFocus }) {
```

Mevcut `useEffect(() => { load() }, [])` satırının ALTINA yeni bir useEffect ekle (component-level, load() fonksiyonunun İÇİ değil):
```jsx
  // Auto-select bag if focusedBagId provided
  useEffect(() => {
    if (focusedBagId && bags.length > 0) {
      const bag = bags.find(b => b.id === focusedBagId)
      if (bag) {
        selectBag(bag)
        onConsumeFocus?.()
      }
    }
  }, [focusedBagId, bags])  // eslint-disable-line react-hooks/exhaustive-deps
```

(`selectBag` zaten IroningView içinde tanımlı.)

`GarmentChecklist` render'ına `onToggleAll` ekle. Mevcut:
```jsx
          <GarmentChecklist
            garments={garments}
            ticked={ticked}
            onToggle={toggleTick}
            variant="ironing"
          />
```

Yeni:
```jsx
          <GarmentChecklist
            garments={garments}
            ticked={ticked}
            onToggle={toggleTick}
            onToggleAll={(all) => {
              const next = {}
              garments.forEach((_, i) => { next[i] = all })
              setTicked(next)
            }}
            variant="ironing"
          />
```

- [ ] **Step 8: `DeliverView`'a `focusedBagId`, `onToggleAll`, imza koşullu ekle**

Mevcut `DeliverView` imzası:
```jsx
function DeliverView({ kioskApi, onDone }) {
```

Yeni:
```jsx
function DeliverView({ kioskApi, focusedBagId, onConsumeFocus }) {
```

Mevcut `useEffect` (bags fetch eden) bloğu var. Onun ALTINA yeni focus useEffect ekle:
```jsx
  // Auto-select bag from dashboard navigation
  useEffect(() => {
    if (focusedBagId && bags.length > 0) {
      const bag = bags.find(b => b.id === focusedBagId)
      if (bag) {
        setSelectedBag(bag)
        onConsumeFocus?.()
      }
    }
  }, [focusedBagId, bags])  // eslint-disable-line react-hooks/exhaustive-deps
```

(NOT: `DeliverView` `selectedBag` ve `bags` state'lerine zaten sahip — Task 3'te eklendi.)

İmza koşullu hale getir. Mevcut imza render'ı:
```jsx
      <div>
        <label style={lbl}>İmza</label>
        <SigPad sigRef={sigRef} />
      </div>
```

Şununla değiştir:
```jsx
      {blockNeedsSignature(effectiveBlock) && (
        <div>
          <label style={lbl}>İmza</label>
          <SigPad sigRef={sigRef} />
        </div>
      )}
```

`deliver()` fonksiyonunda imza zorunluluğunu koşullu yap. Şu satırı bul:
```jsx
    const sig = sigRef.current?.isEmpty() ? null : sigRef.current?.toDataURL()
    if (!sig) return setError('İmza gerekli')
```

Şununla değiştir:
```jsx
    let sig = null
    if (blockNeedsSignature(effectiveBlock)) {
      if (sigRef.current?.isEmpty()) return setError('İmza gerekli')
      sig = sigRef.current?.toDataURL()
    }
```

`GarmentChecklist` render'ına `onToggleAll` ekle. Mevcut:
```jsx
          <GarmentChecklist
            garments={parsedGarments}
            ticked={ticked}
            onToggle={toggleTick}
            variant="deliver"
          />
```

Yeni:
```jsx
          <GarmentChecklist
            garments={parsedGarments}
            ticked={ticked}
            onToggle={toggleTick}
            onToggleAll={(all) => {
              const next = {}
              parsedGarments.forEach((_, i) => { next[i] = all })
              setTicked(next)
            }}
            variant="deliver"
          />
```

- [ ] **Step 9: Sub-component'lerin success-state "Yeni X" butonlarını sadeleştir**

`IroningView`'da success state yok (success bayrağı sadece geçici, otomatik temizleniyor). Bırak.

`DeliverView`'in success state'inde "Yeni Teslim" butonu var. Onu sadeleştir — `setParsedGarments`/`setTicked` çağrıları kalsın, başka değişiklik yok. (Mevcut hâli çalışıyor.)

- [ ] **Step 10: Build verify**

Run: `cd frontend && npx vite build`
Expected: Build başarılı. Olası hata: silinmiş `BagForm`/`GarmentForm`/`StatusView` referansları kaldıysa import veya render'da. Düzelt.

- [ ] **Step 11: Manuel smoke (full flow)**

Run: `npm run dev` (root'tan, halen başlıyorsa).
Tarayıcıda http://localhost:5174/laundry-kiosk → AVS PIN ile giriş.

**Test 1 — Giriş (yapılı, premium, imzalı blok):**
1. Giriş sekmesi açık.
2. Blok M1 → oda grid'i 60 odayla görünür → "205" tıkla.
3. Kişi listesi (1 kişi varsa otomatik seçili; çok kişi varsa elle seç).
4. Kıyafet input'una "gömlek" yaz → öneri görünür → Enter → kart eklenir (Beyaz/Düz/1).
5. "pantolon" yaz → Enter → ikinci kart.
6. ✏ tıkla → GarmentPicker açılır → rengi Lacivert yap → ✓ Güncelle.
7. İmza canvas görünür (M1 SIGN_BLOCKS).
8. "Torba Kaydet" → torba no görünür → "Yeni Giriş" → form sıfırlanır.

**Test 2 — Giriş (Y blok, imzasız, structured kıyafetsiz):**
1. Blok A → oda 105 → kişi (varsa otomatik).
2. Kıyafet eklemeden bekle. Adet grid (1-8) **çıkmaz çünkü structured mode'da değiliz — bu durumda buton disabled** olmalı (çünkü derivedItemCount = 0).
3. **Sorun:** Plan'a göre kıyafet yoksa 1-8 grid çıkmalıydı. Mevcut EntryForm'da bu yok. Plan'da bu eklenecek mi karar verildi mi?
   - Şimdilik geçici kabul: kıyafet eklenmesi zorunlu (structured Mode A). Hiç kıyafet eklenmediyse Mode B'ye geç ve toplam parça seç.
   - Test yapılırken Mode B'ye toggle → "3 gömlek" yaz → toplam: 5 → A blok'ta imza yok → Kaydet.

**Test 3 — Ütü:**
1. Ütü sekmesi → premium torba seç.
2. "✓ Tümünü Onayla" → tüm parçalar tikli → Tamamla.

**Test 4 — Teslim (M blok = imzalı):**
1. Teslim sekmesi → M1 ready torba → checklist + Tümünü Onayla.
2. İmza canvas görünür → ad gir → imza at → Teslim Et.

**Test 5 — Teslim (Y blok = imzasız):**
1. A blok ready torba → checklist + Tümünü Onayla.
2. İmza canvas görünmez → ad gir → Teslim Et → success.

**Test 6 — Dashboard:**
1. Durum sekmesi açılır açılmaz aktif torbalar status gruplu listede.
2. PENDING grubundaki torbada "Topla" → confirm → torba dirty'e geçer, liste yenilenir.
3. ÜTÜDE grubundaki torbada "Tamamla →" → Ütü sekmesi açılır + ilgili torba otomatik seçili.
4. HAZIR grubundaki torbada "Teslim →" → Teslim sekmesi açılır + ilgili torba otomatik seçili.

Sorun varsa kaydet, raporla — DONE_WITH_CONCERNS.

- [ ] **Step 12: Commit**

```bash
git add frontend/src/modules/laundry-kiosk/LaundryKioskPage.jsx
git commit -m "feat(laundry-kiosk): v2 shell — 4 sekme + Entry+Dashboard + imza kosullu"
```

---

## Task 8: Final Smoke + Push

- [ ] **Step 1: Backend testler etkilenmemiş mi doğrula**

Run: `cd backend && npx vitest run`
Expected: Tüm testler geçer (mevcutta 551/551).

- [ ] **Step 2: Frontend build**

Run: `cd frontend && npx vite build`
Expected: Hata yok, bundle oluşur.

- [ ] **Step 3: Push**

```bash
git push origin main
```

---

## Spec Coverage Check

| Spec Bölüm | Kapsayan Task |
|------------|---------------|
| §2 Sekme yapısı 5→4 | Task 7 Step 2 |
| §3.1 RoomGridPicker | Task 3 |
| §3.1 Aktif torba işareti | Task 3 (Step 1, useEffect block) |
| §3.2 QuickGarmentInput Mod A search-add | Task 4 |
| §3.2 QuickGarmentInput Mod B textarea | Task 4 |
| §3.2 Toggle confirm | Task 4 (Step 1, toggleMode fonksiyonu) |
| §3.4 İmza koşullu | Task 2 + Task 5 (`needsSig`) + Task 7 Step 8 (DeliverView) |
| §3.5 Submit + premium otomatik | Task 5 (`isPremium`, `payload`) |
| §3.6 Premium kararı | Task 5 (`isPremium` derived) |
| §4 GarmentChecklist "Tümünü onayla" | Task 1 |
| §4 IroningView + DeliverView onToggleAll | Task 7 Step 7 + Step 8 |
| §5 Teslim imza koşullu | Task 7 Step 8 |
| §6 DashboardView | Task 6 |
| §6 Auto-refresh 30s | Task 6 (Step 1, setInterval) |
| §6 Topla aksiyonu | Task 6 (`collect` fonksiyonu) |
| §6 Tamamla/Teslim navigate | Task 6 (`onAction`) + Task 7 Step 5 (router) |
| §10 v2 sekme key'leri 'entry'... | Task 7 Step 2 |

**Açık not (test sırasında çözülecek):** Spec §3.5 "Kıyafet eklenmediyse alta 1-8 adet grid görünür" — EntryForm'da bu Mode B'ye toggle ile geliyor, Mode A'da gelmiyor. Test sırasında kullanıcı Mode B'ye toggle ediyor. Eğer bu UX problem yaratırsa Task 5'in EntryForm'una "Mode A'da hiç garment yokken adet grid göster" şeklinde ek render bloku eklenir. Şimdilik Mode B yeterli.

Tüm spec gereksinimleri kapsanmış.
