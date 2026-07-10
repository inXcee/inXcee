-- Faz W8: Ürün kritik stok eşiği + marka rengi.
-- critical_level: min_level'dan daha düşük "acil" eşik (0 = tanımsız).
-- brands.color: kullanıcı seçimli marka rengi (hex, ör. #3b82f6); boşsa palet fallback.
ALTER TABLE water_products ADD COLUMN critical_level INTEGER NOT NULL DEFAULT 0;
ALTER TABLE water_brands ADD COLUMN color TEXT;
