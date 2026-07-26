import { getDB } from '../../shared/db/index.js'
import { istanbulDate } from '../../shared/time.js'
import { blockFromLegacyLocation, canonicalMaintenanceRow } from '../maintenance/location.js'

// Ariza konumundan blok adi — TEK KAYNAK. Blok adi location'in ilk kelimesidir
// ("M1 Kat 1 Oda 101" → "M1", "M1 Ortak Alan" → "M1", "M1" → "M1").
// getBlockFaults'taki SQL bunun birebir karsiligidir (location = ? OR LIKE ? || ' %');
// ikisinin ayrismadigini campus-map.test.js "rozet ile liste ayni olmali" testi korur.
export function blockOfLocation(location) {
  return blockFromLegacyLocation(location) || ''
}

// Tum bloklar icin tek seferde komuta merkezi ozet sorgusu.
// Frontend bunu cagirir, mode switcher icin gerekli butun veriler tek seferde gelir.
export function getCampusSummary(date = istanbulDate()) {
  const db = getDB()

  // 1) Doluluk, oda durumu, bos oda — rooms + room_assignments
  const occupancy = db.prepare(`
    SELECT r.block,
      COUNT(*) as total_rooms,
      SUM(CASE WHEN r.status='active' THEN r.active_beds ELSE 0 END) as total_beds,
      SUM(CASE WHEN r.status='active' THEN COALESCE(occ.cnt, 0) ELSE 0 END) as occupied,
      SUM(CASE WHEN r.status='quarantine' THEN 1 ELSE 0 END) as quarantine,
      SUM(CASE WHEN r.status='maintenance' THEN 1 ELSE 0 END) as maintenance,
      SUM(CASE WHEN r.status='active' AND COALESCE(occ.cnt, 0)=0 THEN 1 ELSE 0 END) as empty_rooms,
      SUM(CASE WHEN r.status='active' AND COALESCE(occ.cnt, 0) >= r.active_beds AND r.active_beds > 0 THEN 1 ELSE 0 END) as full_rooms
    FROM rooms r
    LEFT JOIN (
      SELECT room_id, COUNT(*) as cnt
      FROM room_assignments
      WHERE check_out_at IS NULL
      GROUP BY room_id
    ) occ ON occ.room_id = r.id
    GROUP BY r.block
  `).all()

  // 2) Acik ariza sayisi — TEK KURAL: blok adi location'in ilk kelimesidir.
  // Eskiden burada "location LIKE '%blok%Oda no%'" kullaniliyordu; o kural yalniz
  // gercek bir odaya baglanabilen arizalari sayiyor, "M1 Ortak Alan" gibi odasiz
  // kayitlari gormezden geliyordu → pin rozeti ile panel listesi celisiyordu.
  const openFaultRows = db.prepare(`
    SELECT id, location, block, room_id FROM maintenance_requests WHERE status != 'done'
  `).all()

  // 3) Bugun temizlik gorevleri
  const cleaning = db.prepare(`
    SELECT block,
      COUNT(*) as cleaning_total,
      SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) as cleaning_done,
      SUM(CASE WHEN skipped=1 THEN 1 ELSE 0 END) as cleaning_skipped
    FROM cleaning_tasks
    WHERE date(scheduled_at) = ?
    GROUP BY block
  `).all(date)

  // 4) Vardiya dagilimi — aktif personelin vardiya tipine gore blok bazinda
  // Vardiya kaydi OLMAYAN sakin eskiden COALESCE ile sessizce "gunduz" sayiliyordu;
  // bu gunduz sayisini sisiriyor ve veri eksikligini gizliyordu → ayri kova.
  const shifts = db.prepare(`
    SELECT r.block,
      SUM(CASE WHEN s.shift_type='day' THEN 1 ELSE 0 END) as day_count,
      SUM(CASE WHEN s.shift_type='night' THEN 1 ELSE 0 END) as night_count,
      SUM(CASE WHEN s.shift_type IS NULL OR s.shift_type NOT IN ('day','night') THEN 1 ELSE 0 END) as unknown_count
    FROM room_assignments ra
    JOIN rooms r ON r.id = ra.room_id
    JOIN personnel p ON p.id = ra.personnel_id
    LEFT JOIN shifts s ON s.personnel_id = p.id
    WHERE ra.check_out_at IS NULL
    GROUP BY r.block
  `).all()

  // 5) Sirket dagilimi (top 3 per block)
  const companies = db.prepare(`
    SELECT r.block, p.company, COUNT(*) as cnt
    FROM room_assignments ra
    JOIN rooms r ON r.id = ra.room_id
    JOIN personnel p ON p.id = ra.personnel_id
    WHERE ra.check_out_at IS NULL AND p.company IS NOT NULL AND p.company != ''
    GROUP BY r.block, p.company
    ORDER BY r.block, cnt DESC
  `).all()

  // Birlestir
  const result = {}
  for (const row of occupancy) {
    const occPct = row.total_beds > 0 ? Math.round((row.occupied / row.total_beds) * 100) : 0
    result[row.block] = {
      block: row.block,
      total_rooms: row.total_rooms,
      total_beds: row.total_beds,
      occupied: row.occupied,
      occupancy_pct: occPct,
      empty_rooms: row.empty_rooms,
      full_rooms: row.full_rooms,
      quarantine: row.quarantine,
      maintenance: row.maintenance,
      open_faults: 0,
      cleaning_total: 0,
      cleaning_done: 0,
      cleaning_skipped: 0,
      cleaning_pct: 0,
      day_count: 0,
      night_count: 0,
      unknown_count: 0,
      top_companies: [],
    }
  }
  for (const row of openFaultRows) {
    const block = canonicalMaintenanceRow(db, row).canonical_block
    if (block && result[block]) result[block].open_faults += 1
  }
  for (const c of cleaning) {
    if (result[c.block]) {
      const r = result[c.block]
      r.cleaning_total = c.cleaning_total
      r.cleaning_done = c.cleaning_done
      r.cleaning_skipped = c.cleaning_skipped
      r.cleaning_pct = c.cleaning_total > 0 ? Math.round((c.cleaning_done / c.cleaning_total) * 100) : 0
    }
  }
  for (const s of shifts) {
    if (result[s.block]) {
      result[s.block].day_count = s.day_count
      result[s.block].night_count = s.night_count
      result[s.block].unknown_count = s.unknown_count
    }
  }
  for (const c of companies) {
    if (result[c.block] && result[c.block].top_companies.length < 3) {
      result[c.block].top_companies.push({ company: c.company, count: c.cnt })
    }
  }

  return result
}

