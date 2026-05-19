# Dashboard Global Tarih Aralığı Filtresi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dashboard'a URL tabanlı global tarih aralığı filtresi ekle — Trends + Audit widget'larını etkiler, diğerleri dokunulmaz, backend hiç değişmez.

**Architecture:** `useDateRange` custom hook URL query params'tan okur/yazar (`?range=7|30|90|custom&from=…&to=…`). `DateRangeFilter` bileşeni header'a yerleşir. `DashboardPage` hook'u çağırıp `days` prop'unu `TrendChartsSection`'a, `{from,to}` prop'unu `AuditLogPanel`'e geçirir. Test stratejisi: pure helper'lar (parseRange, computeRange) vitest ile unit test; bileşenler manuel smoke test (frontend'de RTL/jsdom kurulu değil — proje konvansiyonu pure-logic test).

**Tech Stack:** React 18, react-router-dom v6 (`useSearchParams`), vitest, @tanstack/react-query

**Spec:** [`docs/superpowers/specs/2026-05-19-dashboard-date-range-design.md`](../specs/2026-05-19-dashboard-date-range-design.md)

---

## File Structure

**Create:**
- `frontend/src/modules/dashboard/dateRange.js` — pure helpers (parseRange, computeRange) — test edilebilir
- `frontend/src/modules/dashboard/dateRange.test.js` — pure helper testleri
- `frontend/src/modules/dashboard/useDateRange.js` — hook (URL bağlama + helper kullanımı)
- `frontend/src/modules/dashboard/DateRangeFilter.jsx` — chip butonları + özel panel

**Modify:**
- `frontend/src/modules/dashboard/TrendChartsSection.jsx` — lokal `useState`/chip'leri kaldır, `days` prop'u kabul et
- `frontend/src/modules/dashboard/DashboardPage.jsx` — `useDateRange()` çağır, `<DateRangeFilter/>` yerleştir, `TrendChartsSection` ve `AuditLogPanel`'e prop geç, `AuditLogPanel` içindeki lokal date input'larını kaldır

---

### Task 1: Pure helpers — `dateRange.js`

**Files:**
- Create: `frontend/src/modules/dashboard/dateRange.js`
- Create: `frontend/src/modules/dashboard/dateRange.test.js`

- [ ] **Step 1: Test dosyasını yaz**

```js
// frontend/src/modules/dashboard/dateRange.test.js
import { describe, it, expect } from 'vitest'
import { parseRange, computeRange, PRESET_LABELS, MAX_DAYS } from './dateRange.js'

describe('parseRange', () => {
  it('parametre yoksa default 30', () => {
    expect(parseRange(null, null, null)).toEqual({ range: '30', from: null, to: null, isCustom: false })
  })

  it('geçersiz range default 30 fallback', () => {
    expect(parseRange('foo', null, null)).toEqual({ range: '30', from: null, to: null, isCustom: false })
  })

  it('preset 7/30/90 olduğu gibi', () => {
    expect(parseRange('7', null, null).range).toBe('7')
    expect(parseRange('90', null, null).range).toBe('90')
  })

  it('custom + from + to → isCustom true', () => {
    const r = parseRange('custom', '2026-04-01', '2026-04-30')
    expect(r).toEqual({ range: 'custom', from: '2026-04-01', to: '2026-04-30', isCustom: true })
  })

  it('custom ama from eksik → default 30', () => {
    expect(parseRange('custom', null, '2026-04-30').isCustom).toBe(false)
    expect(parseRange('custom', null, '2026-04-30').range).toBe('30')
  })

  it('custom ama to<from → default 30', () => {
    expect(parseRange('custom', '2026-05-01', '2026-04-30').isCustom).toBe(false)
  })
})

describe('computeRange', () => {
  const fixedNow = new Date('2026-05-19T12:00:00Z').getTime()

  it('preset 7 → days=7, to=today, from=today-6', () => {
    const r = computeRange({ range: '7', from: null, to: null, isCustom: false }, fixedNow)
    expect(r.days).toBe(7)
    expect(r.to).toBe('2026-05-19')
    expect(r.from).toBe('2026-05-13')
    expect(r.label).toBe('SON 7 GÜN')
  })

  it('preset 30 → days=30', () => {
    const r = computeRange({ range: '30', from: null, to: null, isCustom: false }, fixedNow)
    expect(r.days).toBe(30)
    expect(r.label).toBe('SON 30 GÜN')
  })

  it('custom 1-30 Nisan → days=30, from/to korunur, label tarih aralığı', () => {
    const r = computeRange({ range: 'custom', from: '2026-04-01', to: '2026-04-30', isCustom: true }, fixedNow)
    expect(r.days).toBe(30)
    expect(r.from).toBe('2026-04-01')
    expect(r.to).toBe('2026-04-30')
    expect(r.label).toBe('2026-04-01 → 2026-04-30')
  })

  it('custom aynı gün → days=1', () => {
    const r = computeRange({ range: 'custom', from: '2026-05-10', to: '2026-05-10', isCustom: true }, fixedNow)
    expect(r.days).toBe(1)
  })

  it('custom >90 gün → days=90 clamp', () => {
    const r = computeRange({ range: 'custom', from: '2026-01-01', to: '2026-05-01', isCustom: true }, fixedNow)
    expect(r.days).toBe(MAX_DAYS)
  })
})

describe('PRESET_LABELS', () => {
  it('7/30/90 anahtarları var', () => {
    expect(PRESET_LABELS['7']).toBe('SON 7 GÜN')
    expect(PRESET_LABELS['30']).toBe('SON 30 GÜN')
    expect(PRESET_LABELS['90']).toBe('SON 90 GÜN')
  })
})
```

- [ ] **Step 2: Testi çalıştır — fail beklenir**

```bash
cd frontend && npx vitest run src/modules/dashboard/dateRange.test.js
```

Beklenen: `Cannot find module './dateRange.js'` (dosya yok)

> **Not**: frontend'de vitest devDep değil ama backend'in vitest binary'sine npx ile erişiyor. Çalışmazsa `npx --prefix ../backend vitest run frontend/src/modules/dashboard/dateRange.test.js` dene.

- [ ] **Step 3: Helper'ları yaz**

```js
// frontend/src/modules/dashboard/dateRange.js

export const PRESET_LABELS = { '7': 'SON 7 GÜN', '30': 'SON 30 GÜN', '90': 'SON 90 GÜN' }
export const MAX_DAYS = 90
const DEFAULT_RANGE = '30'

const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10)

export function parseRange(rawRange, rawFrom, rawTo) {
  if (rawRange === 'custom') {
    if (rawFrom && rawTo && rawFrom <= rawTo) {
      return { range: 'custom', from: rawFrom, to: rawTo, isCustom: true }
    }
    return { range: DEFAULT_RANGE, from: null, to: null, isCustom: false }
  }
  if (PRESET_LABELS[rawRange]) {
    return { range: rawRange, from: null, to: null, isCustom: false }
  }
  return { range: DEFAULT_RANGE, from: null, to: null, isCustom: false }
}

export function computeRange(parsed, nowMs = Date.now()) {
  if (parsed.isCustom) {
    const diffDays = Math.ceil((new Date(parsed.to) - new Date(parsed.from)) / 86400000) + 1
    const days = Math.max(1, Math.min(MAX_DAYS, diffDays))
    return {
      range: 'custom',
      isCustom: true,
      from: parsed.from,
      to: parsed.to,
      days,
      label: `${parsed.from} → ${parsed.to}`,
    }
  }
  const days = Number(parsed.range)
  const to = isoDate(nowMs)
  const from = isoDate(nowMs - (days - 1) * 86400000)
  return {
    range: parsed.range,
    isCustom: false,
    from,
    to,
    days,
    label: PRESET_LABELS[parsed.range],
  }
}
```

- [ ] **Step 4: Testi çalıştır — pass beklenir**

```bash
cd frontend && npx vitest run src/modules/dashboard/dateRange.test.js
```

Beklenen: tüm testler PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/dashboard/dateRange.js frontend/src/modules/dashboard/dateRange.test.js
git commit -m "feat(dashboard): dateRange pure helpers + 11 test"
```

---

### Task 2: `useDateRange` hook

**Files:**
- Create: `frontend/src/modules/dashboard/useDateRange.js`

- [ ] **Step 1: Hook'u yaz**

```js
// frontend/src/modules/dashboard/useDateRange.js
import { useSearchParams } from 'react-router-dom'
import { parseRange, computeRange } from './dateRange.js'

export function useDateRange() {
  const [params, setParams] = useSearchParams()

  const parsed = parseRange(params.get('range'), params.get('from'), params.get('to'))
  const computed = computeRange(parsed)

  const setRange = (r) => setParams((p) => {
    p.set('range', String(r))
    p.delete('from')
    p.delete('to')
    return p
  }, { replace: true })

  const setCustom = (f, t) => setParams((p) => {
    p.set('range', 'custom')
    p.set('from', f)
    p.set('to', t)
    return p
  }, { replace: true })

  return { ...computed, setRange, setCustom }
}
```

- [ ] **Step 2: Syntax/import doğrulama**

```bash
cd frontend && node --check src/modules/dashboard/useDateRange.js
```

Beklenen: hata yok.

> Hook'un kendisi RTL gerektirir (URL state değişimini render içinde testlemek için). Frontend'de RTL kurulu değil. Hook çok ince bir wrapper olduğu için pure helper testleri (Task 1) yeterli kabul edilir; hook'un URL bağlama davranışı Task 6 manuel smoke test ile doğrulanır.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/modules/dashboard/useDateRange.js
git commit -m "feat(dashboard): useDateRange hook — URL params bağlama"
```

---

### Task 3: `DateRangeFilter` bileşeni

**Files:**
- Create: `frontend/src/modules/dashboard/DateRangeFilter.jsx`

- [ ] **Step 1: Bileşeni yaz**

```jsx
// frontend/src/modules/dashboard/DateRangeFilter.jsx
import { useState, useRef, useEffect } from 'react'
import { useDateRange } from './useDateRange.js'
import { MAX_DAYS } from './dateRange.js'

const PRESETS = ['7', '30', '90']

export default function DateRangeFilter() {
  const { range, isCustom, label, setRange, setCustom } = useDateRange()
  const [open, setOpen] = useState(false)
  const [fromInput, setFromInput] = useState('')
  const [toInput, setToInput] = useState('')
  const wrapperRef = useRef(null)

  useEffect(() => {
    function onDocClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const validation = (() => {
    if (!fromInput || !toInput) return { ok: false, msg: 'İki tarih de gerekli' }
    if (fromInput > toInput) return { ok: false, msg: 'Bitiş başlangıçtan önce olamaz' }
    const days = Math.ceil((new Date(toInput) - new Date(fromInput)) / 86400000) + 1
    if (days > MAX_DAYS) return { ok: false, msg: `Maksimum ${MAX_DAYS} gün` }
    return { ok: true, msg: '' }
  })()

  const apply = () => {
    if (!validation.ok) return
    setCustom(fromInput, toInput)
    setOpen(false)
  }

  const chipStyle = (active) => ({
    padding: '5px 12px',
    borderRadius: '6px',
    border: '1px solid var(--border)',
    background: active ? 'var(--accent)' : 'var(--surface2)',
    color: active ? 'var(--bg)' : 'var(--text2)',
    fontFamily: 'var(--mono)',
    fontSize: '10px',
    letterSpacing: '1px',
    cursor: 'pointer',
  })

  return (
    <div ref={wrapperRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '4px' }}>
      {PRESETS.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => setRange(p)}
          style={chipStyle(!isCustom && range === p)}
          aria-label={`Son ${p} gün`}
        >
          {p}G
        </button>
      ))}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={chipStyle(isCustom)}
        aria-label="Özel aralık"
      >
        {isCustom ? label : 'ÖZEL ▾'}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px',
          padding: '12px', minWidth: '260px', zIndex: 100,
          boxShadow: '0 8px 24px rgba(0,0,0,.3)',
          display: 'flex', flexDirection: 'column', gap: '8px',
        }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1.5px' }}>
            ÖZEL ARALIK
          </div>
          <input
            type="date"
            className="form-input"
            value={fromInput}
            max={toInput || undefined}
            onChange={(e) => setFromInput(e.target.value)}
            style={{ fontSize: '12px' }}
          />
          <input
            type="date"
            className="form-input"
            value={toInput}
            min={fromInput || undefined}
            onChange={(e) => setToInput(e.target.value)}
            style={{ fontSize: '12px' }}
          />
          {!validation.ok && (fromInput || toInput) && (
            <div style={{ fontSize: '10px', color: 'var(--red)', fontFamily: 'var(--mono)' }}>
              {validation.msg}
            </div>
          )}
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setOpen(false)}>
              İPTAL
            </button>
            <button type="button" className="btn btn-primary btn-xs" onClick={apply} disabled={!validation.ok}>
              UYGULA
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Build doğrulama**

```bash
cd frontend && npm run build 2>&1 | tail -20
```

Beklenen: build başarılı, syntax hatası yok.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/modules/dashboard/DateRangeFilter.jsx
git commit -m "feat(dashboard): DateRangeFilter — 7/30/90/Özel chip filtre"
```

---

### Task 4: `TrendChartsSection` — lokal state'i kaldır, `days` prop'u kabul et

**Files:**
- Modify: `frontend/src/modules/dashboard/TrendChartsSection.jsx`

- [ ] **Step 1: Mevcut bileşeni oku**

```bash
cat frontend/src/modules/dashboard/TrendChartsSection.jsx
```

Hatırlatma: Şu an `useState(30)` + `DAYS_OPTIONS` chip group header'da. Bunlar kalkacak.

- [ ] **Step 2: Bileşeni güncelle — `days` prop'u ekle, lokal chip'leri kaldır**

`TrendChartsSection.jsx`'in başını şuna çevir:

```jsx
import { useQuery } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import TrendCard from './TrendCard.jsx'

const METRICS = ['occupancy', 'sla', 'housekeeping', 'checkins']

export default function TrendChartsSection({ days = 30, label }) {
  const { data, isLoading } = useQuery({
    queryKey: ['trends', days],
    queryFn: () => api.get(`/dashboard/trends?days=${days}`).then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

  return (
    <div className="fade-up" style={{ marginTop: '24px' }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <div style={{ fontFamily: 'var(--display)', fontSize: '13px', letterSpacing: '3px', color: 'var(--text)' }}>
            TREND GRAFİKLERİ
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '2px' }}>
            MODÜL BAZLI PERFORMANS TRENDİ
          </div>
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1.5px' }}>
          {label || `SON ${days} GÜN`}
        </div>
      </div>

      {/* … bileşenin geri kalanı (grid, TrendCard map) aynen kalır */}
```

> Mevcut bileşenin geri kalan kısmı (grafik grid'i, TrendCard döngüsü, loading durumu) **aynen korunur**. Sadece:
> 1. `import { useState } from 'react'` satırı silinir
> 2. `DAYS_OPTIONS` sabitinin tamamı silinir
> 3. `const [days, setDays] = useState(30)` satırı silinir
> 4. Header'daki `<div>` chip grubu (DAYS_OPTIONS.map) silinir → yerine yukarıdaki readonly label `<div>` gelir
> 5. Bileşen prop alır: `({ days = 30, label })`

- [ ] **Step 3: Build doğrulama**

```bash
cd frontend && npm run build 2>&1 | tail -20
```

Beklenen: build başarılı.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/modules/dashboard/TrendChartsSection.jsx
git commit -m "refactor(dashboard): TrendChartsSection lokal toggle kaldır, days prop'u kabul et"
```

---

### Task 5: `DashboardPage` entegrasyonu — hook, filter yerleşimi, AuditLogPanel refactor

**Files:**
- Modify: `frontend/src/modules/dashboard/DashboardPage.jsx`

#### Step 5.1: Import + hook çağrısı

- [ ] **Adım:** Dosyanın başına import ekle ve `useDateRange` çağrısını `DashboardPage` fonksiyonu içinde ekle.

`DashboardPage.jsx`'te şu importları ekle (mevcut import'ların sonuna):

```jsx
import DateRangeFilter from './DateRangeFilter.jsx'
import { useDateRange } from './useDateRange.js'
```

`DashboardPage` fonksiyonunun içinde, `const isManager = …` satırının altına ekle:

```jsx
const { days, from: globalFrom, to: globalTo, label: rangeLabel } = useDateRange()
```

#### Step 5.2: `<DateRangeFilter />` yerleştirme

- [ ] **Adım:** Header'daki `<ExportButtons />` çağrısının yanına ekle.

DashboardPage.jsx'te mevcut header bölümü:

```jsx
<div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
  {isManager && <ExportButtons />}
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <div className="live-dot" />
    <span style={{ … }}>CANLI</span>
  </div>
</div>
```

Şuna çevir:

```jsx
<div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
  <DateRangeFilter />
  {isManager && <ExportButtons />}
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <div className="live-dot" />
    <span style={{ … }}>CANLI</span>
  </div>
</div>
```

#### Step 5.3: `TrendChartsSection`'a `days` ve `label` prop'larını geçir

- [ ] **Adım:** Bento grid içinde mevcut çağrı:

```jsx
<div className="bento-cell bento-span-8">
  <TrendChartsSection />
</div>
```

Şuna çevir:

```jsx
<div className="bento-cell bento-span-8">
  <TrendChartsSection days={days} label={rangeLabel} />
</div>
```

#### Step 5.4: `AuditLogPanel`'i `globalFrom`/`globalTo` prop'larıyla çağır

- [ ] **Adım:** `<AuditLogPanel />` çağrısı:

```jsx
<AuditLogPanel />
```

Şuna çevir:

```jsx
<AuditLogPanel globalFrom={globalFrom} globalTo={globalTo} />
```

#### Step 5.5: `AuditLogPanel` fonksiyonunu refactor et — lokal date input'larını kaldır

- [ ] **Adım:** Aynı dosyada (`DashboardPage.jsx`) `function AuditLogPanel()` tanımı var. Şu değişiklikleri yap:

**Önce — fonksiyon imzası:**

```jsx
function AuditLogPanel() {
  const [auditSearch, setAuditSearch] = useState('')
  const [auditModule, setAuditModule] = useState('')
  const [auditDateFrom, setAuditDateFrom] = useState('')
  const [auditDateTo, setAuditDateTo] = useState('')
  const [auditLimit, setAuditLimit] = useState(30)
```

**Sonra:**

```jsx
function AuditLogPanel({ globalFrom, globalTo }) {
  const [auditSearch, setAuditSearch] = useState('')
  const [auditModule, setAuditModule] = useState('')
  const [auditLimit, setAuditLimit] = useState(30)
```

**`auditParams` blokunu güncelle:**

```jsx
const auditParams = new URLSearchParams()
auditParams.set('limit', auditLimit)
if (auditSearch) auditParams.set('search', auditSearch)
if (auditModule) auditParams.set('module', auditModule)
if (auditDateFrom) auditParams.set('date_from', auditDateFrom)
if (auditDateTo) auditParams.set('date_to', auditDateTo)
```

Şuna çevir:

```jsx
const auditParams = new URLSearchParams()
auditParams.set('limit', auditLimit)
if (auditSearch) auditParams.set('search', auditSearch)
if (auditModule) auditParams.set('module', auditModule)
if (globalFrom) auditParams.set('date_from', globalFrom)
if (globalTo) auditParams.set('date_to', globalTo)
```

**`useQuery` queryKey'i güncelle:**

```jsx
queryKey: ['audit-log', auditSearch, auditModule, auditDateFrom, auditDateTo, auditLimit],
```

Şuna çevir:

```jsx
queryKey: ['audit-log', auditSearch, auditModule, globalFrom, globalTo, auditLimit],
```

**Filter UI bölümünden iki `<input type="date">` ve aralarındaki `<span>—</span>`'yi kaldır:**

Bu blok tamamen silinir:

```jsx
<input type="date" className="form-input" value={auditDateFrom} onChange={e => setAuditDateFrom(e.target.value)}
  style={{ fontSize: '10px', padding: '4px 6px', width: 'auto' }} />
<span style={{ fontSize: '10px', color: 'var(--text3)' }}>—</span>
<input type="date" className="form-input" value={auditDateTo} onChange={e => setAuditDateTo(e.target.value)}
  style={{ fontSize: '10px', padding: '4px 6px', width: 'auto' }} />
```

**TEMİZLE butonunun koşulunu güncelle:**

```jsx
{(auditSearch || auditModule || auditDateFrom || auditDateTo) && (
  <button … onClick={() => { setAuditSearch(''); setAuditModule(''); setAuditDateFrom(''); setAuditDateTo('') }}>
    TEMİZLE
  </button>
)}
```

Şuna çevir:

```jsx
{(auditSearch || auditModule) && (
  <button className="btn btn-ghost btn-xs" style={{ fontSize: '9px' }}
    onClick={() => { setAuditSearch(''); setAuditModule('') }}>TEMİZLE</button>
)}
```

#### Step 5.6: Build doğrulama

- [ ] **Adım:**

```bash
cd frontend && npm run build 2>&1 | tail -20
```

Beklenen: build başarılı, hiçbir hata/warning yok.

#### Step 5.7: Commit

- [ ] **Adım:**

```bash
git add frontend/src/modules/dashboard/DashboardPage.jsx
git commit -m "feat(dashboard): global tarih filtresi entegrasyonu — Trends + Audit"
```

---

### Task 6: Manuel smoke test

**Files:** —

- [ ] **Step 1: Dev server'ı başlat**

```bash
npm run dev
```

Backend (3001) ve frontend (5174) ayağa kalkmalı.

- [ ] **Step 2: Tarayıcıda dashboard'u aç ve aşağıdaki senaryoları doğrula**

`http://localhost:5174/` → giriş yap (mudur/admin123) → dashboard.

Her senaryo için **DevTools Network sekmesi açık** olmalı:

| Senaryo | Beklenen |
|---------|----------|
| Dashboard ilk açılış (param yok) | URL'ye `?range=30` eklenmez, header'da "30G" chip aktif, Trends'te "SON 30 GÜN" label, Audit son 30 gün sorgulanır (date_from query'i 30 gün önce) |
| "7G" chip tıkla | URL `?range=7` olur, Trends `?days=7`, Audit `date_from=<7 gün önce>` |
| "90G" chip tıkla | URL `?range=90`, Trends `?days=90` |
| "ÖZEL" tıkla → 1 Nisan / 30 Nisan / UYGULA | URL `?range=custom&from=2026-04-01&to=2026-04-30`, Trends `?days=30` (sliding window!), Audit `date_from=2026-04-01&date_to=2026-04-30`, chip label `"2026-04-01 → 2026-04-30"` |
| Custom panel, 1 Ocak / 1 Mayıs (>90 gün) | UYGULA disabled, kırmızı "Maksimum 90 gün" uyarısı |
| Custom panel, from > to | UYGULA disabled, "Bitiş başlangıçtan önce olamaz" uyarısı |
| URL'i `?range=custom&from=2026-04-01&to=2026-04-30` ile direkt aç | Sayfa direkt o aralıkla açılır, ÖZEL chip aktif, doğru tarih label'ı |
| URL'i `?range=foo` ile aç | Fallback 30g, "30G" aktif |
| URL'i `?range=custom&from=2026-05-20&to=2026-05-10` ile aç (ters) | Fallback 30g |
| F5 (refresh) | URL'deki range korunur, aynı veri görünür |
| Audit'in lokal arama/modül filtreleri çalışıyor mu | Evet, sadece tarih input'ları kalkmış olmalı |
| "Aktif Arızalar", "TodaysPulse", "UpcomingEvents", "HealthScore", "AnomalyAlerts" widget'larının görüntüsü değişti mi | Hayır, hiç değişmemiş olmalı |

- [ ] **Step 3: Console temizliği**

DevTools Console'da React warning / error olmamalı.

- [ ] **Step 4: Smoke notu ekle**

Tüm senaryolar geçtiyse, son commit'in mesajına smoke onayını ekleyen küçük bir commit at:

```bash
git commit --allow-empty -m "test(dashboard): tarih filtresi manuel smoke geçti — 12 senaryo"
```

---

## Self-Review

**Spec coverage:**
- ✅ URL şeması (?range=…&from=…&to=…) — Task 1+2 (parseRange + hook)
- ✅ 30g varsayılan + geçersiz fallback — Task 1 testleri
- ✅ Preset chip'leri 7/30/90 — Task 3
- ✅ Özel aralık panel + validation (from>to, >90g, eksik alan) — Task 3
- ✅ useDateRange hook (URL bağlama) — Task 2
- ✅ DateRangeFilter bileşeni header yerleşimi — Task 5.2
- ✅ TrendChartsSection lokal toggle kaldırma + `days` prop — Task 4
- ✅ TrendChartsSection sliding window label ("SON N GÜN") — Task 4
- ✅ AuditLogPanel lokal date input kaldırma + global prop — Task 5.5
- ✅ Backend dokunulmadı — hiçbir backend dosyası listede yok ✓
- ✅ Manuel smoke test (12 senaryo) — Task 6

**Placeholder scan:** Hiç TBD/TODO/"benzer" yok. Tüm kod blokları tam.

**Type/isim tutarlılığı:**
- `parseRange` → `{ range, from, to, isCustom }` döner ✓
- `computeRange` → `{ range, isCustom, from, to, days, label }` döner ✓
- `useDateRange` → `{ ...computed, setRange, setCustom }` döner ✓
- `DateRangeFilter` prop yok, hook'tan okur ✓
- `TrendChartsSection` props: `{ days, label }` ✓
- `AuditLogPanel` props: `{ globalFrom, globalTo }` ✓
- `MAX_DAYS = 90` Task 1'de export, Task 3'te import ✓

---

## Execution Notes

- Tahmini süre: 60-90 dakika
- TDD sırası korundu: Task 1 testleri önce yazılıp fail görür, sonra implementation
- Frontend test ekosistemi pure-logic ile sınırlı (RTL/jsdom yok) — bilinçli tradeoff, manuel smoke test ile kapatıldı
- Backend testleri **çalıştırılmıyor** çünkü backend değişmedi (CLAUDE.md kuralı: "backend dosyasi degistiyse vitest gecmeli" → backend dokunulmadı)
