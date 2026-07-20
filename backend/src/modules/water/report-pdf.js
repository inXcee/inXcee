// Muhasebe raporunun PDF çizimi. Veri report.js'ten gelir; burada yalnız yerleşim var.
// Bölümler (matrix/days/zones/intakes) rapor içindeki `sections` ile seçilir; her
// bölüm yer imi (outline) ve adlandırılmış hedef alır, özet sayfasındaki
// içindekiler ile matristeki gün başlıkları oraya atlar.
import { registerTurkishFonts, pdfText } from '../../shared/pdf/fonts.js'
import { trDate } from './report.js'

const INK = '#0F172A'
const MUTED = '#64748B'
const LINE = '#CBD5E1'
const BAND = '#0E7490'
const ZEBRA = '#F1F5F9'
const GREEN = '#15803D'
const RED = '#B91C1C'
const FADE = '#CBD5E1'

const ZONE_ROW_LIMIT = 12
const INTAKE_ROW_LIMIT = 10
const PRODUCT_ROW_LIMIT = 12
const MATRIX_ZONE_LIMIT = 60

const nf = new Intl.NumberFormat('tr-TR')
const num = value => nf.format(Math.round(value || 0))
const signed = value => (value > 0 ? `+${num(value)}` : num(value))

const SECTION_TITLES = {
  matrix: 'DAĞITIM YERİ × GÜN MATRİSİ',
  days: 'GÜN GÜN DETAY — NEREYE NE KADAR',
  zones: 'DAĞITIM YERİ × ÜRÜN',
  intakes: 'GELEN İRSALİYELER',
}
// İçindekiler tek satıra sığmalı — kısa adlar.
const SECTION_SHORT = {
  matrix: 'Yer × Gün matrisi',
  days: 'Gün gün detay',
  zones: 'Yer × Ürün',
  intakes: 'İrsaliyeler',
}

// pdfkit'in `text(..., { goTo })` seçeneği lineBreak:false ile satır genişliğini
// hesaplayamıyor (NaN → bozuk annotation). Bağlantı dikdörtgenini kendimiz veriyoruz.
function linkArea(doc, name, x, y, width, height) {
  doc.goTo(x, y, width, height, name)
}
function markTarget(doc, name, x, y) {
  doc.addNamedDestination(name, 'XYZ', x, y, null)
}

// Sunucudaki font (DejaVu) Windows'takinden (Arial) geniştir; 8 haneli bir toplam
// sütuna sığmayabilir. Kırpmak yerine o hücrenin puntosunu düşürüyoruz.
function fitFontSize(doc, value, available, base, min = 4.5) {
  let size = base
  doc.fontSize(size)
  while (size > min && doc.widthOfString(value) > available) {
    size = Math.max(min, size - 0.3)
    doc.fontSize(size)
  }
  return size
}

