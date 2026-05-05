# Yeni Blok UI Entegrasyonu — Capacity & Housekeeping

**Tarih:** 2026-05-05
**Bağlam:** [2026-05-01-yeni-bloklar-design.md](./2026-05-01-yeni-bloklar-design.md) ile DB'ye eklenen 11 yeni blok artık yatakhanede mevcut; kullanıcı arayüzünden yönetilebilir hale getirilmesi ve ek olarak A + C bloklarının da eklenmesi gerekiyor.

---

## 1. Hedef

AVSKAMP yatakhanesindeki **19 bloğun tamamını** (3 M + 3 S + 13 Y) `CapacityPage` ve `HousekeepingPage` üzerinden gezilebilir, oda detayları açılabilir, görev üretilebilir hale getirmek. Yeni bloklar S blokları ile aynı görsel tasarımı (özel banyo ikonu, ortak facility hücreleri yok) paylaşır. Kapasiteler placeholder=1; doğru sayılar UI üzerinden sonradan girilecek (kapsam dışı, ileride).

## 2. Kapsam

**Dahil:**
- Seed'e A ve C blokları (her biri 2 kat × 20 oda × kapasite 1) — toplam 13 yeni blok / 490 oda / 814 grand total
- `frontend/src/shared/blocks.js` shared config (yeni dosya)
- `CapacityPage` refactor: M/S/Y tab switcher, dinamik kat seçici, dinamik oda aralığı label'ları, placeholder uyarı banner'ı
- `HousekeepingPage` refactor: aynı M/S/Y tab yapısı (şu an tab yok, capacity'den replikalanır), config-driven layout
- Frontend unit testler (`blocks.js` helper'ları)
- Seed testleri (A + C için)

**Dahil değil:**
- Yeni blokların kapasitelerinin (yatak sayısı) gerçek değerlere güncellenmesi — ayrı iş
- Backend modüllerinde herhangi bir değişiklik (sıfır)
- Mobile/PWA modüllerinde değişiklik (ileride)
- Production deploy

## 3. Veri Modeli — Seed Genişletmesi

### 3.1 Yeni Bloklar

`backend/src/shared/db/seedProdRooms.js` içindeki `TWO_FLOOR_BLOCKS` listesine `'A'` ve `'C'` eklenir:

```js
const TWO_FLOOR_BLOCKS = ['A', 'A1', 'A2', 'A3', 'A4', 'B', 'C']
```

| Blok | Kat | Oda/Kat | Numaralandırma | Kapasite |
|------|-----|---------|----------------|----------|
| A | 2 | 20 | 101–120, 201–220 | 1 |
| C | 2 | 20 | 101–120, 201–220 | 1 |

Diğer 11 blok (D, A1-A4, B, E, F, G, H, J) zaten seed'de mevcut, dokunulmaz.

### 3.2 Beklenen Toplamlar

- M+S: 324 oda (değişmez)
- Y tipi: 13 blok × ortalama → 490 oda
  - A, A1, A2, A3, A4, B, C: 7 × 40 = 280
  - E, G: 2 × 60 = 120
  - F: 1 × 30 = 30
  - D, H, J: 3 × 20 = 60
- **Toplam: 814 oda**

### 3.3 Şema Etkisi

Yok. Tüm CHECK constraint'ler ve INSERT OR IGNORE garantisi mevcut M/S verisini korur.

## 4. Frontend — Shared Config (`frontend/src/shared/blocks.js`)

Tek kaynaklı blok yapı tanımı. Hem `CapacityPage` hem `HousekeepingPage` import eder.

### 4.1 Veri Şeması

```js
{
  block: string,            // 'M1', 'S2', 'A1', ...
  type: 'M' | 'S' | 'Y',    // tab grubu
  floors: number,           // 1, 2, veya 3
  perFloor: number,         // 10, 20, 24, veya 30
  startNo: { [floor: number]: number },  // { 1: 101, 2: 201 } veya { 1: 1 } (H/J)
  hasPrivateBath: boolean,  // S ve Y → true, M → false
  defaultCapacity: number,  // M/S → 6, Y → 1
  capacityException?: { floor: number, capacity: number },  // S2 kat 2 = 4
  isPlaceholder?: boolean,  // Y bloklarında true
}
```

### 4.2 Tam Liste

```js
export const BLOCKS = [
  // M tipi — ortak banyo
  { block: 'M1', type: 'M', floors: 2, perFloor: 30, startNo: { 1: 101, 2: 201 }, hasPrivateBath: false, defaultCapacity: 6 },
  { block: 'M2', type: 'M', floors: 2, perFloor: 30, startNo: { 1: 101, 2: 201 }, hasPrivateBath: false, defaultCapacity: 6 },
  { block: 'M3', type: 'M', floors: 2, perFloor: 30, startNo: { 1: 101, 2: 201 }, hasPrivateBath: false, defaultCapacity: 6 },

  // S tipi — özel banyo
  { block: 'S1', type: 'S', floors: 2, perFloor: 24, startNo: { 1: 101, 2: 201 }, hasPrivateBath: true,  defaultCapacity: 6 },
  { block: 'S2', type: 'S', floors: 2, perFloor: 24, startNo: { 1: 101, 2: 201 }, hasPrivateBath: true,  defaultCapacity: 6, capacityException: { floor: 2, capacity: 4 } },
  { block: 'S3', type: 'S', floors: 2, perFloor: 24, startNo: { 1: 101, 2: 201 }, hasPrivateBath: true,  defaultCapacity: 6 },

  // Y tipi — özel banyo, kapasite placeholder
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
```

### 4.3 Helper Fonksiyonlar

```js
export const BLOCK_BY_NAME = Object.fromEntries(BLOCKS.map(b => [b.block, b]))

export const BLOCKS_BY_TYPE = {
  M: BLOCKS.filter(b => b.type === 'M').map(b => b.block),
  S: BLOCKS.filter(b => b.type === 'S').map(b => b.block),
  Y: BLOCKS.filter(b => b.type === 'Y').map(b => b.block),
}

export function getBlockConfig(name) {
  return BLOCK_BY_NAME[name] || null
}

// Kat için beklenen oda numaraları array'i (capacity ve housekeeping ghost cell için)
export function expectedRoomNos(blockName, floor) {
  const cfg = BLOCK_BY_NAME[blockName]
  if (!cfg) return []
  const start = cfg.startNo[floor]
  if (start == null) return []
  return Array.from({ length: cfg.perFloor }, (_, i) => start + i)
}

// Kat kapasitesi (S2 kat 2 istisnası dahil)
export function getCapacity(blockName, floor) {
  const cfg = BLOCK_BY_NAME[blockName]
  if (!cfg) return 0
  if (cfg.capacityException?.floor === floor) return cfg.capacityException.capacity
  return cfg.defaultCapacity
}

// Floor chip etiketi: "101–130" veya "1–20"
export function getFloorLabel(blockName, floor) {
  const nos = expectedRoomNos(blockName, floor)
  if (nos.length === 0) return ''
  return `${nos[0]}–${nos[nos.length - 1]}`
}
```

## 5. Frontend — CapacityPage Değişiklikleri

### 5.1 Sabit Temizleme

Silinir:
```js
const M_BLOCKS = ['M1', 'M2', 'M3']
const S_BLOCKS = ['S1', 'S2', 'S3']
function expectedRoomNos(blockType, floor) { /* ... */ }
```

Eklenir:
```js
import { BLOCKS_BY_TYPE, expectedRoomNos, getCapacity, getFloorLabel, getBlockConfig } from '../../shared/blocks.js'
```

### 5.2 Block Type Switcher

Mevcut `['M', 'S']` butonları `['M', 'S', 'Y']` olur. Stil aynı.

### 5.3 Dinamik Kat Seçici

```jsx
const cfg = getBlockConfig(selectedBlock)
const floorList = Array.from({ length: cfg?.floors ?? 0 }, (_, i) => i + 1)

{floorList.length > 1 && (
  <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto' }}>
    {floorList.map(f => (
      <button onClick={() => setFloor(f)} ...>
        KAT {f}
        <span>{getFloorLabel(selectedBlock, f)}</span>
      </button>
    ))}
  </div>
)}
```

`floorList.length === 1` ise selector tamamen render edilmez. Tek katlı bloğa geçilince `floor` state'i `1`'e set edilir.

### 5.4 Plan Panel

- **Gradient**: M = `mavi→mor`, S = `mor→teal`, Y = `teal→yeşil` (yeni: `linear-gradient(90deg,var(--teal),var(--green))`)
- **Subtitle**: `KORİDOR PLANI · ODA ${getFloorLabel(block, floor)}`
- **Tag**: `<span className="tag tag-${type.toLowerCase()}">{type}</span>` — `tag-y` CSS sınıfı eklenir (yeşilimsi)

### 5.5 Placeholder Banner

`isS2Floor2` warning'in yanında yeni bir banner:

```jsx
{cfg?.isPlaceholder && (
  <div className="alert alert-warn" style={{ marginBottom: '12px' }}>
    <span>⚠</span>
    <span>
      <strong>PLACEHOLDER:</strong> Bu bloğun kapasitesi henüz girilmedi (1 kişilik). Doğru yatak sayılarını oda detayından düzenleyin.
    </span>
  </div>
)}
```

### 5.6 Header Lejantı

Mevcut 3 satıra 4. satır eklenir:
```
■ A/A1-A4/B/C/D/E/F/G/H/J — KAPASİTE PLACEHOLDER · ÖZEL BANYO
```
Renk: `var(--green)` (Y tip teması).

### 5.7 CorridorPlan İç Davranış

`expectedRoomNos(block, floor)` config'ten gelir. SOL/SAĞ split (odd/even) **korunur** — H/J için 1-20 numaralandırması da odd/even bölünür (1,3,5,...,19 vs 2,4,...,20). M-only `<FacilityCell>` koşulu `!cfg.hasPrivateBath` ile değiştirilir (private bath yoksa facility göster). 🚿 ikon koşulu `cfg.hasPrivateBath` olur.

S2 kat 2 istisnası `cfg.capacityException?.floor === floor` üzerinden türetilir; mevcut `isS2Floor2` literal kontrol bu helper'a yönlendirilir.

## 6. Frontend — HousekeepingPage Değişiklikleri

### 6.1 Tab Yapısı (YENİ)

Mevcut housekeeping'te tab yok; capacity'deki M/S/Y switcher aynı görsel olarak replikalanır. State:

```js
const [blockType, setBlockType] = useState('M')
const blocks = BLOCKS_BY_TYPE[blockType]
```

Block chip'leri tab'a göre filtrelenir (3 / 3 / 13).

### 6.2 Sabit Temizleme

```js
const ALL_BLOCKS = ['M1','M2','M3','S1','S2','S3']  // SİL
function blockRoomNos(block, floor) { /* SİL */ }
```

`expectedRoomNos` (capacity'den gelen) kullanılır. `String(...)` cast'ı yapılır (housekeeping mevcut kodu string oda no kullanıyor).

### 6.3 Dinamik Kat Seçici

Capacity ile **birebir aynı**: `floorList`, 1 katlıda gizli, label config'ten.

### 6.4 RoomTile

`isM` prop'u `!cfg.hasPrivateBath` ile değiştirilir. `isS2Floor2` kalır (S2 kat 2 etiketi). 🚿 ikonu `hasPrivateBath` true olan tüm bloklarda gösterilir.

### 6.5 Görev Üretimi

`+ GÖREV OLUŞTUR` butonu backend'in `/housekeeping/tasks/generate` endpoint'ini çağırır. Backend tüm `rooms` tablosunu okur — yeni blokların odaları otomatik dahil edilir, ek backend değişikliği gerektirmez.

## 7. Backend Etkisi

**Sıfır kod değişikliği.** Sadece `seedProdRooms.js` ve `seedProdRooms.test.js` güncellenir (bkz. madde 3).

## 8. Test Stratejisi

### 8.1 Seed Testleri (`backend/src/shared/db/seedProdRooms.test.js`)

- `'M1-M3 + S1-S3 + yeni 13 blok toplam 814 oda olusturur'` — 734→814
- `'idempotent — ikinci cagrida yeni oda eklenmez'` — skipped 814
- A1-A4 + B + A + C testi: her biri 40 oda, kapasite 1 (5 → 7 blok)
- Mevcut diğer testler korunur (E/G/F/D/H/J + numaralandırma + M/S koruma)

### 8.2 Frontend Unit Testleri (`frontend/src/shared/blocks.test.js` — YENİ)

Vitest ile:
- `expectedRoomNos('M1', 1)` → `[101..130]`
- `expectedRoomNos('H', 1)` → `[1..20]`
- `expectedRoomNos('E', 3)` → `[301..320]`
- `expectedRoomNos('F', 3)` → `[301..310]`
- `expectedRoomNos('D', 2)` → `[]` (D tek katlı)
- `getCapacity('S2', 2)` → `4`
- `getCapacity('S2', 1)` → `6`
- `getCapacity('A', 1)` → `1`
- `getFloorLabel('F', 3)` → `'301–310'`
- `getFloorLabel('H', 1)` → `'1–20'`
- `BLOCKS_BY_TYPE.Y.length` → `13`
- `BLOCKS.length` → `19`

### 8.3 Smoke Doğrulaması (manuel)

1. `seedProdRooms()` → `{ inserted: 814, skipped: 0, total_in_db: 814 }`
2. Capacity sayfası: M / S / Y tab geçişi → her birinde doğru blok chip'leri
3. Bir Y bloğu seç (örn. F): kat seçici 3 chip, label "101–110 / 201–210 / 301–310"
4. Tek katlı bir Y bloğu seç (örn. H): kat seçici **görünmez**, oda planı "1, 2, 3..." olarak başlar
5. Y bloğunda placeholder banner görünür
6. Housekeeping sayfası: aynı M/S/Y tab navigasyonu, görev üretildiğinde Y bloklarda da task tile'lar oluşur

## 9. CSS Eklenmesi

`frontend/src/index.css` (veya benzeri ana stylesheet) içine:
```css
.tag-y { background: rgba(39,201,106,.18); color: var(--green); border-color: rgba(39,201,106,.4); }
```

`tag-m` ve `tag-s` mevcut deseninin Y için karşılığı.

## 10. Şema/Constraint Etkisi — Yok

Tüm yeni bloklar mevcut `rooms` tablosu ve CHECK constraint'leri ile uyumlu. INSERT OR IGNORE seed'in idempotency garantisini korur.

## 11. Riskler ve Tradeoff'lar

| Risk | Etki | Hafifletme |
|------|------|------------|
| H/J `1-20` numaralandırması mevcut "100lü" varsayımı olan başka bir frontend modülünü kırabilir | Orta | Diğer modüllerde `block + room_no` görüntüleyen tüm yerler config-driven değil mi diye gözden geçir; `room_history`, `discipline`, `checkin` gibi sayfalarda label sorununu test et |
| `Y` tipi için yeni renk teması (teal-green) mevcut UI tonlarıyla çakışabilir | Düşük | Görsel doğrulama smoke testinde kontrol |
| Shared config import'u test ortamında path resolution sorunu çıkarabilir | Düşük | Vitest mevcut alias'ı (`shared/`) zaten destekliyor; standart import |
| Capacity seed'i halen 13 yerine 11 için yazıldığından test çalıştırılırsa hatalı sayılar dönebilir | Yüksek | Plan'da bu adım Task 1 olur; test ve seed birlikte güncellenir |

## 12. Ileri İş (Kapsam Dışı)

- Yeni blokların kapasitelerinin gerçek değerlere güncellenmesi (UI üzerinden BedEditor)
- Mobile housekeeper PWA'ya yeni blok desteği
- Reports modülünde Y bloklarının ayrı bir kategori olarak listelenmesi
- 3 yapısal alt-tab (A/B/C grubu, EFG grubu, DHJ grubu) gerekirse ileride
