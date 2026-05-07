// rooms tablosunda blok dagilimini gosterir.
// Kullanim: DB_PATH=/var/data/yys.db node backend/scripts/inspect-rooms.js
import Database from 'better-sqlite3'
import { resolve } from 'path'

const DB_PATH = process.env.DB_PATH || resolve(process.cwd(), 'yys.db')
const db = new Database(DB_PATH, { readonly: true })

const total = db.prepare('SELECT COUNT(*) AS c FROM rooms').get().c
console.log(`DB: ${DB_PATH}`)
console.log(`Toplam oda: ${total}`)
console.log('')

const rows = db.prepare(
  `SELECT block,
          COUNT(*)               AS toplam,
          MIN(capacity)          AS min_cap,
          MAX(capacity)          AS max_cap,
          SUM(CASE WHEN capacity = 1 THEN 1 ELSE 0 END) AS placeholder
     FROM rooms GROUP BY block ORDER BY block`
).all()

if (rows.length === 0) {
  console.log('(rooms tablosu BOS)')
} else {
  console.log('blok | toplam | min_cap | max_cap | placeholder(cap=1)')
  console.log('-----+--------+---------+---------+-------------------')
  for (const r of rows) {
    console.log(
      `${(r.block || '').padEnd(4)} | ${String(r.toplam).padStart(6)} | ${String(r.min_cap).padStart(7)} | ${String(r.max_cap).padStart(7)} | ${String(r.placeholder).padStart(17)}`
    )
  }
}
db.close()
