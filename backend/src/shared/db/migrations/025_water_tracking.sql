-- Faz 34: Su takip modülü — ürünler, bölgeler, giriş/dağıtım hareketleri.
-- Otomatik çevrim: 1 palet = cases_per_pallet koli, 1 koli = units_per_case adet.
-- qty_base her zaman ADET cinsinden normalize edilir (toplamlar tek birime döner).

CREATE TABLE IF NOT EXISTS water_products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  unit_label TEXT NOT NULL DEFAULT 'adet',
  units_per_case INTEGER NOT NULL DEFAULT 1,
  cases_per_pallet INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS water_zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT,
  note TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS water_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('in','out')),
  product_id INTEGER NOT NULL REFERENCES water_products(id),
  zone_id INTEGER REFERENCES water_zones(id),
  move_date TEXT NOT NULL,
  qty_base INTEGER NOT NULL,
  input_qty REAL NOT NULL,
  input_unit TEXT NOT NULL CHECK(input_unit IN ('adet','koli','palet')),
  waybill_no TEXT,
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_water_mov_date ON water_movements(move_date);
CREATE INDEX IF NOT EXISTS idx_water_mov_type ON water_movements(type);
CREATE INDEX IF NOT EXISTS idx_water_mov_zone ON water_movements(zone_id);
CREATE INDEX IF NOT EXISTS idx_water_mov_product ON water_movements(product_id);

-- Varsayılan ürünler (idempotent — yalnızca tablo boşsa)
INSERT INTO water_products (name, unit_label, units_per_case, cases_per_pallet)
SELECT * FROM (
  SELECT '0.33 L Şişe Su' AS name, 'şişe' AS unit_label, 12 AS units_per_case, 84 AS cases_per_pallet
  UNION ALL SELECT '0.5 L Şişe Su', 'şişe', 12, 70
  UNION ALL SELECT '19 L Damacana', 'damacana', 1, 1
  UNION ALL SELECT 'Bardak Su 200 ml', 'bardak', 24, 100
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM water_products);
