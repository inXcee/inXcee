import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { getEmailSettings, setEmailSettings, getEmailLog, getSetting, setSetting } from './queries.js'
import { sendMorningReport, buildReportHtml } from './service.js'
import { scheduleMorningReport } from '../../shared/cron/index.js'

export const emailRouter = Router()
const adminOnly = requireRole('campus_manager')

emailRouter.get('/', ...adminOnly, (req, res) => {
  try { res.json(getEmailSettings()) }
  catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

emailRouter.put('/', ...adminOnly, (req, res) => {
  try {
    const { enabled, hour, minute, cc, days, sections, smtp } = req.body
    if (typeof hour !== 'number' || hour < 0 || hour > 23)
      return res.status(400).json({ error: 'Geçersiz saat (0-23)' })
    if (![0,15,30,45].includes(minute))
      return res.status(400).json({ error: 'Dakika 0, 15, 30 veya 45 olmalı' })
    if (Array.isArray(days) && (days.length === 0 || days.some(d => d < 0 || d > 6)))
      return res.status(400).json({ error: 'Geçersiz gün seçimi' })
    const VALID_SECTIONS = ['occupancy','housekeeping','maintenance','laundry','checkinout']
    if (Array.isArray(sections) && sections.some(s => !VALID_SECTIONS.includes(s)))
      return res.status(400).json({ error: 'Geçersiz bölüm adı' })
    setEmailSettings({ enabled: !!enabled, hour, minute, cc: cc ?? '', days, sections, smtp })
    scheduleMorningReport()
    res.json({ ok: true })
  } catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

emailRouter.get('/preview', ...adminOnly, (req, res) => {
  try {
    const html = buildReportHtml()
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(html)
  } catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

emailRouter.get('/log', ...adminOnly, (req, res) => {
  try { res.json(getEmailLog()) }
  catch (e) { console.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

emailRouter.post('/test', ...adminOnly, async (req, res) => {
  try {
    await sendMorningReport()
    res.json({ ok: true })
  } catch (e) { console.error('[Route]', e); res.status(500).json({ error: e.message }) }
})

emailRouter.get('/kiosk', ...adminOnly, (req, res) => {
  try { res.json({ login_method: getSetting('kiosk_login_method') ?? 'both' }) }
  catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})

emailRouter.put('/kiosk', ...adminOnly, (req, res) => {
  try {
    const { login_method } = req.body
    if (!['tc_no','name','both'].includes(login_method))
      return res.status(400).json({ error: 'Geçersiz yöntem: tc_no, name veya both olmalı' })
    setSetting('kiosk_login_method', login_method)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası' }) }
})
