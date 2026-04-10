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

  // Laundry phone_override kolonu (sonradan eklendi)
  try { db.exec(`ALTER TABLE laundry_items ADD COLUMN phone_override TEXT`) } catch(_) {}

  // Laundry timer_started_at kolonu (sonradan eklendi)
  try { db.exec(`ALTER TABLE laundry_machines ADD COLUMN timer_started_at TEXT`) } catch(_) {}
  try { db.exec(`ALTER TABLE laundry_machines ADD COLUMN total_runs INTEGER DEFAULT 0`) } catch(_) {}

  // Performans indeksleri
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_laundry_items_status ON laundry_items(status)`) } catch(_) {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_laundry_items_room ON laundry_items(room_id)`) } catch(_) {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_laundry_items_updated ON laundry_items(updated_at)`) } catch(_) {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_laundry_queue_position ON laundry_queue(position)`) } catch(_) {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_laundry_history_item ON laundry_history(item_id)`) } catch(_) {}

  // ── Laundry v3 — kıyafet detayı + imza ────────────────────────────────────
  try { db.exec(`ALTER TABLE laundry_items ADD COLUMN intake_name TEXT`) } catch(_) {}
  try { db.exec(`ALTER TABLE laundry_items ADD COLUMN intake_signature TEXT`) } catch(_) {}
  try { db.exec(`ALTER TABLE laundry_items ADD COLUMN clothing_items TEXT`) } catch(_) {}

  // ── Laundry v4 — ütü aşaması + intake detay ──────────────────────────────
  try { db.exec(`ALTER TABLE laundry_items ADD COLUMN needs_ironing INTEGER DEFAULT 0`) } catch(_) {}
  try { db.exec(`ALTER TABLE laundry_items ADD COLUMN occupant_signature TEXT`) } catch(_) {}
  try { db.exec(`ALTER TABLE laundry_damages ADD COLUMN at_intake INTEGER DEFAULT 0`) } catch(_) {}

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
  } catch(_) {}

  // ── Laundry v4c — compensation tracking (tazminat) ────────────────────────
  try { db.exec(`ALTER TABLE laundry_items ADD COLUMN compensation_value REAL DEFAULT NULL`) } catch(_) {}
  try { db.exec(`ALTER TABLE laundry_items ADD COLUMN compensation_note TEXT DEFAULT NULL`) } catch(_) {}

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
  )`) } catch(_) {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_laundry_verif_item ON laundry_verifications(item_id)`) } catch(_) {}

  // ── Laundry v6 — SLA WhatsApp bildirimleri ────────────────────────────────
  try { db.exec(`CREATE TABLE IF NOT EXISTS laundry_sla_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES laundry_items(id) ON DELETE CASCADE,
    stage TEXT NOT NULL,
    sent_at TEXT NOT NULL DEFAULT (datetime('now')),
    phone TEXT
  )`) } catch(_) {}
  try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_laundry_sla_notif_dedup ON laundry_sla_notifications(item_id, stage, date(sent_at))`) } catch(_) {}
  try { db.exec(`CREATE TABLE IF NOT EXISTS laundry_global_settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`) } catch(_) {}
  try { db.exec(`ALTER TABLE laundry_sla_config ADD COLUMN whatsapp_notify INTEGER DEFAULT 0`) } catch(_) {}
  try { db.exec(`ALTER TABLE laundry_sla_config ADD COLUMN pre_warning_hours INTEGER DEFAULT 2`) } catch(_) {}
  try { db.exec(`CREATE TABLE IF NOT EXISTS laundry_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL REFERENCES users(id),
    sender_name TEXT NOT NULL,
    message TEXT NOT NULL,
    message_type TEXT NOT NULL DEFAULT 'normal'
      CHECK(message_type IN ('normal','urgent','system')),
    is_pinned INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`) } catch(_) {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_lm_created ON laundry_messages(created_at DESC)`) } catch(_) {}

  // ── Premium block config ──
  try { db.exec(`CREATE TABLE IF NOT EXISTS laundry_block_config (
    block TEXT PRIMARY KEY,
    is_premium INTEGER NOT NULL DEFAULT 0,
    updated_by INTEGER REFERENCES users(id),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`) } catch(_) {}
  try { db.exec(`INSERT OR IGNORE INTO laundry_block_config(block, is_premium) VALUES
    ('A1',1),('A2',1),('A3',1),('A4',1),('G',1),('F',1),
    ('E',1),('D',1),('C',1),('H',1),('J',1),('A',1),('B',1),
    ('M1',0),('M2',0),('M3',0),
    ('M',0),('S',0),('S1',0),('S2',0),('S3',0)`) } catch(_) {}
  // Mevcut non-M/S blokları premium yap (varolan kayıtları güncelle)
  try { db.exec(`UPDATE laundry_block_config SET is_premium=1 WHERE block NOT LIKE 'M%' AND block NOT LIKE 'S%'`) } catch(_) {}
  // Mevcut laundry_items'ı düzelt — non-M/S blok odalarındaki kayıtlar premium olmalı
  try { db.exec(`UPDATE laundry_items SET is_premium=1 WHERE room_id IN (
    SELECT r.id FROM rooms r WHERE r.block NOT LIKE 'M%' AND r.block NOT LIKE 'S%'
  ) AND is_premium=0`) } catch(_) {}
  try { db.exec(`ALTER TABLE laundry_items ADD COLUMN is_premium INTEGER DEFAULT 0`) } catch(_) {}
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
  )`) } catch(_) {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_pg_item ON premium_garments(item_id)`) } catch(_) {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_pg_code ON premium_garments(garment_code)`) } catch(_) {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_pg_status ON premium_garments(status)`) } catch(_) {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_pg_type ON premium_garments(garment_type)`) } catch(_) {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_pg_brand ON premium_garments(brand)`) } catch(_) {}
  try { db.exec(`CREATE TABLE IF NOT EXISTS premium_garment_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    garment_id INTEGER NOT NULL REFERENCES premium_garments(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status TEXT NOT NULL,
    action_by INTEGER REFERENCES users(id),
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`) } catch(_) {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_pgh_garment ON premium_garment_history(garment_id)`) } catch(_) {}
  try { db.exec(`CREATE TABLE IF NOT EXISTS premium_garment_deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    garment_id INTEGER NOT NULL REFERENCES premium_garments(id),
    item_id INTEGER NOT NULL REFERENCES laundry_items(id),
    delivered_to TEXT NOT NULL,
    signature_data TEXT,
    delivered_by INTEGER REFERENCES users(id),
    delivered_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`) } catch(_) {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_pgd_item ON premium_garment_deliveries(item_id)`) } catch(_) {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_li_room_created ON laundry_items(room_id, created_at DESC)`) } catch(_) {}
  try { db.exec(`CREATE TABLE IF NOT EXISTS garment_scan_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER REFERENCES rooms(id),
    block TEXT,
    room_no TEXT,
    garment_id INTEGER REFERENCES premium_garments(id),
    scanned_by INTEGER REFERENCES users(id),
    action TEXT NOT NULL CHECK(action IN ('lookup','advance','deliver','lost')),
    scanned_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`) } catch(_) {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_scan_log_room ON garment_scan_log(room_id, scanned_at DESC)`) } catch(_) {}

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
  } catch(_) {}

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
  } catch(_) {}

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
  } catch(_) {}

  // ── Emergency contact fields ──
  try { db.exec('ALTER TABLE personnel ADD COLUMN emergency_name TEXT') } catch(_) {}
  try { db.exec('ALTER TABLE personnel ADD COLUMN emergency_phone TEXT') } catch(_) {}

  return db
}

export function getDB() {
  if (!db) throw new Error('DB not initialized')
  return db
}
