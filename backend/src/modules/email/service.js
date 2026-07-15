import nodemailer from 'nodemailer'
import { getEmailSettings, getManagerEmails, getSetting, logEmailSend } from './queries.js'
import { BUILTIN_TEMPLATES, TEMPLATE_CATEGORIES } from './templates.js'
import { listCustomTemplates, getAttachmentsByIds } from './queries.js'
import { documentPath } from '../../shared/uploads/document-middleware.js'
import fs from 'fs'
import { getOccupancyReport, getMaintenanceReport, getHousekeepingReport } from '../reports/service.js'
import { getDB } from '../../shared/db/index.js'
import { logger } from '../../shared/logger.js'

function getSmtpConfig() {
  return {
    host: getSetting('smtp_host') || process.env.SMTP_HOST || null,
    port: parseInt(getSetting('smtp_port') || process.env.SMTP_PORT || '587', 10),
    user: getSetting('smtp_user') || process.env.SMTP_USER || null,
    pass: getSetting('smtp_pass') || process.env.SMTP_PASS || null,
    from: getSetting('smtp_from') || process.env.SMTP_FROM || null,
  }
}

export function getSmtpStatus() {
  const cfg = getSmtpConfig()
  const missing = []
  if (!cfg.host) missing.push('host')
  if (!cfg.user) missing.push('user')
  if (!cfg.pass) missing.push('pass')
  return { configured: missing.length === 0, missing }
}

function createTransport() {
  const cfg = getSmtpConfig()
  if (!cfg.host) throw new Error('SMTP_HOST tanımlı değil — Ayarlar → Genel & E-Posta sayfasında SMTP host doldurun')
  if (!cfg.user) throw new Error('SMTP kullanıcı tanımlı değil')
  if (!cfg.pass) throw new Error('SMTP şifre tanımlı değil')
  return nodemailer.createTransport({
    host: cfg.host, port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
  })
}

// Genel amaçlı e-posta gönderimi (job queue 'email.send' handler'ı bunu kullanır).
// SMTP yapılandırılmamışsa createTransport throw eder (çağıran kalıcı hata sayar).
export async function sendEmail({ to, subject, html, text }) {
  if (!to) throw new Error('email: alıcı (to) gerekli')
  const transport = createTransport()
  const cfg = getSmtpConfig()
  const info = await transport.sendMail({
    from: cfg.from || cfg.user,
    to,
    subject: subject || '(konu yok)',
    html: html || undefined,
    text: text || undefined,
  })
  return { messageId: info.messageId }
}

// ── Faz 32: Şablonlar + serbest e-posta gönderimi ──

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Dahili + özel şablonları kategori etiketleriyle birlikte döner
export function listAllTemplates() {
  const custom = listCustomTemplates().map(t => ({ ...t, id: `custom:${t.id}`, builtin: false }))
  const builtin = BUILTIN_TEMPLATES.map(t => ({ ...t, builtin: true }))
  return { categories: TEMPLATE_CATEGORIES, templates: [...builtin, ...custom] }
}

// Alıcı listesini doğrular ("a@x.com, b@y.com" veya dizi kabul eder)
export function parseRecipients(input) {
  const list = Array.isArray(input)
    ? input
    : String(input || '').split(/[,;]/).map(s => s.trim()).filter(Boolean)
  if (list.length === 0) throw Object.assign(new Error('En az bir alıcı gerekli'), { statusCode: 400 })
  const bad = list.filter(e => !EMAIL_RE.test(e))
  if (bad.length) throw Object.assign(new Error(`Geçersiz e-posta adresi: ${bad.join(', ')}`), { statusCode: 400 })
  return list
}

// Düz metni basit güvenli HTML'e çevirir (satır sonları korunur, HTML enjeksiyonu engellenir)
function textToHtml(text) {
  const esc = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;white-space:pre-wrap;line-height:1.5">${esc}</div>`
}

