import * as q from './queries.js'
import { createNotification } from '../../shared/notifications/service.js'

export const getRoomsService = q.getRooms
export const getRoomPersonnelService = q.getRoomPersonnel
export const getBlockPersonnelService = q.getBlockPersonnel

export function updateActiveBedsService(roomId, activeBeds) {
  q.updateActiveBeds(roomId, activeBeds)
}

export function updateRoomStatusService(roomId, status) {
  q.updateRoomStatus(roomId, status)
  if (status === 'quarantine') {
    createNotification({ message: `Oda #${roomId} karantinaya alındı`, type: 'critical', module: 'capacity', target_role: 'campus_manager' })
  }
}

export const updateFloorSupervisorService = q.updateFloorSupervisor
export const reassignPersonnelService = q.reassignPersonnel
