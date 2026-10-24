# Oda QR'ı ile Saha Takibi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Temizlikçi kapıdaki QR'ı okutunca `/saha`'da o yerin alt sayfası "QR ile doğrulandı" açılsın; işaretler kanıtlı kaydedilsin, istenirse doğrulanmış etiketli kapıda okutmasız işaret engellensin; sakin portalının çamaşır talebi ve temizlik şikayeti sahaya, kapsama ve kişi başı QR oranı web'e gelsin.

**Architecture:** Mevcut QR portalı (token, etiket, kurulum tabloları; `docs/room-qr-portal.md`) aynen kullanılır; konum anahtarı saha anahtarıyla aynıdır (`service_locations.qr_location` = `M1-101` / `M1-1-corridor`). Okutma `location_portal_events`'e `field_scan` olarak yazılır, işaret 60 dk içindeki okutmayı `cleaning_tasks.verified_by_qr` + `verified_scan_event_id` ile bağlar. Yeni iş kuralı `location-portal/field-scan.js` (okutma, etiket durumu, zorunluluk) ve `housekeeping/field.js` (işaret) içinde; uçlar `avs-self-service/qr.js` + `board.js`.

**Tech Stack:** Node/Express + better-sqlite3 (vitest + supertest), React 18 + TanStack Query + Tailwind (vitest + Testing Library), Playwright E2E, `html5-qrcode` (`QrScannerModal`).

**Spec:** `docs/superpowers/specs/2026-10-24-oda-qr-saha-design.md`

## Global Constraints

