-- Faz 39: Su takip — marka/tedarikçi boyutu + boş kap (depozito) iade defteri + INDEX seed.
-- INDEX Excel'ine hizalama: firma × marka-gruplu ürün matrisi ve boş damacana/palet iadesi.
-- water_movements'a DOKUNULMAZ (CHECK rebuild → allocations FK riski). İade ayrı tabloda.

-- ── 1) Markalar (tedarikçiler) ──
CREATE TABLE IF NOT EXISTS water_brands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── 2) Ürünlere marka + iade edilebilirlik + sıralama ──
-- (SQLite ADD COLUMN idempotent değil; runner once-only garanti eder)
ALTER TABLE water_products ADD COLUMN brand_id INTEGER REFERENCES water_brands(id);
ALTER TABLE water_products ADD COLUMN is_returnable INTEGER NOT NULL DEFAULT 0;
ALTER TABLE water_products ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

-- ── 3) Boş kap / palet iade defteri (depozito) ──
-- Dolu ürün stoğunu (water_movements.qty_base) ETKİLEMEZ; FIFO'ya girmez; bölge yok.
CREATE TABLE IF NOT EXISTS water_returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES water_products(id),
  move_date TEXT NOT NULL,
  qty_base INTEGER NOT NULL,
  input_qty REAL NOT NULL,
  input_unit TEXT NOT NULL CHECK(input_unit IN ('adet','koli','palet')),
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_water_ret_date ON water_returns(move_date);
CREATE INDEX IF NOT EXISTS idx_water_ret_product ON water_returns(product_id);

-- ── 4) Marka seed (idempotent, isim bazlı) ──
INSERT INTO water_brands (name, sort_order)
  SELECT 'MİLA SU', 1 WHERE NOT EXISTS (SELECT 1 FROM water_brands WHERE name='MİLA SU');
INSERT INTO water_brands (name, sort_order)
  SELECT 'AVRİL', 2 WHERE NOT EXISTS (SELECT 1 FROM water_brands WHERE name='AVRİL');
INSERT INTO water_brands (name, sort_order)
  SELECT 'ÇOBAN PINAR', 3 WHERE NOT EXISTS (SELECT 1 FROM water_brands WHERE name='ÇOBAN PINAR');

-- ── 5) Mevcut varsayılan ürünleri MİLA'ya bağla (SİLMEDEN; hareket geçmişi korunur) ──
UPDATE water_products SET brand_id=(SELECT id FROM water_brands WHERE name='MİLA SU'), is_returnable=1, sort_order=1
  WHERE name='19 L Damacana' AND brand_id IS NULL;
UPDATE water_products SET brand_id=(SELECT id FROM water_brands WHERE name='MİLA SU'), sort_order=3
  WHERE name='Bardak Su 200 ml' AND brand_id IS NULL;
UPDATE water_products SET brand_id=(SELECT id FROM water_brands WHERE name='MİLA SU'), sort_order=4
  WHERE name='0.33 L Şişe Su' AND brand_id IS NULL;
UPDATE water_products SET brand_id=(SELECT id FROM water_brands WHERE name='MİLA SU'), sort_order=5
  WHERE name='0.5 L Şişe Su' AND brand_id IS NULL;

-- ── 6) Ek katalog ürünleri (marka bazlı, (name,brand) yoksa ekle) ──
INSERT INTO water_products (name, unit_label, units_per_case, cases_per_pallet, brand_id, is_returnable, sort_order)
  SELECT 'İadesiz Damacana', 'damacana', 1, 1, (SELECT id FROM water_brands WHERE name='MİLA SU'), 0, 2
  WHERE NOT EXISTS (SELECT 1 FROM water_products WHERE name='İadesiz Damacana' AND brand_id=(SELECT id FROM water_brands WHERE name='MİLA SU'));
INSERT INTO water_products (name, unit_label, units_per_case, cases_per_pallet, brand_id, is_returnable, sort_order)
  SELECT 'Cam Su', 'şişe', 24, 1, (SELECT id FROM water_brands WHERE name='MİLA SU'), 0, 6
  WHERE NOT EXISTS (SELECT 1 FROM water_products WHERE name='Cam Su' AND brand_id=(SELECT id FROM water_brands WHERE name='MİLA SU'));
INSERT INTO water_products (name, unit_label, units_per_case, cases_per_pallet, brand_id, is_returnable, sort_order)
  SELECT 'Damacana', 'damacana', 1, 1, (SELECT id FROM water_brands WHERE name='AVRİL'), 1, 1
  WHERE NOT EXISTS (SELECT 1 FROM water_products WHERE name='Damacana' AND brand_id=(SELECT id FROM water_brands WHERE name='AVRİL'));
INSERT INTO water_products (name, unit_label, units_per_case, cases_per_pallet, brand_id, is_returnable, sort_order)
  SELECT 'İadesiz Damacana', 'damacana', 1, 1, (SELECT id FROM water_brands WHERE name='ÇOBAN PINAR'), 0, 1
  WHERE NOT EXISTS (SELECT 1 FROM water_products WHERE name='İadesiz Damacana' AND brand_id=(SELECT id FROM water_brands WHERE name='ÇOBAN PINAR'));
INSERT INTO water_products (name, unit_label, units_per_case, cases_per_pallet, brand_id, is_returnable, sort_order)
  SELECT 'Tahta Palet', 'palet', 1, 1, NULL, 1, 99
  WHERE NOT EXISTS (SELECT 1 FROM water_products WHERE name='Tahta Palet' AND brand_id IS NULL);

