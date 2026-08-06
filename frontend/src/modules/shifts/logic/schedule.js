import { findLocationColumn, resolveWorkLocation, splitLocationDecoratedValue } from './locationImport.js'

// Çizelge (Schedule) saf iş mantığı — UI'dan bağımsız, birim test edilebilir.
// ScheduleTab bu fonksiyonları çağırır; davranış birebir korunur.

// Haftalık ızgarayı kur: schedule satırlarını tüm aktif personelle birleştir.
// rows: /shifts/schedule yanıtı (staff_id + work_date başına bir kayıt)
// allStaff: /shifts/staff?is_active=1 (department_id alanlı)
// deptFilter: '' | dept id string — verilirse o departman dışındakiler eklenmez
export function buildStaffGrid(rows, allStaff, deptFilter) {
  // First: index schedule rows by staff_id
  const schedMap = new Map()
  rows.forEach(r => {
    if (!schedMap.has(r.staff_id)) {
      schedMap.set(r.staff_id, {
        id: r.staff_id, full_name: r.full_name, gender: r.gender, position: r.position,
        dept_id: r.dept_id, dept_name: r.dept_name, dept_color: r.dept_color,
        role_id: r.role_id, role_name: r.role_name, role_sort_order: r.role_sort_order,
        role_color: r.role_color, schedule_order: r.schedule_order,
        days: {}
      })
    }
    schedMap.get(r.staff_id).days[r.work_date] = r
  })

  // Second: add all active staff (those NOT in schedule yet)
  const result = new Map(schedMap)
  allStaff.forEach(s => {
    if (deptFilter && s.department_id !== parseInt(deptFilter)) return
    if (!result.has(s.id)) {
      result.set(s.id, {
        id: s.id, full_name: s.full_name, gender: s.gender, position: s.position,
        dept_id: s.department_id, dept_name: s.dept_name, dept_color: s.dept_color,
        role_color: s.role_color, schedule_order: s.schedule_order,
        role_id: s.role_id, role_name: s.role_name, role_sort_order: s.role_sort_order,
        days: {}
      })
    }
  })

  // Sort by dept then role then name.
  // Departman BİRİNCİL anahtar: aynı departman her zaman bitişik kalır (aksi halde
  // dept-siz personel iki aynı-adlı grup arasına girip tbody'de duplicate key üretir).
  // Departmansız (null/boş) personel sona, kendi arasında gruplanır.
  return Array.from(result.values()).sort((a, b) => {
    const deptA = a.dept_name || ''
    const deptB = b.dept_name || ''
    if (deptA !== deptB) {
      if (!deptA) return 1
      if (!deptB) return -1
      return deptA.localeCompare(deptB, 'tr')
    }
    // Elle sürüklenen sıra departman İÇİNDE geçerli: gruplama bozulmaz ama
    // kullanıcının dizdiği düzen rol/ad sıralamasını ezer. Sırasızlar altta.
    const sa = a.schedule_order ?? Number.MAX_SAFE_INTEGER
    const sb = b.schedule_order ?? Number.MAX_SAFE_INTEGER
    if (sa !== sb) return sa - sb
    if ((a.role_sort_order ?? 9999) !== (b.role_sort_order ?? 9999)) return (a.role_sort_order ?? 9999) - (b.role_sort_order ?? 9999)
    if (a.role_name && b.role_name && a.role_name !== b.role_name) return a.role_name.localeCompare(b.role_name, 'tr')
    return (a.full_name || '').localeCompare(b.full_name || '', 'tr')
  })
}

// Haftanın gün-bazlı istatistiği: her gün çalışan/izinli/boş personel listesi + toplamlar.
export function computeWeekStats(staffGrid, weekDays) {
  let working = 0, onLeave = 0, empty = 0
  const perDay = weekDays.map(d => {
    const dayWorking = []
    const dayLeave = []
    const dayEmpty = []
    staffGrid.forEach(p => {
      const cell = p.days[d]
      if (!cell) dayEmpty.push(p)
      else if (cell.status === 'on_leave') dayLeave.push(p)
      else dayWorking.push(p)
    })
    working += dayWorking.length
    onLeave += dayLeave.length
    empty += dayEmpty.length
    return { date: d, working: dayWorking, leave: dayLeave, empty: dayEmpty }
  })
  return { working, onLeave, empty, total: staffGrid.length, perDay }
}

