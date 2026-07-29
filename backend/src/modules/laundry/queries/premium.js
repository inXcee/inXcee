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

export function insertTrackedGarmentsQuery(item_id, garmentGroups, {
  source = 'kiosk',
  initialStatus = 'received',
} = {}) {
  const db = getDB()
  const defaults = new Map(
    db.prepare('SELECT id, default_requires_ironing FROM laundry_garment_types').all()
      .map(row => [row.id, row.default_requires_ironing === 1])
  )
  const current = db.prepare(
    'SELECT COALESCE(MAX(sequence_no), 0) AS max_sequence FROM premium_garments WHERE item_id=?'
  ).get(item_id)
  let sequence = current.max_sequence
  const insert = db.prepare(`
    INSERT INTO premium_garments(
      item_id, garment_code, garment_type, garment_type_id, emoji,
      colors_json, color, pattern, sequence_no, requires_ironing, source, status
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
  `)
  const created = []
  for (const group of garmentGroups) {
    const count = Math.min(99, Math.max(1, Number(group.count) || 1))
    const typeId = Number(group.type_id) || null
    const requiresIroning = group.requires_ironing === undefined
      ? Boolean(typeId && defaults.get(typeId))
      : Boolean(group.requires_ironing)
    for (let copy = 0; copy < count; copy++) {
      sequence += 1
      const code = `G${item_id}-${String(sequence).padStart(2, '0')}`
      const result = insert.run(
        item_id,
        code,
        group.type_name || group.garment_type || 'Parça',
        typeId,
        group.emoji || '👕',
        JSON.stringify(Array.isArray(group.colors) ? group.colors : []),
        group.color || null,
        group.pattern || 'solid',
        sequence,
        requiresIroning ? 1 : 0,
        source,
        initialStatus
      )
      created.push(db.prepare('SELECT * FROM premium_garments WHERE id=?').get(result.lastInsertRowid))
    }
  }
  return created
}

