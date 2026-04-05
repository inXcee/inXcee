# Premium Kıyafet Giriş + Arama İyileştirme — Tasarım

**Tarih:** 2026-04-05  
**Dosyalar:** `PremiumGarmentList.jsx`, `PremiumSearchPanel.jsx`, `backend/queries.js`

---

## Kapsam

1. **Hızlı metin girişi + adet alanı** — PremiumGarmentList inline formuna
2. **Premium arama iyileştirmeleri** — PremiumSearchPanel'e

---

## 1. Hızlı Giriş + Adet (PremiumGarmentList)

### Değişiklik

`PremiumGarmentList.jsx` formunun üstüne "⚡ HIZLI GİRİŞ" alanı eklenir. Mevcut tip/marka/beden/renk alanları korunur, sadece `quantity` alanı eklenir.

### Parse Kuralları (client-side, regex tabanlı)

Girilen metin şu sırayla parse edilir:

| Alan | Kural |
|------|-------|
| **Adet** | Baştaki sayı (`3 gömlek`), `x3`, `3x`, `3 adet` — parse sonrası metinden çıkarılır |
| **Kıyafet tipi** | GARMENT_TYPES listesindeki kelimeler (case-insensitive, `t-shirt` / `tişört` eşleşmesi dahil) |
| **Renk** | COLOR_PALETTE isim listesi (case-insensitive Türkçe) |
| **Desen** | `çizgili`, `kareli`, `desenli`, `renkli` |
| **Beden** | SIZES listesi (`XS`, `S`, `M`, `L`, `XL`, `XXL`, `3XL`, `36`–`48`) — tam eşleşme, büyük/küçük harf yok sayılır |
| **Marka** | Tanınmayan kalan kelimeler (ilk büyük harfli kelime veya tüm kalan) |

Parse **anlık** (her tuş basımında), `onChange` ile tetiklenir. Tags satırında renkli etiketler gösterilir.

"↵ Doldur" butonu veya `Tab` tuşu → parse sonuçları form alanlarını doldurur. Kullanıcı alanları sonradan elle düzenleyebilir.

### Adet Alanı

- Form grid'ine `quantity` sayı inputu eklenir (min: 1, max: 20, default: 1)
- `emptyForm()` → `quantity: 1` ekle
- `addMut.mutationFn` → tek `addPremiumGarments` çağrısı, `Array(quantity).fill(garmentObj)` gönderilir
- Ekle butonu: `+ ${quantity} Adet Ekle` (quantity > 1 ise adet göster)

### Bileşen Değişikliği

`PremiumGarmentList.jsx` içinde:
- `quickText` ve `parsedTags` state ekle (form state değil, ayrı)
- `parseQuickText(text)` → `{ garment_type, colors, pattern, size, brand, quantity }` döner
- "Doldur" butonu `setForm(f => ({ ...f, ...parsedFields }))` yapar
- Hızlı giriş alanı ile form alanları birbirinden bağımsız — her ikisi de çalışır

---

## 2. Premium Arama İyileştirmeleri (PremiumSearchPanel)

### 2a. Anlık Arama (debounce)

- `useEffect` + 400ms `setTimeout` → filtreler her değiştiğinde `setActiveFilters` tetiklenir
- "Ara" butonu korunur (manuel tetikleme için)
- Sayfa sıfırlanır her filtre değişiminde

### 2b. Sonuçlarda Renk Dotları + Desen Badge

Sonuç satırındaki `g.color` metin olarak gösterilmek yerine:
- `parseColors(g.color)` → renkli daireler (ColorPatternDisplay component'i import)
- `g.pattern` → mor badge

Filtre grid'ine "DESEN" dropdown eklenir (`Çizgili`, `Kareli`, `Desenli`, `Renkli`, Tümü).

### 2c. Kişi Adıyla Arama

Filtre grid'ine "KİŞİ ADI" text input eklenir (`intake_name`).

**Backend — `searchPremiumGarmentsQuery`:**
- `intake_name` parametresi eklenir: `conditions.push("li.intake_name LIKE ?")`, `params.push(\`%${intake_name}%\`)`
- `pattern` parametresi eklenir: `conditions.push("pg.pattern LIKE ?")`, `params.push(\`%${pattern}%\`)`
- SELECT'e `li.intake_name` eklenir (sonuçlarda gösterilecek)

**Backend — routes/service:** ilgili handler'a `intake_name` ve `pattern` geçirimi.

**Frontend — `laundryApi.searchPremiumGarments`:** `intake_name` ve `pattern` parametreleri eklenir.

---

## Dosya Listesi

| Dosya | Değişiklik |
|-------|------------|
| `frontend/.../PremiumGarmentList.jsx` | quickText state + parseQuickText + quantity alan + mutasyon güncelleme |
| `frontend/.../PremiumSearchPanel.jsx` | debounce + desen filtresi + kişi filtresi + renk/desen gösterimi |
| `frontend/.../ColorPatternPicker.jsx` | Import — sadece `ColorPatternDisplay` + `parseColors` kullanılır, değişiklik yok |
| `backend/.../queries.js` | `searchPremiumGarmentsQuery` — `intake_name` + `pattern` filtre + SELECT |
| `backend/.../service.js` | `searchPremiumGarmentsService` — yeni param geçirimi |
| `backend/.../routes.js` | query param okuma |

---

## Test

Backend değişikliği (queries.js) var → `npx vitest run` çalıştırılacak. Yeni test gerekmez: mevcut laundry testleri search fonksiyonunu zaten kapsar.
