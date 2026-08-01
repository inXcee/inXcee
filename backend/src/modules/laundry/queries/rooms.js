import { getDB } from '../../../shared/db/index.js'
import { OCCUPANT_NAME_SQL, OCCUPANT_PHONE_SQL } from './items.js'
export function getPersonHistoryQuery(name) {
  const db = getDB()
  return db.prepare(`
    SELECT li.*,
           r.block, r.room_no,
           COALESCE(li.phone_override, ${OCCUPANT_PHONE_SQL}) as phone_number,
           ${OCCUPANT_NAME_SQL} as occupant_name,
           ld.delivered_at,
           CASE WHEN ld.delivered_at IS NOT NULL
             THEN ROUND((julianday(ld.delivered_at) - julianday(li.created_at)) * 24, 1)
             ELSE NULL
           END as total_hours
    FROM laundry_items li
    LEFT JOIN rooms r ON r.id = li.room_id
    LEFT JOIN laundry_deliveries ld ON ld.item_id = li.id
    WHERE (
      li.intake_name = ?
      OR ((li.intake_name IS NULL OR li.intake_name = '') AND EXISTS (
        SELECT 1 FROM room_assignments ra
        JOIN personnel p ON p.id = ra.personnel_id
        WHERE ra.room_id = li.room_id AND ra.check_out_at IS NULL
          AND p.full_name = ?
      ))
    )
    GROUP BY li.id
    ORDER BY li.created_at DESC
  `).all(name, name)
}

// ═══════════════════════════════════════════════════════════════════════════
// ROOM LAUNDRY HISTORY
// ═══════════════════════════════════════════════════════════════════════════

export function getRoomLaundryHistoryQuery(block, room_no) {
  const db = getDB()
  return db.prepare(`
    SELECT li.id, li.bag_no, li.status, li.item_count, li.urgent, li.is_premium,
           li.needs_ironing, li.notes, li.intake_name, li.garments_json,
           li.created_at, li.updated_at,
           li.delivered_name, li.file_count,
           r.block, r.room_no,
           ld.delivered_to, ld.delivered_at,
           CASE WHEN ld.delivered_at IS NOT NULL
             THEN ROUND((julianday(ld.delivered_at) - julianday(li.created_at)) * 24, 1)
             ELSE NULL
           END as total_hours
    FROM laundry_items li
    JOIN rooms r ON r.id = li.room_id
    LEFT JOIN laundry_deliveries ld ON ld.item_id = li.id
    WHERE r.block = ? AND r.room_no = ?
    ORDER BY li.created_at DESC
    LIMIT 100
  `).all(block, room_no)
}

// Faz 3 — Y blok premium oda detayı için aktif premium torbaların per-garment listesi
export function getRoomPremiumGarmentsQuery(block, room_no) {
  const db = getDB()
  const rows = db.prepare(`
    SELECT li.id AS item_id, li.bag_no, li.status AS item_status, li.created_at AS item_created_at,
           li.intake_name,
           pg.id AS garment_id, pg.garment_code, pg.garment_type, pg.brand, pg.model,
           pg.size, pg.color, pg.pattern, pg.condition_notes,
           pg.status AS garment_status, pg.delivered_to, pg.delivered_at
    FROM laundry_items li
    JOIN rooms r ON r.id = li.room_id
    LEFT JOIN premium_garments pg ON pg.item_id = li.id
    WHERE r.block = ? AND r.room_no = ?
      AND li.is_premium = 1
      AND li.status NOT IN ('delivered', 'lost')
    ORDER BY li.created_at DESC, pg.garment_code ASC
  `).all(block, room_no)

  // item bazında grupla
  const byItem = new Map()
  for (const r of rows) {
    if (!byItem.has(r.item_id)) {
      byItem.set(r.item_id, {
        item_id: r.item_id,
        bag_no: r.bag_no,
        status: r.item_status,
        created_at: r.item_created_at,
        intake_name: r.intake_name,
        garments: [],
      })
    }
    if (r.garment_id) {
      byItem.get(r.item_id).garments.push({
        id: r.garment_id,
        garment_code: r.garment_code,
        garment_type: r.garment_type,
        brand: r.brand,
        model: r.model,
        size: r.size,
        color: r.color,
        pattern: r.pattern,
        condition_notes: r.condition_notes,
        status: r.garment_status,
        delivered_to: r.delivered_to,
        delivered_at: r.delivered_at,
      })
    }
  }
  return [...byItem.values()]
}

export function getRoomLaundrySummaryQuery(block, room_no) {
  const db = getDB()
  return db.prepare(`
    SELECT
      COUNT(*) as total_given,
      SUM(CASE WHEN li.status = 'delivered' THEN 1 ELSE 0 END) as total_delivered,
      SUM(CASE WHEN li.status = 'lost' THEN 1 ELSE 0 END) as total_lost,
      SUM(CASE WHEN li.status NOT IN ('delivered', 'lost') THEN 1 ELSE 0 END) as active_count,
      ROUND(AVG(CASE WHEN ld.delivered_at IS NOT NULL
        THEN (julianday(ld.delivered_at) - julianday(li.created_at)) * 24
        ELSE NULL
      END), 1) as avg_hours,
      MAX(li.created_at) as last_intake_at
    FROM laundry_items li
    JOIN rooms r ON r.id = li.room_id
    LEFT JOIN laundry_deliveries ld ON ld.item_id = li.id
    WHERE r.block = ? AND r.room_no = ?
  `).get(block, room_no)
}

