# AVSKAMP YYS — Production Deploy Design

**Tarih:** 2026-04-29
**Hedef:** YYS sistemini `avskamp.com` üzerinden firma kalıcı kullanımına açmak.

## Hedef ve Kapsam

Şantiye yatakhane yönetim sistemi (YYS), 7/24 erişilebilir, SSL sertifikalı, otomatik yedekli, sunucu restart'ında otomatik ayağa kalkan kalıcı bir kuruluma alınacak.

**Kapsam dışı:** Multi-tenant, çoklu kampüs, mobile app store yayını, PostgreSQL geçişi, i18n.

## Seçilen Yığın

- **VPS:** Hetzner Cloud CX22 (Helsinki/Nuremberg), Ubuntu 24.04, ~€4.5/ay
- **Domain:** `avskamp.com` (Namecheap üzerinden, ~$10/yıl)
- **Process manager:** PM2 + systemd (boot persistence)
- **Reverse proxy:** Nginx (native, Docker değil)
- **SSL:** Let's Encrypt + certbot, otomatik yenileme
- **Firewall:** UFW (22/80/443 açık)
- **Yedek:** Günlük 03:00 cron, `/var/data/backups`, 30 gün retention
- **DB:** SQLite (better-sqlite3, WAL), `/var/data/yys.db`

VPS + Native Nginx tercih edildi (Docker yerine), çünkü:
- Daha az kaynak tüketir (4 GB RAM yeterli olur)
- Logs ve debug daha doğrudan
- SSL otomasyonu certbot ile native nginx üzerinde en olgun
- DB dosyası direkt host filesystem'inde — yedekleme ve disaster recovery basit

## Bileşenler

### 1. `scripts/deploy/server-setup.sh` (idempotent)
Boş bir Ubuntu 24.04 sunucusunda tek komutla her şeyi kuran bash script.

Sorumluluklar:
- Sistem güncellemesi (`apt update && apt upgrade`)
- Bağımlılıklar: `curl`, `git`, `nginx`, `certbot`, `python3-certbot-nginx`, `ufw`, `build-essential`
- Node.js 20.x (NodeSource APT repo)
- PM2 global install + systemd entegrasyonu
- `/opt/avskamp` repo clone
- `/var/data/{yys.db,uploads,backups}` kalıcı dizin
- `npm ci` + `npm run build -w frontend`
- Nginx config kopyala + symlink + test + reload
- UFW konfig (22/80/443)
- Certbot SSL (avskamp.com + www.avskamp.com)
- PM2 start + save + startup
- Smoke test (`curl https://avskamp.com/api/health`)

İdempotent: tekrar çalıştırılabilir, mevcut kurulumu bozmaz.

### 2. `nginx/avskamp.conf`
Domain'e özel nginx config (Docker değil, native).

