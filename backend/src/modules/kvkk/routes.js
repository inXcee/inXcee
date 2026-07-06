import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { logAudit } from '../../shared/audit.js'
import { logger } from '../../shared/logger.js'
import {
  getKvkkPolicyService, setKvkkPolicyService, exportPersonnelDataService,
  anonymizePersonnelDataService,
  getKvkkRetentionPolicyService, setKvkkRetentionPolicyService,
  enforceKvkkRetentionService,
} from './service.js'

export const kvkkRouter = Router()
const adminOnly = requireRole('campus_manager')

// Public — login öncesi de erişilebilir (KVKK kanun gereği)
kvkkRouter.get('/policy', (req, res) => {
  try { res.json(getKvkkPolicyService()) }
  catch (e) { logger.error('[KVKK]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

kvkkRouter.put('/policy', ...adminOnly, (req, res) => {
  const result = setKvkkPolicyService(req.body?.text)
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.json(result)
})

// Personel veri export — admin
kvkkRouter.get('/personnel/:id/export', ...adminOnly, (req, res) => {
  try {
    const result = exportPersonnelDataService(req.params.id)
    if (result.error) return res.status(result.status).json({ error: result.error })
    res.setHeader('Content-Disposition',
      `attachment; filename="kvkk-export-personnel-${req.params.id}-${Date.now()}.json"`)
    res.json(result)
  } catch (e) {
    logger.error('[KVKK]', e)
    res.status(500).json({ error: 'Sunucu hatası' })
  }
})

// Retention policy — kaç gün çıkış yapmış personelin verileri otomatik silinir.
// 0 = devre dışı (manuel anonimleştirme ile sürdürülür).
kvkkRouter.get('/retention-policy', ...adminOnly, (req, res) => {
  res.json(getKvkkRetentionPolicyService())
})

kvkkRouter.put('/retention-policy', ...adminOnly, (req, res) => {
  const result = setKvkkRetentionPolicyService(req.body?.days)
  if (result.error) return res.status(result.status).json({ error: result.error })
  logAudit(req.user.id, 'kvkk_retention_set', 'kvkk', null, `Retention süresi ${result.days} gün, enabled=${result.enabled}`)
  res.json(result)
})

// Manuel tetikleme — admin retention enforcement'ı şimdi çalıştırabilir
// (cron beklemeden). Test ve compliance audit için kullanışlı.
kvkkRouter.post('/retention-enforce', ...adminOnly, (req, res) => {
  try {
    const result = enforceKvkkRetentionService()
    logAudit(req.user.id, 'kvkk_retention_enforce', 'kvkk', null,
      `Manuel tetikleme: ${result.processed}/${result.candidates ?? 0} işlendi`)
    res.json(result)
  } catch (e) {
    logger.error('[KVKK retention]', e)
    res.status(500).json({ error: 'Sunucu hatası' })
  }
})

// KVKK m.11 — silme/anonimleştirme talebi (admin only).
// Sadece check-out yapmış personel anonimleştirilebilir; kayıt korunur ama
// TC/pasaport/telefon/foto/notlar kalıcı NULL yapılır.
kvkkRouter.post('/personnel/:id/anonymize', ...adminOnly, (req, res) => {
  try {
    const result = anonymizePersonnelDataService(req.params.id, req.user.id)
    if (result.error) return res.status(result.status).json({ error: result.error })
    logAudit(req.user.id, 'kvkk_anonymize', 'personnel', result.personnel_id, 'KVKK m.11 anonimleştirme uygulandı')
    res.json(result)
  } catch (e) {
    logger.error('[KVKK]', e)
    res.status(500).json({ error: 'Sunucu hatası' })
  }
})
