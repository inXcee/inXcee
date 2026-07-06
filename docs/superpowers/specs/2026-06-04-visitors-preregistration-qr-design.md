# Visitors Ön-kayıt + QR Ziyaretçi Kartı — Tasarım

**Tarih:** 2026-06-04
**Modül:** `visitors`
**Kaynak:** 1 Haz people-compliance-group spec'i Faz 3 ("visitors: ön-kayıt + QR ziyaretçi kartı, ev sahibi bildirimi") — implementasyon-düzeyi tasarım.

## Bağlam

Visitors modülü şu an minimal (walk-in modeli):
- `visitors` tablosu: `full_name, tc_no, phone, purpose, visiting_personnel_id, visiting_block, check_in_at (NOT NULL DEFAULT now), check_out_at, notes`.
- `queries.js`: `listVisitors({active})`, `createVisitor` (anında giriş yapılmış), `checkOutVisitor`, `getVisitorStats`.
- 4 endpoint: GET `/` , GET `/stats`, POST `/` (oluştur), POST `/:id/checkout`.

**Eksik:** beklenen ziyaretçi **ön-kaydı** (gelmeden), **QR giriş kartı**, **ev sahibi bildirimi**.

**Kanıtlanmış QR deseni (reuse):** `modules/qr/routes.js` — `randomBytes(10).toString('hex')` token bir kolonda saklanır, `QRCode.toDataURL('AVS:'+token)` ile PDF kart, scan endpoint `qr_token` → varlık çözer (`AVS:` prefix tolere edilir). `qrcode` paketi + `pdfkit` zaten kurulu.

## Yaklaşım (onaylı)

Bağımsız `visitors.qr_token` (qr modülü desenini izler). **Reddedilen alternatif:** `cards`(holder_type=visitor)/`stations` fiziksel kart+scan altyapısı — transient ziyaretçi için overkill, çapraz-modül bağımlılık. Standalone token izole ve test edilebilir.

## Bileşenler