// Serbest e-posta gönderimi — şablon doldurulup gönderilir. SMTP kuruluysa yollar,
// değilse anlamlı hata (statusCode 502) döner ki frontend "kopyala" fallback sunabilsin.
export async function composeAndSend({ to, cc, subject, body, attachmentIds }) {
  const recipients = parseRecipients(to)
  if (!subject?.trim()) throw Object.assign(new Error('Konu boş olamaz'), { statusCode: 400 })
  if (!body?.trim()) throw Object.assign(new Error('Mesaj boş olamaz'), { statusCode: 400 })
  const ccList = cc ? parseRecipients(cc) : []

  // Ek dosyaları çöz (arşiv kütüphanesinden) — eksik dosya varsa 400
  const attachments = []
  const ids = Array.isArray(attachmentIds) ? attachmentIds.map(Number).filter(Boolean) : []
  if (ids.length) {
    const rows = getAttachmentsByIds(ids)
    if (rows.length !== ids.length) {
      throw Object.assign(new Error('Seçili eklerden biri bulunamadı'), { statusCode: 400 })
    }
    for (const r of rows) {
      const p = documentPath(r.stored_name)
      if (!fs.existsSync(p)) throw Object.assign(new Error(`Ek dosya diskte yok: ${r.name}`), { statusCode: 400 })
      attachments.push({ filename: r.original_name, path: p })
    }
  }

  let transport
  try {
    transport = createTransport()
  } catch (e) {
    logEmailSend({ recipients: recipients.join(', '), status: 'error', errorMsg: e.message })
    throw Object.assign(new Error(e.message), { statusCode: 502 })
  }
  const cfg = getSmtpConfig()
  try {
    const info = await transport.sendMail({
      from: cfg.from || cfg.user,
      to: recipients.join(', '),
      ...(ccList.length ? { cc: ccList.join(', ') } : {}),
      subject: subject.trim(),
      text: body,
      html: textToHtml(body),
      ...(attachments.length ? { attachments } : {}),
    })
    logEmailSend({ recipients: recipients.join(', '), status: 'success' })
    return { ok: true, messageId: info.messageId, recipients }
  } catch (e) {
    logEmailSend({ recipients: recipients.join(', '), status: 'error', errorMsg: e.message })
    logger.error('[Email] compose gönderim hatası:', e.message)
    throw Object.assign(new Error(`SMTP gönderim hatası: ${e.message}`), { statusCode: 502 })
  }
}