// Excel hücre değerini { shiftDefId, status } yapısına çevir (yoksa null).
// Kodlama: i/İ/izin/tatil → izin; off → haftalık izin; 1/G* → 1.vardiya; 2/A* → 2.vardiya;
// 3/Ge* → 3.vardiya; sayısal 1..N → N.vardiya. shiftDefs sırası belirleyici.
export function parseShiftCell(val, shiftDefs) {
  if (!val && val !== 0) return null
  const v = String(val).toLowerCase().trim()
  if (!v || v === '-' || v === '') return null
  if (v === 'i' || v === 'İ' || v === 'izin' || v === 'tatil') return { shiftDefId: null, status: 'on_leave' }
  if (v === 'off') return { shiftDefId: null, status: 'off' }
  if (v === '1' || v.startsWith('g') && !v.startsWith('ge')) return { shiftDefId: shiftDefs[0]?.id || null, status: 'scheduled' }
  if (v === '2' || v.startsWith('a')) return { shiftDefId: shiftDefs[1]?.id || null, status: 'scheduled' }
  if (v === '3' || v.startsWith('ge')) return { shiftDefId: shiftDefs[2]?.id || null, status: 'scheduled' }
  // Numeric: 1/2/3
  const n = parseInt(v)
  if (n >= 1 && n <= shiftDefs.length) return { shiftDefId: shiftDefs[n - 1]?.id || null, status: 'scheduled' }
  return null
}

// \u0130zin t\u00fcr\u00fc \u2192 kanonik k\u0131sa kod. cellToScheduleCode bunu \u00fcretir; kopyala/yap\u0131\u015ft\u0131r
// ve h\u0131zl\u0131 giri\u015f round-trip'inin tek kayna\u011f\u0131. 'other' i\u00e7in \u00f6zel kod yok \u2192 generic 'I'.
export const LEAVE_TYPE_CODE = {
  annual: 'YIL',
  unpaid: 'UCR',
  sick: 'RAP',
  emergency: 'ACIL',
  maternity: 'DOGUM',
  paternity: 'BABALIK',
  marriage: 'EVLILIK',
  bereavement: 'VEFAT',
  owed: 'ALACAK',
}
// Kod (ASCII, k\u00fc\u00e7\u00fck harf) \u2192 izin t\u00fcr\u00fc. Kanonik kodlar + yayg\u0131n e\u015f anlaml\u0131lar.
const LEAVE_CODE_TYPE = {
  yil: 'annual', yillik: 'annual',
  ucr: 'unpaid', ucretsiz: 'unpaid',
  rap: 'sick', rapor: 'sick', raporlu: 'sick',
  acil: 'emergency',
  dogum: 'maternity',
  babalik: 'paternity',
  evlilik: 'marriage',
  vefat: 'bereavement',
  alacak: 'owed',
  // "Denkleştirme" alacak iznin diğer adı — ikisi de fazla mesainin ücret
  // yerine serbest zaman olarak kullanılması. Aynı türe gidiyorlar.
  denk: 'owed', denklestirme: 'owed',
}

