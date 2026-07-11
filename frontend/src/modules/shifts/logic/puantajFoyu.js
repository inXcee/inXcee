// Resmi puantaj cetveli (föy) — satır/kod üretimi.
// ExcelJS'ten bağımsız saf mantık; export tarafı PuantajTab'dan bunu kullanır.
import { codeHex } from './shiftColors.js'

// Klasik TR puantaj kodlaması — renkler tek kaynaktan (shiftColors.codeHex)
const CODE_META = {
  worked: { code: 'N', hex: codeHex('N') },
  off: { code: 'h', hex: codeHex('h') },
  sick: { code: 'r', hex: codeHex('r') },
  unpaid: { code: 'üi', hex: codeHex('üi') },
  annual: { code: 'yi', hex: codeHex('yi') },
  leave: { code: 'i', hex: codeHex('i') },
  absent: { code: 'Y', hex: codeHex('Y') },
  scheduled: { code: 'P', hex: codeHex('P') },
  empty: { code: '', hex: null },
}

export const FOYU_LEGEND = [
  ['N', 'Normal çalıştı'],
  ['h', 'Hafta tatili'],
  ['yi', 'Yıllık izin'],
  ['r', 'Raporlu'],
  ['üi', 'Ücretsiz izin'],
  ['i', 'Diğer izin'],
  ['Y', 'Devamsız'],
  ['P', 'Planlı (gerçekleşmedi)'],
]

// Föy sağındaki toplam kolonları — sıra Excel çıktısındaki sırayla aynı
export const FOYU_TOTAL_COLUMNS = [
  { key: 'worked', label: 'N' },
  { key: 'off', label: 'h' },
  { key: 'annual', label: 'yi' },
  { key: 'sick', label: 'r' },
  { key: 'unpaid', label: 'üi' },
  { key: 'otherLeave', label: 'i' },
  { key: 'absent', label: 'Y' },
  { key: 'fmHours', label: 'FM (s)' },
  { key: 'holidayWorked', label: 'RT' },
]

export function dayCode(entry) {
  if (!entry || !entry.status || entry.status === 'no_record' || entry.status === 'sunday') return CODE_META.empty
  if (entry.status === 'worked' || entry.status === 'overtime') return CODE_META.worked
  if (entry.status === 'off') return CODE_META.off
  if (entry.status === 'absent') return CODE_META.absent
  if (entry.status === 'scheduled') return CODE_META.scheduled
  if (entry.status === 'on_leave') {
    if (entry.leave_type === 'sick') return CODE_META.sick
    if (entry.leave_type === 'unpaid') return CODE_META.unpaid
    if (entry.leave_type === 'annual') return CODE_META.annual
    return CODE_META.leave
  }
  return CODE_META.empty
}

export function buildFoyuRow(staff, days, holidaySet) {
  const totals = {
    worked: 0, off: 0, annual: 0, sick: 0, unpaid: 0, otherLeave: 0,
    absent: 0, fmHours: 0, holidayWorked: 0,
  }
  const cells = days.map(d => {
    const meta = dayCode(d)
    if (d) {
      if (d.status === 'worked' || d.status === 'overtime') {
        totals.worked++
        if (holidaySet?.has(d.date)) totals.holidayWorked++
      } else if (d.status === 'off') totals.off++
      else if (d.status === 'absent') totals.absent++
      else if (d.status === 'on_leave') {
        if (d.leave_type === 'annual') totals.annual++
        else if (d.leave_type === 'sick') totals.sick++
        else if (d.leave_type === 'unpaid') totals.unpaid++
        else totals.otherLeave++
      }
      totals.fmHours += d.overtime_hours || 0
    }
    return { code: meta.code, hex: meta.hex }
  })
  return {
    staffId: staff.id,
    name: staff.full_name,
    dept: staff.dept_name || '—',
    cells,
    totals,
  }
}
