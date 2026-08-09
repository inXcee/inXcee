-- Faz 2: Taslak → Yayın → Onay akışı.
--
-- Bugün çizelgede yapılan her değişiklik anında "kesin vardiya" sayılıyor:
-- planlayıcı hücreyi doldurur doldurmaz personel için bağlayıcı hâle geliyor,
-- yayın diye bir an yok. Bu yüzden yayın sonrası değişiklik de fark edilmiyor.
--
-- schedule_versions: hafta başına sürüm ve durum.
-- schedule_version_entries: YAYIN ANINDAKİ çizelgenin fotoğrafı. Fotoğraf
-- olmadan "yayından beri ne değişti" sorusu cevaplanamaz — canlı tabloyu
-- kendisiyle karşılaştırmak anlamsız.

CREATE TABLE IF NOT EXISTS schedule_versions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start    TEXT NOT NULL,
  version       INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'published',   -- published | withdrawn
  note          TEXT,
  published_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  published_by  INTEGER REFERENCES users(id),
  withdrawn_at  DATETIME,
  withdrawn_by  INTEGER REFERENCES users(id),
  UNIQUE(week_start, version)
);

CREATE INDEX IF NOT EXISTS idx_schedule_versions_week
  ON schedule_versions(week_start, version DESC);

CREATE TABLE IF NOT EXISTS schedule_version_entries (
  version_id       INTEGER NOT NULL REFERENCES schedule_versions(id) ON DELETE CASCADE,
  staff_id         INTEGER NOT NULL,
  work_date        TEXT NOT NULL,
  shift_def_id     INTEGER,
  status           TEXT,
  leave_type       TEXT,
  work_location_id INTEGER,
  PRIMARY KEY (version_id, staff_id, work_date)
);

CREATE INDEX IF NOT EXISTS idx_schedule_version_entries_version
  ON schedule_version_entries(version_id);
