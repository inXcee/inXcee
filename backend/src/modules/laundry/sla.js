import { getDB } from '../../shared/db/index.js'
import { createNotification } from '../../shared/notifications/service.js'
import { sendSlaAlert, shouldSendSlaNotification } from './whatsapp.js'

/**
 * SLA ihlallerini kontrol eder ve SSE bildirimi gönderir.
 * Her 15 dakikada cron ile çalışır.
 */
export async function checkSlaViolations() {
  const db = getDB()
  const violations = db.prepare(`
    SELECT li.id, li.status, li.item_count,
           r.block, r.room_no,
           ROUND((julianday('now') - julianday(COALESCE(li.updated_at, li.created_at))) * 24, 1) as hours,
           sc.warning_hours, sc.critical_hours, sc.whatsapp_notify
    FROM laundry_items li
    LEFT JOIN rooms r ON r.id = li.room_id
    LEFT JOIN laundry_sla_config sc ON sc.stage = li.status
    WHERE li.status IN ('dirty','washing','ready')
      AND sc.warning_hours IS NOT NULL
      AND ROUND((julianday('now') - julianday(COALESCE(li.updated_at, li.created_at))) * 24, 1) >= sc.warning_hours
  `).all()

  for (const v of violations) {
    const isCritical = v.hours >= v.critical_hours
    const label = { dirty: 'Kirli sepette', washing: 'Makinede', ready: 'Rafta hazır' }[v.status]

    createNotification({
      message: `SLA ${isCritical ? 'KRİTİK' : 'UYARI'}: ${v.block || '?'} ${v.room_no || '?'} — ${label} ${v.hours} saattir`,
      type: isCritical ? 'critical' : 'warning',
      module: 'laundry',
      target_role: isCritical ? null : 'shift_supervisor',
    })

    if (v.whatsapp_notify && shouldSendSlaNotification(db, v.id, v.status)) {
      await sendSlaAlert(v.id, v.hours, db).catch(() => {})
    }
  }

  return violations.length
}

/**
 * SLA ihlali yaklaşan öğeleri kontrol eder (pre_warning_hours içinde).
 * Her 15 dakikada cron ile çalışır.
 */
export function checkSlaPreWarnings() {
  const db = getDB()
  const approaching = db.prepare(`
    WITH aged AS (
      SELECT li.id, li.status, li.item_count,
             r.block, r.room_no,
             sc.warning_hours, sc.pre_warning_hours,
             ROUND((julianday('now') - julianday(COALESCE(li.updated_at, li.created_at))) * 24, 2) AS hours
      FROM laundry_items li
      LEFT JOIN rooms r ON r.id = li.room_id
      LEFT JOIN laundry_sla_config sc ON sc.stage = li.status
      WHERE li.status IN ('dirty','washing','ready')
        AND sc.warning_hours IS NOT NULL
        AND sc.pre_warning_hours IS NOT NULL
    )
    SELECT * FROM aged
    WHERE hours < warning_hours
      AND (warning_hours - hours) <= pre_warning_hours
  `).all()

  for (const v of approaching) {
    const stage = 'pre_warning_' + v.status
    if (!shouldSendSlaNotification(db, v.id, stage)) continue
    const label = { dirty: 'Kirli sepette', washing: 'Makinede', ready: 'Rafta hazır' }[v.status] || v.status
    const hoursLeft = Math.round((v.warning_hours - v.hours) * 10) / 10
    createNotification({
      message: `⚠️ SLA YAKLAŞIYOR: ${v.block || '?'}·${v.room_no || '?'} — ${label}, ${hoursLeft}s kaldı`,
      type: 'warning',
      module: 'laundry',
      target_role: 'laundry',
    })
    // Aynı gün tekrar gönderme — laundry_sla_notifications tablosuna kaydet
    db.prepare(`INSERT OR IGNORE INTO laundry_sla_notifications(item_id, stage, phone) VALUES(?,?,NULL)`)
      .run(v.id, stage)
  }

  return approaching.length
}

/**
 * Süresi dolan makineleri 'done' olarak işaretler ve bildirim gönderir.
 * Her 1 dakikada cron ile çalışır.
 */
export function checkMachineTimers() {
  const db = getDB()
  const done = db.prepare(`
    SELECT lm.*,
      GROUP_CONCAT(r.block || '·' || r.room_no, ', ') as rooms
    FROM laundry_machines lm
    LEFT JOIN laundry_items li ON li.machine_id = lm.id AND li.status = 'washing'
    LEFT JOIN rooms r ON r.id = li.room_id
    WHERE lm.status = 'running'
      AND lm.timer_end IS NOT NULL
      AND datetime('now') >= datetime(lm.timer_end)
    GROUP BY lm.id
  `).all()

  for (const m of done) {
    db.prepare("UPDATE laundry_machines SET status = 'done', total_runs = total_runs + 1 WHERE id = ?").run(m.id)
    const roomInfo = m.rooms ? ` — ${m.rooms}` : ''
    createNotification({
      message: `${m.name} tamamlandı${roomInfo}`,
      type: 'info',
      module: 'laundry',
      target_role: 'laundry',
    })
  }

  return done.length
}

const MAINTENANCE_THRESHOLD = 50

export function checkMachineMaintenanceAlerts() {
  const db = getDB()
  const machines = db.prepare(`
    SELECT * FROM laundry_machines
    WHERE total_runs >= ? AND status != 'maintenance'
  `).all(MAINTENANCE_THRESHOLD)

  for (const m of machines) {
    createNotification({
      message: `${m.name} bakım gerekiyor — ${m.total_runs} çalışma tamamlandı`,
      type: 'warning',
      module: 'laundry',
      target_role: 'campus_manager',
    })
  }

  return machines.length
}
