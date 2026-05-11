# Çamaşırhane Kiosk v2 — Pratik Akış Tasarımı

**Tarih:** 2026-05-12
**Kapsam:** AVS Çamaşırhane Kiosk (`frontend/src/modules/laundry-kiosk/`) için ikinci tur büyük UX yenilemesi. v1'in sol-nav + parça-checklist'i üzerine: tek "Giriş" sekmesi, blok→oda grid seçimi, hızlı tip-arama + 1-tap kıyafet ekleme, koşullu imza, parça-tik bypass, durum dashboard.

---

## 1. Motivasyon

v1 (2026-05-11) sol-nav + checklist'i ekledi ama kullanıcı şu noktaları hâlâ pratik dışı buldu:

1. **İki ayrı sekme** (`Torba Al` + `Kıyafet Gir`) kafa karıştırıcı — neyin ne için olduğu belirsiz.
2. **Kıyafet ekleme yavaş** — Her parça için 5 adım (tip seç → renk → desen → adet → +Ekle). 5 parça = 25+ tap.
3. **Tip listesi** grid'de hunting yapmak yavaş; arama / serbest metin yok.
4. **Oda/kişi seçimi** çok adımlı (blok bul → oda yaz → kişi bekle).
5. **Parça-tik checklist** her parça için tek tek tıklamak yavaş hissettiriyor.
6. **Durum sekmesi** arama yapmadan boş; "Bugünün her şeyini göster" pratik değil.
7. **İmza her seferinde** zorunlu — her blok için anlamlı değil.

Hedef: pratik bir POS terminali gibi — az tap, akıllı default'lar, açılır açılmaz görünür özet, klavye-dostu arama.

---

## 2. Sekme Yapısı

v1'deki 5 sekme → 4 sekme:

| Sekme | İçerik | Değişim |
|-------|--------|---------|
| 🧺 Giriş | Eski Torba Al + Kıyafet Gir birleşimi | YENİ form (`EntryForm.jsx`) |
| 🫧 Ütü | Aynı | Parça-tik "Tümünü onayla" eklenir |
| 🚚 Teslim | Aynı | İmza koşullu, parça-tik "Tümünü onayla" eklenir |
| 📋 Durum | Dashboard view | YENİ (`DashboardView.jsx`) |

"Kıyafet Gir" sekmesi tamamen kaldırılır.

---

## 3. Giriş Akışı — `EntryForm.jsx`

Tek scroll'lu sayfa, yukarıdan aşağı 4 adım:

### 3.1 Oda / Kişi (`RoomGridPicker.jsx`)

```
Blok seç: [M1][M2][M3]   [S1][S2][S3]   [A][A1]...[G][H][J]

(blok seçildikten sonra)
Oda seç (6 sütun grid):
  [101][102][103][104][105][106]
  [107][108][109][110][111]🔴[112]
  ...
🔴 = aktif torbası olan oda (renk-kodlu işaret)

(oda seçildikten sonra — backend fetch)
Kişi:
  [Selim Y.]  [Mehmet K.]  [Kişisiz]
  • 1 kişi varsa otomatik seçili
  • Boşsa "Kişisiz" tek seçenek
```

