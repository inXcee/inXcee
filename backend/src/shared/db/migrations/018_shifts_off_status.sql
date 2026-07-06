-- Faz 26: Haftalık izin (OFF) durumu — shift_schedule CHECK'e 'off' eklenir.
-- SQLite CHECK değiştirilemez → tablo rebuild (runner FK'yı kapatıp foreign_key_check yapar).
-- Ayrıca D1/E1 performans indexleri.

CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_attendance_open ON attendance_logs(staff_id, check_out_at);

CREATE TABLE shift_schedule_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  dept_id INTEGER REFERENCES departments(id),
  shift_def_id INTEGER REFERENCES shift_definitions(id),
  work_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK(status IN ('scheduled','worked','absent','on_leave','overtime','off')),
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(staff_id, work_date)
);

INSERT INTO shift_schedule_new (id, staff_id, dept_id, shift_def_id, work_date, status, created_by, created_at)
  SELECT id, staff_id, dept_id, shift_def_id, work_date, status, created_by, created_at FROM shift_schedule;

DROP TABLE shift_schedule;
ALTER TABLE shift_schedule_new RENAME TO shift_schedule;

CREATE INDEX IF NOT EXISTS idx_shift_schedule_date ON shift_schedule(work_date);
CREATE INDEX IF NOT EXISTS idx_shift_schedule_staff ON shift_schedule(staff_id);
CREATE INDEX IF NOT EXISTS idx_shift_schedule_staff_status_date ON shift_schedule(staff_id, status, work_date);

-- Veri düzeltme: WeekFill/CellAssign'ın ürettiği "haftalık izin" kayıtları
-- (on_leave + vardiya yok + kapsayan onaylı izin talebi yok) → off
UPDATE shift_schedule SET status = 'off'
WHERE status = 'on_leave' AND shift_def_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM leave_requests lr
    WHERE lr.staff_id = shift_schedule.staff_id
      AND lr.status = 'approved'
      AND lr.start_date <= shift_schedule.work_date
      AND lr.end_date >= shift_schedule.work_date
  );
