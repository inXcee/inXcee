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
  email TEXT,
  phone TEXT,
  mobile_pin TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS personnel (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tc_no TEXT UNIQUE,
  passport_no TEXT UNIQUE,
  full_name TEXT NOT NULL,
  company TEXT,
  hometown TEXT,
  phone_number TEXT,
  preferred_block TEXT,
  is_blacklisted INTEGER DEFAULT 0,
  blacklist_reason TEXT,
  blacklisted_at DATETIME,
  blacklisted_by INTEGER REFERENCES users(id),
  discipline_points INTEGER DEFAULT 0,
  gender TEXT CHECK(gender IN ('male','female')),
  job_title TEXT,
  department_id INTEGER REFERENCES departments(id),
  check_in_date DATETIME,
  check_out_date DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  block TEXT NOT NULL,
  floor INTEGER NOT NULL,
  room_no TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  active_beds INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','quarantine','maintenance')),
  no_clean INTEGER DEFAULT 0,
  notes TEXT,
  floor_supervisor_id INTEGER REFERENCES users(id),
  UNIQUE(block, room_no),
  CHECK(CASE WHEN block='S2' AND floor=2 THEN capacity<=4 ELSE capacity<=6 END),
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
  returned_at DATETIME,
  return_condition TEXT,
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
  status TEXT DEFAULT 'open' CHECK(status IN ('open','assigned','in_progress','review','done')),
  priority TEXT DEFAULT 'medium' CHECK(priority IN ('high','medium','low')),
  reporter_user_id INTEGER REFERENCES users(id),
  assigned_to INTEGER REFERENCES technicians(id),
  assigned_at DATETIME,
  started_at DATETIME,
  photo_before TEXT,
  photo_url TEXT,
  wait_reason TEXT,
  sla_deadline DATETIME,
  opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME
);

CREATE TABLE IF NOT EXISTS technicians (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  phone TEXT,
  specialty TEXT DEFAULT 'genel' CHECK(specialty IN ('elektrik','tesisat','genel','klima','boya')),
  shift TEXT DEFAULT '1' CHECK(shift IN ('1','2','3')),
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS maintenance_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES maintenance_requests(id),
  user_id INTEGER REFERENCES users(id),
  technician_id INTEGER REFERENCES technicians(id),
  comment TEXT NOT NULL,
  photo_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
  location TEXT DEFAULT NULL,
  unit_price REAL DEFAULT 0,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('in','out','count','initial')),
  delta REAL NOT NULL,
  quantity_after REAL NOT NULL CHECK(quantity_after >= 0),
  reason TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(item_id, created_at DESC);

CREATE TABLE IF NOT EXISTS inventory_checkouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  personnel_id INTEGER NOT NULL REFERENCES personnel(id),
  quantity REAL NOT NULL,
  note TEXT,
  checked_out_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  returned_at DATETIME,
  returned_qty REAL DEFAULT 0,
  created_by INTEGER NOT NULL REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_inv_checkouts_active ON inventory_checkouts(item_id, returned_at);

CREATE TABLE IF NOT EXISTS cleaning_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  area TEXT NOT NULL,
  block TEXT,
  floor INTEGER,
  task_type TEXT DEFAULT 'common_area',
  scheduled_at DATETIME NOT NULL,
  completed_at DATETIME,
  skipped INTEGER DEFAULT 0,
  skip_reason TEXT,
  checklist TEXT,
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

CREATE TABLE IF NOT EXISTS cleaning_staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  phone TEXT,
  assigned_block TEXT,
  assigned_floor INTEGER,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender TEXT NOT NULL DEFAULT 'Manuel Giriş',
  group_name TEXT NOT NULL DEFAULT 'Genel',
  text TEXT NOT NULL,
  is_fault INTEGER NOT NULL DEFAULT 0,
  fault_id INTEGER,
  parsed_location TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
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

-- Kampüs yönetim ekibi (yatakhane personelinden ayrı)
CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tc_no TEXT UNIQUE,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  position TEXT,
  department_id INTEGER REFERENCES departments(id),
  hire_date TEXT,
  birth_date TEXT,
  address TEXT,
  emergency_contact TEXT,
  emergency_phone TEXT,
  blood_type TEXT CHECK(blood_type IN ('A+','A-','B+','B-','AB+','AB-','0+','0-')),
  gender TEXT CHECK(gender IN ('male','female')),
  salary REAL,
  iban TEXT,
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shift_schedule (
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

CREATE TABLE IF NOT EXISTS leave_requests (
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

CREATE TABLE IF NOT EXISTS leave_balance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  year INTEGER NOT NULL,
  annual_total INTEGER DEFAULT 15,
  annual_used INTEGER DEFAULT 0,
  sick_used INTEGER DEFAULT 0,
  emergency_used INTEGER DEFAULT 0,
  UNIQUE(staff_id, year)
);

CREATE TABLE IF NOT EXISTS overtime_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  work_date TEXT NOT NULL,
  hours REAL NOT NULL,
  reason TEXT,
  approved_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attendance_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  shift_schedule_id INTEGER REFERENCES shift_schedule(id),
  check_in_at DATETIME,
  check_out_at DATETIME,
  actual_hours REAL
);

