-- leave_requests.leave_type CHECK'i 019'dan kalma: 'owed' (Aİ — alacak izin / denkleştirme) ve 'other'
-- (İ — izinli) puantaj kodlarında (042/047) ve arayüzde var ama izin talebi olarak kaydedilemiyordu
-- ("CHECK constraint failed"). Tablo aynı kolonlarla yeniden kurulur; yalnız CHECK genişler.

CREATE TABLE leave_requests_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  leave_type TEXT NOT NULL
    CHECK(leave_type IN ('annual','sick','emergency','maternity','paternity','marriage','bereavement','unpaid','owed','other')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  total_days INTEGER NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','approved','rejected')),
  approved_by INTEGER REFERENCES users(id),
  approved_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  leave_hours REAL,
  requested_by INTEGER REFERENCES users(id),
  review_note TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at DATETIME
);

INSERT INTO leave_requests_new (
  id, staff_id, leave_type, start_date, end_date, total_days, reason, status, approved_by, approved_at, created_at,
  leave_hours, requested_by, review_note, version, updated_at
)
SELECT id, staff_id, leave_type, start_date, end_date, total_days, reason, status, approved_by, approved_at, created_at,
  leave_hours, requested_by, review_note, version, updated_at
FROM leave_requests;

DROP TABLE leave_requests;
ALTER TABLE leave_requests_new RENAME TO leave_requests;

CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_staff ON leave_requests(staff_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_tracking_period
  ON leave_requests(status, start_date, end_date, staff_id, leave_type);

CREATE TRIGGER IF NOT EXISTS trg_leave_requests_updated_at_insert
AFTER INSERT ON leave_requests
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE leave_requests SET updated_at=CURRENT_TIMESTAMP WHERE id=NEW.id;
END;
