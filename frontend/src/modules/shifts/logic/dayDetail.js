// Gün detayı görünüm yardımcıları: toplu özet, kişi durum etiketi ve Excel/print
// için düz satır üretimi. Gruplama/kovalama backend'de (buildDayDetail) yapıldı;
// burada yalnız sunum. Saf fonksiyonlar.

const SUMMARY_FIELDS = [
  { key: 'roster', label: 'Gün kadrosu' },
  { key: 'working', label: 'Çalışan' },
  { key: 'on_leave', label: 'İzinli' },
  { key: 'sick', label: 'Raporlu' },
  { key: 'absent', label: 'Devamsız' },
  { key: 'off', label: 'İzin günü' },
]

// "HH:MM" ya da saat (sayı) → gün içi dakika; boşsa en sona düşsün.
function startMinutes(value) {
  if (value == null || value === '') return 9999
  if (typeof value === 'number') return value * 60
  const match = /^(\d{1,2}):?(\d{2})?/.exec(String(value))
  return match ? Number(match[1]) * 60 + Number(match[2] || 0) : 9999
}

function shiftColumnKey(shift = {}) {
  return [
    shift.shift_def_id ?? `name:${shift.shift_name || 'none'}`,
    shift.start_hour ?? '',
    shift.end_hour ?? '',
  ].join('|')
}

function rosterTotal(totals = {}) {
  if (totals.roster != null) return totals.roster
  return ['working', 'on_leave', 'sick', 'absent', 'off']
    .reduce((sum, key) => sum + (totals[key] || 0), 0)
}

// Vardiya × Bölüm matrisi: satır = bölüm, sütun = o gün kullanılan TÜM vardiyalar
// (bir vardiya tek bir bölümde bile olsa sütun olur), hücre = kişi sayısı.
// Sağda izin/rapor/devamsız/izin günü ve o bölümün gün kadrosu toplamı.
export function buildShiftMatrix(detail) {
  const groups = detail?.groups || []
  const columnMap = new Map()
  for (const group of groups) {
    for (const shift of group.shifts || []) {
      const key = shiftColumnKey(shift)
      if (!columnMap.has(key)) {
        columnMap.set(key, {
          key,
          shift_def_id: shift.shift_def_id ?? null,
          shift_name: shift.shift_name || 'Vardiya atanmamış',
          start_hour: shift.start_hour ?? null,
          end_hour: shift.end_hour ?? null,
        })
      }
    }
  }
  const columns = [...columnMap.values()].sort((left, right) =>
    startMinutes(left.start_hour) - startMinutes(right.start_hour)
    || String(left.shift_name).localeCompare(String(right.shift_name), 'tr'))
  const indexByKey = new Map(columns.map((column, index) => [column.key, index]))

  const rows = groups.map(group => {
    const cells = new Array(columns.length).fill(0)
    for (const shift of group.shifts || []) {
      const index = indexByKey.get(shiftColumnKey(shift))
      if (index != null) cells[index] += shift.count || 0
    }
    const t = group.totals || {}
    const working = t.working || 0
    const onLeave = t.on_leave || 0
    const sick = t.sick || 0
    const absent = t.absent || 0
    const off = t.off || 0
    return {
      key: group.key || group.name,
      name: group.name,
      cells,
      working,
      on_leave: onLeave,
      sick,
      absent,
      off,
      // O gün o bölümde çizelgede görünen herkes (çalışan + izinli + raporlu + devamsız + izin günü)
      total: rosterTotal(t),
    }
  }).sort((left, right) =>
    right.working - left.working || String(left.name).localeCompare(String(right.name), 'tr'))

  const columnTotals = columns.map((_, index) => rows.reduce((sum, row) => sum + row.cells[index], 0))
  const totals = detail?.totals || {}
  return {
    columns,
    rows,
    columnTotals,
    totals: {
      working: totals.working || 0,
      on_leave: totals.on_leave || 0,
      sick: totals.sick || 0,
      absent: totals.absent || 0,
      off: totals.off || 0,
      assignments: columnTotals.reduce((sum, value) => sum + value, 0),
      total: totals.roster ?? rows.reduce((sum, row) => sum + row.total, 0),
    },
  }
}

export function dayDetailSummary(detail) {
  const totals = detail?.totals || {}
  return SUMMARY_FIELDS.map(field => ({
    key: field.key,
    label: field.label,
    value: field.key === 'roster' ? rosterTotal(totals) : (totals[field.key] || 0),
  }))
}

