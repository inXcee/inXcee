import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { logAudit } from '../../shared/audit.js'
import { getDB } from '../../shared/db/index.js'
import { logger } from '../../shared/logger.js'
import { validate } from '../../shared/middleware/validate.js'
import { smsSendSchema, broadcastSchema } from './schemas.js'

export const commsRouter = Router()
const mgr = requireRole('campus_manager', 'shift_supervisor')
const view = requireRole('campus_manager', 'shift_supervisor')

/* IB2 SMS gönderimi:
   Gerçek SMS provider (Netgsm/Twilio) entegrasyonu için env değişkenleri:
   - SMS_PROVIDER=netgsm|twilio|none
   - SMS_USER, SMS_PASS, SMS_HEADER (Netgsm için)
   - Provider yoksa "queued" durumunda log atılır */

async function sendSms(phone, body) {
  const provider = process.env.SMS_PROVIDER || 'none'
  if (provider === 'none') {
    return { ok: false, error: 'SMS_PROVIDER tanımlı değil (env)', status: 'queued' }
  }
  if (provider === 'netgsm') {
    // Netgsm HTTP API basit format
    const url = `https://api.netgsm.com.tr/sms/send/get?usercode=${encodeURIComponent(process.env.SMS_USER || '')}&password=${encodeURIComponent(process.env.SMS_PASS || '')}&gsmno=${encodeURIComponent(phone)}&message=${encodeURIComponent(body)}&msgheader=${encodeURIComponent(process.env.SMS_HEADER || '')}`
    try {
      const r = await fetch(url, { method: 'GET' })
      const text = await r.text()
      const code = text.split(' ')[0]
      if (code === '00' || code === '01' || code === '02') return { ok: true, status: 'sent', raw: text }
      return { ok: false, error: `Netgsm: ${text}`, status: 'failed' }
    } catch (e) { return { ok: false, error: e.message, status: 'failed' } }
  }
  return { ok: false, error: `Provider ${provider} desteklenmiyor`, status: 'failed' }
}

function logComm(data) {
  return getDB().prepare(`
    INSERT INTO comm_log(channel, recipient_type, recipient_id, recipient_value, subject, body, status, error, sent_at, created_by)
    VALUES(?,?,?,?,?,?,?,?,?,?)
  `).run(
    data.channel, data.recipient_type, data.recipient_id || null, data.recipient_value || null,
    data.subject || null, data.body, data.status || 'pending',
    data.error || null, data.status === 'sent' ? new Date().toISOString() : null,
    data.created_by || null
  ).lastInsertRowid
}

