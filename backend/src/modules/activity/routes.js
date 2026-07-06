import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { getDB } from '../../shared/db/index.js'
import { logger } from '../../shared/logger.js'
import { getStaffActivity } from './service.js'

export const activityRouter = Router()
const view = requireRole('campus_manager', 'shift_supervisor')

// query: from=YYYY-MM-DD, to=YYYY-MM-DD, types=access,meal,... , limit
function parseOpts(q) {
  return {
    from: typeof q.from === 'string' && q.from ? q.from : null,
    to: typeof q.to === 'string' && q.to ? q.to : null,
    types: typeof q.types === 'string' && q.types ? q.types.split(',').map(s => s.trim()).filter(Boolean) : null,
    limit: +q.limit || 60,
  }
}

// ── Personelin birleşik hareket geçmişi (yönetim) ──
activityRouter.get('/staff/:id', ...view, (req, res) => {
  try {
    const db = getDB()
    const staff = db.prepare('SELECT id, full_name FROM staff WHERE id=?').get(+req.params.id)
    if (!staff) return res.status(404).json({ error: 'Personel bulunamadı' })
    const items = getStaffActivity(db, +req.params.id, parseOpts(req.query))
    res.json({ staff, items })
  } catch (e) { logger.error('[activity/staff]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})