// Dar matris hücresi: tam biçim en küçük puntoda bile sığmıyorsa önce binlik
// ayraçları at, o da yetmezse kısalt (485b / 2,9M). Kesin değerler gün detayı ve
// TOPLAM sütununda durur; matris bakışta yoğunluğu gösterir.
function compactCell(doc, value, available, min = 4.2) {
  const full = num(value)
  doc.fontSize(min)
  if (doc.widthOfString(full) <= available) return full
  const bare = String(Math.round(value))
  if (doc.widthOfString(bare) <= available) return bare
  if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(1).replace('.', ',')}M`
  return `${Math.round(value / 1000)}b`
}

function drawTable(doc, fonts, { x, y, width, title, columns, rows, note }) {
  const text = value => pdfText(value, fonts)
  let cursor = y
  if (title) {
    doc.font(fonts.bold).fontSize(8.5).fillColor(INK).text(text(title), x, cursor, { width })
    cursor += 12
  }
  const rowHeight = 12.4
  doc.rect(x, cursor, width, 13).fill('#E2E8F0')
  let columnX = x
  doc.font(fonts.bold).fillColor('#334155')
  for (const column of columns) {
    const available = column.width - 6
    fitFontSize(doc, text(column.label), available, 6.6, 4.6)
    doc.text(text(column.label), columnX + 3, cursor + 3.6, { width: available, align: column.align || 'left', lineBreak: false })
    columnX += column.width
  }
  cursor += 13

  doc.fontSize(7).font(fonts.regular)
  rows.forEach((row, index) => {
    if (index % 2 === 1) doc.rect(x, cursor, width, rowHeight).fill(ZEBRA)
    columnX = x
    for (const column of columns) {
      const cell = column.cell(row)
      const value = text(cell?.value ?? '—')
      const available = column.width - 6
      doc.font(cell?.bold ? fonts.bold : fonts.regular).fillColor(cell?.color || INK)
      const size = fitFontSize(doc, value, available, 7)
      doc.text(value, columnX + 3, cursor + 3.2 + (7 - size) / 2, {
        width: available,
        align: column.align || 'left',
        ellipsis: true,
        lineBreak: false,
      })
      if (cell?.goTo) linkArea(doc, cell.goTo, columnX, cursor, column.width, rowHeight)
      columnX += column.width
    }
    cursor += rowHeight
  })

  doc.moveTo(x, cursor).lineTo(x + width, cursor).lineWidth(0.5).strokeColor(LINE).stroke()
  if (note) {
    cursor += 2
    doc.font(fonts.regular).fontSize(6).fillColor(MUTED).text(text(note), x, cursor, { width })
    cursor += 8
  }
  return cursor + 8
}

// ── Sayfa iskeleti ──

function stampFooter(doc, fonts, ctx) {
  const text = value => pdfText(value, fonts)
  doc.font(fonts.regular).fontSize(6).fillColor('#94A3B8')
    .text(text(`YYS Su Takibi  ·  ${trDate(ctx.report.from)} — ${trDate(ctx.report.to)}`),
      doc.page.margins.left, doc.page.height - 20,
      { width: doc.page.width - doc.page.margins.left * 2, lineBreak: false })
  doc.text(text(`Sayfa ${ctx.pageNo}`), doc.page.margins.left, doc.page.height - 20,
    { width: doc.page.width - doc.page.margins.left * 2, align: 'right', lineBreak: false })
}

// Yeni bölüm sayfası: dar başlık bandı + yer imi + hedef. Dönüşte yerleşim ölçüleri.
function sectionPage(doc, fonts, ctx, { title, landscape = false, destination = null, continued = false }) {
  const text = value => pdfText(value, fonts)
  const margin = landscape ? 24 : 28
  doc.addPage({ size: 'A4', layout: landscape ? 'landscape' : 'portrait', margin })
  doc.page.margins.bottom = 8
  ctx.pageNo += 1
  const pageWidth = doc.page.width
  const innerWidth = pageWidth - margin * 2

  doc.rect(0, 0, pageWidth, 34).fill(BAND)
  doc.font(fonts.bold).fontSize(11).fillColor('#FFFFFF')
    .text(text(continued ? `${title} (devam)` : title), margin, 11, { width: innerWidth - 130, lineBreak: false })
  if (destination) markTarget(doc, destination, margin, 0)
  doc.font(fonts.regular).fontSize(7).fillColor('#CFFAFE')
    .text(text('SU TAKİP — MUHASEBE RAPORU'), margin, 14, { width: innerWidth, align: 'right', lineBreak: false })
  if (!continued) ctx.outline.addItem(pdfText(title, fonts))
  stampFooter(doc, fonts, ctx)

  return { margin, innerWidth, top: 46, bottom: doc.page.height - 26 }
}

// Sütun akışı: blokları sırayla yerleştirir, sütun dolunca yana, sayfa dolunca
// yeni sayfaya geçer. "Mümkün olduğunca az sayfa" bunun sayesinde.
function columnFlow(doc, fonts, ctx, { title, columns = 2, gap = 14, landscape = false }) {
  let layout = sectionPage(doc, fonts, ctx, { title, landscape, destination: `sec-${ctx.currentSection}` })
  let columnIndex = 0
  let y = layout.top
  const widthOf = () => (layout.innerWidth - gap * (columns - 1)) / columns

  return {
    get columnWidth() { return widthOf() },
    willBreak(height) { return y + height > layout.bottom },
    place(height) {
      if (y + height > layout.bottom) {
        columnIndex += 1
        if (columnIndex >= columns) {
          layout = sectionPage(doc, fonts, ctx, { title, landscape, continued: true })
          columnIndex = 0
        }
        y = layout.top
      }
      const spot = { x: layout.margin + columnIndex * (widthOf() + gap), y, width: widthOf() }
      y += height
      return spot
    },
    // Blok başlığı yalnız başına kalmasın: başlık + ilk satır aynı sütuna sığmıyorsa
    // ikisini birlikte taşı.
    reserve(height) {
      if (y + height > layout.bottom) {
        columnIndex += 1
        if (columnIndex >= columns) {
          layout = sectionPage(doc, fonts, ctx, { title, landscape, continued: true })
          columnIndex = 0
        }
        y = layout.top
      }
    },
  }
}

// ── Bölüm 1: özet (tek sayfa) ──

function drawSummaryPage(doc, fonts, ctx) {
  const report = ctx.report
  const text = value => pdfText(value, fonts)
  const margin = 28
  const pageWidth = doc.page.width
  const pageHeight = doc.page.height
  const innerWidth = pageWidth - margin * 2
  const { totals } = report

  doc.page.margins.bottom = 8

  doc.rect(0, 0, pageWidth, 62).fill(BAND)
  doc.font(fonts.bold).fontSize(16).fillColor('#FFFFFF')
    .text(text('SU TAKİP — MUHASEBE RAPORU'), margin, 14, { width: innerWidth })
  doc.font(fonts.regular).fontSize(9).fillColor('#CFFAFE')
    .text(text(`${trDate(report.from)} — ${trDate(report.to)}  ·  ${report.day_count} gün`), margin, 36, { width: innerWidth })
  doc.fontSize(7).fillColor('#A5F3FC')
    .text(text(`Oluşturma: ${new Date().toLocaleString('tr-TR')}`), margin, 38, { width: innerWidth, align: 'right' })

  const kpis = [
    { label: 'DEVİR (DÖNEM BAŞI)', value: num(totals.opening) },
    { label: 'GELEN', value: num(totals.period_in), color: GREEN },
    { label: 'DAĞITILAN', value: num(totals.period_out), color: RED },
    { label: 'BOŞ DAMACANA İADE', value: num(totals.period_return) },
    { label: 'KAPANIŞ STOKU', value: num(totals.closing), color: totals.closing < 0 ? RED : BAND },
  ]
  const gap = 7
  const kpiWidth = (innerWidth - gap * (kpis.length - 1)) / kpis.length
  kpis.forEach((kpi, index) => {
    const x = margin + index * (kpiWidth + gap)
    doc.roundedRect(x, 74, kpiWidth, 44, 3).lineWidth(0.7).strokeColor(LINE).stroke()
    doc.font(fonts.bold).fillColor(MUTED)
    fitFontSize(doc, text(kpi.label), kpiWidth - 12, 5.8, 4.2)
    doc.text(text(kpi.label), x + 6, 81, { width: kpiWidth - 12, lineBreak: false })
    doc.font(fonts.bold).fillColor(kpi.color || INK)
    const size = fitFontSize(doc, text(kpi.value), kpiWidth - 12, 15, 8)
    doc.text(text(kpi.value), x + 6, 93 + (15 - size) / 2, { width: kpiWidth - 12, lineBreak: false })
  })
  doc.font(fonts.regular).fontSize(6).fillColor(MUTED).text(
    text(`Hareketli gün: ${totals.active_days}  ·  İrsaliye: ${totals.intake_count}  ·  Tır: ${totals.truck_count}  ·  Dağıtım yeri: ${totals.zone_count}`
      + `  ·  Eksi stoklu ürün: ${totals.negative_count}  ·  İnceleme kuyruğu: ${totals.review_count}`
      + (report.locked_months.length ? `  ·  Kilitli ay: ${report.locked_months.join(', ')}` : '')),
    margin, 121, { width: innerWidth },
  )

  // Tıklanabilir içindekiler — yalnız ek bölüm varsa
  let top = 134
  if (report.sections?.length) {
    const prefix = text('EK BÖLÜMLER:')
    const labels = report.sections.map(section => text(`▸ ${SECTION_SHORT[section]}`))
    // Satır sağ marjı aşmasın: sığana kadar puntoyu düşür (geniş fontta kritik).
    doc.font(fonts.bold)
    let size = 6.5
    const lineWidth = () => {
      doc.fontSize(size)
      return doc.widthOfString(prefix) + 6 + labels.reduce((sum, label) => sum + doc.widthOfString(label) + 10, 0)
    }
    while (size > 4.4 && lineWidth() > innerWidth) size = Math.max(4.4, size - 0.2)
    doc.fillColor(MUTED).text(prefix, margin, 131, { lineBreak: false })
    let linkX = margin + doc.widthOfString(prefix) + 6
    doc.fillColor(BAND)
    labels.forEach((label, index) => {
      const width = doc.widthOfString(label)
      doc.text(label, linkX, 131, { lineBreak: false })
      linkArea(doc, `sec-${report.sections[index]}`, linkX, 129, width, 10)
      linkX += width + 10
    })
    top = 145
  }

  const columnGap = 12
  const leftWidth = 268
  const rightWidth = innerWidth - leftWidth - columnGap
  const rightX = margin + leftWidth + columnGap
  const hasAdjust = report.daily.some(row => row.adjust_base !== 0)
  const dayLinks = new Set((report.detail?.days || []).map(day => day.key))

  const dailyColumns = hasAdjust
    ? [
      { label: report.grouped ? 'AY' : 'TARİH', width: 72, cell: row => ({ value: row.label, color: row.empty ? '#94A3B8' : INK, goTo: dayLinks.has(row.key) ? `day-${row.key}` : null }) },
      { label: 'GELEN', width: 48, align: 'right', cell: row => ({ value: row.in_base ? num(row.in_base) : '·', color: row.in_base ? GREEN : FADE }) },
      { label: 'DAĞITILAN', width: 55, align: 'right', cell: row => ({ value: row.out_base ? num(row.out_base) : '·', color: row.out_base ? RED : FADE }) },
      { label: 'DÜZELTME', width: 47, align: 'right', cell: row => ({ value: row.adjust_base ? signed(row.adjust_base) : '·', color: row.adjust_base ? '#B45309' : FADE }) },
      { label: 'KALAN', width: 46, align: 'right', cell: row => ({ value: num(row.balance_base), bold: true, color: row.balance_base < 0 ? RED : INK }) },
    ]
    : [
      { label: report.grouped ? 'AY' : 'TARİH', width: 84, cell: row => ({ value: row.label, color: row.empty ? '#94A3B8' : INK, goTo: dayLinks.has(row.key) ? `day-${row.key}` : null }) },
      { label: 'GELEN', width: 60, align: 'right', cell: row => ({ value: row.in_base ? num(row.in_base) : '·', color: row.in_base ? GREEN : FADE }) },
      { label: 'DAĞITILAN', width: 64, align: 'right', cell: row => ({ value: row.out_base ? num(row.out_base) : '·', color: row.out_base ? RED : FADE }) },
      { label: 'KALAN', width: 60, align: 'right', cell: row => ({ value: num(row.balance_base), bold: true, color: row.balance_base < 0 ? RED : INK }) },
    ]
  const dailyRows = [...report.daily, {
    label: 'TOPLAM',
    in_base: totals.period_in,
    out_base: totals.period_out,
    adjust_base: totals.period_adjust,
    balance_base: totals.closing,
  }]
  const leftY = drawTable(doc, fonts, {
    x: margin, y: top, width: leftWidth, columns: dailyColumns, rows: dailyRows,
    title: report.grouped ? 'AY AY HAREKET' : 'GÜN GÜN HAREKET',
    note: dayLinks.size
      ? 'Kalan = devirden yürüyen bakiye. Tarihe tıklayınca o günün detayına gider.'
      : 'Kalan sütunu devirden başlayan yürüyen bakiyedir.',
  })

  let rightY = drawTable(doc, fonts, {
    x: rightX, y: top, width: rightWidth, title: 'ÜRÜN BAZINDA',
    columns: [
      { label: 'ÜRÜN', width: rightWidth - 176, cell: row => ({ value: row.name }) },
      { label: 'DEVİR', width: 42, align: 'right', cell: row => ({ value: num(row.opening_base) }) },
      { label: 'GELEN', width: 42, align: 'right', cell: row => ({ value: num(row.period_in), color: GREEN }) },
      { label: 'DAĞITILAN', width: 46, align: 'right', cell: row => ({ value: num(row.period_out), color: RED }) },
      { label: 'KALAN', width: 46, align: 'right', cell: row => ({ value: num(row.closing_base), bold: true, color: row.closing_base < 0 ? RED : INK }) },
    ],
    rows: [...report.products.slice(0, PRODUCT_ROW_LIMIT), {
      name: 'TOPLAM',
      opening_base: totals.opening,
      period_in: totals.period_in,
      period_out: totals.period_out,
      closing_base: totals.closing,
    }],
    note: report.products.length > PRODUCT_ROW_LIMIT
      ? `İlk ${PRODUCT_ROW_LIMIT} ürün gösterildi (toplam ${report.products.length}).`
      : null,
  })

  rightY = drawTable(doc, fonts, {
    x: rightX, y: rightY, width: rightWidth, title: 'DAĞITIM YERLERİ',
    columns: [
      { label: 'YER', width: rightWidth - 60, cell: row => ({ value: row.zone_name }) },
      { label: 'DAĞITILAN', width: 60, align: 'right', cell: row => ({ value: num(row.total_out), bold: true }) },
    ],
    rows: report.zones.slice(0, ZONE_ROW_LIMIT),
    note: report.zones.length > ZONE_ROW_LIMIT
      ? `En çok dağıtılan ${ZONE_ROW_LIMIT} yer gösterildi (toplam ${report.zones.length}${report.sections?.includes('zones') ? ' — tamamı ek bölümde' : ''}).`
      : (report.zones.length ? null : 'Bu aralıkta dağıtım kaydı yok.'),
  })

  rightY = drawTable(doc, fonts, {
    x: rightX, y: rightY, width: rightWidth, title: 'GELEN İRSALİYELER',
    columns: [
      { label: 'TARİH', width: 44, cell: row => ({ value: trDate(row.move_date).slice(0, 5) }) },
      { label: 'İRSALİYE', width: 62, cell: row => ({ value: row.waybill_no || '—' }) },
      { label: 'ÜRÜN', width: rightWidth - 156, cell: row => ({ value: row.product_name }) },
      { label: 'MİKTAR', width: 50, align: 'right', cell: row => ({ value: num(row.qty_base), bold: true }) },
    ],
    rows: report.intakes.slice(0, INTAKE_ROW_LIMIT),
    note: report.intakes.length > INTAKE_ROW_LIMIT
      ? `İlk ${INTAKE_ROW_LIMIT} giriş gösterildi (toplam ${report.intakes.length}${report.sections?.includes('intakes') ? ' — tamamı ek bölümde' : ''}).`
      : (report.intakes.length ? null : 'Bu aralıkta giriş kaydı yok.'),
  })

  const footerY = Math.max(leftY, rightY, pageHeight - 96)
  doc.font(fonts.regular).fontSize(6).fillColor(MUTED).text(
    text('Miktarlar her ürünün kendi baz biriminde (adet/koli/palet) verilmiştir; toplam sütunları bu baz birimlerin aritmetik toplamıdır. '
      + 'Kapanış stoku = devir + gelen − dağıtılan + düzeltme.'),
    margin, footerY, { width: innerWidth },
  )

  const signatureY = pageHeight - 74
  const signatureGap = 12
  const signatureWidth = (innerWidth - signatureGap * 2) / 3
  ;['HAZIRLAYAN', 'KONTROL EDEN', 'ONAY'].forEach((label, index) => {
    const x = margin + index * (signatureWidth + signatureGap)
    doc.roundedRect(x, signatureY, signatureWidth, 46, 3).lineWidth(0.7).strokeColor(LINE).stroke()
    doc.font(fonts.bold).fontSize(6).fillColor(MUTED).text(text(label), x + 8, signatureY + 7)
    doc.moveTo(x + 8, signatureY + 34).lineTo(x + signatureWidth - 8, signatureY + 34)
      .dash(3, { space: 3 }).lineWidth(0.7).strokeColor('#94A3B8').stroke().undash()
  })
  doc.font(fonts.regular).fontSize(6).fillColor('#94A3B8')
    .text(text('YYS Su Takibi'), margin, pageHeight - 22, { width: innerWidth, align: 'center' })
}

// ── Bölüm 2: dağıtım yeri × gün matrisi (yatay) ──

function drawMatrixSection(doc, fonts, ctx) {
  const { detail } = ctx.report
  const text = value => pdfText(value, fonts)
  const dayLinks = new Set((detail.days || []).map(day => day.key))
  const rows = detail.rows.slice(0, MATRIX_ZONE_LIMIT)
  const title = SECTION_TITLES.matrix

  let layout = sectionPage(doc, fonts, ctx, { title, landscape: true, destination: 'sec-matrix' })
  const labelWidth = 118
  const totalWidth = 42
  const cellWidth = Math.max(13, (layout.innerWidth - labelWidth - totalWidth) / detail.columns.length)
  const rowHeight = 12.6

  const header = (y) => {
    doc.rect(layout.margin, y, layout.innerWidth, 14).fill('#E2E8F0')
    doc.font(fonts.bold).fillColor('#334155')
    fitFontSize(doc, text('DAĞITIM YERİ'), labelWidth - 6, 6.4, 4.6)
    doc.text(text('DAĞITIM YERİ'), layout.margin + 3, y + 4, { width: labelWidth - 6, lineBreak: false })
    detail.columns.forEach((column, index) => {
      const x = layout.margin + labelWidth + index * cellWidth
      fitFontSize(doc, text(column.label), cellWidth - 2, 6.2, 4.2)
      doc.fillColor(dayLinks.has(column.key) ? BAND : '#334155')
      doc.text(text(column.label), x + 1, y + 4, { width: cellWidth - 2, align: 'center', lineBreak: false })
      if (dayLinks.has(column.key)) linkArea(doc, `day-${column.key}`, x, y, cellWidth, 14)
    })
    doc.fillColor('#334155')
    fitFontSize(doc, text('TOPLAM'), totalWidth - 4, 6.4, 4.6)
    doc.text(text('TOPLAM'), layout.margin + labelWidth + detail.columns.length * cellWidth + 2, y + 4,
      { width: totalWidth - 4, align: 'right', lineBreak: false })
    return y + 14
  }

  let y = header(layout.top)
  let striped = 0
  const drawRow = (row, { bold = false } = {}) => {
    if (y + rowHeight > layout.bottom) {
      layout = sectionPage(doc, fonts, ctx, { title, landscape: true, continued: true })
      y = header(layout.top)
      striped = 0
    }
    if (striped % 2 === 1) doc.rect(layout.margin, y, layout.innerWidth, rowHeight).fill(ZEBRA)
    striped += 1
    const font = bold ? fonts.bold : fonts.regular
    doc.font(font).fillColor(INK)
    const size = fitFontSize(doc, text(row.zone_name), labelWidth - 6, 7)
    doc.text(text(row.zone_name), layout.margin + 3, y + 3.2 + (7 - size) / 2,
      { width: labelWidth - 6, lineBreak: false, ellipsis: true })
    row.cells.forEach((value, index) => {
      const x = layout.margin + labelWidth + index * cellWidth
      doc.font(font).fillColor(value ? INK : FADE)
      const cellText = value ? compactCell(doc, value, cellWidth - 2) : '·'
      const cellSize = fitFontSize(doc, cellText, cellWidth - 2, 6.4, 4.2)
      doc.text(cellText, x + 1, y + 3.4 + (6.4 - cellSize) / 2, { width: cellWidth - 2, align: 'center', lineBreak: false })
    })
    doc.font(fonts.bold).fillColor(INK)
    const totalText = compactCell(doc, row.total, totalWidth - 4, 4.5)
    const totalSize = fitFontSize(doc, totalText, totalWidth - 4, 7)
    doc.text(totalText, layout.margin + labelWidth + detail.columns.length * cellWidth + 2, y + 3.2 + (7 - totalSize) / 2,
      { width: totalWidth - 4, align: 'right', lineBreak: false })
    y += rowHeight
  }

  rows.forEach(row => drawRow(row))
  drawRow({ zone_name: 'TOPLAM', cells: detail.column_totals, total: detail.grand_total }, { bold: true })

  doc.moveTo(layout.margin, y).lineTo(layout.margin + layout.innerWidth, y).lineWidth(0.5).strokeColor(LINE).stroke()
  const notes = [
    detail.grouped ? 'Sütunlar aydır (aralık uzun).' : 'Sütunlar ayın günleridir; mavi gün başlığına tıklayınca o günün detayına gider.',
    detail.rows.length > MATRIX_ZONE_LIMIT ? `En çok dağıtılan ${MATRIX_ZONE_LIMIT} yer gösterildi (toplam ${detail.rows.length}).` : null,
  ].filter(Boolean).join('  ·  ')
  doc.font(fonts.regular).fontSize(6).fillColor(MUTED).text(text(notes), layout.margin, y + 4, { width: layout.innerWidth })
}

// ── Bölüm 3: gün gün detay ──

function drawDaysSection(doc, fonts, ctx) {
  const { detail } = ctx.report
  const text = value => pdfText(value, fonts)
  const title = SECTION_TITLES.days
  const flow = columnFlow(doc, fonts, ctx, { title, columns: 2, gap: 16 })
  const dayItems = ctx.outline.children[ctx.outline.children.length - 1]

  for (const day of detail.days) {
    flow.reserve(30)
    const head = flow.place(17)
    doc.rect(head.x, head.y, head.width, 15).fill('#ECFEFF')
    doc.font(fonts.bold).fontSize(8).fillColor(INK)
      .text(text(`${day.label} ${day.weekday}`), head.x + 4, head.y + 4, { width: head.width - 4, lineBreak: false })
    markTarget(doc, `day-${day.key}`, head.x, Math.max(0, head.y - 6))
    const summary = [
      day.in_base ? `gelen ${num(day.in_base)}` : null,
      `dağıtım ${num(day.out_base)}`,
      day.balance_base == null ? null : `kalan ${num(day.balance_base)}`,
    ].filter(Boolean).join('  ·  ')
    doc.font(fonts.regular).fillColor(MUTED)
    fitFontSize(doc, text(summary), head.width - 8, 6.2, 4.6)
    doc.text(text(summary), head.x + 4, head.y + 4, { width: head.width - 8, align: 'right', lineBreak: false })
    if (dayItems?.addItem) dayItems.addItem(pdfText(day.label, fonts))

    for (const intake of day.intakes) {
      const spot = flow.place(9.6)
      doc.font(fonts.regular).fontSize(6.4).fillColor(GREEN)
      const label = text(`⊕ giriş  ${intake.waybill_no || 'irsaliyesiz'} — ${intake.product_name}`)
      fitFontSize(doc, label, spot.width - 40, 6.4, 4.6)
      doc.text(label, spot.x + 4, spot.y + 1.4, { width: spot.width - 40, lineBreak: false, ellipsis: true })
      doc.font(fonts.bold).fontSize(6.4).fillColor(GREEN)
        .text(num(intake.qty_base), spot.x, spot.y + 1.4, { width: spot.width - 2, align: 'right', lineBreak: false })
    }

    for (const zone of day.zones) {
      const spot = flow.place(10.4)
      doc.font(fonts.regular).fillColor(INK)
      const nameWidth = Math.min(96, spot.width * 0.42)
      const nameSize = fitFontSize(doc, text(zone.zone_name), nameWidth, 6.8, 4.2)
      doc.text(text(zone.zone_name), spot.x + 4, spot.y + 1.6 + (6.8 - nameSize) / 2,
        { width: nameWidth, lineBreak: false, ellipsis: true })

      const breakdown = zone.lines.map(line => `${line.product_name} ${num(line.qty_base)}`).join(' · ')
      const breakdownWidth = spot.width - nameWidth - 46
      doc.font(fonts.regular).fillColor(MUTED)
      fitFontSize(doc, text(breakdown), breakdownWidth, 5.8, 4.2)
      doc.text(text(breakdown), spot.x + 6 + nameWidth, spot.y + 2.4,
        { width: breakdownWidth, lineBreak: false, ellipsis: true })

      doc.font(fonts.bold).fillColor(INK)
      const totalSize = fitFontSize(doc, num(zone.total), 40, 7)
      doc.text(num(zone.total), spot.x, spot.y + 1.6 + (7 - totalSize) / 2,
        { width: spot.width - 2, align: 'right', lineBreak: false })
    }

    const rule = flow.place(5)
    doc.moveTo(rule.x + 2, rule.y + 2).lineTo(rule.x + rule.width - 2, rule.y + 2)
      .lineWidth(0.4).strokeColor('#E2E8F0').stroke()
  }
}

// ── Bölüm 4: dağıtım yeri × ürün ──

function drawZonesSection(doc, fonts, ctx) {
  const { detail } = ctx.report
  const text = value => pdfText(value, fonts)
  const title = SECTION_TITLES.zones
  const flow = columnFlow(doc, fonts, ctx, { title, columns: 2, gap: 16 })

  for (const zone of detail.zone_products) {
    flow.reserve(22)
    const head = flow.place(12.6)
    doc.font(fonts.bold).fontSize(7.4).fillColor(INK)
    const nameSize = fitFontSize(doc, text(zone.zone_name), head.width - 60, 7.4, 5)
    doc.text(text(zone.zone_name), head.x + 2, head.y + 2 + (7.4 - nameSize) / 2,
      { width: head.width - 60, lineBreak: false, ellipsis: true })
    doc.font(fonts.bold).fontSize(7.4).fillColor(BAND)
      .text(num(zone.total), head.x, head.y + 2, { width: head.width - 2, align: 'right', lineBreak: false })
    doc.moveTo(head.x + 2, head.y + 11.6).lineTo(head.x + head.width - 2, head.y + 11.6)
      .lineWidth(0.4).strokeColor('#E2E8F0').stroke()

    for (const product of zone.products) {
      const spot = flow.place(9.4)
      doc.font(fonts.regular).fillColor('#334155')
      const productSize = fitFontSize(doc, text(product.name), spot.width - 96, 6.4, 4.6)
      doc.text(text(product.name), spot.x + 8, spot.y + 1.4 + (6.4 - productSize) / 2,
        { width: spot.width - 96, lineBreak: false, ellipsis: true })
      doc.font(fonts.regular).fillColor(MUTED)
      fitFontSize(doc, text(product.human), 52, 5.8, 4.2)
      doc.text(text(product.human), spot.x + spot.width - 96, spot.y + 2, { width: 52, align: 'right', lineBreak: false })
      doc.font(fonts.bold).fillColor(INK)
      const size = fitFontSize(doc, num(product.total), 38, 6.6)
      doc.text(num(product.total), spot.x, spot.y + 1.4 + (6.6 - size) / 2,
        { width: spot.width - 2, align: 'right', lineBreak: false })
    }
    flow.place(4)
  }
}

// ── Bölüm 5: gelen irsaliyeler ──

function drawIntakesSection(doc, fonts, ctx) {
  const report = ctx.report
  const text = value => pdfText(value, fonts)
  const title = SECTION_TITLES.intakes
  const flow = columnFlow(doc, fonts, ctx, { title, columns: 2, gap: 16 })
  const width = flow.columnWidth

  const headerRow = () => {
    const spot = flow.place(12)
    doc.rect(spot.x, spot.y, width, 11).fill('#E2E8F0')
    doc.font(fonts.bold).fontSize(6).fillColor('#334155')
    const labels = [['TARİH', 0, 40], ['İRSALİYE', 42, 66], ['ÜRÜN', 110, width - 158], ['MİKTAR', width - 46, 44]]
    labels.forEach(([label, offset, cellWidth], index) => {
      doc.text(text(label), spot.x + offset + 2, spot.y + 3,
        { width: cellWidth - 2, align: index === 3 ? 'right' : 'left', lineBreak: false })
    })
  }

  headerRow()
  let striped = 0
  for (const intake of report.intakes) {
    // Sütun/sayfa değişecekse başlığı yeni sütunun tepesine taşı.
    if (flow.willBreak(10.4)) { headerRow(); striped = 0 }
    const spot = flow.place(10.4)
    if (striped % 2 === 1) doc.rect(spot.x, spot.y, width, 10.4).fill(ZEBRA)
    striped += 1
    doc.font(fonts.regular).fillColor(INK)
    fitFontSize(doc, text(trDate(intake.move_date)), 38, 6.4, 4.6)
    doc.text(text(trDate(intake.move_date)), spot.x + 2, spot.y + 2, { width: 38, lineBreak: false })
    fitFontSize(doc, text(intake.waybill_no || '—'), 64, 6.4, 4.6)
    doc.text(text(intake.waybill_no || '—'), spot.x + 44, spot.y + 2, { width: 64, lineBreak: false, ellipsis: true })
    const productLabel = intake.brand_name ? `${intake.product_name} (${intake.brand_name})` : intake.product_name
    fitFontSize(doc, text(productLabel), width - 160, 6.4, 4.6)
    doc.text(text(productLabel), spot.x + 110, spot.y + 2, { width: width - 160, lineBreak: false, ellipsis: true })
    doc.font(fonts.bold).fillColor(INK)
    fitFontSize(doc, num(intake.qty_base), 42, 6.6, 4.6)
    doc.text(num(intake.qty_base), spot.x, spot.y + 2, { width: width - 2, align: 'right', lineBreak: false })
  }

  const totalSpot = flow.place(13)
  doc.font(fonts.bold).fontSize(7).fillColor(INK)
    .text(text(`TOPLAM (${report.intakes.length} giriş)`), totalSpot.x + 2, totalSpot.y + 2, { width: width - 60, lineBreak: false })
  doc.text(num(report.totals.period_in), totalSpot.x, totalSpot.y + 2, { width: width - 2, align: 'right', lineBreak: false })
}

const SECTION_RENDERERS = {
  matrix: drawMatrixSection,
  days: drawDaysSection,
  zones: drawZonesSection,
  intakes: drawIntakesSection,
}

export function writeAccountingReportPDF(report, doc) {
  const fonts = registerTurkishFonts(doc, 'Rpt')
  doc.info.Title = `Su Takip Muhasebe Raporu ${report.from} - ${report.to}`
  doc.info.Author = 'Şantiye Yatakhane Yönetim Sistemi'

  const ctx = { report, fonts, pageNo: 1, outline: doc.outline, currentSection: null }
  drawSummaryPage(doc, fonts, ctx)
  const sections = (report.sections || []).filter(section => SECTION_RENDERERS[section])
  if (sections.length) {
    ctx.outline.addItem(pdfText('ÖZET', fonts))
    doc.font(fonts.regular).fontSize(6).fillColor('#94A3B8')
      .text(pdfText('Sayfa 1', fonts), doc.page.margins.left, doc.page.height - 20,
        { width: doc.page.width - doc.page.margins.left * 2, align: 'right', lineBreak: false })
  }

  for (const section of sections) {
    if (section !== 'intakes' && !report.detail) continue
    if (section === 'days' && !report.detail?.days?.length) continue
    if ((section === 'matrix' || section === 'zones') && !report.detail?.rows?.length) continue
    ctx.currentSection = section
    SECTION_RENDERERS[section](doc, fonts, ctx)
  }

  doc.end()
  return report
}
