import { getDB } from '../../shared/db/index.js'
import { createNotification } from '../../shared/notifications/service.js'
import { EVENT_KINDS } from '../../shared/notifications/events.js'

// Deadline'a bu kadar saatten az kalınca pre-warning üret.
export const PRE_WARN_HOURS = 1

/**
 * SLA deadline'ı geçmiş, çözülmemiş (status != 'done') talepleri döner.
 * hours_open = talep açılalı kaç saat oldu (mesaj için).
 */
export function findSlaBreaches(db = getDB()) {
  return db.prepare(`
    SELECT id, location, priority, sla_deadline,
           ROUND((julianday('now') - julianday(opened_at)) * 24, 1) AS hours_open
    FROM maintenance_requests
    WHERE status != 'done'
      AND sla_deadline IS NOT NULL
      AND sla_deadline < datetime('now')
  `).all()
}

/**
 * SLA deadline'ı henüz geçmemiş ama PRE_WARN_HOURS içinde olan çözülmemiş
 * talepleri döner. hours_left = deadline'a kalan saat (mesaj için).
 */
export function findSlaPreWarnings(db = getDB()) {
  return db.prepare(`
    SELECT id, location, priority, sla_deadline,
           ROUND((julianday(sla_deadline) - julianday('now')) * 24, 1) AS hours_left
    FROM maintenance_requests
    WHERE status != 'done'
      AND sla_deadline IS NOT NULL
      AND sla_deadline >= datetime('now')
      AND sla_deadline < datetime('now', ?)
  `).all(`+${PRE_WARN_HOURS} hours`)
}

/**
 * SLA breach + pre-warning'leri sorgular ve her biri için in-app bildirim üretir.
 * Cron'dan 15 dakikada bir çağrılır. Talep başına günde 1 breach + 1 warning
 * (dedup_key ile tekilleştirme). Dönüş: { breaches, warnings } (log/test için).
 */
export function checkMaintenanceSla() {
  const db = getDB()
  const breaches = findSlaBreaches(db)
  const warnings = findSlaPreWarnings(db)

  for (const b of breaches) {
    createNotification({
      message: `SLA AŞILDI: ${b.location} (${b.priority}) — ${b.hours_open} saattir bekliyor`,
      severity: 'critical',
      module: 'maintenance',
      target_role: 'shift_supervisor',
      event_kind: EVENT_KINDS.MAINTENANCE_OVERDUE,
      entity_type: 'maintenance_request',
      entity_id: b.id,
      dedup_key: `maint_sla_breach_${b.id}`,
    })
  }

  for (const w of warnings) {
    createNotification({
      message: `SLA yaklaşıyor: ${w.location} — ${w.hours_left} saat kaldı`,
      severity: 'warning',
      module: 'maintenance',
      target_role: 'technical',
      entity_type: 'maintenance_request',
      entity_id: w.id,
      dedup_key: `maint_sla_warn_${w.id}`,
    })
  }

  return { breaches: breaches.length, warnings: warnings.length }
}
