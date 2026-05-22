import cron from 'node-cron'
import fs from 'fs'
import path from 'path'
import { generateDailyTasks } from '../../modules/housekeeping/queries.js'
import { createNotification } from '../notifications/service.js'
import { getDB } from '../db/index.js'
import { checkSlaViolations, checkMachineTimers, checkSlaPreWarnings, checkMachineMaintenanceAlerts, checkStuckWashingItems } from '../../modules/laundry/sla.js'
import { getEmailSettings } from '../../modules/email/queries.js'
import { sendMorningReport } from '../../modules/email/service.js'
import { buildMonthlyReport, generateMonthlyPDF } from '../../modules/inventory/analytics/routes.js'
import { expirePastLots } from '../../modules/inventory/lots/service.js'
import { logAudit } from '../audit.js'
import { logger } from '../logger.js'
import { pruneTokenBlacklist } from '../auth/service.js'
import { runBackupService, listBackupsService, deleteBackupService } from '../../modules/backup/service.js'
import { createNotification } from '../notifications/service.js'
import { captureError } from '../sentry.js'

let emailJob = null

// Tüm saat-spesifik cron'lar Türkiye saatiyle çalışsın — sunucu UTC olabilir,
// 05:50 / 06:00 / 02:00 / 03:00 gibi saatler kullanıcı için anlamlı.
const TZ = { timezone: 'Europe/Istanbul' }

// Cron overlap koruması — önceki tick bitmediyse yeni tick'i sessizce atla.
// SQLite tek writer, 1 dakikalık cron 60sn'den uzun sürerse busy_timeout'u tetikler.
const running = new Set()
function withLock(name, fn) {
  return async () => {
    if (running.has(name)) return
    running.add(name)
    try { await fn() }
    catch (e) {
      logger.error(`[Cron:${name}] hata: ${e.message}`)
      captureError(e, { module: `cron:${name}` })
      // Kritik cron'lar için campus_manager'a bildirim
      const criticalJobs = ['daily-tasks', 'auto-backup', 'cleanup']
      if (criticalJobs.includes(name)) {
        try {
          createNotification({
            message: `⚠️ Cron görevi "${name}" başarısız: ${e.message?.slice(0, 200)}`,
            event_kind: 'system_alert',
            target_role: 'campus_manager',
            dedup_key: `cron_fail_${name}_${new Date().toISOString().slice(0, 13)}`,
          })
        } catch { /* notification gönderimi başarısızsa sessizce devam */ }
      }
    }
    finally { running.delete(name) }
  }
}

