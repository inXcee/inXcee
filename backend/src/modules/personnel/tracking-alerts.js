import { getDB } from '../../shared/db/index.js'
import { createNotification } from '../../shared/notifications/service.js'
import { logger } from '../../shared/logger.js'
import { createFollowup } from './staff-followups.js'

const SEVERITIES = new Set(['info', 'warning', 'critical'])
const ALERT_STATUSES = new Set(['open', 'acknowledged', 'resolved', 'dismissed'])

function fail(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode })
}

function dateOnly(value) {
  return String(value || '').slice(0, 10)
}

function daysBetween(left, right) {
  const a = Date.parse(`${left}T00:00:00Z`)
  const b = Date.parse(`${right}T00:00:00Z`)
  return Math.round((b - a) / 86400000)
}

function severityRank(value) {
  return { info: 1, warning: 2, critical: 3 }[value] || 0
}

function notifyAlert(alert, transition) {
  for (const role of ['campus_manager', 'shift_supervisor']) {
    try {
      createNotification({
        message: alert.message,
        severity: alert.severity,
        module: 'personnel',
        target_role: role,
        entity_type: 'personnel_tracking_alert',
        entity_id: alert.id,
        link: `/shifts?tab=staff&view=tracking&alert=${alert.id}&staff=${alert.staff_id}`,
        dedup_key: `personnel-alert:${alert.id}:${transition}:${role}`,
      })
    } catch (error) {
      logger.warn({ error: error.message, alertId: alert.id, role }, '[personnel-alert] bildirim gonderilemedi')
    }
  }
}

export function listTrackingRules() {
  return getDB().prepare(`
    SELECT r.*, u.full_name AS updated_by_name
    FROM personnel_tracking_rules r
    LEFT JOIN users u ON u.id=r.updated_by
    ORDER BY r.rowid
  `).all()
}

export function updateTrackingRules(patches, userId) {
  if (!Array.isArray(patches) || !patches.length) throw fail('En az bir kural guncellemesi gerekli')
  const db = getDB()
  const update = db.transaction(() => {
    for (const patch of patches) {
      const current = db.prepare('SELECT * FROM personnel_tracking_rules WHERE rule_key=?').get(patch.rule_key)
      if (!current) throw fail(`Takip kurali bulunamadi: ${patch.rule_key}`, 404)
      const enabled = patch.enabled === undefined ? current.enabled : (patch.enabled ? 1 : 0)
      const windowDays = patch.window_days === undefined ? current.window_days : Number(patch.window_days)
      const thresholdPrimary = patch.threshold_primary === undefined ? current.threshold_primary : Number(patch.threshold_primary)
      const thresholdSecondary = patch.threshold_secondary === undefined
        ? current.threshold_secondary
        : (patch.threshold_secondary === null ? null : Number(patch.threshold_secondary))
      const severity = patch.severity === undefined ? current.severity : patch.severity
      const dueDays = patch.due_days === undefined ? current.due_days : Number(patch.due_days)
      if (!Number.isInteger(windowDays) || windowDays < 0 || windowDays > 3660) throw fail('Kural donemi gecersiz')
      if (!Number.isFinite(thresholdPrimary) || thresholdPrimary < 0) throw fail('Birincil esik gecersiz')
      if (thresholdSecondary !== null && (!Number.isFinite(thresholdSecondary) || thresholdSecondary < 0)) throw fail('Ikincil esik gecersiz')
      if (!SEVERITIES.has(severity)) throw fail('Uyari onemi gecersiz')
      if (!Number.isInteger(dueDays) || dueDays < 0 || dueDays > 365) throw fail('Hedef sure gecersiz')
      db.prepare(`
        UPDATE personnel_tracking_rules
        SET enabled=?, window_days=?, threshold_primary=?, threshold_secondary=?,
          severity=?, due_days=?, updated_by=?
        WHERE rule_key=?
      `).run(enabled, windowDays, thresholdPrimary, thresholdSecondary, severity, dueDays, userId, patch.rule_key)
    }
  })
  update()
  return listTrackingRules()
}

