// "ŞU AN" canlı lokasyon doluluğu snapshot'ı — PDF/yazdır ve Excel çıktısı.
// Saf builder'lar (buildOccupancyPrintHtml / buildOccupancyWorkbook) test edilebilir;
// openOccupancyPrintWindow / exportOccupancyExcel ince tarayıcı sarmalayıcılarıdır.
import { openPrintWindow } from '../../../shared/logic/printWindow.js'
import { saveWorkbook } from '../../../shared/logic/excelKit.js'

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

const SITE_ORDER = ['OTC', 'LOKAL', 'KAMP', 'Yemekhane']
function sortRows(rows = []) {
  return [...rows].sort((a, b) => {
    const ia = SITE_ORDER.indexOf(a.site); const ib = SITE_ORDER.indexOf(b.site)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
      || String(a.site || '').localeCompare(String(b.site || ''), 'tr')
      || String(a.name || '').localeCompare(String(b.name || ''), 'tr')
  })
}

function statusOf(row) {
  if (row.understaffed) return 'EKSİK'
  if (row.empty) return 'BOŞ'
  return 'TAMAM'
}

function presentNames(row) {
  return (row.present || []).map(p => p.full_name + (p.end_time ? ` (→${p.end_time})` : '')).join(', ')
}

export function occupancyExportSummary(rows = []) {
  const real = rows.filter(r => !r.is_default_area)
  return {
    present: rows.reduce((sum, r) => sum + (r.count || 0), 0),
    empty: real.filter(r => r.empty).length,
    understaffed: real.filter(r => r.understaffed).length,
  }
}

// Yazdırılabilir A4 HTML (PDF için tarayıcı yazdır penceresi).
export function buildOccupancyPrintHtml({ date, time, rows = [] } = {}) {
  const sorted = sortRows(rows)
  const summary = occupancyExportSummary(rows)
  const body = sorted.map((row, idx) => {
    const status = statusOf(row)
    const cls = row.understaffed ? 'under' : row.empty ? 'empty' : 'ok'
    return `<tr class="${cls}">
      <td class="c">${idx + 1}</td>
      <td>${escapeHtml(row.site || '')}</td>
      <td><b>${escapeHtml(row.name || '')}</b></td>
      <td class="c">${status}</td>
      <td class="c">${row.count}${row.required ? ` / ${row.required}` : ''}</td>
      <td>${escapeHtml(presentNames(row)) || '<span class="muted">— kimse yok —</span>'}</td>
    </tr>`
  }).join('')

  return `<!doctype html><html lang="tr"><head><meta charset="utf-8">
<title>Canlı Doluluk ${escapeHtml(date)} ${escapeHtml(time)}</title>
<style>
  @page { size: A4 portrait; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; color: #111; font-size: 12px; }
  h1 { font-size: 17px; margin: 0 0 2px; letter-spacing: 1px; }
  .sub { color: #555; font-size: 11px; margin-bottom: 10px; }
  .kpis { display: flex; gap: 18px; margin: 8px 0 12px; font-size: 12px; }
  .kpis b { font-size: 15px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #bbb; padding: 5px 7px; text-align: left; vertical-align: top; }
  th { background: #f0f0f0; font-size: 10px; letter-spacing: .5px; text-transform: uppercase; }
  td.c { text-align: center; white-space: nowrap; }
  tr.under td { background: #fdecec; }
  tr.under td.c { color: #c0392b; font-weight: bold; }
  tr.empty td { color: #666; }
  .muted { color: #999; }
  .foot { margin-top: 12px; color: #777; font-size: 10px; }
</style></head><body>
  <h1>CANLI LOKASYON DOLULUĞU</h1>
  <div class="sub">${escapeHtml(date)} · saat ${escapeHtml(time)} itibarıyla</div>
  <div class="kpis">
    <span>Sahada: <b>${summary.present}</b> kişi</span>
    <span>Boş nokta: <b>${summary.empty}</b></span>
    <span>Eksik (zorunlu): <b>${summary.understaffed}</b></span>
  </div>
  <table>
    <thead><tr><th>#</th><th>Site</th><th>Çalışma Noktası</th><th>Durum</th><th>Kişi</th><th>Personel</th></tr></thead>
    <tbody>${body || '<tr><td colspan="6" class="c muted">Kayıt yok</td></tr>'}</tbody>
  </table>
  <div class="foot">Yatakhane Yönetim Sistemi · anlık görüntü</div>
</body></html>`
}

export function openOccupancyPrintWindow(payload) {
  const html = buildOccupancyPrintHtml(payload)
  openPrintWindow(html, { width: 1024, height: 800 })
}

export function occupancyFilename(date, time, ext) {
  const safe = s => String(s || '').replace(/[^0-9a-zA-Z]/g, '')
  return `canli-doluluk-${safe(date)}-${safe(time)}.${ext}`
}

// Excel workbook — bir sayfa: lokasyon başına durum + personel listesi.
export function buildOccupancyWorkbook(ExcelJS, { date, time, rows = [] } = {}) {
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('ŞU AN Doluluk', { views: [{ state: 'frozen', ySplit: 3 }] })
  ws.columns = [
    { width: 5 }, { width: 10 }, { width: 26 }, { width: 10 }, { width: 8 }, { width: 60 },
  ]
  ws.mergeCells('A1:F1')
  ws.getCell('A1').value = 'CANLI LOKASYON DOLULUĞU'
  ws.getCell('A1').font = { bold: true, size: 14 }
  ws.mergeCells('A2:F2')
  const summary = occupancyExportSummary(rows)
  ws.getCell('A2').value = `${date} · saat ${time} · Sahada ${summary.present} kişi · ${summary.empty} boş nokta · ${summary.understaffed} eksik`
  ws.getCell('A2').font = { color: { argb: 'FF666666' }, size: 10 }

  const header = ws.getRow(3)
  header.values = ['#', 'Site', 'Çalışma Noktası', 'Durum', 'Kişi', 'Personel']
  header.font = { bold: true }
  header.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } } })

  sortRows(rows).forEach((row, idx) => {
    const r = ws.addRow([
      idx + 1,
      row.site || '',
      row.name || '',
      statusOf(row),
      row.required ? `${row.count}/${row.required}` : row.count,
      presentNames(row),
    ])
    if (row.understaffed) {
      r.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDECEC' } } })
      r.getCell(4).font = { bold: true, color: { argb: 'FFC0392B' } }
    }
  })
  ws.eachRow(r => r.eachCell(c => { c.border = { top: { style: 'thin', color: { argb: 'FFCCCCCC' } }, bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } }, left: { style: 'thin', color: { argb: 'FFCCCCCC' } }, right: { style: 'thin', color: { argb: 'FFCCCCCC' } } } }))
  ws.pageSetup = { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  return { workbook, sheetName: ws.name }
}

export async function exportOccupancyExcel({ date, time, rows }) {
  const ExcelJS = (await import('exceljs')).default
  const { workbook } = buildOccupancyWorkbook(ExcelJS, { date, time, rows })
  const buffer = await workbook.xlsx.writeBuffer()
  saveWorkbook(buffer, occupancyFilename(date, time, 'xlsx'))
}
