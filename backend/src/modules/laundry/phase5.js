import { getDB } from '../../shared/db/index.js'
import { recordScan } from './cardScan.js'

const SLA_HOURS = { low: 48, normal: 24, high: 12, critical: 4 }
const INCIDENT_KINDS = new Set(['lost_bag', 'lost_garment', 'damaged_garment', 'other'])
const SEVERITIES = new Set(Object.keys(SLA_HOURS))
const RESOLUTIONS = new Set(['found', 'compensated', 'rejected', 'reimbursed'])

function httpError(message, status = 400) {
  return Object.assign(new Error(message), { status })
}

function money(value) {
  return Number(Number(value || 0).toFixed(2))
}

function actorColumns(actor = {}) {
  return { userId: actor.userId || null, workerId: actor.workerId || null }
}

export function createIncident(input, actor = {}) {
  const db = getDB()
  const kind = String(input.kind || '').trim()
  const severity = String(input.severity || 'normal').trim()
  const description = String(input.description || '').trim()
  if (!INCIDENT_KINDS.has(kind)) throw httpError('Geçersiz vaka türü')
  if (!SEVERITIES.has(severity)) throw httpError('Geçersiz önem seviyesi')
  if (description.length < 3 || description.length > 1000) throw httpError('Vaka açıklaması 3-1000 karakter olmalıdır')
  const itemId = input.item_id ? Number(input.item_id) : null
  const garmentId = input.garment_id ? Number(input.garment_id) : null
  if (itemId && !db.prepare('SELECT id FROM laundry_items WHERE id=?').get(itemId)) throw httpError('Torba bulunamadı', 404)
  if (garmentId && !db.prepare('SELECT id FROM premium_garments WHERE id=?').get(garmentId)) throw httpError('Kıyafet bulunamadı', 404)
  const duplicate = db.prepare(`
    SELECT * FROM laundry_incidents
    WHERE kind=? AND COALESCE(item_id,0)=COALESCE(?,0) AND COALESCE(garment_id,0)=COALESCE(?,0)
      AND status IN ('open','investigating')
    ORDER BY id DESC LIMIT 1
  `).get(kind, itemId, garmentId)
  if (duplicate) return { ...duplicate, idempotent: true }
  const { userId, workerId } = actorColumns(actor)
  return db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO laundry_incidents(
        case_no,kind,severity,item_id,garment_id,machine_id,owner_user_id,owner_worker_id,
        description,photo_url,sla_due_at,created_by_user_id,created_by_worker_id
      ) VALUES('PENDING',?,?,?,?,?,?,?,?,?,datetime('now', ?),?,?)
    `).run(
      kind, severity, itemId, garmentId, input.machine_id ? Number(input.machine_id) : null,
      input.owner_user_id ? Number(input.owner_user_id) : null,
      input.owner_worker_id ? Number(input.owner_worker_id) : null,
      description, input.photo_url || null, `+${SLA_HOURS[severity]} hours`, userId, workerId,
    )
    const id = Number(result.lastInsertRowid)
    const caseNo = `CAM-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${String(id).padStart(5, '0')}`
    db.prepare('UPDATE laundry_incidents SET case_no=? WHERE id=?').run(caseNo, id)
    const insertChecklist = db.prepare(`
      INSERT INTO laundry_incident_checklist(incident_id,item_key,label) VALUES(?,?,?)
    `)
    for (const [key, label] of [
      ['trace', 'Torba ve parça hareketlerini kontrol et'],
      ['machine', 'Makine ve çalışma noktasını kontrol et'],
      ['operator', 'İlgili operatörlerle görüş'],
      ['notify', 'Sonuç hakkında ilgili kişiyi bilgilendir'],
    ]) insertChecklist.run(id, key, label)
    return getIncident(id)
  }).immediate()
}

export function getIncident(id) {
  const db = getDB()
  const row = db.prepare(`
    SELECT i.*, li.bag_no, li.intake_name, li.created_at AS intake_at, r.block, r.room_no,
      pg.garment_code, pg.garment_type, lm.name AS machine_name,
      COALESCE(ou.full_name, ow.full_name) AS owner_name,
      COALESCE(cu.full_name, cw.full_name, 'Sistem') AS created_by_name,
      CASE WHEN i.status IN ('open','investigating') AND i.sla_due_at < datetime('now') THEN 1 ELSE 0 END AS is_overdue
    FROM laundry_incidents i
    LEFT JOIN laundry_items li ON li.id=i.item_id
    LEFT JOIN rooms r ON r.id=li.room_id
    LEFT JOIN premium_garments pg ON pg.id=i.garment_id
    LEFT JOIN laundry_machines lm ON lm.id=i.machine_id
    LEFT JOIN users ou ON ou.id=i.owner_user_id
    LEFT JOIN staff ow ON ow.id=i.owner_worker_id
    LEFT JOIN users cu ON cu.id=i.created_by_user_id
    LEFT JOIN staff cw ON cw.id=i.created_by_worker_id
    WHERE i.id=?
  `).get(Number(id))
  if (!row) return null
  return {
    ...row,
    checklist: db.prepare(`
      SELECT item_key,label,is_complete,completed_at
      FROM laundry_incident_checklist WHERE incident_id=? ORDER BY rowid
    `).all(row.id),
  }
}

export function listIncidents(filters = {}) {
  const db = getDB()
  const conditions = []
  const params = []
  if (filters.scope === 'open') conditions.push("i.status IN ('open','investigating')")
  else if (filters.scope === 'resolved') conditions.push("i.status IN ('resolved','rejected')")
  if (filters.kind && INCIDENT_KINDS.has(filters.kind)) { conditions.push('i.kind=?'); params.push(filters.kind) }
  if (filters.severity && SEVERITIES.has(filters.severity)) { conditions.push('i.severity=?'); params.push(filters.severity) }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const ids = db.prepare(`
    SELECT i.id FROM laundry_incidents i ${where}
    ORDER BY CASE i.status WHEN 'open' THEN 0 WHEN 'investigating' THEN 1 ELSE 2 END,
      i.sla_due_at ASC, i.id DESC LIMIT 500
  `).all(...params)
  const incidents = ids.map(row => getIncident(row.id))
  const open = incidents.filter(row => ['open', 'investigating'].includes(row.status))
  return {
    summary: {
      open_total: open.length,
      lost_bags: open.filter(row => row.kind === 'lost_bag').length,
      lost_garments: open.filter(row => row.kind === 'lost_garment').length,
      overdue_total: open.filter(row => row.is_overdue).length,
      critical_total: open.filter(row => row.severity === 'critical').length,
      resolved_total: incidents.filter(row => ['resolved', 'rejected'].includes(row.status)).length,
      oldest_open_at: open.length
        ? open.reduce((oldest, row) => String(row.created_at) < String(oldest) ? row.created_at : oldest, open[0].created_at)
        : null,
    },
    incidents,
  }
}

export function updateIncident(id, input, actor = {}, { allowCompensation = false } = {}) {
  const db = getDB()
  const incident = getIncident(id)
  if (!incident) throw httpError('Vaka bulunamadı', 404)
  const { userId, workerId } = actorColumns(actor)
  return db.transaction(() => {
    if (input.checklist_key) {
      const completed = input.checklist_complete !== false
      const result = db.prepare(`
        UPDATE laundry_incident_checklist SET is_complete=?, completed_by_user_id=?,
          completed_by_worker_id=?, completed_at=CASE WHEN ?=1 THEN CURRENT_TIMESTAMP ELSE NULL END
        WHERE incident_id=? AND item_key=?
      `).run(completed ? 1 : 0, userId, workerId, completed ? 1 : 0, incident.id, String(input.checklist_key))
      if (!result.changes) throw httpError('Kontrol listesi maddesi bulunamadı', 404)
    }
    if (input.owner_user_id !== undefined || input.owner_worker_id !== undefined || input.severity || input.status) {
      const severity = input.severity || incident.severity
      const status = input.status || incident.status
      if (!SEVERITIES.has(severity)) throw httpError('Geçersiz önem seviyesi')
      if (!['open', 'investigating'].includes(status)) throw httpError('Bu uç yalnız açık vaka durumunu günceller')
      db.prepare(`
        UPDATE laundry_incidents SET severity=?, status=?, owner_user_id=?, owner_worker_id=?,
          sla_due_at=CASE WHEN severity<>? THEN datetime('now', ?) ELSE sla_due_at END,
          updated_at=CURRENT_TIMESTAMP WHERE id=?
      `).run(
        severity, status,
        input.owner_user_id === undefined ? incident.owner_user_id : input.owner_user_id || null,
        input.owner_worker_id === undefined ? incident.owner_worker_id : input.owner_worker_id || null,
        severity, `+${SLA_HOURS[severity]} hours`, incident.id,
      )
    }
    if (input.resolution) {
      const resolution = String(input.resolution)
      if (!RESOLUTIONS.has(resolution)) throw httpError('Geçersiz vaka sonucu')
      if (['compensated', 'reimbursed'].includes(resolution) && !allowCompensation) {
        throw httpError('Tazminat sonucunu yalnız kampüs yöneticisi onaylayabilir', 403)
      }
      const amount = input.compensation_amount == null ? null : Number(input.compensation_amount)
      if (amount != null && (!Number.isFinite(amount) || amount < 0)) throw httpError('Geçersiz tazminat tutarı')
      const pending = db.prepare(`
        SELECT COUNT(*) AS count FROM laundry_incident_checklist
        WHERE incident_id=? AND is_complete=0 AND item_key<>'notify'
      `).get(incident.id).count
      if (pending > 0 && resolution !== 'rejected') throw httpError(`${pending} kontrol listesi maddesi tamamlanmadan vaka kapatılamaz`, 409)
      db.prepare(`
        UPDATE laundry_incidents SET status=?,resolution=?,resolution_note=?,compensation_amount=?,
          approved_by_user_id=?,resolved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?
      `).run(
        resolution === 'rejected' ? 'rejected' : 'resolved', resolution,
        String(input.resolution_note || '').trim().slice(0, 1000) || null,
        amount, ['compensated', 'reimbursed'].includes(resolution) ? userId : null, incident.id,
      )
    }
    return getIncident(incident.id)
  }).immediate()
}

function completeDelivery(deliveryId, approverUserId = null) {
  const db = getDB()
  const delivery = db.prepare('SELECT * FROM laundry_delivery_batches WHERE id=?').get(deliveryId)
  if (!delivery) throw httpError('Teslim kaydı bulunamadı', 404)
  if (delivery.status === 'completed') return { ...delivery, idempotent: true }
  if (delivery.status !== 'pending_approval') throw httpError('Teslim onaylanabilir durumda değil', 409)
  const garmentIds = db.prepare('SELECT garment_id FROM laundry_delivery_batch_garments WHERE delivery_id=?').all(delivery.id).map(row => row.garment_id)
  return finalizeGarmentDelivery(delivery, garmentIds, approverUserId)
}

function finalizeGarmentDeliveryWrites(delivery, garmentIds, approverUserId = null, { cardScan = null } = {}) {
  const db = getDB()
  const item = db.prepare('SELECT * FROM laundry_items WHERE id=?').get(delivery.item_id)
    const garments = garmentIds.length
      ? db.prepare(`SELECT * FROM premium_garments WHERE item_id=? AND id IN (${garmentIds.map(() => '?').join(',')})`).all(item.id, ...garmentIds)
      : []
    if (!garments.length || garments.some(row => row.status !== 'ready')) throw httpError('Seçilen parçalardan biri artık teslime hazır değil', 409)
    const insertPremium = db.prepare(`
      INSERT INTO premium_garment_deliveries(garment_id,item_id,delivered_to,signature_data,delivered_by,delivered_by_worker_id)
      VALUES(?,?,?,?,?,?)
    `)
    const insertHistory = db.prepare(`
      INSERT INTO premium_garment_history(garment_id,from_status,to_status,action_by,action_by_worker_id,notes)
      VALUES(?,'ready','delivered',?,?,?)
    `)
    for (const garment of garments) {
      db.prepare("UPDATE premium_garments SET status='delivered',delivered_to=?,delivered_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .run(delivery.recipient_name, garment.id)
      insertPremium.run(garment.id, item.id, delivery.recipient_name, delivery.signature_data, delivery.delivered_by_user_id, delivery.delivered_by_worker_id)
      insertHistory.run(garment.id, delivery.delivered_by_user_id, delivery.delivered_by_worker_id, `Kısmi teslim #${delivery.id}`)
    }
    const remaining = db.prepare("SELECT COUNT(*) AS count FROM premium_garments WHERE item_id=? AND status='ready'").get(item.id).count
    const nextStatus = remaining === 0 ? 'delivered' : 'ready'
    db.prepare("UPDATE laundry_items SET status=?,delivered_name=?,last_modified_worker_id=?,last_modified_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .run(nextStatus, delivery.recipient_name, delivery.delivered_by_worker_id, item.id)
    db.prepare(`
      INSERT INTO laundry_history(item_id,from_status,to_status,action_by,worker_id,notes)
      VALUES(?,'ready',?,?,?,?)
    `).run(item.id, nextStatus, delivery.delivered_by_user_id, delivery.delivered_by_worker_id, `${garments.length} parça teslim #${delivery.id}`)
    if (remaining === 0) {
      db.prepare(`
        INSERT INTO laundry_deliveries(item_id,delivered_to,signature_data,delivered_by,delivered_by_worker_id)
        VALUES(?,?,?,?,?)
      `).run(item.id, delivery.recipient_name, delivery.signature_data, delivery.delivered_by_user_id, delivery.delivered_by_worker_id)
    }
    db.prepare(`
      UPDATE laundry_delivery_batches SET status='completed',approved_by_user_id=?,
        approved_at=CASE WHEN ? IS NULL THEN approved_at ELSE CURRENT_TIMESTAMP END,
        completed_at=CURRENT_TIMESTAMP WHERE id=?
    `).run(approverUserId, approverUserId, delivery.id)
    recordScan(cardScan, {
      item_id: item.id,
      operator_user_id: delivery.delivered_by_user_id,
      operator_worker_id: delivery.delivered_by_worker_id,
    })
  return { ...getDelivery(delivery.id), delivered_count: garments.length, remaining_count: remaining, item_status: nextStatus }
}

