import {
  COLORS, argb, border, colLetter, fill, quoteSheet, saveWorkbook,
  setupSheet, setupTitle, styleHeaderRow,
} from '../../../shared/logic/excelKit.js'

export const PERSONNEL_TRACKING_EXCEL_SHEETS = [
  'Yönetim Özeti', 'Personel Metrikleri', 'İzin ve Raporlar', 'Fazla Mesai',
  'Kalıcı Transferler', 'Geçici Çapraz Çalışmalar', 'Vardiya Revizyonları',
  'İşten Çıkanlar', 'Açık Aksiyonlar',
]

export const PERSONNEL_DOSSIER_EXCEL_SHEETS = [
  'Personel Özeti', 'Vardiyalar', 'İzin ve Rapor', 'Fazla Mesai',
  'Atama Geçmişi', 'Hareket Günlüğü',
]

export const PERSONNEL_DRILLDOWN_EXCEL_SHEETS = ['Özet', 'Kişiler', 'Kayıtlar']

const EVENT_LABELS = {
  tracking_started: 'Takip başlangıcı', employment_started: 'İşe giriş', assignment_changed: 'Atama değişikliği',
  temporary_project_work: 'Geçici çalışma', shift_changed: 'Vardiya revizyonu', leave_changed: 'İzin / rapor',
  overtime_changed: 'Fazla mesai', absence_recorded: 'Devamsızlık', offboarding_started: 'Çıkış başladı',
  employment_ended: 'İşten çıkış', employment_restored: 'Geri işe alma',
}
const STATUS_LABELS = { active: 'Aktif', offboarding: 'Çıkış Sürecinde', exited: 'İşten Çıktı' }
const LEAVE_LABELS = { annual: 'Yıllık İzin', sick: 'Rapor', unpaid: 'Ücretsiz İzin', excuse: 'Mazeret İzni', other: 'Diğer' }
const SHIFT_LABELS = { scheduled: 'Planlandı', worked: 'Çalıştı', overtime: 'Fazla Mesai', off: 'Hafta Tatili', on_leave: 'İzinli', absent: 'Devamsız', sick: 'Raporlu' }
const ALERT_STATUS_LABELS = { open: 'Açık', acknowledged: 'Görüldü', resolved: 'Çözüldü', dismissed: 'Kapatıldı' }
const SEVERITY_LABELS = { critical: 'Kritik', warning: 'Uyarı', info: 'Bilgi' }

export function safeExcelText(value) {
  if (value == null) return ''
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return /^[=+\-@]/.test(text) ? `'${text}` : text
}

function number(value) { return Number(value || 0) }
function dateValue(value) {
  if (!value) return ''
  const parsed = new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(parsed.getTime()) ? safeExcelText(value) : parsed
}
function isoDay(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function filenamePart(value) { return String(value || '').replace(/[^0-9A-Za-zğüşöçıİĞÜŞÖÇ-]+/g, '-').replace(/^-+|-+$/g, '') }
export function personnelTrackingFilename(from, to) { return `personel-takip-${filenamePart(from)}-${filenamePart(to)}.xlsx` }
export function personnelDossierFilename(staffId, date = isoDay()) { return `personel-dosyasi-${filenamePart(staffId)}-${filenamePart(date)}.xlsx` }
export function personnelDrilldownFilename(metric, from, to) { return `personel-detay-${filenamePart(metric)}-${filenamePart(from)}-${filenamePart(to)}.xlsx` }

function compactObject(value) {
  if (value == null || value === '') return ''
  if (typeof value !== 'object') return safeExcelText(value)
  return safeExcelText(Object.entries(value).map(([key, item]) => `${key}: ${item ?? '—'}`).join(' · '))
}

function subtitle({ period, filterLabels = [], generatedAt, generatedBy }) {
  const filters = filterLabels.filter(Boolean).join(' · ') || 'Tüm kayıtlar'
  const timestamp = new Date(generatedAt || Date.now()).toLocaleString('tr-TR')
  return `${period?.from || '—'} → ${period?.to || '—'} | ${filters} | ${timestamp} | ${safeExcelText(generatedBy || 'YYS Kullanıcısı')}`
}

function prepareSheet(workbook, name, title, meta, columns, tabColor = COLORS.blue) {
  const ws = workbook.addWorksheet(name, { views: [{ showGridLines: false }] })
  setupSheet(ws, tabColor)
  setupTitle(ws, title, subtitle(meta), columns.length)
  ws.getRow(4).values = columns.map(column => column.label)
  styleHeaderRow(ws.getRow(4))
  ws.getRow(4).height = 28
  ws.views = [{ state: 'frozen', ySplit: 4, showGridLines: false }]
  columns.forEach((column, index) => {
    ws.getColumn(index + 1).width = column.width || 16
    if (column.numFmt) ws.getColumn(index + 1).numFmt = column.numFmt
  })
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: columns.length } }
  ws.headerFooter.oddHeader = `&L${title}&R&D &T`
  ws.headerFooter.oddFooter = '&LYYS Personel Takip Merkezi&C&P / &N&Rİç Kullanım'
  return ws
}

