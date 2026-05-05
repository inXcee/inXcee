import { getDB } from './index.js'

// Production-safe room seeding: AVSKAMP kampüsü blokları.
//
// Layout (CLAUDE.md ve dev seed ile uyumlu):
//   M1, M2, M3 → 2 kat × 30 oda (101–130, 201–230) × kapasite 6
//   S1, S3     → 2 kat × 24 oda (101–124, 201–224) × kapasite 6
//   S2 1.kat   → 24 oda × kapasite 6
//   S2 2.kat   → 24 oda × kapasite 4   (DB CHECK constraint zorunluluğu)
//   D          → 1 kat × 20 oda (101–120) × kapasite 1 (placeholder)
//   A, A1-A4, B, C → 2 kat × 20 oda (101–120, 201–220) × kapasite 1
//   E, G       → 3 kat × 20 oda (101–120, 201–220, 301–320) × kapasite 1
//   F          → 3 kat × 10 oda (101–110, 201–210, 301–310) × kapasite 1
//   H, J       → 1 kat × 20 oda (1–20 düz numaralı) × kapasite 1
//
// Toplam: 324 (M+S) + 490 (yeni 13 blok) = 814 oda
//
// Kapasite=1 placeholder; doğru yatak sayıları sonradan UI/SQL ile düzenlenecek.
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

    // 2 katlı 20 odalı bloklar — A, A1, A2, A3, A4, B, C (kapasite 1 placeholder)
    const TWO_FLOOR_BLOCKS = ['A', 'A1', 'A2', 'A3', 'A4', 'B', 'C']
    for (const block of TWO_FLOOR_BLOCKS) {
      for (let floor = 1; floor <= 2; floor++) {
        const base = floor === 1 ? 100 : 200
        for (let r = 1; r <= 20; r++) {
          const result = insert.run(block, floor, String(base + r), 1, 1, 'active')
          if (result.changes > 0) inserted++
          else skipped++
        }
      }
    }

    // 3 katlı bloklar — E ve G 20'şer oda, F 10'ar oda (kapasite 1 placeholder)
    const THREE_FLOOR_BLOCKS = [
      { block: 'E', perFloor: 20 },
      { block: 'G', perFloor: 20 },
      { block: 'F', perFloor: 10 },
    ]
    for (const { block, perFloor } of THREE_FLOOR_BLOCKS) {
      for (let floor = 1; floor <= 3; floor++) {
        const base = floor * 100
        for (let r = 1; r <= perFloor; r++) {
          const result = insert.run(block, floor, String(base + r), 1, 1, 'active')
          if (result.changes > 0) inserted++
          else skipped++
        }
      }
    }

    // Tek katlı bloklar — D 101-120, H ve J 1-20 düz numaralı (kapasite 1 placeholder)
    const SINGLE_FLOOR_SPECS = [
      { block: 'D', floor: 1, start: 101, end: 120 },
      { block: 'H', floor: 1, start: 1,   end: 20  },
      { block: 'J', floor: 1, start: 1,   end: 20  },
    ]
    for (const { block, floor, start, end } of SINGLE_FLOOR_SPECS) {
      for (let r = start; r <= end; r++) {
        const result = insert.run(block, floor, String(r), 1, 1, 'active')
        if (result.changes > 0) inserted++
        else skipped++
      }
    }
  })
  tx()

  const totalInDb = db.prepare('SELECT COUNT(*) as c FROM rooms').get().c
  return { inserted, skipped, total_in_db: totalInDb }
}
