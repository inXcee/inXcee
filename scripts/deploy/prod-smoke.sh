#!/bin/bash
# Production smoke test — parametreli admin login
#
# Kullanım:
#   BACKEND_URL=https://yys.ornek.com \
#   ADMIN_USER=admin \
#   ADMIN_PASS=xxxxx \
#   bash scripts/deploy/prod-smoke.sh
#
# Veya argüman olarak:
#   bash scripts/deploy/prod-smoke.sh https://yys.ornek.com admin xxxxx

set -e

BACKEND_URL="${1:-${BACKEND_URL:-http://localhost:3001}}"
ADMIN_USER="${2:-${ADMIN_USER:-admin}}"
ADMIN_PASS="${3:-$ADMIN_PASS}"

if [ -z "$ADMIN_PASS" ]; then
  echo "HATA: ADMIN_PASS env değişkeni veya 3. argüman gerekli"
  echo "Kullanım: $0 <backend_url> <admin_user> <admin_pass>"
  exit 1
fi

ERRORS=0

echo "========================================="
echo "  PRODUCTION SMOKE TEST"
echo "  Backend: $BACKEND_URL"
echo "========================================="

# 1. Health check (cold start için 30sn retry)
echo ""
echo "[1/4] Health check..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/api/health" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" != "200" ]; then
  echo "  Cold start olabilir, 30sn bekleniyor..."
  sleep 30
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/api/health" 2>/dev/null || echo "000")
fi
if [ "$HTTP_CODE" = "200" ]; then
  echo "  ✓ Backend erişilebilir"
else
  echo "  ✗ Backend yanıt vermiyor (HTTP $HTTP_CODE)"
  exit 1
fi

# 2. HTTPS kontrol — PWA için zorunlu
echo ""
echo "[2/4] HTTPS kontrolü..."
if [[ "$BACKEND_URL" == https://* ]]; then
  echo "  ✓ HTTPS aktif"
else
  echo "  ⚠ HTTPS DEĞİL — PWA service worker çalışmaz, mobile 'Add to Home Screen' engellenir"
  ERRORS=$((ERRORS + 1))
fi

# 3. Admin login
echo ""
echo "[3/4] Admin login..."
RESPONSE=$(curl -s -X POST "$BACKEND_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}" 2>/dev/null)

JWT=$(echo "$RESPONSE" | grep -oP '"token"\s*:\s*"\K[^"]+' || true)

if [ -z "$JWT" ]; then
  echo "  ✗ Login başarısız. Response: $RESPONSE"
  exit 1
fi
echo "  ✓ Admin login başarılı"

# 4. Korumalı endpoint'ler
echo ""
echo "[4/4] API route kontrolleri..."
ROUTES=("/api/dashboard" "/api/users" "/api/housekeeping/tasks" "/api/maintenance/requests")
for route in "${ROUTES[@]}"; do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL$route" \
    -H "Authorization: Bearer $JWT" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    echo "  ✓ $route OK"
  else
    echo "  ✗ $route BAŞARISIZ (HTTP $HTTP_CODE)"
    ERRORS=$((ERRORS + 1))
  fi
done

echo ""
echo "========================================="
if [ $ERRORS -eq 0 ]; then
  echo "  ✓ SMOKE TEST GEÇTİ — sistem kullanıma hazır"
  exit 0
else
  echo "  ✗ $ERRORS SORUN BULUNDU"
  exit 1
fi
