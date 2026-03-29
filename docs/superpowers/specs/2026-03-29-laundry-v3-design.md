# Çamaşırhane Modülü v3 — Design Spec

**Tarih:** 2026-03-29
**Kapsam:** Kıyafet detayı girişi, çift imza, kişi/oda geçmişi, gelişmiş kanban (drag-and-drop), kayıp bulundu akışı
**Yaklaşım:** Mevcut LaundryHub tek sayfada kalır, yan paneller ve modal'lar üzerine eklenir

---

## Genel Hedef

Mevcut QR torba → kişisel parça takibi sistemini şu başlıklarda güçlendir:

1. **Kıyafet detayları** — kirli verirken çeşit/renk/adet girişi (hibrit chip + satır sistemi)
2. **Çift imza** — kirli verirken "teslim eden" imzası + ismi, teslim alırken "teslim alan" imzası
3. **Kişi geçmişi** — isime tıklayınca kişi profil paneli; kart expand'ında o kaydın timeline'ı
4. **Oda bazlı sayaç** — aynı odadan kaç aktif kayıt olduğu her kart ve panelde görünür
5. **Kayıp bulundu akışı** — modal önizleme + WA otomatik mesajı
6. **Kanban drag-and-drop** — kart sürükleyerek durum geçişi

---

## Veritabanı Değişiklikleri

### `laundry_items` — 3 yeni kolon

```sql
ALTER TABLE laundry_items ADD COLUMN intake_name TEXT;
ALTER TABLE laundry_items ADD COLUMN intake_signature TEXT;  -- base64 canvas
ALTER TABLE laundry_items ADD COLUMN clothing_items TEXT;    -- JSON array
```

`clothing_items` format:
```json
[
  { "type": "Tişört", "color": "Beyaz", "qty": 3 },
  { "type": "Pantolon", "color": "Lacivert", "qty": 1 }
]
```

### `laundry_items.status` CHECK constraint güncellenir

`'found'` durumu eklenir:
```sql
CHECK(status IN ('dirty','washing','ready','delivered','lost','found'))
```

`found` → geçici durum: kayıp işaretliyken bulununca set edilir, raf konumu girilip `ready`'e geçirilir.

### Mevcut tablolar değişmez

`laundry_deliveries.signature_data` ve `delivered_to` zaten var — teslim imzası buraya kaydedilir.
`laundry_history` zaten var — tüm durum geçişleri buraya yazılır.

---

## Backend

### `queries.js` — Yeni ve güncellenen sorgular

**`insertItemQuery`** — yeni parametreler:
- `intake_name` — kirli verirken girenin adı
- `intake_signature` — imza base64
- `clothing_items` — JSON string

**`listItemsQuery` / `getItemQuery`** — yeni alanlar döndürür:
- `intake_name`, `clothing_items`
- `room_active_count` — subquery: `SELECT COUNT(*) FROM laundry_items WHERE room_id = li.room_id AND status NOT IN ('delivered','lost')`

**`getPersonHistoryQuery(occupant_name)`** — yeni:
```sql
SELECT
  li.*,
  r.block, r.room_no,
  COUNT(*) OVER() as total_given,
  SUM(CASE WHEN li.status='delivered' THEN 1 ELSE 0 END) OVER() as total_delivered,
  SUM(CASE WHEN li.status='lost' THEN 1 ELSE 0 END) OVER() as total_lost,
  AVG(CASE WHEN li.status='delivered'
    THEN (julianday(ld.delivered_at) - julianday(li.created_at)) * 24
    ELSE NULL END) OVER() as avg_hours
FROM laundry_items li
LEFT JOIN rooms r ON r.id = li.room_id
LEFT JOIN laundry_deliveries ld ON ld.item_id = li.id
WHERE (li.intake_name = ? OR p.full_name = ?)
ORDER BY li.created_at DESC
```

**`markFoundQuery(id)`** — yeni:
- `UPDATE laundry_items SET status='found', updated_at=datetime('now') WHERE id=?`
- `INSERT INTO laundry_history(item_id, from_status, to_status, action_by) VALUES(?, 'lost', 'found', ?)`

**`getItemHistoryQuery(id)`** — yeni:
```sql
SELECT lh.*, u.full_name as actor_name
FROM laundry_history lh
LEFT JOIN users u ON u.id = lh.action_by
WHERE lh.item_id = ?
ORDER BY lh.created_at ASC
```

### `service.js` — Güncellemeler

- `createItem({ ..., intake_name, intake_signature, clothing_items })` — yeni alanları kaydet
- `markFound(id, userId)` — status güncelle + history yaz + WA tetikle
- `getPersonHistory(name)` — sorguyu çağır, kişi KPI'larını hesapla
- `getItemHistory(id)` — kayıt timeline'ını döndür

### `routes.js` — Yeni endpoint'ler

```
GET  /laundry/person/:name          → getPersonHistory
GET  /laundry/items/:id/history     → getItemHistory
POST /laundry/items/:id/found       → markFound (auth: laundry, campus_manager)
```

### `whatsapp.js` — Yeni mesaj şablonu

`sendFoundMessage(phone, item)`:
```
Sayın [isim],
Kayıp olarak bildirilen çamaşırlarınız ([item_count] parça) bulundu.
Raf konumu: [shelf_location]
Teslim için çamaşırhaneye gelebilirsiniz.
```

---

## Frontend

### `api.js` — Yeni çağrılar

