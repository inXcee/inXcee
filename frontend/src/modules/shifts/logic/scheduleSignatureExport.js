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
