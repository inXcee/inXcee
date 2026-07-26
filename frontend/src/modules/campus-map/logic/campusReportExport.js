// Kampüs durum ve yerleşim raporları. Satır üretimi saf tutulur; ExcelJS yalnız
// kullanıcı gerçekten Excel çıktısı istediğinde yüklenir.
import { buildAttentionQueue, buildOverviewRows } from './campusOverview.js'

const KIND_LABEL = {
  fault: 'ARIZA',
  full: 'DOLU',
  cleaning: 'TEMİZLİK',
  quarantine: 'KARANTİNA',
  maintenance: 'BAKIM',
}

const ROOM_STATUS = {
  active: 'Aktif',
  maintenance: 'Bakım',
  quarantine: 'Karantina',
}

export const DEFAULT_CAMPUS_REPORT_OPTIONS = {
  title: 'Kampüs Yerleşim Raporu',
  sections: {
    summary: true,
    rooms: true,
    people: true,
    companies: true,
    attention: false,
  },
  includeEmptyRooms: true,
  onlyActiveRooms: false,
  includeNotes: false,
  includeContact: false,
  peopleSort: 'room',
}

const normalizeReportOptions = options => ({
  ...DEFAULT_CAMPUS_REPORT_OPTIONS,
  ...options,
  sections: {
    ...DEFAULT_CAMPUS_REPORT_OPTIONS.sections,
    ...(options?.sections || {}),
  },
})

const compareText = (left, right) => String(left || '').localeCompare(String(right || ''), 'tr')

export function campusReportRows(stats) {
  const { rows, totals } = buildOverviewRows(stats)
  const overviewHeaders = [
    'BLOK', 'DOLULUK %', 'DOLU YATAK', 'TOPLAM YATAK', 'BOŞ ODA', 'DOLU ODA',
    'ARIZA', 'TEMİZLİK %', 'KARANTİNA', 'BAKIM',
  ]
  const overviewRows = rows.map(row => [
    row.block, row.occupancy_pct, row.occupied, row.total_beds, row.empty_rooms,
    row.full_rooms, row.open_faults, row.cleaning_total ? row.cleaning_pct : '',
    row.quarantine, row.maintenance,
  ])
  if (rows.length) {
    overviewRows.push([
      'TOPLAM', totals.occupancy_pct, totals.occupied, totals.total_beds, totals.empty_rooms,
      totals.full_rooms, totals.open_faults, totals.cleaning_pct, totals.quarantine, totals.maintenance,
    ])
  }

  const queue = buildAttentionQueue(stats)
  return {
    overview: { headers: overviewHeaders, rows: overviewRows },
    attention: {
      headers: ['BLOK', 'TÜR', 'DURUM'],
      rows: queue.map(item => [item.block, KIND_LABEL[item.kind] || item.kind, item.text]),
    },
  }
}

