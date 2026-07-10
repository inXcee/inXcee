-- Faz W5: Su takip — hızlı günlük giriş şablonları.
-- Şablon = ad + satırlar (bölge × ürün × varsayılan miktar/birim). Seçilince matris
-- hücreleri otomatik dolar; kullanıcı sadece miktarları değiştirip kaydeder.

CREATE TABLE IF NOT EXISTS water_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS water_template_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL REFERENCES water_templates(id) ON DELETE CASCADE,
  zone_id INTEGER NOT NULL REFERENCES water_zones(id),
  product_id INTEGER NOT NULL REFERENCES water_products(id),
  default_qty REAL,
  default_unit TEXT NOT NULL DEFAULT 'adet'
);

CREATE INDEX IF NOT EXISTS idx_water_tpl_lines ON water_template_lines(template_id);
