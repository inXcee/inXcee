import { openPrintWindow } from '../../../shared/logic/printWindow.js'
import { loadPersonnelDrilldownExportData } from './personnelTrackingExcel.js'

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character])
}

function number(value) {
  return Number(value || 0).toLocaleString('tr-TR', { maximumFractionDigits: 1 })
}

function date(value) {
  if (!value) return '—'
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? escapeHtml(value) : parsed.toLocaleDateString('tr-TR')
}

function compact(value) {
  if (!value) return '—'
  if (typeof value !== 'object') return escapeHtml(value)
  return escapeHtml(Object.entries(value).map(([key, item]) => `${key}: ${item ?? '—'}`).join(' · '))
}

function personRows(items) {
  return items.map(item => `<tr><td><b>${escapeHtml(item.full_name)}</b><small>${escapeHtml(item.position || '—')}</small></td><td>${escapeHtml(item.project_name || '—')}<small>${escapeHtml(item.department_name || '—')}</small></td><td class="num">${number(item.record_count)}</td><td class="num">${number(item.day_total)} gün · ${number(item.hour_total)} saat</td><td>${date(item.last_occurred_at)}</td><td>${escapeHtml(item.status || item.employment_status || '—')}</td></tr>`).join('')
}

function recordRows(items) {
  return items.map(item => `<tr><td><b>${escapeHtml(item.full_name)}</b><small>${escapeHtml(item.position || '—')}</small></td><td>${date(item.occurred_at)}${item.end_at ? `<small>${date(item.end_at)}</small>` : ''}</td><td>${escapeHtml(item.subtype || item.metric_type || '—')}<small>${escapeHtml(item.status || '—')}</small></td><td class="num">${number(item.quantity)} ${escapeHtml(item.unit || '')}</td><td>${escapeHtml(item.work_project_name || item.project_name || '—')}<small>${escapeHtml(item.work_location_name || item.department_name || '—')}</small></td><td>${escapeHtml(item.reason || '—')}<small>${escapeHtml(item.actor_name || '—')}</small>${item.before || item.after ? `<small class="change">${compact(item.before)} → ${compact(item.after)}</small>` : ''}</td></tr>`).join('')
}

export function buildPersonnelDrilldownPrintHtml({ meta = {}, items = [], view = 'people', filterLabels = [], generatedBy, generatedAt = new Date() }) {
  const summary = meta.summary || {}
  const columns = view === 'people'
    ? ['Personel', 'Proje / Departman', 'Kayıt', 'Gün / Saat', 'Son Tarih', 'Durum']
    : ['Personel', 'Tarih', 'Tür / Durum', 'Miktar', 'Proje / Nokta', 'Gerekçe / İşlem']
  const rows = view === 'people' ? personRows(items) : recordRows(items)
  const period = meta.scope === 'current' ? 'Bugünkü durum' : `${meta.period?.from || '—'} – ${meta.period?.to || '—'}`
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${escapeHtml(meta.definition || 'Personel takip detayı')}</title><style>
    @page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{margin:0;color:#0f172a;font:10px Arial,sans-serif}header{display:flex;justify-content:space-between;gap:20px;padding-bottom:10px;border-bottom:2px solid #2563eb}h1{margin:0 0 4px;font-size:19px}p{margin:2px 0;color:#475569}.meta{text-align:right;font-size:9px}.summary{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin:10px 0}.summary div{padding:7px;border:1px solid #cbd5e1;border-radius:5px}.summary span,.summary b{display:block}.summary span{color:#64748b;font-size:8px}.summary b{margin-top:3px;font-size:14px;color:#2563eb}.filters{padding:7px;margin-bottom:8px;background:#f1f5f9;border-radius:5px;color:#475569}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{padding:5px;border:1px solid #cbd5e1;vertical-align:top;overflow-wrap:anywhere}th{background:#334155;color:white;text-align:left;font-size:8px}tr:nth-child(even){background:#f8fafc}td small{display:block;margin-top:3px;color:#64748b;font-size:8px}.num{text-align:right}.change{color:#2563eb!important}footer{margin-top:8px;color:#64748b;font-size:8px}@media print{thead{display:table-header-group}}
  </style></head><body><header><div><h1>${escapeHtml(meta.definition || 'Personel takip detayı')}</h1><p>${escapeHtml(period)} · ${view === 'people' ? 'Kişiler' : 'Kayıtlar'} görünümü</p></div><div class="meta">${escapeHtml(new Date(generatedAt).toLocaleString('tr-TR'))}<br>${escapeHtml(generatedBy || 'YYS Kullanıcısı')}</div></header>
  <section class="summary"><div><span>Ana toplam</span><b>${number(summary.primary_value)}</b></div><div><span>Kişi</span><b>${number(summary.people_count)}</b></div><div><span>Kayıt</span><b>${number(summary.record_count)}</b></div><div><span>Gün</span><b>${number(summary.day_total)}</b></div><div><span>Saat</span><b>${number(summary.hour_total)}</b></div></section>
  <div class="filters"><b>Filtreler:</b> ${escapeHtml(filterLabels.filter(Boolean).join(' · ') || 'Tüm kayıtlar')}</div><table><thead><tr>${columns.map(column => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${columns.length}">Bu kapsamda kayıt yok.</td></tr>`}</tbody></table><footer>YYS Personel Takip Merkezi · ${items.length} satır</footer></body></html>`
}

export async function printPersonnelDrilldown({ api, filters, view, filterLabels, generatedBy }) {
  const data = await loadPersonnelDrilldownExportData(api, filters)
  const items = view === 'records' ? data.records : data.people
  const html = buildPersonnelDrilldownPrintHtml({ meta: data.meta, items, view, filterLabels, generatedBy, generatedAt: new Date() })
  openPrintWindow(html, { width: 1280, height: 900 })
  return { rows: items.length, truncated: data.truncated }
}

export { escapeHtml as escapePersonnelPrintHtml }