export function campusDetailedReportSections(stats, sourceRooms = [], rawOptions = {}) {
  const options = normalizeReportOptions(rawOptions)
  const base = campusReportRows(stats)
  const rooms = sourceRooms.filter(room => (
    (!options.onlyActiveRooms || room.status === 'active')
    && (options.includeEmptyRooms || Number(room.occupied || room.occupants?.length || 0) > 0)
  ))

  const roomHeaders = [
    'BLOK', 'ODA', 'KAT', 'DURUM', 'KİŞİ', 'AKTİF YATAK', 'KAPASİTE', 'BOŞ YATAK',
    ...(options.includeNotes ? ['ODA NOTU'] : []),
  ]
  const roomRows = rooms.map(room => {
    const occupied = Number(room.occupied ?? room.occupants?.length ?? 0)
    return [
      room.block, room.room_no, room.floor, ROOM_STATUS[room.status] || room.status,
      occupied, room.active_beds, room.capacity,
      Math.max(0, Number(room.active_beds || 0) - occupied),
      ...(options.includeNotes ? [room.notes || ''] : []),
    ]
  })

  const people = rooms.flatMap(room => (room.occupants || []).map(person => ({
    ...person,
    block: room.block,
    room_no: room.room_no,
    floor: room.floor,
  })))
  people.sort((left, right) => {
    if (options.peopleSort === 'name') return compareText(left.full_name, right.full_name)
    if (options.peopleSort === 'company') {
      return compareText(left.company, right.company) || compareText(left.full_name, right.full_name)
    }
    return compareText(left.block, right.block)
      || compareText(left.room_no, right.room_no)
      || Number(left.bed_no || 0) - Number(right.bed_no || 0)
      || compareText(left.full_name, right.full_name)
  })
  const peopleHeaders = [
    'BLOK', 'ODA', 'KAT', 'YATAK', 'AD SOYAD', 'FİRMA', 'GÖREV', 'DEPARTMAN',
    'KAMPÜSE GİRİŞ', 'ODAYA YERLEŞİM',
    ...(options.includeContact ? ['TELEFON'] : []),
  ]
  const peopleRows = people.map(person => [
    person.block, person.room_no, person.floor, person.bed_no ?? '',
    person.full_name, person.company || '', person.job_title || '', person.department_name || '',
    person.check_in_date || '', person.assigned_at || '',
    ...(options.includeContact ? [person.phone_number || ''] : []),
  ])

  const companyMap = new Map()
  for (const person of people) {
    const name = person.company || 'Firma belirtilmemiş'
    if (!companyMap.has(name)) companyMap.set(name, { people: 0, blocks: new Set(), rooms: new Set() })
    const company = companyMap.get(name)
    company.people += 1
    company.blocks.add(person.block)
    company.rooms.add(`${person.block}-${person.room_no}`)
  }
  const companyRows = Array.from(companyMap.entries())
    .sort((left, right) => right[1].people - left[1].people || compareText(left[0], right[0]))
    .map(([name, value]) => [
      name, value.people, value.blocks.size, value.rooms.size,
      Array.from(value.blocks).sort(compareText).join(', '),
    ])

  return {
    summary: base.overview,
    rooms: { headers: roomHeaders, rows: roomRows },
    people: { headers: peopleHeaders, rows: peopleRows },
    companies: {
      headers: ['FİRMA', 'KİŞİ SAYISI', 'BLOK SAYISI', 'ODA SAYISI', 'BLOKLAR'],
      rows: companyRows,
    },
    attention: base.attention,
    counts: {
      rooms: roomRows.length,
      people: peopleRows.length,
      companies: companyRows.length,
    },
  }
}

const selectedReportSections = (stats, rooms, rawOptions) => {
  const options = normalizeReportOptions(rawOptions)
  const sections = campusDetailedReportSections(stats, rooms, options)
  return {
    options,
    blocks: [
      options.sections.summary && ['Kampüs Özeti', sections.summary, 'FF0E7490', 1],
      options.sections.rooms && ['Odalar', sections.rooms, 'FF2563EB', 4],
      options.sections.people && ['Kişiler', sections.people, 'FF16A34A', 99],
      options.sections.companies && ['Firmalar', sections.companies, 'FF7C3AED', 1],
      options.sections.attention && ['Dikkat Gerekenler', sections.attention, 'FFB91C1C', 99],
    ].filter(Boolean),
  }
}

