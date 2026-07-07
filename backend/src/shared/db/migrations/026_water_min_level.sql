-- Faz 37: Su ürünlerine minimum stok eşiği (adet cinsinden). 0 = uyarı kapalı.
ALTER TABLE water_products ADD COLUMN min_level INTEGER NOT NULL DEFAULT 0;