CREATE INDEX IF NOT EXISTS idx_staff_dept ON staff(department_id);
CREATE INDEX IF NOT EXISTS idx_staff_active ON staff(is_active);
CREATE INDEX IF NOT EXISTS idx_shift_schedule_date ON shift_schedule(work_date);
CREATE INDEX IF NOT EXISTS idx_shift_schedule_staff ON shift_schedule(staff_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_staff ON leave_requests(staff_id);
CREATE INDEX IF NOT EXISTS idx_overtime_staff ON overtime_records(staff_id);

-- -------------------------------------------------------
-- MAL GIRIS (GOODS RECEIPTS)
-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS goods_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_no TEXT UNIQUE NOT NULL,
  supplier TEXT NOT NULL,
  invoice_no TEXT,
  receipt_date TEXT NOT NULL DEFAULT (date('now')),
  notes TEXT,
  total_value REAL DEFAULT 0,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS goods_receipt_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_id INTEGER NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES inventory(id),
  quantity REAL NOT NULL,
  unit_price REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_goods_receipt_date ON goods_receipts(receipt_date DESC);
CREATE INDEX IF NOT EXISTS idx_goods_receipt_items_receipt ON goods_receipt_items(receipt_id);

-- -------------------------------------------------------
-- ENVANTER GENISLETME (suppliers, lots, locations, PO, requests)
-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  tax_no TEXT,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  payment_term TEXT DEFAULT 'cash' CHECK(payment_term IN ('cash','net_30','net_60','net_90')),
  default_lead_time_days INTEGER DEFAULT 7,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_suppliers_active ON suppliers(is_active);

CREATE TABLE IF NOT EXISTS supplier_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  unit_price REAL NOT NULL,
  effective_from DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source TEXT NOT NULL CHECK(source IN ('manual','goods_receipt','po')),
  source_ref_id INTEGER
);
CREATE INDEX IF NOT EXISTS idx_supplier_prices_lookup ON supplier_prices(item_id, supplier_id, effective_from DESC);

CREATE TABLE IF NOT EXISTS inventory_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  block TEXT,
  name TEXT NOT NULL,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS inventory_lots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  lot_no TEXT,
  quantity REAL NOT NULL CHECK(quantity >= 0),
  expiry_date DATE,
  received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  supplier_id INTEGER REFERENCES suppliers(id),
  unit_cost REAL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','depleted','expired','damaged'))
);
CREATE INDEX IF NOT EXISTS idx_lots_fifo ON inventory_lots(item_id, status, received_at);
CREATE INDEX IF NOT EXISTS idx_lots_expiry ON inventory_lots(expiry_date) WHERE expiry_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS inventory_stock_by_location (
  item_id INTEGER NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  location_id INTEGER NOT NULL REFERENCES inventory_locations(id) ON DELETE CASCADE,
  quantity REAL NOT NULL DEFAULT 0,
  PRIMARY KEY(item_id, location_id)
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  po_no TEXT UNIQUE NOT NULL,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','sent','partial_received','received','cancelled')),
  expected_date DATE,
  notes TEXT,
  total_value REAL DEFAULT 0,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME,
  received_at DATETIME
);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status, created_at DESC);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  po_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES inventory(id),
  qty_ordered REAL NOT NULL,
  qty_received REAL NOT NULL DEFAULT 0,
  unit_price REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_po_items_po ON purchase_order_items(po_id);

CREATE TABLE IF NOT EXISTS inventory_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_id INTEGER NOT NULL REFERENCES users(id),
  item_id INTEGER NOT NULL REFERENCES inventory(id),
  quantity REAL NOT NULL,
  reason TEXT,
  preferred_supplier_id INTEGER REFERENCES suppliers(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','approved','rejected','fulfilled','cancelled')),
  approved_by INTEGER REFERENCES users(id),
  decision_at DATETIME,
  rejection_reason TEXT,
  fulfillment_checkout_id INTEGER REFERENCES inventory_checkouts(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_requests_status ON inventory_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_requester ON inventory_requests(requester_id, created_at DESC);

-- -------------------------------------------------------
-- AUDIT LOG
-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  module TEXT,
  target_id INTEGER,
  detail TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------------------------------------
-- INDEXES
-- -------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_personnel_checkout ON personnel(check_out_date);
CREATE INDEX IF NOT EXISTS idx_maintenance_status ON maintenance_requests(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_location ON maintenance_requests(location);
CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_date ON cleaning_tasks(scheduled_at);

-- Performance indexes for frequent JOINs
CREATE INDEX IF NOT EXISTS idx_room_assignments_room ON room_assignments(room_id);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
CREATE INDEX IF NOT EXISTS idx_shifts_personnel ON shifts(personnel_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(target_user_id, is_read, created_at);
CREATE INDEX IF NOT EXISTS idx_maintenance_assigned ON maintenance_requests(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_discipline_personnel ON discipline_records(personnel_id);

-- Dashboard / occupancy hot-paths (100+ user için kritik)
CREATE INDEX IF NOT EXISTS idx_room_assignments_personnel ON room_assignments(personnel_id);
CREATE INDEX IF NOT EXISTS idx_room_assignments_active ON room_assignments(check_out_at) WHERE check_out_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_personnel_checkin ON personnel(check_in_date);
CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_completed ON cleaning_tasks(completed_at);

-- Eksik FK ve filtre index'leri
CREATE INDEX IF NOT EXISTS idx_personnel_dept ON personnel(department_id);
CREATE INDEX IF NOT EXISTS idx_rooms_block_status_floor ON rooms(block, status, floor);
CREATE INDEX IF NOT EXISTS idx_maintenance_opened ON maintenance_requests(opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory(category);
CREATE INDEX IF NOT EXISTS idx_audit_user_date ON audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_module_date ON audit_log(module, created_at DESC);

CREATE TABLE IF NOT EXISTS system_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);
`
