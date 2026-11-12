#!/usr/bin/env bash
# Hermes'e YYS becerisini kurar. Hermes kullanıcısıyla, YYS deposunun içinden çalıştırın:
#
#   bash integrations/hermes/install.sh
#
# Yaptıkları (hepsi tekrar çalıştırılabilir; mevcut anahtara dokunmaz):
#   ~/.local/bin/yys                       komut
#   ~/.hermes/skills/avs-operations/yys/   beceri (SKILL.md)
#   ~/.hermes/yys.env                      yoksa şablon (YYS_URL, YYS_AGENT_KEY, YYS_PF_KEY) — izin 600
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/yys"
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
SKILL_DIR="${YYS_SKILL_DIR:-$HERMES_HOME/skills/avs-operations/yys}"
BIN_DIR="${YYS_BIN_DIR:-$HOME/.local/bin}"
ENV_FILE="${YYS_ENV_FILE:-$HERMES_HOME/yys.env}"

command -v python3 >/dev/null || { echo "python3 gerekli" >&2; exit 1; }

install -d -m 755 "$SKILL_DIR" "$BIN_DIR"
install -m 644 "$SRC/SKILL.md" "$SKILL_DIR/SKILL.md"
install -m 755 "$SRC/yys.py" "$BIN_DIR/yys"
echo "komut:  $BIN_DIR/yys"
echo "beceri: $SKILL_DIR/SKILL.md"

if [ ! -e "$ENV_FILE" ]; then
  install -d -m 700 "$(dirname "$ENV_FILE")"
  (umask 077; printf '%s\n' \
    '# YYS ajan bağlantısı — bu dosyayı yalnız Hermes kullanıcısı okuyabilmeli (chmod 600).' \
    '# Anahtar: YYS → Ayarlar → Sistem → Ajan Anahtarları, ya da sunucuda backend/scripts/agent-key.mjs' \
    'YYS_URL=http://127.0.0.1:3001' \
    'YYS_AGENT_KEY=' \
    '# Özel finans kasası (isteğe bağlı): backend/scripts/pf-key.mjs create hermes read,write,restore' \
    'YYS_PF_KEY=' > "$ENV_FILE")
  echo "şablon: $ENV_FILE  ← YYS_AGENT_KEY değerini yazın"
else
  chmod 600 "$ENV_FILE"
  echo "ayar:   $ENV_FILE (mevcut, dokunulmadı)"
fi

case ":$PATH:" in *":$BIN_DIR:"*) ;; *) echo "uyarı: $BIN_DIR PATH'te değil — Hermes komutu tam yolla çağırmalı ya da PATH'e ekleyin" ;; esac

if grep -q '^YYS_AGENT_KEY=.\+' "$ENV_FILE" 2>/dev/null; then
  echo "--- bağlantı denemesi ---"
  YYS_ENV_FILE="$ENV_FILE" "$BIN_DIR/yys" kimim || echo "bağlantı kurulamadı (yukarıdaki mesaja bakın)" >&2
else
  echo "Anahtarı yazdıktan sonra deneyin:  yys kimim"
fi
if grep -q '^YYS_PF_KEY=.\+' "$ENV_FILE" 2>/dev/null; then
  echo "--- kasa denemesi ---"
  YYS_ENV_FILE="$ENV_FILE" "$BIN_DIR/yys" kasa || echo "kasaya ulaşılamadı (yukarıdaki mesaja bakın)" >&2
fi
