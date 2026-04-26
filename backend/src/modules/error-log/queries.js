import { getDB } from '../../shared/db/index.js'

export function insertErrorLogQuery({ source, severity, message, stack, url, user_id, user_agent, context }) {
  const db = getDB()
  const r = db.prepare(`
    INSERT INTO error_log(source, severity, message, stack, url, user_id, user_agent, context)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    source,
    severity || 'error',
    String(message).slice(0, 2000),
    stack ? String(stack).slice(0, 8000) : null,
    url || null,
    user_id || null,
    user_agent ? String(user_agent).slice(0, 500) : null,
    context ? JSON.stringify(context).slice(0, 4000) : null,
  )
  return r.lastInsertRowid
}

export function listErrorLogsQuery({ source, severity, limit = 100, offset = 0 } = {}) {
  const db = getDB()
  const conds = []
  const params = []
  if (source) { conds.push('e.source = ?'); params.push(source) }
  if (severity) { conds.push('e.severity = ?'); params.push(severity) }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
  return db.prepare(`
    SELECT e.id, e.source, e.severity, e.message, e.url, e.user_id, e.user_agent, e.created_at,
           u.full_name as user_name, u.username
    FROM error_log e
    LEFT JOIN users u ON u.id = e.user_id
    ${where}
    ORDER BY e.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset)
}

export function getErrorLogQuery(id) {
  const db = getDB()
  return db.prepare(`
    SELECT e.*, u.full_name as user_name, u.username
    FROM error_log e
    LEFT JOIN users u ON u.id = e.user_id
    WHERE e.id = ?
  `).get(id)
}

export function deleteErrorLogQuery(id) {
  const db = getDB()
  return db.prepare('DELETE FROM error_log WHERE id = ?').run(id)
}

export function clearErrorLogQuery() {
  const db = getDB()
  return db.prepare('DELETE FROM error_log').run()
}

export function countErrorLogsQuery({ source, severity } = {}) {
  const db = getDB()
  const conds = []
  const params = []
  if (source) { conds.push('source = ?'); params.push(source) }
  if (severity) { conds.push('severity = ?'); params.push(severity) }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
  const row = db.prepare(`SELECT COUNT(*) AS c FROM error_log ${where}`).get(...params)
  return row?.c || 0
}