function appendRows(ws, rows, columns) {
  rows.forEach((record, rowIndex) => {
    const row = ws.addRow(columns.map(column => {
      const raw = typeof column.value === 'function' ? column.value(record) : record[column.key]
      if (column.type === 'number') return number(raw)
      if (column.type === 'date') return dateValue(raw)
      return safeExcelText(raw)
    }))
    row.height = 21
    row.eachCell(cell => {
      cell.border = border
      cell.alignment = { vertical: 'middle', wrapText: true }
      if (rowIndex % 2 === 1) cell.fill = fill(COLORS.surface)
    })
    columns.forEach((column, index) => {
      if (column.type === 'date') row.getCell(index + 1).numFmt = 'dd.mm.yyyy hh:mm'
      if (column.type === 'number') row.getCell(index + 1).alignment = { horizontal: 'right', vertical: 'middle' }
    })
  })
  const lastRow = Math.max(4, ws.rowCount)
  ws.autoFilter.to.row = lastRow
  ws.pageSetup.printArea = `A1:${colLetter(columns.length)}${lastRow}`
  ws.pageSetup.repeatRows = '1:4'
}

function addTotalRow(ws, columns, numericIndexes, label = 'TOPLAM') {
  const firstDataRow = 5
  const lastDataRow = ws.rowCount
  const row = ws.addRow(columns.map((_, index) => index === 0 ? label : ''))
  row.font = { bold: true, color: { argb: argb(COLORS.ink) } }
  row.eachCell({ includeEmpty: true }, cell => { cell.fill = fill(COLORS.muted); cell.border = border })
  numericIndexes.forEach(index => {
    const letter = colLetter(index)
    let result = 0
    for (let rowIndex = firstDataRow; rowIndex <= lastDataRow; rowIndex += 1) result += number(ws.getCell(rowIndex, index).value)
    row.getCell(index).value = lastDataRow >= firstDataRow
      ? { formula: `SUM(${letter}${firstDataRow}:${letter}${lastDataRow})`, result }
      : 0
    row.getCell(index).numFmt = '0.0'
  })
  ws.pageSetup.printArea = `A1:${colLetter(columns.length)}${ws.rowCount}`
}

function setDocumentProperties(workbook, title, generatedBy) {
  workbook.creator = safeExcelText(generatedBy || 'YYS')
  workbook.lastModifiedBy = safeExcelText(generatedBy || 'YYS')
  workbook.created = new Date()
  workbook.modified = new Date()
  workbook.title = title
  workbook.subject = 'Personel takip ve çalışma yaşam döngüsü raporu'
  workbook.company = 'YYS'
  workbook.calcProperties.fullCalcOnLoad = true
}

function peopleColumns() {
  return [
    { key: 'id', label: 'Personel ID', width: 12, type: 'number' }, { key: 'full_name', label: 'Ad Soyad', width: 24 },
    { key: 'project_name', label: 'Proje', width: 20 }, { key: 'department_name', label: 'Departman', width: 19 },
    { key: 'status', label: 'Durum', width: 18, value: row => STATUS_LABELS[row.employment_status] || row.employment_status },
    { key: 'hire_date', label: 'İşe Giriş', width: 14, type: 'date' },
    { key: 'last_event', label: 'Son Hareket', width: 19, value: row => EVENT_LABELS[row.last_event_type] || row.last_event_type },
    { key: 'last_event_at', label: 'Son Hareket Tarihi', width: 18, type: 'date' },
    { key: 'annual_leave_days', label: 'Yıllık İzin (gün)', width: 16, type: 'number' },
    { key: 'sick_leave_days', label: 'Rapor (gün)', width: 14, type: 'number' },
    { key: 'sick_occurrences', label: 'Rapor Olayı', width: 13, type: 'number' },
    { key: 'overtime_hours', label: 'Fazla Mesai (saat)', width: 17, type: 'number' },
    { key: 'absent_days', label: 'Devamsızlık (gün)', width: 16, type: 'number' },
    { key: 'shift_changes', label: 'Vardiya Revizyonu', width: 17, type: 'number' },
    { key: 'permanent_movements', label: 'Kalıcı Transfer', width: 15, type: 'number' },
    { key: 'open_alerts', label: 'Açık Aksiyon', width: 14, type: 'number' },
  ]
}

function eventColumns() {
  return [
    { key: 'effective_at', label: 'Etkili Tarih', width: 18, type: 'date' },
    { key: 'full_name', label: 'Personel', width: 24 }, { key: 'project_name', label: 'Mevcut Proje', width: 19 },
    { key: 'department_name', label: 'Mevcut Departman', width: 19 },
    { key: 'before', label: 'Önceki Değer', width: 34, value: row => compactObject(row.before) },
    { key: 'after', label: 'Yeni Değer', width: 34, value: row => compactObject(row.after) },
    { key: 'reason', label: 'Gerekçe / Açıklama', width: 30 }, { key: 'actor_name', label: 'İşlemi Yapan', width: 20 },
    { key: 'created_at', label: 'Kayıt Zamanı', width: 18, type: 'date' },
  ]
}

function summaryMetric(ws, row, col, label, value, formula, color) {
  ws.mergeCells(row, col, row, col + 1)
  ws.mergeCells(row + 1, col, row + 1, col + 1)
  const labelCell = ws.getCell(row, col)
  const valueCell = ws.getCell(row + 1, col)
  labelCell.value = label
  valueCell.value = formula ? { formula, result: number(value) } : number(value)
  labelCell.font = { bold: true, size: 10, color: { argb: 'FF475569' } }
  valueCell.font = { bold: true, size: 19, color: { argb: argb(color) } }
  ;[labelCell, valueCell].forEach(cell => { cell.fill = fill(COLORS.surface); cell.border = border; cell.alignment = { horizontal: 'center', vertical: 'middle' } })
}

