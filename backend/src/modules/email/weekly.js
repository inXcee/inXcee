// Haftalık özet e-postası — günlük sabah raporunun trend/kıyas odaklı kardeşi.
// Pazartesi 07:00 cron'u çağırır (shared/cron 'weekly-summary-email').
// Kapsam: geçen 7 tam gün (bugün hariç) + önceki 7 günle kıyas.
// SMTP/alıcı altyapısı sendReportNow ile aynı (transport, logEmailSend, manager alıcıları).

import { getDB } from '../../shared/db/index.js'
import { getEmailSettings, getManagerEmails, getSetting, logEmailSend } from './queries.js'
import { getOccupancyReport, getMaintenanceReport } from '../reports/service.js'
import { sendEmail } from './service.js'
import { logger } from '../../shared/logger.js'

// Son 7 tam günün (bugün hariç) sayaçları + önceki 7 gün kıyası.
export function buildWeeklyStats() {
  const db = getDB()
  const iso = (offsetDays) => {
    const d = new Date(); d.setDate(d.getDate() + offsetDays)
    return d.toISOString().slice(0, 10)
  }
  const range = { start: iso(-7), end: iso(-1) }
  const prevRange = { start: iso(-14), end: iso(-8) }

  const count = (sql, r) => db.prepare(sql).get(r.start, r.end)?.c ?? 0
  const counters = (r) => ({
    checkins: count(`SELECT COUNT(*) c FROM room_assignments WHERE DATE(assigned_at) BETWEEN ? AND ?`, r),
    checkouts: count(`SELECT COUNT(*) c FROM room_assignments WHERE DATE(check_out_at) BETWEEN ? AND ?`, r),
    newResidents: count(`SELECT COUNT(*) c FROM personnel WHERE DATE(created_at) BETWEEN ? AND ?`, r),
    laundryNew: count(`SELECT COUNT(*) c FROM laundry_items WHERE DATE(created_at) BETWEEN ? AND ?`, r),
    laundryDelivered: count(`SELECT COUNT(*) c FROM laundry_deliveries WHERE DATE(delivered_at) BETWEEN ? AND ?`, r),
    laundryLost: count(`SELECT COUNT(*) c FROM laundry_history WHERE to_status='lost' AND DATE(created_at) BETWEEN ? AND ?`, r),
    visitors: count(`SELECT COUNT(*) c FROM visitors WHERE DATE(check_in_at) BETWEEN ? AND ?`, r),
    maintenanceNew: count(`SELECT COUNT(*) c FROM maintenance_requests WHERE DATE(opened_at) BETWEEN ? AND ?`, r),
  })

  const cur = counters(range)
  const prev = counters(prevRange)

  return {
    range,
    ...cur,
    prev,
    laundryPending: db.prepare(`SELECT COUNT(*) c FROM laundry_items WHERE status NOT IN ('delivered','lost')`).get()?.c ?? 0,
    // Hafta içi teslimlerin ortalama süresi (giriş→teslim, saat) — deliveries
    // tablosundan; 014 backfill sonrası kiosk teslimleri de dahil
    laundryAvgHours: db.prepare(`
      SELECT ROUND(AVG((julianday(ld.delivered_at) - julianday(li.created_at)) * 24), 1) h
      FROM laundry_deliveries ld JOIN laundry_items li ON li.id = ld.item_id
      WHERE DATE(ld.delivered_at) BETWEEN ? AND ?
    `).get(range.start, range.end)?.h ?? null,
    occupancy: getOccupancyReport(),     // anlık doluluk (blok bazlı + totals)
    maintenance: getMaintenanceReport(), // son 7 gün open/closed/overdue (rapor zaten 7 günlük)
  }
}

// Δ rozeti: önceki haftaya göre artış/azalış oku.
function delta(cur, prevVal) {
  if (prevVal == null) return ''
  const d = cur - prevVal
  if (d === 0) return `<span style="font-size:11px;color:#94a3b8">aynı</span>`
  const up = d > 0
  return `<span style="font-size:11px;color:${up ? '#16a34a' : '#dc2626'}">${up ? '▲' : '▼'} ${Math.abs(d)} (önceki hafta ${prevVal})</span>`
}

