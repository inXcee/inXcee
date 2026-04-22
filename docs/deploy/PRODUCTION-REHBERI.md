# YYS — Production Deployment Rehberi

> **Hedef:** Sistemi herkese açık, güvenli, kararlı bir şekilde devreye almak.
> **Süre:** İlk deploy ~2–4 saat, sonraki deploy'lar dakikalar.
> **Ön koşul:** Domain, VPS veya Render/Vercel hesabı, Node.js 20+ yerelde test için.

---

## 0. Özet — Deploy Öncesi Mutlaka Yapılacaklar

Sistem şu an **kullanılabilir ama production için tamamlanmamış**. Canlıya almadan önce aşağıdakiler **mutlaka** yapılmalı:

### 🔴 Deploy BLOKLAYICI (mutlaka)

- [ ] **`render.yaml`'daki `DB_PATH` düzelt** — `/tmp/yys.db` efemeraldir, Render restart'ta DB silinir. Kalıcı disk gerek.
- [ ] **`JWT_SECRET` güçlü üret ve environment'a koy** — `.env`'deki placeholder kabul edilmez.
- [ ] **`ALLOWED_ORIGIN`'i production domain'e ayarla** — default `localhost` değerleri kapat.
- [ ] **Seed user'ların şifresini değiştir** — `mudur/admin123` vs. biliniyor, kimse kullanamamalı.
- [ ] **Mobile auth brute-force limit** — `app.js:103` şu anda `writeLimiter` (60/dk) — `authLimiter` (20/15dk) olmalı.
- [ ] **`scripts/deploy/post-deploy-smoke.sh`** hardcoded `admin123` kullanıyor — production için parametrize et.
- [ ] **HTTPS aktif** — PWA `Add to Home Screen`, service worker, kamera erişimi HTTPS olmadan ÇALIŞMAZ.
- [ ] **Uploads dizini persistent olmalı** — hem VPS'te hem Render'da kalıcı disk'e mount.

### 🟡 ÖNERİLEN (kullanıma açmadan)

- [ ] İlk gerçek admin hesabını oluştur, seed'leri sil
- [ ] `frontend/vercel.json`'daki `inxcee-1.onrender.com` URL'sini kendi backend URL'nle değiştir
- [ ] Yedekleme cron'u kur (günlük SQLite backup)
- [ ] Error logging (uncaughtException + production logger)
- [ ] Health monitoring (UptimeRobot, Pingdom vs.)

### 🟢 SONRA YAPILACAK (production blocker değil)

Bkz: `memory/project_mobile_pwa_pending.md` — 32 maddelik mobile PWA backlog.

---

## 1. Deploy Seçenekleri Karşılaştırması

| Platform | Artı | Eksi | Maliyet | Önerilen |
|----------|------|------|---------|----------|
| **VPS (Hetzner/DigitalOcean)** | Tam kontrol, persistent disk, tek yerde her şey | Manuel setup, güvenlik sorumluluğu sizde | ~5-10 €/ay | **Production için en iyi** |
| **Render + Vercel** | Otomatik deploy, SSL hazır, zero-config | SQLite + disk maliyeti, cold start, vendor lock-in | Free-20 USD/ay | Hızlı başlangıç |
| **Tek makine (Docker)** | Offline da çalışır, taşınabilir | Domain/SSL manuel | 0 | Test/demo |

> **Not:** SQLite kullandığı için **single-instance** zorunlu. Yatay ölçeklendirme istenirse PostgreSQL'e geçmek gerek.

---

## 2. Seçenek A: VPS Deploy (Hetzner / DigitalOcean / Vultr)

**Önerilen konfigürasyon:**
- Ubuntu 22.04 LTS
- 1 vCPU, 2 GB RAM, 40 GB SSD
- Snapshot/backup aktif

### 2.1. Sunucu Hazırlığı

```bash
# SSH bağlantı
ssh root@YOUR_SERVER_IP

# Sistem güncellemesi
apt update && apt upgrade -y

# Firewall
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# Non-root kullanıcı (güvenlik için)
adduser deploy
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy

# Artık deploy kullanıcısı ile devam
su - deploy

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential git

# PM2 (process manager)
sudo npm install -g pm2

# Nginx
sudo apt-get install -y nginx

# Certbot (Let's Encrypt SSL)
sudo apt install -y certbot python3-certbot-nginx
```

