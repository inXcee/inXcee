// Format-bağımsız GÜNLÜK İMZA modeli. PDF/Excel/PNG çıktıları bu modeli ortak kullanır.
// Girdi: normalize edilmiş personel listesi (staffGrid/visibleGrid — her person.days[date]=cell)
// Çıktı: o güne ait çalışan (imza alınacak) satırlar + imza alınmayacak kategoriler.

import { leaveTypeLabel } from '../shared.jsx'

const DEFAULT_AREA = 'Yemekhane'

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
    .sig-page { page: signature; page-break-before: always; font-family: Arial, sans-serif; color: #0f172a; }
    .sig-page:first-child { page-break-before: auto; }
    .sig-head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 6px; margin-bottom: 8px; }
    .sig-title { font-size: 15px; font-weight: 700; }
    .sig-sub { font-size: 10px; color: #475569; margin-top: 2px; }
    .sig-meta { font-size: 9px; color: #475569; text-align: right; line-height: 1.5; }
    .sig-dept { font-size: 11px; font-weight: 700; background: #e2e8f0; padding: 3px 8px; margin: 8px 0 0; border-radius: 3px; }
    table.sig { width: 100%; border-collapse: collapse; font-size: 9.5px; }
    table.sig th, table.sig td { border: 1px solid #94a3b8; padding: 4px 5px; text-align: left; vertical-align: middle; }
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
