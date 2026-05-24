import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { getDB } from '../../shared/db/index.js'
import { logger } from '../../shared/logger.js'

export const feedbackRouter = Router()

// Liste — gönderen adı (personnel ya da AVS worker audit'ten)
feedbackRouter.get('/', requireRole('campus_manager', 'shift_supervisor'), (req, res) => {
  try {
    const db = getDB()
    const { type, resolved } = req.query
    let sql = `
      SELECT f.id, f.type, f.message, f.created_at, f.resolved_at,
        COALESCE(p.full_name, s.full_name, 'Anonim') AS source_name
      FROM feedback f
      LEFT JOIN personnel p ON p.id = f.personnel_id
      LEFT JOIN audit_log a ON a.action='kiosk_avs_feedback' AND a.target_id = f.id
      LEFT JOIN staff s ON s.id = json_extract(a.detail, '$.workerId')
      WHERE 1=1`
    const params = []
    if (type) { sql += ' AND f.type = ?'; params.push(type) }
    if (resolved === '1') sql += ' AND f.resolved_at IS NOT NULL'
    else if (resolved === '0') sql += ' AND f.resolved_at IS NULL'
    sql += ' ORDER BY f.created_at DESC LIMIT 200'
    res.json(db.prepare(sql).all(...params))
  } catch (e) { logger.error('[feedback list]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Çözüldü/açık işaretle
feedbackRouter.patch('/:id/resolve', requireRole('campus_manager', 'shift_supervisor'), (req, res) => {
  try {
    const db = getDB()
    const resolved = req.body?.resolved !== false
    db.prepare(`UPDATE feedback SET resolved_at = ${resolved ? "datetime('now')" : 'NULL'} WHERE id=?`).run(Number(req.params.id))
    res.json({ ok: true })
  } catch (e) { logger.error('[feedback resolve]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})
