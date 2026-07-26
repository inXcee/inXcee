// Kampüs durum raporu çıktıları: Excel (exceljs lazy) ve yazdırma görünümü.
// Satır üretimi saf; kaynak /campus-map/summary yanıtı.
import { buildAttentionQueue, buildOverviewRows } from './campusOverview.js'

const KIND_LABEL = {
  fault: 'ARIZA',
  full: 'DOLU',
  cleaning: 'TEMİZLİK',
  quarantine: 'KARANTİNA',
  maintenance: 'BAKIM',
}

export function campusReportRows(stats) {
  const { rows, totals } = buildOverviewRows(stats)
  const overviewHeaders = [
    'BLOK', 'DOLULUK %', 'DOLU YATAK', 'TOPLAM YATAK', 'BOŞ ODA', 'DOLU ODA',
    'ARIZA', 'TEMİZLİK %', 'KARANTİNA', 'BAKIM',
  ]
  // Temizlik görevi üretilmemiş blokta yüzde yerine boş — 0 yazmak "hiç
  // temizlenmedi" gibi okunurdu.
  const overviewRows = rows.map(row => [
    row.block, row.occupancy_pct, row.occupied, row.total_beds, row.empty_rooms,
    row.full_rooms, row.open_faults, row.cleaning_pct == null ? '' : row.cleaning_pct,
    row.quarantine, row.maintenance,
  ])
  if (rows.length) {
    overviewRows.push([
      'TOPLAM', totals.occupancy_pct, totals.occupied, totals.total_beds, totals.empty_rooms,
      totals.full_rooms, totals.open_faults, totals.cleaning_pct, totals.quarantine, totals.maintenance,
    ])
  }

  const queue = buildAttentionQueue(stats)
  return {
    overview: { headers: overviewHeaders, rows: overviewRows },
    attention: {
      headers: ['BLOK', 'TÜR', 'DURUM'],
      rows: queue.map(item => [item.block, KIND_LABEL[item.kind] || item.kind, item.text]),
    },
  }
}

export async function exportCampusReportExcel(stats, date) {
  const ExcelJS = (await import('exceljs')).default
  const { saveWorkbook } = await import('../../../shared/logic/excelKit.js')
  const { overview, attention } = campusReportRows(stats)
  const workbook = new ExcelJS.Workbook()

  const addSheet = (name, block, tabColor, numberFrom) => {
    const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 2 }] })
    sheet.properties.tabColor = { argb: tabColor }
    sheet.mergeCells(1, 1, 1, block.headers.length)
    sheet.getCell(1, 1).value = `KAMPÜS DURUM RAPORU · ${date} · ${name}`
    sheet.getCell(1, 1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
    sheet.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }
    const header = sheet.addRow(block.headers)
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E7490' } }
    block.rows.forEach(row => sheet.addRow(row))
    // TOPLAM satırı vurgulanır
    if (name === 'Kampüs Özeti' && block.rows.length) {
      const totalRow = sheet.getRow(block.rows.length + 2)
      totalRow.font = { bold: true }
      totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE68A' } }
    }
    sheet.columns.forEach((column, index) => {
      column.width = Math.min(30, Math.max(11, String(block.headers[index] ?? '').length + 4))
      if (index >= numberFrom) column.numFmt = '#,##0'
    })
    if (block.rows.length) sheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: block.headers.length } }
    sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  }

  addSheet('Kampüs Özeti', overview, 'FF0E7490', 1)
  addSheet('Dikkat Kuyruğu', attention, 'FFB91C1C', 99)

  const buffer = await workbook.xlsx.writeBuffer()
  saveWorkbook(buffer, `kampus-durum-raporu-${date}.xlsx`)
}

const escapeHtml = value => String(value ?? '').replace(/[&<>"]/g, ch => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]
))

const table = (block, emptyText) => (block.rows.length
  ? `<table>
      <thead><tr>${block.headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
      <tbody>${block.rows.map((row, index) => `<tr${index === block.rows.length - 1 && row[0] === 'TOPLAM' ? ' class="total"' : ''}>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>`
  : `<p class="empty">${escapeHtml(emptyText)}</p>`)

export function buildCampusReportHtml(stats, date) {
  const { overview, attention } = campusReportRows(stats)
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Kampüs Durum Raporu ${escapeHtml(date)}</title>
<style>
  body { font-family: Arial, sans-serif; color: #0f172a; margin: 20px; font-size: 11px; }
  h1 { font-size: 17px; margin: 0 0 2px; }
  h2 { font-size: 13px; margin: 18px 0 6px; border-bottom: 1px solid #cbd5e1; padding-bottom: 3px; }
  .sub { color: #475569; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: center; }
  th { background: #0e7490; color: #fff; }
  th:first-child, td:first-child { text-align: left; }
  tr.total { background: #fef3c7; font-weight: 700; }
  .empty { color: #64748b; }
  @media print { body { margin: 8mm; } h2 { page-break-after: avoid; } }
</style></head><body>
  <h1>KAMPÜS DURUM RAPORU</h1>
  <div class="sub">${escapeHtml(date)}</div>
  <h2>BLOK DURUM TABLOSU</h2>
  ${table(overview, 'Blok verisi yok.')}
  <h2>DİKKAT GEREKENLER</h2>
  ${table(attention, 'Aksiyon bekleyen yok.')}
</body></html>`
}

export function openCampusReportPrint(stats, date) {
  const win = window.open('', '_blank', 'width=1100,height=800')
  if (!win) throw new Error('Yazdırma penceresi açılamadı')
  win.document.open()
  win.document.write(buildCampusReportHtml(stats, date))
  win.document.close()
  win.focus()
  window.setTimeout(() => win.print(), 400)
}
