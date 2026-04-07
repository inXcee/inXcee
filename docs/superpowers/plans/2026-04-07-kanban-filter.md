# Kanban Kart Filtresi (F5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LaundryHub kanban görünümüne blok dropdown + acil toggle filtresi ekle; filtreler mevcut toolbar'a yerleşir ve oturumda kalıcıdır.

**Architecture:** `LaundryHub.jsx`'e iki yeni state (`filterBlock`, `filterUrgent`) eklenecek; mevcut `kanbanItems` useMemo türetme zinciri bu state'lerle genişletilecek; toolbar'daki search inputunun hemen sağına blok `<select>` ve acil `<button>` toggle yerleştirilecek. Yalnızca `LaundryHub.jsx` değişiyor.

**Tech Stack:** React 18, useState, useMemo — ek kütüphane yok.

---

## Dosya Yapısı

- Modify: `frontend/src/modules/laundry/LaundryHub.jsx`
  - State ekleme: `filterBlock`, `filterUrgent` (satır ~1183)
  - kanbanItems useMemo güncelleme (satır ~1314-1323)
  - Toolbar UI ekleme (satır ~1553-1560 arası, search inputundan sonra)

---

### Task 1: filterBlock ve filterUrgent state'leri + kanbanItems filtre zinciri

**Files:**
- Modify: `frontend/src/modules/laundry/LaundryHub.jsx`

Bu task front-end only, backend değişikliği yok. Vitest'te test edilecek mantık yok (UI state), ancak mevcut testlerin kırılmadığını doğrulamalısın.

- [ ] **Step 1: State'leri ekle**

`frontend/src/modules/laundry/LaundryHub.jsx` dosyasını aç. Satır 1182'deki `const [showScanModal, setShowScanModal] = useState(false)` satırının hemen altına şunu ekle:

```js
  const [filterBlock,  setFilterBlock]  = useState('all')  // 'all' | 'A' | 'B' | 'S2'
  const [filterUrgent, setFilterUrgent] = useState(false)
```

- [ ] **Step 2: kanbanItems useMemo'yu güncelle**

Satır ~1314'teki `const kanbanItems = useMemo(...)` bloğunu bul. Mevcut hali:

```js
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
```

Şu hale getir:

```js
  const kanbanItems = useMemo(() => {
    let list = allItems
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(i =>
        `${i.block} ${i.room_no} ${i.notes || ''} ${i.occupant_name || ''}`.toLowerCase().includes(q)
      )
    }
    if (filterBlock !== 'all') {
      list = list.filter(i => i.block === filterBlock)
    }
    if (filterUrgent) {
      list = list.filter(i => i.urgent === 1)
    }
    return list
  }, [allItems, search, filterBlock, filterUrgent])
```

- [ ] **Step 3: Backend testlerini çalıştır — kırılmadığını doğrula**

```bash
cd backend && npx vitest run
```

Beklenen: tüm testler PASS (233+ test). Hata varsa bu task'ın değişiklikleriyle ilgili değil, durumu not et.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/modules/laundry/LaundryHub.jsx
git commit -m "feat: filterBlock + filterUrgent state + kanbanItems filtre zinciri"
```

---

### Task 2: Toolbar'a blok dropdown + acil toggle ekle

**Files:**
- Modify: `frontend/src/modules/laundry/LaundryHub.jsx`

- [ ] **Step 1: Toolbar'daki search inputunu bul**

Satır ~1553'teki toolbar bölümünü bul. Search `<input>` şuna benzer:

```jsx
        <input
          className="form-input"
          style={{ width: 200, padding: '6px 11px', fontSize: 11 }}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Ara (oda, kişi, not)…"
        />
