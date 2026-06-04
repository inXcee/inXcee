# Kart Analitiği — Tasarım

**Tarih:** 2026-06-05
**Modül:** `cards`
**Kaynak:** Kullanıcı — "kartlar bölümünü daha da geliştir." Spec'lerdeki kart kalemlerinin sonuncusu (kart analitiği).

## Bağlam

Kartlar için zengin veri var ama **analitik görünüm yok**:
- `cards`: `card_type` (access/meal), `status` (active/lost/revoked), `issued_at`, `revoked_at`, `nfc_uid` (nullable).
- `access_events`: `card_id`, `station_id`, `result` (ok/denied/duplicate/not_eligible/unknown_card/alarm), `scanned_at`, `event_type`.
- Frontend `CardsPage` yalnızca client-side `coverage` (aktif kart sayısı) gösteriyor; durum/kayıp/NFC-ilerlemesi/kullanım görünmüyor.

## Amaç

Yöneticinin kart kapsamını, NFC enrollment ilerlemesini, kayıp/iptal oranını ve okutma kullanımını (günlük trend, sonuç kırılımı, yoğun istasyonlar) tek bakışta görmesi.

## Yaklaşım (onaylı)

Performance KPI deseni: saf agregasyon modülü + tek toplayan endpoint + CardsPage'de toggle ile açılan analiz görünümü. Tüm hesaplar salt-okuma, mevcut tablolardan türetilir — yeni tablo/migration yok.

## Bileşenler

### `backend/src/modules/cards/analytics.js` (yeni)
Saf fonksiyonlar (`db` param):
- **`summary(db)`** → her `card_type` (access, meal) için:
  `{ card_type, active, lost, revoked, nfc_bound, coverage_pct }`.
  - `active/lost/revoked` = cards status sayımı.
  - `nfc_bound` = status='active' AND nfc_uid IS NOT NULL sayısı (enrollment ilerlemesi).
  - `coverage_pct` = (aktif staff'ta o tipte aktif kart sayısı / toplam aktif staff) yüzde. Aktif staff yoksa 0.
- **`usageByDay(db, days=14)`** → son `days` günün her biri için `{ day, total, ok }` (access_events scanned_at gün gruplaması). Veri olmayan günler 0 ile doldurulur (JS'te gün dizisi üret, sayımları eşle) — sürekli trend.
- **`usageByResult(db, days=30)`** → `{ result, count }` listesi (son `days` gün; tüm result değerleri, count>0 olanlar).
- **`topStations(db, days=30)`** → en yoğun ilk 8: `{ station_id, name, count }` (access_events × scan_stations join, son `days` gün).

`days` runner'da clamp: 1..365.

### `backend/src/modules/cards/routes.js` (değişiklik)
- **`GET /cards/analytics?days=`** (`view` guard = mgr+shift_supervisor+laundry+housekeeper+technical — diğer GET'lerle aynı). `days` parse + clamp (1..365, default 30; usageByDay kendi 14 default'unu days ile override eder). Dönüş `{ days, summary, usageByDay, usageByResult, topStations }`. try/catch → 500.
- Route sırası: literal `/analytics` — `/:holderType/:holderId` (2-segment) ve `/:id/pdf` ile çakışmaz; `/roster`/`/batch-pdf` gibi literal'lerin yanına eklenir (2-segment GET fallback'tan önce).

### Frontend `CardsPage.jsx` (değişiklik)
- Başlık satırına **"📊 Analiz"** toggle butonu → `view` state ('roster' | 'analytics').
- `view==='analytics'` iken liste-detay yerine analiz paneli:
  - Özet kartlar: her tip için kapsam % · aktif · NFC bağlı · kayıp+iptal (mevcut StatCard/inline stilinde).
  - Günlük kullanım: son 14 gün bar listesi (total, ok vurgulu).
  - Sonuç kırılımı: result başına bar/sayı (ok yeşil, denied/alarm kırmızı vb.).
  - En yoğun istasyonlar: ad + sayı bar listesi.
  - Boş veri → "veri yok" durumu.
- `useQuery(['cards-analytics', days])` → `GET /cards/analytics?days=`. Mevcut inline-bar primitifleri; yeni kütüphane yok.

## Hata / sınır durumları
- Hiç kart/event yoksa: fonksiyonlar 0/boş döner; frontend boş-durum.
- Aktif staff 0 → coverage_pct 0 (bölme-sıfır guard).
- `days` geçersiz/aşırı → clamp.
- result CHECK'i 'alarm' içeriyor (migration 004) — usageByResult tüm değerleri sayar.

## Kapsam dışı (bilinçli — YAGNI)
- Kişi-bazlı drill-down (mevcut `activity` timeline zaten var).
- Excel/PDF export (gerekirse client `exportRowsToXlsx`).
- Saatlik ısı haritası / tahminleme.
- personnel/visitor kart kapsamı (coverage staff-bazlı; access_events tüm holder'ları zaten sayar).

## Test stratejisi
`backend/src/modules/cards/analytics.test.js` (vitest, :memory: + seedDev):
- Kontrollü seed: 2 staff, access kart (biri nfc_uid'li), 1 lost; birkaç access_event (ok/denied, farklı gün/istasyon).
- **summary:** active/lost/nfc_bound doğru; coverage_pct doğru (aktif staff'a göre).
- **usageByDay:** gün dizisi `days` uzunlukta, sayımlar doğru, boş gün 0.
- **usageByResult:** ok/denied sayıları.
- **topStations:** sayıya göre sıralı.
- Endpoint: 200 + bloklar; view rolü 200; (anonim 401).
Frontend `CardsPage.smoke.test.jsx` (ekleme): "📊 Analiz" toggle → özet kart + kullanım bloğu render (api mock analytics yanıtı).

## Önerilen uygulama sırası
1. `analytics.js` saf fonksiyonlar + test (TDD).
2. `GET /cards/analytics` + endpoint testi.
3. Frontend Analiz toggle görünümü + smoke + build.
4. Manuel doğrulama: seed event → analytics değerleri tutarlı.
5. Deploy (onayla).
