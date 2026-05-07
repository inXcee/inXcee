import { getDB } from './index.js'
import { BLOCKS, expectedRoomNos, getCapacity } from '../blocks.js'

// Production-safe room seeding: AVSKAMP kampüsü blokları.
//
// Layout tek kaynaktan: backend/src/shared/blocks.js (frontend ile sync).
// Toplam 814 oda — kapasite=1 olanlar Y blok placeholder.
//
// INSERT OR IGNORE → idempotent: birden fazla çağırsan da var olan odalar korunur.
export function seedProdRooms() {
  const db = getDB()
  const insert = db.prepare(`
    INSERT OR IGNORE INTO rooms(block, floor, room_no, capacity, active_beds, status)
    VALUES(?,?,?,?,?,?)
  `)

  let inserted = 0
  let skipped = 0

  const tx = db.transaction(() => {
    for (const cfg of BLOCKS) {
      for (let floor = 1; floor <= cfg.floors; floor++) {
        const cap = getCapacity(cfg.block, floor)
        for (const no of expectedRoomNos(cfg.block, floor)) {
          const result = insert.run(cfg.block, floor, String(no), cap, cap, 'active')
          if (result.changes > 0) inserted++
          else skipped++
        }
      }
    }
  })
  tx()

  const totalInDb = db.prepare('SELECT COUNT(*) as c FROM rooms').get().c
  return { inserted, skipped, total_in_db: totalInDb }
}
