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
if [[ -f scripts/deploy/post-deploy-smoke.sh ]]; then
  # bash ile çağrılıyor; executable bit şart değil (post-deploy-smoke.sh cold-start retry içerir)
  BACKEND_URL="https://$DOMAIN" bash scripts/deploy/post-deploy-smoke.sh
else
  # Yedek: smoke script yoksa health'i cold-start için tekrar dene
  for attempt in 1 2 3; do
    if curl -fsS "https://$DOMAIN/api/health" | grep -q '"status":"ok"'; then
      ok "Health check geçti"
      break
    fi
    if [[ "$attempt" -lt 3 ]]; then
      echo "  Cold start bekleniyor (${attempt}/3)... 30sn"
      sleep 30
    else
      echo "  Health check başarısız — durduruldu"
      exit 1
    fi
  done
fi

cat <<EOF

\033[1;32m═══════════════════════════════════════════════════════\033[0m
\033[1;32m  DEPLOY BAŞARILI ✓\033[0m
\033[1;32m═══════════════════════════════════════════════════════\033[0m
  Site:    https://$DOMAIN
  Commit:  $NEW_COMMIT
  Log:     pm2 logs yys-backend

EOF
