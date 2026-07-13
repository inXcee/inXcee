// Resmi puantaj cetveli (föy) — satır/kod üretimi.
// ExcelJS'ten bağımsız saf mantık; export tarafı PuantajTab'dan bunu kullanır.
// Kodlar/renkler kod kayıt sisteminden (puantaj_codes) gelir; kayıt yoksa varsayılanlar.
import { codeHex } from './shiftColors.js'
import { DEFAULT_PUANTAJ_CODES, cleanCodeHex, codeKey } from './puantajCodes.js'

// Varsayılan kod meta — 042 seed'i ile hizalı (büyük harf)
const CODE_META = {
  worked: { code: 'N', hex: codeHex('N') },
  off: { code: 'H', hex: codeHex('h') },
  sick: { code: 'R', hex: codeHex('r') },
  unpaid: { code: 'Üİ', hex: codeHex('üi') },
  annual: { code: 'Yİ', hex: codeHex('yi') },
  leave: { code: 'İ', hex: codeHex('i') },
  absent: { code: 'Y', hex: codeHex('Y') },
  scheduled: { code: 'P', hex: codeHex('P') },
  empty: { code: '', hex: null },
}

// puantaj_codes satırları → status:leave_type anahtarlı {code, hex} indeksi
export function buildFoyuCodeIndex(codes) {
  const source = (codes?.length ? codes : DEFAULT_PUANTAJ_CODES).filter(c => c.is_active)
  const index = {}
  source.forEach(row => {
    index[codeKey(row.status, row.leave_type)] = { code: row.code, hex: cleanCodeHex(row.color_hex), label: row.label }
  })
  return index
}

export function buildFoyuLegend(codes) {
  const source = (codes?.length ? codes : DEFAULT_PUANTAJ_CODES).filter(c => c.is_active)
  return [
    ...source.map(row => [row.code, row.label]),
    ['P', 'Planlı (gerçekleşmedi)'],
  ].filter(([code], i, arr) => arr.findIndex(([c]) => c === code) === i)
}

export const FOYU_LEGEND = buildFoyuLegend(null)

// Föy sağındaki toplam kolonları — sıra Excel çıktısındaki sırayla aynı
export const FOYU_TOTAL_COLUMNS = [
  { key: 'worked', label: 'N' },
  { key: 'off', label: 'H' },
  { key: 'annual', label: 'Yİ' },
  { key: 'sick', label: 'R' },
  { key: 'unpaid', label: 'Üİ' },
  { key: 'otherLeave', label: 'İ' },
  { key: 'absent', label: 'Y' },
  { key: 'fmHours', label: 'FM (s)' },
  { key: 'holidayWorked', label: 'RT' },
]

export function dayCode(entry, codeIndex) {
  if (!entry || !entry.status || entry.status === 'no_record' || entry.status === 'sunday') return CODE_META.empty
  const status = entry.status === 'overtime' ? 'worked' : entry.status
  if (codeIndex) {
    const hit = codeIndex[codeKey(status, entry.leave_type)]
    if (hit) return hit
    if (status === 'on_leave') return codeIndex['on_leave:other'] || CODE_META.leave
  }
  if (status === 'worked') return CODE_META.worked
  if (status === 'off') return CODE_META.off
  if (status === 'absent') return CODE_META.absent
  if (status === 'scheduled') return CODE_META.scheduled
  if (status === 'on_leave') {
    if (entry.leave_type === 'sick') return CODE_META.sick
    if (entry.leave_type === 'unpaid') return CODE_META.unpaid
    if (entry.leave_type === 'annual') return CODE_META.annual
    return CODE_META.leave
  }
  return CODE_META.empty
}

export function buildFoyuRow(staff, days, holidaySet, codeIndex) {
  const totals = {
    worked: 0, off: 0, annual: 0, sick: 0, unpaid: 0, otherLeave: 0,
    absent: 0, fmHours: 0, holidayWorked: 0,
  }
  const cells = days.map(d => {
    const meta = dayCode(d, codeIndex)
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
    return {
      code: meta.code,
      hex: meta.hex,
      date: d?.date || '',
      status: d?.status || 'no_record',
      shiftName: d?.shift_name || '',
      startHour: d?.start_hour,
      endHour: d?.end_hour,
      workLocationName: d?.work_location_name || '',
      workLocationColor: d?.work_location_color || '',
      roleName: d?.role_name || staff.role_name || '',
      leaveType: d?.leave_type || '',
      overtimeHours: d?.overtime_hours || 0,
      absentReason: d?.absent_reason || '',
    }
  })
  return {
    staffId: staff.id,
    name: staff.full_name,
    dept: staff.dept_name || '—',
    role: staff.role_name || '',
    position: staff.position || '',
    tcNo: staff.tc_no || '',
    cells,
    totals,
  }
}
