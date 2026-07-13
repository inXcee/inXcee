-- Puantaj kod kayıt sistemi: yapılandırılabilir kodlar (ekle/çıkar/renk)
-- + shift_schedule.leave_type enum CHECK kaldırma (yeni izin türleri İ/Aİ için).

CREATE TABLE IF NOT EXISTS puantaj_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  color_hex TEXT NOT NULL DEFAULT '64748B',
  status TEXT NOT NULL CHECK(status IN ('worked','off','on_leave','absent','scheduled')),
  leave_type TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_builtin INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO puantaj_codes(code, label, color_hex, status, leave_type, sort_order, is_builtin) VALUES
  ('N',  'Normal çalıştı', '22C55E', 'worked',    NULL,      1, 1),
  ('H',  'Hafta tatili',   '14B8A6', 'off',       NULL,      2, 1),
  ('Yİ', 'Yıllık izin',    '3B82F6', 'on_leave',  'annual',  3, 1),
  ('R',  'Raporlu',        'F97316', 'on_leave',  'sick',    4, 1),
  ('Üİ', 'Ücretsiz izin',  '94A3B8', 'on_leave',  'unpaid',  5, 1),
  ('İ',  'İzinli',         'A78BFA', 'on_leave',  'other',   6, 1),
  ('Aİ', 'Alacak izin',    'EC4899', 'on_leave',  'owed',    7, 1),
  ('Y',  'Devamsız',       'EF4444', 'absent',    NULL,      8, 1),
  ('P',  'Planlı',         '64748B', 'scheduled', NULL,      9, 1);

-- shift_schedule yeniden kurulum: leave_type enum CHECK'i kaldırılır
-- (kod kayıt sistemi yeni izin türleri tanımlayabilsin diye; doğrulama service katmanında).
CREATE TABLE IF NOT EXISTS shift_schedule_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  dept_id INTEGER REFERENCES departments(id),
  shift_def_id INTEGER REFERENCES shift_definitions(id),
  work_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK(status IN ('scheduled','worked','absent','on_leave','overtime','off')),
  leave_type TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  absent_reason TEXT,
  work_location_id INTEGER REFERENCES work_locations(id),
  UNIQUE(staff_id, work_date)
);

INSERT INTO shift_schedule_v2(id, staff_id, dept_id, shift_def_id, work_date, status, leave_type, created_by, created_at, absent_reason, work_location_id)
  SELECT id, staff_id, dept_id, shift_def_id, work_date, status, leave_type, created_by, created_at, absent_reason, work_location_id
  FROM shift_schedule;

DROP TABLE shift_schedule;
ALTER TABLE shift_schedule_v2 RENAME TO shift_schedule;

CREATE INDEX IF NOT EXISTS idx_shift_schedule_date ON shift_schedule(work_date);
CREATE INDEX IF NOT EXISTS idx_shift_schedule_staff ON shift_schedule(staff_id);
CREATE INDEX IF NOT EXISTS idx_shift_schedule_staff_status_date ON shift_schedule(staff_id, status, work_date);
CREATE INDEX IF NOT EXISTS idx_shift_schedule_location_date ON shift_schedule(work_location_id, work_date);
