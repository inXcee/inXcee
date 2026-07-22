import PDFDocument from 'pdfkit'
import ExcelJS from 'exceljs'
import { registerTurkishFonts, pdfText } from '../../shared/pdf/fonts.js'

export const GATE_ENTRY_HEADERS = Object.freeze([
  'ADI SOYADI',
  'T.C. KİMLİK / PASAPORT NUMARASI',
  'TELEFON NUMARASI',
  'ARAÇ PLAKASI',
  'ZİYARET EDİLECEK FİRMA',
  'ZİYARET EDİLECEK KİŞİ',
  'ZİYARET EDİLECEK KİŞİ TELEFONU',
  'GİRİŞ TARİHİ',
  'GİRİŞ SAATİ',
  'SAHA GİRİŞ NEDENİ',
  'ÇALIŞMA YAPILACAKSA BÖLGESİ',
])

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function valueOrDash(value) {
  const normalized = String(value ?? '').trim()
  return normalized || '-'
}

function dateLabel(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''))
  return match ? `${match[3]}.${match[2]}.${match[1]}` : valueOrDash(value)
}

function safePlate(value) {
  return valueOrDash(value).replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/^-+|-+$/g, '') || 'arac'
}

export function gateEntryFileBase(truck) {
  return `su-nakliye-personel-giris-${truck?.arrival_date || 'tarihsiz'}-${safePlate(truck?.plate)}`
}

export function gateEntryDocumentData(truck) {
  const entry = truck?.gate_entry || {}
  const start = entry.entry_start_time || truck?.arrival_start_time || null
  const end = entry.entry_end_time || truck?.arrival_end_time || null
  const plate = entry.plate || truck?.plate || null
  const trailer = entry.trailer_plate || truck?.trailer_plate || null
  const date = entry.entry_date || truck?.arrival_date || null
  const values = [
    entry.full_name || truck?.driver_name || '-',
    entry.identity_no || truck?.driver_tc || '-',
    entry.phone || truck?.driver_phone || '-',
    [plate, trailer].filter(Boolean).join('\n') || '-',
    entry.visit_company || truck?.visit_company || '-',
    entry.host_person_name || truck?.host_person_name || '-',
    entry.host_person_phone || truck?.host_person_phone || '-',
    dateLabel(date),
    [start, end].filter(Boolean).join('-') || '-',
    entry.entry_reason || truck?.entry_reason || 'SU AMAÇLI NAKLİYE',
    entry.work_area || truck?.work_area || '-',
  ]
  const vehicle = [plate, trailer ? `${trailer} DORSE` : null].filter(Boolean).join(' / ') || '-'
  const arrivalWindow = [start, end].filter(Boolean).join('-') || '-'
  const requestText = `${dateLabel(date)} tarihinde ${arrivalWindow} saatleri arasında ${valueOrDash(values[0])}, ${vehicle} ile ${valueOrDash(values[10])} bölgesinde su amaçlı nakliye için sahaya gelecektir. Personel ve araç girişinin sağlanması hususunda yardımlarınızı rica ederiz.`

  return {
    headers: GATE_ENTRY_HEADERS,
    values,
    excelValues: values,
    arrivalDate: dateLabel(date),
    arrivalWindow,
    vehicle,
    recipient: truck?.mail_preview?.to || truck?.center_email || '-',
    subject: truck?.mail_preview?.subject || truck?.mail_subject
      || `Su amaçlı nakliye personel giriş talebi - ${dateLabel(date)} - ${valueOrDash(plate)}`,
    requestText,
  }
}

function drawPdfCell(doc, fonts, text, x, y, width, height, { header = false } = {}) {
  doc.rect(x, y, width, height)
    .fillAndStroke(header ? '#DDEBF7' : '#FFFFFF', '#64748B')
  doc.font(header ? fonts.bold : fonts.regular)
    .fontSize(header ? 6.4 : 8.2)
    .fillColor('#0F172A')
    .text(pdfText(valueOrDash(text), fonts), x + 3, y + (header ? 7 : 9), {
      width: width - 6,
      height: height - (header ? 14 : 18),
      align: 'center',
      valign: 'center',
      ellipsis: true,
      lineGap: 1,
    })
}

