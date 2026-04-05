# Premium Kıyafet Giriş + Arama İyileştirme — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PremiumGarmentList'e hızlı metin parse + adet girişi ekle; PremiumSearchPanel'e anlık arama, desen/kişi filtresi ve renk dotları ekle.

**Architecture:** Sadece frontend değişikliği (Task 2–4) + backend `searchPremiumGarmentsQuery`'ye `intake_name`/`pattern` filtre (Task 1). Parse tamamen client-side regex — dış bağımlılık yok. `ColorPatternDisplay` zaten var, import edilecek.

**Tech Stack:** React, @tanstack/react-query, Express.js, SQLite (better-sqlite3), Vitest

---

## File Map

| Durum | Dosya | Değişiklik |
|-------|-------|-----------|
| Modify | `backend/src/modules/laundry/queries.js:799` | `searchPremiumGarmentsQuery` — `intake_name` + `pattern` filtre + SELECT |
| Modify | `backend/src/modules/laundry/routes.js:504` | query param okuma: `intake_name`, `pattern` |
| Modify | `backend/src/modules/laundry/laundry.test.js` | 2 yeni test |
| Modify | `frontend/src/modules/laundry/components/PremiumGarmentList.jsx` | quantity alanı + parseQuickText + hızlı giriş UI |
| Modify | `frontend/src/modules/laundry/components/PremiumSearchPanel.jsx` | debounce + desen/kişi filtresi + renk dotları |

---

### Task 1: Backend — intake_name + pattern filtreleri

**Files:**
- Modify: `backend/src/modules/laundry/queries.js:799-838`
- Modify: `backend/src/modules/laundry/routes.js:502-510`
- Test: `backend/src/modules/laundry/laundry.test.js`

- [ ] **Step 1: Testlerin geçtiğini doğrula**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js
```
Expected: tüm testler PASS

- [ ] **Step 2: 2 yeni test yaz (önce başarısız olacak)**

`laundry.test.js` içindeki `'premium garment arama'` describe bloğuna, mevcut testlerin hemen ardına ekle:

```js
  test('intake_name filtresi çalışır', () => {
    const db = getDB()
    // intake_name ile item oluştur
    const user = db.prepare("SELECT * FROM users WHERE role='campus_manager' LIMIT 1").get()
    const room = db.prepare("SELECT id FROM rooms WHERE block='M1' LIMIT 1").get()
    const item = createItemService({ room_id: room.id, item_count: 1, intake_name: 'Test Kişi' }, user.id)
    addPremiumGarmentsService(item.id, [{ garment_type: 'Gömlek' }], user.id)
    const result = searchPremiumGarmentsService({ intake_name: 'Test Kişi' })
    expect(result.rows.length).toBeGreaterThan(0)
    expect(result.rows.every(g => g.intake_name === 'Test Kişi')).toBe(true)
  })

  test('pattern filtresi çalışır', () => {
    const db = getDB()
    const user = db.prepare("SELECT * FROM users WHERE role='campus_manager' LIMIT 1").get()
    const room = db.prepare("SELECT id FROM rooms WHERE block='M1' LIMIT 1").get()
    const item = createItemService({ room_id: room.id, item_count: 1 }, user.id)
    addPremiumGarmentsService(item.id, [{ garment_type: 'Gömlek', pattern: 'Çizgili' }], user.id)
    const result = searchPremiumGarmentsService({ pattern: 'Çizgili' })
    expect(result.rows.length).toBeGreaterThan(0)
    expect(result.rows.every(g => g.pattern === 'Çizgili')).toBe(true)
  })
```

- [ ] **Step 3: Testlerin başarısız olduğunu doğrula**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js 2>&1 | grep -E "FAIL|intake_name|pattern filtresi"
```
Expected: 2 test FAIL

- [ ] **Step 4: `searchPremiumGarmentsQuery` imzasını ve filtrelerini güncelle**

`backend/src/modules/laundry/queries.js` satır 799'daki fonksiyon imzasını ve filtre bloğunu şu şekilde değiştir:

