-- ── 1) Ütü politikası ────────────────────────────────────────────────────────
-- default_requires_ironing iki durumluydu: 069 migration'ı 5 türü 1, GERİ KALAN
-- HER ŞEYİ 0 yaptı. Yani "ütü gerekmez" bilinçli bir karar değil, toptan atanmış
-- varsayılandı — kioskta parça eklenince sessizce "Ütü gerekmiyor" seçiliyordu.
-- Üç durumlu politika bunu ayırır:
--   always → her zaman ütülenir
--   never  → asla ütülenmez (bilinçli karar)
--   ask    → belirtilmemiş; kiosk ÜTÜ AÇIK gelir (eksik ütü, fazladan ütüden kötü)
--            ve satırda operatörün tek dokunuşla kapatabileceği şekilde vurgulanır
ALTER TABLE laundry_garment_types
  ADD COLUMN ironing_policy TEXT NOT NULL DEFAULT 'ask';

UPDATE laundry_garment_types
SET ironing_policy = CASE WHEN default_requires_ironing = 1 THEN 'always' ELSE 'ask' END;

-- ── 2) Oda kıyafet arşivi (dolap) ────────────────────────────────────────────
-- Aynı oda/kişi haftalarca benzer torba veriyor. Daha önce görülen parçalar
-- burada birikir; yeni girişte tek dokunuşla geri eklenir ve marka/beden gibi
-- künye bilgisi tekrar yazılmak zorunda kalmaz.
CREATE TABLE IF NOT EXISTS laundry_garment_archive (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  owner_name TEXT,                       -- torbayı veren kişi (laundry_items.intake_name)
  garment_type_id INTEGER REFERENCES laundry_garment_types(id),
  type_name TEXT NOT NULL,
  emoji TEXT,
  brand TEXT,
  model TEXT,
  size TEXT,
  color TEXT,
  colors_json TEXT,
  pattern TEXT,
  requires_ironing INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  times_seen INTEGER NOT NULL DEFAULT 1,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- tür|marka|model|beden|renk|desen — küçük harfe indirgenmiş kimlik
  signature TEXT NOT NULL
);

-- Aynı oda + aynı kişi + aynı imza tek satır; tekrar gelince times_seen artar.
CREATE UNIQUE INDEX IF NOT EXISTS idx_laundry_archive_unique
  ON laundry_garment_archive(room_id, IFNULL(owner_name, ''), signature);
CREATE INDEX IF NOT EXISTS idx_laundry_archive_room
  ON laundry_garment_archive(room_id, last_seen_at);
CREATE INDEX IF NOT EXISTS idx_laundry_archive_brand
  ON laundry_garment_archive(brand);

-- ── 3) Geçmişten geri doldur ─────────────────────────────────────────────────
-- Arşiv boş açılırsa ilk haftalar işe yaramaz; mevcut tekil parçalardan doldurulur.
INSERT OR IGNORE INTO laundry_garment_archive(
  room_id, owner_name, garment_type_id, type_name, emoji,
  brand, model, size, color, colors_json, pattern,
  requires_ironing, times_seen, first_seen_at, last_seen_at, signature
)
SELECT
  li.room_id,
  li.intake_name,
  MAX(pg.garment_type_id),
  pg.garment_type,
  MAX(pg.emoji),
  MAX(pg.brand),
  MAX(pg.model),
  MAX(pg.size),
  MAX(pg.color),
  MAX(pg.colors_json),
  MAX(pg.pattern),
  MAX(pg.requires_ironing),
  COUNT(*),
  MIN(pg.created_at),
  MAX(pg.created_at),
  lower(pg.garment_type) || '|' || lower(IFNULL(pg.brand, '')) || '|' ||
  lower(IFNULL(pg.model, '')) || '|' || lower(IFNULL(pg.size, '')) || '|' ||
  lower(IFNULL(pg.color, '')) || '|' || lower(IFNULL(pg.pattern, 'solid'))
FROM premium_garments pg
JOIN laundry_items li ON li.id = pg.item_id
WHERE li.room_id IS NOT NULL
GROUP BY
  li.room_id,
  IFNULL(li.intake_name, ''),
  lower(pg.garment_type) || '|' || lower(IFNULL(pg.brand, '')) || '|' ||
  lower(IFNULL(pg.model, '')) || '|' || lower(IFNULL(pg.size, '')) || '|' ||
  lower(IFNULL(pg.color, '')) || '|' || lower(IFNULL(pg.pattern, 'solid'));
