// Gün detayı çıktıları: Excel (exceljs lazy) ve yazdırma görünümü (tarayıcı → PDF).
// Satır üretimi dayDetail.js'te; burada yalnız dosya/sayfa kurulumu.
import { dayDetailRows, dayDetailSummary } from './dayDetail.js'

const GROUP_LABEL = { dept: 'Departman', site: 'Site', location: 'Çalışma noktası' }

function summaryLine(detail) {
  return dayDetailSummary(detail).map(item => `${item.label}: ${item.value}`).join('  ·  ')
}

export async function exportDayDetailExcel(detail) {
  const ExcelJS = (await import('exceljs')).default
  const { saveWorkbook } = await import('../../../shared/logic/excelKit.js')
  const { headers, rows } = dayDetailRows(detail)
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Gün Detayı', { views: [{ state: 'frozen', ySplit: 3 }] })

  sheet.mergeCells(1, 1, 1, headers.length)
  sheet.getCell(1, 1).value = `GÜN DETAYI · ${detail.date} · ${GROUP_LABEL[detail.group_by] || 'Departman'} bazında`
  sheet.getCell(1, 1).font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }
  sheet.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }
  sheet.mergeCells(2, 1, 2, headers.length)
  sheet.getCell(2, 1).value = summaryLine(detail)
  sheet.getCell(2, 1).font = { size: 10, color: { argb: 'FF475569' } }

  const headerRow = sheet.addRow(headers)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E7490' } }
  rows.forEach(row => sheet.addRow(row))
  sheet.columns.forEach((column, index) => {
    const header = String(headers[index] ?? '')
    column.width = Math.min(38, Math.max(12, header.length + 6))
  })
  if (rows.length) sheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: headers.length } }
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }

  const buffer = await workbook.xlsx.writeBuffer()
  saveWorkbook(buffer, `vardiya-gun-detayi-${detail.date}.xlsx`)
}

const escapeHtml = value => String(value ?? '').replace(/[&<>"]/g, ch => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]
))

// Bölüm bölüm yazdırma görünümü — tarayıcının "PDF olarak kaydet"i ile alınır.
export function buildDayDetailHtml(detail) {
  const groupLabel = GROUP_LABEL[detail.group_by] || 'Departman'
  const bucket = (title, items, render) => (items.length
    ? `<div class="bucket"><span class="bk">${title} (${items.length})</span> ${items.map(render).join(' · ')}</div>`
    : '')
  const sections = (detail.groups || []).map(group => `
    <section>
      <h2>${escapeHtml(group.name)}
        <span class="meta">çalışan ${group.totals.working} · izin ${group.totals.on_leave} · rapor ${group.totals.sick} · devamsız ${group.totals.absent} · izin günü ${group.totals.off}</span>
      </h2>
      ${(group.shifts || []).map(shift => `
        <div class="shift"><b>${escapeHtml(shift.shift_name)}</b> <span class="hrs">${escapeHtml(shift.start_hour || '')}${shift.end_hour ? '–' + escapeHtml(shift.end_hour) : ''}</span> · ${shift.count} kişi
          <div class="people">${shift.people.map(p => escapeHtml(p.full_name) + (p.work_location_name ? ` <i>(${escapeHtml(p.work_location_name)})</i>` : '')).join(', ')}</div>
        </div>`).join('')}
      ${bucket('⚪ İzinli', group.on_leave, p => `${escapeHtml(p.full_name)} <i>${escapeHtml(p.leave_type_label)}</i>`)}
      ${bucket('🔴 Raporlu', group.sick, p => escapeHtml(p.full_name))}
      ${bucket('⛔ Devamsız', group.absent, p => `${escapeHtml(p.full_name)}${p.reason ? ` <i>${escapeHtml(p.reason)}</i>` : ''}`)}
      ${bucket('💤 İzin günü', group.off, p => escapeHtml(p.full_name))}
    </section>`).join('')

  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Gün Detayı ${escapeHtml(detail.date)}</title>
<style>
  body { font-family: Arial, sans-serif; color: #0f172a; margin: 24px; font-size: 12px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .summary { color: #475569; margin-bottom: 16px; font-size: 12px; }
  section { border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 12px; margin-bottom: 10px; page-break-inside: avoid; }
  h2 { font-size: 14px; margin: 0 0 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
  h2 .meta { font-size: 10px; color: #64748b; font-weight: 400; margin-left: 8px; }
  .shift { margin: 4px 0; }
  .shift .hrs { color: #64748b; font-size: 10px; }
  .people { color: #334155; margin: 2px 0 6px 12px; }
  .bucket { margin: 3px 0; font-size: 11px; }
  .bucket .bk { font-weight: 700; }
  i { color: #64748b; font-style: normal; }
  @media print { body { margin: 8mm; } }
</style></head><body>
  <h1>GÜN DETAYI · ${escapeHtml(detail.date)} · ${groupLabel} bazında</h1>
  <div class="summary">${escapeHtml(summaryLine(detail))}</div>
  ${sections || '<p>Bu gün için çizelge kaydı yok.</p>'}
</body></html>`
}

export function openDayDetailPrint(detail) {
  const win = window.open('', '_blank', 'width=1024,height=800')
  if (!win) throw new Error('Yazdırma penceresi açılamadı')
  win.document.open()
  win.document.write(buildDayDetailHtml(detail))
  win.document.close()
  win.focus()
  window.setTimeout(() => win.print(), 400)
}
