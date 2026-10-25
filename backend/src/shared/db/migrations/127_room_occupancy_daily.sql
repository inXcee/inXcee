-- Günlük doluluk anlık görüntüsü (25 Eki 2026): saha doluluğu (rooms.occupancy) anlıktır, geçmişi yoktu —
-- panel 7 gün öncesiyle kıyaslayamıyor, trend grafiği çizilemiyordu. Saatlik cron günün satırını yeniden yazar;
-- günün SON yazımı gün sonu durumudur (sunucu 23:55'te kapalı olsa da gün kaybolmaz).
--   day      İstanbul günü (YYYY-MM-DD)
--   rooms    aktif oda (status='active'); closed = kullanım dışı (paydaya girmez)
--   occupied / empty / unknown   kapalı olmayan odalar — oran = occupied / (occupied + empty)
CREATE TABLE IF NOT EXISTS room_occupancy_daily (
  day TEXT NOT NULL,
  block TEXT NOT NULL,
  rooms INTEGER NOT NULL DEFAULT 0,
  closed INTEGER NOT NULL DEFAULT 0,
  occupied INTEGER NOT NULL DEFAULT 0,
  empty INTEGER NOT NULL DEFAULT 0,
  unknown INTEGER NOT NULL DEFAULT 0,
  captured_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (day, block)
);
