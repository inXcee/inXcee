#!/bin/bash
# Post-deploy smoke test — production safe (seed kullanıcısı kullanmaz)
# Kullanım: BACKEND_URL=https://your-app.onrender.com bash scripts/deploy/post-deploy-smoke.sh

BACKEND_URL="${BACKEND_URL:-http://localhost:3001}"
ERRORS=0

echo "========================================="
echo "  POST-DEPLOY SMOKE TEST"
echo "  Backend: $BACKEND_URL"
echo "========================================="
echo ""

# 1. Health check (cold start için yeniden dene)
echo "[1/5] Health check..."
for attempt in 1 2 3; do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/api/health" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    echo "✓ Backend erişilebilir"
    break
  fi
  if [ "$attempt" -lt 3 ]; then
    echo "  Cold start bekleniyor (${attempt}/3)... 30sn"
    sleep 30
  else
    echo "✗ Backend yanıt vermiyor (HTTP $HTTP_CODE) — durduruldu"
    exit 1
  fi
done

# 2. Auth endpoint çalışıyor mu (yanlış şifre → 401 veya 400, 500 değil)
echo ""
echo "[2/5] Auth endpoint kontrolü..."
AUTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BACKEND_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"__smoke_test__","password":"wrong"}' 2>/dev/null || echo "000")
if [ "$AUTH_STATUS" = "401" ] || [ "$AUTH_STATUS" = "400" ]; then
  echo "✓ Auth endpoint çalışıyor (HTTP $AUTH_STATUS — beklenen)"
else
  echo "✗ Auth endpoint beklenmedik yanıt (HTTP $AUTH_STATUS)"
  ERRORS=$((ERRORS + 1))
fi

# 3. Korunan route'lar token olmadan 401 dönmeli
# Not: Sadece gerçekten GET handler'ı olan endpoint'ler test edilir.
# /api/dashboard gibi router'larda kök GET yoktur — sadece alt-path'ler var.
echo ""
echo "[3/5] Korunan route'lar (token olmadan 401 bekleniyor)..."
ROUTES=("/api/checkin/stats" "/api/maintenance/requests" "/api/users" "/api/inventory" "/api/companies")
for route in "${ROUTES[@]}"; do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL$route" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "401" ]; then
    echo "  ✓ $route → 401 (auth korumalı)"
  else
    echo "  ✗ $route → HTTP $HTTP_CODE (401 bekleniyordu)"
    ERRORS=$((ERRORS + 1))
  fi
done

# 4. 404 handler JSON döndürüyor mu
echo ""
echo "[4/5] JSON 404 handler..."
BODY=$(curl -s "$BACKEND_URL/api/nonexistent_route_smoke" 2>/dev/null || echo "")
if echo "$BODY" | grep -q '"error"'; then
  echo "✓ 404 handler JSON döndürüyor"
else
  echo "⚠ 404 handler JSON döndürmüyor (HTML veya boş): $BODY"
fi

# 5. Şema, deploy edilen kodla aynı sürümde mi?
# 2026-08-09: deploy "BAŞARILI" dedi, kod ve build indi, health 200 döndü — ama
# çalışan süreç ESKİ şemayla koşuyordu (090/091 uygulanmamıştı). Personel Takip
# Merkezi ekranda "veri alınamadı" diyordu, sunucu logunda hiçbir iz yoktu.
echo ""
echo "[5/5] Şema sürümü (bekleyen migration)..."
HEALTH_BODY=$(curl -s "$BACKEND_URL/api/health" 2>/dev/null || echo "")
PENDING=$(echo "$HEALTH_BODY" | grep -o '"pending":[0-9]*' | head -1 | cut -d: -f2)
APPLIED=$(echo "$HEALTH_BODY" | grep -o '"applied":[0-9]*' | head -1 | cut -d: -f2)
EXPECTED=$(echo "$HEALTH_BODY" | grep -o '"expected":[0-9]*' | head -1 | cut -d: -f2)
if [ -z "$EXPECTED" ] || [ -z "$PENDING" ]; then
  # Alanlar yoksa çalışan süreç ESKİ koddadır — "geçti" demek yanılmaktır.
  # İlk denemede tam bu yüzden yanlış onay verdi: eski health 'pending'
  # bildirmiyordu, kontrol yine de ✓ yazdı.
  echo "✗ health migration karşılaştırması vermiyor — çalışan süreç eski kodda"
  ERRORS=$((ERRORS + 1))
elif [ "$PENDING" = "0" ]; then
  echo "✓ Şema güncel ($APPLIED/$EXPECTED migration uygulanmış)"
else
  echo "✗ $PENDING migration UYGULANMAMIŞ ($APPLIED/$EXPECTED) — süreç eski şemayla koşuyor"
  echo "  Çözüm: pm2 restart yys-backend (initDB bekleyenleri uygular)"
  ERRORS=$((ERRORS + 1))
fi

echo ""
echo "========================================="
if [ $ERRORS -eq 0 ]; then
  echo "  ✓ SMOKE TEST GEÇTİ — deploy başarılı"
else
  echo "  ✗ $ERRORS SORUN BULUNDU"
fi
echo "========================================="

exit $ERRORS
