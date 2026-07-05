// T2 — Hafif versiyonlu migration runner (better-sqlite3, framework'süz).
//
// Neden: mevcut try/catch ALTER TABLE blokları hata durumunda sessizce skip
// ediyor (2026-05-18'de index/trigger'lar oluşmadan uygulama ayağa kalktı).
// Bu runner: her migration bir kez çalışır (schema_migrations kaydı),
// başarısız olan YÜKSEK SESLE loglanır, kaydedilmez (sonraki boot'ta yeniden
// denenir) ve durumu /api/health üzerinden görünür.
//
// Yeni şema değişikliği eklerken: MIGRATIONS dizisinin SONUNA yeni bir
// { name, up } ekle. name benzersiz ve sıralı prefix'li olmalı (örn. '003-...').
// Mevcut kayıtların adını/sırasını asla değiştirme.

export const MIGRATIONS = [
  {
    name: '001-idx-leave-requests-status',
    up(db) {
      db.exec('CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status)')
    },
  },
  {
    name: '002-idx-attendance-open-logs',
    up(db) {
      // QR clock-out açık kayıt araması (D1) — staff_id + açık kayıt taraması
      db.exec('CREATE INDEX IF NOT EXISTS idx_attendance_open ON attendance_logs(staff_id, check_out_at)')
    },
  },
  {
    name: '003-shift-schedule-off-status',
    up(db) {
      // Haftalık izin (OFF) ayrı bir durum — 'on_leave' gerçek izin talepleri için kalır.
      // SQLite CHECK constraint değiştirilemez → tablo yeniden kurulur.
      const ddl = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='shift_schedule'").get()?.sql || ''
      if (!ddl.includes("'off'")) {
        db.pragma('foreign_keys = OFF')
        db.exec(`
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
        `)
        db.pragma('foreign_keys = ON')
      }
      // Veri düzeltme: WeekFill/CellAssign'ın ürettiği "haftalık izin" kayıtları
      // (on_leave + vardiya yok + kapsayan onaylı izin talebi yok) → off
      db.exec(`
        UPDATE shift_schedule SET status = 'off'
        WHERE status = 'on_leave' AND shift_def_id IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM leave_requests lr
            WHERE lr.staff_id = shift_schedule.staff_id
              AND lr.status = 'approved'
              AND lr.start_date <= shift_schedule.work_date
              AND lr.end_date >= shift_schedule.work_date
          )
      `)
    },
  },
]

// Son çalıştırmanın hata durumu — /api/health raporlar
let lastErrors = []

export function runVersionedMigrations(db, migrations = MIGRATIONS) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)

  const applied = new Set(db.prepare('SELECT name FROM schema_migrations').all().map(r => r.name))
  const errors = []
  let ran = 0

  for (const m of migrations) {
    if (applied.has(m.name)) continue
    try {
      const tx = db.transaction(() => {
        m.up(db)
        db.prepare('INSERT INTO schema_migrations(name) VALUES(?)').run(m.name)
      })
      tx()
      ran += 1
      console.log(`[Migration] uygulandı: ${m.name}`)
    } catch (e) {
      // Sessiz skip YOK — yüksek sesle logla, kaydetme (sonraki boot yeniden dener)
      console.error(`[Migration] BAŞARISIZ: ${m.name} — ${e.message}`)
      errors.push({ name: m.name, error: e.message })
    }
  }

  lastErrors = errors
  return { ran, errors }
}

export function getMigrationStatus(db) {
  try {
    const applied = db.prepare('SELECT COUNT(*) c FROM schema_migrations').get().c
    return { applied, total: MIGRATIONS.length, errors: lastErrors }
  } catch {
    return { applied: 0, total: MIGRATIONS.length, errors: lastErrors }
  }
}
