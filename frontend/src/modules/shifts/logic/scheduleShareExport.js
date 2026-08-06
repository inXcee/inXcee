import { openPrintWindow } from '../../../shared/logic/printWindow.js'
import {
  formatDate,
  leaveTypeLabel,
  shiftHoursFrom,
} from '../shared.jsx'
import { deptHex, leaveHex, shiftHex } from './shiftColors.js'

const STATUS_HEX = {
  empty: 'F8FAFC',
  off: '8B5CF6',
  on_leave: '14B8A6',
  absent: 'DC2626',
  scheduled: '22C55E',
  worked: '16A34A',
  overtime: 'A855F7',
}

export const DEFAULT_SCHEDULE_SHARE_OPTIONS = {
  title: 'Haftalik Vardiya Cizelgesi',
  colorMode: 'shift',
  density: 'normal',
  includeSummary: true,
  includeRole: true,
  includeLocation: true,
  includeStaffTotals: true,
  includeLegend: true,
  includeSignatures: true,
  onlyVisible: true,
  pageBreakByDept: false,
  pageSize: 'A4',
  accentColor: '#2563EB',
  weekendColor: '#F59E0B',
  note: '',
  preparedBy: '',
  publicationDate: '',
  revision: '1',
  documentNo: '',
  // Özel renkler — tüm modlarda OFF/İZİN/YOK/Boş için geçerli; working hücre
  // rengi 'custom' modunda shiftColors[shift_def_id] ?? workColor ile belirlenir.
  offColor: '#8B5CF6',
  leaveColor: '#14B8A6',
  absentColor: '#DC2626',
  emptyColor: '#F1F5F9',
  workColor: '#22C55E',
  shiftColors: {}, // { [shiftDefId]: '#RRGGBB' } — 'custom' modda vardiya bazlı override
  // Görsel (PNG/JPG) çıktı ayarları
  imageFormat: 'png',
  imageScale: 2,
}

const DAY_LABELS = ['Pzt', 'Sal', 'Car', 'Per', 'Cum', 'Cmt', 'Paz']

