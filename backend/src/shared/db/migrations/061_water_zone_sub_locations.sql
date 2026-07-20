-- Dağıtım yeri ALT YERLERİ: sahada ayrı ayrı teslim edilen ama takipte tek bölgeye
-- toplanan noktalar (ör. OSMANGAZİ ← "Modüller Bölgesi", "Gemi").
-- Aynı zamanda serbest metin dağıtım ayrıştırıcısında takma ad olarak eşleşir:
-- "Osmangazi gemisi 11 palet ..." → OSMANGAZİ bölgesi.
-- Ad bölge içinde tekildir; farklı bölgelerde aynı ad olabilir (parser çok eşleşmede
-- belirsiz sayıp eşleştirmez, kullanıcı seçer).

CREATE TABLE IF NOT EXISTS water_zone_sub_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zone_id INTEGER NOT NULL REFERENCES water_zones(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_water_zone_sub_zone ON water_zone_sub_locations(zone_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_water_zone_sub_unique ON water_zone_sub_locations(zone_id, name);
