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
  unpaid: 'Ücretsiz izin', owed: 'Alacak izin (denkleştirme)', other: 'İzinli',
}

// start_hour segmentlerde "HH:MM" (string), fallback'te saat (sayı) gelebilir.
function startMinutes(value) {
  if (value == null || value === '') return 9999
  if (typeof value === 'number') return value * 60
  const match = /^(\d{1,2}):?(\d{2})?/.exec(String(value))
  return match ? Number(match[1]) * 60 + Number(match[2] || 0) : 9999
}

function groupKeyFor(row, groupBy) {
  if (groupBy === 'site') return row.site || 'Site belirtilmemiş'
  if (groupBy === 'location') return row.work_location_name || 'Konum belirtilmemiş'
  return row.dept_name || 'Departmansız'
}

export function buildDayDetail(rows = [], { groupBy = 'dept' } = {}) {
  const gb = GROUP_BYS.has(groupBy) ? groupBy : 'dept'
  const groups = new Map()
  const statusIds = {
    working: new Set(),
    on_leave: new Set(),
    sick: new Set(),
    absent: new Set(),
    off: new Set(),
  }
  const ensure = (name) => {
    if (!groups.has(name)) {
      groups.set(name, {
        key: `${gb}:${name}`,
        name,
        shiftMap: new Map(),
        workingIds: new Set(),
        on_leave: new Map(),
        sick: new Map(),
        absent: new Map(),
        off: new Map(),
      })
    }
    return groups.get(name)
  }
  const personBase = row => ({
    staff_id: row.staff_id,
    full_name: row.full_name,
    role_name: row.role_name || '',
    work_location_name: row.work_location_name || '',
    site: row.site || '',
  })

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
      statusIds.working.add(row.staff_id)
      group.workingIds.add(row.staff_id)
      const key = [
        row.shift_def_id ?? `name:${row.shift_name || 'none'}`,
        row.start_hour ?? '',
        row.end_hour ?? '',
      ].join('|')
      if (!group.shiftMap.has(key)) {
        group.shiftMap.set(key, {
          shift_key: key,
          shift_def_id: row.shift_def_id ?? null,
          shift_name: row.shift_name || 'Vardiya atanmamış',
          start_hour: row.start_hour ?? null,
          end_hour: row.end_hour ?? null,
          peopleMap: new Map(),
        })
      }
      const shift = group.shiftMap.get(key)
      if (!shift.peopleMap.has(row.staff_id)) {
        shift.peopleMap.set(row.staff_id, { ...personBase(row), work_locations: [], sites: [] })
      }
      const person = shift.peopleMap.get(row.staff_id)
      if (row.work_location_name && !person.work_locations.includes(row.work_location_name)) {
        person.work_locations.push(row.work_location_name)
      }
      if (row.site && !person.sites.includes(row.site)) person.sites.push(row.site)
      person.work_location_name = person.work_locations.join(' / ')
      person.site = person.sites.join(' / ')
    } else if (row.status === 'on_leave' && row.leave_type === 'sick') {
      statusIds.sick.add(row.staff_id)
      group.sick.set(row.staff_id, personBase(row))
    } else if (row.status === 'on_leave') {
      statusIds.on_leave.add(row.staff_id)
      group.on_leave.set(row.staff_id, {
        ...personBase(row),
        leave_type: row.leave_type || 'other',
        leave_type_label: LEAVE_LABELS[row.leave_type] || 'İzinli',
      })
    } else if (row.status === 'absent') {
      statusIds.absent.add(row.staff_id)
      group.absent.set(row.staff_id, { ...personBase(row), reason: row.absent_reason || '' })
    } else if (row.status === 'off') {
      statusIds.off.add(row.staff_id)
      group.off.set(row.staff_id, personBase(row))
    }
  }

  const byName = (left, right) => String(left.full_name).localeCompare(String(right.full_name), 'tr')
  const result = [...groups.values()]
    .map(group => {
      const shifts = [...group.shiftMap.values()]
        .map(({ peopleMap, ...shift }) => {
          const people = [...peopleMap.values()]
            .map(({ work_locations, sites, ...person }) => ({
              ...person,
              work_locations,
              sites,
            }))
            .sort(byName)
          return { ...shift, count: people.length, people }
        })
        .sort((left, right) =>
          startMinutes(left.start_hour) - startMinutes(right.start_hour)
          || String(left.shift_name).localeCompare(String(right.shift_name), 'tr'))
      const onLeave = [...group.on_leave.values()].sort(byName)
      const sick = [...group.sick.values()].sort(byName)
      const absent = [...group.absent.values()].sort(byName)
      const off = [...group.off.values()].sort(byName)
      const rosterIds = new Set([
        ...group.workingIds,
        ...group.on_leave.keys(),
        ...group.sick.keys(),
        ...group.absent.keys(),
        ...group.off.keys(),
      ])
      return {
        key: group.key,
        name: group.name,
        shifts,
        on_leave: onLeave,
        sick,
        absent,
        off,
        totals: {
          working: group.workingIds.size,
          assignments: shifts.reduce((sum, shift) => sum + shift.count, 0),
          on_leave: onLeave.length,
          sick: sick.length,
          absent: absent.length,
          off: off.length,
          roster: rosterIds.size,
        },
      }
    })
    .sort((left, right) =>
      right.totals.working - left.totals.working
      || String(left.name).localeCompare(String(right.name), 'tr'))

  const rosterIds = new Set(Object.values(statusIds).flatMap(ids => [...ids]))
  return {
    group_by: gb,
    totals: {
      working: statusIds.working.size,
      assignments: result.reduce((sum, group) => sum + group.totals.assignments, 0),
      on_leave: statusIds.on_leave.size,
      sick: statusIds.sick.size,
      absent: statusIds.absent.size,
      off: statusIds.off.size,
      roster: rosterIds.size,
      groups: result.length,
    },
    groups: result,
  }
}
