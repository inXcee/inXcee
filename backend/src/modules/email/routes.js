import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { getEmailSettings, setEmailSettings, getEmailLog, getSetting, setSetting,
  createCustomTemplate, updateCustomTemplate, deleteCustomTemplate, getKnownContacts } from './queries.js'
import { sendMorningReport, sendReportNow, buildReportHtml, verifySmtp,
  listAllTemplates, composeAndSend } from './service.js'
import { logAudit } from '../../shared/audit.js'
import { buildWeeklyReportHtml, sendWeeklyReportNow } from './weekly.js'
import { scheduleMorningReport } from '../../shared/cron/index.js'
import { logger } from '../../shared/logger.js'

export const emailRouter = Router()
const adminOnly = requireRole('campus_manager')

emailRouter.get('/', ...adminOnly, (req, res) => {
  try { res.json(getEmailSettings()) }
  catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
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
  } catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

emailRouter.get('/preview', ...adminOnly, (req, res) => {
  try {
    const html = buildReportHtml()
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(html)
  } catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

emailRouter.get('/log', ...adminOnly, (req, res) => {
  try { res.json(getEmailLog()) }
  catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

emailRouter.post('/test', ...adminOnly, async (req, res) => {
  try {
    // Test gönderimi gün/enabled filtreleri uygulamaz — istek anında ne olursa olsun gönderir.
    // Opsiyonel `to` ile sadece istek atan kullanıcıya gönderilebilir.
    const toOverride = req.body?.to || null
    const result = await sendReportNow({ subject: 'YYS Test Raporu', toOverride })
    res.json({ ok: true, ...result })
  } catch (e) { logger.error('[Route]', e); res.status(500).json({ error: e.message }) }
})

// ── Haftalık özet ──
emailRouter.get('/weekly/preview', ...adminOnly, (req, res) => {
  try {
    const html = buildWeeklyReportHtml()
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(html)
  } catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

emailRouter.post('/weekly/test', ...adminOnly, async (req, res) => {
  try {
    const result = await sendWeeklyReportNow({ toOverride: req.body?.to || null })
    res.json({ ok: true, ...result })
  } catch (e) { logger.error('[Route]', e); res.status(500).json({ error: e.message }) }
})

emailRouter.post('/verify-smtp', ...adminOnly, async (req, res) => {
  try {
    const r = await verifySmtp()
    res.json(r)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Faz 32: E-posta şablonları + serbest gönderim ──

// Bilinen kişiler (alıcı otomatik tamamlama)
emailRouter.get('/contacts', ...adminOnly, (req, res) => {
  try { res.json(getKnownContacts()) }
  catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Dahili + özel şablonlar
emailRouter.get('/templates', ...adminOnly, (req, res) => {
  try { res.json(listAllTemplates()) }
  catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

function validateTemplateBody(body) {
  if (!body?.name?.trim()) return 'Şablon adı gerekli'
  const cats = ['rapor', 'tedarik', 'personel', 'resmi']
  if (body.category && !cats.includes(body.category)) return 'Geçersiz kategori'
  return null
}

emailRouter.post('/templates', ...adminOnly, (req, res) => {
  try {
    const err = validateTemplateBody(req.body)
    if (err) return res.status(400).json({ error: err })
    const id = createCustomTemplate({
      category: req.body.category || 'personel',
      name: req.body.name.trim(),
      subject: req.body.subject || '',
      body: req.body.body || '',
    }, req.user.id)
    logAudit(req.user.id, 'email_template_create', 'email', id, req.body.name)
    res.status(201).json({ id })
  } catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

emailRouter.put('/templates/:id', ...adminOnly, (req, res) => {
  try {
    const err = validateTemplateBody(req.body)
    if (err) return res.status(400).json({ error: err })
    const ok = updateCustomTemplate(+req.params.id, {
      category: req.body.category || 'personel',
      name: req.body.name.trim(),
      subject: req.body.subject || '',
      body: req.body.body || '',
    })
    if (!ok) return res.status(404).json({ error: 'Şablon bulunamadı' })
    res.json({ ok: true })
  } catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

emailRouter.delete('/templates/:id', ...adminOnly, (req, res) => {
  try {
    const ok = deleteCustomTemplate(+req.params.id)
    if (!ok) return res.status(404).json({ error: 'Şablon bulunamadı' })
    res.json({ ok: true })
  } catch (e) { logger.error('[Route]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// Serbest e-posta gönder (şablon doldurulmuş halde)
emailRouter.post('/compose', ...adminOnly, async (req, res) => {
  try {
    const result = await composeAndSend(req.body)
    logAudit(req.user.id, 'email_compose_send', 'email', null, `${result.recipients.length} alıcı · ${req.body.subject}`)
    res.json(result)
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message })
  }
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