function detection(rule, staffId, values) {
  return {
    staff_id: Number(staffId),
    rule_key: rule.rule_key,
    title: values.title || rule.label,
    message: values.message,
    severity: values.severity || rule.severity,
    metric_value: Number(values.metric_value || 0),
    metric_secondary: values.metric_secondary == null ? null : Number(values.metric_secondary),
    period_start: values.period_start || null,
    period_end: values.period_end || null,
    assigned_user_id: values.assigned_user_id || null,
    due_days: Number(rule.due_days || 0),
  }
}

function sickLeaveDetections(db, rule, today) {
  const start = db.prepare("SELECT date(?, ?) AS value").get(today, `-${Math.max(0, rule.window_days - 1)} days`).value
  return db.prepare(`
    SELECT lr.staff_id, s.full_name,
      SUM(CAST(julianday(MIN(lr.end_date, ?)) - julianday(MAX(lr.start_date, ?)) + 1 AS INTEGER)) AS days,
      COUNT(*) AS occurrences
    FROM leave_requests lr
    JOIN staff s ON s.id=lr.staff_id
    WHERE s.is_active=1 AND lr.status='approved' AND lr.leave_type='sick'
      AND lr.end_date>=? AND lr.start_date<=?
    GROUP BY lr.staff_id
    HAVING days>=? OR occurrences>=?
  `).all(today, start, start, today, rule.threshold_primary, rule.threshold_secondary ?? Number.MAX_SAFE_INTEGER)
    .map(row => detection(rule, row.staff_id, {
      message: `${row.full_name}: ${row.days} raporlu gun, ${row.occurrences} ayri rapor`,
      metric_value: row.days,
      metric_secondary: row.occurrences,
      period_start: start,
      period_end: today,
    }))
}

function overtimeDetections(db, rule, today) {
  const start = `${today.slice(0, 7)}-01`
  return db.prepare(`
    SELECT ot.staff_id, s.full_name, SUM(ot.hours) AS hours
    FROM overtime_records ot
    JOIN staff s ON s.id=ot.staff_id
    WHERE s.is_active=1 AND ot.work_date BETWEEN ? AND ?
    GROUP BY ot.staff_id
    HAVING hours>=?
  `).all(start, today, rule.threshold_primary).map(row => detection(rule, row.staff_id, {
    message: `${row.full_name}: bu ay ${Number(row.hours).toFixed(1)} saat fazla mesai`,
    metric_value: row.hours,
    period_start: start,
    period_end: today,
  }))
}

function eventCountDetections(db, rule, today, eventType, noun) {
  const start = db.prepare("SELECT date(?, ?) AS value").get(today, `-${Math.max(0, rule.window_days - 1)} days`).value
  const revisionClause = eventType === 'assignment_changed' ? 'AND e.before_json IS NOT NULL' : ''
  return db.prepare(`
    SELECT e.staff_id, s.full_name, COUNT(*) AS event_count
    FROM personnel_tracking_events e
    JOIN staff s ON s.id=e.staff_id
    WHERE s.is_active=1 AND e.event_type=? AND date(e.effective_at) BETWEEN ? AND ?
      ${revisionClause}
    GROUP BY e.staff_id
    HAVING event_count>=?
  `).all(eventType, start, today, rule.threshold_primary).map(row => detection(rule, row.staff_id, {
    message: `${row.full_name}: ${rule.window_days} gunde ${row.event_count} ${noun}`,
    metric_value: row.event_count,
    period_start: start,
    period_end: today,
  }))
}

