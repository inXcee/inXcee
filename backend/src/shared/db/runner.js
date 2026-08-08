import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { logger } from '../logger.js'

// Versiyonlu migration runner.
//
// Neden: initDB() içindeki ~118 idempotent ALTER bloğu çalışıyor ama versiyon
// takibi yok ve dosya okunmaz büyüyor. O blok artık BASELINE kabul edilir
// (mevcut prod/dev DB'lerde tüm kolonlar zaten var). BUNDAN SONRAKİ tüm şema
// değişiklikleri buraya, migrations/NNN_ad.sql dosyalarına yazılır.
//
// Çalışma: schema_migrations tablosunda kayıtlı olmayan dosyalar, sürüm
// sırasına göre transaction içinde uygulanır. Bir migration patlarsa fail-fast
// (sonrakiler çalışmaz) — yarım uygulanmış şema riskini önler.
//
// Dosya adı kuralı: 3 haneli sürüm + açıklama, örn. `001_audit_indexes.sql`.
// Sürüm numarası dosya adının başındaki tam sayıdan parse edilir.

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations')

// Diskteki migration sürümleri (artan). /api/health bunu DB'deki kayıtla
// karşılaştırır: deploy koda yetişip şemaya yetişmediğinde fark buradan görünür.
export function migrationFileVersions(dir = MIGRATIONS_DIR) {
  let files
  try {
    files = readdirSync(dir).filter(f => /^\d+.*\.sql$/i.test(f))
  } catch (err) {
    if (err.code === 'ENOENT') return []
    throw err
  }
  return files
    .map(f => parseInt(f, 10))
    .filter(v => !Number.isNaN(v))
    .sort((a, b) => a - b)
}

// Dosyası olup DB'de kaydı olmayan sürümler. Boş değilse çalışan süreç ESKİ
// şemayla koşuyor demektir — 2026-08-09'da personel takip tabloları böyle
// oluşmadı ve ekran "veri alınamadı" derken sunucu logu sessiz kaldı.
export function pendingMigrations(db, dir = MIGRATIONS_DIR) {
  let applied
  try {
    applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map(r => r.version))
  } catch {
    return migrationFileVersions(dir)   // tablo hiç yoksa hepsi bekliyor
  }
  return migrationFileVersions(dir).filter(v => !applied.has(v))
}

export function applyMigrations(db, dir = MIGRATIONS_DIR) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)

  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map(r => r.version)
  )

  let files
  try {
    files = readdirSync(dir).filter(f => /^\d+.*\.sql$/i.test(f)).sort()
  } catch (err) {
    // migrations/ yoksa sessiz geç — baseline-only kurulum geçerli.
    if (err.code === 'ENOENT') return []
    throw err
  }

  const pending = files.filter(f => {
    const v = parseInt(f, 10)
    return !Number.isNaN(v) && !applied.has(v)
  })
  if (pending.length === 0) return []

  const results = []
  // Tablo rebuild migration'ları (CHECK/kolon değişimi) için standart SQLite
  // reçetesi: FK enforcement transaction DIŞINDA kapatılır (tx içinde no-op),
  // uygulama sonrası foreign_key_check ile bütünlük doğrulanır.
  db.pragma('foreign_keys = OFF')
  try {
    for (const file of pending) {
      const version = parseInt(file, 10)
      const sql = readFileSync(join(dir, file), 'utf-8')
      const tx = db.transaction(() => {
        if (sql.trim()) db.exec(sql)
        db.prepare('INSERT INTO schema_migrations(version, name) VALUES(?, ?)').run(version, file)
      })

      try {
        tx()
        results.push({ version, file })
        logger.info({ version, file }, '[Migration] uygulandı')
      } catch (err) {
        logger.error({ version, file, err: err.message }, '[Migration] BAŞARISIZ — sonrakiler durduruldu')
        throw err
      }
    }

    const fkViolations = db.pragma('foreign_key_check')
    if (fkViolations.length > 0) {
      logger.error({ violations: fkViolations.slice(0, 10) }, '[Migration] foreign_key_check ihlali!')
      throw new Error(`Migration sonrası ${fkViolations.length} FK ihlali tespit edildi`)
    }
  } finally {
    db.pragma('foreign_keys = ON')
  }
  return results
}
