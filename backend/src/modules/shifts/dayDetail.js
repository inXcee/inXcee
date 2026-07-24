// Bir günün kadro dökümünü bölüm bölüm + izin/rapor/devamsız kovalarına ayırır.
// Saf/test edilebilir çekirdek — veri getDayDetailRows'tan (queries.js) gelir.
//
// Kova mantığı:
//   Çalışan   = status ∈ (scheduled, worked, overtime)  → vardiyasına yazılır
//   Raporlu   = status = on_leave & leave_type = 'sick'
//   İzinli    = status = on_leave & leave_type ≠ 'sick'  (tür etiketiyle)
//   Devamsız  = status = 'absent'                        (+ absent_reason)
//   İzin günü = status = 'off'

const WORKING = new Set(['scheduled', 'worked', 'overtime'])
const GROUP_BYS = new Set(['dept', 'site', 'location'])
const OUTSIDE_GROUP = 'Bölüm dışı / izinli'

// shared.jsx LEAVE_TYPES ile aynı Türkçe karşılıklar (Excel/print sunucu verisinden okusun).
const LEAVE_LABELS = {
  annual: 'Yıllık izin', sick: 'Raporlu', emergency: 'Acil izin', maternity: 'Doğum izni',
  paternity: 'Babalık izni', marriage: 'Evlilik', bereavement: 'Vefat izni',
  unpaid: 'Ücretsiz izin', owed: 'Alacak izin', other: 'İzinli',
}

// start_hour segmentlerde "HH:MM" (string), fallback'te saat (sayı) gelebilir.
function startMinutes(value) {
  if (value == null || value === '') return 9999
  if (typeof value === 'number') return value * 60
  const match = /^(\d{1,2}):?(\d{2})?/.exec(String(value))
  return match ? Number(match[1]) * 60 + Number(match[2] || 0) : 9999
}

function groupKeyFor(row, groupBy) {
  if (groupBy === 'site') return row.site || 'Yemekhane'
  if (groupBy === 'location') return row.work_location_name || 'Yemekhane'
  return row.dept_name || 'Departmansız'
}

export function buildDayDetail(rows = [], { groupBy = 'dept' } = {}) {
  const gb = GROUP_BYS.has(groupBy) ? groupBy : 'dept'
  const groups = new Map()
  const ensure = (name) => {
    if (!groups.has(name)) {
      groups.set(name, { name, shiftMap: new Map(), on_leave: [], sick: [], absent: [], off: [] })
    }
    return groups.get(name)
  }
  const totals = { working: 0, on_leave: 0, sick: 0, absent: 0, off: 0 }

  for (const row of rows) {
    const working = WORKING.has(row.status)
    // İzin/rapor/off/devamsız satırının work_location'ı çoğu zaman null. site/location
    // gruplamada bunları yanlış bir noktaya saymamak için "Bölüm dışı / izinli"ye topla.
    const groupName = working
      ? groupKeyFor(row, gb)
      : gb === 'dept'
        ? (row.dept_name || 'Departmansız')
        : (row.work_location_name || row.site ? groupKeyFor(row, gb) : OUTSIDE_GROUP)
    const group = ensure(groupName)

    if (working) {
      totals.working += 1
      const key = row.shift_def_id ?? 'none'
      if (!group.shiftMap.has(key)) {
        group.shiftMap.set(key, {
          shift_def_id: row.shift_def_id ?? null,
          shift_name: row.shift_name || 'Vardiya atanmamış',
          start_hour: row.start_hour ?? null,
          end_hour: row.end_hour ?? null,
          people: [],
        })
      }
      group.shiftMap.get(key).people.push({
        staff_id: row.staff_id,
        full_name: row.full_name,
        role_name: row.role_name || '',
        work_location_name: row.work_location_name || '',
        site: row.site || '',
      })
    } else if (row.status === 'on_leave' && row.leave_type === 'sick') {
      totals.sick += 1
      group.sick.push({ staff_id: row.staff_id, full_name: row.full_name })
    } else if (row.status === 'on_leave') {
      totals.on_leave += 1
      group.on_leave.push({
        staff_id: row.staff_id, full_name: row.full_name,
        leave_type: row.leave_type || 'other',
        leave_type_label: LEAVE_LABELS[row.leave_type] || 'İzinli',
      })
    } else if (row.status === 'absent') {
      totals.absent += 1
      group.absent.push({ staff_id: row.staff_id, full_name: row.full_name, reason: row.absent_reason || '' })
    } else if (row.status === 'off') {
      totals.off += 1
      group.off.push({ staff_id: row.staff_id, full_name: row.full_name })
    }
  }

  const byName = (left, right) => String(left.full_name).localeCompare(String(right.full_name), 'tr')
  const result = [...groups.values()]
    .map(group => {
      const shifts = [...group.shiftMap.values()]
        .map(shift => ({ ...shift, count: shift.people.length, people: shift.people.sort(byName) }))
        .sort((left, right) =>
          startMinutes(left.start_hour) - startMinutes(right.start_hour)
          || String(left.shift_name).localeCompare(String(right.shift_name), 'tr'))
      return {
        name: group.name,
        shifts,
        on_leave: group.on_leave.sort(byName),
        sick: group.sick.sort(byName),
        absent: group.absent.sort(byName),
        off: group.off.sort(byName),
        totals: {
          working: shifts.reduce((sum, shift) => sum + shift.count, 0),
          on_leave: group.on_leave.length,
          sick: group.sick.length,
          absent: group.absent.length,
          off: group.off.length,
        },
      }
    })
    .sort((left, right) =>
      right.totals.working - left.totals.working
      || String(left.name).localeCompare(String(right.name), 'tr'))

  return { group_by: gb, totals: { ...totals, groups: result.length }, groups: result }
}
