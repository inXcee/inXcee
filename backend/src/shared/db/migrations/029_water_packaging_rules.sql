-- Faz 40: Su urun paketleme kurallari.
-- Excel'deki notlara gore qty_base urunun dogal takip birimidir:
-- damacana=adet, bardak/0.33/0.5=koli, 5 L/cam=paket, tahta palet=palet.
-- Giriste "adet" ham takip sayisi olarak kalir; "paket" de resmi input birimi olur.

DROP TABLE IF EXISTS water_movements_packaging_new;
CREATE TABLE water_movements_packaging_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('in','out')),
  product_id INTEGER NOT NULL REFERENCES water_products(id),
  zone_id INTEGER REFERENCES water_zones(id),
  move_date TEXT NOT NULL,
  qty_base INTEGER NOT NULL,
  input_qty REAL NOT NULL,
  input_unit TEXT NOT NULL CHECK(input_unit IN ('adet','koli','paket','palet')),
  waybill_no TEXT,
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO water_movements_packaging_new(
  id, type, product_id, zone_id, move_date, qty_base, input_qty, input_unit,
  waybill_no, note, created_by, created_at
)
SELECT
  id, type, product_id, zone_id, move_date, qty_base, input_qty, input_unit,
  waybill_no, note, created_by, created_at
FROM water_movements;

DROP TABLE water_movements;
ALTER TABLE water_movements_packaging_new RENAME TO water_movements;
CREATE INDEX IF NOT EXISTS idx_water_mov_date ON water_movements(move_date);
CREATE INDEX IF NOT EXISTS idx_water_mov_type ON water_movements(type);
CREATE INDEX IF NOT EXISTS idx_water_mov_zone ON water_movements(zone_id);
CREATE INDEX IF NOT EXISTS idx_water_mov_product ON water_movements(product_id);

DROP TABLE IF EXISTS water_returns_packaging_new;
CREATE TABLE water_returns_packaging_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES water_products(id),
  move_date TEXT NOT NULL,
  qty_base INTEGER NOT NULL,
  input_qty REAL NOT NULL,
  input_unit TEXT NOT NULL CHECK(input_unit IN ('adet','koli','paket','palet')),
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO water_returns_packaging_new(
  id, product_id, move_date, qty_base, input_qty, input_unit, note, created_by, created_at
)
SELECT id, product_id, move_date, qty_base, input_qty, input_unit, note, created_by, created_at
FROM water_returns;

DROP TABLE water_returns;
ALTER TABLE water_returns_packaging_new RENAME TO water_returns;
CREATE INDEX IF NOT EXISTS idx_water_ret_date ON water_returns(move_date);
CREATE INDEX IF NOT EXISTS idx_water_ret_product ON water_returns(product_id);

UPDATE water_products
SET unit_label='damacana', units_per_case=1, cases_per_pallet=36
WHERE name LIKE '%Damacana%';

UPDATE water_products
SET unit_label='damacana', units_per_case=1, cases_per_pallet=48
WHERE name LIKE '%adesiz Damacana%';

UPDATE water_products
SET unit_label='koli', units_per_case=1, cases_per_pallet=66
WHERE name LIKE 'Bardak Su%';

UPDATE water_products
SET unit_label='koli', units_per_case=1, cases_per_pallet=180
WHERE REPLACE(name, ',', '.') LIKE '0.33%';

UPDATE water_products
SET unit_label='koli', units_per_case=1, cases_per_pallet=140
WHERE REPLACE(name, ',', '.') LIKE '0.5%';

UPDATE water_products
SET unit_label='paket', units_per_case=1, cases_per_pallet=133
WHERE name LIKE 'Cam Su%';

UPDATE water_products
SET unit_label='paket', units_per_case=1, cases_per_pallet=80,
    brand_id=COALESCE(brand_id, (SELECT id FROM water_brands ORDER BY sort_order, name LIMIT 1)),
    sort_order=7
WHERE name LIKE '5 L%' OR name LIKE '5LT%' OR name LIKE '5 lt%' OR name LIKE '5lt%';

INSERT INTO water_products (name, unit_label, units_per_case, cases_per_pallet, brand_id, is_returnable, sort_order)
SELECT '5 L Su', 'paket', 1, 80, (SELECT id FROM water_brands ORDER BY sort_order, name LIMIT 1), 0, 7
WHERE NOT EXISTS (
  SELECT 1 FROM water_products
  WHERE name LIKE '5 L%' OR name LIKE '5LT%' OR name LIKE '5 lt%' OR name LIKE '5lt%'
);

UPDATE water_products
SET unit_label='palet', units_per_case=1, cases_per_pallet=1
WHERE name='Tahta Palet';
