# Vardiyalar UX Redesign — Spec

**Tarih:** 2026-03-25
**Kapsam:** ShiftsPage — navigasyon temizleme, çizelge UX yenileme, görsel modernizasyon
**Yaklaşım:** B — hedefli yenileme, mevcut mimari korunur

---

## 1. Kapsam

### Çözülen sorunlar
- Çok fazla sekme, Takas gereksiz kalabalık yaratıyor
- Çizelge popovert scroll'da yanlış konumlanıyor
- Drag & drop ile hızlı vardiya ataması yok
- Günlük departman bazlı görünüm yok
- Personel adına tıklayınca profil açılmıyor (çizelgeden)
- Toolbar çok kalabalık

### Kapsam dışı
- Backend değişikliği yok
- Takas backend route'ları silinmez — sadece nav'dan gizlenir
- Puantaj sekmesi ayrı spec'te ele alındı (2026-03-24)
- ShiftsPage.jsx dosya bölünmesi yapılmaz

---

## 2. Navigasyon

### Nav item listesi (değişiklik)
Mevcut 8 öğeden 7'ye:

| Ikon | Label | Değişiklik |
|---|---|---|
| 📅 | Çizelge | — |
| 👥 | Personel | — |
| 🏖️ | İzinler | + bekleyen izin badge |
| ⏰ | Mesai | — |
| 📊 | Puantaj | — |
| 🏢 | Bölümler | — |
| ⚙️ | Ayarlar | — |
| 🔄 | Takas | **KALDIRILIR** |

### Badge sistemi
Nav genişletildiğinde (`navExpanded = true`) bazı sekmelerde küçük sayı badge'i:

- **İzinler**: bekleyen (`status='pending'`) izin talebi sayısı — kırmızı badge
- Badge verisi: mevcut `useQuery(['leave'])` listesinden `useMemo` ile türetilir — ekstra API çağrısı yok
- Badge 0 ise gizlenir

### Nav item layout (genişletilmiş)
```
[ikon]  [label]  [badge?]
```
Daraltık: sadece ikon + badge (badge köşede küçük nokta olarak)

---

## 3. Çizelge Sekmesi

### 3.1 Toolbar yeniden düzenlemesi

**Mevcut toolbar (karmaşık):**
← hafta → | Bu hafta | Dept filtre | Toplu Doldur | Tüm Doldur | Kopyala | Excel | + Kişi Ekle

**Yeni toolbar (sade):**
```
← [YYYY-AA-GG] → | Bu Hafta | [HAFTALIK] [GÜNLÜK] | Dept filtresi | ⋯ Araçlar
```

**"⋯ Araçlar" dropdown içeriği:**
- Toplu Vardiya Doldur
- Tüm Personeli Doldur
- Haftayı Kopyala
- Excel Import
- + Çizelgeye Kişi Ekle

Dropdown: `position: absolute`, `z-index: 100`, `background: var(--surface)`, `border: 1px solid var(--border)`, `border-radius: 10px`, `box-shadow`. Dışarı tıklayınca kapanır.

### 3.2 Görünüm modları

State: `const [scheduleView, setScheduleView] = useState('weekly')` — `'weekly' | 'daily'`

**HAFTALIK görünüm:** Mevcut hafta×personel grid (değiştirilmez, sadece popover fix + D&D eklenir).

**GÜNLÜK görünüm:** Yeni bileşen `DailyView`. Seçili tarih o anki `weekStart`'ın ilk günü — veya günlük moda geçince `today`. Tarih seçici (← gün →) toolbar'da.

```
[Tarih seçici: ← 25 Mart 2026 →]

┌─ TEMİZLİK ─────────── 8 kişi ─┐
│  Sabah (08-16):  ▓▓▓▓▓▓ 6 kişi │
│  Akşam (16-24):  ▓▓ 2 kişi     │
│  Yokta: Ahmet Y. · Fatma K.    │
└────────────────────────────────┘

┌─ MUTFAK ────────────── 5 kişi ─┐
│  Sabah: ▓▓▓▓▓ 5 kişi           │
│  İzinde: 1 kişi                │
└────────────────────────────────┘
```

Veri kaynağı: mevcut `GET /shifts/personnel?date=YYYY-MM-DD` — `staffStatusService`. Yeni API yok.

### 3.3 Popover Fix (kritik bug)

**Problem:** `InlinePopover` bileşeni (`ShiftsPage.jsx` ~satır 228) `rect` prop'una göre konumlanıyor. Ancak `rect` `getBoundingClientRect()` döndürüyor — bu değerler viewport-relative. `position: absolute` ile kullanılınca scroll ile kayıyor.