```

- [ ] **Step 2: Search inputundan hemen sonra blok dropdown + acil toggle ekle**

`<input ... />` ile sonraki `<div style={{ display: 'flex', gap: 4, flex: 1...` arasına şu iki elementi ekle:

```jsx
        {/* Blok filtresi */}
        <select
          value={filterBlock}
          onChange={e => setFilterBlock(e.target.value)}
          className="form-input"
          style={{ width: 110, padding: '6px 8px', fontSize: 11, cursor: 'pointer' }}
        >
          <option value="all">Tüm Bloklar</option>
          <option value="A">A Blok</option>
          <option value="B">B Blok</option>
          <option value="S2">S2</option>
        </select>

        {/* Acil toggle */}
        <button
          onClick={() => setFilterUrgent(v => !v)}
          className="btn btn-ghost btn-xs"
          style={{
            border: `1px solid ${filterUrgent ? 'rgba(231,76,60,0.6)' : 'var(--border)'}`,
            background: filterUrgent ? 'rgba(231,76,60,0.12)' : 'transparent',
            color: filterUrgent ? 'var(--red)' : 'var(--text3)',
            fontWeight: filterUrgent ? 700 : 400,
          }}
        >
          ⚠ Acil
        </button>

        {/* Aktif filtre badge */}
        {(filterBlock !== 'all' || filterUrgent) && (
          <span style={{
            fontSize: 9, fontFamily: 'var(--mono)', letterSpacing: 1,
            color: 'var(--accent)', textTransform: 'uppercase', opacity: 0.8,
            alignSelf: 'center',
          }}>
            Filtre aktif
          </span>
        )}
```

- [ ] **Step 3: Dev server'da manuel doğrula**

`npm run dev` ile uygulamayı başlat (zaten çalışıyorsa tarayıcıyı yenile). `http://localhost:5174/laundry` adresine git.

Kontrol listesi:
- [ ] Toolbar'da "Tüm Bloklar" dropdown görünüyor
- [ ] "A Blok" seçince kanban sütunlarında sadece A bloğu kayıtları kalıyor
- [ ] "⚠ Acil" butonuna basınca kırmızı renk alıyor ve sadece acil kayıtlar kalıyor
- [ ] İkisi birlikte çalışıyor (A Blok + Acil)
- [ ] Filtre aktifken "Filtre aktif" yazısı görünüyor
- [ ] Filtre sıfırlandığında yazı kayboluyor
- [ ] Kanban view değil liste view'da filtreler görünmüyor — **DİKKAT:** Bu toolbar her iki view'da da gösteriliyor. Blok/acil filtrenin kanban view'da anlam ifade ettiğini kontrol et; liste view'da da gösteriliyor olması OK, `listItems` sorgusu zaten backend'e parametreli gidiyor ancak filterBlock/filterUrgent listItems'e uygulanmıyor — bu kasıtlı, sadece kanbanItems etkiliyor.

- [ ] **Step 4: Backend testlerini çalıştır**

```bash
cd backend && npx vitest run
```

Beklenen: tüm testler PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/laundry/LaundryHub.jsx
git commit -m "feat: kanban blok dropdown + acil toggle filtresi"
```

---

### Task 3: Boş sütun mesajını güncelle

**Files:**
- Modify: `frontend/src/modules/laundry/LaundryHub.jsx`

`KanbanCol` (`LaundryHub.jsx` satır ~536) `items` prop'unu alır. Boş durum satır ~662'de hardcode `"boş"` gösteriyor. `emptyLabel` prop'u ekleyip LaundryHub'dan iletiyoruz.

- [ ] **Step 1: KanbanCol imzasına emptyLabel prop'u ekle**

Satır 536'daki `function KanbanCol(...)` imzasını bul:

```jsx
function KanbanCol({ title, color, items, colStatus, isOver, machines, onDeliver, onDamage, onPersonClick, onFound, groupByRoom, batchMode, selectedIds, onSelect, onSelectBlock }) {
```

Şu hale getir:

```jsx
function KanbanCol({ title, color, items, colStatus, isOver, machines, onDeliver, onDamage, onPersonClick, onFound, groupByRoom, batchMode, selectedIds, onSelect, onSelectBlock, emptyLabel = 'boş' }) {
```

- [ ] **Step 2: Boş durum mesajını emptyLabel kullan**

Satır ~662'deki hardcode `boş` stringini değiştir:

```jsx
        {items.length === 0 ? (
          <div style={{ padding: '28px 0', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)' }}>
            boş
          </div>
        ) : renderItems()}
```

Şu hale getir:

```jsx
        {items.length === 0 ? (
          <div style={{ padding: '28px 0', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)' }}>
            {emptyLabel}
          </div>
        ) : renderItems()}
```

- [ ] **Step 3: LaundryHub'daki KanbanCol çağrılarına emptyLabel geç**

`LaundryHub.jsx` içinde `<KanbanCol` kullanılan satırları bul (view === 'kanban' bölümünde 4 sütun için). Her birinde `emptyLabel` prop'unu ekle:

```jsx
emptyLabel={(filterBlock !== 'all' || filterUrgent) ? 'filtre sonucu boş' : 'boş'}
```

Tüm 4 `<KanbanCol` çağrısına (dirty, washing, ironing, ready) bu prop'u ekle.

- [ ] **Step 4: Doğrula**

Dev server'da: "A Blok" seç, hiç A Blok kaydı olmayan sütunlar `"filtre sonucu boş"` göstermeli. Filtre sıfırlandığında yeniden `"boş"` göstermeli.

- [ ] **Step 5: Backend testlerini çalıştır**

```bash
cd backend && npx vitest run
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/modules/laundry/LaundryHub.jsx
git commit -m "feat: kanban boş sütun — filtre aktifken özel mesaj"
```
