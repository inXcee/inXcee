# Çamaşırhane Modülü v4 — Design Spec

**Tarih:** 2026-03-29
**Kapsam:** UI polish, renk+desen seçici, kıyafet ikonları, not sticker, kanban DnD fix, makine sayacı, günlük istatistik, hızlı ekleme, ayarlar genişletme
**Yaklaşım:** 2 Faz — Faz 1 DB gerektirmez, Faz 2 migration içerir

---

## Genel Hedef

Çamaşırhane modülünü kullanılabilirlik ve görsellik açısından güçlendir:

1. **UI polish** — sayfa tam genişlik, büyük yazılar, okunabilir layout
2. **Renk + Desen seçici** — solid renkler + çizgili/kareli/renkli desenler
3. **Kıyafet ikonları** — her kıyafet tipinin yanında emoji ikonu
4. **Not sticker** — sayfada daima görünür yapışık not paneli
5. **Kanban DnD fix** — sürükleme hassasiyeti ve snap davranışı düzeltmesi
6. **Makine çalışma sayacı** — kaç kere ve ne kadar çalıştığı
7. **Günlük istatistik** — bugün kaç parça yıkandı KPI'a eklenir
8. **Hızlı kıyafet ekleme** — modal açmadan inline hızlı kayıt
9. **Ayarlar genişletme** — kıyafet tipi yönetimi + günlük hedef

---

## Faz 1 — UI Polish (DB değişikliği yok)

### 1.1 Sayfa Büyütme

`LaundryHub.jsx`:
- `maxWidth: 1200 → 1600px` (kanban görünümünde)
- KPI kart büyük rakam: `fontSize: 44 → 52px`
- Section tab `fontSize: 9 → 11px`
- Kanban col `minWidth: 220 → 260px`, `maxHeight: 520 → 680px`
- Header başlık `fontSize: 30 → 36px`

### 1.2 Renk + Desen Seçici

`NewItemModal.jsx` — `COLOR_PALETTE` değişmez, altına `PATTERN_LIST` eklenir:

```js
const PATTERN_LIST = [
  { name: 'Düz Çizgili',    css: 'repeating-linear-gradient(90deg, {c1} 0 4px, {c2} 4px 8px)' },
  { name: 'Yatay Çizgili',  css: 'repeating-linear-gradient(0deg, {c1} 0 4px, {c2} 4px 8px)' },
  { name: 'Çapraz Çizgili', css: 'repeating-linear-gradient(45deg, {c1} 0 4px, {c2} 4px 8px)' },
  { name: 'Kareli',         css: 'repeating-conic-gradient({c1} 0% 25%, {c2} 0% 50%) 0 0/8px 8px' },
  { name: 'Renkli Karnaval',css: 'repeating-linear-gradient(90deg,#e74c3c 0 6px,#f0a500 6px 12px,#2563eb 12px 18px,#16a34a 18px 24px)' },
  { name: 'İki Renk',       css: 'linear-gradient(135deg, {c1} 50%, {c2} 50%)' },
]
```

Her desen için önceki satırda renk seçilir (`c1` = seçilen solid renk), `c2` için ikinci renk seçici açılır (hafif renk paleti). Seçilen kombinasyon `color` alanına `"Beyaz + Lacivert Çizgili"` formatında yazılır. 28×28px kare önizleme, hover tooltip'i.

Kıyafet satırı layout'u:
```
[ikon + tip adı] [renk yuvarlakları] [desen kareler] [adet ±] [✕]
```

### 1.3 Kıyafet İkonları

`NewItemModal.jsx` ve `ItemCard` / `ExpandedSection`'da kullanılır:

```js
const CLOTHING_ICONS = {
  'Pantolon': '👖', 'Gömlek': '👔', 'T-Shirt': '👕',
  'Kazak': '🧥', 'Sweat': '🩱', 'Polar': '🧤',
  'Mont': '🧥', 'Hırka': '🧶', 'Body': '🩲',
  'İçlik': '🩳', 'Alt Eşofman': '🩲', 'Üst Eşofman': '👕',
  'Boxer': '🩲', 'Külot': '🩲', 'Çorap': '🧦',
  'Havlu Tkm': '🏖️', 'El Havlusu': '🧻', 'Ayak Havlusu': '🧻',
  'Büyük Havlu': '🛁', 'Ceket': '🥼', 'Yastık K.': '🛏️',
  'İş Mont': '🦺', 'İş Pantalonu': '👖', 'Şort': '🩳',
  'Atlet': '👕', 'Diğer': '📦',
}
```

Chip butonları: `{icon} {type}` formatında.
Kart preview ve ExpandedSection'da: `{icon} {qty}× {type}`.

### 1.4 Not Sticker

`QuickNotes` bileşeni yeniden tasarlanır:

- Konumu: `position: fixed, bottom: 24px, right: 24px, zIndex: 980`
- Kapalı: 44×44px sarı yuvarlak buton, `📋` + not sayısı badge
- Açık: 220×280px sarı panel (`background: linear-gradient(135deg,#f5e642,#f0c030)`), `rotate(-1.5deg)`, sol kenar koyu sarı `border-left`
- İçerik: textarea + temizle butonu
- `box-shadow: 4px 6px 20px rgba(0,0,0,0.5)`
- Sadece `section === 'hub'` olduğunda render edilir

