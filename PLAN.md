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

### Faz 24 — E1: İzin bakiye takibi ✅
- [x] Onayda `leave_balance` otomatik sayaç (annual/sick/emergency → *_used, transaction içinde, çift onay çift saymaz)
- [x] Yıllık izinde bakiye yetersizse onay 400 ("kalan X gün, talep Y gün")
- [x] Onaylı izin reddedilince/iptal edilince bakiye iadesi + shift_schedule geri alma
- [x] ShiftsPage: izin formu + izin geçmişi sekmesinde bakiye şeridi (hak/kullanılan/kalan); onay/iptal mutasyonlarına onError toast
- [x] Bonus fix: `createLeaveService` reason alanı opsiyonel gönderilince named-param hatası veriyordu
- [x] +5 test — 846/846

### Faz 26 — Vardiya sistemi: Haftalık izin (OFF) + renkli Excel export ✅
- [x] **Migration 003** (T2 runner): `shift_schedule` CHECK'e `off` durumu (tablo rebuild + index'ler); eski "haftalık izin" kayıtları (on_leave + vardiyasız + kapsayan izin talebi yok) otomatik `off`'a çevrildi
- [x] **Bordro/puantaj:** `off_days` sayacı, hafta tatili ücreti (İş Kanunu m.46 — günlük × off) brüte dahil, YTD ve SGK günü hesabına işlendi; bordro PDF'te "Hafta Tatili Ucreti" satırı; puantaj CSV'ye "Hafta Tatili" kolonu
- [x] **Çizelge UI:** OFF hücresi ayrı renk (mor 🌙 OFF + "haftalık izin" alt yazısı); hücre atama panelinde OFF/İZİN ayrı butonlar; hafta doldur / toplu doldur / tüm personel doldur artık OFF üretir; Excel import "o/off/tatil" → off, "izin" → on_leave
- [x] **Kişi detayı:** OFF istatistik kartı, vardiya listesinde "Haftalık izin" durumu + OFF filtresi, puantaj takvim sembolü (O) + lejant, bordro detayında Hafta Tatili satırı
- [x] **Excel export (YENİ):** Araçlar → "⬇ Excel İndir (renkli)" — haftalık çizelge: vardiya adı + saat aralığı hücrede, vardiya bazlı dolgu renkleri, OFF mor / İZİN teal / YOK kırmızı, frozen başlık, lejant, `vardiya-{hafta}.xlsx`
- [x] **Kiosk:** Vardiyam sekmesinde 🌙 Haftalık izin etiketi + 30 gün özetinde off sayacı
- [x] +4 test — 856/856 + 8/8 e2e

### Faz 25 — T2: Hafif migration framework ✅
- [x] `shared/db/migrations.js` — `schema_migrations` tablosu + sıralı `MIGRATIONS` dizisi; her kayıt transaction içinde tek kez uygulanır
- [x] Başarısızlıkta sessiz skip YOK: yüksek sesle log + kaydedilmez (sonraki boot yeniden dener) + transaction rollback (yarım iş kalmaz)
- [x] `/api/health` `migrations` alanı (applied/total/errors) — hata varsa `status: degraded`
- [x] İlk 2 versiyonlu migration: `idx_leave_requests_status`, `idx_attendance_open` (D1 açık kayıt taraması)
- [x] Yeni şema değişiklikleri artık MIGRATIONS dizisine eklenir (legacy try/catch bloklarına değil)
- [x] +6 test — 852/852 + 8/8 e2e (gerçek boot doğrulaması)

---

## 2026-07-06 Vardiya/Puantaj "Excel gibi" Sprint (spec: docs/superpowers/specs/2026-07-06-puantaj-excel-grid-design.md)

### Faz 0 — Mevcut değişiklikler commit ✅
- [x] shift_schedule.leave_type (migration 019) + puantaj/days endpoint + takvim boyama modu (5397fb4)