### 2.2. Kalıcı Veri Dizini

```bash
sudo mkdir -p /var/data /var/data/uploads /var/data/backups
sudo chown -R deploy:deploy /var/data
```

### 2.3. Kod Deploy

```bash
cd /var/www
sudo mkdir yys && sudo chown deploy:deploy yys
git clone <REPO_URL> yys
cd yys

# Root (concurrently sadece)
npm install

# Backend
cd backend && npm install --production && cd ..

# Frontend build
cd frontend && npm install && npm run build && cd ..
```

### 2.4. Environment Değişkenleri (`.env`)

```bash
cd /var/www/yys
cp .env.example .env
nano .env
```

**Production `.env` örneği:**

```bash
# ZORUNLU — üret: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_SECRET=<96-char-random-hex>

# ZORUNLU
NODE_ENV=production
PORT=3001
DB_PATH=/var/data/yys.db

# ZORUNLU — sadece kendi domain'in
ALLOWED_ORIGIN=https://yys.ornek.com

# OPSİYONEL — e-posta raporu için
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@ornek.com
SMTP_PASS=<app-password>
SMTP_FROM=YYS <noreply@ornek.com>

# OPSİYONEL — WhatsApp bildirimi
WHATSAPP_TOKEN=
WHATSAPP_PHONE_ID=
```

**Güvenlik:**
```bash
chmod 600 .env   # sadece owner okuyabilsin
```

### 2.5. Uploads Dizinini Link'le

Backend `./uploads/` klasörüne yazıyor. Kalıcı disk'e mount:

```bash
cd /var/www/yys/backend
rm -rf uploads
ln -s /var/data/uploads uploads
```

### 2.6. PM2 ile Başlatma

```bash
cd /var/www/yys
NODE_ENV=production pm2 start backend/src/server.js --name yys-backend --time

# İLK ÇALIŞTIRMADA: Terminal'de admin şifresi görüntülenir — KAYDEDİN!
pm2 logs yys-backend --lines 50

# Örnek çıktı:
# ║  YYS İLK KURULUM                                   ║
# ║  Admin kullanıcı oluşturuldu:                      ║
# ║  Kullanıcı adı : admin                             ║
# ║  Şifre         : Xk9mPq2nT8vB3rL5...               ║
```

```bash
# Boot'ta otomatik başlasın
pm2 save
pm2 startup     # Çıkan komutu çalıştır (sudo env PATH=... vb.)
```

### 2.7. Nginx Konfigürasyonu

```bash
sudo cp /var/www/yys/docs/deploy/nginx.conf /etc/nginx/sites-available/yys
sudo nano /etc/nginx/sites-available/yys   # yourdomain.com → senin domain
sudo ln -s /etc/nginx/sites-available/yys /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default   # default config'i kapat
sudo nginx -t      # syntax check
sudo systemctl reload nginx
```

### 2.8. SSL Sertifikası (HTTPS ZORUNLU — PWA için)

```bash
sudo certbot --nginx -d yys.ornek.com -d www.yys.ornek.com
# Soru: redirect HTTP→HTTPS? → Yes
```

Otomatik yenileme (zaten kurulu):
```bash
sudo systemctl status certbot.timer
```

### 2.9. Doğrulama

```bash
# Local backend
curl http://localhost:3001/api/health

# Public HTTPS
curl https://yys.ornek.com/api/health

# Smoke test (ama önce admin şifresini değiştir — aşağıda)
BACKEND_URL=https://yys.ornek.com bash scripts/deploy/post-deploy-smoke.sh
```

---

## 3. Seçenek B: Render + Vercel

**Backend: Render.com** (Node.js + persistent disk)
**Frontend: Vercel** (static React)

### 3.1. Render Backend Kurulumu

**ÖNEMLİ: Mevcut `render.yaml` hatalı (DB_PATH=/tmp — ephemeral). Düzelt:**