### 1.5 Kanban DnD Fix

`LaundryHub.jsx` sensor ayarı:
```js
useSensor(PointerSensor, {
  activationConstraint: {
    distance: 5,
    delay: 100,
    tolerance: 5,
  }
})
```

`DraggableKanbanCard`:
- `CSS.Translate.toString(transform)` yerine `CSS.Transform.toString(transform)` (scale dahil)
- Sürüklenen kart: `transform: scale(1.03), zIndex: 999, boxShadow: '0 12px 40px rgba(0,0,0,0.5)'`
- `transition` sadece `isDragging` false olduğunda aktif (sürükleme sırasında gecikmesiz)

---

## Faz 2 — Yeni Özellikler (DB migration gerekli)

### 2.1 Makine Çalışma Sayacı

**DB migration** (`backend/src/shared/db/index.js`):
```sql
ALTER TABLE laundry_machines ADD COLUMN total_runs INTEGER DEFAULT 0;
ALTER TABLE laundry_machines ADD COLUMN timer_started_at TEXT;  -- zaten var
```

**Service** (`laundry/service.js` veya `queries.js`):
- `setTimer()` çağrısında: `UPDATE laundry_machines SET total_runs = total_runs + 1 WHERE id = ?`

**MachineCard** footer:
```
{m.active_items} yıkama · {m.total_runs || 0}× çalıştı
```

### 2.2 Günlük Yıkanan Parça İstatistiği

**Backend** (`queries.js` — `getStats()`):
```sql
SELECT COUNT(*) as count
FROM laundry_history
WHERE to_status = 'washing'
  AND date(created_at) = date('now')
```

**KPI Strip** — 6. kart: `{ label: 'Bugün Yıkanan', value: stats?.washed_today ?? 0, color: 'var(--blue)' }`

### 2.3 Hızlı Kıyafet Ekleme (Quick Add)

`LaundryHub.jsx` hub bölümüne inline panel eklenir. Header satırında `+ Hızlı Ekle` butonu. Tıklayınca KPI strip ile kanban arasında küçük panel açılır:

```
[Ad Soyad input] [Kıyafet chip'leri] [Oda (opsiyonel)] [Kaydet]
```

- `room_id: null` olabilir (oda zorunlu değil)
- `intake_name` zorunlu
- Kıyafet tipi seçilmezse `item_count: 1`
- Başarıyla kaydedince panel kapanır, kanban yenilenir

### 2.4 Ayarlar Genişletme

`LaundrySettings.jsx`'e 2 yeni sekme:

**Kıyafetler sekmesi:**
- Varsayılan `CLOTHING_TYPES` listesi görünür
- `+ Ekle` ile yeni tip eklenir, ✕ ile silinir
- `localStorage`'da `custom-clothing-types` anahtarıyla saklanır
- `NewItemModal` bu listeyi okur

**Hedefler sekmesi:**
- Günlük hedef parça sayısı (input, default: 50)
- Uyarı eşiği % (default: 80) — hedefe ulaşıldığında KPI rengi değişir
- `localStorage`'da `laundry-daily-goal` anahtarıyla saklanır

---

## Bileşen Değişim Özeti

| Bileşen | Faz | Değişim |
|---|---|---|
| `LaundryHub.jsx` | 1 | maxWidth, font, QuickNotes, DnD fix, Quick Add panel |
| `NewItemModal.jsx` | 1 | Desen seçici, kıyafet ikonları, layout genişliği |
| `ItemCard.jsx` | 1 | Kıyafet ikonları |
| `MachineStrip.jsx` | 2 | total_runs gösterimi |
| `LaundrySettings.jsx` | 2 | Kıyafetler + Hedefler sekmeleri |
| `backend/queries.js` | 2 | washed_today sorgusu, total_runs increment |
| `backend/db/index.js` | 2 | total_runs migration |

---

## Test Kriterleri

**Faz 1:**
- [ ] Sayfa 1600px'de taşmıyor, scroll yok
- [ ] Desen seçilince renk alanına doğru string yazılıyor
- [ ] İkonlar tüm kıyafet tiplerinde görünüyor
- [ ] Sticker açılıp kapanıyor, localStorage'a yazılıyor
- [ ] Kanban sürükleme scroll'u tetiklemiyor, bırakınca kart yerine oturuyor

**Faz 2:**
- [ ] `total_runs` timer başlatınca artıyor, sıfırlamada artmıyor
- [ ] `washed_today` bugün yıkanan gerçek sayıyı gösteriyor
- [ ] Hızlı ekle: oda olmadan kayıt oluşuyor, kanban'a düşüyor
- [ ] Ayarlar > Kıyafetler: eklenen tip NewItemModal'da görünüyor
- [ ] Ayarlar > Hedefler: hedef kaydediliyor, KPI rengi değişiyor
