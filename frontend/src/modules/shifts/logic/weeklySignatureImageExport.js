const PAGE_WIDTH = 1400
const PAGE_HEIGHT = 990
const PAGE_MARGIN = 34
const WEEKDAYS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']

const STATUS_COLORS = {
  working: '#f0fdf4',
  off: '#f5f3ff',
  annual: '#f0fdfa',
  other_leave: '#f0fdfa',
  report: '#fff7ed',
  absent: '#fef2f2',
  unplanned: '#f8fafc',
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || min))
}

function slug(value) {
  return String(value || 'departman')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i').replace(/İ/g, 'I')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').toLowerCase() || 'departman'
}

function revisionSuffix(revision) {
  const clean = String(revision || '').trim().replace(/[^a-zA-Z0-9_-]/g, '')
  return clean ? `-r${clean}` : ''
}

export function weeklySignatureImageFilename(weekStart, revision, pageCount = 1) {
  const ext = Number(pageCount) > 1 ? 'zip' : 'png'
  const plural = Number(pageCount) > 1 ? 'foyleri' : 'foyu'
  return `haftalik-imza-${plural}-${weekStart || 'hafta'}${revisionSuffix(revision)}.${ext}`
}

export function weeklySignaturePageFilename(page, index = 0) {
  const sequence = String(index + 1).padStart(2, '0')
  const pageSuffix = page.page_count > 1 ? `-sayfa-${page.page}` : ''
  return `${sequence}-${slug(page.department)}${pageSuffix}.png`
}

function fitText(ctx, value, maxWidth) {
  const text = String(value ?? '')
  if (ctx.measureText(text).width <= maxWidth) return text
  let result = text
  while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) result = result.slice(0, -1)
  return `${result}…`
}

function line(ctx, x1, y1, x2, y2, color = '#94a3b8', width = 1) {
  ctx.beginPath()
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
}

function rect(ctx, x, y, width, height, fill = '#ffffff', stroke = '#64748b', strokeWidth = 1.5) {
  ctx.fillStyle = fill
  ctx.fillRect(x, y, width, height)
  ctx.strokeStyle = stroke
  ctx.lineWidth = strokeWidth
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1)
}

function dateLabel(value) {
  const date = new Date(`${value}T00:00:00`)
  const day = Number.isNaN(date.getTime()) ? '' : WEEKDAYS[date.getDay()]
  return { day, date: String(value || '').slice(5).split('-').reverse().join('.') }
}

export function computeWeeklySignatureImageLayout(model, page) {
  const showRole = model.opts.showLocationAndRole !== false
  const showDepartmentBands = !!page.combined && model.opts.showDepartmentBands !== false
  const departmentBandCount = showDepartmentBands
    ? page.rows.reduce((count, row, index) => count + (index === 0 || row.department !== page.rows[index - 1].department ? 1 : 0), 0)
    : 0
  const dateCount = Math.max(1, model.dates.length)
  const blankRows = page.show_blank_rows ? clamp(model.opts.blankRows, 0, 6) : 0
  const noWidth = 38
  const personWidth = 210
  const roleWidth = showRole ? 126 : 0
  const tableWidth = PAGE_WIDTH - PAGE_MARGIN * 2
  const dayWidth = (tableWidth - noWidth - personWidth - roleWidth) / dateCount
  const headerTop = 30
  const tableTop = 112
  const tableHeaderHeight = 48
  const changeHeight = blankRows ? 30 + blankRows * 29 : 0
  const footerHeight = 58
  const departmentBandHeight = page.rows.length >= 25 ? 16 : 22
  const availableRowsHeight = PAGE_HEIGHT - PAGE_MARGIN - tableTop - tableHeaderHeight - changeHeight - footerHeight - departmentBandCount * departmentBandHeight
  const minimumRowHeight = page.rows.length >= 25 ? 20 : page.rows.length >= 18 ? 27 : 38
  const rowHeight = Math.min(56, Math.max(minimumRowHeight, Math.floor(availableRowsHeight / Math.max(1, page.rows.length))))
  return {
    width: PAGE_WIDTH, height: PAGE_HEIGHT, margin: PAGE_MARGIN, showRole, showDepartmentBands,
    noWidth, personWidth, roleWidth, dayWidth, tableWidth, headerTop,
    tableTop, tableHeaderHeight, rowHeight, blankRows, changeHeight, footerHeight,
    departmentBandCount, departmentBandHeight,
  }
}

