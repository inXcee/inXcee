# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proje

Şantiye yatakhane yönetim sistemi — operasyon, vardiya/puantaj, su/lojistik ve destek süreçlerini kapsayan çok modüllü tam stack web uygulaması.

## Komutlar

### Geliştirme
```bash
npm install          # root'ta — tüm bağımlılıklar
npm run dev          # frontend (5174) + backend (3001) eş zamanlı başlatır
```

### Backend
```bash
cd backend
npm run dev          # backend tek başına
npm run test         # tüm testler (vitest)
npm run test:watch   # watch mode
```

### Frontend
```bash
cd frontend
npm run dev          # Vite dev server
npm run build        # production build
```

### Tek test çalıştırma
```bash
cd backend && npx vitest run src/modules/checkin/checkin.test.js
```

### Seed (geliştirme DB)
```bash
cd backend && node -e "import('./src/shared/db/index.js').then(m=>m.initDB()).then(()=>import('./src/shared/db/seed.js')).then(m=>m.seedDev())"
```

## Mimari

- `backend/src/modules/<modül>/` — her modül: `routes.js` (Express router), `service.js` (iş mantığı), `queries.js` (SQL)
- `backend/src/shared/` — `auth/`, `db/`, `notifications/`, `cron/`
- `frontend/src/modules/<modül>/` — her modül kendi sayfaları
- `frontend/src/shared/` — `components/`, `hooks/`, `store/`, `api/`

### Su Takip Modülü

- Güncel işletim, API, yetki, cron ve dosya yaşam döngüsü kaynağı: `docs/water-module.md`.
- `backend/src/modules/water/service.js` geriye uyumlu facade'dır. Hareket/FIFO `movements.js`, ay kilidi `reconciliation.js`, analiz `analytics.js`, tır/mail `trucks.js`, birim matematiği `units.js` içinde tutulur.
- Dated stok mutation'ları `assertMonthUnlocked` kuralını atlayamaz; kilitli ay HTTP 423 döndürür.
- Giriş ile FIFO uzlaştırması aynı transaction içinde kalmalıdır. Dağıtım güncelleme/silme eski ve yeni ürün tahsislerini yeniden uzlaştırmalıdır.
- Ürün miktarı sessizce yuvarlanmaz; kullanıcı miktarı tam baz birime dönüşmüyorsa 400 döner.
- Frontend mutation'ları merkezi `invalidateWaterQueries` kapsamlarını kullanır; yeni dağınık query-key listeleri eklenmez.
- Gerçek tır maili `water.truck-mail` kalıcı kuyruğundan gider. `mark-mail-sent` yalnızca harici gönderim teyididir.

## Veritabanı

`yys.db` (SQLite) — geliştirmede proje kökünde oluşur.
Test dosyaları `:memory:` kullanır (`process.env.DB_PATH = ':memory:'`).

## Roller

`campus_manager` · `shift_supervisor` · `technical` · `laundry` · `housekeeper`

Varsayılan geliştirme kullanıcıları (seed'den): `mudur/admin123`, `vardiya/admin123`, `teknik/admin123`, `camasir/admin123`, `meydanci/admin123`

## Yatakhane Yapısı (19 blok / 814 oda)

3 tip blok — tek kaynak: `frontend/src/shared/blocks.js`.

| Tip | Bloklar | Yapı | Kapasite | Banyo |
|-----|---------|------|----------|-------|
| **M** (Merkezi) | M1, M2, M3 | 30 oda/kat × 2 kat | 6 | Ortak banyo/WC |
| **S** (Sosyal) | S1, S2, S3 | 24 oda/kat × 2 kat | 6 (S2 kat 2 = 4) | Özel banyo |
| **Y** (Yeni) | A, A1-A4, B, C | 20 oda/kat × 2 kat | 1 placeholder | Özel banyo |
| **Y** | D, H, J | 20 oda/kat × 1 kat (D: 101+, H/J: 1+) | 1 placeholder | Özel banyo |
| **Y** | E, G | 20 oda/kat × 3 kat | 1 placeholder | Özel banyo |
| **Y** | F | 10 oda/kat × 3 kat | 1 placeholder | Özel banyo |

Y blokları **özel banyolu, kapasite=1 placeholder** olarak gelir; gerçek yatak sayıları DB'de oda detayından elle güncellenir.

`shared/blocks.js` helper'ları: `BLOCKS`, `BLOCK_BY_NAME`, `BLOCKS_BY_TYPE`, `expectedRoomNos()`, `getCapacity()`, `getFloorLabel()`, `getBlockConfig()`.

## Kritik Kısıtlar

- S2 blok odaları max 4 kişi — DB CHECK constraint (sadece S2'ye uygulanır)
- Karantina odalarına atama — INSERT trigger ile bloke
- Zimmet imzası — canvas base64 olarak `digital_signature` kolonuna kaydedilir
- SSE endpoint: `GET /api/notifications/stream` — token header ile
- `housekeeping/queries.js generateDailyTasks` tüm bloklara oda task üretir; `common_area` task **sadece M** (ortak banyo)
- Y bloklar laundry akışında **premium** kabul edilir (özel banyo) — `STANDARD_BLOCKS` set'i M+S içerir, dışındakiler ironing/premium

## Veritabanı Değişiklik Kuralları

- **Yeni şema değişiklikleri versiyonlu migration ile yazılır.** `backend/src/shared/db/migrations/NNN_ad.sql` dosyası ekle (NNN = bir sonraki sıra no). `initDB()` bunları `schema_migrations` tablosuna göre tam bir kez, sürüm sırasına göre, transaction içinde uygular (bkz. `db/runner.js`). `db/index.js` içindeki eski idempotent ALTER bloğu **baseline**'dır — oraya yeni satır ekleme, dokunma.
- Migration'lar mümkünse `IF NOT EXISTS` ile idempotent yazılsın; veri backfill gibi tek-sefer işlemler de güvenli (runner once-only garanti eder).
- Şema veya seed değişikliğinden sonra mutlaka doğrula: 1) Migration temiz çalışıyor, 2) Seed verisi doğru DB dosyasını hedefliyor (`yys.db`), 3) Foreign key referansları mevcut şemayla uyumlu
- DB değişikliğinden sonra login akışını test et
- Yanlış DB'ye yazmamak için seed sonrası `yys.db` dosya boyutunu kontrol et

