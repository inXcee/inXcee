// Format-bağımsız GÜNLÜK İMZA modeli. PDF/Excel/PNG çıktıları bu modeli ortak kullanır.
// Girdi: normalize edilmiş personel listesi (staffGrid/visibleGrid — her person.days[date]=cell)
// Çıktı: o güne ait çalışan (imza alınacak) satırlar + imza alınmayacak kategoriler.

import { leaveTypeLabel } from '../shared.jsx'

// Çalışma noktası girilmemişse UYDURMA. Eskiden burası 'Yemekhane' idi ve
// noktası boş olan herkes imza çıktısında (PDF/PNG/Excel) yemekhanede
// çalışıyormuş gibi görünüyordu. Nokta bilinmiyorsa hücre boş kalır —
// yemekhanede kimlerin olduğu zaten bilinir, satır satır yazmaya gerek yok.
const DEFAULT_AREA = ''

// İmza alınmayacak personel kategorileri (sıra sabit).
export const NON_SIGNATURE_CATEGORIES = [
  { key: 'off', label: 'OFF / Haftalık İzin' },
  { key: 'annual', label: 'Yıllık İzin' },
  { key: 'report', label: 'Raporlu' },
  { key: 'other_leave', label: 'Diğer İzin' },
  { key: 'absent', label: 'Devamsız' },
  { key: 'unplanned', label: 'Planlanmamış' },
]

function isWorkingStatus(status) {
  return status === 'scheduled' || status === 'worked' || status === 'overtime'
}

// Bir hücreyi kategoriye ayırır. Boş hücre "planlanmamış" — asla "devamsız" sayılmaz.
export function classifySignatureCell(cell) {
  if (!cell) return 'unplanned'
  if (isWorkingStatus(cell.status)) return 'working'
  if (cell.status === 'off') return 'off'
  if (cell.status === 'absent') return 'absent'
  if (cell.status === 'on_leave') {
    if (cell.leave_type === 'annual') return 'annual'
    if (cell.leave_type === 'sick') return 'report'
    return 'other_leave'
  }
  return 'unplanned'
}

function activeSegments(cell) {
  return (cell?.segments || []).filter(segment => segment.status !== 'cancelled')
}

// Planlanan vardiya metni + çalışma noktası (parçalı vardiya saat/nokta dahil).
function plannedShift(cell) {
  const segments = activeSegments(cell)
  if (segments.length) {
    return {
      text: segments.map(s => `${s.start_time}-${s.end_time}`).join(' | '),
      segments: segments.map(s => ({
        time: `${s.start_time}-${s.end_time}`,
        location: s.work_location_name || DEFAULT_AREA,
        role: s.role_name || null,
      })),
      is_split: segments.length > 1,
    }
  }
  const hours = (cell.start_hour != null && cell.end_hour != null)
    ? `${String(cell.start_hour).padStart(2, '0')}:00-${String(cell.end_hour).padStart(2, '0')}:00`
    : ''
  return {
    text: [cell.shift_name, hours].filter(Boolean).join(' '),
    segments: [],
    is_split: false,
  }
}

// Parçalı vardiyada birden çok nokta olabilir; tekilleştirip birleştirir.
function workLocation(cell) {
  const segments = activeSegments(cell)
  if (segments.length) {
    const locs = [...new Set(segments.map(s => s.work_location_name).filter(Boolean))]
    return locs.length ? locs.join(' / ') : DEFAULT_AREA
  }
  return cell.work_location_name || DEFAULT_AREA
}

function nonSignatureDetail(key, cell) {
  if (key === 'absent') return cell?.absent_reason || ''
  if (key === 'annual' || key === 'report' || key === 'other_leave') return leaveTypeLabel(cell?.leave_type) || ''
  return ''
}

