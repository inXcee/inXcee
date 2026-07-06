import { Router } from 'express'
import { requireRole, requireAuth } from '../../shared/auth/middleware.js'
import { validate } from '../../shared/middleware/validate.js'
import { submitSurveySchema } from './schemas.js'
import * as q from './queries.js'

export const surveysRouter = Router()
const mgmt = requireRole('campus_manager', 'shift_supervisor')

// Kiosk veya admin kullanicilari icin gonderim (personnel_id istege bagli — anonim olabilir)
surveysRouter.post('/submit', validate(submitSurveySchema), (req, res) => {
  const body = req.validated
  const id = q.insertSurvey(body.personnel_id, body)
  res.status(201).json({ id })
})

surveysRouter.get('/', requireAuth, (req, res) => {
  res.json(q.listSurveys({ limit: Math.min(+req.query.limit || 200, 1000) }))
})

surveysRouter.get('/stats', ...mgmt, (req, res) => {
  const days = Math.min(Math.max(+req.query.days || 30, 1), 365)
  res.json({
    summary: q.getSurveyStats({ days }),
    trend: q.getSurveyTrend({ days }),
  })
})