```js
export function searchPremiumGarmentsQuery({ block, room_no, garment_type, brand, size, color, pattern, intake_name, status, from_date, to_date, page = 1, limit = 50 } = {}) {
  const db = getDB()
  const conditions = []
  const params = []

  if (block)        { conditions.push('r.block = ?');            params.push(block) }
  if (room_no)      { conditions.push('r.room_no = ?');          params.push(room_no) }
  if (garment_type) { conditions.push('pg.garment_type LIKE ?'); params.push(`%${garment_type}%`) }
  if (brand)        { conditions.push('pg.brand LIKE ?');        params.push(`%${brand}%`) }
  if (size)         { conditions.push('pg.size = ?');            params.push(size) }
  if (color)        { conditions.push('pg.color LIKE ?');        params.push(`%${color}%`) }
  if (pattern)      { conditions.push('pg.pattern LIKE ?');      params.push(`%${pattern}%`) }
  if (intake_name)  { conditions.push('li.intake_name LIKE ?');  params.push(`%${intake_name}%`) }
  if (status)       { conditions.push('pg.status = ?');          params.push(status) }
  if (from_date)    { conditions.push("li.created_at >= ?");     params.push(from_date) }
  if (to_date)      { conditions.push("li.created_at <= ?");     params.push(to_date + ' 23:59:59') }
```

SELECT sorgusunu da güncelle — `pg.pattern` ve `li.intake_name` ekle:

```js
  const rows = db.prepare(`
    SELECT pg.id, pg.garment_code, pg.garment_type, pg.brand, pg.model, pg.size, pg.color,
           pg.pattern, pg.status, pg.condition_notes, pg.delivered_to, pg.delivered_at,
           li.id AS item_id, li.created_at AS intake_date, li.intake_name,
           r.block, r.room_no
    FROM premium_garments pg
    JOIN laundry_items li ON li.id = pg.item_id
    JOIN rooms r ON r.id = li.room_id
    ${where}
    ORDER BY li.created_at DESC, pg.garment_code ASC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset)
```

COUNT sorgusunu değiştirme (WHERE aynı kalır).

- [ ] **Step 5: routes.js'de yeni param'ları oku**

`backend/src/modules/laundry/routes.js` satır 504'teki destructuring'i şu şekilde değiştir:

```js
    const { block, room_no, type, brand, size, color, pattern, intake_name, status, from, to, page, limit } = req.query
    res.json(svc.searchPremiumGarmentsService({
      block, room_no, garment_type: type, brand, size, color, pattern, intake_name, status,
      from_date: from, to_date: to,
      page: page ? +page : 1,
      limit: limit ? Math.min(+limit, 100) : 50,
    }))
```

- [ ] **Step 6: Testlerin geçtiğini doğrula**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js
```
Expected: tüm testler PASS

- [ ] **Step 7: Commit**

```bash
cd "C:\Users\hrync\OneDrive\Masaüstü\test claude"
git add backend/src/modules/laundry/queries.js backend/src/modules/laundry/routes.js backend/src/modules/laundry/laundry.test.js
git commit -m "feat: premium search — intake_name + pattern filtreleri"
```

---

### Task 2: PremiumGarmentList — Adet Alanı

**Files:**
- Modify: `frontend/src/modules/laundry/components/PremiumGarmentList.jsx`

- [ ] **Step 1: `emptyForm`'a `quantity: 1` ekle**

```js
function emptyForm() {
  return { garment_type: '', brand: '', model: '', size: '', colors: [], pattern: '', condition_notes: '', quantity: 1 }
}
```

- [ ] **Step 2: Form grid'ini 4 sütuna çevir ve ADET inputu ekle**

Mevcut grid satırını (3 sütunlu: `'1fr 1fr auto'`) şu şekilde değiştir:

```jsx
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 68px 56px', gap: 6, marginBottom: 8 }}>
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
    <select style={{ ...sel, width: '100%' }} value={form.size} onChange={e => set('size', e.target.value)}>
      <option value="">-</option>
      {SIZES.map(s => <option key={s}>{s}</option>)}
    </select>
  </div>
  <div>
    <div style={{ fontSize: 8, color: 'var(--accent)', fontFamily: 'var(--mono)', marginBottom: 3, fontWeight: 700 }}>ADET</div>
    <input
      type="number" min={1} max={20}
      style={{ ...inp, textAlign: 'center', border: '1px solid rgba(240,165,0,0.35)', color: 'var(--accent)' }}
      value={form.quantity}
      onChange={e => set('quantity', Math.min(20, Math.max(1, parseInt(e.target.value) || 1)))}
      onKeyDown={e => e.key === 'Enter' && canAdd && addMut.mutate()}
    />
  </div>
</div>
```

- [ ] **Step 3: `addMut.mutationFn`'ı adet destekli yap**

```js
  const addMut = useMutation({
    mutationFn: () => {
      const garmentObj = {
        garment_type: form.garment_type,
        brand: form.brand || undefined,
        model: form.model || undefined,
        size: form.size || undefined,
        color: form.colors.length > 0 ? form.colors.join(', ') : undefined,
        pattern: form.pattern || undefined,
        condition_notes: form.condition_notes || undefined,
      }
      const items = Array.from({ length: form.quantity }, () => ({ ...garmentObj }))
      return laundryApi.addPremiumGarments(item.id, items)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['premium-garments', item.id] })
      qc.invalidateQueries({ queryKey: ['laundry-items'] })
      setForm(emptyForm())
      brandRef.current?.focus()
    },
  })
```

