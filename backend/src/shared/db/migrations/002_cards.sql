-- 002_cards — çok-kartlı kimlik (amaç bazında ayrı kart: giriş / yemek).
--
-- Neden: bugün tek QR var (staff.qr_token, format AVS:<token>) ve hem servis
-- biniş hem yemek için kullanılıyor — ayrım yok. Bu tablo kişi başına AMAÇ
-- bazında ayrı kart tutar (access = giriş, meal = yemek). NFC UID (Faz 2) ve
-- fiziksel/dijital kart üretimi (PDF + kiosk) bu tablo üzerinden işler.
--
-- staff.qr_token KORUNUR (geri uyum: /qr/scan/transport, /meals/log qr_token).
-- Mevcut qr_token'lar 'access' kartı olarak backfill edilir (idempotent).

CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  holder_type TEXT NOT NULL CHECK(holder_type IN ('staff','personnel','visitor')),
  holder_id INTEGER NOT NULL,
  card_type TEXT NOT NULL CHECK(card_type IN ('access','meal')),
  code TEXT UNIQUE NOT NULL,            -- QR/barkod token (AVS-A:.. / AVS-M:.. prefix)
  nfc_uid TEXT UNIQUE,                  -- NFC etiketi UID (Faz 2), nullable
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','lost','revoked')),
  issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  issued_by INTEGER REFERENCES users(id),
  revoked_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_cards_holder ON cards(holder_type, holder_id);
CREATE INDEX IF NOT EXISTS idx_cards_nfc ON cards(nfc_uid);

-- Kişi başına amaç başına yalnızca 1 AKTİF kart (kayıp/iptal hariç).
-- Kısmi unique index: status='active' satırlarına uygulanır.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_one_active
  ON cards(holder_type, holder_id, card_type) WHERE status = 'active';

-- Backfill: mevcut staff.qr_token'ları 'access' kartı olarak taşı (idempotent).
INSERT OR IGNORE INTO cards(holder_type, holder_id, card_type, code, status)
  SELECT 'staff', id, 'access', 'AVS-A:' || qr_token, 'active'
  FROM staff
  WHERE qr_token IS NOT NULL AND qr_token != '';
