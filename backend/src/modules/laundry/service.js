import * as q from './queries.js'
import { getDB } from '../../shared/db/index.js'
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

  // Oda bloğunu al ve premium kontrolü yap
  const db = getDB()
  const room = db.prepare(`SELECT block FROM rooms WHERE id=?`).get(room_id)
  const is_premium = room ? q.isBlockPremiumQuery(room.block) : false

  const id = q.insertItemQuery({ room_id, item_count, item_details, notes, urgent, photo_url, phone_override, intake_name, intake_signature, clothing_items, needs_ironing, is_premium, created_by: userId })
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

  // Premium item: washing → ironing/ready ise garments'ı toplu güncelle
  if (item.is_premium && item.status === 'washing') {
    const garmentStatus = nextStatus === 'ironing' ? 'ironing' : 'ready'
    q.bulkSetGarmentsStatusQuery(id, garmentStatus, userId)
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

  // Premium item: tüm ready garments delivered yapılır
  if (item.is_premium) {
    const garments = q.getPremiumGarmentsQuery(id)
    const readyGarments = garments.filter(g => g.status === 'ready')
    for (const g of readyGarments) {
      q.deliverPremiumGarmentQuery(g.id, id, { delivered_to: delivered_to.trim(), signature_data }, userId)
    }
    syncParentStatusService(id)
  }

  q.insertDeliveryQuery({ item_id: id, delivered_to: delivered_to.trim(), signature_data, delivered_by: userId })
  q.updateItemStatusQuery(id, 'delivered')
  q.insertHistoryQuery({ item_id: id, from_status: 'ready', to_status: 'delivered', action_by: userId, notes: `Teslim: ${delivered_to.trim()}` })
  logAudit(userId, 'laundry_deliver', 'laundry', id, `→ ${delivered_to.trim()}`)

  return q.getItemQuery(id)
}

export function deliverPremiumGarmentService(garment_id, { delivered_to, signature_data }, userId) {
  if (!delivered_to || !delivered_to.trim()) throw new Error('Teslim alanın adı zorunlu')
  const g = q.getPremiumGarmentQuery(garment_id)
  if (!g) throw Object.assign(new Error('Parça bulunamadı'), { status: 404 })
  if (g.status !== 'ready') throw new Error('Sadece hazır parçalar teslim edilebilir')
  q.deliverPremiumGarmentQuery(garment_id, g.item_id, { delivered_to: delivered_to.trim(), signature_data }, userId)
  syncParentStatusService(g.item_id)
  return q.getPremiumGarmentQuery(garment_id)
}

export function bulkDeliverPremiumGarmentsService(item_id, garment_ids, { delivered_to, signature_data }, userId) {
  if (!delivered_to || !delivered_to.trim()) throw new Error('Teslim alanın adı zorunlu')
  const item = q.getItemQuery(item_id)
  if (!item?.is_premium) throw Object.assign(new Error('Premium kayıt değil'), { status: 400 })
  let delivered = 0
  for (const gid of garment_ids) {
    const g = q.getPremiumGarmentQuery(gid)
    if (g && g.item_id === item_id && g.status === 'ready') {
      q.deliverPremiumGarmentQuery(gid, item_id, { delivered_to: delivered_to.trim(), signature_data }, userId)
      delivered++
    }
  }
  syncParentStatusService(item_id)
  return { delivered }
}