export async function loadPersonnelTrackingExportData(api, filters = {}) {
  const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== '' && value != null))
  const [overviewResponse, peopleResponse, eventsResponse, alertsResponse, detailsResponse] = await Promise.all([
    api.get('/personnel/tracking/overview', { params }),
    api.get('/personnel/tracking/people', { params: { ...params, limit: 500 } }),
    api.get('/personnel/tracking/events', { params: { ...params, page: 1, limit: 200 } }),
    api.get('/personnel/tracking/alerts', { params: { limit: 500 } }),
    api.get('/personnel/tracking/export-details', { params }),
  ])
  const firstEvents = eventsResponse.data || { items: [], total: 0, limit: 200 }
  const pages = Math.ceil(number(firstEvents.total) / 200)
  const extraResponses = pages > 1
    ? await Promise.all(Array.from({ length: pages - 1 }, (_, index) => api.get('/personnel/tracking/events', { params: { ...params, page: index + 2, limit: 200 } })))
    : []
  const people = peopleResponse.data?.items || []
  const visibleIds = new Set(people.map(person => Number(person.id)))
  return {
    overview: overviewResponse.data,
    people,
    events: [...(firstEvents.items || []), ...extraResponses.flatMap(response => response.data?.items || [])],
    alerts: (alertsResponse.data?.items || []).filter(alert => visibleIds.has(Number(alert.staff_id))),
    details: detailsResponse.data || { leaves: [], overtime: [], temporary_work: [] },
  }
}

