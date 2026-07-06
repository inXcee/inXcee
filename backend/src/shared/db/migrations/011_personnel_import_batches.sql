-- Sakin (personnel) Excel içe aktarım oturumları — tek-tık geri alma (undo) için.
-- undo_data: oturumun yarattığı personel + oda atamaları (JSON).
CREATE TABLE IF NOT EXISTS personnel_import_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  label TEXT,
  summary TEXT,        -- kısa özet (rapor sayıları, JSON)
  undo_data TEXT,      -- geri alma için tam snapshot (JSON)
  undone_at DATETIME   -- geri alındıysa zaman damgası
);

CREATE INDEX IF NOT EXISTS idx_personnel_import_batches_created ON personnel_import_batches(created_at);
