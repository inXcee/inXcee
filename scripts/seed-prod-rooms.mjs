// Production tek seferlik oda seed çalıştırıcısı.
//
// Kullanım (sunucuda):
//   cd /opt/avskamp
//   node --env-file=.env scripts/seed-prod-rooms.js
//
// `--env-file=.env` flag'i Node 20+ ile gelir; PM2 ecosystem'i de aynısını kullanıyor.
// DB_PATH .env'de tanımlı olmalı (prod: /var/data/yys.db).
//
// Idempotent: birden fazla kez çalıştırılması güvenli — INSERT OR IGNORE.

import { initDB } from '../backend/src/shared/db/index.js'
import { seedProdRooms } from '../backend/src/shared/db/seedProdRooms.js'

const dbPath = process.env.DB_PATH || 'yys.db'
process.stdout.write(`[seed-prod-rooms] DB_PATH=${dbPath}\n`)

initDB()
const stats = seedProdRooms()

process.stdout.write('[seed-prod-rooms] Tamamlandi:\n')
process.stdout.write(`  Yeni eklenen oda  : ${stats.inserted}\n`)
process.stdout.write(`  Var olan (atlandi): ${stats.skipped}\n`)
process.stdout.write(`  DB'deki toplam    : ${stats.total_in_db}\n`)

if (stats.inserted === 0 && stats.skipped === 324) {
  process.stdout.write('[seed-prod-rooms] Tum M ve S odalari zaten mevcut, hicbir sey yapilmadi.\n')
} else if (stats.inserted === 324) {
  process.stdout.write('[seed-prod-rooms] M1-M3 (180) + S1-S3 (144) = 324 oda olusturuldu.\n')
} else {
  process.stdout.write('[seed-prod-rooms] Kismi seed: bir kismi zaten vardi.\n')
}
