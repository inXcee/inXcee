import { getDB } from '../../../shared/db/index.js'
export function getSlaConfigQuery() {
  const db = getDB()
  return db.prepare('SELECT * FROM laundry_sla_config ORDER BY stage').all()
}

export function upsertSlaConfigQuery({ stage, warning_hours, critical_hours, whatsapp_notify, updated_by }) {
  const db = getDB()
  db.prepare(`
    INSERT INTO laundry_sla_config(stage, warning_hours, critical_hours, whatsapp_notify, updated_by, updated_at)
    VALUES(?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(stage) DO UPDATE SET
      warning_hours = excluded.warning_hours,
      critical_hours = excluded.critical_hours,
      whatsapp_notify = excluded.whatsapp_notify,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `).run(stage, warning_hours, critical_hours, whatsapp_notify ? 1 : 0, updated_by)
}

export function getSettingsQuery() {
  const db = getDB()
  const rows = db.prepare('SELECT key, value FROM laundry_global_settings').all()
  return Object.fromEntries(rows.map(r => [r.key, r.value]))
}

export function updateSettingQuery(key, value) {
  const db = getDB()
  db.prepare(`INSERT INTO laundry_global_settings(key, value) VALUES(?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value)
}

export function getSlaViolationsQuery() {
  const db = getDB()
  return db.prepare(`
    SELECT li.*, r.block, r.room_no,
      sc.warning_hours, sc.critical_hours,
      ROUND((julianday('now') - julianday(COALESCE(li.updated_at, li.created_at))) * 24, 1) as hours_in_status,
      CASE
        WHEN ROUND((julianday('now') - julianday(COALESCE(li.updated_at, li.created_at))) * 24, 1) >= sc.critical_hours THEN 'critical'
        ELSE 'warning'
      END as sla_level
    FROM laundry_items li
    LEFT JOIN rooms r ON r.id = li.room_id
    LEFT JOIN laundry_sla_config sc ON sc.stage = li.status
    WHERE li.status IN ('dirty','washing','ready')
      AND sc.warning_hours IS NOT NULL
      AND ROUND((julianday('now') - julianday(COALESCE(li.updated_at, li.created_at))) * 24, 1) >= sc.warning_hours
    ORDER BY hours_in_status DESC
  `).all()
}

export function getSlaPreWarningsQuery() {
  const db = getDB()
  return db.prepare(`
    WITH aged AS (
      SELECT li.*, r.block, r.room_no,
        sc.warning_hours, sc.pre_warning_hours,
        ROUND((julianday('now') - julianday(COALESCE(li.updated_at, li.created_at))) * 24, 1) AS hours_in_status
      FROM laundry_items li
      LEFT JOIN rooms r ON r.id = li.room_id
      LEFT JOIN laundry_sla_config sc ON sc.stage = li.status
      WHERE li.status IN ('dirty','washing','ready')
        AND sc.warning_hours IS NOT NULL
        AND sc.pre_warning_hours IS NOT NULL
    )
    SELECT * FROM aged
    WHERE hours_in_status < warning_hours
      AND (warning_hours - hours_in_status) <= pre_warning_hours
    ORDER BY hours_in_status DESC
  `).all()
}

// ═══════════════════════════════════════════════════════════════════════════
// REPORTS / STATS
// ═══════════════════════════════════════════════════════════════════════════