function drawHeader(ctx, model, page, meta, layout) {
  const { margin, headerTop } = layout
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillStyle = '#0f172a'
  ctx.font = '900 25px Arial'
  ctx.fillText('HAFTALIK PERSONEL İMZA FÖYÜ', margin, headerTop + 13)
  ctx.fillStyle = '#2563eb'
  ctx.fillRect(margin, headerTop + 35, 90, 4)
  ctx.fillStyle = '#334155'
  ctx.font = '800 13px Arial'
  ctx.fillText(`${page.department} · ${meta.weekLabel || model.dates.join(' - ')} · ${page.rows.length} personel`, margin, headerTop + 57)

  ctx.textAlign = 'right'
  ctx.fillStyle = '#475569'
  ctx.font = '700 11px Arial'
  ctx.fillText(`Revizyon: ${meta.revision || '1'}`, PAGE_WIDTH - margin, headerTop + 9)
  ctx.fillText(`Sayfa: ${page.page}/${page.page_count}`, PAGE_WIDTH - margin, headerTop + 28)
  if (meta.generated) ctx.fillText(`Oluşturma: ${meta.generated}`, PAGE_WIDTH - margin, headerTop + 47)
  line(ctx, margin, headerTop + 72, PAGE_WIDTH - margin, headerTop + 72, '#2563eb', 2)
}

function drawTableHeader(ctx, model, layout) {
  const { margin, tableTop, tableHeaderHeight, noWidth, personWidth, roleWidth, dayWidth, showRole } = layout
  let x = margin
  const headerCell = (width, primary, secondary = '') => {
    rect(ctx, x, tableTop, width, tableHeaderHeight, '#e2e8f0')
    ctx.textAlign = 'center'
    ctx.fillStyle = '#0f172a'
    ctx.font = '900 10px Arial'
    ctx.fillText(primary, x + width / 2, tableTop + (secondary ? 17 : tableHeaderHeight / 2))
    if (secondary) {
      ctx.fillStyle = '#475569'
      ctx.font = '700 9px Arial'
      ctx.fillText(secondary, x + width / 2, tableTop + 34)
    }
    x += width
  }
  headerCell(noWidth, 'NO')
  headerCell(personWidth, 'PERSONEL')
  if (showRole) headerCell(roleWidth, 'GÖREV')
  model.dates.forEach(date => {
    const label = dateLabel(date)
    headerCell(dayWidth, label.day, label.date)
  })
}

function drawDayCell(ctx, day, x, y, width, height, doubleSignature) {
  const economy = height < 30
  rect(ctx, x, y, width, height, STATUS_COLORS[day.category] || '#ffffff')
  ctx.textAlign = 'center'
  ctx.fillStyle = '#0f172a'
  ctx.font = `900 ${economy ? 7.5 : 10}px Arial`
  ctx.fillText(fitText(ctx, day.label, width - 10), x + width / 2, y + (economy ? 7 : 13))
  if (day.detail && !economy) {
    ctx.fillStyle = '#64748b'
    ctx.font = '700 8px Arial'
    ctx.fillText(fitText(ctx, day.detail, width - 10), x + width / 2, y + 27)
  }
  if (day.can_sign) {
    const firstY = economy ? y + height - 5 : (doubleSignature ? y + height - 18 : y + height - 13)
    ctx.textAlign = 'left'
    ctx.fillStyle = '#94a3b8'
    ctx.font = `700 ${economy ? 5 : 7}px Arial`
    if (doubleSignature) {
      line(ctx, x + 8, firstY, x + width / 2 - 4, firstY, '#64748b')
      line(ctx, x + width / 2 + 4, firstY, x + width - 8, firstY, '#64748b')
      ctx.fillText('Giriş', x + 9, firstY - 5)
      ctx.fillText('Çıkış', x + width / 2 + 5, firstY - 5)
    } else {
      line(ctx, x + 8, firstY, x + width - 8, firstY, '#64748b')
      ctx.fillText('İmza', x + 9, firstY - 5)
    }
  } else {
    ctx.fillStyle = '#94a3b8'
    ctx.font = `italic 700 ${economy ? 5 : 7}px Arial`
    ctx.fillText('İmza aranmaz', x + width / 2, y + height - (economy ? 5 : 10))
  }
}