export function writeTruckGateEntryPDF(truck, doc) {
  if (!truck?.id) throw Object.assign(new Error('Tır kaydı bulunamadı'), { statusCode: 404 })
  const data = gateEntryDocumentData(truck)
  const fonts = registerTurkishFonts(doc, 'GateEntry')
  const pageWidth = doc.page.width
  const pageHeight = doc.page.height
  const margin = 24
  const innerWidth = pageWidth - margin * 2

  doc.info.Title = data.subject
  doc.info.Subject = 'Personel günlük giriş çizelgesi'
  doc.info.Author = 'Şantiye Yatakhane Yönetim Sistemi'

  doc.rect(0, 0, pageWidth, 78).fill('#155E75')
  doc.font(fonts.bold).fontSize(18).fillColor('#FFFFFF')
    .text(pdfText('PERSONEL GÜNLÜK GİRİŞ ÇİZELGESİ', fonts), margin, 22, {
      width: innerWidth,
      align: 'center',
    })
  doc.font(fonts.regular).fontSize(8.5).fillColor('#CFFAFE')
    .text(pdfText('SU AMAÇLI NAKLİYE · PERSONEL VE ARAÇ GİRİŞ TALEBİ', fonts), margin, 49, {
      width: innerWidth,
      align: 'center',
    })

  const cards = [
    ['GELİŞ', `${data.arrivalDate} · ${data.arrivalWindow}`],
    ['ARAÇ / DORSE', data.vehicle],
    ['KAYIT', `#${truck.id}`],
  ]
  const cardGap = 8
  const cardWidth = (innerWidth - cardGap * 2) / 3
  cards.forEach(([label, value], index) => {
    const x = margin + index * (cardWidth + cardGap)
    doc.roundedRect(x, 88, cardWidth, 40, 4).fillAndStroke('#F0F9FF', '#A5D8E8')
    doc.font(fonts.bold).fontSize(6.7).fillColor('#155E75')
      .text(pdfText(label, fonts), x + 9, 96, { width: cardWidth - 18 })
    doc.font(fonts.bold).fontSize(9).fillColor('#0F172A')
      .text(pdfText(value, fonts), x + 9, 108, { width: cardWidth - 18, ellipsis: true })
  })

  const tableY = 142
  const headerHeight = 62
  const valueHeight = 78
  const baseWidths = [76, 94, 72, 76, 112, 88, 92, 60, 66, 82, 86]
  const scale = innerWidth / baseWidths.reduce((total, width) => total + width, 0)
  const widths = baseWidths.map(width => width * scale)
  let x = margin
  data.headers.forEach((header, index) => {
    drawPdfCell(doc, fonts, header, x, tableY, widths[index], headerHeight, { header: true })
    drawPdfCell(doc, fonts, data.values[index], x, tableY + headerHeight, widths[index], valueHeight)
    x += widths[index]
  })

  const requestY = tableY + headerHeight + valueHeight + 18
  doc.roundedRect(margin, requestY, innerWidth, 98, 5).fillAndStroke('#F8FAFC', '#CBD5E1')
  doc.font(fonts.bold).fontSize(8).fillColor('#155E75')
    .text(pdfText('GİRİŞ TALEBİ', fonts), margin + 14, requestY + 12)
  doc.font(fonts.regular).fontSize(9).fillColor('#1E293B')
    .text(pdfText(data.requestText, fonts), margin + 14, requestY + 31, {
      width: innerWidth - 28,
      lineGap: 3,
    })

  const approvalY = requestY + 112
  const approvalGap = 10
  const approvalWidth = (innerWidth - approvalGap * 2) / 3
  ;['HAZIRLAYAN', 'KONTROL EDEN', 'ONAY'].forEach((label, index) => {
    const approvalX = margin + index * (approvalWidth + approvalGap)
    doc.roundedRect(approvalX, approvalY, approvalWidth, 54, 4).stroke('#CBD5E1')
    doc.font(fonts.bold).fontSize(7).fillColor('#475569')
      .text(pdfText(label, fonts), approvalX + 9, approvalY + 8)
    doc.moveTo(approvalX + 9, approvalY + 38).lineTo(approvalX + approvalWidth - 9, approvalY + 38)
      .dash(3, { space: 3 }).stroke('#94A3B8').undash()
  })

  doc.font(fonts.regular).fontSize(6.7).fillColor('#64748B')
    .text(pdfText(`Alıcı: ${data.recipient} · Kayıt #${truck.id} · YYS Su Takibi`, fonts), margin, pageHeight - 38, {
      width: innerWidth,
      align: 'center',
    })
  doc.end()
  return truck
}

function applyExcelBorder(cell, style = 'thin') {
  const edge = { style, color: { argb: 'FF64748B' } }
  cell.border = { top: edge, left: edge, bottom: edge, right: edge }
}

