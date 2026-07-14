# S1 — Güvenlik & Doğruluk Sprint (Vardiya)

**Tarih:** 2026-07-14
**Durum:** Tasarım onaylandı, uygulama planı bekliyor
**Kapsam:** Çoklu-ajan A-Z incelemesinden çıkan, **vardiya (shifts) modülündeki** en yüksek riskli güvenlik ve veri-doğruluğu bulgularının kapatılması. Su modülü fazları (kullanıcı kararıyla) bu sprintten çıkarıldı, ayrı bir tura bırakıldı.

## Arka Plan

8 ajanlı paralel keşif (her modül için backend + frontend + entegrasyon + docs/git) su ve vardiya modüllerinde ~45 bulgu çıkardı. Bunlar 4 eksene ayrıldı: (S1) güvenlik & doğruluk, (S2) performans & UX, (S3) teknik borç & test, (S4) yeni özellikler. Bu doküman **yalnızca S1**'i kapsar — canlı sistemde aktif risk taşıyan açıklar.

İki en yüksek-bahisli bulgu uygulama öncesi elle doğrulandı:
- `GET /shifts/staff/:id/detail` → `allStaff = [requireAuth]` + `getStaffById` `SELECT s.*` (maaş/TC/IBAN dahil). Herhangi bir geçerli token (kiosk/housekeeper) hassas veriye erişebiliyor. **Doğrulandı.**
- `getPayrollExport`/`getPayrollDetailed` → ham `status` COUNT + yalnız `holidays.multiplier`; migration 047 kod etkileri (`is_paid`, `sgk_day_factor`, `day_multiplier`) hiç kullanılmıyor. Föy görünümü (`getPuantaj`) ise kullanıyor → resmî bordro föyle çelişiyor. **Doğrulandı.**

## Mimari İlkeler

- **Faz izolasyonu:** 3 bağımsız faz, her biri kendi kırmızı→yeşil→commit döngüsü (CLAUDE.md "faz faz çalış" kuralı). Fazlar birbirine bağımlı değil, ayrı deploy edilebilir.
- **TDD:** Her faz önce başarısız test, sonra düzeltme. Backend değişikliği olan her faz `npx vitest run` geçmeden commit edilmez.
- **Migration disiplini:** Yeni migration/tablo/kolon gerekmez — yalnız route guard'ları, sorgu mantığı ve durum geçiş kontrolleri değişir.
- **Davranış değişikliği yalnız F2'de:** bilinçli, kullanıcı onaylı (bordro artık kod etkilerini yansıtır).

## Fazlar

### F1 — PII / IDOR Açıkları (shifts)

**Sorun:** Dört endpoint yetki dışı erişime açık.

**Tasarım:**