- [ ] **Step 4: Ekle butonunun metnini güncelle**

```jsx
{addMut.isPending ? '...' : form.quantity > 1 ? `+ ${form.quantity} Adet Ekle` : '+ Ekle (Enter)'}
```

- [ ] **Step 5: Uygulamayı aç ve manuel test et**

`npm run dev` çalışıyorsa: Premium kıyafet listesine git → ADET alanı görünüyor mu? 3 yazıp Ekle'ye bas → 3 ayrı kıyafet oluşuyor mu?

- [ ] **Step 6: Commit**

```bash
cd "C:\Users\hrync\OneDrive\Masaüstü\test claude"
git add frontend/src/modules/laundry/components/PremiumGarmentList.jsx
git commit -m "feat: premium kıyafet girişine adet alanı"
```

---

### Task 3: PremiumGarmentList — Hızlı Metin Girişi (parseQuickText)

**Files:**
- Modify: `frontend/src/modules/laundry/components/PremiumGarmentList.jsx`

- [ ] **Step 1: `parseQuickText` fonksiyonunu dosyanın üstüne ekle (GARMENT_TYPES tanımının hemen altına)**

```js
const GARMENT_TYPE_ALIASES = {
  'gömlek': 'Gömlek', 'gomlek': 'Gömlek',
  'pantolon': 'Pantolon',
  't-shirt': 'T-Shirt', 'tişört': 'T-Shirt', 'tisort': 'T-Shirt', 'tshirt': 'T-Shirt',
  'kazak': 'Kazak',
  'sweat': 'Sweat',
  'mont': 'Mont',
  'ceket': 'Ceket',
  'hırka': 'Hırka', 'hirka': 'Hırka',
  'polar': 'Polar',
  'etek': 'Etek',
  'elbise': 'Elbise',
  'şort': 'Şort', 'sort': 'Şort',
  'atlet': 'Atlet',
  'çorap': 'Çorap', 'corap': 'Çorap',
  'havlu': 'Havlu',
  'diğer': 'Diğer', 'diger': 'Diğer',
}

const QUICK_COLORS = ['Beyaz','Siyah','Gri','Füme','Lacivert','Mavi','Açık Mavi','Kırmızı','Yeşil','Sarı','Turuncu','Kahve','Bej','Mor','Pembe']
const QUICK_PATTERNS = ['Çizgili','Kareli','Desenli','Renkli']
const QUICK_SIZES = new Set(['XS','S','M','L','XL','XXL','3XL','36','38','40','42','44','46','48'])

function parseQuickText(text) {
  let rem = text.trim()
  const result = { garment_type: '', colors: [], pattern: '', size: '', brand: '', quantity: 1 }

  // Adet: "3 adet", "3x", "x3", veya satır başı sayı
  const qMatch = rem.match(/^(\d{1,2})\s*(adet|x|×)?\s+/i) || rem.match(/\b[x×](\d{1,2})\b/i)
  if (qMatch) {
    result.quantity = Math.min(20, Math.max(1, parseInt(qMatch[1])))
    rem = rem.replace(qMatch[0], ' ').trim()
  }

  // Kıyafet tipi (çok kelimeli önce)
  const lower = rem.toLowerCase()
  for (const [key, val] of Object.entries(GARMENT_TYPE_ALIASES)) {
    if (lower.includes(key)) {
      result.garment_type = val
      rem = rem.replace(new RegExp(key, 'i'), ' ').replace(/\s+/g, ' ').trim()
      break
    }
  }

  // Renkler
  for (const color of QUICK_COLORS) {
    if (rem.toLowerCase().includes(color.toLowerCase())) {
      result.colors.push(color)
      rem = rem.replace(new RegExp(color, 'i'), ' ').replace(/\s+/g, ' ').trim()
    }
  }

  // Desen
  for (const pat of QUICK_PATTERNS) {
    if (rem.toLowerCase().includes(pat.toLowerCase())) {
      result.pattern = pat
      rem = rem.replace(new RegExp(pat, 'i'), ' ').replace(/\s+/g, ' ').trim()
      break
    }
  }

  // Beden (tam kelime eşleşmesi)
  const words = rem.split(/\s+/)
  const remaining = []
  for (const w of words) {
    if (!result.size && QUICK_SIZES.has(w.toUpperCase())) {
      result.size = w.toUpperCase()
    } else if (w) {
      remaining.push(w)
    }
  }

  result.brand = remaining.join(' ').trim()
  return result
}
```