export function startCronJobs() {
  // Her gün 05:50'de günlük temizlik görevleri oluştur
  cron.schedule('50 5 * * *', () => {
    try {
      const count = generateDailyTasks()
      // daily task generation completed
    } catch (e) { logger.error('[Cron] Temizlik görev hatası:', e) }
  }, TZ)

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
    } catch (e) { logger.error('[Cron] Stok cron hatası:', e) }
  }, TZ)

  // Her 1 dakikada makine zamanlayıcı kontrolü (overlap-safe)
  cron.schedule('*/1 * * * *', withLock('machine-timers', () => {
    checkMachineTimers()
  }), TZ)

  // Her 15 dakikada SLA kontrolü (overlap-safe)
  cron.schedule('*/15 * * * *', withLock('laundry-sla', async () => {
    await checkSlaViolations()
    await checkSlaPreWarnings()
    await checkMachineMaintenanceAlerts()
    checkStuckWashingItems()
  }), TZ)

  // Her ayın 1'i 03:00 — geçmiş ay aylık PDF rapor (overlap-safe)
  cron.schedule('0 3 1 * *', withLock('inventory-monthly-pdf', () => {
    let stream
    try {
      const d = new Date()
      d.setMonth(d.getMonth() - 1)
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const reportsDir = process.env.UPLOADS_DIR
        ? path.join(process.env.UPLOADS_DIR, 'reports')
        : 'uploads/reports'
      if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true })
      const filePath = path.join(reportsDir, `envanter-${month}.pdf`)
      stream = fs.createWriteStream(filePath)
      // Stream hatası — fd leak'i onler
      stream.on('error', (err) => {
        logger.error('[Cron] PDF stream hatasi:', err.message)
        try { stream.destroy() } catch { /* ignore */ }
      })
      const report = buildMonthlyReport(month)
      generateMonthlyPDF(report, stream)
      stream.on('finish', () => {
        try { logAudit(null, 'inventory_monthly_report', 'inventory', null, `${month} PDF: ${filePath}`) } catch { /* ignore */ }
      })
    } catch (e) {
      logger.error('[Cron] aylik PDF hatasi:', e.message)
      // buildMonthlyReport / generateMonthlyPDF synchronous throw ettiyse stream open kalir
      if (stream) try { stream.destroy() } catch { /* ignore */ }
    }
  }), TZ)

  // Her gün 06:00 — son kullanma 30 gün altı lot uyarısı (campus_manager)
  cron.schedule('0 6 * * *', withLock('lot-expiry', () => {
    try {
      // Once SKT gecmis lotlari otomatik expired isaretle (stoktan dusulur, hareket kaydi atilir)
      try {
        const expired = expirePastLots()
        if (expired > 0) logger.info('[Cron] auto-expired', expired, 'lots')
      } catch (e) { logger.error('[Cron] expirePastLots:', e.message) }

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
    } catch (e) { logger.error('[Cron] Lot expiry hatasi:', e.message) }
  }), TZ)

  // Her gece 02:00 — eski audit log + okunmuş bildirimler 90 gün, hata logları 30 gün
  cron.schedule('0 2 * * *', withLock('cleanup', () => {
    try {
      const db = getDB()
      const cutoff90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
      const cutoff30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      db.prepare('DELETE FROM audit_log WHERE created_at < ?').run(cutoff90)
      db.prepare('DELETE FROM notifications WHERE is_read=1 AND created_at < ?').run(cutoff90)
      try { db.prepare('DELETE FROM error_log WHERE created_at < ?').run(cutoff30) } catch { /* tablo yoksa atla */ }
      // Süresi dolmuş token blacklist kayıtlarını temizle
      const pruned = pruneTokenBlacklist()
      if (pruned > 0) logger.info(`[Cron] ${pruned} süresi dolmuş token blacklist kaydı temizlendi`)
    } catch (e) { logger.error('[Cron] Temizleme hatası:', e.message) }
  }), TZ)

  // Her 6 saatte bir otomatik yedekleme — 02:00, 08:00, 14:00, 20:00 (TR saati)
  cron.schedule('0 2,8,14,20 * * *', withLock('auto-backup', async () => {
    const result = await runBackupService()
    if (!result.ok) {
      logger.error('[Cron] Otomatik yedekleme başarısız:', result.error)
      return
    }
    logger.info(`[Cron] Otomatik yedekleme: ${result.name} (${(result.size / 1024 / 1024).toFixed(1)} MB)`)
    // 7 günden eski yedekleri sil (28 yedeği koruma hedefi)
    const backups = listBackupsService().filter(b => !b.name.includes('pre-restore'))
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
    for (const backup of backups) {
      if (new Date(backup.created_at).getTime() < cutoff) {
        deleteBackupService(backup.name)
        logger.info(`[Cron] Eski yedek silindi: ${backup.name}`)
      }
    }
  }), TZ)

  // cron jobs initialized
  scheduleMorningReport()
}

export function scheduleMorningReport() {
  if (emailJob) { emailJob.stop(); emailJob = null }
  const { enabled, hour, minute } = getEmailSettings()
  if (!enabled) return
  emailJob = cron.schedule(`${minute} ${hour} * * *`, () => {
    sendMorningReport().catch(e => logger.error('[Cron] Email hatası:', e))
  }, TZ)
}
