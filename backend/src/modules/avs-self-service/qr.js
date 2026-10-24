import { Router } from 'express'
import { requireAvsKiosk } from '../../shared/auth/middleware.js'
import { avsRoleGroup } from '../../shared/auth/avsRoles.js'
import { getDB } from '../../shared/db/index.js'
import { validate } from '../../shared/middleware/validate.js'
import { recordFieldScan, resolveScanTarget } from '../location-portal/field-scan.js'
import { BLOCK_DENIED } from './board.js'
import { qrScanSchema } from './schemas.js'

// Kapıdaki QR'ı okutma (docs/saha-ekrani.md): bütün kiosk personeli okutur; yanıt konumu ve kişinin grubunu döner —
// temizlik/çamaşırhane o yerin Odalar sayfasını, teknik/diğer konumu dolu arıza formunu açar. Token dönmez.
export const avsQrRouter = Router()

avsQrRouter.post('/', requireAvsKiosk, validate(qrScanSchema), (req, res, next) => {
  try {
    const worker = getDB().prepare(`
      SELECT s.id, s.assigned_block, d.name AS department_name
      FROM staff s LEFT JOIN departments d ON d.id=s.department_id
      WHERE s.id=? AND s.is_active=1
    `).get(req.user.workerId)
    if (!worker) return res.status(404).json({ error: 'Çalışan bulunamadı' })
    const target = resolveScanTarget(req.validated.qr)
    // Bloğa atanmış personel başka bloğun kapısını okutursa kayıt bile düşmez (pano ve defterle aynı kural)
    if (worker.assigned_block && worker.assigned_block !== target.block) return res.status(403).json(BLOCK_DENIED)
    const scan = recordFieldScan({ target, workerId: worker.id, via: req.validated.via, ip: req.ip })
    res.json({ ...scan, group: avsRoleGroup(worker.department_name) })
  } catch (e) { next(e) }
})
