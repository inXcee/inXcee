-- Hiç dokunulmamış eski temizlik görevlerinin arşivi (10 Eki 2026).
-- 19 Tem'den beri günlük ~1078 görev üretilip hiçbiri kapanmadığı için cleaning_tasks
-- 150k satıra şişti; bu satırlar bilgi taşımaz (yapılmadı/atlanmadı/fotoğraf yok) ama
-- silinmek yerine buraya taşınır (housekeeping/generation.js archiveUntouchedTasks).
CREATE TABLE IF NOT EXISTS cleaning_tasks_archive (
  id INTEGER PRIMARY KEY,
  area TEXT NOT NULL,
  block TEXT,
  floor INTEGER,
  task_type TEXT,
  scheduled_at DATETIME NOT NULL,
  assigned_to INTEGER,
  qr_location TEXT,
  archived_at DATETIME DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_archive_date ON cleaning_tasks_archive(scheduled_at);
