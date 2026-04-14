import cron from 'node-cron'
import { generateDailyTasks } from '../../modules/housekeeping/queries.js'
import { createNotification } from '../notifications/service.js'
import { getDB } from '../db/index.js'
import { checkSlaViolations, checkMachineTimers, checkSlaPreWarnings, checkMachineMaintenanceAlerts } from '../../modules/laundry/sla.js'
import { getEmailSettings } from '../../modules/email/queries.js'
import { sendMorningReport } from '../../modules/email/service.js'

let emailJob = null

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
          type: 'warning', module: 'inventory', target_role: 'campus_manager',
          dedup_key: `stock_low_${item.id}_${new Date().toISOString().split('T')[0]}`,
        })
      })
    } catch (e) { console.error('[Cron] Stok cron hatası:', e) }
  })

  // Her 1 dakikada makine zamanlayıcı kontrolü
  cron.schedule('*/1 * * * *', () => {
    try {
      checkMachineTimers()
    } catch (e) { console.error('[Cron] Makine timer hatası:', e.message) }
  })

  // Her 15 dakikada SLA kontrolü
  cron.schedule('*/15 * * * *', async () => {
    try {
      await checkSlaViolations()
      await checkSlaPreWarnings()
      await checkMachineMaintenanceAlerts()
    } catch (e) { console.error('[Cron] Laundry SLA hatası:', e.message) }
  })

  // cron jobs initialized
  scheduleMorningReport()
}

export function scheduleMorningReport() {
  if (emailJob) { emailJob.stop(); emailJob = null }
  const { enabled, hour, minute } = getEmailSettings()
  if (!enabled) return
  emailJob = cron.schedule(`${minute} ${hour} * * *`, () => {
    sendMorningReport().catch(e => console.error('[Cron] Email hatası:', e))
  })
}
