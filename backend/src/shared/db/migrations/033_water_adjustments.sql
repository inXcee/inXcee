-- Faz W7: Su takip — stok düzeltme / sayım fişi (adjustment).
-- water_movements.type CHECK'ini rebuild ETMEZ (allocations FK riski yok). Düzeltmeler
-- AYRI tabloda; stok bakiyesine katılır (in=+, out=−) ama raporda ayrı "Düzeltme" kolonu.
CREATE TABLE IF NOT EXISTS water_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES water_products(id),
  move_date TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('in','out')),  -- in = artı (stok ekle), out = eksi (stok düş)
  qty_base INTEGER NOT NULL,                                  -- her zaman pozitif
  input_qty REAL NOT NULL,
  input_unit TEXT NOT NULL CHECK(input_unit IN ('adet','koli','paket','palet')),
  reason TEXT NOT NULL,
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_water_adj_product ON water_adjustments(product_id);
CREATE INDEX IF NOT EXISTS idx_water_adj_date ON water_adjustments(move_date);
