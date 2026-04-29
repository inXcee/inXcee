# Production .env Referansı

`server-setup.sh` aşağıdaki içerikle `.env` dosyasını otomatik üretir. Manuel müdahale gerekirse referans olarak kullan.

## Üretilecek Dosya

```env
NODE_ENV=production
PORT=3001

# 64 hex karakter — server-setup.sh otomatik üretir
JWT_SECRET=<64-hex-rastgele>

# Kalıcı disk
DB_PATH=/var/data/yys.db
UPLOADS_DIR=/var/data/uploads
BACKUP_DIR=/var/data/backups
BACKUP_KEEP_DAYS=30

# Reverse proxy arkasında
TRUST_PROXY=1

# CORS — sadece domain'inden erişim
ALLOWED_ORIGIN=https://avskamp.com,https://www.avskamp.com

# E-posta (opsiyonel)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

# WhatsApp (opsiyonel)
WHATSAPP_TOKEN=
WHATSAPP_PHONE_ID=
```

## Manuel JWT_SECRET Üretimi

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Manuel `.env` Oluşturma (gerekirse)

`server-setup.sh` üretmediği veya bozulduğu durumda:

```bash
cd /opt/avskamp
nano .env
# Yukarıdaki içeriği yapıştır, JWT_SECRET'i üret ve ekle, kaydet
chmod 600 .env
pm2 restart yys-backend
```

## Değişiklik Sonrası

`.env` her değişiklikten sonra:

```bash
pm2 restart yys-backend
```

## Güvenlik

- `chmod 600 .env` — sadece root okuyabilir
- Asla git'e commit edilmez (`.gitignore` zaten engelliyor)
- JWT_SECRET değişirse tüm aktif token'lar geçersiz olur (kullanıcılar tekrar login olur)