// Ana model üreticisi.
// people: person[] (full_name, dept_name, dept_color, role_name, position, days[date]=cell)
export function buildDailySignatureModel({ people = [], date, options = {} }) {
  const opts = {
    showLocationAndRole: true,
    doubleSignature: false,      // giriş+çıkış çift imza
    pageBreakByDept: false,
    onlyWorking: true,           // imza tablosunda yalnız çalışanlar
    showSummary: true,           // izin/OFF/raporlu özeti
    ...options,
  }
  const working = []
  const nonSign = { off: [], annual: [], report: [], other_leave: [], absent: [], unplanned: [] }

  people.forEach(person => {
    const cell = person.days?.[date]
    const cls = classifySignatureCell(cell)
    if (cls === 'working') {
      const planned = plannedShift(cell)
      working.push({
        staff_id: person.staff_id ?? person.id,
        full_name: person.full_name,
        dept_name: person.dept_name || 'Departmansız',
        dept_color: person.dept_color,
        role: person.role_name || person.position || '',
        planned_shift: planned.text,
        segments: planned.segments,
        is_split: planned.is_split,
        work_location: workLocation(cell),
        shift_start: cell.start_hour ?? 0,
      })
    } else {
      nonSign[cls].push({
        full_name: person.full_name,
        dept_name: person.dept_name || 'Departmansız',
        role: person.role_name || person.position || '',
        detail: nonSignatureDetail(cls, cell),
      })
    }
  })

  // Sıralama: bölüm → vardiya (başlangıç saati) → personel adı.
  working.sort((a, b) =>
    a.dept_name.localeCompare(b.dept_name, 'tr')
    || a.shift_start - b.shift_start
    || a.full_name.localeCompare(b.full_name, 'tr'))

  // Bölüm gruplarına ayır (bölüme göre ayrı sayfa seçeneği için) + numara ver.
  const groups = []
  let current = null
  let no = 0
  working.forEach(row => {
    if (!current || current.dept_name !== row.dept_name) {
      current = { dept_name: row.dept_name, dept_color: row.dept_color, rows: [] }
      groups.push(current)
    }
    no += 1
    current.rows.push({ no, ...row })
  })

  const nonSignature = NON_SIGNATURE_CATEGORIES
    .map(cat => ({ ...cat, people: nonSign[cat.key].sort((a, b) => a.full_name.localeCompare(b.full_name, 'tr')) }))
    .filter(cat => cat.people.length > 0)

  return {
    date,
    opts,
    groups,
    working_count: working.length,
    non_signature: nonSignature,
    summary: {
      working: working.length,
      off: nonSign.off.length,
      annual: nonSign.annual.length,
      report: nonSign.report.length,
      other_leave: nonSign.other_leave.length,
      absent: nonSign.absent.length,
      unplanned: nonSign.unplanned.length,
    },
  }
}

// Birden çok gün için model (seçilen günler / tüm hafta / bugün).
export function buildSignatureModels({ people = [], dates = [], options = {} }) {
  return dates.map(date => buildDailySignatureModel({ people, date, options }))
}

const WEEKLY_STATUS_LABELS = {
  off: 'OFF',
  annual: 'YILLIK İZİN',
  report: 'RAPORLU',
  other_leave: 'İZİNLİ',
  absent: 'YOK',
  unplanned: 'PLAN YOK',
}

function weeklyDayCell(cell, date, opts) {
  const category = classifySignatureCell(cell)
  if (category !== 'working') {
    return { date, category, label: WEEKLY_STATUS_LABELS[category], detail: '', can_sign: false }
  }
  const planned = plannedShift(cell)
  return {
    date,
    category,
    label: planned.text || cell.shift_name || 'Vardiya',
    detail: opts.showLocationAndRole ? workLocation(cell) : '',
    can_sign: true,
  }
}

function chunks(rows, size) {
  const result = []
  for (let index = 0; index < rows.length; index += size) result.push(rows.slice(index, index + size))
  return result.length ? result : [[]]
}

