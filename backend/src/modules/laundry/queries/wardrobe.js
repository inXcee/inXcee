import { getDB } from '../../../shared/db/index.js'

// Arşiv kimliği — aynı kıyafetin tekrar tekrar satır açmaması için. Migration
// 072'deki SQL ifadesiyle BİREBİR aynı olmalı (backfill ile çakışmasın).
export function garmentSignature(garment) {
  const part = (value) => String(value ?? '').trim().toLowerCase()
  return [
    part(garment.type_name || garment.garment_type),
    part(garment.brand),
    part(garment.model),
    part(garment.size),
    part(garment.color),
    part(garment.pattern) || 'solid',
  ].join('|')
}

// Torba girişinde çağrılır: yeni parçalar odanın dolabına eklenir, daha önce
// görülenlerin sayacı artar ve künyesi tazelenir. Girişi ASLA bozmamalı —
// çağıran tarafta try/catch ile sarılır.
export function upsertArchiveGarmentsQuery(roomId, ownerName, garments) {
  if (!roomId || !Array.isArray(garments) || garments.length === 0) return 0
  const db = getDB()
  const insert = db.prepare(`
    INSERT INTO laundry_garment_archive(
      room_id, owner_name, garment_type_id, type_name, emoji,
      brand, model, size, color, colors_json, pattern,
      requires_ironing, notes, signature
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(room_id, IFNULL(owner_name, ''), signature) DO UPDATE SET
      times_seen = times_seen + 1,
      last_seen_at = datetime('now'),
      requires_ironing = excluded.requires_ironing,
      emoji = COALESCE(excluded.emoji, emoji),
      garment_type_id = COALESCE(excluded.garment_type_id, garment_type_id),
      colors_json = COALESCE(excluded.colors_json, colors_json),
      notes = COALESCE(excluded.notes, notes)
  `)
  let touched = 0
  for (const garment of garments) {
    const typeName = garment.type_name || garment.garment_type
    if (!typeName) continue
    const colors = Array.isArray(garment.colors) ? garment.colors : []
    insert.run(
      roomId,
      ownerName || null,
      Number(garment.type_id) || null,
      typeName,
      garment.emoji || null,
      garment.brand || null,
      garment.model || null,
      garment.size || null,
      garment.color || (colors[0]?.label ?? null),
      colors.length ? JSON.stringify(colors) : null,
      garment.pattern || 'solid',
      garment.requires_ironing ? 1 : 0,
      garment.condition_notes || null,
      garmentSignature(garment),
    )
    touched++
  }
  return touched
}

// Odanın dolabı — en sık ve en yeni görülenler önce. owner_name verilirse o
// kişinin parçaları öne alınır ama odanın geri kalanı da döner (aynı odada
// başkasının kıyafeti de olabilir; operatör görsün).
export function getRoomWardrobeQuery(block, roomNo, { ownerName = null, limit = 24 } = {}) {
  const db = getDB()
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 24))
  return db.prepare(`
    SELECT a.id, a.owner_name, a.garment_type_id, a.type_name, a.emoji,
           a.brand, a.model, a.size, a.color, a.colors_json, a.pattern,
           a.requires_ironing, a.notes, a.times_seen, a.last_seen_at
    FROM laundry_garment_archive a
    JOIN rooms r ON r.id = a.room_id
    WHERE r.block = ? AND r.room_no = ?
    ORDER BY
      CASE WHEN ? IS NOT NULL AND a.owner_name = ? THEN 0 ELSE 1 END,
      a.times_seen DESC,
      a.last_seen_at DESC
    LIMIT ?
  `).all(block, roomNo, ownerName, ownerName, safeLimit)
}

// Marka önerisi — operatör markayı baştan yazmasın. Arşivde geçen markalar
// kullanım sıklığına göre döner.
export function listArchiveBrandsQuery(prefix = '', limit = 12) {
  const db = getDB()
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 12))
  const term = `${String(prefix || '').trim().toLowerCase()}%`
  return db.prepare(`
    SELECT brand, SUM(times_seen) AS uses
    FROM laundry_garment_archive
    WHERE brand IS NOT NULL AND TRIM(brand) <> '' AND lower(brand) LIKE ?
    GROUP BY lower(brand)
    ORDER BY uses DESC, brand ASC
    LIMIT ?
  `).all(term, safeLimit).map(row => row.brand)
}

// Dolaptan bir satırı kaldır (kişi taşındı, kıyafet artık yok).
export function deleteArchiveGarmentQuery(id) {
  return getDB().prepare('DELETE FROM laundry_garment_archive WHERE id=?').run(id).changes > 0
}
