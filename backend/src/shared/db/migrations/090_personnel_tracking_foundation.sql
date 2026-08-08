-- Personel takip merkezi: tarihsel atama, kontrollu cikis ve degistirilemez olay gunlugu.

ALTER TABLE staff_assignments
  ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;

ALTER TABLE staff ADD COLUMN offboarding_started_at DATETIME;
ALTER TABLE staff ADD COLUMN exit_date TEXT;
ALTER TABLE staff ADD COLUMN exit_type TEXT
  CHECK(exit_type IS NULL OR exit_type IN ('resignation','employer_termination','contract_end','project_end','other'));
ALTER TABLE staff ADD COLUMN exit_reason TEXT;
ALTER TABLE staff ADD COLUMN offboarding_owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_staff_assignments_project_period
  ON staff_assignments(project_id, effective_from, effective_to);
CREATE INDEX IF NOT EXISTS idx_staff_offboarding
  ON staff(is_active, offboarding_started_at, exit_date);

-- Yalniz guvenilir mevcut acik atamalar geri doldurulur. Eski kapali atamalarin
-- proje bilgisi mevcut veriden kesin olarak yeniden uretilemez.
UPDATE staff_assignments
SET project_id = (
  SELECT s.project_id FROM staff s WHERE s.id = staff_assignments.staff_id
)
WHERE effective_to IS NULL
  AND project_id IS NULL;

CREATE TABLE IF NOT EXISTS personnel_tracking_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK(length(trim(event_type)) > 0),
  effective_at TEXT NOT NULL,
  source_type TEXT,
  source_id TEXT,
  revision_no INTEGER NOT NULL DEFAULT 1 CHECK(revision_no > 0),
  before_json TEXT CHECK(before_json IS NULL OR json_valid(before_json)),
  after_json TEXT CHECK(after_json IS NULL OR json_valid(after_json)),
  reason TEXT,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  metadata_json TEXT CHECK(metadata_json IS NULL OR json_valid(metadata_json)),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_type, source_id, revision_no)
);

CREATE INDEX IF NOT EXISTS idx_personnel_tracking_staff_effective
  ON personnel_tracking_events(staff_id, effective_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_personnel_tracking_type_effective
  ON personnel_tracking_events(event_type, effective_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_personnel_tracking_source
  ON personnel_tracking_events(source_type, source_id, revision_no DESC);
CREATE INDEX IF NOT EXISTS idx_personnel_tracking_created
  ON personnel_tracking_events(created_at DESC, id DESC);

-- Olay gunlugu uygulama tarafindan dahi guncellenemez veya silinemez.
CREATE TRIGGER IF NOT EXISTS trg_personnel_tracking_events_no_update
BEFORE UPDATE ON personnel_tracking_events
BEGIN
  SELECT RAISE(ABORT, 'personnel tracking events are immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_personnel_tracking_events_no_delete
BEFORE DELETE ON personnel_tracking_events
BEGIN
  SELECT RAISE(ABORT, 'personnel tracking events are immutable');
END;

-- Migration oncesi personeller icin yalniz mevcut durum baslangic goruntusu tutulur.
INSERT INTO personnel_tracking_events(
  staff_id, event_type, effective_at, source_type, source_id, revision_no,
  after_json, reason, metadata_json
)
SELECT
  s.id,
  'tracking_started',
  COALESCE(NULLIF(s.hire_date, ''), date('now', 'localtime')),
  'staff',
  CAST(s.id AS TEXT),
  1,
  json_object(
    'is_active', s.is_active,
    'project_id', s.project_id,
    'department_id', s.department_id,
    'role_id', s.role_id
  ),
  'Personel takip baslangic goruntusu',
  json_object('backfilled', 1, 'history_complete', 0)
FROM staff s
WHERE NOT EXISTS (
  SELECT 1
  FROM personnel_tracking_events e
  WHERE e.source_type = 'staff'
    AND e.source_id = CAST(s.id AS TEXT)
    AND e.event_type = 'tracking_started'
);
