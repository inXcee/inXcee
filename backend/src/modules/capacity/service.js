import * as q from './queries.js'
import { createNotification, broadcastOccupancy } from '../../shared/notifications/service.js'
import { getDB } from '../../shared/db/index.js'
import { logAudit } from '../../shared/audit.js'

export const getRoomsService = q.getRooms
export const getRoomPersonnelService = q.getRoomPersonnel
export const getBlockPersonnelService = q.getBlockPersonnel

export function updateActiveBedsService(roomId, activeBeds, userId) {
  const db = getDB()
  const room = db.prepare(`
    SELECT r.block, r.room_no, r.capacity, r.active_beds,
      (SELECT COUNT(*) FROM room_assignments ra
       WHERE ra.room_id = r.id AND ra.check_out_at IS NULL) AS occupied
    FROM rooms r WHERE r.id = ?
  `).get(roomId)
  if (!room) throw new Error('Oda bulunamadı')
  if (!Number.isInteger(activeBeds) || activeBeds < room.occupied || activeBeds > room.capacity) {
    throw new Error(`Aktif yatak ${room.occupied}-${room.capacity} aralığında olmalı`)
  }
  q.updateActiveBeds(roomId, activeBeds)
  logAudit(userId, 'room_beds_update', 'capacity', roomId, `${room.block}-${room.room_no}: ${room.active_beds} → ${activeBeds}`)
  broadcastOccupancy()
}

export function updateRoomStatusService(roomId, status, userId) {
  const db = getDB()
  const room = db.prepare('SELECT block, room_no FROM rooms WHERE id=?').get(roomId)
  const evicted = db.prepare('SELECT COUNT(*) as c FROM room_assignments WHERE room_id=? AND check_out_at IS NULL').get(roomId).c
  q.updateRoomStatus(roomId, status)
  const roomLabel = room ? `${room.block}-${room.room_no}` : `#${roomId}`
  if (status === 'quarantine') {
    createNotification({
      message: `${roomLabel} karantinaya alındı${evicted > 0 ? ` — ${evicted} kişi çıkarıldı` : ''}`,
      type: 'critical', module: 'capacity', target_role: 'campus_manager',
    })
  }
  if (status === 'maintenance') {
    createNotification({
      message: `${roomLabel} bakıma alındı${evicted > 0 ? ` — ${evicted} kişi çıkarıldı` : ''}`,
      type: 'warning', module: 'capacity', target_role: 'campus_manager',
    })
  }
  logAudit(userId, status === 'quarantine' ? 'room_quarantine' : status === 'maintenance' ? 'room_maintenance' : 'room_activate', 'capacity', roomId, `${roomLabel} → ${status}${evicted > 0 ? ` (${evicted} kişi çıkarıldı)` : ''}`)
  broadcastOccupancy()
}

export const updateFloorSupervisorService = q.updateFloorSupervisor
export function updateRoomNotesService(roomId, notes, userId) {
  const db = getDB()
  const room = db.prepare('SELECT block, room_no FROM rooms WHERE id=?').get(roomId)
  if (!room) throw new Error('Oda bulunamadı')
  q.updateRoomNotes(roomId, notes)
  logAudit(userId, 'room_notes_update', 'capacity', roomId, `${room.block}-${room.room_no} oda notu güncellendi`)
}
export const searchPersonnelService = q.searchPersonnel

export function swapPersonnelService(personAId, personBId, userId) {
  const result = q.swapPersonnel(personAId, personBId, userId)
  logAudit(userId, 'room_swap', 'capacity', null, `Takas: ${result.personA.from} ↔ ${result.personB.from}`)
  broadcastOccupancy()
}

export function reassignPersonnelService(personnelId, newRoomId, userId) {
  const detail = q.getReassignDetail(personnelId, newRoomId)
  q.reassignPersonnel(personnelId, newRoomId, userId)
  logAudit(userId, 'room_reassign', 'capacity', personnelId, `${detail.name}: ${detail.from} → ${detail.to}`)
  broadcastOccupancy()
}

export function removeFromRoomService(personnelId, userId) {
  const assignment = q.removeFromRoom(personnelId)
  logAudit(userId, 'room_remove', 'capacity', personnelId, `${assignment.full_name}: ${assignment.block}-${assignment.room_no} → odadan çıkarıldı`)
  broadcastOccupancy()
  return assignment
}

export const getUnassignedPersonnelService = q.getUnassignedPersonnel

export function bulkAssignToRoomService(personnelIds, roomId, userId) {
  const db = getDB()
  const room = db.prepare('SELECT block, room_no FROM rooms WHERE id=?').get(roomId)
  q.bulkAssignToRoom(personnelIds, roomId, userId)
  logAudit(userId, 'bulk_assign', 'capacity', roomId, `${personnelIds.length} kişi → ${room?.block || '?'}-${room?.room_no || '?'}`)
  broadcastOccupancy()
}

export function bulkRemoveFromRoomsService(personnelIds, userId) {
  q.bulkRemoveFromRooms(personnelIds)
  logAudit(userId, 'bulk_remove', 'capacity', null, `${personnelIds.length} kişi odadan çıkarıldı`)
  broadcastOccupancy()
}

export function bulkUpdateRoomStatusService(roomIds, status, userId) {
  q.bulkUpdateRoomStatus(roomIds, status)
  logAudit(userId, 'bulk_room_status', 'capacity', null, `${roomIds.length} oda → ${status}`)
}

export function bulkCheckoutService(personnelIds, userId, force = false) {
  q.bulkCheckout(personnelIds, userId, force)
  logAudit(userId, 'bulk_checkout', 'capacity', null, `${personnelIds.length} kişi çıkış${force ? ' (zorla)' : ''}`)
  broadcastOccupancy()
}
