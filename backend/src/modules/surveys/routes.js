import { Router } from 'express'
import { requireRole, requireAuth } from '../../shared/auth/middleware.js'
import { validate } from '../../shared/middleware/validate.js'
import { submitSurveySchema } from './schemas.js'
import * as q from './queries.js'

export const surveysRouter = Router()
const mgmt = requireRole('campus_manager', 'shift_supervisor')

// Kiosk veya admin kullanicilari icin gonderim (personnel_id istege bagli — anonim olabilir).
// Oturum zorunlu; baskasi adina yalniz yonetim (mudur/amir) girebilir, diger herkes
// (kiosk, AVS, saha rolleri) yalniz kendi adina veya anonim — aksi halde baskasi adina
// anket doldurulup istatistik carpitilabiliyordu.
const SURVEY_PROXY_ROLES = new Set(['campus_manager', 'shift_supervisor'])
surveysRouter.post('/submit', requireAuth, validate(submitSurveySchema), (req, res) => {
  const body = req.validated
  const canProxy = SURVEY_PROXY_ROLES.has(req.user.role)
  if (!canProxy && body.personnel_id && body.personnel_id !== req.user.personnelId) {
    return res.status(403).json({ error: 'Yalnız kendi adınıza anket gönderebilirsiniz' })
  }
  const id = q.insertSurvey(body.personnel_id, body)
  res.status(201).json({ id })
})

surveysRouter.get('/', ...mgmt, (req, res) => {
  res.json(q.listSurveys({ limit: Math.min(+req.query.limit || 200, 1000) }))
})

surveysRouter.get('/stats', ...mgmt, (req, res) => {
  const days = Math.min(Math.max(+req.query.days || 30, 1), 365)
  res.json({
    summary: q.getSurveyStats({ days }),
    trend: q.getSurveyTrend({ days }),
  })
})