export function buildPersonnelTrackingWorkbook(ExcelJS, options) {
  const { overview = {}, people = [], events = [], alerts = [], details = {}, filterLabels = [], generatedAt = new Date(), generatedBy } = options
  const workbook = new ExcelJS.Workbook()
  setDocumentProperties(workbook, 'Personel Takip Merkezi Yönetim Raporu', generatedBy)
  const meta = { period: overview.period, filterLabels, generatedAt, generatedBy }
  const ws = workbook.addWorksheet('Yönetim Özeti', { views: [{ showGridLines: false }] })

  const peopleWs = prepareSheet(workbook, 'Personel Metrikleri', 'PERSONEL METRİKLERİ', meta, peopleColumns(), COLORS.blue)
  appendRows(peopleWs, people, peopleColumns())
  addTotalRow(peopleWs, peopleColumns(), [9, 10, 11, 12, 13, 14, 15, 16])

  const leaveColumns = [
    { key: 'full_name', label: 'Ad Soyad', width: 25 }, { key: 'project_name', label: 'Proje', width: 20 },
    { key: 'department_name', label: 'Departman', width: 19 },
    { key: 'leave_type', label: 'İzin / Rapor Türü', width: 18, value: row => LEAVE_LABELS[row.leave_type] || row.leave_type },
    { key: 'start_date', label: 'Başlangıç', width: 15, type: 'date' }, { key: 'end_date', label: 'Bitiş', width: 15, type: 'date' },
    { key: 'total_days', label: 'Gün', width: 12, type: 'number' }, { key: 'status', label: 'Onay Durumu', width: 16 },
    { key: 'reason', label: 'Gerekçe', width: 30 }, { key: 'approved_by_name', label: 'Onaylayan', width: 20 },
    { key: 'created_at', label: 'Kayıt Zamanı', width: 18, type: 'date' },
  ]
  const leaveWs = prepareSheet(workbook, 'İzin ve Raporlar', 'İZİN VE RAPOR ÖZETİ', meta, leaveColumns, COLORS.amber)
  appendRows(leaveWs, details.leaves || [], leaveColumns)
  addTotalRow(leaveWs, leaveColumns, [7])

  const overtimeColumns = [
    { key: 'full_name', label: 'Ad Soyad', width: 26 }, { key: 'project_name', label: 'Proje', width: 21 },
    { key: 'department_name', label: 'Departman', width: 20 }, { key: 'work_date', label: 'Tarih', width: 15, type: 'date' },
    { key: 'hours', label: 'Saat', width: 12, type: 'number' }, { key: 'reason', label: 'Gerekçe', width: 32 },
    { key: 'approval', label: 'Onay Durumu', width: 16, value: row => row.approved_by ? 'Onaylı' : 'Kayıtlı' },
    { key: 'approved_by_name', label: 'Onaylayan', width: 20 }, { key: 'created_at', label: 'Kayıt Zamanı', width: 18, type: 'date' },
  ]
  const overtimeWs = prepareSheet(workbook, 'Fazla Mesai', 'FAZLA MESAİ ÖZETİ', meta, overtimeColumns, COLORS.purple)
  appendRows(overtimeWs, details.overtime || [], overtimeColumns)
  addTotalRow(overtimeWs, overtimeColumns, [5])

  const createEventSheet = (name, title, type, color, predicate = event => event.event_type === type) => {
    const columns = eventColumns()
    const ws = prepareSheet(workbook, name, title, meta, columns, color)
    appendRows(ws, events.filter(predicate), columns)
    return ws
  }
  createEventSheet('Kalıcı Transferler', 'KALICI ATAMA VE TRANSFERLER', 'assignment_changed', COLORS.purple, event => event.event_type === 'assignment_changed' && event.before != null)
  const temporaryColumns = [
    { key: 'work_date', label: 'Çalışma Tarihi', width: 17, type: 'date' }, { key: 'full_name', label: 'Personel', width: 25 },
    { key: 'permanent_project_name', label: 'Kalıcı Proje', width: 21 }, { key: 'work_project_name', label: 'Çalışılan Proje', width: 21 },
    { key: 'department_name', label: 'Departman', width: 19 }, { key: 'work_location_name', label: 'Çalışma Noktası', width: 22 },
    { key: 'shift_name', label: 'Vardiya', width: 18 }, { key: 'status', label: 'Durum', width: 15, value: row => SHIFT_LABELS[row.status] || row.status },
  ]
  const temporaryWs = prepareSheet(workbook, 'Geçici Çapraz Çalışmalar', 'GEÇİCİ ÇAPRAZ PROJE ÇALIŞMALARI', meta, temporaryColumns, COLORS.teal)
  appendRows(temporaryWs, details.temporary_work || [], temporaryColumns)
  createEventSheet('Vardiya Revizyonları', 'VARDİYA REVİZYONLARI', 'shift_changed', COLORS.blue)

  const exitColumns = [
    { key: 'id', label: 'Personel ID', width: 12, type: 'number' }, { key: 'full_name', label: 'Ad Soyad', width: 25 },
    { key: 'project_name', label: 'Son Proje', width: 20 }, { key: 'department_name', label: 'Son Departman', width: 20 },
    { key: 'hire_date', label: 'İşe Giriş', width: 16, type: 'date' }, { key: 'exit_date', label: 'Son Çalışma', width: 16, type: 'date' },
    { key: 'exit_type', label: 'Çıkış Türü', width: 20 }, { key: 'status', label: 'Durum', width: 16, value: row => STATUS_LABELS[row.employment_status] || row.employment_status },
  ]
  const exitsWs = prepareSheet(workbook, 'İşten Çıkanlar', 'İŞTEN ÇIKIŞLAR', meta, exitColumns, COLORS.gray)
  appendRows(exitsWs, people.filter(row => row.employment_status === 'exited'), exitColumns)

  const actionColumns = [
    { key: 'severity', label: 'Önem', width: 12, value: row => SEVERITY_LABELS[row.severity] || row.severity },
    { key: 'full_name', label: 'Personel', width: 25 }, { key: 'project_name', label: 'Proje', width: 20 },
    { key: 'department_name', label: 'Departman', width: 19 }, { key: 'title', label: 'Risk / Kural', width: 28, value: row => row.title || row.rule_key },
    { key: 'message', label: 'Açıklama', width: 36 }, { key: 'assigned_user_name', label: 'Sorumlu', width: 20, value: row => row.assigned_user_name || 'Atanmadı' },
    { key: 'due_at', label: 'Son Tarih', width: 18, type: 'date' }, { key: 'status', label: 'Durum', width: 15, value: row => ALERT_STATUS_LABELS[row.status] || row.status },
    { key: 'followup', label: 'Takip Görevi', width: 18, value: row => row.followup_id ? (row.followup_status || 'Açık') : 'Oluşturulmadı' },
  ]
  const openAlerts = alerts.filter(row => ['open', 'acknowledged'].includes(row.status))
  const actionsWs = prepareSheet(workbook, 'Açık Aksiyonlar', 'AÇIK AKSİYON VE RİSK KUYRUĞU', meta, actionColumns, COLORS.red)
  appendRows(actionsWs, openAlerts, actionColumns)

  setupSheet(ws, COLORS.green)
  setupTitle(ws, 'PERSONEL TAKİP MERKEZİ — YÖNETİM ÖZETİ', subtitle(meta), 12)
  ws.views = [{ state: 'frozen', ySplit: 2, showGridLines: false }]
  const kpi = overview.kpis || {}
  const peopleEnd = Math.max(5, peopleWs.rowCount - 1)
  const statusRange = `${quoteSheet('Personel Metrikleri')}!$E$5:$E$${peopleEnd}`
  const metrics = [
    ['Aktif', kpi.active, `COUNTIF(${statusRange},"Aktif")`, COLORS.green],
    ['Çıkış Sürecinde', kpi.offboarding, `COUNTIF(${statusRange},"Çıkış Sürecinde")`, COLORS.amber],
    ['İşten Çıkan', kpi.exited, `COUNTIF(${statusRange},"İşten Çıktı")`, COLORS.gray],
    ['Yeni Başlayan', kpi.hired, null, COLORS.blue],
    ['Kalıcı Transfer', kpi.permanent_movements, `COUNTA(${quoteSheet('Kalıcı Transferler')}!$A$5:$A$${Math.max(5, workbook.getWorksheet('Kalıcı Transferler').rowCount)})`, COLORS.purple],
    ['Geçici Çalışma', kpi.temporary_project_work, `COUNTA(${quoteSheet('Geçici Çapraz Çalışmalar')}!$A$5:$A$${Math.max(5, workbook.getWorksheet('Geçici Çapraz Çalışmalar').rowCount)})`, COLORS.teal],
    ['Vardiya Revizyonu', kpi.shift_changes, `SUM(${quoteSheet('Personel Metrikleri')}!$N$5:$N$${peopleEnd})`, COLORS.blue],
    ['İzin / Rapor Günü', number(kpi.annual_leave_days) + number(kpi.sick_leave_days) + number(kpi.other_leave_days), `SUM(${quoteSheet('İzin ve Raporlar')}!$G$5:$G$${Math.max(5, leaveWs.rowCount - 1)})`, COLORS.amber],
    ['Fazla Mesai Saati', kpi.overtime_hours, `SUM(${quoteSheet('Fazla Mesai')}!$E$5:$E$${Math.max(5, overtimeWs.rowCount - 1)})`, COLORS.purple],
    ['Devamsızlık', kpi.absent_days, `SUM(${quoteSheet('Personel Metrikleri')}!$M$5:$M$${peopleEnd})`, COLORS.red],
    ['Açık Aksiyon', kpi.open_alerts, `COUNTA(${quoteSheet('Açık Aksiyonlar')}!$A$5:$A$${Math.max(5, actionsWs.rowCount)})`, COLORS.amber],
    ['Gecikmiş / Kritik', number(kpi.overdue_alerts) + number(kpi.critical_alerts), null, COLORS.red],
  ]
  metrics.forEach((metric, index) => summaryMetric(ws, 4 + Math.floor(index / 4) * 3, 1 + (index % 4) * 3, ...metric))
  ws.getCell('A14').value = 'Seçili filtreler'
  ws.getCell('A14').font = { bold: true, color: { argb: argb(COLORS.ink) } }
  ws.mergeCells('B14:L14')
  ws.getCell('B14').value = filterLabels.filter(Boolean).join(' · ') || 'Tüm kayıtlar'
  ws.getCell('A16').value = 'Rapor Notu'
  ws.getCell('A16').font = { bold: true }
  ws.mergeCells('B16:L18')
  ws.getCell('B16').value = 'Toplamlar seçili tarih, proje, departman, durum, olay türü ve personel filtresine göre hazırlanmıştır. Formüller, ilgili ayrıntı sayfalarındaki görünür rapor kapsamını referans alır.'
  ws.getCell('B16').alignment = { wrapText: true, vertical: 'top' }
  ;['A14', 'B14', 'A16', 'B16'].forEach(address => { ws.getCell(address).border = border; ws.getCell(address).fill = fill(COLORS.surface) })
  for (let column = 1; column <= 12; column += 1) ws.getColumn(column).width = 15
  ws.pageSetup.printArea = 'A1:L18'
  ws.headerFooter.oddFooter = '&LYYS Personel Takip Merkezi&C&P / &N&Rİç Kullanım'
  return workbook
}

