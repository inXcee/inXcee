import cron from 'node-cron'
import { generateDailyTasks } from '../../modules/housekeeping/queries.js'
import { createNotification } from '../notifications/service.js'
import { getDB } from '../db/index.js'

export function startCronJobs() {
  // Her gün 05:50'de günlük temizlik görevleri oluştur
  cron.schedule('50 5 * * *', () => {
    try {
      const count = generateDailyTasks()
      // daily task generation completed
    } catch (e) { console.error('[Cron] Temizlik görev hatası:', e) }
  })

  // Her saat stok kontrolü
  cron.schedule('0 * * * *', () => {
    try {
      const db = getDB()
      const low = db.prepare('SELECT * FROM inventory WHERE quantity <= reorder_threshold').all()
      low.forEach(item => {
        createNotification({
          message: `Stok uyarısı: ${item.item_name} kritik seviyede (${item.quantity} ${item.unit})`,
          type: 'warning', module: 'inventory', target_role: 'campus_manager'
        })
      })
    } catch (e) { console.error('[Cron] Stok cron hatası:', e) }
  })

  // cron jobs initialized
}