function absenceDetections(db, rule, today) {
  const start = db.prepare("SELECT date(?, ?) AS value").get(today, `-${Math.max(0, rule.window_days - 1)} days`).value
  const rows = db.prepare(`
    SELECT ss.staff_id, s.full_name, ss.work_date
    FROM shift_schedule ss
    JOIN staff s ON s.id=ss.staff_id
    WHERE s.is_active=1 AND ss.status='absent' AND ss.work_date BETWEEN ? AND ?
    ORDER BY ss.staff_id, ss.work_date
  `).all(start, today)
  const grouped = new Map()
  for (const row of rows) {
    if (!grouped.has(row.staff_id)) grouped.set(row.staff_id, { full_name: row.full_name, dates: [] })
    grouped.get(row.staff_id).dates.push(row.work_date)
  }
  const result = []
  for (const [staffId, group] of grouped) {
    let longest = group.dates.length ? 1 : 0
    let current = longest
    for (let index = 1; index < group.dates.length; index += 1) {
      current = daysBetween(group.dates[index - 1], group.dates[index]) === 1 ? current + 1 : 1
      longest = Math.max(longest, current)
    }
    if (group.dates.length >= rule.threshold_primary || longest >= (rule.threshold_secondary ?? Number.MAX_SAFE_INTEGER)) {
      result.push(detection(rule, staffId, {
        message: `${group.full_name}: ${group.dates.length} devamsiz gun, en uzun seri ${longest} gun`,
        metric_value: group.dates.length,
        metric_secondary: longest,
        period_start: start,
        period_end: today,
      }))
    }
  }
  return result
}

function offboardingOverdueDetections(db, rule, today) {
  return db.prepare(`
    SELECT id, full_name, exit_date, offboarding_owner_user_id
    FROM staff
    WHERE is_active=1 AND offboarding_started_at IS NOT NULL AND exit_date<?
  `).all(today).map(row => detection(rule, row.id, {
    message: `${row.full_name}: cikis tarihi ${row.exit_date} gecti, surec tamamlanmadi`,
    metric_value: 1,
    period_end: today,
    assigned_user_id: row.offboarding_owner_user_id,
  }))
}

function futureAfterExitDetections(db, rule, today) {
  return db.prepare(`
    SELECT s.id, s.full_name, s.exit_date,
      (SELECT COUNT(*) FROM shift_schedule ss WHERE ss.staff_id=s.id AND ss.work_date>s.exit_date) AS schedules,
      (SELECT COUNT(*) FROM leave_requests lr WHERE lr.staff_id=s.id AND lr.end_date>s.exit_date AND lr.status IN ('pending','approved')) AS leaves
    FROM staff s
    WHERE s.exit_date IS NOT NULL
      AND (
        EXISTS(SELECT 1 FROM shift_schedule ss WHERE ss.staff_id=s.id AND ss.work_date>s.exit_date)
        OR EXISTS(SELECT 1 FROM leave_requests lr WHERE lr.staff_id=s.id AND lr.end_date>s.exit_date AND lr.status IN ('pending','approved'))
      )
  `).all().map(row => detection(rule, row.id, {
    message: `${row.full_name}: cikis sonrasinda ${row.schedules} vardiya ve ${row.leaves} izin kaydi`,
    metric_value: Number(row.schedules) + Number(row.leaves),
    metric_secondary: row.leaves,
    period_start: row.exit_date,
    period_end: today,
  }))
}

