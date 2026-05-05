# Yeni Blok UI Entegrasyonu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mevcut 11 yeni bloğa A ve C eklemek (toplam 13 yeni blok / 814 oda) ve `CapacityPage` + `HousekeepingPage`'i yeni bir `frontend/src/shared/blocks.js` config dosyası üzerinden tüm 19 bloğu (M / S / Y) destekler hale getirmek.

**Architecture:** Backend'de sadece seed dosyasına 2 satır eklenir — şema/route değişikliği yok. Frontend'de tek bir shared config dosyası (`blocks.js`) tüm blok yapı bilgisini tutar; capacity ve housekeeping sayfaları bu config'in helper'ları ile statik sabitlerden kurtulur. Yeni "Y" tab tipi capacity'deki M/S switcher'ına 3. seçenek olarak eklenir, housekeeping'de aynı switcher 0'dan yapılır.

**Tech Stack:** SQLite (better-sqlite3), Vitest, React 18, Vite, ES modules

**Spec:** `docs/superpowers/specs/2026-05-05-yeni-blok-ui-design.md`

---

## File Structure

| Dosya | Eylem | Sorumluluk |
|-------|-------|------------|
| `backend/src/shared/db/seedProdRooms.js` | Modify | `TWO_FLOOR_BLOCKS` listesine `'A'` ve `'C'` ekle, header yorumu güncelle |
| `backend/src/shared/db/seedProdRooms.test.js` | Modify | 734→814, A1-A4+B testini A/A1-A4/B/C'ye genişlet |
| `frontend/src/shared/blocks.js` | Create | 19 blok için config + helper fonksiyonlar (`expectedRoomNos`, `getCapacity`, `getFloorLabel`, vs.) |
| `frontend/src/shared/blocks.test.js` | Create | Helper'lar için unit testler |
| `frontend/src/index.css` | Modify | `.tag-y` CSS sınıfı ekle |
| `frontend/src/modules/capacity/CapacityPage.jsx` | Modify | M_BLOCKS/S_BLOCKS sabitlerini sil, config import et, Y tab ekle, dinamik kat seçici, placeholder banner, lejant satırı |
| `frontend/src/modules/housekeeping/HousekeepingPage.jsx` | Modify | ALL_BLOCKS sabitini sil, M/S/Y tab switcher ekle (yeni), config kullan, dinamik kat seçici |

---

## Task 1: Seed — A ve C bloklarını ekle (TDD)

**Files:**
- Modify: `backend/src/shared/db/seedProdRooms.js`
- Modify: `backend/src/shared/db/seedProdRooms.test.js`

- [ ] **Step 1: Test dosyasındaki "734" sayısını "814" yap (2 yer)**

`backend/src/shared/db/seedProdRooms.test.js:12-17` (toplam test) ve `:50-56` (idempotent test) bloklarındaki tüm `734` → `814` değiştir. Sonuç:

```js
it('M1-M3 + S1-S3 + yeni 13 blok toplam 814 oda olusturur', () => {
  const stats = seedProdRooms()
  expect(stats.inserted).toBe(814)
  expect(stats.skipped).toBe(0)
  expect(stats.total_in_db).toBe(814)
})

// ...

it('idempotent — ikinci cagrida yeni oda eklenmez', () => {
  seedProdRooms()
  const stats = seedProdRooms()
  expect(stats.inserted).toBe(0)
  expect(stats.skipped).toBe(814)
  expect(stats.total_in_db).toBe(814)
})
```

İlk test'in başlığındaki "yeni 11 blok" → "yeni 13 blok" yap.

- [ ] **Step 2: A1-A4 + B testini A/A1-A4/B/C'ye genişlet**

`backend/src/shared/db/seedProdRooms.test.js:94-103` bloğunu şununla değiştir:

```js
it('A, A1-A4, B, C bloklari her biri 40 oda (2 kat x 20), tumu kapasite 1', () => {
  seedProdRooms()
  const db = getDB()
  for (const block of ['A', 'A1', 'A2', 'A3', 'A4', 'B', 'C']) {
    const count = db.prepare('SELECT COUNT(*) as c FROM rooms WHERE block=?').get(block).c
    expect(count).toBe(40)
    const cap1 = db.prepare("SELECT COUNT(*) as c FROM rooms WHERE block=? AND capacity=1").get(block).c
    expect(cap1).toBe(40)
  }
})
```

- [ ] **Step 3: Testleri çalıştır ve fail ettiklerini doğrula (RED)**

Run:
```bash
cd backend && npx vitest run src/shared/db/seedProdRooms.test.js
```

Expected: En az 3 test FAIL — `expected 814, received 734`, `expected 814, received 734` (idempotent), `expected 40, received 0` (A için).

- [ ] **Step 4: seedProdRooms.js header yorumunu güncelle**

`backend/src/shared/db/seedProdRooms.js:11` satırındaki:
```js
//   A1-A4, B   → 2 kat × 20 oda (101–120, 201–220) × kapasite 1
```
şununla değiştir:
```js
//   A, A1-A4, B, C → 2 kat × 20 oda (101–120, 201–220) × kapasite 1
```

Ve `:16` satırındaki:
```js
// Toplam: 324 (M+S) + 410 (yeni 11 blok) = 734 oda
```
şununla değiştir:
```js
// Toplam: 324 (M+S) + 490 (yeni 13 blok) = 814 oda
```

- [ ] **Step 5: TWO_FLOOR_BLOCKS listesine A ve C ekle**

`backend/src/shared/db/seedProdRooms.js:58` satırındaki:
```js
const TWO_FLOOR_BLOCKS = ['A1', 'A2', 'A3', 'A4', 'B']
```
şununla değiştir:
```js
const TWO_FLOOR_BLOCKS = ['A', 'A1', 'A2', 'A3', 'A4', 'B', 'C']
```