function drawPeopleRows(ctx, model, page, layout) {
  const { margin, tableTop, tableHeaderHeight, rowHeight, noWidth, personWidth, roleWidth, dayWidth, showRole, showDepartmentBands, departmentBandHeight, tableWidth } = layout
  let y = tableTop + tableHeaderHeight
  let previousDepartment = ''
  page.rows.forEach((row, index) => {
    if (showDepartmentBands && row.department !== previousDepartment) {
      rect(ctx, margin, y, tableWidth, departmentBandHeight, '#dbeafe', '#475569', 2)
      ctx.textAlign = 'left'; ctx.fillStyle = '#1e3a8a'; ctx.font = `900 ${rowHeight < 30 ? 8 : 10}px Arial`
      ctx.fillText(row.department, margin + 8, y + departmentBandHeight / 2)
      y += departmentBandHeight
    }
    previousDepartment = row.department
    let x = margin
    rect(ctx, x, y, noWidth, rowHeight)
    ctx.textAlign = 'center'; ctx.fillStyle = '#334155'; ctx.font = '800 10px Arial'
    ctx.fillText(String(page.row_offset + index + 1), x + noWidth / 2, y + rowHeight / 2)
    x += noWidth

    rect(ctx, x, y, personWidth, rowHeight)
    ctx.textAlign = 'left'; ctx.fillStyle = '#0f172a'; ctx.font = `900 ${rowHeight < 30 ? 8 : 11}px Arial`
    ctx.fillText(fitText(ctx, row.full_name, personWidth - 14), x + 7, y + rowHeight / 2)
    x += personWidth

    if (showRole) {
      rect(ctx, x, y, roleWidth, rowHeight)
      ctx.fillStyle = '#475569'; ctx.font = `700 ${rowHeight < 30 ? 7 : 9}px Arial`
      ctx.fillText(fitText(ctx, row.role || '-', roleWidth - 12), x + 6, y + rowHeight / 2)
      x += roleWidth
    }
    row.days.forEach(day => {
      drawDayCell(ctx, day, x, y, dayWidth, rowHeight, model.opts.doubleSignature)
      x += dayWidth
    })
    line(ctx, margin, y + rowHeight - 0.75, margin + tableWidth, y + rowHeight - 0.75, '#475569', 1.75)
    line(ctx, margin + noWidth + personWidth + roleWidth, y, margin + noWidth + personWidth + roleWidth, y + rowHeight, '#475569', 2)
    y += rowHeight
  })
  return y
}

function drawChangeRows(ctx, y, layout) {
  if (!layout.blankRows) return y
  const { margin, tableWidth, blankRows } = layout
  ctx.textAlign = 'left'; ctx.fillStyle = '#0f172a'; ctx.font = '900 10px Arial'
  ctx.fillText('SONRADAN EKLENEN / VARDİYASI DEĞİŞEN PERSONEL', margin, y + 15)
  y += 30
  const widths = [38, 245, 115, 245, 245, tableWidth - 888]
  const heads = ['NO', 'PERSONEL', 'TARİH', 'ÖNCEKİ DURUM', 'YENİ DURUM', 'PERSONEL / AMİR İMZASI']
  let x = margin
  widths.forEach((width, index) => {
    rect(ctx, x, y, width, 26, '#f1f5f9')
    ctx.textAlign = 'center'; ctx.fillStyle = '#334155'; ctx.font = '900 8px Arial'
    ctx.fillText(heads[index], x + width / 2, y + 13)
    x += width
  })
  y += 26
  for (let row = 0; row < blankRows; row += 1) {
    x = margin
    widths.forEach((width, index) => {
      rect(ctx, x, y, width, 29)
      if (index === 0) {
        ctx.textAlign = 'center'; ctx.fillStyle = '#64748b'; ctx.font = '700 9px Arial'
        ctx.fillText(String(row + 1), x + width / 2, y + 14)
      }
      x += width
    })
    y += 29
  }
  return y
}

function drawFooter(ctx, y, layout) {
  const { margin, tableWidth } = layout
  const gap = 40
  const width = (tableWidth - gap) / 2
  const lineY = Math.min(PAGE_HEIGHT - 30, y + 35)
  line(ctx, margin, lineY, margin + width, lineY, '#475569')
  line(ctx, margin + width + gap, lineY, PAGE_WIDTH - margin, lineY, '#475569')
  ctx.fillStyle = '#475569'; ctx.font = '700 9px Arial'; ctx.textAlign = 'center'
  ctx.fillText('Listeyi Hazırlayan / İmza', margin + width / 2, lineY + 12)
  ctx.fillText('Vardiya Amiri Kontrolü / İmza', margin + width + gap + width / 2, lineY + 12)
}