## Çalışma Akışı

- Çok fazlı planlar (5+ faz) için her seferde tek faz uygula ve commit at
- Fazlar arası test çalıştır — bir sonraki faza testler geçmeden geçme
- Tüm fazları tek oturumda bitirmeye çalışma — `/phase` komutunu kullan
- Bug düzeltmeden sonra düzeltmeyi bağlamında doğrula: değişken scope'da mı, sayfa renderlanıyor mu, console hatası var mı

## Observability

- **Error tracking:** Sentry — `backend/src/shared/sentry.js`. DSN `.env`'de (`SENTRY_DSN`). Test ortamında ve DSN yoksa no-op. PII scrubbing aktif: request body/headers/IP/email Sentry'ye gitmez, sadece `user.id` + `module` tag. Manuel hata yakalamak için `captureError(err, { userId, module })`.
- **Metrics:** `GET /api/system/metrics` — Bearer token (`METRICS_TOKEN`) ile korunur. prom-client + HTTP histogram (`http_request_duration_seconds`, `http_requests_total`) + DB query histogram (`db_query_duration_seconds`) + job queue gauge. Endpoint: `backend/src/shared/metrics.js`. `METRICS_TOKEN` boşsa endpoint 503 döner.
- **Job queue:** `backend/src/shared/jobs/` — SQLite tabanlı (`job_queue` tablosu), tek worker loop (PM2 `instances:1`). Push notifications buradan gönderilir (`enqueue('push.send', { subscriptionId, payload })`). Yeni handler eklemek için `handlers.js`'e satır ekle:

  ```js
  export const handlers = {
    'push.send': sendPushJob,
    'mytype.do': async (payload) => { /* ... */ },
  }
  ```

  Handler hata throw ederse retry (exponential backoff, default 3 attempts). `err.permanent=true` set edilirse kalıcı fail (retry yok, status `done`). `JOB_WORKER_ENABLED=false` ile worker kapanır (debug).

## Deploy

- Deploy öncesi: `bash scripts/deploy/pre-deploy-check.sh`
- Deploy sonrası: `BACKEND_URL=https://... bash scripts/deploy/post-deploy-smoke.sh`
- Cold start timeout olasılığına karşı smoke test 30sn bekler ve tekrar dener

## Kod Kurallari (Zorunlu)

- **Test olmadan commit yok** — backend dosyasi degistiyse `npx vitest run` gecmeli, test yoksa once yaz
- **`any` tipi yasak** — TypeScript dosyalarinda `any` kullanma, dogru tipi tanimla veya `unknown` kullan
- **`console.log` birakma** — debug icin kullanilabilir ama commit oncesi temizle, production'da `console.log` olmamali
- **`.env` dosyalarina dokunma** — secrets elle yonetilir, AI editlememeli
- **SQL injection yasak** — parametreli sorgular zorunlu, string concatenation ile SQL yazma
- **Semantic commit mesajlari** — `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:` prefix'leri kullan
- **Hardcoded blok listesi yazma** — frontend'de `['M1','M2',...]` veya `block.startsWith('M')` yerine `BLOCKS_BY_TYPE`, `BLOCK_BY_NAME[block]?.type === 'M'` kullan; yeni blok eklendiğinde tek nokta güncellenir
- **Kat numarasi `[1, 2]` hardcode etme** — `cfg.floors`'a göre dinamik üret (Y bloklarda 1, 2 ya da 3 kat olabilir)
