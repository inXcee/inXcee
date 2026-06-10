import { getDB } from '../../../shared/db/index.js'

// Operatör performans kırılımı — kiosk işçileri (worker_id → staff) + hub
// kullanıcıları (action_by → users) birleşik; aksiyon tipi history to_status'tan
export function getOperatorSummaryQuery(days = 1) {
  const db = getDB()
  const offset = `-${Math.max(1, Math.min(90, days)) - 1} days`
  return db.prepare(`
    SELECT COALESCE(w.full_name, u.full_name, 'Bilinmeyen') as operator,
      SUM(CASE WHEN lh.to_status='dirty' THEN 1 ELSE 0 END) as giris,
      SUM(CASE WHEN lh.to_status='washing' THEN 1 ELSE 0 END) as yikama,
      SUM(CASE WHEN lh.to_status='ready' THEN 1 ELSE 0 END) as hazir,
      SUM(CASE WHEN lh.to_status='delivered' THEN 1 ELSE 0 END) as teslim,
      SUM(CASE WHEN lh.to_status='lost' THEN 1 ELSE 0 END) as kayip,
      COUNT(*) as toplam
    FROM laundry_history lh
    LEFT JOIN staff w ON w.id = lh.worker_id
    LEFT JOIN users u ON u.id = lh.action_by
    WHERE date(lh.created_at, 'localtime') >= date('now', 'localtime', ?)
      AND (lh.worker_id IS NOT NULL OR lh.action_by IS NOT NULL)
    GROUP BY operator
    ORDER BY toplam DESC
  `).all(offset)
}

export function getStatsQuery({ from_date, to_date } = {}) {
  const db = getDB()

  const by_status = db.prepare(`
    SELECT status, COUNT(*) as count FROM laundry_items
    WHERE status != 'delivered' GROUP BY status
  `).all()

  const delivered_today = db.prepare(`
    SELECT COUNT(*) as count FROM laundry_deliveries
    WHERE date(delivered_at) = date('now')
  `).get()

  const washed_today = db.prepare(`
    SELECT COUNT(*) as count FROM laundry_history
    WHERE to_status = 'washing'
      AND date(created_at) = date('now')
  `).get()

  const avg_hours = db.prepare(`
    SELECT li.status,
      ROUND(AVG((julianday('now') - julianday(COALESCE(li.updated_at, li.created_at))) * 24), 1) as avg_h
    FROM laundry_items li
    WHERE li.status IN ('dirty','washing','ready')
    GROUP BY li.status
  `).all()

  const sla_violations = db.prepare(`
    SELECT COUNT(*) as count FROM laundry_items li
    LEFT JOIN laundry_sla_config sc ON sc.stage = li.status
    WHERE li.status IN ('dirty','washing','ready')
      AND ROUND((julianday('now') - julianday(COALESCE(li.updated_at, li.created_at))) * 24, 1)
        >= COALESCE(sc.warning_hours, 9999)
  `).get()

  let period_total = { count: 0 }
  let period_delivered = { count: 0 }
  if (from_date && to_date) {
    period_total = db.prepare(`
      SELECT COUNT(*) as count FROM laundry_items
      WHERE created_at >= ? AND created_at <= ?
    `).get(from_date, to_date)
    period_delivered = db.prepare(`
      SELECT COUNT(*) as count FROM laundry_deliveries
      WHERE delivered_at >= ? AND delivered_at <= ?
    `).get(from_date, to_date)
  }

  const machine_stats = db.prepare(`
    SELECT lm.name, lm.type, lm.status, lm.total_runs, lm.maintenance_notes,
      lm.runs_since_maintenance, lm.last_maintenance_at,
      (SELECT COUNT(*) FROM laundry_items WHERE machine_id = lm.id AND status = 'washing') as active_loads,
      CASE WHEN lm.runs_since_maintenance >= 50 THEN 1 ELSE 0 END as needs_maintenance,
      (SELECT COUNT(*) FROM laundry_machine_runs r WHERE r.machine_id = lm.id
         AND date(r.started_at, 'localtime') = date('now', 'localtime')) as runs_today,
      (SELECT COUNT(*) FROM laundry_machine_runs r WHERE r.machine_id = lm.id
         AND date(r.started_at, 'localtime') >= date('now', 'localtime', '-6 days')) as runs_7d,
      (SELECT COUNT(*) FROM laundry_machine_runs r WHERE r.machine_id = lm.id
         AND date(r.started_at, 'localtime') >= date('now', 'localtime', '-29 days')) as runs_30d
    FROM laundry_machines lm ORDER BY lm.type, lm.name
  `).all()

  // En aktif odalar (seçili dönem)
  let by_room = []
  let clothing_breakdown = []
  let lost_period = { count: 0 }
  let avg_delivery_hours = null

  if (from_date && to_date) {
    by_room = db.prepare(`
      SELECT r.block, r.room_no,
        COUNT(*) as total,
        SUM(CASE WHEN li.status='delivered' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN li.status='lost' THEN 1 ELSE 0 END) as lost
      FROM laundry_items li
      LEFT JOIN rooms r ON r.id = li.room_id
      WHERE li.created_at >= ? AND li.created_at <= ?
      GROUP BY li.room_id
      ORDER BY total DESC
      LIMIT 10
    `).all(from_date, to_date)

    lost_period = db.prepare(`
      SELECT COUNT(*) as count FROM laundry_items
      WHERE status='lost' AND created_at >= ? AND created_at <= ?
    `).get(from_date, to_date)

    avg_delivery_hours = db.prepare(`
      SELECT ROUND(AVG((julianday(ld.delivered_at) - julianday(li.created_at)) * 24), 1) as avg_h
      FROM laundry_deliveries ld
      JOIN laundry_items li ON li.id = ld.item_id
      WHERE ld.delivered_at >= ? AND ld.delivered_at <= ?
    `).get(from_date, to_date)?.avg_h

    // Kıyafet tipi dağılımı (clothing_items JSON parse)
    const rawItems = db.prepare(`
      SELECT clothing_items FROM laundry_items
      WHERE clothing_items IS NOT NULL AND created_at >= ? AND created_at <= ?
    `).all(from_date, to_date)

    const typeCounts = {}
    for (const row of rawItems) {
      try {
        const items = JSON.parse(row.clothing_items)
        for (const item of items) {
          typeCounts[item.type] = (typeCounts[item.type] || 0) + (item.qty || 1)
        }
      } catch {}
    }
    clothing_breakdown = Object.entries(typeCounts)
      .map(([type, qty]) => ({ type, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10)
  }

  const weekly_trend = db.prepare(`
    SELECT
      date(created_at) as day,
      COUNT(*) as received,
      SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered
    FROM laundry_items
    WHERE date(created_at) >= date('now', '-6 days')
    GROUP BY date(created_at)
    ORDER BY day ASC
  `).all()

  return { by_status, delivered_today, washed_today, avg_hours, sla_violations, period_total, period_delivered, machine_stats, by_room, lost_period, avg_delivery_hours, clothing_breakdown, weekly_trend }
}

// ═══════════════════════════════════════════════════════════════════════════
// PERSON HISTORY
// ═══════════════════════════════════════════════════════════════════════════