-- ── 7) Firmalar (dağıtım yerleri) — INDEX'teki ~30 firma, idempotent (isim bazlı) ──
INSERT INTO water_zones (name) SELECT 'OTC KAMP ALANI'        WHERE NOT EXISTS (SELECT 1 FROM water_zones WHERE name='OTC KAMP ALANI');
INSERT INTO water_zones (name) SELECT 'FPU KAMP ALANI'        WHERE NOT EXISTS (SELECT 1 FROM water_zones WHERE name='FPU KAMP ALANI');
INSERT INTO water_zones (name) SELECT 'OSMANGAZİ'             WHERE NOT EXISTS (SELECT 1 FROM water_zones WHERE name='OSMANGAZİ');
INSERT INTO water_zones (name) SELECT 'PMC'                   WHERE NOT EXISTS (SELECT 1 FROM water_zones WHERE name='PMC');
INSERT INTO water_zones (name) SELECT 'O&M'                   WHERE NOT EXISTS (SELECT 1 FROM water_zones WHERE name='O&M');
INSERT INTO water_zones (name) SELECT 'HELİPORT'              WHERE NOT EXISTS (SELECT 1 FROM water_zones WHERE name='HELİPORT');
INSERT INTO water_zones (name) SELECT 'FMC'                   WHERE NOT EXISTS (SELECT 1 FROM water_zones WHERE name='FMC');
INSERT INTO water_zones (name) SELECT 'DORCE (SOSYAL TESİSLER)' WHERE NOT EXISTS (SELECT 1 FROM water_zones WHERE name='DORCE (SOSYAL TESİSLER)');
INSERT INTO water_zones (name) SELECT 'KANUNİ'                WHERE NOT EXISTS (SELECT 1 FROM water_zones WHERE name='KANUNİ');
INSERT INTO water_zones (name) SELECT 'MUKAVEMET'             WHERE NOT EXISTS (SELECT 1 FROM water_zones WHERE name='MUKAVEMET');
INSERT INTO water_zones (name) SELECT 'FPU TPAO'              WHERE NOT EXISTS (SELECT 1 FROM water_zones WHERE name='FPU TPAO');
INSERT INTO water_zones (name) SELECT 'FPU GDF'               WHERE NOT EXISTS (SELECT 1 FROM water_zones WHERE name='FPU GDF');
INSERT INTO water_zones (name) SELECT 'KUZEY KLM'             WHERE NOT EXISTS (SELECT 1 FROM water_zones WHERE name='KUZEY KLM');
INSERT INTO water_zones (name) SELECT 'KARADENİZİN GÖZÜ'      WHERE NOT EXISTS (SELECT 1 FROM water_zones WHERE name='KARADENİZİN GÖZÜ');
INSERT INTO water_zones (name) SELECT 'SALTUKOVA'             WHERE NOT EXISTS (SELECT 1 FROM water_zones WHERE name='SALTUKOVA');
INSERT INTO water_zones (name) SELECT 'DOĞU KLM'              WHERE NOT EXISTS (SELECT 1 FROM water_zones WHERE name='DOĞU KLM');
INSERT INTO water_zones (name) SELECT 'SEYİT ONBAŞI'          WHERE NOT EXISTS (SELECT 1 FROM water_zones WHERE name='SEYİT ONBAŞI');
INSERT INTO water_zones (name) SELECT 'MÜSTECİP ONBAŞI'       WHERE NOT EXISTS (SELECT 1 FROM water_zones WHERE name='MÜSTECİP ONBAŞI');
INSERT INTO water_zones (name) SELECT 'EGE DERİN'             WHERE NOT EXISTS (SELECT 1 FROM water_zones WHERE name='EGE DERİN');
INSERT INTO water_zones (name) SELECT 'KARARGAH BİNASI'       WHERE NOT EXISTS (SELECT 1 FROM water_zones WHERE name='KARARGAH BİNASI');
INSERT INTO water_zones (name) SELECT 'KULE YATAKHANE'        WHERE NOT EXISTS (SELECT 1 FROM water_zones WHERE name='KULE YATAKHANE');
INSERT INTO water_zones (name) SELECT 'GNV ATLAS'             WHERE NOT EXISTS (SELECT 1 FROM water_zones WHERE name='GNV ATLAS');
INSERT INTO water_zones (name) SELECT 'MURAT İLHAN'           WHERE NOT EXISTS (SELECT 1 FROM water_zones WHERE name='MURAT İLHAN');
INSERT INTO water_zones (name) SELECT 'KUTSİ İLHAN'           WHERE NOT EXISTS (SELECT 1 FROM water_zones WHERE name='KUTSİ İLHAN');
INSERT INTO water_zones (name) SELECT 'KORKUT'                WHERE NOT EXISTS (SELECT 1 FROM water_zones WHERE name='KORKUT');
INSERT INTO water_zones (name) SELECT 'SUBSEA 7'              WHERE NOT EXISTS (SELECT 1 FROM water_zones WHERE name='SUBSEA 7');
INSERT INTO water_zones (name) SELECT 'MED ROMORKÖR GRUBU'    WHERE NOT EXISTS (SELECT 1 FROM water_zones WHERE name='MED ROMORKÖR GRUBU');
INSERT INTO water_zones (name) SELECT 'ALBATROS'              WHERE NOT EXISTS (SELECT 1 FROM water_zones WHERE name='ALBATROS');
INSERT INTO water_zones (name) SELECT 'FLORYA'                WHERE NOT EXISTS (SELECT 1 FROM water_zones WHERE name='FLORYA');
INSERT INTO water_zones (name) SELECT 'OTC YEMEKHANE GİDER'   WHERE NOT EXISTS (SELECT 1 FROM water_zones WHERE name='OTC YEMEKHANE GİDER');