- Okutma geçerlilik penceresi **60 dk** (`FIELD_SCAN_WINDOW_MINUTES = 60`, istemcide `SCAN_WINDOW_MS = 3600000`).
- Ayar `system_settings.saha_qr_enforcement` ∈ `'off'` (varsayılan) | `'verified_labels'`.
- Okutma olayı: `location_portal_events.event_type='field_scan'`, `actor_mode='worker'`, `result='opened'`, `metadata {via}` ve `via ∈ 'camera' | 'in_app'`.
- Zorunluluk yalnız etiket durumu `verified` olan yerde (asılı QR = aktif QR); `stale`/`installed`/`none` yerde okutma istenmez.
- Token **hiçbir yanıtta, metinde, logda** yer almaz; saha yanıtları konum anahtarı döner.
- Hata metinleri ve kodları (aynen): `qr_unknown` 404 "Bu QR sistemde tanımlı değil" · `qr_revoked` 410 "Bu etiket iptal edilmiş; yenisi basılmalı" · `location_inactive` 410 "Bu konum kullanımda değil" · `qr_scan_required` 409 "Bu kapıda QR etiketi var; işaretlemek için kapıdaki QR'ı okut".
- Migration dosyası `backend/src/shared/db/migrations/126_oda_qr_saha.sql`.
- Kiosk metinleri `frontend/src/shared/i18n/dict.js` tr + en (ar tr'ye düşer); `t(key, fallback)` interpolasyonsuz.
- Mevcut desenler: servis `fail(message, statusCode, code)`, uç `next(e)`, kiosk uçları `requireAvsKiosk`, saha uçları `requireFieldGroup` + `blockAllowed`.

## Review Focus

1. **Başkasının / süresi geçmiş okutması** gönderilirse işaret doğrulanmış sayılmamalı; zorunlu kapıda 409 dönmeli (Task 3 testi `başka kişinin ya da 60 dk'dan eski okutması doğrulamaz`).
2. **Kamera uygulaması URL'yi değiştirir** (sonda `/`, `?utm=…`, `#`): token yine çözülmeli (Task 1 testi `URL biçimleri`).
3. **Alım geri alınırken sakin yeniden talep etmişse** benzersiz açık-talep indeksi patlamamalı; eski talep iptal, yeni talep açık kalmalı (Task 5 testi `yeni talep açıkken geri alma eskiyi iptal eder`).
4. **Şikayet takip görevi**: ilk görev temizlenmiş, takip açık → pano "tekrar temizle" göstermeli, "Temizlendi" takip görevini kapatmalı, "zaten temizlenmiş" dememeli (Task 3 testi `şikayet takip görevi`).
5. **Girişsiz kamera okutması**: `?qr=` girişten sonra da işlenmeli ve adres çubuğundan hemen silinmeli (Task 8 testi `bekleyen QR girişten sonra işlenir`).

---

### Task 1: Veri + okutma servisi + hata kodu

**Files:**
- Create: `backend/src/shared/db/migrations/126_oda_qr_saha.sql`
- Create: `backend/src/modules/location-portal/field-scan.js`
- Modify: `backend/src/app.js` (`globalErrorHandler`)
- Test: `backend/src/modules/location-portal/field-scan.test.js`, `backend/src/app.error-handler.test.js` (yoksa mevcut globalErrorHandler testine ekle)

**Interfaces:**
- Produces:
  - `FIELD_SCAN_WINDOW_MINUTES = 60`
  - `parseQrInput(value: string) -> string|null` — URL ya da çıplak token; son yol parçası, `?`/`#` atılır; 43–64 karakter değilse `null`.
  - `resolveScanTarget(qr: string, db) -> target` — `{ qr_id, location_id, location, kind: 'room'|'common', block, floor, room_id, display_name }`; atar: 404 `qr_unknown`, 410 `qr_revoked`, 410 `location_inactive`. (`service.js` `resolveLocationToken` kullanılır.)
  - `recordFieldScan({ target, workerId, via = 'in_app', ip }, db) -> { scan_id, location, kind, block, floor, room_id, display_name, label, at }`
  - `findValidFieldScan({ scanId, workerId, location }, db) -> { id, created_at }|null` — aynı kişi, aynı `qr_location`, `field_scan`, son 60 dk.
  - `labelStates(db, keys: string[]) -> Map<string, 'verified'|'installed'|'printed'|'damaged'|'replaced'|'removed'|'stale'|'none'>`; `labelState(db, key)`.
  - `fieldQrEnforcement(db) -> 'off'|'verified_labels'`; `qrRequiredFor(db, key) -> boolean`.
  - `globalErrorHandler`: durum < 500, FK ihlali değil ve `err.code` metinse yanıta `code` eklenir.

- [ ] **Step 1: Failing tests** (`field-scan.test.js`; FB bloğu odaları + `generateMissingQrCodes()`; token DB'den okunur)
  - `URL biçimleri`: `parseQrInput('https://avskamp.com/r/<t>')`, `'<url>/'`, `'<url>?utm=x'`, `'<url>#a'`, `'<t>'` → `<t>`; `'abc'` → `null`.
  - `okutma kaydı`: `recordFieldScan` → `location === 'FB-101'`, `kind === 'room'`, `label === 'none'`; olay satırı `event_type='field_scan'`, `actor_mode='worker'`, `actor_staff_id`, `metadata` içinde `via`.
  - `iptal / bilinmeyen / pasif`: `rotateLocationQr` sonrası eski token → 410 `qr_revoked`; uydurma 43 karakter → 404 `qr_unknown`; `service_locations.is_active=0` → 410 `location_inactive`.
  - `pencere`: kendi okutması → bulunur; başka kişi → `null`; başka yer → `null`; `created_at` 61 dk geri çekilince → `null`.
  - `etiket durumu ve zorunluluk`: kayıt yok → `none`; `verifyDeployment` sonrası `verified`; `rotateLocationQr` sonrası `stale`; ayar `off` iken `qrRequiredFor` false, `verified_labels` + verified → true, stale → false.
  - Hata işleyici: `Object.assign(new Error('x'), { statusCode: 409, code: 'qr_scan_required' })` → gövde `{ error: 'x', code: 'qr_scan_required' }`; 500 hatada `code` yok.
- [ ] **Step 2: Run** `cd backend && npx vitest run src/modules/location-portal/field-scan.test.js` — Expected: FAIL (modül yok).
- [ ] **Step 3: Migration 126** — `location_qr_deployments.installed_by_staff_id`, `verified_by_staff_id` → `staff(id)`; `location_qr_verify_mismatches.reported_by_staff_id` → `staff(id)`; `cleaning_tasks.verified_scan_event_id` → `location_portal_events(id)`; `CREATE INDEX ix_location_portal_events_staff_scan ON location_portal_events(actor_staff_id, event_type, created_at)`; `INSERT OR IGNORE INTO system_settings(key,value) VALUES('saha_qr_enforcement','off')`.
- [ ] **Step 4: Implement** `field-scan.js` (event `recordPortalEvent` ile; `ip` → `portalIpHash`) ve `globalErrorHandler` kodu.
- [ ] **Step 5: Run** aynı komut + `npx vitest run src/shared/db` — Expected: PASS; migration sayımı testi varsa 126'yı bekleyecek şekilde güncellenir.
- [ ] **Step 6: Commit** `feat(qr): saha okutma kaydı, etiket durumu ve zorunluluk ayarı (migration 126)`

### Task 2: Kiosk okutma ucu + sahadan etiket doğrulama

**Files:**
- Create: `backend/src/modules/avs-self-service/qr.js` (router), test `qr-scan.test.js`
- Modify: `backend/src/modules/avs-self-service/routes.js` (mount `/qr-scan`), `schemas.js`, `board.js` (`POST /label-verify`), `backend/src/modules/location-portal/deployment.js` (`verifyDeployment` + `staffId`)
- Test: `board.test.js`, `deployment.test.js`

**Interfaces:**
- Consumes: Task 1 `resolveScanTarget`, `recordFieldScan`.
- Produces:
  - `POST /api/avs-self-service/qr-scan` `{ qr: string(10..500), via: 'camera'|'in_app' }` → `{ scan_id, location, kind, block, floor, room_id, display_name, label, at, group }` (`group` = `avsRoleGroup`); tüm kiosk personeli; bloğa atanmışsa başka blok 403 `BLOCK_DENIED` (olay yazılmadan).
  - `verifyDeployment({ token, expectedLocationId, userId, note, staffId = null })` → `verified_by_staff_id` / `installed_by_staff_id` (yeni satırda) / uyuşmazlıkta `reported_by_staff_id`.
  - `verifyFieldLabel({ location, qr, workerId }, db) -> { ok, code, message }` (`field-scan.js`; saha anahtarından `service_locations.id`).
  - `POST /board/label-verify` `{ location, qr }` → `verifyFieldLabel`.
- [ ] **Step 1: Failing tests**
  - `qr-scan.test.js`: oturumsuz 401; temizlikçi → 200, `location 'FB-101'`, `group 'housekeeping'`, yanıt gövdesinde token yok (`JSON.stringify(body)` token'ı içermez); teknik → 200 `group 'technical'`; M2'ye atanmış personel FB etiketi → 403 ve `field_scan` olayı yazılmamış; bozuk `qr` (5 karakter) → 400.
  - `board.test.js` `etiket doğrulama`: doğru kapı → `{ ok: true, code: 'verified' }` ve `location_qr_deployments.verified_by_staff_id = cleaner.id`; başka odanın etiketi → `{ ok: false, code: 'location_mismatch' }` ve uyuşmazlık satırında `reported_by_staff_id`; teknik → 403.
- [ ] **Step 2: Run** `npx vitest run src/modules/avs-self-service/qr-scan.test.js src/modules/avs-self-service/board.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** router + şemalar (`qrScanSchema`, `fieldLabelVerifySchema`) + `verifyDeployment` `staffId` + `verifyFieldLabel`.
- [ ] **Step 4: Run** aynı + `npx vitest run src/modules/location-portal` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(qr): kiosk okutma ucu ve sahadan etiket doğrulama`

### Task 3: Kanıtlı işaret, zorunluluk, şikayet takip görevi

**Files:**
- Modify: `backend/src/modules/housekeeping/field.js`, `backend/src/modules/avs-self-service/schemas.js` (`fieldMarkSchema` + `scan_id`), `board.js` (`/mark` → `scanId`)
- Test: `backend/src/modules/housekeeping/field.test.js`

**Interfaces:**
- Consumes: Task 1 `findValidFieldScan`, `qrRequiredFor`.
- Produces:
  - `markField({ ..., scanId = null }) -> { task_id, status, at, already, verified_by_qr: boolean }`
  - `currentTask(db, key, today)` — bugünün **son** görevi (`ORDER BY id DESC LIMIT 1`); `markField`, `undoField`, `cleanFloor`, `boardRooms` bunu kullanır (eski `todayTask` kaldırılır).
  - `cleanFloor` dışlama anahtarlarına `qr_required` (öncelik closed > locked > no_clean > night > empty > qr_required > marked).
  - Zorunlu yerde okutmasız temizlendi/temizlenemedi → `fail(<metin>, 409, 'qr_scan_required')`.
- [ ] **Step 1: Failing tests** (`field.test.js`)
  - `geçerli okutma doğrular`: okut → `markField({ ..., scanId })` → `verified_by_qr === true`, görevde `verified_by_qr=1`, `verified_scan_event_id = scan_id`.
  - `başka kişinin ya da 60 dk'dan eski okutması doğrulamaz`: ikisi de `verified_by_qr === false` (ayar off); ayar `verified_labels` + etiket verified iken ikisi de 409 `qr_scan_required`.
  - `zorunluluk yalnız doğrulanmış etikette`: `verified_labels` + etiketsiz oda → okutmasız 200; verified etiketli oda → okutmasız clean ve skip 409; geçerli okutmayla 200; `undoField` okutmasız çalışır; `setOccupancy` okutmasız çalışır.
  - `kat toplusu zorunlu yeri dışarıda bırakır`: dryRun `excluded.qr_required === 1`, `locations` o yeri içermez.
  - `şikayet takip görevi`: `location_portal_enabled` ve `location_portal_cleaning_enabled` = '1', token üret; oda `markField(clean)` → `reviewPortalCleaning({ token, sessionToken: null, body: { outcome: 'issue', comment: 'Çöp alınmamış', client_request_id: <geçerli anahtar> }, ip: '127.0.0.1' })` → yeni `markField(clean)` `already === false` ve `task_id === followup_task_id`; `undoField` takip görevini geri alır, ilk görev temizlenmiş kalır.
- [ ] **Step 2: Run** `npx vitest run src/modules/housekeeping/field.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** (`currentTask`; doğrulama yalnız `findValidFieldScan` sonucu varsa; zorunluluk `qrRequiredFor`).
- [ ] **Step 4: Run** `npx vitest run src/modules/housekeeping src/modules/avs-self-service` — Expected: PASS (mevcut field/board testleri dahil).
- [ ] **Step 5: Commit** `feat(saha): QR'lı işaret, zorunluluk ve şikayet takip görevi`

### Task 4: Pano verisi

**Files:**
- Modify: `backend/src/modules/housekeeping/field.js` (`boardRooms`, `boardBlocks`)
- Test: `field.test.js`, `board.test.js`

**Interfaces:**
- Consumes: Task 1 `labelStates`, `fieldQrEnforcement`; Task 3 `currentTask` mantığı.
- Produces: `boardRooms` → `{ ..., enforcement }`; her yer `+ verified_by_qr, label, qr_required`; odalarda `+ pickup_request: { id, created_at, request_count, note }|null`; her yerde `+ complaint: { comment, rating, created_at, open }|null` (geçerli görev bir takip göreviyse). `boardBlocks` her blok `+ qr_verified`; sayaçlar yer başına geçerli göreve göre (takip görevi çift saymaz).
- [ ] **Step 1: Failing tests**
  - `pano QR ve etiket alanları`: okutmalı temizlenen odada `verified_by_qr true`; `label` `none`/`verified`; `verified_labels` iken verified odada `qr_required true`; yanıt `enforcement`.
  - `çamaşır talebi ve şikayet bayrağı`: açık `laundry_pickup_requests` olan odada `pickup_request.request_count`; şikayetli odada `complaint.open === true`, takip temizlenince `open === false`.
  - `blok sayaçları takip görevini çift saymaz`: ilk görev + takip ikisi de temizlenince blokta `cleaned === 1`; `qr_verified` doğru.
- [ ] **Step 2: Run** `npx vitest run src/modules/housekeeping/field.test.js src/modules/avs-self-service/board.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** (tek sorgu ile yer başına son görev; etiket ve talep haritaları blok için toplu).
- [ ] **Step 4: Run** aynı — Expected: PASS.
- [ ] **Step 5: Commit** `feat(saha): panoda QR, etiket, çamaşır talebi ve şikayet bilgisi`

### Task 5: Çamaşır talebi sahada

**Files:**
- Modify: `backend/src/modules/laundry/field-ledger.js`
- Test: `backend/src/modules/laundry/field-ledger.test.js`, `backend/src/modules/avs-self-service/laundry-kiosk.test.js`

**Interfaces:**
- Consumes: `location-portal/laundry-request-action.js` `closePickupRequest`.
- Produces: `ledgerOverview` `+ requests: [{ id, room_id, block, room_no, note, request_count, created_at }]` (blok kuralıyla, sakin adı yok); `intakeBags` `+ request_closed: number|null`; `undoLedger('intake')` talebi geri açar ya da iptal eder.
- [ ] **Step 1: Failing tests**
  - `açık talep defterde`: talep → `ledgerOverview().requests[0].room_id`; M2'ye atanmış personelin görünümünde FB talebi yok (laundry-kiosk).
  - `alım talebi kapatır`: `intakeBags` → `request_closed === <id>`, talep `collected`, `laundry_item_id = ids[0]`.
  - `alım geri alınınca talep açılır`: `undoLedger('intake')` → talep `open`, `laundry_item_id NULL`, torbalar silinmiş (FK hatası yok).
  - `yeni talep açıkken geri alma eskiyi iptal eder`: alım sonrası aynı odaya yeni talep → geri al → eski `cancelled` (`cancelled_reason` dolu), yeni `open`.
- [ ] **Step 2: Run** `npx vitest run src/modules/laundry/field-ledger.test.js src/modules/avs-self-service/laundry-kiosk.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** (kapatma alım işleminin içinde; geri açma silmeden **önce**).
- [ ] **Step 4: Run** aynı + `npx vitest run src/modules/location-portal/laundry-request.test.js` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(saha): sakinin çamaşır talebi defterde, alım talebi kapatır`

### Task 6: Web saha takibi verisi + zorunluluk anahtarı

**Files:**
- Create: `backend/src/modules/housekeeping/field-report.js`, test `field-report.test.js`
- Modify: `backend/src/modules/housekeeping/routes.js`, `schemas.js`

**Interfaces:**
- Consumes: Task 1 `labelStates`, `fieldQrEnforcement`.
- Produces:
  - `fieldReport({ date }, db) -> { date, enforcement, workers: [{ worker_id, full_name, cleaned, skipped, qr_verified, first_at, last_at }], blocks: [{ block, locations, verified, installed, printed, stale, damaged, none }], mismatches_open }` — gün İstanbul günü (`localToday` varsayılan); yer başına geçerli görev.
  - `setFieldQrEnforcement(mode, userId, db) -> { enforcement }` + denetim `saha_qr_enforcement_change`.
  - `GET /api/housekeeping/field-report?date=YYYY-MM-DD` (müdür + amir), `PUT /api/housekeeping/field-qr-enforcement` `{ mode }` (yalnız `campus_manager`).
- [ ] **Step 1: Failing tests**
  - `kişi başı sayılar`: iki kişinin işaretleri → doğru `cleaned/skipped/qr_verified`, `first_at <= last_at`.
  - `blok kapsaması`: bir verified, bir installed, kalanlar `none`; rotate sonrası `stale`.
  - `yetki ve anahtar`: amir rapor 200, anahtar 403; müdür anahtar `verified_labels` → ayar yazıldı + denetim satırı; geçersiz mod 400.
- [ ] **Step 2: Run** `npx vitest run src/modules/housekeeping/field-report.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/modules/housekeeping` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(saha): web saha takibi raporu ve QR zorunluluk anahtarı`

### Task 7: Kiosk Odalar — okutma, alt sayfa, kutucuklar

**Files:**
- Modify: `frontend/src/modules/avs-self-service/tabs/RoomsBoardTab.jsx`, `components/SpotSheet.jsx`, `logic/board.js`, `frontend/src/shared/i18n/dict.js`
- Test: `tabs/RoomsBoardTab.smoke.test.jsx`, `logic/board.test.js`

**Interfaces:**
- Consumes: Task 2 `/qr-scan`, `/board/label-verify`; Task 3 `scan_id`; Task 4 alanları.
- Produces:
  - `logic/board.js`: `SCAN_WINDOW_MS = 3600000`; `scanFresh(scan, location, now = Date.now()) -> boolean`; `spotTone` `'complaint'` (açık şikayet, öncelik closed > complaint > cleaned > skipped > idle).
  - `RoomsBoardTab({ avsApi, onReportFault, isOnline, pendingScan, onPendingScanDone })` — `pendingScan = { qr, via }`.
  - `SpotSheet` yeni props: `scan` (`{ at }|null`), `onScanRequest()`, `onVerifyLabel()`, `portalHref` (`string|null`).
- [ ] **Step 1: Failing tests**
  - `board.test.js`: `scanFresh` (aynı yer 59 dk true, 61 dk false, başka yer false); `spotTone` complaint.
  - `RoomsBoardTab.smoke`: `pendingScan` verilince `/qr-scan` çağrılır, bloğu seçer ve `A-101` alt sayfası "QR ile doğrulandı" rozetiyle açılır; alt sayfada "Sakin sayfası" bağlantısı okutulan adres + `?sakin=1`; kat başlığında QR'lı sayı ("· 1 QR"); "Temizlendi" isteği `scan_id` taşır; `qr_required` + okutma yok → "Temizlendi" pasif ve "Kapıdaki QR'ı okut" görünür; etiket `none` iken "Etiketi doğrula" görünür; `pickup_request` → 🧺 satırı; `complaint.open` → ⚠ kutusu ve yorum; okutma hatası (404) → bildirimde "Bu QR sistemde tanımlı değil".
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/modules/avs-self-service` — Expected: FAIL.
- [ ] **Step 3: Implement** ("📷 QR okut" başlıkta; `QrScannerModal` `shared/components`; etiket doğrulama aynı tarayıcıyla; kutucukta 📍 doğrulanmış, 🧺 talep, ⚠ şikayet; `spotLabel` aria'ya "QR ile doğrulandı"/"çamaşır talebi"/"şikayet").
- [ ] **Step 4: Run** aynı — Expected: PASS.
- [ ] **Step 5: Commit** `feat(saha): Odalar'da QR okutma, doğrulanmış işaret ve etiket doğrulama`

### Task 8: Sayfa yönlendirme, çamaşır talepleri, portal yönlendirmesi

**Files:**
- Modify: `frontend/src/modules/avs-self-service/AvsSelfServicePage.jsx`, `tabs/LaundryLedgerTab.jsx`, `frontend/src/modules/room-portal/RoomPortalPage.jsx`, `dict.js`
- Test: `avsSelfService.smoke.test.jsx`, `tabs/LaundryLedgerTab.smoke.test.jsx`, `frontend/src/modules/room-portal/RoomPortalPage.*test.jsx` (mevcut dosyaya ekle; yoksa oluştur)

**Interfaces:**
- Consumes: Task 2 `/qr-scan` (`group`), Task 5 `requests`, Task 7 `RoomsBoardTab` props.
- Produces: `?qr=` okunur → `sessionStorage['saha-pending-qr']` → `history.replaceState` ile adresten silinir; giriş + overview sonrası saha grubu → Odalar + `pendingScan`; teknik/genel → `/qr-scan` sonucu ile konumu dolu arıza formu. Portal: `?sakin` yoksa ve `localStorage['saha-session']` token'lıysa veri çekmeden `/saha?qr=<encodeURIComponent(token)>`'a `replace`; eski "çalışan doğrulama / kontrol listesi / kanıt fotoğrafı" bölümü yerine "Görevliysen: Saha ekranında aç" bağlantısı.
- [ ] **Step 1: Failing tests**
  - `bekleyen QR girişten sonra işlenir`: `/saha?qr=X` girişsiz açılır → adres `?qr` içermez; giriş sonrası Odalar sekmesi aktif ve `RoomsBoardTab`'a `pendingScan.qr === X`.
  - `teknik QR okutunca arıza formu`: `group 'technical'` → Arıza sekmesi, konum metni `display_name`.
  - `LaundryLedgerTab`: `requests` varsa "Talepler" ve oda; "Çamaşır al" alım sayfasını o odayla açar.
  - `RoomPortalPage`: `saha-session` varken `location.replace('/saha?qr=…')` çağrılır ve portal isteği atılmaz; `?sakin=1` ile yönlendirme yok; görevli bölümünde bağlantı `/saha?qr=`.
- [ ] **Step 2: Run** `npx vitest run src/modules/avs-self-service src/modules/room-portal` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** aynı + `npx vitest run` (tam frontend) — Expected: PASS.
- [ ] **Step 5: Commit** `feat(saha): kamera okutması /saha'ya, çamaşır talepleri defterde, portal görevliyi sahaya yollar`

### Task 9: Web "Saha takibi" görünümü

**Files:**
- Create: `frontend/src/modules/housekeeping/FieldTrackingPanel.jsx`, test `FieldTrackingPanel.smoke.test.jsx`
- Modify: `frontend/src/modules/housekeeping/HousekeepingPage.jsx` (`viewMode 'field'`, düğme "📍 SAHA TAKİBİ")

**Interfaces:**
- Consumes: Task 6 uçları.
- Produces: `FieldTrackingPanel({ canManage })` — kişi tablosu (QR % = `qr_verified/cleaned`), blok kapsama tablosu, açık yanlış-kapı sayısı, zorunluluk seçimi (yalnız `canManage`; değişince onay penceresi).
- [ ] **Step 1: Failing tests**: tablo satırları ve `%` metni; `canManage=false` seçim yok; seçim değişince onaydan sonra `PUT /housekeeping/field-qr-enforcement` `{ mode: 'verified_labels' }`.
- [ ] **Step 2: Run** `npx vitest run src/modules/housekeeping` — Expected: FAIL.
- [ ] **Step 3: Implement** (mevcut web `panel`/`data-table` sınıfları, `ConfirmDialog`).
- [ ] **Step 4: Run** aynı — Expected: PASS.
- [ ] **Step 5: Commit** `feat(saha): web temizlik sayfasında saha takibi görünümü`

### Task 10: Belgeler + E2E

**Files:**
- Modify: `docs/saha-ekrani.md` (QR bölümü + kurulum adımları), `docs/room-qr-portal.md` (görevli akışı sahada, `*_staff_id`, `field_scan`, zorunluluk), `CLAUDE.md` (Saha Ekranı bölümüne tek satır), `frontend/playwright.config.js` (`process.env.E2E_DB_PATH = E2E_DB`), `frontend/e2e/avs-kiosk-ux.spec.js`
- Test: E2E

**Interfaces:**
- Consumes: hepsi.
- [ ] **Step 1: Failing E2E** `QR okutma: /saha?qr= odanın sayfasını doğrulanmış açar; portal görevliyi sahaya yollar` — `beforeAll`'da `POST /api/location-portal/locations/generate-missing` (müdür); token `better-sqlite3` ile `E2E_DB_PATH`'ten (salt okunur) `A-101`; `/saha?qr=<url>` → giriş → "QR ile doğrulandı" → Temizlendi → kutucuk "101, temizlendi, QR ile doğrulandı" → bildirimden Geri al; sonra `/r/<token>` → `/saha?qr=`'ya döner ve alt sayfa açılır.
- [ ] **Step 2: Run** `cd frontend && npx playwright test e2e/avs-kiosk-ux.spec.js` — Expected: önce FAIL (config değişmeden token okunamaz), sonra PASS.
- [ ] **Step 3: Docs** güncellenir.
- [ ] **Step 4: Run** `npm run test:e2e` (tam) — Expected: PASS.
- [ ] **Step 5: Commit** `test(e2e): QR okutma uçtan uca; belgeler`
