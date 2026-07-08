-- Faz 38: Su dağıtımlarını giriş irsaliyelerine bağlayan otomatik stok eşleşmesi.
-- Çıkış hareketi kaydedilirken aynı ürünün en eski kalan giriş irsaliyelerinden FIFO düşülür.

CREATE TABLE IF NOT EXISTS water_movement_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  out_movement_id INTEGER NOT NULL REFERENCES water_movements(id) ON DELETE CASCADE,
  in_movement_id INTEGER NOT NULL REFERENCES water_movements(id) ON DELETE RESTRICT,
  qty_base INTEGER NOT NULL CHECK(qty_base > 0),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(out_movement_id, in_movement_id)
);

CREATE INDEX IF NOT EXISTS idx_water_alloc_out ON water_movement_allocations(out_movement_id);
CREATE INDEX IF NOT EXISTS idx_water_alloc_in ON water_movement_allocations(in_movement_id);