function leaveMismatchDetections(db, rule, today) {
  const year = Number(today.slice(0, 4))
  return db.prepare(`
    SELECT s.id, s.full_name, COALESCE(lb.annual_used,0) AS balance_used,
      COALESCE((SELECT SUM(lr.total_days) FROM leave_requests lr
        WHERE lr.staff_id=s.id AND lr.leave_type='annual' AND lr.status='approved'
          AND substr(lr.start_date,1,4)=CAST(? AS TEXT)),0) AS approved_used
    FROM staff s
    LEFT JOIN leave_balance lb ON lb.staff_id=s.id AND lb.year=?
    WHERE s.is_active=1
      AND ABS(COALESCE(lb.annual_used,0) - COALESCE((SELECT SUM(lr.total_days) FROM leave_requests lr
        WHERE lr.staff_id=s.id AND lr.leave_type='annual' AND lr.status='approved'
          AND substr(lr.start_date,1,4)=CAST(? AS TEXT)),0))>=?
  `).all(year, year, year, rule.threshold_primary).map(row => detection(rule, row.id, {
    message: `${row.full_name}: bakiye ${row.balance_used} gun, onayli izin ${row.approved_used} gun`,
    metric_value: Math.abs(Number(row.balance_used) - Number(row.approved_used)),
    metric_secondary: row.approved_used,
    period_start: `${year}-01-01`,
    period_end: today,
  }))
}

function overdueFollowupDetections(db, rule, today) {
  return db.prepare(`
    SELECT f.staff_id, s.full_name, COUNT(*) AS followup_count, MIN(f.due_at) AS earliest_due
    FROM staff_followups f
    JOIN staff s ON s.id=f.staff_id
    WHERE f.status='open' AND f.priority='critical' AND f.due_at<datetime('now','localtime')
    GROUP BY f.staff_id
    HAVING followup_count>=?
  `).all(rule.threshold_primary).map(row => detection(rule, row.staff_id, {
    message: `${row.full_name}: ${row.followup_count} gecikmis kritik takip gorevi`,
    metric_value: row.followup_count,
    period_start: dateOnly(row.earliest_due),
    period_end: today,
  }))
}

function collectDetections(db, rules, today) {
  const result = []
  for (const rule of rules.filter(row => row.enabled)) {
    if (rule.rule_key === 'sick_leave') result.push(...sickLeaveDetections(db, rule, today))
    else if (rule.rule_key === 'overtime_monthly') result.push(...overtimeDetections(db, rule, today))
    else if (rule.rule_key === 'shift_changes') result.push(...eventCountDetections(db, rule, today, 'shift_changed', 'vardiya revizyonu'))
    else if (rule.rule_key === 'permanent_movements') result.push(...eventCountDetections(db, rule, today, 'assignment_changed', 'kalici atama degisikligi'))
    else if (rule.rule_key === 'absence') result.push(...absenceDetections(db, rule, today))
    else if (rule.rule_key === 'offboarding_overdue') result.push(...offboardingOverdueDetections(db, rule, today))
    else if (rule.rule_key === 'future_after_exit') result.push(...futureAfterExitDetections(db, rule, today))
    else if (rule.rule_key === 'leave_balance_mismatch') result.push(...leaveMismatchDetections(db, rule, today))
    else if (rule.rule_key === 'overdue_critical_followup') result.push(...overdueFollowupDetections(db, rule, today))
  }
  return result
}

function upsertDetection(db, row) {
  const existing = db.prepare(`
    SELECT * FROM personnel_tracking_alerts WHERE staff_id=? AND rule_key=?
  `).get(row.staff_id, row.rule_key)
  const dueAt = db.prepare("SELECT datetime('now','localtime', ?) AS value")
    .get(`+${row.due_days} days`).value
  if (!existing) {
    const id = db.prepare(`
      INSERT INTO personnel_tracking_alerts(
        staff_id, rule_key, title, message, severity, status,
        metric_value, metric_secondary, period_start, period_end,
        assigned_user_id, due_at
      ) VALUES(?,?,?,?,?,'open',?,?,?,?,?,?)
    `).run(row.staff_id, row.rule_key, row.title, row.message, row.severity,
      row.metric_value, row.metric_secondary, row.period_start, row.period_end,
      row.assigned_user_id, dueAt).lastInsertRowid
    return { alert: db.prepare('SELECT * FROM personnel_tracking_alerts WHERE id=?').get(id), transition: 'created' }
  }

  let status = existing.status
  let transition = null
  if (existing.status === 'resolved') {
    status = 'open'
    transition = 'reopened'
  } else if (severityRank(row.severity) > severityRank(existing.severity)) {
    transition = 'escalated'
  }
  db.prepare(`
    UPDATE personnel_tracking_alerts
    SET title=?, message=?, severity=?, status=?, metric_value=?, metric_secondary=?,
      period_start=?, period_end=?, assigned_user_id=COALESCE(assigned_user_id,?),
      due_at=COALESCE(due_at,?), last_detected_at=CURRENT_TIMESTAMP,
      resolved_at=CASE WHEN ?='resolved' THEN resolved_at ELSE NULL END
    WHERE id=?
  `).run(row.title, row.message, row.severity, status, row.metric_value, row.metric_secondary,
    row.period_start, row.period_end, row.assigned_user_id, dueAt, status, existing.id)
  return { alert: db.prepare('SELECT * FROM personnel_tracking_alerts WHERE id=?').get(existing.id), transition }
}

