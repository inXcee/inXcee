import { getDB } from '../../../shared/db/index.js'
export function listGarmentTypesQuery(includeInactive = false) {
  const db = getDB()
  if (includeInactive) {
    return db.prepare(`SELECT * FROM laundry_garment_types ORDER BY sort_order ASC, id ASC`).all()
  }
  return db.prepare(`SELECT * FROM laundry_garment_types WHERE is_active=1 ORDER BY sort_order ASC, id ASC`).all()
}

export const IRONING_POLICIES = ['always', 'never', 'ask']

// default_requires_ironing (0/1) geriye uyum için korunur ve politikayla
// senkron tutulur: always → 1, never/ask → 0. Yeni kod ironing_policy okumalı.
function normalizePolicy(policy, fallback = 'ask') {
  return IRONING_POLICIES.includes(policy) ? policy : fallback
}

export function insertGarmentTypeQuery({
  name, emoji, image_url, sort_order = 0, default_requires_ironing = 0, ironing_policy,
}) {
  const db = getDB()
  const policy = normalizePolicy(
    ironing_policy,
    default_requires_ironing ? 'always' : 'ask'
  )
  const r = db.prepare(`
    INSERT INTO laundry_garment_types(
      name, emoji, image_url, sort_order, default_requires_ironing, ironing_policy
    )
    VALUES(?, ?, ?, ?, ?, ?)
  `).run(
    name, emoji || null, image_url || null, sort_order,
    policy === 'always' ? 1 : 0,
    policy
  )
  return db.prepare(`SELECT * FROM laundry_garment_types WHERE id=?`).get(r.lastInsertRowid)
}

export function updateGarmentTypeQuery(
  id,
  { name, emoji, image_url, sort_order, is_active, default_requires_ironing, ironing_policy }
) {
  const db = getDB()
  const current = db.prepare(`SELECT * FROM laundry_garment_types WHERE id=?`).get(id)
  if (!current) return null
  let policy = current.ironing_policy
  if (ironing_policy !== undefined) policy = normalizePolicy(ironing_policy, current.ironing_policy)
  else if (default_requires_ironing !== undefined) {
    // Eski 0/1 arayüzünden gelen çağrı: 1 → always, 0 → never (bilinçli kapatma)
    policy = default_requires_ironing ? 'always' : 'never'
  }
  db.prepare(`
    UPDATE laundry_garment_types
    SET name=?, emoji=?, image_url=?, sort_order=?, is_active=?,
        default_requires_ironing=?, ironing_policy=?
    WHERE id=?
  `).run(
    name ?? current.name,
    emoji !== undefined ? emoji : current.emoji,
    image_url !== undefined ? image_url : current.image_url,
    sort_order ?? current.sort_order,
    is_active !== undefined ? (is_active ? 1 : 0) : current.is_active,
    policy === 'always' ? 1 : 0,
    policy,
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