export async function exportPersonnelTrackingExcel({ api, filters, filterLabels, generatedBy }) {
  const data = await loadPersonnelTrackingExportData(api, filters)
  const ExcelJS = await import('exceljs')
  const workbook = buildPersonnelTrackingWorkbook(ExcelJS.default || ExcelJS, { ...data, filterLabels, generatedBy, generatedAt: new Date() })
  const buffer = await workbook.xlsx.writeBuffer()
  const period = data.overview?.period || filters
  saveWorkbook(buffer, personnelTrackingFilename(period.from, period.to))
  return { filename: personnelTrackingFilename(period.from, period.to), rows: data.people.length, events: data.events.length }
}

function dossierMeta(tracking, generatedAt, generatedBy) {
  return { period: tracking.period, filterLabels: ['Kişiye özel tam çalışma dosyası'], generatedAt, generatedBy }
}

export function buildPersonnelDossierWorkbook(ExcelJS, options) {
  const { dossier = {}, tracking = {}, staffId, generatedAt = new Date(), generatedBy } = options
  const person = dossier.person || tracking.staff || {}
  const workbook = new ExcelJS.Workbook()
  setDocumentProperties(workbook, `${person.full_name || 'Personel'} Çalışma Dosyası`, generatedBy)
  const meta = dossierMeta(tracking, generatedAt, generatedBy)
  const ws = workbook.addWorksheet('Personel Özeti', { views: [{ showGridLines: false }] })

  const shiftColumns = [
    { key: 'work_date', label: 'Tarih', width: 15, type: 'date' }, { key: 'shift_name', label: 'Vardiya', width: 18 },
    { key: 'status', label: 'Durum', width: 16, value: row => SHIFT_LABELS[row.status] || row.status },
    { key: 'work_project_name', label: 'Çalışılan Proje', width: 22 }, { key: 'work_location_name', label: 'Çalışma Noktası', width: 22 },
    { key: 'note', label: 'Not / Gerekçe', width: 34 }, { key: 'updated_at', label: 'Son Güncelleme', width: 18, type: 'date' },
  ]
  const shiftsWs = prepareSheet(workbook, 'Vardiyalar', 'VARDİYALAR VE GERÇEKLEŞEN ÇALIŞMA', meta, shiftColumns, COLORS.blue)
  appendRows(shiftsWs, tracking.shifts || [], shiftColumns)

  const leaveColumns = [
    { key: 'leave_type', label: 'İzin Türü', width: 18, value: row => LEAVE_LABELS[row.leave_type] || row.leave_type },
    { key: 'start_date', label: 'Başlangıç', width: 15, type: 'date' }, { key: 'end_date', label: 'Bitiş', width: 15, type: 'date' },
    { key: 'total_days', label: 'Gün / Saat', width: 14, type: 'number' }, { key: 'status', label: 'Onay Durumu', width: 16 },
    { key: 'reason', label: 'Gerekçe', width: 34 }, { key: 'updated_at', label: 'Son Güncelleme', width: 18, type: 'date' },
  ]
  const leaveWs = prepareSheet(workbook, 'İzin ve Rapor', 'İZİN, RAPOR VE REVİZYON KAYITLARI', meta, leaveColumns, COLORS.amber)
  appendRows(leaveWs, tracking.leaves || [], leaveColumns)
  addTotalRow(leaveWs, leaveColumns, [4])

  const overtimeColumns = [
    { key: 'work_date', label: 'Tarih', width: 15, type: 'date' }, { key: 'hours', label: 'Saat', width: 12, type: 'number' },
    { key: 'status', label: 'Onay Durumu', width: 17 }, { key: 'reason', label: 'Gerekçe', width: 36 },
    { key: 'approved_by_name', label: 'Onaylayan', width: 20 }, { key: 'updated_at', label: 'Son Güncelleme', width: 18, type: 'date' },
  ]
  const overtimeWs = prepareSheet(workbook, 'Fazla Mesai', 'FAZLA MESAİ VE REVİZYON KAYITLARI', meta, overtimeColumns, COLORS.purple)
  appendRows(overtimeWs, tracking.overtime || [], overtimeColumns)
  addTotalRow(overtimeWs, overtimeColumns, [2])

  const assignmentColumns = [
    { key: 'effective_from', label: 'Başlangıç', width: 15, type: 'date' }, { key: 'effective_to', label: 'Bitiş', width: 15, type: 'date' },
    { key: 'project_name', label: 'Proje', width: 22 }, { key: 'department_name', label: 'Departman', width: 20 },
    { key: 'role_name', label: 'Rol', width: 20 }, { key: 'work_location_name', label: 'Çalışma Noktası', width: 22 },
    { key: 'note', label: 'Atama Notu', width: 34 },
  ]
  const assignmentsWs = prepareSheet(workbook, 'Atama Geçmişi', 'ATAMA, PROJE, DEPARTMAN VE LOKASYON GEÇMİŞİ', meta, assignmentColumns, COLORS.teal)
  appendRows(assignmentsWs, tracking.assignments || [], assignmentColumns)

  const movementColumns = [
    { key: 'effective_at', label: 'Etkili Tarih', width: 18, type: 'date' },
    { key: 'event_type', label: 'Hareket Türü', width: 21, value: row => EVENT_LABELS[row.event_type] || row.event_type },
    { key: 'before', label: 'Önceki Değer', width: 34, value: row => compactObject(row.before) },
    { key: 'after', label: 'Yeni Değer', width: 34, value: row => compactObject(row.after) },
    { key: 'reason', label: 'Gerekçe / Açıklama', width: 32 }, { key: 'actor_name', label: 'İşlemi Yapan', width: 20 },
    { key: 'source_type', label: 'Kaynak', width: 18 }, { key: 'created_at', label: 'Kayıt Zamanı', width: 18, type: 'date' },
  ]
  const movementWs = prepareSheet(workbook, 'Hareket Günlüğü', 'SİLİNEMEZ PERSONEL HAREKET GÜNLÜĞÜ', meta, movementColumns, COLORS.red)
  appendRows(movementWs, tracking.events || [], movementColumns)

  setupSheet(ws, COLORS.green)
  setupTitle(ws, `${safeExcelText(person.full_name || 'PERSONEL')} — TAM ÇALIŞMA DOSYASI`, subtitle(meta), 10)
  ws.views = [{ state: 'frozen', ySplit: 2, showGridLines: false }]
  const identity = [
    ['Dosya No', staffId], ['Durum', Number(person.is_active) === 1 ? (person.offboarding_started_at ? 'Çıkış Sürecinde' : 'Aktif') : 'İşten Çıktı'],
    ['Proje', person.project_name], ['Departman', person.department_name || person.dept_name], ['Rol / Pozisyon', person.role_name || person.position],
    ['Çalışma Noktası', person.primary_work_location_name], ['Telefon', person.phone], ['E-posta', person.email],
    ['İşe Giriş', person.hire_date], ['Sözleşme Bitişi', person.contract_end],
  ]
  identity.forEach(([label, value], index) => {
    const row = 4 + Math.floor(index / 2)
    const col = index % 2 === 0 ? 1 : 6
    ws.getCell(row, col).value = label
    ws.getCell(row, col + 1).value = safeExcelText(value)
    ws.mergeCells(row, col + 1, row, col + 4)
    ws.getCell(row, col).font = { bold: true, color: { argb: argb(COLORS.ink) } }
    ;[ws.getCell(row, col), ws.getCell(row, col + 1)].forEach(cell => { cell.fill = fill(COLORS.surface); cell.border = border })
  })
  const summary = tracking.summary || {}
  const metrics = [
    ['Planlanan Gün', summary.scheduled_days, `COUNTIF(${quoteSheet('Vardiyalar')}!$C$5:$C$${Math.max(5, shiftsWs.rowCount)},"Planlandı")`, COLORS.blue],
    ['Çalışılan Gün', summary.worked_days, `COUNTIF(${quoteSheet('Vardiyalar')}!$C$5:$C$${Math.max(5, shiftsWs.rowCount)},"Çalıştı")+COUNTIF(${quoteSheet('Vardiyalar')}!$C$5:$C$${Math.max(5, shiftsWs.rowCount)},"Fazla Mesai")`, COLORS.green],
    ['İzinli Gün', summary.approved_leave_days, `SUMIF(${quoteSheet('İzin ve Rapor')}!$E$5:$E$${Math.max(5, leaveWs.rowCount - 1)},"approved",${quoteSheet('İzin ve Rapor')}!$D$5:$D$${Math.max(5, leaveWs.rowCount - 1)})`, COLORS.amber],
    ['Raporlu Gün', summary.sick_days, null, COLORS.amber],
    ['Mesai Saati', summary.overtime_hours, `SUM(${quoteSheet('Fazla Mesai')}!$B$5:$B$${Math.max(5, overtimeWs.rowCount - 1)})`, COLORS.purple],
    ['Devamsızlık', summary.absent_days, `COUNTIF(${quoteSheet('Vardiyalar')}!$C$5:$C$${Math.max(5, shiftsWs.rowCount)},"Devamsız")`, COLORS.red],
    ['Vardiya Revizyonu', summary.shift_changes, `COUNTIF(${quoteSheet('Hareket Günlüğü')}!$B$5:$B$${Math.max(5, movementWs.rowCount)},"Vardiya revizyonu")`, COLORS.blue],
    ['Kalıcı Transfer', summary.permanent_movements, `COUNTIFS(${quoteSheet('Hareket Günlüğü')}!$B$5:$B$${Math.max(5, movementWs.rowCount)},"Atama değişikliği",${quoteSheet('Hareket Günlüğü')}!$C$5:$C$${Math.max(5, movementWs.rowCount)},"<>")`, COLORS.teal],
  ]
  metrics.forEach((metric, index) => summaryMetric(ws, 11 + Math.floor(index / 4) * 3, 1 + (index % 4) * 2, ...metric))
  for (let column = 1; column <= 10; column += 1) ws.getColumn(column).width = 15
  ws.pageSetup.printArea = 'A1:J17'
  ws.headerFooter.oddFooter = '&LYYS Personel Dosyası&C&P / &N&Rİç Kullanım'
  return workbook
}

