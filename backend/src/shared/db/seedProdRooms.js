import { getDB } from './index.js'

// Production-safe room seeding: AVSKAMP kampüsü M ve S blokları.
// A/B/C... ve A1-A4 blokları sonradan UI üzerinden eklenecek.
//
// Layout (CLAUDE.md ve dev seed ile birebir aynı):
//   M1, M2, M3 → 2 kat × 30 oda (101–130, 201–230) × kapasite 6
//   S1, S3     → 2 kat × 24 oda (101–124, 201–224) × kapasite 6
//   S2 1.kat   → 24 oda × kapasite 6
//   S2 2.kat   → 24 oda × kapasite 4   (DB CHECK constraint zorunluluğu)
//
// Toplam: 180 (M) + 48 (S1) + 48 (S2) + 48 (S3) = 324 oda
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
    // M blokları
    for (const block of ['M1', 'M2', 'M3']) {
      for (let floor = 1; floor <= 2; floor++) {
        const base = floor === 1 ? 100 : 200
        for (let r = 1; r <= 30; r++) {
          const result = insert.run(block, floor, String(base + r), 6, 6, 'active')
          if (result.changes > 0) inserted++
          else skipped++
        }
      }
    }

    // S blokları (S2 2.kat 4 kişilik)
    for (const block of ['S1', 'S2', 'S3']) {
      for (let floor = 1; floor <= 2; floor++) {
        const cap = (block === 'S2' && floor === 2) ? 4 : 6
        const base = floor === 1 ? 100 : 200
        for (let r = 1; r <= 24; r++) {
          const result = insert.run(block, floor, String(base + r), cap, cap, 'active')
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
