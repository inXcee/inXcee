export const SCHEMA = `
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('campus_manager','shift_supervisor','technical','laundry','housekeeper')),
  full_name TEXT NOT NULL,
  assigned_block TEXT,
  assigned_floor INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS personnel (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tc_no TEXT UNIQUE,
  passport_no TEXT UNIQUE,
  full_name TEXT NOT NULL,
  company TEXT,
  hometown TEXT,
  preferred_block TEXT,
  is_blacklisted INTEGER DEFAULT 0,
  blacklist_reason TEXT,
  blacklisted_at DATETIME,
  blacklisted_by INTEGER REFERENCES users(id),
  discipline_points INTEGER DEFAULT 0,
  check_in_date DATETIME,
  check_out_date DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  block TEXT NOT NULL,
  floor INTEGER NOT NULL,
  room_no TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  active_beds INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','quarantine','maintenance')),
  floor_supervisor_id INTEGER REFERENCES users(id),
  UNIQUE(block, room_no),
  CHECK(CASE WHEN block='S2' THEN capacity<=4 ELSE capacity<=6 END),
  CHECK(active_beds <= capacity),
  CHECK(active_beds >= 0)
);

CREATE TABLE IF NOT EXISTS room_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  personnel_id INTEGER NOT NULL REFERENCES personnel(id),
  room_id INTEGER NOT NULL REFERENCES rooms(id),
  bed_no INTEGER NOT NULL,
  assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  check_out_at DATETIME,
  assigned_by INTEGER REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_assignment
  ON room_assignments(personnel_id) WHERE check_out_at IS NULL;

CREATE TABLE IF NOT EXISTS shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  personnel_id INTEGER NOT NULL REFERENCES personnel(id),
  shift_type TEXT DEFAULT 'day',
  start_hour INTEGER DEFAULT 8,
  end_hour INTEGER DEFAULT 17
);

CREATE TABLE IF NOT EXISTS zimmet (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  personnel_id INTEGER NOT NULL REFERENCES personnel(id),
  item_name TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  digital_signature TEXT,
  signed_at DATETIME,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS laundry_bags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  qr_code TEXT UNIQUE NOT NULL,
  room_id INTEGER REFERENCES rooms(id),
  status TEXT DEFAULT 'clean' CHECK(status IN ('clean','dirty','collected','washing','ready','distributed')),
  machine_id INTEGER REFERENCES machines(id),
  collected_at DATETIME,
  wash_started_at DATETIME,
  distributed_at DATETIME,
  damage_note TEXT,
  collected_by INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS machines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'idle' CHECK(status IN ('idle','running','error')),
  current_block TEXT,
  cycle_start DATETIME,
  detergent_per_cycle_g INTEGER DEFAULT 200
);

CREATE TABLE IF NOT EXISTS maintenance_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  location TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT DEFAULT 'open' CHECK(status IN ('open','in_progress','done')),
  reporter_personnel_id INTEGER REFERENCES personnel(id),
  reporter_user_id INTEGER REFERENCES users(id),
  assigned_to INTEGER REFERENCES users(id),
  photo_url TEXT,
  is_preventive INTEGER DEFAULT 0,
  opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME
);

CREATE TABLE IF NOT EXISTS discipline_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  personnel_id INTEGER NOT NULL REFERENCES personnel(id),
  card_type TEXT NOT NULL CHECK(card_type IN ('yellow','red')),
  reason TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_name TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL,
  reorder_threshold REAL NOT NULL DEFAULT 0,
  category TEXT NOT NULL CHECK(category IN ('laundry','maintenance','housekeeping','general')),
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cleaning_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  area TEXT NOT NULL,
  block TEXT,
  floor INTEGER,
  task_type TEXT DEFAULT 'common_area',
  scheduled_at DATETIME NOT NULL,
  completed_at DATETIME,
  assigned_to INTEGER REFERENCES users(id),
  verified_by_qr INTEGER DEFAULT 0,
  qr_location TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_role TEXT,
  target_user_id INTEGER REFERENCES users(id),
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info' CHECK(type IN ('info','warning','critical')),
  module TEXT,
  is_read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS block_quarantine_assignment
BEFORE INSERT ON room_assignments
BEGIN
  SELECT RAISE(ABORT,'Bu oda karantinada — atama yapılamaz')
  WHERE (SELECT status FROM rooms WHERE id=NEW.room_id) = 'quarantine';
END;

-- -------------------------------------------------------
-- VARDIYA YÖNETİM MODÜLİ
-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color_class TEXT NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS shift_definitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  start_hour INTEGER NOT NULL,
  end_hour INTEGER NOT NULL,
  color_class TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shift_schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  personnel_id INTEGER NOT NULL REFERENCES personnel(id),
  dept_id INTEGER NOT NULL REFERENCES departments(id),
  shift_def_id INTEGER NOT NULL REFERENCES shift_definitions(id),
  work_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK(status IN ('scheduled','worked','absent','on_leave','overtime')),
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(personnel_id, work_date)
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  personnel_id INTEGER NOT NULL REFERENCES personnel(id),
  leave_type TEXT NOT NULL
    CHECK(leave_type IN ('annual','sick','emergency','maternity','paternity','marriage','bereavement')),
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

CREATE TABLE IF NOT EXISTS leave_balance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  personnel_id INTEGER NOT NULL REFERENCES personnel(id),
  year INTEGER NOT NULL,
  annual_total INTEGER DEFAULT 15,
  annual_used INTEGER DEFAULT 0,
  sick_used INTEGER DEFAULT 0,
  emergency_used INTEGER DEFAULT 0,
  UNIQUE(personnel_id, year)
);

CREATE TABLE IF NOT EXISTS overtime_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  personnel_id INTEGER NOT NULL REFERENCES personnel(id),
  work_date TEXT NOT NULL,
  hours REAL NOT NULL,
  reason TEXT,
  approved_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attendance_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  personnel_id INTEGER NOT NULL REFERENCES personnel(id),
  shift_schedule_id INTEGER REFERENCES shift_schedule(id),
  check_in_at DATETIME,
  check_out_at DATETIME,
  actual_hours REAL
);
`