export function parseQuickScheduleCode(val, shiftDefs) {
  if (!val && val !== 0) return { action: 'noop' }
  const raw = String(val).trim()
  if (!raw) return { action: 'noop' }
  const v = raw.toLocaleLowerCase('tr')
  // NFD + kombine i\u015faret temizli\u011fi \u015f/\u011f/\u00fc/\u00f6/\u00e7'yi ASCII'ye indirir; noktas\u0131z '\u0131' atomik
  // oldu\u011fu i\u00e7in ayr\u0131ca i'ye katlan\u0131r (YIL\u2192'y\u0131l'\u2192'yil' round-trip'i i\u00e7in kritik).
  const plain = v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0131/g, 'i')

  if (['sil', 'delete', 'del', 'x', 'kaldir', 'clear', '0'].includes(plain)) {
    return { action: 'delete' }
  }
  // Genel izin (t\u00fcr belirtilmeden) \u2014 puantajda leave_requests'e g\u00f6re \u00e7\u00f6z\u00fcl\u00fcr.
  if (['i', 'izin', 'izinli', 'tatil'].includes(plain)) {
    return { action: 'assign', shiftDefId: null, status: 'on_leave', leaveType: null }
  }
  // Belirli izin t\u00fcr\u00fc (y\u0131ll\u0131k / \u00fccretsiz / raporlu / acil / do\u011fum ...).
  if (LEAVE_CODE_TYPE[plain]) {
    return { action: 'assign', shiftDefId: null, status: 'on_leave', leaveType: LEAVE_CODE_TYPE[plain] }
  }
  if (['off', 'o', 'h', 'haftalik'].includes(plain)) {
    return { action: 'assign', shiftDefId: null, status: 'off' }
  }
  if (['yok', 'devamsiz', 'gelmedi', 'absent'].includes(plain)) {
    return { action: 'assign', shiftDefId: null, status: 'absent' }
  }

  if (v === '1' || (plain.startsWith('g') && !plain.startsWith('ge'))) {
    return { action: 'assign', shiftDefId: shiftDefs[0]?.id || null, status: 'scheduled' }
  }
  if (v === '2' || plain.startsWith('a')) {
    return { action: 'assign', shiftDefId: shiftDefs[1]?.id || null, status: 'scheduled' }
  }
  if (v === '3' || plain.startsWith('ge')) {
    return { action: 'assign', shiftDefId: shiftDefs[2]?.id || null, status: 'scheduled' }
  }

  const n = parseInt(v)
  if (n >= 1 && n <= shiftDefs.length) {
    return { action: 'assign', shiftDefId: shiftDefs[n - 1]?.id || null, status: 'scheduled' }
  }
  return { action: 'invalid', message: 'Kod anlasilmadi' }
}

export function cellToScheduleCode(cell, shiftDefs = []) {
  if (!cell) return ''
  if (cell.status === 'off') return 'OFF'
  if (cell.status === 'on_leave') return LEAVE_TYPE_CODE[cell.leave_type] || 'I'
  if (cell.status === 'absent') return 'YOK'
  if (cell.shift_def_id) {
    const idx = shiftDefs.findIndex(s => s.id === cell.shift_def_id)
    if (idx >= 0) return String(idx + 1)
  }
  if (cell.shift_name) return String(cell.shift_name).slice(0, 1).toLocaleUpperCase('tr')
  return ''
}

export function cellToClipboardCode(cell, shiftDefs = []) {
  const code = cellToScheduleCode(cell, shiftDefs)
  if (!code || !cell?.work_location_name || !['scheduled', 'worked', 'overtime'].includes(cell.status)) return code
  return `${code} @ ${cell.work_location_name}`
}

export function parseClipboardScheduleCode(value, shiftDefs = [], workLocations = []) {
  const decorated = splitLocationDecoratedValue(value)
  let parsed = parseQuickScheduleCode(decorated.value, shiftDefs)
  let locationName = decorated.locationName

  // "İşçi Lokali | 1" biçimini de kabul et.
  if ((parsed.action === 'invalid' || parsed.action === 'noop') && decorated.alternateValue) {
    const alternate = parseQuickScheduleCode(decorated.alternateValue, shiftDefs)
    if (alternate.action !== 'invalid' && alternate.action !== 'noop') {
      parsed = alternate
      locationName = decorated.alternateLocationName
    }
  }

  if (!locationName || parsed.action !== 'assign' || !['scheduled', 'worked', 'overtime'].includes(parsed.status)) {
    return { ...parsed, locationSpecified: false }
  }
  const resolved = resolveWorkLocation(locationName, workLocations)
  if (resolved.status !== 'matched') {
    return {
      action: 'invalid',
      message: resolved.status === 'ambiguous'
        ? `"${locationName}" birden fazla lokasyonla eşleşiyor`
        : `"${locationName}" lokasyonu bulunamadı`,
      locationName,
    }
  }
  return {
    ...parsed,
    locationSpecified: true,
    workLocationId: resolved.location.id,
    workLocationName: resolved.location.name,
  }
}

