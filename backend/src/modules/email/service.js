import nodemailer from 'nodemailer'
import { getEmailSettings, getManagerEmails } from './queries.js'
import { getOccupancyReport, getMaintenanceReport, getHousekeepingReport } from '../reports/service.js'
import { getDB } from '../../shared/db/index.js'

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

export function buildReportHtml() {
  const today = new Date().toISOString().split('T')[0]

  const occupancy = getOccupancyReport()
  const maintenance = getMaintenanceReport()
  const housekeeping = getHousekeepingReport(today)

  // Giriş/çıkış bugün beklenenler
  const db = getDB()
  const checkinsToday = db.prepare(`
    SELECT COUNT(*) as c FROM room_assignments
    WHERE DATE(assigned_at) = DATE('now')
  `).get()?.c ?? 0
  const checkoutsToday = db.prepare(`
    SELECT COUNT(*) as c FROM room_assignments
    WHERE DATE(check_out_at) = DATE('now')
  `).get()?.c ?? 0

  // Çamaşırhane — bekleyen + teslim edilen bugün
  const laundryPending = db.prepare(`
    SELECT COUNT(*) as c FROM laundry_items WHERE status NOT IN ('delivered','lost')
  `).get()?.c ?? 0
  const laundryDeliveredToday = db.prepare(`
    SELECT COUNT(*) as c FROM laundry_items
    WHERE status='delivered' AND DATE(updated_at) = DATE('now')
  `).get()?.c ?? 0

  const dolulukOrani = occupancy.totals.yatak > 0
    ? Math.round((occupancy.totals.dolu / occupancy.totals.yatak) * 100)
    : 0

  const rows = (arr, cols) => arr.map(row =>
    `<tr>${cols.map(c => `<td style="padding:4px 8px;border:1px solid #ddd">${row[c] ?? '-'}</td>`).join('')}</tr>`
  ).join('')

  const table = (headers, cols, data) => `
    <table style="border-collapse:collapse;width:100%;margin-bottom:16px;font-size:13px">
      <thead><tr>${headers.map(h => `<th style="padding:6px 8px;border:1px solid #ddd;background:#f3f4f6;text-align:left">${h}</th>`).join('')}</tr></thead>
      <tbody>${rows(data, cols)}</tbody>
    </table>`

  return `
<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><style>
  body { font-family: Arial, sans-serif; color: #1f2937; background: #fff; }
  h2 { margin: 24px 0 8px; color: #1d4ed8; border-bottom: 2px solid #e5e7eb; padding-bottom: 4px; }
  .kpi-grid { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
  .kpi { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 6px; padding: 12px 20px; min-width: 120px; }
  .kpi-val { font-size: 28px; font-weight: bold; color: #0369a1; }
  .kpi-lbl { font-size: 11px; color: #64748b; text-transform: uppercase; }
</style></head>
<body>
<p style="color:#64748b;font-size:12px">Rapor tarihi: ${today}</p>

<h2>KPI Özeti</h2>
<div class="kpi-grid">
  <div class="kpi"><div class="kpi-val">%${dolulukOrani}</div><div class="kpi-lbl">Doluluk</div></div>
  <div class="kpi"><div class="kpi-val">${occupancy.totals.dolu}</div><div class="kpi-lbl">Dolu Yatak</div></div>
  <div class="kpi"><div class="kpi-val">${maintenance.open}</div><div class="kpi-lbl">Açık Arıza</div></div>
  <div class="kpi"><div class="kpi-val" style="color:${maintenance.overdue > 0 ? '#dc2626' : '#0369a1'}">${maintenance.overdue}</div><div class="kpi-lbl">SLA İhlali</div></div>
</div>

<h2>Doluluk — Blok Bazlı</h2>
${table(
  ['Blok', 'Oda', 'Toplam Yatak', 'Dolu', 'Boş'],
  ['block', 'oda_sayisi', 'toplam_yatak', 'dolu_yatak', 'bos'],
  occupancy.blocks.map(b => ({ ...b, dolu_yatak: b.dolu_yatak, bos: b.toplam_yatak - b.dolu_yatak }))
)}

<h2>Temizlik Özeti — Bugün</h2>
<p>Toplam: ${housekeeping.total} | Tamamlanan: ${housekeeping.done} | Atlanan: ${housekeeping.skipped} | Bekleyen: ${housekeeping.pending}</p>
${table(
  ['Alan', 'Blok', 'Kat', 'Görev', 'Durum', 'Temizlikçi'],
  ['area', 'block', 'floor', 'task_type', 'durum', 'temizlikci'],
  housekeeping.tasks.slice(0, 20)
)}
${housekeeping.tasks.length > 20 ? `<p style="color:#64748b;font-size:12px">...ve ${housekeeping.tasks.length - 20} görev daha</p>` : ''}

<h2>Bakım / Arıza — Son 7 Gün</h2>
<p>Açık: ${maintenance.open} | Tamamlanan: ${maintenance.closed} | SLA İhlali: <span style="color:${maintenance.overdue > 0 ? '#dc2626' : 'inherit'}">${maintenance.overdue}</span></p>
${table(
  ['Konum', 'Açıklama', 'Öncelik', 'Durum', 'SLA', 'Teknisyen'],
  ['location', 'description', 'priority', 'durum', 'sla', 'teknisyen'],
  maintenance.requests.slice(0, 15)
)}

<h2>Giriş / Çıkış — Bugün</h2>
<div class="kpi-grid">
  <div class="kpi"><div class="kpi-val">${checkinsToday}</div><div class="kpi-lbl">Giriş</div></div>
  <div class="kpi"><div class="kpi-val">${checkoutsToday}</div><div class="kpi-lbl">Çıkış</div></div>
</div>

<h2>Çamaşırhane Özeti</h2>
<div class="kpi-grid">
  <div class="kpi"><div class="kpi-val">${laundryPending}</div><div class="kpi-lbl">Bekleyen Sipariş</div></div>
  <div class="kpi"><div class="kpi-val">${laundryDeliveredToday}</div><div class="kpi-lbl">Bugün Teslim</div></div>
</div>

<hr style="margin-top:32px;border:none;border-top:1px solid #e5e7eb">
<p style="font-size:11px;color:#94a3b8">Bu e-posta YYS tarafından otomatik olarak oluşturulmuştur.</p>
</body>
</html>`
}

export async function sendMorningReport() {
  const settings = getEmailSettings()
  if (!settings.enabled) return

  const to = getManagerEmails()
  if (to.length === 0) return

  const html = buildReportHtml()
  const today = new Date().toISOString().split('T')[0]

  const transport = createTransport()
  const mailOptions = {
    from: process.env.SMTP_FROM ?? 'YYS <noreply@yys.local>',
    to: to.join(', '),
    ...(settings.cc ? { cc: settings.cc } : {}),
    subject: `YYS Sabah Raporu — ${today}`,
    html,
  }

  try {
    await transport.sendMail(mailOptions)
  } catch (e) {
    console.error('[Email] SMTP gönderim hatası:', e.message)
    throw e
  }
}