export function buildWeeklyReportHtml() {
  const s = buildWeeklyStats()
  const occ = s.occupancy
  const dolulukOrani = occ.totals.yatak > 0 ? Math.round((occ.totals.dolu / occ.totals.yatak) * 100) : 0

  const kpi = (val, label, extra = '') => `
    <div class="kpi"><div class="kpi-val">${val}</div><div class="kpi-lbl">${label}</div>${extra}</div>`

  const blockRows = occ.blocks.map(b =>
    `<tr><td style="padding:4px 8px;border:1px solid #ddd">${b.block}</td>
     <td style="padding:4px 8px;border:1px solid #ddd">${b.toplam_yatak}</td>
     <td style="padding:4px 8px;border:1px solid #ddd">${b.dolu_yatak}</td>
     <td style="padding:4px 8px;border:1px solid #ddd">${b.toplam_yatak - b.dolu_yatak}</td></tr>`
  ).join('')

  return `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><style>
  body{font-family:Arial,sans-serif;color:#1f2937;background:#fff}
  h2{margin:24px 0 8px;color:#1d4ed8;border-bottom:2px solid #e5e7eb;padding-bottom:4px}
  .kpi-grid{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px}
  .kpi{background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px;padding:12px 20px;min-width:120px}
  .kpi-val{font-size:28px;font-weight:bold;color:#0369a1}
  .kpi-lbl{font-size:11px;color:#64748b;text-transform:uppercase}
</style></head><body>
<h1 style="color:#1d4ed8;font-size:20px">YYS — HAFTALIK ÖZET</h1>
<p style="color:#64748b;font-size:12px">Dönem: ${s.range.start} → ${s.range.end} (önceki haftayla kıyaslı)</p>

<h2>Hafta Özeti</h2>
<div class="kpi-grid">
  ${kpi(s.checkins, 'Giriş', delta(s.checkins, s.prev.checkins))}
  ${kpi(s.checkouts, 'Çıkış', delta(s.checkouts, s.prev.checkouts))}
  ${kpi(s.newResidents, 'Yeni Sakin', delta(s.newResidents, s.prev.newResidents))}
  ${kpi(s.visitors, 'Ziyaretçi', delta(s.visitors, s.prev.visitors))}
</div>

<h2>Doluluk — Şu An</h2>
<div class="kpi-grid">
  ${kpi('%' + dolulukOrani, 'Doluluk')}
  ${kpi(occ.totals.dolu, 'Dolu Yatak')}
  ${kpi(occ.totals.yatak - occ.totals.dolu, 'Boş Yatak')}
</div>
<table style="border-collapse:collapse;width:100%;margin-bottom:16px;font-size:13px">
  <thead><tr>
    <th style="padding:6px 8px;border:1px solid #ddd;background:#f3f4f6;text-align:left">Blok</th>
    <th style="padding:6px 8px;border:1px solid #ddd;background:#f3f4f6;text-align:left">Toplam Yatak</th>
    <th style="padding:6px 8px;border:1px solid #ddd;background:#f3f4f6;text-align:left">Dolu</th>
    <th style="padding:6px 8px;border:1px solid #ddd;background:#f3f4f6;text-align:left">Boş</th>
  </tr></thead>
  <tbody>${blockRows}</tbody>
</table>

<h2>Bakım / Arıza — Son 7 Gün</h2>
<div class="kpi-grid">
  ${kpi(s.maintenanceNew, 'Yeni Arıza', delta(s.maintenanceNew, s.prev.maintenanceNew))}
  ${kpi(s.maintenance.closed, 'Kapatılan')}
  ${kpi(s.maintenance.open, 'Açık')}
  ${kpi(`<span style="color:${s.maintenance.overdue > 0 ? '#dc2626' : '#0369a1'}">${s.maintenance.overdue}</span>`, 'SLA İhlali')}
</div>

<h2>Çamaşırhane — Hafta</h2>
<div class="kpi-grid">
  ${kpi(s.laundryNew, 'Yeni Torba', delta(s.laundryNew, s.prev.laundryNew))}
  ${kpi(s.laundryDelivered, 'Teslim Edilen', delta(s.laundryDelivered, s.prev.laundryDelivered))}
  ${kpi(`<span style="color:${s.laundryLost > 0 ? '#dc2626' : '#0369a1'}">${s.laundryLost}</span>`, 'Kayıp', delta(s.laundryLost, s.prev.laundryLost))}
  ${kpi(s.laundryAvgHours != null ? s.laundryAvgHours + ' sa' : '—', 'Ort. Teslim Süresi')}
  ${kpi(s.laundryPending, 'Şu An Bekleyen')}
</div>

<hr style="margin-top:32px;border:none;border-top:1px solid #e5e7eb">
<p style="font-size:11px;color:#94a3b8">Bu e-posta YYS tarafından her pazartesi otomatik oluşturulur. Ayarlar → Genel &amp; E-Posta'dan kapatılabilir (haftalık özet anahtarı).</p>
</body></html>`
}

// Cron tarafından çağrılır (pazartesi 07:00). E-posta sistemi kapalıysa ya da
// haftalık özet anahtarı (email_weekly, varsayılan açık) kapatılmışsa atlar.
export async function sendWeeklyReport() {
  const settings = getEmailSettings()
  if (!settings.enabled) return
  if (getSetting('email_weekly') === '0') return
  return sendWeeklyReportNow()
}

// Test butonu / cron gövdesi — filtre uygulamaz.
export async function sendWeeklyReportNow({ toOverride } = {}) {
  const to = toOverride ? [toOverride] : getManagerEmails()
  if (to.length === 0) {
    const msg = 'Yönetici (campus_manager) kullanıcılarına e-posta tanımlı değil — Ayarlar → Kullanıcılar üzerinden e-posta adresi ekleyin'
    logEmailSend({ recipients: '-', status: 'error', errorMsg: msg })
    throw new Error(msg)
  }
  const html = buildWeeklyReportHtml()
  const today = new Date().toISOString().slice(0, 10)
  try {
    const result = await sendEmail({ to: to.join(', '), subject: `YYS Haftalık Özet — ${today}`, html })
    logEmailSend({ recipients: to.join(', '), status: 'success' })
    return { ok: true, recipients: to, messageId: result.messageId }
  } catch (e) {
    logEmailSend({ recipients: to.join(', '), status: 'error', errorMsg: e.message })
    logger.error('[Email] Haftalık özet gönderim hatası:', e.message)
    throw new Error(`SMTP gönderim hatası: ${e.message}`)
  }
}
