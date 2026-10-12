-- İK kadro senkronu (13 Eki 2026).
-- Resmi kadro kaynağı İK'nın puantaj Excel'idir (TC, görev, işe giriş/çıkış, proje). PC ajanı her akşam
-- bu listeyi gönderir; YYS kendi personeliyle karşılaştırır, farkları takip uyarısı olarak açar ve çizelge
-- aktarımında yeni personelin bilgisini buradan tamamlar.

-- Dış kaynaklardaki (çizelge, puantaj, föy) yazım farkları için kalıcı ad eşleştirmesi.
-- alias_fold = Türkçe küçük harf + tek boşluk; bir ad yalnız bir personele bağlanabilir.
CREATE TABLE IF NOT EXISTS staff_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  alias_fold TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','cizelge','puantaj')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_staff_aliases_staff ON staff_aliases(staff_id);

CREATE TABLE IF NOT EXISTS hr_roster_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL DEFAULT 'puantaj_excel',
  month TEXT,
  taken_at TEXT,
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  people_count INTEGER NOT NULL DEFAULT 0,
  run_summary TEXT,              -- ajanın Excel yazım turu özeti (JSON; TC içermez)
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_hr_roster_snapshots_received ON hr_roster_snapshots(received_at);

CREATE TABLE IF NOT EXISTS hr_roster_people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id INTEGER NOT NULL REFERENCES hr_roster_snapshots(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_fold TEXT NOT NULL,
  tc_no TEXT,
  position TEXT,
  hire_date TEXT,
  exit_date TEXT,
  project_name TEXT,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  file TEXT,
  sheet_row INTEGER,
  staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  match_method TEXT               -- tc / exact / alias / fold / null (eşleşmedi) / ambiguous
);
CREATE INDEX IF NOT EXISTS idx_hr_roster_people_snapshot ON hr_roster_people(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_hr_roster_people_staff ON hr_roster_people(staff_id);

INSERT OR IGNORE INTO personnel_tracking_rules(
  rule_key, label, description, window_days, threshold_primary, threshold_secondary, severity, due_days
) VALUES
  ('hr_roster_exit_pending', 'İK puantajında çıkış var, YYS''de aktif',
   'Puantaj Excel''inde çıkış tarihi yazılı ama YYS''de işten çıkış başlatılmamış', 14, 1, NULL, 'warning', 2),
  ('hr_roster_archived_present', 'YYS''de arşivli, İK puantajında çalışıyor',
   'Arşivlenmiş/pasif personel güncel puantajda çıkış tarihi olmadan yer alıyor', 14, 1, NULL, 'warning', 3),
  ('hr_roster_missing', 'YYS''de aktif, İK puantajında yok',
   'Aktif personel güncel puantaj listesinde bulunamadı (yazım farkı ya da ayrılmış olabilir)', 14, 1, NULL, 'info', 7),
  ('hr_roster_mismatch', 'İK puantajı ile kayıt farkı',
   'İşe giriş tarihi veya proje YYS ile puantajda farklı', 14, 1, NULL, 'info', 7);