- **Blok listesi:** `frontend/src/shared/blocks.js` `BLOCKS` array. 3 grup (M, S, Y) görsel olarak ayrılır.
- **Oda grid kaynağı:** `expectedRoomNos(block)` helper (statik, backend yok).
- **Aktif torba işareti:** Component mount'ta + blok değiştiğinde `GET /self-service/laundry-kiosk/bags?block=<block>&status_active=1` çağrısı yapılır, room_no listesi alınır, grid'de işaret çizilir. (Backend tarafında bu query parametresi destekleniyorsa kullan; yoksa `?block=…` ile gelen tüm bag'leri client-side filtrele.)
- **Kişi fetch:** Mevcut `GET /self-service/laundry-kiosk/room-persons?block=…&room_no=…` (değişmez).
- **`onChange` callback:** `{ block, room_no, person }` `EntryForm`'a iletilir.

### 3.2 Kıyafet (`QuickGarmentInput.jsx`)

İki mod, toggle ile geçiş:

**Mod A — Yapılı (default):**
```
🔍 [____________]  ← input, focus auto
↓ yazdıkça öneri kutusu:
   👔 Gömlek
   👖 Pantolon
   + "kazak" olarak ekle  (custom)

EKLENEN KIYAFETLER (3)
  ◯ 👔 Gömlek × 1 · ⚪ Beyaz · Düz   [✏][✕]
  ◯ 👖 Pantolon × 2 · ⚫ Siyah · Düz [✏][✕]
```

- Input boş veya `value.length === 0` iken focus auto-set.
- Yazdıkça `garmentType.name.toLowerCase().includes(query.toLowerCase())` ile filtrele.
- Enter:
  - Eğer focus'lanmış öneri varsa (↑↓ ile seçilmiş) onu ekle.
  - Aksi halde ilk eşleşeni ekle.
  - Hiç eşleşme yoksa custom add (`type_id: null, name: query, emoji: '👕'`).
- Tab veya öneri kartına click = ekle.
- Esc = öneri kutusunu kapat, input clear.
- Default değerler: `count: 1, colors: [{ key:'white', label:'Beyaz' }], pattern: 'solid'`.
- Kıyafet kartına tıklama (`✏` butonu da aynı şey) = inline `GarmentPicker` (mevcut) açar — renk/desen/adet düzenle, ✓ Güncelle.
- `✕` = siler.

**Mod B — Serbest metin (toggle açık):**
```
☑ Hepsini metin olarak yaz

(textarea)
[ "3 gömlek, 2 pantolon, 1 ceket..." ]

Toplam parça: [1][2][3][4][5][6][7][8]
```

- Mod B'ye geçişte Mod A'da eklenmiş `garments` varsa onay diyaloğu: "Eklenmiş 3 kıyafet kaybolacak. Devam?" Onay → state reset.
- Mod B'de `garments_json = null`, `notes = textarea değeri`, `item_count = manuel grid seçimi`.
- Mod B'den Mod A'ya geçişte textarea değeri varsa onay: "Yazılan metin kaybolacak. Devam?".

### 3.3 Bag opsiyonları

`EntryForm`'da kıyafet bölümünün altında:
- ⚡ **Acil** toggle (mevcut)
- 📝 **Not** input (mevcut, Mod B'de textarea ile birleşik gösterilir — kullanıcı kafası karışmasın)

### 3.4 İmza (koşullu)

```js
const SIGN_BLOCKS = new Set(['M1','M2','M3','S1','S2','S3','G','C'])
```

- Eğer `block ∈ SIGN_BLOCKS` → imza canvas render olur ve zorunlu.
- Değilse imza bölümü render edilmez; submit'te `intake_signature: null`.

### 3.5 Kaydet

- "✓ Torba Kaydet" — disabled olduğu durumlar:
  - Oda seçilmedi
  - Kişi seçilmedi (kullanıcı "Kişisiz" seçeneğini açık biçimde seçmeli)
  - Mod A'da kıyafet eklendiyse `item_count = sum(g.count)` otomatik geçer. Kıyafet eklenmediyse alta 1-8 adet grid görünür ve seçilmesi şart.
  - İmza gerekli blok (M1/M2/M3/S1/S2/S3/G/C) ve imza atılmadı
- Submit payload (mevcut endpoint):
  ```json
  {
    "block": "M1",
    "room_no": "205",
    "personnel_id": 12,
    "item_count": 3,
    "is_premium": true,
    "garments": [...] | null,
    "notes": "..." | null,
    "urgent": false,
    "intake_signature": "data:image/..." | null
  }
  ```
- Success state: torba no büyük gösterilir + "Yeni Giriş" butonu → form sıfırlanır, kullanıcı Giriş sekmesinde kalır.

### 3.6 Premium kararı

`is_premium`:
- Mod A'da `garments.length > 0` → `is_premium: true`
- Mod B veya kıyafet yok → `is_premium: false`

Bu otomatik; eski "Premium toggle" UI'dan kalkar.

---

## 4. Parça-Tik Bypass — `GarmentChecklist.jsx` güncellemesi

Mevcut tikleme paterninin üstüne tek buton:

```
KIYAFETLERİ DOĞRULA            [✓ Tümünü onayla]
─────────────────────────────────────────────
◯ Gömlek · Beyaz · Düz
◯ Pantolon · Lacivert · Düz
✓ Ceket · Lacivert · Düz
2/3 doğrulandı
```

- "✓ Tümünü onayla" butonu = `onToggleAll(true)` çağırır → parent `setTicked({ 0:true, 1:true, ... allIndices })`.
- Component'e yeni prop `onToggleAll: (bool) => void` eklenir (opsiyonel; verilmezse buton görünmez).
- IroningView ve DeliverView bu prop'u sağlar:
  ```jsx
  function toggleAll(allValue) {
    const next = {}
    garments.forEach((_, i) => { next[i] = allValue })
    setTicked(next)
  }
  ```
- Tek tek tik mekaniği aynen kalır — şüpheli olan görevli tikleri kaldırıp tek tek tikleyebilir.

---

## 5. Teslim Akışı — İmza Koşullu

`DeliverView` (mevcut) içinde `selectedBag.block`'a göre imza render edilir.

```js
const needsSig = SIGN_BLOCKS.has(selectedBag.block)
```

- `needsSig === true` → imza canvas görünür, submit zorunlu.
- `needsSig === false` → imza bölümü hiç görünmez, payload `signature: null`.
- Backend endpoint'i (POST `/bags/:id/deliver`) imzayı opsiyonel kabul ediyor zaten — değişmez.

Ayrıca `GarmentChecklist`'in `onToggleAll` prop'unu da burada ekle (parça-tik bypass için).

---

## 6. Durum Sekmesi — `DashboardView.jsx`

```
┌─ BUGÜNÜN AKTİF TORBALARI (24) ──────────────────────┐
│ [Tüm Bloklar ▼]  [Bugün ▼]              ↻ Yenile    │
├──────────────────────────────────────────────────────┤
│ 🧺 PENDING (3)                                       │
│   T-103 · M1-205 · 2 parça · 5dk         [Topla →]  │
│   T-104 · S2-110 · 4 parça · 12dk        [Topla →]  │
│ ⚙ MAKİNEDE (5) · ⏱ ort. 18dk kaldı                  │
│   T-095 · M2-203 · ⏱ 22dk · Makine A2    [Detay]    │
│ 🫧 ÜTÜDE (4)                                         │
│   T-091 · S1-112 · 3 parça (Premium)     [Tamamla →]│
│ ✓ HAZIR — TESLİM BEKLİYOR (8)                       │
│   T-085 · M1-204 · 5 parça               [Teslim →] │
│ 🚚 BUGÜN TESLİM EDİLEN (4) — daraltılmış            │
└──────────────────────────────────────────────────────┘
```

- Mount'ta `GET /self-service/laundry-kiosk/bags?since=today` (yeni endpoint parametresi gerekirse — yoksa `?status=…` ile her status için ayrı çağrı; tercihen tek çağrı).
- 30 saniyede bir auto-refetch (background, `setInterval`).
- Üstte 2 filtre dropdown: blok (tüm bloklar / spesifik blok) + tarih (bugün / dün / 7 gün).
- Her status grubu collapse edilebilir (header'a tıkla).
- Action butonları (Topla / Tamamla / Teslim) o sekmeye atlatır + ilgili torbayı seçili açar. Bu için parent'a callback iletilir (`onNavigateAction(action, bagId)`) → `LaundryKioskPage` `setActiveTab` + bir focus state set eder.

### Backend desteği

İhtiyacı olan ya da daraltma:
- `GET /self-service/laundry-kiosk/bags` — `since`, `status_in` (multiple), `block` query parametreleri. Mevcut endpoint'i kontrol et: zaten `status`, `block`, `room_no` destekliyor. `since` parametresi yoksa eklenmesi gerek.
- Eğer eklenecek query parametresi gerekiyorsa backend'e küçük dokunuş gerekir.

---

## 7. Etkilenen Dosyalar

| Dosya | Aksiyon |
|-------|---------|
| `frontend/src/modules/laundry-kiosk/RoomGridPicker.jsx` | **YENİ** — blok seç → oda grid → kişi |
| `frontend/src/modules/laundry-kiosk/QuickGarmentInput.jsx` | **YENİ** — Mod A + Mod B kıyafet ekleme |
| `frontend/src/modules/laundry-kiosk/EntryForm.jsx` | **YENİ** — Giriş sekmesinin tüm form'u (BagForm + GarmentForm birleşimi) |
| `frontend/src/modules/laundry-kiosk/DashboardView.jsx` | **YENİ** — Durum sekmesi |
| `frontend/src/modules/laundry-kiosk/GarmentChecklist.jsx` | MODIFY — `onToggleAll` prop ekle, "✓ Tümünü onayla" butonu |
| `frontend/src/modules/laundry-kiosk/LaundryKioskPage.jsx` | MODIFY — Shell: 5 sekme → 4 sekme. `BagForm`, `GarmentForm`, `StatusView` fonksiyonları silinir. `IroningView` ve `DeliverView` imza-koşullu hale getirilir + `onToggleAll` prop'u sağlanır. Yeni 4 dosya import edilir. |
| `frontend/src/modules/laundry-kiosk/GarmentPicker.jsx` | DOKUNULMAZ — inline kart düzenlemede aynen kullanılır |
| Backend | İhtiyaca göre — `bags` endpoint'inde `since` parametresi yoksa ekle |

---

## 8. Test Planı

Manuel kiosk akışları:

1. **Giriş — yapılı mod premium:**
   - Blok M1 → oda grid görünür, "205" tıkla → kişi listesi → 1 kişi otomatik
   - Tip search "gömlek" → Enter → kart eklendi (Beyaz / Düz / 1)
   - "pantolon" → Enter → ikinci kart
   - Kart düzenle → renk Lacivert → ✓ Güncelle
   - İmza canvas görünmeli (M1 SIGN_BLOCKS'ta)
   - Kaydet → torba no görünür → "Yeni Giriş" → form sıfır.

2. **Giriş — yapılı mod normal (Y blok):**
   - Blok A → oda 105 → kişi
   - Hiç kıyafet eklenmez → item_count grid (1-8) görünür → 3 seç
   - İmza canvas YOK (A SIGN_BLOCKS'ta değil)
   - Kaydet → success.

3. **Giriş — serbest metin mod:**
   - Toggle aç → onay diyaloğu (eğer kıyafet vardı) → state reset
   - Textarea: "3 gömlek, 2 pantolon" → toplam 5 seç → kaydet
   - garments_json = null, notes = textarea, item_count = 5.

4. **Ütü:**
   - Premium torba seç → checklist görünür
   - "✓ Tümünü onayla" tıkla → tüm parçalar tikli → Tamamla enable
   - Veya tek tek tikle → aynı sonuç.

5. **Teslim — imzalı blok:**
   - M1 ready torba → checklist → Tümünü onayla → imza zorunlu → ad gir → Teslim Et.

6. **Teslim — imzasız blok:**
   - A blok ready torba → checklist → Tümünü onayla → imza YOK → ad → Teslim Et.

7. **Durum:**
   - Açılır açılmaz bugünün aktif torbaları status gruplu görünür
   - "Topla" → Giriş sekmesi açılır mı? (NOT: bu pending_collection → dirty geçişi; mevcut akışta bu Ütü/Teslim'den farklı, bu aksiyon backend'de var mı kontrol et. Yoksa "Detay" butonu yeterli.)

Backend testleri (`npx vitest run`) — eğer backend dokunulduysa (since parametresi eklenirse) yeni test gerekir, mevcut 551 test geçmeli.

---

## 9. Kapsam Dışı

- Fotoğraf (premium intake / delivery) — sonraki sprint.
- Hasar / eksik raporu kiosktan — LaundryHub manuel.
- Kıyafet tipleri admin paneli — zaten `LaundrySettings → 👔 Kıyafet Tipleri` sekmesinde var. Ek değişiklik yok.
- `MachineView` ölü kodu — yine dokunulmaz.
- Session timeout / PIN keypad / undo — kapsamda değil.

---

## 10. Migrasyon Notu

- v1'in `BagForm`, `GarmentForm`, `StatusView` fonksiyonları silinir. `IroningView` ve `DeliverView` aynen kalır (sadece imza koşullu + onToggleAll prop'u eklenir).
- v1'deki "Kıyafet Gir" sekmesi UI'dan kalkar. Backend endpoint'i (`POST /self-service/laundry-kiosk/garment`) dokunulmaz — geriye uyum için durur, ancak v2 UI'ı bunu kullanmaz.
- v1'de URL `?tab=garment` ile bookmark eden olduysa — yeni `VALID_TABS` array'inde `garment` yok, default `'entry'`e düşer. Yenilense yine doğru çalışır.
- v2'de sekme key'leri: `'entry' | 'ironing' | 'deliver' | 'status'` (v1'deki `'bag'` ve `'garment'` kaldırıldı).

---

## 11. Açık Konular (uygulama planı yazılırken kararlaştırılacak)

1. **`bags?since=today` parametresi backend'de var mı?** Yoksa backend'e küçük ekleme.
2. **`bags?status_active=1` veya `status_in[]=pending,washing,...`** — aktif statusler için tek query mi, yoksa client-side filtre mi?
3. **"Topla" aksiyonu Dashboard'dan:** pending_collection → dirty geçişi için endpoint var mı? Yoksa bu aksiyon Detay olarak gösterilir.
4. **Onay diyaloğu (mod toggle):** native `window.confirm` mi, custom modal mı? — Native yeter (kısa karar).
