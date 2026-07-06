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
        days: {}
      })
    }
  })

  // Sort by dept then name
  return Array.from(result.values()).sort((a, b) => {
    if (a.dept_name && b.dept_name && a.dept_name !== b.dept_name) return a.dept_name.localeCompare(b.dept_name, 'tr')
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
// Kodlama: i/İ/izin/tatil/off → izin; 1/G* → 1.vardiya; 2/A* → 2.vardiya;
// 3/Ge* → 3.vardiya; sayısal 1..N → N.vardiya. shiftDefs sırası belirleyici.
export function parseShiftCell(val, shiftDefs) {
  if (!val && val !== 0) return null
  const v = String(val).toLowerCase().trim()
  if (!v || v === '-' || v === '') return null
  if (v === 'i' || v === 'İ' || v === 'izin' || v === 'tatil' || v === 'off') return { shiftDefId: null, status: 'on_leave' }
  if (v === '1' || v.startsWith('g') && !v.startsWith('ge')) return { shiftDefId: shiftDefs[0]?.id || null, status: 'scheduled' }
  if (v === '2' || v.startsWith('a')) return { shiftDefId: shiftDefs[1]?.id || null, status: 'scheduled' }
  if (v === '3' || v.startsWith('ge')) return { shiftDefId: shiftDefs[2]?.id || null, status: 'scheduled' }
  // Numeric: 1/2/3
  const n = parseInt(v)
  if (n >= 1 && n <= shiftDefs.length) return { shiftDefId: shiftDefs[n - 1]?.id || null, status: 'scheduled' }
  return null
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

// Excel sayfasının 2B hücre dizisini ayrıştır.
// rows: ws.eachRow ile çıkarılmış satır dizisi (her satır hücre değerleri dizisi).
// ctx: { allStaff, shiftDefs, weekDays }
// Dönüş: { error } | { matched, unmatched, entries }
//   matched: [{ staff, dayEntries }] · unmatched: [{ name, dayEntries }]
//   entries: backend'e gönderilecek düz kayıtlar.
export function parseScheduleSheet(rows, { allStaff, shiftDefs, weekDays }) {
  if (!rows.length) return { error: 'Bos dosya' }

  // Detect header row (first row with at least 3 cells)
  const headerIdx = rows.findIndex(r => r.filter(Boolean).length >= 3)
  if (headerIdx === -1) return { error: 'Baslik satiri bulunamadi' }
  const headers = rows[headerIdx].map(h => String(h || '').toLowerCase().trim())

  // Name column: first column or one containing "ad" / "isim" / "soyad"
  const nameCol = headers.findIndex(h => h.includes('ad') || h.includes('isim') || h === '') || 0

  // Day column map
  const dayColMap = {} // dayIdx (0-6) → colIdx
  headers.forEach((h, ci) => {
    DAY_KEYS.forEach((keys, di) => {
      if (keys.some(k => h.startsWith(k))) dayColMap[di] = ci
    })
  })
  // If no named columns found, try to map by position (cols after name col)
  if (Object.keys(dayColMap).length === 0) {
    const startCol = nameCol + 1
    for (let di = 0; di < 7; di++) {
      if (startCol + di < headers.length) dayColMap[di] = startCol + di
    }
  }

  // Build name → staff map (normalize: lowercase, trim, remove extra spaces)
  const normalize = s => String(s || '').toLowerCase().trim().replace(/\s+/g, ' ')
  const staffByName = new Map(allStaff.map(s => [normalize(s.full_name), s]))

  const matched = [], unmatched = []
  const entries = []

  rows.slice(headerIdx + 1).forEach((row) => {
    if (!row[nameCol]) return // skip empty rows
    const rawName = String(row[nameCol]).trim()
    if (!rawName) return
    const staff = staffByName.get(normalize(rawName))

    const dayEntries = []
    for (let di = 0; di < 7; di++) {
      const colIdx = dayColMap[di]
      if (colIdx === undefined) continue
      const parsed = parseShiftCell(row[colIdx], shiftDefs)
      if (!parsed) continue
      dayEntries.push({ dayIdx: di, date: weekDays[di], ...parsed })
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
        })
      })
    }
  })

  return { matched, unmatched, entries }
}