```yaml
# render.yaml (düzeltilmiş)
services:
  - type: web
    name: yys-backend
    runtime: node
    buildCommand: cd backend && npm install --production
    startCommand: cd backend && node src/server.js
    disk:
      name: yys-data
      mountPath: /var/data
      sizeGB: 1
    envVars:
      - key: NODE_ENV
        value: production
      - key: DB_PATH
        value: /var/data/yys.db
      - key: ALLOWED_ORIGIN
        value: https://yys-frontend.vercel.app
      # JWT_SECRET — Dashboard > Environment Variables > Generate
    autoDeploy: true
```

> **Not:** Render Free tier disk yok — **Starter ($7/ay)** gerekli SQLite için.

**Adımlar:**
1. Render Dashboard → New → Blueprint → repo bağla
2. Environment Variables:
   - `JWT_SECRET` → Generate (96 char)
   - `ALLOWED_ORIGIN` → Vercel domain'in (aşağıda)
3. Deploy başlat
4. İlk deploy logları → admin şifresini kaydet

**Uploads kalıcılığı:**  Backend `./uploads/` göreceli yol kullanıyor. Disk mount'unu `/var/data` yaptığımız için backend'de symbolic link gerekli. Basit yol: `app.js`'te `express.static('uploads')` → `express.static(process.env.UPLOADS_DIR || 'uploads')` yap ve env'e `UPLOADS_DIR=/var/data/uploads` ekle. (Bu değişiklik henüz kodda yok — VPS'te symbolic link çalışıyor, Render'da kod değişikliği gerek.)

### 3.2. Vercel Frontend Kurulumu

`frontend/vercel.json` içinde backend URL hardcoded:

```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "https://inxcee-1.onrender.com/api/$1" },
    { "source": "/uploads/(.*)", "destination": "https://inxcee-1.onrender.com/uploads/$1" }
  ]
}
```

**Kendi backend URL'nizle değiştirin** (yoksa başkasının backend'ine proxy yapar!).

**Adımlar:**
1. Vercel Dashboard → New Project → GitHub repo
2. Root directory: `frontend`
3. Framework: Vite
4. Deploy

### 3.3. Custom Domain

- Vercel: Settings → Domains → `yys.ornek.com` ekle → DNS'te CNAME kaydı aç
- Render: Settings → Custom Domain → `api.yys.ornek.com` ekle
- Vercel'de `vercel.json`'ı `api.yys.ornek.com` olarak güncelle
- Vercel'deki `ALLOWED_ORIGIN` env'i `https://yys.ornek.com` olarak ayarla

---

## 4. İlk Çalıştırma Sonrası Mutlaka Yapılacaklar

### 4.1. Seed User Şifrelerini Değiştir (ya da sil)

Seed users geliştirme içindi. Production'da `initProdDB` sadece admin oluşturur, diğer seed user'lar (`mudur`, `vardiya`, `teknik`, `camasir`, `meydanci`) oluşmaz. Ama `post-deploy-smoke.sh` bu user'ları varsayıyor — production smoke script'i güncelleyin veya sadece health + admin login test'i bırakın.

**Önerilen smoke test (production):**

```bash
# scripts/deploy/prod-smoke.sh (yeni dosya)
BACKEND_URL="${1:-https://yys.ornek.com}"
ADMIN_USER="${2:-admin}"
ADMIN_PASS="${3:?Admin şifresi argüman olarak gerek}"

curl -f "$BACKEND_URL/api/health" || { echo "Health FAIL"; exit 1; }

TOKEN=$(curl -s -X POST "$BACKEND_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}" \
  | grep -oP '"token":"\K[^"]+')

[ -z "$TOKEN" ] && { echo "Login FAIL"; exit 1; }
echo "✓ Smoke test geçti"
```

### 4.2. Gerçek Kullanıcıları Oluştur

Admin ile giriş yap → **Kullanıcılar** sayfası → yeni kullanıcı ekle:
- Kampüs yöneticileri
- Vardiya amirleri
- Teknik personel (mobile giriş için **PIN** atayın)
- Çamaşır personeli
- Meydancılar/Housekeeper (mobile giriş için **PIN** atayın)

### 4.3. İlk Veriler

- **Odalar:** Kampüs → Blok/Oda kurulumu
- **Temizlikçi listesi** (Temizlik modülü > Personel)
- **Teknisyen listesi** (Bakım modülü > Teknisyenler)
- **Duyurular** (opsiyonel)

