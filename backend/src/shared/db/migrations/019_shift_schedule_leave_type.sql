-- Puantaj günlük girişleri için shift_schedule üzerinde izin türü tutulur.
-- Ayrıca ücretsiz izin resmi izin taleplerinde de geçerli bir leave_type olur.

CREATE TABLE shift_schedule_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  dept_id INTEGER REFERENCES departments(id),
  shift_def_id INTEGER REFERENCES shift_definitions(id),
  work_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK(status IN ('scheduled','worked','absent','on_leave','overtime','off')),
  leave_type TEXT
    CHECK(leave_type IS NULL OR leave_type IN ('annual','sick','emergency','maternity','paternity','marriage','bereavement','unpaid')),
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(staff_id, work_date)
);

INSERT INTO shift_schedule_new (
  id, staff_id, dept_id, shift_def_id, work_date, status, leave_type, created_by, created_at
)
SELECT id, staff_id, dept_id, shift_def_id, work_date, status, NULL, created_by, created_at
FROM shift_schedule;

DROP TABLE shift_schedule;
ALTER TABLE shift_schedule_new RENAME TO shift_schedule;

CREATE INDEX IF NOT EXISTS idx_shift_schedule_date ON shift_schedule(work_date);
CREATE INDEX IF NOT EXISTS idx_shift_schedule_staff ON shift_schedule(staff_id);
CREATE INDEX IF NOT EXISTS idx_shift_schedule_staff_status_date ON shift_schedule(staff_id, status, work_date);

CREATE TABLE leave_requests_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  leave_type TEXT NOT NULL
    CHECK(leave_type IN ('annual','sick','emergency','maternity','paternity','marriage','bereavement','unpaid')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  total_days INTEGER NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','approved','rejected')),
  approved_by INTEGER REFERENCES users(id),
  approved_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO leave_requests_new (
  id, staff_id, leave_type, start_date, end_date, total_days, reason, status, approved_by, approved_at, created_at
)
SELECT id, staff_id, leave_type, start_date, end_date, total_days, reason, status, approved_by, approved_at, created_at
FROM leave_requests;

DROP TABLE leave_requests;
ALTER TABLE leave_requests_new RENAME TO leave_requests;

CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);