// Bölüm başına haftanın tamamını tek föyde toplar. Her gün hücresinde vardiya
// bilgisi ve imza çizgisi bulunur; OFF/izin/rapor/YOK hücreleri imzaya kapanır.
export function buildWeeklySignatureModel({ people = [], dates = [], options = {} }) {
  const opts = {
    showLocationAndRole: true,
    doubleSignature: false,
    rowsPerPage: 12,
    blankRows: 3,
    groupMode: 'department',
    showDepartmentBands: true,
    ...options,
  }
  const rowsPerPage = Math.min(25, Math.max(8, Number(opts.rowsPerPage) || 12))
  const departments = new Map()

  people.forEach(person => {
    const department = person.dept_name || 'Departmansız'
    if (!departments.has(department)) departments.set(department, [])
    departments.get(department).push({
      staff_id: person.staff_id ?? person.id,
      full_name: person.full_name,
      role: person.role_name || person.position || '',
      department,
      days: dates.map(date => weeklyDayCell(person.days?.[date], date, opts)),
    })
  })

  const sortedDepartments = [...departments.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'tr'))
    .map(([department, rows]) => [department, rows.sort((a, b) => a.role.localeCompare(b.role, 'tr') || a.full_name.localeCompare(b.full_name, 'tr'))])
  const pages = []
  if (opts.groupMode === 'combined') {
    const allRows = sortedDepartments.flatMap(([, rows]) => rows)
    const combinedChunks = chunks(allRows, rowsPerPage)
    combinedChunks.forEach((pageRows, index) => pages.push({
      department: 'Tüm Bölümler',
      combined: true,
      rows: pageRows,
      page: index + 1,
      page_count: combinedChunks.length,
      row_offset: index * rowsPerPage,
      show_blank_rows: index === combinedChunks.length - 1,
    }))
  } else {
    sortedDepartments.forEach(([department, rows]) => {
      const departmentChunks = chunks(rows, rowsPerPage)
      departmentChunks.forEach((pageRows, index) => pages.push({
        department,
        combined: false,
        rows: pageRows,
        page: index + 1,
        page_count: departmentChunks.length,
        row_offset: index * rowsPerPage,
        show_blank_rows: index === departmentChunks.length - 1,
      }))
    })
  }

  return { dates, opts, pages, people_count: people.length }
}

/* ─── HTML çıktısı (PDF / Yazdır) — her gün ayrı A4 dikey imza sayfası ─────── */

const WEEKDAY_TR = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]))
}

function weekdayLabel(date) {
  const day = new Date(`${date}T00:00:00`).getDay()
  return WEEKDAY_TR[day] || ''
}

