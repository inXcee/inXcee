// A→Z Bildirim — event_kind enum
// Format: <module>.<entity>.<action>
// Severity hint: info | warning | critical (default info)
// Yeni event ekleniyorsa: 1) buraya ekle, 2) link şablonu varsa LINKS'e ekle
// Whitelist dışı event_kind reddedilir (createNotification içinde).

export const EVENT_KINDS = Object.freeze({
  // INVENTORY
  INVENTORY_MOVEMENT_ADDED:    'inventory.movement.added',
  INVENTORY_MOVEMENT_REMOVED:  'inventory.movement.removed',
  INVENTORY_MOVEMENT_TRANSFER: 'inventory.movement.transferred',
  INVENTORY_STOCK_LOW:         'inventory.stock.low',
  INVENTORY_STOCK_OUT:         'inventory.stock.out',
  INVENTORY_LOT_EXPIRING:      'inventory.lot.expiring',
  INVENTORY_REQUEST_CREATED:   'inventory.request.created',
  INVENTORY_REQUEST_APPROVED:  'inventory.request.approved',
  INVENTORY_REQUEST_REJECTED:  'inventory.request.rejected',
  INVENTORY_PO_CREATED:        'inventory.po.created',
  INVENTORY_PO_RECEIVED:       'inventory.po.received',

  // LAUNDRY
  LAUNDRY_BAG_CREATED:    'laundry.bag.created',
  LAUNDRY_BAG_READY:      'laundry.bag.ready',
  LAUNDRY_BAG_LOST:       'laundry.bag.lost',
  LAUNDRY_BAG_DELIVERED:  'laundry.bag.delivered',
  LAUNDRY_MESSAGE_SENT:   'laundry.message.sent',
  LAUNDRY_SLA_WARNING:    'laundry.sla.warning',
  LAUNDRY_SLA_CRITICAL:   'laundry.sla.critical',
  LAUNDRY_DAMAGE:         'laundry.damage.reported',

  // HOUSEKEEPING
  HOUSEKEEPING_TASK_COMPLETED:    'housekeeping.task.completed',
  HOUSEKEEPING_TASK_OVERDUE:      'housekeeping.task.overdue',
  HOUSEKEEPING_DEFICIENCY:        'housekeeping.deficiency.reported',

  // MAINTENANCE
  MAINTENANCE_CREATED:    'maintenance.request.created',
  MAINTENANCE_ASSIGNED:   'maintenance.request.assigned',
  MAINTENANCE_RESOLVED:   'maintenance.request.resolved',
  MAINTENANCE_OVERDUE:    'maintenance.request.overdue',

  // CHECKIN / CHECKOUT
  CHECKIN_DONE:           'checkin.checkin',
  CHECKOUT_DONE:          'checkin.checkout',
  CHECKIN_ROOM_CHANGE:    'checkin.room_change',

  // DISIPLIN
  DISCIPLINE_RECORD_CREATED: 'discipline.record.created',

  // DUYURU
  ANNOUNCEMENT_PUBLISHED: 'announcement.published',

  // ROOM HISTORY
  ROOM_HISTORY_CHANGE:    'room_history.change',

  // CAPACITY
  CAPACITY_THRESHOLD_HIGH: 'capacity.threshold.high',
  CAPACITY_THRESHOLD_FULL: 'capacity.threshold.full',

  // SHIFTS
  SHIFT_ASSIGNED:         'shifts.shift.assigned',
  SHIFT_SWAPPED:          'shifts.shift.swapped',

  // KVKK / SELF-SERVICE
  KVKK_CONSENT_GIVEN:     'kvkk.consent.given',
  SELF_SERVICE_FEEDBACK:  'self_service.feedback.received',

  // SYSTEM
  SYSTEM_BACKUP_SUCCESS:  'system.backup.success',
  SYSTEM_BACKUP_FAILED:   'system.backup.failed',
  SYSTEM_ERROR_CRITICAL:  'system.error.critical',
  SYSTEM_USER_CREATED:    'system.user.created',
  SYSTEM_USER_DELETED:    'system.user.deleted',
})

const ALL_KINDS = new Set(Object.values(EVENT_KINDS))

export function isValidEventKind(kind) {
  return typeof kind === 'string' && ALL_KINDS.has(kind)
}

// Module çıkarımı: 'inventory.movement.added' -> 'inventory'
export function moduleFromEventKind(kind) {
  if (!kind || typeof kind !== 'string') return null
  return kind.split('.')[0] || null
}

