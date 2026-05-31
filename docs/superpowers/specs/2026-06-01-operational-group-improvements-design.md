# Operasyonel Grup İyileştirmeleri — Tasarım

**Tarih:** 2026-06-01
**Modüller:** `capacity`, `transport`, `meals`, `inventory`
**Durum:** Onaylandı (kullanıcı, 1 Haz 2026) — planlama turu

## Bağlam

Dört operasyonel modül. Ortak: a11y=0, i18n yok. Modül durumları:
- **capacity** (16 uç): Zod VAR (7 validate), 2 test; `CapacityPage` 1587 satır.
- **transport** (31 uç): Zod YOK, 1 test; `TransportPage` 1872 satır (god component).
- **meals** (11 uç): Zod YOK; frontend küçük/temiz.
- **inventory** (27 uç): Zod YOK ama iyi bölünmüş (tabs, max 310) + 7 test.

## Kapsam (onaylı)

### Ortak Faz 1 — Validation
- **transport** Zod (31 uç, sıfır koruma — en yüksek öncelik): route/vehicle/driver,
  assignment, stop. `schemas.js` + `validate()`.
- **meals** Zod: meal log, selection, attendance yazma uçları (manuel `/meals/log`
  gate'siz override korunur — service.js belgeli).
- **inventory** Zod: stock in/out, item create/update, adjust.
- **capacity** mevcut şemaları gözden geçir + eksik yazma uçlarını kapsa.

### Ortak Faz 2 — Decomposition
- **`TransportPage` (1872)** → liste/atama/harita/sürücü panelleri ayrı.
- **`CapacityPage` (1587)** → blok-ızgara / detay / senaryo ayrı.
- inventory & meals: gerek yok (zaten temiz).

### Ortak Faz 3 — Modüle-özel değer
- **transport:** **QR ile servise biniş** (`html5-qrcode`), **canlı harita**
  (`leaflet`/`react-leaflet` zaten var — durak/araç konumu), rota optimizasyonu,
  sürücü/araç yönetimi derinleştirme.
- **meals:** **mutfak ekranı** (`display` modülü kalıbı — canlı öğün sayacı),
  atık/no-show analitiği (Faz 4-8 `meal_selections` verisi hazır), departman/firma
  maliyet raporu, besin/diyet bilgisi.
- **inventory:** **ABC analitiği** (değer/hareket bazlı sınıflandırma — backlog'da),
  düşük-stok uyarısı + otomatik yeniden-sipariş önerisi, **barkod tarama** (giriş/çıkış).
- **capacity:** **what-if senaryo** (X kişi gelirse hangi blok dolar), blok-bazlı
  doluluk projeksiyonu iyileştirme.

### Ortak Faz 4 — a11y
- Tüm dört modül: tablo/form semantiği, klavye, harita için erişilebilir alternatif.

## Kapsam dışı (bilinçli)
- **i18n** — sonraki tura.

## Mimari / izolasyon
- Transport harita bileşeni izole (`TransportMap`), leaflet'i lazy-load.
- ABC sınıflandırma saf fonksiyon (`inventory/logic/abc.js`), test edilebilir.
- Meals mutfak ekranı `display` modülü kalıbını paylaşır (kiosk-tipi salt-okunur).
- QR biniş bileşeni checkin/laundry QR ile paylaşılan `QrScanner`.

## Test stratejisi
- Backend: her yeni Zod şeması birim testi; inventory ABC saf-mantık testi; mevcut
  testler korunur.
- Frontend: TransportPage/CapacityPage alt-bileşenleri smoke; ABC/senaryo saf testleri.
- e2e: transport atama + meal log happy-path.

## Önerilen uygulama sırası
Transport Zod+decomposition (en kötü durum) → Meals/Inventory Zod → modül-özel değer
(inventory ABC, transport harita, meals mutfak ekranı) → a11y.