export function getPremiumDeliveryReceiptService(item_id) {
  const item = q.getItemQuery(item_id)
  if (!item) throw Object.assign(new Error('Kayıt bulunamadı'), { status: 404 })
  const garments = q.getPremiumDeliveryReceiptQuery(item_id)
  return { item, garments }
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

export function archiveItemsService(filters) {
  return q.archiveItemsQuery(filters)
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

export const getSettingsService  = q.getSettingsQuery
export const updateSettingService = q.updateSettingQuery

// ═══════════════════════════════════════════════════════════════════════════
// BLOCK CONFIG
// ═══════════════════════════════════════════════════════════════════════════

export const getBlockConfigService = q.getBlockConfigQuery
export function upsertBlockConfigService(block, is_premium, userId) {
  return q.upsertBlockConfigQuery(block, is_premium, userId)
}

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGES
// ═══════════════════════════════════════════════════════════════════════════

export function getMessagesService(opts = {}) {
  return q.getMessagesQuery(opts)
}

export function sendMessageService({ message, message_type = 'normal' }, user) {
  if (!message?.trim()) throw new Error('Mesaj boş olamaz')
  return q.insertMessageQuery({
    sender_id: user.id,
    sender_name: user.full_name || user.username,
    message: message.trim(),
    message_type,
  })
}

export function deleteMessageService(id, user) {
  const msg = q.getMessageQuery(id)
  if (!msg) throw Object.assign(new Error('Mesaj bulunamadı'), { status: 404 })
  if (msg.sender_id !== user.id && user.role !== 'campus_manager') {
    throw Object.assign(new Error('Yetkisiz'), { status: 403 })
  }
  return q.deleteMessageQuery(id)
}

export function pinMessageService(id, is_pinned, user) {
  const msg = q.getMessageQuery(id)
  if (!msg) throw Object.assign(new Error('Mesaj bulunamadı'), { status: 404 })
  return q.pinMessageQuery(id, is_pinned)
}

// ═══════════════════════════════════════════════════════════════════════════
// PREMIUM GARMENTS
// ═══════════════════════════════════════════════════════════════════════════

export function addPremiumGarmentsService(item_id, garments, userId) {
  const item = q.getItemQuery(item_id)
  if (!item) throw Object.assign(new Error('Kayıt bulunamadı'), { status: 404 })
  if (!item.is_premium) throw Object.assign(new Error('Bu kayıt premium değil'), { status: 400 })
  if (!garments?.length) throw new Error('En az bir parça gerekli')
  const codes = q.insertPremiumGarmentsQuery(item_id, garments)
  return { codes, garments: q.getPremiumGarmentsQuery(item_id) }
}

export function getPremiumGarmentsService(item_id) {
  return q.getPremiumGarmentsQuery(item_id)
}

export function getPremiumGarmentByCodeService(code) {
  const g = q.getPremiumGarmentByCodeQuery(code)
  if (!g) throw Object.assign(new Error('Parça bulunamadı'), { status: 404 })
  return g
}

// ── Durum akışı ──────────────────────────────────────────────────────────

const GARMENT_TRANSITIONS = { received: 'ironing', ironing: 'ready' }

export function syncParentStatusService(item_id) {
  const counts = q.checkAllGarmentsStatusQuery(item_id)
  if (counts.total === 0) return
  let parentStatus = null
  if (counts.delivered === counts.total) parentStatus = 'delivered'
  else if (counts.ready === counts.total) parentStatus = 'ready'
  else if (counts.ironing > 0) parentStatus = 'ironing'
  else if (counts.received > 0) parentStatus = 'washing' // hepsi received = henüz yıkamada
  if (parentStatus) q.updateItemStatusQuery(item_id, parentStatus)
}

export function advancePremiumGarmentService(garment_id, userId) {
  const g = q.getPremiumGarmentQuery(garment_id)
  if (!g) throw Object.assign(new Error('Parça bulunamadı'), { status: 404 })
  const next = GARMENT_TRANSITIONS[g.status]
  if (!next) throw Object.assign(new Error(`"${g.status}" durumundan ilerlenemez`), { status: 400 })
  const updated = q.advancePremiumGarmentQuery(garment_id, next, userId)
  syncParentStatusService(g.item_id)
  return updated
}

export function bulkAdvancePremiumGarmentsService(item_id, garment_ids, to_status, userId) {
  const VALID = ['ironing', 'ready', 'lost']
  if (!VALID.includes(to_status)) throw new Error('Geçersiz hedef durum')
  const item = q.getItemQuery(item_id)
  if (!item?.is_premium) throw Object.assign(new Error('Premium kayıt değil'), { status: 400 })
  for (const gid of garment_ids) {
    const g = q.getPremiumGarmentQuery(gid)
    if (g && g.item_id === item_id) q.advancePremiumGarmentQuery(gid, to_status, userId)
  }
  syncParentStatusService(item_id)
  return q.getPremiumGarmentsQuery(item_id)
}

export function searchPremiumGarmentsService(params) {
  return q.searchPremiumGarmentsQuery(params)
}

export function getRoomGarmentHistoryService(room_id, params) {
  return q.getRoomGarmentHistoryQuery(room_id, params)
}

export function getPremiumReportService(params) {
  return q.getPremiumReportQuery(params)
}

export function exportPremiumGarmentsService(params) {
  return q.exportPremiumGarmentsQuery(params)
}
