# YYS — Yatakhane Yönetim Sistemi

Şantiye yatakhane operasyonları için tam yığın (full-stack) web uygulaması: oda yönetimi, vardiya/puantaj, su ve tır takibi, çamaşırhane, bakım, disiplin, envanter, self-servis kiosk ve mobil PWA (housekeeper + technician).

**Yığın:** Express + better-sqlite3 (backend) · React + Vite + TanStack Query (frontend) · JWT auth · SSE bildirim · PWA · Tailwind

---

## Hızlı Başlangıç (Geliştirme)

Önkoşullar: **Node.js 22+** (`.nvmrc` mevcut, `nvm use`).

```bash
git clone <repo>
cd yys
cp .env.example .env       # JWT_SECRET'i doldur
npm install                # workspaces — backend + frontend
npm run dev                # backend (3001) + frontend (5174) eş zamanlı
```

Tarayıcıdan: `http://localhost:5174`

İlk açılışta seed otomatik çalışır. Geliştirme kullanıcıları:

| Kullanıcı   | Şifre      | Rol               |
|-------------|------------|-------------------|
| `mudur`     | `admin123` | campus_manager    |
| `vardiya`   | `admin123` | shift_supervisor  |
| `teknik`    | `admin123` | technical         |
| `camasir`   | `admin123` | laundry           |
| `meydanci`  | `admin123` | housekeeper       |

Production'da seed çalışmaz; ilk açılışta `/setup` rotasından admin oluşturulur.

---

## Komutlar

| Komut                                                  | Açıklama                            |
|--------------------------------------------------------|-------------------------------------|
| `npm run dev`                                          | Backend + frontend birlikte         |
| `npm run dev -w backend`                               | Sadece backend (3001)               |
| `npm run dev -w frontend`                              | Sadece frontend (5174)              |
| `npm test`                                             | Backend testleri (vitest)           |
| `cd backend && npm run test:watch`                     | Watch mode                          |
| `cd backend && npx vitest run src/modules/checkin/...` | Tek test dosyası                    |
| `cd frontend && npm run build`                         | Production build → `frontend/dist`  |

---

## Modüller

**Backend** (`backend/src/modules/`):
checkin · checkout · capacity · housekeeping · laundry · maintenance · discipline · inventory · **water** · shifts · self-service · dashboard · reports · room-history · users · setup · backup · kvkk · system · email · announcements · notification-prefs · error-log · mobile-auth · avs-workers

**Frontend** (`frontend/src/modules/`): Aynı modül seti + `mobile/` (housekeeper + technician PWA), `laundry-kiosk/`.

Her modül `routes.js` (Express router) · `service.js` (iş mantığı) · `queries.js` (parametreli SQL) yapısını izler. Su modülünün FIFO, ay kilidi, tır-mail ve dosya yaşam döngüsü için [Su Takip Modülü](docs/water-module.md) belgesine; genel geliştirme kuralları için `CLAUDE.md` dosyasına bakın.

---

## Production Deploy

### Yöntem 1 — Docker Compose (önerilen)

```bash
cp .env.example .env
# .env içinde JWT_SECRET ve ALLOWED_ORIGIN'i doldur (zorunlu)

docker compose up -d --build

# Frontend:  http://localhost:8080
# Backend:   http://localhost:3001 (compose'da expose, ports kapalı — açmak için yorum kaldır)
```

İlk açılışta tarayıcıdan `/setup` ile admin oluştur.

**Kalıcı veri:** `yys-data` named volume → `/var/data` (DB, uploads, backups). Yedeklerken:

```bash
docker run --rm -v yys-data:/data -v $PWD:/backup alpine \
  tar czf /backup/yys-backup-$(date +%F).tar.gz -C /data .
```

### Yöntem 2 — VPS + PM2 + Nginx

VPS deploy CLAUDE.md'de tanımlı (Hetzner/benzer): Nginx reverse proxy + PM2 + Certbot.

```bash
# Sunucuda:
git clone <repo> /opt/yys && cd /opt/yys
cp .env.example .env
# JWT_SECRET, ALLOWED_ORIGIN, DB_PATH=/var/data/yys.db, UPLOADS_DIR=/var/data/uploads doldur

npm ci
npm run build -w frontend                      # frontend/dist hazır
sudo mkdir -p /var/data && sudo chown $USER /var/data

pm2 start ecosystem.config.cjs
pm2 save
pm2 startup                                    # boot'ta otomatik başlat
```

