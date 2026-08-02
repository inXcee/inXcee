import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { getSystemInfoService } from './service.js'
import { logger } from '../../shared/logger.js'
import { register } from '../../shared/metrics.js'
import { getStats, listFailed, retryFailed } from '../../shared/jobs/index.js'
import { logAudit } from '../../shared/audit.js'
import { listActiveSessions, revokeSession, listActiveUsers, revokeSessionsFor, suspendUser, unsuspendUser } from '../../shared/auth/service.js'

export const systemRouter = Router()
const adminOnly = requireRole('campus_manager')

systemRouter.get('/info', ...adminOnly, (req, res) => {
  try { res.json(getSystemInfoService()) }
  catch (e) { logger.error('[System]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Kuyruk durumu + başarısız işler (ör. SMTP hatası yüzünden gitmeyen mailler)
systemRouter.get('/jobs', ...adminOnly, (req, res) => {
  try {
    res.json({ stats: getStats(), failed: listFailed({ type: req.query.type || undefined }) })
  } catch (e) { logger.error('[System]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Başarısız işleri kuyruğa geri koy — SMTP düzeltildikten sonra bekleyenleri gönderir.
systemRouter.post('/jobs/retry', ...adminOnly, (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : null
    const type = req.body?.type ? String(req.body.type) : null
    const requeued = retryFailed({ ids, type })
    logAudit(req.user.id, 'jobs_retry', 'system', null, `${requeued} iş kuyruğa alındı${type ? ` (${type})` : ''}`)
    res.json({ requeued })
  } catch (e) { logger.error('[System]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Açık oturumlar — oturumlar çıkış yapılana kadar sürdüğü için yöneticinin
// hangi cihazda kimin açık olduğunu görüp tek tek kapatabilmesi gerekiyor.
systemRouter.get('/sessions', ...adminOnly, (req, res) => {
  try { res.json(listActiveSessions()) }
  catch (e) { logger.error('[System]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Şu an içeride kim var — oturum değil kişi bazında.
systemRouter.get('/active-users', ...adminOnly, (req, res) => {
  try {
    const dakika = Math.min(1440, Math.max(1, parseInt(req.query.within) || 15))
    res.json(listActiveUsers({ withinMinutes: dakika }))
  } catch (e) { logger.error('[System]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Bir kişinin bütün cihazlarını tek hamlede düşür.
systemRouter.post('/sessions/revoke-all', ...adminOnly, (req, res) => {
  try {
    const { kind, id } = req.body || {}
    if (!['user', 'staff', 'personnel'].includes(kind) || !Number.isInteger(Number(id))) {
      return res.status(400).json({ error: 'kind (user/staff/personnel) ve id gerekli' })
    }
    revokeSessionsFor(kind, Number(id))
    logAudit(req.user.id, 'sessions_revoke_all', 'system', Number(id), `${kind} #${id} tüm oturumları kapatıldı`)
    res.json({ ok: true })
  } catch (e) { logger.error('[System]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Hesabı askıya al / geri aç — silmeden erişimi kesmenin yolu.
systemRouter.post('/users/:id/suspend', ...adminOnly, (req, res) => {
  try {
    const result = suspendUser(Number(req.params.id), {
      reason: req.body?.reason ? String(req.body.reason).slice(0, 200) : null,
      byUserId: req.user.id,
    })
    if (result.error) return res.status(result.status).json({ error: result.error })
    logAudit(req.user.id, 'user_suspend', 'system', Number(req.params.id), req.body?.reason || 'Sebep belirtilmedi')
    res.json(result)
  } catch (e) { logger.error('[System]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

systemRouter.post('/users/:id/unsuspend', ...adminOnly, (req, res) => {
  try {
    const result = unsuspendUser(Number(req.params.id))
    if (result.error) return res.status(result.status).json({ error: result.error })
    logAudit(req.user.id, 'user_unsuspend', 'system', Number(req.params.id), 'Askı kaldırıldı')
    res.json(result)
  } catch (e) { logger.error('[System]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

systemRouter.delete('/sessions/:jti', ...adminOnly, (req, res) => {
  try {
    const kapandi = revokeSession(String(req.params.jti))
    if (!kapandi) return res.status(404).json({ error: 'Açık oturum bulunamadı' })
    logAudit(req.user.id, 'session_revoke', 'system', null, `Oturum kapatıldı: ${req.params.jti}`)
    res.json({ ok: true })
  } catch (e) { logger.error('[System]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// /api/system/metrics — Prometheus scrape endpoint.
// Bearer token (METRICS_TOKEN) ile korunur. auth middleware'ini ATLAR
// (admin login gerektirmez, scrape'i otomatize etmek icin). nginx tarafinda
// public acilmamalidir; token ek savunma katmani.
systemRouter.get('/metrics', async (req, res) => {
  const token = process.env.METRICS_TOKEN
  if (!token) return res.status(503).json({ error: 'metrics disabled' })
  const auth = req.headers.authorization
  if (!auth || auth !== `Bearer ${token}`) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  try {
    res.set('Content-Type', register.contentType)
    res.end(await register.metrics())
  } catch (e) {
    logger.error('[Metrics]', e)
    res.status(500).end('metrics error')
  }
})