---

## 5. Yedekleme Stratejisi

SQLite tek dosya → yedekleme kolay. Her gece `yys.db` kopyala + 7 gün sakla.

```bash
# /usr/local/bin/yys-backup.sh
#!/bin/bash
BACKUP_DIR=/var/data/backups
DB=/var/data/yys.db
DATE=$(date +%Y%m%d_%H%M%S)

# SQLite'ı consistent yedekle (VACUUM INTO)
sqlite3 "$DB" ".backup '$BACKUP_DIR/yys_$DATE.db'"

# 7 günden eski yedekleri sil
find "$BACKUP_DIR" -name "yys_*.db" -mtime +7 -delete
```

```bash
sudo chmod +x /usr/local/bin/yys-backup.sh
sudo apt install -y sqlite3

# Cron — her gece 03:00
sudo crontab -e
# Ekle:
0 3 * * * /usr/local/bin/yys-backup.sh >> /var/log/yys-backup.log 2>&1
```

**Offsite yedek (önerilen):** `rclone` veya `aws s3 sync` ile yedekleri bulut depolamasına at.

**Geri yükleme:**
```bash
pm2 stop yys-backend
cp /var/data/backups/yys_20260422_030000.db /var/data/yys.db
pm2 start yys-backend
```

---

## 6. Monitoring & Logging

### 6.1. PM2 Log'ları

```bash
pm2 logs yys-backend              # canlı log
pm2 logs yys-backend --err        # sadece error
pm2 flush yys-backend             # log temizle

# Log rotation (aksi halde /root dolar)
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### 6.2. Health Monitoring

**Ücretsiz:** [UptimeRobot](https://uptimerobot.com) → `https://yys.ornek.com/api/health` endpoint'ini 5 dakikada bir pingle, down olursa e-posta/Telegram bildirimi.

**Beklenen response:**
```json
{ "status": "ok", "uptime": 12345, "db": "ok" }
```

### 6.3. Error Tracking (opsiyonel)

Backend'de `process.on('uncaughtException')` console'a yazıyor. Production'da [Sentry](https://sentry.io) free tier önerilir — henüz entegre değil, ihtiyaç olursa sonra ekleriz.

---

## 7. Güvenlik Sertleştirme Checklist

- [x] `helmet` aktif (CSP, HSTS, X-Content-Type-Options)
- [x] CORS whitelist (ALLOWED_ORIGIN)
- [x] Rate limiting (auth: 20/15dk, write: 60/dk, read: 120/dk)
- [x] JWT_SECRET env'den okunuyor, hardcoded değil
- [x] Password bcrypt hash
- [x] PIN bcrypt hash
- [x] SQL injection koruması (prepared statements)
- [x] File upload magic bytes check
- [x] Uploads dizini `Content-Disposition: attachment` (XSS koruması)
- [ ] **Mobile auth rate limit yetersiz** → düzelt (bkz. backlog #2)
- [ ] `.env` dosyası git'te değil (kontrol: `git check-ignore .env` → çıktı olmalı)
- [ ] SSH password login kapat, sadece key auth
- [ ] `fail2ban` kur (SSH brute-force için)
- [ ] Sunucu düzenli `apt upgrade`

**`.env` git'te mi kontrol:**
```bash
git check-ignore -v .env
# Çıktı: .gitignore:X:.env   .env   → iyi
```

---

## 8. PWA / Mobile Kullanım Talimatı (Son Kullanıcı)

### Android (Chrome)
1. Chrome'u aç → `https://yys.ornek.com/mobile` adresine git
2. Rol seç (Temizlik / Teknik) → PIN gir
3. Adres çubuğunda "Ana ekrana ekle" pop-up'ı çıkar → **Ekle**
4. Artık ana ekranda simge, app gibi açılır (adres çubuğu yok)

### iPhone (Safari)
1. Safari'yi aç (Chrome iOS'ta PWA kuramazsın)
2. `https://yys.ornek.com/mobile` → PIN giriş
3. Alt paylaş butonu → **Ana Ekrana Ekle** → Ekle