export async function createTruckGateEntryWorkbookBuffer(truck) {
  if (!truck?.id) throw Object.assign(new Error('Tır kaydı bulunamadı'), { statusCode: 404 })
  const data = gateEntryDocumentData(truck)
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Şantiye Yatakhane Yönetim Sistemi'
  workbook.subject = 'Personel günlük giriş çizelgesi'
  workbook.title = data.subject
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('PERSONEL GÜNLÜK GİRİŞ', {
    views: [{ showGridLines: false, state: 'frozen', ySplit: 4 }],
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      horizontalCentered: true,
      verticalCentered: true,
      margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 },
    },
  })

  const widths = [2.5, 18, 23, 17, 18, 27, 22, 22, 14, 15, 21, 24, 2.5]
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width })

  sheet.mergeCells('B1:L1')
  sheet.getCell('B1').value = 'PERSONEL GÜNLÜK GİRİŞ ÇİZELGESİ'
  sheet.getCell('B1').font = { name: 'Aptos Display', size: 18, bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getCell('B1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF155E75' } }
  sheet.getCell('B1').alignment = { horizontal: 'center', vertical: 'middle' }
  sheet.getRow(1).height = 34

  sheet.mergeCells('B2:L2')
  sheet.getCell('B2').value = `SU AMAÇLI NAKLİYE · ${data.arrivalDate} · ${data.arrivalWindow} · ${data.vehicle} · KAYIT #${truck.id}`
  sheet.getCell('B2').font = { name: 'Aptos', size: 10, bold: true, color: { argb: 'FF155E75' } }
  sheet.getCell('B2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF8FB' } }
  sheet.getCell('B2').alignment = { horizontal: 'center', vertical: 'middle' }
  sheet.getRow(2).height = 24
  sheet.getRow(3).height = 8

  data.headers.forEach((header, index) => {
    const column = index + 2
    const headerCell = sheet.getCell(4, column)
    headerCell.value = header
    headerCell.font = { name: 'Aptos Display', size: 9, bold: true, color: { argb: 'FF0F172A' } }
    headerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } }
    headerCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    applyExcelBorder(headerCell, 'medium')

    const valueCell = sheet.getCell(5, column)
    valueCell.value = [1, 2, 6].includes(index)
      ? { richText: [{ text: String(data.excelValues[index]) }] }
      : data.excelValues[index]
    valueCell.font = { name: 'Times New Roman', size: 12, color: { argb: 'FF111827' } }
    valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
    valueCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    applyExcelBorder(valueCell)
    if ([1, 2, 6].includes(index)) valueCell.numFmt = '@'
  })
  sheet.getRow(4).height = 52
  sheet.getRow(5).height = 76

  sheet.mergeCells('B7:L7')
  sheet.getCell('B7').value = 'GİRİŞ TALEBİ'
  sheet.getCell('B7').font = { name: 'Aptos Display', size: 10, bold: true, color: { argb: 'FF155E75' } }
  sheet.getCell('B7').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } }
  sheet.getCell('B7').alignment = { vertical: 'middle' }
  applyExcelBorder(sheet.getCell('B7'))
  sheet.getRow(7).height = 24

  sheet.mergeCells('B8:L10')
  sheet.getCell('B8').value = data.requestText
  sheet.getCell('B8').font = { name: 'Times New Roman', size: 11, color: { argb: 'FF1E293B' } }
  sheet.getCell('B8').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
  sheet.getCell('B8').alignment = { vertical: 'middle', wrapText: true, indent: 1 }
  applyExcelBorder(sheet.getCell('B8'))
  sheet.getRow(8).height = 28
  sheet.getRow(9).height = 28
  sheet.getRow(10).height = 28

  const approvals = [['B12:D14', 'HAZIRLAYAN'], ['E12:H14', 'KONTROL EDEN'], ['I12:L14', 'ONAY']]
  approvals.forEach(([range, label]) => {
    sheet.mergeCells(range)
    const cell = sheet.getCell(range.split(':')[0])
    cell.value = `${label}\n\nİmza / Kaşe`
    cell.font = { name: 'Aptos', size: 9, bold: true, color: { argb: 'FF475569' } }
    cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true, indent: 1 }
    applyExcelBorder(cell)
  })
  sheet.getRow(12).height = 24
  sheet.getRow(13).height = 24
  sheet.getRow(14).height = 24

  sheet.mergeCells('B16:L16')
  sheet.getCell('B16').value = `Alıcı: ${data.recipient}  ·  Konu: ${data.subject}`
  sheet.getCell('B16').font = { name: 'Aptos', size: 8, italic: true, color: { argb: 'FF64748B' } }
  sheet.getCell('B16').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  sheet.getRow(16).height = 24

  sheet.autoFilter = 'B4:L5'
  sheet.pageSetup.printArea = 'A1:M16'
  sheet.headerFooter.oddFooter = '&LŞantiye Su Takibi&C&F&R&P / &N'

  return Buffer.from(await workbook.xlsx.writeBuffer())
}

export async function createTruckGateEntryPDFBuffer(truck) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 24, bufferPages: true })
    const chunks = []
    doc.on('data', chunk => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    try {
      writeTruckGateEntryPDF(truck, doc)
    } catch (error) {
      reject(error)
    }
  })
}

export async function createTruckGateEntryAttachments(truck) {
  const base = gateEntryFileBase(truck)
  const [pdf, workbook] = await Promise.all([
    createTruckGateEntryPDFBuffer(truck),
    createTruckGateEntryWorkbookBuffer(truck),
  ])
  return [
    { filename: `${base}.pdf`, content: pdf, contentType: 'application/pdf' },
    { filename: `${base}.xlsx`, content: workbook, contentType: XLSX_TYPE },
  ]
}
