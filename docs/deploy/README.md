# YYS — VPS Deploy Rehberi

## Gereksinimler

- Ubuntu 22.04+ VPS
- Node.js 20+
- Nginx
- (Opsiyonel) PM2

## 1. Sunucu Hazırlık

```bash
# Node.js 20 kur
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# PM2 kur
npm install -g pm2

# Nginx kur
sudo apt-get install -y nginx
```

## 2. Kalıcı Veri Dizini

```bash
# VPS'te yys.db için kalıcı dizin oluştur
sudo mkdir -p /var/data
sudo chown $USER:$USER /var/data
```

## 3. Uygulamayı İndir

```bash
git clone <repo-url> /var/www/yys
cd /var/www/yys

# Bağımlılıkları kur
npm install
cd backend && npm install && cd ..
cd frontend && npm install && npm run build && cd ..
```

## 4. .env Dosyası

```bash
cp .env.example .env
nano .env
```

Örnek production `.env`:
```
JWT_SECRET=<node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" ile üret>
NODE_ENV=production
PORT=3001
DB_PATH=/var/data/yys.db
ALLOWED_ORIGIN=https://yourdomain.com
```

## 5. PM2 ile Başlat

```bash
cd /var/www/yys
NODE_ENV=production pm2 start backend/src/server.js --name yys-backend
pm2 save
pm2 startup
```

## 6. Nginx Konfigürasyon

`docs/deploy/nginx.conf` dosyasına bakın.

## 7. SSL — Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

## 8. Smoke Test

```bash
curl https://yourdomain.com/api/health
# Beklenen: {"status":"ok","uptime":...,"db":"ok"}
```
