import Database from 'better-sqlite3'
import { SCHEMA } from './schema.js'

let db

function runMigrations(database) {
  const cols = database.prepare('PRAGMA table_info(personnel)').all().map(c => c.name)
  if (!cols.includes('gender'))
    database.exec("ALTER TABLE personnel ADD COLUMN gender TEXT CHECK(gender IN ('male','female'))")
  if (!cols.includes('department_id'))
    database.exec('ALTER TABLE personnel ADD COLUMN department_id INTEGER REFERENCES departments(id)')
}

export function initDB() {
  const path = process.env.DB_PATH || 'yys.db'
  db = new Database(path)
  db.exec(SCHEMA)
  runMigrations(db)
  // migrations — safe to run on existing DB
  try { db.exec('ALTER TABLE rooms ADD COLUMN notes TEXT') } catch(_) {}
  try { db.exec('ALTER TABLE rooms ADD COLUMN no_clean INTEGER DEFAULT 0') } catch(_) {}
  try { db.exec('ALTER TABLE personnel ADD COLUMN job_title TEXT') } catch(_) {}
  try { db.exec('ALTER TABLE cleaning_tasks ADD COLUMN checklist TEXT') } catch(_) {}
  try { db.exec('ALTER TABLE cleaning_tasks ADD COLUMN skipped INTEGER DEFAULT 0') } catch(_) {}
  try { db.exec('ALTER TABLE cleaning_tasks ADD COLUMN skip_reason TEXT') } catch(_) {}
  try { db.exec(`CREATE TABLE IF NOT EXISTS cleaning_staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    phone TEXT,
    assigned_block TEXT,
    assigned_floor INTEGER,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`) } catch(_) {}
  // maintenance upgrades
  try { db.exec('ALTER TABLE maintenance_requests ADD COLUMN priority TEXT DEFAULT \'medium\'') } catch(_) {}
  try { db.exec('ALTER TABLE maintenance_requests ADD COLUMN photo_before TEXT') } catch(_) {}
  try { db.exec('ALTER TABLE maintenance_requests ADD COLUMN assigned_at DATETIME') } catch(_) {}
  try { db.exec('ALTER TABLE maintenance_requests ADD COLUMN started_at DATETIME') } catch(_) {}
  try { db.exec('ALTER TABLE maintenance_requests ADD COLUMN review_at DATETIME') } catch(_) {}
  try { db.exec(`CREATE TABLE IF NOT EXISTS technicians (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    phone TEXT,
    specialty TEXT DEFAULT 'genel',
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`) } catch(_) {}
  try { db.exec(`CREATE TABLE IF NOT EXISTS maintenance_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER NOT NULL REFERENCES maintenance_requests(id),
    user_id INTEGER REFERENCES users(id),
    technician_id INTEGER REFERENCES technicians(id),
    comment TEXT NOT NULL,
    photo_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`) } catch(_) {}

  // Rebuild maintenance_requests to fix CHECK constraint + foreign key
  try {
    const hasOldCheck = db.prepare("SELECT sql FROM sqlite_master WHERE name='maintenance_requests'").get()
    if (hasOldCheck && hasOldCheck.sql && !hasOldCheck.sql.includes('assigned')) {
      db.exec('PRAGMA foreign_keys=OFF')
      db.exec(`
        CREATE TABLE maintenance_requests_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          location TEXT NOT NULL,
          description TEXT NOT NULL,
          status TEXT DEFAULT 'open' CHECK(status IN ('open','assigned','in_progress','review','done')),
          priority TEXT DEFAULT 'medium' CHECK(priority IN ('high','medium','low')),
          reporter_personnel_id INTEGER REFERENCES personnel(id),
          reporter_user_id INTEGER REFERENCES users(id),
          assigned_to INTEGER,
          photo_before TEXT,
          photo_url TEXT,
          is_preventive INTEGER DEFAULT 0,
          opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          assigned_at DATETIME,
          started_at DATETIME,
          review_at DATETIME,
          closed_at DATETIME
        )
      `)
      db.exec(`
        INSERT INTO maintenance_requests_new(id,location,description,status,priority,reporter_personnel_id,reporter_user_id,assigned_to,photo_before,photo_url,is_preventive,opened_at,assigned_at,started_at,review_at,closed_at)
        SELECT id,location,description,status,
          COALESCE(priority,'medium'),reporter_personnel_id,reporter_user_id,assigned_to,
          photo_before,photo_url,COALESCE(is_preventive,0),opened_at,assigned_at,started_at,review_at,closed_at
        FROM maintenance_requests
      `)
      db.exec('DROP TABLE maintenance_requests')
      db.exec('ALTER TABLE maintenance_requests_new RENAME TO maintenance_requests')
      db.exec('PRAGMA foreign_keys=ON')
    }
  } catch(_) {}

  // Rebuild rooms table: S2 only floor 2 is max 4, floor 1 is max 6
  try {
    const roomsSql = db.prepare("SELECT sql FROM sqlite_master WHERE name='rooms'").get()
    if (roomsSql && roomsSql.sql && roomsSql.sql.includes("block='S2' THEN capacity<=4") && !roomsSql.sql.includes('AND floor=2')) {
      db.exec('PRAGMA foreign_keys=OFF')
      db.transaction(() => {
        db.exec('DROP TABLE IF EXISTS rooms_new')
        db.exec(`
          CREATE TABLE rooms_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            block TEXT NOT NULL,
            floor INTEGER NOT NULL,
            room_no TEXT NOT NULL,
            capacity INTEGER NOT NULL,
            active_beds INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','quarantine','maintenance')),
            floor_supervisor_id INTEGER REFERENCES users(id),
            notes TEXT,
            no_clean INTEGER DEFAULT 0,
            UNIQUE(block, room_no),
            CHECK(CASE WHEN block='S2' AND floor=2 THEN capacity<=4 ELSE capacity<=6 END),
            CHECK(active_beds <= capacity),
            CHECK(active_beds >= 0)
          )
        `)
        db.exec(`
          INSERT INTO rooms_new(id,block,floor,room_no,capacity,active_beds,status,floor_supervisor_id,notes,no_clean)
          SELECT id,block,floor,room_no,capacity,active_beds,status,floor_supervisor_id,notes,no_clean FROM rooms
        `)
        db.exec('DROP TABLE rooms')
        db.exec('ALTER TABLE rooms_new RENAME TO rooms')
        db.exec("UPDATE rooms SET capacity=6, active_beds=6 WHERE block='S2' AND floor=1 AND capacity=4")
      })()
      db.exec('PRAGMA foreign_keys=ON')
    }
  } catch(_) {}
  // Clean up leftover temp table
  try { db.exec('DROP TABLE IF EXISTS rooms_new') } catch(_) {}

  // maintenance simplification: add wait_reason, shift column, assigned_to
  try { db.exec('ALTER TABLE maintenance_requests ADD COLUMN wait_reason TEXT') } catch(_) {}
  try { db.exec('ALTER TABLE maintenance_requests ADD COLUMN assigned_to INTEGER REFERENCES technicians(id)') } catch(_) {}
  try { db.exec("ALTER TABLE technicians ADD COLUMN shift TEXT DEFAULT '1'") } catch(_) {}

  // Shifts module migrations
  try { db.exec("ALTER TABLE personnel ADD COLUMN gender TEXT CHECK(gender IN ('male','female'))") } catch(_) {}
  try { db.exec('ALTER TABLE personnel ADD COLUMN department_id INTEGER REFERENCES departments(id)') } catch(_) {}

  // ── Improvement #3: Audit logging ──
  try { db.exec(`CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    module TEXT NOT NULL,
    target_id INTEGER,
    detail TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`) } catch(_) {}

  // ── Improvement #7: Zimmet return tracking ──
  try { db.exec('ALTER TABLE zimmet ADD COLUMN returned_at DATETIME') } catch(_) {}
  try { db.exec('ALTER TABLE zimmet ADD COLUMN return_condition TEXT') } catch(_) {}

  // ── Improvement #8: Maintenance SLA ──
  try { db.exec('ALTER TABLE maintenance_requests ADD COLUMN sla_deadline DATETIME') } catch(_) {}

  // phone_number replaces hometown usage in UI
  try { db.exec('ALTER TABLE personnel ADD COLUMN phone_number TEXT') } catch(_) {}

  // ── Checkout module: damage_note on zimmet ──
  try { db.exec('ALTER TABLE zimmet ADD COLUMN damage_note TEXT') } catch(_) {}

  // ── Profile photo ──
  try { db.exec('ALTER TABLE personnel ADD COLUMN photo_url TEXT') } catch(_) {}

  // ── Fix shift_schedule: allow nullable shift_def_id (on_leave days) and dept_id ──
  try {
    const ss = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='shift_schedule'").get()
    if (ss && (ss.sql.includes('shift_def_id INTEGER NOT NULL') || ss.sql.includes('dept_id INTEGER NOT NULL REFERENCES departments'))) {
      db.exec('PRAGMA foreign_keys=OFF')
      db.transaction(() => {
        db.exec(`CREATE TABLE IF NOT EXISTS shift_schedule_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          staff_id INTEGER NOT NULL REFERENCES staff(id),
          dept_id INTEGER REFERENCES departments(id),
          shift_def_id INTEGER REFERENCES shift_definitions(id),
          work_date TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'scheduled'
            CHECK(status IN ('scheduled','worked','absent','on_leave','overtime')),
          created_by INTEGER REFERENCES users(id),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(staff_id, work_date)
        )`)
        db.exec(`INSERT OR IGNORE INTO shift_schedule_new SELECT * FROM shift_schedule`)
        db.exec(`DROP TABLE shift_schedule`)
        db.exec(`ALTER TABLE shift_schedule_new RENAME TO shift_schedule`)
        db.exec(`CREATE INDEX IF NOT EXISTS idx_shift_schedule_date ON shift_schedule(work_date)`)
        db.exec(`CREATE INDEX IF NOT EXISTS idx_shift_schedule_staff ON shift_schedule(staff_id)`)
      })()
      db.exec('PRAGMA foreign_keys=ON')
    }
  } catch(_) {}

  // ═══════════════════════════════════════════════════════
  // Laundry v2 — Kişisel Parça Takibi
  // ═══════════════════════════════════════════════════════

  try { db.exec(`CREATE TABLE IF NOT EXISTS laundry_machines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'washer' CHECK(type IN ('washer','dryer')),
    status TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle','running','done','maintenance')),
    timer_end TEXT,
    capacity_kg REAL DEFAULT 10,
    maintenance_notes TEXT
  )`) } catch(_) {}

  try { db.exec(`CREATE TABLE IF NOT EXISTS laundry_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER REFERENCES rooms(id),
    status TEXT NOT NULL DEFAULT 'dirty' CHECK(status IN ('dirty','washing','ready','delivered','lost')),
    machine_id INTEGER REFERENCES laundry_machines(id),
    urgent INTEGER NOT NULL DEFAULT 0,
    item_count INTEGER NOT NULL DEFAULT 1,
    item_details TEXT,
    shelf_location TEXT,
    photo_url TEXT,
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`) } catch(_) {}

  try { db.exec(`CREATE TABLE IF NOT EXISTS laundry_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES laundry_items(id) ON DELETE CASCADE,
    machine_id INTEGER REFERENCES laundry_machines(id),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal','urgent')),
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`) } catch(_) {}

  try { db.exec(`CREATE TABLE IF NOT EXISTS laundry_deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES laundry_items(id) ON DELETE CASCADE,
    delivered_to TEXT NOT NULL,
    signature_data TEXT,
    delivered_by INTEGER REFERENCES users(id),
    delivered_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`) } catch(_) {}

  try { db.exec(`CREATE TABLE IF NOT EXISTS laundry_damages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES laundry_items(id) ON DELETE CASCADE,
    photo_url TEXT,
    description TEXT NOT NULL,
    reported_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`) } catch(_) {}

  try { db.exec(`CREATE TABLE IF NOT EXISTS laundry_sla_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stage TEXT NOT NULL UNIQUE CHECK(stage IN ('dirty','washing','ready')),
    warning_hours REAL NOT NULL DEFAULT 24,
    critical_hours REAL NOT NULL DEFAULT 48,
    updated_by INTEGER REFERENCES users(id),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`) } catch(_) {}

  try { db.exec(`CREATE TABLE IF NOT EXISTS laundry_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES laundry_items(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status TEXT NOT NULL,
    action_by INTEGER REFERENCES users(id),
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`) } catch(_) {}

  // SLA varsayılan konfigürasyon
  try { db.exec(`INSERT OR IGNORE INTO laundry_sla_config(stage,warning_hours,critical_hours) VALUES
    ('dirty',24,48),('washing',1,2),('ready',24,48)`) } catch(_) {}

  // Varsayılan makineler (ilk kurulumda seed)
  try {
    const mCount = db.prepare('SELECT COUNT(*) as c FROM laundry_machines').get()
    if (mCount.c === 0) {
      db.exec(`INSERT INTO laundry_machines(name,type,capacity_kg) VALUES
        ('Makine 1','washer',10),('Makine 2','washer',10),('Makine 3','washer',8),('Kurutucu 1','dryer',10)`)
    }
  } catch(_) {}

  // Performans indeksleri
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_laundry_items_status ON laundry_items(status)`) } catch(_) {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_laundry_items_room ON laundry_items(room_id)`) } catch(_) {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_laundry_items_updated ON laundry_items(updated_at)`) } catch(_) {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_laundry_queue_position ON laundry_queue(position)`) } catch(_) {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_laundry_history_item ON laundry_history(item_id)`) } catch(_) {}

  return db
}

export function getDB() {
  if (!db) throw new Error('DB not initialized')
  return db
}
