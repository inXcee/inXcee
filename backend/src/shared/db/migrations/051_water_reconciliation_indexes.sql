-- Ay sonu uzlastirma sorgularinda urun + tarih araligini birlikte hizlandirir.

CREATE INDEX IF NOT EXISTS idx_water_mov_product_date
  ON water_movements(product_id, move_date);

CREATE INDEX IF NOT EXISTS idx_water_adj_product_date
  ON water_adjustments(product_id, move_date);

CREATE INDEX IF NOT EXISTS idx_water_ret_product_date
  ON water_returns(product_id, move_date);
