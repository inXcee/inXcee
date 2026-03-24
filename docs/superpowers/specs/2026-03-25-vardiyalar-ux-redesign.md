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
- Badge verisi: ShiftsPage root'una eklenen tek bir `useQuery` ile — mevcut tab'ların içindeki query'ler ShiftsPage seviyesinde erişilemez:
  ```js
  const { data: pendingLeaves = [] } = useQuery({
    queryKey: ['leaves', 'badge'],
    queryFn: () => api.get('/shifts/leave?status=pending').then(r => r.data),
    staleTime: 60000,
  })
  const pendingLeaveCount = pendingLeaves.length
  ```
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

Dropdown: `position: fixed`, buton click'inde `getBoundingClientRect()` ile konumlanır (aynı `InlinePopover` pattern'i). `ScheduleTab`'ı içeren content area `overflow: hidden` + `overflowY: auto` ancestor'lara sahip, `position: absolute` dropdown clipping riski taşır.

```js
const [toolsRect, setToolsRect] = useState(null)
const openTools = (e) => setToolsRect(e.currentTarget.getBoundingClientRect())

// Dropdown style:
{
  position: 'fixed',
  top: toolsRect.bottom + 4,
  right: window.innerWidth - toolsRect.right,
  zIndex: 100,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: '10px',
  boxShadow: '0 8px 24px rgba(0,0,0,.3)',
  minWidth: '200px',
}
```

Dışarı tıklayınca kapanır (`mousedown` handler, `InlinePopover` ile aynı pattern).

### 3.2 Görünüm modları

State: `const [scheduleView, setScheduleView] = useState('weekly')` — `'weekly' | 'daily'`

**HAFTALIK görünüm:** Mevcut hafta×personel grid (değiştirilmez, sadece popover fix + D&D eklenir).

**GÜNLÜK görünüm:** Yeni bileşen `DailyView`. Başlangıç tarihi: günlük moda geçilince `today` (bugün). Tarih seçici (← gün →) toolbar'da.

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

`DailyView` gruplama mantığı: `getStaffWithShiftStatus` şu kolonları döndürür: `shift_status` (shift_schedule.status), `leave_status` (leave_requests.status — sadece approved olanlar), `shift_name`, `dept_name`.

Gruplama kuralları (her personel kaydı için):
- `leave_status === 'approved'` → **İzinde** (approved leave_request var, tarih aralığında)
- `shift_status === 'on_leave'` → **İzinde** (shift_schedule'da on_leave olarak işaretli)
- `shift_status === 'scheduled'` veya `'overtime'` → shift_name'e göre alt grup (Sabah/Öğlen/Gece...)
- `shift_status === null && leave_status === null` → **Yokta** (hiç kayıt yok)

Her departman grubu kendi kartında gösterilir (`dept_name`'e göre). Kart içinde alt gruplar: her shift_name için kişi sayısı + progress bar, İzinde ve Yokta bölümleri.

### 3.3 Popover Fix (kritik bug)

**Gerçek kök neden:** `SidePanel` ve `InlinePopover` zaten `position: fixed` kullanıyor — bu doğru. Asıl sorun: `ScheduleTab` `<div className="fade-up">` döndürüyor. `index.css`'de `@keyframes fadeUp` şu anda:

```css
@keyframes fadeUp { from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)} }
.fade-up { animation: fadeUp .3s ease both; }
```

`animation-fill-mode: both` — animasyon bitince `to` keyframe'indeki değerler kalıcı olarak uygulanır. `to` keyframe'inde `transform: translateY(0)` var. CSS spec'e göre **herhangi bir `transform` değeri** (kimlik transform dahil) o elementi `position: fixed` child'lar için "containing block" yapar. Sonuç: `SidePanel` viewport yerine `.fade-up` div'e göre konumlanır. Kullanıcı sayfayı scroll ettiğinde containing block da kayar, panel off-screen gider (yukarı).

**Fix:** `index.css`'deki üç `@keyframes` kuralında `to` keyframe'i `transform: none` olarak güncellenir:

```css
/* ÖNCE */
@keyframes fadeUp   { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
@keyframes fadeIn   { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }
@keyframes slideInRight { from{transform:translateX(100%)} to{transform:translateX(0)} }

/* SONRA */
@keyframes fadeUp   { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }
@keyframes fadeIn   { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:none} }
@keyframes slideInRight { from{transform:translateX(100%)} to{transform:none} }
```

Üç kural da `animation-fill-mode: both/forwards` ile kullanılıyor; `to` keyframe'inde `transform: TranslateY/X(0)` kalması her biri için aynı containing block sorununu yaratıyor. `transform: none` ile artık containing block oluşturulmaz. `SidePanel` / `InlinePopover` bileşenlerinde kod değişikliği gerekmez.

### 3.4 Drag & Drop vardiya ataması

**Shift palette:** Toolbar'ın hemen altında sabit dar şerit (sadece HAFTALIK modda görünür):

```
Vardiya palette: [▓ Sabah 08-16] [▓ Öğlen 12-20] [▓ Gece 20-08] [✗ Sil]
```

Her item `draggable={true}`, `onDragStart` ile `shiftDefId` set edilir (HTML5 DataTransfer API).

Çizelge hücreleri `onDragOver` + `onDrop`:
- `onDragOver`: `e.preventDefault()`, hücreye highlight class ekler
- `onDrop`: mevcut `assignCell` mutation kullanılır (`ScheduleTab` içinde tanımlı, satır ~1401):
  - `assignCell.mutate({ staffId, deptId, shiftDefId, date, status: 'scheduled' })`
  - `assignCell.isPending` kontrolü: pending iken aynı hücreye drop kabul edilmez (`onDragOver`'da `e.preventDefault()` çağrılmaz)
  - `assignCell` zaten `onSuccess`'te `['schedule']` query invalidate ediyor — ek invalidate gerekmez
  - `onError` handler `assignCell` tanımına eklenir: kullanıcıya inline hata gösterilir (mevcut toast/notification mekanizması)
  - Drop sırasında hücre `opacity: 0.5, cursor: wait` görünür

Kısıtlar:
- Sadece `canEdit` kullanıcılar için aktif (manager/supervisor)
- Mobile'da drag devre dışı (`'ontouchstart' in window` kontrolü)

### 3.5 İsim → Profil (çizelgeden)

**Durum: Zaten uygulanmış.** `ScheduleTab`'daki sticky sol kolon (satır ~1776) zaten `onClick={() => onPersonClick?.(person.id)}` içeriyor. Implementasyon gerekmez — doğrulama yeterli.

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
- Badge verisi için ShiftsPage root'una `useQuery(['leaves', 'badge'])` eklenir — küçük bir API çağrısı, yalnızca pending kayıtlar
- Mobile'da D&D devre dışı
- Popover fix: `index.css`'de `fadeUp`, `fadeIn`, `slideInRight` keyframes'inin `to` keyframe'i `transform: none` olur — `SidePanel`/`InlinePopover` bileşen kodunda değişiklik yok
- D&D drop işlemi mevcut `assignCell` mutation kullanır; `onError` handler + `isPending` guard eklenir
- Araçlar dropdown'u: `position: fixed` + `getBoundingClientRect()` (overflow clipping'den kaçınmak için)
- İsim → profil geçişi zaten ScheduleTab'da uygulanmış — doğrulama yeterli
