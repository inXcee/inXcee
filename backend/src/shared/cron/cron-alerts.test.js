// Cron uyarı işleri — stok eşiği ve son kullanma tarihi (Ekim 2026 bildirim/cron taraması).
import { describe, it, expect, beforeAll } from 'vitest'
import { initDB, getDB } from '../db/index.js'
import { seedDev } from '../db/seed.js'
import { istanbulDate } from '../time.js'
import { checkInventoryLowStock, checkLotExpiryAlerts } from './index.js'
import { listExpiring } from '../../modules/inventory/lots/queries.js'

const plusDays = (day, n) => {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10) // utc-bilinçli: saf takvim aritmetiği
}

let db
beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev() // otomatik SKT düşümü stok hareketini sistem kullanıcısı (id 1) adına yazar
  db = getDB()
})

const item = (name, quantity, threshold) => Number(db.prepare(`
  INSERT INTO inventory(item_name, quantity, unit, reorder_threshold, category, track_lots)
  VALUES(?, ?, 'adet', ?, 'general', 1)
`).run(name, quantity, threshold).lastInsertRowid)

const notifs = (like) => db.prepare('SELECT message, type FROM notifications WHERE dedup_key LIKE ?').all(like)

describe('saatlik stok kontrolü', () => {
  it('eşiği tanımlanmamış (0) ürün stoğu bitince "kritik seviyede" sayılmaz', () => {
    const id = item('Eşiksiz Ürün', 0, 0)
    checkInventoryLowStock()
    expect(notifs(`stock_low_${id}_%`)).toHaveLength(0)
  })

  it('eşiğin altına inen ürün günde bir kez bildirilir', () => {
    const id = item('Eşikli Ürün', 2, 10)
    checkInventoryLowStock()
    checkInventoryLowStock()
    expect(notifs(`stock_low_${id}_%`)).toHaveLength(1)
  })
})

describe('son kullanma tarihi', () => {
  const lot = (itemId, lotNo, expiry, qty = 5) => Number(db.prepare(`
    INSERT INTO inventory_lots(item_id, lot_no, quantity, expiry_date, status) VALUES(?, ?, ?, ?, 'active')
  `).run(itemId, lotNo, qty, expiry).lastInsertRowid)

  it('kalan gün takvim günüdür: yarın biten lot 1 gün, bugün biten 0 gün', () => {
    const today = istanbulDate()
    const itemId = item('SKT Ürün', 20, 0)
    const tomorrow = lot(itemId, 'L-YARIN', plusDays(today, 1))
    const todayLot = lot(itemId, 'L-BUGUN', today)
    const inTwo = lot(itemId, 'L-IKI', plusDays(today, 2))
    const rows = Object.fromEntries(listExpiring(30).map(r => [r.id, r.days_left]))
    expect(rows[tomorrow]).toBe(1)
    expect(rows[todayLot]).toBe(0)
    expect(rows[inTwo]).toBe(2)
  })

  it('06:00 uyarısı yarın biten lotu "SKT geçti" diye bildirmez', () => {
    const today = istanbulDate()
    const itemId = item('SKT Uyarı Ürün', 20, 0)
    const tomorrow = lot(itemId, 'L-UYARI-YARIN', plusDays(today, 1))
    const past = lot(itemId, 'L-UYARI-DUN', plusDays(today, -1))
    checkLotExpiryAlerts()
    const [n] = notifs(`expiry_${tomorrow}_%`)
    expect(n.message).toMatch(/^Son kullanmaya 1 gun/)
    // Dünkü SKT önce otomatik 'expired' olur, ayrıca "yaklaşıyor" uyarısı üretmez
    expect(db.prepare('SELECT status FROM inventory_lots WHERE id=?').get(past).status).toBe('expired')
    expect(notifs(`expiry_${past}_%`)).toHaveLength(0)
  })
})
