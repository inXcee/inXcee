# RoomsSection Geliştirmeleri — Tasarım

**Tarih:** 2026-05-12
**Modül:** `frontend/src/modules/laundry/components/RoomsSection.jsx` (+ ilgili backend)
**Bağlam:** Odalar v2 (commit `9d0e1c9`) ile oda merkezli yönetim kuruldu. Bu spec, dört eksik özelliği sırayla, her biri ayrı commit olacak şekilde tamamlar.

## Amaç

Müdür panelindeki Odalar sekmesinde oda detay deneyimini şu eksiklerle tamamlamak:

1. Timeline'da filtre/arama
2. Oda raporu export/yazdırma
3. Y blok premium oda detayı
4. WhatsApp bildirim aksiyonları

Her faz **tek commit** olacak ve commit öncesi `npx vitest run` çalıştırılacak (backend değişen fazlarda zorunlu).

## Kapsam Dışı

- Mobil/responsive cila (ayrı backlog item)
- 1675 satırlık component'in modülerleştirilmesi (ayrı backlog — refactor ihtiyacı görülürse Faz 5 olarak ele alınır)
- Self-service / kiosk taraf değişiklikleri

## Mevcut Durum (Referans)

- `getRoomLaundryDetailService` (backend/src/modules/laundry/service.js:468) — summary/items/trend/by_person/occupants/heatmap/hour_day/block_avg/damages/sla_violations/last_bag döner
- `RoomDetailPanel` (frontend RoomsSection.jsx:386) — bu veriyi render eder, inline yeni kayıt + batch action içerir
- `whatsapp.js sendWhatsApp(phone, text)` — fire-and-forget gönderim mevcut
- `notifyItemReady(itemId)` — tek item için "hazır" bildirimi gönderir
- `STANDARD_BLOCKS` set'i: Y blokları (özel banyolu) premium kabul edilir
- `is_premium` kolonu `laundry_items` tablosunda mevcut

---

## Faz 1 — Geçmiş filtresi/arama

**Sorun:** Detay panelde "TÜM GEÇMİŞ (N)" timeline'ında filtre yok. Bir odanın geçmişi 30+ kayıt olunca aranan parçayı bulmak zor.

**Çözüm:** Timeline başlığının altına ince bir filtre çubuğu:

- **Durum** chip'leri: tümü / aktif / teslim / kayıp (mevcut STATUS sabitleri)
- **Tip** chip'leri: tümü / acil / ütü / premium
- **Tarih aralığı**: son 7g / 30g / 90g / tümü (preset)
- **Serbest arama**: bag_no, intake_name veya item_details içinde

Frontend-only filtering — items array zaten client'ta. `useMemo` ile filtrelenmiş liste.

**Dosyalar:** `frontend/src/modules/laundry/components/RoomsSection.jsx` — `RoomDetailPanel` içinde state + filter UI + filtrelenmiş `items` render.

**Test:** Manuel — bir odaya birden fazla giriş yap, filtreleri dene.

**Tahmini değişiklik:** ~80-120 satır.

---

## Faz 2 — Export / yazdırma

**Sorun:** Müdür bir odanın çamaşır geçmişini paylaşmak isteyince ekran görüntüsü dışında yolu yok.

**Çözüm:** Detay panel header'ında iki ikon-buton:

- **📥 CSV** — Tüm timeline'ı CSV olarak indir. Kolonlar: bag_no, status, intake_name, intake_at, item_count, garments, urgent, premium, needs_ironing, total_hours, delivered_to, delivered_at, notes.
- **🖨 Yazdır** — `window.print()`. Yazdırma için `@media print` CSS: sol drawer'ı full-width yap, occupant butonlarındaki "→" oklarını gizle, batch toolbar gizle, KPI grid 2 sütunlu kalsın.

CSV oluşturma client-side (history zaten yüklü). Excel uyumu için BOM + UTF-8.

**Dosyalar:**
- `RoomsSection.jsx` — iki buton + CSV indir fonksiyonu
- `frontend/src/index.css` veya yeni `print.css` — `@media print` kuralları

**Test:** Manuel — CSV Excel'de aç, yazdırma önizlemesi.

**Tahmini değişiklik:** ~60-90 satır + ~30 satır CSS.

---

## Faz 3 — Premium oda detayı (Y bloklar)

**Sorun:** Y blokları (A, A1-A4, B, C, D, E, F, G, H, J) premium akıştan geçiyor, item'larda `is_premium=1` işaretleniyor, ama detay panel klasik view ile aynı — premium torbaların per-garment listesi (renk, beden, hasar, file durumu) görünmüyor.

**Çözüm:**

### Backend
`getRoomLaundryDetailService`'e ek alan: `premium_items` — son N=20 aktif premium torbanın garment'larıyla:

```sql
SELECT li.id, li.bag_no, li.created_at, li.status, li.intake_name,
       lg.id AS garment_id, lg.type, lg.colors_json, lg.pattern, lg.size,
       lg.notes, lg.damage_notes, lg.delivered_at, lg.lost_at
FROM laundry_items li
LEFT JOIN laundry_premium_garments lg ON lg.item_id = li.id
WHERE li.room_id = ? AND li.is_premium = 1
  AND li.status NOT IN ('delivered','lost')
ORDER BY li.created_at DESC
LIMIT 100
```

Service'te group-by item — array of `{ bag_no, garments: [...] }`.

**Premium garment tablosu varsayımı:** `addPremiumGarmentsService` (service.js:538) zaten kullanıldığına göre `laundry_premium_garments` tablosu mevcut. Test'te şema doğrulanır.

### Frontend
`BLOCK_BY_NAME[block]?.type === 'Y'` ise detay panele yeni bölüm "PREMIUM PARÇALAR (N)":
- Her bag → açılır kart, içinde garment list
- Her garment: tip ikonu (CLOTHING_ICONS) + renk/desen (ColorPatternDisplay) + beden + hasar notu (varsa kırmızı)
- File durumu: `file_count` zaten timeline'da var, burada da göster

**Dosyalar:**
- `backend/src/modules/laundry/queries.js` — yeni `getRoomPremiumGarmentsQuery`
- `backend/src/modules/laundry/service.js` — `getRoomLaundryDetailService`'e ek alan
- `backend/src/modules/laundry/laundry.test.js` — yeni test: Y blok odasına premium item + garment ekle, detail'da görünsün
- `frontend/.../RoomsSection.jsx` — yeni `PremiumGarmentsCard` (sadece Y blokta render)

**Test:** Zorunlu `npx vitest run`.

**Tahmini değişiklik:** Backend ~40 satır + test ~30 satır; frontend ~100 satır.

---

## Faz 4 — Bildirim aksiyonu (WhatsApp)

**Sorun:** Detay panelden oda sakinine ulaşmanın hızlı yolu yok. Hazır parça için tek tek WhatsApp linkleri açmak zorunda.

**Çözüm:** Detay panelin "ODA SAKİNLERİ" bölümünde her sakinin yanına iki buton:

- **🔔 Hatırlat** — "Hazır" durumundaki torbalarını listele, gönderirse her birine `notifyItemReady` çağır.
- **⚠ Kayıp uyarısı** — Sakinin `lost_count > 0` ise tıklanabilir; serbest mesaj alanı + onay → `sendWhatsApp` çağır.

Backend tarafında:
- Yeni endpoint: `POST /api/laundry/rooms/:block/:room_no/remind-ready` → o odanın aktif "ready" item'larından bu kişiye aitlerini bulup `notifyItemReady` ile bildir.
- Yeni endpoint: `POST /api/laundry/notify` → `{ phone, message }` ile serbest mesaj (rate-limited, yetki=campus_manager+shift_supervisor).

`WHATSAPP_TOKEN` env yoksa endpoint'ler 503 döner; frontend toast: "WhatsApp yapılandırılmamış".

**Dosyalar:**
- `backend/src/modules/laundry/whatsapp.js` — yeni helper: `notifyRoomPersonReady(block, room_no, personName)`
- `backend/src/modules/laundry/routes.js` — iki yeni endpoint
- `backend/src/modules/laundry/laundry.test.js` — endpoint smoke testi (WhatsApp env yokken 200/503 davranışı)
- `frontend/.../RoomsSection.jsx` — occupant satırlarında iki buton + onay modali
- `frontend/.../api.js` — iki yeni metod

**Test:** Zorunlu `npx vitest run`. Manuel: env'siz çalışırken UI hata göstermesin (no-op + toast).

**Tahmini değişiklik:** Backend ~80 satır + test ~50 satır; frontend ~120 satır.

---

## Çalışma Akışı

1. Faz N başlamadan önce TaskUpdate ile `in_progress`
2. Değişiklik → backend dokunduysa `cd backend && npx vitest run`
3. `git add` + semantic commit (`feat(laundry): ...`)
4. TaskUpdate `completed`
5. Bir sonraki faza geç

Fazlar arası test sonucu kırmızı ise sonraki faza geçme.

## Risk / Tartışma

- **Faz 3 tablo varsayımı**: `laundry_premium_garments` şeması Faz 3 öncesi doğrulanmalı. Test çalıştırılırken DB migration'ı temiz mi? Yoksa şema farklıysa adapte et.
- **Faz 4 rate limiting**: Müdür "Hatırlat" butonuna 5 kez basarsa 5 WhatsApp gider. İlk MVP'de in-memory debounce (5 saniye) yeterli. Production hardening backlog'a düşer.
- **CSV BOM**: Türkçe karakter için `﻿` prefix gerekli — Excel açar.

## Tamamlama Kriterleri

- 4 commit `main` üstüne push'lanır (kullanıcı tercih ederse PR akışı)
- `npx vitest run` her commit sonrası yeşil
- Manuel: Y blok odası ve M blok odası açıp her özellik çalıştığı görsel olarak doğrulanır
