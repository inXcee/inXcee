import { describe, it, expect, beforeAll, vi } from 'vitest'
import { initDB, getDB } from '../db/index.js'
import { createNotification } from '../notifications/service.js'

beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  initDB()
})

describe('Stock low notification logic', () => {
  it('creates warning notification for low-stock items', () => {
    const db = getDB()
    db.exec('DELETE FROM notifications')

    // Insert a low-stock item
    db.prepare(`
      INSERT OR IGNORE INTO inventory(item_name, quantity, unit, reorder_threshold, category, location)
      VALUES('Test Ürün', 2, 'adet', 10, 'general', 'Depo')
    `).run()

    const low = db.prepare('SELECT * FROM inventory WHERE quantity <= reorder_threshold').all()
    expect(low.length).toBeGreaterThan(0)

    const item = low[0]
    const today = new Date().toISOString().split('T')[0]
    const dedup_key = `stock_low_${item.id}_${today}`

    // Simulate what cron does
    const n = createNotification({
      message: `Stok uyarısı: ${item.item_name} kritik seviyede (${item.quantity} ${item.unit})`,
      type: 'warning',
      module: 'inventory',
      target_role: 'campus_manager',
      dedup_key,
    })
    expect(n).not.toBeNull()
    expect(n.type).toBe('warning')
    expect(n.target_role).toBe('campus_manager')
  })

  it('does not create duplicate stock notification on same day', () => {
    const db = getDB()
    const item = db.prepare('SELECT * FROM inventory WHERE quantity <= reorder_threshold').get()
    if (!item) return

    const today = new Date().toISOString().split('T')[0]
    const dedup_key = `stock_low_${item.id}_${today}`

    // Second call — same day, same key
    const n = createNotification({
      message: `Stok uyarısı: ${item.item_name} kritik seviyede`,
      type: 'warning',
      module: 'inventory',
      target_role: 'campus_manager',
      dedup_key,
    })
    expect(n).toBeNull()
  })
})

describe('Daily task generation', () => {
  it('generateDailyTasks runs without error', async () => {
    const { generateDailyTasks } = await import('../../modules/housekeeping/queries.js')
    expect(() => generateDailyTasks()).not.toThrow()
  })
})
