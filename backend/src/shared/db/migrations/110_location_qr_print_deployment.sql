-- Faz 7 — Basım partileri ve saha kurulum takibi.
--
-- 1078 etiket basıldı. "Basıldı" ile "kapıya asıldı" aynı şey değil, "asıldı"
-- ile "doğru kapıya asıldı" da aynı şey değil. Bu tablolar o üç durumu
-- birbirinden ayırır.
--
-- TASARIM KARARI — kurulum kaydı OLMAYAN konum "kurulmadı" DEĞİL "bilinmiyor"
-- sayılır. Bu tablolar yokken canlıda 1078 QR üretildi; hepsini "kurulmadı"
-- diye göstermek, çoktan asılmış etiketleri yeniden asmak için birini 19 bloğu
-- gezmeye göndermek olurdu. Rapor bu ayrımı açıkça yapar.
--
-- TASARIM KARARI — "asılı etiket bayatladı mı" SAKLANMAZ, TÜRETİLİR. Kurulum
-- satırı hangi qr_code_id'nin fiziksel olarak asılı olduğunu tutar; token
-- döndürülünce o kayıt kendiliğinden bayat görünür. Denormalize edilseydi,
-- rotate yolunu güncellemeyi atlayan her değişiklik sessizce "etiket güncel"
-- derdi.

CREATE TABLE IF NOT EXISTS location_qr_print_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_no TEXT UNIQUE,
  template_key TEXT NOT NULL,
  -- Kalibrasyon parti bazında saklanır: aynı yazıcıyla ikinci basım aynı
  -- ayarlarla yapılabilsin, "geçen sefer nasıl ayarlamıştık" sorusu bitsin.
  calibration_json TEXT,
  filter_json TEXT,
  label_count INTEGER NOT NULL DEFAULT 0,
  page_count INTEGER,
  status TEXT NOT NULL DEFAULT 'generated'
    CHECK(status IN ('generated','printed','cancelled')),
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  printed_confirmed_at TEXT,
  printed_confirmed_by INTEGER REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS ix_qr_print_batches_created
  ON location_qr_print_batches(created_at DESC);

-- Partideki her etiket. qr_code_id ŞART: token döndürülürse o kâğıt ölür,
-- hangi partinin yeniden basılacağı buradan bulunur.
CREATE TABLE IF NOT EXISTS location_qr_print_batch_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL REFERENCES location_qr_print_batches(id) ON DELETE CASCADE,
  location_id INTEGER NOT NULL REFERENCES service_locations(id),
  qr_code_id INTEGER NOT NULL REFERENCES location_qr_codes(id),
  -- Etiketin üstündeki insan-okur seri (RQ-M1-101-A7K3). Sahada hasarlı etiket
  -- bulunduğunda tek okunabilir şey bu olabilir.
  serial TEXT NOT NULL,
  page_no INTEGER,
  slot_no INTEGER,
  UNIQUE(batch_id, location_id)
);

CREATE INDEX IF NOT EXISTS ix_qr_batch_items_location
  ON location_qr_print_batch_items(location_id);
CREATE INDEX IF NOT EXISTS ix_qr_batch_items_serial
  ON location_qr_print_batch_items(serial);

-- Konum başına TEK satır: etiketin şu anki fiziksel durumu.
CREATE TABLE IF NOT EXISTS location_qr_deployments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id INTEGER NOT NULL UNIQUE REFERENCES service_locations(id),
  -- Fiziksel olarak asılı olan etiketin QR'ı. Aktif QR bundan farklıysa
  -- asılı etiket bayattır — bu, sorguda türetilir.
  qr_code_id INTEGER REFERENCES location_qr_codes(id),
  batch_id INTEGER REFERENCES location_qr_print_batches(id),
  status TEXT NOT NULL DEFAULT 'printed'
    CHECK(status IN ('printed','installed','verified','damaged','replaced','removed')),
  printed_at TEXT,
  installed_at TEXT,
  installed_by INTEGER REFERENCES users(id),
  verified_at TEXT,
  verified_by INTEGER REFERENCES users(id),
  verify_count INTEGER NOT NULL DEFAULT 0,
  damaged_at TEXT,
  damage_note TEXT,
  removed_at TEXT,
  note TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_qr_deployments_status
  ON location_qr_deployments(status, updated_at DESC);

-- Yanlış kapıya asılmış etiket sahada en sık görülen hata. Doğrulama sırasında
-- "beklenen konum" ile "QR'ın gösterdiği konum" tutmuyorsa doğrulama SAYILMAZ;
-- uyuşmazlık ayrıca kaydedilir ki düzeltme listesi çıkarılabilsin.
CREATE TABLE IF NOT EXISTS location_qr_verify_mismatches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scanned_qr_code_id INTEGER REFERENCES location_qr_codes(id),
  scanned_location_id INTEGER REFERENCES service_locations(id),
  -- Nullable: sahada iptal edilmiş etiket, "burası neresiydi" bilinmeden de
  -- bulunabilir. En az biri dolu olmalı.
  expected_location_id INTEGER REFERENCES service_locations(id),
  reason TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by INTEGER REFERENCES users(id),
  reported_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK(scanned_location_id IS NOT NULL OR expected_location_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS ix_qr_verify_mismatch_open
  ON location_qr_verify_mismatches(expected_location_id) WHERE resolved_at IS NULL;

-- Etiket şablonu ve kalibrasyon ayarları: bir kere ayarlanır, her basımda
-- varsayılan olur.
INSERT OR IGNORE INTO system_settings(key, value) VALUES('location_qr_label_template', 'a4_8');
INSERT OR IGNORE INTO system_settings(key, value) VALUES('location_qr_label_calibration', '{"offset_x_mm":0,"offset_y_mm":0,"scale":1}');