export async function exportCampusReportExcel(stats, date, config = {}) {
  const ExcelJS = (await import('exceljs')).default
  const { saveWorkbook } = await import('../../../shared/logic/excelKit.js')
  const legacyOptions = {
    title: 'Kampüs Durum Raporu',
    sections: { rooms: false, people: false, companies: false, attention: true },
  }
  const { options, blocks } = selectedReportSections(
    stats,
    config.rooms || [],
    config.options || legacyOptions,
  )
  const workbook = new ExcelJS.Workbook()

  const addSheet = (name, block, tabColor, numberFrom) => {
    const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 2 }] })
    sheet.properties.tabColor = { argb: tabColor }
    sheet.mergeCells(1, 1, 1, block.headers.length)
    sheet.getCell(1, 1).value = `${options.title.toLocaleUpperCase('tr-TR')} · ${date} · ${name}`
    sheet.getCell(1, 1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
    sheet.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }
    const header = sheet.addRow(block.headers)
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E7490' } }
    block.rows.forEach(row => sheet.addRow(row))
    if (name === 'Kampüs Özeti' && block.rows.length) {
      const totalRow = sheet.getRow(block.rows.length + 2)
      totalRow.font = { bold: true }
      totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE68A' } }
    }
    sheet.columns.forEach((column, index) => {
      const contentWidth = block.rows.reduce(
        (longest, row) => Math.max(longest, String(row[index] ?? '').length),
        String(block.headers[index] ?? '').length,
      )
      column.width = Math.min(42, Math.max(11, contentWidth + 3))
      if (index >= numberFrom) column.numFmt = '#,##0'
    })
    if (block.rows.length) {
      sheet.autoFilter = {
        from: { row: 2, column: 1 },
        to: { row: 2, column: block.headers.length },
      }
    }
    sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  }

  blocks.forEach(args => addSheet(...args))
  const buffer = await workbook.xlsx.writeBuffer()
  const scope = config.block ? `-${String(config.block).toLocaleLowerCase('tr-TR')}` : ''
  saveWorkbook(buffer, `kampus-yerlesim-raporu${scope}-${date}.xlsx`)
}

const escapeHtml = value => String(value ?? '').replace(/[&<>"]/g, ch => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]
))

const table = (block, emptyText) => (block.rows.length
  ? `<table>
      <thead><tr>${block.headers.map(header => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
      <tbody>${block.rows.map((row, index) => `<tr${index === block.rows.length - 1 && row[0] === 'TOPLAM' ? ' class="total"' : ''}>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>`
  : `<p class="empty">${escapeHtml(emptyText)}</p>`)

export function buildCampusReportHtml(stats, date, config = {}) {
  const legacyOptions = {
    title: 'Kampüs Durum Raporu',
    sections: { rooms: false, people: false, companies: false, attention: true },
  }
  const { options, blocks } = selectedReportSections(
    stats,
    config.rooms || [],
    config.options || legacyOptions,
  )
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${escapeHtml(options.title)} ${escapeHtml(date)}</title>
<style>
  body { font-family: Arial, sans-serif; color: #0f172a; margin: 20px; font-size: 10px; }
  h1 { font-size: 17px; margin: 0 0 2px; }
  h2 { font-size: 13px; margin: 18px 0 6px; border-bottom: 1px solid #cbd5e1; padding-bottom: 3px; }
  .sub { color: #475569; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #cbd5e1; padding: 4px 5px; text-align: center; }
  th { background: #0e7490; color: #fff; }
  th:first-child, td:first-child { text-align: left; }
  tr.total { background: #fef3c7; font-weight: 700; }
  .empty { color: #64748b; }
  .section { break-inside: avoid-page; }
  @media print { body { margin: 8mm; } h2 { page-break-after: avoid; } .section { break-inside: auto; } }
</style></head><body>
  <h1>${escapeHtml(options.title.toLocaleUpperCase('tr-TR'))}</h1>
  <div class="sub">${escapeHtml(date)}</div>
  ${blocks.map(([name, block]) => `<section class="section">
    <h2>${escapeHtml(name.toLocaleUpperCase('tr-TR'))}</h2>
    ${table(block, name === 'Dikkat Gerekenler' ? 'Aksiyon bekleyen yok.' : `${name} için kayıt yok.`)}
  </section>`).join('')}
</body></html>`
}

export function openCampusReportPrint(stats, date, config = {}) {
  const win = window.open('', '_blank', 'width=1100,height=800')
  if (!win) throw new Error('Yazdırma penceresi açılamadı')
  win.document.open()
  win.document.write(buildCampusReportHtml(stats, date, config))
  win.document.close()
  win.focus()
  window.setTimeout(() => win.print(), 400)
}
