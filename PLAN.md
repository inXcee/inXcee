# Yatakhane Yönetim Sistemi — Geliştirme Planı

## Mevcut Modüller (Tamamlanan)

| # | Modül | Backend | Frontend | Test | Durum |
|---|-------|---------|----------|------|-------|
| 1 | Auth & Login | ✅ | ✅ | ✅ | Tamamlandı |
| 2 | Dashboard | ✅ | ✅ | ✅ | Tamamlandı |
| 3 | Check-in (Kayıt) | ✅ | ✅ | ✅ | Tamamlandı |
| 4 | Capacity (Kapasite) | ✅ | ✅ | ✅ | Tamamlandı |
| 5 | Housekeeping (Temizlik) | ✅ | ✅ | ✅ | Tamamlandı |
| 6 | Maintenance (Bakım) | ✅ | ✅ | ✅ | Tamamlandı |
| 7 | Discipline (Disiplin) | ✅ | ✅ | ✅ | Tamamlandı |
| 8 | Laundry (Çamaşır) | ✅ | ✅ | ✅ | Tamamlandı |
| 9 | Checkout (Çıkış) | ✅ | ✅ | ✅ | Tamamlandı |
| 10 | Inventory (Envanter) | ✅ | ✅ | ✅ | Tamamlandı |
| 11 | Reports (Raporlar) | ✅ | ❌ | ✅ | Backend tamam, frontend rapor indirme butonu gerekli |
| 12 | Shifts (Vardiya) | ✅ | ❌ | ✅ | Backend tamam |
| 13 | Room History | ✅ | ❌ | ✅ | Backend tamam |
| 14 | Self Service | ✅ | ❌ | ✅ | Backend tamam |
| 15 | Notifications (SSE) | ✅ | ✅ | ❌ | Çalışıyor |

## Sonraki Fazlar

### Faz 1 — Frontend Eksiklikleri ✅
- [x] Reports sayfası: PDF indirme butonları (temizlik, bakım, doluluk, disiplin)
- [x] Shifts yönetim sayfası — zaten mevcut
- [x] Room History görüntüleme sayfası — zaten mevcut
- [x] Code splitting (628KB → 274KB ana bundle + sayfa bazlı lazy loading)

### Faz 2 — UX & Mobil ✅
- [x] Responsive sidebar: slide-in animasyon (translateX)
- [x] PWA: manifest.json, service worker, SVG ikonlar, offline cache
- [x] Dark/Light theme toggle (localStorage'da kalıcı, sidebar'da buton)

### Faz 3 — Güvenlik & Performans ✅
- [x] Rate limiting: yazma endpoint'lerine 60 req/min limiter
- [x] Input sanitization: HTML tag stripping middleware (XSS koruması)
- [x] DB indexleri: 6 yeni index (room_assignments, rooms, shifts, notifications, maintenance, discipline)
- [x] Response caching: dashboard endpoint'lerine Cache-Control (KPI 30s, heatmap 60s, projection 5m)
- [x] Health check endpoint: GET /api/health

### Faz 4 — İleri Özellikler ✅
- [x] WhatsApp entegrasyonu — zaten mevcut (mesaj parse, arıza oluşturma)
- [x] CSV export — zaten mevcut (personel, doluluk, arıza)
- [x] CSV import — personel toplu yükleme endpoint'i
- [x] Audit dashboard — filtreleme, arama, modül/işlem bazlı görünüm
- [x] Kullanıcı yönetim paneli — CRUD, rol atama, şifre değiştirme (9 test)