export function evaluatePersonnelAlerts() {
  const db = getDB()
  const today = db.prepare("SELECT date('now','localtime') AS value").get().value
  const rules = listTrackingRules()
  const detections = collectDetections(db, rules, today)
  const activeKeys = new Set(detections.map(row => `${row.staff_id}:${row.rule_key}`))
  const notifications = []
  const save = db.transaction(() => {
    db.prepare(`
      UPDATE personnel_tracking_alerts
      SET followup_id=NULL, status='open'
      WHERE followup_id IN (SELECT id FROM staff_followups WHERE status IN ('done','cancelled'))
        AND status IN ('open','acknowledged')
    `).run()
    for (const row of detections) {
      const result = upsertDetection(db, row)
      if (result.transition && result.alert.status !== 'dismissed') notifications.push(result)
    }
    const candidates = db.prepare(`
      SELECT id, staff_id, rule_key
      FROM personnel_tracking_alerts
      WHERE status IN ('open','acknowledged')
    `).all()
    for (const alert of candidates) {
      if (!activeKeys.has(`${alert.staff_id}:${alert.rule_key}`)) {
        db.prepare(`
          UPDATE personnel_tracking_alerts
          SET status='resolved', resolved_at=CURRENT_TIMESTAMP
          WHERE id=?
        `).run(alert.id)
      }
    }
  })
  save()
  for (const item of notifications) notifyAlert(item.alert, item.transition)
  return { evaluated_at: new Date().toISOString(), detections: detections.length }
}

export function listPersonnelAlerts(filters = {}) {
  evaluatePersonnelAlerts()
  const {
    status, severity, limit = 200,
    staffId = filters.staff_id,
    assignedUserId = filters.assigned_user_id,
  } = filters
  const where = ['1=1']
  const params = []
  if (status) {
    if (!ALERT_STATUSES.has(status)) throw fail('Uyari durumu gecersiz')
    where.push('a.status=?'); params.push(status)
  }
  if (severity) {
    if (!SEVERITIES.has(severity)) throw fail('Uyari onemi gecersiz')
    where.push('a.severity=?'); params.push(severity)
  }
  if (staffId) { where.push('a.staff_id=?'); params.push(positiveInteger(staffId, 'Personel kimligi')) }
  if (assignedUserId) { where.push('a.assigned_user_id=?'); params.push(positiveInteger(assignedUserId, 'Sorumlu kimligi')) }
  const safeLimit = Math.min(500, Math.max(1, Number(limit) || 200))
  return getDB().prepare(`
    SELECT a.*, s.full_name, s.project_id, p.name AS project_name,
      s.department_id, d.name AS department_name,
      u.full_name AS assigned_user_name, f.status AS followup_status
    FROM personnel_tracking_alerts a
    JOIN staff s ON s.id=a.staff_id
    LEFT JOIN projects p ON p.id=s.project_id
    LEFT JOIN departments d ON d.id=s.department_id
    LEFT JOIN users u ON u.id=a.assigned_user_id
    LEFT JOIN staff_followups f ON f.id=a.followup_id
    WHERE ${where.join(' AND ')}
    ORDER BY CASE a.severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
      a.due_at IS NULL, a.due_at, a.last_detected_at DESC
    LIMIT ?
  `).all(...params, safeLimit)
}

