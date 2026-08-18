import PDFDocument from 'pdfkit'
import { setAttachment } from '../http/contentDisposition.js'

export function createPDF(res, title) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 })
  res.setHeader('Content-Type', 'application/pdf')
  // Başlık Türkçe harf ya da uzun tire içerebilir; ham hâlde başlığa yazmak
  // "Invalid character in header content" ile 500 döndürüyordu.
  setAttachment(res, `${title}.pdf`, 'rapor.pdf')
  doc.pipe(res)

  // Header
  doc.fontSize(18).text('SANTIYE YATAKHANE YONETIM SISTEMI', { align: 'center' })
  doc.fontSize(12).text(title, { align: 'center' })
  doc.fontSize(9).text(`Tarih: ${new Date().toLocaleDateString('tr-TR')}`, { align: 'center' })
  doc.moveDown(1.5)

  return doc
}

export function addTable(doc, headers, rows, colWidths) {
  const startX = doc.x
  const rowHeight = 20

  // Header row
  doc.fontSize(9).font('Helvetica-Bold')
  let x = startX
  headers.forEach((h, i) => {
    doc.text(h, x, doc.y, { width: colWidths[i], align: 'left' })
    x += colWidths[i]
  })
  doc.moveDown(0.5)

  // Draw line
  doc.moveTo(startX, doc.y).lineTo(startX + colWidths.reduce((a, b) => a + b, 0), doc.y).stroke()
  doc.moveDown(0.3)

  // Data rows
  doc.font('Helvetica').fontSize(8)
  rows.forEach(row => {
    if (doc.y > 750) { doc.addPage(); doc.y = 50 }
    x = startX
    const y = doc.y
    row.forEach((cell, i) => {
      doc.text(String(cell ?? '\u2014'), x, y, { width: colWidths[i], align: 'left' })
      x += colWidths[i]
    })
    doc.moveDown(0.8)
  })
}

export function addSectionTitle(doc, title) {
  if (doc.y > 720) { doc.addPage(); doc.y = 50 }
  doc.moveDown(0.8)
  doc.fontSize(13).font('Helvetica-Bold').fillColor('#1d4ed8').text(title)
  doc.fillColor('black').font('Helvetica')
  doc.moveTo(doc.x, doc.y + 2).lineTo(doc.x + 495, doc.y + 2).strokeColor('#e5e7eb').stroke().strokeColor('black')
  doc.moveDown(0.6)
}

export function addKpiRow(doc, items) {
  // items: [{ label, value, hint?, color? }]
  const startX = doc.x
  const startY = doc.y
  const gap = 8
  const w = Math.floor((495 - gap * (items.length - 1)) / items.length)
  items.forEach((it, i) => {
    const x = startX + i * (w + gap)
    doc.rect(x, startY, w, 50).strokeColor('#cbd5e1').stroke().strokeColor('black')
    doc.fontSize(7).fillColor('#64748b').text(it.label.toUpperCase(), x + 6, startY + 6, { width: w - 12 })
    doc.fontSize(18).fillColor(it.color || '#0369a1').text(String(it.value), x + 6, startY + 18, { width: w - 12 })
    if (it.hint) {
      doc.fontSize(7).fillColor('#94a3b8').text(it.hint, x + 6, startY + 40, { width: w - 12 })
    }
  })
  doc.fillColor('black')
  doc.y = startY + 58
}

export function addParagraph(doc, text, opts = {}) {
  doc.fontSize(opts.size || 10).fillColor(opts.color || 'black').text(text, { width: 495 })
  doc.fillColor('black')
}