// Pano metnini ızgaraya yapıştırma planı — saf/test edilebilir çekirdek.
// text: TSV (\t sütun, \n satır). targets: seçili {staffId,date} listesi (anchor = ilk).
// Tek değer + çok hücre seçimi → broadcast (tüm seçime yayar); aksi halde anchor'dan
// pozisyonel yapıştırır. Dönüş assignments {staffId,date,shiftDefId,status,leaveType} +
// deletions {staffId,date}; çağıran dept_id/work_location_id ekleyip API entry'sine çevirir.
export function planCellPaste({ text, targets = [], rowOrderIds = [], weekDays = [], shiftDefs = [], workLocations = [] }) {
  const grid = String(text || '').split(/\r?\n/).filter(line => line.length > 0).map(r => r.split('\t'))
  const assignments = []
  const deletions = []
  const errors = []
  if (!grid.length || !targets.length) return { assignments, deletions, errors, mode: 'none' }

  const pushParsed = (staffId, date, code) => {
    const parsed = parseClipboardScheduleCode(code, shiftDefs, workLocations)
    if (parsed.action === 'delete') deletions.push({ staffId, date })
    else if (parsed.action === 'assign') {
      assignments.push({
        staffId,
        date,
        shiftDefId: parsed.shiftDefId,
        status: parsed.status,
        leaveType: parsed.leaveType ?? null,
        ...(parsed.locationSpecified ? {
          locationSpecified: true,
          workLocationId: parsed.workLocationId,
          workLocationName: parsed.workLocationName,
        } : {}),
      })
    } else if (parsed.action === 'invalid') {
      errors.push({ staffId, date, value: String(code ?? ''), message: parsed.message })
    }
  }

  const isSingle = grid.length === 1 && grid[0].length === 1
  if (isSingle && targets.length > 1) {
    targets.forEach(t => pushParsed(t.staffId, t.date, grid[0][0]))
    return { assignments, deletions, errors, mode: 'broadcast' }
  }

  const anchor = targets[0]
  const rowStart = rowOrderIds.indexOf(anchor.staffId)
  const colStart = weekDays.indexOf(anchor.date)
  if (rowStart < 0 || colStart < 0) return { assignments, deletions, errors, mode: 'none' }
  grid.forEach((cols, ri) => {
    const staffId = rowOrderIds[rowStart + ri]
    if (staffId == null) return
    cols.forEach((code, ci) => {
      const date = weekDays[colStart + ci]
      if (!date) return
      pushParsed(staffId, date, code)
    })
  })
  return { assignments, deletions, errors, mode: 'positional' }
}

function parseHour(value) {
  if (value == null || value === '') return null
  const [h, m = '0'] = String(value).split(':')
  const hour = Number(h)
  const minute = Number(m)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  return hour + minute / 60
}

function shiftDuration(start, end) {
  const s = parseHour(start)
  const e = parseHour(end)
  if (s == null || e == null) return null
  return e >= s ? e - s : 24 - s + e
}

function restHours(prev, next) {
  const prevStart = parseHour(prev?.start_hour ?? prev?.shift_start)
  const prevEnd = parseHour(prev?.end_hour ?? prev?.shift_end)
  const nextStart = parseHour(next?.start_hour ?? next?.shift_start)
  if (prevStart == null || prevEnd == null || nextStart == null) return null
  const prevEndAbsolute = prevEnd > prevStart ? prevEnd : prevEnd + 24
  return 24 + nextStart - prevEndAbsolute
}

function isWorkingCell(cell) {
  return ['scheduled', 'worked', 'overtime'].includes(cell?.status)
}

function isRestCell(cell) {
  return cell?.status === 'off' || cell?.status === 'on_leave'
}

function isNightCell(cell) {
  if (!isWorkingCell(cell)) return false
  const start = parseHour(cell.start_hour ?? cell.shift_start)
  if (start == null) return false
  return start >= 20 || start < 6
}

