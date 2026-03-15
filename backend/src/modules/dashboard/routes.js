import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { getKPI, getHeatmap, getProjection } from './queries.js'

export const dashboardRouter = Router()
const mgmt = requireRole('campus_manager', 'shift_supervisor')

dashboardRouter.get('/kpi', ...mgmt, (req, res) => {
  res.json(getKPI())
})

dashboardRouter.get('/heatmap', ...mgmt, (req, res) => {
  res.json(getHeatmap())
})

dashboardRouter.get('/projection', ...mgmt, (req, res) => {
  res.json(getProjection())
})
