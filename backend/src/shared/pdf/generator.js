import PDFDocument from 'pdfkit'

export function createPDF(res, title) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${title}.pdf"`)
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
