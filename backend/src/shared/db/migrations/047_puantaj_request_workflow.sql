-- Puantaj code effects, request documents, overtime approval flow and optimistic locking.

ALTER TABLE puantaj_codes ADD COLUMN is_paid INTEGER NOT NULL DEFAULT 0 CHECK(is_paid IN (0,1));
ALTER TABLE puantaj_codes ADD COLUMN sgk_day_factor REAL NOT NULL DEFAULT 0 CHECK(sgk_day_factor >= 0 AND sgk_day_factor <= 1);
ALTER TABLE puantaj_codes ADD COLUMN day_multiplier REAL NOT NULL DEFAULT 0 CHECK(day_multiplier >= 0 AND day_multiplier <= 3);
ALTER TABLE puantaj_codes ADD COLUMN hour_multiplier REAL NOT NULL DEFAULT 0 CHECK(hour_multiplier >= 0 AND hour_multiplier <= 5);
ALTER TABLE puantaj_codes ADD COLUMN overtime_effect TEXT NOT NULL DEFAULT 'none'
  CHECK(overtime_effect IN ('none','eligible','blocks'));
ALTER TABLE puantaj_codes ADD COLUMN requires_document INTEGER NOT NULL DEFAULT 0 CHECK(requires_document IN (0,1));
ALTER TABLE puantaj_codes ADD COLUMN requires_reason INTEGER NOT NULL DEFAULT 0 CHECK(requires_reason IN (0,1));

-- Preserve the payroll behaviour used before this migration, but make it configurable.
UPDATE puantaj_codes SET is_paid=1, sgk_day_factor=1, day_multiplier=1, hour_multiplier=1, overtime_effect='eligible'
WHERE code='N';
UPDATE puantaj_codes SET is_paid=1, sgk_day_factor=1, day_multiplier=1, hour_multiplier=1
WHERE code='H';
UPDATE puantaj_codes SET is_paid=1, sgk_day_factor=1, day_multiplier=1, hour_multiplier=1
WHERE leave_type IN ('annual','emergency');
UPDATE puantaj_codes SET requires_document=1, requires_reason=1 WHERE leave_type='sick';
UPDATE puantaj_codes SET requires_reason=1 WHERE leave_type IN ('unpaid','other','owed');

ALTER TABLE leave_requests ADD COLUMN leave_hours REAL;
ALTER TABLE leave_requests ADD COLUMN requested_by INTEGER REFERENCES users(id);
ALTER TABLE leave_requests ADD COLUMN review_note TEXT;
ALTER TABLE leave_requests ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
-- SQLite dolu tabloya non-constant default eklemeyi reddeder. Kolonu sade ekleyip
-- mevcut/yeni satirlari ayri adimlarda doldurmak canli veritabaniyla da calisir.
ALTER TABLE leave_requests ADD COLUMN updated_at DATETIME;
UPDATE leave_requests SET updated_at=COALESCE(created_at, CURRENT_TIMESTAMP) WHERE updated_at IS NULL;
CREATE TRIGGER IF NOT EXISTS trg_leave_requests_updated_at_insert
AFTER INSERT ON leave_requests
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE leave_requests SET updated_at=CURRENT_TIMESTAMP WHERE id=NEW.id;
END;

CREATE TABLE IF NOT EXISTS overtime_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  work_date TEXT NOT NULL,
  planned_start TEXT,
  planned_end TEXT,
  actual_start TEXT,
  actual_end TEXT,
  requested_hours REAL NOT NULL CHECK(requested_hours > 0 AND requested_hours <= 12),
  actual_hours REAL CHECK(actual_hours IS NULL OR (actual_hours >= 0 AND actual_hours <= 12)),
  reason TEXT NOT NULL,
  compensation_type TEXT NOT NULL DEFAULT 'pay' CHECK(compensation_type IN ('pay','time_off')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','returned')),
  requested_by INTEGER REFERENCES users(id),
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at DATETIME,
  review_note TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS leave_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  leave_request_id INTEGER REFERENCES leave_requests(id) ON DELETE CASCADE,
  overtime_request_id INTEGER REFERENCES overtime_requests(id) ON DELETE CASCADE,
  schedule_id INTEGER REFERENCES shift_schedule(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER,
  document_kind TEXT NOT NULL DEFAULT 'evidence',
  uploaded_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CHECK(
    (leave_request_id IS NOT NULL) +
    (overtime_request_id IS NOT NULL) +
    (schedule_id IS NOT NULL) = 1
  )
);

ALTER TABLE overtime_records ADD COLUMN overtime_request_id INTEGER REFERENCES overtime_requests(id);
ALTER TABLE shift_schedule ADD COLUMN puantaj_code_id INTEGER REFERENCES puantaj_codes(id);
ALTER TABLE shift_schedule ADD COLUMN row_version INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_overtime_requests_date_status
  ON overtime_requests(work_date, status, staff_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_overtime_records_request
  ON overtime_records(overtime_request_id) WHERE overtime_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leave_documents_leave
  ON leave_documents(leave_request_id, created_at);
CREATE INDEX IF NOT EXISTS idx_leave_documents_overtime
  ON leave_documents(overtime_request_id, created_at);
CREATE INDEX IF NOT EXISTS idx_leave_documents_schedule
  ON leave_documents(schedule_id, created_at);
