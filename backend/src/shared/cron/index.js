import cron from 'node-cron'
import { generateDailyTasks } from '../../modules/housekeeping/queries.js'
import { createNotification } from '../notifications/service.js'
import { getDB } from '../db/index.js'
import { checkSlaViolations, checkMachineTimers, checkSlaPreWarnings, checkMachineMaintenanceAlerts, checkStuckWashingItems } from '../../modules/laundry/sla.js'
import { getEmailSettings } from '../../modules/email/queries.js'
import { sendMorningReport } from '../../modules/email/service.js'

let emailJob = null

// Cron overlap koruması — önceki tick bitmediyse yeni tick'i sessizce atla.
// SQLite tek writer, 1 dakikalık cron 60sn'den uzun sürerse busy_timeout'u tetikler.
const running = new Set()
function withLock(name, fn) {
  return async () => {
    if (running.has(name)) return
    running.add(name)
    try { await fn() }
    catch (e) { console.error(`[Cron:${name}]`, e.message) }
    finally { running.delete(name) }
  }
}

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

  // Her 1 dakikada makine zamanlayıcı kontrolü (overlap-safe)
  cron.schedule('*/1 * * * *', withLock('machine-timers', () => {
    checkMachineTimers()
  }))

  // Her 15 dakikada SLA kontrolü (overlap-safe)
  cron.schedule('*/15 * * * *', withLock('laundry-sla', async () => {
    await checkSlaViolations()
    await checkSlaPreWarnings()
    await checkMachineMaintenanceAlerts()
    checkStuckWashingItems()
  }))

  // Her gün 06:00 — son kullanma 30 gün altı lot uyarısı (campus_manager)
  cron.schedule('0 6 * * *', withLock('lot-expiry', () => {
    try {
      const db = getDB()
      const today = new Date().toISOString().split('T')[0]
      const lots = db.prepare(`
        SELECT l.id, l.lot_no, l.expiry_date, i.item_name, i.unit, l.quantity,
          CAST(julianday(l.expiry_date) - julianday('now') AS INTEGER) as days_left
        FROM inventory_lots l JOIN inventory i ON i.id = l.item_id
        WHERE l.status = 'active'
          AND l.expiry_date IS NOT NULL
          AND l.expiry_date <= date('now', '+30 days')
      `).all()
      lots.forEach(lot => {
        const msg = lot.days_left <= 0
          ? `Son kullanma gecti: ${lot.item_name} (lot ${lot.lot_no || lot.id}) — ${lot.quantity} ${lot.unit}`
          : `Son kullanmaya ${lot.days_left} gun: ${lot.item_name} (lot ${lot.lot_no || lot.id}) — ${lot.quantity} ${lot.unit}`
        createNotification({
          message: msg,
          type: lot.days_left <= 7 ? 'critical' : 'warning',
          module: 'inventory', target_role: 'campus_manager',
          dedup_key: `expiry_${lot.id}_${today}`,
        })
      })
    } catch (e) { console.error('[Cron] Lot expiry hatasi:', e.message) }
  }))

  // Her gece 02:00 — eski audit log + okunmuş bildirimler 90 gün, hata logları 30 gün
  cron.schedule('0 2 * * *', () => {
    try {
      const db = getDB()
      const cutoff90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
      const cutoff30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      db.prepare('DELETE FROM audit_log WHERE created_at < ?').run(cutoff90)
      db.prepare('DELETE FROM notifications WHERE is_read=1 AND created_at < ?').run(cutoff90)
      try { db.prepare('DELETE FROM error_log WHERE created_at < ?').run(cutoff30) } catch { /* tablo yoksa atla */ }
    } catch (e) { console.error('[Cron] Temizleme hatası:', e.message) }
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
