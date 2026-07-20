// Muhasebe raporu: seçili aralığın gün gün gelen/dağıtılan dökümü + ürün, yer ve
// irsaliye kırılımı — tek A4 sayfaya sığacak şekilde.
import * as q from './queries.js'
import { humanize } from './units.js'
import { isIsoDate } from '../../shared/validation/date.js'
import { registerTurkishFonts, pdfText } from '../../shared/pdf/fonts.js'

const badRequest = message => Object.assign(new Error(message), { statusCode: 400 })

const MAX_RANGE_DAYS = 400
// Tek sayfada okunur kalan gün satırı sayısı — üstüne çıkınca aylık gruplanır.
const DAILY_ROW_LIMIT = 34
const ZONE_ROW_LIMIT = 12
const INTAKE_ROW_LIMIT = 10
const PRODUCT_ROW_LIMIT = 12

const WEEKDAYS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

const utc = iso => {
  const [year, month, day] = iso.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}
const dayDiff = (from, to) => Math.round((utc(to) - utc(from)) / 86400000)
const isoAdd = (iso, days) => new Date(utc(iso) + days * 86400000).toISOString().slice(0, 10)

function dayKeys(from, to) {
  const keys = []
  for (let index = 0; index <= dayDiff(from, to); index += 1) keys.push(isoAdd(from, index))
  return keys
}

function monthKeys(from, to) {
  const keys = []
  const end = to.slice(0, 7)
  let [year, month] = from.split('-').map(Number)
  for (;;) {
    const key = `${year}-${String(month).padStart(2, '0')}`
    keys.push(key)
    if (key >= end) break
    month += 1
    if (month > 12) { month = 1; year += 1 }
  }
  return keys
}

