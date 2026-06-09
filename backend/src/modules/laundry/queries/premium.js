import { getDB } from '../../../shared/db/index.js'
export function generateNextGarmentSeqQuery(prefix) {
  const db = getDB()
  const row = db.prepare(`SELECT COUNT(*) as cnt FROM premium_garments WHERE garment_code LIKE ?`).get(`${prefix}-%`)
  return (row?.cnt || 0) + 1
}

export function insertPremiumGarmentsQuery(item_id, garments) {
  const db = getDB()
  // Oda bilgisini al (block + room_no)
  const item = db.prepare(`
    SELECT r.block, r.room_no FROM laundry_items li
    JOIN rooms r ON r.id = li.room_id
    WHERE li.id = ?
  `).get(item_id)
  if (!item) throw new Error('Kayıt bulunamadı')

  const prefix = `${item.block}${item.room_no}`

  const insert = db.prepare(`
    INSERT INTO premium_garments(item_id, garment_code, garment_type, brand, model, size, color, pattern, condition_notes)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const insertMany = db.transaction((list) => {
    const codes = []
    for (const g of list) {
      const seq = generateNextGarmentSeqQuery(prefix)
      const code = `${prefix}-${String(seq).padStart(3, '0')}`
      insert.run(
        item_id, code,
        g.garment_type, g.brand || null, g.model || null,
        g.size || null, g.color || null, g.pattern || null, g.condition_notes || null
      )
      codes.push(code)
    }
    return codes
  })

  return insertMany(garments)
}

export function getPremiumGarmentsQuery(item_id) {
  const db = getDB()
  return db.prepare(`SELECT * FROM premium_garments WHERE item_id=? ORDER BY garment_code ASC`).all(item_id)
}

export function getPremiumGarmentByCodeQuery(code) {
  const db = getDB()
  return db.prepare(`SELECT * FROM premium_garments WHERE garment_code=?`).get(code)
}

export function getPremiumGarmentQuery(garment_id) {
  const db = getDB()
  return db.prepare(`SELECT * FROM premium_garments WHERE id=?`).get(garment_id)
}

export function advancePremiumGarmentQuery(garment_id, to_status, userId) {
  const db = getDB()
  const g = db.prepare(`SELECT * FROM premium_garments WHERE id=?`).get(garment_id)
  if (!g) throw new Error('Parça bulunamadı')
  db.prepare(`
    UPDATE premium_garments SET status=?, updated_at=datetime('now')
    WHERE id=?
  `).run(to_status, garment_id)
  db.prepare(`
    INSERT INTO premium_garment_history(garment_id, from_status, to_status, action_by)
    VALUES(?, ?, ?, ?)
  `).run(garment_id, g.status, to_status, userId || null)
  return db.prepare(`SELECT * FROM premium_garments WHERE id=?`).get(garment_id)
}

export function checkAllGarmentsStatusQuery(item_id) {
  const db = getDB()
  const rows = db.prepare(`SELECT status FROM premium_garments WHERE item_id=?`).all(item_id)
  const counts = { total: rows.length, received: 0, ironing: 0, ready: 0, delivered: 0, lost: 0 }
  for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1
  return counts
}

export function bulkSetGarmentsStatusQuery(item_id, to_status, userId) {
  const db = getDB()
  const garments = db.prepare(`SELECT id, status FROM premium_garments WHERE item_id=?`).all(item_id)
  const update = db.prepare(`UPDATE premium_garments SET status=?, updated_at=datetime('now') WHERE id=?`)
  const hist = db.prepare(`INSERT INTO premium_garment_history(garment_id, from_status, to_status, action_by) VALUES(?,?,?,?)`)
  const run = db.transaction(() => {
    for (const g of garments) {
      update.run(to_status, g.id)
      hist.run(g.id, g.status, to_status, userId || null)
    }
  })
  run()
  return garments.length
}

// ═══════════════════════════════════════════════════════════════════════════
// PREMIUM GARMENT DELIVERIES
// ═══════════════════════════════════════════════════════════════════════════

export function deliverPremiumGarmentQuery(garment_id, item_id, { delivered_to, signature_data }, userId) {
  const db = getDB()
  db.prepare(`
    UPDATE premium_garments
    SET status='delivered', delivered_to=?, delivered_at=datetime('now'), updated_at=datetime('now')
    WHERE id=?
  `).run(delivered_to, garment_id)
  db.prepare(`
    INSERT INTO premium_garment_history(garment_id, from_status, to_status, action_by, notes)
    VALUES(?, 'ready', 'delivered', ?, ?)
  `).run(garment_id, userId || null, `Teslim: ${delivered_to}`)
  db.prepare(`
    INSERT INTO premium_garment_deliveries(garment_id, item_id, delivered_to, signature_data, delivered_by)
    VALUES(?, ?, ?, ?, ?)
  `).run(garment_id, item_id, delivered_to, signature_data || null, userId || null)
}

export function getPremiumDeliveryReceiptQuery(item_id) {
  const db = getDB()
  return db.prepare(`
    SELECT pg.id, pg.garment_code, pg.garment_type, pg.brand, pg.model, pg.size, pg.color,
           pg.status, pg.delivered_to, pg.delivered_at,
           pgd.signature_data, pgd.delivered_at AS receipt_at
    FROM premium_garments pg
    LEFT JOIN premium_garment_deliveries pgd ON pgd.garment_id = pg.id
    WHERE pg.item_id = ?
    ORDER BY pg.garment_code ASC
  `).all(item_id)
}

// ═══════════════════════════════════════════════════════════════════════════
// PREMIUM GARMENT SEARCH
// ═══════════════════════════════════════════════════════════════════════════

export function searchPremiumGarmentsQuery({ block, room_no, garment_type, brand, size, color, pattern, intake_name, status, from_date, to_date, page = 1, limit = 50 } = {}) {
  const db = getDB()
  const conditions = []
  const params = []

  if (block)        { conditions.push('r.block = ?');            params.push(block) }
  if (room_no)      { conditions.push('r.room_no = ?');          params.push(room_no) }
  if (garment_type) { conditions.push('pg.garment_type LIKE ?'); params.push(`%${garment_type}%`) }
  if (brand)        { conditions.push('pg.brand LIKE ?');        params.push(`%${brand}%`) }
  if (size)         { conditions.push('pg.size = ?');            params.push(size) }
  if (color)        { conditions.push('pg.color LIKE ?');        params.push(`%${color}%`) }
  if (pattern)      { conditions.push('pg.pattern LIKE ?');      params.push(`%${pattern}%`) }
  if (intake_name)  { conditions.push('li.intake_name LIKE ?');  params.push(`%${intake_name}%`) }
  if (status)       { conditions.push('pg.status = ?');          params.push(status) }
  if (from_date)    { conditions.push("li.created_at >= ?");     params.push(from_date) }
  if (to_date)      { conditions.push("li.created_at <= ?");     params.push(to_date + ' 23:59:59') }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const offset = (page - 1) * limit

  const rows = db.prepare(`
    SELECT pg.id, pg.garment_code, pg.garment_type, pg.brand, pg.model, pg.size, pg.color,
           pg.pattern, pg.status, pg.condition_notes, pg.delivered_to, pg.delivered_at,
           li.id AS item_id, li.created_at AS intake_date, li.intake_name,
           r.block, r.room_no
    FROM premium_garments pg
    JOIN laundry_items li ON li.id = pg.item_id
    JOIN rooms r ON r.id = li.room_id
    ${where}
    ORDER BY li.created_at DESC, pg.garment_code ASC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset)

  const total = db.prepare(`
    SELECT COUNT(*) AS cnt
    FROM premium_garments pg
    JOIN laundry_items li ON li.id = pg.item_id
    JOIN rooms r ON r.id = li.room_id
    ${where}
  `).get(...params)

  return { rows, total: total.cnt, page, limit }
}

