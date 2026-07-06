-- 003_stations — sabit NFC okutma istasyonları + fiziksel hareket kaydı (Faz 2).
--
-- Neden: Faz 1'de kartlar (giriş/yemek) üretildi ve NFC UID bağlanabilir hale geldi.
-- Faz 2 bu kartları sabit USB NFC okuyuculu istasyonlarda okutup hareket kaydı
-- (+ opsiyonel foto kanıtı) üretir. İstasyonlar insansız cihazlardır: kullanıcı
-- JWT'si değil, kendi API-key'leri (bcrypt saklanır) ile kimlik doğrular.
--
-- access_events = TÜM fiziksel okutma hareketleri — Faz 3 birleşik hareket
-- geçmişinin fiziksel ayağı. Yemekhane uygunluk/sayım (meal_logs entegrasyonu)
-- Faz 4'e bırakıldı; bu fazda cafeteria okutması yalnızca access_events'e yazılır.

CREATE TABLE IF NOT EXISTS scan_stations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  station_type TEXT NOT NULL CHECK(station_type IN ('entry','exit','cafeteria','transport','generic')),
  api_key_hash TEXT NOT NULL,          -- bcrypt; istasyon raw key'i X-Station-Key header'da gönderir
  location TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  capture_photo INTEGER NOT NULL DEFAULT 1,  -- bu istasyonda okutmada foto çekilsin mi
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS access_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER REFERENCES cards(id),
  holder_type TEXT,                    -- denormalize: kart silinse de hareket kalsın
  holder_id INTEGER,
  station_id INTEGER REFERENCES scan_stations(id),
  event_type TEXT NOT NULL,            -- entry|exit|meal|transport|generic|denied
  meal_type TEXT,                      -- breakfast|lunch|dinner|snack (cafeteria ise)
  result TEXT NOT NULL DEFAULT 'ok'    -- ok|denied|duplicate|not_eligible|unknown_card
    CHECK(result IN ('ok','denied','duplicate','not_eligible','unknown_card')),
  photo_url TEXT,                      -- okutma anı foto kanıtı (opsiyonel)
  raw_uid TEXT,                        -- okunan ham NFC UID (eşleşmese de logla)
  scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_access_events_holder ON access_events(holder_type, holder_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_events_station ON access_events(station_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_events_card ON access_events(card_id, scanned_at DESC);