- [ ] **Step 2: Component'e `quickText` state ekle**

`const brandRef = useRef(null)` satırının hemen altına:

```js
const [quickText, setQuickText] = useState('')
```

- [ ] **Step 3: Hızlı giriş UI'ı formun başına ekle**

`{/* ── Inline Add Form ── */}` bloğunun içinde, `{showForm && (` açılışından hemen sonra gelen `<div style={{ background: 'var(--surface2)'...}}>` içine, TİP * başlığından önce ekle:

```jsx
{/* ── Hızlı Giriş ── */}
<div style={{ marginBottom: 10 }}>
  <div style={{ fontSize: 9, color: '#818cf8', fontFamily: 'var(--mono)', marginBottom: 5, letterSpacing: 1 }}>
    ⚡ HIZLI GİRİŞ
  </div>
  <div style={{ display: 'flex', gap: 6 }}>
    <input
      style={{ ...inp, flex: 1, border: quickText ? '1px solid rgba(99,102,241,0.4)' : '1px solid var(--border)', color: quickText ? '#a5b4fc' : 'var(--text3)' }}
      value={quickText}
      onChange={e => setQuickText(e.target.value)}
      placeholder="örn: 3 mavi gömlek M Lacoste"
      onKeyDown={e => {
        if (e.key === 'Enter' && quickText.trim()) {
          const parsed = parseQuickText(quickText)
          setForm(f => ({
            ...f,
            garment_type: parsed.garment_type || f.garment_type,
            colors: parsed.colors.length > 0 ? parsed.colors : f.colors,
            pattern: parsed.pattern || f.pattern,
            size: parsed.size || f.size,
            brand: parsed.brand || f.brand,
            quantity: parsed.quantity,
          }))
          setQuickText('')
        }
      }}
    />
    <button
      type="button"
      onClick={() => {
        if (!quickText.trim()) return
        const parsed = parseQuickText(quickText)
        setForm(f => ({
          ...f,
          garment_type: parsed.garment_type || f.garment_type,
          colors: parsed.colors.length > 0 ? parsed.colors : f.colors,
          pattern: parsed.pattern || f.pattern,
          size: parsed.size || f.size,
          brand: parsed.brand || f.brand,
          quantity: parsed.quantity,
        }))
        setQuickText('')
      }}
      style={{
        padding: '5px 12px', borderRadius: 5, cursor: 'pointer',
        background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.35)',
        color: '#818cf8', fontFamily: 'var(--mono)', fontSize: 10,
      }}
    >
      ↵ Doldur
    </button>
  </div>
  {/* Parse etiketleri — anlık önizleme */}
  {quickText.trim() && (() => {
    const p = parseQuickText(quickText)
    return (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5 }}>
        {p.garment_type && <span style={{ background: 'rgba(240,165,0,0.1)', border: '1px solid rgba(240,165,0,0.3)', padding: '1px 7px', borderRadius: 10, fontSize: 9, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>✓ {p.garment_type}</span>}
        {p.colors.map(c => <span key={c} style={{ background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.3)', padding: '1px 7px', borderRadius: 10, fontSize: 9, color: '#60a5fa', fontFamily: 'var(--mono)' }}>● {c}</span>)}
        {p.pattern && <span style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', padding: '1px 7px', borderRadius: 10, fontSize: 9, color: '#818cf8', fontFamily: 'var(--mono)' }}>{p.pattern}</span>}
        {p.size && <span style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', padding: '1px 7px', borderRadius: 10, fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{p.size}</span>}
        {p.brand && <span style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', padding: '1px 7px', borderRadius: 10, fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{p.brand}</span>}
        {p.quantity > 1 && <span style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', padding: '1px 7px', borderRadius: 10, fontSize: 9, color: 'var(--green)', fontFamily: 'var(--mono)' }}>×{p.quantity}</span>}
      </div>
    )
  })()}
</div>
```

- [ ] **Step 4: Manuel test**

