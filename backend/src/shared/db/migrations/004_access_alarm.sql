-- 004_access_alarm — access_events.result CHECK'ine 'alarm' ekle (Faz 5 güvenlik).
--
-- Neden: Faz 5 erişim kontrolünde kara listedeki kişi okutunca olayı sıradan
-- 'denied' (iptal/kayıp kart) ile karışmadan AYRI sorgulayabilmek istiyoruz
-- (güvenlik raporu, alarm geçmişi). SQLite'ta CHECK değiştirmek tablo yeniden
-- inşası gerektirir. access_events'e referans veren başka tablo yok → DROP+RENAME
-- güvenli (runner transaction'ı içinde; FK pragma toggling gereksiz).

CREATE TABLE access_events_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER REFERENCES cards(id),
  holder_type TEXT,
  holder_id INTEGER,
  station_id INTEGER REFERENCES scan_stations(id),
  event_type TEXT NOT NULL,
  meal_type TEXT,
  result TEXT NOT NULL DEFAULT 'ok'
    CHECK(result IN ('ok','denied','duplicate','not_eligible','unknown_card','alarm')),
  photo_url TEXT,
  raw_uid TEXT,
  scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO access_events_new
  (id, card_id, holder_type, holder_id, station_id, event_type, meal_type, result, photo_url, raw_uid, scanned_at)
  SELECT id, card_id, holder_type, holder_id, station_id, event_type, meal_type, result, photo_url, raw_uid, scanned_at
  FROM access_events;

DROP TABLE access_events;
ALTER TABLE access_events_new RENAME TO access_events;

CREATE INDEX IF NOT EXISTS idx_access_events_holder ON access_events(holder_type, holder_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_events_station ON access_events(station_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_events_card ON access_events(card_id, scanned_at DESC);
