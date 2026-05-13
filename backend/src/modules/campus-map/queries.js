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