export function renderWeeklySignaturePageToCanvas(model, page, meta = {}, scale = 2) {
  const safeScale = clamp(scale, 1, 3)
  const layout = computeWeeklySignatureImageLayout(model, page)
  const canvas = document.createElement('canvas')
  canvas.width = layout.width * safeScale
  canvas.height = layout.height * safeScale
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas desteklenmiyor')
  ctx.scale(safeScale, safeScale)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, layout.width, layout.height)
  drawHeader(ctx, model, page, meta, layout)
  drawTableHeader(ctx, model, layout)
  const afterPeople = drawPeopleRows(ctx, model, page, layout)
  const afterChanges = drawChangeRows(ctx, afterPeople, layout)
  drawFooter(ctx, afterChanges, layout)
  return canvas
}

function canvasBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('İmza görseli oluşturulamadı'))), 'image/png')
  })
}

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function concatBytes(parts) {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  parts.forEach(part => { result.set(part, offset); offset += part.length })
  return result
}

function headerBytes(size, writer) {
  const bytes = new Uint8Array(size)
  writer(new DataView(bytes.buffer))
  return bytes
}

function dosDateTime(now = new Date()) {
  const year = Math.max(1980, now.getFullYear())
  return {
    time: (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate(),
  }
}

export function createStoredZip(files) {
  const encoder = new TextEncoder()
  const localParts = []
  const centralParts = []
  const stamp = dosDateTime()
  let offset = 0
  files.forEach(file => {
    const name = encoder.encode(file.name)
    const data = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data)
    const crc = crc32(data)
    const localHeader = headerBytes(30, view => {
      view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x0800, true)
      view.setUint16(8, 0, true); view.setUint16(10, stamp.time, true); view.setUint16(12, stamp.date, true)
      view.setUint32(14, crc, true); view.setUint32(18, data.length, true); view.setUint32(22, data.length, true)
      view.setUint16(26, name.length, true); view.setUint16(28, 0, true)
    })
    localParts.push(localHeader, name, data)
    const centralHeader = headerBytes(46, view => {
      view.setUint32(0, 0x02014b50, true); view.setUint16(4, 20, true); view.setUint16(6, 20, true)
      view.setUint16(8, 0x0800, true); view.setUint16(10, 0, true); view.setUint16(12, stamp.time, true); view.setUint16(14, stamp.date, true)
      view.setUint32(16, crc, true); view.setUint32(20, data.length, true); view.setUint32(24, data.length, true)
      view.setUint16(28, name.length, true); view.setUint16(30, 0, true); view.setUint16(32, 0, true)
      view.setUint16(34, 0, true); view.setUint16(36, 0, true); view.setUint32(38, 0, true); view.setUint32(42, offset, true)
    })
    centralParts.push(centralHeader, name)
    offset += localHeader.length + name.length + data.length
  })
  const locals = concatBytes(localParts)
  const central = concatBytes(centralParts)
  const end = headerBytes(22, view => {
    view.setUint32(0, 0x06054b50, true); view.setUint16(4, 0, true); view.setUint16(6, 0, true)
    view.setUint16(8, files.length, true); view.setUint16(10, files.length, true)
    view.setUint32(12, central.length, true); view.setUint32(16, locals.length, true); view.setUint16(20, 0, true)
  })
  return new Blob([locals, central, end], { type: 'application/zip' })
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  try {
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
  } finally {
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

export async function downloadWeeklySignatureImages(model, meta = {}, options = {}) {
  if (!model.dates.length) throw new Error('İmza görseli için en az bir gün seçin')
  if (!model.pages.length) throw new Error('İmza görseline eklenecek personel bulunamadı')
  const scale = clamp(options.scale, 1, 3)
  const files = []
  for (let index = 0; index < model.pages.length; index += 1) {
    const page = model.pages[index]
    const canvas = renderWeeklySignaturePageToCanvas(model, page, meta, scale)
    const blob = await canvasBlob(canvas)
    files.push({ name: weeklySignaturePageFilename(page, index), data: new Uint8Array(await blob.arrayBuffer()) })
  }
  const filename = weeklySignatureImageFilename(options.weekStart || model.dates[0], meta.revision, files.length)
  if (files.length === 1) triggerDownload(new Blob([files[0].data], { type: 'image/png' }), filename)
  else triggerDownload(createStoredZip(files), filename)
  return { filename, pageCount: files.length }
}