- [ ] **Step 6: Testleri tekrar çalıştır ve PASS olduğunu doğrula (GREEN)**

Run:
```bash
cd backend && npx vitest run src/shared/db/seedProdRooms.test.js
```

Expected: Tüm testler PASS (16 test).

- [ ] **Step 7: Backend tüm test paketini çalıştır (regresyon)**

Run:
```bash
cd backend && npm run test
```

Expected: Tüm paket PASS. Eğer başka bir test 734/410/11 sayısına bağımlıysa fail edebilir — etmemeli; olduysa ilgili teste bak ve 814/490/13'e güncelle.

- [ ] **Step 8: Commit**

Run:
```bash
git add backend/src/shared/db/seedProdRooms.js backend/src/shared/db/seedProdRooms.test.js
git commit -m "feat(seed): A ve C bloklarini ekle (toplam 13 yeni blok / 814 oda)"
```

---

## Task 2: Frontend shared `blocks.js` config + testler (TDD)

**Files:**
- Create: `frontend/src/shared/blocks.js`
- Create: `frontend/src/shared/blocks.test.js`

- [ ] **Step 1: Test dosyasını yaz**

Create `frontend/src/shared/blocks.test.js`:

```js
import { describe, it, expect } from 'vitest'
import {
  BLOCKS,
  BLOCK_BY_NAME,
  BLOCKS_BY_TYPE,
  getBlockConfig,
  expectedRoomNos,
  getCapacity,
  getFloorLabel,
} from './blocks.js'

describe('blocks config', () => {
  it('19 blok tanimli (3 M + 3 S + 13 Y)', () => {
    expect(BLOCKS.length).toBe(19)
    expect(BLOCKS_BY_TYPE.M.length).toBe(3)
    expect(BLOCKS_BY_TYPE.S.length).toBe(3)
    expect(BLOCKS_BY_TYPE.Y.length).toBe(13)
  })

  it('BLOCK_BY_NAME tum bloklara erisim saglar', () => {
    expect(BLOCK_BY_NAME.M1?.type).toBe('M')
    expect(BLOCK_BY_NAME.S2?.type).toBe('S')
    expect(BLOCK_BY_NAME.A?.type).toBe('Y')
    expect(BLOCK_BY_NAME.C?.type).toBe('Y')
    expect(BLOCK_BY_NAME.NONEXIST).toBeUndefined()
  })

  it('expectedRoomNos M1 kat 1 → [101..130]', () => {
    expect(expectedRoomNos('M1', 1)).toEqual(Array.from({ length: 30 }, (_, i) => 101 + i))
  })

  it('expectedRoomNos H kat 1 → [1..20] (100lu degil)', () => {
    expect(expectedRoomNos('H', 1)).toEqual(Array.from({ length: 20 }, (_, i) => 1 + i))
  })

  it('expectedRoomNos E kat 3 → [301..320]', () => {
    expect(expectedRoomNos('E', 3)).toEqual(Array.from({ length: 20 }, (_, i) => 301 + i))
  })

  it('expectedRoomNos F kat 3 → [301..310]', () => {
    expect(expectedRoomNos('F', 3)).toEqual(Array.from({ length: 10 }, (_, i) => 301 + i))
  })

  it('expectedRoomNos D kat 2 → [] (D tek katli)', () => {
    expect(expectedRoomNos('D', 2)).toEqual([])
  })

  it('expectedRoomNos bilinmeyen blok → []', () => {
    expect(expectedRoomNos('XX', 1)).toEqual([])
  })

  it('getCapacity S2 kat 2 → 4 (istisna)', () => {
    expect(getCapacity('S2', 2)).toBe(4)
  })

  it('getCapacity S2 kat 1 → 6 (varsayilan)', () => {
    expect(getCapacity('S2', 1)).toBe(6)
  })

  it('getCapacity A kat 1 → 1 (placeholder)', () => {
    expect(getCapacity('A', 1)).toBe(1)
  })

  it('getCapacity M1 → 6', () => {
    expect(getCapacity('M1', 1)).toBe(6)
  })

  it('getFloorLabel F kat 3 → "301-310"', () => {
    expect(getFloorLabel('F', 3)).toBe('301–310')
  })

  it('getFloorLabel H kat 1 → "1-20"', () => {
    expect(getFloorLabel('H', 1)).toBe('1–20')
  })

  it('getFloorLabel D kat 2 → "" (D tek katli)', () => {
    expect(getFloorLabel('D', 2)).toBe('')
  })

  it('getBlockConfig Y bloklarinda isPlaceholder=true', () => {
    for (const yBlock of ['A', 'A1', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J']) {
      expect(getBlockConfig(yBlock)?.isPlaceholder).toBe(true)
    }
    expect(getBlockConfig('M1')?.isPlaceholder).toBeUndefined()
    expect(getBlockConfig('S1')?.isPlaceholder).toBeUndefined()
  })

  it('Y bloklarinda hasPrivateBath=true', () => {
    for (const block of BLOCKS_BY_TYPE.Y) {
      expect(getBlockConfig(block)?.hasPrivateBath).toBe(true)
    }
  })

  it('M bloklarinda hasPrivateBath=false', () => {
    for (const block of BLOCKS_BY_TYPE.M) {
      expect(getBlockConfig(block)?.hasPrivateBath).toBe(false)
    }
  })
})
```

- [ ] **Step 2: Testleri çalıştır ve fail ettiklerini doğrula (RED)**

Run (proje kökünden):
```bash
cd backend && npx vitest run ../frontend/src/shared/blocks.test.js
```

Expected: Test dosyası yüklenmez (`Cannot find module './blocks.js'`) — tüm testler FAIL.

