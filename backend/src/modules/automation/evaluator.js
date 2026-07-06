import { getDB } from '../../shared/db/index.js'
import { logger } from '../../shared/logger.js'
import { getOverdueInside } from '../access/service.js'

// Trigger evaluators — her biri true/false + measured value doner.
const TRIGGERS = {
  occupancy_high(threshold) {
    const db = getDB()
    const r = db.prepare(`
      SELECT SUM(r.active_beds) AS beds,
        COALESCE(SUM(cnt.c),0) AS occupied
      FROM rooms r
      LEFT JOIN (SELECT room_id, COUNT(*) AS c FROM room_assignments WHERE check_out_at IS NULL GROUP BY room_id) cnt ON cnt.room_id=r.id
      WHERE r.status='active'
    `).get()
    const pct = r.beds > 0 ? (r.occupied / r.beds) * 100 : 0
    return { firing: pct >= threshold, value: Math.round(pct), unit: '%' }
  },
  contract_expiring(daysAhead) {
    const db = getDB()
    const r = db.prepare(`
      SELECT COUNT(*) AS c FROM companies
      WHERE is_active=1 AND contract_end IS NOT NULL
        AND julianday(contract_end) - julianday('now') BETWEEN 0 AND ?
    `).get(daysAhead)
    return { firing: r.c > 0, value: r.c, unit: ' firma' }
  },
  maintenance_backlog(threshold) {
    const db = getDB()
    const r = db.prepare(`SELECT COUNT(*) AS c FROM maintenance_requests WHERE status NOT IN ('done')`).get()
    return { firing: r.c >= threshold, value: r.c, unit: ' acik' }
  },
  drill_overdue(maxDaysAgo) {
    const db = getDB()
    try {
      const last = db.prepare(`SELECT julianday('now') - julianday(MAX(drill_date)) AS days FROM drills`).get()
      const days = last?.days != null ? Math.floor(last.days) : 999
      return { firing: days > maxDaysAgo, value: days, unit: ' gun' }
    } catch { return { firing: false, value: 0, unit: '' } }
  },
  no_recent_drill(maxDaysAgo) {
    // alias of drill_overdue
    return TRIGGERS.drill_overdue(maxDaysAgo)
  },
  access_overdue_inside(maxHours) {
    // Çıkış yapmadan maxHours'tan uzun süre içeride kalan kişi sayısı (Faz 9 güvenlik)
    const db = getDB()
    const rows = getOverdueInside(db, maxHours)
    return { firing: rows.length > 0, value: rows.length, unit: ' kişi' }
  },
}

const ACTIONS = {
  log(rule, evalResult) {
    const db = getDB()
    const msg = `[Automation] "${rule.name}" tetiklendi: ${evalResult.value}${evalResult.unit} (esik: ${rule.trigger_threshold})`
    try {
      db.prepare(`INSERT INTO error_log (level, message, context, created_at) VALUES (?,?,?,datetime('now'))`)
        .run('info', msg, JSON.stringify({ rule_id: rule.id, ...evalResult }))
    } catch { /* error_log yoksa konsola */ logger.info(msg) }
    return 'log: ok'
  },
  notify_group(rule, evalResult) {
    if (!rule.action_target) return 'skipped: target yok'
    const db = getDB()
    const members = db.prepare(`
      SELECT u.id, u.username FROM notification_group_members m
      JOIN users u ON u.id=m.user_id
      WHERE m.group_id=?
    `).all(rule.action_target)
    const msg = `${rule.name}: ${evalResult.value}${evalResult.unit}`
    try {
      // Mevcut notifications tablosuna basit yazim (eger varsa)
      const insertNotif = db.prepare(`INSERT INTO notifications (user_id, kind, severity, message, link, created_at) VALUES (?,?,?,?,?,datetime('now'))`)
      for (const m of members) {
        try { insertNotif.run(m.id, 'automation', 'warning', msg, '/expenses') } catch {}
      }
    } catch {}
    return `notify: ${members.length} kullanici`
  },
}

export function evaluateRule(rule) {
  const trig = TRIGGERS[rule.trigger_type]
  if (!trig) return { error: 'gecersiz trigger', firing: false }
  const result = trig(rule.trigger_threshold)
  if (!result.firing) return { ...result, executed: false }

  // Cooldown kontrolu
  if (rule.last_triggered_at && rule.cooldown_hours > 0) {
    const lastMs = new Date(rule.last_triggered_at).getTime()
    if (Date.now() - lastMs < rule.cooldown_hours * 3600 * 1000) {
      return { ...result, executed: false, skipped: 'cooldown' }
    }
  }

  const action = ACTIONS[rule.action_type]
  const status = action ? action(rule, result) : 'no action'

  const db = getDB()
  db.prepare(`UPDATE automation_rules SET last_triggered_at=datetime('now'), last_status=? WHERE id=?`)
    .run(`${result.value}${result.unit} -> ${status}`, rule.id)

  return { ...result, executed: true, status }
}

export function evaluateAllActive() {
  const db = getDB()
  const rules = db.prepare('SELECT * FROM automation_rules WHERE is_active=1').all()
  const results = []
  for (const r of rules) {
    try { results.push({ id: r.id, name: r.name, ...evaluateRule(r) }) }
    catch (e) { results.push({ id: r.id, name: r.name, error: e.message }) }
  }
  return results
}
