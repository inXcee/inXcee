import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { getEmailSettings, setEmailSettings } from './queries.js'
import { sendMorningReport } from './service.js'
import { scheduleMorningReport } from '../../shared/cron/index.js'

export const emailRouter = Router()
const adminOnly = requireRole('campus_manager')

emailRouter.get('/', ...adminOnly, (req, res) => {
  try {
    res.json(getEmailSettings())
  } catch (e) { res.status(500).json({ error: e.message }) }
})

emailRouter.put('/', ...adminOnly, (req, res) => {
  try {
    const { enabled, hour, minute, cc } = req.body
    if (typeof hour !== 'number' || hour < 0 || hour > 23) {
      return res.status(400).json({ error: 'Geçersiz saat (0-23)' })
    }
    if (![0, 15, 30, 45].includes(minute)) {
      return res.status(400).json({ error: 'Dakika 0, 15, 30 veya 45 olmalı' })
    }
    setEmailSettings({ enabled: !!enabled, hour, minute, cc: cc ?? '' })
    scheduleMorningReport()
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

emailRouter.post('/test', ...adminOnly, async (req, res) => {
  try {
    await sendMorningReport()
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})
