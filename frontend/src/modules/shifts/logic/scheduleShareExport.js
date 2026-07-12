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
  includeLegend: true,
  onlyVisible: true,
  accentColor: '#2563EB',
  weekendColor: '#F59E0B',
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

function statusName(cell) {
  if (!cell) return 'Bos'
  if (cell.status === 'off') return 'OFF'
  if (cell.status === 'on_leave') return `Izin - ${leaveTypeLabel(cell.leave_type)}`
  if (cell.status === 'absent') return cell.absent_reason ? `YOK - ${cell.absent_reason}` : 'YOK'
  if (cell.status === 'overtime') return 'Mesai'
  if (cell.status === 'worked') return 'Calisti'
  return 'Planli'
}

function cellHex(cell, person, colorMode) {
  if (!cell) return STATUS_HEX.empty
  if (cell.status === 'off') return STATUS_HEX.off
  if (cell.status === 'on_leave') return leaveHex(cell.leave_type)
  if (cell.status === 'absent') return STATUS_HEX.absent
  if (colorMode === 'department') return deptHex(person.dept_color)
  if (colorMode === 'status') return STATUS_HEX[cell.status] || STATUS_HEX.scheduled
  if (colorMode === 'mono') return 'E2E8F0'
  return shiftHex(cell.shift_color)
}

