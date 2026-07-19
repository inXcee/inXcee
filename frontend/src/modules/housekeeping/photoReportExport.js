// Temizlik fotoğraf kanıt raporu — filtrelenmiş görevlerin kapak fotoğrafı + özetiyle
// yazdırılabilir PDF ve Excel listesi. Saf builder'lar test edilebilir; open/export sarmalayıcı.
import { saveWorkbook } from '../../shared/logic/excelKit.js'
import { PHOTO_CATEGORY_MAP } from './shared.jsx'

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;')
}

const AREA_LABEL = { room: 'Oda', corridor: 'Koridor', toilet: 'Tuvalet/WC', bathroom: 'Banyo', stairs: 'Merdiven', common: 'Ortak Alan' }

export function photoReportStatus(item) {
  if (item.skipped) return 'Atlandı'
  if (!item.completed_at) return 'Bekliyor'
  return (item.photo_count || 0) > 0 ? 'Fotoğraflı' : 'Foto eksik'
}

function categoryLabels(item) {
  return String(item.photo_categories || '').split(',').filter(Boolean)
    .map(c => PHOTO_CATEGORY_MAP[c]?.label || c).join(', ')
}

export function photoReportSummary(items = []) {
  return items.reduce((a, i) => {
    a.tasks++
    a.photos += (i.photo_count || 0)
    if ((i.photo_count || 0) > 0) a.withPhoto++
    return a
  }, { tasks: 0, photos: 0, withPhoto: 0 })
}

function absUrl(url, baseUrl) {
  if (!url) return ''
  return /^https?:/i.test(url) ? url : `${baseUrl || ''}${url}`
}

export function buildPhotoReportHtml({ items = [], subtitle = '', baseUrl = '' } = {}) {
  const summary = photoReportSummary(items)
  const cards = items.map(item => {
    const cover = absUrl(item.photo_url, baseUrl)
    const cats = categoryLabels(item)
    return `<div class="card">
      ${cover
        ? `<img src="${escapeHtml(cover)}" alt="${escapeHtml(item.area)}" />${item.photo_count > 1 ? `<span class="cnt">📷 ${item.photo_count}</span>` : ''}`
        : '<div class="nophoto">Foto yok</div>'}
      <div class="meta">
        <b>${escapeHtml(item.area || '')}</b>
        <div class="sub">${escapeHtml(item.block || '')} · Kat ${escapeHtml(String(item.floor ?? ''))} · ${escapeHtml(AREA_LABEL[item.area_code] || '')}</div>
        <div class="st">${escapeHtml(photoReportStatus(item))}${cats ? ` · ${escapeHtml(cats)}` : ''}</div>
      </div>
    </div>`
  }).join('')

  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Fotoğraf Kanıt Raporu</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; color: #111; }
  h1 { font-size: 16px; margin: 0 0 2px; }
  .sub0 { color: #555; font-size: 11px; margin-bottom: 8px; }
  .kpis { font-size: 12px; margin-bottom: 12px; }
  .kpis b { font-size: 14px; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .card { border: 1px solid #ccc; border-radius: 6px; overflow: hidden; page-break-inside: avoid; }
  .card img { width: 100%; height: 110px; object-fit: cover; display: block; }
  .card .cnt { position: relative; float: right; margin-top: -22px; margin-right: 4px; background: rgba(0,0,0,.66); color: #fff; border-radius: 10px; padding: 1px 7px; font-size: 10px; }
  .nophoto { height: 60px; display: flex; align-items: center; justify-content: center; color: #999; font-size: 11px; background: #f4f4f4; }
  .meta { padding: 6px 8px; }
  .meta b { font-size: 12px; }
  .meta .sub { color: #666; font-size: 9px; margin-top: 2px; }
  .meta .st { color: #333; font-size: 9px; margin-top: 3px; }
</style></head><body>
  <h1>TEMİZLİK FOTOĞRAF KANIT RAPORU</h1>
  <div class="sub0">${escapeHtml(subtitle)}</div>
  <div class="kpis">Görev: <b>${summary.tasks}</b> · Fotoğraflı: <b>${summary.withPhoto}</b> · Toplam foto: <b>${summary.photos}</b></div>
  <div class="grid">${cards || '<div>Kayıt yok</div>'}</div>
</body></html>`
}

export function buildPhotoReportWorkbook(ExcelJS, { items = [] } = {}) {
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('Foto Kanıt', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = [
    { header: 'Alan', key: 'area', width: 26 },
    { header: 'Blok', key: 'block', width: 8 },
    { header: 'Kat', key: 'floor', width: 6 },
    { header: 'Tür', key: 'type', width: 12 },
    { header: 'Durum', key: 'status', width: 12 },
    { header: 'Foto', key: 'count', width: 6 },
    { header: 'Kategoriler', key: 'cats', width: 26 },
    { header: 'Tarih', key: 'date', width: 16 },
  ]
  ws.getRow(1).font = { bold: true }
  items.forEach(item => {
    ws.addRow({
      area: item.area || '',
      block: item.block || '',
      floor: item.floor ?? '',
      type: AREA_LABEL[item.area_code] || '',
      status: photoReportStatus(item),
      count: item.photo_count || 0,
      cats: categoryLabels(item),
      date: item.scheduled_at ? String(item.scheduled_at).slice(0, 16).replace('T', ' ') : '',
    })
  })
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  return { workbook, sheetName: ws.name }
}

export function openPhotoReportPrint({ items, subtitle }) {
  const baseUrl = (typeof window !== 'undefined' && window.location?.origin) || ''
  const html = buildPhotoReportHtml({ items, subtitle, baseUrl })
  const win = window.open('', '_blank', 'width=1024,height=800')
  if (!win) throw new Error('Yazdirma penceresi acilamadi')
  win.document.open(); win.document.write(html); win.document.close(); win.focus()
  window.setTimeout(() => win.print(), 500)
}

export async function exportPhotoReportExcel({ items, filename = 'foto-kanit-raporu.xlsx' }) {
  const ExcelJS = (await import('exceljs')).default
  const { workbook } = buildPhotoReportWorkbook(ExcelJS, { items })
  const buffer = await workbook.xlsx.writeBuffer()
  saveWorkbook(buffer, filename)
}