// ── Blok detayi (harita panelinde inline gosterim) ───────────────────
// Blok adi maintenance_requests.location'in ILK KELIMESIDIR ("M1 Kat 1 Oda 101").
// Bosluklu on-ek eslesmesi 'A' ile 'A1'i karistirmaz — bu yuzden LIKE 'A %'.
export function getBlockFaults(block) {
  const db = getDB()
  return db.prepare(`
    SELECT mr.id, mr.location, mr.description, mr.priority, mr.status, mr.opened_at,
      mr.block, mr.room_id,
      t.full_name AS technician_name
    FROM maintenance_requests mr
    LEFT JOIN technicians t ON t.id = mr.assigned_to
    WHERE mr.status != 'done'
    ORDER BY CASE mr.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, mr.opened_at DESC
    LIMIT 500
  `).all()
    .map(row => canonicalMaintenanceRow(db, row))
    .filter(row => row.canonical_block === block)
    .slice(0, 100)
    .map(({ canonical_block, canonical_room_id, ...row }) => ({
      ...row,
      block: row.block || canonical_block,
      room_id: row.room_id || canonical_room_id,
    }))
}

export function getBlockCleaning(block, today = istanbulDate()) {
  const row = getDB().prepare(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) AS done,
      SUM(CASE WHEN skipped = 1 THEN 1 ELSE 0 END) AS skipped
    FROM cleaning_tasks
    WHERE block = ? AND date(scheduled_at) = ?
  `).get(block, today)
  const total = row?.total || 0
  const done = row?.done || 0
  const skipped = row?.skipped || 0
  return { total, done, skipped, pending: Math.max(0, total - done - skipped), pct: total ? Math.round((done / total) * 100) : 0 }
}

export function getBlockShiftTracking(block) {
  const residents = getDB().prepare(`
    SELECT
      p.id AS personnel_id,
      p.full_name,
      COALESCE(NULLIF(TRIM(p.company), ''), 'Şirket belirtilmemiş') AS company,
      p.job_title,
      r.id AS room_id,
      r.room_no,
      r.floor,
      ra.bed_no,
      CASE
        WHEN s.shift_type = 'day' THEN 'day'
        WHEN s.shift_type = 'night' THEN 'night'
        ELSE 'unknown'
      END AS shift_type,
      s.start_hour,
      s.end_hour
    FROM room_assignments ra
    JOIN rooms r ON r.id = ra.room_id
    JOIN personnel p ON p.id = ra.personnel_id
    LEFT JOIN shifts s ON s.id = (
      SELECT latest.id
      FROM shifts latest
      WHERE latest.personnel_id = p.id
      ORDER BY latest.id DESC
      LIMIT 1
    )
    WHERE ra.check_out_at IS NULL
      AND r.block = ?
    ORDER BY r.floor, r.room_no, ra.bed_no, p.full_name
  `).all(block)

  const day = residents.filter(person => person.shift_type === 'day').length
  const night = residents.filter(person => person.shift_type === 'night').length
  const unknown = residents.length - day - night
  return {
    total: residents.length,
    day,
    night,
    unknown,
    coverage_pct: residents.length ? Math.round(((day + night) / residents.length) * 100) : 100,
    residents,
  }
}

function taskStatus(task) {
  if (task.completed_at) return 'done'
  if (Number(task.skipped || 0) === 1) return 'skipped'
  return 'pending'
}

export function getBlockCleaningTracking(block, today = istanbulDate(), shiftTracking = null) {
  const db = getDB()
  const tasks = db.prepare(`
    SELECT
      ct.id, ct.area, ct.block, ct.floor, ct.task_type, ct.scheduled_at,
      ct.completed_at, ct.skipped, ct.skip_reason, ct.assigned_to,
      ct.verified_by_qr, ct.qr_location, ct.photo_url,
      u.full_name AS assignee_name,
      w.full_name AS worker_name,
      r.id AS room_id,
      r.room_no,
      r.no_clean,
      (SELECT COUNT(*) FROM cleaning_task_photos photo WHERE photo.task_id = ct.id) AS photo_count
    FROM cleaning_tasks ct
    LEFT JOIN users u ON u.id = ct.assigned_to
    LEFT JOIN staff w ON w.id = ct.completed_by_worker_id
    LEFT JOIN rooms r
      ON r.block = ct.block
      AND ct.qr_location = (ct.block || '-' || r.room_no)
    WHERE ct.block = ?
      AND date(ct.scheduled_at) = ?
    ORDER BY ct.floor, CASE ct.task_type WHEN 'room' THEN 0 ELSE 1 END, ct.area
  `).all(block, today)

  const tracking = shiftTracking || getBlockShiftTracking(block)
  const residentsByRoom = new Map()
  for (const resident of tracking.residents) {
    if (!residentsByRoom.has(resident.room_id)) residentsByRoom.set(resident.room_id, [])
    residentsByRoom.get(resident.room_id).push(resident)
  }

  const detailedTasks = tasks.map(task => {
    const residents = task.room_id ? (residentsByRoom.get(task.room_id) || []) : []
    const day = residents.filter(person => person.shift_type === 'day').length
    const night = residents.filter(person => person.shift_type === 'night').length
    const unknown = residents.length - day - night
    return {
      ...task,
      status: taskStatus(task),
      companies: [...new Set(residents.map(person => person.company))].sort((left, right) => left.localeCompare(right, 'tr')),
      shift_profile: { day, night, unknown, total: residents.length },
    }
  })

  const countStatus = status => detailedTasks.filter(task => task.status === status).length
  const total = detailedTasks.length
  const done = countStatus('done')
  const skipped = countStatus('skipped')
  const pending = countStatus('pending')
  const floors = [...new Set(detailedTasks.map(task => task.floor).filter(floor => floor !== null))]
    .sort((left, right) => Number(left) - Number(right))
    .map(floor => {
      const floorTasks = detailedTasks.filter(task => task.floor === floor)
      const floorDone = floorTasks.filter(task => task.status === 'done').length
      return {
        floor,
        total: floorTasks.length,
        done: floorDone,
        pending: floorTasks.filter(task => task.status === 'pending').length,
        skipped: floorTasks.filter(task => task.status === 'skipped').length,
        pct: floorTasks.length ? Math.round((floorDone / floorTasks.length) * 100) : 0,
      }
    })

  return {
    total,
    done,
    skipped,
    pending,
    pct: total ? Math.round((done / total) * 100) : 0,
    room_tasks: detailedTasks.filter(task => task.task_type === 'room').length,
    common_area_tasks: detailedTasks.filter(task => task.task_type !== 'room').length,
    photo_evidence_count: detailedTasks.filter(task => Number(task.photo_count || 0) > 0).length,
    qr_verified_count: detailedTasks.filter(task => Number(task.verified_by_qr || 0) === 1).length,
    night_shift_room_count: new Set(detailedTasks
      .filter(task => task.room_id && task.shift_profile.night > 0)
      .map(task => task.room_id)).size,
    floors,
    tasks: detailedTasks,
  }
}

export function getBlockCompanyTracking(block, shiftTracking = null, cleaningTracking = null) {
  const tracking = shiftTracking || getBlockShiftTracking(block)
  const byCompany = new Map()
  for (const resident of tracking.residents) {
    if (!byCompany.has(resident.company)) {
      byCompany.set(resident.company, {
        company: resident.company,
        people_count: 0,
        day_count: 0,
        night_count: 0,
        unknown_count: 0,
        rooms: new Map(),
      })
    }
    const company = byCompany.get(resident.company)
    company.people_count += 1
    company[`${resident.shift_type}_count`] += 1
    company.rooms.set(resident.room_id, {
      room_id: resident.room_id,
      room_no: resident.room_no,
      floor: resident.floor,
    })
  }

  const companies = Array.from(byCompany.values()).map(company => {
    const rooms = Array.from(company.rooms.values())
      .sort((left, right) => Number(left.floor) - Number(right.floor) || String(left.room_no).localeCompare(String(right.room_no), 'tr'))
    const roomIds = new Set(rooms.map(room => room.room_id))
    const relatedTasks = cleaningTracking
      ? cleaningTracking.tasks.filter(task => task.room_id && roomIds.has(task.room_id))
      : null
    const cleaning = relatedTasks ? {
      total: relatedTasks.length,
      done: relatedTasks.filter(task => task.status === 'done').length,
      pending: relatedTasks.filter(task => task.status === 'pending').length,
      skipped: relatedTasks.filter(task => task.status === 'skipped').length,
      pct: relatedTasks.length
        ? Math.round((relatedTasks.filter(task => task.status === 'done').length / relatedTasks.length) * 100)
        : 0,
    } : null
    const knownShiftCount = company.day_count + company.night_count
    const dominant_shift = knownShiftCount === 0
      ? 'unknown'
      : company.night_count > company.day_count ? 'night'
        : company.day_count > company.night_count ? 'day' : 'mixed'
    return {
      company: company.company,
      people_count: company.people_count,
      room_count: rooms.length,
      share_pct: tracking.total ? Math.round((company.people_count / tracking.total) * 100) : 0,
      day_count: company.day_count,
      night_count: company.night_count,
      unknown_count: company.unknown_count,
      dominant_shift,
      rooms,
      cleaning,
    }
  }).sort((left, right) => right.people_count - left.people_count || left.company.localeCompare(right.company, 'tr'))

  return {
    total_companies: companies.length,
    unassigned_company_count: companies
      .filter(company => company.company === 'Şirket belirtilmemiş')
      .reduce((total, company) => total + company.people_count, 0),
    companies,
  }
}

// Odalar + o odada kalanlar (oda tiklaninca sagdaki kisi paneli bunu kullanir).
export function getBlockRoomsWithOccupants(block) {
  const db = getDB()
  const rooms = db.prepare(`
    SELECT r.id, r.room_no, r.floor, r.status, r.capacity, r.active_beds, r.notes,
      (SELECT COUNT(*) FROM room_assignments ra WHERE ra.room_id = r.id AND ra.check_out_at IS NULL) AS occupied
    FROM rooms r WHERE r.block = ?
    ORDER BY r.floor, r.room_no
  `).all(block)
  if (!rooms.length) return []
  const occupants = db.prepare(`
    SELECT ra.room_id, p.id AS personnel_id, p.full_name, p.company, ra.bed_no, ra.assigned_at
    FROM room_assignments ra
    JOIN rooms r ON r.id = ra.room_id
    JOIN personnel p ON p.id = ra.personnel_id
    WHERE r.block = ? AND ra.check_out_at IS NULL
    ORDER BY ra.bed_no, p.full_name
  `).all(block)
  const byRoom = new Map()
  for (const person of occupants) {
    if (!byRoom.has(person.room_id)) byRoom.set(person.room_id, [])
    byRoom.get(person.room_id).push({
      personnel_id: person.personnel_id,
      full_name: person.full_name,
      company: person.company || '',
      bed_no: person.bed_no ?? null,
      assigned_at: person.assigned_at || null,
    })
  }
  return rooms.map(room => ({ ...room, occupants: byRoom.get(room.id) || [] }))
}

// Kampüs rapor sihirbazının oda ve yerleşim veri seti. Tek blok seçildiğinde
// parametreli filtre uygulanır; kampüs raporunda aynı sorgu tüm blokları döndürür.
export function getCampusReportRooms(block = null) {
  const db = getDB()
  const rows = db.prepare(`
    SELECT
      r.id AS room_id, r.block, r.room_no, r.floor, r.status, r.capacity,
      r.active_beds, r.notes,
      ra.bed_no, ra.assigned_at,
      p.id AS personnel_id, p.full_name, p.company, p.job_title,
      p.phone_number, p.check_in_date,
      d.name AS department_name
    FROM rooms r
    LEFT JOIN room_assignments ra
      ON ra.room_id = r.id AND ra.check_out_at IS NULL
    LEFT JOIN personnel p ON p.id = ra.personnel_id
    LEFT JOIN departments d ON d.id = p.department_id
    WHERE (? IS NULL OR r.block = ?)
    ORDER BY r.block, r.floor, r.room_no, ra.bed_no, p.full_name
  `).all(block, block)

  const rooms = new Map()
  for (const row of rows) {
    if (!rooms.has(row.room_id)) {
      rooms.set(row.room_id, {
        id: row.room_id,
        block: row.block,
        room_no: row.room_no,
        floor: row.floor,
        status: row.status,
        capacity: row.capacity,
        active_beds: row.active_beds,
        notes: row.notes || '',
        occupants: [],
      })
    }
    if (row.personnel_id) {
      rooms.get(row.room_id).occupants.push({
        personnel_id: row.personnel_id,
        full_name: row.full_name,
        company: row.company || '',
        job_title: row.job_title || '',
        department_name: row.department_name || '',
        phone_number: row.phone_number || '',
        check_in_date: row.check_in_date || null,
        bed_no: row.bed_no ?? null,
        assigned_at: row.assigned_at || null,
      })
    }
  }
  return Array.from(rooms.values()).map(room => ({
    ...room,
    occupied: room.occupants.length,
  }))
}

// Per-blok son N gun doluluk zaman serisi (oda durumu degisiklikleri historik takip edilmedigi icin
// sadece o tarihte aktif room_assignment'lara gore occupancy hesaplanir; total_beds suanki aktif yatak)
export function getCampusTimeseries(days = 7) {
  const db = getDB()
  const n = Math.max(2, Math.min(30, Number(days) || 7))
  const dateSeries = db.prepare(`
    WITH RECURSIVE dates(d) AS (
      SELECT date('now', '-' || (? - 1) || ' days')
      UNION ALL SELECT date(d, '+1 day') FROM dates WHERE d < date('now')
    )
    SELECT d FROM dates
  `).all(n).map(r => r.d)

  // Tum bloklarin guncel total_beds'leri
  const totals = db.prepare(`
    SELECT block, SUM(active_beds) as total_beds, COUNT(*) as total_rooms
    FROM rooms WHERE status='active'
    GROUP BY block
  `).all()

  // Tum aktif assignment'lari cekip her tarih icin filtreleyelim
  const assignments = db.prepare(`
    SELECT r.block, ra.assigned_at, ra.check_out_at
    FROM room_assignments ra
    JOIN rooms r ON r.id = ra.room_id
  `).all()

  const result = {}
  for (const t of totals) {
    result[t.block] = {
      total_beds: t.total_beds,
      total_rooms: t.total_rooms,
      points: dateSeries.map(d => ({ date: d, occupied: 0, occupancy_pct: 0 })),
    }
  }
  for (const a of assignments) {
    const rec = result[a.block]
    if (!rec) continue
    const start = a.assigned_at?.slice(0, 10)
    const end = a.check_out_at?.slice(0, 10)
    for (const pt of rec.points) {
      if (start && start <= pt.date && (!end || end > pt.date)) {
        pt.occupied++
      }
    }
  }
  for (const k of Object.keys(result)) {
    const r = result[k]
    for (const pt of r.points) {
      pt.occupancy_pct = r.total_beds > 0 ? Math.round((pt.occupied / r.total_beds) * 100) : 0
    }
  }
  return result
}

export function getMaintenanceDataQuality() {
  const db = getDB()
  const rows = db.prepare(`
    SELECT id, location, description, priority, status, opened_at, block, room_id
    FROM maintenance_requests
    WHERE status != 'done'
    ORDER BY opened_at DESC
  `).all().map(row => canonicalMaintenanceRow(db, row))
  const unmappedFaults = rows
    .filter(row => !row.canonical_block)
    .map(({ canonical_block, canonical_room_id, ...row }) => row)
  return {
    unmapped_fault_count: unmappedFaults.length,
    unmapped_faults: unmappedFaults,
  }
}

export function getUnknownShiftQueue() {
  return getDB().prepare(`
    SELECT p.id AS personnel_id, p.full_name, r.block, r.room_no
    FROM room_assignments ra
    JOIN rooms r ON r.id = ra.room_id
    JOIN personnel p ON p.id = ra.personnel_id
    LEFT JOIN shifts s ON s.personnel_id = p.id
    WHERE ra.check_out_at IS NULL
      AND (s.shift_type IS NULL OR s.shift_type NOT IN ('day','night'))
    ORDER BY r.block, r.room_no, p.full_name
    LIMIT 250
  `).all()
}

export function getOpenFaultQueue() {
  const db = getDB()
  return db.prepare(`
    SELECT mr.id, mr.location, mr.description, mr.priority, mr.status, mr.opened_at,
      mr.block, mr.room_id, t.full_name AS technician_name
    FROM maintenance_requests mr
    LEFT JOIN technicians t ON t.id = mr.assigned_to
    WHERE mr.status != 'done'
    ORDER BY CASE mr.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
      mr.opened_at ASC
    LIMIT 250
  `).all().map(row => {
    const canonical = canonicalMaintenanceRow(db, row)
    return {
      ...row,
      block: row.block || canonical.canonical_block,
      room_id: row.room_id || canonical.canonical_room_id,
    }
  })
}

export function getCleaningQueue(date = istanbulDate()) {
  return getDB().prepare(`
    SELECT id, area, block, floor, task_type, qr_location, assigned_to,
      scheduled_at, skipped, skip_reason
    FROM cleaning_tasks
    WHERE date(scheduled_at) = ? AND completed_at IS NULL AND COALESCE(skipped, 0) = 0
    ORDER BY block, floor, area
    LIMIT 250
  `).all(date)
}

export function buildBlockHealth(block) {
  const cleaningRemaining = Math.max(0, Number(block.cleaning_total || 0) - Number(block.cleaning_done || 0))
  const occupancy = Number(block.occupancy_pct || 0)
  const pressure = occupancy >= 100 ? 20 : occupancy >= 95 ? 12 : occupancy >= 90 ? 6 : 0
  const risk = Math.min(100,
    Number(block.open_faults || 0) * 18
    + Number(block.quarantine || 0) * 14
    + Number(block.maintenance || 0) * 10
    + Math.min(cleaningRemaining, 10) * 2
    + pressure
  )
  return { risk_score: risk, health_score: Math.max(0, 100 - risk) }
}

export function buildCampusHealth(blocks, dataQuality) {
  const values = Object.values(blocks || {})
  const risks = values.map(block => buildBlockHealth(block).risk_score)
  const averageRisk = risks.length ? risks.reduce((sum, value) => sum + value, 0) / risks.length : 0
  let healthScore = Math.max(0, Math.round(100 - averageRisk))
  const hasDataIssue = Number(dataQuality?.unmapped_fault_count || 0) > 0
  if (hasDataIssue) healthScore = Math.min(79, healthScore)
  const status = hasDataIssue
    ? 'data_issue'
    : healthScore >= 85 ? 'healthy' : healthScore >= 65 ? 'watch' : 'intervention'
  return { health_score: healthScore, status }
}
