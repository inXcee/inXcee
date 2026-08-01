import * as q from './queries.js'
import { getDB } from '../../shared/db/index.js'
import { createNotification } from '../../shared/notifications/service.js'
import { EVENT_KINDS } from '../../shared/notifications/events.js'
import { logAudit } from '../../shared/audit.js'
import { notifyItemReady } from './whatsapp.js'
import { removeLaundryPhotoFile } from './photo-retention.js'

// Dashboard özeti (laundry rolü) — saf okuma.
export function getLaundrySummaryService() {
  return q.getLaundrySummaryQuery()
}

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

export function createItemService({ room_id, item_count, item_details, notes, urgent, photo_url, phone_override, intake_name, intake_signature, clothing_items, needs_ironing, garments }, userId) {
  if (!room_id) throw new Error('Oda seçilmeli')
  if (!item_count || item_count < 1) throw new Error('Parça adedi en az 1 olmalı')

  // Oda bloğunu al ve premium kontrolü yap
  const db = getDB()
  const room = db.prepare(`SELECT block FROM rooms WHERE id=?`).get(room_id)
  const is_premium = room ? q.isBlockPremiumQuery(room.block) : false

  // garments[] verilirse torba kiosktakiyle aynı şekilde tekil takibe girer;
  // verilmezse davranış aynen korunur (geriye uyum).
  const hasGarments = Array.isArray(garments) && garments.length > 0

  const id = db.transaction(() => {
    const newId = q.insertItemQuery({
      room_id, item_count, item_details, notes, urgent, photo_url, phone_override,
      intake_name, intake_signature, clothing_items, needs_ironing, is_premium,
      created_by: userId, tracking_mode: hasGarments ? 'individual' : 'legacy',
    })
    if (hasGarments) q.insertTrackedGarmentsQuery(newId, garments, { source: 'admin' })
    return newId
  }).immediate()
  q.insertHistoryQuery({ item_id: id, from_status: null, to_status: 'dirty', action_by: userId, notes: `${item_count} parça kayıt` })

  if (urgent) {
    q.addToQueueQuery({ item_id: id, priority: 'urgent' })
  }

  logAudit(userId, 'laundry_create', 'laundry', id, `${item_count} parça`)
  return q.getItemQuery(id)
}

