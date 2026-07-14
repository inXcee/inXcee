# S1 — Güvenlik & Doğruluk Sprint (Vardiya + Su)

**Tarih:** 2026-07-14
**Durum:** Tasarım onaylandı, uygulama planı bekliyor
**Kapsam:** Çoklu-ajan A-Z incelemesinden (vardiya + su modülleri) çıkan en yüksek riskli güvenlik ve veri-doğruluğu bulgularının kapatılması.

## Arka Plan

8 ajanlı paralel keşif (her modül için backend + frontend + entegrasyon + docs/git) su ve vardiya modüllerinde ~45 bulgu çıkardı. Bunlar 4 eksene ayrıldı: (S1) güvenlik & doğruluk, (S2) performans & UX, (S3) teknik borç & test, (S4) yeni özellikler. Bu doküman **yalnızca S1**'i kapsar — canlı sistemde aktif risk taşıyan açıklar.

İki en yüksek-bahisli bulgu uygulama öncesi elle doğrulandı:
- `GET /shifts/staff/:id/detail` → `allStaff = [requireAuth]` + `getStaffById` `SELECT s.*` (maaş/TC/IBAN dahil). Herhangi bir geçerli token (kiosk/housekeeper) hassas veriye erişebiliyor. **Doğrulandı.**
- `getPayrollExport`/`getPayrollDetailed` → ham `status` COUNT + yalnız `holidays.multiplier`; migration 047 kod etkileri (`is_paid`, `sgk_day_factor`, `day_multiplier`) hiç kullanılmıyor. Föy görünümü (`getPuantaj`) ise kullanıyor → resmî bordro föyle çelişiyor. **Doğrulandı.**

## Mimari İlkeler

- **Faz izolasyonu:** 6 bağımsız faz, her biri kendi kırmızı→yeşil→commit döngüsü (CLAUDE.md "faz faz çalış" kuralı). Fazlar birbirine bağımlı değil, ayrı deploy edilebilir.
- **TDD:** Her faz önce başarısız test, sonra düzeltme. Backend değişikliği olan her faz `npx vitest run` geçmeden commit edilmez.
- **Migration disiplini:** F6 dışında yeni migration gerekmez; F6'da migration kullanılmaz (yalnız cron ifadesi). Yeni tablo/kolon eklenmiyor.
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

### F3 — Su FIFO Atomiklik + Silme (water)

**Sorun:** Üç bütünlük açığı.

**Tasarım:**
- **Atomiklik:** `createIntakeService` (service.js:254) ve `batchIntakeService` (service.js:301) içinde `createMovement(...)` + `reconcileUnallocatedOut(...)` tek `db.transaction()` içine sarılır. Reconcile hata verirse giriş kaydı da geri sarılır.
- **Giriş silme:** `deleteMovementService` (service.js:278) tahsisli girişi silmeye çalışınca oluşan FK RESTRICT hatasını yakalar, `statusCode=409` + "Bu irsaliyeye bağlı dağıtım kaydı var, önce dağıtımları düzenleyin" mesajı döner (ham 500 yerine).
- **Silme sonrası reconcile:** Bir OUT (dağıtım) silindiğinde `reconcileUnallocatedOut` + `clearResolvedReviews` tetiklenir; serbest kalan lotlar bekleyen diğer çıkışlara yeniden dağıtılır, `needs_review` bayrakları güncellenir.

**Test:**
- Atomiklik: `reconcileUnallocatedOut` hata fırlatacak şekilde ayarla → intake sonrası `water_movements`'ta yeni satır OLMADIĞINI doğrula (rollback).
- Giriş silme: tahsisli giriş sil → 409 + mesaj.
- OUT silme: kısmi eşleşmiş bir dağıtımı sil → serbest lotun bekleyen başka çıkışa yeniden tahsis edildiğini doğrula.

**Dosyalar:** `backend/src/modules/water/service.js`, gerekiyorsa `queries.js` (transaction sarmalayıcı).

### F4 — Onay State Machine Guard'ları (shifts)

**Sorun:** Üç geçersiz durum geçişi engellenmemiş.

