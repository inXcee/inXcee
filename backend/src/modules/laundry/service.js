import * as q from './queries.js'
import { createNotification } from '../../shared/notifications/service.js'
import { logAudit } from '../../shared/audit.js'

// ═══════════════════════════════════════════════════════════════════════════
// STATE MACHINE
// ═══════════════════════════════════════════════════════════════════════════

const TRANSITIONS = {
  dirty: 'washing',
  washing: 'ready',
  ready: 'delivered',
}

// ═══════════════════════════════════════════════════════════════════════════
// ITEM CRUD
// ═══════════════════════════════════════════════════════════════════════════

export function createItemService({ room_id, item_count, item_details, notes, urgent, photo_url }, userId) {
  if (!room_id) throw new Error('Oda seçilmeli')
  if (!item_count || item_count < 1) throw new Error('Parça adedi en az 1 olmalı')

  const id = q.insertItemQuery({ room_id, item_count, item_details, notes, urgent, photo_url, created_by: userId })
  q.insertHistoryQuery({ item_id: id, from_status: null, to_status: 'dirty', action_by: userId, notes: `${item_count} parça kayıt` })

  if (urgent) {
    q.addToQueueQuery({ item_id: id, priority: 'urgent' })
  }

  logAudit(userId, 'laundry_create', 'laundry', id, `${item_count} parça`)
  return q.getItemQuery(id)
}

export function advanceItemService(id, { machine_id, shelf_location }, userId) {
  const item = q.getItemQuery(id)
  if (!item) throw new Error('Kayıt bulunamadı')
  if (!TRANSITIONS[item.status]) throw new Error(`"${item.status}" durumundan ilerlenemez`)

  const nextStatus = TRANSITIONS[item.status]
  const extra = {}

  if (nextStatus === 'washing') {
    if (!machine_id) throw new Error('Makine seçilmeli')
    extra.machine_id = machine_id
    q.updateMachineQuery(machine_id, { status: 'running' })
    q.removeItemFromQueueQuery(id)
  }

  if (nextStatus === 'ready') {
    extra.shelf_location = shelf_location || null
    if (item.machine_id) {
      q.updateMachineQuery(item.machine_id, { status: 'done' })
    }
    createNotification({
      message: `${item.block || '?'} ${item.room_no || '?'} — ${item.item_count} parça rafta hazır`,
      type: 'info',
      module: 'laundry',
      target_role: 'laundry',
    })
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
