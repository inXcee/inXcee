-- Phase 2: immutable card/kiosk events, reconciliation history and exception queue.

CREATE TABLE IF NOT EXISTS attendance_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_key TEXT NOT NULL UNIQUE,
  external_event_id TEXT,
  staff_id INTEGER REFERENCES staff(id),
  card_id INTEGER REFERENCES cards(id),
  event_type TEXT NOT NULL CHECK(event_type IN ('check_in','check_out','scan')),
  occurred_at TEXT NOT NULL,
  work_date TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'kiosk',
  device_id TEXT,
  match_status TEXT NOT NULL DEFAULT 'matched'
    CHECK(match_status IN ('matched','unmatched')),
  match_detail TEXT,
  raw_payload TEXT,
  received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_attendance_events_staff_date
  ON attendance_events(staff_id, work_date, occurred_at);
CREATE INDEX IF NOT EXISTS idx_attendance_events_source
  ON attendance_events(source, device_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_attendance_events_unmatched
  ON attendance_events(match_status, work_date) WHERE match_status = 'unmatched';

CREATE TRIGGER IF NOT EXISTS trg_attendance_events_immutable_update
BEFORE UPDATE ON attendance_events
BEGIN
  SELECT RAISE(ABORT, 'attendance_events are immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_attendance_events_immutable_delete
BEFORE DELETE ON attendance_events
BEGIN
  SELECT RAISE(ABORT, 'attendance_events are immutable');
END;

CREATE TABLE IF NOT EXISTS attendance_daily_reconciliations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fingerprint TEXT NOT NULL UNIQUE,
  staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  work_date TEXT NOT NULL,
  shift_schedule_id INTEGER REFERENCES shift_schedule(id) ON DELETE SET NULL,
  check_in_event_id INTEGER REFERENCES attendance_events(id) ON DELETE SET NULL,
  check_out_event_id INTEGER REFERENCES attendance_events(id) ON DELETE SET NULL,
  source_event_ids TEXT NOT NULL DEFAULT '[]',
  old_status TEXT,
  new_status TEXT,
  result_status TEXT NOT NULL
    CHECK(result_status IN ('matched','exception','skipped','no_events','unplanned')),
  reason_code TEXT,
  planned_start TEXT,
  planned_end TEXT,
  actual_check_in TEXT,
  actual_check_out TEXT,
  worked_minutes INTEGER,
  overtime_candidate_minutes INTEGER NOT NULL DEFAULT 0,
  run_source TEXT NOT NULL DEFAULT 'manual'
    CHECK(run_source IN ('manual','cron','event')),
  reconciled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reconciled_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_attendance_reconciliation_staff_date
  ON attendance_daily_reconciliations(staff_id, work_date, reconciled_at DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_reconciliation_result
  ON attendance_daily_reconciliations(result_status, work_date);

CREATE TABLE IF NOT EXISTS attendance_exceptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER REFERENCES staff(id) ON DELETE CASCADE,
  work_date TEXT NOT NULL,
  shift_schedule_id INTEGER REFERENCES shift_schedule(id) ON DELETE SET NULL,
  reconciliation_id INTEGER REFERENCES attendance_daily_reconciliations(id) ON DELETE SET NULL,
  source_event_id INTEGER REFERENCES attendance_events(id) ON DELETE SET NULL,
  exception_type TEXT NOT NULL CHECK(exception_type IN (
    'unmatched_event','unplanned_attendance','missing_scan','single_scan',
    'invalid_sequence','missing_shift_definition','late_arrival',
    'early_departure','outside_shift','overtime_candidate'
  )),
  severity TEXT NOT NULL DEFAULT 'warning'
    CHECK(severity IN ('info','warning','critical')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK(status IN ('open','resolved','ignored')),
  message TEXT NOT NULL,
  details_json TEXT,
  resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolution_note TEXT,
  resolved_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_exception_open
  ON attendance_exceptions(COALESCE(staff_id, 0), work_date, exception_type)
  WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_attendance_exception_queue
  ON attendance_exceptions(status, work_date, severity);
CREATE INDEX IF NOT EXISTS idx_attendance_exception_staff
  ON attendance_exceptions(staff_id, work_date DESC);
