---
name: Mobil Yayın & Dağıtım Tasarımı
description: YYS'nin Capacitor ile iOS+Android paketlenmesi, kapalı dağıtım (TestFlight + Play Internal Testing) ve cloud backend hosting planı
type: project
---

# Mobil Yayın & Dağıtım — Tasarım Spesifikasyonu

**Tarih:** 2026-04-28
**Durum:** Onay bekliyor
**Hedef:** Şantiye içi sınırlı kullanıcı (kapalı kanal); iOS + Android; tek React kod tabanı

---

## 1. Genel Bakış

YYS web uygulaması mevcut React + Vite tabanını koruyarak Capacitor ile iOS ve Android'e paketlenir. Backend cloud VPS'e taşınır, HTTPS arkasından servis edilir. Dağıtım Apple TestFlight ve Google Play Internal Testing kanallarıyla yapılır — uygulama public store araması ile bulunamaz, sadece davet edilen şantiye personeli kurabilir.

**Hedef kullanıcı:** ~50-200 şantiye personeli (kampüs müdürü, vardiya amiri, teknik servis, çamaşırhane, meydancı + self-servis kiosk)

---

## 2. Mimari

```
┌──────────────────────┐    ┌──────────────────────┐
│  iOS App (Capacitor) │    │ Android App          │
│  TestFlight kanal    │    │ (Capacitor + AAB)    │
│  Bundle: com.inxcee.yys │  │ Play Internal Test   │
└──────────┬───────────┘    └──────────┬───────────┘
           │                           │
           │   HTTPS — api.inxcee.app  │
           └─────────────┬─────────────┘
                         │
                ┌────────▼─────────┐
                │ Hetzner CX22     │
                │ Helsinki         │
                │ ┌──────────────┐ │
                │ │ Caddy (TLS)  │ │
                │ │ Node + PM2   │ │
                │ │ SQLite + WAL │ │
                │ │ uploads/     │ │
                │ └──────────────┘ │
                └────────┬─────────┘
                         │ Litestream replication
                ┌────────▼──────────┐
                │ Backblaze B2 (S3) │
                └───────────────────┘
```

**Tek React kod tabanı.** Web (admin masaüstü), Android, iOS — aynı `frontend/` derlenir, Capacitor `webDir: dist`.

---

## 3. Mobil Shell — Capacitor

### Kurulum
```bash
cd frontend
npm i @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npm i @capacitor/camera @capacitor/preferences @capacitor/network
npx cap init "YYS" "com.inxcee.yys" --web-dir=dist
npx cap add android
npx cap add ios
```

### Frontend Değişiklikleri
- **API base URL** ortam değişkeni: `VITE_API_URL`
  - dev: `http://localhost:3001`
  - prod (mobil + web): `https://api.inxcee.app`
- **JWT storage:** `localStorage` → `@capacitor/preferences` (iOS WebView temizleme riskine karşı)
- **QR Scanner:** mevcut `jsQR` kalır; kamera akışı için `@capacitor/camera` izinleri
- **Network state:** `@capacitor/network` ile offline banner

### iOS Özel Ayarlar (`ios/App/App/Info.plist`)
- `NSCameraUsageDescription`: "QR kod taraması ve arıza fotoğrafı için kamera"
- `NSPhotoLibraryUsageDescription`: "Arıza bildiriminde fotoğraf yüklemek için"
- `ITSAppUsesNonExemptEncryption`: `false` (HTTPS dışında özel kripto yok)

### Android Özel Ayarlar (`android/app/src/main/AndroidManifest.xml`)
- İzinler: `INTERNET`, `CAMERA`, `READ_MEDIA_IMAGES`, `ACCESS_NETWORK_STATE`
- `applicationId`: `com.inxcee.yys`
- `minSdk: 24`, `targetSdk: 34` (Play Store şartı)

---

## 4. Backend Hosting

### Sunucu
- **Hetzner Cloud CX22** (Helsinki/Falkenstein) — €4.5/ay
- 2 vCPU, 4GB RAM, 40GB SSD, Ubuntu 24.04 LTS
- Türkiye'den ortalama 50-70 ms gecikme

### Stack
- **Caddy 2** — otomatik Let's Encrypt TLS, reverse proxy → `localhost:3001`
- **Node.js 20 LTS** + **PM2** (auto-restart, log rotation, `pm2 startup`)
- **SQLite WAL** — mevcut `yys.db`, persistent disk üzerinde `/var/lib/yys/yys.db`
- **Litestream** — SQLite'ı dakikalık Backblaze B2'ye replike eder (~$1/ay storage)
- **UFW** — sadece 22, 80, 443 açık
- **fail2ban** — SSH brute-force koruması
- **SSH key-only login**, root login kapalı