// Severity önerileri (createNotification'da default kullanılır)
export const DEFAULT_SEVERITY = {
  [EVENT_KINDS.INVENTORY_MOVEMENT_ADDED]:    'info',
  [EVENT_KINDS.INVENTORY_MOVEMENT_REMOVED]:  'info',
  [EVENT_KINDS.INVENTORY_MOVEMENT_TRANSFER]: 'info',
  [EVENT_KINDS.INVENTORY_STOCK_LOW]:         'warning',
  [EVENT_KINDS.INVENTORY_STOCK_OUT]:         'critical',
  [EVENT_KINDS.INVENTORY_LOT_EXPIRING]:      'warning',
  [EVENT_KINDS.INVENTORY_REQUEST_CREATED]:   'info',
  [EVENT_KINDS.INVENTORY_REQUEST_APPROVED]:  'info',
  [EVENT_KINDS.INVENTORY_REQUEST_REJECTED]:  'warning',
  [EVENT_KINDS.INVENTORY_PO_CREATED]:        'info',
  [EVENT_KINDS.INVENTORY_PO_RECEIVED]:       'info',

  [EVENT_KINDS.LAUNDRY_BAG_CREATED]:    'info',
  [EVENT_KINDS.LAUNDRY_BAG_READY]:      'info',
  [EVENT_KINDS.LAUNDRY_BAG_LOST]:       'warning',
  [EVENT_KINDS.LAUNDRY_BAG_DELIVERED]:  'info',
  [EVENT_KINDS.LAUNDRY_MESSAGE_SENT]:   'info',
  [EVENT_KINDS.LAUNDRY_SLA_WARNING]:    'warning',
  [EVENT_KINDS.LAUNDRY_SLA_CRITICAL]:   'critical',
  [EVENT_KINDS.LAUNDRY_DAMAGE]:         'warning',

  [EVENT_KINDS.HOUSEKEEPING_TASK_COMPLETED]: 'info',
  [EVENT_KINDS.HOUSEKEEPING_TASK_OVERDUE]:   'warning',
  [EVENT_KINDS.HOUSEKEEPING_DEFICIENCY]:     'warning',

  [EVENT_KINDS.MAINTENANCE_CREATED]:    'info',
  [EVENT_KINDS.MAINTENANCE_ASSIGNED]:   'info',
  [EVENT_KINDS.MAINTENANCE_RESOLVED]:   'info',
  [EVENT_KINDS.MAINTENANCE_OVERDUE]:    'warning',

  [EVENT_KINDS.CHECKIN_DONE]:           'info',
  [EVENT_KINDS.CHECKOUT_DONE]:          'info',
  [EVENT_KINDS.CHECKIN_ROOM_CHANGE]:    'info',

  [EVENT_KINDS.DISCIPLINE_RECORD_CREATED]: 'warning',

  [EVENT_KINDS.ANNOUNCEMENT_PUBLISHED]: 'info',

  [EVENT_KINDS.ROOM_HISTORY_CHANGE]:    'info',

  [EVENT_KINDS.CAPACITY_THRESHOLD_HIGH]: 'warning',
  [EVENT_KINDS.CAPACITY_THRESHOLD_FULL]: 'critical',

  [EVENT_KINDS.SHIFT_ASSIGNED]:         'info',
  [EVENT_KINDS.SHIFT_SWAPPED]:          'info',

  [EVENT_KINDS.KVKK_CONSENT_GIVEN]:     'info',
  [EVENT_KINDS.SELF_SERVICE_FEEDBACK]:  'info',

  [EVENT_KINDS.SYSTEM_BACKUP_SUCCESS]:  'info',
  [EVENT_KINDS.SYSTEM_BACKUP_FAILED]:   'critical',
  [EVENT_KINDS.SYSTEM_ERROR_CRITICAL]:  'critical',
  [EVENT_KINDS.SYSTEM_USER_CREATED]:    'info',
  [EVENT_KINDS.SYSTEM_USER_DELETED]:    'warning',
}

// Deep-link şablonları — {id}, {entity_id} placeholder
export const LINK_TEMPLATES = {
  [EVENT_KINDS.LAUNDRY_BAG_READY]:      '/laundry?item={entity_id}',
  [EVENT_KINDS.LAUNDRY_BAG_LOST]:       '/laundry?item={entity_id}',
  [EVENT_KINDS.LAUNDRY_BAG_DELIVERED]:  '/laundry?item={entity_id}',
  [EVENT_KINDS.LAUNDRY_MESSAGE_SENT]:   '/laundry?tab=messages',
  [EVENT_KINDS.LAUNDRY_SLA_WARNING]:    '/laundry?item={entity_id}',
  [EVENT_KINDS.LAUNDRY_SLA_CRITICAL]:   '/laundry?item={entity_id}',
  [EVENT_KINDS.MAINTENANCE_CREATED]:    '/maintenance?id={entity_id}',
  [EVENT_KINDS.MAINTENANCE_ASSIGNED]:   '/maintenance?id={entity_id}',
  [EVENT_KINDS.MAINTENANCE_RESOLVED]:   '/maintenance?id={entity_id}',
  [EVENT_KINDS.INVENTORY_STOCK_LOW]:    '/inventory?item={entity_id}',
  [EVENT_KINDS.INVENTORY_STOCK_OUT]:    '/inventory?item={entity_id}',
  [EVENT_KINDS.INVENTORY_REQUEST_CREATED]:   '/inventory/requests/{entity_id}',
  [EVENT_KINDS.INVENTORY_REQUEST_APPROVED]:  '/inventory/requests/{entity_id}',
  [EVENT_KINDS.INVENTORY_REQUEST_REJECTED]:  '/inventory/requests/{entity_id}',
  [EVENT_KINDS.HOUSEKEEPING_TASK_OVERDUE]:   '/housekeeping?task={entity_id}',
  [EVENT_KINDS.HOUSEKEEPING_DEFICIENCY]:     '/housekeeping?task={entity_id}',
  [EVENT_KINDS.DISCIPLINE_RECORD_CREATED]:   '/discipline?id={entity_id}',
  [EVENT_KINDS.ANNOUNCEMENT_PUBLISHED]:      '/announcements?id={entity_id}',
  [EVENT_KINDS.CHECKIN_DONE]:                '/checkin?id={entity_id}',
  [EVENT_KINDS.CHECKOUT_DONE]:                '/checkin?id={entity_id}',
  [EVENT_KINDS.SYSTEM_BACKUP_FAILED]:         '/system/backups',
  [EVENT_KINDS.SYSTEM_ERROR_CRITICAL]:        '/system/errors',
}

export function renderLinkTemplate(kind, { entity_id } = {}) {
  const tpl = LINK_TEMPLATES[kind]
  if (!tpl) return null
  return tpl.replace('{entity_id}', entity_id != null ? String(entity_id) : '')
}