function cleanHex(value, fallback = '64748B') {
  const hex = String(value || fallback).replace('#', '').trim()
  return /^[0-9a-fA-F]{6}$/.test(hex) ? hex.toUpperCase() : fallback
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function hexToRgb(hex) {
  const clean = cleanHex(hex)
  const n = parseInt(clean, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function readableText(hex) {
  const { r, g, b } = hexToRgb(hex)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.62 ? '111827' : 'FFFFFF'
}

function tint(hex, alpha = 0.12) {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function isWorking(cell) {
  return ['scheduled', 'worked', 'overtime'].includes(cell?.status)
}

// Çalışma noktası seçilmemiş → nötr kova. Eskiden "Yemekhane" idi ve noktası
// girilmemiş herkes bu özette yemekhaneye sayılıyordu. Burası bir SAYIM tablosu
// olduğu için boş etiket yerine backend'deki DEFAULT_LOCATION ile aynı ad kullanılır.
const SHARE_DEFAULT_AREA = 'Konum belirtilmemiş'
const SHARE_ROLE_ORDER = { 'Yemek/İkram': 0, 'Bulaşıkhane': 1, 'Diğer': 2 }
function shareRoleGroup(roleName) {
  const name = String(roleName || '')
    .replace(/İ/g, 'I').replace(/ı/g, 'i').replace(/Ş/g, 'S').replace(/ş/g, 's')
    .replace(/Ğ/g, 'G').replace(/ğ/g, 'g').replace(/Ü/g, 'U').replace(/ü/g, 'u')
    .replace(/Ö/g, 'O').replace(/ö/g, 'o').replace(/Ç/g, 'C').replace(/ç/g, 'c')
    .toLowerCase()
  if (name.includes('bulasik')) return 'Bulaşıkhane'
  if (['ikram', 'asci', 'lokal', 'garson', 'mutfak', 'servis', 'yemek'].some(k => name.includes(k))) return 'Yemek/İkram'
  return 'Diğer'
}

// Haftalık nokta + rol-grubu dağılımı (çıktı özetinde gösterim için).
export function scheduleCoverageDigest(groups, weekDays) {
  const area = new Map()
  const roleGroup = new Map()
  ;(groups || []).forEach(group => (group.people || []).forEach(person => {
    const rg = shareRoleGroup(person.role_name)
    weekDays.forEach(date => {
      const cell = person.days?.[date]
      if (!isWorking(cell)) return
      const name = cell.work_location_name || SHARE_DEFAULT_AREA
      area.set(name, (area.get(name) || 0) + 1)
      roleGroup.set(rg, (roleGroup.get(rg) || 0) + 1)
    })
  }))
  const areaRows = [...area.entries()].sort((a, b) => b[1] - a[1])
  const roleRows = [...roleGroup.entries()].sort((a, b) => (SHARE_ROLE_ORDER[a[0]] ?? 9) - (SHARE_ROLE_ORDER[b[0]] ?? 9))
  return { areaRows, roleRows }
}

function statusName(cell) {
  if (!cell) return 'Bos'
  if (cell.status === 'off') return 'OFF'
  if (cell.status === 'on_leave') return `Izin - ${leaveTypeLabel(cell.leave_type)}`
  if (cell.status === 'absent') return cell.absent_reason ? `YOK - ${cell.absent_reason}` : 'YOK'
  if (cell.status === 'overtime') return 'Mesai'
  if (cell.status === 'worked') return 'Calisti'
  return 'Planli'
}

function cellHex(cell, person, opts) {
  const colorMode = typeof opts === 'string' ? opts : opts?.colorMode
  const o = typeof opts === 'string' ? {} : (opts || {})
  if (!cell) return cleanHex(o.emptyColor, STATUS_HEX.empty)
  // OFF / İZİN / YOK renkleri her modda özel renkten (varsa) gelir
  if (cell.status === 'off') return cleanHex(o.offColor, STATUS_HEX.off)
  if (cell.status === 'on_leave') return cleanHex(o.leaveColor, leaveHex(cell.leave_type))
  if (cell.status === 'absent') return cleanHex(o.absentColor, STATUS_HEX.absent)
  // Çalışma hücresi
  if (colorMode === 'custom') {
    const override = o.shiftColors?.[cell.shift_def_id]
    return cleanHex(override, cleanHex(o.workColor, STATUS_HEX.scheduled))
  }
  if (colorMode === 'department') return deptHex(person.dept_color)
  if (colorMode === 'status') return STATUS_HEX[cell.status] || STATUS_HEX.scheduled
  if (colorMode === 'mono') return 'E2E8F0'
  return shiftHex(cell.shift_color)
}

// Vardiya tanımının efektif rengi (legend + custom mod override'ı dikkate alır)
function shiftLegendHex(shift, opts) {
  if (opts?.colorMode === 'custom') {
    return cleanHex(opts.shiftColors?.[shift.id], cleanHex(opts.workColor, shiftHex(shift.color_class)))
  }
  return shiftHex(shift.color_class)
}

function cellDisplay(cell, options) {
  if (!cell) return { main: '', sub: '', note: 'Bos' }
  if (cell.status === 'off') return { main: 'OFF', sub: 'Haftalik izin', note: 'OFF' }
  if (cell.status === 'on_leave') return { main: 'IZIN', sub: leaveTypeLabel(cell.leave_type), note: statusName(cell) }
  if (cell.status === 'absent') return { main: 'YOK', sub: cell.absent_reason || '', note: statusName(cell) }
  if (isWorking(cell)) {
    const segments = (cell.segments || []).filter(segment => segment.status !== 'cancelled')
    if (segments.length) {
      const first = segments[0]
      const locations = [...new Set(segments.map(segment => segment.work_location_name).filter(Boolean))]
      return {
        main: `${first.start_time}-${first.end_time}`,
        sub: segments.length > 1 ? `${segments.length} parca · ${locations.join(' / ')}` : (locations[0] || first.role_name || ''),
        note: segments.map(segment => `${segment.start_time}-${segment.end_time} ${segment.work_location_name || ''}`).join(' | '),
      }
    }
    const main = shiftHoursFrom(cell) || cell.shift_name || statusName(cell)
    const sub = options.includeLocation
      ? (cell.work_location_name || cell.shift_name || '')
      : (cell.shift_name || '')
    return { main, sub, note: statusName(cell) }
  }
  return { main: cell.shift_name || statusName(cell), sub: shiftHoursFrom(cell) || '', note: statusName(cell) }
}

function personCounts(person, weekDays) {
  return weekDays.reduce((acc, date) => {
    const cell = person.days?.[date]
    if (!cell) acc.empty += 1
    else if (cell.status === 'absent') acc.absent += 1
    else if (cell.status === 'off' || cell.status === 'on_leave') acc.rest += 1
    else if (isWorking(cell)) acc.work += 1
    return acc
  }, { work: 0, rest: 0, absent: 0, empty: 0 })
}

function dayCountsForPeople(people, date) {
  return people.reduce((acc, person) => {
    const cell = person.days?.[date]
    if (!cell) acc.empty += 1
    else if (cell.status === 'absent') acc.absent += 1
    else if (cell.status === 'off' || cell.status === 'on_leave') acc.rest += 1
    else if (isWorking(cell)) acc.work += 1
    return acc
  }, { work: 0, rest: 0, absent: 0, empty: 0 })
}

function buildLegend(shiftDefs = [], opts = {}) {
  return [
    ...shiftDefs.map((shift, idx) => ({
      key: `shift-${shift.id || idx}`,
      label: shift.name,
      sub: `${shift.start_hour ?? ''}:00-${shift.end_hour ?? ''}:00`,
      hex: shiftLegendHex(shift, opts),
    })),
    { key: 'off', label: 'OFF', sub: 'Haftalik izin', hex: cleanHex(opts.offColor, STATUS_HEX.off) },
    { key: 'leave', label: 'IZIN', sub: 'Onayli izin', hex: cleanHex(opts.leaveColor, STATUS_HEX.on_leave) },
    { key: 'absent', label: 'YOK', sub: 'Devamsizlik', hex: cleanHex(opts.absentColor, STATUS_HEX.absent) },
  ]
}

export function buildScheduleShareModel({
  weekStart,
  weekEnd,
  weekDays = [],
  staffGrid = [],
  visibleGrid = [],
  gridSearch = '',
  statusFilter = 'all',
  deptFilter = '',
  shiftDefs = [],
  options = {},
}) {
  const opts = { ...DEFAULT_SCHEDULE_SHARE_OPTIONS, ...options }
  const rows = opts.onlyVisible ? visibleGrid : staffGrid
  const exportRows = Array.isArray(rows) ? rows : []
  const groups = []
  let current = null
  exportRows.forEach(person => {
    const name = person.dept_name || 'Departmansiz'
    if (!current || current.name !== name) {
      current = { name, color: person.dept_color, people: [] }
      groups.push(current)
    }
    current.people.push(person)
  })

  const perDay = weekDays.map(date => exportRows.reduce((acc, person) => {
    const cell = person.days?.[date]
    if (!cell) acc.empty += 1
    else if (cell.status === 'absent') acc.absent += 1
    else if (cell.status === 'off' || cell.status === 'on_leave') acc.rest += 1
    else if (isWorking(cell)) acc.work += 1
    return acc
  }, { work: 0, rest: 0, absent: 0, empty: 0 }))

  const totals = perDay.reduce((acc, day) => {
    acc.work += day.work
    acc.rest += day.rest
    acc.absent += day.absent
    acc.empty += day.empty
    return acc
  }, { people: exportRows.length, work: 0, rest: 0, absent: 0, empty: 0 })

  return {
    opts,
    weekStart,
    weekEnd,
    weekDays,
    groups,
    totals,
    perDay,
    legend: buildLegend(shiftDefs, opts),
    shiftDefs,
    filters: { gridSearch, statusFilter, deptFilter, visible: opts.onlyVisible },
  }
}

const DENSITY_MAP = {
  compact: { page: 1120, name: 148, cellPad: 4, font: 9, sub: 7, head: 8, row: 38 },
  normal: { page: 1320, name: 182, cellPad: 6, font: 10, sub: 8, head: 9, row: 48 },
  wide: { page: 1540, name: 220, cellPad: 8, font: 11, sub: 9, head: 10, row: 58 },
}

function densityFor(opts) {
  const density = DENSITY_MAP[opts.density] || DENSITY_MAP.normal
  const pageSize = opts.pageSize === 'A3' ? 'A3' : 'A4'
  const pageWidth = pageSize === 'A3' ? density.page + 420 : density.page
  return { density, pageSize, pageWidth }
}

function buildStyles(opts) {
  const accent = cleanHex(opts.accentColor, '2563EB')
  const weekend = cleanHex(opts.weekendColor, 'F59E0B')
  const { density, pageSize, pageWidth } = densityFor(opts)

  return `
    * { box-sizing: border-box; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    body { margin: 0; background: #f8fafc; color: #0f172a; font-family: Arial, Helvetica, sans-serif; }
    .sheet { width: ${pageWidth}px; margin: 0 auto; padding: 22px; background: #ffffff; }
    .top { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; border-bottom: 4px solid #${accent}; padding-bottom: 12px; }
    .title { font-size: 24px; font-weight: 900; letter-spacing: .3px; margin: 0 0 6px; }
    .subline { color: #475569; font-size: 11px; font-weight: 700; }
    .stamp { text-align: right; color: #64748b; font-size: 10px; line-height: 1.45; }
    .metrics { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin: 14px 0; }
    .metric { border: 1px solid #cbd5e1; border-left: 5px solid #${accent}; border-radius: 8px; padding: 8px 10px; background: #f8fafc; }
    .metric b { display: block; font-size: 19px; line-height: 1; }
    .metric span { color: #64748b; font-size: 9px; font-weight: 800; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; border: 2px solid #475569; }
    th, td { border: 1.25px solid #94a3b8; vertical-align: middle; }
    thead th { background: #e2e8f0; color: #0f172a; font-size: ${density.head}px; padding: 7px 5px; text-align: center; }
    .person-head { width: ${density.name}px; text-align: left; }
    .day-date { display: block; color: #475569; font-size: 8px; margin-top: 2px; }
    .weekend { background: ${tint(weekend, 0.16)} !important; border-bottom: 3px solid #${weekend}; }
    .dept-row td { background: #f1f5f9; padding: 7px 8px; font-size: 10px; font-weight: 900; color: #0f172a; border-top: 2.5px solid #334155; border-bottom: 2px solid #64748b; }
    .dept-name { display: inline-block; border-radius: 999px; padding: 3px 8px; color: #fff; }
    tr.person-row > td { border-top: 1.6px solid #64748b !important; border-bottom: 1.6px solid #64748b !important; }
    .person { width: ${density.name}px; padding: 7px 8px; background: #fff; border-right: 2px solid #475569 !important; }
    .p-name { font-size: 10px; font-weight: 900; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .p-meta { margin-top: 3px; color: #64748b; font-size: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cell { min-height: ${density.row}px; padding: ${density.cellPad}px; text-align: center; line-height: 1.16; }
    .main { display: block; font-size: ${density.font}px; font-weight: 900; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sub { display: block; margin-top: 3px; font-size: ${density.sub}px; font-weight: 700; opacity: .9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .count { color: #475569; font-size: 8px; margin-top: 3px; }
    .legend { display: flex; gap: 7px; flex-wrap: wrap; margin-top: 12px; }
    .legend-item { display: flex; align-items: center; gap: 5px; border: 1px solid #cbd5e1; border-radius: 999px; padding: 4px 8px; font-size: 9px; font-weight: 800; background: #fff; }
    .swatch { width: 13px; height: 13px; border-radius: 4px; display: inline-block; }
    .note { margin: 12px 0 0; border: 1px solid #cbd5e1; border-left: 5px solid #${accent}; border-radius: 8px; padding: 9px 11px; background: #f8fafc; font-size: 10px; color: #334155; line-height: 1.45; white-space: pre-wrap; }
    .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 16px; }
    .signature { border: 1px solid #cbd5e1; border-radius: 8px; min-height: 66px; padding: 8px 10px; background: #fff; }
    .signature b { display: block; font-size: 10px; color: #0f172a; }
    .signature span { display: block; margin-top: 28px; border-top: 1px dashed #94a3b8; padding-top: 5px; color: #64748b; font-size: 8px; }
    .dept-block + .dept-block { margin-top: 14px; }
    .dept-block.split { page-break-before: always; break-before: page; }
    .dept-block.split:first-of-type { page-break-before: auto; break-before: auto; }
    .footer { margin-top: 12px; color: #64748b; font-size: 9px; display: flex; justify-content: space-between; gap: 12px; }
    /* --- Yazdırma sayfa düzeni ---
       Tarayıcı, söylenmedikçe tablo başlığını sonraki sayfaya taşımaz: uzun
       çizelgenin 2. sayfasında hangi sütunun hangi gün olduğu kaybolur.
       Satırlar da sayfa sınırında ortadan ikiye bölünür. */
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    .dept-row { break-after: avoid; page-break-after: avoid; }
    .legend, .signatures, .note, .metrics, .top { break-inside: avoid; page-break-inside: avoid; }
    .legend-item, .signature, .metric { break-inside: avoid; page-break-inside: avoid; }
    @page { size: ${pageSize} landscape; margin: 8mm; }
    @media print {
      body { background: #fff; }
      .sheet { width: auto; padding: 0; }
      .no-print { display: none !important; }
    }
  `
}

function renderScheduleBody(model) {
  const { opts, weekDays, groups, totals, perDay, legend, weekStart, weekEnd, filters } = model
  const generated = new Date().toLocaleString('tr-TR')
  const publicationDate = opts.publicationDate || new Date().toISOString().slice(0, 10)
  const title = escapeHtml(opts.title || DEFAULT_SCHEDULE_SHARE_OPTIONS.title)
  const filterText = [
    filters.visible ? 'gorunen liste' : 'tum personel',
    filters.gridSearch ? `arama: ${filters.gridSearch}` : '',
    filters.statusFilter && filters.statusFilter !== 'all' ? `filtre: ${filters.statusFilter}` : '',
  ].filter(Boolean).join(' / ')

  const header = `
    <div class="top">
      <div>
        <h1 class="title">${title}</h1>
        <div class="subline">${escapeHtml(formatDate(weekStart))} - ${escapeHtml(formatDate(weekEnd))} / ${escapeHtml(filterText)}</div>
      </div>
      <div class="stamp">
        <b>Personel paylasim ciktisi</b><br />
        ${opts.preparedBy ? `Hazirlayan: ${escapeHtml(opts.preparedBy)}<br />` : ''}
        Yayin: ${escapeHtml(formatDate(publicationDate))} / Rev: ${escapeHtml(opts.revision || '1')}<br />
        ${opts.documentNo ? `Belge No: ${escapeHtml(opts.documentNo)}<br />` : ''}
        ${escapeHtml(generated)}
      </div>
    </div>
  `

  const metrics = opts.includeSummary ? `
    <div class="metrics">
      <div class="metric"><b>${totals.people}</b><span>Personel</span></div>
      <div class="metric"><b>${totals.work}</b><span>Calisma</span></div>
      <div class="metric"><b>${totals.rest}</b><span>OFF / Izin</span></div>
      <div class="metric"><b>${totals.absent}</b><span>YOK</span></div>
      <div class="metric"><b>${totals.empty}</b><span>Bos Hucre</span></div>
    </div>
  ` : ''

  // Nokta + rol-grubu dağılımı (atanmamış → Yemekhane; İkram/Bulaşıkhane ayrı).
  const coverageDigest = (opts.includeLocation || opts.includeRole)
    ? scheduleCoverageDigest(groups, weekDays)
    : { areaRows: [], roleRows: [] }
  const coverageNote = (coverageDigest.areaRows.length || coverageDigest.roleRows.length) ? `
    <div class="coverage-note" style="margin:6px 0 2px;font-size:10px;color:#334155;display:flex;flex-wrap:wrap;gap:14px;">
      ${opts.includeLocation && coverageDigest.areaRows.length ? `<div><b>Noktalar (atama-gün):</b> ${coverageDigest.areaRows.map(([n, c]) => `${escapeHtml(n)} ${c}`).join(' · ')}</div>` : ''}
      ${opts.includeRole && coverageDigest.roleRows.length ? `<div><b>Rol grupları:</b> ${coverageDigest.roleRows.map(([n, c]) => `${escapeHtml(n)} ${c}`).join(' · ')}</div>` : ''}
    </div>
  ` : ''

  const tableHeadFor = (dayStats = perDay) => `
      <thead>
        <tr class="person-row">
          <th class="person-head">Personel</th>
          ${weekDays.map((date, idx) => `
            <th class="${idx >= 5 ? 'weekend' : ''}">
              ${DAY_LABELS[idx] || ''}
              <span class="day-date">${escapeHtml(formatDate(date))}</span>
              <div class="count">${dayStats[idx]?.work || 0} calisan / ${dayStats[idx]?.rest || 0} izin</div>
            </th>
          `).join('')}
        </tr>
      </thead>
    `

  const renderGroupRows = (group) => {
    const deptColor = cleanHex(deptHex(group.color), '64748B')
    const deptRow = `
      <tr class="dept-row">
        <td colspan="${weekDays.length + 1}">
          <span class="dept-name" style="background:#${deptColor};">${escapeHtml(group.name)}</span>
          <span style="margin-left:8px;color:#64748b;">${group.people.length} kisi</span>
        </td>
      </tr>
    `
    const peopleRows = group.people.map(person => {
      const counts = personCounts(person, weekDays)
      return `
        <tr>
          <td class="person">
            <div class="p-name">${escapeHtml(person.full_name)}</div>
            <div class="p-meta">${escapeHtml([
              opts.includeRole ? (person.role_name || 'Rolsuz') : '',
              person.position || '',
              opts.includeStaffTotals ? `C:${counts.work} I:${counts.rest} B:${counts.empty + counts.absent}` : '',
            ].filter(Boolean).join(' / '))}</div>
          </td>
          ${weekDays.map(date => {
            const cell = person.days?.[date]
            const fill = cellHex(cell, person, opts)
            const text = opts.colorMode === 'mono' && cell ? '0F172A' : readableText(fill)
            const display = cellDisplay(cell, opts)
            const bg = cell ? `#${fill}` : '#F8FAFC'
            const border = '#64748B'
            return `
              <td class="cell" title="${escapeHtml(display.note)}" style="background:${bg};border-color:${border};color:#${text};">
                <span class="main">${escapeHtml(display.main)}</span>
                ${display.sub ? `<span class="sub">${escapeHtml(display.sub)}</span>` : ''}
              </td>
            `
          }).join('')}
        </tr>
      `
    }).join('')
    return deptRow + peopleRows
  }

  const bodyRows = groups.map(renderGroupRows).join('')
  const emptyTableHtml = `<table>${tableHeadFor(perDay)}<tbody><tr><td colspan="${weekDays.length + 1}" style="padding:24px;text-align:center;color:#64748b;">Kayit yok</td></tr></tbody></table>`
  const tableHtml = groups.length === 0
    ? emptyTableHtml
    : opts.pageBreakByDept
    ? groups.map((group, idx) => {
      const deptStats = weekDays.map(date => dayCountsForPeople(group.people, date))
      return `
        <div class="dept-block ${idx > 0 ? 'split' : ''}">
          <table>${tableHeadFor(deptStats)}<tbody>${renderGroupRows(group)}</tbody></table>
        </div>
      `
    }).join('')
    : `<table>${tableHeadFor(perDay)}<tbody>${bodyRows}</tbody></table>`

  const legendHtml = opts.includeLegend ? `
    <div class="legend">
      ${legend.map(item => {
        const hex = cleanHex(item.hex)
        return `
          <span class="legend-item">
            <span class="swatch" style="background:#${hex};"></span>
            ${escapeHtml(item.label)}${item.sub ? `<small style="color:#64748b;">${escapeHtml(item.sub)}</small>` : ''}
          </span>
        `
      }).join('')}
    </div>
  ` : ''
  const noteHtml = opts.note?.trim() ? `<div class="note"><b>Not:</b> ${escapeHtml(opts.note.trim())}</div>` : ''
  const signaturesHtml = opts.includeSignatures ? `
    <div class="signatures">
      <div class="signature"><b>Hazırlayan</b><span>${escapeHtml(opts.preparedBy || 'Ad / İmza')}</span></div>
      <div class="signature"><b>Kontrol Eden</b><span>Ad / İmza</span></div>
      <div class="signature"><b>Onay</b><span>Ad / İmza</span></div>
    </div>
  ` : ''

  return `
    <div class="sheet">
      ${header}
      ${metrics}
      ${coverageNote}
      ${tableHtml}
      ${noteHtml}
      ${legendHtml}
      ${signaturesHtml}
      <div class="footer">
        <span>${opts.documentNo ? `Belge No: ${escapeHtml(opts.documentNo)} / ` : ''}Revizyon ${escapeHtml(opts.revision || '1')}</span>
        <span>${escapeHtml(formatDate(weekStart))} - ${escapeHtml(formatDate(weekEnd))} / Yayin ${escapeHtml(formatDate(publicationDate))}</span>
      </div>
    </div>
  `
}

export function buildScheduleShareHtml(payload) {
  const model = buildScheduleShareModel(payload)
  const styles = buildStyles(model.opts)
  const body = renderScheduleBody(model)
  return `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(model.opts.title)}</title><style>${styles}</style></head><body>${body}</body></html>`
}

// Çıktı Merkezi birleşik HTML: (opsiyonel) haftalık çizelge yatay A4 + seçilen
// günlerin imza sayfaları dikey A4. Named @page ile karışık yönlendirme.
export function buildOutputCenterHtml({
  includeSchedule = true,
  schedulePayload = null,
  signatureCss = '',
  signaturePagesHtml = '',
  title = 'Çıktı Merkezi',
}) {
  let styles = ''
  let body = ''
  let docTitle = title
  if (includeSchedule && schedulePayload) {
    const model = buildScheduleShareModel(schedulePayload)
    docTitle = model.opts.title || title
    styles += buildStyles(model.opts)
    // Çizelge sayfası named page (yatay) — imza dikey sayfalarıyla çakışmasın.
    styles += ' @page schedule { size: A4 landscape; margin: 8mm; } .schedule-doc .sheet { page: schedule; }'
    body += `<div class="schedule-doc">${renderScheduleBody(model)}</div>`
  }
  if (signaturePagesHtml) {
    styles += signatureCss
    body += signaturePagesHtml
  }
  return `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(docTitle)}</title><style>${styles}</style></head><body>${body}</body></html>`
}

export function openOutputCenterPrintWindow(payload) {
  const html = buildOutputCenterHtml(payload)
  openPrintWindow(html, { width: 1280, height: 900 })
}

export function scheduleShareFilename(weekStart, ext, revision = '') {
  const safeDate = String(weekStart || 'hafta').replace(/[^0-9a-zA-Z_-]/g, '-')
  const safeRevision = String(revision || '').replace(/[^0-9a-zA-Z_-]/g, '')
  return `vardiya-cizelgesi-${safeDate}${safeRevision ? `-r${safeRevision}` : ''}.${ext}`
}

export function openSchedulePrintWindow(payload) {
  const html = buildScheduleShareHtml(payload)
  openPrintWindow(html, { width: 1280, height: 900 })
}

// ── Native canvas render (foreignObject taint sorunu YOK) ───────────────────
// Not: jsdom'da 2D context olmadığından bu fonksiyon testte doğrudan çağrılmaz;
// renk/yerleşim mantığı computeScheduleCanvasLayout ile ayrı test edilir.
const CANVAS_GEO = { pad: 22, headRow: 46, deptBand: 28, metricH: 58, sigH: 96, footerH: 26 }

function wrapText(ctx, text, maxW) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const lines = []
  let line = words[0]
  for (let i = 1; i < words.length; i += 1) {
    const test = `${line} ${words[i]}`
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = words[i] }
    else line = test
  }
  lines.push(line)
  return lines
}

function fitText(ctx, text, maxW) {
  const str = String(text ?? '')
  if (!str || ctx.measureText(str).width <= maxW) return str
  let t = str
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1)
  return `${t}…`
}

// Yükseklik ve kolon geometrisini saf olarak hesaplar (canvas'sız test edilebilir).
export function computeScheduleCanvasLayout(model, ctx) {
  const { opts, weekDays, groups, legend } = model
  const { density, pageWidth } = densityFor(opts)
  const rowH = Math.max(density.row, 44)
  const cols = weekDays.length || 7
  const innerW = pageWidth - CANVAS_GEO.pad * 2
  const nameW = density.name
  const dayW = (innerW - nameW) / cols

  let h = CANVAS_GEO.pad
  h += 64 // başlık bloğu
  h += opts.includeSummary ? CANVAS_GEO.metricH + 12 : 6
  h += CANVAS_GEO.headRow
  groups.forEach(g => { h += CANVAS_GEO.deptBand + g.people.length * rowH })
  if (!groups.length) h += rowH
  // not
  let noteLines = []
  if (opts.note?.trim() && ctx) {
    ctx.font = '600 11px Arial'
    noteLines = wrapText(ctx, `Not: ${opts.note.trim()}`, innerW - 24)
    h += 14 + noteLines.length * 15 + 14
  }
  // legend
  let legendRows = 0
  if (opts.includeLegend) {
    const perRow = Math.max(1, Math.floor(innerW / 190))
    legendRows = Math.ceil(legend.length / perRow)
    h += 12 + legendRows * 30
  }
  h += opts.includeSignatures ? CANVAS_GEO.sigH : 0
  h += CANVAS_GEO.footerH
  h += CANVAS_GEO.pad
  return { height: Math.ceil(h), width: pageWidth, density, rowH, cols, innerW, nameW, dayW, noteLines }
}

export function renderScheduleToCanvas(model, scale = 2) {
  const canvas = document.createElement('canvas')
  const measure = canvas.getContext('2d')
  if (!measure) throw new Error('Canvas desteklenmiyor')
  const geom = computeScheduleCanvasLayout(model, measure)
  const s = Math.max(1, Math.min(4, scale || 2))
  canvas.width = Math.ceil(geom.width * s)
  canvas.height = Math.ceil(geom.height * s)
  const ctx = canvas.getContext('2d')
  ctx.scale(s, s)
  ctx.textBaseline = 'middle'

  const { opts, weekDays, groups, totals, perDay, legend } = model
  const accent = `#${cleanHex(opts.accentColor, '2563EB')}`
  const weekend = `#${cleanHex(opts.weekendColor, 'F59E0B')}`
  const { pad } = CANVAS_GEO
  const { density, rowH, nameW, dayW, innerW, noteLines } = geom
  let y = pad

  // Arka plan
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, geom.width, geom.height)

  // Başlık
  ctx.textAlign = 'left'
  ctx.fillStyle = '#0f172a'
  ctx.font = '900 24px Arial'
  ctx.fillText(fitText(ctx, opts.title || DEFAULT_SCHEDULE_SHARE_OPTIONS.title, innerW - 260), pad, y + 16)
  ctx.font = '700 11px Arial'
  ctx.fillStyle = '#475569'
  ctx.fillText(`${formatDate(model.weekStart)} - ${formatDate(model.weekEnd)}`, pad, y + 40)
  // Sağ damga
  ctx.textAlign = 'right'
  ctx.fillStyle = '#64748b'
  ctx.font = '700 10px Arial'
  ctx.fillText('Personel paylasim ciktisi', geom.width - pad, y + 8)
  if (opts.preparedBy) ctx.fillText(fitText(ctx, `Hazirlayan: ${opts.preparedBy}`, 240), geom.width - pad, y + 24)
  const publicationDate = opts.publicationDate || new Date().toISOString().slice(0, 10)
  ctx.fillText(fitText(ctx, `Yayin ${formatDate(publicationDate)} / Rev ${opts.revision || '1'}`, 260), geom.width - pad, y + 40)
  y += 52
  // accent çizgi
  ctx.fillStyle = accent
  ctx.fillRect(pad, y, innerW, 3)
  y += 12

  // Özet kartlar
  if (opts.includeSummary) {
    const cards = [
      [totals.people, 'Personel'], [totals.work, 'Calisma'],
      [totals.rest, 'OFF / Izin'], [totals.absent, 'YOK'], [totals.empty, 'Bos Hucre'],
    ]
    const gap = 8
    const cardW = (innerW - gap * 4) / 5
    cards.forEach(([val, label], i) => {
      const cx = pad + i * (cardW + gap)
      ctx.fillStyle = '#f8fafc'
      ctx.fillRect(cx, y, cardW, CANVAS_GEO.metricH)
      ctx.fillStyle = accent
      ctx.fillRect(cx, y, 5, CANVAS_GEO.metricH)
      ctx.strokeStyle = '#cbd5e1'
      ctx.lineWidth = 1
      ctx.strokeRect(cx + 0.5, y + 0.5, cardW - 1, CANVAS_GEO.metricH - 1)
      ctx.textAlign = 'left'
      ctx.fillStyle = '#0f172a'
      ctx.font = '900 19px Arial'
      ctx.fillText(String(val), cx + 12, y + 22)
      ctx.fillStyle = '#64748b'
      ctx.font = '800 9px Arial'
      ctx.fillText(String(label).toUpperCase(), cx + 12, y + 42)
    })
    y += CANVAS_GEO.metricH + 12
  } else {
    y += 6
  }

  // Tablo başlığı
  const drawHeader = (stats) => {
    ctx.fillStyle = '#e2e8f0'
    ctx.fillRect(pad, y, innerW, CANVAS_GEO.headRow)
    ctx.strokeStyle = '#94a3b8'
    ctx.strokeRect(pad + 0.5, y + 0.5, innerW - 1, CANVAS_GEO.headRow - 1)
    ctx.textAlign = 'left'
    ctx.fillStyle = '#0f172a'
    ctx.font = '800 9px Arial'
    ctx.fillText('Personel', pad + 8, y + CANVAS_GEO.headRow / 2)
    weekDays.forEach((date, idx) => {
      const cx = pad + nameW + idx * dayW
      if (idx >= 5) { ctx.fillStyle = tint(weekend, 0.22); ctx.fillRect(cx, y, dayW, CANVAS_GEO.headRow) }
      ctx.strokeStyle = '#cbd5e1'
      ctx.strokeRect(cx + 0.5, y + 0.5, dayW - 1, CANVAS_GEO.headRow - 1)
      ctx.textAlign = 'center'
      ctx.fillStyle = '#0f172a'
      ctx.font = '800 9px Arial'
      ctx.fillText(DAY_LABELS[idx] || '', cx + dayW / 2, y + 12)
      ctx.fillStyle = '#475569'
      ctx.font = '700 8px Arial'
      ctx.fillText(formatDate(date), cx + dayW / 2, y + 26)
      ctx.fillText(`${stats[idx]?.work || 0} cal / ${stats[idx]?.rest || 0} izin`, cx + dayW / 2, y + 38)
    })
    y += CANVAS_GEO.headRow
  }
  drawHeader(perDay)

  // Satırlar
  const drawCell = (cell, person, cx) => {
    const fill = `#${cellHex(cell, person, opts)}`
    const textColor = opts.colorMode === 'mono' && cell ? '#0F172A' : `#${readableText(cellHex(cell, person, opts))}`
    ctx.fillStyle = cell ? fill : '#F8FAFC'
    ctx.fillRect(cx, y, dayW, rowH)
    ctx.strokeStyle = '#64748b'
    ctx.lineWidth = 1.5
    ctx.strokeRect(cx + 0.5, y + 0.5, dayW - 1, rowH - 1)
    const disp = cellDisplay(cell, opts)
    ctx.textAlign = 'center'
    ctx.fillStyle = textColor
    ctx.font = `900 ${density.font}px Arial`
    ctx.fillText(fitText(ctx, disp.main, dayW - 8), cx + dayW / 2, y + (disp.sub ? rowH / 2 - 7 : rowH / 2))
    if (disp.sub) {
      ctx.font = `700 ${density.sub}px Arial`
      ctx.fillText(fitText(ctx, disp.sub, dayW - 8), cx + dayW / 2, y + rowH / 2 + 8)
    }
  }

  const drawGroups = (list) => {
    list.forEach(group => {
      // Departman bandı
      ctx.fillStyle = '#f1f5f9'
      ctx.fillRect(pad, y, innerW, CANVAS_GEO.deptBand)
      ctx.strokeStyle = '#475569'
      ctx.lineWidth = 2
      ctx.strokeRect(pad + 0.5, y + 0.5, innerW - 1, CANVAS_GEO.deptBand - 1)
      const deptColor = `#${cleanHex(deptHex(group.color), '64748B')}`
      ctx.font = '900 10px Arial'
      const label = group.name
      const pillW = ctx.measureText(label).width + 16
      ctx.fillStyle = deptColor
      ctx.fillRect(pad + 8, y + 5, pillW, CANVAS_GEO.deptBand - 10)
      ctx.textAlign = 'left'
      ctx.fillStyle = '#ffffff'
      ctx.fillText(label, pad + 16, y + CANVAS_GEO.deptBand / 2)
      ctx.fillStyle = '#64748b'
      ctx.font = '700 9px Arial'
      ctx.fillText(`${group.people.length} kisi`, pad + 16 + pillW, y + CANVAS_GEO.deptBand / 2)
      y += CANVAS_GEO.deptBand

      group.people.forEach(person => {
        // İsim hücresi
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(pad, y, nameW, rowH)
        ctx.strokeStyle = '#64748b'
        ctx.lineWidth = 1.5
        ctx.strokeRect(pad + 0.5, y + 0.5, nameW - 1, rowH - 1)
        ctx.textAlign = 'left'
        ctx.fillStyle = '#0f172a'
        ctx.font = '900 10px Arial'
        ctx.fillText(fitText(ctx, person.full_name, nameW - 12), pad + 8, y + rowH / 2 - 6)
        const counts = personCounts(person, weekDays)
        const meta = [
          opts.includeRole ? (person.role_name || 'Rolsuz') : '',
          person.position || '',
          opts.includeStaffTotals ? `C:${counts.work} I:${counts.rest} B:${counts.empty + counts.absent}` : '',
        ].filter(Boolean).join(' / ')
        ctx.fillStyle = '#64748b'
        ctx.font = '700 8px Arial'
        ctx.fillText(fitText(ctx, meta, nameW - 12), pad + 8, y + rowH / 2 + 8)
        // Gün hücreleri
        weekDays.forEach((date, idx) => drawCell(person.days?.[date], person, pad + nameW + idx * dayW))
        // Renkli hücrelerin üzerinde de kişi satırı sınırı net kalsın.
        ctx.beginPath()
        ctx.strokeStyle = '#475569'
        ctx.lineWidth = 1.75
        ctx.moveTo(pad, y + rowH - 0.75)
        ctx.lineTo(pad + innerW, y + rowH - 0.75)
        ctx.stroke()
        ctx.beginPath()
        ctx.lineWidth = 2
        ctx.moveTo(pad + nameW, y)
        ctx.lineTo(pad + nameW, y + rowH)
        ctx.stroke()
        y += rowH
      })
    })
  }

  if (!groups.length) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(pad, y, innerW, rowH)
    ctx.strokeStyle = '#cbd5e1'
    ctx.strokeRect(pad + 0.5, y + 0.5, innerW - 1, rowH - 1)
    ctx.textAlign = 'center'
    ctx.fillStyle = '#64748b'
    ctx.font = '700 11px Arial'
    ctx.fillText('Kayit yok', pad + innerW / 2, y + rowH / 2)
    y += rowH
  } else {
    drawGroups(groups)
  }

  // Not
  if (noteLines.length) {
    y += 14
    const noteH = noteLines.length * 15 + 4
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(pad, y, innerW, noteH)
    ctx.fillStyle = accent
    ctx.fillRect(pad, y, 5, noteH)
    ctx.strokeStyle = '#cbd5e1'
    ctx.strokeRect(pad + 0.5, y + 0.5, innerW - 1, noteH - 1)
    ctx.textAlign = 'left'
    ctx.fillStyle = '#334155'
    ctx.font = '600 11px Arial'
    noteLines.forEach((line, i) => ctx.fillText(line, pad + 12, y + 12 + i * 15))
    y += noteH + 10
  }

  // Legend
  if (opts.includeLegend) {
    y += 12
    ctx.font = '800 9px Arial'
    let lx = pad
    let ly = y
    legend.forEach(item => {
      const label = `${item.label}${item.sub ? `  ${item.sub}` : ''}`
      const chipW = 22 + ctx.measureText(label).width + 12
      if (lx + chipW > pad + innerW) { lx = pad; ly += 30 }
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(lx, ly - 11, chipW, 22)
      ctx.strokeStyle = '#cbd5e1'
      ctx.strokeRect(lx + 0.5, ly - 10.5, chipW - 1, 21)
      ctx.fillStyle = `#${cleanHex(item.hex)}`
      ctx.fillRect(lx + 6, ly - 6, 13, 13)
      ctx.textAlign = 'left'
      ctx.fillStyle = '#0f172a'
      ctx.fillText(label, lx + 24, ly)
      lx += chipW + 7
    })
    y = ly + 22
  }

  // İmza
  if (opts.includeSignatures) {
    const gap = 12
    const sigW = (innerW - gap * 2) / 3
    const boxH = 66
    ;['Hazırlayan', 'Kontrol Eden', 'Onay'].forEach((label, i) => {
      const sx = pad + i * (sigW + gap)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(sx, y, sigW, boxH)
      ctx.strokeStyle = '#cbd5e1'
      ctx.strokeRect(sx + 0.5, y + 0.5, sigW - 1, boxH - 1)
      ctx.textAlign = 'left'
      ctx.fillStyle = '#0f172a'
      ctx.font = '800 10px Arial'
      ctx.fillText(label, sx + 10, y + 14)
      ctx.strokeStyle = '#94a3b8'
      ctx.setLineDash([4, 3])
      ctx.beginPath(); ctx.moveTo(sx + 10, y + boxH - 16); ctx.lineTo(sx + sigW - 10, y + boxH - 16); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#64748b'
      ctx.font = '700 8px Arial'
      ctx.fillText(i === 0 && opts.preparedBy ? opts.preparedBy : 'Ad / İmza', sx + 10, y + boxH - 7)
    })
    y += boxH + 8
  }

  // Footer
  ctx.textAlign = 'left'
  ctx.fillStyle = '#64748b'
  ctx.font = '700 9px Arial'
  ctx.fillText('Vardiya cizelgesi gorsel ciktisi', pad, y + 8)
  ctx.textAlign = 'right'
  ctx.fillText(`${formatDate(model.weekStart)} - ${formatDate(model.weekEnd)}`, geom.width - pad, y + 8)

  return canvas
}

export async function downloadScheduleShareImage(payload, exportOpts = {}) {
  const model = buildScheduleShareModel(payload)
  const scale = exportOpts.scale || model.opts.imageScale || 2
  const format = (exportOpts.format || model.opts.imageFormat || 'png') === 'jpg' ? 'jpg' : 'png'
  const canvas = renderScheduleToCanvas(model, scale)
  const mime = format === 'jpg' ? 'image/jpeg' : 'image/png'
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Gorsel olusturulamadi'))), mime, 0.95)
  })
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = scheduleShareFilename(payload.weekStart, format, model.opts.revision)
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