function positiveInteger(value, label) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) throw fail(`${label} gecersiz`)
  return parsed
}

export function updatePersonnelAlert(alertId, data, userId) {
  const db = getDB()
  const id = positiveInteger(alertId, 'Uyari kimligi')
  const alert = db.prepare('SELECT * FROM personnel_tracking_alerts WHERE id=?').get(id)
  if (!alert) throw fail('Uyari bulunamadi', 404)
  const fields = []
  const params = []
  const set = (field, value) => { fields.push(`${field}=?`); params.push(value) }
  if (data.status !== undefined) {
    if (!ALERT_STATUSES.has(data.status)) throw fail('Uyari durumu gecersiz')
    set('status', data.status)
    if (data.status === 'acknowledged') {
      set('acknowledged_by', userId)
      fields.push('acknowledged_at=CURRENT_TIMESTAMP')
    }
    if (data.status === 'resolved') fields.push('resolved_at=CURRENT_TIMESTAMP')
    if (data.status === 'dismissed') {
      const reason = String(data.dismissed_reason || '').trim()
      if (!reason) throw fail('Uyari kapatma aciklamasi zorunlu')
      set('dismissed_reason', reason)
    }
  }
  if (data.assigned_user_id !== undefined) {
    const assigned = data.assigned_user_id ? positiveInteger(data.assigned_user_id, 'Sorumlu kimligi') : null
    if (assigned && !db.prepare('SELECT 1 FROM users WHERE id=?').get(assigned)) throw fail('Sorumlu kullanici bulunamadi')
    set('assigned_user_id', assigned)
  }
  if (data.due_at !== undefined) set('due_at', data.due_at || null)
  if (!fields.length) return alert
  params.push(id)
  db.prepare(`UPDATE personnel_tracking_alerts SET ${fields.join(', ')} WHERE id=?`).run(...params)
  return db.prepare('SELECT * FROM personnel_tracking_alerts WHERE id=?').get(id)
}

export function convertAlertToFollowup(alertId, data, userId) {
  const db = getDB()
  const id = positiveInteger(alertId, 'Uyari kimligi')
  const alert = db.prepare(`
    SELECT a.*, s.full_name FROM personnel_tracking_alerts a
    JOIN staff s ON s.id=a.staff_id
    WHERE a.id=?
  `).get(id)
  if (!alert) throw fail('Uyari bulunamadi', 404)
  if (alert.followup_id) {
    const existing = db.prepare('SELECT id, status FROM staff_followups WHERE id=?').get(alert.followup_id)
    if (existing?.status === 'open') return { id: existing.id, existing: true }
  }

  const result = createFollowup(alert.staff_id, {
    title: data.title || alert.title,
    description: data.description || alert.message,
    category: alert.rule_key === 'offboarding_overdue' || alert.rule_key === 'future_after_exit' ? 'offboarding' : 'attendance',
    priority: alert.severity === 'critical' ? 'critical' : (alert.severity === 'warning' ? 'high' : 'medium'),
    assigned_user_id: data.assigned_user_id || alert.assigned_user_id || null,
    due_at: data.due_at || alert.due_at || null,
  }, { userId })
  db.prepare(`
    UPDATE personnel_tracking_alerts
    SET followup_id=?, assigned_user_id=COALESCE(?,assigned_user_id),
      due_at=COALESCE(?,due_at), status='acknowledged',
      acknowledged_by=?, acknowledged_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(result.id, data.assigned_user_id || null, data.due_at || null, userId, id)
  return result
}