| Endpoint | Şu an | Düzeltme |
|----------|-------|----------|
| `GET /staff/:id/detail` (routes.js:86) | `allStaff` → maaş/TC/IBAN döner | `managerOrSupervisor` |
| `POST /leave` (routes.js:563) | `allStaff`, gövdeden `staff_id` (IDOR) | `managerOrSupervisor` |
| `POST /swaps` (routes.js:1045) | `allStaff`, `requester_id` doğrulanmıyor | `managerOrSupervisor` |
| `POST /attendance/events` (684), `/checkin` (748), `/checkout` (757) | `allStaff` — serbest kart olayı enjeksiyonu | `requireKioskOrManager` (kiosk token'ı veya yönetim rolü) |

`/staff/:id/detail` için karar: **sert blok** (alan maskeleme değil). Gerekçe: StaffDetailPanel frontend'de zaten yalnız müdür/şef akışından açılıyor; alan maskeleme yeni sızıntı yüzeyi ekler (YAGNI).

Kiosk uçları için: `requireKioskOrManager` middleware'i `avs_kiosk` token'ı VEYA `campus_manager`/`shift_supervisor` rolü kabul etsin — kiosk cihazının meşru event ingest'i korunur, keyfi kimlikli kullanıcı engellenir.

**Test:** Her endpoint için düşük-yetkili token (ör. housekeeper) → 403; kiosk uçları için geçerli kiosk token → 200, alakasız staff token → 403.

**Dosyalar:** `backend/src/modules/shifts/routes.js`, gerekiyorsa `backend/src/shared/auth/middleware.js` (yeni `requireKioskOrManager`).

### F2 — Bordro ↔ Puantaj Kod Etkileri (shifts)

**Sorun:** Resmî bordro/SGK çıktısı migration 047 kod etkilerini yok sayıyor; föy ile çelişiyor.

**Tasarım:** `getPayrollExport` (queries.js:754) ve `getPayrollDetailed` (queries.js:711), `getPuantaj` (queries.js:3535) içindeki `puantaj_code`-join mantığına dayandırılır. Tek bir "puantaj birimleri" hesap katmanı (`shift_schedule.puantaj_code_id` → fallback `status`+`leave_type` ile kod seçimi) hem föyü hem bordroyu besler:
- `worked_days` / `weighted_days` → `day_multiplier` uygulanmış birimler
- `sgk_days` → `Σ sgk_day_factor` (`sgk_day_units`)
- `leave_days` → `is_paid` ayrımıyla; ücretsiz izin ödemeye katılmaz
- Saatlik izin → `leave_hours / 8.0` oranı

PDF (`/payslip/:staffId/pdf`), banka CSV (`/bank-transfer`), detay export tümü bu birleşik hesaptan üretilir.

**Davranış değişikliği (onaylandı):** Ücretsiz izin artık bordroda tam gün sayılmaz; SGK günü çarpanla hesaplanır. Mevcut bordro rakamları değişebilir.

**Test:** Ücretsiz izin (`is_paid=0`) içeren bir personelin bordro çıktısında gün sayısının azaldığını; yarım-gün çarpanının (`day_multiplier=0.5`) doğru uygulandığını; SGK gününün `sgk_day_factor` toplamıyla eşleştiğini doğrula. Föy ve bordro çıktısının aynı birimleri verdiğini doğrulayan tutarlılık testi.

**Dosyalar:** `backend/src/modules/shifts/queries.js`, gerekiyorsa `service.js` (PDF/CSV üreticileri).

### F3 — Onay State Machine Guard'ları (shifts)

**Sorun:** Üç geçersiz durum geçişi engellenmemiş.

**Tasarım:**
- **Dönem onayı** (`service.js:648` `actionMap`): `approve` eylemi yalnız `submitted` durumundan kabul edilsin; `draft→approved` doğrudan geçişi reddedilsin (409 + "Önce döneme gönder (submit) yapılmalı").
- **`reviewOvertimeRequest`** (queries.js:1216): zaten `approved`/`rejected` olan talep tekrar review edilirse 409 + "Bu talep zaten sonuçlanmış".
- **`approveLeaveRequest`** (queries.js:910): aynı guard.

Karar: geçersiz geçiş **409 + net mesaj** (sessiz idempotent no-op değil) — kullanıcı hatasını görür.

**Test:** Her üç geçersiz geçiş → 409; geçerli geçişlerin hâlâ çalıştığını doğrula (regresyon).

**Dosyalar:** `backend/src/modules/shifts/service.js`, `queries.js`.

## Kapsam Dışı (sonraki sprintlere)

- **Su modülü güvenlik/doğruluk fazları** (FIFO atomiklik + silme davranışı, su 5xx'lerinin Sentry+error_log'a bağlanması, tır uyarı cron zamanlaması) → kullanıcı kararıyla ayrı bir tura bırakıldı
- Grid performans (React.memo/virtualization), N+1 sorgular → **S2**
- Dev dosya bölünmesi, testsiz akışlar, PLAN.md/spec güncellemesi → **S3**
- İzin↔puantaj görsel bağı, self-service puantaj, staff↔personnel köprü → **S4**
- Alan-maskeleme, iki 360 görünümü birleştirme → sonraki iyileştirme turları

## Başarı Kriterleri

- 3 fazın tamamı: ilgili düşük-yetkili/geçersiz-durum testleri 403/409 dönüyor.
- `npx vitest run` (backend) tam yeşil; regresyon yok.
- F2: föy ve bordro çıktısı aynı birimleri veriyor (tutarlılık testi geçiyor).
- Her faz ayrı semantic commit; sırayla push + deploy.
- Deploy sonrası prod smoke geçiyor, login akışı çalışıyor.
