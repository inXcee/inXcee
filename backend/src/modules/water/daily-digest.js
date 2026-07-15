import { getDB } from '../../shared/db/index.js'
import { enqueue } from '../../shared/jobs/index.js'
import { getSmtpStatus } from '../email/service.js'
import * as q from './queries.js'

const ACTIVE_JOB_STATUSES = new Set(['pending', 'processing'])

function safeJson(value, fallback) {
  try { return JSON.parse(value) } catch { return fallback }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function effectiveStatus(row) {
  if (row.sent_at || row.status === 'sent') return 'sent'
  if (row.job_status === 'processing') return 'sending'
  if (row.job_status === 'pending') return (row.last_error || row.job_last_error) ? 'retrying' : 'queued'
  if (row.job_status === 'failed') return 'failed'
  if (row.job_status === 'done' && !row.sent_at) return 'failed'
  return row.status
}

function serializeDelivery(row, extra = {}) {
  if (!row) return null
  const recipients = safeJson(row.recipients, [])
  const summary = safeJson(row.summary_json, {})
  return {
    id: row.id,
    date: row.digest_date,
    status: effectiveStatus(row),
    source: row.source,
    recipients: Array.isArray(recipients) ? recipients : [],
    subject: row.subject,
    summary,
    job_id: row.job_id,
    job_status: row.job_status || null,
    attempts: row.job_attempts || 0,
    max_attempts: row.job_max_attempts || 0,
    message_id: row.message_id || null,
    error: row.job_last_error || row.last_error || null,
    requested_by_name: row.requested_by_name || null,
    queued_at: row.queued_at || null,
    sent_at: row.sent_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    ...extra,
  }
}

function kpiCell(value, label, color = '#0f766e') {
  return `<td style="width:25%;padding:12px 10px;border:1px solid #dbe3ea;text-align:center;background:#f8fafc">
    <div style="font-size:24px;font-weight:700;color:${color}">${escapeHtml(value)}</div>
    <div style="margin-top:3px;font-size:11px;color:#64748b;text-transform:uppercase">${escapeHtml(label)}</div>
  </td>`
}

export function buildWaterDailyDigestEmail(digest) {
  const summary = digest.summary || {}
  const details = digest.details || {}
  const orders = Array.isArray(details.orders) ? details.orders : []
  const subject = `Su Takip Günlük Operasyon Özeti - ${digest.date}`
  const statusLine = digest.parts.length
    ? digest.parts.join(', ')
    : 'Bekleyen kritik işlem yok; operasyon güncel.'
  const orderRows = orders.slice(0, 12).map(order => `
    <tr>
      <td style="padding:7px 8px;border:1px solid #dbe3ea">${escapeHtml(order.product_name)}</td>
      <td style="padding:7px 8px;border:1px solid #dbe3ea">${escapeHtml(order.balance_human || '-')}</td>
      <td style="padding:7px 8px;border:1px solid #dbe3ea">${escapeHtml(order.order_by_date || '-')}</td>
      <td style="padding:7px 8px;border:1px solid #dbe3ea">${escapeHtml(order.suggested_human || '-')}</td>
    </tr>`).join('')

  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"></head>
  <body style="margin:0;background:#eef2f5;font-family:Arial,sans-serif;color:#17212b">
    <div style="max-width:760px;margin:0 auto;padding:24px">
      <div style="background:#ffffff;border-top:5px solid #0f766e;padding:22px;border-radius:6px">
        <div style="font-size:12px;color:#64748b">${escapeHtml(digest.date)} · Otomatik günlük rapor</div>
        <h1 style="font-size:22px;margin:6px 0 18px">Su Takip Günlük Operasyon Özeti</h1>
        <table style="width:100%;border-collapse:collapse;table-layout:fixed"><tr>
          ${kpiCell(summary.pending || 0, 'İrsaliye bekleyen', '#b45309')}
          ${kpiCell(summary.negative || 0, 'Eksi stok', '#b91c1c')}
          ${kpiCell(summary.low || 0, 'Düşük stok', '#c2410c')}
          ${kpiCell(digest.order_count || 0, 'Sipariş önerisi', '#0369a1')}
        </tr></table>
        <div style="margin-top:18px;padding:12px 14px;border-left:4px solid ${digest.actionable ? '#b45309' : '#15803d'};background:#f8fafc;font-size:14px;line-height:1.5">
          ${escapeHtml(statusLine)}
        </div>
        ${orderRows ? `<h2 style="font-size:16px;margin:22px 0 8px">Sipariş Planı</h2>
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead><tr style="background:#e2e8f0">
              <th style="padding:7px 8px;border:1px solid #cbd5e1;text-align:left">Ürün</th>
              <th style="padding:7px 8px;border:1px solid #cbd5e1;text-align:left">Bakiye</th>
              <th style="padding:7px 8px;border:1px solid #cbd5e1;text-align:left">Sipariş son günü</th>
              <th style="padding:7px 8px;border:1px solid #cbd5e1;text-align:left">Önerilen miktar</th>
            </tr></thead><tbody>${orderRows}</tbody>
          </table>` : ''}
        <p style="margin:22px 0 0;font-size:11px;color:#64748b">Ayrıntılar ve güncel stok için YYS · Su Takip ekranını açın.</p>
      </div>
    </div>
  </body></html>`

  const textLines = [
    `SU TAKİP GÜNLÜK OPERASYON ÖZETİ - ${digest.date}`,
    '',
    statusLine,
    '',
    `İrsaliye bekleyen: ${summary.pending || 0}`,
    `Eksi stok: ${summary.negative || 0}`,
    `Düşük stok: ${summary.low || 0}`,
    `Sipariş önerisi: ${digest.order_count || 0}`,
    `Gecikmiş sipariş: ${digest.overdue_order_count || 0}`,
  ]
  if (orders.length) {
    textLines.push('', 'SİPARİŞ PLANI')
    for (const order of orders.slice(0, 12)) {
      textLines.push(`- ${order.product_name}: ${order.suggested_human || '-'} · son gün ${order.order_by_date || '-'}`)
    }
  }
  textLines.push('', 'Ayrıntılar: YYS > Su Takip')

  return { subject, html, text: textLines.join('\n') }
}

export function queueWaterDailyDigestEmail(digest, { force = false, requestedBy = null, source = 'cron' } = {}) {
  const existing = q.getDailyDigestDeliveryByDate(digest.date)
  if (existing && ACTIVE_JOB_STATUSES.has(existing.job_status)) {
    return serializeDelivery(existing, { already_queued: true })
  }
  if (existing && !force) {
    return serializeDelivery(existing, { already_queued: true })
  }

  const smtp = getSmtpStatus()
  const recipients = q.listWaterOperationEmails()
  const content = buildWaterDailyDigestEmail(digest)
  const record = {
    digest_date: digest.date,
    status: smtp.configured ? (recipients.length ? 'queued' : 'no_recipients') : 'smtp_disabled',
    source: source === 'manual' ? 'manual' : 'cron',
    recipients: JSON.stringify(recipients),
    subject: content.subject,
    summary_json: JSON.stringify({
      actionable: digest.actionable,
      parts: digest.parts,
      summary: digest.summary,
      order_count: digest.order_count,
      overdue_order_count: digest.overdue_order_count,
      due_soon_order_count: digest.due_soon_order_count,
      soon_count: digest.soon_count,
      details: digest.details,
    }),
    last_error: !smtp.configured
      ? `SMTP yapılandırması eksik: ${smtp.missing.join(', ')}`
      : recipients.length === 0
        ? 'Müdür veya vardiya sorumlusu rolünde e-posta adresi tanımlı kullanıcı yok'
        : null,
    requested_by: requestedBy || null,
  }

  if (!smtp.configured || recipients.length === 0) {
    return serializeDelivery(q.upsertDailyDigestDelivery(record), { already_queued: false })
  }

  const db = getDB()
  const createQueuedDelivery = db.transaction(() => {
    const current = q.getDailyDigestDeliveryByDate(digest.date)
    if (current && ACTIVE_JOB_STATUSES.has(current.job_status)) {
      return { row: current, alreadyQueued: true }
    }
    if (current && !force) {
      return { row: current, alreadyQueued: true }
    }
    const delivery = q.upsertDailyDigestDelivery(record)
    const jobId = enqueue('water.daily-digest-mail', {
      deliveryId: delivery.id,
      to: recipients.join(','),
      subject: content.subject,
      html: content.html,
      text: content.text,
    }, { maxAttempts: 5 })
    if (!q.linkDailyDigestJob(delivery.id, jobId)) throw new Error('Günlük su özeti kuyruk kaydına bağlanamadı')
    return { row: q.getDailyDigestDeliveryByDate(digest.date), alreadyQueued: false }
  })

  const queued = createQueuedDelivery.immediate()
  return serializeDelivery(queued.row, { already_queued: queued.alreadyQueued })
}

export function dailyDigestDeliveriesService({ limit = 14 } = {}) {
  const normalizedLimit = Math.max(1, Math.min(90, parseInt(limit, 10) || 14))
  return {
    schedule: { time: '06:15', timezone: 'Europe/Istanbul' },
    smtp: getSmtpStatus(),
    recipients: q.listWaterOperationEmails(),
    rows: q.listDailyDigestDeliveries(normalizedLimit).map(row => serializeDelivery(row)),
  }
}