export function buildScheduleWarnings(staffGrid, weekDays, options = {}) {
  const coverageMin = Number.isFinite(options.coverageMin) ? options.coverageMin : 1
  const minRestHours = Number.isFinite(options.minRestHours) ? options.minRestHours : 11
  const maxConsecutive = Number.isFinite(options.maxConsecutive) ? options.maxConsecutive : 6
  const warnings = []

  const deptMap = new Map()
  staffGrid.forEach(person => {
    const dept = person.dept_name || 'Departmansiz'
    if (!deptMap.has(dept)) deptMap.set(dept, weekDays.map(() => 0))
    weekDays.forEach((date, idx) => {
      if (isWorkingCell(person.days?.[date])) deptMap.get(dept)[idx] += 1
    })
  })

  deptMap.forEach((counts, dept) => {
    counts.forEach((count, idx) => {
      if (count < coverageMin) {
        warnings.push({
          type: 'coverage',
          severity: 'high',
          date: weekDays[idx],
          dept,
          title: 'Eksik kapsama',
          message: `${dept} bolumunde ${weekDays[idx]} gunu ${count}/${coverageMin} kisi calisiyor.`,
        })
      }
    })
  })

  staffGrid.forEach(person => {
    const cells = weekDays.map(date => ({ date, cell: person.days?.[date] }))
    if (cells.every(x => isWorkingCell(x.cell))) {
      warnings.push({
        type: 'weekly_off',
        severity: 'medium',
        staffId: person.id,
        staffName: person.full_name,
        title: 'Haftalik izin yok',
        message: `${person.full_name} icin bu haftada OFF/izin gunu gorunmuyor.`,
      })
    }

    let streak = 0
    cells.forEach(({ date, cell }) => {
      if (isWorkingCell(cell)) {
        streak += 1
        if (streak > maxConsecutive) {
          warnings.push({
            type: 'consecutive',
            severity: 'medium',
            staffId: person.id,
            staffName: person.full_name,
            date,
            title: 'Ardisik calisma',
            message: `${person.full_name} ${streak} gun ardisik calisiyor.`,
          })
        }
      } else {
        streak = 0
      }
    })

    for (let i = 1; i < cells.length; i += 1) {
      const prev = cells[i - 1].cell
      const next = cells[i].cell
      if (!isWorkingCell(prev) || !isWorkingCell(next)) continue
      const rest = restHours(prev, next)
      if (rest != null && rest < minRestHours) {
        warnings.push({
          type: 'rest',
          severity: 'high',
          staffId: person.id,
          staffName: person.full_name,
          date: cells[i].date,
          title: 'Dinlenme az',
          message: `${person.full_name} icin iki vardiya arasi ${rest.toFixed(1)} saat.`,
        })
      }
      if (isNightCell(prev) && isNightCell(next)) {
        warnings.push({
          type: 'night',
          severity: 'medium',
          staffId: person.id,
          staffName: person.full_name,
          date: cells[i].date,
          title: 'Ardisik gece',
          message: `${person.full_name} icin ardisik gece vardiyasi var.`,
        })
      }
    }

    weekDays.forEach(date => {
      const cell = person.days?.[date]
      if (!isWorkingCell(cell)) return
      const hours = shiftDuration(cell.start_hour ?? cell.shift_start, cell.end_hour ?? cell.shift_end)
      if (hours != null && hours > 12) {
        warnings.push({
          type: 'long_shift',
          severity: 'medium',
          staffId: person.id,
          staffName: person.full_name,
          date,
          title: 'Uzun vardiya',
          message: `${person.full_name} ${date} gunu ${hours.toFixed(1)} saatlik vardiyada.`,
        })
      }
    })
  })

  return warnings
}

export function daysInMonth(month) {
  if (!/^\d{4}-\d{2}$/.test(month || '')) return []
  const [year, monthNo] = month.split('-').map(Number)
  const total = new Date(Date.UTC(year, monthNo, 0)).getUTCDate()
  return Array.from({ length: total }, (_, idx) => `${month}-${String(idx + 1).padStart(2, '0')}`)
}

function addDaysIsoLocal(dateStr, offset) {
  const [year, month, day] = String(dateStr).split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + offset))
  return date.toISOString().slice(0, 10)
}

function dateRange(startDate, endDate) {
  const days = []
  if (!startDate || !endDate) return days
  for (let d = startDate; d <= endDate; d = addDaysIsoLocal(d, 1)) days.push(d)
  return days
}