export function signaturePagesCss() {
  return `
    @page signature { size: A4 portrait; margin: 12mm; }
    @page weekly-signature { size: A4 landscape; margin: 8mm; }
    .sig-page { page: signature; page-break-before: always; font-family: Arial, sans-serif; color: #0f172a; }
    .sig-page:first-child { page-break-before: auto; }
    .sig-head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 6px; margin-bottom: 8px; }
    .sig-title { font-size: 15px; font-weight: 700; }
    .sig-sub { font-size: 10px; color: #475569; margin-top: 2px; }
    .sig-meta { font-size: 9px; color: #475569; text-align: right; line-height: 1.5; }
    .sig-dept { font-size: 11px; font-weight: 700; background: #e2e8f0; padding: 3px 8px; margin: 8px 0 0; border-radius: 3px; }
    table.sig { width: 100%; border-collapse: collapse; font-size: 9.5px; border: 2px solid #475569; }
    table.sig th, table.sig td { border: 1.25px solid #64748b; padding: 4px 5px; text-align: left; vertical-align: middle; }
    table.sig tbody tr td { border-top-width: 1.6px; border-bottom-width: 1.6px; }
    table.sig th { background: #f1f5f9; font-size: 8.5px; text-transform: uppercase; letter-spacing: .3px; }
    table.sig td.sig-cell { height: 30px; min-width: 90px; }
    table.sig td.no { width: 26px; text-align: center; }
    .sig-seg { display: block; font-size: 8px; color: #475569; }
    .nosign { margin-top: 12px; border-top: 1px dashed #94a3b8; padding-top: 8px; }
    .nosign h4 { font-size: 10px; margin: 0 0 5px; color: #b91c1c; letter-spacing: .5px; }
    .nosign-cat { font-size: 9px; margin-bottom: 3px; }
    .nosign-cat b { color: #334155; }
    .sig-footer { display: flex; justify-content: space-between; gap: 16px; margin-top: 26px; }
    .sig-footer div { flex: 1; text-align: center; font-size: 9px; }
    .sig-footer .line { border-top: 1px solid #0f172a; margin-top: 34px; padding-top: 3px; }
    .weekly-sig-page { page: weekly-signature; page-break-before: always; break-inside: avoid; font-family: Arial, sans-serif; color: #0f172a; }
    .weekly-sig-head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #2563eb; padding-bottom: 7px; margin-bottom: 8px; }
    .weekly-sig-title { font-size: 17px; font-weight: 800; letter-spacing: .4px; }
    .weekly-sig-sub { margin-top: 3px; color: #475569; font-size: 9px; font-weight: 700; }
    .weekly-sig-meta { text-align: right; color: #64748b; font-size: 8px; line-height: 1.5; }
    table.weekly-sig { width: 100%; table-layout: fixed; border-collapse: collapse; border: 2px solid #475569; }
    table.weekly-sig th, table.weekly-sig td { border: 1.25px solid #64748b; }
    table.weekly-sig tbody tr:not(.weekly-dept-band) td { border-top-width: 1.6px; border-bottom-width: 1.6px; }
    table.weekly-sig th { padding: 4px 3px; background: #e2e8f0; font-size: 7px; text-align: center; }
    table.weekly-sig th span { display: block; margin-top: 2px; color: #475569; font-size: 6.5px; }
    table.weekly-sig td { height: 36px; padding: 3px; vertical-align: top; font-size: 7px; }
    table.weekly-sig .weekly-no { width: 24px; text-align: center; }
    table.weekly-sig .weekly-person { width: 130px; }
    table.weekly-sig .weekly-role { width: 82px; }
    table.weekly-sig tr.weekly-dept-band td { height: 17px; padding: 2px 7px; background: #dbeafe; color: #1e3a8a; font-size: 6.5px; font-weight: 900; letter-spacing: .35px; vertical-align: middle; border-top: 2px solid #475569; border-bottom: 2px solid #64748b; }
    .weekly-person b { display: block; font-size: 8px; }
    .weekly-day { text-align: center; }
    .weekly-day > b { display: block; font-size: 7px; line-height: 1.15; }
    .weekly-day small { display: block; margin-top: 2px; color: #64748b; font-size: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .weekly-working { background: #f0fdf4; }
    .weekly-off { background: #f5f3ff; }
    .weekly-annual, .weekly-other_leave { background: #f0fdfa; }
    .weekly-report { background: #fff7ed; }
    .weekly-absent { background: #fef2f2; }
    .weekly-unplanned { background: #f8fafc; color: #64748b; }
    .weekly-sign-line { display: block; margin-top: 9px; border-top: 1px dotted #64748b; color: #94a3b8; font-size: 5.5px; text-align: left; }
    .weekly-no-sign { display: block; margin-top: 9px; color: #94a3b8; font-size: 5.5px; font-style: italic; }
    .weekly-change-title { margin-top: 8px; font-size: 8px; font-weight: 800; }
    table.weekly-change { width: 100%; margin-top: 3px; border-collapse: collapse; table-layout: fixed; }
    table.weekly-change th, table.weekly-change td { border: 1.25px solid #64748b; padding: 3px; font-size: 6.5px; }
    table.weekly-change th { background: #f1f5f9; }
    table.weekly-change td { height: 20px; }
    .weekly-sig-footer { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 8px; }
    .weekly-sig-footer div { border-top: 1px solid #64748b; padding-top: 3px; color: #475569; font-size: 7px; text-align: center; }
    .weekly-sig-page.weekly-compact .weekly-sig-head { padding-bottom: 4px; margin-bottom: 5px; }
    .weekly-sig-page.weekly-compact .weekly-sig-title { font-size: 14px; }
    .weekly-sig-page.weekly-compact table.weekly-sig th { padding: 2px; font-size: 6px; }
    .weekly-sig-page.weekly-compact table.weekly-sig td { height: 25px; padding: 2px; font-size: 6px; }
    .weekly-sig-page.weekly-compact .weekly-person b { font-size: 7px; }
    .weekly-sig-page.weekly-compact .weekly-day > b { font-size: 6px; }
    .weekly-sig-page.weekly-compact .weekly-sign-line,
    .weekly-sig-page.weekly-compact .weekly-no-sign { margin-top: 5px; font-size: 5px; }
    .weekly-sig-page.weekly-economy .weekly-sig-head { padding-bottom: 3px; margin-bottom: 4px; }
    .weekly-sig-page.weekly-economy .weekly-sig-title { font-size: 12px; }
    .weekly-sig-page.weekly-economy .weekly-sig-sub,
    .weekly-sig-page.weekly-economy .weekly-sig-meta { font-size: 6.5px; }
    .weekly-sig-page.weekly-economy table.weekly-sig th { padding: 1px; font-size: 5.3px; }
    .weekly-sig-page.weekly-economy table.weekly-sig th span { margin-top: 1px; font-size: 5px; }
    .weekly-sig-page.weekly-economy table.weekly-sig td { height: 20px; padding: 1px 2px; font-size: 5.4px; }
    .weekly-sig-page.weekly-economy table.weekly-sig tr.weekly-dept-band td { height: 12px; padding: 1px 5px; font-size: 5.2px; }
    .weekly-sig-page.weekly-economy .weekly-person b { font-size: 6.3px; }
    .weekly-sig-page.weekly-economy .weekly-day > b { font-size: 5.4px; }
    .weekly-sig-page.weekly-economy .weekly-day small { margin-top: 1px; font-size: 4.7px; }
    .weekly-sig-page.weekly-economy .weekly-sign-line,
    .weekly-sig-page.weekly-economy .weekly-no-sign { margin-top: 3px; font-size: 4.5px; }
    .weekly-sig-page.weekly-economy .weekly-change-title { margin-top: 4px; font-size: 6.5px; }
    .weekly-sig-page.weekly-economy table.weekly-change th,
    .weekly-sig-page.weekly-economy table.weekly-change td { padding: 1px 2px; font-size: 5.2px; }
    .weekly-sig-page.weekly-economy table.weekly-change td { height: 13px; }
    .weekly-sig-page.weekly-economy .weekly-sig-footer { margin-top: 5px; }
  `
}

