import { beforeAll, describe, expect, it } from 'vitest'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { getYtdGross, getYtdGrossBulk, puantajService } from './service.js'

let ids = []
let paidCodeId, unpaidCodeId

beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const db = getDB()
  const insStaff = db.prepare("INSERT INTO staff(full_name,is_active,salary) VALUES(?,1,?)")
  ids = [
    insStaff.run('YTD Personel A', 30000).lastInsertRowid,
    insStaff.run('YTD Personel B', 45000).lastInsertRowid,
    insStaff.run('YTD Personel C', 0).lastInsertRowid, // maaşsız — 0 dönmeli
  ]
  paidCodeId = db.prepare(`INSERT INTO puantaj_codes(code,label,status,leave_type,is_paid,sgk_day_factor,day_multiplier,hour_multiplier,is_active)
    VALUES('YÜ','Ytd Ucretli','on_leave','annual',1,1,1,1,1)`).run().lastInsertRowid
  unpaidCodeId = db.prepare(`INSERT INTO puantaj_codes(code,label,status,leave_type,is_paid,sgk_day_factor,day_multiplier,hour_multiplier,is_active)
    VALUES('YZ','Ytd Ucretsiz','on_leave','unpaid',0,0,0,0,1)`).run().lastInsertRowid

  const ins = db.prepare(`INSERT INTO shift_schedule(staff_id,work_date,status,leave_type,puantaj_code_id,leave_hours) VALUES(?,?,?,?,?,?)`)
  // A: Ocak 3 worked + 1 off + 1 ücretli izin; Şubat 2 worked + 1 ücretsiz izin + 4 saatlik ücretli izin
  ins.run(ids[0], '2026-01-05', 'worked', null, null, null)
  ins.run(ids[0], '2026-01-06', 'worked', null, null, null)
  ins.run(ids[0], '2026-01-07', 'worked', null, null, null)
  ins.run(ids[0], '2026-01-11', 'off', null, null, null)
  ins.run(ids[0], '2026-01-12', 'on_leave', 'annual', paidCodeId, null)
  ins.run(ids[0], '2026-02-02', 'worked', null, null, null)
  ins.run(ids[0], '2026-02-03', 'worked', null, null, null)
  ins.run(ids[0], '2026-02-04', 'on_leave', 'unpaid', unpaidCodeId, null)
  ins.run(ids[0], '2026-02-05', 'on_leave', 'annual', paidCodeId, 4)
  // B: Ocak 2 worked + 3 saat FM
  ins.run(ids[1], '2026-01-08', 'worked', null, null, null)
  ins.run(ids[1], '2026-01-09', 'worked', null, null, null)
  db.prepare("INSERT INTO overtime_records(staff_id,work_date,hours,reason) VALUES(?,?,?,?)")
    .run(ids[1], '2026-01-15', 3, 'ytd test')
  // C: maaşsız ama çalışmış
  ins.run(ids[2], '2026-01-05', 'worked', null, null, null)
})

describe('F1 — getYtdGrossBulk tekil getYtdGross ile birebir eşdeğer', () => {
  it('mart ayı için tüm test personelinde bulk === tekil', () => {
    const db = getDB()
    const bulk = getYtdGrossBulk(db, 2026, 3)
    for (const id of ids) {
      const single = getYtdGross(db, id, 2026, 3)
      expect(bulk.get(id) || 0).toBeCloseTo(single, 6)
    }
  })

  it('el hesabı doğru: A personeli Mart YTD', () => {
    // dailyRate = 1000; Oca-Şub: 5 worked + 1 off + (1 tam + 4/8=0.5 saatlik) ücretli izin = 7.5 birim
    // ücretsiz izin katılmaz → 1000 * 7.5 = 7500
    const db = getDB()
    expect(getYtdGrossBulk(db, 2026, 3).get(ids[0])).toBeCloseTo(7500, 2)
  })

  it('ocak için boş map (önceki ay yok)', () => {
    expect(getYtdGrossBulk(getDB(), 2026, 1).size).toBe(0)
  })

  it('puantajService şubat ytd_gross alanı tekil hesapla tutarlı', () => {
    const db = getDB()
    const rows = puantajService('2026-02')
    for (const id of [ids[0], ids[1]]) {
      const row = rows.find(r => r.id === id)
      const prev = getYtdGross(db, id, 2026, 2)
      expect(row.ytd_gross).toBeCloseTo(Math.round((prev + row.gross) * 100) / 100, 2)
    }
  })
})
