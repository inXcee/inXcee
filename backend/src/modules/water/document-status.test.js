import { beforeAll, describe, expect, it } from 'vitest'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { waybillDocumentStatus } from './document-status.js'

beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const db = getDB()
  const productId = db.prepare(`INSERT INTO water_products(name, unit_label, units_per_case, cases_per_pallet)
    VALUES('Evrak Test Suyu', 'adet', 1, 1)`).run().lastInsertRowid
  const insert = db.prepare(`INSERT INTO water_movements(type, product_id, move_date, qty_base, input_qty, input_unit, waybill_no)
    VALUES('in', ?, ?, ?, ?, 'adet', ?)`)
  const coveredId = insert.run(productId, '2026-07-01', 10, 10, 'EVRAK-1').lastInsertRowid
  insert.run(productId, '2026-07-01', 5, 5, 'EVRAK-1')
  insert.run(productId, '2026-07-02', 7, 7, 'EVRAK-2')
  const unnamedId = insert.run(productId, '2026-07-03', 3, 3, null).lastInsertRowid
  insert.run(productId, '2026-07-04', 99, 99, 'DEVIR-DUZELTME-1')
  db.prepare(`INSERT INTO water_waybill_photos(movement_id, waybill_no, move_date, photo_url)
    VALUES(?, 'EVRAK-1', '2026-07-01', '/uploads/evrak-1.jpg')`).run(coveredId)
  db.prepare(`INSERT INTO water_waybill_photos(movement_id, waybill_no, move_date, photo_url)
    VALUES(?, NULL, '2026-07-03', '/uploads/numarasiz.jpg')`).run(unnamedId)
})

describe('Su irsaliye evrak tamlığı', () => {
  it('çok satırlı irsaliyeyi tek belge sayar ve eksik türlerini ayırır', () => {
    const status = waybillDocumentStatus({ from: '2026-07-01', to: '2026-07-31', today: '2026-07-10' })
    expect(status).toMatchObject({
      total: 3,
      complete: 1,
      incomplete: 2,
      missing_photo: 1,
      missing_waybill: 1,
      complete_percent: 33,
      truncated: false,
    })
    expect(status.documents.find(document => document.waybill_no === 'EVRAK-1')).toMatchObject({ line_count: 2, complete: true })
    expect(status.issues.map(document => document.issue)).toEqual(['missing_photo', 'missing_waybill'])
    expect(status.issues[0].waiting_days).toBe(8)
  })
})
