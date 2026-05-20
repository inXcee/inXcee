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