export async function exportPersonnelDossierExcel({ dossier, tracking, staffId, generatedBy }) {
  const ExcelJS = await import('exceljs')
  const workbook = buildPersonnelDossierWorkbook(ExcelJS.default || ExcelJS, { dossier, tracking, staffId, generatedBy, generatedAt: new Date() })
  const buffer = await workbook.xlsx.writeBuffer()
  const filename = personnelDossierFilename(staffId)
  saveWorkbook(buffer, filename)
  return { filename, shifts: tracking.shifts?.length || 0, events: tracking.events?.length || 0 }
}

async function loadDrilldownView(api, filters, view, maxRows) {
  const items = []
  let first = null
  let page = 1
  while (items.length < maxRows) {
    const response = await api.get('/personnel/tracking/drilldown', { params: { ...filters, view, page, limit: 500 } })
    first ||= response.data
    const batch = response.data?.items || []
    items.push(...batch.slice(0, maxRows - items.length))
    if (!batch.length || items.length >= Number(response.data?.total || 0) || batch.length < 500) break
    page += 1
  }
  return { meta: first || {}, items }
}

export async function loadPersonnelDrilldownExportData(api, filters = {}, maxRows = 25000) {
  const cleanFilters = Object.fromEntries(Object.entries(filters).filter(([key, value]) => value !== '' && value != null && !['page', 'limit', 'view'].includes(key)))
  const [people, records] = await Promise.all([
    loadDrilldownView(api, cleanFilters, 'people', maxRows),
    loadDrilldownView(api, cleanFilters, 'records', maxRows),
  ])
  return {
    meta: records.meta.metric ? records.meta : people.meta, people: people.items, records: records.items,
    truncated: people.items.length < Number(people.meta.total || 0) || records.items.length < Number(records.meta.total || 0),
  }
}