export function getRoomGarmentHistoryQuery(room_id, { from_date, to_date } = {}) {
  const db = getDB()
  const conditions = ['li.room_id = ?']
  const params = [room_id]

  if (from_date) { conditions.push("li.created_at >= ?"); params.push(from_date) }
  if (to_date)   { conditions.push("li.created_at <= ?"); params.push(to_date + ' 23:59:59') }

  return db.prepare(`
    SELECT pg.id, pg.garment_code, pg.garment_type, pg.brand, pg.model, pg.size, pg.color, pg.status,
           pg.delivered_to, pg.delivered_at,
           li.id AS item_id, li.created_at AS intake_date
    FROM premium_garments pg
    JOIN laundry_items li ON li.id = pg.item_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY li.created_at DESC, pg.garment_code ASC
  `).all(...params)
}

// ═══════════════════════════════════════════════════════════════════════════
// ROOM SCAN
// ═══════════════════════════════════════════════════════════════════════════

export function getRoomGarmentsForScanQuery(block, room_no) {
  const db = getDB()
  const room = db.prepare(`SELECT id FROM rooms WHERE block=? AND room_no=?`).get(block, room_no)
  if (!room) return null

  const items = db.prepare(`
    SELECT id, status, item_count, created_at, needs_ironing, is_premium
    FROM laundry_items
    WHERE room_id=? AND status NOT IN ('delivered','lost')
    ORDER BY created_at DESC
    LIMIT 5
  `).all(room.id)

  if (items.length === 0) return { room_id: room.id, block, room_no, items: [], garments: [] }

  const itemIds = items.map(i => i.id)
  const placeholders = itemIds.map(() => '?').join(',')
  const garments = db.prepare(`
    SELECT pg.*, li.status AS item_status
    FROM premium_garments pg
    JOIN laundry_items li ON li.id = pg.item_id
    WHERE pg.item_id IN (${placeholders})
    ORDER BY pg.item_id DESC, pg.garment_code ASC
  `).all(...itemIds)

  return { room_id: room.id, block, room_no, items, garments }
}

export function insertScanLogQuery(room_id, block, room_no, garment_id, action, userId) {
  const db = getDB()
  db.prepare(`
    INSERT INTO garment_scan_log(room_id, block, room_no, garment_id, scanned_by, action)
    VALUES(?, ?, ?, ?, ?, ?)
  `).run(room_id || null, block || null, room_no || null, garment_id || null, userId || null, action)
}

