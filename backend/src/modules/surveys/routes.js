import { Router } from 'express'
import { requireRole, requireAuth } from '../../shared/auth/middleware.js'
import * as q from './queries.js'

export const surveysRouter = Router()
const mgmt = requireRole('campus_manager', 'shift_supervisor')

// Kiosk veya admin kullanicilari icin gonderim (personnel_id istege bagli — anonim olabilir)
surveysRouter.post('/submit', (req, res) => {
  const body = req.body || {}
  const scores = ['room_score', 'cleaning_score', 'food_score', 'laundry_score', 'overall_score']
  for (const k of scores) {
    if (body[k] != null && (body[k] < 1 || body[k] > 5)) {
      return res.status(400).json({ error: `${k} 1-5 arasi olmali` })
    }
  }
  const hasAny = scores.some(k => body[k] != null)
  if (!hasAny && !body.comment) {
    return res.status(400).json({ error: 'En az bir puan veya yorum gerekli' })
  }
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