// Tüm odalar için özet — LaundryHub Odalar sekmesi grid'i
export function getAllRoomsLaundryOverviewQuery() {
  const db = getDB()
  return db.prepare(`
    SELECT
      r.id AS room_id, r.block, r.room_no,
      COUNT(li.id) AS total_count,
      SUM(CASE WHEN li.status NOT IN ('delivered','lost') THEN 1 ELSE 0 END) AS active_count,
      SUM(CASE WHEN li.status = 'delivered' THEN 1 ELSE 0 END) AS delivered_count,
      SUM(CASE WHEN li.status = 'lost' THEN 1 ELSE 0 END) AS lost_count,
      SUM(CASE WHEN li.urgent = 1 AND li.status NOT IN ('delivered','lost') THEN 1 ELSE 0 END) AS urgent_active,
      SUM(CASE WHEN li.is_premium = 1 THEN 1 ELSE 0 END) AS premium_count,
      MAX(li.created_at) AS last_intake_at,
      ROUND(AVG(CASE WHEN ld.delivered_at IS NOT NULL
        THEN (julianday(ld.delivered_at) - julianday(li.created_at)) * 24
        ELSE NULL END), 1) AS avg_hours,
      SUM(CASE WHEN li.created_at >= datetime('now','-7 days') THEN 1 ELSE 0 END) AS last_7d_count,
      SUM(CASE WHEN li.created_at >= datetime('now','-30 days') THEN 1 ELSE 0 END) AS last_30d_count,
      SUM(CASE WHEN li.created_at >= datetime('now','start of day') THEN 1 ELSE 0 END) AS today_count
    FROM rooms r
    LEFT JOIN laundry_items li ON li.room_id = r.id
    LEFT JOIN laundry_deliveries ld ON ld.item_id = li.id
    GROUP BY r.id, r.block, r.room_no
    ORDER BY r.block, CAST(r.room_no AS INTEGER), r.room_no
  `).all()
}

// Bir odanın son 14 günlük günlük dağılımı (sparkline için)
export function getRoomLaundryTrendQuery(block, room_no) {
  const db = getDB()
  return db.prepare(`
    SELECT date(li.created_at) AS day, COUNT(*) AS count
    FROM laundry_items li
    JOIN rooms r ON r.id = li.room_id
    WHERE r.block = ? AND r.room_no = ?
      AND li.created_at >= datetime('now','-14 days')
    GROUP BY day
    ORDER BY day ASC
  `).all(block, room_no)
}

// Bir odadaki kişi bazlı kırılım (intake_name'e göre teslim eden istatistiği)
export function getRoomLaundryByPersonQuery(block, room_no) {
  const db = getDB()
  return db.prepare(`
    SELECT li.intake_name AS name,
           COUNT(*) AS total,
           SUM(CASE WHEN li.status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
           SUM(CASE WHEN li.status = 'lost' THEN 1 ELSE 0 END) AS lost,
           MAX(li.created_at) AS last_intake_at
    FROM laundry_items li
    JOIN rooms r ON r.id = li.room_id
    WHERE r.block = ? AND r.room_no = ?
      AND li.intake_name IS NOT NULL AND li.intake_name != ''
    GROUP BY li.intake_name
    ORDER BY total DESC
  `).all(block, room_no)
}

// Bir odanın aktif sakinleri
export function getRoomOccupantsQuery(block, room_no) {
  const db = getDB()
  return db.prepare(`
    SELECT p.id, p.full_name, p.phone_number, p.company, ra.bed_no
    FROM rooms r
    JOIN room_assignments ra ON ra.room_id = r.id AND ra.check_out_at IS NULL
    JOIN personnel p ON p.id = ra.personnel_id
    WHERE r.block = ? AND r.room_no = ?
    ORDER BY ra.bed_no
  `).all(block, room_no)
}

// Son N gün için günlük giriş sayısı — yıllık heatmap için
export function getRoomCalendarHeatmapQuery(block, room_no, days = 365) {
  const db = getDB()
  return db.prepare(`
    SELECT date(li.created_at) AS day, COUNT(*) AS count
    FROM laundry_items li
    JOIN rooms r ON r.id = li.room_id
    WHERE r.block = ? AND r.room_no = ?
      AND li.created_at >= datetime('now', ?)
    GROUP BY day
    ORDER BY day ASC
  `).all(block, room_no, `-${days} days`)
}

// Hafta-günü × saat matrisi (7×24) — pattern analizi
export function getRoomHourDayPatternQuery(block, room_no) {
  const db = getDB()
  return db.prepare(`
    SELECT
      CAST(strftime('%w', li.created_at) AS INTEGER) AS dow,
      CAST(strftime('%H', li.created_at) AS INTEGER) AS hour,
      COUNT(*) AS count
    FROM laundry_items li
    JOIN rooms r ON r.id = li.room_id
    WHERE r.block = ? AND r.room_no = ?
    GROUP BY dow, hour
  `).all(block, room_no)
}