export function getGarmentProgressQuery(itemId) {
  const db = getDB()
  return db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN requires_ironing=1 THEN 1 ELSE 0 END) AS ironing_required,
      SUM(CASE WHEN requires_ironing=1 AND status='ready' THEN 1 ELSE 0 END) AS ironed,
      SUM(CASE WHEN status='ready' THEN 1 ELSE 0 END) AS ready,
      SUM(CASE WHEN status='lost' THEN 1 ELSE 0 END) AS missing,
      SUM(CASE WHEN status='damaged' THEN 1 ELSE 0 END) AS damaged,
      SUM(CASE WHEN status='ironing' THEN 1 ELSE 0 END) AS pending_ironing
    FROM premium_garments WHERE item_id=?
  `).get(itemId)
}

export function getGarmentWithItemQuery(itemId, garmentId) {
  const db = getDB()
  return db.prepare(`
    SELECT pg.*, li.status AS item_status, li.tracking_mode
    FROM premium_garments pg
    JOIN laundry_items li ON li.id=pg.item_id
    WHERE pg.id=? AND pg.item_id=?
  `).get(garmentId, itemId)
}

export function setTrackedGarmentsAfterWashQuery(itemId, userId, workerId) {
  const db = getDB()
  const garments = db.prepare(`
    SELECT id, status, requires_ironing FROM premium_garments
    WHERE item_id=? AND status NOT IN ('lost','damaged','delivered')
  `).all(itemId)
  const update = db.prepare(`
    UPDATE premium_garments SET status=?, updated_at=datetime('now') WHERE id=?
  `)
  const history = db.prepare(`
    INSERT INTO premium_garment_history(
      garment_id, from_status, to_status, action_by, action_by_worker_id, notes
    ) VALUES(?,?,?,?,?,?)
  `)
  for (const garment of garments) {
    const next = garment.requires_ironing ? 'ironing' : 'ready'
    if (garment.status === next) continue
    update.run(next, garment.id)
    history.run(
      garment.id, garment.status, next, userId || null, workerId || null,
      'Yıkama tamamlandı'
    )
  }
  return getGarmentProgressQuery(itemId)
}

export function setGarmentIroningQuery({
  itemId, garmentId, completed, clientActionId, userId, workerId,
}) {
  const db = getDB()
  if (clientActionId) {
    const duplicate = db.prepare(
      'SELECT id FROM premium_garment_history WHERE client_action_id=?'
    ).get(clientActionId)
    if (duplicate) {
      return {
        garment: getGarmentWithItemQuery(itemId, garmentId),
        changed: false,
        idempotent: true,
      }
    }
  }
  const garment = getGarmentWithItemQuery(itemId, garmentId)
  if (!garment) return null
  if (garment.item_status !== 'ironing') {
    throw Object.assign(new Error('Torba ütü aşamasında değil'), { status: 409 })
  }
  if (!garment.requires_ironing) {
    throw Object.assign(new Error('Bu parça için ütü gerekmiyor'), { status: 409 })
  }
  if (['lost', 'damaged', 'delivered'].includes(garment.status)) {
    throw Object.assign(new Error('İstisna durumundaki parça değiştirilemez'), { status: 409 })
  }
  const next = completed ? 'ready' : 'ironing'
  if (garment.status === next) {
    return { garment, changed: false, idempotent: true }
  }
  db.prepare(`
    UPDATE premium_garments
    SET status=?, ironed_by=?, ironed_by_worker_id=?,
        ironed_at=CASE WHEN ?='ready' THEN datetime('now') ELSE NULL END,
        updated_at=datetime('now')
    WHERE id=?
  `).run(next, completed ? userId || null : null, completed ? workerId || null : null, next, garmentId)
  db.prepare(`
    INSERT INTO premium_garment_history(
      garment_id, from_status, to_status, action_by, action_by_worker_id,
      notes, client_action_id
    ) VALUES(?,?,?,?,?,?,?)
  `).run(
    garmentId, garment.status, next, userId || null, workerId || null,
    completed ? 'Ütülendi' : 'Ütü tiki geri alındı', clientActionId || null
  )
  return {
    garment: getGarmentWithItemQuery(itemId, garmentId),
    changed: true,
    idempotent: false,
  }
}

export function insertGarmentExceptionQuery({
  itemId, garmentId, stage, reason, note, photoUrl, userId, workerId,
}) {
  const db = getDB()
  const garment = getGarmentWithItemQuery(itemId, garmentId)
  if (!garment) return null
  let nextStatus = garment.status
  if (reason === 'missing') nextStatus = 'lost'
  if (reason === 'damaged') nextStatus = 'damaged'
  if (reason === 'no_ironing') nextStatus = 'ready'
  if (reason === 'rework') nextStatus = 'ironing'
  if (reason === 'other') nextStatus = 'damaged'
  db.prepare(`
    INSERT INTO laundry_garment_exceptions(
      garment_id, item_id, stage, reason, note, photo_url,
      created_by_user_id, created_by_worker_id
    ) VALUES(?,?,?,?,?,?,?,?)
  `).run(
    garmentId, itemId, stage, reason, note || null, photoUrl || null,
    userId || null, workerId || null
  )
  db.prepare(`
    UPDATE premium_garments
    SET status=?, requires_ironing=CASE WHEN ?='no_ironing' THEN 0 ELSE requires_ironing END,
        updated_at=datetime('now')
    WHERE id=?
  `).run(nextStatus, reason, garmentId)
  db.prepare(`
    INSERT INTO premium_garment_history(
      garment_id, from_status, to_status, action_by, action_by_worker_id, notes
    ) VALUES(?,?,?,?,?,?)
  `).run(
    garmentId, garment.status, nextStatus, userId || null, workerId || null,
    `İstisna: ${reason}${note ? ` — ${note}` : ''}`
  )
  return getGarmentWithItemQuery(itemId, garmentId)
}

export function getPremiumGarmentsQuery(item_id) {
  const db = getDB()
  return db.prepare(`SELECT * FROM premium_garments WHERE item_id=? ORDER BY garment_code ASC`).all(item_id)
}

export function getGarmentDetailQuery(garmentId) {
  const db = getDB()
  const garment = db.prepare(`
    SELECT pg.*, li.bag_no, li.status AS bag_status, li.tracking_mode,
           li.created_at AS intake_date, li.shelf_location,
           r.block, r.room_no, r.floor,
           COALESCE(iu.full_name, iw.full_name) AS ironed_by_name
    FROM premium_garments pg
    JOIN laundry_items li ON li.id=pg.item_id
    LEFT JOIN rooms r ON r.id=li.room_id
    LEFT JOIN users iu ON iu.id=pg.ironed_by
    LEFT JOIN staff iw ON iw.id=pg.ironed_by_worker_id
    WHERE pg.id=?
  `).get(garmentId)
  if (!garment) return null
  const history = db.prepare(`
    SELECT h.id, h.from_status, h.to_status, h.notes, h.created_at,
           COALESCE(u.full_name, w.full_name, 'Sistem') AS operator_name,
           CASE WHEN h.action_by_worker_id IS NOT NULL THEN 'avs_worker'
                WHEN h.action_by IS NOT NULL THEN 'user' ELSE 'system' END AS operator_type
    FROM premium_garment_history h
    LEFT JOIN users u ON u.id=h.action_by
    LEFT JOIN staff w ON w.id=h.action_by_worker_id
    WHERE h.garment_id=?
    ORDER BY h.id DESC
  `).all(garmentId)
  const exceptions = db.prepare(`
    SELECT e.*, COALESCE(u.full_name, w.full_name, 'Sistem') AS operator_name
    FROM laundry_garment_exceptions e
    LEFT JOIN users u ON u.id=e.created_by_user_id
    LEFT JOIN staff w ON w.id=e.created_by_worker_id
    WHERE e.garment_id=?
    ORDER BY e.id DESC
  `).all(garmentId)
  return { garment, history, exceptions }
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
  const counts = {
    total: rows.length, received: 0, ironing: 0, ready: 0,
    delivered: 0, lost: 0, damaged: 0,
  }
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

export function deliverPremiumGarmentQuery(
  garment_id,
  item_id,
  { delivered_to, signature_data },
  userId,
  workerId = null
) {
  const db = getDB()
  db.prepare(`
    UPDATE premium_garments
    SET status='delivered', delivered_to=?, delivered_at=datetime('now'), updated_at=datetime('now')
    WHERE id=?
  `).run(delivered_to, garment_id)
  db.prepare(`
    INSERT INTO premium_garment_history(
      garment_id, from_status, to_status, action_by, action_by_worker_id, notes
    )
    VALUES(?, 'ready', 'delivered', ?, ?, ?)
  `).run(garment_id, userId || null, workerId || null, `Teslim: ${delivered_to}`)
  db.prepare(`
    INSERT INTO premium_garment_deliveries(
      garment_id, item_id, delivered_to, signature_data,
      delivered_by, delivered_by_worker_id
    )
    VALUES(?, ?, ?, ?, ?, ?)
  `).run(
    garment_id,
    item_id,
    delivered_to,
    signature_data || null,
    userId || null,
    workerId || null
  )
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
           pg.emoji, pg.colors_json, pg.sequence_no, pg.requires_ironing, pg.source,
           pg.ironed_at, li.is_premium,
           li.id AS item_id, li.created_at AS intake_date, li.intake_name,
           li.bag_no, li.tracking_mode, r.block, r.room_no,
           COALESCE(iu.full_name, iw.full_name) AS ironed_by_name,
           (SELECT reason FROM laundry_garment_exceptions e
            WHERE e.garment_id=pg.id ORDER BY e.id DESC LIMIT 1) AS exception_reason,
           (SELECT photo_url FROM laundry_garment_exceptions e
            WHERE e.garment_id=pg.id ORDER BY e.id DESC LIMIT 1) AS exception_photo_url
    FROM premium_garments pg
    JOIN laundry_items li ON li.id = pg.item_id
    JOIN rooms r ON r.id = li.room_id
    LEFT JOIN users iu ON iu.id=pg.ironed_by
    LEFT JOIN staff iw ON iw.id=pg.ironed_by_worker_id
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
           SUM(CASE WHEN pg.status='damaged' THEN 1 ELSE 0 END) AS total_damaged,
           SUM(CASE WHEN pg.requires_ironing=1 THEN 1 ELSE 0 END) AS total_ironing_required,
           SUM(CASE WHEN pg.requires_ironing=1 AND pg.status IN ('ready','delivered') THEN 1 ELSE 0 END) AS total_ironed,
           SUM(CASE WHEN pg.status='delivered' THEN 1 ELSE 0 END) AS total_delivered,
           SUM(CASE WHEN pg.status='ready' THEN 1 ELSE 0 END) AS total_ready,
           SUM(CASE WHEN pg.status IN ('received','ironing') THEN 1 ELSE 0 END) AS total_in_progress
    FROM premium_garments pg
    JOIN laundry_items li ON li.id = pg.item_id
    WHERE 1=1 ${dateWhere}
  `).get(...dateParams)

  const exceptions = db.prepare(`
    SELECT e.reason, COUNT(*) AS total
    FROM laundry_garment_exceptions e
    JOIN laundry_items li ON li.id=e.item_id
    WHERE 1=1 ${dateWhere}
    GROUP BY e.reason ORDER BY total DESC
  `).all(...dateParams)

  const operatorProductivity = db.prepare(`
    SELECT COALESCE(u.full_name, w.full_name, 'Sistem') AS operator_name,
           COUNT(*) AS ironed_count,
           ROUND(AVG((julianday(pg.ironed_at) - julianday(li.updated_at)) * 24), 1) AS avg_stage_hours
    FROM premium_garments pg
    JOIN laundry_items li ON li.id=pg.item_id
    LEFT JOIN users u ON u.id=pg.ironed_by
    LEFT JOIN staff w ON w.id=pg.ironed_by_worker_id
    WHERE pg.ironed_at IS NOT NULL ${dateWhere}
    GROUP BY COALESCE(u.full_name, w.full_name, 'Sistem')
    ORDER BY ironed_count DESC
  `).all(...dateParams)

  return {
    totals, byBlock, byType, lostList, topRooms, avgDelivery,
    exceptions, operatorProductivity,
  }
}

