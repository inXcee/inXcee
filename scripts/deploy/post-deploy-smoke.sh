#!/bin/bash
# Post-deploy smoke test
# Kullanım: BACKEND_URL=https://your-app.onrender.com bash scripts/deploy/post-deploy-smoke.sh

BACKEND_URL="${BACKEND_URL:-http://localhost:3001}"
ERRORS=0

echo "========================================="
echo "  POST-DEPLOY SMOKE TEST"
echo "  Backend: $BACKEND_URL"
echo "========================================="
echo ""

# 1. Health check
echo "[1/3] Health check..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/api/health" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  echo "✓ Backend erişilebilir"
else
  echo "✗ Backend yanıt vermiyor (HTTP $HTTP_CODE)"
  echo "  Cold start olabilir, 30sn bekleniyor..."
  sleep 30
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/api/health" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    echo "✓ Backend erişilebilir (cold start sonrası)"
  else
    echo "✗ Backend hala yanıt vermiyor — durduruldu"
    exit 1
  fi
fi

# 2. Login testi
echo ""
echo "[2/3] Login testleri..."
USERS=("mudur" "vardiya" "teknik" "camasir" "meydanci")
for user in "${USERS[@]}"; do
  RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BACKEND_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$user\",\"password\":\"admin123\"}" 2>/dev/null || echo "000")
  if [ "$RESPONSE" = "200" ]; then
    echo "  ✓ $user login başarılı"
  else
    echo "  ✗ $user login başarısız (HTTP $RESPONSE)"
    ERRORS=$((ERRORS + 1))
  fi
done

# 3. Token alıp route kontrolleri
echo ""
echo "[3/3] API route kontrolleri..."
AUTH_BEARER=$(curl -s -X POST "$BACKEND_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"mudur","password":"admin123"}' 2>/dev/null | grep -oP '"token"\s*:\s*"\K[^"]+' || true)

if [ -z "$AUTH_BEARER" ]; then
  echo "  ✗ Token alınamadı, route testleri atlanıyor"
  ERRORS=$((ERRORS + 1))
else
  ROUTES=("/api/dashboard" "/api/capacity" "/api/checkin" "/api/housekeeping" "/api/maintenance" "/api/discipline")
  for route in "${ROUTES[@]}"; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL$route" \
      -H "Authorization: Bearer $AUTH_BEARER" 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
      echo "  ✓ $route OK"
    else
      echo "  ✗ $route BAŞARISIZ (HTTP $HTTP_CODE)"
      ERRORS=$((ERRORS + 1))
    fi
  done
fi

echo ""
echo "========================================="
if [ $ERRORS -eq 0 ]; then
  echo "  ✓ SMOKE TEST GEÇTİ"
else
  echo "  ✗ $ERRORS SORUN BULUNDU"
fi
echo "========================================="

exit $ERRORS