Nginx, frontend için `frontend/dist`'i statik servis eder; `/api/*` ve `/uploads/*` istekleri `localhost:3001`'e proxylenir. SSE için `proxy_buffering off` ve uzun timeout zorunludur (örnek: `frontend.Dockerfile` içindeki nginx config).

### Deploy doğrulama

```bash
# Deploy ÖNCESİ
bash scripts/deploy/pre-deploy-check.sh

# Deploy SONRASI (canlı URL'ye)
BACKEND_URL=https://yourdomain.com bash scripts/deploy/post-deploy-smoke.sh
```

---

## Ortam Değişkenleri

`.env.example` temel çalışma ayarlarını örnekler; modül özel seçenekleri ilgili işletim belgesinde yer alır. Özetle:

| Değişken          | Zorunlu? | Açıklama                                                   |
|-------------------|----------|------------------------------------------------------------|
| `JWT_SECRET`      | **EVET** | min 32 karakter rastgele. Yoksa süreç başlamaz.            |
| `ALLOWED_ORIGIN`  | **prod** | Frontend origin'i (virgülle çoklu). Prod'da yoksa boot fail. |
| `NODE_ENV`        |          | `production` veya `development`                            |
| `PORT`            |          | Varsayılan `3001`                                          |
| `DB_PATH`         |          | Prod: `/var/data/yys.db`                                   |
| `UPLOADS_DIR`     |          | Prod: `/var/data/uploads`                                  |
| `BACKUP_DIR`      |          | Prod: `/var/data/backups`                                  |
| `TRUST_PROXY`     |          | Reverse proxy arkasında `1`, lokalde `loopback`            |
| `SMTP_*`          |          | Tır maili ve diğer e-posta akışları için (opsiyonel)       |
| `WATER_UPLOAD_ORPHAN_GRACE_DAYS` | | Yetim irsaliye fotoğrafı bekleme süresi (varsayılan 7 gün) |
| `UPLOAD_REPORT_RETENTION_DAYS` | | Üretilen PDF saklama süresi (varsayılan 730 gün)             |

`JWT_SECRET` üretmek:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Veritabanı

SQLite (better-sqlite3, WAL mode). Geliştirmede proje kökünde `yys.db`, prod'da `/var/data/yys.db`.

- Şema migration'ları idempotent — başlatmada otomatik çalışır (`runMigrations`)
- Test ortamında `DB_PATH=:memory:` (CI ve vitest otomatik ayarlar)
- S2 bloğu odaları **max 4 kişi** (CHECK constraint), karantina odalarına atama trigger ile bloke

---

## Sağlık & İzleme

- `GET /api/health` — uptime, DB durumu, sürüm
- Admin panelinde **Sistem Sağlık** sayfası — server/DB/yedek/hata/cron durumu, 30sn refresh
- **Hata İzleme** sayfası — frontend + backend hatalar (`error_log` tablosu)
- **Yedekleme** sayfası — manuel/otomatik yedek, indir, restore (PM2 restart ile)

---

## Test

```bash
npm test                          # backend testler (vitest)
bash scripts/deploy/pre-deploy-check.sh   # test + build + console.log + .env güvenliği
```

CI: `.github/workflows/ci.yml` — push ve PR'larda otomatik (Node 22, in-memory DB).

---

## Güvenlik Notları

- JWT_SECRET yoksa süreç başlamaz, hardcoded fallback yok
- Prod'da CORS yalnız `ALLOWED_ORIGIN` listesinden gelene açık
- helmet (CSP dahil), compression, rate-limit (login + PIN brute-force), sanitizeBody middleware aktif
- SSE auth header tabanlı (URL'de token leak yok)
- Role-based middleware (`requireRole`, `requireKioskOrStaff`) tüm korumalı route'larda
- Audit log: giriş, disiplin, bakım, su hareketleri, tır/mail, sayım ve ay kapanışı dahil kritik operasyonlar (KVKK uyumlu retention cron'u var)

---

## Lisans

Özel proje. Lisans dosyası eklenene kadar: tüm hakları saklıdır.