### Faz 27 — Excel-grid deneyimi ✅
- [x] Klavye navigasyonu (ok tuşları + aktif hücre çerçevesi)
- [x] Kod tuşlarıyla işaretleme (N/H/R/Ü/İ/Y/P/Delete — TR toLocaleLowerCase)
- [x] Shift+tık / Shift+ok dikdörtgen aralık seçimi + toplu uygulama
- [x] Ctrl+Z undo (son 50 işlem, restore mutation ile per-hücre geri yazım)
- [x] Sticky başlık satırı + personel kolonu + sticky alt toplam (maxHeight 68vh)
- [x] Gün bazlı alt toplam satırı (çalışan/izin/devamsız)
- [x] logic/puantajGrid.js — 12 birim test + mevcut smoke testler (57/57)

### Faz 28 — Gerçek bordro girdileri ✅
- [x] Tatil kolonları vurgusu (holidays tablosu) + RT etiketi + tooltip
- [x] Tatil çalışması sayacı (satır rozetlerinde T:n)
- [x] Hücre FM girişi — sağ tık editör (çift tık, tek tık damgalamayla çakıştığı için sağ tık) → POST /overtime/day upsert (0=sil, statüye dokunmaz)
- [x] absent_reason (migration 020, sadece migration — schema.js'e bilerek eklenmedi) + sağ tık neden girişi + hücre kırmızı nokta
- [x] Satır rozetleri: T (tatil çalışması) + FM toplam saati; hücrede +n FM rozeti
- [x] +4 backend test (97/97 shifts, 1300/1300 tüm suite), 57/57 frontend

### Faz 29 — Resmi puantaj cetveli Excel export ✅
- [x] logic/puantajFoyu.js — kod eşleme + satır/toplam üretimi (4 birim test)
- [x] ExcelJS aylık föy: personel × 1-31 renkli kod matrisi, tatil/Pazar başlık vurgusu (tatil adı not olarak), 9 toplam kolonu (N/h/yi/r/üi/i/Y/FM/RT), kod lejantı, Düzenleyen/Kontrol Eden/Onaylayan imza blokları, frozen 3×3
- [x] PuantajTab "📄 PUANTAJ FÖYÜ" butonu — puantaj-foyu-{ay}.xlsx (61/61 test + build temiz)

### Faz 30 — Rotasyon şablonları ✅
- [x] rotation_templates (migration 021) + CRUD endpoint'leri (GET/POST/DELETE /rotation-templates)
- [x] Desen: gün dizisi ({shift_def_id} veya null=OFF), 1-31 gün, stagger (kaydırmalı başlangıç)
- [x] SettingsTab → RotationPanel: şablon oluşturucu (chip'li desen builder) + departman filtreli personel checkbox seçimi
- [x] Önizle → uygula akışı: per-personel iş/off sayıları + uyarı listesi; uyarı varsa confirmDialog
- [x] Kural uyarıları: kesintisiz çalışma > 6 gün, iki vardiya arası dinlenme < 11 saat (gece vardiyası hesabı dahil)
- [x] +6 backend test (103/103 shifts, 1306/1306 tüm suite), 62/62 frontend, build temiz
- [x] Bonus fix (1311c10): gece yarısı UTC/yerel gün kayması — avs my-shifts/my-transport localtime; stations/kitchen/avs testleri yerel gün

### Faz 31 — Dönem kilidi (ay kapatma) ✅
- [x] period_locks (migration 022) + CRUD: GET /period-locks (yönetim), POST/DELETE (sadece müdür — managerOnly)
- [x] assertPeriodsUnlocked guard: kilitli aya düşen puantaj/FM/silme/rotasyon yazımı 423 (Locked) döner
- [x] Route catch'leri e.statusCode onurlandırır (423 geçer, yoksa 400)
- [x] PuantajTab: müdür için 🔒 AYI KİLİTLE / 🔓 KİLİDİ AÇ butonu (confirmDialog), kilitli ay banner'ı + salt-okunur (canEdit=false), mutation onError toast
- [x] +8 backend test (111/111 shifts, 1314/1314 tüm suite), 62/62 frontend, build temiz

### Faz 32 — E-posta şablonları + sistemden gönderme ✅
- [x] templates.js: 10 hazır Türkçe şablon (4 kategori: rapor/tedarik/personel/resmi) + {{degisken}} yer tutucu + extractVariables
- [x] email_templates (migration 023) — özel şablon CRUD (kullanıcı kendi şablonunu kaydeder)
- [x] composeAndSend: alıcı doğrulama (regex), düz metin→güvenli HTML, mevcut SMTP ile gönderim; SMTP yoksa 502 (anlamlı hata)
- [x] getKnownContacts: yönetici + firma e-postaları — alıcı otomatik tamamlama (datalist)
- [x] Endpoint'ler: GET/POST/PUT/DELETE /settings/email/templates, GET /contacts, POST /compose (hepsi campus_manager)
- [x] MailComposePage (Ayarlar → ✉ Mail Gönder): kategori+şablon seçimi, canlı boşluk doldurma+önizleme, gönder/kopyala/şablon kaydet; 502'de kopyala-fallback
- [x] +9 backend test (26/26 email, 1323/1323 tüm suite), +1 frontend smoke, build temiz

### Faz 33 — Ek dosya arşivi (ortak kütüphane) ✅
- [x] email_attachments (migration 024) — yükle/listele/güncelle(yeni sürüm)/sil/indir; documentUpload middleware yeniden kullanıldı (PDF/resim/Office, 20MB)
- [x] compose'a attachmentIds — nodemailer attachments; eksik/geçersiz ek 400 (SMTP denenmeden)
- [x] Endpoint'ler: /settings/email/attachments (GET/POST/PUT/DELETE + /:id/download), hepsi campus_manager
- [x] MailComposePage: ek arşivi paneli — checkbox ile seç-ekle, ＋ yükle, ⟳ yeni sürüm (üstüne yaz), ✕ sil
- [x] +8 backend test (34/34 email, 1331/1331 tüm suite), +1 frontend smoke, build temiz

### Faz 34 — Su takip modülü ✅
- [x] Şema (migration 025): water_products (units_per_case/cases_per_pallet), water_zones, water_movements (in/out, qty_base=adet) + 4 varsayılan ürün seed
- [x] Otomatik çevrim: toBase (palet/koli/adet→adet) + humanize (adet→palet/koli/birim kırılımı)
- [x] Backend water/ modülü: ürün+bölge CRUD (hareketi varsa 409), giriş(irsaliye)/dağıtım, silme, movements listesi, summary (stok bakiyesi + bölge×ürün + günlük seri + toplamlar)
- [x] WaterPage (sidebar Operasyon → 💧 Su Takip): Özet (KPI + recharts günlük grafik + stok tablosu + bölge kartları + tarih filtresi), Giriş, Dağıtım, Bölgeler, Ürünler sekmeleri
- [x] +14 backend test (1345/1345 tüm suite), +2 frontend smoke, build temiz

### Faz 35-38 — Su takip geliştirmeleri ✅ (tek sprint)
- [x] **Faz 35 Toplu irsaliye:** POST /water/intake/batch (transaction) + Giriş sekmesinde çok satırlı irsaliye modu (tek tarih/irsaliye, N ürün)
- [x] **Faz 36 Metinden dağıtım:** /water/distribute/parse (fuzzy bölge+ürün+miktar+birim ayrıştırma, TR normalize) + /water/distribute/batch; Dağıtım sekmesinde yapıştır→çözümle→önizle/düzelt→kaydet
- [x] **Faz 37 Düşük stok:** water_products.min_level (migration 026) + summary low flag/low_count + panoda kırmızı uyarı + satır vurgusu + dağıtımda eşik altına düşünce campus_manager bildirimi (dedup); Ürünler create+edit + min eşik (birim çevrimli)
- [x] **Faz 38 Gün/ay + Excel:** summary group=day|month (monthlySeries) + dönem KPI (period_in/out) + kalan stok tüm-zaman; Özet'te gün/ay toggle + Excel export (Stok/Bölge/Hareketler sayfaları)
- [x] +7 backend test (21/21 water, 1352/1352 tüm suite), +1 frontend smoke (3/3), build temiz

---

## 2026-07-09 Su Takip A-Z Operasyon Sprint (kullanıcı 10 maddelik plan — "sırasıyla")

Amaç: su takibini kayıt tablosundan → günlük dağıtım + irsaliye + eksi stok + ay kapanışı + saha kontrolü tek ekrandan yönetilebilir hale getirmek. Sıra: önce Uyarı Merkezi + Ay Kapanışı + İrsaliye Bekleyenler, sonra 4-10.

### Faz W1 — Operasyon Uyarı Merkezi ("Bugün Yapılacaklar") ✅
- [x] `GET /api/water/alerts?today=YYYY-MM-DD` — 5 kategori: irsaliye bekleyen dağıtım, eksi stok, ay dağıtım>gelen, düşük stok, bugün kayıtsız bölgeler (istemci yerel günü gönderir, TZ-güvenli)
- [x] `zonesWithoutMovementOn(day)` yeni sorgu; diğer 4 kategori mevcut sorgulardan (openDistributionNeeds/stockByProduct/productFlow) — yeni tablo/migration gerekmedi
- [x] WaterPage üstünde `AlertBand` — 5 kart (sayı+renk+ikon), karta tıklayınca detay listesi genişler (ürün/bölge + insan-okur miktar); bekleyen iş yoksa yeşil "her şey güncel" şeridi; 60sn'de bir refetch
- [x] +7 backend test (49/49 water, 1380/1380 tüm suite) + 1 frontend smoke (6/6), build temiz
- [ ] Not: kart→çapraz-görünüm atlaması (eksi stok kartı → ay uyuşturmada o ürün seçili) W2/W3 görünümleri gelince bağlanacak — şimdilik kartlar detayı inline listeliyor

### Faz W2 — Ay Sonu Kapanış / Uyuşturma Ekranı ✅
- [x] Migration 030: `water_monthly_closures` (ay, kilit, not, kapatan) + `water_stock_counts` (ay×ürün tekil: system_base, counted_base, diff_base, reason, note)
- [x] `GET /api/water/reconciliation?month=` — ürün bazlı ay başı devreden/gelen/dağıtılan/boş iade/sistem kalan + sayım + fark + durum (pending/even/over/short) + insan-okur; totals (ürün/sayıldı/bekleyen/farklı)
- [x] `POST /api/water/stock-count` — sayım upsert, fark≠0 ise sebep zorunlu (6 sebep: eksik_irsaliye/fazla_dagitim/sayim_farki/fire_kirik/yanlis_urun/devir_duzeltme), sistem kalanı okuma anında hesaplanır (bayat fark yok)
- [x] `POST /api/water/monthly-close` (+ snapshot) / `.../:month/unlock` — **sadece kampüs müdürü**; kilitli aya intake/distribute → 201 + `warning` alanı (engelleme yok, PLAN varsayımı)
- [x] `MonthClosurePanel` (WaterPage): açılır tablo — devreden/gelen/dağıtılan/iade/sistem + inline sayım input + fark + sebep select + durum rozeti; müdüre 🔒 kilitle / 🔓 aç (confirmDialog); KİLİTLİ banner
- [x] +8 backend test (57/57 water, 1388/1388 tüm suite) + 1 frontend smoke (7/7), build temiz

### Faz W3 — İrsaliye Bekleyenler Ekranı ✅
- [x] `GET /api/water/pending?today=` — eşleşmemiş dağıtımlar: tarih, bölge, ürün, dağıtılan, eşleşen (kısmi irsaliye), bekleyen, kaç gün, kaynak irsaliye; severity overdue (3+ gün) / waiting; totals (count/overdue)
- [x] `pendingDistributions()` sorgu (allocation GROUP_CONCAT ile kaynak irsaliye); `daysBetween` W1'den paylaşıldı
- [x] Yeni irsaliye girilince mevcut `reconcileUnallocatedOut` FIFO otomatik kapatır — liste refetch'te güncellenir (kısmi eşleşme → bekleyen azalır → 0'da listeden çıkar)
- [x] `PendingWaybillPanel` (WaterBoard altında): açılır tablo, 3+ gün kırmızı vurgu, bekleyen yoksa panel gizli; 60sn refetch
- [x] +3 backend test (60/60 water, 1391/1391 tüm suite) + 1 frontend smoke (8/8), build temiz

### Faz W4 — Dağıtım Yeri Detay Kartı (güçlendirme) ✅
- [x] Migration 031: `water_zones.expected_monthly` (beklenen aylık tüketim, adet)
- [x] Backend: zone create/update `expected_monthly` alanını kabul eder; pivot rows'a eklendi
- [x] ZoneHistoryModal: **Son 7 gün** sekmesi eklendi (ay/tüm ile); tüm geçmiş tek çekilip client'ta türetilir; günlük ortalama + son dağıtım tarihi KPI; en çok verilen ürünler (mevcut); **bu ay ↔ önceki ay** karşılaştırması (%delta); **beklenen tüketim** vs gerçekleşen + %25 üstü sapmada ⚠ uyarı
- [x] ZonesTab: form + satır içi düzenlenebilir "Beklenen/ay" alanı (mevcut bölgeler için de)
- [x] +2 backend test (62/62 water, 1393/1393 tüm suite) + frontend smoke güncellendi (8/8), build temiz

### Faz W5 — Hızlı Günlük Giriş Şablonları ✅
- [x] Migration 032: `water_templates` (ad) + `water_template_lines` (bölge×ürün×varsayılan miktar/birim, ON DELETE CASCADE)
- [x] Backend: `GET/POST/DELETE /templates` — satır doğrulama (ürün/bölge/birim), aynı isim 409, satırsız 400
- [x] WaterBoard header'da 🗂 Şablon seçici — seçince matris hücreleri varsayılan miktarla dolar + ürün birimi şablona ayarlanır (mevcut batch-save akışına entegre)
- [x] SettingsModal'a 🗂 Şablonlar sekmesi (TemplatesTab) — oluştur (ad + dinamik satırlar) / listele / sil
- [x] +4 backend test (66/66 water, 1397/1397 tüm suite) + 1 frontend smoke (9/9), build temiz

### Faz W6 — İrsaliye Girişini Çok-Satırlı Pratikleştirme
- [ ] Gelen tır paneli Excel-benzeri çok satırlı (irsaliye no/tarih/marka üstte tek kez, altında ürün satırları); kayıtta bekleyen eksi dağıtımlar otomatik kapanır + sonuç özeti

### Faz W7 — Stok Düzeltme / Sayım Fişi (adjustment)
- [ ] `water_movements.type` genişlet: in/out/adjustment; `POST /api/water/adjustments` (ürün, miktar, yön, tarih, sebep, not); raporda ayrı Düzeltme kolonu; audit log

### Faz W8 — Ürün / Marka Yönetimini Güçlendirme
- [ ] Ürün ayarları net alanlar (takip birimi, palet/koli içeriği, min/kritik stok, iade, aktif/pasif); marka renkleri kullanıcı seçer; pasif ürün eski raporda görünür, yeni girişte gizli

### Faz W9 — Excel / PDF Rapor Paketi
- [ ] Excel sayfaları netleştir (Yönetici Özeti/Ay Uyuşturma/Günlük Akış/Bölge/Ürün/İrsaliye Bekleyen/Eksi Stok/Sayım-Düzeltme); ay kapanışında kısa PDF özet

### Faz W10 — Rol ve Onay Akışı
- [ ] Normal kullanıcı günlük dağıtım; yönetici ay kapanışı/düzeltme/ürün ayarı; eksi stok "kontrol bekliyor" → toplu onay
