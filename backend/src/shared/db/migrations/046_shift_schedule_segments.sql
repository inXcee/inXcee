-- Phase 3: split shifts, time-based coverage rules and segment-aware swaps.

CREATE TABLE IF NOT EXISTS shift_schedule_segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id INTEGER NOT NULL REFERENCES shift_schedule(id) ON DELETE CASCADE,
  sequence_no INTEGER NOT NULL DEFAULT 1,
  shift_def_id INTEGER REFERENCES shift_definitions(id) ON DELETE SET NULL,
  role_id INTEGER REFERENCES staff_roles(id) ON DELETE SET NULL,
  work_location_id INTEGER REFERENCES work_locations(id) ON DELETE SET NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  break_minutes INTEGER NOT NULL DEFAULT 0 CHECK(break_minutes BETWEEN 0 AND 480),
  actual_start TEXT,
  actual_end TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK(status IN ('planned','completed','cancelled')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(schedule_id, sequence_no)
);

CREATE INDEX IF NOT EXISTS idx_shift_segments_schedule
  ON shift_schedule_segments(schedule_id, sequence_no);
CREATE INDEX IF NOT EXISTS idx_shift_segments_coverage
  ON shift_schedule_segments(work_location_id, role_id, start_time, end_time);

CREATE TABLE IF NOT EXISTS shift_coverage_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  dept_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  role_id INTEGER REFERENCES staff_roles(id) ON DELETE SET NULL,
  work_location_id INTEGER REFERENCES work_locations(id) ON DELETE SET NULL,
  shift_def_id INTEGER REFERENCES shift_definitions(id) ON DELETE SET NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  min_staff INTEGER NOT NULL DEFAULT 1 CHECK(min_staff BETWEEN 0 AND 999),
  days_of_week TEXT NOT NULL DEFAULT '1,2,3,4,5,6,7',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_shift_coverage_rules_active
  ON shift_coverage_rules(is_active, dept_id, work_location_id, role_id);

ALTER TABLE shift_swap_requests
  ADD COLUMN requester_segment_id INTEGER REFERENCES shift_schedule_segments(id) ON DELETE SET NULL;
ALTER TABLE shift_swap_requests
  ADD COLUMN target_segment_id INTEGER REFERENCES shift_schedule_segments(id) ON DELETE SET NULL;
ALTER TABLE shift_swap_requests
  ADD COLUMN target_accepted_at DATETIME;
ALTER TABLE shift_swap_requests
  ADD COLUMN validation_note TEXT;