export function advanceItemService(id, { machine_id, shelf_location, timer_minutes } = {}, userId, workerId = null) {
  const item = q.getItemQuery(id)
  if (!item) throw new Error('Kayıt bulunamadı')
  if (!TRANSITIONS[item.status]) throw new Error(`"${item.status}" durumundan ilerlenemez`)

  let nextStatus = TRANSITIONS[item.status]
  const garmentProgress = q.getGarmentProgressQuery(id)
  if (item.status === 'washing') {
    if (garmentProgress.total > 0) {
      nextStatus = garmentProgress.ironing_required > 0 ? 'ironing' : 'ready'
    } else if (item.needs_ironing) {
      nextStatus = 'ironing'
    }
  }
  const extra = {}

  // Pre-validation (DB yazmadan once) — washing'e gecis machine_id zorunlu
  if (nextStatus === 'washing' && !machine_id) throw new Error('Makine seçilmeli')

  // Tum DB yazmalari atomik — herhangi bir adimda hata olursa stok/durum/queue
  // tutarli sekilde rollback edilir.
  const db = getDB()
  const tx = db.transaction(() => {
    if (nextStatus === 'washing') {
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
      q.insertMachineRunQuery({ machine_id, item_id: id })
      q.removeItemFromQueueQuery(id)
      const machineSupplies = q.getMachineSuppliesQuery(machine_id)
      for (const ms of machineSupplies) {
        q.adjustStockQuery(ms.supply_id, -ms.per_wash_amount, {
          reason: 'wash_auto',
          item_id: id,
          machine_id: machine_id,
          created_by: userId,
        })
      }
    }

    if (nextStatus === 'ironing') {
      if (item.machine_id) q.updateMachineQuery(item.machine_id, { status: 'done' })
    }

    if (nextStatus === 'ready') {
      extra.shelf_location = shelf_location || null
      if (item.machine_id && item.status === 'washing') {
        q.updateMachineQuery(item.machine_id, { status: 'done' })
      }
    }

    if (garmentProgress.total > 0 && item.status === 'washing') {
      q.setTrackedGarmentsAfterWashQuery(id, userId, workerId)
    }

    q.updateItemStatusQuery(id, nextStatus, extra)
    q.insertHistoryQuery({
      item_id: id,
      from_status: item.status,
      to_status: nextStatus,
      action_by: userId,
      worker_id: workerId,
    })
  })
  tx.immediate()

  // Side-effect'ler transaction disinda (notification + WhatsApp) — DB rollback
  // olursa bunlar da gonderilmemeli; rollback'ta tx() throw eder ve buraya gelmezse calisir.
  // Yikama baslarken otomatik deterjan dusumu olduysa esik kontrolu: stok
  // uyari/kritik altina indiyse bildirim (dedup gun-ici tekil — spam olmaz).
  // Ayni anda makine bakim sayaci esik kontrolu.
  if (nextStatus === 'washing') {
    const m = q.getMachineQuery(machine_id)
    if (m && m.runs_since_maintenance >= q.MAINTENANCE_RUN_THRESHOLD) {
      createNotification({
        message: `🔧 ${m.name} bakım zamanı — son bakımdan beri ${m.runs_since_maintenance} yıkama (eşik ${q.MAINTENANCE_RUN_THRESHOLD})`,
        type: 'warning',
        module: 'laundry',
        target_role: 'laundry',
        dedup_key: `machine_maint_${m.id}`,
      })
    }
    for (const s of q.getAlertSuppliesQuery()) {
      createNotification({
        message: s.alert_level === 'critical'
          ? `🧴 KRİTİK STOK: ${s.name} ${s.current_stock}${s.unit} kaldı (eşik ${s.critical_threshold}${s.unit}) — acil sipariş gerekli`
          : `🧴 Stok azalıyor: ${s.name} ${s.current_stock}${s.unit} (uyarı eşiği ${s.warning_threshold}${s.unit})`,
        type: s.alert_level === 'critical' ? 'critical' : 'warning',
        module: 'laundry',
        target_role: s.alert_level === 'critical' ? null : 'laundry',
        dedup_key: `supply_low_${s.id}_${s.alert_level}`,
      })
    }
  }

  if (nextStatus === 'ready') {
    createNotification({
      message: `${item.block || '?'} ${item.room_no || '?'} — ${item.item_count} parça rafta hazır`,
      type: 'info',
      module: 'laundry',
      target_role: 'laundry',
      dedup_key: `laundry_ready_${id}`,
    })
    // Sakine WhatsApp yalnızca ilk hazır olusta. Damga kalıcı; torba ready'den
    // geri alınırsa revertItemService temizler ve tekrar hazır olunca yine gider.
    if (q.markReadyNotifiedQuery(id)) notifyItemReady(id).catch(() => {})
  }
  logAudit(userId, 'laundry_advance', 'laundry', id, `${item.status} → ${nextStatus}`)

  return q.getItemQuery(id)
}

