import * as q from './queries.js'
import { createNotification } from '../../shared/notifications/service.js'
import { logAudit } from '../../shared/audit.js'
import { notifyItemReady } from './whatsapp.js'

// ═══════════════════════════════════════════════════════════════════════════
// STATE MACHINE
// ═══════════════════════════════════════════════════════════════════════════

const TRANSITIONS = {
  dirty: 'washing',
  washing: 'ready',   // needs_ironing=1 ise 'ironing' olur — advanceItemService'de override
  ironing: 'ready',
  ready: 'delivered',
}

// ═══════════════════════════════════════════════════════════════════════════
// ITEM CRUD
// ═══════════════════════════════════════════════════════════════════════════

export function createItemService({ room_id, item_count, item_details, notes, urgent, photo_url, phone_override, intake_name, intake_signature, clothing_items, needs_ironing }, userId) {
  if (!room_id) throw new Error('Oda seçilmeli')
  if (!item_count || item_count < 1) throw new Error('Parça adedi en az 1 olmalı')

  const id = q.insertItemQuery({ room_id, item_count, item_details, notes, urgent, photo_url, phone_override, intake_name, intake_signature, clothing_items, needs_ironing, created_by: userId })
  q.insertHistoryQuery({ item_id: id, from_status: null, to_status: 'dirty', action_by: userId, notes: `${item_count} parça kayıt` })

  if (urgent) {
    q.addToQueueQuery({ item_id: id, priority: 'urgent' })
  }

  logAudit(userId, 'laundry_create', 'laundry', id, `${item_count} parça`)
  return q.getItemQuery(id)
}

export function advanceItemService(id, { machine_id, shelf_location, timer_minutes } = {}, userId) {
  const item = q.getItemQuery(id)
  if (!item) throw new Error('Kayıt bulunamadı')
  if (!TRANSITIONS[item.status]) throw new Error(`"${item.status}" durumundan ilerlenemez`)

  let nextStatus = TRANSITIONS[item.status]
  // ironing override: washing → ironing (needs_ironing=1 ise)
  if (item.status === 'washing' && item.needs_ironing) {
    nextStatus = 'ironing'
  }
  const extra = {}

  if (nextStatus === 'washing') {
    if (!machine_id) throw new Error('Makine seçilmeli')
    extra.machine_id = machine_id
    const now = new Date()
    const timerEnd = (timer_minutes && timer_minutes > 0)
      ? new Date(now.getTime() + timer_minutes * 60000).toISOString()
      : null
    q.updateMachineQuery(machine_id, {
      status: 'running',
      timer_end: timerEnd,
      timer_started_at: timerEnd ? now.toISOString() : null,
      increment_runs: true,
    })
    q.removeItemFromQueueQuery(id)
  }

  if (nextStatus === 'ironing') {
    // washing → ironing: makineyi serbest bırak
    if (item.machine_id) {
      q.updateMachineQuery(item.machine_id, { status: 'done' })
    }
  }

  if (nextStatus === 'ready') {
    extra.shelf_location = shelf_location || null
    if (item.machine_id && item.status === 'washing') {
      q.updateMachineQuery(item.machine_id, { status: 'done' })
    }
    createNotification({
      message: `${item.block || '?'} ${item.room_no || '?'} — ${item.item_count} parça rafta hazır`,
      type: 'info',
      module: 'laundry',
      target_role: 'laundry',
    })
    // WhatsApp bildirimi — fire and forget
    notifyItemReady(id).catch(() => {})
  }

  q.updateItemStatusQuery(id, nextStatus, extra)
  q.insertHistoryQuery({ item_id: id, from_status: item.status, to_status: nextStatus, action_by: userId })
  logAudit(userId, 'laundry_advance', 'laundry', id, `${item.status} → ${nextStatus}`)

  return q.getItemQuery(id)
}

export function deliverItemService(id, { delivered_to, signature_data }, userId) {
  if (!delivered_to || !delivered_to.trim()) throw new Error('Teslim alanın adı zorunlu')

  const item = q.getItemQuery(id)
  if (!item) throw new Error('Kayıt bulunamadı')
  if (item.status !== 'ready') throw new Error('Sadece rafta hazır kayıtlar teslim edilebilir')

  q.insertDeliveryQuery({ item_id: id, delivered_to: delivered_to.trim(), signature_data, delivered_by: userId })
  q.updateItemStatusQuery(id, 'delivered')
  q.insertHistoryQuery({ item_id: id, from_status: 'ready', to_status: 'delivered', action_by: userId, notes: `Teslim: ${delivered_to.trim()}` })
  logAudit(userId, 'laundry_deliver', 'laundry', id, `→ ${delivered_to.trim()}`)

  return q.getItemQuery(id)
}

