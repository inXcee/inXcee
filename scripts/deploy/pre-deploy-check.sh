#!/bin/bash
# Pre-deploy kontrol scripti
# Kullanım: bash scripts/deploy/pre-deploy-check.sh

set -e

echo "========================================="
echo "  PRE-DEPLOY KONTROL"
echo "========================================="
echo ""

ERRORS=0

# 1. Backend testleri
echo "[1/5] Backend testleri çalıştırılıyor..."
if cd backend && npx vitest run 2>&1; then
  echo "✓ Testler geçti"
else
  echo "✗ TESTLER BAŞARISIZ"
  ERRORS=$((ERRORS + 1))
fi
cd ..

# 2. Frontend build
echo ""
echo "[2/5] Frontend build kontrol..."
if cd frontend && npm run build 2>&1; then
  echo "✓ Build başarılı"
else
  echo "✗ BUILD BAŞARISIZ"
  ERRORS=$((ERRORS + 1))
fi
cd ..

# 3. Console.log kontrolü — server.js başlatma/kapanış logları meşru, test dosyaları hariç
echo ""
echo "[3/5] Console.log kontrolü..."
CONSOLE_LOGS=$(grep -r "console\.log" backend/src/ --include="*.js" -l 2>/dev/null \
  | grep -v node_modules \
  | grep -v "\.test\." \
  | grep -v "server\.js" \
  || true)
if [ -z "$CONSOLE_LOGS" ]; then
  echo "✓ Production'da console.log yok"
else
  echo "⚠ Console.log bulunan dosyalar:"
  echo "$CONSOLE_LOGS"
fi

# 4. .env kontrolü — git'te .env (tam adıyla) olmamalı; .env.example hariç
echo ""
echo "[4/5] .env güvenlik kontrolü..."
if git ls-files --cached | grep -qE "^\.env$|^backend/\.env$|^frontend/\.env$"; then
  echo "✗ .env dosyası git'te tracked!"
  ERRORS=$((ERRORS + 1))
else
  echo "✓ .env dosyaları güvende"
fi

# 5. Undefined variable taraması (basit)
echo ""
echo "[5/5] ESLint undefined variable taraması..."
if command -v npx &>/dev/null && [ -f "node_modules/.bin/eslint" ]; then
  LINT_ERRORS=$(npx eslint backend/src/ frontend/src/ --no-eslintrc --no-inline-config --env node,browser,es2022 --rule '{"no-undef": "error"}' --parser-options=ecmaVersion:2022,sourceType:module,ecmaFeatures:{jsx:true} 2>&1 | grep "error" | head -10 || true)
  if [ -z "$LINT_ERRORS" ]; then
    echo "✓ Undefined variable yok"
  else
    echo "⚠ Olası undefined variable:"
    echo "$LINT_ERRORS"
  fi
else
  echo "⚠ ESLint bulunamadı, atlanıyor"
fi

echo ""
echo "========================================="
if [ $ERRORS -eq 0 ]; then
  echo "  ✓ TÜM KONTROLLER GEÇTİ — Deploy edilebilir"
else
  echo "  ✗ $ERRORS HATA BULUNDU — Deploy etme!"
fi
echo "========================================="

exit $ERRORS