> Not: Backend'in `vitest` paketi proje root'tan dahil edildiği için bu komut çalışır. Backend `globalSetup` (test-setup.js) bir DB başlatır ama bu test onu kullanmaz; sadece overhead, sorun değil.

- [ ] **Step 3: blocks.js config dosyasını yaz**

Create `frontend/src/shared/blocks.js`:

```js
// AVSKAMP yatakhane bloklari — tek kaynakli config.
//
// Bloklar 3 tipe ayrilir:
//   M (Merkezi)  → ortak banyo/WC, 6 kisilik
//   S (Sosyal)   → ozel banyo, 6 kisilik (S2 kat 2 = 4 kisilik istisna)
//   Y (Yeni)     → ozel banyo, kapasite=1 placeholder (yatak sayilari sonradan girilecek)
//
// CapacityPage ve HousekeepingPage bu dosyayi tek kaynak olarak import eder.

export const BLOCKS = [
  // M tipi — ortak banyo
  { block: 'M1', type: 'M', floors: 2, perFloor: 30, startNo: { 1: 101, 2: 201 }, hasPrivateBath: false, defaultCapacity: 6 },
  { block: 'M2', type: 'M', floors: 2, perFloor: 30, startNo: { 1: 101, 2: 201 }, hasPrivateBath: false, defaultCapacity: 6 },
  { block: 'M3', type: 'M', floors: 2, perFloor: 30, startNo: { 1: 101, 2: 201 }, hasPrivateBath: false, defaultCapacity: 6 },

  // S tipi — ozel banyo
  { block: 'S1', type: 'S', floors: 2, perFloor: 24, startNo: { 1: 101, 2: 201 }, hasPrivateBath: true,  defaultCapacity: 6 },
  { block: 'S2', type: 'S', floors: 2, perFloor: 24, startNo: { 1: 101, 2: 201 }, hasPrivateBath: true,  defaultCapacity: 6, capacityException: { floor: 2, capacity: 4 } },
  { block: 'S3', type: 'S', floors: 2, perFloor: 24, startNo: { 1: 101, 2: 201 }, hasPrivateBath: true,  defaultCapacity: 6 },

  // Y tipi — ozel banyo, placeholder kapasite
  { block: 'A',  type: 'Y', floors: 2, perFloor: 20, startNo: { 1: 101, 2: 201 }, hasPrivateBath: true, defaultCapacity: 1, isPlaceholder: true },
  { block: 'A1', type: 'Y', floors: 2, perFloor: 20, startNo: { 1: 101, 2: 201 }, hasPrivateBath: true, defaultCapacity: 1, isPlaceholder: true },
  { block: 'A2', type: 'Y', floors: 2, perFloor: 20, startNo: { 1: 101, 2: 201 }, hasPrivateBath: true, defaultCapacity: 1, isPlaceholder: true },
  { block: 'A3', type: 'Y', floors: 2, perFloor: 20, startNo: { 1: 101, 2: 201 }, hasPrivateBath: true, defaultCapacity: 1, isPlaceholder: true },
  { block: 'A4', type: 'Y', floors: 2, perFloor: 20, startNo: { 1: 101, 2: 201 }, hasPrivateBath: true, defaultCapacity: 1, isPlaceholder: true },
  { block: 'B',  type: 'Y', floors: 2, perFloor: 20, startNo: { 1: 101, 2: 201 }, hasPrivateBath: true, defaultCapacity: 1, isPlaceholder: true },
  { block: 'C',  type: 'Y', floors: 2, perFloor: 20, startNo: { 1: 101, 2: 201 }, hasPrivateBath: true, defaultCapacity: 1, isPlaceholder: true },
  { block: 'E',  type: 'Y', floors: 3, perFloor: 20, startNo: { 1: 101, 2: 201, 3: 301 }, hasPrivateBath: true, defaultCapacity: 1, isPlaceholder: true },
  { block: 'G',  type: 'Y', floors: 3, perFloor: 20, startNo: { 1: 101, 2: 201, 3: 301 }, hasPrivateBath: true, defaultCapacity: 1, isPlaceholder: true },
  { block: 'F',  type: 'Y', floors: 3, perFloor: 10, startNo: { 1: 101, 2: 201, 3: 301 }, hasPrivateBath: true, defaultCapacity: 1, isPlaceholder: true },
  { block: 'D',  type: 'Y', floors: 1, perFloor: 20, startNo: { 1: 101 }, hasPrivateBath: true, defaultCapacity: 1, isPlaceholder: true },
  { block: 'H',  type: 'Y', floors: 1, perFloor: 20, startNo: { 1: 1   }, hasPrivateBath: true, defaultCapacity: 1, isPlaceholder: true },
  { block: 'J',  type: 'Y', floors: 1, perFloor: 20, startNo: { 1: 1   }, hasPrivateBath: true, defaultCapacity: 1, isPlaceholder: true },
]

export const BLOCK_BY_NAME = Object.fromEntries(BLOCKS.map(b => [b.block, b]))

export const BLOCKS_BY_TYPE = {
  M: BLOCKS.filter(b => b.type === 'M').map(b => b.block),
  S: BLOCKS.filter(b => b.type === 'S').map(b => b.block),
  Y: BLOCKS.filter(b => b.type === 'Y').map(b => b.block),
}

export function getBlockConfig(name) {
  return BLOCK_BY_NAME[name]
}

// Bir kat icin beklenen oda numaralari array'i (ghost cell render etmek icin)
export function expectedRoomNos(blockName, floor) {
  const cfg = BLOCK_BY_NAME[blockName]
  if (!cfg) return []
  const start = cfg.startNo[floor]
  if (start == null) return []
  return Array.from({ length: cfg.perFloor }, (_, i) => start + i)
}

// Kat kapasitesi (S2 kat 2 = 4 istisnasi dahil)
export function getCapacity(blockName, floor) {
  const cfg = BLOCK_BY_NAME[blockName]
  if (!cfg) return 0
  if (cfg.capacityException?.floor === floor) return cfg.capacityException.capacity
  return cfg.defaultCapacity
}

// Kat chip etiketi: "101-130" veya "1-20"
export function getFloorLabel(blockName, floor) {
  const nos = expectedRoomNos(blockName, floor)
  if (nos.length === 0) return ''
  return `${nos[0]}–${nos[nos.length - 1]}`
}
```