// Vardiya başına toplu sayı + bölüm ve çalışma noktası kırılımı.
export function buildShiftOverview(detail) {
  const matrix = buildShiftMatrix(detail)
  return matrix.columns.map((column, index) => {
    const groups = matrix.rows
      .filter(row => row.cells[index] > 0)
      .map(row => ({ key: row.key, name: row.name, count: row.cells[index] }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, 'tr'))
    const locationCounts = new Map()
    for (const group of detail?.groups || []) {
      for (const shift of group.shifts || []) {
        if (shiftColumnKey(shift) !== column.key) continue
        for (const person of shift.people || []) {
          const locations = person.work_locations?.length
            ? person.work_locations
            : [person.work_location_name || 'Konum belirtilmemiş']
          for (const location of locations) {
            locationCounts.set(location, (locationCounts.get(location) || 0) + 1)
          }
        }
      }
    }
    return {
      ...column,
      count: matrix.columnTotals[index] || 0,
      groups,
      locations: [...locationCounts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, 'tr')),
    }
  })
}

export function groupMatchesSearch(group, query) {
  const needle = String(query || '').trim().toLocaleLowerCase('tr')
  if (!needle) return true
  const values = [group?.name]
  for (const shift of group?.shifts || []) {
    values.push(shift.shift_name)
    for (const person of shift.people || []) {
      values.push(person.full_name, person.role_name, person.work_location_name, person.site)
    }
  }
  for (const key of ['on_leave', 'sick', 'absent', 'off']) {
    for (const person of group?.[key] || []) {
      values.push(
        person.full_name,
        person.role_name,
        person.work_location_name,
        person.site,
        person.leave_type_label,
        person.reason,
      )
    }
  }
  return values.some(value => String(value || '').toLocaleLowerCase('tr').includes(needle))
}

export function personStatusLabel({ kind, shift_name, leave_type_label, reason } = {}) {
  if (kind === 'working') return shift_name ? `Çalışıyor · ${shift_name}` : 'Çalışıyor'
  if (kind === 'on_leave') return leave_type_label ? `İzinli · ${leave_type_label}` : 'İzinli'
  if (kind === 'sick') return 'Raporlu'
  if (kind === 'absent') return reason ? `Devamsız · ${reason}` : 'Devamsız'
  if (kind === 'off') return 'İzin günü'
  return ''
}

// Bir bölümün tüm kişilerini Excel/print sırasına göre düz satırlara açar:
// önce vardiyalardaki çalışanlar, sonra izinli → raporlu → devamsız → izin günü.
export function dayDetailRows(detail) {
  const headers = ['BÖLÜM', 'VARDİYA', 'KİŞİ', 'ROL', 'NOKTA', 'DURUM']
  const rows = []
  for (const group of detail?.groups || []) {
    for (const shift of group.shifts || []) {
      for (const person of shift.people || []) {
        rows.push([
          group.name, shift.shift_name || '', person.full_name,
          person.role_name || '', person.work_location_name || '',
          personStatusLabel({ kind: 'working', shift_name: shift.shift_name }),
        ])
      }
    }
    for (const person of group.on_leave || []) {
      rows.push([group.name, '', person.full_name, person.role_name || '', person.work_location_name || '', personStatusLabel({ kind: 'on_leave', leave_type_label: person.leave_type_label })])
    }
    for (const person of group.sick || []) {
      rows.push([group.name, '', person.full_name, person.role_name || '', person.work_location_name || '', personStatusLabel({ kind: 'sick' })])
    }
    for (const person of group.absent || []) {
      rows.push([group.name, '', person.full_name, person.role_name || '', person.work_location_name || '', personStatusLabel({ kind: 'absent', reason: person.reason })])
    }
    for (const person of group.off || []) {
      rows.push([group.name, '', person.full_name, person.role_name || '', person.work_location_name || '', personStatusLabel({ kind: 'off' })])
    }
  }
  return { headers, rows }
}

// Aynı vardiyadaki kişiler karışık sırada geliyordu: "FERDA ARAT OTC Yemekhane"
// ile "GİZEM SOFUOĞLU Tas Bina" araya karışınca hangi noktada kimin olduğunu
// görmek için tek tek okumak gerekiyordu. Noktaya göre kümelenince aynı yerdeki
// kişiler yan yana düşüyor.
//
// Nokta girilmemiş kişiler SONA alınır ama listeden düşmez — eksik veriyi
// gizlemek, o kişinin sahada olmadığı izlenimi verir.
const NOKTASIZ = '\uffff'   // sıralamada en sona düşsün

function personLocationKey(person) {
  const yer = person?.work_locations?.length
    ? [...person.work_locations].sort((a, b) => String(a).localeCompare(String(b), 'tr')).join(' + ')
    : person?.work_location_name
  return yer ? String(yer) : NOKTASIZ
}

export function orderPeopleByLocation(people) {
  return [...(people || [])].sort((a, b) => {
    const yerFarki = personLocationKey(a).localeCompare(personLocationKey(b), 'tr')
    if (yerFarki !== 0) return yerFarki
    return String(a?.full_name || '').localeCompare(String(b?.full_name || ''), 'tr')
  })
}
