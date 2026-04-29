#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
# AVSKAMP YYS — Yeni Versiyon Deploy
# ════════════════════════════════════════════════════════════════════
# Kullanım (sunucuda):
#   cd /opt/avskamp && bash scripts/deploy/update.sh
#
# Yapılan işler:
#   1. git pull
#   2. npm ci
#   3. frontend build
#   4. pre-deploy check
#   5. PM2 reload (zero-downtime)
#   6. post-deploy smoke test
# ════════════════════════════════════════════════════════════════════

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/avskamp}"
DOMAIN="${DOMAIN:-avskamp.com}"

step() { echo -e "\n\033[1;36m▶ $*\033[0m"; }
ok()   { echo -e "  \033[1;32m✓ $*\033[0m"; }

cd "$APP_DIR"

step "1/6 Git pull"
PREV_COMMIT=$(git rev-parse HEAD)
git pull --ff-only
NEW_COMMIT=$(git rev-parse HEAD)

if [[ "$PREV_COMMIT" == "$NEW_COMMIT" ]]; then
  ok "Zaten en güncel ($NEW_COMMIT). Çıkılıyor."
  exit 0
fi
ok "$PREV_COMMIT → $NEW_COMMIT"

step "2/6 npm ci"
npm ci --silent
ok "Bağımlılıklar yüklü"

step "3/6 Frontend build"
npm run build -w frontend --silent
ok "frontend/dist hazır"

step "4/6 Pre-deploy check"
if [[ -x scripts/deploy/pre-deploy-check.sh ]]; then
  bash scripts/deploy/pre-deploy-check.sh
  ok "Check geçti"
else
  ok "pre-deploy-check.sh yok, atlandı"
fi

step "5/6 PM2 reload (zero-downtime)"
pm2 reload yys-backend --update-env
ok "Backend yeniden yüklendi"

# Backend hazır olana kadar kısa bekleme
sleep 3

step "6/6 Post-deploy smoke test"
if [[ -x scripts/deploy/post-deploy-smoke.sh ]]; then
  BACKEND_URL="https://$DOMAIN" bash scripts/deploy/post-deploy-smoke.sh
else
  curl -fsS "https://$DOMAIN/api/health" | grep -q '"ok":true'
  ok "Health check geçti"
fi

cat <<EOF

\033[1;32m═══════════════════════════════════════════════════════\033[0m
\033[1;32m  DEPLOY BAŞARILI ✓\033[0m
\033[1;32m═══════════════════════════════════════════════════════\033[0m
  Site:    https://$DOMAIN
  Commit:  $NEW_COMMIT
  Log:     pm2 logs yys-backend

EOF