function cellDisplay(cell, options) {
  if (!cell) return { main: '', sub: '', note: 'Bos' }
  if (cell.status === 'off') return { main: 'OFF', sub: 'Haftalik izin', note: 'OFF' }
  if (cell.status === 'on_leave') return { main: 'IZIN', sub: leaveTypeLabel(cell.leave_type), note: statusName(cell) }
  if (cell.status === 'absent') return { main: 'YOK', sub: cell.absent_reason || '', note: statusName(cell) }
  if (isWorking(cell)) {
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

function buildLegend(shiftDefs = []) {
  return [
    ...shiftDefs.map((shift, idx) => ({
      key: `shift-${shift.id || idx}`,
      label: shift.name,
      sub: `${shift.start_hour ?? ''}:00-${shift.end_hour ?? ''}:00`,
      hex: shiftHex(shift.color_class),
    })),
    { key: 'off', label: 'OFF', sub: 'Haftalik izin', hex: STATUS_HEX.off },
    { key: 'leave', label: 'IZIN', sub: 'Onayli izin', hex: STATUS_HEX.on_leave },
    { key: 'absent', label: 'YOK', sub: 'Devamsizlik', hex: STATUS_HEX.absent },
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
    legend: buildLegend(shiftDefs),
    filters: { gridSearch, statusFilter, deptFilter, visible: opts.onlyVisible },
  }
}

function buildStyles(opts) {
  const accent = cleanHex(opts.accentColor, '2563EB')
  const weekend = cleanHex(opts.weekendColor, 'F59E0B')
  const density = {
    compact: { page: 1120, name: 148, cellPad: 4, font: 9, sub: 7, head: 8, row: 38 },
    normal: { page: 1320, name: 182, cellPad: 6, font: 10, sub: 8, head: 9, row: 48 },
    wide: { page: 1540, name: 220, cellPad: 8, font: 11, sub: 9, head: 10, row: 58 },
  }[opts.density] || { page: 1320, name: 182, cellPad: 6, font: 10, sub: 8, head: 9, row: 48 }

  return `
    * { box-sizing: border-box; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    body { margin: 0; background: #f8fafc; color: #0f172a; font-family: Arial, Helvetica, sans-serif; }
    .sheet { width: ${density.page}px; margin: 0 auto; padding: 22px; background: #ffffff; }
    .top { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; border-bottom: 4px solid #${accent}; padding-bottom: 12px; }
    .title { font-size: 24px; font-weight: 900; letter-spacing: .3px; margin: 0 0 6px; }
    .subline { color: #475569; font-size: 11px; font-weight: 700; }
    .stamp { text-align: right; color: #64748b; font-size: 10px; line-height: 1.45; }
    .metrics { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin: 14px 0; }
    .metric { border: 1px solid #cbd5e1; border-left: 5px solid #${accent}; border-radius: 8px; padding: 8px 10px; background: #f8fafc; }
    .metric b { display: block; font-size: 19px; line-height: 1; }
    .metric span { color: #64748b; font-size: 9px; font-weight: 800; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; border: 1px solid #94a3b8; }
    th, td { border: 1px solid #cbd5e1; vertical-align: middle; }
    thead th { background: #e2e8f0; color: #0f172a; font-size: ${density.head}px; padding: 7px 5px; text-align: center; }
    .person-head { width: ${density.name}px; text-align: left; }
    .day-date { display: block; color: #475569; font-size: 8px; margin-top: 2px; }
    .weekend { background: ${tint(weekend, 0.16)} !important; border-bottom: 3px solid #${weekend}; }
    .dept-row td { background: #f1f5f9; padding: 7px 8px; font-size: 10px; font-weight: 900; color: #0f172a; }
    .dept-name { display: inline-block; border-radius: 999px; padding: 3px 8px; color: #fff; }
    .person { width: ${density.name}px; padding: 7px 8px; background: #fff; }
    .p-name { font-size: 10px; font-weight: 900; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .p-meta { margin-top: 3px; color: #64748b; font-size: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cell { min-height: ${density.row}px; padding: ${density.cellPad}px; text-align: center; line-height: 1.16; }
    .main { display: block; font-size: ${density.font}px; font-weight: 900; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sub { display: block; margin-top: 3px; font-size: ${density.sub}px; font-weight: 700; opacity: .9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .count { color: #475569; font-size: 8px; margin-top: 3px; }
    .legend { display: flex; gap: 7px; flex-wrap: wrap; margin-top: 12px; }
    .legend-item { display: flex; align-items: center; gap: 5px; border: 1px solid #cbd5e1; border-radius: 999px; padding: 4px 8px; font-size: 9px; font-weight: 800; background: #fff; }
    .swatch { width: 13px; height: 13px; border-radius: 4px; display: inline-block; }
    .footer { margin-top: 12px; color: #64748b; font-size: 9px; display: flex; justify-content: space-between; gap: 12px; }
    @page { size: A4 landscape; margin: 8mm; }
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

  const tableHead = `
    <thead>
      <tr>
        <th class="person-head">Personel</th>
        ${weekDays.map((date, idx) => `
          <th class="${idx >= 5 ? 'weekend' : ''}">
            ${DAY_LABELS[idx] || ''}
            <span class="day-date">${escapeHtml(formatDate(date))}</span>
            <div class="count">${perDay[idx]?.work || 0} calisan / ${perDay[idx]?.rest || 0} izin</div>
          </th>
        `).join('')}
      </tr>
    </thead>
  `

  const bodyRows = groups.map(group => {
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
              `C:${counts.work} I:${counts.rest} B:${counts.empty + counts.absent}`,
            ].filter(Boolean).join(' / '))}</div>
          </td>
          ${weekDays.map(date => {
            const cell = person.days?.[date]
            const fill = cellHex(cell, person, opts.colorMode)
            const text = opts.colorMode === 'mono' && cell ? '0F172A' : readableText(fill)
            const display = cellDisplay(cell, opts)
            const bg = cell ? `#${fill}` : '#F8FAFC'
            const border = cell ? `#${fill}` : '#CBD5E1'
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
  }).join('')

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

  return `
    <div class="sheet">
      ${header}
      ${metrics}
      <table>${tableHead}<tbody>${bodyRows || `<tr><td colspan="${weekDays.length + 1}" style="padding:24px;text-align:center;color:#64748b;">Kayit yok</td></tr>`}</tbody></table>
      ${legendHtml}
      <div class="footer">
        <span>PDF icin tarayici yazdir ekraninda "PDF olarak kaydet" secilebilir.</span>
        <span>${escapeHtml(formatDate(weekStart))} - ${escapeHtml(formatDate(weekEnd))}</span>
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

export function scheduleShareFilename(weekStart, ext) {
  const safeDate = String(weekStart || 'hafta').replace(/[^0-9a-zA-Z_-]/g, '-')
  return `vardiya-cizelgesi-${safeDate}.${ext}`
}

export function openSchedulePrintWindow(payload) {
  const html = buildScheduleShareHtml(payload)
  const win = window.open('', '_blank', 'width=1280,height=900')
  if (!win) throw new Error('Yazdirma penceresi acilamadi')
  win.document.open()
  win.document.write(html)
  win.document.close()
  win.focus()
  window.setTimeout(() => win.print(), 350)
}

export async function downloadScheduleShareImage(payload) {
  const model = buildScheduleShareModel(payload)
  const styles = buildStyles(model.opts)
  const body = renderScheduleBody(model)
  const host = document.createElement('div')
  host.style.position = 'fixed'
  host.style.left = '-10000px'
  host.style.top = '0'
  host.style.background = '#fff'
  host.innerHTML = `<style>${styles}</style>${body}`
  document.body.appendChild(host)

  const sheet = host.querySelector('.sheet')
  const width = Math.ceil(sheet?.scrollWidth || 1320)
  const height = Math.ceil(sheet?.scrollHeight || 900)
  const xhtml = `<div xmlns="http://www.w3.org/1999/xhtml"><style>${styles}</style>${body}</div>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${xhtml}</foreignObject></svg>`
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  try {
    const image = new Image()
    await new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = reject
      image.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = width * 2
    canvas.height = height * 2
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.scale(2, 2)
    ctx.drawImage(image, 0, 0)
    const pngBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 0.95))
    if (!pngBlob) throw new Error('Gorsel olusturulamadi')
    const pngUrl = URL.createObjectURL(pngBlob)
    const a = document.createElement('a')
    a.href = pngUrl
    a.download = scheduleShareFilename(payload.weekStart, 'png')
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(pngUrl), 1000)
  } finally {
    URL.revokeObjectURL(url)
    host.remove()
  }
}
