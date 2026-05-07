// Y blok placeholder kapasite (1) → varsayilan kapasite (6) migration.
//
// Y bloklari ilk seed'de "kapasite=1 placeholder" olarak kuruldu, bu da
// odalara birden fazla kisi atamayi engelliyordu. M/S bloklar gibi default
// 6 kisilige cekiyoruz. Manuel olarak farkli kapasiteye (ornek 2/3) cekilmis
// odalara dokunulmaz — sadece halen capacity=1 olan Y blok odalarini 6 yapar.
//
// Kullanim:
//   node scripts/update-y-block-capacity.js              # dry-run
//   node scripts/update-y-block-capacity.js --apply      # uygula
//
// Guvenlik:
//   - active_beds'i de 6'ya yukseltir, mevcut sakin atamalari korunur
//   - capacity != 1 olan odalara dokunulmaz (manuel ayar saygi gorur)
//   - Apply'dan once DB backup alir

import Database from 'better-sqlite3'
import { copyFileSync } from 'fs'
import { resolve } from 'path'
import { BLOCKS_BY_TYPE } from '../src/shared/blocks.js'

const DB_PATH = process.env.DB_PATH || resolve(process.cwd(), 'yys.db')
const APPLY = process.argv.includes('--apply')

const Y_BLOCKS = BLOCKS_BY_TYPE.Y
const placeholders = Y_BLOCKS.map(() => '?').join(',')

console.log(`[y-cap] DB: ${DB_PATH}`)
console.log(`[y-cap] Y bloklar: ${Y_BLOCKS.join(', ')}`)
console.log(`[y-cap] Mod: ${APPLY ? 'APPLY' : 'DRY-RUN'}`)
console.log('')

const db = new Database(DB_PATH)

const candidates = db.prepare(
  `SELECT id, block, floor, room_no, capacity, active_beds
     FROM rooms
    WHERE block IN (${placeholders}) AND capacity = 1`
).all(...Y_BLOCKS)

console.log(`[y-cap] capacity=1 olan Y blok oda: ${candidates.length}`)

const stats = db.prepare(
  `SELECT
     SUM(CASE WHEN capacity = 1 THEN 1 ELSE 0 END) as placeholder_cnt,
     SUM(CASE WHEN capacity != 1 THEN 1 ELSE 0 END) as customized_cnt,
     COUNT(*) as total
   FROM rooms WHERE block IN (${placeholders})`
).get(...Y_BLOCKS)
console.log(`[y-cap] Y blok ozet: toplam ${stats.total} oda — placeholder ${stats.placeholder_cnt}, ozel ayarli ${stats.customized_cnt}`)

if (candidates.length === 0) {
  console.log('[y-cap] Yapilacak is yok (placeholder kayit kalmadi).')
  process.exit(0)
}

if (!APPLY) {
  console.log('')
  console.log('[y-cap] Dry-run bitti. Uygulamak icin: node scripts/update-y-block-capacity.js --apply')
  process.exit(0)
}

const backupPath = `${DB_PATH}.bak.ycap-${new Date().toISOString().slice(0, 10)}`
copyFileSync(DB_PATH, backupPath)
console.log('')
console.log(`[y-cap] Backup: ${backupPath}`)

const update = db.prepare(
  `UPDATE rooms SET capacity = 6, active_beds = 6
   WHERE block IN (${placeholders}) AND capacity = 1`
)
const tx = db.transaction(() => update.run(...Y_BLOCKS))
const info = tx()
console.log(`[y-cap] Guncellendi: ${info.changes} oda`)

const after = db.prepare(
  `SELECT COUNT(*) c FROM rooms WHERE block IN (${placeholders}) AND capacity = 1`
).get(...Y_BLOCKS).c
console.log(`[y-cap] Kalan placeholder: ${after}`)
db.close()