export function buildStaffRecentSummary(shiftHistory = [], overtimeRecords = [], options = {}) {
  const sourceDates = [
    ...shiftHistory.map(s => s.work_date),
    ...overtimeRecords.map(o => o.work_date),
  ].filter(Boolean)
  const referenceDate = options.referenceDate || sourceDates.sort().at(-1) || new Date().toISOString().slice(0, 10)
  const days = Number.isFinite(options.days) ? options.days : 30
  const startDate = addDaysIsoLocal(referenceDate, -(days - 1))
  const range = dateRange(startDate, referenceDate)
  const shiftsByDate = new Map(shiftHistory.map(s => [s.work_date, s]))
  const overtimeByDate = new Map()
  overtimeRecords.forEach(o => {
    if (!o.work_date) return
    overtimeByDate.set(o.work_date, (overtimeByDate.get(o.work_date) || 0) + Number(o.hours || 0))
  })

  const timeline = range.map(date => {
    const cell = shiftsByDate.get(date)
    const overtimeHours = overtimeByDate.get(date) || 0
    let kind = 'empty'
    if (cell?.status === 'absent') kind = 'absent'
    else if (cell?.status === 'off') kind = 'off'
    else if (cell?.status === 'on_leave') kind = 'leave'
    else if (isWorkingCell(cell)) kind = 'work'
    return { date, kind, cell, overtimeHours }
  })

  let maxConsecutive = 0
  let current = 0
  timeline.forEach(day => {
    if (day.kind === 'work') {
      current += 1
      maxConsecutive = Math.max(maxConsecutive, current)
    } else {
      current = 0
    }
  })

  let currentConsecutive = 0
  for (let i = timeline.length - 1; i >= 0; i -= 1) {
    if (timeline[i].kind !== 'work') break
    currentConsecutive += 1
  }

  return {
    startDate,
    endDate: referenceDate,
    timeline,
    workDays: timeline.filter(d => d.kind === 'work').length,
    offDays: timeline.filter(d => d.kind === 'off').length,
    leaveDays: timeline.filter(d => d.kind === 'leave').length,
    absentDays: timeline.filter(d => d.kind === 'absent').length,
    emptyDays: timeline.filter(d => d.kind === 'empty').length,
    overtimeHours: [...overtimeByDate.entries()]
      .filter(([date]) => date >= startDate && date <= referenceDate)
      .reduce((sum, [, hours]) => sum + hours, 0),
    maxConsecutive,
    currentConsecutive,
  }
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && bStart <= aEnd
}

export function buildPayrollClosingCheck(staffGrid, periodDays, options = {}) {
  const coverageMin = Number.isFinite(options.coverageMin) ? options.coverageMin : 1
  const overtimeRecords = options.overtimeRecords || []
  const pendingLeaves = options.pendingLeaves || []
  const periodStart = periodDays[0]
  const periodEnd = periodDays.at(-1)

  const emptyByStaff = []
  const offMissingByStaff = []
  const absentItems = []
  staffGrid.forEach(person => {
    const emptyDates = periodDays.filter(date => !person.days?.[date])
    if (emptyDates.length) emptyByStaff.push({ staffId: person.id, name: person.full_name, count: emptyDates.length, dates: emptyDates })

    const missingWeeks = []
    for (let idx = 0; idx < periodDays.length; idx += 7) {
      const week = periodDays.slice(idx, idx + 7)
      const hasWork = week.some(date => isWorkingCell(person.days?.[date]))
      const hasRest = week.some(date => isRestCell(person.days?.[date]))
      if (hasWork && !hasRest) missingWeeks.push({ start: week[0], end: week.at(-1) })
    }
    if (missingWeeks.length) offMissingByStaff.push({ staffId: person.id, name: person.full_name, count: missingWeeks.length, weeks: missingWeeks })

    periodDays.forEach(date => {
      const cell = person.days?.[date]
      if (cell?.status === 'absent') absentItems.push({ staffId: person.id, name: person.full_name, date })
    })
  })

  const coverageLow = []
  const depts = new Map()
  staffGrid.forEach(person => {
    const dept = person.dept_name || 'Departmansiz'
    if (!depts.has(dept)) depts.set(dept, new Map())
    periodDays.forEach(date => {
      const cell = person.days?.[date]
      if (isWorkingCell(cell)) depts.get(dept).set(date, (depts.get(dept).get(date) || 0) + 1)
    })
  })
  depts.forEach((counts, dept) => {
    periodDays.forEach(date => {
      const count = counts.get(date) || 0
      if (count < coverageMin) coverageLow.push({ dept, date, count, required: coverageMin })
    })
  })

  const pendingInPeriod = pendingLeaves.filter(leave => {
    if (!periodStart || !periodEnd || leave.status !== 'pending') return false
    return rangesOverlap(leave.start_date, leave.end_date, periodStart, periodEnd)
  })

  const overtimeInPeriod = overtimeRecords.filter(o => {
    if (!periodStart || !periodEnd) return false
    return o.work_date >= periodStart && o.work_date <= periodEnd
  })
  const overtimeHours = overtimeInPeriod.reduce((sum, o) => sum + Number(o.hours || 0), 0)

  const issues = []
  if (emptyByStaff.length) issues.push({
    type: 'empty',
    severity: 'high',
    title: 'Bos gun var',
    count: emptyByStaff.reduce((sum, item) => sum + item.count, 0),
    message: `${emptyByStaff.length} personelde bos gun var.`,
    items: emptyByStaff,
  })
  if (coverageLow.length) issues.push({
    type: 'coverage',
    severity: 'high',
    title: 'Eksik kisi',
    count: coverageLow.length,
    message: `${coverageLow.length} gun/bolum min kisi esiginin altinda.`,
    items: coverageLow,
  })
  if (pendingInPeriod.length) issues.push({
    type: 'pending_leave',
    severity: 'high',
    title: 'Onaysiz izin',
    count: pendingInPeriod.length,
    message: `${pendingInPeriod.length} izin talebi henuz onaylanmamis.`,
    items: pendingInPeriod,
  })
  if (offMissingByStaff.length) issues.push({
    type: 'off_missing',
    severity: 'medium',
    title: 'OFF eksik',
    count: offMissingByStaff.reduce((sum, item) => sum + item.count, 0),
    message: `${offMissingByStaff.length} personelde haftalik OFF/izin eksigi var.`,
    items: offMissingByStaff,
  })
  if (absentItems.length) issues.push({
    type: 'absent',
    severity: 'medium',
    title: 'Devamsizlik var',
    count: absentItems.length,
    message: `${absentItems.length} devamsizlik kaydi puantaja yansiyacak.`,
    items: absentItems,
  })
  issues.push({
    type: 'overtime',
    severity: 'info',
    title: overtimeInPeriod.length ? 'Mesai kontrolu' : 'Mesai yok',
    count: overtimeInPeriod.length,
    message: overtimeInPeriod.length
      ? `${overtimeInPeriod.length} mesai kaydi, toplam ${overtimeHours} saat.`
      : 'Bu donemde mesai kaydi bulunmuyor.',
    items: overtimeInPeriod,
  })

  return {
    ok: issues.every(issue => issue.severity === 'info'),
    totals: {
      staff: staffGrid.length,
      days: periodDays.length,
      cells: staffGrid.length * periodDays.length,
      empty: emptyByStaff.reduce((sum, item) => sum + item.count, 0),
      offMissing: offMissingByStaff.reduce((sum, item) => sum + item.count, 0),
      absent: absentItems.length,
      pendingLeave: pendingInPeriod.length,
      coverageLow: coverageLow.length,
      overtimeRecords: overtimeInPeriod.length,
      overtimeHours,
    },
    issues,
  }
}