export function deliverItemService(
  id,
  { delivered_to, signature_data, garment_ids },
  userId,
  workerId = null
) {
  if (!delivered_to || !delivered_to.trim()) throw new Error('Teslim alanın adı zorunlu')

  const db = getDB()
  const delivered = db.transaction(() => {
    const item = q.getItemQuery(id)
    if (!item) throw new Error('Kayıt bulunamadı')
    if (item.status !== 'ready') throw new Error('Sadece rafta hazır kayıtlar teslim edilebilir')

    const garments = q.getPremiumGarmentsQuery(id)
    const readyGarments = garments.filter(g => g.status === 'ready')
    const unresolved = garments.filter(g => !['ready', 'lost', 'damaged'].includes(g.status))
    if (unresolved.length > 0) {
      throw new Error(`${unresolved.length} kıyafet teslim için henüz hazır değil`)
    }

    if (Array.isArray(garment_ids)) {
      const selected = new Set(garment_ids.map(Number))
      if (
        selected.size !== readyGarments.length ||
        readyGarments.some(garment => !selected.has(garment.id))
      ) {
        throw new Error('Teslimden önce tüm hazır kıyafetler tek tek doğrulanmalıdır')
      }
    }

    for (const garment of readyGarments) {
      q.deliverPremiumGarmentQuery(
        garment.id,
        id,
        { delivered_to: delivered_to.trim(), signature_data },
        userId,
        workerId
      )
    }

    q.insertDeliveryQuery({
      item_id: id,
      delivered_to: delivered_to.trim(),
      signature_data,
      delivered_by: userId,
      delivered_by_worker_id: workerId,
    })
    q.updateItemStatusQuery(id, 'delivered')
    q.insertHistoryQuery({
      item_id: id,
      from_status: 'ready',
      to_status: 'delivered',
      action_by: userId,
      worker_id: workerId,
      notes: `Teslim: ${delivered_to.trim()}`,
    })
    return { ...q.getItemQuery(id), delivered_count: readyGarments.length }
  }).immediate()

  logAudit(userId, 'laundry_deliver', 'laundry', id, `→ ${delivered_to.trim()}`)

  return delivered
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
  if (!item) throw Object.assign(new Error('Kayıt bulunamadı'), { status: 404 })
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

export function maintenanceDoneService(id, userId) {
  const machine = q.getMachineQuery(id)
  if (!machine) throw new Error('Makine bulunamadı')
  const updated = q.machineMaintenanceDoneQuery(id)
  logAudit(userId, 'laundry_machine_maintenance', 'laundry', id, `${machine.name} bakım yapıldı (${machine.runs_since_maintenance} yıkama sonrası)`)
  return updated
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
    message: `⚠️ ${item.block || '?'} ${item.room_no || '?'} — ${item.item_count} parça KAYIP olarak işaretlendi. Tazminat girişi yapılması gerekiyor.`,
    type: 'warning',
    module: 'laundry',
    target_role: 'shift_supervisor',
  })

  return q.getItemQuery(id)
}

export function setCompensationService(id, { value, note }, userId) {
  const item = q.getItemQuery(id)
  if (!item) throw new Error('Kayıt bulunamadı')
  if (item.status !== 'lost') throw new Error('Tazminat sadece kayıp kıyafetler için girilebilir')
  if (value === undefined || value === null) throw new Error('Değer zorunlu')
  if (value < 0) throw new Error('Değer negatif olamaz')
  q.updateCompensationQuery(id, value, note)
  logAudit(userId, 'laundry_compensation', 'laundry', id, `₺${value}`)
  return q.getItemQuery(id)
}