```js
getPersonHistory: (name) => api.get(`/laundry/person/${encodeURIComponent(name)}`).then(r => r.data)
getItemHistory:   (id)   => api.get(`/laundry/items/${id}/history`).then(r => r.data)
markFound:        (id)   => api.post(`/laundry/items/${id}/found`).then(r => r.data)
```

---

### `NewItemModal.jsx` — Yeniden yazılır

**Sıra:**
1. Oda seçimi (mevcut)
2. **Teslim Eden** — `intake_name` text input + canvas imza (`<canvas>` 300×120, parmak/mouse destekli)
3. **Kıyafet Girişi** (hibrit):
   - Üst satır: chip'ler — Tişört / Pantolon / Çorap / İçlik / Kazak / Şort / + Diğer
   - Seçince alt listeye satır eklenir: `[Tip] [Renk input] [Adet ±] [✕]`
   - Toplam adet otomatik hesaplanır, `item_count` alanı kaldırılır (chip toplamından gelir)
4. Notlar (mevcut)
5. Telefon (mevcut, oda sakininden otomatik)
6. Acil toggle (mevcut)

**Kaydet** → `intake_name`, `intake_signature` (base64), `clothing_items` (JSON), `item_count` (toplam), diğer alanlar backend'e gönderilir.

---

### `DeliveryModal.jsx` — İmza eklenir

Mevcut akışa ek olarak:
- `delivered_to` alanı zaten var → korunur
- Canvas imza alanı eklenir (aynı `NewItemModal` imza komponenti kullanılır)
- `signature_data` zaten `laundry_deliveries` tablosuna kaydediliyor → değişiklik yok

---

### `ItemCard.jsx` + `KanbanCard` — Genişletme

**Normal görünüm (değişen):**
- Oda satırına `room_active_count > 1` ise rozet: `B2·204` yanında `×3` amber badge
- Kıyafet özeti (ilk 2 çeşit, toplam adet): `3 Tişört · 1 Pantolon`
- İsim tıklanabilir → `PersonPanel` açılır

**Expand (▾) açılınca:**
1. **Kıyafet Listesi** — chip benzeri görünüm: her satır `[Tip] [Renk] [Adet]`
2. **Timeline** — `laundry_history` kayıtları, lazy load:
   ```
   ● 09:15  Kirli sepete eklendi (Ahmet Y.)           — 1s 15dk beklemede
   ● 10:30  Makine 1'e atandı                         — 1s 10dk yıkandı
   ● 11:40  Raf A3'e kondu                            — 2s 20dk rafta
   ● 14:00  Teslim edildi (Ahmet Y.)
   ```
   Her adımın yanında süre: bir sonraki adıma kadar geçen saat/dakika

**Kayıp itemlarda:**
- "Bulundu →" butonu görünür → `FoundModal` açılır

---

### `PersonPanel.jsx` — Yeni component

Sağdan kayan overlay (`position: fixed`, `right: 0`, `width: 380px`).

**Başlık:**
- İsim (display font), oda, telefon + WA linki

**KPI Satırı (4 kart):**
- Toplam Verdi / Teslim Aldı / Ort. Süre (saat) / Kayıp

**Oda Özeti:**
- Bu odadan şu an kaç aktif kayıt var

**Geçmiş Listesi:**
- Tüm kayıtlar tarih sıralı (yeniden eskiye)
- Her satır: tarih · parça sayısı · kıyafet özeti · süre · durum badge

---

### `FoundModal.jsx` — Yeni component

```
Başlık: KAYIP BULUNDU

Kart: [Item bilgisi — oda, parça, kıyafet özeti]

WA Mesaj Önizlemesi:
┌─────────────────────────────────────────┐
│ Sayın [isim],                           │
│ Çamaşırlarınız ([N] parça) bulundu.     │
│ Raf: [shelf veya girilecek]             │
│ Teslim için çamaşırhaneye gelebilirsiniz│
└─────────────────────────────────────────┘

[Raf konumu input — boşsa doldur]

[ Mesajı Gönder + Teslime Hazırla ]   [ İptal ]
```

Onayla → `POST /laundry/items/:id/found` + WA gönderilir → item status `ready`'e geçer.

---

### `LaundryHub.jsx` — Kanban Drag-and-Drop

**Kütüphane:** `@dnd-kit/core` + `@dnd-kit/sortable`

**Geçiş kuralları (sadece ileri):**
- `dirty` → `washing` (makine seçimi olmadan geçiş: otomatik ilk boş makineye atar veya atama modali açar)
- `washing` → `ready` (raf konumu modali açılır)
- `ready` → teslim için sürükleme desteklenmez (teslim imza gerektirir, buton kalır)

**UX:**
- Sürüklenen kart hafifçe büyür + gölge
- Hedef kolon highlight olur
- Drop sonrası API çağrısı → query invalidate

---

## Kapsam Dışı

- Drag-and-drop ile `ready → delivered` geçişi — imza gerektirir, butonla kalır
- `found → delivered` direkt geçiş — önce raf konumu, sonra normal teslim akışı
- Bildirim sistemi değişikliği (SSE mevcut, dokunulmaz)
- Rapor sayfası değişikliği

---

## Test Gereksinimleri

- `intake_name` + `clothing_items` ile item oluşturma
- `GET /laundry/person/:name` doğru KPI döndürür
- `POST /laundry/items/:id/found` status `ready`'e geçirir + history kaydeder
- `room_active_count` birden fazla aktif kayıtta doğru sayı döner
- `GET /laundry/items/:id/history` doğru sıralı timeline döner
