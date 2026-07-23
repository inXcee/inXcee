// Muhasebe raporunun PDF çizimi. Veri report.js'ten gelir; burada yalnız yerleşim var.
// Bölümler (ledger/matrix/days/zones/intakes/photos + ekler) rapor içindeki `sections` ile
// seçilir; her bölüm yer imi (outline) ve adlandırılmış hedef alır, özet sayfasındaki
// içindekiler ile matristeki gün satırları oraya atlar.
import fs from 'node:fs'
import { registerTurkishFonts, pdfText } from '../../shared/pdf/fonts.js'
import { trDate } from './report.js'
import { uploadFilePathFromUrl } from './file-lifecycle.js'

// Fotoğrafları PDF'e gömülecek boyuta indirir (sharp varsa ~640px JPEG; yoksa
// yalnız küçük dosyalar olduğu gibi alınır). Çizimden ÖNCE await edilir — çizici
// senkron kalır. item.buffer doldurulur, okunamayanlar item.error alır.
export async function attachReportPhotos(report, { maxWidth = 640, quality = 68, rawLimit = 1_500_000 } = {}) {
  const items = report?.photos?.items || []
  if (!items.length) return report
  let sharp = null
  try { sharp = (await import('sharp')).default } catch { sharp = null }
  for (const item of items) {
    const filePath = uploadFilePathFromUrl(item.url)
    if (!filePath || !fs.existsSync(filePath)) { item.error = 'dosya yok'; continue }
    try {
      if (sharp) {
        item.buffer = await sharp(filePath)
          .rotate() // EXIF yönünü uygula (telefon fotoğrafları yan gelmesin)
          .resize({ width: maxWidth, withoutEnlargement: true })
          .jpeg({ quality })
          .toBuffer()
      } else {
        const raw = fs.readFileSync(filePath)
        if (raw.length > rawLimit) { item.error = 'dosya çok büyük'; continue }
        item.buffer = raw
      }
    } catch {
      item.error = 'okunamadı'
    }
  }
  return report
}

const INK = '#0F172A'
const MUTED = '#64748B'
const LINE = '#CBD5E1'
const BAND = '#0E7490'
const ZEBRA = '#F1F5F9'
const GREEN = '#15803D'
const RED = '#B91C1C'
const ORANGE = '#B45309'
const PURPLE = '#7E22CE'
const FADE = '#CBD5E1'

const ZONE_ROW_LIMIT = 12
const INTAKE_ROW_LIMIT = 10
const PRODUCT_ROW_LIMIT = 12
const MATRIX_ZONE_LIMIT = 60
// Genel/gün tablolarında yan yana en fazla bu kadar ürün sütunu gösterilir.
const PRODUCT_COLUMN_LIMIT = 14
// Yer tablosunda yan yana en fazla bu kadar ürün sütunu; fazlası "Diğer"de toplanır.
const ZONE_PRODUCT_COLUMNS = 6

const nf = new Intl.NumberFormat('tr-TR')
const num = value => nf.format(Math.round(value || 0))
const signed = value => (value > 0 ? `+${num(value)}` : num(value))

const SECTION_TITLES = {
  ledger: 'GÜNLÜK DEFTER — TÜM HAREKETLER',
  matrix: 'DAĞITIM YERİ × GÜN — ÜRÜN DÖKÜMÜ',
  days: 'GÜN GÜN DETAY — NEREYE NE KADAR',
  zones: 'DAĞITIM YERİ × ÜRÜN',
  intakes: 'GELEN İRSALİYELER',
  photos: 'İRSALİYE FOTOĞRAFLARI',
  deposit: 'BOŞ DAMACANA / İADE DURUMU',
  adjustments: 'STOK DÜZELTMELERİ',
  trucks: 'TIR GELİŞLERİ',
  counts: 'AY KAPANIŞI VE FİZİKSEL SAYIM',
  checks: 'KONTROL LİSTESİ',
}
// İçindekiler tek satıra sığmalı — kısa adlar.
const SECTION_SHORT = {
  ledger: 'Günlük defter',
  matrix: 'Yer · Gün · Ürün',
  days: 'Gün gün detay',
  zones: 'Yer × Ürün',
  intakes: 'İrsaliyeler',
  photos: 'Fotoğraflar',
  deposit: 'İade durumu',
  adjustments: 'Düzeltmeler',
  trucks: 'Tırlar',
  counts: 'Sayım',
  checks: 'Kontrol listesi',
}
// Küçük tablolar tek "MUHASEBE EKLERİ" akışında toplanır — sayfa israfı olmasın.
const EXTRA_SECTIONS = ['deposit', 'adjustments', 'trucks', 'counts', 'checks']
const EXTRAS_TITLE = 'MUHASEBE EKLERİ'