const dayLabel = iso => `${iso.slice(8, 10)}.${iso.slice(5, 7)} ${WEEKDAYS[new Date(utc(iso)).getUTCDay()]}`
const monthLabel = key => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`
export const trDate = iso => (isIsoDate(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '—')

export function accountingReportService({ from, to } = {}) {
  if (!isIsoDate(from) || !isIsoDate(to)) throw badRequest('Tarih aralığı YYYY-AA-GG formatında olmalı')
  if (from > to) throw badRequest('Başlangıç tarihi bitiş tarihinden sonra olamaz')
  const dayCount = dayDiff(from, to) + 1
  if (dayCount > MAX_RANGE_DAYS) throw badRequest(`Rapor aralığı en fazla ${MAX_RANGE_DAYS} gün olabilir`)

  const openingByProduct = new Map(q.openingBalances(from).map(row => [row.id, row.opening_base]))
  const adjustByProduct = new Map(q.adjustmentFlow({ from, to }).map(row => [row.product_id, row.adjust_base]))

  const allProducts = q.productFlow({ from, to }).map(product => {
    const openingBase = openingByProduct.get(product.id) || 0
    const periodIn = product.period_in || 0
    const periodOut = product.period_out || 0
    const adjustBase = adjustByProduct.get(product.id) || 0
    const closingBase = openingBase + periodIn - periodOut + adjustBase
    return {
      product_id: product.id,
      name: product.name,
      unit_label: product.unit_label,
      brand_name: product.brand_name || null,
      opening_base: openingBase,
      period_in: periodIn,
      period_out: periodOut,
      adjust_base: adjustBase,
      closing_base: closingBase,
      opening_human: humanize(product, openingBase),
      in_human: humanize(product, periodIn),
      out_human: humanize(product, periodOut),
      adjust_human: adjustBase ? humanize(product, adjustBase) : null,
      closing_human: humanize(product, closingBase),
    }
  })
  // Hiç hareketi ve devri olmayan ürünler muhasebe çıktısını şişirmesin.
  const moved = allProducts.filter(row =>
    row.opening_base || row.period_in || row.period_out || row.adjust_base || row.closing_base)
  const products = moved.length ? moved : allProducts

  const grouped = dayCount > DAILY_ROW_LIMIT
  const series = new Map((grouped ? q.monthlySeries({ from, to }) : q.dailySeries({ from, to }))
    .map(row => [row.move_date, row]))
  const adjustSeries = new Map()
  for (const adjustment of q.listAdjustments({ from, to, limit: 5000 })) {
    const key = grouped ? adjustment.move_date.slice(0, 7) : adjustment.move_date
    const signed = adjustment.direction === 'in' ? adjustment.qty_base : -adjustment.qty_base
    adjustSeries.set(key, (adjustSeries.get(key) || 0) + signed)
  }

  const openingTotal = products.reduce((sum, row) => sum + row.opening_base, 0)
  let running = openingTotal
  const daily = (grouped ? monthKeys(from, to) : dayKeys(from, to)).map(key => {
    const row = series.get(key) || {}
    const inBase = row.in_base || 0
    const outBase = row.out_base || 0
    const adjustBase = adjustSeries.get(key) || 0
    running += inBase - outBase + adjustBase
    return {
      key,
      label: grouped ? monthLabel(key) : dayLabel(key),
      in_base: inBase,
      out_base: outBase,
      adjust_base: adjustBase,
      net_base: inBase - outBase + adjustBase,
      balance_base: running,
      empty: !inBase && !outBase && !adjustBase,
    }
  })

  const zoneMap = new Map()
  for (const row of q.zoneTotals({ from, to })) {
    const current = zoneMap.get(row.id) || { zone_id: row.id, zone_name: row.name, total_out: 0, products: 0 }
    current.total_out += row.total_out || 0
    current.products += 1
    zoneMap.set(row.id, current)
  }
  const zones = [...zoneMap.values()].sort((left, right) => right.total_out - left.total_out)

  const intakes = q.listMovements({ type: 'in', from, to, limit: 500 })
    .map(row => ({
      id: row.id,
      move_date: row.move_date,
      waybill_no: row.waybill_no || null,
      product_name: row.product_name,
      qty_base: row.qty_base,
      qty_human: humanize(row, row.qty_base),
    }))
    .sort((left, right) => (left.move_date === right.move_date ? left.id - right.id : left.move_date < right.move_date ? -1 : 1))

  const deposit = q.depositBalances({ from, to })
  const trucks = q.listTruckArrivals({ from, to, limit: 500 })
  const lockedMonths = monthKeys(from, to).filter(month => q.getClosure(month)?.is_locked)

  const totals = {
    opening: openingTotal,
    period_in: products.reduce((sum, row) => sum + row.period_in, 0),
    period_out: products.reduce((sum, row) => sum + row.period_out, 0),
    period_adjust: products.reduce((sum, row) => sum + row.adjust_base, 0),
    closing: products.reduce((sum, row) => sum + row.closing_base, 0),
    period_return: deposit.reduce((sum, row) => sum + (row.period_return || 0), 0),
    outstanding: deposit.reduce((sum, row) => sum + ((row.total_in || 0) - (row.total_return || 0)), 0),
    active_days: daily.filter(row => !row.empty).length,
    zone_count: zones.length,
    intake_count: intakes.length,
    truck_count: trucks.length,
    negative_count: products.filter(row => row.closing_base < 0).length,
    review_count: q.reviewQueue().length,
  }

  return { from, to, day_count: dayCount, grouped, daily, products, zones, intakes, totals, locked_months: lockedMonths }
}

// ── PDF ──

const INK = '#0F172A'
const MUTED = '#64748B'
const LINE = '#CBD5E1'
const BAND = '#0E7490'
const ZEBRA = '#F1F5F9'

const nf = new Intl.NumberFormat('tr-TR')
const num = value => nf.format(Math.round(value || 0))
const signed = value => (value > 0 ? `+${num(value)}` : num(value))

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
  doc.font(fonts.bold).fontSize(6.6).fillColor('#334155')
  for (const column of columns) {
    doc.text(text(column.label), columnX + 3, cursor + 3.6, { width: column.width - 6, align: column.align || 'left' })
    columnX += column.width
  }
  cursor += 13

  doc.fontSize(7).font(fonts.regular)
  rows.forEach((row, index) => {
    if (index % 2 === 1) doc.rect(x, cursor, width, rowHeight).fill(ZEBRA)
    columnX = x
    for (const column of columns) {
      const cell = column.cell(row)
      doc.font(cell?.bold ? fonts.bold : fonts.regular).fillColor(cell?.color || INK)
        .text(text(cell?.value ?? '—'), columnX + 3, cursor + 3.2, {
          width: column.width - 6,
          align: column.align || 'left',
          ellipsis: true,
          lineBreak: false,
        })
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

export function writeAccountingReportPDF(report, doc) {
  const fonts = registerTurkishFonts(doc, 'Rpt')
  const text = value => pdfText(value, fonts)
  const margin = 28
  const pageWidth = doc.page.width
  const pageHeight = doc.page.height
  const innerWidth = pageWidth - margin * 2
  const { totals } = report

  doc.info.Title = `Su Takip Muhasebe Raporu ${report.from} - ${report.to}`
  doc.info.Author = 'Şantiye Yatakhane Yönetim Sistemi'
  // Alt bilgi satırı varsayılan alt boşluğun içine taşarsa pdfkit ikinci sayfa açar.
  doc.page.margins.bottom = 8

  // Başlık bandı
  doc.rect(0, 0, pageWidth, 62).fill(BAND)
  doc.font(fonts.bold).fontSize(16).fillColor('#FFFFFF')
    .text(text('SU TAKİP — MUHASEBE RAPORU'), margin, 14, { width: innerWidth })
  doc.font(fonts.regular).fontSize(9).fillColor('#CFFAFE')
    .text(text(`${trDate(report.from)} — ${trDate(report.to)}  ·  ${report.day_count} gün`), margin, 36, { width: innerWidth })
  doc.fontSize(7).fillColor('#A5F3FC')
    .text(text(`Oluşturma: ${new Date().toLocaleString('tr-TR')}`), margin, 38, { width: innerWidth, align: 'right' })

  // KPI kutuları
  const kpis = [
    { label: 'DEVİR (DÖNEM BAŞI)', value: num(totals.opening) },
    { label: 'GELEN', value: num(totals.period_in), color: '#15803D' },
    { label: 'DAĞITILAN', value: num(totals.period_out), color: '#B91C1C' },
    { label: 'BOŞ DAMACANA İADE', value: num(totals.period_return) },
    { label: 'KAPANIŞ STOKU', value: num(totals.closing), color: totals.closing < 0 ? '#B91C1C' : BAND },
  ]
  const gap = 7
  const kpiWidth = (innerWidth - gap * (kpis.length - 1)) / kpis.length
  kpis.forEach((kpi, index) => {
    const x = margin + index * (kpiWidth + gap)
    doc.roundedRect(x, 74, kpiWidth, 44, 3).lineWidth(0.7).strokeColor(LINE).stroke()
    doc.font(fonts.bold).fontSize(5.8).fillColor(MUTED).text(text(kpi.label), x + 6, 81, { width: kpiWidth - 12 })
    doc.font(fonts.bold).fontSize(15).fillColor(kpi.color || INK).text(text(kpi.value), x + 6, 93, { width: kpiWidth - 12 })
  })
  doc.font(fonts.regular).fontSize(6).fillColor(MUTED).text(
    text(`Hareketli gün: ${totals.active_days}  ·  İrsaliye: ${totals.intake_count}  ·  Tır: ${totals.truck_count}  ·  Dağıtım yeri: ${totals.zone_count}`
      + `  ·  Eksi stoklu ürün: ${totals.negative_count}  ·  İnceleme kuyruğu: ${totals.review_count}`
      + (report.locked_months.length ? `  ·  Kilitli ay: ${report.locked_months.join(', ')}` : '')),
    margin, 122, { width: innerWidth },
  )

  const top = 136
  const columnGap = 12
  const leftWidth = 268
  const rightWidth = innerWidth - leftWidth - columnGap
  const rightX = margin + leftWidth + columnGap
  const hasAdjust = report.daily.some(row => row.adjust_base !== 0)

  // Sol sütun — gün gün hareket
  const dailyColumns = hasAdjust
    ? [
      { label: report.grouped ? 'AY' : 'TARİH', width: 72, cell: row => ({ value: row.label, color: row.empty ? '#94A3B8' : INK }) },
      { label: 'GELEN', width: 48, align: 'right', cell: row => ({ value: row.in_base ? num(row.in_base) : '·', color: row.in_base ? '#15803D' : '#CBD5E1' }) },
      { label: 'DAĞITILAN', width: 55, align: 'right', cell: row => ({ value: row.out_base ? num(row.out_base) : '·', color: row.out_base ? '#B91C1C' : '#CBD5E1' }) },
      { label: 'DÜZELTME', width: 47, align: 'right', cell: row => ({ value: row.adjust_base ? signed(row.adjust_base) : '·', color: row.adjust_base ? '#B45309' : '#CBD5E1' }) },
      { label: 'KALAN', width: 46, align: 'right', cell: row => ({ value: num(row.balance_base), bold: true, color: row.balance_base < 0 ? '#B91C1C' : INK }) },
    ]
    : [
      { label: report.grouped ? 'AY' : 'TARİH', width: 84, cell: row => ({ value: row.label, color: row.empty ? '#94A3B8' : INK }) },
      { label: 'GELEN', width: 60, align: 'right', cell: row => ({ value: row.in_base ? num(row.in_base) : '·', color: row.in_base ? '#15803D' : '#CBD5E1' }) },
      { label: 'DAĞITILAN', width: 64, align: 'right', cell: row => ({ value: row.out_base ? num(row.out_base) : '·', color: row.out_base ? '#B91C1C' : '#CBD5E1' }) },
      { label: 'KALAN', width: 60, align: 'right', cell: row => ({ value: num(row.balance_base), bold: true, color: row.balance_base < 0 ? '#B91C1C' : INK }) },
    ]
  const dailyRows = [...report.daily, {
    label: 'TOPLAM',
    in_base: totals.period_in,
    out_base: totals.period_out,
    adjust_base: totals.period_adjust,
    balance_base: totals.closing,
    total: true,
  }]
  const leftY = drawTable(doc, fonts, {
    x: margin, y: top, width: leftWidth, columns: dailyColumns, rows: dailyRows,
    title: report.grouped ? 'AY AY HAREKET' : 'GÜN GÜN HAREKET',
    note: 'Kalan sütunu devirden başlayan yürüyen bakiyedir.',
  })

  // Sağ sütun — ürün kırılımı
  let rightY = drawTable(doc, fonts, {
    x: rightX, y: top, width: rightWidth, title: 'ÜRÜN BAZINDA',
    columns: [
      { label: 'ÜRÜN', width: rightWidth - 176, cell: row => ({ value: row.name }) },
      { label: 'DEVİR', width: 42, align: 'right', cell: row => ({ value: num(row.opening_base) }) },
      { label: 'GELEN', width: 42, align: 'right', cell: row => ({ value: num(row.period_in), color: '#15803D' }) },
      { label: 'DAĞITILAN', width: 46, align: 'right', cell: row => ({ value: num(row.period_out), color: '#B91C1C' }) },
      { label: 'KALAN', width: 46, align: 'right', cell: row => ({ value: num(row.closing_base), bold: true, color: row.closing_base < 0 ? '#B91C1C' : INK }) },
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
      ? `En çok dağıtılan ${ZONE_ROW_LIMIT} yer gösterildi (toplam ${report.zones.length}).`
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
      ? `İlk ${INTAKE_ROW_LIMIT} giriş gösterildi (toplam ${report.intakes.length}).`
      : (report.intakes.length ? null : 'Bu aralıkta giriş kaydı yok.'),
  })

  // Alt bilgi + imza
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

  doc.end()
  return report
}