- HTTP → HTTPS redirect (certbot otomatik ekler ama baz config'de de var)
- SPA fallback (`try_files`)
- `/api/*` → `127.0.0.1:3001` proxy (SSE buffering off, 24h timeout)
- `/uploads/*` → backend proxy
- gzip, security headers (`X-Frame-Options`, `Referrer-Policy`)
- Static asset cache (7 gün)
- `client_max_body_size 10m`

### 3. `.env.production.template`
`.env.example` baz alınmış, prod-spesifik defaults:
- `NODE_ENV=production`
- `DB_PATH=/var/data/yys.db`
- `UPLOADS_DIR=/var/data/uploads`
- `BACKUP_DIR=/var/data/backups`
- `TRUST_PROXY=1`
- `ALLOWED_ORIGIN=https://avskamp.com,https://www.avskamp.com`
- `JWT_SECRET=` (boş, setup script üretip yazar)

### 4. `scripts/deploy/update.sh`
Yeni versiyon yayınlamak için tek komut.

```
cd /opt/avskamp
./scripts/deploy/update.sh
```

Adımlar:
1. `git pull`
2. `npm ci`
3. `npm run build -w frontend`
4. Pre-deploy check
5. PM2 reload (zero-downtime)
6. Post-deploy smoke test (5sn × 6 deneme)

### 5. `docs/deploy/AVSKAMP-RUNBOOK.md`
Kullanıcıya özel operasyon kılavuzu:
- İlk kurulum adımları (Namecheap, Hetzner, DNS, SSH, setup komutu)
- Günlük operasyon (yeni admin, yedek indir, log oku)
- Sorun giderme (502, SSL, DB dolu, login fail)
- Felaket kurtarma (yedekten dönüş)
- Versiyon güncelleme

## Veri Akışı

```
Kullanıcı tarayıcı (HTTPS)
  → Cloudflare DNS → Hetzner VPS public IP
  → Nginx :443 (SSL termination, certbot cert)
  → / → frontend/dist (statik)
  → /api/* → PM2 (Node.js) :3001 → SQLite /var/data/yys.db
  → /uploads/* → PM2 → /var/data/uploads
```

## Hata Yönetimi

- **PM2 crash:** Otomatik restart, max 10 attempt
- **Boot:** systemd `pm2-root` servisi tüm app'leri ayağa kaldırır
- **SSL süresi dolarsa:** certbot.timer haftalık otomatik yeniler
- **Nginx config bozuk:** `nginx -t` setup script'inde reload öncesi çağrılır
- **Yedek başarısız:** PM2 cron output `logs/backup-error.log`, admin paneli "Sistem Sağlık" bölümünde görünür
- **DB lock:** WAL + busy_timeout zaten ayarlı, frontend retry mekanizması var

## Güvenlik

- UFW firewall: sadece SSH (22) + HTTP (80) + HTTPS (443)
- SSH: anahtar tabanlı bağlantı önerilir, root login disable etme **opsiyonel** (kullanıcının tercihine bağlı, runbook'ta talimat var)
- Helmet, CORS, rate-limit zaten kodda
- JWT_SECRET setup sırasında 64 hex karakter olarak üretilir
- Let's Encrypt cert + HSTS header
- Setup endpoint'i ilk kurulumdan sonra otomatik kapanır

## Test Stratejisi

- **Pre-deploy:** `pre-deploy-check.sh` (mevcut, dokunulmayacak)
- **Post-deploy:** `post-deploy-smoke.sh` (mevcut, dokunulmayacak) — `BACKEND_URL=https://avskamp.com` ile çağrılır
- **Manuel akceptans:** Login → setup → admin oluştur → bir oda ataması → bir bakım talebi

## Riskler ve Hafifletme

| Risk | Hafifletme |
|------|-----------|
| DNS yayılması yavaş, certbot fail olur | Setup script DNS'i kontrol eder, hazır değilse net hata mesajı + retry talimatı verir |
| Hetzner şifre e-postası gelmez | Runbook'ta "Reset password" linki var |
| User SSH key eklemediyse şifre ile bağlanır | Sorun değil, kabul edilebilir |
| `npm ci` 4 GB RAM'de OOM olur | CX22 4 GB yeterli, swap eklenmiyor; gerekirse runbook'ta swap talimatı var |
| İlk admin oluşturulmadan önce setup endpoint'i public | Sadece `users.length === 0` olduğunda çalışır, kod buna sahip |

## Kabul Kriterleri

- [ ] `https://avskamp.com` → frontend yüklenir (Lighthouse 90+ olabilir, hedef değil)
- [ ] `https://avskamp.com/api/health` → `{ok:true,db:{ok:true}}` döner
- [ ] `/setup` ile admin oluşturulabilir
- [ ] Login + bir oda ataması başarılı
- [ ] Sunucu reboot sonrası app otomatik ayağa kalkar (`reboot` komutu sonrası 2 dk)
- [ ] Yedek 03:00'te oluşur (manuel `pm2 trigger yys-backup` ile test)
- [ ] SSL A grade (`ssllabs.com/ssltest`)
- [ ] UFW: sadece 22/80/443 açık (`ufw status verbose`)

## Open Questions

Yok. Plan kullanıcı tarafından 2026-04-29 oturumunda onaylandı.
