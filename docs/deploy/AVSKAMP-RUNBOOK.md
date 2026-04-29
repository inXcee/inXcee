# AVSKAMP YYS — Deploy & Operasyon Kılavuzu

Bu kılavuz `avskamp.com` üzerinden YYS'yi canlıya almak ve sonrasında işletmek içindir.

---

## 🎯 İlk Kurulum (sıfırdan, ~45 dk)

Sırasıyla yap. Her adımın sonunda doğrulama var — geçmeden bir sonrakine geçme.

### 1. Domain satın al — Namecheap (5 dk)

1. https://www.namecheap.com → "Sign up"
2. Üst arama çubuğuna `avskamp.com` yaz
3. Müsaitse "Add to Cart". Değilse `avs-kamp.com` veya `avskamp.net` dene
4. Sepete git → "Confirm Order"
5. **Domain Privacy: Free** işaretli kalsın (whois bilgilerin gizli olur)
6. Kredi kartı ile öde, ~$10-12

✅ Doğrulama: Hesabında "Domain List"te `avskamp.com` görünüyor.

---

### 2. VPS satın al — Hetzner Cloud (10 dk)

1. https://www.hetzner.com/cloud → "Sign up"
2. E-posta + telefon doğrulaması, kredi kartı ekle
3. Konsola gir → "+ New Project" → adı: `avskamp`
4. Proje içinde "Add Server"
5. Konfigürasyon:
   - **Location:** Helsinki veya Nuremberg (Türkiye'ye en yakın gecikme)
   - **Image:** Ubuntu 24.04
   - **Type:** Shared vCPU → **CX22** (€4.51/ay, 2 vCPU, 4 GB RAM, 40 GB SSD)
   - **Networking:** Public IPv4 + IPv6 (varsayılan açık)
   - **SSH Keys:** Bilgisayarında SSH key varsa ekle. Yoksa **bu adımı geç** — şifre e-postaya gelir
   - **Name:** `avskamp-prod`
6. "Create & Buy" → 30 saniyede sunucu hazır
7. **Sunucunun IP adresini not al** (örn. `49.12.123.45`) — sağ üstte gösterilir

✅ Doğrulama: Server listesinde `avskamp-prod` "running" durumunda.

> **SSH key oluşturmadıysan:** Hetzner sana e-posta ile root şifresini gönderir. Bir sonraki adımda kullanacaksın.

---

### 3. DNS bağlantısı — Namecheap (5 dk)

1. Namecheap → Account → "Domain List"
2. `avskamp.com` yanındaki **Manage** butonuna tıkla
3. Üst sekmelerden **Advanced DNS**
4. "Host Records" altındaki mevcut kayıtları **sil** (Default DNS varsa kalsın)
5. "Add New Record" ile şu iki kaydı ekle:

   | Type      | Host | Value           | TTL       |
   |-----------|------|------------------|-----------|
   | A Record  | @    | (Hetzner IP'n)  | Automatic |
   | A Record  | www  | (Hetzner IP'n)  | Automatic |

6. ✓ işaretine tıklayıp kaydet

✅ Doğrulama (5-30 dk sonra):
```bash
# Bilgisayarından (Windows PowerShell veya terminal):
nslookup avskamp.com
# Sonuçta Hetzner IP'n görünmeli
```

> DNS yayılması bazen 30 dk alır. Sonraki adımı bu sırada başlatabilirsin (SSH bağlantısı), SSL adımına gelene kadar yayılmış olur.

---

### 4. SSH ile sunucuya bağlan (5 dk)

**Windows (PowerShell):**
```powershell
ssh root@49.12.123.45    # kendi IP'ni kullan
```

İlk bağlantıda:
- "Are you sure you want to continue connecting?" → `yes`
- Şifre soracak (Hetzner e-postasında geldi). Yapıştırırken görünmez, normal.
- Şifre yapıştır → Enter

İçeri girdiğinde komut satırı şuna benzer olmalı:
```
root@avskamp-prod:~#
```

**İlk girişte şifre değiştirmeni isteyebilir** — aynı eski şifreyi sor, yeni güçlü bir şifre belirle (16+ karakter, harf + rakam + sembol). Bu yeni şifreyi **mutlaka** kaydet (1Password, Bitwarden gibi).

✅ Doğrulama: `whoami` → `root`

---

### 5. Repo'yu sunucuya çek (2 dk)

Sunucudayken şu komutları sırayla çalıştır:

```bash
# Git zaten kurulu olmayabilir, kur:
apt update && apt install -y git

# Repo clone (PUBLIC repo varsayımı; PRIVATE ise aşağıdaki nota bak)
git clone https://github.com/inXcee/inXcee.git /opt/avskamp
```

**PRIVATE repo ise:** GitHub'da Personal Access Token oluştur ([Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token](https://github.com/settings/tokens) — `repo` scope'u seç, kopyala). Sonra:
```bash
git clone https://USERNAME:TOKEN@github.com/inXcee/inXcee.git /opt/avskamp
```
(Token'ı işin bitince sil.)

✅ Doğrulama: `ls /opt/avskamp` → `package.json`, `backend`, `frontend` görünmeli.

---

### 6. Tek komutla tüm sistemi kur (5-10 dk)

Hâlâ sunucudayken (root olarak):

```bash
DOMAIN=avskamp.com EMAIL=berkayinxce@gmail.com \
  bash /opt/avskamp/scripts/deploy/server-setup.sh
```

Bu komut otomatik olarak:
1. Sistem güncellemesi
2. Node.js 20, nginx, certbot, git, ufw kurulumu
3. PM2 + boot persistence
4. `/var/data` kalıcı dizin
5. JWT_SECRET üretip `.env` yazma
6. `npm ci` + frontend build
7. Nginx config + reload
8. UFW firewall (sadece 22/80/443)
9. Backend başlatma (PM2)
10. Let's Encrypt SSL sertifikası
11. Smoke test

**Uzun sürer (5-10 dk).** Çıktıyı izle:
- Yeşil ✓ işaretleri = OK
- Sarı ⚠ = uyarı (zararsız)
- Kırmızı ✗ = hata, dur ve mesajı oku

> **DNS henüz yayılmadıysa** SSL adımında dururuz. Mesajda ne yapacağın yazar — DNS yayılana kadar bekle, aynı komutu tekrar çalıştır, kaldığı yerden devam eder.

✅ Doğrulama: Komut sonunda "KURULUM TAMAMLANDI" yeşil yazısı.

---

### 7. İlk admin hesabını oluştur (2 dk)

Tarayıcıdan: **https://avskamp.com/setup**

- Kullanıcı adı, şifre belirle (güçlü şifre — bu firma yöneticisi olacak)
- "Oluştur" → otomatik login olur

✅ Doğrulama: Anasayfa modüller görünür, sağ üstte kullanıcı adın yazıyor.

> ⚠️ `/setup` rotası ilk admin oluştuktan sonra otomatik kapanır. Tekrar kullanılamaz.

---

### 8. Sistem sağlık kontrolü (1 dk)

Login olduktan sonra: **Yönetim → Sistem Sağlık**

Hepsinin yeşil olması lazım:
- Server (uptime, RAM, disk)
- DB (yazma OK, boyut)
- Yedek (cron çalışıyor)
- Hata logları (boş veya kritik yok)
- Cron jobs (hepsi aktif)

❌ Sarı/kırmızı varsa → "Sorun Giderme" bölümüne bak.

---

### 9. Çalışanları davet et

**Yönetim → Kullanıcılar → Yeni Kullanıcı**

Roller:
- `campus_manager` — Kampüs müdürü, her şeyi görür
- `shift_supervisor` — Vardiya amiri, oda atama + bakım
- `technical` — Teknik personel, bakım talepleri
- `laundry` — Çamaşırhane operatörü
- `housekeeper` — Meydancı (mobile PWA kullanır)

Kullanıcı oluştururken kişi geçici şifre belirler, ilk girişte değiştirilir.

---

🎉 **Bitti.** Site `https://avskamp.com` üzerinden 7/24 erişilebilir, SSL'li, otomatik yedekli ve her gece 03:00'te yedeklenir.

---

## 🔧 Günlük Operasyon

### Yeni versiyon yayınlama (commit/push sonrası)

Sunucuda:
```bash
cd /opt/avskamp && bash scripts/deploy/update.sh
```

Otomatik: git pull + build + zero-downtime reload + smoke test.

### PM2 durumu

```bash
pm2 status                    # tüm process'ler
pm2 logs yys-backend          # canlı log
pm2 logs yys-backend --lines 100 --nostream   # son 100 satır
pm2 restart yys-backend       # hard restart (downtime ~2sn)
pm2 reload yys-backend        # zero-downtime restart
pm2 monit                     # canlı CPU/RAM monitoring
```

### Yedek indir

Admin panel: **Yönetim → Yedekleme** → istediğin gün → İndir butonu.

Veya doğrudan sunucudan:
```bash
ls -lah /var/data/backups/
scp root@avskamp.com:/var/data/backups/yys-2026-04-29.db ./
```

### Disk kullanımı

```bash
df -h                          # disk doluluk
du -sh /var/data/*             # data dizini detay
du -sh /opt/avskamp/logs/*     # PM2 logları
```

---

## 🚨 Sorun Giderme

### Site açılmıyor (502 Bad Gateway)

Backend ölmüş demektir.

```bash
pm2 status                       # online mı?
pm2 logs yys-backend --lines 50  # son hatalar
pm2 restart yys-backend          # restart dene
```

Hâlâ açılmıyorsa: `.env` bozuk olabilir, JWT_SECRET veya ALLOWED_ORIGIN kontrol et.

### Site açılıyor ama login fail

```bash
# Backend `/api/health` çalışıyor mu?
curl https://avskamp.com/api/health

# Frontend → backend CORS hatası mı?
# Browser DevTools → Network → login isteği → CORS error mı?
```

Çözüm: `.env` içinde `ALLOWED_ORIGIN=https://avskamp.com,https://www.avskamp.com` olmalı.

```bash
nano /opt/avskamp/.env
# Değişikliği kaydet, sonra:
pm2 restart yys-backend
```

### SSL sertifikası süresi doldu / fail

Certbot otomatik yeniler ama gözden kaçabilir.

```bash
certbot certificates                # mevcut sertifikalar
certbot renew --dry-run             # yenileme testi
certbot renew                       # zorla yenile
systemctl reload nginx
```

### DB dolu / büyüdü

```bash
ls -lah /var/data/yys.db          # boyut
sqlite3 /var/data/yys.db "VACUUM;"  # disk üzerinden sıkıştır
```

### Sunucu yeniden başladı, app açılmadı

PM2 startup yapılmamış demektir. Sunucuda:
```bash
pm2 resurrect                       # son save edilmiş durumu yükle
# Veya yeniden setup:
pm2 startup systemd -u root --hp /root  # çıktıdaki komutu çalıştır
pm2 save
```

### Felaket kurtarma — sıfırdan dönüş

Yedek `.db` dosyan varsa (`yys-2026-04-29.db`):

```bash
# Yeni sunucuda 1-6 adımları tekrarla
# Sonra DB'yi geri yükle:
pm2 stop yys-backend
cp yys-2026-04-29.db /var/data/yys.db
pm2 start yys-backend
```

---

## 🛡️ Güvenlik Önerileri (opsiyonel ama tavsiye)

### Root login'i kapat (SSH key zorunlu)

Bilgisayarında SSH key oluştur, sunucuya kopyala, sonra şifre login'ini kapat:

```bash
# Bilgisayarında (Windows PowerShell):
ssh-keygen -t ed25519 -C "avskamp-admin"
# Enter, Enter, Enter (passphrase opsiyonel)
type $env:USERPROFILE\.ssh\id_ed25519.pub | clip   # kopyalandı

# Sunucuya bağlan:
ssh root@avskamp.com
mkdir -p ~/.ssh && chmod 700 ~/.ssh
nano ~/.ssh/authorized_keys
# Yapıştır, kaydet (Ctrl+O, Enter, Ctrl+X)
chmod 600 ~/.ssh/authorized_keys

# Bilgisayardan key ile bağlanabildiğini test et (yeni terminal):
ssh root@avskamp.com   # şifre sormamalı

# Çalışıyorsa sunucudaki şifre login'i kapat:
nano /etc/ssh/sshd_config
# PasswordAuthentication no   ← yes'i no yap
# PubkeyAuthentication yes
systemctl reload sshd
```

### Otomatik güvenlik yamaları

```bash
apt install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades
# "Yes" seç
```

---

## 📊 Monitoring (ileride)

İlk aşamada admin panel "Sistem Sağlık" yeterli. Daha sonra ekleyebilirsin:
- **Uptime monitoring:** UptimeRobot.com (ücretsiz, 5 dk aralıkla `/api/health` ping atar)
- **Email alert:** SMTP_* doldurulduğunda kritik hatalar e-posta gönderir
- **Log aggregation:** Loki + Grafana (ileri seviye)

---

## 📞 Acil Durum

- Hetzner panel: https://console.hetzner.cloud → Reboot, snapshot, firewall
- Hetzner support: 7/24 chat (Almanca/İngilizce)
- Namecheap support: live chat
- Sertifika süresi: `certbot certificates` (otomatik yenilenir, 30 gün önce uyarı verir)

---

## 📁 Dosya Konumları

| Dosya/Dizin | Konum |
|-------------|-------|
| Uygulama | `/opt/avskamp` |
| .env | `/opt/avskamp/.env` |
| DB | `/var/data/yys.db` |
| Uploads | `/var/data/uploads/` |
| Yedekler | `/var/data/backups/` |
| PM2 logs | `/opt/avskamp/logs/` |
| Nginx config | `/etc/nginx/sites-available/avskamp` |
| Nginx logs | `/var/log/nginx/{access,error}.log` |
| SSL sertifika | `/etc/letsencrypt/live/avskamp.com/` |
