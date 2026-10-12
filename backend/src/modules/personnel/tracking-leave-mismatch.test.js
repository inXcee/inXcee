import { beforeAll, describe, expect, it } from 'vitest'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { evaluatePersonnelAlerts } from './tracking-alerts.js'

// Canlıda 23 sahte "bakiye uyuşmazlığı": sorgu yılı CAST(? AS TEXT) ile karşılaştırıyordu,
// better-sqlite3 sayıyı REAL bağladığından '2026.0' ≠ '2026' → onaylı izin hep 0 görünüyordu.
describe('izin bakiyesi uyuşmazlığı uyarısı', () => {
  const year = new Date().getFullYear()
  let okId, driftId
  const open = (id) => getDB().prepare(`SELECT status, message FROM personnel_tracking_alerts
    WHERE staff_id=? AND rule_key='leave_balance_mismatch'`).get(id)

  beforeAll(() => {
    process.env.DB_PATH = ':memory:'; initDB(); seedDev()
    const db = getDB()
    const add = (name, used, approved) => {
      const id = db.prepare('INSERT INTO staff(full_name, is_active) VALUES(?,1)').run(name).lastInsertRowid
      db.prepare('INSERT INTO leave_balance(staff_id, year, annual_used) VALUES(?,?,?)').run(id, year, used)
      if (approved) {
        db.prepare(`INSERT INTO leave_requests(staff_id, leave_type, start_date, end_date, total_days, status)
          VALUES(?, 'annual', ?, ?, ?, 'approved')`).run(id, `${year}-03-02`, `${year}-03-06`, approved)
      }
      return id
    }
    okId = add('UYUMLU KİŞİ', 5, 5)
    driftId = add('SAPMIŞ KİŞİ', 6, 2)
    evaluatePersonnelAlerts()
  })

  it('sayaç ile onaylı izin aynıysa uyarı açmaz', () => {
    expect(open(okId)).toBeUndefined()
  })

  it('gerçek farkı yakalar ve onaylı izni doğru sayar', () => {
    expect(open(driftId)).toMatchObject({ status: 'open' })
    expect(open(driftId).message).toContain('onayli izin 2 gun')
  })
})