export function batchDeliverService(itemIds, { delivered_to, signature_data }, userId) {
  if (!delivered_to || !delivered_to.trim()) throw new Error('Teslim alanın adı zorunlu')
  if (!Array.isArray(itemIds) || !itemIds.length) throw new Error('En az 1 kayıt seçilmeli')

  let delivered = 0
  const errors = []
  for (const id of itemIds) {
    try {
      deliverItemService(id, { delivered_to, signature_data }, userId)
      delivered++
    } catch (e) {
      errors.push({ id, error: e.message })
    }
  }
  return { delivered, errors }
}

export function batchAssignService(itemIds, machineId, timerMinutes, userId) {
  if (!Array.isArray(itemIds) || !itemIds.length) throw new Error('En az 1 kayıt seçilmeli')
  const machine = q.getMachineQuery(machineId)
  if (!machine) throw new Error('Makine bulunamadı')

  if (machine.status === 'maintenance' || machine.status === 'running') {
    const errMsg = machine.status === 'maintenance' ? 'Makine bakımda — atama yapılamaz' : 'Makine meşgul — atama yapılamaz'
    return { success: [], failed: itemIds.map(id => ({ id, error: errMsg })) }
  }

  const success = []
  const failed = []
  for (const id of itemIds) {
    try {
      advanceItemService(id, { machine_id: machineId, timer_minutes: timerMinutes }, userId)
      success.push(id)
    } catch (e) {
      failed.push({ id, error: e.message })
    }
  }
  return { success, failed }
}

export function batchLostService(itemIds, notes, userId) {
  if (!Array.isArray(itemIds) || !itemIds.length) throw new Error('En az 1 kayıt seçilmeli')
  const success = []
  const failed = []
  for (const id of itemIds) {
    try {
      lostItemService(id, { notes }, userId)
      success.push(id)
    } catch (e) {
      failed.push({ id, error: e.message })
    }
  }
  return { success, failed }
}

export function lostItemService(id, { notes }, userId) {
  const item = q.getItemQuery(id)
  if (!item) throw new Error('Kayıt bulunamadı')
  if (item.status === 'delivered') throw new Error('Teslim edilmiş kayıt kayıp işaretlenemez')

  if (item.status === 'washing' && item.machine_id) {
    q.updateMachineQuery(item.machine_id, { status: 'idle' })
  }
  q.removeItemFromQueueQuery(id)

  q.updateItemStatusQuery(id, 'lost')
  q.insertHistoryQuery({ item_id: id, from_status: item.status, to_status: 'lost', action_by: userId, notes })
  logAudit(userId, 'laundry_lost', 'laundry', id, notes || '')

  createNotification({
    message: `⚠️ ${item.block || '?'} ${item.room_no || '?'} — ${item.item_count} parça KAYIP olarak işaretlendi`,
    type: 'warning',
    module: 'laundry',
    target_role: 'shift_supervisor',
  })

  return q.getItemQuery(id)
}

export function revertItemService(id, targetStatus, userId) {
  const item = q.getItemQuery(id)
  if (!item) throw new Error('Kayıt bulunamadı')

  const validReverts = { washing: ['dirty'], ready: ['washing', 'dirty'] }
  if (!validReverts[item.status]?.includes(targetStatus)) {
    throw new Error(`"${item.status}" → "${targetStatus}" geri alma desteklenmiyor`)
  }

  const extra = {}

  if (item.status === 'washing') {
    // washing → dirty: makineyi serbest bırak
    if (item.machine_id) q.updateMachineQuery(item.machine_id, { status: 'idle' })
    extra.machine_id = null
  }

  if (item.status === 'ready' && targetStatus === 'washing') {
    // ready → washing: boş makine ata
    const idleMachine = q.listMachinesQuery().find(m => m.status === 'idle')
    if (!idleMachine) throw new Error('Boş makine yok — Kirli Sepet\'e sürükle veya kart butonunu kullan')
    extra.machine_id = idleMachine.id
    extra.shelf_location = null
    q.updateMachineQuery(idleMachine.id, { status: 'running', increment_runs: true })
  }

  if (item.status === 'ready' && targetStatus === 'dirty') {
    extra.shelf_location = null
  }

  q.updateItemStatusQuery(id, targetStatus, extra)
  q.insertHistoryQuery({ item_id: id, from_status: item.status, to_status: targetStatus, action_by: userId, notes: 'Geri alındı' })
  logAudit(userId, 'laundry_revert', 'laundry', id, `${item.status} → ${targetStatus}`)

  return q.getItemQuery(id)
}

export function deleteItemService(id, userId) {
  const item = q.getItemQuery(id)
  if (!item) throw new Error('Kayıt bulunamadı')
  if (item.status !== 'dirty') throw new Error('Sadece sepetteki kayıtlar silinebilir')

  q.removeItemFromQueueQuery(id)
  const deleted = q.deleteItemQuery(id)
  if (!deleted) throw new Error('Silme işlemi başarısız')
  logAudit(userId, 'laundry_delete', 'laundry', id, '')
}