export function revertItemService(id, targetStatus, userId) {
  const item = q.getItemQuery(id)
  if (!item) throw new Error('Kayıt bulunamadı')

  const validReverts = {
    washing:   ['dirty'],
    ironing:   ['dirty'],
    ready:     ['washing', 'dirty', 'lost'],
    delivered: ['ready'],
    lost:      ['dirty'],
  }
  if (!validReverts[item.status]?.includes(targetStatus)) {
    throw new Error(`"${item.status}" → "${targetStatus}" geri alma desteklenmiyor`)
  }

  const extra = {}

  if (item.status === 'washing') {
    // washing → dirty: makineyi serbest bırak
    if (item.machine_id) q.updateMachineQuery(item.machine_id, { status: 'idle' })
    extra.machine_id = null
  }

  if (item.status === 'ironing' && targetStatus === 'dirty') {
    // ironing → dirty: önceki makine zaten serbest bırakılmıştı
  }

  // ready'den çıkan her geri alma bildirim damgasını sıfırlar — torba yeniden
  // hazır olduğunda sakine tekrar haber gitsin.
  if (item.status === 'ready') extra.ready_notified_at = null

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

  if (item.status === 'ready' && targetStatus === 'lost') {
    // bulunan geri alınır (found undo)
    extra.shelf_location = null
  }

  if (item.status === 'delivered' && targetStatus === 'ready') {
    // teslim geri alınır — imza logu laundry_history'de kalır
  }

  if (item.status === 'lost' && targetStatus === 'dirty') {
    // kayıp geri alınır
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

  // Silmeden ÖNCE topla: satırlar cascade ile gidince URL'lere ulaşılamaz.
  const db = getDB()
  const photoUrls = [
    item.photo_url,
    ...db.prepare('SELECT photo_url FROM laundry_garment_exceptions WHERE item_id=? AND photo_url IS NOT NULL')
      .all(id).map(row => row.photo_url),
    ...db.prepare('SELECT photo_url FROM laundry_damages WHERE item_id=? AND photo_url IS NOT NULL')
      .all(id).map(row => row.photo_url),
  ].filter(Boolean)

  q.removeItemFromQueueQuery(id)
  const deleted = q.deleteItemQuery(id)
  if (!deleted) throw new Error('Silme işlemi başarısız')
  // Dosya silme DB'den sonra: silme başarısız olursa dosya boşuna gitmesin.
  photoUrls.forEach(url => removeLaundryPhotoFile(url))
  logAudit(userId, 'laundry_delete', 'laundry', id, '')
}

// ═══════════════════════════════════════════════════════════════════════════
// DAMAGE
// ═══════════════════════════════════════════════════════════════════════════

export function deleteDamageService(damageId, userId) {
  const db = getDB()
  const damage = db.prepare(`SELECT * FROM laundry_damages WHERE id = ?`).get(damageId)
  if (!damage) throw new Error('Hasar kaydı bulunamadı')
  const ok = q.deleteDamageQuery(damageId)
  if (!ok) throw new Error('Hasar silinemedi')
  logAudit(userId, 'laundry_damage_delete', 'laundry', damageId, 'Geri alındı')
}

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
export const getMachineDailyRunsService = q.getMachineDailyRunsQuery
export const getOperatorSummaryService  = q.getOperatorSummaryQuery
export const getBusynessService         = q.getBusynessQuery
export const getItemHistoryService  = q.getItemHistoryQuery
export const getDamagesService      = q.getDamagesForItemQuery
export const listMachinesService    = q.listMachinesQuery
export const getMachineService      = q.getMachineQuery
export const getQueueService        = q.getQueueQuery
export const getSlaConfigService    = q.getSlaConfigQuery
export const getSlaViolationsService = q.getSlaViolationsQuery
export const getSlaPreWarningsService = q.getSlaPreWarningsQuery
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

// Room overview ve detay servisleri — LaundryHub Odalar sekmesi
export function getRoomsOverviewService() {
  return q.getAllRoomsLaundryOverviewQuery()
}

export function getRoomLaundryDetailService(block, room_no) {
  if (!block || !room_no) throw new Error('block ve room_no gerekli')
  const roomRow      = q.getRoomIdByBlockAndNoQuery(block, room_no)
  const summary      = q.getRoomLaundrySummaryQuery(block, room_no)
  const items        = q.getRoomLaundryHistoryQuery(block, room_no)
  const trend        = q.getRoomLaundryTrendQuery(block, room_no)
  const by_person    = q.getRoomLaundryByPersonQuery(block, room_no)
  const occupants    = q.getRoomOccupantsQuery(block, room_no)
  const heatmap      = q.getRoomCalendarHeatmapQuery(block, room_no, 365)
  const hour_day     = q.getRoomHourDayPatternQuery(block, room_no)
  const block_avg    = q.getBlockAverageStatsQuery(block)
  const damages      = q.getRoomDamagesQuery(block, room_no)
  const sla_violations = q.getRoomSlaViolationsQuery(block, room_no)
  const last_bag     = q.getLastBagForRoomQuery(block, room_no)
  const premium_items = q.getRoomPremiumGarmentsQuery(block, room_no)
  return {
    block, room_no, room_id: roomRow?.id || null,
    summary, items, trend, by_person, occupants,
    heatmap, hour_day, block_avg, damages, sla_violations, last_bag,
    premium_items,
  }
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
  const msg = q.insertMessageQuery({
    sender_id: user.id,
    sender_name: user.full_name || user.username,
    message: message.trim(),
    message_type,
  })
  // A→Z: yeni mesaj bildirim akışına
  const isUrgent = message_type === 'urgent'
  const preview = message.trim().slice(0, 80)
  createNotification({
    message: `💬 ${user.full_name || user.username}: ${preview}${message.length > 80 ? '…' : ''}`,
    event_kind: EVENT_KINDS.LAUNDRY_MESSAGE_SENT,
    severity: isUrgent ? 'warning' : 'info',
    target_role: 'laundry',
    entity_type: 'laundry_message',
    entity_id: msg?.id || null,
  })
  // shift_supervisor + campus_manager için ikinci kopya (target_role aynı anda iki rol olamaz)
  createNotification({
    message: `💬 [Çamaşır] ${user.full_name || user.username}: ${preview}${message.length > 80 ? '…' : ''}`,
    event_kind: EVENT_KINDS.LAUNDRY_MESSAGE_SENT,
    severity: isUrgent ? 'warning' : 'info',
    target_role: 'campus_manager',
    entity_type: 'laundry_message',
    entity_id: msg?.id || null,
  })
  return msg
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
  if (!garments?.length) throw new Error('En az bir parça gerekli')
  const db = getDB()
  const created = db.transaction(() =>
    q.insertTrackedGarmentsQuery(item_id, garments, { source: 'admin' })
  ).immediate()
  if (created.length) q.setTrackingModeIndividualQuery(item_id)
  return { codes: created.map(g => g.garment_code), garments: q.getPremiumGarmentsQuery(item_id) }
}

export function getPremiumGarmentsService(item_id) {
  return q.getPremiumGarmentsQuery(item_id)
}

export function getGarmentDetailService(garmentId) {
  const detail = q.getGarmentDetailQuery(garmentId)
  if (!detail) throw Object.assign(new Error('Parça bulunamadı'), { status: 404 })
  return detail
}

export function setGarmentIroningService(
  itemId,
  garmentId,
  { completed = true, client_action_id = null },
  userId
) {
  const db = getDB()
  const result = db.transaction(() => q.setGarmentIroningQuery({
    itemId,
    garmentId,
    completed,
    clientActionId: client_action_id || null,
    userId,
    workerId: null,
  })).immediate()
  if (!result) throw Object.assign(new Error('Parça bulunamadı'), { status: 404 })
  if (result.changed) {
    logAudit(
      userId,
      completed ? 'laundry_garment_ironed' : 'laundry_garment_ironing_undo',
      'laundry',
      garmentId,
      JSON.stringify({ itemId, client_action_id: client_action_id || null })
    )
  }
  return { ...result, progress: q.getGarmentProgressQuery(itemId) }
}

export function addGarmentExceptionService(
  itemId,
  garmentId,
  { reason, note, photo_url },
  userId
) {
  const allowed = new Set(['missing', 'damaged', 'no_ironing', 'rework', 'other'])
  if (!allowed.has(reason)) throw Object.assign(new Error('Geçersiz istisna nedeni'), { status: 400 })
  if (reason === 'damaged' && !photo_url) {
    throw Object.assign(new Error('Hasarlı kıyafet için fotoğraf zorunludur'), { status: 400 })
  }
  const item = q.getItemQuery(itemId)
  if (!item) throw Object.assign(new Error('Torba bulunamadı'), { status: 404 })
  if (!['ironing', 'ready'].includes(item.status)) {
    throw Object.assign(new Error('İstisna bu aşamada kaydedilemez'), { status: 409 })
  }
  const garment = getDB().transaction(() => q.insertGarmentExceptionQuery({
    itemId,
    garmentId,
    stage: item.status === 'ironing' ? 'ironing' : 'delivery',
    reason,
    note: note || null,
    photoUrl: photo_url || null,
    userId,
    workerId: null,
  })).immediate()
  if (!garment) throw Object.assign(new Error('Parça bulunamadı'), { status: 404 })
  logAudit(
    userId,
    'laundry_garment_exception',
    'laundry',
    garmentId,
    JSON.stringify({ itemId, reason, photo_url: photo_url || null })
  )
  return { garment, progress: q.getGarmentProgressQuery(itemId) }
}

export function completeGarmentIroningService(itemId, shelfLocation, userId) {
  const item = q.getItemQuery(itemId)
  if (!item) throw Object.assign(new Error('Torba bulunamadı'), { status: 404 })
  if (item.status === 'ready') return { ok: true, idempotent: true }
  if (item.status !== 'ironing') {
    throw Object.assign(new Error('Torba ütü aşamasında değil'), { status: 409 })
  }
  const progress = q.getGarmentProgressQuery(itemId)
  if (progress.total > 0 && progress.pending_ironing > 0) {
    throw Object.assign(
      new Error(`${progress.pending_ironing} kıyafet henüz çözülmedi`),
      { status: 409, progress }
    )
  }
  advanceItemService(itemId, { shelf_location: shelfLocation || null }, userId)
  return { ok: true, progress: q.getGarmentProgressQuery(itemId) }
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
  const terminalExceptions = counts.lost + counts.damaged
  if (counts.delivered + terminalExceptions === counts.total) parentStatus = 'delivered'
  else if (counts.ready + terminalExceptions === counts.total) parentStatus = 'ready'
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
  if (!item) throw Object.assign(new Error('Kayıt bulunamadı'), { status: 404 })
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

// ═══════════════════════════════════════════════════════════════════════════
// ROOM SCAN
// ═══════════════════════════════════════════════════════════════════════════

export function getRoomGarmentsForScanService(block, room_no) {
  if (!block || !room_no) throw Object.assign(new Error('Blok ve oda numarası zorunlu'), { status: 400 })
  const result = q.getRoomGarmentsForScanQuery(block, room_no)
  if (!result) throw Object.assign(new Error('Oda bulunamadı'), { status: 404 })
  return result
}

export function scanActionService(block, room_no, garment_id, action, userId) {
  const VALID_ACTIONS = ['advance', 'deliver', 'lost']
  if (!VALID_ACTIONS.includes(action)) throw Object.assign(new Error('Geçersiz aksiyon'), { status: 400 })

  const db = getDB()
  const room = db.prepare(`SELECT id FROM rooms WHERE block=? AND room_no=?`).get(block, room_no)
  if (!room) throw Object.assign(new Error('Oda bulunamadı'), { status: 404 })

  const g = q.getPremiumGarmentQuery(garment_id)
  if (!g) throw Object.assign(new Error('Parça bulunamadı'), { status: 404 })

  let result
  if (action === 'advance') {
    result = advancePremiumGarmentService(garment_id, userId)
  } else if (action === 'deliver') {
    result = deliverPremiumGarmentService(garment_id, { delivered_to: `${block} ${room_no}` }, userId)
  } else if (action === 'lost') {
    q.advancePremiumGarmentQuery(garment_id, 'lost', userId)
    syncParentStatusService(g.item_id)
    result = q.getPremiumGarmentQuery(garment_id)
  }

  q.insertScanLogQuery(room.id, block, room_no, garment_id, action, userId)
  return result
}

// ═══════════════════════════════════════════════════════════════════════════
// SUPPLIES
// ═══════════════════════════════════════════════════════════════════════════

export function listSuppliesService(includeInactive = false) {
  return q.listSuppliesQuery(includeInactive)
}

export function createSupplyService({ name, unit, current_stock, warning_threshold, critical_threshold }, userId) {
  if (!name || !name.trim()) throw new Error('Ürün adı zorunlu')
  if (warning_threshold > 0 && critical_threshold > 0 && critical_threshold >= warning_threshold) {
    throw new Error('Kritik eşik uyarı eşiğinden küçük olmalı')
  }
  const id = q.insertSupplyQuery({ name: name.trim(), unit, current_stock, warning_threshold, critical_threshold })
  logAudit(userId, 'supply_create', 'laundry', id, name.trim())
  return q.getSupplyQuery(id)
}

export function updateSupplyService(id, fields, userId) {
  const supply = q.getSupplyQuery(id)
  if (!supply) throw new Error('Ürün bulunamadı')
  const updated = q.updateSupplyQuery(id, fields)
  logAudit(userId, 'supply_update', 'laundry', id, JSON.stringify(fields))
  return updated
}

export function addStockService(supplyId, amount, note, userId) {
  if (!amount || amount <= 0) throw new Error('Miktar pozitif olmalı')
  const supply = q.getSupplyQuery(supplyId)
  if (!supply) throw new Error('Ürün bulunamadı')
  return q.adjustStockQuery(supplyId, +amount, { reason: 'manual_add', note, created_by: userId })
}

export function setStockService(supplyId, newStock, userId) {
  if (newStock < 0) throw new Error('Stok negatif olamaz')
  return q.setStockQuery(supplyId, +newStock, userId)
}

export function upsertMachineSupplyService(machine_id, supply_id, per_wash_amount, userId) {
  if (!machine_id || !supply_id) throw new Error('machine_id ve supply_id zorunlu')
  if (per_wash_amount < 0) throw new Error('Tüketim miktarı negatif olamaz')
  q.upsertMachineSupplyQuery(+machine_id, +supply_id, +per_wash_amount)
  logAudit(userId, 'machine_supply_upsert', 'laundry', machine_id, `supply:${supply_id} amount:${per_wash_amount}`)
}

export function deleteMachineSupplyService(machine_id, supply_id, userId) {
  q.deleteMachineSupplyQuery(+machine_id, +supply_id)
  logAudit(userId, 'machine_supply_delete', 'laundry', machine_id, `supply:${supply_id}`)
}

export function getSupplyLogService(supply_id) {
  return q.getSupplyLogQuery(+supply_id)
}

export function getAlertSuppliesService() {
  return q.getAlertSuppliesQuery()
}

// Parça künyesi güncelleme — kiosk ve yönetim panelinin ORTAK yolu.
// Ayrı ayrı yazılırsa biri arşivi güncellemeyi ya da teslim kontrolünü atlar
// (bkz. iki insert yolunun ayrışmasından çıkan hata, migration 069 notu).
export function updateGarmentTagService(garmentId, patch, { userId = null, workerId = null } = {}) {
  const db = getDB()
  const row = db.prepare(`
    SELECT pg.id, pg.status, pg.item_id, li.room_id, li.intake_name
    FROM premium_garments pg
    JOIN laundry_items li ON li.id = pg.item_id
    WHERE pg.id = ?
  `).get(garmentId)
  if (!row) throw Object.assign(new Error('Kıyafet bulunamadı'), { status: 404 })
  if (row.status === 'delivered') {
    throw Object.assign(new Error('Teslim edilmiş parçanın künyesi değiştirilemez'), { status: 409 })
  }

  const garment = db.transaction(
    () => q.updateGarmentDetailsQuery(garmentId, patch, { userId, workerId })
  ).immediate()
  if (!garment) throw Object.assign(new Error('Kıyafet bulunamadı'), { status: 404 })

  // Arşiv yan üründür: hatası künye kaydını düşürmemeli.
  if (row.room_id) {
    try {
      q.upsertArchiveGarmentsQuery(row.room_id, row.intake_name || null, [{
        type_id: garment.garment_type_id,
        type_name: garment.garment_type,
        emoji: garment.emoji,
        brand: garment.brand,
        model: garment.model,
        size: garment.size,
        color: garment.color,
        colors: safeColors(garment.colors_json),
        pattern: garment.pattern,
        requires_ironing: garment.requires_ironing,
        condition_notes: garment.condition_notes,
      }])
    } catch { /* arşiv güncellenemedi — künye yazıldı, akış devam eder */ }
  }
  return garment
}

function safeColors(raw) {
  try {
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}