`showForm` açık → hızlı giriş alanı görünüyor mu? "3 mavi gömlek M" yazınca etiketler çıkıyor mu? Enter'a basınca form doldu mu? Adet 3 mü?

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\hrync\OneDrive\Masaüstü\test claude"
git add frontend/src/modules/laundry/components/PremiumGarmentList.jsx
git commit -m "feat: premium kıyafet hızlı metin parse — tip/renk/beden/marka/adet"
```

---

### Task 4: PremiumSearchPanel — Anlık Arama + Desen/Kişi Filtresi + Renk Dotları

**Files:**
- Modify: `frontend/src/modules/laundry/components/PremiumSearchPanel.jsx`

- [ ] **Step 1: Import'ları güncelle**

```js
import { useState, useCallback, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { laundryApi } from '../api.js'
import { ColorPatternDisplay } from './ColorPatternPicker.jsx'
```

- [ ] **Step 2: `filters` state'e `pattern` ve `intake_name` ekle**

```js
const [filters, setFilters] = useState({
  block: '', room_no: '', type: '', brand: '', size: '', color: '', pattern: '', intake_name: '', status: '', from: '', to: '',
})
```

- [ ] **Step 3: `reset` fonksiyonunu güncelle**

```js
const reset = () => {
  setFilters({ block: '', room_no: '', type: '', brand: '', size: '', color: '', pattern: '', intake_name: '', status: '', from: '', to: '' })
  setLostOnly(false)
  setActiveFilters(null)
  setPage(1)
}
```

- [ ] **Step 4: Debounce effect ekle**

`const set = useCallback(...)` satırının hemen altına:

```js
const debounceRef = useRef(null)
useEffect(() => {
  if (debounceRef.current) clearTimeout(debounceRef.current)
  debounceRef.current = setTimeout(() => {
    setPage(1)
    setActiveFilters(lostOnly ? { ...filters, status: 'lost' } : filters)
  }, 400)
  return () => clearTimeout(debounceRef.current)
}, [filters, lostOnly])
```

- [ ] **Step 5: Filtre grid'ine DESEN ve KİŞİ ADI alanları ekle**

Mevcut `FilterRow label="RENK"` bloğunun hemen ardından (GİRİŞ BAŞL. öncesi):

```jsx
<FilterRow label="DESEN">
  <select style={SELECT_STYLE} value={filters.pattern} onChange={e => set('pattern', e.target.value)}>
    <option value="">Tümü</option>
    <option value="Çizgili">Çizgili</option>
    <option value="Kareli">Kareli</option>
    <option value="Desenli">Desenli</option>
    <option value="Renkli">Renkli</option>
  </select>
</FilterRow>
<FilterRow label="KİŞİ ADI">
  <input style={INPUT_STYLE} value={filters.intake_name} onChange={e => set('intake_name', e.target.value)} placeholder="Teslim eden..." />
</FilterRow>
```

- [ ] **Step 6: `laundryApi.searchPremiumGarments` çağrısını güncelle**

`search` fonksiyonunu güncelle:

```js
const search = () => {
  setPage(1)
  setActiveFilters(lostOnly ? { ...filters, status: 'lost' } : filters)
}
```

`useQuery`'nin `queryFn`'ini güncelle — `pattern` ve `intake_name` zaten `activeFilters` içinde geçer, ayrıca API'a geçirmek için `activeFilters` doğrudan parametre olarak kullanılıyor. `laundryApi.searchPremiumGarments({ ...activeFilters, page })` zaten tüm alanları gönderir — değişiklik yok.

- [ ] **Step 7: Sonuç satırında renk dotları + desen badge + intake_name göster**

Mevcut `{/* Type + brand */}` span'ını şu şekilde değiştir:

```jsx
{/* Type + brand + renk + desen */}
<span style={{ flex: 1, fontSize: 10, color: 'var(--text)', fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
  <span style={{ flexShrink: 0 }}>
    {g.garment_type}
    {g.brand ? ` · ${g.brand}` : ''}
    {g.model ? ` ${g.model}` : ''}
    {g.size ? ` · ${g.size}` : ''}
  </span>
  {(g.color || g.pattern) && (
    <ColorPatternDisplay color={g.color} pattern={g.pattern} />
  )}
</span>

{/* intake_name */}
{g.intake_name && (
  <span style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', flexShrink: 0, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
    {g.intake_name}
  </span>
)}
```

- [ ] **Step 8: Backend testlerini çalıştır**

```bash
cd backend && npx vitest run
```
Expected: 225+ test PASS

- [ ] **Step 9: Manuel test**

Filtre değiştirince otomatik arama oluyor mu (400ms sonra)? Desen seçince sonuçlar filtrele: deniyor mu? Renk dotları görünüyor mu?

- [ ] **Step 10: Commit**

```bash
cd "C:\Users\hrync\OneDrive\Masaüstü\test claude"
git add frontend/src/modules/laundry/components/PremiumSearchPanel.jsx
git commit -m "feat: premium arama — anlık filtre, desen/kişi alanı, renk dotları"
```