### 1. Migration `backend/src/shared/db/migrations/008_visitor_preregister.sql` (yeni)
`visitors` tablosu rebuild edilir (SQLite ALTER `check_in_at` NOT NULL'u nullable yapamaz):
- `check_in_at DATETIME` (artık **nullable** — ön-kayıtta henüz gelmemiş, default kaldırılır)
- `status TEXT NOT NULL DEFAULT 'checked_in' CHECK(status IN ('pre_registered','checked_in','checked_out'))`
- `qr_token TEXT`
- `expected_at DATETIME` (planlanan ziyaret zamanı)
- `pre_registered_at DATETIME`
- Diğer kolonlar korunur (id, full_name, tc_no, phone, purpose, visiting_personnel_id, visiting_block, check_out_at, notes, created_by).
- Veri taşıma: mevcut satırlar kopyalanır; `status = CASE WHEN check_out_at IS NOT NULL THEN 'checked_out' ELSE 'checked_in' END`.
- `CREATE UNIQUE INDEX idx_visitors_qr_token ON visitors(qr_token) WHERE qr_token IS NOT NULL`
- `idx_visitors_active` yeniden oluşturulur.
- Idempotent yazılır (runner once-only garanti eder ama rebuild guard'lı: tablo zaten yeni şemadaysa atla — `status` kolonu varlığına bakarak). **Not:** `db/index.js`'teki eski `CREATE TABLE IF NOT EXISTS visitors` baseline'dır; migration sonrası şema farklı olacak, baseline'a dokunulmaz.

### 2. Backend `queries.js` (değişiklik)
- **`genVisitorToken()`** — `randomBytes(10).toString('hex')` (qr modülüyle aynı).
- **`preRegisterVisitor(data, userId)`** — INSERT `status='pre_registered'`, `qr_token=genVisitorToken()`, `expected_at`, `pre_registered_at=now`, `check_in_at=NULL`. Dönüş `{ id, qr_token }`.
- **`checkInByToken(token)`** — `AVS:` prefix temizle; `qr_token` ile `status='pre_registered'` ziyaretçi bul. Yoksa null. Bulursa `status='checked_in'`, `check_in_at=now`. Ziyaretçi + ev sahibi adı (`visiting_name`) döner. Zaten checked_in ise tekrar etmez (idempotent — mevcut kaydı döner, `already=true`).
- **`getVisitorById(id)`** — kart PDF için (full_name, qr_token, visiting_name, visiting_block, purpose).
- **`listVisitors({ status })`** güncellenir — `status` filtresi: `upcoming`=pre_registered, `active`=checked_in, `past`=checked_out. Geriye uyum: eski `active` param'ı `checked_in`'e eşlenir.
- **`createVisitor`** (walk-in) — `status='checked_in'`, `check_in_at=now` açıkça yazılır.
- **`checkOutVisitor`** — `status='checked_out'` da set eder.
- **`getVisitorStats`** — `upcoming` (pre_registered) sayısı eklenir.

### 3. Backend `routes.js` (değişiklik)
- **`POST /visitors/preregister`** (`mgmt` guard, Zod) → `preRegisterVisitor` → `{ id, qr_token }`. logAudit.
- **`POST /visitors/checkin`** (`mgmt`, Zod `{ qr_token }`) → `checkInByToken`. Bulunamazsa 404 "Geçersiz QR". Başarılıysa **ev sahibi bildirimi** (aşağıda) + ziyaretçi döner.
- **`GET /visitors/:id/card/pdf`** (view guard) → `getVisitorById`; `qr_token` yoksa 400. `QRCode.toDataURL('AVS:'+token)` + pdfkit kart (qr staff-card kalıbı, "AVS ZİYARETÇİ KARTI" başlığı, ad/amaç/ev-sahibi/blok + QR).
- Mevcut GET `/`, GET `/stats`, POST `/`, POST `/:id/checkout` korunur (`/` artık `status` query'sini de kabul eder).

### 4. Ev sahibi bildirimi
Ziyaret edilen `visiting_personnel_id` → `personnel` (çoğunlukla app kullanıcısı değil; gerçek host-push imkânsız, SMS bloke). MVP: check-in'de `createNotification`:
- `module:'visitors'`, `target_role:'shift_supervisor'` (ön büro/güvenlik fonksiyonu; campus_manager rol bazlı feed'de zaten görür),
- mesaj: `"Ziyaretçi geldi: <ad> → <ev sahibi: visiting_name || '—'> (<blok || '—'>)"`,
- `severity:'info'`, `entity_type:'visitor'`, `entity_id:id`, `dedup_key:visitor_checkin_${id}`.

## Şema / migration
Yeni kolonlar + tablo rebuild **migration 008 ile** (versiyonlu, CLAUDE.md kuralı). Baseline `db/index.js` visitors bloğuna dokunulmaz.

## Hata / sınır durumları
- Geçersiz/bilinmeyen `qr_token` → 404.
- Zaten checked_in token tekrar okutulursa → mevcut kayıt + `already:true` (çift giriş/çift bildirim yok; createNotification dedup_key ile de korur).
- checked_out ziyaretçi token'ı → 404 (pre_registered değil) ya da `already`. Basit: yalnız `pre_registered` check-in yapılabilir; değilse 409 "Bu ziyaretçi zaten işlenmiş".
- `qr_token` çakışması: unique index; genToken 20-hex çakışma ~0.
- Walk-in akışı (POST `/`) değişmeden çalışır.

## Kapsam dışı (bilinçli — YAGNI)
- `cards`/`stations` fiziksel kart entegrasyonu (reddedilen alternatif).
- SMS/WhatsApp host bildirimi (in-app MVP; SMS bloke).
- Ziyaretçi analitiği (sık gelen, ort. süre) — spec'te ayrı kalem.
- Kiosk self-checkin (ziyaretçi kendi okutması) — ileride stations ile.
- i18n (admin TR-only).

## Test stratejisi
Backend `visitors.test.js` (mevcut dosyaya ekleme; vitest supertest + seedDev):
- **preregister:** 201, `qr_token` döner (>10 char), DB'de `status='pre_registered'`, `check_in_at` NULL.
- **checkin:** geçerli token → 200, `status='checked_in'`, `check_in_at` dolu; **notifications'ta `visitor_checkin_*` satırı**; geçersiz token → 404; ikinci kez aynı token → 409/`already` (çift değil).
- **list:** `?status=upcoming` sadece pre_registered; walk-in POST `/` → checked_in; checkout → checked_out + listede past.
- **card pdf:** 200, `application/pdf`; token yoksa 400.
- **migration:** initDB sonrası `status` kolonu var, eski veri backfill (yeni test DB'de boş, ama rebuild guard çalışmalı — mevcut visitors.test seed'i kırılmamalı).
- Mevcut visitors testleri + `cron.test.js`/diğerleri kırılmamalı.

Frontend `VisitorsPage.smoke.test.jsx`: ön-kayıt formu açılır + "beklenen" listesi mock veriyle render + QR kart linki/giriş butonu görünür.

## Önerilen uygulama sırası
1. Migration 008 (rebuild + backfill) → initDB temiz çalışır + mevcut visitors.test geçer.
2. queries.js: preRegisterVisitor + checkInByToken + list/create/checkout/stats güncelle → query testleri (TDD).
3. routes.js: preregister + checkin (+ host bildirim) + card pdf → route testleri.
4. Frontend VisitorsPage: ön-kayıt + beklenen liste + QR/giriş → smoke test + build.
5. Manuel doğrulama: preregister → token → checkin → bildirim + status.
6. Deploy (onayla).