**Notlar:**
- Bildirim gönderimi şu anda yok (1 dakikada bir auto-refresh)
- Offline kullanım yok — ağ olmadan sadece cache'deki son veri görünür
- iOS'ta Face ID / Touch ID auth henüz desteklenmiyor

---

## 9. Deploy Prosedürü (Rutin Güncellemeler)

```bash
# 1. Pre-deploy check (yerel)
bash scripts/deploy/pre-deploy-check.sh
# Yeşil olmadan pushalama

# 2. Push
git push origin main

# 3. VPS'e SSH
ssh deploy@yys.ornek.com
cd /var/www/yys

# 4. Güncelle
git pull
cd backend && npm install --production && cd ..
cd frontend && npm install && npm run build && cd ..

# 5. Restart (zero-downtime)
pm2 reload yys-backend

# 6. Smoke test
BACKEND_URL=https://yys.ornek.com bash scripts/deploy/prod-smoke.sh admin <SIFRE>

# 7. Log kontrol (30 sn)
pm2 logs yys-backend --lines 30
```

**Render/Vercel'de:** `git push origin main` otomatik deploy başlatır. Dashboard'dan build log'u takip et.

---

## 10. Rollback Prosedürü

**VPS:**
```bash
cd /var/www/yys
git log --oneline -10           # son commit'leri gör
git checkout <öncekicommit>
cd backend && npm install --production && cd ..
cd frontend && npm install && npm run build && cd ..
pm2 reload yys-backend

# DB bozulduysa yedekten geri yükle (yukarıda 5.1)
```

**Render:**  Dashboard → Deploys → önceki başarılı deploy → **Rollback**

**Vercel:** Dashboard → Deployments → önceki deployment → **Promote to Production**

---

## 11. Bilinen Sınırlamalar / Yakın Yol Haritası

Sistemi açmadan önce kullanıcıları bilgilendirin:

- ❌ Offline mode yok — internet kesilirse mobile'da veri kaybı olabilir
- ❌ Push notification yok — yeni görev 1 dakika gecikmeyle görünür
- ❌ Teknisyen mobil'de **tüm** taleplerini görüyor (kendi filtresi yok)
- ❌ Housekeeper mobile'da arıza bildiriminde foto yükleyemiyor
- ❌ Dark mode yok
- ❌ Tek kampüs/single-tenant — çoklu kampüs desteği yok

**Tam liste:**
- `memory/project_mobile_pwa_pending.md` (32 madde)
- `memory/project_improvements_backlog.md` (60+ madde)
- `memory/project_laundry_roadmap.md` (çamaşırhane yol haritası)

---

## 12. Hızlı Komut Özeti

```bash
# Deploy öncesi
bash scripts/deploy/pre-deploy-check.sh

# Sunucuya yedek kopya
scp /var/data/yys.db deploy@yys.ornek.com:/tmp/backup.db

# PM2 komutları
pm2 status
pm2 logs yys-backend
pm2 restart yys-backend
pm2 reload yys-backend       # zero-downtime
pm2 monit                    # canlı dashboard

# Nginx
sudo nginx -t                # syntax kontrol
sudo systemctl reload nginx  # config yenile
sudo tail -f /var/log/nginx/access.log

# Sertifika
sudo certbot renew --dry-run # test
sudo certbot certificates    # durum

# DB
sqlite3 /var/data/yys.db ".tables"
sqlite3 /var/data/yys.db "SELECT COUNT(*) FROM users;"
```

---

## 13. Destek / İletişim

- **Log konumu:** `~/.pm2/logs/yys-backend-*.log`
- **DB konumu:** `/var/data/yys.db` (VPS) veya `/var/data/yys.db` (Render disk)
- **Config:** `/var/www/yys/.env`
- **Deploy rehberi (bu dosya):** `docs/deploy/PRODUCTION-REHBERI.md`

Sorun yaşandığında kontrol sırası:
1. `curl https://yys.ornek.com/api/health` — 200 dönüyor mu?
2. `pm2 logs yys-backend --err --lines 50` — error var mı?
3. `sudo nginx -t && sudo tail /var/log/nginx/error.log`
4. Son commit'i `git log --oneline -5` — son değişiklik neydi?
