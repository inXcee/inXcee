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

  const results = []
  for (const file of files) {
    const version = parseInt(file, 10)
    if (Number.isNaN(version) || applied.has(version)) continue

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
  return results
}
