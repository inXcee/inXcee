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
#   3. frontend build   (öncesinde yayındaki dist yedeklenir)
#   4. pre-deploy check
#   5. PM2 reload (zero-downtime)
#   6. post-deploy smoke test
#
# Hep-ya-hiç: 3. adımdan sonra herhangi bir adım düşerse ve backend henüz
# reload edilmemişse frontend eski haline geri alınır — "yeni arayüz + eski
# backend" (yeni endpoint'lerde 404) durumu oluşmaz. Reload'dan sonraki bir
# hatada ise yeni frontend korunur (backend zaten yeni kodda).
# ════════════════════════════════════════════════════════════════════

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/avskamp}"
DOMAIN="${DOMAIN:-avskamp.com}"

step() { echo -e "\n\033[1;36m▶ $*\033[0m"; }
ok()   { echo -e "  \033[1;32m✓ $*\033[0m"; }
warn() { echo -e "  \033[1;33m⚠ $*\033[0m"; }

cd "$APP_DIR"

# ── Yarım deploy koruması ────────────────────────────────────────────
# nginx doğrudan frontend/dist'i sunar. Build (ve pre-deploy-check'in kendi
# içindeki build) dist'i ANINDA yayına indirir; ama PM2 reload daha sonraki
# adımda. Kontroller düşerse eskiden "yeni arayüz + eski backend" kalıyordu →
# yeni endpoint'ler 404. Bunu önlemek için build öncesi dist'in fotoğrafı
# alınır; deploy tamamlanmadan düşerse eski dist geri konur.
DIST="$APP_DIR/frontend/dist"
ROLLBACK="$APP_DIR/frontend/.dist-rollback"
BACKEND_RELOADED=0
rm -rf "$ROLLBACK"

cleanup() {
  local code=$?
  trap - EXIT
  if [[ $code -eq 0 ]]; then
    rm -rf "$ROLLBACK"
    exit 0
  fi
  if [[ "$BACKEND_RELOADED" == "1" ]]; then
    # Backend yeni kodda; yeni arayüzü geri almak tutarsızlık yaratırdı.
    warn "Backend yeni koda geçti, sonraki adım düştü — frontend yeni halinde bırakıldı."
    echo "     Siteyi kontrol edin: https://$DOMAIN"
    rm -rf "$ROLLBACK"
  elif [[ -d "$ROLLBACK" ]]; then
    rm -rf "$DIST"
    mv "$ROLLBACK" "$DIST"
    warn "Deploy tamamlanmadı — frontend ESKİ haline geri alındı."
    echo "     Backend zaten eski kodda, site tutarlı durumda."
    echo "     Hatayı düzeltin, sonra: FORCE=1 bash scripts/deploy/update.sh"
  else
    warn "Deploy tamamlanmadı (build öncesi). Site değişmedi."
  fi
  exit $code
}
trap cleanup EXIT

step "1/6 Git pull"
PREV_COMMIT=$(git rev-parse HEAD)
git pull --ff-only
NEW_COMMIT=$(git rev-parse HEAD)

if [[ "$PREV_COMMIT" == "$NEW_COMMIT" ]]; then
  # Git güncel ama build/PM2 reload yarım kalmış olabilir (pull başarılı olup sonraki
  # adımlar çökerse tekrar çalıştırmak da burada çıkardı → sunucu eski kodu sunmaya
  # devam ederdi). FORCE=1 ile build+reload zorlanır.
  if [[ "${FORCE:-0}" == "1" ]]; then
    ok "Zaten en güncel ($NEW_COMMIT) — FORCE=1, build/reload yine de çalıştırılıyor."
  else
    ok "Zaten en güncel ($NEW_COMMIT). Çıkılıyor."
    echo "    Build/reload'u zorlamak için: FORCE=1 bash scripts/deploy/update.sh"
    exit 0
  fi
else
  ok "$PREV_COMMIT → $NEW_COMMIT"
fi

step "2/6 npm ci"
npm ci --silent
ok "Bağımlılıklar yüklü"

step "3/6 Frontend build"
# Yayındaki dist'in fotoğrafı — bundan sonrası düşerse cleanup geri koyar.
if [[ -d "$DIST" ]]; then
  cp -a "$DIST" "$ROLLBACK"
  ok "Mevcut dist yedeklendi (geri alma için)"
fi
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
BACKEND_RELOADED=1
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