// Veri yoksa bölüm çizilmez — içindekiler de aynı listeyi kullanmalı ki
// hedefsiz (kırık) bağlantı oluşmasın.
function renderableSections(report) {
  return (report.sections || []).filter(section => {
    if (section === 'ledger') return Boolean(report.ledger?.days?.length)
    if (section === 'photos') return Boolean(report.photos?.items?.length)
    if (section === 'days') return Boolean(report.detail?.days?.length)
    if (section === 'matrix' || section === 'zones') return Boolean(report.detail?.rows?.length)
    return true
  })
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
    if (row.__total) doc.rect(x, cursor, width, rowHeight).fill('#FEF3C7')
    else if (index % 2 === 1) doc.rect(x, cursor, width, rowHeight).fill(ZEBRA)
    columnX = x
    for (const column of columns) {
      const cell = column.cell(row)
      const value = text(cell?.value ?? '—')
      const available = column.width - 6
      doc.font(cell?.bold || row.__total ? fonts.bold : fonts.regular).fillColor(cell?.color || INK)
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
// startAt: {layout, y} — bölüm aynı sayfada başka bir bloğun altından sürer;
// ilk sayfada tüm kolonlar o hizadan başlar, sayfa kırılınca normal tepeye döner.
function columnFlow(doc, fonts, ctx, { title, columns = 2, gap = 14, landscape = false, destination, startAt = null }) {
  let layout = startAt ? startAt.layout : sectionPage(doc, fonts, ctx, {
    title, landscape,
    destination: destination === undefined ? `sec-${ctx.currentSection}` : destination,
  })
  let columnIndex = 0
  let top = startAt ? startAt.y : layout.top
  let y = top
  const widthOf = () => (layout.innerWidth - gap * (columns - 1)) / columns
  const advance = () => {
    columnIndex += 1
    if (columnIndex >= columns) {
      layout = sectionPage(doc, fonts, ctx, { title, landscape, continued: true })
      columnIndex = 0
      top = layout.top
    }
    y = top
  }

  return {
    get columnWidth() { return widthOf() },
    willBreak(height) { return y + height > layout.bottom },
    place(height) {
      if (y + height > layout.bottom) advance()
      const spot = { x: layout.margin + columnIndex * (widthOf() + gap), y, width: widthOf() }
      y += height
      return spot
    },
    // Blok başlığı yalnız başına kalmasın: başlık + ilk satır aynı sütuna sığmıyorsa
    // ikisini birlikte taşı.
    reserve(height) {
      if (y + height > layout.bottom) advance()
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
  const KPI_TINTS = { '#15803D': '#F0FDF4', '#B91C1C': '#FEF2F2', [BAND]: '#ECFEFF' }
  kpis.forEach((kpi, index) => {
    const x = margin + index * (kpiWidth + gap)
    // Renkli KPI'ya aynı tonun çok açık zemini — rapor bir bakışta okunur
    doc.roundedRect(x, 74, kpiWidth, 44, 3).fillAndStroke(KPI_TINTS[kpi.color] || '#F8FAFC', kpi.color || LINE)
    doc.lineWidth(0.7)
    doc.font(fonts.bold).fillColor(MUTED)
    fitFontSize(doc, text(kpi.label), kpiWidth - 12, 5.8, 4.2)
    doc.text(text(kpi.label), x + 6, 81, { width: kpiWidth - 12, lineBreak: false })
    doc.font(fonts.bold).fillColor(kpi.color || INK)
    const size = fitFontSize(doc, text(kpi.value), kpiWidth - 12, 15, 8)
    doc.text(text(kpi.value), x + 6, 93 + (15 - size) / 2, { width: kpiWidth - 12, lineBreak: false })
  })
  doc.font(fonts.regular).fontSize(6).fillColor(MUTED).text(
    text(`Hareketli gün: ${totals.active_days}  ·  Hareketli gün ortalaması: ${num(totals.avg_out_active)}`
      + (totals.busiest ? `  ·  En yoğun: ${totals.busiest.label} (${num(totals.busiest.out_base)})` : '')
      + `  ·  İrsaliye: ${totals.intake_count}  ·  Tır: ${totals.truck_count}  ·  Dağıtım yeri: ${totals.zone_count}`
      + `  ·  Eksi stoklu ürün: ${totals.negative_count}  ·  İnceleme kuyruğu: ${totals.review_count}`
      + (report.locked_months.length ? `  ·  Kilitli ay: ${report.locked_months.join(', ')}` : '')),
    margin, 121, { width: innerWidth },
  )

  // Tıklanabilir içindekiler — yalnız gerçekten çizilecek bölümler listelenir
  const tocSections = renderableSections(report)
  let top = 134
  if (tocSections.length) {
    const prefix = text('EK BÖLÜMLER:')
    const labels = tocSections.map(section => text(`▸ ${SECTION_SHORT[section]}`))
    // Sağ marjı aşmasın: en fazla iki satıra dizilir, sığmıyorsa punto düşer.
    doc.font(fonts.bold)
    let size = 6.4
    let lines = []
    const layoutLines = () => {
      doc.fontSize(size)
      const result = [[]]
      let x = doc.widthOfString(prefix) + 6
      labels.forEach((label, index) => {
        const width = doc.widthOfString(label) + 10
        if (x + width > innerWidth && result[result.length - 1].length) { result.push([]); x = 0 }
        result[result.length - 1].push({ label, index, x })
        x += width
      })
      return result
    }
    for (;;) {
      lines = layoutLines()
      if (lines.length <= 2 || size <= 4.4) break
      size = Math.max(4.4, size - 0.2)
    }
    doc.fontSize(size).fillColor(MUTED).text(prefix, margin, 131, { lineBreak: false })
    lines.forEach((line, lineIndex) => {
      const y = 131 + lineIndex * (size + 2.4)
      doc.fillColor(BAND)
      for (const item of line) {
        const x = margin + item.x
        doc.text(item.label, x, y, { lineBreak: false })
        linkArea(doc, `sec-${tocSections[item.index]}`, x, y - 2, doc.widthOfString(item.label), size + 3)
      }
    })
    top = 145 + (lines.length - 1) * (size + 2.4)
  }

  const columnGap = 12
  const leftWidth = 268
  const rightWidth = innerWidth - leftWidth - columnGap
  const rightX = margin + leftWidth + columnGap
  const hasAdjust = report.daily.some(row => row.adjust_base !== 0)
  // day-* hedefini yalnız gün detay bölümü gerçekten basılıyorsa hedefle —
  // aksi halde (örn. sections=matrix) özetteki bağlantı hedefsiz (kırık) kalır.
  const daysRendered = renderableSections(report).includes('days')
  const detailDayLinks = new Set(daysRendered ? (report.detail?.days || []).map(day => day.key) : [])
  const ledgerDayLinks = new Set((report.ledger?.days || []).map(day => day.key))
  const dayTarget = key => detailDayLinks.has(key) ? `day-${key}` : (ledgerDayLinks.has(key) ? `ledger-day-${key}` : null)

  const dailyColumns = hasAdjust
    ? [
      { label: report.grouped ? 'AY' : 'TARİH', width: 72, cell: row => ({ value: row.label, color: row.empty ? '#94A3B8' : INK, goTo: dayTarget(row.key) }) },
      { label: 'GELEN', width: 48, align: 'right', cell: row => ({ value: row.in_base ? num(row.in_base) : '·', color: row.in_base ? GREEN : FADE }) },
      { label: 'DAĞITILAN', width: 55, align: 'right', cell: row => ({ value: row.out_base ? num(row.out_base) : '·', color: row.out_base ? RED : FADE }) },
      { label: 'DÜZELTME', width: 47, align: 'right', cell: row => ({ value: row.adjust_base ? signed(row.adjust_base) : '·', color: row.adjust_base ? '#B45309' : FADE }) },
      { label: 'KALAN', width: 46, align: 'right', cell: row => ({ value: num(row.balance_base), bold: true, color: row.balance_base < 0 ? RED : INK }) },
    ]
    : [
      { label: report.grouped ? 'AY' : 'TARİH', width: 84, cell: row => ({ value: row.label, color: row.empty ? '#94A3B8' : INK, goTo: dayTarget(row.key) }) },
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
    __total: true,
  }]
  const leftY = drawTable(doc, fonts, {
    x: margin, y: top, width: leftWidth, columns: dailyColumns, rows: dailyRows,
    title: report.grouped ? 'AY AY HAREKET' : 'GÜN GÜN HAREKET',
    note: detailDayLinks.size || ledgerDayLinks.size
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
      __total: true,
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

// ── Bölüm 2: GÜN ↓ × ÜRÜN → dökümü (ay geneli + her yer tek tek) ──

function drawMatrixSection(doc, fonts, ctx) {
  const { detail, daily } = ctx.report
  const text = value => pdfText(value, fonts)
  // Gün bağlantısı yalnız gün detay bölümü gerçekten basılacaksa kurulur —
  // hedefsiz (kırık) bağlantı kalmasın (örn. sections=matrix tek başına).
  const daysRendered = renderableSections(ctx.report).includes('days')
  const dayLinks = new Set(daysRendered ? (detail.days || []).map(day => day.key) : [])
  const zones = detail.rows.slice(0, MATRIX_ZONE_LIMIT)
  const products = detail.product_rows.slice(0, PRODUCT_COLUMN_LIMIT)
  const title = SECTION_TITLES.matrix

  let layout = sectionPage(doc, fonts, ctx, { title, destination: 'sec-matrix' })
  let y = layout.top

  // — Ay geneli tablo: satırlar gün (grouped modda ay), sütunlar ürün —
  const labelWidth = 64
  const totalWidth = 44
  const cellWidth = (layout.innerWidth - labelWidth - totalWidth) / Math.max(1, products.length)
  const totalX = () => layout.margin + labelWidth + products.length * cellWidth
  const headerHeight = 24
  const rowHeight = 10.4

  const globalHeader = (top) => {
    doc.rect(layout.margin, top, layout.innerWidth, headerHeight).fill('#E2E8F0')
    doc.font(fonts.bold).fillColor('#334155')
    fitFontSize(doc, text('GÜN'), labelWidth - 6, 6.6, 4.6)
    doc.text(text('GÜN'), layout.margin + 3, top + 8, { width: labelWidth - 6, lineBreak: false })
    products.forEach((product, index) => {
      const x = layout.margin + labelWidth + index * cellWidth
      // Ürün adı ve birimi başlıkta bir kez — hücrelerde tekrar yok
      doc.font(fonts.bold).fillColor('#334155')
      fitFontSize(doc, text(product.name), cellWidth - 4, 6, 4.2)
      doc.text(text(product.name), x + 2, top + 4, { width: cellWidth - 4, align: 'center', lineBreak: false, ellipsis: true })
      doc.font(fonts.regular).fillColor(MUTED)
      const unitText = text(product.unit_label || 'adet')
      fitFontSize(doc, unitText, cellWidth - 4, 5.2, 4)
      doc.text(unitText, x + 2, top + 14, { width: cellWidth - 4, align: 'center', lineBreak: false })
    })
    doc.font(fonts.bold).fillColor('#334155')
    fitFontSize(doc, text('TOPLAM'), totalWidth - 4, 6.6, 4.6)
    doc.text(text('TOPLAM'), totalX() + 2, top + 8, { width: totalWidth - 4, align: 'right', lineBreak: false })
    return top + headerHeight
  }

  const ensureGlobal = (height) => {
    if (y + height > layout.bottom) {
      layout = sectionPage(doc, fonts, ctx, { title, continued: true })
      y = globalHeader(layout.top)
    }
  }

  y = globalHeader(y)
  detail.columns.forEach((column, index) => {
    ensureGlobal(rowHeight)
    // daily, columns ile aynı anahtar sırasından üretilir (dayKeys/monthKeys) —
    // gün etiketi ("03.06 Çar" / "Haziran 2026") oradan gelir.
    const label = daily[index]?.label || column.full
    const rowTotal = detail.column_totals[index] || 0
    const linked = dayLinks.has(column.key)
    if (index % 2 === 1) doc.rect(layout.margin, y, layout.innerWidth, rowHeight).fill(ZEBRA)
    doc.font(linked ? fonts.bold : fonts.regular).fillColor(linked ? BAND : rowTotal ? INK : FADE)
    const labelSize = fitFontSize(doc, text(label), labelWidth - 6, 6.2, 4.2)
    doc.text(text(label), layout.margin + 3, y + (rowHeight - labelSize) / 2 - 0.3, { width: labelWidth - 6, lineBreak: false })
    if (linked) linkArea(doc, `day-${column.key}`, layout.margin, y, labelWidth, rowHeight)
    products.forEach((product, productIndex) => {
      const x = layout.margin + labelWidth + productIndex * cellWidth
      const value = product.cells[index] || 0
      doc.font(fonts.regular).fillColor(value ? INK : FADE)
      const cellText = value ? compactCell(doc, value, cellWidth - 4) : '·'
      const cellSize = fitFontSize(doc, cellText, cellWidth - 4, 6.2, 4.2)
      doc.text(cellText, x + 2, y + (rowHeight - cellSize) / 2 - 0.3, { width: cellWidth - 4, align: 'center', lineBreak: false })
    })
    doc.font(fonts.bold).fillColor(rowTotal ? INK : FADE)
    const totalText = rowTotal ? compactCell(doc, rowTotal, totalWidth - 4, 4.5) : '·'
    const totalSize = fitFontSize(doc, totalText, totalWidth - 4, 6.4)
    doc.text(totalText, totalX() + 2, y + (rowHeight - totalSize) / 2 - 0.3, { width: totalWidth - 4, align: 'right', lineBreak: false })
    y += rowHeight
  })

  ensureGlobal(rowHeight * 2 + 12)
  doc.rect(layout.margin, y, layout.innerWidth, rowHeight).fill('#FEF3C7')
  doc.font(fonts.bold).fillColor(INK)
  doc.fontSize(6.4).text(text('TOPLAM'), layout.margin + 3, y + 2.4, { width: labelWidth - 6, lineBreak: false })
  products.forEach((product, index) => {
    const x = layout.margin + labelWidth + index * cellWidth
    const cellText = compactCell(doc, product.total, cellWidth - 4)
    const cellSize = fitFontSize(doc, cellText, cellWidth - 4, 6.4, 4.2)
    doc.text(cellText, x + 2, y + (rowHeight - cellSize) / 2 - 0.3, { width: cellWidth - 4, align: 'center', lineBreak: false })
  })
  const grandText = compactCell(doc, detail.grand_total, totalWidth - 4, 4.5)
  const grandSize = fitFontSize(doc, grandText, totalWidth - 4, 6.4)
  doc.text(grandText, totalX() + 2, y + (rowHeight - grandSize) / 2 - 0.3, { width: totalWidth - 4, align: 'right', lineBreak: false })
  y += rowHeight

  // PAY satırı: her ürünün dönem payı
  doc.font(fonts.regular).fillColor(MUTED)
  doc.fontSize(5.6).text(text('PAY'), layout.margin + 3, y + 2, { width: labelWidth - 6, lineBreak: false })
  products.forEach((product, index) => {
    const x = layout.margin + labelWidth + index * cellWidth
    const shareText = text(`%${String(product.share).replace('.', ',')}`)
    const shareSize = fitFontSize(doc, shareText, cellWidth - 4, 5.6, 4)
    doc.text(shareText, x + 2, y + 2 + (5.6 - shareSize) / 2, { width: cellWidth - 4, align: 'center', lineBreak: false })
  })
  doc.fontSize(5.6).text(text('%100'), totalX() + 2, y + 2, { width: totalWidth - 4, align: 'right', lineBreak: false })
  y += 10
  doc.moveTo(layout.margin, y).lineTo(layout.margin + layout.innerWidth, y).lineWidth(0.5).strokeColor(LINE).stroke()
  y += 6

  // — Her yer tek tek: GÜN ↓ × o yerin ürünleri → (2 kolonlu akış, aynı sayfadan sürer) —
  const flow = columnFlow(doc, fonts, ctx, { title, columns: 2, gap: 16, startAt: { layout, y } })

  const drawZoneTable = (zone) => {
    const zoneProducts = zone.products || []
    const visible = zoneProducts.slice(0, ZONE_PRODUCT_COLUMNS)
    const hidden = zoneProducts.slice(ZONE_PRODUCT_COLUMNS)
    const columnCount = visible.length + (hidden.length ? 1 : 0)
    const labelW = 50
    const totalW = 34
    const cellW = (flow.columnWidth - labelW - totalW) / Math.max(1, columnCount)
    const headerH = 16
    const rowH = 9

    const activeIndexes = []
    zone.cells.forEach((value, index) => { if (value) activeIndexes.push(index) })

    const header = (continued) => {
      const spot = flow.place(headerH + 1)
      doc.rect(spot.x, spot.y, spot.width, headerH).fill('#E2E8F0')
      doc.font(fonts.bold).fontSize(5.4).fillColor('#334155')
      doc.text(text(continued ? 'GÜN · devam' : 'GÜN'), spot.x + 3, spot.y + (headerH - 5.4) / 2,
        { width: labelW - 4, lineBreak: false, ellipsis: true })
      const labels = [...visible.map(product => product.name), ...(hidden.length ? ['Diğer'] : [])]
      labels.forEach((name, index) => {
        const x = spot.x + labelW + index * cellW
        doc.font(fonts.bold).fillColor('#334155')
        // Ürün adı başlıkta TAM — iki satıra kadar sarabilsin diye ~2 satır genişliğine göre punto
        fitFontSize(doc, text(name), (cellW - 3) * 1.9, 5.2, 4)
        doc.text(text(name), x + 1.5, spot.y + 2, { width: cellW - 3, height: headerH - 3, align: 'center', ellipsis: true, lineGap: 0 })
      })
      doc.font(fonts.bold).fontSize(5.4).fillColor('#334155')
      doc.text(text('TOP'), spot.x + spot.width - totalW, spot.y + (headerH - 5.4) / 2,
        { width: totalW - 2, align: 'right', lineBreak: false })
    }

    const row = (label, cells, total, { bold = false, fill = null, linkKey = null } = {}) => {
      if (flow.willBreak(rowH)) header(true)
      const spot = flow.place(rowH)
      if (fill) doc.rect(spot.x, spot.y, spot.width, rowH).fill(fill)
      const linked = linkKey != null && dayLinks.has(linkKey)
      doc.font(bold ? fonts.bold : fonts.regular).fillColor(linked ? BAND : INK)
      const labelSize = fitFontSize(doc, text(label), labelW - 4, 5.8, 4)
      doc.text(text(label), spot.x + 3, spot.y + (rowH - labelSize) / 2 - 0.2, { width: labelW - 4, lineBreak: false })
      if (linked) linkArea(doc, `day-${linkKey}`, spot.x, spot.y, labelW, rowH)
      cells.forEach((value, index) => {
        const x = spot.x + labelW + index * cellW
        doc.font(bold ? fonts.bold : fonts.regular).fillColor(value ? INK : FADE)
        const cellText = value ? compactCell(doc, value, cellW - 3) : '·'
        const cellSize = fitFontSize(doc, cellText, cellW - 3, 5.8, 4)
        doc.text(cellText, x + 1.5, spot.y + (rowH - cellSize) / 2 - 0.2, { width: cellW - 3, align: 'center', lineBreak: false })
      })
      doc.font(fonts.bold).fillColor(INK)
      const totalText = compactCell(doc, total, totalW - 2, 4)
      const totalSize = fitFontSize(doc, totalText, totalW - 2, 5.8, 4)
      doc.text(totalText, spot.x + spot.width - totalW, spot.y + (rowH - totalSize) / 2 - 0.2,
        { width: totalW - 2, align: 'right', lineBreak: false })
    }

    // Bant + başlık + ilk satır bölünmesin
    flow.reserve(14.5 + headerH + rowH + 3)
    const band = flow.place(14.5)
    doc.rect(band.x, band.y, band.width, 13).fill('#ECFEFF')
    doc.rect(band.x, band.y, 3, 13).fill(BAND)
    doc.font(fonts.bold).fontSize(7).fillColor(INK)
    const nameSize = fitFontSize(doc, text(zone.zone_name), band.width - 112, 7, 4.4)
    doc.text(text(zone.zone_name), band.x + 6, band.y + (13 - nameSize) / 2, { width: band.width - 112, lineBreak: false, ellipsis: true })
    doc.font(fonts.regular).fillColor(MUTED)
    const meta = text(`toplam ${num(zone.total)} · %${String(zone.share).replace('.', ',')}`)
    fitFontSize(doc, meta, 102, 6, 4.2)
    doc.text(meta, band.x + band.width - 106, band.y + 3.8, { width: 102, align: 'right', lineBreak: false })

    header(false)
    for (const index of activeIndexes) {
      const cells = [
        ...visible.map(product => product.cells[index] || 0),
        ...(hidden.length ? [hidden.reduce((sum, product) => sum + (product.cells[index] || 0), 0)] : []),
      ]
      row(daily[index]?.label || detail.columns[index].full, cells, zone.cells[index], { linkKey: detail.columns[index].key })
    }
    if (activeIndexes.length > 1) {
      const totals = [
        ...visible.map(product => product.total),
        ...(hidden.length ? [hidden.reduce((sum, product) => sum + product.total, 0)] : []),
      ]
      row('TOPLAM', totals, zone.total, { bold: true, fill: '#FEF3C7' })
    }
    if (hidden.length) {
      const note = flow.place(8)
      doc.font(fonts.regular).fontSize(5.4).fillColor(MUTED)
      const noteText = text(`Diğer: ${hidden.map(product => product.name).join(', ')} (toplam ${num(hidden.reduce((sum, product) => sum + product.total, 0))})`)
      fitFontSize(doc, noteText, note.width - 4, 5.4, 4)
      doc.text(noteText, note.x + 2, note.y + 1.5, { width: note.width - 4, lineBreak: false, ellipsis: true })
    }
    flow.place(4)
  }

  for (const zone of zones) drawZoneTable(zone)

  const notes = [
    detail.grouped ? 'Satırlar aydır (aralık uzun).' : 'Yer tablolarında yalnız hareket olan günler listelenir.',
    daysRendered ? 'Mavi gün etiketi o günün detayına gider.' : null,
    'Hücreler ürünün kendi baz birimindedir.',
    detail.product_rows.length > PRODUCT_COLUMN_LIMIT
      ? `Genel tabloda en çok dağıtılan ${PRODUCT_COLUMN_LIMIT} ürün var (toplam ${detail.product_rows.length}).` : null,
    detail.rows.length > MATRIX_ZONE_LIMIT
      ? `En çok dağıtılan ${MATRIX_ZONE_LIMIT} yer gösterildi (toplam ${detail.rows.length}).` : null,
  ].filter(Boolean).join('  ·  ')
  const noteSpot = flow.place(24)
  doc.font(fonts.regular).fontSize(6).fillColor(MUTED).text(text(notes), noteSpot.x, noteSpot.y + 3, { width: noteSpot.width })
}

// ── Günlük defter: giriş, dağıtım, boş iade ve düzeltmeler ──

function drawLedgerSection(doc, fonts, ctx) {
  const { ledger } = ctx.report
  const text = value => pdfText(value, fonts)
  const title = SECTION_TITLES.ledger
  const flow = columnFlow(doc, fonts, ctx, { title, columns: 1, gap: 0 })
  const kindStyle = {
    intake: { color: GREEN, tint: '#F0FDF4' },
    distribution: { color: RED, tint: '#FEF2F2' },
    return: { color: PURPLE, tint: '#FAF5FF' },
    adjustment: { color: ORANGE, tint: '#FFFBEB' },
  }

  const tableHeader = label => {
    const spot = flow.place(12)
    doc.rect(spot.x, spot.y, spot.width, 11).fill('#E2E8F0')
    doc.font(fonts.bold).fontSize(5.8).fillColor('#334155')
    doc.text(text(label || 'İŞLEM'), spot.x + 4, spot.y + 3.2, { width: 44, lineBreak: false })
    doc.text(text('ÜRÜN'), spot.x + 52, spot.y + 3.2, { width: 122, lineBreak: false })
    doc.text(text('DETAY / NOT / KAYDI GİREN'), spot.x + 178, spot.y + 3.2, { width: spot.width - 284, lineBreak: false })
    doc.text(text('MİKTAR'), spot.x + spot.width - 104, spot.y + 3.2, { width: 100, align: 'right', lineBreak: false })
  }

  let striped = 0
  for (const day of ledger.days) {
    flow.reserve(42)
    const head = flow.place(16)
    doc.roundedRect(head.x, head.y, head.width, 14, 3).fillAndStroke('#ECFEFF', '#A5F3FC')
    doc.rect(head.x, head.y, 3, 14).fill(BAND)
    doc.font(fonts.bold).fontSize(7.6).fillColor(INK)
      .text(text(`${day.label} · ${day.weekday}`), head.x + 8, head.y + 3.6, { width: 150, lineBreak: false })
    doc.font(fonts.regular).fontSize(5.6).fillColor(MUTED)
      .text(text(`${day.entries.length} kayıt`), head.x + 156, head.y + 4.6, { width: 50, lineBreak: false })
    const summary = [
      day.intake_base ? `Gelen ${num(day.intake_base)}` : null,
      day.distribution_base ? `Dağıtım ${num(day.distribution_base)}` : null,
      day.return_base ? `Boş iade ${num(day.return_base)}` : null,
      day.adjustment_base ? `Düzeltme ${signed(day.adjustment_base)}` : null,
    ].filter(Boolean).join('  ·  ')
    doc.font(fonts.bold).fillColor(BAND)
    fitFontSize(doc, text(summary), head.width - 216, 6.4, 4.3)
    doc.text(text(summary), head.x + 208, head.y + 4, { width: head.width - 216, align: 'right', lineBreak: false })
    markTarget(doc, `ledger-day-${day.key}`, head.x, Math.max(0, head.y - 6))

    tableHeader()
    striped = 0
    for (const entry of day.entries) {
      if (flow.willBreak(12.4)) {
        flow.reserve(25)
        tableHeader(`${day.label} · DEVAM`)
        striped = 0
      }
      // Tek satırlık kayıt: işlem çipi + ürün + birleşik detay + miktar (az sayfa)
      const spot = flow.place(12.4)
      if (striped % 2 === 1) doc.rect(spot.x, spot.y, spot.width, 12.4).fill(ZEBRA)
      striped += 1
      const style = kindStyle[entry.kind] || { color: BAND, tint: '#ECFEFF' }
      doc.roundedRect(spot.x + 4, spot.y + 1.7, 44, 9, 2.5).fill(style.tint)
      doc.font(fonts.bold).fillColor(style.color)
      fitFontSize(doc, text(entry.kind_label), 40, 5.6, 4.2)
      doc.text(text(entry.kind_label), spot.x + 6, spot.y + 3.6, { width: 40, align: 'center', lineBreak: false })

      doc.font(fonts.bold).fillColor(INK)
      const productSize = fitFontSize(doc, text(entry.product_name), 122, 6.4, 4.4)
      doc.text(text(entry.product_name), spot.x + 52, spot.y + (12.4 - productSize) / 2 - 0.4,
        { width: 122, lineBreak: false, ellipsis: true })

      const detailWidth = spot.width - 284
      const detailText = [entry.context, entry.note, entry.created_by_name].filter(Boolean).join(' · ') || '—'
      doc.font(fonts.regular).fillColor('#475569')
      const detailSize = fitFontSize(doc, text(detailText), detailWidth, 5.8, 4.2)
      doc.text(text(detailText), spot.x + 178, spot.y + (12.4 - detailSize) / 2 - 0.3,
        { width: detailWidth, lineBreak: false, ellipsis: true })

      const amountCore = entry.kind === 'adjustment'
        ? `${entry.stock_effect > 0 ? '+' : '−'}${entry.qty_human}`
        : entry.qty_human
      const amount = entry.qty_human === `${entry.qty_base} ${entry.unit_label || 'adet'}`
        ? amountCore
        : `${amountCore} = ${num(entry.qty_base)}`
      doc.font(fonts.bold).fillColor(style.color)
      const amountSize = fitFontSize(doc, text(amount), 100, 6.4, 4.2)
      doc.text(text(amount), spot.x + spot.width - 104, spot.y + (12.4 - amountSize) / 2 - 0.4,
        { width: 100, align: 'right', lineBreak: false })
    }
    flow.place(3)
  }

  if (ledger.truncated) {
    const warning = flow.place(20)
    doc.roundedRect(warning.x, warning.y, warning.width, 16, 3).fill('#FEF2F2')
    doc.font(fonts.bold).fontSize(6.5).fillColor(RED)
      .text(text('Kayıt sınırına ulaşıldı; bu bölüm eksik olabilir.'), warning.x + 7, warning.y + 5, { width: warning.width - 14 })
  }
}

// ── Gün gün dağıtım detayı ──

function drawDaysSection(doc, fonts, ctx) {
  const { detail } = ctx.report
  const text = value => pdfText(value, fonts)
  const title = SECTION_TITLES.days
  // Ürünler her gün tablosunda SÜTUN; adları numara/lejant yerine HER tablonun
  // başlığında tam yazılır (gerekirse punto küçülür, iki satıra sarar).
  const products = detail.product_rows.slice(0, PRODUCT_COLUMN_LIMIT)
  const overflow = detail.product_rows.length > products.length
  const columnIndexById = new Map(products.map((product, index) => [product.product_id, index]))
  const columnCount = products.length + (overflow ? 1 : 0)
  const flowColumns = columnCount <= 4 ? 2 : 1
  const flow = columnFlow(doc, fonts, ctx, { title, columns: flowColumns, gap: 16 })
  const dayItems = ctx.outline.children[ctx.outline.children.length - 1]

  if (overflow) {
    const note = flow.place(9)
    doc.font(fonts.regular).fontSize(5.6).fillColor(MUTED)
      .text(text(`"Diğer" sütunu: en çok dağıtılan ${products.length} ürün dışındaki ${detail.product_rows.length - products.length} ürünün toplamıdır.`),
        note.x + 2, note.y + 1, { width: note.width - 4, lineBreak: false, ellipsis: true })
  }

  const labelWidth = () => Math.max(56, flow.columnWidth - 36 - columnCount * cellW())
  const cellW = () => {
    const available = flow.columnWidth - 36 - 62 // total 36, min yer etiketi 62
    return Math.min(34, Math.max(20, available / Math.max(1, columnCount)))
  }

  const HEADER_HEIGHT = 16
  const tableHeader = (dayLabel) => {
    const spot = flow.place(HEADER_HEIGHT + 1)
    doc.rect(spot.x, spot.y, spot.width, HEADER_HEIGHT).fill('#E2E8F0')
    doc.font(fonts.bold).fontSize(5.6).fillColor('#334155')
    doc.text(text(dayLabel || 'YER'), spot.x + 3, spot.y + (HEADER_HEIGHT - 5.6) / 2,
      { width: labelWidth() - 4, lineBreak: false, ellipsis: true })
    for (let index = 0; index < columnCount; index += 1) {
      const x = spot.x + labelWidth() + index * cellW()
      const label = index < products.length ? products[index].name : 'Diğer'
      doc.font(fonts.bold).fillColor('#334155')
      // İki satıra kadar sarabilsin diye ~2 satır genişliğine göre punto seç
      fitFontSize(doc, text(label), (cellW() - 2) * 1.9, 5.2, 4)
      doc.text(text(label), x, spot.y + 2, { width: cellW() - 2, height: HEADER_HEIGHT - 3, align: 'center', ellipsis: true, lineGap: 0 })
    }
    doc.font(fonts.bold).fontSize(5.6).fillColor('#334155')
    doc.text(text('TOP'), spot.x + spot.width - 34, spot.y + (HEADER_HEIGHT - 5.6) / 2, { width: 32, align: 'right', lineBreak: false })
  }

  const drawTableRow = (label, cells, total, { fill = null, bold = false, color = INK } = {}) => {
    const spot = flow.place(8.8)
    if (fill) doc.rect(spot.x, spot.y, spot.width, 8.8).fill(fill)
    doc.font(bold ? fonts.bold : fonts.regular).fillColor(color)
    const nameSize = fitFontSize(doc, text(label), labelWidth() - 4, 6.2, 4.2)
    doc.text(text(label), spot.x + 3, spot.y + (8.8 - nameSize) / 2 - 0.3,
      { width: labelWidth() - 4, lineBreak: false, ellipsis: true })
    cells.forEach((value, index) => {
      const x = spot.x + labelWidth() + index * cellW()
      doc.font(bold ? fonts.bold : fonts.regular).fillColor(value ? color : FADE)
      const cellText = value ? compactCell(doc, value, cellW() - 2) : '·'
      const cellSize = fitFontSize(doc, cellText, cellW() - 2, 5.8, 4)
      doc.text(cellText, x, spot.y + (8.8 - cellSize) / 2 - 0.3, { width: cellW() - 2, align: 'center', lineBreak: false })
    })
    doc.font(fonts.bold).fillColor(color)
    const totalText = compactCell(doc, total, 32, 4.2)
    const totalSize = fitFontSize(doc, totalText, 32, 6.2, 4.2)
    doc.text(totalText, spot.x + spot.width - 34, spot.y + (8.8 - totalSize) / 2 - 0.3,
      { width: 32, align: 'right', lineBreak: false })
  }

  const cellsFor = lines => {
    const cells = new Array(columnCount).fill(0)
    for (const line of lines) {
      const index = columnIndexById.get(line.product_id)
      if (index != null) cells[index] += line.qty_base
      else if (overflow) cells[columnCount - 1] += line.qty_base
    }
    return cells
  }

  for (const day of detail.days) {
    flow.reserve(42)
    const head = flow.place(14.5)
    doc.rect(head.x, head.y, head.width, 13).fill('#ECFEFF')
    doc.rect(head.x, head.y, 3, 13).fill(day.in_base ? GREEN : BAND)
    doc.font(fonts.bold).fontSize(7.4).fillColor(INK)
      .text(text(`${day.label} ${day.weekday}`), head.x + 6, head.y + 3.4, { width: head.width - 6, lineBreak: false })
    markTarget(doc, `day-${day.key}`, head.x, Math.max(0, head.y - 6))
    const summary = [
      day.in_base ? `gelen ${num(day.in_base)}` : null,
      `dağıtım ${num(day.out_base)}`,
      day.balance_base == null ? null : `kalan ${num(day.balance_base)}`,
    ].filter(Boolean).join('  ·  ')
    doc.font(fonts.regular).fillColor(MUTED)
    fitFontSize(doc, text(summary), head.width - 8, 6, 4.4)
    doc.text(text(summary), head.x + 4, head.y + 3.8, { width: head.width - 8, align: 'right', lineBreak: false })
    if (dayItems?.addItem) dayItems.addItem(pdfText(day.label, fonts))

    for (const intake of day.intakes) {
      const spot = flow.place(8.6)
      doc.font(fonts.regular).fontSize(6.2).fillColor(GREEN)
      const humanPart = intake.qty_human && intake.qty_human !== `${intake.qty_base} ${intake.unit_label || 'adet'}`
        ? ` · ${intake.qty_human}`
        : ''
      const label = text(`⊕ giriş  ${intake.waybill_no || 'irsaliyesiz'} — ${intake.product_name}${humanPart}`)
      fitFontSize(doc, label, spot.width - 40, 6.2, 4.4)
      doc.text(label, spot.x + 4, spot.y + 1.2, { width: spot.width - 40, lineBreak: false, ellipsis: true })
      doc.font(fonts.bold).fontSize(6.2).fillColor(GREEN)
        .text(num(intake.qty_base), spot.x, spot.y + 1.2, { width: spot.width - 2, align: 'right', lineBreak: false })
    }

    if (day.zones.length) {
      tableHeader()
      const dayTotals = new Array(columnCount).fill(0)
      for (const zone of day.zones) {
        if (flow.willBreak(8.8)) tableHeader(`${day.label} · devam`)
        const cells = cellsFor(zone.lines)
        cells.forEach((value, index) => { dayTotals[index] += value })
        drawTableRow(zone.zone_name, cells, zone.total)
      }
      if (day.zones.length > 1) {
        if (flow.willBreak(8.8)) tableHeader(`${day.label} · devam`)
        drawTableRow('TOPLAM', dayTotals, day.out_base, { fill: '#FEF3C7', bold: true })
      }
    }
    flow.place(3)
  }
}

// ── Bölüm 4: dağıtım yeri × ürün (ürün adları BİR KEZ, üstte sütun olarak) ──

function drawZonesSection(doc, fonts, ctx) {
  const { detail } = ctx.report
  const text = value => pdfText(value, fonts)
  const title = SECTION_TITLES.zones
  const products = detail.product_rows.slice(0, PRODUCT_COLUMN_LIMIT)
  const zones = detail.rows.slice(0, MATRIX_ZONE_LIMIT)
  // Yer satırındaki ürün toplamlarına hızlı erişim
  const zoneProductTotal = new Map(detail.rows.map(row =>
    [row.zone_id, new Map((row.products || []).map(product => [product.product_id, product.total]))]))

  let layout = sectionPage(doc, fonts, ctx, { title, landscape: true, destination: 'sec-zones' })
  const labelWidth = 150
  const totalWidth = 48
  const shareWidth = 30
  const cellWidth = (layout.innerWidth - labelWidth - totalWidth - shareWidth) / Math.max(1, products.length)
  const totalX = () => layout.margin + labelWidth + products.length * cellWidth
  const rowHeight = 12.4
  const headerHeight = 24

  const header = (y) => {
    doc.rect(layout.margin, y, layout.innerWidth, headerHeight).fill('#E2E8F0')
    doc.font(fonts.bold).fillColor('#334155')
    fitFontSize(doc, text('DAĞITIM YERİ'), labelWidth - 6, 6.6, 4.6)
    doc.text(text('DAĞITIM YERİ'), layout.margin + 3, y + 8, { width: labelWidth - 6, lineBreak: false })
    products.forEach((product, index) => {
      const x = layout.margin + labelWidth + index * cellWidth
      // Ürün adı bir kez burada — satırlarda tekrar edilmez
      doc.font(fonts.bold).fillColor('#334155')
      fitFontSize(doc, text(product.name), cellWidth - 4, 6, 4.2)
      doc.text(text(product.name), x + 2, y + 4, { width: cellWidth - 4, align: 'center', lineBreak: false, ellipsis: true })
      doc.font(fonts.regular).fillColor(MUTED)
      const unitText = text(product.unit_label || 'adet')
      fitFontSize(doc, unitText, cellWidth - 4, 5.2, 4)
      doc.text(unitText, x + 2, y + 14, { width: cellWidth - 4, align: 'center', lineBreak: false })
    })
    doc.font(fonts.bold).fillColor('#334155')
    fitFontSize(doc, text('TOPLAM'), totalWidth - 4, 6.6, 4.6)
    doc.text(text('TOPLAM'), totalX() + 2, y + 8, { width: totalWidth - 4, align: 'right', lineBreak: false })
    fitFontSize(doc, text('PAY'), shareWidth - 4, 6.6, 4.6)
    doc.text(text('PAY'), totalX() + totalWidth + 2, y + 8, { width: shareWidth - 4, align: 'right', lineBreak: false })
    return y + headerHeight
  }

  let y = header(layout.top)
  let striped = 0
  const drawRow = (label, cells, total, share, { total: isTotal = false } = {}) => {
    if (y + rowHeight > layout.bottom) {
      layout = sectionPage(doc, fonts, ctx, { title, landscape: true, continued: true })
      y = header(layout.top)
      striped = 0
    }
    if (isTotal) doc.rect(layout.margin, y, layout.innerWidth, rowHeight).fill('#FEF3C7')
    else if (striped % 2 === 1) doc.rect(layout.margin, y, layout.innerWidth, rowHeight).fill(ZEBRA)
    striped += 1
    const font = isTotal ? fonts.bold : fonts.regular
    doc.font(fonts.bold).fillColor(INK)
    const nameSize = fitFontSize(doc, text(label), labelWidth - 6, 7, 4.2)
    doc.text(text(label), layout.margin + 3, y + (rowHeight - nameSize) / 2 - 0.4,
      { width: labelWidth - 6, lineBreak: false, ellipsis: true })
    cells.forEach((value, index) => {
      const x = layout.margin + labelWidth + index * cellWidth
      doc.font(font).fillColor(value ? INK : FADE)
      const cellText = value ? compactCell(doc, value, cellWidth - 4) : '·'
      const cellSize = fitFontSize(doc, cellText, cellWidth - 4, 6.6, 4.2)
      doc.text(cellText, x + 2, y + (rowHeight - cellSize) / 2 - 0.4, { width: cellWidth - 4, align: 'center', lineBreak: false })
    })
    doc.font(fonts.bold).fillColor(INK)
    const totalText = compactCell(doc, total, totalWidth - 4, 4.5)
    const totalSize = fitFontSize(doc, totalText, totalWidth - 4, 7)
    doc.text(totalText, totalX() + 2, y + (rowHeight - totalSize) / 2 - 0.4,
      { width: totalWidth - 4, align: 'right', lineBreak: false })
    if (share != null) {
      doc.font(fonts.regular).fillColor(MUTED)
      const shareText = `%${String(share).replace('.', ',')}`
      const shareSize = fitFontSize(doc, shareText, shareWidth - 4, 6.2, 4.2)
      doc.text(shareText, totalX() + totalWidth + 2, y + (rowHeight - shareSize) / 2 - 0.4,
        { width: shareWidth - 4, align: 'right', lineBreak: false })
    }
    y += rowHeight
  }

  for (const zone of zones) {
    const totals = zoneProductTotal.get(zone.zone_id) || new Map()
    drawRow(zone.zone_name, products.map(product => totals.get(product.product_id) || 0), zone.total, zone.share)
  }
  drawRow('TOPLAM', products.map(product => product.total), detail.grand_total, 100, { total: true })
  doc.moveTo(layout.margin, y).lineTo(layout.margin + layout.innerWidth, y).lineWidth(0.5).strokeColor(LINE).stroke()
  const notes = [
    'Hücreler ürünün kendi baz birimindedir (başlık altındaki birim).',
    detail.product_rows.length > PRODUCT_COLUMN_LIMIT
      ? `En çok dağıtılan ${PRODUCT_COLUMN_LIMIT} ürün gösterildi (toplam ${detail.product_rows.length}).` : null,
    detail.rows.length > MATRIX_ZONE_LIMIT
      ? `En çok dağıtılan ${MATRIX_ZONE_LIMIT} yer gösterildi (toplam ${detail.rows.length}).` : null,
  ].filter(Boolean).join('  ·  ')
  doc.font(fonts.regular).fontSize(6).fillColor(MUTED).text(text(notes), layout.margin, y + 4, { width: layout.innerWidth })
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

// ── İrsaliye fotoğrafları (okunur, iki sütunlu belge kartları) ──

function drawPhotosSection(doc, fonts, ctx) {
  const photos = ctx.report.photos
  const text = value => pdfText(value, fonts)
  const title = SECTION_TITLES.photos
  let layout = sectionPage(doc, fonts, ctx, { title, destination: 'sec-photos' })

  const columns = 2
  const gap = 12
  const cellWidth = (layout.innerWidth - gap * (columns - 1)) / columns
  const imageHeight = 235
  const cellHeight = imageHeight + 56
  let column = 0
  let x = layout.margin
  let y = layout.top + 34

  doc.roundedRect(layout.margin, layout.top, layout.innerWidth, 24, 4).fill('#ECFEFF')
  doc.font(fonts.bold).fontSize(7.5).fillColor(BAND)
    .text(text(`${photos.total} fotoğraf · ${photos.items.length} belge rapora eklendi`), layout.margin + 9, layout.top + 6, {
      width: layout.innerWidth - 18, lineBreak: false,
    })
  doc.font(fonts.regular).fontSize(6).fillColor(MUTED)
    .text(text(photos.skipped ? `${photos.skipped} fotoğraf üst sınır nedeniyle gösterilmedi.` : 'Fotoğraflar tarih sırasındadır; bağlı irsaliye içeriği kart altında yer alır.'),
      layout.margin + 9, layout.top + 15, { width: layout.innerWidth - 18, lineBreak: false })

  // Soldan sağa akış: satır dolunca aşağı, sayfa dolunca yeni sayfa.
  const advance = () => {
    column += 1
    if (column >= columns) {
      column = 0
      y += cellHeight + gap
    }
    x = layout.margin + column * (cellWidth + gap)
  }

  for (const item of photos.items) {
    if (y + cellHeight > layout.bottom) {
      layout = sectionPage(doc, fonts, ctx, { title, continued: true })
      column = 0
      x = layout.margin
      y = layout.top
    }
    doc.roundedRect(x, y, cellWidth, cellHeight, 5).fillAndStroke('#FFFFFF', LINE)
    doc.roundedRect(x + 4, y + 4, cellWidth - 8, imageHeight, 3).fill('#F8FAFC')
    if (item.buffer) {
      try {
        doc.image(item.buffer, x + 4, y + 4, {
          fit: [cellWidth - 8, imageHeight],
          align: 'center',
          valign: 'center',
        })
      } catch {
        item.error = 'görüntü basılamadı'
      }
    }
    if (!item.buffer || item.error) {
      doc.font(fonts.regular).fontSize(7).fillColor(MUTED)
        .text(text(`⚠ ${item.error || 'fotoğraf yüklenmedi'}`), x + 8, y + imageHeight / 2, {
          width: cellWidth - 16, align: 'center', lineBreak: false,
        })
    }
    const captionY = y + imageHeight + 8
    doc.roundedRect(x + 7, captionY - 1, 64, 13, 3).fill('#ECFEFF')
    doc.font(fonts.bold).fontSize(6.2).fillColor(BAND)
      .text(text(trDate(item.move_date)), x + 10, captionY + 2.5, { width: 58, align: 'center', lineBreak: false })
    doc.font(fonts.bold).fontSize(7.2).fillColor(INK)
    const head = text(item.waybill_no ? `İrsaliye ${item.waybill_no}` : (item.plate || 'İrsaliyesiz belge'))
    fitFontSize(doc, head, cellWidth - 84, 7.2, 4.6)
    doc.text(head, x + 78, captionY + 1.5, { width: cellWidth - 85, lineBreak: false, ellipsis: true })
    const contentText = item.content.length
      ? item.content.map(line => `${line.product_name}: ${line.qty_human || num(line.qty_base)}`).join(' · ')
      : (item.note || 'giriş kaydı bağlı değil')
    doc.font(fonts.regular).fillColor(item.content.length ? '#0F766E' : MUTED)
    fitFontSize(doc, text(contentText), cellWidth - 14, 6.2, 4.2)
    doc.text(text(contentText), x + 7, captionY + 17, { width: cellWidth - 14, lineBreak: false, ellipsis: true })
    const meta = [item.plate ? `Plaka ${item.plate}` : null, item.note, item.uploaded_by_name ? `Yükleyen: ${item.uploaded_by_name}` : null]
      .filter(Boolean).join(' · ') || item.original_name || 'Belge arşivi'
    doc.font(fonts.regular).fillColor(MUTED)
    fitFontSize(doc, text(meta), cellWidth - 14, 5.4, 4.1)
    doc.text(text(meta), x + 7, captionY + 29, { width: cellWidth - 14, lineBreak: false, ellipsis: true })
    advance()
  }

  // Not satırı: kalan hücrenin altına
  const noteY = column === 0 ? y : y + cellHeight + 8
  const notes = [
    `${photos.items.length} fotoğraf gömüldü`,
    photos.skipped ? `${photos.skipped} fotoğraf sınır nedeniyle atlandı (toplam ${photos.total})` : null,
    photos.items.some(item => item.error) ? `${photos.items.filter(item => item.error).length} fotoğraf okunamadı` : null,
  ].filter(Boolean).join('  ·  ')
  if (noteY + 12 <= layout.bottom) {
    doc.font(fonts.regular).fontSize(6).fillColor(MUTED).text(text(notes), layout.margin, noteY, { width: layout.innerWidth })
  }
}

// ── Bölüm 6: muhasebe ekleri (küçük tablolar tek akışta) ──

// flow içine sığdırılmış küçük tablo; sütun/sayfa değişince başlık tekrar çizilir.
function flowTable(doc, fonts, flow, { columns, rows, rowHeight = 9.8, headerHeight = 11 }) {
  const text = value => pdfText(value, fonts)
  const width = flow.columnWidth
  const fixed = columns.filter(column => !column.flex).reduce((sum, column) => sum + column.w, 0)
  const laid = columns.map(column => ({ ...column, w: column.flex ? Math.max(28, width - fixed) : column.w }))
  const offsets = []
  laid.reduce((x, column) => { offsets.push(x); return x + column.w }, 0)

  const header = () => {
    const spot = flow.place(headerHeight)
    doc.rect(spot.x, spot.y, width, headerHeight - 1).fill('#E2E8F0')
    doc.font(fonts.bold).fillColor('#334155')
    laid.forEach((column, index) => {
      fitFontSize(doc, text(column.label), column.w - 4, 5.8, 4.2)
      doc.text(text(column.label), spot.x + offsets[index] + 2, spot.y + 2.6,
        { width: column.w - 4, align: column.align || 'left', lineBreak: false })
    })
  }

  header()
  let striped = 0
  for (const row of rows) {
    if (flow.willBreak(rowHeight)) { header(); striped = 0 }
    const spot = flow.place(rowHeight)
    if (striped % 2 === 1) doc.rect(spot.x, spot.y, width, rowHeight).fill(ZEBRA)
    striped += 1
    laid.forEach((column, index) => {
      const cell = column.cell(row) || {}
      const value = text(cell.value ?? '—')
      doc.font(cell.bold ? fonts.bold : fonts.regular).fillColor(cell.color || INK)
      const size = fitFontSize(doc, value, column.w - 4, 6.4, 4.2)
      doc.text(value, spot.x + offsets[index] + 2, spot.y + (rowHeight - size) / 2 - 0.3,
        { width: column.w - 4, align: column.align || 'left', lineBreak: false, ellipsis: true })
    })
  }
}

function extraBlockTitle(doc, fonts, flow, ctx, section) {
  flow.reserve(34)
  const spot = flow.place(13)
  doc.font(fonts.bold).fontSize(8).fillColor(BAND)
    .text(pdfText(SECTION_TITLES[section], fonts), spot.x, spot.y + 1, { width: spot.width, lineBreak: false })
  markTarget(doc, `sec-${section}`, spot.x, Math.max(0, spot.y - 8))
  const parent = ctx.extrasOutline
  if (parent?.addItem) parent.addItem(pdfText(SECTION_TITLES[section], fonts))
  doc.moveTo(spot.x, spot.y + 11.5).lineTo(spot.x + spot.width, spot.y + 11.5)
    .lineWidth(0.6).strokeColor(BAND).stroke()
  return spot
}

function extraNote(doc, fonts, flow, message) {
  const spot = flow.place(10)
  doc.font(fonts.regular).fontSize(6).fillColor(MUTED)
    .text(pdfText(message, fonts), spot.x + 2, spot.y + 1.5, { width: spot.width - 4, lineBreak: false, ellipsis: true })
}

// Blok yüksekliği kabaca: başlık + tablo başlığı + satırlar + dipnot.
function estimateExtraHeight(section, extras) {
  const table = count => 13 + 11 + count * 9.8 + 10
  if (section === 'deposit') return table((extras.deposit || []).filter(row => row.total_in || row.total_return).length || 1)
  if (section === 'adjustments') return table((extras.adjustments || []).length || 1)
  if (section === 'trucks') return table((extras.trucks || []).length || 1)
  if (section === 'counts') {
    return 13 + (extras.counts || []).reduce((sum, month) => sum + 11 + 11 + month.rows.length * 9.8, 0) + 10
  }
  if (section === 'checks') return 13 + (extras.checks || []).length * 13 + 10
  return 0
}

function drawExtrasSection(doc, fonts, ctx) {
  const report = ctx.report
  const extras = report.extras || {}
  const text = value => pdfText(value, fonts)
  const sections = EXTRA_SECTIONS.filter(section => report.sections.includes(section))
  // Hepsi tek sütuna sığıyorsa tam genişlik kullan (tablolar daha okunur);
  // sığmıyorsa iki sütuna dizip sayfa sayısını düşür.
  const estimated = sections.reduce((sum, section) => sum + estimateExtraHeight(section, extras), 0)
  const columns = estimated <= (doc.page.height - 46 - 26) ? 1 : 2
  // Hedefleri her blok kendisi koyar (sec-deposit, sec-trucks …); sayfa ayrı hedef almaz.
  const flow = columnFlow(doc, fonts, ctx, { title: EXTRAS_TITLE, columns, gap: 16, destination: null })
  ctx.extrasOutline = ctx.outline.children[ctx.outline.children.length - 1]

  for (const section of sections) {
    extraBlockTitle(doc, fonts, flow, ctx, section)

    if (section === 'deposit') {
      const rows = (extras.deposit || []).filter(row => row.total_in || row.total_return)
      if (!rows.length) { extraNote(doc, fonts, flow, 'İadeli ürün hareketi yok.'); continue }
      flowTable(doc, fonts, flow, {
        columns: [
          { label: 'ÜRÜN', flex: true, w: 0, cell: row => ({ value: row.name }) },
          { label: 'VERİLEN', w: 40, align: 'right', cell: row => ({ value: num(row.total_in) }) },
          { label: 'İADE', w: 38, align: 'right', cell: row => ({ value: num(row.total_return) }) },
          { label: 'DÖNEM', w: 38, align: 'right', cell: row => ({ value: num(row.period_return), color: GREEN }) },
          { label: 'SAHADA', w: 42, align: 'right', cell: row => ({ value: num(row.outstanding), bold: true, color: row.outstanding > 0 ? '#B45309' : INK }) },
        ],
        rows,
      })
      extraNote(doc, fonts, flow, 'Sahada = tüm zamanlar verilen − iade edilen (depozito riski).')
      continue
    }

    if (section === 'adjustments') {
      const rows = extras.adjustments || []
      if (!rows.length) { extraNote(doc, fonts, flow, 'Bu aralıkta stok düzeltmesi yok.'); continue }
      flowTable(doc, fonts, flow, {
        columns: [
          { label: 'TARİH', w: 34, cell: row => ({ value: trDate(row.move_date).slice(0, 5) }) },
          { label: 'ÜRÜN', flex: true, w: 0, cell: row => ({ value: row.product_name }) },
          { label: 'MİKTAR', w: 40, align: 'right', cell: row => ({ value: signed(row.signed_base), bold: true, color: row.signed_base < 0 ? RED : GREEN }) },
          { label: 'SEBEP', w: 58, cell: row => ({ value: row.reason_label, color: MUTED }) },
        ],
        rows,
      })
      const net = rows.reduce((sum, row) => sum + row.signed_base, 0)
      extraNote(doc, fonts, flow, `${rows.length} düzeltme · net ${signed(net)}`)
      continue
    }

    if (section === 'trucks') {
      const rows = extras.trucks || []
      if (!rows.length) { extraNote(doc, fonts, flow, 'Bu aralıkta tır kaydı yok.'); continue }
      flowTable(doc, fonts, flow, {
        columns: [
          { label: 'TARİH', w: 34, cell: row => ({ value: trDate(row.arrival_date).slice(0, 5) }) },
          { label: 'PLAKA', w: 46, cell: row => ({ value: row.plate }) },
          { label: 'TEDARİKÇİ / MARKA', flex: true, w: 0, cell: row => ({ value: row.supplier_name || row.brand_name || '—' }) },
          { label: 'SAAT', w: 40, cell: row => ({ value: row.window, color: MUTED }) },
          { label: 'DURUM', w: 44, align: 'right', cell: row => ({ value: row.status_label, color: row.status === 'cancelled' ? RED : MUTED }) },
        ],
        rows,
      })
      const mailed = rows.filter(row => row.mail_sent).length
      extraNote(doc, fonts, flow, `${rows.length} tır · ${mailed} tanesinde giriş maili gönderildi`)
      continue
    }

    if (section === 'counts') {
      const months = extras.counts || []
      if (!months.length) { extraNote(doc, fonts, flow, 'Aralıkta kapanış veya sayım kaydı yok.'); continue }
      for (const month of months) {
        const head = flow.place(11)
        doc.font(fonts.bold).fontSize(7).fillColor(INK)
          .text(text(`${month.month}${month.locked ? '  🔒 kilitli' : '  açık'}`), head.x + 2, head.y + 1.5,
            { width: head.width - 4, lineBreak: false })
        doc.font(fonts.regular).fillColor(MUTED)
        const meta = text(`${month.rows.length} sayım · ${month.mismatch} fark · ${month.pending} bekliyor`)
        fitFontSize(doc, meta, head.width - 4, 6, 4.2)
        doc.text(meta, head.x, head.y + 2.4, { width: head.width - 4, align: 'right', lineBreak: false })
        if (!month.rows.length) { extraNote(doc, fonts, flow, 'Sayım kaydı yok.'); continue }
        flowTable(doc, fonts, flow, {
          columns: [
            { label: 'ÜRÜN', flex: true, w: 0, cell: row => ({ value: row.product_name }) },
            { label: 'SİSTEM', w: 40, align: 'right', cell: row => ({ value: num(row.system_base) }) },
            { label: 'SAYIM', w: 40, align: 'right', cell: row => ({ value: num(row.counted_base) }) },
            { label: 'FARK', w: 38, align: 'right', cell: row => ({ value: signed(row.diff_base), bold: true, color: row.diff_base ? (row.diff_base < 0 ? RED : '#B45309') : GREEN }) },
            { label: 'SEBEP', w: 52, cell: row => ({ value: row.diff_base ? row.reason_label : '—', color: MUTED }) },
          ],
          rows: month.rows,
        })
      }
      continue
    }

    if (section === 'checks') {
      const checks = extras.checks || []
      for (const check of checks) {
        const spot = flow.place(13)
        const color = check.level === 'error' ? RED : check.level === 'warn' ? '#B45309' : GREEN
        doc.circle(spot.x + 4, spot.y + 4.6, 2.2).fill(color)
        doc.font(fonts.bold).fontSize(6.6).fillColor(INK)
          .text(text(check.label), spot.x + 10, spot.y + 1, { width: spot.width - 12, lineBreak: false, ellipsis: true })
        doc.font(fonts.regular).fillColor(MUTED)
        fitFontSize(doc, text(check.detail), spot.width - 12, 5.8, 4.2)
        doc.text(text(check.detail), spot.x + 10, spot.y + 7.4, { width: spot.width - 12, lineBreak: false, ellipsis: true })
      }
      extraNote(doc, fonts, flow, 'Yeşil: sorun yok · Turuncu: dikkat · Kırmızı: rapor öncesi düzeltilmeli.')
      continue
    }
  }
}

const SECTION_RENDERERS = {
  ledger: drawLedgerSection,
  matrix: drawMatrixSection,
  days: drawDaysSection,
  zones: drawZonesSection,
  intakes: drawIntakesSection,
  photos: drawPhotosSection,
}

export function writeAccountingReportPDF(report, doc) {
  const fonts = registerTurkishFonts(doc, 'Rpt')
  doc.info.Title = `Su Takip Muhasebe Raporu ${report.from} - ${report.to}`
  doc.info.Author = 'Şantiye Yatakhane Yönetim Sistemi'

  const ctx = { report, fonts, pageNo: 1, outline: doc.outline, currentSection: null }
  drawSummaryPage(doc, fonts, ctx)
  const activeSections = renderableSections(report)
  const bigSections = activeSections.filter(section => SECTION_RENDERERS[section])
  const extraSections = EXTRA_SECTIONS.filter(section => activeSections.includes(section))
  if (bigSections.length || extraSections.length) {
    ctx.outline.addItem(pdfText('ÖZET', fonts))
    doc.font(fonts.regular).fontSize(6).fillColor('#94A3B8')
      .text(pdfText('Sayfa 1', fonts), doc.page.margins.left, doc.page.height - 20,
        { width: doc.page.width - doc.page.margins.left * 2, align: 'right', lineBreak: false })
  }

  for (const section of bigSections) {
    if (section === 'photos') {
      if (!report.photos?.items?.length) continue
    } else if (section === 'ledger') {
      if (!report.ledger?.days?.length) continue
    } else {
      if (section !== 'intakes' && !report.detail) continue
      if (section === 'days' && !report.detail?.days?.length) continue
      if ((section === 'matrix' || section === 'zones') && !report.detail?.rows?.length) continue
    }
    ctx.currentSection = section
    SECTION_RENDERERS[section](doc, fonts, ctx)
  }

  if (extraSections.length) {
    ctx.currentSection = extraSections[0]
    drawExtrasSection(doc, fonts, ctx)
  }

  doc.end()
  return report
}