const drilldownPeopleColumns = [
  { key: 'staff_id', label: 'Personel ID', width: 12, type: 'number' }, { key: 'full_name', label: 'Ad Soyad', width: 26 },
  { key: 'position', label: 'Pozisyon', width: 21 }, { key: 'project_name', label: 'Proje', width: 21 },
  { key: 'department_name', label: 'Departman', width: 20 }, { key: 'employment_status', label: 'Personel Durumu', width: 17 },
  { key: 'record_count', label: 'Kayıt Sayısı', width: 14, type: 'number' }, { key: 'day_total', label: 'Gün Toplamı', width: 14, type: 'number' },
  { key: 'hour_total', label: 'Saat Toplamı', width: 14, type: 'number' }, { key: 'total_quantity', label: 'Miktar Toplamı', width: 15, type: 'number' },
  { key: 'last_occurred_at', label: 'Son Kayıt Tarihi', width: 18, type: 'date' }, { key: 'status', label: 'Kayıt Durumu', width: 16 },
]

const drilldownRecordColumns = [
  { key: 'record_id', label: 'Kayıt ID', width: 12 }, { key: 'staff_id', label: 'Personel ID', width: 12, type: 'number' },
  { key: 'full_name', label: 'Ad Soyad', width: 26 }, { key: 'position', label: 'Pozisyon', width: 20 },
  { key: 'project_name', label: 'Kalıcı Proje', width: 20 }, { key: 'department_name', label: 'Departman', width: 20 },
  { key: 'work_project_name', label: 'Çalışılan Proje', width: 20 }, { key: 'work_location_name', label: 'Çalışma Noktası', width: 21 },
  { key: 'occurred_at', label: 'Başlangıç / Tarih', width: 18, type: 'date' }, { key: 'end_at', label: 'Bitiş', width: 18, type: 'date' },
  { key: 'subtype', label: 'Tür', width: 18 }, { key: 'quantity', label: 'Miktar', width: 12, type: 'number' },
  { key: 'unit', label: 'Birim', width: 11 }, { key: 'status', label: 'Durum', width: 15 },
  { key: 'reason', label: 'Gerekçe / Açıklama', width: 34 }, { key: 'actor_name', label: 'Yapan / Onaylayan', width: 21 },
  { key: 'before', label: 'Önce', width: 32, value: row => compactObject(row.before) }, { key: 'after', label: 'Sonra', width: 32, value: row => compactObject(row.after) },
  { key: 'source_type', label: 'Kaynak Türü', width: 17 }, { key: 'source_id', label: 'Kaynak ID', width: 13 },
]

