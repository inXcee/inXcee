-- Su girişlerini izlenebilir lotlara dönüştürür; eski hareketler geriye uyumlu kalır.

ALTER TABLE water_products
  ADD COLUMN expiry_tracking INTEGER NOT NULL DEFAULT 0
  CHECK(expiry_tracking IN (0, 1));

ALTER TABLE water_products
  ADD COLUMN expiry_warning_days INTEGER NOT NULL DEFAULT 30
  CHECK(expiry_warning_days BETWEEN 0 AND 365);

ALTER TABLE water_movements ADD COLUMN lot_no TEXT;
ALTER TABLE water_movements ADD COLUMN production_date TEXT;
ALTER TABLE water_movements ADD COLUMN expiry_date TEXT;

ALTER TABLE water_movements
  ADD COLUMN lot_status TEXT NOT NULL DEFAULT 'active'
  CHECK(lot_status IN ('active', 'quarantined'));

ALTER TABLE water_movements ADD COLUMN lot_status_note TEXT;
ALTER TABLE water_movements ADD COLUMN lot_status_updated_by INTEGER REFERENCES users(id);
ALTER TABLE water_movements ADD COLUMN lot_status_updated_at DATETIME;

CREATE INDEX IF NOT EXISTS idx_water_mov_lot_expiry
  ON water_movements(product_id, lot_status, expiry_date, move_date)
  WHERE type='in';

CREATE INDEX IF NOT EXISTS idx_water_mov_lot_no
  ON water_movements(lot_no)
  WHERE type='in' AND lot_no IS NOT NULL;