- [ ] **Step 4: Testleri tekrar çalıştır ve PASS olduğunu doğrula (GREEN)**

Run:
```bash
cd backend && npx vitest run ../frontend/src/shared/blocks.test.js
```

Expected: 17 test PASS.

- [ ] **Step 5: Commit**

Run:
```bash
git add frontend/src/shared/blocks.js frontend/src/shared/blocks.test.js
git commit -m "feat(shared): tum 19 blok icin shared config + helper fonksiyonlar"
```

---

## Task 3: CSS — `tag-y` sınıfı ekle

**Files:**
- Modify: `frontend/src/index.css`

- [ ] **Step 1: tag-y CSS sınıfını ekle**

`frontend/src/index.css:205` satırından sonra (`tag-exc` satırından sonra) yeni satır ekle:

```css
.tag-y { background: rgba(39,201,106,.15); color: var(--green); }
```

Sonuç (203-206 satırları):
```css
.tag-m { background: rgba(59,140,240,.15); color: var(--blue); }
.tag-s { background: rgba(155,89,182,.15); color: var(--purple); }
.tag-exc { background: rgba(240,165,0,.15); color: var(--accent); }
.tag-y { background: rgba(39,201,106,.15); color: var(--green); }
```

- [ ] **Step 2: Commit**

Run:
```bash
git add frontend/src/index.css
git commit -m "style: tag-y CSS sinifi (yeni blok tipi)"
```

---

## Task 4: CapacityPage refactor — config kullan, Y tab ekle

**Files:**
- Modify: `frontend/src/modules/capacity/CapacityPage.jsx`

Bu task büyük bir refactor; küçük adımlar halinde, her adımdan sonra dev sunucuda sayfanın hala render olduğunu kontrol et (görsel duman testi). Final commit task sonunda.

- [ ] **Step 1: Sabitleri sil, config import ekle**

`CapacityPage.jsx:1-25` satır aralığında değişiklikler:

`:8-10` satırlarındaki:
```js
// ── Block definitions ─────────────────────────────────────────────────────────
const M_BLOCKS = ['M1', 'M2', 'M3']
const S_BLOCKS = ['S1', 'S2', 'S3']
```
şununla değiştir:
```js
// ── Block definitions ─────────────────────────────────────────────────────────
import { BLOCKS_BY_TYPE, BLOCK_BY_NAME, expectedRoomNos as expectedRoomNosFromConfig, getCapacity as getCapacityFromConfig, getFloorLabel } from '../../shared/blocks.js'
```

> Not: `import` satırı `:8`'e değil, `:6`'dan sonra (mevcut import bloğunun sonuna) ekle. Ardından `:8-10`'daki sabitleri sil. Diğer import'larla tutarlı sıralama için, import'u dosyanın en üstündeki diğer import'lardan hemen sonraya koy.

`:12-16` satırlarındaki yerel `expectedRoomNos` fonksiyonunu sil:
```js
function expectedRoomNos(blockType, floor) {
  const base = floor === 1 ? 100 : 200
  const count = blockType === 'M' ? 30 : 24
  return Array.from({ length: count }, (_, i) => base + i + 1)
}
```

- [ ] **Step 2: CorridorPlan'da expectedRoomNos çağrısını güncelle**

`CapacityPage.jsx:923` satırındaki:
```js
const allNos = expectedRoomNos(isM ? 'M' : 'S', floor)
```
şununla değiştir:
```js
const allNos = expectedRoomNosFromConfig(block, floor)
```

`:916-918` satırlarındaki:
```js
const isM = block.startsWith('M')
const isS2Floor2 = block === 'S2' && floor === 2
const defaultCap = isS2Floor2 ? 4 : 6
```
şununla değiştir:
```js
const cfg = BLOCK_BY_NAME[block]
const isM = cfg?.type === 'M'
const isS2Floor2 = block === 'S2' && floor === 2
const defaultCap = getCapacityFromConfig(block, floor)
```

