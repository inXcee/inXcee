import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import {
  getKvkkPolicyService, setKvkkPolicyService, exportPersonnelDataService,
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
