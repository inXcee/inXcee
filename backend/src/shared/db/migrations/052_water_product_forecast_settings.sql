-- Ürün bazlı sipariş planı: tedarik süresi ve stok emniyet payı.
ALTER TABLE water_products
  ADD COLUMN lead_time_days INTEGER NOT NULL DEFAULT 7
  CHECK(lead_time_days BETWEEN 0 AND 365);

ALTER TABLE water_products
  ADD COLUMN safety_stock_days INTEGER NOT NULL DEFAULT 3
  CHECK(safety_stock_days BETWEEN 0 AND 365);