// ═══════════════════════════════════════════════════════════════════════════
// PREMIUM REPORTS
// ═══════════════════════════════════════════════════════════════════════════

export function getPremiumReportQuery({ from_date, to_date } = {}) {
  const db = getDB()
  const dateFilter = []
  const dateParams = []
  if (from_date) { dateFilter.push("li.created_at >= ?"); dateParams.push(from_date) }
  if (to_date)   { dateFilter.push("li.created_at <= ?"); dateParams.push(to_date + ' 23:59:59') }
  const dateWhere = dateFilter.length ? `AND ${dateFilter.join(' AND ')}` : ''

  const byBlock = db.prepare(`
    SELECT r.block, COUNT(*) AS total,
           SUM(CASE WHEN pg.status='lost' THEN 1 ELSE 0 END) AS lost,
           SUM(CASE WHEN pg.status='delivered' THEN 1 ELSE 0 END) AS delivered
    FROM premium_garments pg
    JOIN laundry_items li ON li.id = pg.item_id
    JOIN rooms r ON r.id = li.room_id
    WHERE 1=1 ${dateWhere}
    GROUP BY r.block ORDER BY total DESC
  `).all(...dateParams)

  const byType = db.prepare(`
    SELECT pg.garment_type, COUNT(*) AS total,
           SUM(CASE WHEN pg.status='lost' THEN 1 ELSE 0 END) AS lost
    FROM premium_garments pg
    JOIN laundry_items li ON li.id = pg.item_id
    WHERE 1=1 ${dateWhere}
    GROUP BY pg.garment_type ORDER BY total DESC
    LIMIT 15
  `).all(...dateParams)

  const lostList = db.prepare(`
    SELECT pg.garment_code, pg.garment_type, pg.brand, pg.model, pg.size, pg.color,
           r.block, r.room_no, li.created_at AS intake_date
    FROM premium_garments pg
    JOIN laundry_items li ON li.id = pg.item_id
    JOIN rooms r ON r.id = li.room_id
    WHERE pg.status='lost' ${dateWhere}
    ORDER BY li.created_at DESC
    LIMIT 50
  `).all(...dateParams)

  const topRooms = db.prepare(`
    SELECT r.block, r.room_no, COUNT(*) AS total
    FROM premium_garments pg
    JOIN laundry_items li ON li.id = pg.item_id
    JOIN rooms r ON r.id = li.room_id
    WHERE 1=1 ${dateWhere}
    GROUP BY r.block, r.room_no ORDER BY total DESC
    LIMIT 10
  `).all(...dateParams)

  const avgDelivery = db.prepare(`
    SELECT
      ROUND(AVG(CASE WHEN li.is_premium=1
        THEN (julianday(li.updated_at) - julianday(li.created_at)) * 24 END), 1) AS premium_avg_hours,
      ROUND(AVG(CASE WHEN li.is_premium=0
        THEN (julianday(li.updated_at) - julianday(li.created_at)) * 24 END), 1) AS regular_avg_hours
    FROM laundry_items li
    WHERE li.status='delivered' ${dateWhere.replace(/li\.created_at/g, 'li.created_at')}
  `).get(...dateParams)

  const totals = db.prepare(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN pg.status='lost' THEN 1 ELSE 0 END) AS total_lost,
           SUM(CASE WHEN pg.status='delivered' THEN 1 ELSE 0 END) AS total_delivered,
           SUM(CASE WHEN pg.status='ready' THEN 1 ELSE 0 END) AS total_ready,
           SUM(CASE WHEN pg.status IN ('received','ironing') THEN 1 ELSE 0 END) AS total_in_progress
    FROM premium_garments pg
    JOIN laundry_items li ON li.id = pg.item_id
    WHERE 1=1 ${dateWhere}
  `).get(...dateParams)

  return { totals, byBlock, byType, lostList, topRooms, avgDelivery }
}

export function exportPremiumGarmentsQuery({ from_date, to_date } = {}) {
  const db = getDB()
  const conditions = ['li.is_premium=1']
  const params = []
  if (from_date) { conditions.push("li.created_at >= ?"); params.push(from_date) }
  if (to_date)   { conditions.push("li.created_at <= ?"); params.push(to_date + ' 23:59:59') }

  return db.prepare(`
    SELECT pg.garment_code, r.block, r.room_no, pg.garment_type,
           pg.brand, pg.model, pg.size, pg.color, pg.status,
           li.created_at AS intake_date, pg.delivered_at,
           ROUND((julianday(COALESCE(pg.delivered_at, datetime('now'))) - julianday(li.created_at)) * 24, 1) AS total_hours
    FROM premium_garments pg
    JOIN laundry_items li ON li.id = pg.item_id
    JOIN rooms r ON r.id = li.room_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY li.created_at DESC, pg.garment_code ASC
  `).all(...params)
}

// ═══════════════════════════════════════════════════════════════════════════
// SUPPLIES
// ═══════════════════════════════════════════════════════════════════════════

