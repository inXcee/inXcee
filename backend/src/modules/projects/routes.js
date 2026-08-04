import { Router } from 'express'
import { requireAuth, requireRole } from '../../shared/auth/middleware.js'
import { logAudit } from '../../shared/audit.js'
import { logger } from '../../shared/logger.js'
import * as svc from './service.js'

export const projectsRouter = Router()
const mgmt = requireRole('campus_manager')

projectsRouter.get('/', requireAuth, (req, res) => {
  try {
    res.json(svc.listService({ includeInactive: req.query.all === '1' }))
  } catch (e) { logger.error('[Projects]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

projectsRouter.post('/', ...mgmt, (req, res) => {
  try {
    const result = svc.createService(req.body)
    if (result.error) return res.status(result.status).json({ error: result.error })
    logAudit(req.user.id, 'project_create', 'projects', result.project.id, result.project.name)
    res.status(201).json(result.project)
  } catch (e) { logger.error('[Projects]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Kadro ataması — ':id' rotasından ÖNCE tanımlanmalı, yoksa "assign" id sanılır.
projectsRouter.post('/assign', ...mgmt, (req, res) => {
  try {
    const result = svc.assignService(req.body || {})
    if (result.error) return res.status(result.status).json({ error: result.error })
    logAudit(req.user.id, 'project_assign', 'projects', req.body?.project_id ?? null,
      `${result.updated} personel`)
    res.json(result)
  } catch (e) { logger.error('[Projects]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// İmza listesi aktarımı: önizle → kullanıcı onaylar → uygula.
// İki adım ayrı, çünkü yakın eşleşmeler otomatik bağlanmamalı.
projectsRouter.post('/:id/roster/preview', ...mgmt, (req, res) => {
  try {
    const result = svc.rosterPreviewService(Number(req.params.id), req.body?.names)
    if (result.error) return res.status(result.status).json({ error: result.error })
    res.json(result.preview)
  } catch (e) { logger.error('[Projects]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

projectsRouter.post('/:id/roster/apply', ...mgmt, (req, res) => {
  try {
    const result = svc.rosterApplyService(Number(req.params.id), req.body || {}, req.user.id)
    if (result.error) return res.status(result.status).json({ error: result.error })
    logAudit(req.user.id, 'project_roster_apply', 'projects', Number(req.params.id),
      `${result.assigned} atandı, ${result.created} yeni kayıt`)
    res.json(result)
  } catch (e) { logger.error('[Projects]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

projectsRouter.put('/:id', ...mgmt, (req, res) => {
  try {
    const result = svc.updateService(Number(req.params.id), req.body || {})
    if (result.error) return res.status(result.status).json({ error: result.error })
    logAudit(req.user.id, 'project_update', 'projects', Number(req.params.id), result.project.name)
    res.json(result.project)
  } catch (e) { logger.error('[Projects]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

projectsRouter.delete('/:id', ...mgmt, (req, res) => {
  try {
    const result = svc.deleteService(Number(req.params.id))
    if (result.error) return res.status(result.status).json({ error: result.error })
    logAudit(req.user.id, 'project_delete', 'projects', Number(req.params.id), 'Proje silindi')
    res.json(result)
  } catch (e) { logger.error('[Projects]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})
