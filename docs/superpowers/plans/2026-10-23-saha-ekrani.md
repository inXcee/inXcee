# Saha Ekranı Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kat hizmetleri ve çamaşırhane personeli telefondan/tabletten oda başına temizlik + doluluk ve çamaşır defteri girebilsin; panel doluluğu bu veriden gelsin.

**Architecture:** Mevcut AVS kiosk uygulamasına iki sekme (Odalar, Çamaşır) ve iki kiosk alt-router'ı (`/board`, `/laundry`) eklenir. Temizlik kaydı istendiğinde açılan `cleaning_tasks` satırıdır (`origin='field'`); doluluk `rooms.occupancy` sütunudur; çamaşır mevcut defter servisleri üzerinden yazılır. `/saha` yolu kişisel (kilitsiz) oturum açar.

**Tech Stack:** Node/Express + better-sqlite3 (vitest + supertest), React 18 + TanStack Query + Tailwind (vitest + Testing Library).

**Spec:** `docs/superpowers/specs/2026-10-23-saha-ekrani-design.md`

## Global Constraints

- "Bugün" her yerde İstanbul günü: SQL'de `date('now','localtime')` (housekeeping `localToday(db)`), JS'de `istanbulDate()`. Değiştiricisiz `date('now')` koruma testine (`time.test.js`) takılır.
- Kiosk uçları `requireAvsKiosk` arkasında; personel `req.user.workerId` (= `staff.id`). Yalnız `avsRoleGroup` ∈ {`housekeeping`, `laundry`} erişir, diğerleri 403 `Bu ekran kat hizmetleri ve çamaşırhane içindir`.
- Atlama sebep etiketleri mevcut kioskla birebir: occupied `Oda kullanımda` · dnd `Rahatsız etmeyin` · locked `Kapı kilitli` · fault `Arıza nedeniyle` · other `Diğer` (not varsa `Etiket: not`).
- Ortak alan kodları üretimle birebir: corridor `Koridor` · toilet `Tuvalet / WC` · bathroom `Banyo` · stairs `Merdiven`; anahtar `BLOK-KAT-kod`; yalnız M tipi bloklar (`BLOCK_BY_NAME[block]?.type === 'M'`).
- Oda anahtarı `BLOK-ODANO` (ör. `M1-205`), görev alanı metni `BLOK Oda ODANO`, gececi oda saati `19:00:00`, diğerleri `08:00:00`.
- Çamaşır: her `laundry_items` satırı bir torba, `item_count=1`, not `Defter (Saha ekranı) · parça sayısı yazılmadı` (+ kullanıcı notu ` · not`), kart gerekçesi `Saha ekranı`, `created_by` = `getKioskSystemUserId()`, `last_modified_worker_id` = personel, `client_request_id` = `<istemci anahtarı>#<sıra>`. `tracking_mode='individual'` torbalar bu akışa girmez.
- Her saha yazımı `audit_log`'a (`module='avs-self-service'`, `user_id=NULL`, `detail` JSON içinde `workerId`).
- Migration numarası **125**. Yeni dosyalar mevcut modül düzenini izler; `console.log` bırakılmaz; commit mesajları semantik ve Türkçe.
- Frontend metinleri `avs_kiosk.*` i18n anahtarlarıyla (tr + en tam; ar eksikse tr'ye düşer).

## Review Focus

1. **Çift dokunuş / ağ tekrarı:** "Temizlendi" iki kez gelirse ikinci istek yeni görev açmaz ve ilk temizleyeni ezmez (`already: true`) — Task 2 testi.
2. **Telefonda yürürken kilit:** `/saha` oturumu `idle_minutes: null`; PIN değişimiyle yenilenen token da kişisel kalır — Task 6 testleri.
3. **Kapalı oda:** işaret ve doluluk 409, kat toplusu kapalı/kilitli/gececi/boş/işaretli odaları atlar — Task 2 ve 3 testleri.
4. **Yanlış geri alma:** başkasının işareti 403; sahadan açılmış fotoğrafsız görev geri alınınca satır silinir (oda yeniden işaretsiz) — Task 2 testleri.
5. **Çamaşırda tekrar gönderim:** aynı `client_request_id` ikinci kez torba açmaz; tekil takipli torba hazır/teslim akışına girmez — Task 5 testleri.

---

### Task 1: Migration 125 + oda panosu okuma servisi

**Files:**
- Create: `backend/src/shared/db/migrations/125_saha_ekrani.sql`
- Create: `backend/src/modules/housekeeping/field.js`
- Modify: `backend/src/modules/housekeeping/queries.js` (ortak alan listesini `export const COMMON_AREAS` yap, `generateDailyTasks` onu kullansın)
- Test: `backend/src/modules/housekeeping/field.test.js`

**Interfaces:**
- Produces:
  - Migration: `rooms.occupancy TEXT CHECK(occupancy IN ('occupied','empty'))`, `rooms.occupancy_updated_at DATETIME`, `rooms.occupancy_updated_by_worker INTEGER REFERENCES staff(id)`, `rooms.occupancy_updated_by_user INTEGER REFERENCES users(id)`, `cleaning_tasks.origin TEXT`, `cleaning_tasks.field_worker_id INTEGER REFERENCES staff(id)`.
  - `COMMON_AREAS: {code, label}[]` (queries.js)
  - `FIELD_SKIP_REASONS: Record<'occupied'|'dnd'|'locked'|'fault'|'other', string>` (field.js)
  - `boardBlocks(db = getDB()): {block, type, rooms, open, closed, locked, cleaned, skipped, occupied, empty, unknown}[]` — yalnız `status='active'` odalar; cleaned/skipped bugünün oda görevlerinden.
  - `boardRooms(block, { workerId = null } = {}, db = getDB()): { block, date, type, floors: { floor, common_areas: Spot[], rooms: Spot[] }[] }` — `Spot = { location, id?, room_no?, code?, label?, use_state?, occupant_shift?, no_clean?, occupancy?, status: 'cleaned'|'skipped'|null, at, by, skip_reason, mine, last_cleaned_at }`; bilinmeyen blok → `null`.

- [ ] **Step 1: Failing tests** — `field.test.js` (`:memory:` + `seedDev`, kendi bloğunu `INSERT INTO rooms` ile kurar, ör. `FX` tipi M olmayan ve seed'deki bir M bloğu):
  - `boardRooms` bir kattaki odaları `room_no` sırasıyla, `status:null` (işaretsiz) döner; `use_state='closed'` oda `use_state:'closed'` gelir.
  - Bugün tamamlanmış görevi olan oda `status:'cleaned'`, `by` personel adı, `mine` istekteki `workerId` ile eşleşince `true`.
  - Dünkü tamamlanmış görev `last_cleaned_at` olarak gelir, `status` yine `null`.
  - M bloğunda her kat 4 ortak alan (`location` `M1-1-toilet` vb.) döner; M olmayanda `common_areas: []`.
  - `boardBlocks` aktif oda sayısını ve bugünkü `cleaned` sayısını doğru verir.
- [ ] **Step 2:** `cd backend && npx vitest run src/modules/housekeeping/field.test.js` → FAIL (modül yok).
- [ ] **Step 3:** Migration + `COMMON_AREAS` taşıma + `boardBlocks`/`boardRooms`. Bugün = `localToday(db)` deseni (`date('now','localtime')`).
- [ ] **Step 4:** Aynı komut PASS; `npx vitest run src/modules/housekeeping` PASS (üretim testleri kırılmadı).
- [ ] **Step 5:** Commit `feat(saha): migration 125 + oda panosu okuma servisi`.

### Task 2: Saha işareti — temizlendi / temizlenemedi / geri al

**Files:**
- Modify: `backend/src/modules/housekeeping/field.js`
- Modify: `backend/src/modules/avs-self-service/routes.js` (eski `/tasks/:id/skip` etiketleri `FIELD_SKIP_REASONS`'tan gelsin)
- Test: `backend/src/modules/housekeeping/field.test.js`

**Interfaces:**
- Consumes: Task 1 (`COMMON_AREAS`, `FIELD_SKIP_REASONS`, migration sütunları).
- Produces:
  - `resolveFieldLocation(location, db = getDB()): { kind: 'room', room } | { kind: 'common', block, floor, code, label }` — hata `statusCode` 400 (biçim) / 404 (oda ya da kat yok).
  - `markField({ location, action: 'clean'|'skip', reason, note, workerId, photoUrls = [] }, db = getDB()): { task_id, status, at, already }`
  - `undoField({ location, workerId }, db = getDB()): { ok: true, removed: boolean }`

- [ ] **Step 1: Failing tests:**
  - `markField clean` görev yoksa `origin='field'` satır açar, `completed_by_worker_id` ve `field_worker_id` = worker, `scheduled_at` gececi odada `… 19:00:00`.
  - İkinci `clean` (başka worker) `already:true` döner, ilk worker ve saat değişmez.
  - `skip` sebep `dnd` + not → `skip_reason = 'Rahatsız etmeyin: uyuyor'`; tamamlanmış görevde `skip` → 409.
  - Kapalı odada `clean` ve `skip` → 409 `Oda kapalı`.
  - `undoField` kendi `origin='field'` fotoğrafsız görevini **siler** (`removed:true`, sonra `boardRooms` `status:null`); başka worker'ın işareti → 403; fotoğraflı görevde satır kalır, `completed_at` NULL.
  - Ortak alan `M1-1-toilet` için `clean` `task_type='common_area'`, alan metni `M1 1.Kat Tuvalet / WC`.
  - `audit_log`'da `field_clean` / `field_skip` / `field_undo` satırı, detail `workerId` içerir.
- [ ] **Step 2:** `npx vitest run src/modules/housekeeping/field.test.js` → FAIL.
- [ ] **Step 3:** Uygula; tek transaction; `photoUrls` → `cleaning_task_photos` (`category='sonrasi'`) + ilk foto `photo_url`.
- [ ] **Step 4:** PASS + `npx vitest run src/modules/avs-self-service` PASS (eski skip testi).
- [ ] **Step 5:** Commit `feat(saha): istendiğinde açılan temizlik işareti ve geri alma`.

### Task 3: Doluluk + kat toplusu

**Files:**
- Modify: `backend/src/modules/housekeeping/field.js`
- Test: `backend/src/modules/housekeeping/field.test.js`

**Interfaces:**
- Produces:
  - `setOccupancy(roomId, occupancy: 'occupied'|'empty'|null, { workerId = null, userId = null }, db = getDB()): { id, occupancy, occupancy_updated_at }` — kapalı oda 409, geçersiz değer 400, `audit_log` `room_occupancy_change` (`before`, `after`).
  - `cleanFloor({ block, floor, workerId, dryRun = false }, db = getDB()): { locations: string[], excluded: { closed, locked, night, empty, no_clean, marked } }` — uygun: aktif, `use_state='open'`, `occupant_shift` gececi değil, `occupancy` boş değil, `no_clean=0`, bugün işaretsiz odalar + (M ise) bugün işaretsiz ortak alanlar.
  - `undoFloor({ locations, workerId }, db = getDB()): { undone: number, skipped: number }` — yalnız kendi işaretleri.

- [ ] **Step 1: Failing tests:** doluluk set/clear + kapalı oda 409 + audit; `cleanFloor` dryRun hiçbir şey yazmaz ve `excluded` sayılarını verir (1 kilitli, 1 gececi, 1 boş, 1 önceden işaretli kurulu katta); gerçek koşu yalnız uygun odaları işaretler; `undoFloor` aynı listeyi geri alır, başkasınınkini `skipped` sayar.
- [ ] **Step 2:** FAIL. **Step 3:** Uygula (`cleanFloor` içeride `markField` kullanır). **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(saha): oda doluluğu ve katın hepsi temizlendi`.

### Task 4: Kiosk pano uçları

**Files:**
- Create: `backend/src/modules/avs-self-service/board.js` (`export const avsBoardRouter`)
- Modify: `backend/src/modules/avs-self-service/routes.js` (`avsSelfServiceRouter.use('/board', avsBoardRouter)`)
- Test: `backend/src/modules/avs-self-service/board.test.js`

**Interfaces:**
- Consumes: Task 1–3 fonksiyonları.
- Produces (hepsi `/api/avs-self-service/board`):
  - `GET /blocks` → `{ blocks, assigned_block }`
  - `GET /rooms?block=` → `boardRooms(...)`; `assigned_block` başka blok isterse 403.
  - `POST /mark` (multipart; alanlar `location`, `action`, `reason`, `note`, isteğe bağlı `photos` en çok 3) → `markField`
  - `POST /undo` `{location}` → `undoField`
  - `PATCH /rooms/:id/occupancy` `{occupancy}` → `setOccupancy`
  - `POST /floor` `{block, floor, dry_run}` → `cleanFloor`
  - `POST /floor-undo` `{locations}` → `undoFloor`
  - `export function requireFieldGroup(req, res, next)` (bu dosyada; Task 5 de kullanır): `avsRoleGroup(department)` housekeeping/laundry değilse 403, geçerse `req.fieldWorker = { id, full_name, group, assigned_block }`.

- [ ] **Step 1: Failing tests** (supertest; temizlik ve teknik personel `staff` + `kiosk_pin` kurup `/api/auth/avs-login` ile token): teknik personel 403; temizlik personeli `GET /blocks` 200; `POST /mark` → `GET /rooms` kutucuk `cleaned`; `PATCH occupancy` 200 ve kapalı odada 409; `POST /floor dry_run:true` yazmaz; servis hatasındaki `statusCode` aynen döner (400/403/404/409), beklenmeyen hata 500 `Sunucu hatası`.
- [ ] **Step 2:** FAIL. **Step 3:** Uygula (foto yükleme `createImageUpload('housekeeping')` + `verifyImageMagicBytes`, hatada dosyaları sil). **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(saha): kiosk oda panosu uçları`.

### Task 5: Çamaşır defteri (servis + kiosk uçları)

**Files:**
- Create: `backend/src/modules/laundry/field-ledger.js`
- Create: `backend/src/modules/avs-self-service/laundry.js` (`export const avsLaundryRouter`, mount `/laundry`)
- Test: `backend/src/modules/laundry/field-ledger.test.js`, `backend/src/modules/avs-self-service/laundry-kiosk.test.js`

**Interfaces:**
- Consumes: `createItemService`, `markReadyFromLedgerService`, `deliverItemService`, `revertItemService`, `deleteItemService`, `resolveScan` + `AKSIYON`, `getKioskSystemUserId`, Task 4 `requireFieldGroup`.
- Produces:
  - `ledgerOverview(db = getDB()): { open: RoomGroup[], ready: RoomGroup[], delivered_today: RoomGroup[] }` — `RoomGroup = { room_id, block, room_no, bags, ironing, urgent, since, ids }`; açık en çok 200 torba.
  - `intakeBags({ roomId, bags, ironing, urgent, note, clientRequestId, workerId }): { ids, already }` — `bags` 1..20 değilse 400.
  - `markRoomReady({ roomId, workerId }): { ids }` · `deliverRoom({ roomId, name, workerId }): { ids }`
  - `undoLedger({ action: 'intake'|'ready'|'deliver', ids, workerId }): { undone }` — yalnız `last_modified_worker_id = workerId` ve 24 saat içi; aksi 403.
  - Uçlar: `GET /` · `POST /` (intake) · `POST /rooms/:roomId/ready` · `POST /rooms/:roomId/deliver` `{name}` · `POST /undo` `{action, ids}`.

- [ ] **Step 1: Failing tests:** 3 torba alımı 3 satır (`item_count=1`, not ve kart gerekçesi doğru, `last_modified_worker_id`); aynı `clientRequestId` ikinci kez → `already:true`, satır sayısı aynı; kart zorunluluğu açıkken (`setCardSetting`) alım yine geçer (gerekçe ile); `markRoomReady` yalnız o odanın açık, tekil olmayan torbalarını hazıra alır; `deliverRoom` yalnız hazırları teslim eder (`delivered_name`); `undoLedger` intake → satırlar silinir, ready → `dirty`, deliver → `ready`; başka worker → 403; kiosk ucu teknik personele 403.
- [ ] **Step 2:** FAIL. **Step 3:** Uygula. **Step 4:** PASS + `npx vitest run src/modules/laundry` PASS.
- [ ] **Step 5:** Commit `feat(saha): kiosk çamaşır defteri`.

### Task 6: `/saha` kişisel oturum

**Files:**
- Modify: `backend/src/shared/auth/service.js` (`kioskSessionPolicy(device = null, requestedMode = null)`; `kioskLoginOptions`, `loginAvsKiosk(workerId, pin, { device, deviceMode })`, `continuationOptions`, `sessionPolicyResponse`, `issueAvsKioskSession` saklanan `session_mode`'u dikkate alır)
- Modify: `backend/src/shared/auth/routes.js` (`/avs-login` body `device_mode`; yalnız `'personal'` kabul)
- Test: `backend/src/shared/auth/kiosk-personal.test.js`

**Interfaces:**
- Produces: `POST /api/auth/avs-login {worker_id, pin, device_mode: 'personal'}` → `session.mode === 'personal'`, `session.idle_minutes === null`, `absolute_expires_at` ≈ `kiosk_personal_session_days` gün. Kayıtlı cihaz anahtarı varsa cihaz kuralı öncelikli.

- [ ] **Step 1: Failing tests:** `device_mode` yok → `shared`, `idle_minutes: 2`; `'personal'` → `personal`, `null`; geçersiz değer (`'admin'`) → `shared`; kişisel oturumda `POST /avs-self-service/change-pin` sonrası dönen token'ın `/api/auth/kiosk-session` kuralı yine `personal`.
- [ ] **Step 2:** FAIL. **Step 3:** Uygula. **Step 4:** PASS + `npx vitest run src/shared/auth` PASS.
- [ ] **Step 5:** Commit `feat(saha): /saha için kişisel kiosk oturumu`.

### Task 7: Panel doluluğu sahadan + web doluluk ucu

**Files:**
- Modify: `backend/src/modules/dashboard/queries.js` (`fieldOccupancy(db)`; `_getKPI`, `_getHealthScore`, `_getHeatmap`, `_getBedOccupancy`)
- Modify: `backend/src/modules/housekeeping/routes.js` (`PATCH /rooms/:id/occupancy`, müdür + amir — mevcut `/rooms/:id/state` ile aynı yetki)
- Test: `backend/src/modules/dashboard/dashboard.test.js`, `backend/src/modules/housekeeping/field.test.js` (route bloğu)

**Interfaces:**
- Produces: KPI ek alanları `occupancy_source: 'field'|'beds'`, `rooms_occupied`, `rooms_empty`, `rooms_unknown`; saha modunda `occupancy_pct = round(dolu*100/(dolu+boş))` (kapalı odalar hariç), `occupancy_pct_prev = null`. Isı haritası satırı `occupied_rooms`, `empty_rooms`, `unknown_rooms` ve saha modunda blok `pct` oda bazlı. Blok doluluk paneli satır + toplamda aynı üç alan. Sağlık skoru doluluk bileşeni aynı yüzdeyi kullanır.

- [ ] **Step 1: Failing tests:** hiç saha verisi yokken KPI `occupancy_source:'beds'` (bugünkü değerler aynı); 3 dolu + 1 boş işaretlenince `occupancy_source:'field'`, `occupancy_pct:75`, `rooms_unknown` doğru; kapalı oda paydaya girmez; sağlık skoru DOLULUK bileşeni `100 - |85-75| = 90`; ısı haritası ilgili blokta `pct:75`; web ucu amir 200, teknik 403.
- [ ] **Step 2:** FAIL. **Step 3:** Uygula. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(saha): panel doluluğu saha verisinden`.

### Task 8: Odalar sekmesi (kiosk)

**Files:**
- Create: `frontend/src/modules/avs-self-service/logic/board.js` (+ `board.test.js`)
- Create: `frontend/src/modules/avs-self-service/tabs/RoomsBoardTab.jsx` (+ `RoomsBoardTab.smoke.test.jsx`)
- Create: `frontend/src/modules/avs-self-service/components/SpotSheet.jsx`
- Modify: `frontend/src/shared/i18n/dict.js` (`avs_kiosk.nav.rooms`, `avs_kiosk.board.*` tr + en)

**Interfaces:**
- Consumes: Task 4 uçları.
- Produces: `RoomsBoardTab({ avsApi, onReportFault })` — kendi sorgu/mutation'ları (`['avs-board-blocks']`, `['avs-board-rooms', block]`); `logic/board.js`: `spotTone(spot): 'cleaned'|'skipped'|'closed'|'idle'`, `floorProgress(floor): { total, cleaned, skipped, occupied, empty }` (kapalılar `total`'a girmez).

- [ ] **Step 1: Failing tests:** `board.test.js` tone ve ilerleme değerleri (el ile türetilmiş); smoke: blok çipine basınca odalar gelir, kutucuğa basınca sheet açılır, **Temizlendi** `POST /board/mark` (`location`, `action:'clean'`) çağırır ve "Geri al" bildirimi görünür, **Geri al** `POST /board/undo` çağırır; **Katın hepsi temizlendi** önce `dry_run:true` ile sayı gösterir, onayda `dry_run:false`.
- [ ] **Step 2:** `cd frontend && npx vitest run src/modules/avs-self-service` → FAIL.
- [ ] **Step 3:** Uygula — kiosk görsel dili (slate koyu tema, `min-h-12` dokunma alanı, `rounded-2xl`); kutucuk: yeşil ✓ / turuncu ⊘ / nötr, sağ üst doluluk rozeti (👤 / ○), kapalı ⛔ soluk, kilitli 🔒, gececi ☾; çevrimdışıyken düğmeler pasif ve uyarı.
- [ ] **Step 4:** PASS. **Step 5:** Commit `feat(saha): kiosk Odalar sekmesi`.

### Task 9: Çamaşır sekmesi (kiosk)

**Files:**
- Create: `frontend/src/modules/avs-self-service/tabs/LaundryLedgerTab.jsx` (+ `LaundryLedgerTab.smoke.test.jsx`)
- Modify: `frontend/src/shared/i18n/dict.js` (`avs_kiosk.nav.laundry`, `avs_kiosk.laundry.*`)

**Interfaces:**
- Consumes: Task 5 uçları, Task 4 `GET /board/blocks` + `GET /board/rooms` (oda seçici).
- Produces: `LaundryLedgerTab({ avsApi })`.

- [ ] **Step 1: Failing smoke tests:** üç liste başlığı sayılarla; **Çamaşır al** → blok → oda → torba sayısı 2 → Ütü → Kaydet `POST /laundry` gövdesi `{room_id, bags:2, ironing:true, urgent:false, client_request_id}` (anahtar her açılışta yeni, tekrar denemede aynı); karttaki **Hazır** `POST /laundry/rooms/:id/ready`; **Teslim et** isim sorar ve `POST .../deliver {name}`; işlem sonrası **Geri al** `POST /laundry/undo {action, ids}`.
- [ ] **Step 2:** FAIL. **Step 3:** Uygula. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(saha): kiosk Çamaşır sekmesi`.

### Task 10: Kiosk tümleştirme + `/saha` yolu

**Files:**
- Modify: `frontend/src/modules/avs-self-service/AvsSelfServicePage.jsx` (sekmeler, rol sırası, `deviceMode` prop, oturum anahtarı)
- Modify: `frontend/src/App.jsx` (`/saha` → `<AvsSelfServicePage deviceMode="personal" />`)
- Create: `frontend/public/manifest-saha.json` (`start_url: "/saha"`, ad "YYS Saha")
- Test: `frontend/src/modules/avs-self-service/avsSelfService.smoke.test.jsx`

**Interfaces:**
- Produces: sekme sırası — housekeeping `['home','rooms','laundry','quick_fault']`, laundry `['home','laundry','rooms','shifts']`, technical aynı (`tasks` yalnız technical'da görünür); `rooms`/`laundry` yalnız housekeeping + laundry gruplarında. `deviceMode==='personal'` iken giriş gövdesine `device_mode:'personal'`, oturum anahtarı `saha-session`, `<link rel="manifest">` `manifest-saha.json`. Ana sayfanın görev kartı housekeeping'de `rooms` sekmesine gider ve "bugün temizlendi" sayısını gösterir (overview `tasks.completed`).

- [ ] **Step 1: Failing tests:** housekeeping overview ile alt menüde ilk iki sekme Ana sayfa + Odalar ve Görevler yok; laundry'de Çamaşır ikinci; `deviceMode="personal"` ile giriş isteği `device_mode:'personal'` içerir.
- [ ] **Step 2:** FAIL. **Step 3:** Uygula. **Step 4:** `npx vitest run` (frontend tümü) PASS + `npx vite build` OK.
- [ ] **Step 5:** Commit `feat(saha): kiosk sekmeleri ve /saha yolu`.

### Task 11: Yönetici web tarafı + afiş + belge

**Files:**
- Modify: `frontend/src/modules/housekeeping/RoomStatePanel.jsx` (DOLULUK satırı: 👤 Dolu · ○ Boş · — Bilinmiyor → `PATCH /housekeeping/rooms/:id/occupancy`)
- Modify: `frontend/src/modules/housekeeping/RoomTile.jsx` (doluluk rozeti)
- Modify: `frontend/src/modules/dashboard/DashboardPage.jsx` (KPI alt satırı `occupancy_source==='field'` iken `X dolu / Y oda · Z bilinmiyor`)
- Modify: `frontend/src/modules/admin/KioskPinPage.jsx` (**Saha afişi yazdır**: `openPrintWindow` + `https://avskamp.com/saha` QR + 3 adımlık kullanım metni)
- Create: `docs/saha-ekrani.md`; Modify: `CLAUDE.md` (Saha Ekranı bölümü → bu belge)
- Test: `frontend/src/modules/housekeeping/RoomStatePanel.smoke.test.jsx`

- [ ] **Step 1: Failing test:** RoomStatePanel'de **Boş**'a basınca `PATCH /housekeeping/rooms/:id/occupancy {occupancy:'empty'}`.
- [ ] **Step 2:** FAIL. **Step 3:** Uygula. **Step 4:** frontend + backend tüm testler PASS, build OK.
- [ ] **Step 5:** Commit `feat(saha): web doluluk, afiş ve işletim belgesi`.

### Task 12: Doğrulama ve staging

- [ ] **Step 1:** `cd backend && npx vitest run` ve `cd frontend && npx vitest run && npx vite build` — hepsi yeşil.
- [ ] **Step 2:** PR aç, CI yeşil, birleştir.
- [ ] **Step 3:** `deploy-yys-staging.ps1 -SkipPush`; health migration 126/126.
- [ ] **Step 4:** Staging'de test personeliyle (geçici PIN) `/saha` girişi → oda işaretle → geri al → doluluk → çamaşır al/hazır/teslim/geri al; panel KPI `occupancy_source:'field'`; test kayıtlarını geri al.
- [ ] **Step 5:** Kullanıcıya canlı onayı ve PIN dağıtımı için hazır olduğunu bildir.
