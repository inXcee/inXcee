-- Sunucu tarafı tekil işlem anahtarı (12 Eki 2026).
-- Telegram/Hermes gibi istemciler yanıtı kaybedip yeniden denediğinde aynı hareketin
-- ikinci kez açılmasını önler. Anahtar, yazdığı kayıtla AYNI transaction'da saklanır:
-- ya ikisi birlikte yazılır ya hiçbiri. Aynı anahtar + aynı gövde → ilk yanıt tekrar döner;
-- aynı anahtar + farklı gövde → 422.
CREATE TABLE IF NOT EXISTS api_idempotency_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  scope TEXT NOT NULL,
  idem_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, scope, idem_key)
);
CREATE INDEX IF NOT EXISTS idx_api_idem_created ON api_idempotency_keys(created_at);