**Fix:** `InlinePopover`'ı `position: fixed` yapılır. Zaten `rect.top/left` viewport-relative olduğundan `position: fixed` ile doğru konumlanır.

Ek: Viewport kenar kontrolü — eğer `rect.top > window.innerHeight / 2` ise popover `top: rect.top - popoverHeight` (yukarı açılır), değilse `top: rect.bottom` (aşağı açılır).

```js
const openUpward = rect.top > window.innerHeight / 2
const style = {
  position: 'fixed',
  left: Math.min(rect.left, window.innerWidth - 280),
  top: openUpward ? rect.top - estimatedHeight : rect.bottom + 4,
  zIndex: 200,
}
```

`estimatedHeight`: popover içeriğine göre `~240px` sabit.

### 3.4 Drag & Drop vardiya ataması

**Shift palette:** Toolbar'ın hemen altında sabit dar şerit (sadece HAFTALIK modda görünür):

```
Vardiya palette: [▓ Sabah 08-16] [▓ Öğlen 12-20] [▓ Gece 20-08] [✗ Sil]
```

Her item `draggable={true}`, `onDragStart` ile `shiftDefId` set edilir (HTML5 DataTransfer API).

Çizelge hücreleri `onDragOver` + `onDrop`:
- `onDragOver`: `e.preventDefault()`, hücreye highlight class ekler
- `onDrop`: `bulkAssignService` çağrısı (mevcut API) — `{ staff_id, work_date, shift_def_id, status: 'scheduled' }`
- Drop sonrası `['schedule', weekStart, deptFilter]` query invalidate

Kısıtlar:
- Sadece `canEdit` kullanıcılar için aktif (manager/supervisor)
- Mobile'da drag devre dışı (`'ontouchstart' in window` kontrolü)

### 3.5 İsim → Profil (çizelgeden)

Mevcut: `ScheduleTab` personel adına tıklanınca `onPersonClick(staffId)` çağrılıyor — fakat bu şu an sadece `StaffTab`'da var, `ScheduleTab`'da yok.

**Fix:** `ScheduleTab`'daki personel adı (`<td>` sticky sol kolon) onClick'ine `() => onPersonClick(row.id)` eklenir. Mevcut `onPersonClick` prop zaten `ShiftsPage` level'dan geliyor.

---

## 4. Görsel Modernizasyon

### 4.1 Çizelge tablosu
- Hücre min-height: `52px → 58px`
- Boş hücre hover: `border: 1px dashed var(--border)`, içinde `+` işareti (opacity: 0.4)
- Vardiya chip: `border-radius: 6px`, font `var(--mono)`, `font-size: 10px`, daha kompakt
- Sticky isim kolonu: ince dept renk sol bandı (3px) — zaten var, korunur

### 4.2 Toolbar
- Araçlar dropdown butonu: `btn-ghost`, ikon `⋯`, chevron `▾`
- Görünüm toggle butonları: mevcut `filter-chip` class ile tutarlı

### 4.3 Günlük görünüm kartları
- `border-radius: 14px`, `border: 1px solid var(--border)`, `background: var(--surface)`
- Sol üst köşe: departman rengi 4px bant
- Vardiya gruplar: renk kodlu badge + kişi sayısı
- Yokta/izinde kişiler: soluk metin, isim listesi

### 4.4 Nav badge
- Badge: `font-size: 9px`, `background: var(--red)`, `color: #fff`, `border-radius: 999px`, `padding: 1px 5px`
- Genişletilmiş: label'ın yanında inline
- Daraltık: ikonun sağ üst köşesinde küçük kırmızı nokta (`width: 8px, height: 8px`)

---

## 5. Etkilenen Dosyalar

| Dosya | Değişiklik |
|---|---|
| `frontend/src/modules/shifts/ShiftsPage.jsx` | Nav (Takas kaldır, badge), ScheduleTab (toolbar, popover fix, D&D, isim click, DailyView), görsel güncellemeler |
| `frontend/src/index.css` | Drag highlight class, araçlar dropdown stilleri |

Backend değişikliği yok.

---

## 6. Kısıtlar & Kararlar

- Tailwind kullanılmaz — tüm stiller CSS variables + mevcut utility class'lar
- Drag & Drop: HTML5 native API (harici kütüphane yok)
- `DailyView` için yeni API çağrısı yok — `GET /shifts/personnel` kullanılır
- Takas sekmesi backend'de tutulur, sadece `NAV_ITEMS` dizisinden çıkarılır
- Badge verisi client-side hesaplanır — ekstra endpoint yok
- Mobile'da D&D devre dışı
- `InlinePopover` refactor: `position: absolute → fixed`, viewport kenar kontrolü eklenir
