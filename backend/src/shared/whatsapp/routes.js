import { Router } from 'express'
import { requireRole } from '../auth/middleware.js'
import * as wp from './service.js'

export const whatsappRouter = Router()
const access = requireRole('campus_manager', 'shift_supervisor', 'technical')

// Submit messages (paste from WhatsApp)
whatsappRouter.post('/messages', ...access, (req, res) => {
  try {
    const { text, sender, groupName } = req.body
    if (!text?.trim()) return res.status(400).json({ error: 'Mesaj metni gerekli' })
    const results = wp.submitMessages(text, sender, groupName)
    res.json({ ok: true, messages: results, count: results.length, faults: results.filter(r => r.isFault).length })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Get messages
whatsappRouter.get('/messages', ...access, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 100)
  res.json(wp.getMessages(limit))
})

// Stats
whatsappRouter.get('/stats', ...access, (req, res) => {
  res.json(wp.getStats())
})

// Analyze/preview text without saving
whatsappRouter.post('/analyze', ...access, (req, res) => {
  const { text } = req.body
  if (!text?.trim()) return res.status(400).json({ error: 'Metin gerekli' })
  res.json(wp.analyzeText(text))
})
