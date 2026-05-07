// One-shot cleanup: seedProdRooms config'i dışında kalan "orphan" odaları sil.
//
// Eski seed sürümlerinden kalan kayıtlar (D/H/J/F'de 120 fazla oda) production
// deploy öncesi temizlenmeli. INSERT OR IGNORE bunu yapmıyor.
//
// Kullanım:
//   node scripts/cleanup-orphan-rooms.js            # dry-run (sadece say)
//   node scripts/cleanup-orphan-rooms.js --apply    # gerçek silme
//
// Güvenlik:
//   - Aktif room_assignment olan oda varsa silmez, abort eder.
//   - laundry_bag.room_id referansı olan oda varsa silmez.
//   - Apply'dan önce DB dosyasının kopyasını alır.

import Database from 'better-sqlite3'
import { copyFileSync } from 'fs'
import { resolve } from 'path'

const DB_PATH = process.env.DB_PATH || resolve(process.cwd(), 'yys.db')
const APPLY = process.argv.includes('--apply')

// seedProdRooms.js ile bire bir aynı beklenen oda kümesi.
// Burayı her değiştirdiğinde seedProdRooms.js de aynı blok+kat+aralık üretmeli.
const EXPECTED = []
for (const block of ['M1', 'M2', 'M3']) {
  for (const floor of [1, 2]) {
    const base = floor * 100
    for (let r = 1; r <= 30; r++) EXPECTED.push({ block, floor, room_no: String(base + r) })
  }
}
for (const block of ['S1', 'S2', 'S3']) {
  for (const floor of [1, 2]) {
    const base = floor * 100
    for (let r = 1; r <= 24; r++) EXPECTED.push({ block, floor, room_no: String(base + r) })
  }
}
for (const block of ['A', 'A1', 'A2', 'A3', 'A4', 'B', 'C']) {
  for (const floor of [1, 2]) {
    const base = floor * 100
    for (let r = 1; r <= 20; r++) EXPECTED.push({ block, floor, room_no: String(base + r) })
  }
}
for (const { block, perFloor } of [{ block: 'E', perFloor: 20 }, { block: 'G', perFloor: 20 }, { block: 'F', perFloor: 10 }]) {
  for (const floor of [1, 2, 3]) {
    const base = floor * 100
    for (let r = 1; r <= perFloor; r++) EXPECTED.push({ block, floor, room_no: String(base + r) })
  }
}
for (const { block, floor, start, end } of [
  { block: 'D', floor: 1, start: 101, end: 120 },
  { block: 'H', floor: 1, start: 1, end: 20 },
  { block: 'J', floor: 1, start: 1, end: 20 },
]) {
  for (let r = start; r <= end; r++) EXPECTED.push({ block, floor, room_no: String(r) })
}

const expectedKeys = new Set(EXPECTED.map(e => `${e.block}|${e.floor}|${e.room_no}`))
console.log(`[cleanup] Beklenen oda sayısı (config): ${EXPECTED.length}`)
console.log(`[cleanup] DB: ${DB_PATH}`)
console.log(`[cleanup] Mod: ${APPLY ? 'APPLY (silme aktif)' : 'DRY-RUN (sadece rapor)'}`)
console.log('')

const db = new Database(DB_PATH)

const allRooms = db.prepare('SELECT id, block, floor, room_no FROM rooms').all()
console.log(`[cleanup] DB'deki toplam oda: ${allRooms.length}`)

const orphans = allRooms.filter(r => !expectedKeys.has(`${r.block}|${r.floor}|${r.room_no}`))
console.log(`[cleanup] Orphan oda: ${orphans.length}`)

if (orphans.length === 0) {
  console.log('[cleanup] Temiz, yapılacak iş yok.')
  process.exit(0)
}

const breakdown = {}
for (const o of orphans) {
  const k = `${o.block} kat${o.floor}`
  breakdown[k] = (breakdown[k] || 0) + 1
}
console.log('[cleanup] Dağılım:')
for (const [k, c] of Object.entries(breakdown).sort()) console.log(`           ${k}: ${c}`)

const orphanIds = orphans.map(r => r.id)
const ph = orphanIds.map(() => '?').join(',')

const activeAssign = db.prepare(`SELECT COUNT(*) c FROM room_assignments WHERE room_id IN (${ph}) AND check_out_at IS NULL`).get(...orphanIds).c
const anyAssign = db.prepare(`SELECT COUNT(*) c FROM room_assignments WHERE room_id IN (${ph})`).get(...orphanIds).c
const bagRefs = db.prepare(`SELECT COUNT(*) c FROM laundry_bags WHERE room_id IN (${ph})`).get(...orphanIds).c

console.log('')
console.log('[cleanup] Güvenlik kontrolleri:')
console.log(`           Aktif room_assignment : ${activeAssign}`)
console.log(`           Toplam room_assignment: ${anyAssign}`)
console.log(`           laundry_bag referansı : ${bagRefs}`)

if (activeAssign > 0 || anyAssign > 0 || bagRefs > 0) {
  console.error('[cleanup] HATA: Orphan odalarda referans var. Silme yapılmayacak.')
  process.exit(1)
}

if (!APPLY) {
  console.log('')
  console.log('[cleanup] Dry-run bitti. Silmek için: node scripts/cleanup-orphan-rooms.js --apply')
  process.exit(0)
}

const backupPath = `${DB_PATH}.bak.cleanup-${new Date().toISOString().slice(0, 10)}`
copyFileSync(DB_PATH, backupPath)
console.log('')
console.log(`[cleanup] Backup: ${backupPath}`)

const del = db.prepare(`DELETE FROM rooms WHERE id IN (${ph})`)
const tx = db.transaction(() => del.run(...orphanIds))
const info = tx()
console.log(`[cleanup] Silinen: ${info.changes}`)

const after = db.prepare('SELECT COUNT(*) c FROM rooms').get().c
console.log(`[cleanup] DB'deki toplam oda (sonra): ${after} (beklenen ${EXPECTED.length})`)
if (after !== EXPECTED.length) {
  console.warn('[cleanup] UYARI: toplam beklenen ile eşleşmiyor — eksik veya fazla seed oda olabilir.')
}
db.close()