### Backend Kod Değişiklikleri
| Değişiklik | Dosya |
|---|---|
| `PORT`, `JWT_SECRET`, `DB_PATH`, `CORS_ORIGINS` env'den oku | `app.js`, `server.js` |
| CORS whitelist: prod domain + `capacitor://localhost` + `https://localhost` | `app.js` |
| `helmet` middleware | `app.js` |
| `express-rate-limit` — `/api/auth/*` rotalarına 10 req/min | `routes/auth.js` |
| `GET /api/health` — DB ping + uptime | yeni `health.js` |
| `app.set('trust proxy', 1)` Caddy arkasında | `app.js` |
| `pino` ile structured log | `shared/logger.js` |

### Caddyfile (örnek)
```
api.inxcee.app {
    reverse_proxy localhost:3001
    encode gzip
    log {
        output file /var/log/caddy/api.log
        format json
    }
}
```

### Backup Stratejisi
- **Litestream**: SQLite WAL replikasyon → B2 bucket, snapshot her 24 saatte
- **uploads/** klasörü: günlük `restic` ile B2'ye → 30 günlük versiyonlama
- **Restore testi:** ayda bir staging VPS'e indirip doğrulama

---

## 5. Domain & TLS

- **Domain:** `inxcee.app` — Cloudflare Registrar (~$15/yıl, fiyat farkı yok, ücretsiz DNS)
- **DNS kayıtları:**
  - `api.inxcee.app` A → VPS IP
  - `app.inxcee.app` A → VPS IP (ileride masaüstü web panel için)
- **TLS:** Caddy otomatik (Let's Encrypt), 90 gün otomatik yenileme

---

## 6. Hesaplar

| Hesap | Maliyet | Süreç | Karar |
|---|---|---|---|
| Google Play Console | $25 tek seferlik | 1-2 saat onay | Şirket adı (Organization) |
| Apple Developer Program | $99/yıl | **Bireysel: 1-2 gün** / Org: 2-4 hafta + DUNS | **Bireysel** (varsayılan) |
| Hetzner Cloud | €4.5/ay | dakika | Yeni hesap |
| Cloudflare Registrar | $15/yıl | dakika | Yeni hesap |
| Backblaze B2 | ~$1/ay | dakika | Yeni hesap |

**Apple bireysel vs Organization kararı:** Bireysel hesap hızlı aktif olur ve TestFlight için yeterli. Organization avantajı: App Store sayfasında şirket adı görünür ve birden fazla geliştirici eklenebilir. Şantiye içi kapalı dağıtım için bireysel yeterli; gelecekte transfer mümkün.

---

## 7. Build & İmzalama

### Android (AAB)
- **Upload key**: `keytool` ile yerel oluştur, `~/.gradle/yys-upload.jks`
- **Play App Signing**: aktif — Google final imzayı tutar, upload key kayıp olsa bile geri alınabilir
- Build: `npm run build && npx cap sync android && cd android && ./gradlew bundleRelease`
- Çıktı: `android/app/build/outputs/bundle/release/app-release.aab`

### iOS (IPA)
- **Provisioning profile**: App Store Connect'te oluştur
- **Distribution certificate**: Xcode → Signing & Capabilities
- **fastlane match** ile sertifikaları git (private repo) üzerinden yönet — takım büyürse hazır olur
- Build:
  - **Mac varsa:** `npx cap open ios` → Xcode → Archive → Distribute → TestFlight
  - **Mac yoksa:** Codemagic (free tier 500 dk/ay) — `codemagic.yaml` ile ücretsiz CI build, doğrudan TestFlight'a upload

### Versiyon Yönetimi
- `frontend/package.json` `version` alanı kaynak doğru
- Build script `versionCode` (Android) ve `CFBundleVersion` (iOS) için CI sayacı veya git commit count

---

## 8. Dağıtım (Kapalı Kanal)

### Android — Play Internal Testing
- Play Console → "Test → Internal testing" track
- **Tester listesi:** email-based, max 100 kişi → `testers@inxcee.app` Google Group oluştur, oraya ekle
- AAB upload → 5-10 dk'da tester'lara opt-in linki gider
- Yeni sürümlerde anlık güncelleme (Play Store review yok)

### iOS — TestFlight
- App Store Connect → TestFlight → "Internal Testing" (max 100, App Store Connect rolüne sahip kişiler) veya "External Testing" (max 10.000, public link veya email)
- Şantiye içi: **External Testing + email davet** — review sadece ilk build için (~24 saat)
- Sonraki build'ler review'sız anında yayılır

### Tester Onboarding
1. Google Group / email listesine eklenir
2. Davet maili gelir
3. Android: Play Store linki → uygulama kurulur
4. iOS: TestFlight uygulamasını kurar → davet linki ile redeem
5. Şantiyede tek seferlik bir oturum (15 dk) ile kurulum + giriş yapılır

---

## 9. Güvenlik

- **JWT secret** 256-bit random, Hetzner'da `/etc/yys/env` 600 perm
- **Tokenlar:** kısa ömürlü access (1 saat) + refresh (30 gün); refresh `Preferences` (iOS Keychain backed) içinde
- **Self-service kiosk JWT'si**: 1 saat ömürlü, sadece self-service endpoint'lerine `aud: kiosk` claim ile sınırlı
- **CORS**: `https://app.inxcee.app`, `capacitor://localhost`, `https://localhost`, `ionic://localhost` whitelist
- **Rate limit**: `/api/auth/login` 10/min/IP, genel API 120/min/IP
- **Helmet**: CSP gevşek (mobile WebView ihtiyacı), HSTS açık
- **Upload validasyonu**: maintenance fotoğrafları sadece `image/jpeg|png`, max 5MB, magic-byte kontrolü

---

## 10. Monitoring

- **PM2** built-in: log + restart sayacı
- **Uptime Kuma** (self-hosted, aynı VPS'te 1GB RAM kullanır) → `/api/health` her 60 sn ping, downtime'da Telegram bildirim
- **Caddy access log** → günlük rotasyon
- **Disk alarm**: `df -h` cron her saat, %80 üstünde mail

---

## 11. Faz Planı

| Faz | İş | Süre |
|---|---|---|
| **F1** | VPS provision + domain + Caddy + Node + PM2 + env | 0.5 gün |
| **F2** | Backend kod düzeltmeleri (env, CORS, helmet, rate limit, /health, logger) | 0.5 gün |
| **F3** | Litestream + restic backup setup + restore testi | 0.5 gün |
| **F4** | Frontend env vars + Capacitor entegrasyonu + token storage migrasyonu | 0.5 gün |
| **F5** | Android build pipeline + upload key + Play Console kurulum | 0.5 gün |
| **F6** | İlk AAB → Play Internal Test'e yükleme + 1 cihazda doğrulama | 0.5 gün |
| **F7** | Apple Developer hesap aktivasyonu (bireysel — paralel başlat) | 1-2 gün takvim (iş yok) |
| **F8** | iOS build (Codemagic veya local Xcode) + TestFlight ilk yükleme | 1-2 gün |
| **F9** | Tester listesi, onboarding dökümanı, ilk şantiye kurulum oturumu | 0.5 gün |
| **F10** | Uptime Kuma + log alarm + 1 hafta gözlem | (paralel) |

**Toplam aktif iş:** ~5-6 gün
**Takvim süresi:** Apple onayı + ilk TestFlight review (~3-4 gün) dahil **~2 hafta**

---

## 12. Maliyet Özeti

| Kalem | Yıllık |
|---|---:|
| Hetzner VPS | €54 (~$60) |
| Apple Developer | $99 |
| Google Play (1. yıl) | $25 (tek seferlik) |
| Domain | $15 |
| Backblaze B2 | ~$12 |
| Codemagic (gerekirse) | $0 (free tier) |
| **Yıllık toplam** | **~$211** (1. yıl), sonraki yıllar ~$186 |

---

## 13. Karar Noktaları (Default'lar — review'da onayla/değiştir)

| # | Karar | Default | Alternatif |
|---|---|---|---|
| K1 | Apple hesap tipi | **Bireysel** | Organization (DUNS + 2-4 hafta) |
| K2 | iOS build ortamı | **Codemagic free tier** | Local Mac (varsa daha hızlı) |
| K3 | Domain | **inxcee.app** | inxcee.com.tr, başka |
| K4 | Hosting | **Hetzner CX22 Helsinki** | DigitalOcean Frankfurt, Contabo |
| K5 | Push notification V1'de | **Yok** (V2'ye ertelendi) | FCM+APNs (+1 gün iş) |
| K6 | Cihaz politikası | **BYOD destekli** (kişisel cihaz OK) | Sadece şirket cihazı (MDM gerekir) |
| K7 | TestFlight kanal | **External Testing** (email davet) | Internal Testing (sadece App Store Connect rolü olanlar) |

---

## 14. Kapsam Dışı (V1)

- Push notification (V2)
- Mobile-only sayfa optimizasyonları (mevcut responsive layout yeterli)
- Offline mode + senkronizasyon (V3 — SQLite client cache)
- Çoklu şantiye (`site_id` halen sabit 1)
- Public Play Store yayını
- iPad/tablet özel layout (responsive yeterli)
- Otomatik OTA web update (Ionic Live Updates ücretli)

---

## 15. Riskler

| Risk | Etki | Azaltma |
|---|---|---|
| Apple bireysel hesap onayı gecikir | F8 başlayamaz | F7'yi F1 ile paralel başlat |
| iOS WebView'da CORS davranışı farklı | Login bozulur | F4'te `capacitor://localhost` whitelist'e eklendi |
| SQLite tek nokta arıza | Tüm sistem durur | Litestream + günlük restore testi |
| Play Console hesap reddi | Android dağıtımı blok | Şirket evrakları hazır tut, identity doğrulama önceden |
| Şantiyede internet kesintisi | Uygulama kullanılamaz | V3 offline mode roadmap'te |
| TestFlight 90 günlük build expiry | Tester'lar erişimi kaybeder | 60 günde bir build refresh CI ile otomatik |