> `isM` kontrolü mevcut yerlerde aynen kalır (FacilityCell render'ı için kullanılıyor). `isS2Floor2` literal kalır çünkü mesaj S2'ye özel.

- [ ] **Step 3: Block type switcher'ı 3 düğmeye çıkar**

`CapacityPage.jsx:1405-1419` satırlarındaki:
```jsx
{['M', 'S'].map(t => (
  <button
    key={t}
    onClick={() => handleBlockTypeChange(t)}
    style={{
      padding: '7px 22px', borderRadius: '6px', border: 'none', cursor: 'pointer',
      fontFamily: 'var(--display)', fontSize: '15px', fontWeight: 700, letterSpacing: '2px',
      transition: 'all 0.15s',
      background: blockType === t ? 'var(--accent)' : 'transparent',
      color: blockType === t ? '#000' : 'var(--text2)',
    }}
  >
    {t} BLOK
  </button>
))}
```
şununla değiştir:
```jsx
{['M', 'S', 'Y'].map(t => (
  <button
    key={t}
    onClick={() => handleBlockTypeChange(t)}
    style={{
      padding: '7px 22px', borderRadius: '6px', border: 'none', cursor: 'pointer',
      fontFamily: 'var(--display)', fontSize: '15px', fontWeight: 700, letterSpacing: '2px',
      transition: 'all 0.15s',
      background: blockType === t ? 'var(--accent)' : 'transparent',
      color: blockType === t ? '#000' : 'var(--text2)',
    }}
  >
    {t} BLOK
  </button>
))}
```

- [ ] **Step 4: handleBlockTypeChange'i 3 tip için güncelle**

`CapacityPage.jsx:1336-1341` satırlarındaki:
```js
function handleBlockTypeChange(t) {
  setBlockType(t)
  setSelectedBlock(t === 'M' ? 'M1' : 'S1')
  setFloor(1)
  setSelectedRoom(null)
}
```
şununla değiştir:
```js
function handleBlockTypeChange(t) {
  setBlockType(t)
  const firstBlock = BLOCKS_BY_TYPE[t][0]
  setSelectedBlock(firstBlock)
  setFloor(1)
  setSelectedRoom(null)
}
```

- [ ] **Step 5: blocks listesini config'ten türet**

`CapacityPage.jsx:1333` satırındaki:
```js
const blocks = blockType === 'M' ? M_BLOCKS : S_BLOCKS
```
şununla değiştir:
```js
const blocks = BLOCKS_BY_TYPE[blockType]
```

- [ ] **Step 6: Initial state'i M tab'ı varsayılanına ayarla**

`CapacityPage.jsx:1306-1307` satırlarındaki:
```js
const [blockType, setBlockType] = useState(blockParam?.startsWith('M') ? 'M' : 'S')
const [selectedBlock, setSelectedBlock] = useState(blockParam || 'M1')
```
şununla değiştir:
```js
const initialType = blockParam ? (BLOCK_BY_NAME[blockParam]?.type ?? 'M') : 'M'
const [blockType, setBlockType] = useState(initialType)
const [selectedBlock, setSelectedBlock] = useState(blockParam || 'M1')
```

- [ ] **Step 7: Floor selector'ı dinamikleştir + tek katlıda gizle**

`CapacityPage.jsx:1437-1454` satırlarındaki tüm Floor selector bloğunu (`<div style={{ display: 'flex', gap: '6px', marginLeft: 'auto' }}>` ile başlayan):

```jsx
<div style={{ display: 'flex', gap: '6px', marginLeft: 'auto' }}>
  {[1, 2].map(f => {
    const prefix = f === 1 ? '101' : '201'
    const suffix = blockType === 'M' ? (f === 1 ? '130' : '230') : (f === 1 ? '124' : '224')
    return (
      <button
        key={f}
        onClick={() => { setFloor(f); setSelectedRoom(null) }}
        className={`filter-chip${floor === f ? ' active' : ''}`}
      >
        KAT {f}
        <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', opacity: 0.6, marginLeft: '4px' }}>
          {prefix}–{suffix}
        </span>
      </button>
    )
  })}
</div>
```

şununla değiştir:

```jsx
{(() => {
  const cfg = BLOCK_BY_NAME[selectedBlock]
  const floorList = Array.from({ length: cfg?.floors ?? 0 }, (_, i) => i + 1)
  if (floorList.length <= 1) return null
  return (
    <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto' }}>
      {floorList.map(f => (
        <button
          key={f}
          onClick={() => { setFloor(f); setSelectedRoom(null) }}
          className={`filter-chip${floor === f ? ' active' : ''}`}
        >
          KAT {f}
          <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', opacity: 0.6, marginLeft: '4px' }}>
            {getFloorLabel(selectedBlock, f)}
          </span>
        </button>
      ))}
    </div>
  )
})()}
```

- [ ] **Step 8: Tek katlı bloğa geçince floor=1 garantile**

`CapacityPage.jsx:1335` satırındaki `handleBlockChange`'i şununla değiştir:
```js
function handleBlockChange(b) { setSelectedBlock(b); setFloor(1); setSelectedRoom(null) }
```
(zaten doğru — sadece kontrol et; floor zaten 1'e set ediliyor.)

- [ ] **Step 9: Plan panel başlık subtitle ve gradient'ini güncelle**

`CapacityPage.jsx:1490` satırındaki:
```jsx
<div style={{ height: '2px', background: blockType === 'M' ? 'linear-gradient(90deg,var(--blue),var(--purple))' : 'linear-gradient(90deg,var(--purple),var(--teal))' }} />
```
şununla değiştir:
```jsx
<div style={{ height: '2px', background:
  blockType === 'M' ? 'linear-gradient(90deg,var(--blue),var(--purple))' :
  blockType === 'S' ? 'linear-gradient(90deg,var(--purple),var(--teal))' :
                      'linear-gradient(90deg,var(--teal),var(--green))'
}} />
```

`:1494-1499` satırlarındaki subtitle:
```jsx
<div className="panel-subtitle">
  KORİDOR PLANI · {floor === 1
    ? (blockType === 'M' ? 'ODA 101–130' : 'ODA 101–124')
    : (blockType === 'M' ? 'ODA 201–230' : 'ODA 201–224')
  }
</div>
```
şununla değiştir:
```jsx
<div className="panel-subtitle">
  KORİDOR PLANI · ODA {getFloorLabel(selectedBlock, floor) || '—'}
</div>
```

`:1502` satırındaki:
```jsx
<span className={`tag tag-${blockType === 'M' ? 'm' : 's'}`}>{blockType}</span>
```
şununla değiştir:
```jsx
<span className={`tag tag-${blockType.toLowerCase()}`}>{blockType}</span>
```

- [ ] **Step 10: Header lejant satırı ekle**

`CapacityPage.jsx:1387-1395` satırlarındaki lejant kutusunda mevcut 3 `<div>` satırının sonuna 4. satır ekle:
```jsx
<div><span style={{ color: 'var(--green)' }}>■</span> A/A1-A4/B/C/D/E/F/G/H/J — KAPASİTE PLACEHOLDER · ÖZEL BANYO</div>
```

Tam blok şöyle olmalı:
```jsx
<div style={{
  fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)',
  border: '1px solid var(--border)', borderRadius: '7px', padding: '8px 12px',
  lineHeight: 1.8,
}}>
  <div><span style={{ color: 'var(--blue)' }}>■</span> M1/M2/M3 — 30 ODA/KAT · 6 KİŞİLİK · ORTAK WC/BANYO</div>
  <div><span style={{ color: 'var(--purple)' }}>■</span> S1/S3 — 24 ODA/KAT · 6 KİŞİLİK · ÖZEL BANYO</div>
  <div><span style={{ color: 'var(--accent)' }}>■</span> S2 — 24 ODA/KAT · KAT 2: 4 KİŞİLİK, KAT 1: 6 KİŞİLİK · ÖZEL BANYO</div>
  <div><span style={{ color: 'var(--green)' }}>■</span> A/A1-A4/B/C/D/E/F/G/H/J — KAPASİTE PLACEHOLDER · ÖZEL BANYO</div>
</div>
```

- [ ] **Step 11: Placeholder uyarı banner'ı ekle**

`CapacityPage.jsx:937-944` satırlarındaki S2 floor 2 warning bloğundan **hemen sonra** yeni bir banner ekle:

Mevcut blok:
```jsx
{/* S2 Floor 2 warning */}
{isS2Floor2 && (
  <div className="alert alert-warn" style={{ marginBottom: '12px' }}>
    <span>⚠</span>
    <span>
      <strong>S2 KAT 2 İSTİSNA:</strong> Odalar 4 kişilik · Her odada özel banyo
    </span>
  </div>
)}
```

Sonrasına ekle:
```jsx
{/* Y blok placeholder warning */}
{cfg?.isPlaceholder && (
  <div className="alert alert-warn" style={{ marginBottom: '12px' }}>
    <span>⚠</span>
    <span>
      <strong>PLACEHOLDER:</strong> Bu bloğun kapasitesi henüz girilmedi (1 kişilik). Doğru yatak sayılarını oda detayından düzenleyin.
    </span>
  </div>
)}
```

- [ ] **Step 12: Dev server'ı başlat ve sayfanın yüklendiğini doğrula**

Run (proje kökünden, ayrı terminalde):
```bash
npm run dev
```

Tarayıcıda http://localhost:5174 → `mudur` / `admin123` ile giriş → KAPASİTE sayfası.

Manuel kontroller:
1. Üstte 3 tab: M BLOK / S BLOK / **Y BLOK**
2. Y tab'a tıkla — 13 chip görünür (A, A1, A2, A3, A4, B, C, D, E, F, G, H, J)
3. **A** seç (2 katlı) — kat seçici 2 chip ("101–120", "201–220")
4. **F** seç (3 katlı, 10/kat) — kat seçici 3 chip ("101–110", "201–210", "301–310")
5. **D** seç (1 katlı) — kat seçici **görünmez**
6. **H** seç — kat seçici görünmez, oda planında numaralar `1, 2, 3...` (101 değil)
7. Y tab'da herhangi bir blokta sarı placeholder banner görünür
8. M tab'a dönünce eski davranış aynen çalışır (M1, kat 1, oda 101–130)
9. S2 → KAT 2 hâlâ "4K · İSTİSNA" tag'i ve uyarı banner'ı gösteriyor

Sorun varsa adım adım geri dön. Tüm kontroller geçtikten sonra dev server'ı durdur (Ctrl+C).

- [ ] **Step 13: Commit**

Run:
```bash
git add frontend/src/modules/capacity/CapacityPage.jsx
git commit -m "feat(capacity): Y tab + dinamik kat secici + tum 19 blok desteklenir"
```

---

## Task 5: HousekeepingPage refactor — M/S/Y tab + config

**Files:**
- Modify: `frontend/src/modules/housekeeping/HousekeepingPage.jsx`

- [ ] **Step 1: Sabitleri sil, config import ekle**

`HousekeepingPage.jsx:7` satırındaki:
```js
const ALL_BLOCKS = ['M1','M2','M3','S1','S2','S3']
```
sil.

`HousekeepingPage.jsx:1-4` import bloğunun sonuna (`import HelpHint`'ten sonra) yeni import ekle:
```js
import { BLOCKS_BY_TYPE, BLOCK_BY_NAME, expectedRoomNos as expectedRoomNosFromConfig, getFloorLabel } from '../../shared/blocks.js'
```

`HousekeepingPage.jsx:28-32` satırlarındaki yerel `blockRoomNos`'u sil:
```js
function blockRoomNos(block, floor) {
  const base  = floor === 1 ? 100 : 200
  const count = block.startsWith('M') ? 30 : 24
  return Array.from({ length: count }, (_, i) => String(base + i + 1))
}
```

- [ ] **Step 2: BlockFloorView içinde blockRoomNos çağrısını config'e yönlendir**

`HousekeepingPage.jsx:949` satırındaki:
```js
const allRoomNos  = blockRoomNos(block, floor)
```
şununla değiştir:
```js
const allRoomNos  = expectedRoomNosFromConfig(block, floor).map(n => String(n))
```

- [ ] **Step 3: HousekeepingPage state'ine blockType ekle**

`HousekeepingPage.jsx:1093-1098` satır aralığındaki:
```js
const qc = useQueryClient()
const [block, setBlock]           = useState('M1')
const [floor, setFloor]           = useState(1)
const [selectedRoomNo, setSelected] = useState(null)
const [uncleanedOnly, setUncleanedOnly] = useState(false)

const isM = block.startsWith('M')
```
şununla değiştir:
```js
const qc = useQueryClient()
const [blockType, setBlockType]   = useState('M')
const [block, setBlock]           = useState('M1')
const [floor, setFloor]           = useState(1)
const [selectedRoomNo, setSelected] = useState(null)
const [uncleanedOnly, setUncleanedOnly] = useState(false)

const cfg = BLOCK_BY_NAME[block]
const isM = cfg?.type === 'M'
```

- [ ] **Step 4: M/S/Y tab switcher ekle ve mevcut block chip satırını güncelle**

Önce mevcut block chip satırını bul. Aşağıdaki Grep komutunu çalıştır ve dön sonuçlarını görerek doğru satırı bul:

Run:
```bash
grep -n "ALL_BLOCKS.map\|filter-chip.*block\|block === b" frontend/src/modules/housekeeping/HousekeepingPage.jsx
```

Mevcut block selector büyük olasılıkla bir `.map(b => ...)` ile chip'leri render eden satır. Bul ve onun yerine **iki katmanlı navigasyon** ekle (önce tip, sonra blok):

Mevcut satıra benzer (tahmini, gerçek satır numarası grep'le bulunur — `~1170-1200` arası):
```jsx
{ALL_BLOCKS.map(b => (
  <button
    key={b}
    onClick={() => { setBlock(b); setFloor(1); setSelected(null) }}
    className={`filter-chip${block === b ? ' active' : ''}`}
  >
    {b}
  </button>
))}
```

Üstüne tab switcher ekle, alta aynı chip mantığını config'ten gelen listeyle değiştir:
```jsx
{/* Block type switcher (M / S / Y) */}
<div style={{
  display: 'flex', background: 'var(--surface2)', borderRadius: '8px',
  padding: '3px', border: '1px solid var(--border)', gap: '0',
}}>
  {['M', 'S', 'Y'].map(t => (
    <button
      key={t}
      onClick={() => {
        setBlockType(t)
        const firstBlock = BLOCKS_BY_TYPE[t][0]
        setBlock(firstBlock)
        setFloor(1)
        setSelected(null)
      }}
      style={{
        padding: '7px 22px', borderRadius: '6px', border: 'none', cursor: 'pointer',
        fontFamily: 'var(--display)', fontSize: '14px', fontWeight: 700, letterSpacing: '2px',
        transition: 'all 0.15s',
        background: blockType === t ? 'var(--accent)' : 'transparent',
        color: blockType === t ? '#000' : 'var(--text2)',
      }}
    >
      {t} BLOK
    </button>
  ))}
</div>

{/* Block chip selector (filtered by blockType) */}
<div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
  {BLOCKS_BY_TYPE[blockType].map(b => (
    <button
      key={b}
      onClick={() => { setBlock(b); setFloor(1); setSelected(null) }}
      className={`filter-chip${block === b ? ' active' : ''}`}
    >
      {b}
    </button>
  ))}
</div>
```

> Tab switcher ve chip selector aynı flex container içinde olmalı (mevcut block selector hangi container içindeyse). Stil bütünlüğü için mevcut block chip'lerinin parent div'ini koru, içine tab switcher'ı **önce** koy, sonra config-driven chip'leri.

- [ ] **Step 5: Floor selector'ı dinamikleştir**

`HousekeepingPage.jsx` içinde mevcut floor selector'ı bul:
```bash
grep -n "KAT.*floor\|floor === [12]\|setFloor" frontend/src/modules/housekeeping/HousekeepingPage.jsx
```

Mevcut floor selector capacity'dekine benzer; `[1, 2].map(f => ...)` ile render ediyor. Onu config'den dinamik hale getir:

Mevcut (tahmini):
```jsx
{[1, 2].map(f => (
  <button
    key={f}
    onClick={() => { setFloor(f); setSelected(null) }}
    className={`filter-chip${floor === f ? ' active' : ''}`}
  >
    KAT {f}
  </button>
))}
```

Şununla değiştir:
```jsx
{(() => {
  const floorList = Array.from({ length: cfg?.floors ?? 0 }, (_, i) => i + 1)
  if (floorList.length <= 1) return null
  return floorList.map(f => (
    <button
      key={f}
      onClick={() => { setFloor(f); setSelected(null) }}
      className={`filter-chip${floor === f ? ' active' : ''}`}
    >
      KAT {f}
      <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', opacity: 0.6, marginLeft: '4px' }}>
        {getFloorLabel(block, f)}
      </span>
    </button>
  ))
})()}
```

- [ ] **Step 6: Dev server'da housekeeping sayfasını test et**

Run (eğer dev server kapalıysa):
```bash
npm run dev
```

Tarayıcıda → TEMİZLİK / HOUSEKEEPING sayfası. Manuel kontroller:
1. Üstte M / S / **Y** tab — 3 düğme
2. Y tab'a bas → 13 blok chip görünür
3. **F** seç → kat seçici 3 chip
4. **D** seç → kat seçici görünmez (tek katlı)
5. **H** seç → görünmez, oda planında ghost cell'ler `1, 2, 3...` olarak görünür (henüz görev üretilmediyse "Görev yok" mesajı)
6. **+ GÖREV OLUŞTUR** → Y bloğundaki odalar için de task üretilir, plan görünür
7. M / S tab'lar eski davranışı aynen yapar

Tüm kontroller geçince dev server'ı durdur.

- [ ] **Step 7: Commit**

Run:
```bash
git add frontend/src/modules/housekeeping/HousekeepingPage.jsx
git commit -m "feat(housekeeping): M/S/Y tab + dinamik kat secici + tum 19 blok"
```

---

## Task 6: End-to-end smoke validation

**Files:** Lokal `yys.db`, dev server

Bu task manuel — kod değişikliği yok, sadece tüm sistemin (seed + UI) birlikte çalıştığını doğrularız.

- [ ] **Step 1: Lokal yys.db'yi sıfırla ve yeniden seed et**

Run (proje kökünden):
```bash
rm -f yys.db yys.db-shm yys.db-wal
cd backend && node -e "import('./src/shared/db/index.js').then(m=>m.initDB()).then(()=>import('./src/shared/db/seedProdRooms.js')).then(m=>{const r=m.seedProdRooms(); console.log(JSON.stringify(r))})"
```

Expected çıktı:
```json
{"inserted":814,"skipped":0,"total_in_db":814}
```

> Not: seed komutu `cd backend &&` ile çalıştırıldığı için DB `backend/yys.db`'ye yazılır (CLAUDE.md'deki bilinen pattern). Eğer proje kökündeki `yys.db`'ye yazılmasını istiyorsan, ya da CLAUDE.md'de belgelendiği gibi backend cwd'den çalıştırıyorsan, dev server'ı da backend cwd üzerinden çalıştır. Bu konu `2026-05-01-yeni-bloklar.md` plan'ında da işaret edildi, kapsam dışı.

- [ ] **Step 2: SQL ile blok bazlı sayım doğrula**

Run:
```bash
sqlite3 yys.db "SELECT block, COUNT(*) c FROM rooms GROUP BY block ORDER BY block"
```

Eğer DB `backend/yys.db`'deyse:
```bash
sqlite3 backend/yys.db "SELECT block, COUNT(*) c FROM rooms GROUP BY block ORDER BY block"
```

Expected çıktıda 19 satır:
- A, A1, A2, A3, A4, B, C → 40 oda
- D, H, J → 20 oda
- E, G → 60 oda
- F → 30 oda
- M1, M2, M3 → 60 oda
- S1, S2, S3 → 48 oda

- [ ] **Step 3: Dev server başlat, capacity ve housekeeping smoke testi**

Run:
```bash
npm run dev
```

Tarayıcıda her iki sayfayı da test et. Beklenen davranışlar:

**Capacity:**
- M tab → 3 chip, M1 default, kat 1-2, oda 101-130
- S tab → 3 chip, S1 default, kat 1-2, oda 101-124, S2 kat 2'de "4K · İSTİSNA" + uyarı
- Y tab → 13 chip, A default, placeholder banner; her bloğun kat sayısı dinamik; H/J'de oda numaraları 1-20

**Housekeeping:**
- M / S / Y tab geçişleri çalışır
- "+ GÖREV OLUŞTUR" tüm 19 bloğu kapsar (backend DB'den okuyor)
- Y bloğunda da room tile'lar render olur

- [ ] **Step 4: Tüm backend test paketini son kez çalıştır**

Run:
```bash
cd backend && npm run test
```

Expected: Tüm testler PASS.

- [ ] **Step 5: blocks.js helper testlerini son kez çalıştır**

Run:
```bash
cd backend && npx vitest run ../frontend/src/shared/blocks.test.js
```

Expected: 17 test PASS.

- [ ] **Step 6: Smoke validation tamamlandı — commit gerekmez**

Tüm doğrulamalar geçtiyse iş tamam. Final git status temiz olmalı (Task 1-5 hepsi commit'li).

---

## Self-Review

Spec'e karşı kontroller:

1. **Spec coverage:**
   - "Seed'e A ve C blokları" → Task 1 ✓
   - "frontend/src/shared/blocks.js shared config" → Task 2 ✓
   - "CapacityPage refactor: M/S/Y switcher, dinamik kat seçici, dinamik label, placeholder banner" → Task 4 ✓
   - "HousekeepingPage refactor: M/S/Y tab, config-driven layout" → Task 5 ✓
   - "Frontend unit testler (blocks.js helper'ları)" → Task 2 Step 1 ✓
   - "Seed testleri (A + C için)" → Task 1 Step 1-2 ✓
   - "tag-y CSS sınıfı" → Task 3 ✓
   - "Backend etkisi yok" → backend modüllerine dokunulmadı ✓
   - "Smoke doğrulaması" → Task 6 ✓

2. **Placeholder scan:** "TBD/TODO" yok. "Add appropriate error handling" yok. Tüm step'lerde tam komut/kod var.

3. **Type/isim tutarlılığı:**
   - `BLOCK_BY_NAME`, `BLOCKS_BY_TYPE`, `expectedRoomNos`, `getCapacity`, `getFloorLabel`, `getBlockConfig` — hepsi Task 2'de tanımlı, Task 4 ve 5'te aynı isimle import ediliyor ✓
   - Capacity'de `expectedRoomNos as expectedRoomNosFromConfig` rename — yerel fonksiyon zaten silindiği için aslında rename'e gerek yok; ama açık olması için bıraktım. Housekeeping'de de aynı rename pattern.
   - `cfg` değişken adı hem capacity hem housekeeping'te tutarlı.
   - `blockType` state hem capacity hem housekeeping'te aynı isimle.

4. **Bilinen risk:**
   - Task 5 Step 4 ve Step 5 mevcut kod satır numaralarını grep ile bulmayı söylüyor — 1438 satırlık dosyanın `floor`/`block` chip selector'ını birebir görmedim. Adım açıkça grep ile yer bulduktan sonra değişiklik yap diyor; eğer kod yapısı çok farklıysa engineer'ın o adımları manuel yorumlaması gerekir. Bu plan'ın en kırılgan noktası — ama housekeeping page'in yapısı capacity'ye çok benzediği için (her iki dosya da aynı stil sistemini kullanıyor) önemli risk değil.