// Gün adı → günIdx (0=Pzt .. 6=Paz) için başlık eşleme anahtarları.
const DAY_KEYS = [
  ['pzt', 'pazartesi', 'mon', 'monday'],
  ['sal', 'salı', 'tue', 'tuesday'],
  ['çar', 'çarşamba', 'wed', 'wednesday'],
  ['per', 'perşembe', 'thu', 'thursday'],
  ['cum', 'cuma', 'fri', 'friday'],
  ['cmt', 'cumartesi', 'sat', 'saturday'],
  ['paz', 'pazar', 'sun', 'sunday'],
]

function dayIndexFromHeader(value) {
  const text = String(value || '').toLocaleLowerCase('tr').trim()
  return DAY_KEYS.findIndex(keys => keys.some(key =>
    text === key || text.startsWith(`${key} `) || text.startsWith(`${key}\n`) || text.startsWith(`${key}.`)
  ))
}

// Excel sayfasının 2B hücre dizisini ayrıştır.
// rows: ws.eachRow ile çıkarılmış satır dizisi (her satır hücre değerleri dizisi).
// ctx: { allStaff, shiftDefs, weekDays }
// Dönüş: { error } | { matched, unmatched, entries }
//   matched: [{ staff, dayEntries }] · unmatched: [{ name, dayEntries }]
//   entries: backend'e gönderilecek düz kayıtlar.
export function parseScheduleSheet(rows, { allStaff, shiftDefs, weekDays, workLocations = [] }) {
  if (!rows.length) return { error: 'Bos dosya' }

  // Önce gerçek çizelge başlığını ara; kapak/not/navigation satırlarını başlık sanma.
  const looksLikeNameHeader = value => {
    const text = String(value || '').toLocaleLowerCase('tr')
    return text.includes('ad') || text.includes('isim') || text.includes('soyad') || text.includes('personel')
  }
  const dayHeaderCount = row => (row || []).reduce((count, value) => {
    return count + (dayIndexFromHeader(value) >= 0 ? 1 : 0)
  }, 0)
  let headerIdx = rows.findIndex(row => row.some(looksLikeNameHeader) && dayHeaderCount(row) >= 2)
  if (headerIdx === -1) headerIdx = rows.findIndex(r => r.filter(Boolean).length >= 3)
  if (headerIdx === -1) return { error: 'Baslik satiri bulunamadi' }
  const headers = rows[headerIdx].map(h => String(h || '').toLowerCase().trim())

  // Name column: first column or one containing "ad" / "isim" / "soyad"
  const detectedNameCol = headers.findIndex(h => h.includes('ad') || h.includes('isim') || h.includes('soyad') || h.includes('personel'))
  const nameCol = detectedNameCol >= 0 ? detectedNameCol : 0
  const locationCol = findLocationColumn([rows[headerIdx]])

  // Day column map
  const dayColMap = {} // dayIdx (0-6) → colIdx
  headers.forEach((h, ci) => {
    const dayIdx = dayIndexFromHeader(h)
    if (dayIdx >= 0) dayColMap[dayIdx] = ci
  })
  // If no named columns found, try to map by position (cols after name col)
  if (Object.keys(dayColMap).length === 0) {
    const startCol = Math.max(nameCol, locationCol) + 1
    for (let di = 0; di < 7; di++) {
      if (startCol + di < headers.length) dayColMap[di] = startCol + di
    }
  }

  // Build name → staff map (normalize: lowercase, trim, remove extra spaces)
  const normalize = s => String(s || '').toLowerCase().trim().replace(/\s+/g, ' ')
  const staffByName = new Map(allStaff.map(s => [normalize(s.full_name), s]))

  const matched = [], unmatched = []
  const entries = []
  const matchedLocationMap = new Map()
  const unmatchedLocationMap = new Map()
  const ambiguousLocationMap = new Map()

  rows.slice(headerIdx + 1).forEach((row) => {
    if (!row[nameCol]) return // skip empty rows
    const rawName = String(row[nameCol]).trim()
    if (!rawName) return
    const staff = staffByName.get(normalize(rawName))

    const rowLocationName = locationCol >= 0 ? String(row[locationCol] ?? '').trim() : ''
    const dayEntries = []
    for (let di = 0; di < 7; di++) {
      const colIdx = dayColMap[di]
      if (colIdx === undefined) continue
      const decorated = splitLocationDecoratedValue(row[colIdx])
      let parsed = parseShiftCell(decorated.value, shiftDefs)
      let cellLocationName = decorated.locationName || rowLocationName
      if (!parsed && decorated.alternateValue) {
        parsed = parseShiftCell(decorated.alternateValue, shiftDefs)
        if (parsed) cellLocationName = decorated.alternateLocationName || rowLocationName
      }
      if (!parsed) continue
      const location = parsed.status === 'scheduled'
        ? resolveWorkLocation(cellLocationName, workLocations)
        : { status: 'empty', location: null }
      if (cellLocationName) {
        const bucket = location.status === 'matched'
          ? matchedLocationMap
          : location.status === 'ambiguous' ? ambiguousLocationMap : unmatchedLocationMap
        if (!bucket.has(cellLocationName)) bucket.set(cellLocationName, {
          name: cellLocationName,
          count: 0,
          ...(location.location ? { id: location.location.id, matchedTo: location.location.name } : {}),
          ...(location.candidates ? { candidates: location.candidates.map(item => item.name) } : {}),
        })
        bucket.get(cellLocationName).count += 1
      }
      dayEntries.push({
        dayIdx: di,
        date: weekDays[di],
        ...parsed,
        ...(location.status === 'matched' ? {
          workLocationId: location.location.id,
          workLocationName: location.location.name,
        } : {}),
      })
    }

    if (!staff) {
      unmatched.push({ name: rawName, dayEntries })
    } else {
      matched.push({ staff, dayEntries })
      dayEntries.forEach(e => {
        entries.push({
          staff_id: staff.id,
          dept_id: staff.department_id || null,
          work_date: e.date,
          shift_def_id: e.shiftDefId,
          status: e.status,
          ...(e.workLocationId ? { work_location_id: e.workLocationId } : {}),
        })
      })
    }
  })

  return {
    matched,
    unmatched,
    entries,
    locations: {
      matched: [...matchedLocationMap.values()],
      unmatched: [...unmatchedLocationMap.values()],
      ambiguous: [...ambiguousLocationMap.values()],
      columnFound: locationCol >= 0,
    },
  }
}