function signatureTableHead(opts) {
  const signCols = opts.doubleSignature
    ? '<th class="sig-cell">Giriş İmza</th><th class="sig-cell">Çıkış İmza</th>'
    : '<th class="sig-cell">İmza</th>'
  const locCol = opts.showLocationAndRole ? '<th>Çalışma Noktası</th>' : ''
  return `<tr><th class="no">No</th><th>Personel</th><th>Bölüm / Görev</th><th>Planlanan Vardiya</th>${locCol}<th>Fiili Vardiya / Durum</th>${signCols}<th>Açıklama</th></tr>`
}

function signatureRowHtml(row, opts) {
  const signCells = opts.doubleSignature
    ? '<td class="sig-cell"></td><td class="sig-cell"></td>'
    : '<td class="sig-cell"></td>'
  const locCell = opts.showLocationAndRole ? `<td>${esc(row.work_location)}</td>` : ''
  const segLines = row.segments.length
    ? row.segments.map(s => `<span class="sig-seg">${esc(s.time)} · ${esc(s.location)}</span>`).join('')
    : ''
  return `<tr>
    <td class="no">${row.no}</td>
    <td>${esc(row.full_name)}</td>
    <td>${esc([row.dept_name, opts.showLocationAndRole ? row.role : ''].filter(Boolean).join(' / '))}</td>
    <td>${esc(row.planned_shift)}${segLines}</td>
    ${locCell}
    <td></td>
    ${signCells}
    <td></td>
  </tr>`
}

function nonSignatureHtml(model) {
  if (!model.opts.showSummary || !model.non_signature.length) return ''
  const cats = model.non_signature.map(cat =>
    `<div class="nosign-cat"><b>${esc(cat.label)} (${cat.people.length}):</b> ${cat.people.map(p => esc(p.full_name) + (p.detail ? ` (${esc(p.detail)})` : '')).join(', ')}</div>`
  ).join('')
  return `<div class="nosign"><h4>İMZA ALINMAYACAK PERSONEL</h4>${cats}</div>`
}

export function renderSignaturePageHtml(model, meta = {}) {
  const { opts } = model
  const rev = meta.revision || '1'
  const generated = meta.generated || ''
  const weekLabel = meta.weekLabel || ''
  const deptGroups = model.groups.length ? model.groups : [{ dept_name: '—', rows: [] }]
  const body = deptGroups.map((group, idx) => {
    const rows = group.rows.map(r => signatureRowHtml(r, opts)).join('')
    const deptHeader = opts.pageBreakByDept || model.groups.length > 1
      ? `<div class="sig-dept">${esc(group.dept_name)} (${group.rows.length})</div>` : ''
    const pageBreak = opts.pageBreakByDept && idx > 0 ? ' style="page-break-before: always;"' : ''
    return `<div${pageBreak}>${deptHeader}<table class="sig"><thead>${signatureTableHead(opts)}</thead><tbody>${rows || `<tr><td colspan="9" style="text-align:center;color:#94a3b8;">Çalışan personel yok</td></tr>`}</tbody></table></div>`
  }).join('')
  return `
    <section class="sig-page">
      <div class="sig-head">
        <div>
          <div class="sig-title">GÜNLÜK VARDİYA İMZA LİSTESİ</div>
          <div class="sig-sub">${esc(model.date)} · ${esc(weekdayLabel(model.date))}${weekLabel ? ` · ${esc(weekLabel)}` : ''} · ${model.working_count} çalışan</div>
        </div>
        <div class="sig-meta">
          Revizyon: ${esc(rev)}<br />
          ${generated ? `Oluşturma: ${esc(generated)}` : ''}
        </div>
      </div>
      ${body}
      ${nonSignatureHtml(model)}
      <div class="sig-footer">
        <div><div class="line">Hazırlayan</div></div>
        <div><div class="line">Kontrol</div></div>
        <div><div class="line">Onay (Vardiya Amiri)</div></div>
      </div>
    </section>
  `
}

