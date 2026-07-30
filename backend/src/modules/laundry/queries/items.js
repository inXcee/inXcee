import { getDB } from '../../../shared/db/index.js'

// ═══════════════════════════════════════════════════════════════════════════
// ITEMS
// ═══════════════════════════════════════════════════════════════════════════

export function insertItemQuery({
  room_id, item_count = 1, item_details, notes, urgent = 0, photo_url,
  phone_override, intake_name, intake_signature, clothing_items, garments_json,
  needs_ironing = 0, is_premium = 0, created_by, status = 'dirty',
  client_request_id = null, tracking_mode = 'legacy',
}) {
  const db = getDB()
  const r = db.prepare(`
    INSERT INTO laundry_items(
      room_id, status, item_count, item_details, notes, urgent, photo_url,
      phone_override, intake_name, intake_signature, clothing_items, garments_json,
      needs_ironing, is_premium, created_by, client_request_id, tracking_mode, updated_at
    )
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    room_id, status, item_count, item_details || null, notes || null,
    urgent ? 1 : 0, photo_url || null, phone_override || null,
    intake_name || null, intake_signature || null,
    clothing_items ? (typeof clothing_items === 'string' ? clothing_items : JSON.stringify(clothing_items)) : null,
    garments_json ? (typeof garments_json === 'string' ? garments_json : JSON.stringify(garments_json)) : null,
    needs_ironing ? 1 : 0, is_premium ? 1 : 0, created_by,
    client_request_id || null, tracking_mode
  )
  return r.lastInsertRowid
}

// Dashboard özeti — laundry rolünün erişebildiği hafif sayım (durum bazlı + aktif/acil/bugün-teslim).
export function getLaundrySummaryQuery() {
  const db = getDB()
  const counts = {}
  for (const r of db.prepare(`SELECT status, COUNT(*) c FROM laundry_items GROUP BY status`).all()) {
    counts[r.status] = r.c
  }
  const active = db.prepare(`SELECT COUNT(*) c FROM laundry_items WHERE status NOT IN ('delivered','lost')`).get().c
  const urgent = db.prepare(`SELECT COUNT(*) c FROM laundry_items WHERE urgent=1 AND status NOT IN ('delivered','lost')`).get().c
  const delivered_today = db.prepare(`SELECT COUNT(*) c FROM laundry_items WHERE status='delivered' AND date(updated_at)=date('now')`).get().c
  return { counts, active, urgent, delivered_today }
}

// DİKKAT: collected_by kolonunun FK'si legacy `avs_workers` tablosunu gösterir,
// oysa kiosk operatörü artık `staff.id`. Ham staff id yazmak FOREIGN KEY
// constraint failed veriyordu (uç 500 dönüyordu). Legacy karşılığı varsa oraya
// yazılır; "kim topladı" bilgisinin asıl yeri FK'siz last_modified_worker_id —
// modülün diğer uçlarında da staff id bu kolonda tutuluyor.
export function collectItemQuery(id, workerId) {
  const db = getDB()
  const legacyId = workerId
    ? db.prepare('SELECT a.id FROM staff s JOIN avs_workers a ON a.id = s.legacy_avs_id WHERE s.id=?')
      .get(workerId)?.id ?? null
    : null
  db.prepare(`
    UPDATE laundry_items
    SET status='dirty', collected_by=?, collected_at=strftime('%s','now'),
        last_modified_worker_id=?, last_modified_at=datetime('now'),
        updated_at=datetime('now')
    WHERE id=? AND status='pending_collection'
  `).run(legacyId, workerId || null, id)
}

export function generateBagNoQuery(id) {
  return 'T-' + String(id).padStart(5, '0')
}

export function setBagNoQuery(id) {
  const db = getDB()
  const bagNo = generateBagNoQuery(id)
  db.prepare(`UPDATE laundry_items SET bag_no=? WHERE id=?`).run(bagNo, id)
  return bagNo
}

// ═══════════════════════════════════════════════════════════════════════════
// BLOCK CONFIG
// ═══════════════════════════════════════════════════════════════════════════

export function getBlockConfigQuery() {
  const db = getDB()
  return db.prepare(`SELECT * FROM laundry_block_config ORDER BY block ASC`).all()
}

export function upsertBlockConfigQuery(block, is_premium, userId) {
  const db = getDB()
  db.prepare(`
    INSERT INTO laundry_block_config(block, is_premium, updated_by, updated_at)
    VALUES(?, ?, ?, datetime('now'))
    ON CONFLICT(block) DO UPDATE SET
      is_premium=excluded.is_premium,
      updated_by=excluded.updated_by,
      updated_at=excluded.updated_at
  `).run(block, is_premium ? 1 : 0, userId || null)
  return db.prepare(`SELECT * FROM laundry_block_config WHERE block=?`).get(block)
}

export function isBlockPremiumQuery(block) {
  const db = getDB()
  const row = db.prepare(`SELECT is_premium FROM laundry_block_config WHERE block=?`).get(block)
  if (row) return row.is_premium === 1
  // Konfigürasyonda yoksa: M* ve S* blokları değilse premium kabul et
  return !block.startsWith('M') && !block.startsWith('S')
}

export function getItemQuery(id) {
  const db = getDB()
  return db.prepare(`
    SELECT li.*,
           r.block, r.room_no, r.floor,
           u.full_name as created_by_name,
           m.name as machine_name,
           (SELECT COUNT(*) FROM laundry_damages WHERE item_id = li.id) as damage_count,
           COALESCE(li.phone_override, p.phone_number) as phone_number,
           p.full_name as occupant_name,
           li.intake_name,
           li.clothing_items,
           (SELECT COUNT(*) FROM laundry_items li2
            WHERE li2.room_id = li.room_id
            AND li2.status NOT IN ('delivered','lost')) as room_active_count,
           lv.all_present,
           lv.missing_notes as verification_notes
    FROM laundry_items li
    LEFT JOIN rooms r ON r.id = li.room_id
    LEFT JOIN users u ON u.id = li.created_by
    LEFT JOIN laundry_machines m ON m.id = li.machine_id
    LEFT JOIN room_assignments ra ON ra.room_id = li.room_id AND ra.check_out_at IS NULL
    LEFT JOIN personnel p ON p.id = ra.personnel_id
    LEFT JOIN laundry_verifications lv ON lv.item_id = li.id
      AND lv.stage IN ('washing_to_ready','ironing_to_ready')
      AND lv.rowid = (
        SELECT MAX(rowid) FROM laundry_verifications
        WHERE item_id = li.id AND stage IN ('washing_to_ready','ironing_to_ready')
      )
    WHERE li.id = ?
  `).get(id)
}

export function insertVerificationQuery({ item_id, stage, verified_by, items_json, missing_notes, all_present }) {
  const db = getDB()
  const result = db.prepare(`
    INSERT INTO laundry_verifications(item_id, stage, verified_by, items_json, missing_notes, all_present)
    VALUES (?,?,?,?,?,?)
  `).run(item_id, stage, verified_by,
    typeof items_json === 'string' ? items_json : JSON.stringify(items_json),
    missing_notes || null,
    all_present ? 1 : 0)
  return db.prepare('SELECT * FROM laundry_verifications WHERE id=?').get(result.lastInsertRowid)
}

export function getVerificationsForItemQuery(itemId) {
  const db = getDB()
  return db.prepare('SELECT * FROM laundry_verifications WHERE item_id=? ORDER BY verified_at').all(itemId)
}

export function listItemsQuery({ status, urgent, sla_only, search } = {}) {
  const db = getDB()
  const conditions = []
  const params = []

  // Only exclude delivered if we're not specifically querying for delivered
  if (!status || status !== 'delivered') {
    conditions.push("li.status != 'delivered'")
  }

  if (status) { conditions.push('li.status = ?'); params.push(status) }
  if (urgent) { conditions.push('li.urgent = 1') }
  if (search) {
    conditions.push("(r.block || ' ' || r.room_no LIKE ? OR li.notes LIKE ? OR li.intake_name LIKE ?)")
    params.push(`%${search}%`, `%${search}%`, `%${search}%`)
  }
  if (sla_only) {
    conditions.push(`(
      SELECT CASE
        WHEN li.status='dirty' THEN (julianday('now') - julianday(li.created_at)) * 24
        WHEN li.status IN ('washing','ready') THEN (julianday('now') - julianday(li.updated_at)) * 24
        ELSE 0
      END
    ) >= COALESCE((SELECT warning_hours FROM laundry_sla_config WHERE stage = li.status LIMIT 1), 9999)`)
  }

  const where = conditions.join(' AND ')
  return db.prepare(`
    SELECT li.*,
           r.block, r.room_no,
           u.full_name as created_by_name,
           m.name as machine_name,
           m.timer_end,
           m.timer_started_at,
           CASE
             WHEN li.status IN ('dirty','washing','ready')
             THEN ROUND((julianday('now') - julianday(COALESCE(li.updated_at, li.created_at))) * 24, 1)
             ELSE NULL
           END as hours_in_status,
           (SELECT COUNT(*) FROM laundry_damages WHERE item_id = li.id) as damage_count,
           COALESCE(li.phone_override, p.phone_number) as phone_number,
           p.full_name as occupant_name,
           li.intake_name,
           li.clothing_items,
           (SELECT COUNT(*) FROM premium_garments WHERE item_id = li.id) as premium_garment_count,
           (SELECT COUNT(*) FROM premium_garments WHERE item_id=li.id AND requires_ironing=1) as ironing_total,
           (SELECT COUNT(*) FROM premium_garments WHERE item_id=li.id AND requires_ironing=1 AND status IN ('ready','delivered')) as ironed_count,
           (SELECT COUNT(*) FROM premium_garments WHERE item_id=li.id AND status IN ('ready','delivered')) as ready_garment_count,
           (SELECT COUNT(*) FROM premium_garments WHERE item_id=li.id AND status='lost') as missing_garment_count,
           (SELECT COUNT(*) FROM premium_garments WHERE item_id=li.id AND status='damaged') as damaged_garment_count,
           (SELECT COUNT(*) FROM laundry_garment_exceptions e
            WHERE e.item_id=li.id AND e.reason='rework' AND e.resolved_at IS NULL) as rework_garment_count,
           (SELECT COUNT(*) FROM laundry_items li2
            WHERE li2.room_id = li.room_id
            AND li2.status NOT IN ('delivered','lost')
            AND li2.id != li.id) + 1 as room_active_count
    FROM laundry_items li
    LEFT JOIN rooms r ON r.id = li.room_id
    LEFT JOIN users u ON u.id = li.created_by
    LEFT JOIN laundry_machines m ON m.id = li.machine_id
    LEFT JOIN room_assignments ra ON ra.room_id = li.room_id AND ra.check_out_at IS NULL
    LEFT JOIN personnel p ON p.id = ra.personnel_id
    WHERE ${where}
    ORDER BY li.urgent DESC, li.updated_at ASC
  `).all(...params)
}

export function listAllItemsQuery({ status, from_date, to_date } = {}) {
  const db = getDB()
  const conditions = []
  const params = []
  if (status) { conditions.push('li.status = ?'); params.push(status) }
  if (from_date) { conditions.push('li.created_at >= ?'); params.push(from_date) }
  if (to_date) { conditions.push('li.created_at <= ?'); params.push(to_date) }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''
  return db.prepare(`
    SELECT li.*, r.block, r.room_no, u.full_name as created_by_name
    FROM laundry_items li
    LEFT JOIN rooms r ON r.id = li.room_id
    LEFT JOIN users u ON u.id = li.created_by
    ${where}
    ORDER BY li.created_at DESC
  `).all(...params)
}

export function updateItemStatusQuery(id, status, extra = {}) {
  const db = getDB()
  const sets = ["status = ?", "updated_at = datetime('now')"]
  const vals = [status]
  if (extra.machine_id !== undefined) { sets.push('machine_id = ?'); vals.push(extra.machine_id) }
  if (extra.shelf_location !== undefined) { sets.push('shelf_location = ?'); vals.push(extra.shelf_location) }
  if (extra.photo_url !== undefined) { sets.push('photo_url = ?'); vals.push(extra.photo_url) }
  if (extra.ready_notified_at !== undefined) { sets.push('ready_notified_at = ?'); vals.push(extra.ready_notified_at) }
  vals.push(id)
  db.prepare(`UPDATE laundry_items SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
}

// Torbaya sonradan tekil parça eklenince bireysel takibe geçir (kioskta bu
// insert anında yazılır; yönetim panelinden ekleme sonradan olabiliyor).
export function setTrackingModeIndividualQuery(itemId) {
  getDB().prepare(`
    UPDATE laundry_items SET tracking_mode='individual', updated_at=datetime('now')
    WHERE id=? AND tracking_mode<>'individual'
  `).run(itemId)
}

// "Rafta hazır" WhatsApp'ı gönderildi damgası. Yalnızca NULL iken yazar ve
// changes>0 döner — eşzamanlı iki istek gelse bile tek gönderim garanti olur.
export function markReadyNotifiedQuery(id) {
  const db = getDB()
  return db.prepare(`
    UPDATE laundry_items SET ready_notified_at = datetime('now')
    WHERE id = ? AND ready_notified_at IS NULL
  `).run(id).changes > 0
}

export function deleteItemQuery(id) {
  const db = getDB()
  const result = db.prepare('DELETE FROM laundry_items WHERE id = ?').run(id)
  return result.changes > 0
}

// ═══════════════════════════════════════════════════════════════════════════
// MACHINES
// ═══════════════════════════════════════════════════════════════════════════