export function exportPremiumGarmentsQuery({ from_date, to_date } = {}) {
  const db = getDB()
  const conditions = ['1=1']
  const params = []
  if (from_date) { conditions.push("li.created_at >= ?"); params.push(from_date) }
  if (to_date)   { conditions.push("li.created_at <= ?"); params.push(to_date + ' 23:59:59') }

  return db.prepare(`
    SELECT pg.garment_code, r.block, r.room_no, pg.garment_type,
           pg.brand, pg.model, pg.size, pg.color, pg.status,
           pg.requires_ironing, pg.ironed_at,
           COALESCE(iu.full_name, iw.full_name) AS ironed_by_name,
           (SELECT reason FROM laundry_garment_exceptions e
            WHERE e.garment_id=pg.id ORDER BY e.id DESC LIMIT 1) AS exception_reason,
           li.created_at AS intake_date, pg.delivered_at,
           ROUND((julianday(COALESCE(pg.delivered_at, datetime('now'))) - julianday(li.created_at)) * 24, 1) AS total_hours
    FROM premium_garments pg
    JOIN laundry_items li ON li.id = pg.item_id
    JOIN rooms r ON r.id = li.room_id
    LEFT JOIN users iu ON iu.id=pg.ironed_by
    LEFT JOIN staff iw ON iw.id=pg.ironed_by_worker_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY li.created_at DESC, pg.garment_code ASC
  `).all(...params)
}

// ═══════════════════════════════════════════════════════════════════════════
// SUPPLIES
// ═══════════════════════════════════════════════════════════════════════════

