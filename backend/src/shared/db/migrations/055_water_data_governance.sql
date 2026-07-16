-- Su ana verisini kontrollü hâle getirir ve istisna onaylarını kalıcılaştırır.

ALTER TABLE water_products
  ADD COLUMN base_unit TEXT NOT NULL DEFAULT 'adet'
  CHECK(base_unit IN ('adet', 'koli', 'paket', 'palet'));

UPDATE water_products
SET base_unit = CASE lower(trim(unit_label))
  WHEN 'adet' THEN 'adet'
  WHEN 'koli' THEN 'koli'
  WHEN 'paket' THEN 'paket'
  WHEN 'palet' THEN 'palet'
  ELSE 'adet'
END;

ALTER TABLE water_products ADD COLUMN name_key TEXT;
ALTER TABLE water_zones ADD COLUMN name_key TEXT;
ALTER TABLE water_zones ADD COLUMN code_key TEXT;

UPDATE water_products
SET name_key = lower(trim(
  replace(replace(replace(replace(replace(replace(replace(name,
    'İ','i'),'I','ı'),'Ş','ş'),'Ğ','ğ'),'Ü','ü'),'Ö','ö'),'Ç','ç')
));

UPDATE water_zones
SET name_key = lower(trim(
      replace(replace(replace(replace(replace(replace(replace(name,
        'İ','i'),'I','ı'),'Ş','ş'),'Ğ','ğ'),'Ü','ü'),'Ö','ö'),'Ç','ç')
    )),
    code_key = CASE WHEN code IS NULL OR trim(code) = '' THEN NULL ELSE upper(trim(
      replace(replace(replace(replace(replace(replace(replace(code,
        'i','İ'),'ı','I'),'ş','Ş'),'ğ','Ğ'),'ü','Ü'),'ö','Ö'),'ç','Ç')
    )) END;

CREATE UNIQUE INDEX IF NOT EXISTS ux_water_products_name_brand
  ON water_products(name_key, COALESCE(brand_id, 0))
  WHERE name_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_water_zones_name
  ON water_zones(name_key)
  WHERE name_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_water_zones_code
  ON water_zones(code_key)
  WHERE code_key IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS trg_water_products_name_key_insert
AFTER INSERT ON water_products
BEGIN
  UPDATE water_products
  SET name_key = lower(trim(
    replace(replace(replace(replace(replace(replace(replace(NEW.name,
      'İ','i'),'I','ı'),'Ş','ş'),'Ğ','ğ'),'Ü','ü'),'Ö','ö'),'Ç','ç')
  ))
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_water_products_name_key_update
AFTER UPDATE OF name, brand_id ON water_products
BEGIN
  UPDATE water_products
  SET name_key = lower(trim(
    replace(replace(replace(replace(replace(replace(replace(NEW.name,
      'İ','i'),'I','ı'),'Ş','ş'),'Ğ','ğ'),'Ü','ü'),'Ö','ö'),'Ç','ç')
  ))
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_water_zones_keys_insert
AFTER INSERT ON water_zones
BEGIN
  UPDATE water_zones
  SET name_key = lower(trim(
        replace(replace(replace(replace(replace(replace(replace(NEW.name,
          'İ','i'),'I','ı'),'Ş','ş'),'Ğ','ğ'),'Ü','ü'),'Ö','ö'),'Ç','ç')
      )),
      code_key = CASE WHEN NEW.code IS NULL OR trim(NEW.code) = '' THEN NULL ELSE upper(trim(
        replace(replace(replace(replace(replace(replace(replace(NEW.code,
          'i','İ'),'ı','I'),'ş','Ş'),'ğ','Ğ'),'ü','Ü'),'ö','Ö'),'ç','Ç')
      )) END
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_water_zones_keys_update
AFTER UPDATE OF name, code ON water_zones
BEGIN
  UPDATE water_zones
  SET name_key = lower(trim(
        replace(replace(replace(replace(replace(replace(replace(NEW.name,
          'İ','i'),'I','ı'),'Ş','ş'),'Ğ','ğ'),'Ü','ü'),'Ö','ö'),'Ç','ç')
      )),
      code_key = CASE WHEN NEW.code IS NULL OR trim(NEW.code) = '' THEN NULL ELSE upper(trim(
        replace(replace(replace(replace(replace(replace(replace(NEW.code,
          'i','İ'),'ı','I'),'ş','Ş'),'ğ','Ğ'),'ü','Ü'),'ö','Ö'),'ç','Ç')
      )) END
  WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS water_review_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  movement_id INTEGER NOT NULL REFERENCES water_movements(id),
  decision TEXT NOT NULL CHECK(decision IN ('approved_exception')),
  unallocated_base INTEGER NOT NULL CHECK(unallocated_base > 0),
  note TEXT NOT NULL CHECK(length(trim(note)) BETWEEN 3 AND 500),
  reviewed_by INTEGER NOT NULL REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_water_review_decisions_movement
  ON water_review_decisions(movement_id, created_at);
