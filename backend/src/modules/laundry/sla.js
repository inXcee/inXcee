import { getDB } from '../../shared/db/index.js'
import { createNotification } from '../../shared/notifications/service.js'

/**
 * SLA ihlallerini kontrol eder ve SSE bildirimi gönderir.
 * Her 15 dakikada cron ile çalışır.
 */
export function checkSlaViolations() {
  const db = getDB()
  const violations = db.prepare(`
    SELECT li.id, li.status, li.item_count,
           r.block, r.room_no,
           ROUND((julianday('now') - julianday(COALESCE(li.updated_at, li.created_at))) * 24, 1) as hours,
           sc.warning_hours, sc.critical_hours
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
  }

  return violations.length
}

/**
 * Süresi dolan makineleri 'done' olarak işaretler ve bildirim gönderir.
 */
export function checkMachineTimers() {
  const db = getDB()
  const done = db.prepare(`
    SELECT * FROM laundry_machines
    WHERE status = 'running'
      AND timer_end IS NOT NULL
      AND datetime('now') >= datetime(timer_end)
  `).all()

  for (const m of done) {
    db.prepare("UPDATE laundry_machines SET status = 'done' WHERE id = ?").run(m.id)
    createNotification({
      message: `${m.name} tamamlandı — çamaşırları rafa kaldırın`,
      type: 'info',
      module: 'laundry',
      target_role: 'laundry',
    })
  }

  return done.length
}