// Seçilen günlerin tüm imza sayfalarını tek HTML gövdesi olarak birleştirir.
export function renderSignaturePagesHtml(models, meta = {}) {
  return models.map(model => renderSignaturePageHtml(model, meta)).join('\n')
}

function weeklySignLines(doubleSignature) {
  return doubleSignature
    ? '<span class="weekly-sign-line">Giriş</span><span class="weekly-sign-line">Çıkış</span>'
    : '<span class="weekly-sign-line">İmza</span>'
}

function weeklyChangeRows(count) {
  const safeCount = Math.min(6, Math.max(0, Number(count) || 0))
  if (!safeCount) return ''
  const rows = Array.from({ length: safeCount }, (_, index) => `<tr><td>${index + 1}</td><td></td><td></td><td></td><td></td><td></td></tr>`).join('')
  return `<div class="weekly-change-title">Sonradan Eklenen / Vardiyası Değişen Personel</div>
    <table class="weekly-change"><thead><tr><th>No</th><th>Personel</th><th>Tarih</th><th>Önceki Durum</th><th>Yeni Durum</th><th>Personel / Amir İmzası</th></tr></thead><tbody>${rows}</tbody></table>`
}

export function renderWeeklySignaturePagesHtml(model, meta = {}) {
  const revision = meta.revision || '1'
  const generated = meta.generated || ''
  const weekLabel = meta.weekLabel || model.dates.join(' - ')
  return model.pages.map(page => {
    const densityClass = Number(model.opts.rowsPerPage) >= 25 ? ' weekly-economy' : Number(model.opts.rowsPerPage) >= 18 ? ' weekly-compact' : ''
    const dayHeads = model.dates.map(date => `<th>${esc(weekdayLabel(date))}<span>${esc(date)}</span></th>`).join('')
    const columnCount = 2 + (model.opts.showLocationAndRole ? 1 : 0) + model.dates.length
    let previousDepartment = ''
    const rows = page.rows.map((row, index) => {
      const departmentBand = page.combined && model.opts.showDepartmentBands !== false && row.department !== previousDepartment
        ? `<tr class="weekly-dept-band"><td colspan="${columnCount}">${esc(row.department)}</td></tr>` : ''
      previousDepartment = row.department
      return `${departmentBand}<tr>
      <td class="weekly-no">${page.row_offset + index + 1}</td>
      <td class="weekly-person"><b>${esc(row.full_name)}</b></td>
      ${model.opts.showLocationAndRole ? `<td class="weekly-role">${esc(row.role || '-')}</td>` : ''}
      ${row.days.map(day => `<td class="weekly-day weekly-${esc(day.category)}"><b>${esc(day.label)}</b>${day.detail ? `<small>${esc(day.detail)}</small>` : ''}${day.can_sign ? weeklySignLines(model.opts.doubleSignature) : '<span class="weekly-no-sign">İmza aranmaz</span>'}</td>`).join('')}
    </tr>`
    }).join('')
    return `<section class="weekly-sig-page${densityClass}">
      <div class="weekly-sig-head"><div><div class="weekly-sig-title">HAFTALIK PERSONEL İMZA FÖYÜ</div><div class="weekly-sig-sub">${esc(page.department)} · ${esc(weekLabel)} · ${page.rows.length} personel</div></div><div class="weekly-sig-meta">Revizyon: ${esc(revision)}<br />Sayfa: ${page.page}/${page.page_count}${generated ? `<br />Oluşturma: ${esc(generated)}` : ''}</div></div>
      <table class="weekly-sig"><thead><tr><th class="weekly-no">No</th><th class="weekly-person">Personel</th>${model.opts.showLocationAndRole ? '<th class="weekly-role">Görev</th>' : ''}${dayHeads}</tr></thead><tbody>${rows}</tbody></table>
      ${page.show_blank_rows ? weeklyChangeRows(model.opts.blankRows) : ''}
      <div class="weekly-sig-footer"><div>Listeyi Hazırlayan / İmza</div><div>Vardiya Amiri Kontrolü / İmza</div></div>
    </section>`
  }).join('\n')
}
