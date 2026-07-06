import { getDB } from '../../../shared/db/index.js'
export function listGarmentTypesQuery(includeInactive = false) {
  const db = getDB()
  if (includeInactive) {
    return db.prepare(`SELECT * FROM laundry_garment_types ORDER BY sort_order ASC, id ASC`).all()
  }
  return db.prepare(`SELECT * FROM laundry_garment_types WHERE is_active=1 ORDER BY sort_order ASC, id ASC`).all()
}

export function insertGarmentTypeQuery({ name, emoji, image_url, sort_order = 0 }) {
  const db = getDB()
  const r = db.prepare(`
    INSERT INTO laundry_garment_types(name, emoji, image_url, sort_order)
    VALUES(?, ?, ?, ?)
  `).run(name, emoji || null, image_url || null, sort_order)
  return db.prepare(`SELECT * FROM laundry_garment_types WHERE id=?`).get(r.lastInsertRowid)
}

export function updateGarmentTypeQuery(id, { name, emoji, image_url, sort_order, is_active }) {
  const db = getDB()
  const current = db.prepare(`SELECT * FROM laundry_garment_types WHERE id=?`).get(id)
  if (!current) return null
  db.prepare(`
    UPDATE laundry_garment_types
    SET name=?, emoji=?, image_url=?, sort_order=?, is_active=?
    WHERE id=?
  `).run(
    name ?? current.name,
    emoji !== undefined ? emoji : current.emoji,
    image_url !== undefined ? image_url : current.image_url,
    sort_order ?? current.sort_order,
    is_active !== undefined ? (is_active ? 1 : 0) : current.is_active,
    id
  )
  return db.prepare(`SELECT * FROM laundry_garment_types WHERE id=?`).get(id)
}

export function reorderGarmentTypesQuery(items) {
  const db = getDB()
  const update = db.prepare(`UPDATE laundry_garment_types SET sort_order=? WHERE id=?`)
  const tx = db.transaction(() => {
    for (const { id, sort_order } of items) {
      update.run(sort_order, id)
    }
  })
  tx()
}
