import { getDB } from '../../shared/db/index.js'
import { createNotification } from '../../shared/notifications/service.js'

// Sözleşme bitişine bu kadar gün kala uyarı; bu kadar kala kritik.
export const CONTRACT_WARN_DAYS = 30
export const CONTRACT_CRITICAL_DAYS = 7

/**
 * Sözleşmesi uyarı penceresi içinde olan (veya süresi geçmiş) aktif personeli döner.
 * days_left = contract_end − bugün (gün, negatif = süresi geçmiş).
 */
export function findExpiringContracts(db = getDB()) {
  return db.prepare(`
    SELECT s.id, s.full_name, s.contract_end,
           d.name AS dept_name,
           CAST(julianday(date(s.contract_end)) - julianday(date('now')) AS INTEGER) AS days_left
    FROM staff s
    LEFT JOIN departments d ON d.id = s.department_id
    WHERE s.is_active = 1
      AND s.contract_end IS NOT NULL
      AND date(s.contract_end) <= date('now', ?)
    ORDER BY s.contract_end
  `).all(`+${CONTRACT_WARN_DAYS} days`)
}

/**
 * Yaklaşan/geçmiş sözleşmeler için günlük cron'dan in-app bildirim üretir.
 * dedup_key ile personel başına günde 1 bildirim. Dönüş: { count }.
 */
export function checkExpiringContracts() {
  const db = getDB()
  const rows = findExpiringContracts(db)

  for (const r of rows) {
    const dept = r.dept_name ? ` (${r.dept_name})` : ''
    const message = r.days_left >= 0
      ? `Sözleşme bitiyor: ${r.full_name}${dept} — ${r.days_left} gün kaldı`
      : `Sözleşme süresi doldu: ${r.full_name}${dept} — ${Math.abs(r.days_left)} gün önce`
    createNotification({
      message,
      severity: r.days_left <= CONTRACT_CRITICAL_DAYS ? 'critical' : 'warning',
      module: 'hr',
      target_role: 'campus_manager',
      entity_type: 'staff',
      entity_id: r.id,
      dedup_key: `hr_contract_expiry_${r.id}`,
    })
  }

  return { count: rows.length }
}
