// Production'da seedProdRooms() calistirir.
// INSERT OR IGNORE — mevcut M+S odalara dokunmaz, sadece eksik blokları ekler.
//
// Kullanim:
//   DB_PATH=/var/data/yys.db node backend/scripts/seed-rooms.js
//
// Y bloklar default capacity=6 olarak insert edilir (shared/blocks.js'e gore).
// Mevcut DB'de eksik olan tum blok+kat+oda kombinasyonlari eklenir.

import { initDB } from '../src/shared/db/index.js'
import { seedProdRooms } from '../src/shared/db/seedProdRooms.js'

console.log(`[seed] DB: ${process.env.DB_PATH || '(default)'}`)
initDB()

const stats = seedProdRooms()
console.log('')
console.log('[seed] Sonuc:')
console.log(`  Eklenen oda  : ${stats.inserted}`)
console.log(`  Atlanan      : ${stats.skipped} (zaten var)`)
console.log(`  Toplam DB    : ${stats.total_in_db}`)
console.log('')
if (stats.inserted > 0) {
  console.log('[seed] Yeni odalar eklendi. Atama yapilabilir.')
} else {
  console.log('[seed] Yeni oda yok, DB zaten dolu.')
}