function finalizeGarmentDelivery(delivery, garmentIds, approverUserId = null, options = {}) {
  const db = getDB()
  return db.transaction(() => finalizeGarmentDeliveryWrites(delivery, garmentIds, approverUserId, options)).immediate()
}

export function getDelivery(id) {
  const db = getDB()
  const row = db.prepare(`
    SELECT d.*, li.bag_no, r.block, r.room_no,
      COALESCE(u.full_name,w.full_name,'Sistem') AS delivered_by_name,
      a.full_name AS approved_by_name
    FROM laundry_delivery_batches d
    JOIN laundry_items li ON li.id=d.item_id LEFT JOIN rooms r ON r.id=li.room_id
    LEFT JOIN users u ON u.id=d.delivered_by_user_id LEFT JOIN staff w ON w.id=d.delivered_by_worker_id
    LEFT JOIN users a ON a.id=d.approved_by_user_id WHERE d.id=?
  `).get(Number(id))
  if (!row) return null
  return { ...row, garment_ids: db.prepare('SELECT garment_id FROM laundry_delivery_batch_garments WHERE delivery_id=?').all(row.id).map(value => value.garment_id) }
}

export function createPartialDelivery(input, actor = {}, { cardScan = null } = {}) {
  const db = getDB()
  const itemId = Number(input.item_id)
  const item = db.prepare('SELECT * FROM laundry_items WHERE id=?').get(itemId)
  if (!item) throw httpError('Torba bulunamadı', 404)
  if (item.status !== 'ready') throw httpError('Torba teslime hazır değil', 409)
  const garmentIds = [...new Set((input.garment_ids || []).map(Number))]
  if (!garmentIds.length) throw httpError('En az bir hazır parça seçilmelidir')
  const recipientName = String(input.recipient_name || '').trim()
  const recipientType = input.recipient_type === 'third_party' ? 'third_party' : 'owner'
  const reason = String(input.third_party_reason || '').trim()
  if (!recipientName) throw httpError('Teslim alan kişi zorunludur')
  if (recipientType === 'third_party' && reason.length < 10) throw httpError('Üçüncü kişiye teslim için en az 10 karakter gerekçe gereklidir')
  const rows = db.prepare(`SELECT id,status FROM premium_garments WHERE item_id=? AND id IN (${garmentIds.map(() => '?').join(',')})`).all(itemId, ...garmentIds)
  if (rows.length !== garmentIds.length || rows.some(row => row.status !== 'ready')) throw httpError('Seçilen parçalardan biri teslime hazır değil', 409)
  const pending = db.prepare(`
    SELECT d.id FROM laundry_delivery_batches d
    JOIN laundry_delivery_batch_garments dg ON dg.delivery_id=d.id
    WHERE d.status='pending_approval' AND dg.garment_id IN (${garmentIds.map(() => '?').join(',')})
    LIMIT 1
  `).get(...garmentIds)
  if (pending) throw httpError(`Seçilen parça için #${pending.id} numaralı yönetici onayı bekleniyor`, 409)
  const { userId, workerId } = actorColumns(actor)
  return db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO laundry_delivery_batches(
        item_id,recipient_type,recipient_name,recipient_personnel_id,third_party_reason,status,
        signature_data,photo_url,delivered_by_user_id,delivered_by_worker_id
      ) VALUES(?,?,?,?,?,?,?,?,?,?)
    `).run(
      itemId, recipientType, recipientName, input.recipient_personnel_id || null,
      reason || null, recipientType === 'third_party' ? 'pending_approval' : 'completed',
      input.signature_data || null, input.photo_url || null, userId, workerId,
    )
    const id = Number(result.lastInsertRowid)
    const insert = db.prepare('INSERT INTO laundry_delivery_batch_garments(delivery_id,garment_id) VALUES(?,?)')
    for (const garmentId of garmentIds) insert.run(id, garmentId)
    const delivery = getDelivery(id)
    if (recipientType === 'third_party') {
      recordScan(cardScan, { item_id: itemId, operator_user_id: userId, operator_worker_id: workerId })
      return { ...delivery, approval_required: true }
    }
    return finalizeGarmentDeliveryWrites(delivery, garmentIds, null, { cardScan })
  }).immediate()
}

export function approvePartialDelivery(id, approverUserId) {
  if (!approverUserId) throw httpError('Yönetici onayı zorunludur', 403)
  return completeDelivery(Number(id), Number(approverUserId))
}

export function recordLoadCost(loadId) {
  const db = getDB()
  const existing = db.prepare('SELECT * FROM laundry_load_costs WHERE load_id=?').get(Number(loadId))
  if (existing) return existing
  const load = db.prepare('SELECT * FROM laundry_machine_loads WHERE id=?').get(Number(loadId))
  if (!load || load.status !== 'completed') return null
  const itemCount = db.prepare('SELECT COUNT(*) AS count FROM laundry_machine_load_items WHERE load_id=?').get(load.id).count
  const weight = Number(load.actual_weight_kg ?? load.estimated_weight_kg ?? 0)
  const waterLiters = money(35 + weight * (load.program === 'intensive' ? 5 : 3.2))
  const energyKwh = money(0.55 + weight * (load.program === 'intensive' ? 0.14 : 0.09))
  const waterUnit = Number(db.prepare("SELECT value FROM system_settings WHERE key='laundry_water_unit_cost'").get()?.value || 0.03)
  const energyUnit = Number(db.prepare("SELECT value FROM system_settings WHERE key='laundry_energy_unit_cost'").get()?.value || 4.5)
  const supplies = db.prepare(`
    SELECT s.id,s.unit,s.unit_cost,ms.per_wash_amount
    FROM laundry_machine_supplies ms JOIN laundry_supplies s ON s.id=ms.supply_id
    WHERE ms.machine_id=? AND s.is_active=1
  `).all(load.machine_id)
  const usage = supplies.map(row => {
    const quantity = money(Number(row.per_wash_amount || 0) * Math.max(1, itemCount))
    return { ...row, quantity, total_cost: money(quantity * Number(row.unit_cost || 0)) }
  })
  const suppliesCost = money(usage.reduce((sum, row) => sum + row.total_cost, 0))
  const waterCost = money(waterLiters * waterUnit)
  const energyCost = money(energyKwh * energyUnit)
  const totalCost = money(suppliesCost + waterCost + energyCost)
  return db.transaction(() => {
    db.prepare(`
      INSERT INTO laundry_load_costs(load_id,weight_kg,water_liters,energy_kwh,supplies_cost,water_cost,energy_cost,total_cost)
      VALUES(?,?,?,?,?,?,?,?)
    `).run(load.id, weight, waterLiters, energyKwh, suppliesCost, waterCost, energyCost, totalCost)
    const insert = db.prepare(`
      INSERT INTO laundry_load_supply_usage(load_id,supply_id,quantity,unit_cost,total_cost) VALUES(?,?,?,?,?)
    `)
    for (const row of usage) insert.run(load.id, row.id, row.quantity, row.unit_cost, row.total_cost)
    return db.prepare('SELECT * FROM laundry_load_costs WHERE load_id=?').get(load.id)
  }).immediate()
}

export function getCostReport(filters = {}) {
  const db = getDB()
  const from = String(filters.from || '').trim() || null
  const to = String(filters.to || '').trim() || null
  const rows = db.prepare(`
    SELECT c.*,l.machine_id,l.program,l.started_at,l.completed_at,m.name AS machine_name,
      (SELECT COUNT(*) FROM laundry_machine_load_items li WHERE li.load_id=l.id) AS bag_count
    FROM laundry_load_costs c JOIN laundry_machine_loads l ON l.id=c.load_id
    JOIN laundry_machines m ON m.id=l.machine_id
    WHERE (? IS NULL OR date(c.calculated_at)>=date(?)) AND (? IS NULL OR date(c.calculated_at)<=date(?))
    ORDER BY c.calculated_at DESC LIMIT 500
  `).all(from, from, to, to)
  return {
    summary: {
      loads: rows.length,
      weight_kg: money(rows.reduce((sum, row) => sum + Number(row.weight_kg), 0)),
      water_liters: money(rows.reduce((sum, row) => sum + Number(row.water_liters), 0)),
      energy_kwh: money(rows.reduce((sum, row) => sum + Number(row.energy_kwh), 0)),
      total_cost: money(rows.reduce((sum, row) => sum + Number(row.total_cost), 0)),
      cost_per_kg: money(rows.reduce((sum, row) => sum + Number(row.weight_kg), 0)
        ? rows.reduce((sum, row) => sum + Number(row.total_cost), 0) / rows.reduce((sum, row) => sum + Number(row.weight_kg), 0)
        : 0),
    },
    loads: rows,
  }
}
