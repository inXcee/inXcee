import { Router } from 'express'
import { requireAgentToken } from './auth.js'
import {
  overviewService, occupancyService, anomaliesService, waterAlertsService, backupStatusService,
} from './service.js'
import { logger } from '../../shared/logger.js'

// /api/agent — Hermes Agent gibi harici ajanlar için SALT-OKUNUR özet uçları.
// Kullanıcı JWT'si kabul etmez; yalnız AGENT_API_TOKEN. Yazma ucu eklenmez.
// Kurulum ve Telegram akışı: docs/hermes-integration.md
export const agentRouter = Router()
agentRouter.use(requireAgentToken)

const handle = (fn) => (req, res) => {
  try { res.json(fn(req)) }
  catch (e) { logger.error('[Agent]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
}

// today: ajanın yerel günü (YYYY-MM-DD). Geçersizse servis sunucu gününe düşer.
agentRouter.get('/overview', handle(req => overviewService({ today: req.query.today })))
agentRouter.get('/occupancy', handle(() => occupancyService()))
agentRouter.get('/anomalies', handle(() => anomaliesService()))
agentRouter.get('/water/alerts', handle(req => waterAlertsService({ today: req.query.today })))
agentRouter.get('/backups', handle(() => backupStatusService()))
