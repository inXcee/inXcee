# ─── Stage 1: bağımlılıklar ─────────────────────────────────
# better-sqlite3 native derleme için build-base gerekli
FROM node:20-alpine AS deps
WORKDIR /app

# Native modül derleme araçları
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/

# Sadece backend production deps kuruluyor
RUN npm ci --workspace=backend --omit=dev


# ─── Stage 2: çalışma imajı ─────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

# curl: HEALTHCHECK için; tini: PID 1 sinyal işleme
RUN apk add --no-cache curl tini

# Bağımlılıkları kopyala
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/backend/node_modules ./backend/node_modules

# Backend kaynak kodu
COPY backend/package.json ./backend/
COPY backend/src ./backend/src

# Veri dizini (volume mount edilecek)
RUN mkdir -p /var/data/uploads /var/data/backups \
    && addgroup -S yys && adduser -S yys -G yys \
    && chown -R yys:yys /app /var/data

USER yys
WORKDIR /app/backend

ENV NODE_ENV=production \
    PORT=3001 \
    DB_PATH=/var/data/yys.db \
    UPLOADS_DIR=/var/data/uploads \
    BACKUP_DIR=/var/data/backups \
    TRUST_PROXY=1

EXPOSE 3001

# Volume: kalıcı veri (DB, yüklemeler, yedekler)
VOLUME ["/var/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3001/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
