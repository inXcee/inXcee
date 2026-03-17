import { getDB } from './db/index.js'

export function logAudit(userId, action, module, targetId, detail) {
  try {
    const db = getDB()
    db.prepare('INSERT INTO audit_log(user_id,action,module,target_id,detail) VALUES(?,?,?,?,?)').run(userId, action, module, targetId ?? null, detail ?? null)
  } catch (_) {
    // non-critical — never break the main operation
  }
}
