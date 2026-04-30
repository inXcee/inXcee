import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { logAudit } from '../../shared/audit.js'
import {
  getKvkkPolicyService, setKvkkPolicyService, exportPersonnelDataService,
  anonymizePersonnelDataService,
} from './service.js'

export const kvkkRouter = Router()
const adminOnly = requireRole('campus_manager')

// Public — login öncesi de erişilebilir (KVKK kanun gereği)
kvkkRouter.get('/policy', (req, res) => {
  try { res.json(getKvkkPolicyService()) }
  catch (e) { console.error('[KVKK]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
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
    console.error('[KVKK]', e)
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
    console.error('[KVKK]', e)
    res.status(500).json({ error: 'Sunucu hatası' })
  }
})