export function buildPersonnelDrilldownWorkbook(ExcelJS, options) {
  const { meta = {}, people = [], records = [], filterLabels = [], generatedBy, generatedAt = new Date(), truncated = false } = options
  const workbook = new ExcelJS.Workbook()
  const metricTitle = safeExcelText(meta.definition || meta.metric || 'Personel takip ayrıntısı')
  setDocumentProperties(workbook, `${metricTitle} Detay Raporu`, generatedBy)
  const sheetMeta = { period: meta.period, filterLabels, generatedAt, generatedBy }

  const summaryWs = workbook.addWorksheet('Özet', { views: [{ showGridLines: false }] })
  setupSheet(summaryWs, COLORS.blue)
  setupTitle(summaryWs, `PERSONEL TAKİP DETAYI — ${metricTitle}`, subtitle(sheetMeta), 10)
  summaryWs.views = [{ state: 'frozen', ySplit: 2, showGridLines: false }]
  const summary = meta.summary || {}
  const metrics = [
    ['Ana Toplam', summary.primary_value, null, COLORS.blue], ['Kişi', summary.people_count, null, COLORS.green],
    ['Kayıt', summary.record_count, null, COLORS.purple], ['Gün', summary.day_total, null, COLORS.amber],
    ['Saat', summary.hour_total, null, COLORS.teal], ['Tarihsiz Eski', summary.undated_count, null, COLORS.gray],
  ]
  metrics.forEach((metric, index) => summaryMetric(summaryWs, 4 + Math.floor(index / 3) * 3, 1 + (index % 3) * 3, ...metric))
  summaryWs.getCell('A11').value = 'Kapsam'
  summaryWs.getCell('B11').value = meta.scope === 'current' ? 'Bugünkü durum' : 'Seçili dönem'
  summaryWs.getCell('A12').value = 'Filtreler'
  summaryWs.mergeCells('B12:J12')
  summaryWs.getCell('B12').value = safeExcelText(filterLabels.filter(Boolean).join(' · ') || 'Tüm kayıtlar')
  summaryWs.getCell('A13').value = 'Dışa Aktarım'
  summaryWs.mergeCells('B13:J13')
  summaryWs.getCell('B13').value = truncated ? '25.000 satır güvenlik sınırına ulaşıldı; çıktı kontrollü biçimde sınırlandı.' : 'Tüm filtrelenmiş kişi ve kayıt sayfaları alındı.'
  ;['A11', 'B11', 'A12', 'B12', 'A13', 'B13'].forEach(address => { summaryWs.getCell(address).border = border; summaryWs.getCell(address).fill = fill(COLORS.surface) })
  for (let column = 1; column <= 10; column += 1) summaryWs.getColumn(column).width = 16
  summaryWs.pageSetup.printArea = 'A1:J13'

  const peopleWs = prepareSheet(workbook, 'Kişiler', 'KİŞİ BAZLI METRİK TOPLAMLARI', sheetMeta, drilldownPeopleColumns, COLORS.green)
  appendRows(peopleWs, people, drilldownPeopleColumns)
  addTotalRow(peopleWs, drilldownPeopleColumns, [7, 8, 9, 10])
  const recordsWs = prepareSheet(workbook, 'Kayıtlar', 'HAM PERSONEL TAKİP KAYITLARI', sheetMeta, drilldownRecordColumns, COLORS.purple)
  appendRows(recordsWs, records, drilldownRecordColumns)
  addTotalRow(recordsWs, drilldownRecordColumns, [12])
  return workbook
}

export async function exportPersonnelDrilldownExcel({ api, filters, filterLabels, generatedBy }) {
  const data = await loadPersonnelDrilldownExportData(api, filters)
  const ExcelJS = await import('exceljs')
  const workbook = buildPersonnelDrilldownWorkbook(ExcelJS.default || ExcelJS, { ...data, filterLabels, generatedBy, generatedAt: new Date() })
  const buffer = await workbook.xlsx.writeBuffer()
  const period = data.meta?.period || filters
  const filename = personnelDrilldownFilename(filters.metric, period.from, period.to)
  saveWorkbook(buffer, filename)
  return { filename, people: data.people.length, records: data.records.length, truncated: data.truncated }
}