**Tasarım:**
- **Dönem onayı** (`service.js:648` `actionMap`): `approve` eylemi yalnız `submitted` durumundan kabul edilsin; `draft→approved` doğrudan geçişi reddedilsin (409 + "Önce döneme gönder (submit) yapılmalı").
- **`reviewOvertimeRequest`** (queries.js:1216): zaten `approved`/`rejected` olan talep tekrar review edilirse 409 + "Bu talep zaten sonuçlanmış".
- **`approveLeaveRequest`** (queries.js:910): aynı guard.

Karar: geçersiz geçiş **409 + net mesaj** (sessiz idempotent no-op değil) — kullanıcı hatasını görür.

**Test:** Her üç geçersiz geçiş → 409; geçerli geçişlerin hâlâ çalıştığını doğrula (regresyon).

**Dosyalar:** `backend/src/modules/shifts/service.js`, `queries.js`.

### F5 — Su Hataları → Sentry + error_log (water)

**Sorun:** Su route'ları `fail(res, e)` ile hatayı yutuyor, `next(err)` çağırmıyor → Sentry error handler ve `reportErrorService` (error_log) su 5xx'lerini hiç görmüyor. Su service'te `captureError` çağrısı yok.

**Tasarım:** `fail()` helper'ı (routes.js:31) `status >= 500` olduğunda `captureError(e, { module: 'water', route: req.route?.path })` çağıracak şekilde zenginleştirilir. Tek fonksiyon değişikliği tüm su 5xx'lerini kapsar. Test ortamında `captureError` no-op olduğu için yan etki yok.

**Test:** Kasıtlı 500 fırlatan bir su endpoint'i (mock ile) → `captureError` mock'unun `module:'water'` ile çağrıldığını doğrula; 4xx'te çağrılmadığını doğrula.

**Dosyalar:** `backend/src/modules/water/routes.js` (`fail` helper + `captureError` import).

### F6 — Tır Uyarı Cron Zamanlaması (water)

**Sorun:** Cron saatlik (`'0 * * * *'`, cron/index.js:85) ama `checkTruckArrivalAlerts` hatırlatma mantığı dakika-modülo (`service.js:1300,1329`). 15/30 dk aralıklı hatırlatmalar yalnız saat başına denk gelirse ateşleniyor; deadline aşımı saat içinde kaçabiliyor.

**Tasarım:** Cron ifadesi `'*/15 * * * *'`'e çekilir (her 15 dakikada). Mevcut modülo mantığı 15dk hizasında doğru çalışır. Yanlış yorum satırı (`:84`) düzeltilir. `withLock` overlap koruması zaten var, sıklaşan tick güvenli.

Not: `last_alert_at` temelli (cron granülaritesinden bağımsız) tam çözüm ileride bir iyileştirme fazına bırakıldı — S1'de düşük-riskli minimal düzeltme tercih edildi.

**Test:** `reminder_interval_minutes=15` senaryosunda 15dk hizasındaki tick'te hatırlatmanın ateşlendiğini doğrulayan mevcut testin geçtiğini teyit et (cron ifadesi değişikliği testleri etkilemiyorsa cron kayıt testine assertion ekle).

**Dosyalar:** `backend/src/shared/cron/index.js`.

## Kapsam Dışı (sonraki sprintlere)

- Grid performans (React.memo/virtualization), N+1 sorgular → **S2**
- Dev dosya bölünmesi, testsiz akışlar, PLAN.md/spec güncellemesi → **S3**
- İzin↔puantaj görsel bağı, self-service puantaj, staff↔personnel köprü → **S4**
- `last_alert_at` temelli cron, alan-maskeleme, iki 360 görünümü birleştirme → sonraki iyileştirme turları

## Başarı Kriterleri

- 6 fazın tamamı: ilgili düşük-yetkili/geçersiz-durum testleri 403/409 dönüyor.
- `npx vitest run` (backend) tam yeşil; regresyon yok.
- F2: föy ve bordro çıktısı aynı birimleri veriyor (tutarlılık testi geçiyor).
- Her faz ayrı semantic commit; sırayla push + deploy.
- Deploy sonrası prod smoke geçiyor, login akışı çalışıyor.
