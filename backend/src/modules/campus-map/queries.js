import { getDB } from '../../shared/db/index.js'

// Tum bloklar icin tek seferde komuta merkezi ozet sorgusu.
// Frontend bunu cagirir, mode switcher icin gerekli butun veriler tek seferde gelir.
export function getCampusSummary() {
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

  // 2) Acik ariza sayisi — maintenance_requests location LIKE '%block%'
  const faults = db.prepare(`
    SELECT r.block, COUNT(*) as open_faults
    FROM maintenance_requests mr
    JOIN rooms r ON mr.location LIKE '%' || r.block || '%Oda ' || r.room_no || '%'
    WHERE mr.status != 'done'
    GROUP BY r.block
  `).all()

  // 3) Bugun temizlik gorevleri
  const today = new Date().toISOString().slice(0, 10)
  const cleaning = db.prepare(`
    SELECT block,
      COUNT(*) as cleaning_total,
      SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) as cleaning_done,
      SUM(CASE WHEN skipped=1 THEN 1 ELSE 0 END) as cleaning_skipped
    FROM cleaning_tasks
    WHERE date(scheduled_at) = ?
    GROUP BY block
  `).all(today)

  // 4) Vardiya dagilimi — aktif personelin vardiya tipine gore blok bazinda
  const shifts = db.prepare(`
    SELECT r.block,
      SUM(CASE WHEN COALESCE(s.shift_type,'day')='day' THEN 1 ELSE 0 END) as day_count,
      SUM(CASE WHEN s.shift_type='night' THEN 1 ELSE 0 END) as night_count
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
      top_companies: [],
    }
  }
  for (const f of faults) {
    if (result[f.block]) result[f.block].open_faults = f.open_faults
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
  return getDB().prepare(`
    SELECT mr.id, mr.location, mr.description, mr.priority, mr.status, mr.opened_at,
      t.full_name AS technician_name
    FROM maintenance_requests mr
    LEFT JOIN technicians t ON t.id = mr.assigned_to
    WHERE mr.status != 'done' AND (mr.location = ? OR mr.location LIKE ? || ' %')
    ORDER BY CASE mr.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, mr.opened_at DESC
    LIMIT 100
  `).all(block, block)
}

export function getBlockCleaning(block, today = new Date().toISOString().slice(0, 10)) {
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

// Odalar + o odada kalanlar (oda tiklaninca sagdaki kisi paneli bunu kullanir).
export function getBlockRoomsWithOccupants(block) {
  const db = getDB()
  const rooms = db.prepare(`
    SELECT r.id, r.room_no, r.floor, r.status, r.active_beds, r.notes,
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