// ── IB2: SMS gönder (tek personel) ──
commsRouter.post('/sms/send', ...mgr, validate(smsSendSchema), async (req, res) => {
  try {
    const { staff_id, phone, body } = req.validated

    let targetPhone = phone
    let recipientId = null
    if (staff_id) {
      const s = getDB().prepare('SELECT id, phone FROM staff WHERE id=?').get(+staff_id)
      if (!s) return res.status(404).json({ error: 'Personel bulunamadı' })
      targetPhone = targetPhone || s.phone
      recipientId = s.id
    }
    if (!targetPhone) return res.status(400).json({ error: 'Telefon bulunamadı' })

    const result = await sendSms(targetPhone, body)
    const id = logComm({
      channel: 'sms',
      recipient_type: staff_id ? 'staff' : 'phone',
      recipient_id: recipientId,
      recipient_value: targetPhone,
      body, status: result.status, error: result.error,
      created_by: req.user.id,
    })
    logAudit(req.user.id, 'sms_send', 'comms', id, `${targetPhone}: ${body.slice(0, 50)}`)
    res.json({ id, ok: result.ok, status: result.status, error: result.error })
  } catch (e) { logger.error('[sms]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── IB3: Push subscription kaydet (browser'dan gelir) ──
commsRouter.post('/push/subscribe', ...view, (req, res) => {
  try {
    const { endpoint, keys } = req.body || {}
    if (!endpoint || !keys?.auth || !keys?.p256dh) return res.status(400).json({ error: 'endpoint + keys gerekli' })
    const db = getDB()
    try {
      const id = db.prepare(`
        INSERT INTO push_subscriptions(user_id, endpoint, auth_key, p256dh_key)
        VALUES(?,?,?,?)
      `).run(req.user.id, endpoint, keys.auth, keys.p256dh).lastInsertRowid
      res.status(201).json({ id })
    } catch (e) {
      if (e.message?.includes('UNIQUE')) {
        // Var olan subscription — sessizce success
        return res.json({ ok: true, message: 'already subscribed' })
      }
      throw e
    }
  } catch (e) { res.status(400).json({ error: e.message }) }
})

commsRouter.delete('/push/unsubscribe', ...view, (req, res) => {
  try {
    getDB().prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?')
      .run(req.user.id, req.body?.endpoint || '')
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── IB4: Toplu duyuru — gruba/role'a toplu gönderim ──
commsRouter.post('/broadcast', ...mgr, validate(broadcastSchema), async (req, res) => {
  try {
    const { channel, target_type, target_id, body, subject } = req.validated

    const db = getDB()
    let staffList = []
    if (target_type === 'all') {
      staffList = db.prepare('SELECT id, full_name, phone FROM staff WHERE is_active = 1').all()
    } else if (target_type === 'dept') {
      staffList = db.prepare('SELECT id, full_name, phone FROM staff WHERE department_id = ? AND is_active = 1').all(+target_id)
    } else if (target_type === 'role') {
      // role bazlı sadece users tablosu için — staff için role_label
      staffList = db.prepare('SELECT id, full_name, phone FROM staff WHERE role_label = ? AND is_active = 1').all(target_id)
    } else if (target_type === 'group') {
      // notification_group_members user_id ile bağlı; users.email/staff'a indirilebilir
      // Şu an kullanıcı bazlı; staff için ayrı bir grup yapısı gerekirse spec'e ekle
      const members = db.prepare(`
        SELECT u.id, u.full_name, NULL as phone, u.email
        FROM notification_group_members ngm
        JOIN users u ON u.id = ngm.user_id
        WHERE ngm.group_id = ?
      `).all(+target_id)
      staffList = members
    }

    if (!staffList.length) return res.status(404).json({ error: 'Hedef listesi boş' })

    const stats = { total: staffList.length, sent: 0, failed: 0, queued: 0 }
    for (const s of staffList) {
      if (channel === 'sms') {
        if (!s.phone) { stats.failed++; continue }
        const result = await sendSms(s.phone, body)
        logComm({
          channel: 'sms', recipient_type: 'staff', recipient_id: s.id, recipient_value: s.phone,
          subject, body, status: result.status, error: result.error, created_by: req.user.id,
        })
        if (result.status === 'sent') stats.sent++
        else if (result.status === 'queued') stats.queued++
        else stats.failed++
      } else {
        // push/toast için sadece log atıyoruz, gerçek push notification için web-push paketi gerek
        logComm({
          channel, recipient_type: 'staff', recipient_id: s.id, recipient_value: s.full_name,
          subject, body, status: 'queued', created_by: req.user.id,
        })
        stats.queued++
      }
    }

    logAudit(req.user.id, 'broadcast', 'comms', null, `${channel} → ${target_type}:${target_id} (${stats.total} alıcı)`)
    res.json({ ok: true, stats })
  } catch (e) { logger.error('[broadcast]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── İletişim logu ──
commsRouter.get('/log', ...view, (req, res) => {
  try {
    const db = getDB()
    let q = `SELECT c.*, u.username as created_by_username FROM comm_log c
             LEFT JOIN users u ON u.id = c.created_by
             WHERE 1=1`
    const params = []
    if (req.query.channel) { q += ' AND c.channel = ?'; params.push(req.query.channel) }
    if (req.query.status) { q += ' AND c.status = ?'; params.push(req.query.status) }
    if (req.query.staff_id) { q += ' AND c.recipient_id = ? AND c.recipient_type = "staff"'; params.push(+req.query.staff_id) }
    q += ' ORDER BY c.created_at DESC LIMIT 200'
    res.json(db.prepare(q).all(...params))
  } catch (e) { logger.error('[comm/log]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})