// Bir bloğun ortalaması — kıyaslama için
export function getBlockAverageStatsQuery(block) {
  const db = getDB()
  return db.prepare(`
    WITH room_stats AS (
      SELECT r.id AS room_id,
             COUNT(li.id) AS total,
             SUM(CASE WHEN li.status = 'lost' THEN 1 ELSE 0 END) AS lost,
             ROUND(AVG(CASE WHEN ld.delivered_at IS NOT NULL
               THEN (julianday(ld.delivered_at) - julianday(li.created_at)) * 24
               ELSE NULL END), 1) AS avg_hours,
             SUM(CASE WHEN li.created_at >= datetime('now','-30 days') THEN 1 ELSE 0 END) AS last_30d
      FROM rooms r
      LEFT JOIN laundry_items li ON li.room_id = r.id
      LEFT JOIN laundry_deliveries ld ON ld.item_id = li.id
      WHERE r.block = ?
      GROUP BY r.id
    )
    SELECT
      COUNT(*) AS room_count,
      ROUND(AVG(total), 1) AS avg_total,
      ROUND(AVG(last_30d), 1) AS avg_last_30d,
      ROUND(AVG(lost), 2) AS avg_lost,
      ROUND(AVG(avg_hours), 1) AS avg_delivery_hours
    FROM room_stats
  `).get(block)
}

// Bu odaya bağlı hasar raporları
export function getRoomDamagesQuery(block, room_no) {
  const db = getDB()
  return db.prepare(`
    SELECT d.id, d.item_id, d.description, d.photo_url, d.at_intake, d.created_at,
           li.bag_no, li.status, li.intake_name,
           u.full_name AS reported_by_name
    FROM laundry_damages d
    JOIN laundry_items li ON li.id = d.item_id
    JOIN rooms r ON r.id = li.room_id
    LEFT JOIN users u ON u.id = d.reported_by
    WHERE r.block = ? AND r.room_no = ?
    ORDER BY d.created_at DESC
    LIMIT 50
  `).all(block, room_no)
}

// Bu odanın aktif SLA ihlalleri
export function getRoomSlaViolationsQuery(block, room_no) {
  const db = getDB()
  return db.prepare(`
    SELECT li.id, li.bag_no, li.status, li.item_count, li.intake_name,
           ROUND((julianday('now') - julianday(COALESCE(li.updated_at, li.created_at))) * 24, 1) AS hours,
           sc.warning_hours, sc.critical_hours
    FROM laundry_items li
    JOIN rooms r ON r.id = li.room_id
    LEFT JOIN laundry_sla_config sc ON sc.stage = li.status
    WHERE r.block = ? AND r.room_no = ?
      AND li.status IN ('dirty','washing','ready')
      AND sc.warning_hours IS NOT NULL
      AND ROUND((julianday('now') - julianday(COALESCE(li.updated_at, li.created_at))) * 24, 1) >= sc.warning_hours
    ORDER BY hours DESC
  `).all(block, room_no)
}

// Bu odanın son torbası — "Geçen seferki gibi" otomatik doldurma için
export function getLastBagForRoomQuery(block, room_no) {
  const db = getDB()
  return db.prepare(`
    SELECT li.id, li.bag_no, li.intake_name, li.item_count, li.urgent, li.is_premium,
           li.needs_ironing, li.clothing_items, li.garments_json, li.notes, li.created_at
    FROM laundry_items li
    JOIN rooms r ON r.id = li.room_id
    WHERE r.block = ? AND r.room_no = ?
    ORDER BY li.created_at DESC, li.id DESC
    LIMIT 1
  `).get(block, room_no)
}

export function getRoomIdByBlockAndNoQuery(block, room_no) {
  const db = getDB()
  return db.prepare(`SELECT id FROM rooms WHERE block=? AND room_no=?`).get(block, room_no)
}

export function getBlockRoomActiveCountsQuery(block) {
  const db = getDB()
  return db.prepare(`
    SELECT r.room_no,
           SUM(CASE WHEN li.status NOT IN ('delivered', 'lost') THEN 1 ELSE 0 END) as active_count,
           COUNT(li.id) as total_count
    FROM rooms r
    LEFT JOIN laundry_items li ON li.room_id = r.id
    WHERE r.block = ?
    GROUP BY r.id, r.room_no
  `).all(block)
}

export function markFoundQuery(id, userId) {
  const db = getDB()
  db.prepare(`UPDATE laundry_items SET status='ready', updated_at=datetime('now') WHERE id=?`).run(id)
  db.prepare(`
    INSERT INTO laundry_history(item_id, from_status, to_status, action_by, notes)
    VALUES(?, 'lost', 'ready', ?, 'Kayıp bulundu')
  `).run(id, userId)
  return db.prepare(`SELECT * FROM laundry_items WHERE id=?`).get(id)
}

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGES
// ═══════════════════════════════════════════════════════════════════════════