### Faz 5 — Deployment & CI/CD ✅
- [x] GitHub Actions CI pipeline (.github/workflows/ci.yml)
- [x] Otomatik test + build + console.log kontrolü
- [x] Pre-deploy & post-deploy smoke test scriptleri (scripts/deploy/)
- [ ] Staging ortamı (Render/Vercel'de ayrı branch deploy gerekli)

---

## 2026-04-30 Audit Fazları (4 paralel ajan denetimi sonucu)

### Faz 6 — Güvenlik Bariyeri ✅
- [x] K2: Token refresh — 24 saatlik grace window, daha eski expired token'lar reddedilir
- [x] K3: IDOR laundry torba — `last_modified_worker_id` ile accountability tracking
- [x] K4: Auth'suz endpoint'ler — authLimiter (30/15dk per IP) yeterli; kiosk-search/avs-search/blocks pre-login kiosk UX için kasıtlı public, blok isimleri kamp ortamında hassas değil
- [x] Y7: KVKK anonymize endpoint (`POST /api/kvkk/personnel/:id/anonymize`) — sadece check-out yapmış için, TC/pasaport/telefon/foto NULL
- [x] Y8: Zimmet + imza audit log (zimmet_create, zimmet_sign action'lari)
- [x] Y9: Mobile PIN — per-user lockout (5 deneme = 15dk kilit), users tablosuna pin_attempts/pin_locked_until kolonu
- [x] Y10: Error log POST — message 500/stack 4000/url 500/ua 500/context 2000 char kırpma

### Faz 7 — Veri Tutarlılığı & Race ✅
- [x] K1: assignRoom — db.transaction().immediate() ile atomik (count check + INSERT race-safe)
- [~] Y1: TC + pasaport validasyonu — KULLANICI ERTELEDI (yabanci isci senaryosu icin ayri ele alinacak)
- [x] Y2: Maintenance sayfalama — _limit/_offset queries.js'de okunuyor + countRequests fonksiyonu (filtreli total)
- [x] Y3: Laundry advanceItem — tum DB yazmalari db.transaction().immediate() icinde, side-effect'ler (notification/whatsapp) disinda
- [x] Y4: Batch endpoint'lere item_ids ≤ 100 sınırı (batch-assign/batch-lost/batch-deliver)
- [x] DB CHECK constraints — schema.js'de stock_movements.quantity_after >= 0, inventory_lots.quantity >= 0 (yeni DB'ler icin)

### Faz 8 — Production Reliability ✅
- [x] K5: SSE heartbeat 30s — addSSEClient her bağlantıya setInterval kurar, removeSSEClient'ta clear edilir (Nginx idle timeout fix)
- [x] Y11: Backup off-site — `OFFSITE_BACKUP_CMD` env ile rclone/aws s3/scp komutu çalıştırılır, ${FILE} placeholder yerini alır, 10dk timeout, hata local backup'i etkilemez
- [x] Perf index'leri: idx_personnel_fullname, idx_audit_user, idx_notif_role (3 yeni index)
- [x] Cron PDF stream leak — stream.on('error') + try/finally ile destroy, fd leak engellendi

### Faz 9 — UX Akışı ✅ (kısmen — filter URL state ayrı fazda)
- [x] Y5: Checkout Step 2 → direkt mutate (çifte onay kaldırıldı), Step 3 sadece başarı ekranı
- [x] Y6: ShiftsPage tüm alert() + confirm() çağrıları toast/confirmDialog'a geçti (~20 yer)
- [x] Ortak ConfirmDialog component (`shared/components/ConfirmDialog.jsx`) — Promise tabanlı, App.jsx'e mount edildi
- [x] CheckinPage StepBar — done adımlar tıklanabilir, geri dönüş için `onStepClick` prop
- [x] "SORGULANIYIR" typo → "SORGULANIYOR"; CheckinPage alert → toast
- [x] UsersPage delete onError eklendi + confirmDialog kullanıyor; MaintenancePage teknisyen silme confirmDialog kullanıyor
- [ ] Filter URL state (Reports, Discipline) — ERTELENDİ (ayrı küçük faz)
- [ ] Kalan ~20 browser confirm() çağrısı (DisciplinePage cards, vs) — kademeli olarak ConfirmDialog'a geçirilecek

---

## 2026-05-17 Transport Modülü Devam Fazları (Faz 6-9)

### Faz 6 — No-show / katılım takibi ✅
- [x] `route_assignments.boarded` + `boarded_marked_at` + `boarded_marked_by` migration
- [x] `PATCH /transport/assignments/:id/boarded` (true/false/null cycle)
- [x] `GET /transport/no-show` devamsızlık listesi
- [x] ManifestDrawer'da ✓/✗/○ toggle butonu
- [x] Manifest header'da bindi/binmedi/yedek özetleri

### Faz 7 — Toplu PDF + kişi bazı kullanım raporu ✅
- [x] `GET /transport/manifest/all/pdf?date=` — tüm aktif rotalar tek PDF
- [x] DailyTab'da "📄 TÜMÜ PDF" butonu
- [x] Raporlar: `per_staff_usage` tablosu (son N gün, kişi bazı atama)
- [x] Raporlar: `no_show_top` devamsızlık Top 10

### Faz 8 — Yedek/waitlist + audit log ✅
- [x] `route_assignments.is_waitlist` migration
- [x] `autoAssign` kapasite aşımında waitlist'e düşürür (stats.waitlisted)
- [x] `POST /transport/assignments/:id/promote` — yedekten aktife terfi
- [x] Manifest'te "YEDEK" bölümü + ↑ terfi butonu
- [x] Rota kartında waitlist sayısı göstergesi
- [x] `assign` ve `assign/:id` ve `boarded` ve `promote` endpoint'lerine `logAudit`

### Faz 9 — Test coverage genişletme ✅
- [x] Boarded cycle testi (true → false → null)
- [x] `/no-show` endpoint testi + yetki kontrolü
- [x] Toplu PDF endpoint testi (Content-Type kontrolü)
- [x] Waitlist auto-assign testi (kapasite=1, 2 staff)
- [x] Promote zaten aktif olanı reddeder testi
- [x] Reports endpoint genişletme testi (no_show_top + per_staff_usage)
- [x] 676/676 backend testi geçti (önceki 617'den +59 yeni test)

---

## 2026-05-20 Frontend Güvenlik Ağı

### Faz 10 — E2E Smoke Test Altyapısı ✅
- [x] Playwright kurulumu (`@playwright/test`, chromium browser)
- [x] `frontend/playwright.config.js` — webServer ile backend+frontend otomatik spawn, izole temp DB (`e2e/.tmp/yys-e2e.db`), seed her run'da temiz çalışır
- [x] `backend/package.json` → `start:e2e` script (.env zorunluluğu yok, env Playwright tarafından geçirilir)
- [x] `frontend/e2e/global-setup.js` — her run öncesi `.tmp/` temizliği
- [x] 8 smoke test (auth + dashboard + public routes):
  - login form render, başarılı login → dashboard, hatalı şifre toast
  - dashboard header + ErrorBoundary kontrolü, sidebar → Kapasite navigation
  - laundry-kiosk public yüklenmesi, mobile rol seçimi, anonim `/` → `/login` redirect
- [x] CI workflow güncellendi — `npx playwright install --with-deps chromium` + `npm run test:e2e`, fail durumunda `playwright-report/` artifact upload (7 gün)
- [x] Lokal: 800/800 backend + 8/8 e2e geçti

### Faz 11 — UX Tamamlama (kalan PLAN.md kalemleri) ✅
- [x] **Filter URL state** — `useUrlParamState` hook (`shared/hooks/`); ReportsPage `?date=…`, DisciplinePage `?tab=…&from=…&to=…` — paylaşılabilir URL + back-button uyumlu
- [x] **`confirm()` → `ConfirmDialog` tam migrasyon** — 21 callsite / 14 dosya:
  - admin: Backup (2), KioskPin, AvsWorkers, ErrorLog (2)
  - campus-map (2 — bulkAction, resetPins)
  - capacity (5 — returnAll, forceCheckout, swap, remove, bulkCheckout)
  - maintenance, discipline (3 — bl remove × 2 + delete card)
  - notifications, laundry/LaundryHub (batch lost), laundry/LaundrySettings, laundry-kiosk/DashboardView
  - inventory: Suppliers, Requests, PurchaseOrders
- [x] Doğrulama: build temiz, 800/800 backend + 8/8 e2e geçti

### Faz 12 — Operasyonel Güçlendirme ✅
- [x] **Drills tahliye/yoklama paneli** — anlık "blokta kim var" raporu
  - Backend: `GET /api/drills/roster` (JSON, bloğa göre gruplu, opsiyonel `?block=` filtresi) + `GET /api/drills/roster.pdf` (PDF, audit log'a `roster_pdf` action)
  - Frontend: `RosterPanel.jsx` — DrillsPage'in üstünde, blok seçici + yenile + yazdır + PDF indir; `breakInside: avoid` ile yazdırma sayfa kırılımı doğru çalışır
  - +4 vitest (JSON yapısı, block filtresi, PDF content-type, auth zorunluluğu)
- [x] **Notification preference UI** — `NotificationPrefsPage.jsx` zaten mevcut (modül × kanal × min_severity matrix + sessiz saat ayarları + test bildirimi); ek geliştirme gerekmedi

Doğrulama: 804/804 backend (+4), build temiz, 8/8 Playwright smoke

---

## 2026-05-20 Yayın Cilası

### Faz 13 — Production Polish ✅
- [x] **P13.1 — `.env.example` tamamlandı:** Backend'in okuyup `.env.example`'da olmayan 8 değişken eklendi (DOCUMENTS_DIR, OFFSITE_BACKUP_CMD, SMS_PROVIDER/USER/PASS/HEADER, WEBAUTHN_RP_ID/ORIGIN, WHATSAPP_OUTBOUND/API_TOKEN). Operatör artık eksiksiz şablona sahip.
- [x] **P13.2 — `alert()` + `prompt()` migrasyonu:** Yeni `InputDialog` componenti (text/select destekli, ESC/Enter/form submit, mobil-uyumlu); 4 `prompt()` callsite (toplu teslim, KKD iade durumu, arşiv sebebi, makine bakım notu) `inputDialog`'a, 7 `alert()` callsite mevcut toast'a geçti. Kiosk + tablet UX tutarlı.
- [x] **P13.3 — Health endpoint zenginleştirme:** `/api/health` artık `version` (backend/package.json), `commit` (GIT_SHA / RENDER_GIT_COMMIT / VERCEL_GIT_COMMIT_SHA ilki dolan), `started_at`, `node_env` döner. Monitoring ve "hangi sürüm canlıda" sorularına net cevap. (exceljs zaten dinamik import + ayrı chunk; vite uyarısı initial bundle'a etkisiz)
- [x] **P13.4 — `PRODUCTION-REHBERI.md` temizliği:** Stale "BLOKLAYICI" listesi (render.yaml DB_PATH, mobile rate limit, smoke admin123) güncel kod durumuna göre yeniden yazıldı. Yeni operatör checklist'i + /api/health doğrulama notları + GIT_SHA env önerisi.

Doğrulama: 804/804 backend, build temiz, 8/8 e2e

---

## 2026-07-05 Backlog Sprint (AVS A-Z + teknik borç — "hepsini sırayla")

### Faz 14 — L1: Maaş bordrosu PDF (TR standart format) ✅
- [x] `payslipService(staffId, month)` — puantajService satırı + `payroll_deductions` özel kesintileri + `net_payable`
- [x] `GET /api/shifts/payslip/:staffId/pdf?month=` — TR standart bordro PDF (kazançlar, yasal kesintiler %14/%1/GV kümülatif/damga, özel kesintiler, net ödenen, işveren maliyeti, YTD, imza alanları)
- [x] PayrollPage: kişi başı 🧾 PDF indirme butonu
- [x] `payslip_pdf` audit log
- [x] +5 test (PDF content-type, 400/404/403, kesinti düşümü) — 809/809

### Faz 15 — L2: Banka transfer dosyası export (CSV) ✅
- [x] `staff.iban` kolonu (migration + schema + CRUD) + her iki staff formunda IBAN alanı
- [x] `GET /api/shifts/bank-transfer?month=` — dönem net maaş (yasal+özel kesinti düşülmüş) + IBAN, noktalı virgüllü CSV, eksik IBAN "IBAN EKSIK" olarak görünür
- [x] PayrollPage'e "🏦 BANKA CSV" butonu + `bank_transfer_csv` audit log
- [x] +3 test — 812/812

### Faz 16 — I1: Sertifika vade cron uyarısı ✅
- [x] `safety/service.js checkCertExpiries()` — 60/30/14/7/1/0 gün eşiklerinde bildirim (≤7 gün critical)
- [x] Günlük cron 06:10 Europe/Istanbul (overlap-safe withLock) + dedup_key ile restart koruması
- [x] +2 test (eşik tetikleme + dedup, eşik dışı sessiz) — 814/814

### Faz 17 — K1: İş kazası kayıt modülü ✅
- [x] `work_accidents` + `work_accident_witnesses` + `work_accident_photos` tabloları (migration)
- [x] Safety altında CRUD + tanık + foto upload (multer + magic bytes) + severity/status validasyonu
- [x] "İş Kazası Tespit Tutanağı" PDF (kazazede, kaza bilgileri, tanık ifadeleri, imza alanları, 6331 notu)
- [x] SafetyPage'e 🚨 İŞ KAZALARI sekmesi — liste + filtre + oluşturma + detay drawer (durum, SGK toggle, tanık, foto, PDF)
- [x] +11 test — 825/825

### Faz 18 — Migration verify (health endpoint) ✅
- [x] `shared/db/verify.js` — kritik trigger (karantina, stok nonneg) + 6 index sqlite_master kontrolü
- [x] `/api/health`: `schema` + `schema_missing` alanları; eksikte `status: degraded` (HTTP 200 — monitor flap etmez)
- [x] SystemHealthPage'e ŞEMA BÜTÜNLÜĞÜ kartı — eksik nesne listesi kırmızı uyarı
- [x] +3 test — 828/828

### Faz 19 — D1: QR clock-in/out ✅
- [x] `POST /api/qr/scan/clock` — aynı QR ile giriş/çıkış: açık kayıt yoksa GİRİŞ (bugünkü shift_schedule otomatik bağlanır), varsa ÇIKIŞ + actual_hours; 2 dk çift okutma koruması (409)
- [x] **Bug fix:** `updateCheckout` UTC timestamp'i yerel saat gibi parse ediyordu — UTC+3'te tüm mesai süreleri 3 saat şişkindi
- [x] QrScannerPage: 🚌 Servis / ⏱ Mesai mod düğmesi + giriş/çıkış geçmiş etiketleri
- [x] `qr_clock_in` / `qr_clock_out` audit log + 5 test — 833/833

### Faz 20 — T1: LaundryHub.jsx split (refactor) ✅
- [x] 2038 satırlık monolith 8 dosyaya bölündü: `hubShared.js` (sabitler + waLink), `ExpandedSection`, `KanbanCard` (+Draggable), `KanbanCol`, `DeliveredTodaySection`, `QuickNotes`, `QuickAdd`, `FullRecordsView` — LaundryHub ~700 satır orkestrasyona indi
- [x] Bonus: kanban blok filtresindeki hardcoded `A/B/S2` listesi `shared/blocks.js` BLOCKS'tan beslenir oldu (CLAUDE.md kuralı)
- [x] Doğrulama: build temiz + 8/8 Playwright smoke

### Faz 21 — Cila ✅ (önceki oturumlarda zaten yapılmış — doğrulandı)
- [x] `jsqr` bağımlılığı yok (frontend package.json + kök package-lock temiz)
- [x] `responsive-stack` zaten 16 dosyada uygulanmış — bekleyen listedeki 8 sayfanın tamamı dahil (Shifts, Capacity, LaundrySettings, LaundryReport, RoomHistory, CheckinPage, KioskPinPage, AuditPage)

---

## 2026-07-05 Backlog Sprint 2 ("devam")

### Faz 22 — P1+P2: Mobile self-service ✅
- [x] P1 vardiyam: kiosk'ta `/my-shifts` + Vardiyam sekmesi zaten mevcuttu (H2 M2) — doğrulandı
- [x] P2 backend: `GET /self-service/my-leaves` (talepler + yıllık bakiye) + `POST /self-service/leave-request` (tip validasyonu, çakışan aralık koruması, yönetime bildirim)
- [x] P2 frontend: SelfServicePage'e 🌴 İzin sekmesi — bakiye kartları + yeni talep formu + talep geçmişi (durum etiketli)
- [x] +5 test — 838/838

### Faz 23 — N1: Disiplin otomasyon kuralları ✅
- [x] `discipline/automation.js runDisciplineAutomation()` — Kural A: son 30 günde 3+ sarı → otomatik kırmızı (30 günde tek tetik); Kural B: 90 gün temiz + puan>0 → 1 puan af (audit guard ile 90 günde tek sefer)
- [x] Günlük cron 06:20 (overlap-safe) + `discipline_auto_red` / `discipline_amnesty` audit + bildirimler
- [x] +3 test (idempotency dahil) — 841/841

### Faz 24 — E1: İzin bakiye takibi
- [ ] İzin onayında `leave_balance` otomatik güncelleme (annual/sick/emergency)
- [ ] Reddedilen/iptal edilen onaylı izinde bakiye iadesi
- [ ] ShiftsPage izin panelinde bakiye gösterimi

### Faz 25 — T2: Hafif migration framework
- [ ] `schema_migrations` tablosu + sıralı versiyonlu runner (better-sqlite3)
- [ ] Yeni migration'lar için tek giriş noktası; başarısızlıkta sessiz skip yerine loglu hata
- [ ] verify.js entegrasyonu (uygulanan sürüm health'te görünsün)
