import Database from 'better-sqlite3'
import { SCHEMA } from './schema.js'

let db

function runMigrations(database) {
  const cols = database.prepare('PRAGMA table_info(personnel)').all().map(c => c.name)
  if (!cols.includes('gender')) {
    try { database.exec("ALTER TABLE personnel ADD COLUMN gender TEXT CHECK(gender IN ('male','female'))") }
    catch(e) { if (!e.message?.includes('duplicate column')) console.error('[Migration] gender:', e.message) }
  }
  if (!cols.includes('department_id')) {
    try { database.exec('ALTER TABLE personnel ADD COLUMN department_id INTEGER REFERENCES departments(id)') }
    catch(e) { if (!e.message?.includes('duplicate column')) console.error('[Migration] department_id:', e.message) }
  }
}

export function initDB() {
  // DB_PATH env ile yapılandırılır.
  // Development default: 'yys.db' (proje kökü)
  // Production: DB_PATH=/var/data/yys.db — kalıcı disk (VPS) veya Render persistent disk
  // /tmp kullanmak VERİ KAYBI yaratır — restart/deploy'da silinir!
  const path = process.env.DB_PATH || 'yys.db'
  db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')
  db.pragma('synchronous = NORMAL')
  db.exec(SCHEMA)
  runMigrations(db)
  // migrations — safe to run on existing DB
  try { db.exec('ALTER TABLE users ADD COLUMN email TEXT') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec('ALTER TABLE rooms ADD COLUMN notes TEXT') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec('ALTER TABLE rooms ADD COLUMN no_clean INTEGER DEFAULT 0') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec('ALTER TABLE personnel ADD COLUMN job_title TEXT') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec('ALTER TABLE cleaning_tasks ADD COLUMN checklist TEXT') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec('ALTER TABLE cleaning_tasks ADD COLUMN skipped INTEGER DEFAULT 0') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec('ALTER TABLE cleaning_tasks ADD COLUMN skip_reason TEXT') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec(`CREATE TABLE IF NOT EXISTS cleaning_staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    phone TEXT,
    assigned_block TEXT,
    assigned_floor INTEGER,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  // maintenance upgrades
  try { db.exec('ALTER TABLE maintenance_requests ADD COLUMN priority TEXT DEFAULT \'medium\'') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec('ALTER TABLE maintenance_requests ADD COLUMN photo_before TEXT') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec('ALTER TABLE maintenance_requests ADD COLUMN assigned_at DATETIME') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec('ALTER TABLE maintenance_requests ADD COLUMN started_at DATETIME') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec('ALTER TABLE maintenance_requests ADD COLUMN review_at DATETIME') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec(`CREATE TABLE IF NOT EXISTS technicians (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    phone TEXT,
    specialty TEXT DEFAULT 'genel',
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec(`CREATE TABLE IF NOT EXISTS maintenance_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER NOT NULL REFERENCES maintenance_requests(id),
    user_id INTEGER REFERENCES users(id),
    technician_id INTEGER REFERENCES technicians(id),
    comment TEXT NOT NULL,
    photo_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }

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
  } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }

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
  } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  // Clean up leftover temp table
  try { db.exec('DROP TABLE IF EXISTS rooms_new') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }

  // maintenance simplification: add wait_reason, shift column, assigned_to
  try { db.exec('ALTER TABLE maintenance_requests ADD COLUMN wait_reason TEXT') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec('ALTER TABLE maintenance_requests ADD COLUMN assigned_to INTEGER REFERENCES technicians(id)') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec("ALTER TABLE technicians ADD COLUMN shift TEXT DEFAULT '1'") } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }

  // Shifts module migrations
  try { db.exec("ALTER TABLE personnel ADD COLUMN gender TEXT CHECK(gender IN ('male','female'))") } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec('ALTER TABLE personnel ADD COLUMN department_id INTEGER REFERENCES departments(id)') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }

  // ── Improvement #3: Audit logging ──
  try { db.exec(`CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    module TEXT NOT NULL,
    target_id INTEGER,
    detail TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }

  // ── Error tracking (frontend + backend production hatası) ──
  try { db.exec(`CREATE TABLE IF NOT EXISTS error_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    severity TEXT DEFAULT 'error',
    message TEXT NOT NULL,
    stack TEXT,
    url TEXT,
    user_id INTEGER REFERENCES users(id),
    user_agent TEXT,
    context TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`) } catch(e) { if (!e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_error_log_created_at ON error_log(created_at DESC)`) } catch { /* ignore */ }

  // ── Bildirim tercihleri (kullanıcı bazında modül kapatma) ──
  try { db.exec(`CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    module TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(user_id, module)
  )`) } catch(e) { if (!e.message?.includes('already exists')) console.error('[Migration]', e.message) }

  // ── Improvement #7: Zimmet return tracking ──
  try { db.exec('ALTER TABLE zimmet ADD COLUMN returned_at DATETIME') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec('ALTER TABLE zimmet ADD COLUMN return_condition TEXT') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }

  // ── Improvement #8: Maintenance SLA ──
  try { db.exec('ALTER TABLE maintenance_requests ADD COLUMN sla_deadline DATETIME') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }

  // phone_number replaces hometown usage in UI
  try { db.exec('ALTER TABLE personnel ADD COLUMN phone_number TEXT') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }

  // ── Checkout module: damage_note on zimmet ──
  try { db.exec('ALTER TABLE zimmet ADD COLUMN damage_note TEXT') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }

  // ── Profile photo ──
  try { db.exec('ALTER TABLE personnel ADD COLUMN photo_url TEXT') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }

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
  } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }

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
  )`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }

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
  )`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }

  try { db.exec(`CREATE TABLE IF NOT EXISTS laundry_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES laundry_items(id) ON DELETE CASCADE,
    machine_id INTEGER REFERENCES laundry_machines(id),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal','urgent')),
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }

  try { db.exec(`CREATE TABLE IF NOT EXISTS laundry_deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES laundry_items(id) ON DELETE CASCADE,
    delivered_to TEXT NOT NULL,
    signature_data TEXT,
    delivered_by INTEGER REFERENCES users(id),
    delivered_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }

  try { db.exec(`CREATE TABLE IF NOT EXISTS laundry_damages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES laundry_items(id) ON DELETE CASCADE,
    photo_url TEXT,
    description TEXT NOT NULL,
    reported_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }

  try { db.exec(`CREATE TABLE IF NOT EXISTS laundry_sla_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stage TEXT NOT NULL UNIQUE CHECK(stage IN ('dirty','washing','ready')),
    warning_hours REAL NOT NULL DEFAULT 24,
    critical_hours REAL NOT NULL DEFAULT 48,
    updated_by INTEGER REFERENCES users(id),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }

  try { db.exec(`CREATE TABLE IF NOT EXISTS laundry_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES laundry_items(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status TEXT NOT NULL,
    action_by INTEGER REFERENCES users(id),
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }

  // SLA varsayılan konfigürasyon
  try { db.exec(`INSERT OR IGNORE INTO laundry_sla_config(stage,warning_hours,critical_hours) VALUES
    ('dirty',24,48),('washing',1,2),('ready',24,48)`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }

  // Varsayılan makineler (ilk kurulumda seed)
  try {
    const mCount = db.prepare('SELECT COUNT(*) as c FROM laundry_machines').get()
    if (mCount.c === 0) {
      db.exec(`INSERT INTO laundry_machines(name,type,capacity_kg) VALUES
        ('Makine 1','washer',10),('Makine 2','washer',10),('Makine 3','washer',8),('Kurutucu 1','dryer',10)`)
    }
  } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }

  // Laundry phone_override kolonu (sonradan eklendi)
  try { db.exec(`ALTER TABLE laundry_items ADD COLUMN phone_override TEXT`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }

  // Laundry timer_started_at kolonu (sonradan eklendi)
  try { db.exec(`ALTER TABLE laundry_machines ADD COLUMN timer_started_at TEXT`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec(`ALTER TABLE laundry_machines ADD COLUMN total_runs INTEGER DEFAULT 0`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }

  // Performans indeksleri
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_laundry_items_status ON laundry_items(status)`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_laundry_items_room ON laundry_items(room_id)`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_laundry_items_updated ON laundry_items(updated_at)`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_laundry_queue_position ON laundry_queue(position)`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_laundry_history_item ON laundry_history(item_id)`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }

  // ── Laundry v3 — kıyafet detayı + imza ────────────────────────────────────
  try { db.exec(`ALTER TABLE laundry_items ADD COLUMN intake_name TEXT`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec(`ALTER TABLE laundry_items ADD COLUMN intake_signature TEXT`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec(`ALTER TABLE laundry_items ADD COLUMN clothing_items TEXT`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }

  // ── Laundry v4 — ütü aşaması + intake detay ──────────────────────────────
  try { db.exec(`ALTER TABLE laundry_items ADD COLUMN needs_ironing INTEGER DEFAULT 0`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec(`ALTER TABLE laundry_items ADD COLUMN occupant_signature TEXT`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec(`ALTER TABLE laundry_damages ADD COLUMN at_intake INTEGER DEFAULT 0`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }

  // ── Laundry v4b — status CHECK constraint'e 'ironing' ekle ───────────────
  // SQLite'ta constraint değiştirmek için tabloyu yeniden oluştur
  try {
    const hasIroning = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='laundry_items'"
    ).get()
    if (hasIroning && !hasIroning.sql.includes("'ironing'")) {
      db.pragma('foreign_keys = OFF')
      const migrate = db.transaction(() => {
        db.exec(`CREATE TABLE laundry_items_v4b (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          room_id INTEGER REFERENCES rooms(id),
          status TEXT NOT NULL DEFAULT 'dirty' CHECK(status IN ('dirty','washing','ironing','ready','delivered','lost')),
          machine_id INTEGER REFERENCES laundry_machines(id),
          urgent INTEGER NOT NULL DEFAULT 0,
          item_count INTEGER NOT NULL DEFAULT 1,
          item_details TEXT,
          shelf_location TEXT,
          photo_url TEXT,
          notes TEXT,
          phone_override TEXT,
          intake_name TEXT,
          intake_signature TEXT,
          clothing_items TEXT,
          needs_ironing INTEGER DEFAULT 0,
          occupant_signature TEXT,
          created_by INTEGER REFERENCES users(id),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`)
        db.exec(`INSERT INTO laundry_items_v4b
          SELECT id, room_id, status, machine_id, urgent, item_count, item_details, shelf_location,
                 photo_url, notes, phone_override, intake_name, intake_signature, clothing_items,
                 needs_ironing, occupant_signature, created_by, created_at, updated_at
          FROM laundry_items`)
        db.exec(`DROP TABLE laundry_items`)
        db.exec(`ALTER TABLE laundry_items_v4b RENAME TO laundry_items`)
      })
      migrate()
      db.pragma('foreign_keys = ON')
    }
  } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }

  // ── Laundry v4c — compensation tracking (tazminat) ────────────────────────
  try { db.exec(`ALTER TABLE laundry_items ADD COLUMN compensation_value REAL DEFAULT NULL`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec(`ALTER TABLE laundry_items ADD COLUMN compensation_note TEXT DEFAULT NULL`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }

  // ── Laundry v5 — parça doğrulama ─────────────────────────────────────────
  try { db.exec(`CREATE TABLE IF NOT EXISTS laundry_verifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES laundry_items(id) ON DELETE CASCADE,
    stage TEXT NOT NULL CHECK(stage IN ('washing_to_ready','ironing_to_ready','delivery')),
    verified_by TEXT NOT NULL,
    verified_at TEXT NOT NULL DEFAULT (datetime('now')),
    items_json TEXT NOT NULL,
    missing_notes TEXT,
    all_present INTEGER NOT NULL DEFAULT 1,
    UNIQUE(item_id, stage)
  )`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_laundry_verif_item ON laundry_verifications(item_id)`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }

  // ── Laundry v6 — SLA WhatsApp bildirimleri ────────────────────────────────
  try { db.exec(`CREATE TABLE IF NOT EXISTS laundry_sla_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES laundry_items(id) ON DELETE CASCADE,
    stage TEXT NOT NULL,
    sent_at TEXT NOT NULL DEFAULT (datetime('now')),
    phone TEXT
  )`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_laundry_sla_notif_dedup ON laundry_sla_notifications(item_id, stage, date(sent_at))`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec(`CREATE TABLE IF NOT EXISTS laundry_global_settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec(`ALTER TABLE laundry_sla_config ADD COLUMN whatsapp_notify INTEGER DEFAULT 0`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec(`ALTER TABLE laundry_sla_config ADD COLUMN pre_warning_hours INTEGER DEFAULT 2`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec(`CREATE TABLE IF NOT EXISTS laundry_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL REFERENCES users(id),
    sender_name TEXT NOT NULL,
    message TEXT NOT NULL,
    message_type TEXT NOT NULL DEFAULT 'normal'
      CHECK(message_type IN ('normal','urgent','system')),
    is_pinned INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_lm_created ON laundry_messages(created_at DESC)`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }

  // ── Premium block config ──
  try { db.exec(`CREATE TABLE IF NOT EXISTS laundry_block_config (
    block TEXT PRIMARY KEY,
    is_premium INTEGER NOT NULL DEFAULT 0,
    updated_by INTEGER REFERENCES users(id),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec(`INSERT OR IGNORE INTO laundry_block_config(block, is_premium) VALUES
    ('A1',1),('A2',1),('A3',1),('A4',1),('G',1),('F',1),
    ('E',1),('D',1),('C',1),('H',1),('J',1),('A',1),('B',1),
    ('M1',0),('M2',0),('M3',0),
    ('M',0),('S',0),('S1',0),('S2',0),('S3',0)`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  // Mevcut non-M/S blokları premium yap (varolan kayıtları güncelle)
  try { db.exec(`UPDATE laundry_block_config SET is_premium=1 WHERE block NOT LIKE 'M%' AND block NOT LIKE 'S%'`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec(`ALTER TABLE laundry_items ADD COLUMN is_premium INTEGER DEFAULT 0`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  // Mevcut laundry_items'ı düzelt — non-M/S blok odalarındaki kayıtlar premium olmalı
  try { db.exec(`UPDATE laundry_items SET is_premium=1 WHERE room_id IN (
    SELECT r.id FROM rooms r WHERE r.block NOT LIKE 'M%' AND r.block NOT LIKE 'S%'
  ) AND is_premium=0`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec(`CREATE TABLE IF NOT EXISTS premium_garments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES laundry_items(id) ON DELETE CASCADE,
    garment_code TEXT NOT NULL UNIQUE,
    garment_type TEXT NOT NULL,
    brand TEXT,
    model TEXT,
    size TEXT,
    color TEXT,
    pattern TEXT,
    condition_notes TEXT,
    status TEXT NOT NULL DEFAULT 'received'
      CHECK(status IN ('received','ironing','ready','delivered','lost')),
    ironed_by INTEGER REFERENCES users(id),
    ironed_at TEXT,
    delivered_to TEXT,
    delivered_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_pg_item ON premium_garments(item_id)`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_pg_code ON premium_garments(garment_code)`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_pg_status ON premium_garments(status)`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_pg_type ON premium_garments(garment_type)`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_pg_brand ON premium_garments(brand)`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec(`CREATE TABLE IF NOT EXISTS premium_garment_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    garment_id INTEGER NOT NULL REFERENCES premium_garments(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status TEXT NOT NULL,
    action_by INTEGER REFERENCES users(id),
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_pgh_garment ON premium_garment_history(garment_id)`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec(`CREATE TABLE IF NOT EXISTS premium_garment_deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    garment_id INTEGER NOT NULL REFERENCES premium_garments(id),
    item_id INTEGER NOT NULL REFERENCES laundry_items(id),
    delivered_to TEXT NOT NULL,
    signature_data TEXT,
    delivered_by INTEGER REFERENCES users(id),
    delivered_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_pgd_item ON premium_garment_deliveries(item_id)`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_li_room_created ON laundry_items(room_id, created_at DESC)`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec(`CREATE TABLE IF NOT EXISTS garment_scan_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER REFERENCES rooms(id),
    block TEXT,
    room_no TEXT,
    garment_id INTEGER REFERENCES premium_garments(id),
    scanned_by INTEGER REFERENCES users(id),
    action TEXT NOT NULL CHECK(action IN ('lookup','advance','deliver','lost')),
    scanned_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_scan_log_room ON garment_scan_log(room_id, scanned_at DESC)`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }

  // laundry_supplies
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS laundry_supplies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        unit TEXT NOT NULL DEFAULT 'kg',
        current_stock REAL NOT NULL DEFAULT 0,
        warning_threshold REAL NOT NULL DEFAULT 0,
        critical_threshold REAL NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `)
  } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }

  // laundry_machine_supplies
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS laundry_machine_supplies (
        machine_id INTEGER NOT NULL REFERENCES laundry_machines(id) ON DELETE CASCADE,
        supply_id  INTEGER NOT NULL REFERENCES laundry_supplies(id) ON DELETE CASCADE,
        per_wash_amount REAL NOT NULL DEFAULT 0.1,
        PRIMARY KEY (machine_id, supply_id)
      )
    `)
  } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }

  // laundry_supply_log
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS laundry_supply_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supply_id  INTEGER NOT NULL REFERENCES laundry_supplies(id),
        delta      REAL NOT NULL,
        reason     TEXT NOT NULL,
        item_id    INTEGER,
        machine_id INTEGER,
        note       TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TEXT DEFAULT (datetime('now'))
      )
    `)
  } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }

  // ── Emergency contact fields ──
  try { db.exec('ALTER TABLE personnel ADD COLUMN emergency_name TEXT') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }
  try { db.exec('ALTER TABLE personnel ADD COLUMN emergency_phone TEXT') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }

  // ── Kiosk PIN sistemi ──────────────────────────────────────────────────────
  try { db.exec('ALTER TABLE personnel ADD COLUMN kiosk_pin TEXT') } catch(e) {
    if (!e.message?.includes('duplicate column')) console.error('[Migration] kiosk_pin:', e.message)
  }

  // ── Bildirim deduplication ─────────────────────────────────────────────────
  try { db.exec('ALTER TABLE notifications ADD COLUMN dedup_key TEXT') } catch(e) {
    if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists'))
      console.error('[Migration] dedup_key:', e.message)
  }
  try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_dedup ON notifications(dedup_key) WHERE dedup_key IS NOT NULL') } catch(e) {
    if (!e.message?.includes('already exists')) console.error('[Migration] idx_notif_dedup:', e.message)
  }

  // ── CASCADE DELETE: room_assignments + notifications ──────────────────────
  try {
    const raSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='room_assignments'").get()
    if (raSql && !raSql.sql.includes('ON DELETE CASCADE')) {
      db.exec('PRAGMA foreign_keys=OFF')
      db.transaction(() => {
        db.exec(`CREATE TABLE IF NOT EXISTS room_assignments_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          personnel_id INTEGER NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
          room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
          bed_no INTEGER NOT NULL,
          assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          check_out_at DATETIME,
          assigned_by INTEGER REFERENCES users(id)
        )`)
        db.exec(`INSERT INTO room_assignments_new SELECT * FROM room_assignments`)
        db.exec(`DROP TABLE room_assignments`)
        db.exec(`ALTER TABLE room_assignments_new RENAME TO room_assignments`)
        db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_active_assignment ON room_assignments(personnel_id) WHERE check_out_at IS NULL`)
        db.exec(`CREATE INDEX IF NOT EXISTS idx_room_assignments_room ON room_assignments(room_id)`)
        db.exec(`CREATE TRIGGER IF NOT EXISTS block_quarantine_assignment
          BEFORE INSERT ON room_assignments
          BEGIN
            SELECT RAISE(ABORT,'Bu oda karantinada — atama yapılamaz')
            WHERE (SELECT status FROM rooms WHERE id=NEW.room_id) = 'quarantine';
          END`)
      })()
      db.exec('PRAGMA foreign_keys=ON')
    }
  } catch(e) { if (!e.message?.includes('already exists')) console.error('[Migration] room_assignments cascade:', e.message) }

  try {
    const notifSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='notifications'").get()
    if (notifSql && !notifSql.sql.includes('ON DELETE CASCADE')) {
      db.exec('PRAGMA foreign_keys=OFF')
      db.transaction(() => {
        db.exec(`CREATE TABLE IF NOT EXISTS notifications_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          target_role TEXT,
          target_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          message TEXT NOT NULL,
          type TEXT DEFAULT 'info' CHECK(type IN ('info','warning','critical')),
          module TEXT,
          is_read INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          dedup_key TEXT
        )`)
        db.exec(`INSERT INTO notifications_new SELECT * FROM notifications`)
        db.exec(`DROP TABLE notifications`)
        db.exec(`ALTER TABLE notifications_new RENAME TO notifications`)
        db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_dedup ON notifications(dedup_key) WHERE dedup_key IS NOT NULL`)
        db.exec(`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(target_user_id, is_read, created_at)`)
      })()
      db.exec('PRAGMA foreign_keys=ON')
    }
  } catch(e) { if (!e.message?.includes('already exists')) console.error('[Migration] notifications cascade:', e.message) }

  // ── A→Z Bildirim Faz 1: event_kind, severity, link, entity ─────────────────
  for (const col of [
    "ALTER TABLE notifications ADD COLUMN event_kind TEXT",
    "ALTER TABLE notifications ADD COLUMN severity TEXT",
    "ALTER TABLE notifications ADD COLUMN entity_type TEXT",
    "ALTER TABLE notifications ADD COLUMN entity_id INTEGER",
    "ALTER TABLE notifications ADD COLUMN link TEXT",
  ]) {
    try { db.exec(col) } catch (e) {
      if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists'))
        console.error('[Migration]', col, e.message)
    }
  }
  // severity backfill — eski 'type' kolonundan kopyala
  try { db.exec("UPDATE notifications SET severity = type WHERE severity IS NULL") } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_notif_role_created ON notifications(target_role, created_at)") } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_notif_module_severity ON notifications(module, severity)") } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_notif_event_kind ON notifications(event_kind)") } catch {}

  // ── A→Z Bildirim Faz 5: tercih v2 + sessiz saatler ─────────────────────────
  try { db.exec(`CREATE TABLE IF NOT EXISTS notification_preferences_v2 (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    module TEXT NOT NULL,
    channel TEXT NOT NULL CHECK(channel IN ('in_app','desktop','push','whatsapp')),
    enabled INTEGER NOT NULL DEFAULT 1,
    min_severity TEXT NOT NULL DEFAULT 'info' CHECK(min_severity IN ('info','warning','critical')),
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(user_id, module, channel)
  )`) } catch(e) { if (!e.message?.includes('already exists')) console.error('[Migration] notif_prefs_v2:', e.message) }

  try { db.exec(`CREATE TABLE IF NOT EXISTS notification_quiet_hours (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    start_minute INTEGER NOT NULL DEFAULT 0,
    end_minute   INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 0,
    allow_critical INTEGER NOT NULL DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`) } catch(e) { if (!e.message?.includes('already exists')) console.error('[Migration] notif_quiet:', e.message) }

  // ── Faz 1 migrations ──────────────────────────────────────────────────────
  try { db.exec('ALTER TABLE personnel ADD COLUMN expected_departure TEXT') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] personnel.expected_departure:', e.message) }
  try { db.exec('ALTER TABLE maintenance_requests ADD COLUMN reporter_personnel_id INTEGER REFERENCES personnel(id)') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] maintenance_requests.reporter_personnel_id:', e.message) }
  try { db.exec(`CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT
)`) } catch(e) { if (!e.message?.includes('already exists')) console.error('[Migration] announcements:', e.message) }
  try { db.exec(`CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  personnel_id INTEGER REFERENCES personnel(id),
  type TEXT NOT NULL CHECK(type IN ('complaint','suggestion','other')),
  message TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
)`) } catch(e) { if (!e.message?.includes('already exists')) console.error('[Migration] feedback:', e.message) }
  try { db.exec(`CREATE TABLE IF NOT EXISTS email_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sent_at TEXT DEFAULT (datetime('now')),
  recipients TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('success','error')),
  error_msg TEXT
)`) } catch(e) { if (!e.message?.includes('already exists')) console.error('[Migration] email_log:', e.message) }

  try { db.exec(`CREATE TABLE IF NOT EXISTS avs_workers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name  TEXT NOT NULL,
  role_label TEXT,
  kiosk_pin  TEXT,
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
)`) } catch(e) { console.error('[Migration] avs_workers:', e.message) }

  try { db.exec('ALTER TABLE personnel ADD COLUMN is_placeholder INTEGER DEFAULT 0') }
    catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration]', e.message) }

  // ── Laundry v5 — pending_collection statüsü + torba takip ─────────────────
  try {
    const v5ColCheck = db.prepare("SELECT COUNT(*) as c FROM pragma_table_info('laundry_items') WHERE name='bag_no'").get()
    if (v5ColCheck.c === 0) {
      db.pragma('foreign_keys = OFF')
      const migrateV5 = db.transaction(() => {
        db.exec(`CREATE TABLE laundry_items_v5 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          room_id INTEGER REFERENCES rooms(id),
          status TEXT NOT NULL DEFAULT 'dirty' CHECK(status IN ('pending_collection','dirty','washing','ironing','ready','delivered','lost')),
          machine_id INTEGER REFERENCES laundry_machines(id),
          urgent INTEGER NOT NULL DEFAULT 0,
          item_count INTEGER NOT NULL DEFAULT 1,
          item_details TEXT,
          shelf_location TEXT,
          photo_url TEXT,
          notes TEXT,
          phone_override TEXT,
          intake_name TEXT,
          intake_signature TEXT,
          clothing_items TEXT,
          needs_ironing INTEGER DEFAULT 0,
          occupant_signature TEXT,
          compensation_value REAL DEFAULT NULL,
          compensation_note TEXT DEFAULT NULL,
          is_premium INTEGER DEFAULT 0,
          bag_no TEXT UNIQUE,
          collected_by INTEGER REFERENCES avs_workers(id),
          collected_at INTEGER,
          created_by INTEGER REFERENCES users(id),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`)
        db.exec(`INSERT INTO laundry_items_v5(
          id, room_id, status, machine_id, urgent, item_count, item_details,
          shelf_location, photo_url, notes, phone_override, intake_name,
          intake_signature, clothing_items, needs_ironing, occupant_signature,
          compensation_value, compensation_note, is_premium,
          created_by, created_at, updated_at
        )
        SELECT
          id, room_id, status, machine_id, urgent, item_count, item_details,
          shelf_location, photo_url, notes, phone_override, intake_name,
          intake_signature, clothing_items, needs_ironing, occupant_signature,
          compensation_value, compensation_note, is_premium,
          created_by, created_at, updated_at
        FROM laundry_items`)
        db.exec(`DROP TABLE laundry_items`)
        db.exec(`ALTER TABLE laundry_items_v5 RENAME TO laundry_items`)
        // İndeksleri yeniden oluştur
        db.exec(`CREATE INDEX IF NOT EXISTS idx_laundry_items_status ON laundry_items(status)`)
        db.exec(`CREATE INDEX IF NOT EXISTS idx_laundry_items_room ON laundry_items(room_id)`)
        db.exec(`CREATE INDEX IF NOT EXISTS idx_laundry_items_updated ON laundry_items(updated_at)`)
        db.exec(`CREATE INDEX IF NOT EXISTS idx_li_room_created ON laundry_items(room_id, created_at DESC)`)
      })
      migrateV5()
      db.pragma('foreign_keys = ON')
    }
  } catch(e) {
    db.pragma('foreign_keys = ON')
    if (!e.message?.includes('already exists')) console.error('[Migration] laundry_v5:', e.message)
  }

  // ── Laundry v7 — kıyafet tip kataloğu ────────────────────────────────────
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS laundry_garment_types (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      emoji      TEXT,
      image_url  TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active  INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
  } catch(e) { if (!e.message?.includes('already exists')) console.error('[Migration] garment_types:', e.message) }

  try {
    const gtCount = db.prepare('SELECT COUNT(*) as c FROM laundry_garment_types').get()
    if (gtCount.c === 0) {
      db.exec(`INSERT INTO laundry_garment_types(name, emoji, sort_order) VALUES
        ('Gömlek',      '👔', 1),
        ('Pantolon',    '👖', 2),
        ('Tişört',      '👕', 3),
        ('Kazak',       '🧣', 4),
        ('Mont',        '🧥', 5),
        ('Elbise',      '👗', 6),
        ('İç Çamaşır',  '🩲', 7),
        ('Çorap',       '🧦', 8),
        ('Şort',        '🩳', 9),
        ('Pijama',      '🌙', 10),
        ('Havlu',       '🧺', 11),
        ('Takım Elbise','🤵', 12)`)
    }
  } catch(e) { if (!e.message?.includes('already exists')) console.error('[Migration] garment_types seed:', e.message) }

  // ── Laundry v8 — garments_json kolonu ────────────────────────────────────
  try { db.exec(`ALTER TABLE laundry_items ADD COLUMN garments_json TEXT`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] garments_json:', e.message) }

  // ── Laundry v9 — deliver tracking kolonları ──────────────────────────────
  try { db.exec(`ALTER TABLE laundry_items ADD COLUMN delivered_name TEXT`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] delivered_name:', e.message) }
  try { db.exec(`ALTER TABLE laundry_items ADD COLUMN file_count INTEGER DEFAULT NULL`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] file_count:', e.message) }

  // ── Audit — personnel.created_by ─────────────────────────────────────────
  try { db.exec('ALTER TABLE personnel ADD COLUMN created_by INTEGER REFERENCES users(id)') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] personnel.created_by:', e.message) }

  // ── PIN lockout koruması ──────────────────────────────────────────────────
  try { db.exec('ALTER TABLE personnel ADD COLUMN pin_attempts INTEGER DEFAULT 0') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] pin_attempts:', e.message) }
  try { db.exec('ALTER TABLE personnel ADD COLUMN pin_locked_until TEXT') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] pin_locked_until:', e.message) }
  try { db.exec('ALTER TABLE avs_workers ADD COLUMN pin_attempts INTEGER DEFAULT 0') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] avs_workers.pin_attempts:', e.message) }
  try { db.exec('ALTER TABLE avs_workers ADD COLUMN pin_locked_until TEXT') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] avs_workers.pin_locked_until:', e.message) }

  // ── Mobile PIN auth ───────────────────────────────────────────────────────
  try { db.exec('ALTER TABLE users ADD COLUMN mobile_pin TEXT') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] mobile_pin:', e.message) }

  // ── WebAuthn / Biometric auth ─────────────────────────────────────────────
  try { db.exec('ALTER TABLE users ADD COLUMN webauthn_credential_id TEXT') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] webauthn_credential_id:', e.message) }
  try { db.exec('ALTER TABLE users ADD COLUMN webauthn_public_key TEXT') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] webauthn_public_key:', e.message) }
  try { db.exec('ALTER TABLE users ADD COLUMN webauthn_counter INTEGER DEFAULT 0') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] webauthn_counter:', e.message) }
  try { db.exec('ALTER TABLE users ADD COLUMN webauthn_challenge TEXT') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] webauthn_challenge:', e.message) }

  // ── Performans index'leri ─────────────────────────────────────────────────
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_maintenance_status ON maintenance_requests(status)') } catch(e) { if (!e.message?.includes('already exists')) console.error('[Migration] idx_maintenance_status:', e.message) }
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_maintenance_opened ON maintenance_requests(opened_at DESC)') } catch(e) { if (!e.message?.includes('already exists')) console.error('[Migration] idx_maintenance_opened:', e.message) }
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_discipline_personnel ON discipline_records(personnel_id, created_at DESC)') } catch(e) { if (!e.message?.includes('already exists')) console.error('[Migration] idx_discipline_personnel:', e.message) }
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_personnel_checkout ON personnel(check_out_date)') } catch(e) { if (!e.message?.includes('already exists')) console.error('[Migration] idx_personnel_checkout:', e.message) }
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_personnel_company ON personnel(company)') } catch(e) { if (!e.message?.includes('already exists')) console.error('[Migration] idx_personnel_company:', e.message) }
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_personnel_blacklist ON personnel(is_blacklisted, discipline_points)') } catch(e) { if (!e.message?.includes('already exists')) console.error('[Migration] idx_personnel_blacklist:', e.message) }
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_audit_module ON audit_log(module, target_id)') } catch(e) { if (!e.message?.includes('already exists')) console.error('[Migration] idx_audit_module:', e.message) }
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC)') } catch(e) { if (!e.message?.includes('already exists')) console.error('[Migration] idx_audit_created:', e.message) }
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_scheduled ON cleaning_tasks(scheduled_at, skipped)') } catch(e) { if (!e.message?.includes('already exists')) console.error('[Migration] idx_cleaning_tasks_scheduled:', e.message) }
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory(category)') } catch(e) { if (!e.message?.includes('already exists')) console.error('[Migration] idx_inventory_category:', e.message) }

  // ── Envanter Genisletme F2: kolon ve tablo migration'lari ──
  // inventory yeni kolonlari
  try { db.exec('ALTER TABLE inventory ADD COLUMN sku TEXT') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] inventory.sku:', e.message) }
  try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_sku ON inventory(sku) WHERE sku IS NOT NULL') } catch(e) { if (!e.message?.includes('already exists')) console.error('[Migration] idx_inventory_sku:', e.message) }
  try { db.exec('ALTER TABLE inventory ADD COLUMN photo_url TEXT') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] inventory.photo_url:', e.message) }
  try { db.exec('ALTER TABLE inventory ADD COLUMN preferred_supplier_id INTEGER REFERENCES suppliers(id)') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] inventory.preferred_supplier_id:', e.message) }
  try { db.exec('ALTER TABLE inventory ADD COLUMN lead_time_days INTEGER DEFAULT 7') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] inventory.lead_time_days:', e.message) }
  try { db.exec('ALTER TABLE inventory ADD COLUMN safety_stock_days INTEGER DEFAULT 3') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] inventory.safety_stock_days:', e.message) }
  try { db.exec('ALTER TABLE inventory ADD COLUMN track_lots INTEGER DEFAULT 0') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] inventory.track_lots:', e.message) }
  try { db.exec('ALTER TABLE inventory ADD COLUMN track_expiry INTEGER DEFAULT 0') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] inventory.track_expiry:', e.message) }
  try { db.exec('ALTER TABLE inventory ADD COLUMN track_locations INTEGER DEFAULT 0') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] inventory.track_locations:', e.message) }

  // inventory_checkouts.request_id
  try { db.exec('ALTER TABLE inventory_checkouts ADD COLUMN request_id INTEGER REFERENCES inventory_requests(id)') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] inventory_checkouts.request_id:', e.message) }

  // goods_receipts.supplier_id + data migration (eski supplier string -> suppliers tablosu)
  try {
    const grCols = db.prepare('PRAGMA table_info(goods_receipts)').all().map(c => c.name)
    if (!grCols.includes('supplier_id')) {
      db.exec('ALTER TABLE goods_receipts ADD COLUMN supplier_id INTEGER REFERENCES suppliers(id)')
      const distinctSuppliers = db.prepare("SELECT DISTINCT supplier FROM goods_receipts WHERE supplier IS NOT NULL AND supplier != ''").all()
      const insertSupplier = db.prepare("INSERT OR IGNORE INTO suppliers(name) VALUES(?)")
      const updateReceipt = db.prepare("UPDATE goods_receipts SET supplier_id = (SELECT id FROM suppliers WHERE name = ?) WHERE supplier = ? AND supplier_id IS NULL")
      db.transaction(() => {
        for (const s of distinctSuppliers) {
          insertSupplier.run(s.supplier)
          updateReceipt.run(s.supplier, s.supplier)
        }
      })()
    }
  } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] goods_receipts.supplier_id:', e.message) }

  // stock_movements rebuild — yeni CHECK enum (damage/loss/transfer/po_receive/request_fulfill) + lot_id + from/to_location_id
  try {
    const smCols = db.prepare('PRAGMA table_info(stock_movements)').all().map(c => c.name)
    if (!smCols.includes('lot_id')) {
      db.exec('PRAGMA foreign_keys=OFF')
      db.transaction(() => {
        db.exec('DROP TABLE IF EXISTS stock_movements_new')
        db.exec(`
          CREATE TABLE stock_movements_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_id INTEGER NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
            type TEXT NOT NULL CHECK(type IN ('in','out','count','initial','damage','loss','transfer','po_receive','request_fulfill')),
            delta REAL NOT NULL,
            quantity_after REAL NOT NULL,
            reason TEXT,
            lot_id INTEGER REFERENCES inventory_lots(id),
            from_location_id INTEGER REFERENCES inventory_locations(id),
            to_location_id INTEGER REFERENCES inventory_locations(id),
            created_by INTEGER NOT NULL REFERENCES users(id),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `)
        db.exec(`
          INSERT INTO stock_movements_new(id, item_id, type, delta, quantity_after, reason, created_by, created_at)
          SELECT id, item_id, type, delta, quantity_after, reason, created_by, created_at FROM stock_movements
        `)
        db.exec('DROP TABLE stock_movements')
        db.exec('ALTER TABLE stock_movements_new RENAME TO stock_movements')
        db.exec('CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(item_id, created_at DESC)')
      })()
      db.exec('PRAGMA foreign_keys=ON')
    }
  } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] stock_movements rebuild:', e.message) }
  try { db.exec('DROP TABLE IF EXISTS stock_movements_new') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] stock_movements_new cleanup:', e.message) }

  // ── Faz 6: Mobile PIN per-user lockout (Y9) ──
  try { db.exec('ALTER TABLE users ADD COLUMN pin_attempts INTEGER DEFAULT 0') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] users.pin_attempts:', e.message) }
  try { db.exec('ALTER TABLE users ADD COLUMN pin_locked_until DATETIME') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] users.pin_locked_until:', e.message) }

  // ── Faz 6: Laundry status changes — accountability (K3) ──
  try { db.exec('ALTER TABLE laundry_items ADD COLUMN last_modified_worker_id INTEGER') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] laundry_items.last_modified_worker_id:', e.message) }
  try { db.exec('ALTER TABLE laundry_items ADD COLUMN last_modified_at DATETIME') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] laundry_items.last_modified_at:', e.message) }

  // ── Faz 8: Performans index'leri (audit Perf #1, #6, #7) ──
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_personnel_fullname ON personnel(full_name)') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] idx_personnel_fullname:', e.message) }
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id, created_at DESC)') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] idx_audit_user:', e.message) }
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_notif_role ON notifications(target_role, is_read, created_at)') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] idx_notif_role:', e.message) }

  // ── Mobile M22: technician ↔ user link (assigned_to=me filter icin) ──
  try { db.exec('ALTER TABLE technicians ADD COLUMN user_id INTEGER REFERENCES users(id)') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] technicians.user_id:', e.message) }
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_technicians_user ON technicians(user_id) WHERE user_id IS NOT NULL') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] idx_technicians_user:', e.message) }

  // ── Mobile M10: Web Push subscriptions ──
  try { db.exec(`CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh_key TEXT NOT NULL,
    auth_key TEXT NOT NULL,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] push_subscriptions:', e.message) }
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id)') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] idx_push_user:', e.message) }

  // ── Mobile M11: WhatsApp outbound — users.phone + outbound log ──
  try { db.exec('ALTER TABLE users ADD COLUMN phone TEXT') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] users.phone:', e.message) }
  try { db.exec(`CREATE TABLE IF NOT EXISTS whatsapp_outbound_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    to_phone TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL,
    error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`) } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] whatsapp_outbound_log:', e.message) }
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_wa_outbound_status ON whatsapp_outbound_log(status, created_at DESC)') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] idx_wa_outbound_status:', e.message) }

  // ── 2FA TOTP ──
  try { db.exec('ALTER TABLE users ADD COLUMN totp_secret TEXT') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] totp_secret:', e.message) }
  try { db.exec('ALTER TABLE users ADD COLUMN totp_enabled INTEGER DEFAULT 0') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] totp_enabled:', e.message) }

  // ── Firma / Sozlesme yonetimi ──
  try { db.exec(`CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    contact_name TEXT,
    contact_phone TEXT,
    contact_email TEXT,
    tax_no TEXT,
    contract_start TEXT,
    contract_end TEXT,
    bed_quota INTEGER,
    price_per_bed REAL,
    notes TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`) } catch(e) { if (!e.message?.includes('already exists')) console.error('[Migration] companies:', e.message) }
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_companies_active ON companies(is_active, contract_end)') } catch(e) { if (!e.message?.includes('already exists')) console.error('[Migration] idx_companies:', e.message) }
  try { db.exec('ALTER TABLE personnel ADD COLUMN company_id INTEGER REFERENCES companies(id)') } catch(e) { if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) console.error('[Migration] personnel.company_id:', e.message) }

  return db
}

export function getDB() {
  if (!db) throw new Error('DB not initialized')
  return db
}