// ═══════════════════════════════════════════════════════════════════════════
// DAMAGE
// ═══════════════════════════════════════════════════════════════════════════

export function reportDamageService(itemId, { description, photo_url }, userId) {
  if (!description || !description.trim()) throw new Error('Hasar açıklaması zorunlu')
  const item = q.getItemQuery(itemId)
  if (!item) throw new Error('Kayıt bulunamadı')

  q.insertDamageQuery({ item_id: itemId, description: description.trim(), photo_url, reported_by: userId })
  q.insertHistoryQuery({ item_id: itemId, from_status: item.status, to_status: item.status, action_by: userId, notes: `Hasar: ${description.trim()}` })
  logAudit(userId, 'laundry_damage', 'laundry', itemId, description.trim())

  return q.getDamagesForItemQuery(itemId)
}

// ═══════════════════════════════════════════════════════════════════════════
// PASSTHROUGH SERVICES
// ═══════════════════════════════════════════════════════════════════════════

export function createVerificationService(itemId, { stage, items, all_present, missing_notes }, verifiedBy) {
  const item = q.getItemQuery(itemId)
  if (!item) throw new Error('Kayıt bulunamadı')
  if (!all_present && !missing_notes?.trim()) throw new Error('Eksik parça varsa not zorunlu')

  return q.insertVerificationQuery({
    item_id: itemId,
    stage,
    verified_by: verifiedBy,
    items_json: items,
    missing_notes: missing_notes?.trim() || null,
    all_present,
  })
}

export const getVerificationsService = q.getVerificationsForItemQuery

export const listItemsService       = q.listItemsQuery
export const getItemService         = q.getItemQuery
export const getItemHistoryService  = q.getItemHistoryQuery
export const getDamagesService      = q.getDamagesForItemQuery
export const listMachinesService    = q.listMachinesQuery
export const getMachineService      = q.getMachineQuery
export const getQueueService        = q.getQueueQuery
export const getSlaConfigService    = q.getSlaConfigQuery
export const getSlaViolationsService = q.getSlaViolationsQuery
export const getStatsService        = q.getStatsQuery

export function createMachineService({ name, type, capacity_kg }, userId) {
  if (!name || !name.trim()) throw new Error('Makine adı zorunlu')
  const id = q.insertMachineQuery({ name: name.trim(), type, capacity_kg })
  logAudit(userId, 'machine_create', 'laundry', id, name.trim())
  return q.getMachineQuery(id)
}

export function updateMachineService(id, fields, userId) {
  q.updateMachineQuery(id, fields)
  logAudit(userId, 'machine_update', 'laundry', id, JSON.stringify(fields))
  return q.getMachineQuery(id)
}

export function deleteMachineService(id, userId) {
  const ok = q.deleteMachineQuery(id)
  if (!ok) throw new Error('Aktif yıkama olan makine silinemez')
  logAudit(userId, 'machine_delete', 'laundry', id, '')
}

export function addToQueueService({ item_id, machine_id, priority }, userId) {
  const item = q.getItemQuery(item_id)
  if (!item) throw new Error('Kayıt bulunamadı')
  if (item.status !== 'dirty') throw new Error('Sadece sepetteki kayıtlar kuyruğa eklenebilir')
  q.addToQueueQuery({ item_id, machine_id, priority: item.urgent ? 'urgent' : (priority || 'normal') })
  logAudit(userId, 'queue_add', 'laundry', item_id, '')
}

export function removeFromQueueService(queueId, userId) {
  q.removeFromQueueQuery(queueId)
  logAudit(userId, 'queue_remove', 'laundry', queueId, '')
}

export function upsertSlaConfigService(data) {
  q.upsertSlaConfigQuery(data)
}

export function listAllItemsService(filters) {
  return q.listAllItemsQuery(filters)
}

export function markFoundService(id, userId) {
  const item = q.getItemQuery(id)
  if (!item) throw new Error('Kayıt bulunamadı')
  if (item.status !== 'lost') throw new Error('Yalnızca kayıp kayıtlar bulundu işaretlenebilir')
  return q.markFoundQuery(id, userId)
}

export function getPersonHistoryService(name) {
  if (!name) throw new Error('İsim gerekli')
  const items = q.getPersonHistoryQuery(name)
  const total_given = items.length
  const total_delivered = items.filter(i => i.status === 'delivered').length
  const total_lost = items.filter(i => i.status === 'lost').length
  const hoursArr = items.map(i => i.total_hours).filter(h => h != null)
  const avg_hours = hoursArr.length > 0 ? Math.round(hoursArr.reduce((a, b) => a + b, 0) / hoursArr.length) : null
  const phone = items[0]?.phone_number || null
  const room = items[0] ? `${items[0].block} · ${items[0].room_no}` : null
  return { name, phone, room, total_given, total_delivered, total_lost, avg_hours, items }
}
