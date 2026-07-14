import { beforeAll, describe, expect, it } from 'vitest'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { getPayrollDetailed, getPuantaj } from './queries.js'

let staffId, unpaidCodeId, paidCodeId

beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const db = getDB()
  staffId = db.prepare("INSERT INTO staff(full_name,is_active,salary) VALUES('F2 Personel',1,30000)").run().lastInsertRowid
  unpaidCodeId = db.prepare(`INSERT INTO puantaj_codes(code,label,status,leave_type,is_paid,sgk_day_factor,day_multiplier,hour_multiplier,is_active)
    VALUES('ÜT','Ucretsiz Test','on_leave','unpaid',0,0,0,0,1)`).run().lastInsertRowid
  paidCodeId = db.prepare(`INSERT INTO puantaj_codes(code,label,status,leave_type,is_paid,sgk_day_factor,day_multiplier,hour_multiplier,is_active)
    VALUES('ÜP','Ucretli Test','on_leave','annual',1,1,1,1,1)`).run().lastInsertRowid

  const ins = db.prepare(`INSERT INTO shift_schedule(staff_id,work_date,status,leave_type,puantaj_code_id) VALUES(?,?,?,?,?)`)
  ins.run(staffId, '2026-07-01', 'worked', null, null)
  ins.run(staffId, '2026-07-02', 'worked', null, null)
  ins.run(staffId, '2026-07-06', 'off', null, null)
  ins.run(staffId, '2026-07-03', 'on_leave', 'unpaid', unpaidCodeId)
  ins.run(staffId, '2026-07-04', 'on_leave', 'unpaid', unpaidCodeId)
  ins.run(staffId, '2026-07-05', 'on_leave', 'unpaid', unpaidCodeId)
  ins.run(staffId, '2026-07-07', 'on_leave', 'annual', paidCodeId)
})

describe('F2 — bordro raporu puantaj kod etkilerini yansıtır', () => {
  it('sgk_days ücretsiz izni saymaz, ücretli izni sayar', () => {
    const row = getPayrollDetailed('2026-07').find(r => r.id === staffId)
    // worked(2) + off(1) + sgk_day_units(ücretli izin 1*1.0=1) = 4  (eski kaba hesap 7 verirdi)
    expect(row.sgk_days).toBe(4)
  })

  it('föy (getPuantaj) ile bordro raporu aynı worked/sgk birimlerini verir', () => {
    const foy = getPuantaj('2026-07-01', '2026-07-31').find(r => r.id === staffId)
    const bordro = getPayrollDetailed('2026-07').find(r => r.id === staffId)
    expect(bordro.worked_days).toBe(foy.worked_days)
    expect(bordro.sgk_days).toBe((foy.worked_days || 0) + (foy.off_days || 0) + (foy.sgk_day_units || 0))
  })
})
