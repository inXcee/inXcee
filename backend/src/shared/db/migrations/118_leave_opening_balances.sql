-- Tarihli izin açılış/devir bakiyesi (12 Eki 2026).
-- Dış kaynaktan (İK Excel'i vb.) gelen kalan izin günleri "yıllık hak" alanına YAZILMAZ;
-- belirli bir tarih itibarıyla açılış bakiyesi olarak girilir ve İK (campus_manager)
-- kişi kişi onaylar. Onaylı en güncel kayıt, kalan izin hesabının başlangıç noktasıdır:
--   kalan = açılış + o tarihten sonra dolan yıl dönümü hakları − o tarihten sonra başlayan onaylı yıllık izinler
CREATE TABLE IF NOT EXISTS leave_opening_balances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  as_of_date TEXT NOT NULL,
  days REAL NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','excel','telegram')),
  source_label TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  decided_by INTEGER REFERENCES users(id),
  decided_at TEXT,
  decision_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_leave_opening_staff ON leave_opening_balances(staff_id, status, as_of_date);
