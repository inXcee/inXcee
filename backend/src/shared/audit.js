import { getDB } from './db/index.js'
import { logger } from './logger.js'
import { incAuditWriteFailure } from './metrics.js'

export function logAudit(userId, action, module, targetId, detail) {
  try {
    const db = getDB()
    db.prepare('INSERT INTO audit_log(user_id,action,module,target_id,detail) VALUES(?,?,?,?,?)').run(userId, action, module, targetId ?? null, detail ?? null)
  } catch (err) {
    // Ana işlemi asla bozma — ama sessizce yutma da. Audit kaybı denetim izinde
    // boşluk bırakır (genelde user_id FK ihlali ya da şema kayması). Görünür olsun:
    // Prometheus sayacı + warn log (PII sızmasın diye yalnızca action/module/userId).
    incAuditWriteFailure(module)
    logger.warn(
      { err: err.message, action, module, userId, targetId },
      '[Audit] yazma başarısız — denetim izinde boşluk'
    )
  }
}