// SMTP bağlantı testi — gerçek e-posta göndermez
export async function verifySmtp() {
  try {
    const t = createTransport()
    await t.verify()
    return { ok: true, message: 'SMTP bağlantısı başarılı' }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

export function buildReportHtml(sections) {
  // sections: string[] | undefined — undefined ise DB'den oku
  const activeSections = sections ?? (getSetting('email_sections') ?? 'occupancy,housekeeping,maintenance,laundry,checkinout').split(',')
  const has = (s) => activeSections.includes(s)

  const today = new Date().toISOString().split('T')[0]
  const occupancy   = has('occupancy')   ? getOccupancyReport()           : null
  const maintenance = has('maintenance') ? getMaintenanceReport()          : null
  const housekeeping = has('housekeeping') ? getHousekeepingReport(today)  : null

  const db = getDB()
  const checkinsToday = has('checkinout') ? (db.prepare(`SELECT COUNT(*) as c FROM room_assignments WHERE DATE(assigned_at)=DATE('now')`).get()?.c ?? 0) : 0
  const checkoutsToday = has('checkinout') ? (db.prepare(`SELECT COUNT(*) as c FROM room_assignments WHERE DATE(check_out_at)=DATE('now')`).get()?.c ?? 0) : 0
  const laundryPending = has('laundry') ? (db.prepare(`SELECT COUNT(*) as c FROM laundry_items WHERE status NOT IN ('delivered','lost')`).get()?.c ?? 0) : 0
  const laundryDeliveredToday = has('laundry') ? (db.prepare(`SELECT COUNT(*) as c FROM laundry_items WHERE status='delivered' AND DATE(updated_at)=DATE('now')`).get()?.c ?? 0) : 0

  const dolulukOrani = occupancy
    ? (occupancy.totals.yatak > 0 ? Math.round((occupancy.totals.dolu / occupancy.totals.yatak) * 100) : 0)
    : 0

  const rows = (arr, cols) => arr.map(row =>
    `<tr>${cols.map(c => `<td style="padding:4px 8px;border:1px solid #ddd">${row[c] ?? '-'}</td>`).join('')}</tr>`
  ).join('')

  const table = (headers, cols, data) => `
    <table style="border-collapse:collapse;width:100%;margin-bottom:16px;font-size:13px">
      <thead><tr>${headers.map(h => `<th style="padding:6px 8px;border:1px solid #ddd;background:#f3f4f6;text-align:left">${h}</th>`).join('')}</tr></thead>
      <tbody>${rows(data, cols)}</tbody>
    </table>`

  return `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><style>
  body{font-family:Arial,sans-serif;color:#1f2937;background:#fff}
  h2{margin:24px 0 8px;color:#1d4ed8;border-bottom:2px solid #e5e7eb;padding-bottom:4px}
  .kpi-grid{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px}
  .kpi{background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px;padding:12px 20px;min-width:120px}
  .kpi-val{font-size:28px;font-weight:bold;color:#0369a1}
  .kpi-lbl{font-size:11px;color:#64748b;text-transform:uppercase}
</style></head><body>
<p style="color:#64748b;font-size:12px">Rapor tarihi: ${today}</p>

${has('occupancy') && occupancy ? `
<h2>KPI Özeti</h2>
<div class="kpi-grid">
  <div class="kpi"><div class="kpi-val">%${dolulukOrani}</div><div class="kpi-lbl">Doluluk</div></div>
  <div class="kpi"><div class="kpi-val">${occupancy.totals.dolu}</div><div class="kpi-lbl">Dolu Yatak</div></div>
  ${maintenance ? `<div class="kpi"><div class="kpi-val">${maintenance.open}</div><div class="kpi-lbl">Açık Arıza</div></div>
  <div class="kpi"><div class="kpi-val" style="color:${maintenance.overdue>0?'#dc2626':'#0369a1'}">${maintenance.overdue}</div><div class="kpi-lbl">SLA İhlali</div></div>` : ''}
</div>
<h2>Doluluk — Blok Bazlı</h2>
${table(['Blok','Oda','Toplam Yatak','Dolu','Boş'],['block','oda_sayisi','toplam_yatak','dolu_yatak','bos'],
  occupancy.blocks.map(b=>({...b,bos:b.toplam_yatak-b.dolu_yatak})))}
` : ''}

${has('housekeeping') && housekeeping ? `
<h2>Temizlik Özeti — Bugün</h2>
<p>Toplam: ${housekeeping.total} | Tamamlanan: ${housekeeping.done} | Atlanan: ${housekeeping.skipped} | Bekleyen: ${housekeeping.pending}</p>
${table(['Alan','Blok','Kat','Görev','Durum','Temizlikçi'],['area','block','floor','task_type','durum','temizlikci'],housekeeping.tasks.slice(0,20))}
${housekeeping.tasks.length>20?`<p style="color:#64748b;font-size:12px">...ve ${housekeeping.tasks.length-20} görev daha</p>`:''}
` : ''}

${has('maintenance') && maintenance ? `
<h2>Bakım / Arıza — Son 7 Gün</h2>
<p>Açık: ${maintenance.open} | Tamamlanan: ${maintenance.closed} | SLA İhlali: <span style="color:${maintenance.overdue>0?'#dc2626':'inherit'}">${maintenance.overdue}</span></p>
${table(['Konum','Açıklama','Öncelik','Durum','SLA','Teknisyen'],['location','description','priority','durum','sla','teknisyen'],maintenance.requests.slice(0,15))}
` : ''}

${has('checkinout') ? `
<h2>Giriş / Çıkış — Bugün</h2>
<div class="kpi-grid">
  <div class="kpi"><div class="kpi-val">${checkinsToday}</div><div class="kpi-lbl">Giriş</div></div>
  <div class="kpi"><div class="kpi-val">${checkoutsToday}</div><div class="kpi-lbl">Çıkış</div></div>
</div>
` : ''}

${has('laundry') ? `
<h2>Çamaşırhane Özeti</h2>
<div class="kpi-grid">
  <div class="kpi"><div class="kpi-val">${laundryPending}</div><div class="kpi-lbl">Bekleyen Sipariş</div></div>
  <div class="kpi"><div class="kpi-val">${laundryDeliveredToday}</div><div class="kpi-lbl">Bugün Teslim</div></div>
</div>
` : ''}

<hr style="margin-top:32px;border:none;border-top:1px solid #e5e7eb">
<p style="font-size:11px;color:#94a3b8">Bu e-posta YYS tarafından otomatik olarak oluşturulmuştur.</p>
</body></html>`
}

// Şifre sıfırlama e-postası — 15 dakikalık tek kullanımlık bağlantı içerir.
// SMTP ayarlı değilse sessiz fallback (forgot-password endpoint tarafından
// timing/enumeration koruması için aynı response döner; loglarda görünür).
export async function sendPasswordResetEmail(toEmail, resetUrl, { username } = {}) {
  if (!toEmail) throw new Error('Alıcı e-posta gerekli')
  const cfg = getSmtpConfig()
  const from = cfg.from || 'YYS <noreply@yys.local>'
  const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"></head><body style="font-family:Arial,sans-serif;color:#1f2937;background:#fff;padding:24px">
    <h2 style="color:#1d4ed8;margin:0 0 16px">YYS — Şifre Sıfırlama</h2>
    <p>${username ? `Merhaba <strong>${username}</strong>,` : 'Merhaba,'}</p>
    <p>Hesabınız için şifre sıfırlama isteği aldık. Aşağıdaki bağlantıya tıklayarak yeni şifrenizi belirleyebilirsiniz:</p>
    <p style="margin:24px 0">
      <a href="${resetUrl}" style="background:#1d4ed8;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">Şifreyi Sıfırla</a>
    </p>
    <p style="font-size:13px;color:#64748b">Bağlantı çalışmazsa: <br><code style="background:#f3f4f6;padding:2px 6px;border-radius:3px">${resetUrl}</code></p>
    <p style="font-size:13px;color:#64748b">Bu bağlantı <strong>15 dakika</strong> içinde geçerlidir ve sadece bir kez kullanılabilir.</p>
    <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb">
    <p style="font-size:11px;color:#94a3b8">Bu isteği siz yapmadıysanız bu e-postayı yok sayabilirsiniz. Hesabınız güvendedir.</p>
  </body></html>`

  let transport
  try {
    transport = createTransport()
  } catch (e) {
    logEmailSend({ recipients: toEmail, status: 'error', errorMsg: e.message })
    throw e
  }
  try {
    const info = await transport.sendMail({
      from,
      to: toEmail,
      subject: 'YYS — Şifre Sıfırlama Bağlantısı',
      html,
    })
    logEmailSend({ recipients: toEmail, status: 'success' })
    return { ok: true, messageId: info.messageId }
  } catch (e) {
    logEmailSend({ recipients: toEmail, status: 'error', errorMsg: e.message })
    logger.error('[Email] Şifre sıfırlama gönderim hatası:', e.message)
    throw new Error(`SMTP gönderim hatası: ${e.message}`)
  }
}

// Cron tarafından çağrılır — gün/saat filtreleri uygulanır
export async function sendMorningReport() {
  const settings = getEmailSettings()
  if (!settings.enabled) return
  const todayDay = new Date().getDay()
  if (!settings.days.includes(todayDay)) return
  return sendReportNow({ subject: 'YYS Sabah Raporu' })
}

// Frontend test butonu için — gün/enabled filtrelerini bypass eder.
// Test modunda manager email yerine override email'e gönderebilir.
export async function sendReportNow({ subject, toOverride } = {}) {
  const settings = getEmailSettings()
  const to = toOverride ? [toOverride] : getManagerEmails()
  if (to.length === 0) {
    const msg = 'Yönetici (campus_manager) kullanıcılarına e-posta tanımlı değil — Ayarlar → Kullanıcılar üzerinden e-posta adresi ekleyin'
    logEmailSend({ recipients: '-', status: 'error', errorMsg: msg })
    throw new Error(msg)
  }
  const cfg = getSmtpConfig()
  const from = cfg.from || 'YYS <noreply@yys.local>'
  const html = buildReportHtml()
  const today = new Date().toISOString().split('T')[0]
  const subj = `${subject || 'YYS Raporu'} — ${today}`

  let transport
  try {
    transport = createTransport()
  } catch (e) {
    logEmailSend({ recipients: to.join(', '), status: 'error', errorMsg: e.message })
    throw e
  }

  try {
    const info = await transport.sendMail({
      from,
      to: to.join(', '),
      ...(settings.cc ? { cc: settings.cc } : {}),
      subject: subj,
      html,
    })
    logEmailSend({ recipients: to.join(', '), status: 'success' })
    return { ok: true, recipients: to, messageId: info.messageId }
  } catch (e) {
    logEmailSend({ recipients: to.join(', '), status: 'error', errorMsg: e.message })
    logger.error('[Email] SMTP gönderim hatası:', e.message)
    throw new Error(`SMTP gönderim hatası: ${e.message}`)
  }
}
